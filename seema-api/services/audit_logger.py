"""Audit logging service — logs all compliance-relevant actions."""
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession


logger = logging.getLogger(__name__)


async def log_audit(
    db: AsyncSession,
    firm_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    user_id: str,
    details: str = "",
    ip_address: Optional[str] = None,
) -> None:
    """Log an audit event for compliance tracking.

    Args:
        db: Database session
        firm_id: The firm performing the action (tenant scoping)
        action: Action type (e.g., "login", "created", "updated", "deleted")
        entity_type: Type of entity affected (e.g., "user", "matter", "document")
        entity_id: ID of the entity affected
        user_id: ID of the user performing the action
        details: Optional details about the action
        ip_address: Optional IP address of the user

    Example:
        await log_audit(
            db=db,
            firm_id="firm-123",
            action="login",
            entity_type="user",
            entity_id="user-456",
            user_id="user-456",
            ip_address="192.168.1.1"
        )
    """
    try:
        from models.audit import AuditLog

        audit_log = AuditLog(
            firm_id=firm_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            user_id=user_id,
            details=details,
            ip_address=ip_address,
        )

        db.add(audit_log)

        # Flush to ensure the log is written (don't commit — let the caller handle that)
        await db.flush()

        logger.info(
            f"Audit: {action} on {entity_type}#{entity_id} by {user_id} in firm {firm_id}"
        )

    except Exception as e:
        logger.error(
            f"Failed to log audit: {e}. "
            f"Action: {action}, Entity: {entity_type}#{entity_id}, User: {user_id}"
        )
        # Don't raise — audit failures shouldn't block operations
        pass
