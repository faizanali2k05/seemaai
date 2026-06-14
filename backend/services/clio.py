"""Clio PMS integration service — OAuth2, API client, data sync engine.

Clio API docs: https://docs.developers.clio.com/api-reference/
Uses Clio API v4 with OAuth2 Authorization Code flow.
"""
import logging
import time
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from models.integrations import Integration, IntegrationSyncLog
from models.matters import Matter
from models.intake import ClientIntake
from models.staff import StaffMember

logger = logging.getLogger(__name__)
settings = get_settings()


# ── OAuth2 ──────────────────────────────────────────────────────────────

CLIO_AUTH_URL = f"{settings.CLIO_API_BASE}/oauth/authorize"
CLIO_TOKEN_URL = f"{settings.CLIO_API_BASE}/oauth/token"
CLIO_DEAUTH_URL = f"{settings.CLIO_API_BASE}/oauth/deauthorize"
# Data-region aware: the API host MUST match the firm's Clio data region (e.g.
# eu.app.clio.com for UK/EU firms). Driven by the same CLIO_API_BASE used for
# OAuth so both stay in the same region. Hardcoding app.clio.com here silently
# breaks sync for EU-resident firms even after a successful OAuth handshake.
CLIO_API_URL = f"{settings.CLIO_API_BASE}/api/{settings.CLIO_API_VERSION}"


def get_clio_auth_url(state: str) -> str:
    """Build the Clio OAuth2 authorization URL.

    Args:
        state: CSRF token (usually firm_id + random nonce, stored in session/Redis)
    """
    params = {
        "response_type": "code",
        "client_id": settings.CLIO_CLIENT_ID,
        "redirect_uri": settings.CLIO_REDIRECT_URI,
        "state": state,
    }
    return f"{CLIO_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> dict:
    """Exchange the OAuth2 authorization code for access + refresh tokens.

    Returns:
        dict with access_token, refresh_token, expires_in, token_type
    """
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            CLIO_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.CLIO_CLIENT_ID,
                "client_secret": settings.CLIO_CLIENT_SECRET,
                "redirect_uri": settings.CLIO_REDIRECT_URI,
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_access_token(refresh_token: str) -> dict:
    """Use a refresh token to get a new access token.

    Returns:
        dict with access_token, refresh_token, expires_in, token_type
    """
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            CLIO_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.CLIO_CLIENT_ID,
                "client_secret": settings.CLIO_CLIENT_SECRET,
            },
        )
        response.raise_for_status()
        return response.json()


async def revoke_token(access_token: str) -> None:
    """Revoke the Clio access token (deauthorize)."""
    async with httpx.AsyncClient(timeout=30) as client:
        await client.post(
            CLIO_DEAUTH_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )


# ── Clio API Client ─────────────────────────────────────────────────────

