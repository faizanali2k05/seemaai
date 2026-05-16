import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import logger from '../utils/logger';

const router = Router();

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://api:8000';

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeBreach(b: any) {
  // The AI draft is persisted as a JSON string in the DB so we can rehydrate
  // it for the modal without re-calling the AI. Parse defensively here so a
  // malformed legacy row doesn't 500 the whole list endpoint.
  let icoDraft: unknown = null;
  if (b.icoNotificationDraft) {
    try {
      icoDraft = JSON.parse(b.icoNotificationDraft);
    } catch {
      // Treat unparseable values as a plain text draft (older rows or
      // hand-edited DB rows). The modal renders strings as the summary.
      icoDraft = { summary: String(b.icoNotificationDraft) };
    }
  }
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    breach_type: b.breachType,
    severity: b.severity,
    reported_date: b.reportedDate,
    ico_deadline: b.icoDeadline,
    status: b.status,
    notification_status: b.notificationStatus,
    affected_records: b.affectedRecords ?? 0,
    root_cause: b.rootCause ?? null,
    resolution_date: b.resolutionDate ?? null,
    // Task #48 — ICO 72-hour workflow fields.
    ico_notification_draft: icoDraft,
    ico_notification_drafted_at: b.icoNotificationDraftedAt ?? null,
    ico_notified_at: b.icoNotifiedAt ?? null,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  };
}

// Frontend sends snake_case (breach_type); older callers sent camelCase
// (breachType). Accept both so the route doesn't 400.
const breachSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.string().min(1),
  // snake_case (frontend)
  breach_type: z.string().optional(),
  // camelCase (legacy)
  breachType: z.string().optional(),
}).refine(
  (d) => Boolean(d.breach_type || d.breachType),
  { message: 'breach_type (or breachType) is required' },
);

// GET /compliance/breach-reports
router.get('/compliance/breach-reports', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const reports = await prisma.breachReport.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(reports.map(serializeBreach));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch breach reports' });
  }
});

// POST /compliance/breach-report
router.post('/compliance/breach-report', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = breachSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { title, description, severity } = parsed.data;
    const breachType = (parsed.data.breach_type ?? parsed.data.breachType) as string;
    const reportedDate = new Date();
    const icoDeadline = new Date(reportedDate.getTime() + 72 * 60 * 60 * 1000);

    const breach = await prisma.breachReport.create({
      data: {
        firmId,
        title,
        description,
        breachType,
        severity,
        reportedDate,
        icoDeadline,
        status: 'open',
        notificationStatus: 'pending',
      },
    });

    await prisma.complianceAlert.create({
      data: {
        firmId,
        alertType: 'breach',
        severity,
        title: `Breach Report: ${title}`,
        description: `A new breach report has been filed: ${title}`,
        status: 'open',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'create_breach_report',
      entityType: 'breach_report',
      entityId: breach.id,
      ipAddress: req.ip,
    });

    res.status(201).json(serializeBreach(breach));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create breach report' });
  }
});

// ---------------------------------------------------------------------------
// Task #48 — ICO 72-hour notification workflow
// ---------------------------------------------------------------------------
// These endpoints sit on the Node API rather than being thin proxies because
// they need to (a) load the Prisma row, (b) call the FastAPI AI service, and
// (c) persist the resulting draft + audit-log it. Doing all three from the
// browser would mean three round-trips and a race window where a draft is
// shown but never saved.

// POST /compliance/breach-reports/:id/draft-ico-notification
// Asks the FastAPI AI service to draft a UK GDPR Article 33 notification for
// this breach, persists the draft + drafted_at on the breach row, and returns
// the structured draft to the caller. Re-calling this endpoint regenerates
// the draft (overwrites the previous one) — the COLP can iterate.
router.post(
  '/compliance/breach-reports/:id/draft-ico-notification',
  authenticate,
  async (req: Request, res: Response) => {
    const { firmId } = getTenantFilter(req);
    const breachId = req.params.id as string;
    try {
      // Verify the breach exists in this firm before round-tripping to AI.
      const breach = await prisma.breachReport.findFirst({
        where: { id: breachId, firmId },
      });
      if (!breach) {
        res.status(404).json({ error: true, message: 'Breach not found' });
        return;
      }

      // Proxy through to the existing FastAPI endpoint, which already
      // contains the BREACH_NOTIFICATION_SYSTEM_PROMPT and citation logic.
      // We forward the JWT so FastAPI's tenant_db_from_jwt dependency can
      // re-derive the firm context.
      const aiResponse = await axios({
        method: 'POST',
        url: `${FASTAPI_URL}/api/ai/draft-ico-notification`,
        data: { breach_id: breachId },
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization
            ? { Authorization: req.headers.authorization }
            : {}),
          'X-Firm-ID': firmId,
          'X-User-ID': req.user?.userId || '',
          'X-User-Role': req.user?.role || '',
          'X-User-Email': req.user?.email || '',
        },
        // 120s — Claude calls regularly run 30-60s; match aiProxy default.
        timeout: 120000,
      });

      const draft = aiResponse.data;

      // Persist the draft so the modal can reopen it without re-paying for
      // the AI call. Stored as JSON so the structured shape survives.
      const updated = await prisma.breachReport.update({
        where: { id: breachId },
        data: {
          icoNotificationDraft: JSON.stringify(draft),
          icoNotificationDraftedAt: new Date(),
        },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'draft_ico_notification',
        entityType: 'breach_report',
        entityId: breachId,
        ipAddress: req.ip,
      });

      res.status(200).json({
        draft,
        breach: serializeBreach(updated),
      });
    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status || 502;
        const message = err.response?.data?.detail || err.message;
        logger.error('AI draft-ico-notification proxy error', {
          breachId,
          status,
          message,
        });
        res.status(status).json({
          error: true,
          message: status === 502
            ? 'AI service temporarily unavailable — try again in a few seconds'
            : message,
        });
        return;
      }
      logger.error('draft-ico-notification failed', {
        err: err instanceof Error ? err.message : String(err),
        breachId,
      });
      res.status(500).json({ error: true, message: 'Failed to draft ICO notification' });
    }
  },
);

// PATCH /compliance/breach-reports/:id/mark-notified
// Records that the COLP has actually submitted the notification to the ICO.
// Sets ico_notified_at + flips notification_status to 'notified'. Idempotent:
// re-PATCHing does not move the timestamp once set, so we don't lose the
// original notification time if someone clicks twice.
router.patch(
  '/compliance/breach-reports/:id/mark-notified',
  authenticate,
  async (req: Request, res: Response) => {
    const { firmId } = getTenantFilter(req);
    const breachId = req.params.id as string;
    try {
      const breach = await prisma.breachReport.findFirst({
        where: { id: breachId, firmId },
      });
      if (!breach) {
        res.status(404).json({ error: true, message: 'Breach not found' });
        return;
      }

      // Preserve the original notification timestamp on duplicate clicks.
      const notifiedAt = breach.icoNotifiedAt ?? new Date();

      const updated = await prisma.breachReport.update({
        where: { id: breachId },
        data: {
          icoNotifiedAt: notifiedAt,
          notificationStatus: 'notified',
        },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'mark_breach_ico_notified',
        entityType: 'breach_report',
        entityId: breachId,
        ipAddress: req.ip,
      });

      res.status(200).json(serializeBreach(updated));
    } catch (err) {
      logger.error('mark-notified failed', {
        err: err instanceof Error ? err.message : String(err),
        breachId,
      });
      res.status(500).json({ error: true, message: 'Failed to mark breach as notified' });
    }
  },
);

export default router;
