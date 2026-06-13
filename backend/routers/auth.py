"""Authentication routes — login, logout, refresh, password reset, admin settings."""
import uuid
import logging

logger = logging.getLogger(__name__)
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.tenant_rls import tenant_db_from_jwt, bypass_db
from middleware.auth import (
    verify_password, hash_password, create_access_token,
    create_refresh_token, decode_token, get_current_user, CurrentUser,
)
from models.auth import UserAccount, UserSession
from models.staff import StaffMember
from models.firm import Firm
from services.audit_logger import log_audit
from services.firm_seeder import seed_firm_compliance

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict

class RefreshRequest(BaseModel):
    refresh_token: str

class ResetPasswordRequest(BaseModel):
    user_id: str
    new_password: str

class RegisterRequest(BaseModel):
    firm_name: str
    sra_number: str
    email: str
    password: str
    full_name: str
    phone: str | None = None

class CreateUserRequest(BaseModel):
    email: str
    password: str
    role: str = "staff"
    staff_id: str | None = None

# ── Register (new firm signup) ──

@router.post("/auth/register")
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(bypass_db)):  # bypass: pre-auth route, no firm context exists yet
    """Register a new firm and admin user. This is the entry point for every new firm.

    Creates:
    1. Firm record with SRA number
    2. Admin UserAccount (the person signing up)
    3. StaffMember record for the admin
    4. Returns tokens so the user is immediately logged in
    5. Frontend then redirects to /onboarding to complete setup
    """
    # Check email not already registered
    existing_user = await db.execute(select(UserAccount).where(UserAccount.email == req.email))
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    # Check SRA number not already registered
    existing_firm = await db.execute(select(Firm).where(Firm.sra_number == req.sra_number))
    if existing_firm.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A firm with this SRA number already exists")

    # 1. Create Firm (14-day trial with full Professional access)
    firm_id = str(uuid.uuid4())
    firm = Firm(
        id=firm_id,
        name=req.firm_name,
        sra_number=req.sra_number,
        email=req.email,
        phone=req.phone,
        onboarding_status="pending",
        subscription_status="trial",
        subscription_plan="professional",
        trial_ends_at=datetime.utcnow() + timedelta(days=14),
    )
    db.add(firm)

    # 2. Create StaffMember for the admin
    staff_id = str(uuid.uuid4())
    staff = StaffMember(
        id=staff_id,
        firm_id=firm_id,
        name=req.full_name,
        email=req.email,
        role="admin",
        department="Management",
        status="active",
    )
    db.add(staff)

    # 3. Create UserAccount (admin)
    user_id = str(uuid.uuid4())
    user = UserAccount(
        id=user_id,
        firm_id=firm_id,
        email=req.email,
        password_hash=hash_password(req.password),
        role="admin",
        staff_id=staff_id,
    )
    db.add(user)
    await db.flush()

    # 4. Create session + tokens
    access_token = create_access_token(user_id, firm_id, "admin")
    refresh_token = create_refresh_token(user_id, firm_id)

    session = UserSession(
        id=str(uuid.uuid4()),
        user_id=user_id,
        firm_id=firm_id,
        token=access_token,
        refresh_token=refresh_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(session)
    await db.flush()

    await log_audit(
        db=db, firm_id=firm_id, action="registered",
        entity_type="firm", entity_id=firm_id, user_id=user_id,
        details=f"New firm registered: {req.firm_name} (SRA: {req.sra_number})",
        ip_address=request.client.host if request.client else None,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": req.email,
            "role": "admin",
            "firm_id": firm_id,
            "firm_name": req.firm_name,
            "staff_id": staff_id,
            "onboarding_status": "pending",
        },
    }

