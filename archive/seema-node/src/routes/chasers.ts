import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';
import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeChaser(c: any) {
  return {
    id: c.id,
    chaser_type: c.chaserType,
    recipient: c.recipient,
    recipient_email: c.recipient,
    subject: c.subject,
    status: c.status,
    attempts: c.attempts,
    sent_at: c.sentAt,
    response_at: c.responseAt,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

// GET /compliance/chasers — List chaser logs for firm
router.get('/compliance/chasers', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const chasers = await prisma.chaserLog.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(chasers.map(serializeChaser));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch chasers' });
  }
});

// POST /compliance/chasers/send — Send a chaser email
//
// Frontend sends snake_case (chaser_type, recipient_email); older callers
// sent camelCase. Accept both so the route doesn't 400.
const sendChaserSchema = z.object({
  subject: z.string(),
  body: z.string(),
  // snake_case (frontend)
  chaser_type: z.string().optional(),
  recipient_email: z.string().optional(),
  // camelCase (legacy)
  chaserType: z.string().optional(),
  recipientEmail: z.string().optional(),
}).refine(
  (d) => Boolean(d.chaser_type || d.chaserType),
  { message: 'chaser_type (or chaserType) is required' },
).refine(
  (d) => Boolean(d.recipient_email || d.recipientEmail),
  { message: 'recipient_email (or recipientEmail) is required' },
);

router.post('/compliance/chasers/send', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = sendChaserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const chaserType = (parsed.data.chaser_type ?? parsed.data.chaserType) as string;
    const recipientEmail = (parsed.data.recipient_email ?? parsed.data.recipientEmail) as string;
    const { subject, body } = parsed.data;

    const chaser = await prisma.chaserLog.create({
      data: {
        firmId,
        chaserType,
        recipient: recipientEmail,
        subject,
        status: 'pending',
        attempts: 1,
      },
    });

    let finalStatus = 'sent';
    try {
      await sgMail.send({
        to: recipientEmail,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
        subject,
        text: body,
      });
    } catch {
      finalStatus = 'failed';
    }

    const updated = await prisma.chaserLog.update({
      where: { id: chaser.id },
      data: {
        status: finalStatus,
        sentAt: finalStatus === 'sent' ? new Date() : null,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'chaser_sent',
      entityType: 'chaser_log',
      entityId: chaser.id,
      metadata: { chaserType, recipientEmail, status: finalStatus },
    });

    res.json(serializeChaser(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to send chaser' });
  }
});

// POST /compliance/chasers/:chaserId/escalate — Update chaser priority
router.post('/compliance/chasers/:chaserId/escalate', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { chaserId } = req.params as Record<string, string>;
    const { priority } = req.body;

    const chaser = await prisma.chaserLog.findFirst({
      where: { id: chaserId, firmId },
    });
    if (!chaser) {
      res.status(404).json({ error: true, message: 'Chaser not found' });
      return;
    }

    const updated = await prisma.chaserLog.update({
      where: { id: chaserId },
      data: { status: priority || 'escalated' },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'chaser_escalated',
      entityType: 'chaser_log',
      entityId: chaserId,
    });

    res.json(serializeChaser(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to escalate chaser' });
  }
});

// POST /compliance/chasers/:chaserId/resend — Resend with "Reminder:" prefix
router.post('/compliance/chasers/:chaserId/resend', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { chaserId } = req.params as Record<string, string>;

    const chaser = await prisma.chaserLog.findFirst({
      where: { id: chaserId, firmId },
    });
    if (!chaser) {
      res.status(404).json({ error: true, message: 'Chaser not found' });
      return;
    }

    const newSubject = `Reminder: ${chaser.subject || ''}`;
    let finalStatus = 'sent';

    try {
      await sgMail.send({
        to: chaser.recipient || '',
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
        subject: newSubject,
        text: req.body.body || `This is a reminder follow-up for: ${chaser.subject}`,
      });
    } catch {
      finalStatus = 'failed';
    }

    const updated = await prisma.chaserLog.update({
      where: { id: chaserId },
      data: {
        status: finalStatus,
        attempts: (chaser.attempts ?? 0) + 1,
        sentAt: finalStatus === 'sent' ? new Date() : chaser.sentAt,
        subject: newSubject,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'chaser_resent',
      entityType: 'chaser_log',
      entityId: chaserId,
      metadata: { attempts: updated.attempts },
    });

    res.json(serializeChaser(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to resend chaser' });
  }
});

// POST /compliance/chasers/:chaserId/acknowledge — Acknowledge chaser
router.post('/compliance/chasers/:chaserId/acknowledge', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { chaserId } = req.params as Record<string, string>;

    const chaser = await prisma.chaserLog.findFirst({
      where: { id: chaserId, firmId },
    });
    if (!chaser) {
      res.status(404).json({ error: true, message: 'Chaser not found' });
      return;
    }

    const updated = await prisma.chaserLog.update({
      where: { id: chaserId },
      data: {
        status: 'acknowledged',
        responseAt: new Date(),
      },
    });

    res.json(serializeChaser(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to acknowledge chaser' });
  }
});

// POST /compliance/briefing/chase-training — Bulk chase overdue training
router.post('/compliance/briefing/chase-training', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const now = new Date();

    const overdueTraining = await prisma.staffTraining.findMany({
      where: {
        firmId,
        status: 'pending',
        dueDate: { lt: now.toISOString().split('T')[0] },
      },
    });

    const results: Array<{ staffId: string | null; status: string }> = [];

    for (const training of overdueTraining) {
      // Look up staff email
      let staffEmail: string | null = null;
      if (training.staffId) {
        const staff = await prisma.staffMember.findFirst({
          where: { id: training.staffId, firmId },
        });
        staffEmail = staff?.email || null;
      }

      if (!staffEmail) {
        results.push({ staffId: training.staffId, status: 'skipped_no_email' });
        continue;
      }

      let sendStatus = 'sent';
      try {
        await sgMail.send({
          to: staffEmail,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
          subject: `Overdue Training: ${training.courseName || 'Training'}`,
          text: `Your training "${training.courseName}" is overdue. Please complete it as soon as possible.`,
        });
      } catch {
        sendStatus = 'failed';
      }

      await prisma.chaserLog.create({
        data: {
          firmId,
          chaserType: 'training_overdue',
          recipient: staffEmail,
          subject: `Overdue Training: ${training.courseName || 'Training'}`,
          status: sendStatus,
          sentAt: sendStatus === 'sent' ? now : null,
          attempts: 1,
        },
      });

      results.push({ staffId: training.staffId, status: sendStatus });
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'bulk_chase_training',
      entityType: 'chaser_log',
      metadata: { total: overdueTraining.length, results },
    });

    res.json({ message: 'Training chasers sent', total: overdueTraining.length, results });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to chase training' });
  }
});

