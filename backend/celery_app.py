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

# Scheduled tasks
celery_app.conf.beat_schedule = {
    # Scrape regulatory feeds every 4 hours
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

    # Daily auto-chase for overdue items (9am UK time)
    "daily-auto-chase": {
        "task": "tasks.email_tasks.run_auto_chase",
        "schedule": crontab(minute=0, hour=9),
    },

    # Weekly compliance digest (Monday 8am)
    "weekly-digest": {
        "task": "tasks.email_tasks.send_weekly_digest",
        "schedule": crontab(minute=0, hour=8, day_of_week=1),
    },

    # Daily deadline check (8am)
    "deadline-check": {
        "task": "tasks.email_tasks.check_upcoming_deadlines",
        "schedule": crontab(minute=0, hour=8),
    },

    # ── Compliance Automation ──

    # Daily: flag overdue training with alerts (7:30am)
    "overdue-training-check": {
        "task": "tasks.compliance_tasks.check_overdue_training",
        "schedule": crontab(minute=30, hour=7),
    },

    # Hourly: check breach ICO 72-hour deadlines
    "ico-deadline-check": {
        "task": "tasks.compliance_tasks.check_breach_ico_deadlines",
        "schedule": crontab(minute=0, hour="*"),
    },

    # Daily: auto-escalate overdue compliance deadlines (7:45am)
    "overdue-deadline-escalation": {
        "task": "tasks.compliance_tasks.check_overdue_deadlines",
        "schedule": crontab(minute=45, hour=7),
    },

    # Daily: flag overdue supervision (8:15am)
    "overdue-supervision-check": {
        "task": "tasks.compliance_tasks.check_overdue_supervision",
        "schedule": crontab(minute=15, hour=8),
    },

    # Daily: flag policies due for review (8:30am)
    "policy-review-check": {
        "task": "tasks.compliance_tasks.check_policy_reviews",
        "schedule": crontab(minute=30, hour=8),
    },

    # ── Clio PMS Integration ──

    # Every 8 hours: sync matters, contacts, and staff from Clio
    "clio-sync-all-firms": {
        "task": "tasks.integration_tasks.sync_all_clio_firms",
        "schedule": crontab(minute=0, hour="1,9,17"),
    },
}

# Register task modules explicitly
celery_app.conf.include = [
    "tasks.email_tasks",
    "tasks.regulatory_tasks",
    "tasks.compliance_tasks",
    "tasks.integration_tasks",
]
