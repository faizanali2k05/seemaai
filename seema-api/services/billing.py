"""Stripe Billing Service for Seema compliance platform.

Handles all Stripe interactions including:
- Customer creation and management
- Subscription creation, updates, and cancellation
- Invoice retrieval
- Webhook processing
- Feature access based on subscription tier
"""

import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from enum import Enum

import stripe
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from config import get_settings
from models.firm import Firm

logger = logging.getLogger(__name__)


class SubscriptionTier(str, Enum):
    """Available subscription tiers."""
    STARTER = "starter"
    ESSENTIALS = "essentials"
    PROFESSIONAL = "professional"


class BillingPeriod(str, Enum):
    """Subscription billing periods."""
    MONTHLY = "monthly"
    ANNUAL = "annual"


class FeatureAccess(str, Enum):
    """Available features by tier."""
    DASHBOARD = "dashboard"
    AUDIT_TRAIL = "audit_trail"
    CHASE_ENGINE = "chase_engine"
    BREACH_MANAGEMENT = "breach_management"
    STAFF_TRAINING = "staff_training"
    CLIENT_INTAKE_CDD = "client_intake_cdd"
    COMPLIANCE_ALERTS = "compliance_alerts"
    POLICY_MANAGEMENT = "policy_management"
    EVIDENCE_LOCKER = "evidence_locker"
    AI_REGULATORY = "ai_regulatory"
    SRA_RETURN = "sra_return"
    ADVANCED_REPORTING = "advanced_reporting"


# Feature matrix: which tiers have which features
FEATURE_MATRIX = {
    SubscriptionTier.STARTER: {
        FeatureAccess.DASHBOARD,
        FeatureAccess.AUDIT_TRAIL,
        FeatureAccess.CHASE_ENGINE,       # Limited: 1 chaser/week
    },
    SubscriptionTier.ESSENTIALS: {
        FeatureAccess.DASHBOARD,
        FeatureAccess.AUDIT_TRAIL,
        FeatureAccess.CHASE_ENGINE,       # Unlimited
        FeatureAccess.BREACH_MANAGEMENT,
        FeatureAccess.STAFF_TRAINING,
        FeatureAccess.COMPLIANCE_ALERTS,
    },
    SubscriptionTier.PROFESSIONAL: {
        FeatureAccess.DASHBOARD,
        FeatureAccess.AUDIT_TRAIL,
        FeatureAccess.CHASE_ENGINE,
        FeatureAccess.BREACH_MANAGEMENT,
        FeatureAccess.STAFF_TRAINING,
        FeatureAccess.COMPLIANCE_ALERTS,
        FeatureAccess.CLIENT_INTAKE_CDD,
        FeatureAccess.POLICY_MANAGEMENT,
        FeatureAccess.EVIDENCE_LOCKER,
        FeatureAccess.AI_REGULATORY,
        FeatureAccess.SRA_RETURN,
        FeatureAccess.ADVANCED_REPORTING,
    },
}