// POST /compliance/briefing/chase-review — Bulk chase pending reviews
router.post('/compliance/briefing/chase-review', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const now = new Date();

    const pendingReviews = await prisma.sraAuditItem.findMany({
      where: {
        firmId,
        status: 'not_reviewed',
      },
    });

    const results: Array<{ itemId: string; status: string }> = [];

    for (const item of pendingReviews) {
      // Send to firm admin email
      const firm = await prisma.firm.findUnique({ where: { id: firmId } });
      const recipientEmail = firm?.email;

      if (!recipientEmail) {
        results.push({ itemId: item.id, status: 'skipped_no_email' });
        continue;
      }

      let sendStatus = 'sent';
      try {
        await sgMail.send({
          to: recipientEmail,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
          subject: `Review Required: ${item.itemName || 'Audit Item'}`,
          text: `The audit item "${item.itemName}" requires review. Please complete the review promptly.`,
        });
      } catch {
        sendStatus = 'failed';
      }

      await prisma.chaserLog.create({
        data: {
          firmId,
          chaserType: 'review_pending',
          recipient: recipientEmail,
          subject: `Review Required: ${item.itemName || 'Audit Item'}`,
          status: sendStatus,
          sentAt: sendStatus === 'sent' ? now : null,
          attempts: 1,
        },
      });

      results.push({ itemId: item.id, status: sendStatus });
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'bulk_chase_review',
      entityType: 'chaser_log',
      metadata: { total: pendingReviews.length, results },
    });

    res.json({ message: 'Review chasers sent', total: pendingReviews.length, results });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to chase reviews' });
  }
});

export default router;