@router.post("/auth/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(bypass_db)):  # bypass: pre-auth route, no firm context exists yet
    result = await db.execute(
        select(UserAccount).where(UserAccount.email == req.email)
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.utcnow() + timedelta(minutes=15)
            await db.flush()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=401, detail="Account is deactivated")

    if user.locked_until and user.locked_until > datetime.utcnow():
        raise HTTPException(status_code=423, detail="Account temporarily locked. Try again later.")

    # Reset failed attempts
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()

    access_token = create_access_token(user.id, user.firm_id, user.role)
    refresh_token = create_refresh_token(user.id, user.firm_id)

    # Store session
    session = UserSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        firm_id=user.firm_id,
        token=access_token,
        refresh_token=refresh_token,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500],
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(session)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="login",
        entity_type="user",
        entity_id=user.id,
        user_id=user.id,
        details=f"User logged in",
        ip_address=request.client.host if request.client else None,
    )

    # Get firm name
    firm_result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = firm_result.scalar_one_or_none()

    # Auto-seed a starter compliance framework on first login — OFF by default
    # so firms start with a clean slate and only see their real data (Clio sync
    # + their own entries). Toggle with AUTO_SEED_FIRMS=true.
    from config import get_settings as _gs
    if _gs().AUTO_SEED_FIRMS:
        try:
            async with db.begin_nested():
                await seed_firm_compliance(db, user.firm_id)
        except Exception as e:
            logging.getLogger("seema").warning(f"Auto-seed skipped for firm {user.firm_id}: {e}")

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "firm_id": user.firm_id,
            "firm_name": firm.name if firm else "",
            "staff_id": user.staff_id,
            "onboarding_status": firm.onboarding_status if firm else "pending",
        },
    )

