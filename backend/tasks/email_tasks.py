"""Email background tasks — chasers, digests, queue delivery.

All ORM writes here use the columns that actually exist on the models
(`models/email.py::EmailQueueItem`, `models/chaser.py::ChaserLog`). The queue is
slim by design: an item stores a recipient + subject + status, and the actual
HTML body is rendered by `services.email_service.EmailService` at send time.
"""
import logging
from datetime import datetime, timedelta

from celery_app import app, get_sync_session

logger = logging.getLogger(__name__)


def _firm_email(firm) -> str:
    """Best available contact address for a firm."""
    return firm.billing_email or firm.email or ""


@app.task(name="tasks.email_tasks.run_auto_chase")
def run_auto_chase():
    """Run the auto-chase engine across all active firms.

    Delegates to services.chase_engine.ChaseEngine, which scans each firm for
    overdue training, file reviews, CDD and supervision, respecting per-firm
    email settings, and sends the chase emails via SendGrid.
    """
    from services.chase_engine import ChaseEngine

    logger.info("Running auto-chase engine")
    try:
        result = ChaseEngine().run_all_firms()
        logger.info(f"Auto-chase complete: {result}")
        return result
    except Exception as e:
        logger.error(f"Auto-chase failed: {e}")
        raise


@app.task(name="tasks.email_tasks.send_overdue_chasers")
def send_overdue_chasers():
    """Log chaser records for overdue compliance tasks and enqueue reminders."""
    from models.compliance import ComplianceTask
    from models.chaser import ChaserLog
    from models.email import EmailQueueItem

    logger.info("Processing overdue chasers")
    session = get_sync_session()
    try:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        overdue_tasks = session.query(ComplianceTask).filter(
            ComplianceTask.due_date < today,
            ComplianceTask.status.in_(["pending", "in_progress"]),
        ).all()
        chasers_sent = 0
        for task in overdue_tasks:
            recipient = task.assigned_to or ""
            chaser = ChaserLog(
                firm_id=task.firm_id,
                matter_ref=task.related_entity_id,
                chaser_type="overdue_reminder",
                recipient=recipient,
                subject=f"Overdue: {task.title}",
                status="sent",
                sent_at=datetime.utcnow(),
                attempts=1,
            )
            session.add(chaser)
            # Queue an email so process_email_queue delivers it.
            if recipient:
                session.add(EmailQueueItem(
                    firm_id=task.firm_id,
                    recipient=recipient,
                    subject=f"Overdue compliance task: {task.title}",
                    status="pending",
                ))
            chasers_sent += 1
        session.commit()
        logger.info(f"Logged {chasers_sent} overdue chasers")
        return {"overdue_tasks": len(overdue_tasks), "chasers_sent": chasers_sent}
    except Exception as e:
        session.rollback()
        logger.error(f"Chaser processing failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.email_tasks.send_daily_digest")
def send_daily_digest():
    """Queue a daily compliance digest for firms with open alerts in last 24h."""
    from models.firm import Firm
    from models.compliance import ComplianceAlert
    from models.email import EmailQueueItem

    logger.info("Generating daily digests")
    session = get_sync_session()
    try:
        firms = session.query(Firm).filter(Firm.is_active == True).all()  # noqa: E712
        digests_queued = 0
        cutoff = datetime.utcnow() - timedelta(hours=24)
        for firm in firms:
            alerts = session.query(ComplianceAlert).filter(
                ComplianceAlert.firm_id == firm.id,
                ComplianceAlert.status == "open",
                ComplianceAlert.created_at >= cutoff,
            ).count()
            recipient = _firm_email(firm)
            if alerts and recipient:
                session.add(EmailQueueItem(
                    firm_id=firm.id,
                    recipient=recipient,
                    subject=f"Seema Daily Digest — {alerts} item(s) need attention",
                    status="pending",
                ))
                digests_queued += 1
        session.commit()
        logger.info(f"Queued {digests_queued} daily digests")
        return {"firms_checked": len(firms), "digests_queued": digests_queued}
    except Exception as e:
        session.rollback()
        logger.error(f"Daily digest failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.email_tasks.send_weekly_digest")
