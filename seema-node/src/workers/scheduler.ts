import { Queue } from 'bullmq';
import redis from '../lib/redis';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

const emailQueue = new Queue('email', { connection: redis });
const billingQueue = new Queue('billing', { connection: redis });
const complianceQueue = new Queue('compliance', { connection: redis });
const integrationQueue = new Queue('integration', { connection: redis });

// ---------------------------------------------------------------------------
// Schedule definitions
// ---------------------------------------------------------------------------

interface ScheduleEntry {
  queue: Queue;
  name: string;
  pattern: string;
  data?: Record<string, unknown>;
}

const schedules: ScheduleEntry[] = [
  // ---- Email ----
  {
    queue: emailQueue,
    name: 'send_overdue_chasers',
    pattern: '0 9 * * *',          // every day at 9am
  },
  {
    queue: emailQueue,
    name: 'send_daily_digest',
    pattern: '0 18 * * *',         // every day at 6pm
  },
  {
    queue: emailQueue,
    name: 'send_weekly_summary',
    pattern: '0 8 * * 1',          // every Monday at 8am
  },
  {
    queue: emailQueue,
    name: 'retry_failed_emails',
    pattern: '*/30 * * * *',       // every 30 minutes
  },
  {
    // Daily reminder digest: per-supervisor email listing overdue
    // supervisees + last-session date. Fan-out follows the same
    // no-firmId-then-re-queue pattern as send_overdue_chasers.
    queue: emailQueue,
    name: 'send_supervision_overdue_digest',
    pattern: '0 8 * * *',          // every day at 8am
  },

  // ---- Billing ----
  {
    queue: billingQueue,
    name: 'check_renewals',
    pattern: '0 0 * * *',          // every day at midnight
  },
  {
    queue: billingQueue,
    name: 'sync_stripe_status',
    pattern: '0 */6 * * *',        // every 6 hours
  },

  // ---- Compliance ----
  {
    queue: complianceQueue,
    name: 'check_overdue_training',
    pattern: '0 7 * * *',          // daily at 7am
  },
  {
    queue: complianceQueue,
    name: 'check_policy_reviews',
    pattern: '30 7 * * *',         // daily at 7:30am
  },
  {
    queue: complianceQueue,
    name: 'check_supervision_due',
    pattern: '0 8 * * *',          // daily at 8am
  },
  {
    queue: complianceQueue,
    name: 'check_deadlines',
    pattern: '30 8 * * *',         // daily at 8:30am
  },
  {
    queue: complianceQueue,
    name: 'check_undertakings',
    pattern: '0 9 * * *',          // daily at 9am
  },
  {
    queue: complianceQueue,
    name: 'generate_risk_scores',
    pattern: '0 2 * * *',          // daily at 2am
  },

  // ---- Integration ----
  {
    queue: integrationQueue,
    name: 'sync_all_clio',
    pattern: '0 1,9,17 * * *',     // every 8 hours (1am, 9am, 5pm)
  },
];

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function registerSchedules(): Promise<void> {
  logger.info('Registering job schedules...');

  for (const entry of schedules) {
    try {
      await entry.queue.upsertJobScheduler(
        `scheduler:${entry.name}`,
        { pattern: entry.pattern },
        {
          name: entry.name,
          data: entry.data ?? {},
          opts: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { age: 86400, count: 100 },
            removeOnFail: { age: 604800, count: 500 },
          },
        }
      );

      logger.info(`Scheduled: ${entry.name}`, { cron: entry.pattern, queue: entry.queue.name });
    } catch (err) {
      logger.error(`Failed to register schedule: ${entry.name}`, {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  logger.info('All job schedules registered');
}

// Run directly if executed as a standalone script
if (require.main === module) {
  registerSchedules()
    .then(() => {
      logger.info('Scheduler setup complete');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Scheduler setup failed', { error: err.message });
      process.exit(1);
    });
}
