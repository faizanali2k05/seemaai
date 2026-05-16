"""Celery tasks for Clio PMS integration — periodic sync of matters, contacts, and staff."""
import asyncio
import logging
from datetime import datetime

from celery_app import celery_app
# `async_session` is the AsyncSession factory exported by database.py. We use
# it as a context-manager via `async with async_session() as db:`.
from database import async_session
from services.clio import run_clio_sync, get_sync_stats

logger = logging.getLogger(__name__)


async def _sync_all_connected_firms(sync_type: str = "full"):
    """Find all firms with an active Clio connection and sync each one.

    Runs as a standalone async function so it can be called from the
    synchronous Celery task wrapper via asyncio.run().
    """
    from sqlalchemy import select
    from models.integrations import FirmIntegration

    async with async_session() as db:
        # Get all firms with active Clio connections
        result = await db.execute(
            select(FirmIntegration).where(
                FirmIntegration.provider == "clio",
                FirmIntegration.status == "connected",
            )
        )
        integrations = result.scalars().all()

        if not integrations:
            logger.info("No connected Clio integrations found — skipping sync")
            return {"synced": 0, "firms": []}

        results = []
        for integration in integrations:
            firm_id = str(integration.firm_id)
            try:
                sync_log = await run_clio_sync(db, firm_id, sync_type=sync_type)
                results.append({
                    "firm_id": firm_id,
                    "status": "success",
                    "matters": sync_log.matters_synced or 0,
                    "contacts": sync_log.contacts_synced or 0,
                    "staff": sync_log.staff_synced or 0,
                })
                logger.info(
                    "Clio sync completed for firm %s: %d matters, %d contacts, %d staff",
                    firm_id,
                    sync_log.matters_synced or 0,
                    sync_log.contacts_synced or 0,
                    sync_log.staff_synced or 0,
                )
            except Exception as e:
                results.append({
                    "firm_id": firm_id,
                    "status": "error",
                    "error": str(e),
                })
                logger.error("Clio sync failed for firm %s: %s", firm_id, e)

        return {
            "synced": len([r for r in results if r["status"] == "success"]),
            "failed": len([r for r in results if r["status"] == "error"]),
            "firms": results,
        }


async def _sync_single_firm(firm_id: str, sync_type: str = "full"):
    """Sync a single firm's Clio data."""
    async with async_session() as db:
        sync_log = await run_clio_sync(db, firm_id, sync_type=sync_type)
        return {
            "firm_id": firm_id,
            "status": "success",
            "matters": sync_log.matters_synced or 0,
            "contacts": sync_log.contacts_synced or 0,
            "staff": sync_log.staff_synced or 0,
        }


# ── Periodic task: sync ALL connected firms ──────────────────────────────

@celery_app.task(bind=True, max_retries=2, default_retry_delay=300)
def sync_all_clio_firms(self):
    """Sync matters, contacts, and staff from Clio for every connected firm.

    Scheduled to run every 8 hours via celery beat.
    Retries up to 2 times with 5 minute delay on failure.
    """
    try:
        logger.info("Starting scheduled Clio sync for all connected firms")
        result = asyncio.run(_sync_all_connected_firms(sync_type="full"))
        logger.info(
            "Scheduled Clio sync complete: %d succeeded, %d failed",
            result.get("synced", 0),
            result.get("failed", 0),
        )
        return result
    except Exception as exc:
        logger.error("Scheduled Clio sync failed: %s", exc)
        raise self.retry(exc=exc)


# ── On-demand task: sync a single firm ───────────────────────────────────

@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def sync_clio_firm(self, firm_id: str, sync_type: str = "full"):
    """Sync Clio data for a specific firm. Called on-demand from the UI.

    Args:
        firm_id: UUID of the firm to sync
        sync_type: full | matters | contacts | staff
    """
    try:
        logger.info("Starting on-demand Clio sync for firm %s (type=%s)", firm_id, sync_type)
        result = asyncio.run(_sync_single_firm(firm_id, sync_type))
        logger.info(
            "On-demand Clio sync for firm %s complete: %d matters, %d contacts, %d staff",
            firm_id,
            result.get("matters", 0),
            result.get("contacts", 0),
            result.get("staff", 0),
        )
        return result
    except Exception as exc:
        logger.error("On-demand Clio sync failed for firm %s: %s", firm_id, exc)
        raise self.retry(exc=exc)
