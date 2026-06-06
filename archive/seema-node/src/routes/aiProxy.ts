import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { authenticate, requireRole } from '../middleware/auth';
import { getTenantFilter } from '../middleware/tenant';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger';

const router = Router();

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://api:8000';

// ---------------------------------------------------------------------------
// Helper: Proxy request to FastAPI
// ---------------------------------------------------------------------------
async function proxyToFastAPI(
  req: Request,
  res: Response,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  fastapiPath: string,
  options?: { timeout?: number },
) {
  try {
    const { firmId } = getTenantFilter(req);
    const timeout = options?.timeout || 120000; // 2 min default for AI ops

    const response = await axios({
      method,
      url: `${FASTAPI_URL}${fastapiPath}`,
      data: method !== 'GET' ? req.body : undefined,
      params: method === 'GET' ? req.query : undefined,
      headers: {
        'Content-Type': 'application/json',
        // Forward the Authorization header — FastAPI's get_current_user
        // dependency requires Bearer auth. Without this, every proxied
        // endpoint 401s with "Missing authorization header".
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
        'X-Firm-ID': firmId,
        'X-User-ID': req.user?.userId || '',
        'X-User-Role': req.user?.role || '',
        'X-User-Email': req.user?.email || '',
        'X-Request-ID': req.headers['x-request-id'] as string || '',
      },
      timeout,
      // For PDF responses, get the raw buffer
      responseType: fastapiPath.includes('pdf') || fastapiPath.includes('pack')
        ? 'arraybuffer'
        : 'json',
    });

    // Forward content-type and disposition headers for file downloads
    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', String(contentType));
    }
    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      res.setHeader('Content-Disposition', String(contentDisposition));
    }

    res.status(response.status).send(response.data);
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status || 502;
      const message = err.response?.data?.detail || err.message;

      logger.error('FastAPI proxy error', {
        path: fastapiPath,
        status,
        message,
      });

      res.status(status).json({
        error: true,
        message: status === 502
          ? 'AI service temporarily unavailable'
          : message,
      });
      return;
    }
    throw err;
  }
}

// ===========================================================================
// AI Analysis Endpoints (8 endpoints)
// ===========================================================================

// POST /ai/analyze-regulatory — AI regulatory impact analysis
router.post(
  '/ai/analyze-regulatory',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/analyze-regulatory');
  },
);

// POST /ai/analyze-breach — AI breach assessment
router.post(
  '/ai/analyze-breach',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/analyze-breach');
  },
);

// POST /ai/generate-policy — Generate compliance policy via AI
router.post(
  '/ai/generate-policy',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/generate-policy');
  },
);

// POST /ai/scan-compliance — Comprehensive AI compliance scan
router.post(
  '/ai/scan-compliance',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/scan-compliance', {
      timeout: 180000, // 3 min — full scan can be slow
    });
  },
);

// POST /ai/suggest-remediation — AI remediation suggestions
router.post(
  '/ai/suggest-remediation',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/suggest-remediation');
  },
);

// POST /ai/ask — Knowledge engine Q&A
router.post(
  '/ai/ask',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/ask');
  },
);

// GET /ai/risk-summary — Executive risk summary
router.get(
  '/ai/risk-summary',
  authenticate,
  requireRole('partner'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'GET', '/api/ai/risk-summary');
  },
);

// GET /ai/status — Check AI availability
router.get(
  '/ai/status',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'GET', '/api/ai/status');
  },
);

// POST /ai/review-matter — Per-matter AI compliance review
router.post(
  '/ai/review-matter',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/review-matter', { timeout: 120000 });
  },
);

// POST /ai/draft-ico-notification — Draft ICO breach notification under UK GDPR Article 33
router.post(
  '/ai/draft-ico-notification',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/ai/draft-ico-notification', { timeout: 120000 });
  },
);

// ===========================================================================
// Regulatory Updates Endpoints (9 endpoints)
// ===========================================================================

// All routes below use the URLs the frontend actually calls
// (/compliance/regulatory-updates/*), not the legacy /regulatory/updates/*
// paths. The frontend in seema-web calls /compliance/regulatory-updates
// from the dashboard, regulatory page, etc. — keeping route declarations
// in sync with the frontend avoids the same class of 404 bug we fixed
// for the SRA audit endpoints.

