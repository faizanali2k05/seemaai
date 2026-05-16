import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { runWithBypass } from '../lib/tenantContext.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createAlertIfNotExists(
  firmId: string,
  alertType: string,
  title: string,
  description: string,
  severity: string
): Promise<boolean> {
  // Deduplicate by alertType + title for the same firm with open status
  const existing = await prisma.complianceAlert.findFirst({
    where: { firmId, alertType, title, status: 'open' },
  });

  if (existing) return false;

  await prisma.complianceAlert.create({
    data: { firmId, alertType, title, description, severity, status: 'open' },
  });

  return true;
}

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

async function handleCheckOverdueTraining(_job: Job): Promise<void> {
  const now = new Date();

  // dueDate is a Postgres `timestamp` — compare against a real Date.
  // Previously this was treated as a string (Prisma schema said VarChar);
  // the mismatch caused `22P03 incorrect binary data format` every run.
  const overdueTraining = await prisma.staffTraining.findMany({
    where: {
      dueDate: { lt: now },
      status: { not: 'completed' },
    },
  });

  let createdCount = 0;

  for (const training of overdueTraining) {
    if (!training.staffId || !training.dueDate) continue;

    // StaffTraining has no user relation; look up StaffMember separately
    const staffMember = await prisma.staffMember.findFirst({
      where: { id: training.staffId, firmId: training.firmId },
    });
    const staffName = staffMember?.name ?? 'Unknown staff';
    // Title comes from either `title` (newer) or `courseName` (legacy) column.
    const courseTitle = training.title ?? training.courseName ?? 'training';

    const created = await createAlertIfNotExists(
      training.firmId,
      'overdue_training',
      `Overdue Training: ${courseTitle}`,
      `${staffName} has not completed "${courseTitle}" (due ${new Date(training.dueDate).toLocaleDateString('en-GB')}).`,
      'high'
    );
    if (created) createdCount++;
  }

  logger.info('Overdue training check complete', { overdueCount: overdueTraining.length, alertsCreated: createdCount });
}

async function handleCheckPolicyReviews(_job: Job): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const policies = await prisma.policyDocument.findMany({
    where: { nextReview: { lte: today } },
  });

  let createdCount = 0;

  for (const policy of policies) {
    const created = await createAlertIfNotExists(
      policy.firmId,
      'policy_review_due',
      `Policy Review Due: ${policy.title}`,
      `"${policy.title}" was due for review by ${policy.nextReview ? new Date(policy.nextReview).toLocaleDateString('en-GB') : 'N/A'}.`,
      'medium'
    );
    if (created) createdCount++;
  }

  logger.info('Policy review check complete', { policiesFound: policies.length, alertsCreated: createdCount });
}

async function handleCheckSupervisionDue(_job: Job): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const records = await prisma.supervisionRecord.findMany({
    where: {
      nextDue: { lte: today },
      status: 'scheduled',
    },
  });

  let createdCount = 0;

  for (const record of records) {
    if (!record.nextDue) continue;
    // SupervisionRecord has no relations; use the staffName field directly
    const name = record.staffName;
    const created = await createAlertIfNotExists(
      record.firmId,
      'supervision_due',
      `Supervision Due: ${name}`,
      `Supervision session for ${name} is due (scheduled ${new Date(record.nextDue).toLocaleDateString('en-GB')}).`,
      'medium'
    );
    if (created) createdCount++;
  }

  logger.info('Supervision check complete', { recordsFound: records.length, alertsCreated: createdCount });
}

