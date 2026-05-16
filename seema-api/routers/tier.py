"""Tier info endpoint — serves subscription tier status to the frontend."""
from fastapi import APIRouter, Depends

from middleware.tier_gate import get_firm_tier_info

router = APIRouter(prefix="/tier", tags=["tier"])


@router.get("/info")
async def tier_info(info: dict = Depends(get_firm_tier_info)):
    """Return the firm's current subscription tier, limits, and locked features.

    Used by the frontend to decide which UI elements to gate or show
    upgrade prompts for.
    """
    return {"data": info}
