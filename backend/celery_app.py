"""Celery application — background task scheduler for regulatory feeds, email, chasers, and integrations.

This module also exposes the sync helpers that Celery tasks use:

  * `app`              — alias for `celery_app` (5 of 6 task modules import it
                          as `app`; keep both names working).
  * `get_sync_session` — returns a sync SQLAlchemy Session via psycopg2. Tasks
                          are sync — celery workers don't run an asyncio loop —
                          so we cannot reuse the async engine in database.py.
                          The session connects as `seema_admin` (BYPASSRLS) so
                          tasks can scan across firms during regulatory feed
                          ingestion. Per-firm writes MUST wrap their work in
                          `with_firm_context(session, firm_id)` so RLS enforces
                          the tenant boundary at the DB layer.
  * `with_firm_context` — context manager that sets/clears
                          `app.current_firm_id` on the given sync session for
                          per-firm operations.
"""
import os
from contextlib import contextmanager

from celery import Celery
from celery.schedules import crontab
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

from config import get_settings

settings = get_settings()

celery_app = Celery(
    "seema",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)
# Legacy alias — most task modules import this as `app`.
app = celery_app


# ── Sync DB engine for Celery tasks ──────────────────────────────────────────
# We prefer ADMIN_DATABASE_URL because most tasks read across firms; per-firm
# writes wrap themselves in `with_firm_context(...)` which sets the RLS GUC.
# If ADMIN_DATABASE_URL isn't set, fall back to DATABASE_URL (RLS-enforcing)
# and rely on with_firm_context for per-firm operations — broad scans will
# return empty results in that case, which is the correct fail-closed behaviour.
_admin_url = os.getenv("ADMIN_DATABASE_URL", "").strip() or settings.DATABASE_URL
_sync_url = _admin_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")

