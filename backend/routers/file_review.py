"""File Review Form — generates the firm-branded file-audit checklist PDF."""
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt
from middleware.auth import get_current_user, CurrentUser
from models.firm import Firm
from models.matters import Matter
from models.staff import StaffMember
from services.file_review_pdf import generate_file_review_form

router = APIRouter()


@router.get("/compliance/file-reviews")
async def list_file_reviews(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List the firm's staff file-review records (Staff & Training page).

    Previously 404'd (no endpoint). Reads the staff_file_reviews helper table
    (no ORM model) via RLS-scoped raw SQL; empty until reviews exist.
    """
    res = await db.execute(
        text(
            "SELECT id, staff_id, case_id, reviewer_id, status, due_date, "
            "completed_at, findings, score FROM staff_file_reviews "
            "WHERE firm_id = :fid ORDER BY due_date DESC NULLS LAST"
        ),
        {"fid": user.firm_id},
    )
    return [dict(r._mapping) for r in res]


async def _get_firm(db: AsyncSession, firm_id: str) -> Firm:
    res = await db.execute(select(Firm).where(Firm.id == firm_id))
    firm = res.scalar_one_or_none()
    if not firm:
        raise HTTPException(404, "Firm not found")
    return firm


def _pdf_response(pdf: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/compliance/file-review-form/blank")
async def blank_file_review_form(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Download a blank, firm-branded File Review Form."""
    firm = await _get_firm(db, user.firm_id)
    pdf = generate_file_review_form(firm)
    return _pdf_response(pdf, "File-Review-Form.pdf")


@router.get("/compliance/matters/{matter_id}/file-review-form")
async def matter_file_review_form(
    matter_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Download a File Review Form pre-filled from a matter record."""
    firm = await _get_firm(db, user.firm_id)

    res = await db.execute(
        select(Matter).where(Matter.id == matter_id, Matter.firm_id == user.firm_id)
    )
    matter = res.scalar_one_or_none()
    if not matter:
        raise HTTPException(404, "Matter not found")

    # Resolve the handler's name from the assigned staff member, if any.
    handler_name = ""
    if matter.assigned_to:
        sres = await db.execute(
            select(StaffMember).where(StaffMember.id == matter.assigned_to)
        )
        staff = sres.scalar_one_or_none()
        if staff:
            handler_name = staff.name or ""

    matter_dict = {
        "reference": matter.reference,
        "external_ref": matter.external_ref,
        "title": matter.title,
        "client_name": matter.client_name,
        "handler_name": handler_name,
    }
    pdf = generate_file_review_form(firm, matter=matter_dict)
    ref = matter.reference or matter.id[:8]
    return _pdf_response(pdf, f"File-Review-Form-{ref}.pdf")