// GET /compliance/regulatory-updates — List scraped regulatory updates
router.get(
  '/compliance/regulatory-updates',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'GET', '/api/compliance/regulatory-updates');
  },
);

// GET /compliance/regulatory-updates/:id — Single update detail
router.get(
  '/compliance/regulatory-updates/:id',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'GET', `/api/compliance/regulatory-updates/${(req.params.id as string)}`);
  },
);

// POST /compliance/regulatory-updates/:id/interpret — Trigger AI interpretation
router.post(
  '/compliance/regulatory-updates/:id/interpret',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', `/api/compliance/regulatory-updates/${(req.params.id as string)}/interpret`);
  },
);

// GET /compliance/regulatory-updates/:id/interpretation — Get interpretation
router.get(
  '/compliance/regulatory-updates/:id/interpretation',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'GET', `/api/compliance/regulatory-updates/${(req.params.id as string)}/interpretation`);
  },
);

// POST /compliance/regulatory-updates/:id/acknowledge — Acknowledge interpretation
router.post(
  '/compliance/regulatory-updates/:id/acknowledge',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', `/api/compliance/regulatory-updates/${(req.params.id as string)}/acknowledge`);
  },
);

// POST /compliance/regulatory-updates/:id/override — COLP/COFA override
router.post(
  '/compliance/regulatory-updates/:id/override',
  authenticate,
  requireRole('colp'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', `/api/compliance/regulatory-updates/${(req.params.id as string)}/override`);
  },
);

// DELETE /compliance/regulatory-updates/:id/override — Remove override
router.delete(
  '/compliance/regulatory-updates/:id/override',
  authenticate,
  requireRole('colp'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'DELETE', `/api/compliance/regulatory-updates/${(req.params.id as string)}/override`);
  },
);

// ---------------------------------------------------------------------------
// Per-staff acknowledgement tracking
// ---------------------------------------------------------------------------
// These two endpoints live on the Node API directly (not proxied to FastAPI)
// because they query the `regulatory_acknowledgements` junction table which
// is owned by the Node Prisma schema. The single-acknowledger columns on
// `regulatory_interpretations` (acknowledged_at, acknowledged_by) remain the
// "COLP-level sign-off" — handled by the /acknowledge route above. This
// table records every individual staff "I've read this" alongside.
//
// Until the alembic migration `add_regulatory_acks` runs, these endpoints
// will 500 because the underlying table doesn't exist yet.

// POST /compliance/regulatory-updates/:id/acknowledge-staff
// Idempotent — upsert keyed on (firmId, updateId, userId).
router.post(
  '/compliance/regulatory-updates/:id/acknowledge-staff',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: true, message: 'User context missing' });
        return;
      }
      const updateId = req.params.id as string;
      const notes = typeof req.body?.notes === 'string' ? req.body.notes : null;

      // Upsert by the (firmId, updateId, userId) unique tuple — calling
      // POST a second time is a no-op (updates notes / timestamp only).
      const ack = await prisma.regulatoryAcknowledgement.upsert({
        where: {
          firmId_updateId_userId: { firmId, updateId, userId },
        },
        create: {
          firmId,
          updateId,
          userId,
          notes,
        },
        update: {
          // Refresh the timestamp + notes on re-acknowledge.
          acknowledgedAt: new Date(),
          notes,
        },
      });

      res.status(200).json({
        data: {
          id: ack.id,
          update_id: ack.updateId,
          user_id: ack.userId,
          acknowledged_at: ack.acknowledgedAt,
          notes: ack.notes,
          message: 'Acknowledgement recorded.',
        },
      });
    } catch (err) {
      logger.error('acknowledge-staff failed', {
        err: err instanceof Error ? err.message : String(err),
        updateId: req.params.id,
      });
      res.status(500).json({ error: true, message: 'Failed to record acknowledgement' });
    }
  },
);

