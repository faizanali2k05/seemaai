"""Email background tasks — chasers, digests, weekly summaries."""
import logging
from datetime import datetime, timedelta
from celery_app import app, get_sync_session

logger = logging.getLogger(__name__)


@app.task(name="tasks.email_tasks.send_overdue_chasers")
def send_overdue_chasers():
    """Send chaser emails for overdue compliance tasks."""
    from models.compliance import ComplianceTask
    from models.chaser import ChaserLog

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
            chaser = ChaserLog(
                firm_id=task.firm_id,
                related_entity_type="compliance_task",
                related_entity_id=task.id,
                chaser_type="overdue_reminder",
                recipient=task.assigned_to,
                status="sent",
                sent_at=datetime.utcnow(),
            )
            session.add(chaser)
            chasers_sent += 1
            # TODO: integrate with email service (SendGrid/SES)
        session.commit()
        logger.info(f"Sent {chasers_sent} overdue chasers")
        return {"overdue_tasks": len(overdue_tasks), "chasers_sent": chasers_sent}
    except Exception as e:
        session.rollback()
        logger.error(f"Chaser sending failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.email_tasks.send_daily_digest")
def send_daily_digest():
    """Send daily compliance digest to firm COLPs."""
    from models.firm import Firm
    from models.compliance import ComplianceAlert
    from models.email import EmailQueueItem

    logger.info("Generating daily digests")
    session = get_sync_session()
    try:
        firms = session.query(Firm).filter(Firm.is_active == True).all()
        digests_queued = 0
        for firm in firms:
            alerts = session.query(ComplianceAlert).filter(
                ComplianceAlert.firm_id == firm.id,
                ComplianceAlert.status == "open",
                ComplianceAlert.created_at >= datetime.utcnow() - timedelta(hours=24),
            ).all()
            if alerts:
                email = EmailQueueItem(
                    firm_id=firm.id,
                    template_name="daily_digest",
                    recipient_email=firm.billing_email or firm.contact_email,
                    subject=f"Seema Daily Digest — {len(alerts)} items need attention",
                    context=f'{{"alert_count": {len(alerts)}, "firm_name": "{firm.name}"}}',
                    status="queued",
                )
                session.add(email)
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


@app.task(name="tasks.email_tasks.send_weekly_summary")
def send_weekly_summary():
    """Send weekly compliance summary to firm management."""
    from models.firm import Firm
    from models.email import EmailQueueItem

    logger.info("Generating weekly compliance summaries")
    session = get_sync_session()
    try:
        firms = session.query(Firm).filter(Firm.is_active == True).all()
        summaries_queued = 0
        for firm in firms:
            email = EmailQueueItem(
                firm_id=firm.id,
                template_name="weekly_summary",
                recipient_email=firm.billing_email or firm.contact_email,
                subject=f"Seema Weekly Compliance Summary — {firm.name}",
                context=f'{{"firm_id": "{firm.id}", "firm_name": "{firm.name}"}}',
                status="queued",
            )
            session.add(email)
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


@app.task(name="tasks.email_tasks.retry_failed_emails")
def retry_failed_emails():
    """Retry emails that failed to send."""
    from models.email import EmailQueueItem

    logger.info("Retrying failed emails")
    session = get_sync_session()
    try:
        failed = session.query(EmailQueueItem).filter(
            EmailQueueItem.status == "failed",
            EmailQueueItem.retry_count < 3,
        ).all()
        retried = 0
        for email in failed:
            email.status = "queued"
            email.retry_count = (email.retry_count or 0) + 1
            retried += 1
            # TODO: actually resend via email provider
        session.commit()
        logger.info(f"Retried {retried} failed emails")
        return {"failed_found": len(failed), "retried": retried}
    except Exception as e:
        session.rollback()
        logger.error(f"Email retry failed: {e}")
        raise
    finally:
        session.close()
