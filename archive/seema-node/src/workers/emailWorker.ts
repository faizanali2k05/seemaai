import { Worker, Job, Queue } from 'bullmq';
import sgMail from '@sendgrid/mail';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { runWithBypass, runWithFirm } from '../lib/tenantContext.js';
import { renderPackHtml } from '../lib/packRenderer.js';

const SENDGRID_API_KEY = (process.env.SENDGRID_API_KEY || '').trim();
sgMail.setApiKey(SENDGRID_API_KEY);

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@seema.legal';
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Seema';

const emailQueue = new Queue('email', { connection: redis });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function wrapTemplate(firmName: string, content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: #f4f5f7; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; }
    .header { background: #1a2b4a; color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .body { padding: 32px; color: #333333; line-height: 1.6; }
    .footer { padding: 16px 32px; font-size: 12px; color: #999999; text-align: center; border-top: 1px solid #eeeeee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>${firmName}</h1></div>
    <div class="body">${content}</div>
    <div class="footer">Sent via Seema &mdash; Compliance made simple.</div>
  </div>
</body>
</html>`.trim();
}

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

async function handleSendEmail(job: Job): Promise<void> {
  const { to, subject, html, firmId } = job.data;

  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  const wrappedHtml = wrapTemplate(firm?.name ?? 'Seema', html);

  try {
    await sgMail.send({
      to,
      from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      subject,
      html: wrappedHtml,
    });

    await prisma.emailQueueItem.updateMany({
      where: { firmId, recipient: to, subject, status: 'queued' },
      data: { status: 'sent', sentAt: new Date() },
    });

    logger.info('Email sent', { to, subject, firmId });
  } catch (err) {
    await prisma.emailQueueItem.updateMany({
      where: { firmId, recipient: to, subject, status: 'queued' },
      data: { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' },
    });
    throw err;
  }
}

async function handleSendTrainingChase(job: Job): Promise<void> {
  const { firmId, staffId, trainingId } = job.data;

  const [training, account, firm] = await Promise.all([
    prisma.staffTraining.findUnique({ where: { id: trainingId } }),
    prisma.userAccount.findUnique({ where: { id: staffId } }),
    prisma.firm.findUnique({ where: { id: firmId } }),
  ]);

  if (!training || !account || !firm) {
    logger.warn('Training chase: missing records', { firmId, staffId, trainingId });
    return;
  }

  // Look up StaffMember for display name; fall back to email
  const staffMember = account.staffId
    ? await prisma.staffMember.findUnique({ where: { id: account.staffId } })
    : null;
  const displayName = staffMember?.name ?? account.email;

  const dueDateLabel = training.dueDate
    ? new Date(training.dueDate).toLocaleDateString('en-GB')
    : 'TBC';
  const content = `
    <h2>Training Reminder</h2>
    <p>Hi ${displayName},</p>
    <p>This is a reminder that your training <strong>${training.courseName}</strong> is due for completion by <strong>${dueDateLabel}</strong>.</p>
    <p>Please complete it at your earliest convenience.</p>
  `;

  await sgMail.send({
    to: account.email,
    from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
    subject: `Training Reminder: ${training.courseName}`,
    html: wrapTemplate(firm.name, content),
  });

  logger.info('Training chase sent', { staffId, trainingId, firmId });
}

/**
 * send_overdue_chasers — daily 9am job. Scheduler enqueues with no firmId,
 * so we fan-out: find every overdue training record across all active firms
 * and queue a per-record `send_training_chase` job. The existing
 * handleSendTrainingChase then handles the actual email.
 */
async function handleSendOverdueChasers(job: Job): Promise<void> {
  const { firmId } = job.data;

  // Per-firm path: enumerate this firm's overdue training and queue chase jobs.
  if (firmId) {
    const todayStr = new Date().toISOString().split('T')[0];
    const overdue = await prisma.staffTraining.findMany({
      where: {
        firmId,
        status: { not: 'completed' },
        dueDate: { lt: todayStr },
      },
      select: { id: true, staffId: true },
    });
    let queued = 0;
    for (const t of overdue) {
      if (!t.staffId) continue;
      // Resolve a user account for the staff member to send to.
      const user = await prisma.userAccount.findFirst({
        where: { firmId, staffId: t.staffId, isActive: true },
        select: { id: true },
      });
      if (!user) continue;
      await emailQueue.add('send_training_chase', {
        firmId,
        staffId: user.id,
        trainingId: t.id,
      });
      queued++;
    }
    logger.info('Overdue training chasers queued', { firmId, queued });
    return;
  }

  // Fan-out: re-queue one job per active firm.
  await runWithBypass('worker:email:send_overdue_chasers fan-out', async () => {
    const firms = await prisma.firm.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const f of firms) {
      await emailQueue.add('send_overdue_chasers', { firmId: f.id });
    }
    logger.info('Overdue chasers fan-out queued', { count: firms.length });
  });
}

async function handleSendDailyDigest(job: Job): Promise<void> {
  const { firmId } = job.data;

  // Fan-out: scheduler enqueues this job nightly with no firmId. Re-queue
  // one job per active firm and return — each per-firm job then runs the
  // body below. Without this fan-out the handler would crash on
  // findUnique({where:{id: undefined}}) which is what was happening every
  // evening at 18:00.
  if (!firmId) {
    await runWithBypass('worker:email:send_daily_digest fan-out', async () => {
      const firms = await prisma.firm.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const f of firms) {
        await emailQueue.add('send_daily_digest', { firmId: f.id });
      }
      logger.info('Daily digest fan-out queued', { count: firms.length });
    });
    return;
  }

  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [alerts, deadlines, tasks] = await Promise.all([
    prisma.complianceAlert.findMany({
      where: { firmId, createdAt: { gte: today, lt: tomorrow } },
    }),
    prisma.deadline.findMany({
      where: { firmId, dueDate: { gte: today, lt: tomorrow }, status: { not: 'completed' } },
    }),
    prisma.complianceTask.findMany({
      where: {
        firmId,
        dueDate: {
          gte: today.toISOString().slice(0, 10),
          lt: tomorrow.toISOString().slice(0, 10),
        },
        status: { not: 'completed' },
      },
    }),
  ]);

  const content = `
    <h2>Daily Digest &mdash; ${today.toLocaleDateString('en-GB')}</h2>
    <p><strong>${alerts.length}</strong> new compliance alert(s)</p>
    <p><strong>${deadlines.length}</strong> deadline(s) due today</p>
    <p><strong>${tasks.length}</strong> task(s) due today</p>
    <p>Log in to Seema to view details.</p>
  `;

  const activeUsers = await prisma.userAccount.findMany({
    where: { firmId, isActive: true },
    select: { email: true },
  });

  for (const user of activeUsers) {
    await sgMail.send({
      to: user.email,
      from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      subject: `Daily Digest — ${today.toLocaleDateString('en-GB')}`,
      html: wrapTemplate(firm.name, content),
    });
  }

  logger.info('Daily digest sent', { firmId, recipientCount: activeUsers.length });
}

async function handleSendWeeklySummary(job: Job): Promise<void> {
  const { firmId } = job.data;

  // Fan-out — same pattern as send_daily_digest.
  if (!firmId) {
    await runWithBypass('worker:email:send_weekly_summary fan-out', async () => {
      const firms = await prisma.firm.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const f of firms) {
        await emailQueue.add('send_weekly_summary', { firmId: f.id });
      }
      logger.info('Weekly summary fan-out queued', { count: firms.length });
    });
    return;
  }

  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) return;

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [alertCount, completedTraining, newDeadlines, resolvedAlerts] = await Promise.all([
    prisma.complianceAlert.count({ where: { firmId, createdAt: { gte: weekAgo } } }),
    prisma.staffTraining.count({ where: { firmId, status: 'completed', completedDate: { gte: weekAgo.toISOString().split('T')[0] } } }),
    prisma.deadline.count({ where: { firmId, createdAt: { gte: weekAgo } } }),
    prisma.complianceAlert.count({ where: { firmId, resolvedAt: { gte: weekAgo } } }),
  ]);

  const content = `
    <h2>Weekly Summary</h2>
    <p>Here is your firm's compliance summary for the past week:</p>
    <ul>
      <li><strong>${alertCount}</strong> new compliance alerts</li>
      <li><strong>${resolvedAlerts}</strong> alerts resolved</li>
      <li><strong>${completedTraining}</strong> training modules completed</li>
      <li><strong>${newDeadlines}</strong> new deadlines created</li>
    </ul>
    <p>Log in to Seema for the full picture.</p>
  `;

  const activeUsers = await prisma.userAccount.findMany({
    where: { firmId, isActive: true },
    select: { email: true },
  });

  for (const user of activeUsers) {
    await sgMail.send({
      to: user.email,
      from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      subject: 'Weekly Compliance Summary',
      html: wrapTemplate(firm.name, content),
    });
  }

  logger.info('Weekly summary sent', { firmId, recipientCount: activeUsers.length });
}

/**
 * send_compliance_pack — enqueued by POST /packs/:packType/send.
 *
 * Pulls the corresponding `pack_deliveries` row, regenerates the pack
 * HTML by calling the same builders the UI uses (no duplication of the
 * rendering logic — see lib/packRenderer.ts), attaches it to a templated
 * email and ships it via SendGrid. Updates the row's status to
 * 'sent' or 'failed' on completion.
 *
 * If SENDGRID_API_KEY is missing in env, we skip the network call and
 * mark the row failed with reason 'email provider not configured'.
 * Logs a single line so ops can grep for it. Never crashes the worker.
 */
async function handleSendCompliancePack(job: Job): Promise<void> {
  const { firmId, deliveryId, packType } = job.data as {
    firmId: string;
    deliveryId: string;
    packType: string;
  };

  const delivery = await prisma.packDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) {
    logger.warn('send_compliance_pack: delivery row missing', { deliveryId, firmId });
    return;
  }

  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  const firmName = firm?.name ?? 'Your firm';

  // Render the same pack the UI generates. renderPackHtml lives in
  // lib/packRenderer so both this worker and any future export route
  // can call it without going through the HTTP layer.
  let packHtml: string;
  let attachmentFilename: string;
  try {
    const rendered = await renderPackHtml(firmId, packType);
    packHtml = rendered.html;
    attachmentFilename = rendered.filename;
  } catch (renderErr) {
    const reason =
      renderErr instanceof Error
        ? `pack generation failed: ${renderErr.message}`
        : 'pack generation failed';
    await prisma.packDelivery.update({
      where: { id: deliveryId },
      data: { status: 'failed', failureReason: reason },
    });
    logger.error('send_compliance_pack: pack generation failed', {
      deliveryId,
      firmId,
      packType,
      err: renderErr instanceof Error ? renderErr.message : String(renderErr),
    });
    return;
  }

  const packLabel =
    packType === 'sra_audit'
      ? 'SRA Inspection Pack'
      : packType === 'pii_renewal'
        ? 'PII Renewal Pack'
        : 'Compliance Pack';

  const recipientGreeting = delivery.recipientName
    ? `Hi ${delivery.recipientName},`
    : 'Hi,';
  const coverNote = (delivery.message || '').trim();

  const bodyHtml = `
    <h2>${packLabel}</h2>
    <p>${recipientGreeting}</p>
    <p>${escapeHtml(coverNote) || `Please find attached our ${packLabel} for review.`}</p>
    <p>This pack was prepared and sent on behalf of <strong>${escapeHtml(firmName)}</strong> via the Seema compliance platform.</p>
    <p>If you have any questions, please reply directly to this email.</p>
  `;

  // Hard-fail safe: if the API key isn't set we don't even try the
  // SendGrid call — log a clearly-greppable line and mark the delivery
  // failed so the COLP can see "email provider not configured" in the
  // UI history rather than a misleading "network error".
  if (!SENDGRID_API_KEY) {
    logger.warn(
      `[email-worker] EMAIL NOT SENT — SENDGRID_API_KEY missing, would have sent to ${delivery.recipientEmail} (delivery=${deliveryId}, packType=${packType})`
    );
    await prisma.packDelivery.update({
      where: { id: deliveryId },
      data: { status: 'failed', failureReason: 'email provider not configured' },
    });
    return;
  }

  try {
    await sgMail.send({
      to: delivery.recipientEmail,
      from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
      subject: `Compliance pack from ${firmName}`,
      html: wrapTemplate(firmName, bodyHtml),
      attachments: [
        {
          // The existing pack generators emit HTML rather than raw PDF
          // bytes; we attach the HTML directly so we don't reinvent the
          // PDF pipeline. Recipients open it in any browser and use
          // "Print → Save as PDF" exactly like the in-app download flow.
          content: Buffer.from(packHtml, 'utf-8').toString('base64'),
          filename: attachmentFilename,
          type: 'text/html',
          disposition: 'attachment',
        },
      ],
    });

    await prisma.packDelivery.update({
      where: { id: deliveryId },
      data: { status: 'sent', failureReason: null },
    });
    logger.info('Compliance pack sent', {
      deliveryId,
      firmId,
      packType,
      to: delivery.recipientEmail,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown SendGrid error';
    await prisma.packDelivery.update({
      where: { id: deliveryId },
      data: { status: 'failed', failureReason: reason },
    });
    logger.error('Compliance pack send failed', {
      deliveryId,
      firmId,
      packType,
      to: delivery.recipientEmail,
      err: reason,
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

/**
 * send_supervision_overdue_digest — daily fan-out job. Fan-out follows the
 * same pattern as send_overdue_chasers / send_daily_digest: scheduler
 * enqueues with no firmId, the handler detects that and re-queues one
 * job per active firm. Each per-firm pass:
 *   1. Loads SupervisionRecord rows for the firm.
 *   2. Computes (today - last_session_date) > cadence_days, plus rows
 *      with no sessions ever.
 *   3. Groups overdue supervisees by supervisor and sends one digest
 *      per supervisor (CC: COLP).
 *
 * SRA Code of Conduct for Firms, Rule 3 — supervision arrangements.
 * No SendGrid? Log + skip; the route still surfaces overdue rows in the UI.
 */
const SUPERVISION_DEFAULT_CADENCE: Record<string, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

function supervisionCadence(r: { cadenceDays: number | null; frequency: string | null }): number {
  if (r.cadenceDays && r.cadenceDays > 0) return r.cadenceDays;
  return SUPERVISION_DEFAULT_CADENCE[(r.frequency ?? '').toLowerCase()] ?? 30;
}

async function handleSendSupervisionOverdueDigest(job: Job): Promise<void> {
  const { firmId } = job.data;

  if (!firmId) {
    await runWithBypass('worker:email:send_supervision_overdue_digest fan-out', async () => {
      const firms = await prisma.firm.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const f of firms) {
        await emailQueue.add('send_supervision_overdue_digest', { firmId: f.id });
      }
      logger.info('Supervision overdue digest fan-out queued', { count: firms.length });
    });
    return;
  }

  const firm = await prisma.firm.findUnique({ where: { id: firmId } });
  if (!firm) return;

  const records = await prisma.supervisionRecord.findMany({ where: { firmId } });
  const now = Date.now();

  // Group overdue rows by supervisor name.
  const grouped = new Map<string, Array<{ supervisee: string; lastSession: Date | null; daysSince: number | null }>>();

  for (const r of records) {
    const cadence = supervisionCadence(r);
    const lastSessionRow = await prisma.supervisionSession.findFirst({
      where: { firmId, relationshipId: r.id },
      orderBy: { sessionDate: 'desc' },
      select: { sessionDate: true },
    });
    const lastDate = lastSessionRow?.sessionDate ?? r.lastSession ?? null;

    let isOverdue = false;
    let daysSince: number | null = null;
    if (!lastDate) {
      isOverdue = true;
    } else {
      daysSince = Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
      isOverdue = daysSince > cadence;
    }
    if (!isOverdue) continue;

    const supervisor = r.supervisor ?? 'Unassigned';
    const list = grouped.get(supervisor) ?? [];
    list.push({
      supervisee: r.staffName ?? 'Unknown supervisee',
      lastSession: lastDate,
      daysSince,
    });
    grouped.set(supervisor, list);
  }

  if (grouped.size === 0) {
    logger.info('Supervision overdue digest: nothing overdue', { firmId });
    return;
  }

  // Resolve a CC for the COLP if we can.
  const colpUser = await prisma.userAccount.findFirst({
    where: { firmId, role: 'colp', isActive: true },
    select: { email: true },
  });
  const colpEmail = colpUser?.email ?? null;

  for (const [supervisorName, items] of grouped) {
    // Match supervisor name → user account email via staff_members.
    const staff = await prisma.staffMember.findFirst({
      where: { firmId, name: supervisorName },
      select: { id: true, email: true },
    });
    let supervisorEmail: string | null = staff?.email ?? null;
    if (!supervisorEmail && staff?.id) {
      const acct = await prisma.userAccount.findFirst({
        where: { firmId, staffId: staff.id, isActive: true },
        select: { email: true },
      });
      supervisorEmail = acct?.email ?? null;
    }
    if (!supervisorEmail) {
      logger.warn('Supervision digest: no email for supervisor', { firmId, supervisorName });
      continue;
    }

    const lines = items
      .map((i) => {
        const last = i.lastSession
          ? `last session ${new Date(i.lastSession).toLocaleDateString('en-GB')} (${i.daysSince} days ago)`
          : 'no sessions on record';
        return `  - ${i.supervisee} — ${last}`;
      })
      .join('\n');

    const subject = `[Seema] ${items.length} overdue supervision sessions — please action`;
    const body = `Hi ${supervisorName},

The following supervisees have overdue supervision sessions under your supervision:

${lines}

This reminder is sent under the SRA Code of Conduct for Firms, Rule 3 — supervision arrangements.

Please log a session in Seema once each meeting takes place:
https://app.seema.legal/supervision

— Seema`;

    if (!process.env.SENDGRID_API_KEY) {
      logger.info('[email-worker] SUPERVISION DIGEST NOT SENT — SENDGRID_API_KEY missing', {
        firmId,
        to: supervisorEmail,
        cc: colpEmail,
        subject,
        items: items.length,
      });
      continue;
    }

    try {
      await sgMail.send({
        to: supervisorEmail,
        cc: colpEmail && colpEmail !== supervisorEmail ? colpEmail : undefined,
        from: { email: EMAIL_FROM, name: EMAIL_FROM_NAME },
        subject,
        text: body,
      });
      logger.info('Supervision overdue digest sent', { firmId, to: supervisorEmail, items: items.length });
    } catch (err) {
      logger.error('Failed to send supervision overdue digest', {
        firmId,
        to: supervisorEmail,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}

async function handleRetryFailedEmails(job: Job): Promise<void> {
  const { firmId } = job.data;

  const where: Record<string, unknown> = { status: 'failed' };
  if (firmId) where.firmId = firmId;

  const failedItems = await prisma.emailQueueItem.findMany({ where });

  for (const item of failedItems) {
    await prisma.emailQueueItem.update({
      where: { id: item.id },
      data: { status: 'queued' },
    });

    // Fetch the template body to use as email content
    const template = item.templateId
      ? await prisma.emailTemplate.findUnique({ where: { id: item.templateId } })
      : null;

    await emailQueue.add('send_email', {
      to: item.recipient,
      subject: item.subject,
      html: template?.body ?? '',
      firmId: item.firmId,
    }, { attempts: 3 }); // Retry logic handled by BullMQ job attempts
  }

  logger.info('Retried failed emails', { count: failedItems.length, firmId: firmId ?? 'all' });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const emailWorker = new Worker(
  'email',
  async (job: Job) => {
    logger.info(`Processing email job: ${job.name}`, { jobId: job.id, data: job.data });

    // Pick the tenant scope for this job: scoped when firmId is in the job
    // payload, system-wide bypass when not (e.g. retry_failed_emails cron
    // without a specific firm). Every Prisma call inside the dispatcher
    // inherits this AsyncLocalStorage context.
    const firmId = (job.data as { firmId?: string }).firmId;
    const dispatch = async () => {
      switch (job.name) {
        case 'send_email':
          await handleSendEmail(job);
          break;
        case 'send_training_chase':
          await handleSendTrainingChase(job);
          break;
        case 'send_overdue_chasers':
          await handleSendOverdueChasers(job);
          break;
        case 'send_daily_digest':
          await handleSendDailyDigest(job);
          break;
        case 'send_weekly_summary':
          await handleSendWeeklySummary(job);
          break;
        case 'retry_failed_emails':
          await handleRetryFailedEmails(job);
          break;
        case 'send_compliance_pack':
          await handleSendCompliancePack(job);
          break;
        case 'send_supervision_overdue_digest':
          await handleSendSupervisionOverdueDigest(job);
          break;
        default:
          logger.warn(`Unknown email job type: ${job.name}`);
      }
    };

    if (firmId) {
      await runWithFirm(firmId, dispatch);
    } else {
      await runWithBypass(`worker:email:${job.name} (no firmId in job payload)`, dispatch);
    }
  },
  {
    connection: redis,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);

emailWorker.on('completed', (job) => {
  logger.info(`Email job completed: ${job.name}`, { jobId: job.id });
});

emailWorker.on('failed', (job, err) => {
  logger.error(`Email job failed: ${job?.name}`, { jobId: job?.id, error: err.message });
});

export { emailQueue };
export default emailWorker;
