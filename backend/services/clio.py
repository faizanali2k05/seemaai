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
from models.client_accounts import ClientAccount, Transaction
from models.workflow import Deadline
from models.clio_data import ClioActivity, ClioBill

logger = logging.getLogger(__name__)
settings = get_settings()


def _fit(value, maxlen):
    """Coerce to a trimmed str and cap to a column width; None/empty -> None.

    Clio free-text fields can exceed our column limits (e.g. a phone field
    holding "44 ... (applicant) - 44 ... (James Hindmarch)"); truncating keeps
    the sync from aborting the whole batch on one oversized value.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s[:maxlen]


def _parse_dt(value):
    """Parse a Clio ISO-8601 date/datetime string to a naive datetime, or None."""
    if not value:
        return None
    try:
        s = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        # Store naive UTC (the schema columns are timezone-naive).
        if dt.tzinfo is not None:
            dt = dt.astimezone(tz=None).replace(tzinfo=None)
        return dt
    except Exception:
        return None


def _num(value):
    """Coerce a Clio numeric/string money value to float, or None."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fit(value, maxlen: int):
    """Coerce to a trimmed string and cap to a column width; empty -> None.

    Clio free-text fields can exceed our VARCHAR limits (e.g. a phone field
    holding "44 7733384030 (applicant) - 44 7938243059 (James Hindmarch)").
    Capping here keeps one oversized value from aborting the whole sync with
    a StringDataRightTruncationError.
    """
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s[:maxlen]


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
            # A full sync pulls everything available for the firm. bank_accounts
            # MUST precede bank_transactions (transactions link to the synced
            # accounts). Each entity also has its own sync_type for targeted runs.
            full = [
                "matters", "contacts", "staff",
                "bank_accounts", "bank_transactions",
                "calendar", "activities", "bills",
            ]
            sync_methods = {
                "full": full,
                "matters": ["matters"],
                "contacts": ["contacts"],
                "staff": ["staff"],
                "bank_accounts": ["bank_accounts"],
                "bank_transactions": ["bank_accounts", "bank_transactions"],
                "calendar": ["calendar"],
                "activities": ["activities"],
                "bills": ["bills"],
                "financials": ["bank_accounts", "bank_transactions", "bills"],
            }
            entities = sync_methods.get(sync_type, full)

            for entity in entities:
                method = getattr(self, f"_sync_{entity}", None)
                if not method:
                    continue
                # Isolate each entity: a failing endpoint (e.g. a Clio plan that
                # doesn't expose bills) must not abort the entities that follow.
                try:
                    result = await method()
                    total_created += result.get("created", 0)
                    total_updated += result.get("updated", 0)
                    total_synced += result.get("synced", 0)
                    total_errored += result.get("errored", 0)
                except Exception as e:
                    logger.error(f"Entity '{entity}' sync failed for firm {self.firm_id}: {e}")
                    total_errored += 1
                    # Roll back any partial state so the next entity starts clean.
                    try:
                        await self.db.rollback()
                    except Exception:
                        pass

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
                clio_id = str(cm.get("id"))
                try:
                    practice_area = (cm.get("practice_area") or {}).get("name")
                    matter_data = {
                        "firm_id": self.firm_id,
                        "external_ref": _fit(clio_id, 100),
                        "title": _fit(cm.get("display_number") or cm.get("description") or "Untitled", 255),
                        # The app (File Review, dashboard) reads reference / matter_type /
                        # client_name — populate them from Clio so synced matters render.
                        "reference": _fit(cm.get("display_number"), 100),
                        "matter_type": _fit(practice_area, 100),
                        "client_name": _fit((cm.get("client") or {}).get("name"), 255),
                        "description": cm.get("description"),
                        "status": _fit((cm.get("status") or "open").lower(), 20),
                        "practice_area": _fit(practice_area, 100),
                        "client_id": _fit(str(cm["client"]["id"]) if cm.get("client") else None, 36),
                        "open_date": _fit(cm.get("open_date"), 20),
                        "close_date": _fit(cm.get("close_date"), 20),
                        "source": "clio",
                    }

                    # One SAVEPOINT per row: a single bad row (oversized field,
                    # constraint clash) rolls back only itself instead of
                    # poisoning the whole sync transaction.
                    async with self.db.begin_nested():
                        result = await self.db.execute(
                            select(Matter).where(
                                Matter.firm_id == self.firm_id,
                                Matter.external_ref == clio_id,
                            )
                        )
                        existing = result.scalar_one_or_none()
                        if existing:
                            for key, val in matter_data.items():
                                if key != "firm_id":
                                    setattr(existing, key, val)
                            was_update = True
                        else:
                            self.db.add(Matter(**matter_data))
                            was_update = False
                        await self.db.flush()
                    if was_update:
                        updated += 1
                    else:
                        created += 1
                except Exception as e:
                    logger.warning(f"Failed to sync matter {clio_id}: {e}")
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
                clio_id = str(cc.get("id"))
                try:
                    # Extract primary email and phone
                    emails = cc.get("email_addresses") or []
                    phones = cc.get("phone_numbers") or []
                    primary_email = emails[0].get("address") if emails else None
                    primary_phone = phones[0].get("number") if phones else None
                    company = cc.get("company") if isinstance(cc.get("company"), dict) else None

                    contact_data = {
                        "firm_id": self.firm_id,
                        "external_ref": _fit(clio_id, 100),
                        "client_name": _fit(cc.get("name") or f"{cc.get('first_name', '')} {cc.get('last_name', '')}".strip(), 255),
                        "client_email": _fit(primary_email, 255),
                        "client_phone": _fit(primary_phone, 255),
                        "client_type": _fit((cc.get("type") or "individual").lower(), 50),
                        "company_name": _fit((company or {}).get("name"), 255),
                        "source": "clio",
                        "status": "active",
                    }

                    # One SAVEPOINT per row: a single bad row (oversized field,
                    # constraint clash) rolls back only itself instead of
                    # poisoning the whole sync transaction.
                    async with self.db.begin_nested():
                        result = await self.db.execute(
                            select(ClientIntake).where(
                                ClientIntake.firm_id == self.firm_id,
                                ClientIntake.external_ref == clio_id,
                            )
                        )
                        existing = result.scalar_one_or_none()
                        if existing:
                            for key, val in contact_data.items():
                                if key != "firm_id":
                                    setattr(existing, key, val)
                            was_update = True
                        else:
                            self.db.add(ClientIntake(**contact_data))
                            was_update = False
                        await self.db.flush()
                    if was_update:
                        updated += 1
                    else:
                        created += 1
                except Exception as e:
                    logger.warning(f"Failed to sync contact {clio_id}: {e}")
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
                clio_id = str(cu.get("id"))
                try:
                    staff_data = {
                        "firm_id": self.firm_id,
                        "external_ref": _fit(clio_id, 100),
                        "name": _fit(cu.get("name") or f"{cu.get('first_name', '')} {cu.get('last_name', '')}".strip(), 255),
                        "email": _fit(cu.get("email"), 255),
                        "role": _fit(cu.get("role"), 100),
                        "status": "active" if cu.get("enabled", True) else "inactive",
                        "source": "clio",
                    }

                    # One SAVEPOINT per row: a single bad row (oversized field,
                    # constraint clash) rolls back only itself instead of
                    # poisoning the whole sync transaction.
                    async with self.db.begin_nested():
                        result = await self.db.execute(
                            select(StaffMember).where(
                                StaffMember.firm_id == self.firm_id,
                                StaffMember.external_ref == clio_id,
                            )
                        )
                        existing = result.scalar_one_or_none()
                        if existing:
                            for key, val in staff_data.items():
                                if key != "firm_id":
                                    setattr(existing, key, val)
                            was_update = True
                        else:
                            self.db.add(StaffMember(**staff_data))
                            was_update = False
                        await self.db.flush()
                    if was_update:
                        updated += 1
                    else:
                        created += 1
                except Exception as e:
                    logger.warning(f"Failed to sync user {clio_id}: {e}")
                    errored += 1

            await self.db.commit()
        except Exception as e:
            logger.error(f"Staff sync failed: {e}")
            raise

        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}

    async def _sync_bank_accounts(self) -> dict:
        """Pull Clio bank accounts (Operating/Trust) into Seema's ClientAccount table."""
        logger.info(f"Syncing bank accounts for firm {self.firm_id}")
        created = updated = errored = 0

        clio_accounts = await self.client.get_all_pages(
            "/bank_accounts.json",
            {"fields": "id,name,type,account_number,balance", "order": "id(asc)"},
        )

        for ba in clio_accounts:
            clio_id = str(ba.get("id"))
            try:
                # Clio type is "Operating" or "Trust"; Seema uses client/office.
                clio_type = (ba.get("type") or "").lower()
                acct_type = "client" if "trust" in clio_type else "office"
                acct_data = {
                    "firm_id": self.firm_id,
                    "external_ref": _fit(clio_id, 100),
                    "account_name": _fit(ba.get("name") or "Clio account", 255),
                    "account_type": acct_type,
                    "balance": _num(ba.get("balance")) or 0,
                    "account_number": _fit(ba.get("account_number"), 50),
                    "status": "active",
                    "source": "clio",
                }
                async with self.db.begin_nested():
                    result = await self.db.execute(
                        select(ClientAccount).where(
                            ClientAccount.firm_id == self.firm_id,
                            ClientAccount.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        for key, val in acct_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        was_update = True
                    else:
                        self.db.add(ClientAccount(**acct_data))
                        was_update = False
                    await self.db.flush()
                if was_update:
                    updated += 1
                else:
                    created += 1
            except Exception as e:
                logger.warning(f"Failed to sync bank account {clio_id}: {e}")
                errored += 1

        await self.db.commit()
        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}

    async def _sync_bank_transactions(self) -> dict:
        """Pull Clio bank transactions into Seema's Transaction table (client-money ledger)."""
        logger.info(f"Syncing bank transactions for firm {self.firm_id}")
        created = updated = errored = 0

        # Map Clio bank_account id -> Seema ClientAccount.id so transactions link.
        acct_rows = await self.db.execute(
            select(ClientAccount.id, ClientAccount.external_ref).where(
                ClientAccount.firm_id == self.firm_id,
                ClientAccount.source == "clio",
            )
        )
        acct_map = {ext: aid for aid, ext in acct_rows.all() if ext}

        clio_txns = await self.client.get_all_pages(
            "/bank_transactions.json",
            {"fields": "id,type,date,amount,description,bank_account{id}", "order": "id(asc)"},
        )

        for tx in clio_txns:
            clio_id = str(tx.get("id"))
            try:
                ba = tx.get("bank_account") or {}
                clio_acct_id = str(ba.get("id")) if ba.get("id") is not None else None
                account_id = acct_map.get(clio_acct_id)
                if not account_id:
                    # No matching Seema account (account sync may have skipped it).
                    errored += 1
                    continue
                clio_type = (tx.get("type") or "").lower()
                tx_type = "debit" if ("withdraw" in clio_type or "debit" in clio_type) else "credit"
                tx_data = {
                    "firm_id": self.firm_id,
                    "external_ref": _fit(clio_id, 100),
                    "account_id": account_id,
                    "date": _parse_dt(tx.get("date")) or datetime.utcnow(),
                    "description": _fit(tx.get("description"), 255),
                    "amount": _num(tx.get("amount")) or 0,
                    "type": tx_type,
                    "source": "clio",
                }
                async with self.db.begin_nested():
                    result = await self.db.execute(
                        select(Transaction).where(
                            Transaction.firm_id == self.firm_id,
                            Transaction.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        for key, val in tx_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        was_update = True
                    else:
                        self.db.add(Transaction(**tx_data))
                        was_update = False
                    await self.db.flush()
                if was_update:
                    updated += 1
                else:
                    created += 1
            except Exception as e:
                logger.warning(f"Failed to sync bank transaction {clio_id}: {e}")
                errored += 1

        await self.db.commit()
        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}

    async def _sync_calendar(self) -> dict:
        """Pull Clio calendar entries into Seema's Deadline table (key dates)."""
        logger.info(f"Syncing calendar entries for firm {self.firm_id}")
        created = updated = errored = 0

        clio_entries = await self.client.get_all_pages(
            "/calendar_entries.json",
            {
                "fields": "id,summary,start_at,all_day,matter{display_number}",
                "order": "id(asc)",
            },
        )

        for ce in clio_entries:
            clio_id = str(ce.get("id"))
            try:
                due = _parse_dt(ce.get("start_at"))
                if due is None:
                    errored += 1
                    continue
                matter = ce.get("matter") or {}
                title = ce.get("summary") or "Clio calendar entry"
                if matter.get("display_number"):
                    title = f"{title} ({matter['display_number']})"
                dl_data = {
                    "firm_id": self.firm_id,
                    "external_ref": _fit(clio_id, 100),
                    "title": _fit(title, 255),
                    "due_date": due,
                    "category": "clio_calendar",
                    "priority": "medium",
                    "status": "pending",
                    "source": "clio",
                }
                async with self.db.begin_nested():
                    result = await self.db.execute(
                        select(Deadline).where(
                            Deadline.firm_id == self.firm_id,
                            Deadline.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        for key, val in dl_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        was_update = True
                    else:
                        self.db.add(Deadline(**dl_data))
                        was_update = False
                    await self.db.flush()
                if was_update:
                    updated += 1
                else:
                    created += 1
            except Exception as e:
                logger.warning(f"Failed to sync calendar entry {clio_id}: {e}")
                errored += 1

        await self.db.commit()
        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}

    async def _sync_activities(self) -> dict:
        """Pull Clio time/expense activities into Seema's ClioActivity table."""
        logger.info(f"Syncing activities for firm {self.firm_id}")
        created = updated = errored = 0

        clio_acts = await self.client.get_all_pages(
            "/activities.json",
            {
                "fields": "id,type,date,quantity,total,note,matter{id,display_number},user{name}",
                "order": "id(asc)",
            },
        )

        for act in clio_acts:
            clio_id = str(act.get("id"))
            try:
                matter = act.get("matter") or {}
                user = act.get("user") or {}
                act_data = {
                    "firm_id": self.firm_id,
                    "external_ref": _fit(clio_id, 100),
                    "activity_type": _fit(act.get("type"), 50),
                    "date": _parse_dt(act.get("date")),
                    "quantity": _num(act.get("quantity")),
                    "total": _num(act.get("total")),
                    "note": act.get("note"),
                    "matter_ref": _fit(matter.get("display_number"), 100),
                    "matter_external_ref": _fit(str(matter.get("id")) if matter.get("id") is not None else None, 100),
                    "user_name": _fit(user.get("name"), 255),
                    "source": "clio",
                }
                async with self.db.begin_nested():
                    result = await self.db.execute(
                        select(ClioActivity).where(
                            ClioActivity.firm_id == self.firm_id,
                            ClioActivity.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        for key, val in act_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        was_update = True
                    else:
                        self.db.add(ClioActivity(**act_data))
                        was_update = False
                    await self.db.flush()
                if was_update:
                    updated += 1
                else:
                    created += 1
            except Exception as e:
                logger.warning(f"Failed to sync activity {clio_id}: {e}")
                errored += 1

        await self.db.commit()
        return {"synced": created + updated, "created": created, "updated": updated, "errored": errored}

    async def _sync_bills(self) -> dict:
        """Pull Clio bills/invoices into Seema's ClioBill table."""
        logger.info(f"Syncing bills for firm {self.firm_id}")
        created = updated = errored = 0

        clio_bills = await self.client.get_all_pages(
            "/bills.json",
            {
                "fields": "id,number,state,total,balance,issued_at,due_at,client{name}",
                "order": "id(asc)",
            },
        )

        for bill in clio_bills:
            clio_id = str(bill.get("id"))
            try:
                client = bill.get("client") or {}
                bill_data = {
                    "firm_id": self.firm_id,
                    "external_ref": _fit(clio_id, 100),
                    "number": _fit(bill.get("number"), 100),
                    "state": _fit(bill.get("state"), 50),
                    "total": _num(bill.get("total")),
                    "balance": _num(bill.get("balance")),
                    "issued_at": _parse_dt(bill.get("issued_at")),
                    "due_at": _parse_dt(bill.get("due_at")),
                    "client_name": _fit(client.get("name"), 255),
                    "source": "clio",
                }
                async with self.db.begin_nested():
                    result = await self.db.execute(
                        select(ClioBill).where(
                            ClioBill.firm_id == self.firm_id,
                            ClioBill.external_ref == clio_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        for key, val in bill_data.items():
                            if key != "firm_id":
                                setattr(existing, key, val)
                        was_update = True
                    else:
                        self.db.add(ClioBill(**bill_data))
                        was_update = False
                    await self.db.flush()
                if was_update:
                    updated += 1
                else:
                    created += 1
            except Exception as e:
                logger.warning(f"Failed to sync bill {clio_id}: {e}")
                errored += 1

        await self.db.commit()
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
