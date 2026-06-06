"""Billing and subscription routes — Stripe integration.

Wires to services/billing.py for all Stripe operations.
Tiers: Starter (£199/mo), Essentials (£599/mo), Professional (£999/mo).
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import stripe

from config import get_settings

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import get_current_user, CurrentUser
from middleware.tenant import TenantQuery
from models.firm import Firm
from services.audit_logger import log_audit

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# Current pricing (£/month)
PLAN_PRICING = {
    "starter": {"monthly": 199, "annual": 199},
    "essentials": {"monthly": 599, "annual": 599},
    "professional": {"monthly": 999, "annual": 999},
}

# ── Request / Response Models ──

class SubscriptionResponse(BaseModel):
    firm_id: str
    subscription_status: str
    plan: str
    billing_email: str | None
    next_billing_date: str | None
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None

class SubscribeRequest(BaseModel):
    plan: str  # "starter", "essentials", or "professional"
    billing_period: str = "monthly"  # "monthly" or "annual"
    billing_email: str
    payment_method_id: str | None = None

class UpgradeRequest(BaseModel):
    new_plan: str  # "starter", "essentials", or "professional"

class BillingRecordResponse(BaseModel):
    id: str
    date: str
    description: str
    amount: int
    status: str
    invoice_url: str | None = None
    pdf_url: str | None = None

# ── Helpers ──

def _get_stripe_price_id(plan: str, period: str) -> str:
    """Map plan + period to the Stripe Price ID from env vars."""
    price_map = {
        ("starter", "monthly"): settings.STRIPE_PRICE_STARTER_MONTHLY,
        ("starter", "annual"): settings.STRIPE_PRICE_STARTER_ANNUAL,
        ("essentials", "monthly"): settings.STRIPE_PRICE_ESSENTIALS_MONTHLY,
        ("essentials", "annual"): settings.STRIPE_PRICE_ESSENTIALS_ANNUAL,
        ("professional", "monthly"): settings.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
        ("professional", "annual"): settings.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
    }
    price_id = price_map.get((plan, period))
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Invalid plan/period: {plan}/{period}")
    return price_id

async def _get_firm(db: AsyncSession, firm_id: str) -> Firm:
    """Fetch firm or raise 404."""
    tq = TenantQuery(firm_id)
    result = await db.execute(tq.select(Firm, Firm.id == firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")
    return firm

# ── Get Subscription ──

@router.get("/billing/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get current subscription details, pulling live data from Stripe if available."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    response = {
        "firm_id": firm.id,
        "subscription_status": firm.subscription_status or "trial",
        "plan": firm.subscription_tier or firm.subscription_plan or "essentials",
        "billing_email": firm.billing_email,
        "next_billing_date": firm.next_billing_date,
        "stripe_customer_id": firm.stripe_customer_id,
        "stripe_subscription_id": firm.stripe_subscription_id,
    }

    # If we have a Stripe subscription, fetch live status
    if firm.stripe_subscription_id and settings.STRIPE_SECRET_KEY:
        try:
            stripe.api_key = settings.STRIPE_SECRET_KEY
            sub = stripe.Subscription.retrieve(firm.stripe_subscription_id)
            response["subscription_status"] = sub.status
            if sub.current_period_end:
                response["next_billing_date"] = datetime.fromtimestamp(
                    sub.current_period_end, tz=timezone.utc
                ).isoformat()
        except stripe.error.StripeError as e:
            logger.warning(f"Could not fetch Stripe subscription for firm {firm.id}: {e}")

    return response

# ── Subscribe ──

@router.post("/billing/subscribe", response_model=SubscriptionResponse)
async def subscribe(
    req: SubscribeRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a Stripe customer and subscription."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    if req.plan not in PLAN_PRICING:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {req.plan}. Must be 'starter', 'essentials', or 'professional'.")
    if req.billing_period not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="billing_period must be 'monthly' or 'annual'")

    firm.billing_email = req.billing_email

    # Create Stripe customer if we don't have one
    if settings.STRIPE_SECRET_KEY:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            if not firm.stripe_customer_id:
                customer = stripe.Customer.create(
                    name=firm.name or "Law Firm",
                    email=req.billing_email,
                    metadata={"firm_id": firm.id, "firm_name": firm.name or ""},
                )
                firm.stripe_customer_id = customer.id
                logger.info(f"Created Stripe customer {customer.id} for firm {firm.id}")

            # Get price ID and create subscription
            price_id = _get_stripe_price_id(req.plan, req.billing_period)

            sub_params = {
                "customer": firm.stripe_customer_id,
                "items": [{"price": price_id}],
                "metadata": {
                    "firm_id": firm.id,
                    "tier": req.plan,
                    "billing_period": req.billing_period,
                },
            }

            if req.payment_method_id:
                sub_params["default_payment_method"] = req.payment_method_id
                sub_params["payment_behavior"] = "default_incomplete"
                sub_params["expand"] = ["latest_invoice.payment_intent"]
            else:
                sub_params["payment_behavior"] = "default_incomplete"
                sub_params["expand"] = ["latest_invoice.payment_intent"]

            subscription = stripe.Subscription.create(**sub_params)

            firm.stripe_subscription_id = subscription.id
            firm.subscription_status = subscription.status
            firm.subscription_tier = req.plan
            firm.subscription_plan = req.plan
            if subscription.current_period_end:
                firm.next_billing_date = datetime.fromtimestamp(
                    subscription.current_period_end, tz=timezone.utc
                ).isoformat()

            logger.info(f"Created Stripe subscription {subscription.id} for firm {firm.id}")

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error during subscribe for firm {firm.id}: {e}")
            raise HTTPException(status_code=502, detail=f"Payment provider error: {str(e)}")
    else:
        # No Stripe key configured — update DB directly (dev/demo mode)
        firm.subscription_tier = req.plan
        firm.subscription_plan = req.plan
        firm.subscription_status = "active"
        firm.next_billing_date = datetime.now(timezone.utc).replace(
            year=datetime.now(timezone.utc).year + 1
        ).isoformat()

    await db.flush()

    await log_audit(
        db=db, firm_id=user.firm_id, action="subscribed",
        entity_type="billing", entity_id=firm.id, user_id=user.user_id,
        details=f"Subscribed to {req.plan} ({req.billing_period})",
    )

    return {
        "firm_id": firm.id,
        "subscription_status": firm.subscription_status,
        "plan": firm.subscription_tier,
        "billing_email": firm.billing_email,
        "next_billing_date": firm.next_billing_date,
        "stripe_customer_id": firm.stripe_customer_id,
        "stripe_subscription_id": firm.stripe_subscription_id,
    }

# ── Upgrade / Downgrade Plan ──

@router.post("/billing/upgrade", response_model=SubscriptionResponse)
async def upgrade_plan(
    req: UpgradeRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Upgrade or downgrade subscription plan with prorated billing."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    if req.new_plan not in PLAN_PRICING:
        raise HTTPException(status_code=400, detail=f"Invalid plan: {req.new_plan}")

    old_plan = firm.subscription_tier or firm.subscription_plan

    if settings.STRIPE_SECRET_KEY and firm.stripe_subscription_id:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            current_sub = stripe.Subscription.retrieve(firm.stripe_subscription_id)
            current_item = current_sub["items"]["data"][0]

            # Determine billing period from current price interval
            current_price = stripe.Price.retrieve(current_item["price"]["id"])
            period = "annual" if current_price.recurring.interval == "year" else "monthly"

            new_price_id = _get_stripe_price_id(req.new_plan, period)

            updated_sub = stripe.Subscription.modify(
                firm.stripe_subscription_id,
                items=[{"id": current_item["id"], "price": new_price_id}],
                metadata={"tier": req.new_plan},
                proration_behavior="create_prorations",
            )

            firm.subscription_tier = req.new_plan
            firm.subscription_plan = req.new_plan
            firm.subscription_status = updated_sub.status

            logger.info(f"Upgraded firm {firm.id} from {old_plan} to {req.new_plan}")

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error during upgrade for firm {firm.id}: {e}")
            raise HTTPException(status_code=502, detail=f"Payment provider error: {str(e)}")
    else:
        # Dev/demo mode
        firm.subscription_tier = req.new_plan
        firm.subscription_plan = req.new_plan

    await db.flush()

    await log_audit(
        db=db, firm_id=user.firm_id, action="upgraded",
        entity_type="billing", entity_id=firm.id, user_id=user.user_id,
        details=f"Plan changed from {old_plan} to {req.new_plan}",
    )

    return {
        "firm_id": firm.id,
        "subscription_status": firm.subscription_status,
        "plan": firm.subscription_tier,
        "billing_email": firm.billing_email,
        "next_billing_date": firm.next_billing_date,
        "stripe_customer_id": firm.stripe_customer_id,
        "stripe_subscription_id": firm.stripe_subscription_id,
    }

# ── Cancel Subscription ──

@router.post("/billing/cancel")
async def cancel_subscription(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Cancel subscription at end of current billing period."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    if settings.STRIPE_SECRET_KEY and firm.stripe_subscription_id:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            # Cancel at period end (not immediately) — firm keeps access until then
            stripe.Subscription.modify(
                firm.stripe_subscription_id,
                cancel_at_period_end=True,
            )
            firm.subscription_status = "cancelling"
            logger.info(f"Marked firm {firm.id} subscription for cancellation at period end")
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error during cancel for firm {firm.id}: {e}")
            raise HTTPException(status_code=502, detail=f"Payment provider error: {str(e)}")
    else:
        firm.subscription_status = "cancelled"

    await db.flush()

    await log_audit(
        db=db, firm_id=user.firm_id, action="cancelled",
        entity_type="billing", entity_id=firm.id, user_id=user.user_id,
        details="Subscription cancellation requested",
    )

    return {
        "firm_id": firm.id,
        "subscription_status": firm.subscription_status,
        "message": "Subscription will cancel at end of billing period",
    }

# ── Billing History (Real Stripe Invoices) ──

@router.get("/billing/history", response_model=list[BillingRecordResponse])
async def get_billing_history(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get billing history from Stripe invoices."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    records = []

    if settings.STRIPE_SECRET_KEY and firm.stripe_customer_id:
        stripe.api_key = settings.STRIPE_SECRET_KEY
        try:
            invoices = stripe.Invoice.list(
                customer=firm.stripe_customer_id,
                limit=24,
            )

            for inv in invoices.data:
                records.append({
                    "id": inv.id,
                    "date": datetime.fromtimestamp(inv.created, tz=timezone.utc).strftime("%Y-%m-%d"),
                    "description": inv.lines.data[0].description if inv.lines.data else f"Seema subscription",
                    "amount": inv.amount_paid // 100 if inv.amount_paid else inv.amount_due // 100,
                    "status": inv.status or "unknown",
                    "invoice_url": inv.hosted_invoice_url,
                    "pdf_url": inv.invoice_pdf,
                })

            logger.info(f"Retrieved {len(records)} invoices for firm {firm.id}")

        except stripe.error.StripeError as e:
            logger.warning(f"Could not fetch Stripe invoices for firm {firm.id}: {e}")
    else:
        # Dev/demo: return history based on DB subscription data
        if firm.subscription_status == "active" and firm.subscription_tier:
            pricing = PLAN_PRICING.get(firm.subscription_tier, {})
            cost = pricing.get("monthly", 0)
            records.append({
                "id": f"demo_inv_{firm.id[:8]}",
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "description": f"Seema {firm.subscription_tier.title()} Plan",
                "amount": cost,
                "status": "paid",
                "invoice_url": None,
                "pdf_url": None,
            })

    return records

# ── Payment Methods ──

@router.get("/billing/publishable-key")
async def get_publishable_key(
    user: CurrentUser = Depends(get_current_user),
):
    """Return the Stripe publishable key so the frontend can initialise Stripe.js."""
    key = settings.STRIPE_PUBLISHABLE_KEY
    if not key:
        raise HTTPException(status_code=400, detail="Stripe not configured")
    return {"publishable_key": key}

@router.post("/billing/setup-intent")
async def create_setup_intent(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Create a Stripe SetupIntent so the frontend can securely collect card details."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe not configured")

    stripe.api_key = settings.STRIPE_SECRET_KEY

    # Ensure we have a Stripe customer
    if not firm.stripe_customer_id:
        customer = stripe.Customer.create(
            name=firm.name or "Law Firm",
            email=firm.billing_email or "",
            metadata={"firm_id": firm.id, "firm_name": firm.name or ""},
        )
        firm.stripe_customer_id = customer.id
        await db.flush()
        logger.info(f"Created Stripe customer {customer.id} for firm {firm.id}")

    try:
        setup_intent = stripe.SetupIntent.create(
            customer=firm.stripe_customer_id,
            payment_method_types=["card"],
            metadata={"firm_id": firm.id},
        )
    except stripe.error.StripeError as e:
        logger.error(f"Failed to create SetupIntent for firm {firm.id}: {e}")
        raise HTTPException(status_code=502, detail=f"Payment provider error: {str(e)}")

    return {
        "client_secret": setup_intent.client_secret,
        "setup_intent_id": setup_intent.id,
    }

@router.get("/billing/payment-methods")
async def list_payment_methods(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List saved payment methods for the firm's Stripe customer."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    if not settings.STRIPE_SECRET_KEY or not firm.stripe_customer_id:
        return []

    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        methods = stripe.PaymentMethod.list(
            customer=firm.stripe_customer_id,
            type="card",
        )

        # Get default payment method
        customer = stripe.Customer.retrieve(firm.stripe_customer_id)
        default_pm = None
        if customer.invoice_settings and customer.invoice_settings.default_payment_method:
            default_pm = customer.invoice_settings.default_payment_method

        return [
            {
                "id": pm.id,
                "brand": pm.card.brand if pm.card else "unknown",
                "last4": pm.card.last4 if pm.card else "????",
                "exp_month": pm.card.exp_month if pm.card else 0,
                "exp_year": pm.card.exp_year if pm.card else 0,
                "is_default": pm.id == default_pm,
                "created": pm.created,
            }
            for pm in methods.data
        ]

    except stripe.error.StripeError as e:
        logger.warning(f"Could not fetch payment methods for firm {firm.id}: {e}")
        return []

@router.post("/billing/payment-methods/{pm_id}/default")
async def set_default_payment_method(
    pm_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Set a payment method as the default for this customer."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    if not settings.STRIPE_SECRET_KEY or not firm.stripe_customer_id:
        raise HTTPException(status_code=400, detail="Stripe not configured")

    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        # Update customer default
        stripe.Customer.modify(
            firm.stripe_customer_id,
            invoice_settings={"default_payment_method": pm_id},
        )

        # Also update subscription default if exists
        if firm.stripe_subscription_id:
            stripe.Subscription.modify(
                firm.stripe_subscription_id,
                default_payment_method=pm_id,
            )

        await log_audit(
            db=db, firm_id=user.firm_id, action="updated",
            entity_type="payment_method", entity_id=pm_id, user_id=user.user_id,
            details=f"Set default payment method to {pm_id[-4:]}",
        )

        return {"success": True, "message": "Default payment method updated"}

    except stripe.error.StripeError as e:
        logger.error(f"Failed to set default payment method for firm {firm.id}: {e}")
        raise HTTPException(status_code=502, detail=f"Payment provider error: {str(e)}")

@router.delete("/billing/payment-methods/{pm_id}")
async def remove_payment_method(
    pm_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Detach a payment method from the customer."""
    user.require_role("admin")
    firm = await _get_firm(db, user.firm_id)

    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=400, detail="Stripe not configured")

    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        stripe.PaymentMethod.detach(pm_id)

        await log_audit(
            db=db, firm_id=user.firm_id, action="removed",
            entity_type="payment_method", entity_id=pm_id, user_id=user.user_id,
            details=f"Removed payment method ending {pm_id[-4:]}",
        )

        return {"success": True, "message": "Payment method removed"}

    except stripe.error.StripeError as e:
        logger.error(f"Failed to detach payment method {pm_id} for firm {firm.id}: {e}")
        raise HTTPException(status_code=502, detail=f"Payment provider error: {str(e)}")

