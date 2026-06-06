"""Subscription tier gating — enforce feature access and limits by plan.

Provides both:
  1. ASGI middleware that gates routes by URL pattern (no router changes needed)
  2. FastAPI dependencies for fine-grained checks (staff limit, etc.)

Tier definitions:
  Essentials (£200/mo, 2-10 solicitors):
      Full compliance automation — dashboard, alerts, Clio sync, AI scanning,
      regulatory feeds, automated chasers, weekly reports. Capped at 10 users.

  Professional (£700/mo, 10-50 solicitors):
      Everything in Essentials + multi-department views, custom report builder,
      firm-wide risk heatmap, bulk training assignments, unlimited users,
      advanced audit exports, dedicated onboarding, priority support.
"""
import json
import logging
import re
from typing import Optional

from fastapi import Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from database import get_db
from middleware.auth import get_current_user

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tier hierarchy — higher number = more access
# ---------------------------------------------------------------------------
TIER_HIERARCHY = {
    "essentials": 1,
    "professional": 2,
}

# ---------------------------------------------------------------------------
# Tier limits
# ---------------------------------------------------------------------------
TIER_LIMITS = {
    "essentials": {
        "max_users": 10,
        "max_departments": 1,
    },
    "professional": {
        "max_users": None,       # unlimited
        "max_departments": None,  # unlimited
    },
}

# ---------------------------------------------------------------------------
# Feature sets (for frontend and docs)
# ---------------------------------------------------------------------------
PROFESSIONAL_FEATURES = frozenset({
    "multi_department_views",
    "custom_report_builder",
    "risk_heatmap",
    "bulk_training_assignments",
    "advanced_audit_exports",
    "unlimited_users",
})

ESSENTIALS_FEATURES = frozenset({
    "compliance_dashboard",
    "alerts",
    "clio_integration",
    "ai_compliance_scanning",
    "regulatory_feeds",
    "automated_chasers",
    "deadline_tracking",
    "undertaking_tracking",
    "sra_return_preparation",
    "risk_scoring",
    "aml_checks",
    "staff_training",
    "client_account_reconciliation",
    "breach_register",
    "complaints_register",
    "policy_management",
    "evidence_management",
    "weekly_summary_report",
})

# ---------------------------------------------------------------------------
# URL patterns that require Professional tier
# Uses regex patterns matched against the request path.
# ---------------------------------------------------------------------------
PROFESSIONAL_ROUTE_PATTERNS = [
    # Multi-department views & filtering
    (re.compile(r"^/api/dashboard/departments"), "multi_department_views"),
    (re.compile(r"^/api/compliance/departments"), "multi_department_views"),
    (re.compile(r"^/api/staff/departments/bulk"), "multi_department_views"),

    # Custom report builder
    (re.compile(r"^/api/compliance/reports/custom"), "custom_report_builder"),
    (re.compile(r"^/api/compliance/reports/builder"), "custom_report_builder"),

    # Firm-wide risk heatmap
    (re.compile(r"^/api/dashboard/risk-heatmap"), "risk_heatmap"),
    (re.compile(r"^/api/compliance/risk-heatmap"), "risk_heatmap"),

    # Bulk training assignments
    (re.compile(r"^/api/staff/training/bulk"), "bulk_training_assignments"),

    # Advanced audit exports
    (re.compile(r"^/api/audit/export"), "advanced_audit_exports"),
    (re.compile(r"^/api/data-mgmt/export/advanced"), "advanced_audit_exports"),
]