@router.post("/auth/refresh", response_model=LoginResponse)
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(bypass_db)):  # bypass: pre-auth route, no firm context exists yet
    payload = decode_token(req.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    firm_id = payload.get("firm_id")

    result = await db.execute(
        select(UserAccount).where(UserAccount.id == user_id, UserAccount.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # Invalidate old session
    await db.execute(
        update(UserSession).where(UserSession.refresh_token == req.refresh_token)
        .values(is_active=False)
    )

    new_access = create_access_token(user.id, firm_id, user.role)
    new_refresh = create_refresh_token(user.id, firm_id)

    session = UserSession(
        id=str(uuid.uuid4()),
        user_id=user.id,
        firm_id=firm_id,
        token=new_access,
        refresh_token=new_refresh,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(session)

    return LoginResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        user={"id": user.id, "email": user.email, "role": user.role, "firm_id": firm_id},
    )

@router.post("/auth/logout")
async def logout(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    await db.execute(
        update(UserSession).where(
            UserSession.user_id == user.user_id,
            UserSession.is_active == True,
        ).values(is_active=False)
    )
    return {"message": "Logged out successfully"}

@router.get("/admin/users")
async def get_users(user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(tenant_db_from_jwt)):
    user.require_role("admin")
    result = await db.execute(
        select(UserAccount).where(UserAccount.firm_id == user.firm_id)
    )
    users = result.scalars().all()
    return [
        {
            "id": u.id, "email": u.email, "role": u.role,
            "staff_id": u.staff_id, "is_active": u.is_active,
            "last_login": str(u.last_login) if u.last_login else None,
            "created_at": str(u.created_at) if u.created_at else None,
        }
        for u in users
    ]

@router.post("/admin/users")
async def create_user(
    req: CreateUserRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    user.require_role("admin")
    existing = await db.execute(select(UserAccount).where(UserAccount.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    new_user = UserAccount(
        id=str(uuid.uuid4()),
        firm_id=user.firm_id,
        email=req.email,
        password_hash=hash_password(req.password),
        role=req.role,
        staff_id=req.staff_id,
    )
    db.add(new_user)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="created",
        entity_type="user",
        entity_id=new_user.id,
        user_id=user.user_id,
        details=f"User created — {req.email} with role {req.role}",
    )

    return {"id": new_user.id, "email": new_user.email, "role": new_user.role}

@router.post("/admin/users/reset-password")
async def reset_password(
    req: ResetPasswordRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    user.require_role("admin")
    result = await db.execute(
        select(UserAccount).where(
            UserAccount.id == req.user_id,
            UserAccount.firm_id == user.firm_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.password_hash = hash_password(req.new_password)
    target.failed_login_attempts = 0
    target.locked_until = None
    await db.flush()
    return {"message": "Password reset successfully"}

# ── Self-Service Password Change ──

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.post("/auth/change-password")
async def change_password(
    req: ChangePasswordRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Change the currently authenticated user's own password."""
    result = await db.execute(
        select(UserAccount).where(UserAccount.id == user.user_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="User account not found")

    # Verify current password
    if not verify_password(req.current_password, account.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    # Validate new password minimum length
    if len(req.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")

    account.password_hash = hash_password(req.new_password)
    account.failed_login_attempts = 0
    account.locked_until = None
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="password_changed",
        entity_type="user",
        entity_id=user.user_id,
        user_id=user.user_id,
        details="User changed their own password",
    )

    return {"message": "Password changed successfully"}

# ── Get Active Sessions ──

@router.get("/auth/sessions")
async def get_sessions(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """List the current user's active sessions."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.user_id == user.user_id,
            UserSession.is_active == True,
        )
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "created_at": str(s.created_at) if s.created_at else None,
            "last_active": str(s.last_active) if hasattr(s, "last_active") and s.last_active else None,
            "ip_address": s.ip_address if hasattr(s, "ip_address") else None,
            "user_agent": s.user_agent if hasattr(s, "user_agent") else None,
        }
        for s in sessions
    ]

# ── Revoke Session ──

@router.post("/auth/sessions/{session_id}/revoke")
async def revoke_session(
    session_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Revoke a specific session for the current user."""
    result = await db.execute(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user.user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.is_active = False
    await db.flush()
    return {"message": "Session revoked"}

# ── Update User (Admin) ──

class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    staff_id: str | None = None

@router.put("/admin/users/{user_id}")
async def update_user(
    user_id: str,
    req: UpdateUserRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update a user's role, status, or staff linkage."""
    user.require_role("admin")
    result = await db.execute(
        select(UserAccount).where(
            UserAccount.id == user_id,
            UserAccount.firm_id == user.firm_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if req.role is not None:
        valid_roles = ["colp", "partner", "admin", "solicitor", "staff"]
        if req.role.lower() not in valid_roles:
            raise HTTPException(status_code=400, detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}")
        target.role = req.role.lower()
    if req.is_active is not None:
        target.is_active = req.is_active
    if req.staff_id is not None:
        target.staff_id = req.staff_id

    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="updated",
        entity_type="user",
        entity_id=user_id,
        user_id=user.user_id,
        details=f"User updated — role={target.role}, active={target.is_active}",
    )

    return {
        "id": target.id,
        "email": target.email,
        "role": target.role,
        "is_active": target.is_active,
        "staff_id": target.staff_id,
    }

# ── Delete User (Admin) ──

@router.delete("/admin/users/{user_id}")
async def delete_user(
    user_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Deactivate a user account (soft delete)."""
    user.require_role("admin")
    if user_id == user.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    result = await db.execute(
        select(UserAccount).where(
            UserAccount.id == user_id,
            UserAccount.firm_id == user.firm_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_active = False
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="deleted",
        entity_type="user",
        entity_id=user_id,
        user_id=user.user_id,
        details=f"User deactivated — {target.email}",
    )

    return {"message": f"User {target.email} deactivated"}

# ── Firm Settings ──

class FirmSettingsRequest(BaseModel):
    firmName: str | None = None
    sraNumber: str | None = None
    practiceAreas: list[str] | None = None
    firmSize: str | None = None
    colp: str | None = None
    cofa: str | None = None
    mlro: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None

@router.get("/admin/firm-settings")
async def get_firm_settings(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get the current firm's profile settings."""
    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    import json as _json
    practice_areas = []
    if firm.practice_areas:
        try:
            practice_areas = _json.loads(firm.practice_areas)
        except (ValueError, TypeError):
            practice_areas = [firm.practice_areas] if firm.practice_areas else []

    return {
        "firmName": firm.name,
        "sraNumber": firm.sra_number,
        "practiceAreas": practice_areas,
        "firmSize": str(firm.firm_size) if firm.firm_size else "",
        "colp": firm.colp_name or "",
        "cofa": firm.cofa_name or "",
        "mlro": firm.mlro_name or "",
        "address": firm.address or "",
        "phone": firm.phone or "",
        "email": firm.email or "",
        "website": firm.website or "",
    }

@router.put("/admin/firm-settings")
async def update_firm_settings(
    req: FirmSettingsRequest,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update the current firm's profile settings. Requires admin role."""
    user.require_role("admin")

    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    import json as _json

    if req.firmName is not None:
        firm.name = req.firmName
    if req.sraNumber is not None:
        firm.sra_number = req.sraNumber
    if req.practiceAreas is not None:
        firm.practice_areas = _json.dumps(req.practiceAreas)
    if req.firmSize is not None:
        size_map = {"1-10": 10, "11-25": 25, "26-50": 50, "50-100": 100, "100+": 150}
        firm.firm_size = size_map.get(req.firmSize, int(req.firmSize) if req.firmSize.isdigit() else 1)
    if req.colp is not None:
        firm.colp_name = req.colp
    if req.cofa is not None:
        firm.cofa_name = req.cofa
    if req.mlro is not None:
        firm.mlro_name = req.mlro
    if req.address is not None:
        firm.address = req.address
    if req.phone is not None:
        firm.phone = req.phone
    if req.email is not None:
        firm.email = req.email
    if req.website is not None:
        firm.website = req.website

    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="updated",
        entity_type="firm",
        entity_id=user.firm_id,
        user_id=user.user_id,
        details="Firm settings updated",
    )

    return {"message": "Firm settings updated successfully"}

# ── Notification Preferences ──

@router.get("/admin/notification-preferences")
async def get_notification_preferences(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get the firm's notification preferences."""
    import json as _json

    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    defaults = {
        "complianceAlerts": True,
        "deadlineReminders": True,
        "breachNotifications": True,
        "sraUpdates": True,
        "syncCompletions": False,
        "weeklyDigest": True,
        "staffTrainingDue": True,
        "undertakingsDue": True,
        "complaintUpdates": True,
        "emailFrequency": "realtime",
        "quietHoursEnabled": False,
        "quietHoursStart": "20:00",
        "quietHoursEnd": "08:00",
    }

    if firm.notification_preferences:
        try:
            stored = _json.loads(firm.notification_preferences)
            defaults.update(stored)
        except Exception:
            pass

    return defaults

@router.put("/admin/notification-preferences")
async def update_notification_preferences(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update the firm's notification preferences. Requires admin role."""
    import json as _json

    user.require_role("admin")

    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    body = await request.json()
    firm.notification_preferences = _json.dumps(body)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="updated",
        entity_type="notification_preferences",
        entity_id=user.firm_id,
        user_id=user.user_id,
        details="Notification preferences updated",
    )

    return {"message": "Notification preferences saved"}

# ── Firm Preferences (timezone, auto-chase, retention, display) ──

@router.get("/admin/preferences")
async def get_preferences(
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Get the firm's operational preferences."""
    import json as _json

    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    defaults = {
        "timezone": "Europe/London",
        "dateFormat": "DD/MM/YYYY",
        "workingHoursStart": "09:00",
        "workingHoursEnd": "17:30",
        "workingDays": ["Mon", "Tue", "Wed", "Thu", "Fri"],
        "autoChaseEnabled": True,
        "autoChaseFrequencyDays": 7,
        "autoChaseMaxAttempts": 3,
        "autoChaseChannel": "email",
        "auditRetentionYears": 6,
        "documentRetentionYears": 6,
        "closedMatterRetentionYears": 6,
        "defaultDashboardView": "overview",
        "showCompletedItems": False,
        "itemsPerPage": 25,
    }

    if firm.firm_preferences:
        try:
            stored = _json.loads(firm.firm_preferences)
            defaults.update(stored)
        except Exception:
            pass

    return defaults

@router.put("/admin/preferences")
async def update_preferences(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(tenant_db_from_jwt),
):
    """Update the firm's operational preferences. Requires admin role."""
    import json as _json

    user.require_role("admin")

    result = await db.execute(select(Firm).where(Firm.id == user.firm_id))
    firm = result.scalar_one_or_none()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found")

    body = await request.json()

    # Validate retention periods — warn but don't block
    audit_years = body.get("auditRetentionYears", 6)
    if isinstance(audit_years, int) and 0 < audit_years < 6:
        logger.warning(
            f"Firm {user.firm_id} set audit retention to {audit_years} years (below SRA 6-year minimum)"
        )

    firm.firm_preferences = _json.dumps(body)
    await db.flush()

    await log_audit(
        db=db,
        firm_id=user.firm_id,
        action="updated",
        entity_type="firm_preferences",
        entity_id=user.firm_id,
        user_id=user.user_id,
        details="Firm preferences updated",
    )

    return {"message": "Preferences saved"}
