import { Router, Request, Response } from 'express';
import axios from 'axios';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { ClioSyncEngine } from '../services/clio.js';
import logger from '../utils/logger.js';

const router = Router();

const CLIO_API_BASE = process.env.CLIO_API_BASE || 'https://app.clio.com';
const CLIO_CLIENT_ID = process.env.CLIO_CLIENT_ID!;
const CLIO_CLIENT_SECRET = process.env.CLIO_CLIENT_SECRET!;
const CLIO_REDIRECT_URI = process.env.CLIO_REDIRECT_URI!;

// ---------------------------------------------------------------------------
// GET /clio/auth-url — build Clio OAuth authorization URL
// ---------------------------------------------------------------------------
router.get('/clio/auth-url', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const params = new URLSearchParams({
      client_id: CLIO_CLIENT_ID,
      redirect_uri: CLIO_REDIRECT_URI,
      response_type: 'code',
      state: firmId,
    });

    const authUrl = `${CLIO_API_BASE}/oauth/authorize?${params.toString()}`;

    res.json({ authUrl });
  } catch (err) {
    logger.error('Failed to build Clio auth URL', { error: err instanceof Error ? err.message : 'Unknown error' });
    res.status(500).json({ error: true, message: 'Failed to build Clio authorization URL' });
  }
});

// ---------------------------------------------------------------------------
// GET /clio/callback — exchange code for tokens, save Integration
// ---------------------------------------------------------------------------
router.get('/clio/callback', authenticate, async (req: Request, res: Response) => {
  try {
    const { code, state: firmId } = req.query as { code: string; state: string };

    if (!code || !firmId) {
      res.status(400).json({ error: true, message: 'Missing code or state parameter' });
      return;
    }

    // Exchange authorization code for tokens
    const { data: tokenData } = await axios.post(`${CLIO_API_BASE}/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: CLIO_CLIENT_ID,
      client_secret: CLIO_CLIENT_SECRET,
      redirect_uri: CLIO_REDIRECT_URI,
      code,
    });

    const accessToken: string = tokenData.access_token;
    const refreshToken: string = tokenData.refresh_token;
    const expiresIn: number = tokenData.expires_in;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Fetch the authenticated user identity from Clio
    const { data: whoAmI } = await axios.get(`${CLIO_API_BASE}/api/v4/users/who_am_i.json`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // Upsert the Integration record
    const existing = await prisma.integration.findFirst({
      where: { firmId, provider: 'clio' },
    });

    const whoAmIData = whoAmI?.data ?? {};

    let integration;
    if (existing) {
      integration = await prisma.integration.update({
        where: { id: existing.id },
        data: {
          accessToken,
          refreshToken,
          tokenExpiresAt,
          status: 'active',
          providerUserName: whoAmIData.name || null,
          providerUserId: whoAmIData.id ? String(whoAmIData.id) : null,
          providerFirmName: whoAmIData.firm?.name || null,
          connectedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          firmId,
          // `name` and `type` are NOT NULL in the DB; required by the
          // post-drift Prisma schema.
          name: 'Clio',
          type: 'practice_management',
          provider: 'clio',
          accessToken,
          refreshToken,
          tokenExpiresAt,
          status: 'active',
          providerUserName: whoAmIData.name || null,
          providerUserId: whoAmIData.id ? String(whoAmIData.id) : null,
          providerFirmName: whoAmIData.firm?.name || null,
          connectedAt: new Date(),
        },
      });
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'clio_connected',
      entityType: 'integration',
      entityId: integration.id,
      ipAddress: req.ip,
    });

    logger.info('Clio integration connected', { firmId });

    res.json({ success: true, message: 'Clio integration connected successfully' });
  } catch (err) {
    logger.error('Clio OAuth callback failed', { error: err instanceof Error ? err.message : 'Unknown error' });
    res.status(500).json({ error: true, message: 'Failed to complete Clio OAuth flow' });
  }
});

// ---------------------------------------------------------------------------
// GET /clio/status — check if firm has active Clio integration
// ---------------------------------------------------------------------------
router.get('/clio/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const integration = await prisma.integration.findFirst({
      where: { firmId, provider: 'clio', status: 'active' },
      select: {
        id: true,
        status: true,
        connectedAt: true,
        updatedAt: true,
        providerFirmName: true,
        providerUserName: true,
      },
    });

    if (!integration) {
      res.json({ connected: false });
      return;
    }

    res.json({
      connected: true,
      integration: {
        id: integration.id,
        status: integration.status,
        connectedAt: integration.connectedAt,
        lastUpdated: integration.updatedAt,
        providerFirmName: integration.providerFirmName,
        providerUserName: integration.providerUserName,
      },
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to check Clio integration status' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /clio/disconnect — soft-delete Integration record
// ---------------------------------------------------------------------------
router.delete('/clio/disconnect', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const integration = await prisma.integration.findFirst({
      where: { firmId, provider: 'clio', status: 'active' },
    });

    if (!integration) {
      res.status(404).json({ error: true, message: 'No active Clio integration found' });
      return;
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: 'disconnected',
        updatedAt: new Date(),
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'clio_disconnected',
      entityType: 'integration',
      entityId: integration.id,
      ipAddress: req.ip,
    });

    logger.info('Clio integration disconnected', { firmId });

    res.json({ success: true, message: 'Clio integration disconnected' });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to disconnect Clio integration' });
  }
});

// ---------------------------------------------------------------------------
// POST /clio/sync — trigger manual sync (admin only)
// ---------------------------------------------------------------------------
router.post('/clio/sync', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const engine = new ClioSyncEngine();
    const result = await engine.sync(firmId);

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'clio_sync_triggered',
      entityType: 'integration',
      ipAddress: req.ip,
      metadata: { recordsSynced: result.recordsSynced, errorCount: result.errors.length },
    });

    res.json({
      success: true,
      recordsSynced: result.recordsSynced,
      errors: result.errors,
    });
  } catch (err) {
    logger.error('Clio sync failed', { error: err instanceof Error ? err.message : 'Unknown error' });
    res.status(500).json({ error: true, message: 'Clio sync failed' });
  }
});

// ---------------------------------------------------------------------------
// GET /clio/sync-history — list IntegrationSyncLog records for firm
// ---------------------------------------------------------------------------
router.get('/clio/sync-history', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Find the Clio integration for this firm to filter sync logs by integrationId
    const clioIntegration = await prisma.integration.findFirst({
      where: { firmId, provider: 'clio' },
      select: { id: true },
    });

    const integrationFilter = clioIntegration
      ? { firmId, integrationId: clioIntegration.id }
      : { firmId, integrationId: '__none__' }; // no results if no integration exists

    const [logs, total] = await Promise.all([
      prisma.integrationSyncLog.findMany({
        where: integrationFilter,
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.integrationSyncLog.count({
        where: integrationFilter,
      }),
    ]);

    res.json({ logs, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch sync history' });
  }
});

export default router;