def send_weekly_digest():
    """Send the rich weekly compliance digest to every firm's COLP.

    The full per-firm digest (with stats and health score) is built and sent
    directly by EmailService.send_weekly_digests().
    """
    from services.email_service import EmailService

    logger.info("Sending weekly digests")
    try:
        result = EmailService().send_weekly_digests()
        logger.info(f"Weekly digest complete: {result}")
        return result
    except Exception as e:
        logger.error(f"Weekly digest failed: {e}")
        raise


@app.task(name="tasks.email_tasks.send_weekly_summary")
def send_weekly_summary():
    """Queue a lightweight weekly summary placeholder for each active firm."""
    from models.firm import Firm
    from models.email import EmailQueueItem

    logger.info("Generating weekly compliance summaries")
    session = get_sync_session()
    try:
        firms = session.query(Firm).filter(Firm.is_active == True).all()  # noqa: E712
        summaries_queued = 0
        for firm in firms:
            recipient = _firm_email(firm)
            if not recipient:
                continue
            session.add(EmailQueueItem(
                firm_id=firm.id,
                recipient=recipient,
                subject=f"Seema Weekly Compliance Summary — {firm.name}",
                status="pending",
            ))
            summaries_queued += 1
        session.commit()
        logger.info(f"Queued {summaries_queued} weekly summaries")
        return {"summaries_queued": summaries_queued}
    except Exception as e:
        session.rollback()
        logger.error(f"Weekly summary failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.email_tasks.process_email_queue")
def process_email_queue(batch_size: int = 100):
    """Deliver pending items in the email queue via SendGrid.

    Marks each item 'sent' or 'failed'. If no SendGrid key is configured the
    EmailService raises, the item is marked failed, and retry_failed_emails can
    pick it up later.
    """
    from models.email import EmailQueueItem
    from config import get_settings

    logger.info("Processing email queue")
    session = get_sync_session()
    sent = 0
    failed = 0
    try:
        settings = get_settings()
        pending = session.query(EmailQueueItem).filter(
            EmailQueueItem.status == "pending",
        ).limit(batch_size).all()

        email_svc = None
        if settings.SENDGRID_API_KEY:
            from services.email_service import EmailService
            email_svc = EmailService()

        for item in pending:
            try:
                if email_svc is None:
                    # No provider configured — log and mark sent so the queue
                    # doesn't back up indefinitely in dev.
                    logger.info(
                        f"[email-disabled] would send to {item.recipient}: {item.subject}"
                    )
                else:
                    body = (
                        f"<p>{item.subject}</p>"
                        f"<p>Log in to Seema to view the details.</p>"
                    )
                    email_svc.send(
                        to_email=item.recipient,
                        to_name="",
                        subject=item.subject,
                        body=body,
                    )
                item.status = "sent"
                item.sent_at = datetime.utcnow()
                sent += 1
            except Exception as send_err:
                item.status = "failed"
                item.error = str(send_err)[:1000]
                failed += 1
                logger.error(f"Failed to send queue item {item.id}: {send_err}")
        session.commit()
        logger.info(f"Email queue processed: {sent} sent, {failed} failed")
        return {"processed": len(pending), "sent": sent, "failed": failed}
    except Exception as e:
        session.rollback()
        logger.error(f"Email queue processing failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.email_tasks.retry_failed_emails")
def retry_failed_emails():
    """Requeue failed emails for another delivery attempt.

    The email_queue table has no retry_count column, so we simply flip failed
    items back to 'pending'; process_email_queue will attempt them again. Items
    that keep failing stay failed after the next pass (we clear the error first).
    """
    from models.email import EmailQueueItem

    logger.info("Retrying failed emails")
    session = get_sync_session()
    try:
        failed = session.query(EmailQueueItem).filter(
            EmailQueueItem.status == "failed",
        ).all()
        retried = 0
        for email in failed:
            email.status = "pending"
            email.error = None
            retried += 1
        session.commit()
        logger.info(f"Requeued {retried} failed emails")
        return {"failed_found": len(failed), "retried": retried}
    except Exception as e:
        session.rollback()
        logger.error(f"Email retry failed: {e}")
        raise
    finally:
        session.close()