# ---------------------------------------------------------------------------
# Staff-creation paths that need a user-limit check (POST only)
# ---------------------------------------------------------------------------
STAFF_CREATE_PATTERNS = [
    re.compile(r"^/api/staff/?$"),
    re.compile(r"^/api/staff/invite"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_tier_level(tier: str) -> int:
    return TIER_HIERARCHY.get(tier, 0)


def tier_has_access(firm_tier: str, required_tier: str) -> bool:
    return get_tier_level(firm_tier) >= get_tier_level(required_tier)


def get_tier_limit(firm_tier: str, limit_key: str) -> Optional[int]:
    limits = TIER_LIMITS.get(firm_tier, TIER_LIMITS["essentials"])
    return limits.get(limit_key)


def is_professional_feature(feature: str) -> bool:
    return feature in PROFESSIONAL_FEATURES


# ---------------------------------------------------------------------------
# ASGI Middleware — gates routes by URL without touching router files
# ---------------------------------------------------------------------------

class TierGateMiddleware(BaseHTTPMiddleware):
    """Starlette middleware that checks the firm's subscription tier against
    route-level requirements before the request reaches the router.

    Skips checks for:
      - Unauthenticated requests (auth middleware handles those)
      - Non-API routes (static files, docs, health)
      - Routes not in PROFESSIONAL_ROUTE_PATTERNS
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method.upper()

        # Skip non-API paths
        if not path.startswith("/api/"):
            return await call_next(request)

        # Skip auth, docs, health endpoints
        if any(path.startswith(p) for p in ["/api/auth", "/api/docs", "/api/health", "/api/tier"]):
            return await call_next(request)

        # Check if this path requires Professional tier
        required_feature = None
        for pattern, feature in PROFESSIONAL_ROUTE_PATTERNS:
            if pattern.match(path.replace("/api/", "/api/")):
                required_feature = feature
                break

        # Check if this is a staff creation that needs user-limit enforcement
        is_staff_create = False
        if method == "POST":
            for pattern in STAFF_CREATE_PATTERNS:
                if pattern.match(path):
                    is_staff_create = True
                    break

        # If no gating needed, pass through
        if not required_feature and not is_staff_create:
            return await call_next(request)

        # We need the firm's tier — extract from the auth token
        # The auth middleware should have already validated the token
        # and set request.state.user. If not present, let the auth
        # middleware handle the 401.
        user = getattr(request.state, "user", None)
        if not user:
            # No auth context yet — let request proceed to auth middleware
            return await call_next(request)

        firm_id = getattr(user, "firm_id", None)
        if not firm_id:
            return await call_next(request)

        # Get firm tier from DB
        try:
            from database import async_session
            async with async_session() as db:
                from models.firm import Firm
                result = await db.execute(select(Firm).where(Firm.id == firm_id))
                firm = result.scalar_one_or_none()

                if not firm:
                    return await call_next(request)

                firm_tier = firm.subscription_tier or "essentials"

                # Check Professional-only features
                if required_feature and not tier_has_access(firm_tier, "professional"):
                    return JSONResponse(
                        status_code=403,
                        content={
                            "success": False,
                            "error": "tier_required",
                            "required_tier": "professional",
                            "current_tier": firm_tier,
                            "feature": required_feature,
                            "message": f"This feature requires the Professional plan. "
                                       f"Your firm is on the {firm_tier.title()} plan.",
                        },
                    )

                # Check staff creation limit
                if is_staff_create:
                    max_users = get_tier_limit(firm_tier, "max_users")
                    if max_users is not None:
                        from models.staff import StaffMember
                        count_result = await db.execute(
                            select(func.count(StaffMember.id)).where(
                                StaffMember.firm_id == firm_id,
                                StaffMember.status == "active",
                            )
                        )
                        active_count = count_result.scalar() or 0

                        if active_count >= max_users:
                            return JSONResponse(
                                status_code=403,
                                content={
                                    "success": False,
                                    "error": "user_limit_reached",
                                    "current_count": active_count,
                                    "max_allowed": max_users,
                                    "current_tier": firm_tier,
                                    "message": f"Your {firm_tier.title()} plan supports up to "
                                               f"{max_users} users. Upgrade to Professional "
                                               f"for unlimited users.",
                                },
                            )

        except Exception as e:
            logger.error(f"Tier gate check failed: {e}")
            # Don't block on errors — let the request through
            pass

        return await call_next(request)


# ---------------------------------------------------------------------------
# FastAPI Dependencies — for use in individual routers if needed
# ---------------------------------------------------------------------------

def require_tier(required_tier: str):
    """FastAPI dependency that enforces a minimum subscription tier.

    Usage:
        @router.get("/...", dependencies=[Depends(require_tier("professional"))])
    """
    async def _check_tier(
        user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        from models.firm import Firm
        result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
        firm = result.scalar_one_or_none()

        if not firm:
            raise HTTPException(404, "Firm not found")

        if not tier_has_access(firm.subscription_tier, required_tier):
            raise HTTPException(
                403,
                detail={
                    "error": "tier_required",
                    "required_tier": required_tier,
                    "current_tier": firm.subscription_tier,
                    "message": f"This feature requires the {required_tier.title()} plan. "
                               f"Your firm is on the {firm.subscription_tier.title()} plan.",
                },
            )
        return firm

    return _check_tier


async def check_staff_limit(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dependency that checks the firm's user cap before creating staff."""
    from models.firm import Firm
    from models.staff import StaffMember

    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Firm not found")

    max_users = get_tier_limit(firm.subscription_tier, "max_users")
    if max_users is None:
        return firm

    count_result = await db.execute(
        select(func.count(StaffMember.id)).where(
            StaffMember.firm_id == user.firm_id,
            StaffMember.status == "active",
        )
    )
    active_count = count_result.scalar() or 0

    if active_count >= max_users:
        raise HTTPException(
            403,
            detail={
                "error": "user_limit_reached",
                "current_count": active_count,
                "max_allowed": max_users,
                "current_tier": firm.subscription_tier,
                "message": f"Your {firm.subscription_tier.title()} plan supports up to "
                           f"{max_users} users. Upgrade to Professional for unlimited users.",
            },
        )
    return firm


async def get_firm_tier_info(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Dependency returning full tier info for frontend consumption."""
    from models.firm import Firm
    from models.staff import StaffMember

    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Firm not found")

    tier = firm.subscription_tier or "essentials"
    max_users = get_tier_limit(tier, "max_users")

    count_result = await db.execute(
        select(func.count(StaffMember.id)).where(
            StaffMember.firm_id == user.firm_id,
            StaffMember.status == "active",
        )
    )
    active_count = count_result.scalar() or 0

    return {
        "tier": tier,
        "tier_level": get_tier_level(tier),
        "limits": {
            "max_users": max_users,
            "current_users": active_count,
            "users_remaining": (max_users - active_count) if max_users else None,
        },
        "professional_features_locked": tier != "professional",
        "locked_features": sorted(PROFESSIONAL_FEATURES) if tier != "professional" else [],
    }
