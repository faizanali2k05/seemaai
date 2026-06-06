import { Worker, Job } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { stripe } from '../services/billing.js';
import { runWithBypass } from '../lib/tenantContext.js';

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

async function handleCheckRenewals(_job: Job): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const allFirms = await prisma.firm.findMany({
    where: {
      nextBillingDate: { not: null },
      stripeSubscriptionId: { not: null },
      subscriptionStatus: 'active',
    },
    select: { id: true, name: true, nextBillingDate: true, subscriptionTier: true },
  });

  // nextBillingDate is a String (varchar 30), not DateTime — filter in JS
  const firms = allFirms.filter(
    (f) => f.nextBillingDate && new Date(f.nextBillingDate) <= tomorrow,
  );

  for (const firm of firms) {
    logger.info('Upcoming renewal', {
      firmId: firm.id,
      firmName: firm.name,
      tier: firm.subscriptionTier,
      nextBillingDate: firm.nextBillingDate,
    });
  }

  logger.info('Renewal check complete', { firmsFound: firms.length });
}

async function handleSyncStripeStatus(_job: Job): Promise<void> {
  const firms = await prisma.firm.findMany({
    where: {
      stripeSubscriptionId: { not: null },
    },
    select: {
      id: true,
      name: true,
      stripeSubscriptionId: true,
      subscriptionStatus: true,
    },
  });

  let updatedCount = 0;

  for (const firm of firms) {
    if (!firm.stripeSubscriptionId) continue;

    try {
      const subscription = await stripe.subscriptions.retrieve(firm.stripeSubscriptionId);
      const stripeStatus = subscription.status;

      if (stripeStatus !== firm.subscriptionStatus) {
        await prisma.firm.update({
          where: { id: firm.id },
          data: {
            subscriptionStatus: stripeStatus,
            ...(subscription.current_period_end
              ? { nextBillingDate: new Date(subscription.current_period_end * 1000).toISOString() }
              : {}),
          },
        });

        logger.info('Stripe status synced', {
          firmId: firm.id,
          firmName: firm.name,
          oldStatus: firm.subscriptionStatus,
          newStatus: stripeStatus,
        });

        updatedCount++;
      }
    } catch (err) {
      logger.error('Failed to sync Stripe status for firm', {
        firmId: firm.id,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  logger.info('Stripe sync complete', { totalFirms: firms.length, updated: updatedCount });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const billingWorker = new Worker(
  'billing',
  async (job: Job) => {
    logger.info(`Processing billing job: ${job.name}`, { jobId: job.id });

    // Both billing jobs scan across all firms (renewal check, Stripe sync),
    // so they run under bypass. The reason string is recorded as audit
    // context by runWithBypass.
    await runWithBypass(`worker:billing:${job.name} (cross-firm cron)`, async () => {
      switch (job.name) {
        case 'check_renewals':
          await handleCheckRenewals(job);
          break;
        case 'sync_stripe_status':
          await handleSyncStripeStatus(job);
          break;
        default:
          logger.warn(`Unknown billing job type: ${job.name}`);
      }
    });
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

billingWorker.on('completed', (job) => {
  logger.info(`Billing job completed: ${job.name}`, { jobId: job.id });
});

billingWorker.on('failed', (job, err) => {
  logger.error(`Billing job failed: ${job?.name}`, { jobId: job?.id, error: err.message });
});

export default billingWorker;