class ClioClient:
    """Async HTTP client for the Clio API v4.

    Handles automatic token refresh when the access token expires.
    """

    def __init__(self, integration: Integration, db: AsyncSession):
        self.integration = integration
        self.db = db
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        await self._ensure_valid_token()
        self._client = httpx.AsyncClient(
            base_url=CLIO_API_URL,
            headers={
                "Authorization": f"Bearer {self.integration.access_token}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        return self

    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()

    async def _ensure_valid_token(self):
        """Refresh the access token if it's expired or about to expire."""
        if not self.integration.token_expires_at:
            return
        if self.integration.token_expires_at > datetime.utcnow() + timedelta(minutes=5):
            return

        logger.info(f"Refreshing Clio token for firm {self.integration.firm_id}")
        try:
            tokens = await refresh_access_token(self.integration.refresh_token)
            self.integration.access_token = tokens["access_token"]
            self.integration.refresh_token = tokens.get("refresh_token", self.integration.refresh_token)
            self.integration.token_expires_at = datetime.utcnow() + timedelta(seconds=tokens["expires_in"])
            await self.db.execute(
                update(Integration)
                .where(Integration.id == self.integration.id)
                .values(
                    access_token=tokens["access_token"],
                    refresh_token=tokens.get("refresh_token", self.integration.refresh_token),
                    token_expires_at=self.integration.token_expires_at,
                )
            )
            await self.db.commit()
        except Exception as e:
            logger.error(f"Token refresh failed: {e}")
            await self.db.execute(
                update(Integration)
                .where(Integration.id == self.integration.id)
                .values(status="error", last_error=f"Token refresh failed: {e}")
            )
            await self.db.commit()
            raise

    async def get(self, endpoint: str, params: dict = None) -> dict:
        """GET request to Clio API. Handles pagination automatically."""
        response = await self._client.get(endpoint, params=params)
        response.raise_for_status()
        return response.json()

    async def get_all_pages(self, endpoint: str, params: dict = None) -> list:
        """Fetch all pages of a paginated Clio API endpoint.

        Clio uses cursor-based pagination with a 'paging' key in responses.
        """
        params = params or {}
        params.setdefault("limit", 200)
        all_items = []

        while True:
            data = await self.get(endpoint, params)
            items = data.get("data", [])
            all_items.extend(items)

            paging = data.get("meta", {}).get("paging", {})
            next_url = paging.get("next")
            if not next_url or not items:
                break

            # Clio returns full URL for next page — extract just the path + query
            if next_url.startswith("http"):
                from urllib.parse import urlparse, parse_qs
                parsed = urlparse(next_url)
                endpoint = parsed.path.replace(f"/api/{settings.CLIO_API_VERSION}", "")
                params = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            else:
                break

        return all_items

    async def get_who_am_i(self) -> dict:
        """Get the authenticated user's info from Clio."""
        data = await self.get("/users/who_am_i.json", {"fields": "id,name,email,account"})
        return data.get("data", {})


# ── Sync Engine ──────────────────────────────────────────────────────────

class ClioSyncEngine:
    """Orchestrates data synchronization between Clio and Seema.

    Pulls matters, contacts, staff, activities, and billing data from Clio
    and maps them to Seema's internal models.
    """

    def __init__(self, client: ClioClient, firm_id: str, db: AsyncSession):
        self.client = client
        self.firm_id = firm_id
        self.db = db

    async def sync(self, sync_type: str = "full", integration_id: str = None) -> IntegrationSyncLog:
        """Run a sync operation.

        Args:
            sync_type: One of: full, matters, contacts, staff, activities, billing
            integration_id: The Integration record ID for logging

        Returns:
            IntegrationSyncLog with results
        """
        sync_log = IntegrationSyncLog(
            firm_id=self.firm_id,
            integration_id=integration_id,
            sync_type=sync_type,
            status="running",
            started_at=datetime.utcnow(),
        )
        self.db.add(sync_log)
        await self.db.commit()
        await self.db.refresh(sync_log)

        start_time = time.time()
        total_created = 0
        total_updated = 0
        total_synced = 0
        total_errored = 0

        try:
            sync_methods = {
                "full": ["matters", "contacts", "staff"],
                "matters": ["matters"],
                "contacts": ["contacts"],
                "staff": ["staff"],
            }
            entities = sync_methods.get(sync_type, ["matters", "contacts", "staff"])

            for entity in entities:
                method = getattr(self, f"_sync_{entity}", None)
                if method:
                    result = await method()
                    total_created += result.get("created", 0)
                    total_updated += result.get("updated", 0)
                    total_synced += result.get("synced", 0)
                    total_errored += result.get("errored", 0)

            duration = int(time.time() - start_time)
            sync_log.status = "completed"
            sync_log.records_synced = total_synced
            sync_log.records_created = total_created
            sync_log.records_updated = total_updated
            sync_log.records_errored = total_errored
            sync_log.completed_at = datetime.utcnow()
            sync_log.duration_seconds = duration
            await self.db.commit()

            logger.info(
                f"Clio sync complete for firm {self.firm_id}: "
                f"{total_synced} synced, {total_created} created, "
                f"{total_updated} updated, {total_errored} errors, "
                f"{duration}s"
            )
            return sync_log

        except Exception as e:
            duration = int(time.time() - start_time)
            sync_log.status = "failed"
            sync_log.error_message = str(e)
            sync_log.completed_at = datetime.utcnow()
            sync_log.duration_seconds = duration
            await self.db.commit()
            logger.error(f"Clio sync failed for firm {self.firm_id}: {e}")
            raise

    async def _sync_matters(self) -> dict:
        """Pull matters from Clio and upsert into Seema's Matter table."""
        logger.info(f"Syncing matters for firm {self.firm_id}")
        created = updated = errored = 0

        try:
            clio_matters = await self.client.get_all_pages(
                "/matters.json",
                {
                    # Clio v4: nested associations (client, practice_area) must
                    # use brace syntax to return a structured object.
                    "fields": "id,display_number,description,status,practice_area{name},client{id,name},open_date,close_date",
                    "status": "Open,Pending",
                    "order": "id(asc)",
                },
            )

            for cm in clio_matters:
                try:
                    clio_id = str(cm.get("id"))
                    result = await self.db.execute(
                        select(Matter).where(
                            Matter.firm_id == self.firm_id,
                            Matter.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()

                    matter_data = {
                        "firm_id": self.firm_id,
                        "external_ref": clio_id,
                        "title": cm.get("display_number") or cm.get("description", "Untitled"),
                        "description": cm.get("description"),
                        "status": (cm.get("status") or "open").lower(),
                        "practice_area": (cm.get("practice_area") or {}).get("name"),
                        "client_id": str(cm["client"]["id"]) if cm.get("client") else None,
                        "open_date": cm.get("open_date"),
                        "close_date": cm.get("close_date"),
                        "source": "clio",
                    }

                    if existing:
                        for key, val in matter_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        updated += 1
                    else:
                        self.db.add(Matter(**matter_data))
                        created += 1
                except Exception as e:
                    logger.warning(f"Failed to sync matter {cm.get('id')}: {e}")
                    errored += 1

            await self.db.commit()
        except Exception as e:
            logger.error(f"Matters sync failed: {e}")
            raise

        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}

    async def _sync_contacts(self) -> dict:
        """Pull contacts from Clio and upsert into Seema's ClientIntake table."""
        logger.info(f"Syncing contacts for firm {self.firm_id}")
        created = updated = errored = 0

        try:
            clio_contacts = await self.client.get_all_pages(
                "/contacts.json",
                {
                    # Clio v4: nested associations need brace syntax. The `type`
                    # filter accepts ONE value only — omit it to fetch both
                    # People and Companies (type is read per-contact below).
                    # (The old `type=Person,Company` + flat fields returned 422.)
                    "fields": "id,name,first_name,last_name,type,company{name},email_addresses{address},phone_numbers{number}",
                    "order": "id(asc)",
                },
            )

            for cc in clio_contacts:
                try:
                    clio_id = str(cc.get("id"))
                    result = await self.db.execute(
                        select(ClientIntake).where(
                            ClientIntake.firm_id == self.firm_id,
                            ClientIntake.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()

                    # Extract primary email and phone
                    emails = cc.get("email_addresses") or []
                    phones = cc.get("phone_numbers") or []
                    primary_email = emails[0].get("address") if emails else None
                    primary_phone = phones[0].get("number") if phones else None

                    contact_data = {
                        "firm_id": self.firm_id,
                        "external_ref": clio_id,
                        "client_name": cc.get("name") or f"{cc.get('first_name', '')} {cc.get('last_name', '')}".strip(),
                        "client_email": primary_email,
                        "client_phone": primary_phone,
                        "client_type": (cc.get("type") or "individual").lower(),
                        "company_name": (cc.get("company") or {}).get("name") if isinstance(cc.get("company"), dict) else None,
                        "source": "clio",
                        "status": "active",
                    }

                    if existing:
                        for key, val in contact_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        updated += 1
                    else:
                        self.db.add(ClientIntake(**contact_data))
                        created += 1
                except Exception as e:
                    logger.warning(f"Failed to sync contact {cc.get('id')}: {e}")
                    errored += 1

            await self.db.commit()
        except Exception as e:
            logger.error(f"Contacts sync failed: {e}")
            raise

        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}

    async def _sync_staff(self) -> dict:
        """Pull users from Clio and upsert into Seema's StaffMember table."""
        logger.info(f"Syncing staff for firm {self.firm_id}")
        created = updated = errored = 0

        try:
            clio_users = await self.client.get_all_pages(
                "/users.json",
                {
                    # `role` is not a valid Clio user field (returned 400) —
                    # removed. Role/permissions aren't exposed on /users.
                    "fields": "id,name,first_name,last_name,email,enabled",
                    "order": "id(asc)",
                },
            )

            for cu in clio_users:
                try:
                    clio_id = str(cu.get("id"))
                    result = await self.db.execute(
                        select(StaffMember).where(
                            StaffMember.firm_id == self.firm_id,
                            StaffMember.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()

                    staff_data = {
                        "firm_id": self.firm_id,
                        "external_ref": clio_id,
                        "name": cu.get("name") or f"{cu.get('first_name', '')} {cu.get('last_name', '')}".strip(),
                        "email": cu.get("email"),
                        "role": cu.get("role"),
                        "status": "active" if cu.get("enabled", True) else "inactive",
                        "source": "clio",
                    }

                    if existing:
                        for key, val in staff_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        updated += 1
                    else:
                        self.db.add(StaffMember(**staff_data))
                        created += 1
                except Exception as e:
                    logger.warning(f"Failed to sync user {cu.get('id')}: {e}")
                    errored += 1

            await self.db.commit()
        except Exception as e:
            logger.error(f"Staff sync failed: {e}")
            raise

        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}


# ── Convenience functions ────────────────────────────────────────────────

async def get_firm_integration(db: AsyncSession, firm_id: str, provider: str = "clio") -> Optional[Integration]:
    """Get the active integration for a firm, or None."""
    result = await db.execute(
        select(Integration).where(
            Integration.firm_id == firm_id,
            Integration.provider == provider,
        )
    )
    return result.scalar_one_or_none()


async def connect_clio(db: AsyncSession, firm_id: str, code: str) -> Integration:
    """Complete the OAuth flow: exchange code for tokens, fetch user info, save integration."""
    tokens = await exchange_code_for_tokens(code)

    # Create or update integration record
    integration = await get_firm_integration(db, firm_id)
    if not integration:
        integration = Integration(firm_id=firm_id, provider="clio")
        db.add(integration)

    integration.access_token = tokens["access_token"]
    integration.refresh_token = tokens.get("refresh_token")
    integration.token_expires_at = datetime.utcnow() + timedelta(seconds=tokens.get("expires_in", 3600))
    integration.token_scope = tokens.get("scope")
    integration.status = "connected"
    integration.connected_at = datetime.utcnow()
    integration.last_error = None
    await db.commit()
    await db.refresh(integration)

    # Fetch user info from Clio to populate provider details
    try:
        async with ClioClient(integration, db) as client:
            user_info = await client.get_who_am_i()
            integration.provider_user_name = user_info.get("name")
            integration.provider_user_id = str(user_info.get("id", ""))
            account = user_info.get("account", {})
            if isinstance(account, dict):
                integration.provider_firm_name = account.get("name")
                integration.provider_account_id = str(account.get("id", ""))
            await db.commit()
    except Exception as e:
        logger.warning(f"Could not fetch Clio user info: {e}")

    return integration


async def disconnect_clio(db: AsyncSession, firm_id: str) -> None:
    """Revoke tokens and mark integration as disconnected."""
    integration = await get_firm_integration(db, firm_id)
    if not integration:
        return

    if integration.access_token:
        try:
            await revoke_token(integration.access_token)
        except Exception as e:
            logger.warning(f"Token revocation failed (continuing anyway): {e}")

    integration.status = "disconnected"
    integration.access_token = None
    integration.refresh_token = None
    integration.token_expires_at = None
    integration.disconnected_at = datetime.utcnow()
    await db.commit()


async def run_clio_sync(db: AsyncSession, firm_id: str, sync_type: str = "full") -> IntegrationSyncLog:
    """Run a sync from Clio for a given firm.

    Args:
        db: Async database session
        firm_id: The firm to sync for
        sync_type: full, matters, contacts, staff

    Returns:
        IntegrationSyncLog with sync results
    """
    integration = await get_firm_integration(db, firm_id)
    if not integration or integration.status != "connected":
        raise ValueError("Clio is not connected for this firm")

    # The sync performs MANY commits (OAuth token refresh + one per entity).
    # Tenant RLS is enforced by a *transaction-local* GUC (app.current_firm_id)
    # that Postgres clears on every COMMIT. On the request's tenant session the
    # firm scope is therefore lost after the first commit, and RLS then blocks
    # every subsequent query — surfacing as "Could not refresh instance
    # '<IntegrationSyncLog ...>'". Run the whole sync on a BYPASSRLS admin
    # session instead; every sync query is already explicitly scoped by firm_id,
    # so bypassing RLS here is safe.
    from middleware.tenant_rls import admin_session

    if admin_session is None:
        async with ClioClient(integration, db) as client:
            engine = ClioSyncEngine(client, firm_id, db)
            return await engine.sync(sync_type, integration_id=integration.id)

    async with admin_session() as adb:
        integ = await get_firm_integration(adb, firm_id)
        async with ClioClient(integ, adb) as client:
            engine = ClioSyncEngine(client, firm_id, adb)
            return await engine.sync(sync_type, integration_id=integ.id)


async def get_sync_history(db: AsyncSession, firm_id: str, limit: int = 20) -> list[IntegrationSyncLog]:
    """Get recent sync logs for a firm."""
    result = await db.execute(
        select(IntegrationSyncLog)
        .where(IntegrationSyncLog.firm_id == firm_id)
        .order_by(IntegrationSyncLog.started_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_sync_stats(db: AsyncSession, firm_id: str) -> dict:
    """Aggregate sync statistics for a firm."""
    logs = await get_sync_history(db, firm_id, limit=100)
    completed = [l for l in logs if l.status == "completed"]
    return {
        "total_syncs": len(completed),
        "total_records_synced": sum(l.records_synced or 0 for l in completed),
        "total_created": sum(l.records_created or 0 for l in completed),
        "total_updated": sum(l.records_updated or 0 for l in completed),
    }