// GET /compliance/regulatory-updates/:id/acknowledgements
// Returns aggregate ack stats for the firm: total active staff, who has read
// the update vs who hasn't. Resolves display names from staff_members where
// the user_account is linked via staffId; otherwise falls back to email.
router.get(
  '/compliance/regulatory-updates/:id/acknowledgements',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const updateId = req.params.id as string;

      // All active staff in the firm (denominator).
      const users = await prisma.userAccount.findMany({
        where: { firmId, isActive: true },
        select: { id: true, email: true, staffId: true },
      });

      // All existing acknowledgements for this update.
      const acks = await prisma.regulatoryAcknowledgement.findMany({
        where: { firmId, updateId },
        select: {
          userId: true,
          acknowledgedAt: true,
          notes: true,
        },
      });
      const ackByUser = new Map(acks.map(a => [a.userId, a]));

      // Resolve display names from staff_members for any user with a
      // linked staffId. user_accounts has no `name` column; we fall back
      // to the email local-part if no staff record exists.
      const staffIds = users
        .map(u => u.staffId)
        .filter((s): s is string => !!s);
      const staff = staffIds.length
        ? await prisma.staffMember.findMany({
            where: { firmId, id: { in: staffIds } },
            select: { id: true, name: true },
          })
        : [];
      const staffNameById = new Map(staff.map(s => [s.id, s.name]));

      const resolveName = (u: { email: string; staffId: string | null }) =>
        (u.staffId && staffNameById.get(u.staffId)) || u.email;

      const acknowledged: Array<{
        user_id: string;
        user_name: string;
        user_email: string;
        acknowledged_at: Date;
        notes: string | null;
      }> = [];
      const pending: Array<{
        user_id: string;
        user_name: string;
        user_email: string;
      }> = [];

      for (const u of users) {
        const ack = ackByUser.get(u.id);
        const name = resolveName(u);
        if (ack) {
          acknowledged.push({
            user_id: u.id,
            user_name: name,
            user_email: u.email,
            acknowledged_at: ack.acknowledgedAt,
            notes: ack.notes,
          });
        } else {
          pending.push({
            user_id: u.id,
            user_name: name,
            user_email: u.email,
          });
        }
      }

      // Sort: acknowledged most-recent-first, pending alphabetically.
      acknowledged.sort(
        (a, b) => b.acknowledged_at.getTime() - a.acknowledged_at.getTime(),
      );
      pending.sort((a, b) => a.user_name.localeCompare(b.user_name));

      res.status(200).json({
        total_staff: users.length,
        acknowledged_count: acknowledged.length,
        acknowledged,
        pending,
      });
    } catch (err) {
      logger.error('acknowledgements lookup failed', {
        err: err instanceof Error ? err.message : String(err),
        updateId: req.params.id,
      });
      res.status(500).json({ error: true, message: 'Failed to load acknowledgements' });
    }
  },
);

// GET /compliance/interpretation-history — Full audit trail
router.get(
  '/compliance/interpretation-history',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'GET', '/api/compliance/interpretation-history');
  },
);

// POST /compliance/regulatory-updates/scrape — Manually trigger scrape
router.post(
  '/compliance/regulatory-updates/scrape',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/compliance/regulatory-updates/scrape');
  },
);

// ===========================================================================
// PDF Generation Endpoints (3 endpoints)
// ===========================================================================

// POST /reports/sra-return-pdf — Export SRA return as PDF
router.post(
  '/reports/sra-return-pdf',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/compliance/sra-return/export-pdf', {
      timeout: 60000,
    });
  },
);

// POST /reports/sra-audit-pack — Generate SRA visit preparation pack
//   (legacy URL — kept for any internal callers that already use it)
router.post(
  '/reports/sra-audit-pack',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/compliance/sra-audit/generate-pack', {
      timeout: 60000,
    });
  },
);

// GET /compliance/sra-audit — Fetch SRA audit assessment items
//   (the SRA audit page calls this to render the audit table; without it
//   the page errors before the user even sees the Generate Pack button.)
router.get(
  '/compliance/sra-audit',
  authenticate,
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'GET', '/api/compliance/sra-audit');
  },
);

// POST /compliance/sra-audit/generate-pack — Generate SRA visit prep PDF
//   (this is the URL the frontend's "Generate Pack" button calls; aliases
//   /reports/sra-audit-pack above so both URLs work.)
router.post(
  '/compliance/sra-audit/generate-pack',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/compliance/sra-audit/generate-pack', {
      timeout: 60000,
    });
  },
);

// POST /reports/audit-report — Generate compliance audit report
router.post(
  '/reports/audit-report',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    await proxyToFastAPI(req, res, 'POST', '/api/compliance/generate-audit-report', {
      timeout: 60000,
    });
  },
);

export default router;
