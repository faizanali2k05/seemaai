import { Worker, Job, Queue } from 'bullmq';
import redis from '../lib/redis.js';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { ClioSyncEngine } from '../services/clio.js';
import { runWithBypass, runWithFirm } from '../lib/tenantContext.js';

const integrationQueue = new Queue('integration', { connection: redis });

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

async function handleSyncClioFirm(job: Job): Promise<void> {
  const { firmId } = job.data;

  logger.info('Starting Clio sync for firm', { firmId });

  const engine = new ClioSyncEngine();
  await engine.sync(firmId);

  logger.info('Clio sync complete for firm', { firmId });
}

async function handleSyncAllClio(_job: Job): Promise<void> {
  const integrations = await prisma.integration.findMany({
    where: {
      provider: 'clio',
      status: 'connected',
    },
    select: { firmId: true },
  });

  for (const integration of integrations) {
    await integrationQueue.add('sync_clio_firm', { firmId: integration.firmId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  logger.info('Queued Clio sync for all connected firms', { count: integrations.length });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const integrationWorker = new Worker(
  'integration',
  async (job: Job) => {
    logger.info(`Processing integration job: ${job.name}`, { jobId: job.id });

    const firmId = (job.data as { firmId?: string }).firmId;
    const dispatch = async () => {
      switch (job.name) {
        case 'sync_clio_firm':
          await handleSyncClioFirm(job);
          break;
        case 'sync_all_clio':
          await handleSyncAllClio(job);
          break;
        default:
          logger.warn(`Unknown integration job type: ${job.name}`);
      }
    };

    if (firmId) {
      // sync_clio_firm carries firmId — scoped per-firm sync
      await runWithFirm(firmId, dispatch);
    } else {
      // sync_all_clio iterates connected firms — bypass for the read,
      // and the per-firm sync jobs it enqueues will hit this same worker
      // with firmId set (taking the runWithFirm branch above).
      await runWithBypass(`worker:integration:${job.name} (cross-firm cron)`, dispatch);
    }
  },
  {
    connection: redis,
    concurrency: 2,
  }
);

integrationWorker.on('completed', (job) => {
  logger.info(`Integration job completed: ${job.name}`, { jobId: job.id });
});

integrationWorker.on('failed', (job, err) => {
  logger.error(`Integration job failed: ${job?.name}`, { jobId: job?.id, error: err.message });
});

export { integrationQueue };
export default integrationWorker;
