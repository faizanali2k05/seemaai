import { Router, Request, Response } from 'express';
import { Queue } from 'bullmq';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import logger from '../utils/logger.js';

const router = Router();

// Reuse the BullMQ email queue the worker subscribes to. We instantiate it
// here (rather than importing from the worker module) because the API
// process and the workers process are separate; importing the worker file
// would also boot a Worker instance in the API.
const emailQueue = new Queue('email', { connection: redis });

/** Resolve a notification target (name + email) for the firm's COLP.
 *  Tries the user_accounts table first (login users with role=colp), then
 *  falls back to looking up a staff_member matching firm.colpName.
 *  Returns null if no candidate has an email. */
async function _findColpRecipient(firmId: string): Promise<{ name: string; email: string } | null> {
  // 1. Login user with role=colp
  const colpUser = await prisma.userAccount.findFirst({
    where: { firmId, role: 'colp', isActive: true },
    select: { email: true },
  });
  if (colpUser?.email) {
    return { name: 'COLP', email: colpUser.email };
  }
  // 2. Staff member matching firm.colpName
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { colpName: true, email: true, name: true },
  });
  if (firm?.colpName) {
    const staff = await prisma.staffMember.findFirst({
      where: { firmId, name: firm.colpName },
      select: { name: true, email: true },
    });
    if (staff?.email) {
      return { name: staff.name || 'COLP', email: staff.email };
    }
  }
  // 3. Last resort — firm-level contact email so the escalation isn't silently lost
  if (firm?.email) {
    return { name: firm.name || 'Firm contact', email: firm.email };
  }
  return null;
}

const SEVERITY_LADDER = ['low', 'medium', 'high', 'critical'];

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeAlert(a: any) {
  return {
    id: a.id,
    alert_type: a.alertType,
    severity: a.severity,
    title: a.title,
    description: a.description,
    status: a.status,
    acknowledged_at: a.acknowledgedAt,
    resolved_at: a.resolvedAt,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

function serializeScanResult(r: any) {
  return {
    id: r.id,
    scan_date: r.scanDate,
    category: r.category,
    check_name: r.checkName,
    status: r.status,
    details: r.details,
    recommendation: r.recommendation,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

// GET /compliance/alerts
router.get('/compliance/alerts', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const alerts = await prisma.complianceAlert.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(alerts.map(serializeAlert));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch alerts' });
  }
});

// POST /compliance/alerts/:alertId/acknowledge
router.post('/compliance/alerts/:alertId/acknowledge', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { alertId } = req.params as Record<string, string>;

    const alert = await prisma.complianceAlert.update({
      where: { id: alertId, firmId },
      data: {
        acknowledgedAt: new Date(),
        status: 'acknowledged',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'acknowledge_alert',
      entityType: 'compliance_alert',
      entityId: alertId,
      ipAddress: req.ip,
    });

    res.json(serializeAlert(alert));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to acknowledge alert' });
  }
});

// POST /compliance/alerts/:alertId/resolve
router.post('/compliance/alerts/:alertId/resolve', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { alertId } = req.params as Record<string, string>;

    const alert = await prisma.complianceAlert.update({
      where: { id: alertId, firmId },
      data: {
        resolvedAt: new Date(),
        status: 'resolved',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'resolve_alert',
      entityType: 'compliance_alert',
      entityId: alertId,
      ipAddress: req.ip,
    });

    res.json(serializeAlert(alert));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to resolve alert' });
  }
});