_sync_engine = create_engine(
    _sync_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
_SyncSessionLocal = sessionmaker(bind=_sync_engine, expire_on_commit=False)


def get_sync_session() -> Session:
    """Return a new sync SQLAlchemy Session.

    The caller is responsible for `.close()` (or use it as a context manager
    via `with get_sync_session() as session:` since sessionmaker's instances
    support that). Tasks should commit explicitly on success.
    """
    return _SyncSessionLocal()


@contextmanager
def with_firm_context(session: Session, firm_id: str):
    """Set `app.current_firm_id` on the session's transaction for the duration
    of the `with` block. Use this around per-firm reads/writes inside Celery
    tasks. The GUC is `is_local=true` so it's automatically discarded at
    COMMIT/ROLLBACK.

    Usage:
        with get_sync_session() as session:
            with with_firm_context(session, firm_id):
                session.execute(...)
                session.commit()
    """
    if not firm_id:
        raise ValueError("with_firm_context requires a non-empty firm_id")
    session.execute(
        text("SELECT set_config('app.current_firm_id', :firm_id, true)"),
        {"firm_id": firm_id},
    )
    try:
        yield session
    except Exception:
        session.rollback()
        raise

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/London",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Scheduled tasks.
#
# Every entry below MUST reference a task name that is actually registered by a
# module in `conf.include`. (A previous version of this schedule pointed at
# several task names that did not exist — e.g. `run_auto_chase`,
# `check_overdue_*`, `check_policy_reviews` — which raised NotRegistered when
# beat fired them. They have been mapped to the real task names.)
celery_app.conf.beat_schedule = {
    # ── Regulatory feed scrapers (every 4 hours, staggered) ──
    "scrape-sra-feed": {
        "task": "tasks.regulatory_tasks.scrape_sra",
        "schedule": crontab(minute=0, hour="*/4"),
    },
    "scrape-ico-feed": {
        "task": "tasks.regulatory_tasks.scrape_ico",
        "schedule": crontab(minute=15, hour="*/4"),
    },
    "scrape-lawsoc-feed": {
        "task": "tasks.regulatory_tasks.scrape_law_society",
        "schedule": crontab(minute=30, hour="*/4"),
    },
    "scrape-govuk-feed": {
        "task": "tasks.regulatory_tasks.scrape_govuk",
        "schedule": crontab(minute=45, hour="*/4"),
    },

    # ── Email automation ──
    # Daily auto-chase for overdue items (9am UK time) — drives ChaseEngine.
    "daily-auto-chase": {
        "task": "tasks.email_tasks.run_auto_chase",
        "schedule": crontab(minute=0, hour=9),
    },
    # Every 15 min: actually deliver anything sitting in the email queue.
    "process-email-queue": {
        "task": "tasks.email_tasks.process_email_queue",
        "schedule": crontab(minute="*/15"),
    },
    # Daily digest of open alerts (8am).
    "daily-digest": {
        "task": "tasks.email_tasks.send_daily_digest",
        "schedule": crontab(minute=0, hour=8),
    },
    # Weekly compliance digest (Monday 8am).
    "weekly-digest": {
        "task": "tasks.email_tasks.send_weekly_digest",
        "schedule": crontab(minute=0, hour=8, day_of_week=1),
    },
    # Hourly: retry transiently-failed emails.
    "retry-failed-emails": {
        "task": "tasks.email_tasks.retry_failed_emails",
        "schedule": crontab(minute=20, hour="*"),
    },

    # ── Compliance automation ──
    # Daily compliance scan across all firms (6:30am).
    "daily-compliance-scan": {
        "task": "tasks.compliance_tasks.run_daily_compliance_scan",
        "schedule": crontab(minute=30, hour=6),
    },
    # Daily: flag training due/overdue (7:30am).
    "training-due-check": {
        "task": "tasks.compliance_tasks.check_training_due",
        "schedule": crontab(minute=30, hour=7),
    },
    # Daily: alert on deadlines due within 7 days (7:45am).
    "deadline-check": {
        "task": "tasks.compliance_tasks.check_upcoming_deadlines",
        "schedule": crontab(minute=45, hour=7),
    },
    # Daily: alert on undertakings approaching their deadline (8:15am).
    "undertaking-expiry-check": {
        "task": "tasks.compliance_tasks.check_undertaking_expiry",
        "schedule": crontab(minute=15, hour=8),
    },
    # Hourly: check breach ICO 72-hour deadlines.
    "ico-deadline-check": {
        "task": "tasks.compliance_tasks.check_breach_ico_deadlines",
        "schedule": crontab(minute=0, hour="*"),
    },
    # Weekly: AML risk reassessment (Sunday 2am).
    "weekly-aml-reassessment": {
        "task": "tasks.compliance_tasks.reassess_aml_risk",
        "schedule": crontab(minute=0, hour=2, day_of_week=0),
    },

    # ── Reporting ──
    # Daily: flag evidence documents due for review (8:30am).
    "evidence-review-check": {
        "task": "tasks.reporting_tasks.check_evidence_review_dates",
        "schedule": crontab(minute=30, hour=8),
    },
    # Daily: flag policies due for review (8:45am).
    "policy-review-check": {
        "task": "tasks.reporting_tasks.check_policy_review_dates",
        "schedule": crontab(minute=45, hour=8),
    },
    # Monthly: generate compliance report PDFs (1st of month, 3am).
    "monthly-compliance-report": {
        "task": "tasks.reporting_tasks.generate_monthly_compliance_report",
        "schedule": crontab(minute=0, hour=3, day_of_month=1),
    },

    # ── Billing ──
    # Daily: warn firms about upcoming renewals (6am).
    "subscription-renewal-check": {
        "task": "tasks.billing_tasks.check_subscription_renewals",
        "schedule": crontab(minute=0, hour=6),
    },
    # Every 6 hours: reconcile subscription status with Stripe.
    "stripe-status-sync": {
        "task": "tasks.billing_tasks.sync_stripe_subscription_status",
        "schedule": crontab(minute=10, hour="*/6"),
    },

    # ── Clio PMS integration ──
    # Three times a day: sync matters, contacts, and staff from Clio.
    "clio-sync-all-firms": {
        "task": "tasks.integration_tasks.sync_all_clio_firms",
        "schedule": crontab(minute=0, hour="1,9,17"),
    },
}

# Register task modules explicitly. Every module that defines @app.task MUST be
# listed here or its tasks won't be registered with the worker.
celery_app.conf.include = [
    "tasks.email_tasks",
    "tasks.regulatory_tasks",
    "tasks.compliance_tasks",
    "tasks.integration_tasks",
    "tasks.billing_tasks",
    "tasks.reporting_tasks",
]