class BillingService:
    """Service for managing Stripe billing operations."""

    def __init__(self):
        """Initialize billing service with Stripe API key and database."""
        settings = get_settings()
        stripe.api_key = settings.STRIPE_SECRET_KEY
        self.settings = settings

        # Create sync database engine for background tasks
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
        self.engine = create_engine(sync_url, echo=False)

    def _get_db_session(self) -> Session:
        """Get a database session."""
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=self.engine)
        return SessionLocal()

    def _get_price_id(self, tier: SubscriptionTier, period: BillingPeriod) -> str:
        """Get Stripe price ID for tier and period."""
        price_map = {
            (SubscriptionTier.STARTER, BillingPeriod.MONTHLY): self.settings.STRIPE_PRICE_STARTER_MONTHLY,
            (SubscriptionTier.STARTER, BillingPeriod.ANNUAL): self.settings.STRIPE_PRICE_STARTER_ANNUAL,
            (SubscriptionTier.ESSENTIALS, BillingPeriod.MONTHLY): self.settings.STRIPE_PRICE_ESSENTIALS_MONTHLY,
            (SubscriptionTier.ESSENTIALS, BillingPeriod.ANNUAL): self.settings.STRIPE_PRICE_ESSENTIALS_ANNUAL,
            (SubscriptionTier.PROFESSIONAL, BillingPeriod.MONTHLY): self.settings.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
            (SubscriptionTier.PROFESSIONAL, BillingPeriod.ANNUAL): self.settings.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
        }

        price_id = price_map.get((tier, period))
        if not price_id:
            logger.error(f"No price ID configured for tier={tier}, period={period}")
            raise ValueError(f"No price ID configured for {tier} {period}")

        return price_id

    def create_customer(self, firm_id: str, firm_name: str, email: str) -> str:
        """Create a Stripe customer and save customer ID to firm.

        Args:
            firm_id: The Firm ID
            firm_name: The firm's name
            email: The firm's email address

        Returns:
            The Stripe customer ID

        Raises:
            stripe.error.StripeError: If customer creation fails
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                # Check if customer already exists
                if firm.stripe_customer_id:
                    logger.info(f"Customer already exists for firm {firm_id}")
                    return firm.stripe_customer_id

                # Create Stripe customer
                customer = stripe.Customer.create(
                    name=firm_name,
                    email=email,
                    metadata={
                        "firm_id": firm_id,
                        "firm_name": firm_name,
                    },
                )

                logger.info(f"Created Stripe customer {customer.id} for firm {firm_id}")

                # Save customer ID to firm
                firm.stripe_customer_id = customer.id
                db.commit()

                return customer.id

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating customer for firm {firm_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error creating customer for firm {firm_id}: {e}")
            raise

    def create_subscription(
        self,
        firm_id: str,
        tier: SubscriptionTier = SubscriptionTier.ESSENTIALS,
        billing_period: BillingPeriod = BillingPeriod.MONTHLY,
    ) -> Dict[str, Any]:
        """Create a subscription for a firm.

        Args:
            firm_id: The Firm ID
            tier: Subscription tier (essentials or professional)
            billing_period: Billing period (monthly or annual)

        Returns:
            Subscription details dict

        Raises:
            stripe.error.StripeError: If subscription creation fails
            ValueError: If firm or customer not found
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                if not firm.stripe_customer_id:
                    logger.error(f"No Stripe customer for firm {firm_id}")
                    raise ValueError(f"Firm {firm_id} has no Stripe customer")

                # Get price ID
                price_id = self._get_price_id(tier, billing_period)

                # Create subscription
                subscription = stripe.Subscription.create(
                    customer=firm.stripe_customer_id,
                    items=[{"price": price_id}],
                    metadata={
                        "firm_id": firm_id,
                        "tier": tier.value,
                        "billing_period": billing_period.value,
                    },
                    payment_behavior="default_incomplete",
                    expand=["latest_invoice.payment_intent"],
                )

                logger.info(
                    f"Created subscription {subscription.id} for firm {firm_id} "
                    f"({tier} {billing_period})"
                )

                # Update firm subscription details
                firm.stripe_subscription_id = subscription.id
                firm.subscription_tier = tier.value
                firm.subscription_status = subscription.status
                db.commit()

                return {
                    "subscription_id": subscription.id,
                    "status": subscription.status,
                    "current_period_start": datetime.fromtimestamp(subscription.current_period_start),
                    "current_period_end": datetime.fromtimestamp(subscription.current_period_end),
                    "cancel_at_period_end": subscription.cancel_at_period_end,
                    "tier": tier.value,
                }

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error creating subscription for firm {firm_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error creating subscription for firm {firm_id}: {e}")
            raise

    def get_subscription(self, firm_id: str) -> Optional[Dict[str, Any]]:
        """Get current subscription details for a firm.

        Args:
            firm_id: The Firm ID

        Returns:
            Subscription details dict or None if no subscription

        Raises:
            ValueError: If firm not found
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                if not firm.stripe_subscription_id:
                    logger.warning(f"No subscription for firm {firm_id}")
                    return None

                # Retrieve subscription from Stripe
                subscription = stripe.Subscription.retrieve(firm.stripe_subscription_id)

                return {
                    "subscription_id": subscription.id,
                    "status": subscription.status,
                    "current_period_start": datetime.fromtimestamp(subscription.current_period_start),
                    "current_period_end": datetime.fromtimestamp(subscription.current_period_end),
                    "cancel_at_period_end": subscription.cancel_at_period_end,
                    "tier": firm.subscription_tier,
                    "plan": subscription.items.data[0].price.id if subscription.items.data else None,
                }

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error retrieving subscription for firm {firm_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error retrieving subscription for firm {firm_id}: {e}")
            raise

    def update_subscription(self, firm_id: str, new_tier: SubscriptionTier) -> Dict[str, Any]:
        """Upgrade or downgrade a subscription (prorated).

        Args:
            firm_id: The Firm ID
            new_tier: New subscription tier

        Returns:
            Updated subscription details

        Raises:
            stripe.error.StripeError: If update fails
            ValueError: If firm or subscription not found
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                if not firm.stripe_subscription_id:
                    logger.error(f"No subscription for firm {firm_id}")
                    raise ValueError(f"Firm {firm_id} has no subscription")

                # Get current subscription to determine billing period
                current_subscription = stripe.Subscription.retrieve(firm.stripe_subscription_id)
                current_item = current_subscription.items.data[0]

                # Determine billing period from current price
                current_price = stripe.Price.retrieve(current_item.price.id)
                billing_period = (
                    BillingPeriod.ANNUAL
                    if current_price.recurring.interval == "year"
                    else BillingPeriod.MONTHLY
                )

                # Get new price ID
                new_price_id = self._get_price_id(new_tier, billing_period)

                # Update subscription item (with proration)
                updated_subscription = stripe.Subscription.modify(
                    firm.stripe_subscription_id,
                    items=[
                        {
                            "id": current_item.id,
                            "price": new_price_id,
                        }
                    ],
                    proration_behavior="create_prorations",
                )

                logger.info(f"Updated subscription for firm {firm_id} to {new_tier}")

                # Update firm tier
                firm.subscription_tier = new_tier.value
                db.commit()

                return {
                    "subscription_id": updated_subscription.id,
                    "status": updated_subscription.status,
                    "current_period_start": datetime.fromtimestamp(updated_subscription.current_period_start),
                    "current_period_end": datetime.fromtimestamp(updated_subscription.current_period_end),
                    "cancel_at_period_end": updated_subscription.cancel_at_period_end,
                    "tier": new_tier.value,
                }

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error updating subscription for firm {firm_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error updating subscription for firm {firm_id}: {e}")
            raise

    def cancel_subscription(
        self, firm_id: str, at_period_end: bool = True
    ) -> Dict[str, Any]:
        """Cancel a subscription.

        Args:
            firm_id: The Firm ID
            at_period_end: If True, cancel at end of period. If False, cancel immediately.

        Returns:
            Cancelled subscription details

        Raises:
            stripe.error.StripeError: If cancellation fails
            ValueError: If firm or subscription not found
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                if not firm.stripe_subscription_id:
                    logger.error(f"No subscription for firm {firm_id}")
                    raise ValueError(f"Firm {firm_id} has no subscription")

                # Cancel subscription
                if at_period_end:
                    cancelled_subscription = stripe.Subscription.modify(
                        firm.stripe_subscription_id,
                        cancel_at_period_end=True,
                    )
                    logger.info(
                        f"Scheduled cancellation for firm {firm_id} at period end"
                    )
                else:
                    cancelled_subscription = stripe.Subscription.delete(
                        firm.stripe_subscription_id
                    )
                    logger.info(f"Cancelled subscription immediately for firm {firm_id}")

                # Update firm status
                firm.subscription_status = cancelled_subscription.status
                db.commit()

                return {
                    "subscription_id": cancelled_subscription.id,
                    "status": cancelled_subscription.status,
                    "cancel_at": (
                        datetime.fromtimestamp(cancelled_subscription.cancel_at)
                        if cancelled_subscription.cancel_at
                        else None
                    ),
                    "cancel_at_period_end": cancelled_subscription.cancel_at_period_end,
                }

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error cancelling subscription for firm {firm_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error cancelling subscription for firm {firm_id}: {e}")
            raise

    def reactivate_subscription(self, firm_id: str) -> Dict[str, Any]:
        """Reactivate a cancelled-but-not-yet-expired subscription.

        Args:
            firm_id: The Firm ID

        Returns:
            Reactivated subscription details

        Raises:
            stripe.error.StripeError: If reactivation fails
            ValueError: If subscription cannot be reactivated
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                if not firm.stripe_subscription_id:
                    logger.error(f"No subscription for firm {firm_id}")
                    raise ValueError(f"Firm {firm_id} has no subscription")

                # Check if subscription is scheduled for cancellation
                subscription = stripe.Subscription.retrieve(firm.stripe_subscription_id)
                if not subscription.cancel_at_period_end:
                    logger.warning(
                        f"Subscription for firm {firm_id} is not scheduled for cancellation"
                    )
                    raise ValueError("Subscription is not scheduled for cancellation")

                # Reactivate by removing cancel_at_period_end
                reactivated_subscription = stripe.Subscription.modify(
                    firm.stripe_subscription_id,
                    cancel_at_period_end=False,
                )

                logger.info(f"Reactivated subscription for firm {firm_id}")

                # Update firm status
                firm.subscription_status = reactivated_subscription.status
                db.commit()

                return {
                    "subscription_id": reactivated_subscription.id,
                    "status": reactivated_subscription.status,
                    "current_period_start": datetime.fromtimestamp(
                        reactivated_subscription.current_period_start
                    ),
                    "current_period_end": datetime.fromtimestamp(
                        reactivated_subscription.current_period_end
                    ),
                    "cancel_at_period_end": reactivated_subscription.cancel_at_period_end,
                }

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error reactivating subscription for firm {firm_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error reactivating subscription for firm {firm_id}: {e}")
            raise

    def create_billing_portal_session(
        self, firm_id: str, return_url: str
    ) -> Dict[str, str]:
        """Create a Stripe billing portal session for self-service.

        Args:
            firm_id: The Firm ID
            return_url: URL to return to after portal session

        Returns:
            Dict with portal session URL

        Raises:
            stripe.error.StripeError: If session creation fails
            ValueError: If firm or customer not found
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                if not firm.stripe_customer_id:
                    logger.error(f"No Stripe customer for firm {firm_id}")
                    raise ValueError(f"Firm {firm_id} has no Stripe customer")

                # Create billing portal session
                session = stripe.BillingPortal.Session.create(
                    customer=firm.stripe_customer_id,
                    return_url=return_url,
                )

                logger.info(f"Created billing portal session for firm {firm_id}")

                return {
                    "portal_url": session.url,
                    "session_id": session.id,
                }

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(
                f"Stripe error creating billing portal session for firm {firm_id}: {e}"
            )
            raise
        except Exception as e:
            logger.error(
                f"Error creating billing portal session for firm {firm_id}: {e}"
            )
            raise

    def get_invoices(self, firm_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent invoices for a firm.

        Args:
            firm_id: The Firm ID
            limit: Maximum number of invoices to return

        Returns:
            List of invoice details

        Raises:
            ValueError: If firm or customer not found
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                if not firm.stripe_customer_id:
                    logger.warning(f"No Stripe customer for firm {firm_id}")
                    return []

                # Retrieve invoices
                invoices = stripe.Invoice.list(
                    customer=firm.stripe_customer_id,
                    limit=limit,
                )

                result = []
                for invoice in invoices.data:
                    result.append({
                        "invoice_id": invoice.id,
                        "amount": invoice.amount_paid,
                        "currency": invoice.currency.upper(),
                        "status": invoice.status,
                        "created": datetime.fromtimestamp(invoice.created),
                        "due_date": (
                            datetime.fromtimestamp(invoice.due_date)
                            if invoice.due_date
                            else None
                        ),
                        "pdf_url": invoice.pdf,
                        "hosted_invoice_url": invoice.hosted_invoice_url,
                    })

                logger.info(f"Retrieved {len(result)} invoices for firm {firm_id}")
                return result

            finally:
                db.close()

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error retrieving invoices for firm {firm_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Error retrieving invoices for firm {firm_id}: {e}")
            raise

    def handle_webhook(self, payload: str, sig_header: str) -> Dict[str, Any]:
        """Process Stripe webhooks.

        Args:
            payload: Raw webhook payload
            sig_header: Stripe signature header

        Returns:
            Processing result dict

        Raises:
            stripe.error.SignatureVerificationError: If signature invalid
        """
        try:
            # Verify webhook signature
            event = stripe.Webhook.construct_event(
                payload, sig_header, self.settings.STRIPE_WEBHOOK_SECRET
            )

            event_type = event["type"]
            logger.info(f"Processing webhook event: {event_type}")

            if event_type == "customer.subscription.created":
                return self._handle_subscription_created(event["data"]["object"])

            elif event_type == "customer.subscription.updated":
                return self._handle_subscription_updated(event["data"]["object"])

            elif event_type == "customer.subscription.deleted":
                return self._handle_subscription_deleted(event["data"]["object"])

            elif event_type == "invoice.payment_succeeded":
                return self._handle_payment_succeeded(event["data"]["object"])

            elif event_type == "invoice.payment_failed":
                return self._handle_payment_failed(event["data"]["object"])

            else:
                logger.info(f"Unhandled webhook event type: {event_type}")
                return {"status": "ignored"}

        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid webhook signature: {e}")
            raise
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            raise

    def _handle_subscription_created(self, subscription: Dict[str, Any]) -> Dict[str, Any]:
        """Handle customer.subscription.created webhook."""
        firm_id = subscription.get("metadata", {}).get("firm_id")
        if not firm_id:
            logger.warning("Webhook subscription created without firm_id metadata")
            return {"status": "ignored"}

        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if firm:
                    tier = subscription.get("metadata", {}).get("tier", "essentials")
                    firm.subscription_tier = tier
                    firm.subscription_status = subscription["status"]
                    firm.stripe_subscription_id = subscription["id"]
                    db.commit()
                    logger.info(
                        f"Updated firm {firm_id} subscription status to {subscription['status']}"
                    )
                    return {"status": "processed"}
                return {"status": "firm_not_found"}

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error handling subscription created webhook: {e}")
            raise

    def _handle_subscription_updated(self, subscription: Dict[str, Any]) -> Dict[str, Any]:
        """Handle customer.subscription.updated webhook (handles upgrades/downgrades)."""
        firm_id = subscription.get("metadata", {}).get("firm_id")
        if not firm_id:
            logger.warning("Webhook subscription updated without firm_id metadata")
            return {"status": "ignored"}

        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if firm:
                    tier = subscription.get("metadata", {}).get("tier", firm.subscription_tier)
                    firm.subscription_tier = tier
                    firm.subscription_status = subscription["status"]
                    db.commit()
                    logger.info(
                        f"Updated firm {firm_id} tier to {tier} and status to {subscription['status']}"
                    )
                    return {"status": "processed"}
                return {"status": "firm_not_found"}

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error handling subscription updated webhook: {e}")
            raise

    def _handle_subscription_deleted(self, subscription: Dict[str, Any]) -> Dict[str, Any]:
        """Handle customer.subscription.deleted webhook."""
        firm_id = subscription.get("metadata", {}).get("firm_id")
        if not firm_id:
            logger.warning("Webhook subscription deleted without firm_id metadata")
            return {"status": "ignored"}

        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if firm:
                    firm.subscription_status = "cancelled"
                    firm.stripe_subscription_id = None
                    db.commit()
                    logger.info(f"Marked firm {firm_id} subscription as cancelled")
                    return {"status": "processed"}
                return {"status": "firm_not_found"}

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error handling subscription deleted webhook: {e}")
            raise

    def _handle_payment_succeeded(self, invoice: Dict[str, Any]) -> Dict[str, Any]:
        """Handle invoice.payment_succeeded webhook."""
        customer_id = invoice.get("customer")
        if not customer_id:
            logger.warning("Payment succeeded invoice without customer")
            return {"status": "ignored"}

        try:
            db = self._get_db_session()
            try:
                firm = (
                    db.query(Firm)
                    .filter(Firm.stripe_customer_id == customer_id)
                    .first()
                )
                if firm:
                    logger.info(
                        f"Payment succeeded for firm {firm.id}: "
                        f"amount={invoice['amount_paid']}, invoice={invoice['id']}"
                    )
                    # Could trigger email confirmation, logging, metrics here
                    return {"status": "processed"}
                return {"status": "firm_not_found"}

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error handling payment succeeded webhook: {e}")
            raise

    def _handle_payment_failed(self, invoice: Dict[str, Any]) -> Dict[str, Any]:
        """Handle invoice.payment_failed webhook."""
        customer_id = invoice.get("customer")
        if not customer_id:
            logger.warning("Payment failed invoice without customer")
            return {"status": "ignored"}

        try:
            db = self._get_db_session()
            try:
                firm = (
                    db.query(Firm)
                    .filter(Firm.stripe_customer_id == customer_id)
                    .first()
                )
                if firm:
                    logger.error(
                        f"Payment failed for firm {firm.id}: "
                        f"invoice={invoice['id']}, amount={invoice['amount_due']}"
                    )
                    # Alert COLP via email about payment failure
                    try:
                        from services.email_service import EmailService
                        email_svc = EmailService()
                        amount = invoice.get("amount_due", 0) / 100  # Stripe uses pence
                        email_svc.send(
                            to_email=firm.email or "",
                            subject=f"Seema — Payment Failed for {firm.name}",
                            body=(
                                f"<p>A payment of <strong>£{amount:.2f}</strong> for your Seema subscription "
                                f"has failed.</p>"
                                f"<p>Invoice ID: {invoice.get('id', 'N/A')}</p>"
                                f"<p>Please update your payment method in Settings → Billing to avoid "
                                f"service interruption.</p>"
                                f"<p>If you need assistance, contact support@seemaai.co.uk.</p>"
                            ),
                            firm_name=firm.name,
                        )
                        logger.info(f"Payment failure alert sent to firm {firm.id}")
                    except Exception as email_err:
                        logger.warning(f"Failed to send payment failure alert: {email_err}")
                    return {"status": "processed"}
                return {"status": "firm_not_found"}

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error handling payment failed webhook: {e}")
            raise

    def get_feature_access(self, firm_id: str) -> Dict[str, bool]:
        """Get features available based on subscription tier.

        Args:
            firm_id: The Firm ID

        Returns:
            Dict mapping feature names to boolean access

        Raises:
            ValueError: If firm not found
        """
        try:
            db = self._get_db_session()
            try:
                firm = db.query(Firm).filter(Firm.id == firm_id).first()
                if not firm:
                    logger.error(f"Firm not found: {firm_id}")
                    raise ValueError(f"Firm {firm_id} not found")

                # Map subscription tier to feature set
                tier = SubscriptionTier(firm.subscription_tier)
                available_features = FEATURE_MATRIX.get(tier, set())

                result = {}
                for feature in FeatureAccess:
                    result[feature.value] = feature in available_features

                logger.info(f"Retrieved feature access for firm {firm_id} (tier={tier})")
                return result

            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting feature access for firm {firm_id}: {e}")
            raise

    def check_feature(self, firm_id: str, feature: str) -> bool:
        """Check if a firm can access a specific feature.

        Args:
            firm_id: The Firm ID
            feature: Feature name to check

        Returns:
            True if firm has access, False otherwise

        Raises:
            ValueError: If firm not found or feature invalid
        """
        try:
            # Validate feature exists
            try:
                feature_enum = FeatureAccess(feature)
            except ValueError:
                logger.error(f"Invalid feature: {feature}")
                raise ValueError(f"Unknown feature: {feature}")

            # Get feature access and check
            access = self.get_feature_access(firm_id)
            has_access = access.get(feature, False)

            logger.debug(f"Firm {firm_id} feature check: {feature}={has_access}")
            return has_access

        except ValueError:
            raise
        except Exception as e:
            logger.error(f"Error checking feature access for firm {firm_id}: {e}")
            raise