// POST /compliance/alerts/:alertId/escalate
//
// Bumps severity one rung up the ladder, audits the action, AND enqueues an
// email to the firm's COLP so the escalation actually reaches a human. The
// email is fire-and-forget — we never let an enqueue failure break the API
// response.
router.post('/compliance/alerts/:alertId/escalate', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { alertId } = req.params as Record<string, string>;

    const existing = await prisma.complianceAlert.findFirst({
      where: { id: alertId, firmId },
    });

    if (!existing) {
      res.status(404).json({ error: true, message: 'Alert not found' });
      return;
    }

    const currentIndex = SEVERITY_LADDER.indexOf(existing.severity || 'low');
    const nextSeverity = SEVERITY_LADDER[Math.min(currentIndex + 1, SEVERITY_LADDER.length - 1)];

    const alert = await prisma.complianceAlert.update({
      where: { id: alertId },
      data: { severity: nextSeverity },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'escalate_alert',
      entityType: 'compliance_alert',
      entityId: alertId,
      ipAddress: req.ip,
      metadata: { from: existing.severity, to: nextSeverity },
    });

    // Notify the COLP. Do this in a try/catch so notification failures don't
    // surface as the user's API response failing — the audit log is the
    // source-of-truth for the escalation action.
    try {
      const recipient = await _findColpRecipient(firmId);
      if (recipient) {
        const subject = `[Seema] Alert escalated to ${(nextSeverity || 'unknown').toUpperCase()}: ${alert.title || 'compliance alert'}`;
        const html = `
          <p>Hi ${recipient.name},</p>
          <p>A compliance alert has been escalated and now requires your attention.</p>
          <table style="border-collapse:collapse;margin-top:8px">
            <tr><td style="padding:4px 12px;color:#6b7280">Title</td><td style="padding:4px 12px"><strong>${alert.title || '(untitled)'}</strong></td></tr>
            <tr><td style="padding:4px 12px;color:#6b7280">Severity</td><td style="padding:4px 12px">${existing.severity || 'low'} → <strong>${nextSeverity}</strong></td></tr>
            <tr><td style="padding:4px 12px;color:#6b7280">Type</td><td style="padding:4px 12px">${alert.alertType || 'compliance'}</td></tr>
            <tr><td style="padding:4px 12px;color:#6b7280">Action required</td><td style="padding:4px 12px">${alert.actionRequired || '—'}</td></tr>
          </table>
          <p style="margin-top:16px">${alert.description || ''}</p>
          <p style="margin-top:24px">Open the alert in Seema to acknowledge or resolve.</p>
        `;
        // Persist a queued row so the audit trail of attempted sends is
        // visible from the email-admin page.
        // EmailQueueItem doesn't store the body — it's an audit log of
        // what we *attempted* to send. The actual HTML lives in the BullMQ
        // job payload below.
        await prisma.emailQueueItem.create({
          data: {
            firmId,
            recipient: recipient.email,
            subject,
            status: 'queued',
          },
        });
        await emailQueue.add('send_email', {
          firmId,
          to: recipient.email,
          subject,
          html,
        });
        logger.info('Alert escalation email queued', { alertId, to: recipient.email, firmId });
      } else {
        logger.warn('Alert escalated but no COLP/firm contact email found — notification skipped', { alertId, firmId });
      }
    } catch (notifyErr) {
      logger.error('Failed to enqueue escalation email', {
        alertId, firmId,
        err: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    res.json(serializeAlert(alert));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to escalate alert' });
  }
});

// GET /compliance/checks
router.get('/compliance/checks', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const results = await prisma.complianceScanResult.findMany({
      where: { firmId },
    });

    res.json(results.map(serializeScanResult));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch checks' });
  }
});

// GET /compliance/risk-scores
router.get('/compliance/risk-scores', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const [total, pass, fail, warning] = await Promise.all([
      prisma.complianceScanResult.count({ where: { firmId } }),
      prisma.complianceScanResult.count({ where: { firmId, status: 'pass' } }),
      prisma.complianceScanResult.count({ where: { firmId, status: 'fail' } }),
      prisma.complianceScanResult.count({ where: { firmId, status: 'warning' } }),
    ]);

    res.json({ total, pass, fail, warning });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch risk scores' });
  }
});

// POST /compliance/checks/run (admin only)
router.post('/compliance/checks/run', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const scanResult = await prisma.complianceScanResult.create({
      data: {
        firmId,
        status: 'running',
        scanDate: new Date(),
        category: 'full_scan',
        checkName: 'Manual compliance scan',
      },
    });

    res.json({ job_id: scanResult.id, status: 'queued' });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to start compliance scan' });
  }
});

export default router;
