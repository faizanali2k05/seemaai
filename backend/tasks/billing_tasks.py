"""Billing tasks — subscription renewals, Stripe sync."""
import logging
from datetime import datetime, timedelta
from celery_app import app, get_sync_session

logger = logging.getLogger(__name__)


@app.task(name="tasks.billing_tasks.check_subscription_renewals")
def check_subscription_renewals():
    """Check for subscriptions due for renewal in the next 7 days."""
    from models.firm import Firm
    from models.compliance import ComplianceAlert

    logger.info("Checking subscription renewals")
    session = get_sync_session()
    try:
        upcoming = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
        firms = session.query(Firm).filter(
            Firm.next_billing_date <= upcoming,
            Firm.subscription_status == "active",
        ).all()
        alerts_created = 0
        for firm in firms:
            alert = ComplianceAlert(
                firm_id=firm.id,
                alert_type="subscription_renewal",
                severity="low",
                title=f"Subscription renewal approaching",
                description=f"Your subscription renews on {firm.next_billing_date}",
                action_required="Ensure payment method is up to date.",
            )
            session.add(alert)
            alerts_created += 1
        session.commit()
        logger.info(f"Subscription check: {alerts_created} renewal notices")
        return {"firms_renewing": len(firms), "alerts_created": alerts_created}
    except Exception as e:
        session.rollback()
        logger.error(f"Subscription check failed: {e}")
        raise
    finally:
        session.close()


@app.task(name="tasks.billing_tasks.sync_stripe_subscription_status")
def sync_stripe_subscription_status():
    """Sync subscription status from Stripe for all firms with Stripe IDs.

    Skips entirely when no STRIPE_SECRET_KEY is configured (billing disabled).
    A failure on one firm (e.g. a deleted subscription) does not abort the rest.
    """
    from models.firm import Firm
    from config import get_settings

    settings = get_settings()
    if not settings.STRIPE_SECRET_KEY:
        logger.info("Stripe sync skipped — STRIPE_SECRET_KEY not configured")
        return {"firms_synced": 0, "skipped": True}

    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY

    logger.info("Syncing Stripe subscription statuses")
    session = get_sync_session()
    try:
        firms = session.query(Firm).filter(
            Firm.stripe_subscription_id.isnot(None),
        ).all()
        synced = 0
        errors = 0
        for firm in firms:
            try:
                sub = stripe.Subscription.retrieve(firm.stripe_subscription_id)
                firm.subscription_status = sub.status
                synced += 1
            except stripe.error.InvalidRequestError:
                # Subscription no longer exists on Stripe — mark cancelled.
                firm.subscription_status = "cancelled"
                firm.stripe_subscription_id = None
                synced += 1
            except Exception as firm_err:
                errors += 1
                logger.error(
                    f"Stripe sync failed for firm {firm.id}: {firm_err}"
                )
        session.commit()
        logger.info(f"Stripe sync complete: {synced} synced, {errors} errors")
        return {"firms_synced": synced, "errors": errors}
    except Exception as e:
        session.rollback()
        logger.error(f"Stripe sync failed: {e}")
        raise
    finally:
        session.close()
