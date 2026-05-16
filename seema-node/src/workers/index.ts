import dotenv from 'dotenv';
dotenv.config();

// Sentry — env-gated, no-op without SENTRY_DSN. Init must come before workers
// so failures during job processing are reported.
const SENTRY_DSN = (process.env.SENTRY_DSN || '').trim();
let Sentry: typeof import('@sentry/node') | null = null;
if (SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sentry = require('@sentry/node');
    Sentry!.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  } catch (_err) {
    // eslint-disable-next-line no-console
    console.warn('SENTRY_DSN set but @sentry/node not installed in workers');
  }
}

import logger from '../utils/logger';
import prisma, { adminPrisma } from '../lib/prisma';

// Import workers — each file creates and starts a BullMQ Worker on construction
import emailWorker from './emailWorker';
import billingWorker from './billingWorker';
import complianceWorker from './complianceWorker';
import integrationWorker from './integrationWorker';

// Register repeatable job schedules
import { registerSchedules } from './scheduler';

const FORCE_EXIT_MS = 15_000;

async function main() {
  logger.info('Starting all BullMQ workers...');

  await registerSchedules();

  logger.info('All workers and schedules registered successfully');
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — graceful worker shutdown`);

  // 1. Stop accepting new jobs + wait for in-flight ones to finish.
  //    Worker.close() resolves once active jobs complete OR the queue is
  //    drained — whichever comes first.
  try {
    await Promise.all([
      emailWorker.close(),
      billingWorker.close(),
      complianceWorker.close(),
      integrationWorker.close(),
    ]);
    logger.info('All BullMQ workers closed');
  } catch (err) {
    logger.error('Error closing workers', { err: String(err) });
  }

  // 2. Disconnect Prisma pools (workers use the same client as the API).
  try {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
  } catch (err) {
    logger.error('Error disconnecting Prisma in workers', { err: String(err) });
  }

  // 3. Flush Sentry.
  if (Sentry) {
    try {
      await (Sentry as any).close?.(2000);
    } catch (_err) { /* ignore */ }
  }

  process.exit(0);
}

process.on('SIGTERM', () => {
  setTimeout(() => {
    logger.error(`Worker shutdown exceeded ${FORCE_EXIT_MS}ms — force exit`);
    process.exit(1);
  }, FORCE_EXIT_MS).unref();
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();
  void shutdown('SIGINT');
});

main().catch((err) => {
  logger.error('Failed to start workers', { error: err });
  process.exit(1);
});
