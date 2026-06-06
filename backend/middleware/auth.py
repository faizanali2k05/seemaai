"""Authentication middleware — JWT tokens, password hashing, CurrentUser."""
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
import bcrypt
from fastapi import HTTPException, status, Request
from config import get_settings

settings = get_settings()

# Role hierarchy (higher index = higher privilege)
ROLE_HIERARCHY = {
    "staff": 0,
    "solicitor": 1,
    "admin": 2,
    "partner": 3,
    "colp": 4,
}


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_access_token(user_id: str, firm_id: str, role: str) -> str:
    """Create a JWT access token (expires in 15 minutes)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": user_id,
        "firm_id": firm_id,
        "role": role,
        "type": "access",
        "iat": now,
        "exp": expire,
    }

    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token


def create_refresh_token(user_id: str, firm_id: str) -> str:
    """Create a JWT refresh token (expires in 7 days)."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    payload = {
        "sub": user_id,
        "firm_id": firm_id,
        "type": "refresh",
        "iat": now,
        "exp": expire,
    }

    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token


def decode_token(token: str) -> dict:
    """Decode a JWT token and return the payload."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


class CurrentUser:
    """Represents the currently authenticated user with role-based access control."""

    def __init__(self, user_id: str, firm_id: str, role: str):
        self.user_id = user_id
        self.firm_id = firm_id
        self.role = role

    def require_role(self, min_role: str) -> None:
        """Check if user has sufficient role privilege.

        Role hierarchy: colp > partner > admin > solicitor > staff
        """
        if min_role not in ROLE_HIERARCHY:
            raise ValueError(f"Unknown role: {min_role}")

        user_level = ROLE_HIERARCHY.get(self.role, -1)
        required_level = ROLE_HIERARCHY.get(min_role, -1)

        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role: {min_role}",
            )

    def has_role(self, role: str) -> bool:
        """Check if user has at least the specified role."""
        try:
            self.require_role(role)
            return True
        except HTTPException:
            return False


async def get_current_user(
    request: Request,
) -> CurrentUser:
    """Dependency to extract and validate the current user from the Bearer token."""
    # Extract Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Parse Bearer token
    try:
        scheme, token = auth_header.split()
        if scheme.lower() != "bearer":
            raise ValueError()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Decode and validate token
    payload = decode_token(token)

    # Ensure it's an access token
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    firm_id = payload.get("firm_id")
    role = payload.get("role", "staff")

    if not user_id or not firm_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return CurrentUser(user_id=user_id, firm_id=firm_id, role=role)