async function handleCheckDeadlines(_job: Job): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const deadlines = await prisma.deadline.findMany({
    where: {
      dueDate: { lte: nextWeek },
      status: { not: 'completed' },
    },
  });

  let createdCount = 0;

  for (const deadline of deadlines) {
    const daysUntil = Math.ceil(
      (new Date(deadline.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    const severity = daysUntil <= 0 ? 'critical' : daysUntil <= 3 ? 'high' : 'medium';

    const created = await createAlertIfNotExists(
      deadline.firmId,
      'deadline_approaching',
      `Deadline: ${deadline.title}`,
      `"${deadline.title}" is due ${daysUntil <= 0 ? 'overdue' : `in ${daysUntil} day(s)`} (${new Date(deadline.dueDate).toLocaleDateString('en-GB')}).`,
      severity
    );
    if (created) createdCount++;
  }

  logger.info('Deadline check complete', { deadlinesFound: deadlines.length, alertsCreated: createdCount });
}

async function handleCheckUndertakings(_job: Job): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const undertakings = await prisma.undertaking.findMany({
    where: {
      dueDate: { lte: today },
      status: 'active',
    },
  });

  let createdCount = 0;

  for (const undertaking of undertakings) {
    if (!undertaking.dueDate) continue;
    const created = await createAlertIfNotExists(
      undertaking.firmId,
      'undertaking_overdue',
      `Undertaking Overdue: ${undertaking.description?.substring(0, 60) ?? undertaking.id}`,
      `An active undertaking is past its due date (${new Date(undertaking.dueDate).toLocaleDateString('en-GB')}).`,
      'critical'
    );
    if (created) createdCount++;
  }

  logger.info('Undertaking check complete', { undertakingsFound: undertakings.length, alertsCreated: createdCount });
}

async function handleGenerateRiskScores(_job: Job): Promise<void> {
  const SEVERITY_WEIGHTS: Record<string, number> = {
    critical: 10,
    high: 5,
    medium: 2,
    low: 1,
  };

  const firms = await prisma.firm.findMany({ select: { id: true, name: true } });

  for (const firm of firms) {
    const alerts = await prisma.complianceAlert.findMany({
      where: { firmId: firm.id, resolvedAt: null },
      select: { severity: true },
    });

    let totalScore = 0;
    const breakdown: Record<string, number> = {};

    for (const alert of alerts) {
      const severity = alert.severity ?? 'low';
      const weight = SEVERITY_WEIGHTS[severity] ?? 1;
      totalScore += weight;
      breakdown[severity] = (breakdown[severity] ?? 0) + 1;
    }

    // Normalise to 0-100 scale (cap at 100)
    const normalisedScore = Math.min(100, totalScore);
    const riskStatus = normalisedScore >= 70 ? 'fail' : normalisedScore >= 40 ? 'warning' : 'pass';

    // ComplianceScanResult has: scanDate, category, checkName, status, details, recommendation
    await prisma.complianceScanResult.create({
      data: {
        firmId: firm.id,
        scanDate: new Date(),
        category: 'risk_score',
        checkName: 'Overall Risk',
        status: riskStatus,
        details: JSON.stringify({ score: normalisedScore, breakdown }),
        recommendation: normalisedScore >= 70
          ? 'Immediate attention required — multiple unresolved compliance alerts.'
          : normalisedScore >= 40
            ? 'Review outstanding alerts to reduce risk exposure.'
            : 'Risk levels are within acceptable range.',
      },
    });

    logger.debug('Risk score updated', { firmId: firm.id, score: normalisedScore, breakdown });
  }

  logger.info('Risk score generation complete', { firmCount: firms.length });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const complianceWorker = new Worker(
  'compliance',
  async (job: Job) => {
    logger.info(`Processing compliance job: ${job.name}`, { jobId: job.id });

    // Compliance scans iterate across every firm to find overdue items,
    // then write alerts on each firm's behalf. Inherently cross-tenant —
    // run under bypass.
    //
    // Trade-off: writes happen with RLS bypassed too. For a stronger
    // pattern you could nest `runWithFirm(target.firmId, ...)` around
    // each per-firm write inside the scans. We accept the simpler bypass
    // here because these are system jobs, not user-initiated requests.
    await runWithBypass(`worker:compliance:${job.name} (cross-firm scan + per-firm writes)`, async () => {
      switch (job.name) {
        case 'check_overdue_training':
          await handleCheckOverdueTraining(job);
          break;
        case 'check_policy_reviews':
          await handleCheckPolicyReviews(job);
          break;
        case 'check_supervision_due':
          await handleCheckSupervisionDue(job);
          break;
        case 'check_deadlines':
          await handleCheckDeadlines(job);
          break;
        case 'check_undertakings':
          await handleCheckUndertakings(job);
          break;
        case 'generate_risk_scores':
          await handleGenerateRiskScores(job);
          break;
        default:
          logger.warn(`Unknown compliance job type: ${job.name}`);
      }
    });
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

complianceWorker.on('completed', (job) => {
  logger.info(`Compliance job completed: ${job.name}`, { jobId: job.id });
});

complianceWorker.on('failed', (job, err) => {
  logger.error(`Compliance job failed: ${job?.name}`, { jobId: job?.id, error: err.message });
});

export default complianceWorker;
