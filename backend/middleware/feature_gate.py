"""Feature gate middleware — thin wrapper around tier_gate.

Kept for backward-compatibility with any existing imports.
All actual logic lives in middleware.tier_gate.
"""
from middleware.tier_gate import (  # noqa: F401
    require_tier,
    check_staff_limit,
    get_firm_tier_info,
    tier_has_access,
    get_tier_limit,
    is_professional_feature,
    TIER_HIERARCHY,
    TIER_LIMITS,
    PROFESSIONAL_FEATURES,
    ESSENTIALS_FEATURES,
)
