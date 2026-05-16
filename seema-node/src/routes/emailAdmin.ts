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
function serializeEmailTemplate(t: any) {
  return {
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    category: t.category,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

function serializeEmailQueueItem(i: any) {
  return {
    id: i.id,
    recipient: i.recipient,
    subject: i.subject,
    status: i.status,
    sent_at: i.sentAt,
    error: i.error,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  };
}

// The email settings POST stores arbitrary JSON in firm preferences. We don't
// know the exact frontend payload shape, so the route still passes through
// req.body verbatim — that's fine because nothing here is validated by Zod
// and the GET returns whatever shape was saved. Leaving as-is.

// GET /admin/email-settings — Return email settings from firm preferences
router.get('/admin/email-settings', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const firm = await prisma.firm.findUnique({ where: { id: firmId } });

    if (!firm) {
      res.status(404).json({ error: true, message: 'Firm not found' });
      return;
    }

    let emailSettings = {
      fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
      fromName: firm.name,
      replyTo: firm.email || '',
      autoChaseEnabled: false,
      autoChaseFrequencyDays: 7,
    };

    if (firm.firmPreferences) {
      try {
        const prefs = JSON.parse(firm.firmPreferences);
        if (prefs.emailSettings) {
          emailSettings = { ...emailSettings, ...prefs.emailSettings };
        }
      } catch { /* ignore parse errors */ }
    }

    res.json(emailSettings);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch email settings' });
  }
});

// POST /admin/email-settings — Save email settings to firm preferences
router.post('/admin/email-settings', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const firm = await prisma.firm.findUnique({ where: { id: firmId } });

    if (!firm) {
      res.status(404).json({ error: true, message: 'Firm not found' });
      return;
    }

    let prefs: Record<string, unknown> = {};
    if (firm.firmPreferences) {
      try {
        prefs = JSON.parse(firm.firmPreferences);
      } catch { /* start fresh */ }
    }

    prefs.emailSettings = req.body;

    await prisma.firm.update({
      where: { id: firmId },
      data: { firmPreferences: JSON.stringify(prefs) },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'email_settings_updated',
      entityType: 'firm',
      entityId: firmId,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to save email settings' });
  }
});

// GET /admin/email-templates — List email templates
router.get('/admin/email-templates', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const templates = await prisma.emailTemplate.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(templates.map(serializeEmailTemplate));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch email templates' });
  }
});

// GET /admin/email-queue — List email queue items
router.get('/admin/email-queue', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const items = await prisma.emailQueueItem.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(items.map(serializeEmailQueueItem));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch email queue' });
  }
});

// GET /admin/email-queue/stats — Count by status
router.get('/admin/email-queue/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const stats = await prisma.emailQueueItem.groupBy({
      by: ['status'],
      where: { firmId },
      _count: { status: true },
    });

    const formatted: Record<string, number> = {};
    for (const item of stats) {
      // status is nullable in the DB — bucket nulls under 'unknown'.
      const key = item.status ?? 'unknown';
      formatted[key] = item._count.status;
    }

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch email queue stats' });
  }
});

// POST /admin/email-queue/send-all — Process pending emails
router.post('/admin/email-queue/send-all', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const pendingItems = await prisma.emailQueueItem.findMany({
      where: { firmId, status: 'pending' },
    });

    let sent = 0;
    let failed = 0;

    for (const item of pendingItems) {
      try {
        await sgMail.send({
          to: item.recipient,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
          subject: item.subject,
          text: item.subject, // body from template would be resolved here
        });

        await prisma.emailQueueItem.update({
          where: { id: item.id },
          data: { status: 'sent', sentAt: new Date() },
        });
        sent++;
      } catch (sendErr) {
        await prisma.emailQueueItem.update({
          where: { id: item.id },
          data: {
            status: 'failed',
            error: sendErr instanceof Error ? sendErr.message : 'Unknown error',
          },
        });
        failed++;
      }
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'email_queue_processed',
      entityType: 'email_queue',
      metadata: { total: pendingItems.length, sent, failed },
    });

    res.json({ total: pendingItems.length, sent, failed });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to process email queue' });
  }
});

// POST /admin/email-queue/:itemId/send — Send single queued email
router.post('/admin/email-queue/:itemId/send', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { itemId } = req.params as Record<string, string>;

    const item = await prisma.emailQueueItem.findFirst({
      where: { id: itemId, firmId },
    });
    if (!item) {
      res.status(404).json({ error: true, message: 'Email queue item not found' });
      return;
    }

    try {
      await sgMail.send({
        to: item.recipient,
        from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
        subject: item.subject,
        text: item.subject,
      });

      const updated = await prisma.emailQueueItem.update({
        where: { id: itemId },
        data: { status: 'sent', sentAt: new Date() },
      });

      res.json(serializeEmailQueueItem(updated));
    } catch (sendErr) {
      await prisma.emailQueueItem.update({
        where: { id: itemId },
        data: {
          status: 'failed',
          error: sendErr instanceof Error ? sendErr.message : 'Unknown error',
        },
      });

      res.status(500).json({ error: true, message: 'Failed to send email' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to send queued email' });
  }
});

// POST /admin/email/test — Send test email via SendGrid
router.post('/admin/email/test', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { to, subject, body } = req.body;

    if (!to) {
      res.status(400).json({ error: true, message: 'Recipient email (to) is required' });
      return;
    }

    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
      subject: subject || 'Test Email from Seema',
      text: body || 'This is a test email sent from the Seema compliance platform.',
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'test_email_sent',
      entityType: 'email',
      metadata: { to, subject },
    });

    res.json({ success: true, message: 'Test email sent' });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to send test email' });
  }
});

// POST /admin/email/auto-chase — Trigger auto-chase logic
router.post('/admin/email/auto-chase', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const now = new Date();

    // Find chasers that were sent but not acknowledged, and are older than the chase frequency
    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    let chaseFrequencyDays = 7;

    if (firm?.firmPreferences) {
      try {
        const prefs = JSON.parse(firm.firmPreferences);
        if (prefs.emailSettings?.autoChaseFrequencyDays) {
          chaseFrequencyDays = prefs.emailSettings.autoChaseFrequencyDays;
        }
      } catch { /* use default */ }
    }

    const cutoffDate = new Date(now.getTime() - chaseFrequencyDays * 24 * 60 * 60 * 1000);

    const unresolvedChasers = await prisma.chaserLog.findMany({
      where: {
        firmId,
        status: 'sent',
        sentAt: { lt: cutoffDate },
      },
    });

    let resent = 0;
    for (const chaser of unresolvedChasers) {
      if (!chaser.recipient) continue;

      const newSubject = `Reminder: ${chaser.subject || ''}`;
      try {
        await sgMail.send({
          to: chaser.recipient,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@seemaai.co.uk',
          subject: newSubject,
          text: `This is an automated reminder follow-up for: ${chaser.subject}`,
        });

        await prisma.chaserLog.update({
          where: { id: chaser.id },
          data: {
            attempts: (chaser.attempts ?? 0) + 1,
            sentAt: now,
            subject: newSubject,
          },
        });
        resent++;
      } catch { /* skip failed sends */ }
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'auto_chase_triggered',
      entityType: 'chaser_log',
      metadata: { total: unresolvedChasers.length, resent },
    });

    res.json({ total: unresolvedChasers.length, resent });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to trigger auto-chase' });
  }
});

export default router;