# ── Feature Access ──

@router.get("/billing/features")
async def get_features(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get features available based on current subscription tier."""
    firm = await _get_firm(db, user.firm_id)

    tier = firm.subscription_tier or "starter"

    # Starter: basic compliance toolkit
    starter_features = {
        "dashboard", "audit_trail", "chase_engine",
    }
    # Essentials: 5 core COLP features
    essentials_features = starter_features | {
        "breach_management", "staff_training", "compliance_alerts",
    }
    # Professional: everything
    professional_features = essentials_features | {
        "client_intake_cdd", "aml_cdd", "policy_management", "evidence_locker",
        "supervision", "matters", "deadlines", "key_dates", "remediation",
        "data_management", "conflicts", "undertakings", "complaints",
        "client_accounts", "email_settings", "staff_portal", "regulatory_updates",
        "ai_regulatory_analysis", "sra_return_generator", "compliance_scan",
        "advanced_reporting",
    }

    if tier == "professional":
        available = professional_features
    elif tier == "essentials":
        available = essentials_features
    else:
        available = starter_features

    return {
        "tier": tier,
        "features": {f: (f in available) for f in professional_features},
    }

# ── Stripe Webhook (Real Signature Verification) ──

@router.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks with signature verification.

    This endpoint receives raw request body and verifies the Stripe signature
    before processing events.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not settings.STRIPE_SECRET_KEY or not settings.STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook received but STRIPE keys not configured")
        return {"status": "ignored", "reason": "stripe_not_configured"}

    stripe.api_key = settings.STRIPE_SECRET_KEY

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        logger.error("Invalid Stripe webhook signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except ValueError:
        logger.error("Invalid Stripe webhook payload")
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event["type"]
    event_data = event["data"]["object"]
    logger.info(f"Processing Stripe webhook: {event_type}")

    # Stripe webhooks have no JWT — we authenticate by signature above.
    # Webhook handlers need cross-tenant access (looking up firms by stripe
    # customer_id), so we run on the BYPASSRLS admin engine.
    from middleware.tenant_rls import admin_session
    if admin_session is None:
        logger.error("Stripe webhook received but ADMIN_DATABASE_URL not configured")
        raise HTTPException(status_code=500, detail="Admin engine unavailable")

    async with admin_session() as db:
        try:
            if event_type == "invoice.payment_succeeded":
                await _handle_payment_succeeded(db, event_data)

            elif event_type == "invoice.payment_failed":
                await _handle_payment_failed(db, event_data)

            elif event_type == "customer.subscription.updated":
                await _handle_subscription_updated(db, event_data)

            elif event_type == "customer.subscription.deleted":
                await _handle_subscription_deleted(db, event_data)

            elif event_type == "customer.subscription.created":
                await _handle_subscription_created(db, event_data)

            else:
                logger.info(f"Unhandled Stripe event type: {event_type}")

            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Error processing webhook {event_type}: {e}")
            raise

    return {"status": "processed", "event_type": event_type}

# ── Webhook Handlers ──

async def _find_firm_by_customer(db: AsyncSession, customer_id: str) -> Firm | None:
    """Look up firm by Stripe customer ID."""
    result = await db.execute(
        select(Firm).where(Firm.stripe_customer_id == customer_id)
    )
    return result.scalar_one_or_none()

async def _find_firm_by_metadata(db: AsyncSession, obj: dict) -> Firm | None:
    """Try to find firm from Stripe object metadata, then fall back to customer ID."""
    firm_id = obj.get("metadata", {}).get("firm_id")
    if firm_id:
        result = await db.execute(select(Firm).where(Firm.id == firm_id))
        firm = result.scalar_one_or_none()
        if firm:
            return firm

    customer_id = obj.get("customer")
    if customer_id:
        return await _find_firm_by_customer(db, customer_id)
    return None

async def _handle_payment_succeeded(db: AsyncSession, invoice: dict):
    """Handle invoice.payment_succeeded — confirm subscription is active."""
    firm = await _find_firm_by_customer(db, invoice.get("customer", ""))
    if not firm:
        logger.warning(f"Payment succeeded but no firm found for customer {invoice.get('customer')}")
        return

    firm.subscription_status = "active"
    logger.info(
        f"Payment succeeded for firm {firm.id}: "
        f"amount={invoice.get('amount_paid', 0)}, invoice={invoice.get('id')}"
    )

async def _handle_payment_failed(db: AsyncSession, invoice: dict):
    """Handle invoice.payment_failed — mark subscription as past_due."""
    firm = await _find_firm_by_customer(db, invoice.get("customer", ""))
    if not firm:
        logger.warning(f"Payment failed but no firm found for customer {invoice.get('customer')}")
        return

    firm.subscription_status = "past_due"
    logger.error(
        f"Payment failed for firm {firm.id}: "
        f"invoice={invoice.get('id')}, amount_due={invoice.get('amount_due', 0)}"
    )

async def _handle_subscription_created(db: AsyncSession, subscription: dict):
    """Handle customer.subscription.created — link subscription to firm."""
    firm = await _find_firm_by_metadata(db, subscription)
    if not firm:
        logger.warning("Subscription created but no firm found")
        return

    tier = subscription.get("metadata", {}).get("tier", "essentials")
    firm.stripe_subscription_id = subscription["id"]
    firm.subscription_tier = tier
    firm.subscription_plan = tier
    firm.subscription_status = subscription.get("status", "active")
    logger.info(f"Subscription created for firm {firm.id}: tier={tier}")

async def _handle_subscription_updated(db: AsyncSession, subscription: dict):
    """Handle customer.subscription.updated — sync tier changes."""
    firm = await _find_firm_by_metadata(db, subscription)
    if not firm:
        logger.warning("Subscription updated but no firm found")
        return

    tier = subscription.get("metadata", {}).get("tier", firm.subscription_tier)
    firm.subscription_tier = tier
    firm.subscription_plan = tier
    firm.subscription_status = subscription.get("status", firm.subscription_status)
    if subscription.get("current_period_end"):
        firm.next_billing_date = datetime.fromtimestamp(
            subscription["current_period_end"], tz=timezone.utc
        ).isoformat()
    logger.info(f"Subscription updated for firm {firm.id}: tier={tier}, status={subscription.get('status')}")

async def _handle_subscription_deleted(db: AsyncSession, subscription: dict):
    """Handle customer.subscription.deleted — mark firm as cancelled."""
    firm = await _find_firm_by_metadata(db, subscription)
    if not firm:
        logger.warning("Subscription deleted but no firm found")
        return

    firm.subscription_status = "cancelled"
    firm.stripe_subscription_id = None
    logger.info(f"Subscription cancelled for firm {firm.id}")
