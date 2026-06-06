import dotenv from 'dotenv';
dotenv.config();

// ---------------------------------------------------------------------------
// Sentry — env-gated. Initialised BEFORE any other imports/middleware so its
// request/error handlers can wrap the whole pipeline. No-op without SENTRY_DSN.
// ---------------------------------------------------------------------------
const SENTRY_DSN = (process.env.SENTRY_DSN || '').trim();
let Sentry: typeof import('@sentry/node') | null = null;
if (SENTRY_DSN) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sentry = require('@sentry/node');
    Sentry!.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
      // Don't send default PII (request headers/body/IP)
      sendDefaultPii: false,
    });
    // eslint-disable-next-line no-console
    console.log(`Sentry initialised (env=${process.env.NODE_ENV || 'development'})`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      'SENTRY_DSN set but @sentry/node not installed — `npm install @sentry/node` or remove SENTRY_DSN'
    );
  }
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { defaultLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import logger from './utils/logger';
import prisma, { adminPrisma } from './lib/prisma';

// Route imports
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import complianceRoutes from './routes/compliance';
import breachRoutes from './routes/breach';
import staffRoutes from './routes/staff';
import mattersRoutes from './routes/matters';
import evidenceRoutes from './routes/evidence';
import amlRoutes from './routes/aml';
import accountsRoutes from './routes/accounts';
import intakeRoutes from './routes/intake';
import conflictsRoutes from './routes/conflicts';
import undertakingsRoutes from './routes/undertakings';
import complaintsRoutes from './routes/complaints';
import chasersRoutes from './routes/chasers';
import supervisionRoutes from './routes/supervision';
import remediationRoutes from './routes/remediation';
import deadlinesRoutes from './routes/deadlines';
import keyDatesRoutes from './routes/keyDates';
import auditRoutes from './routes/audit';
import piiRenewalRoutes from './routes/piiRenewal';
import packDeliveriesRoutes from './routes/packDeliveries';
import policiesRoutes from './routes/policies';
import staffPortalRoutes from './routes/staffPortal';
import sraReturnRoutes from './routes/sraReturn';
import emailAdminRoutes from './routes/emailAdmin';
import dataManagementRoutes from './routes/dataManagement';
import miscRoutes from './routes/misc';
import billingRoutes, { stripeWebhookRouter } from './routes/billing';
import integrationsRoutes from './routes/integrations';
import aiProxyRoutes from './routes/aiProxy';

const app = express();

// Sentry request handler must come BEFORE any other middleware (incl. errors).
if (Sentry) {
  const handler = (Sentry as any).Handlers?.requestHandler?.();
  if (handler) app.use(handler);
}

// ---------------------------------------------------------------------------
// Stripe webhook (needs raw body — must come BEFORE express.json())
// ---------------------------------------------------------------------------
app.use('/api/billing', stripeWebhookRouter);

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(helmet());

// CORS origins from env (comma-separated). Falls back to localhost-only in
// dev. In production, set CORS_ORIGINS=https://seemaai.co.uk,https://www.seemaai.co.uk
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(defaultLimiter);
app.use(requestLogger);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'seema-node',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// All routers below define their own full feature paths internally
// (e.g. router.post('/auth/register', ...) inside authRoutes), so they
// are mounted at the bare /api prefix to avoid double-prefixing the URL.
// The only exceptions are billingRoutes and integrationsRoutes, whose
// internal routes use relative action names (/subscription, /clio/...)
// and so are mounted at their feature path.

app.use('/api', authRoutes);            // /api/auth/login, /api/auth/register, ...
app.use('/api', dashboardRoutes);       // /api/dashboard/stats, /api/compliance/daily-briefing
app.use('/api', complianceRoutes);      // /api/compliance/alerts, /api/compliance/checks
app.use('/api', breachRoutes);          // /api/compliance/breach-reports
app.use('/api', staffRoutes);           // /api/compliance/staff, /api/compliance/training
app.use('/api', mattersRoutes);         // /api/compliance/matters
app.use('/api', evidenceRoutes);        // /api/compliance/evidence
app.use('/api', amlRoutes);             // /api/compliance/aml/...
app.use('/api', accountsRoutes);        // /api/compliance/accounts
app.use('/api', intakeRoutes);          // /api/compliance/intake
app.use('/api', conflictsRoutes);       // /api/compliance/conflicts
app.use('/api', undertakingsRoutes);    // /api/compliance/undertakings
app.use('/api', complaintsRoutes);      // /api/compliance/complaints
app.use('/api', chasersRoutes);         // /api/compliance/chasers
app.use('/api', supervisionRoutes);     // /api/compliance/supervision
app.use('/api', remediationRoutes);     // /api/compliance/remediation-plans
app.use('/api', deadlinesRoutes);       // /api/compliance/deadlines
app.use('/api', keyDatesRoutes);        // /api/compliance/key-dates/...
app.use('/api', auditRoutes);           // /api/compliance/audit-trail
app.use('/api', piiRenewalRoutes);      // /api/compliance/pii-renewal-pack/generate
app.use('/api', packDeliveriesRoutes);  // /api/packs/:packType/send, /api/packs/:packType/deliveries
app.use('/api', policiesRoutes);        // /api/compliance/policies
app.use('/api', staffPortalRoutes);     // /api/staff/portal, /api/staff/log-action
app.use('/api', sraReturnRoutes);       // /api/compliance/sra-return
app.use('/api', emailAdminRoutes);      // /api/admin/email-settings, ...
app.use('/api', dataManagementRoutes);  // /api/admin/import-logs, /api/admin/import/staff

// Style-B routers (relative internal paths) keep their feature mount:
app.use('/api/billing', billingRoutes);          // /api/billing/subscription, /api/billing/upgrade
app.use('/api/integrations', integrationsRoutes); // /api/integrations/clio/auth-url

// AI proxy and misc are explicit /api mounts (no internal feature prefix needed):
app.use('/api', aiProxyRoutes);
app.use('/api', miscRoutes);

// ---------------------------------------------------------------------------
// Sentry error handler — must come BEFORE our own errorHandler so it can
// capture exceptions before the response is sent.
// ---------------------------------------------------------------------------
if (Sentry) {
  const handler = (Sentry as any).Handlers?.errorHandler?.();
  if (handler) app.use(handler);
}

// ---------------------------------------------------------------------------
// Error handler (must be last in the chain)
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server + graceful shutdown
//
// Without this, every `docker compose stop` / `kill` mid-deploy kills any
// in-flight requests and leaves transactions hanging. We:
//   1. Capture the HTTP server handle from app.listen().
//   2. On SIGTERM/SIGINT, stop accepting new connections (`server.close`).
//   3. Drain BullMQ-style work isn't relevant here (that's the workers
//      process), but we do close Prisma's connection pools so Postgres
//      isn't holding stale handles.
//   4. Force-exit after FORCE_EXIT_MS if anything is still hung — better
//      than blocking deploys.
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '4000', 10);
const FORCE_EXIT_MS = 10_000;

const server = app.listen(PORT, () => {
  logger.info(`seema-node API listening on port ${PORT}`, {
    env: process.env.NODE_ENV || 'development',
    cors: corsOrigins,
    sentry: Boolean(Sentry),
  });
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal} — graceful shutdown starting`);

  // 1. Stop accepting new HTTP requests + drain in-flight ones.
  await new Promise<void>((resolve) => {
    server.close((err) => {
      if (err) logger.error('Error closing HTTP server', { err: String(err) });
      resolve();
    });
  });
  logger.info('HTTP server closed');

  // 2. Disconnect Prisma pools.
  try {
    await prisma.$disconnect();
    await adminPrisma.$disconnect();
    logger.info('Prisma pools disconnected');
  } catch (err) {
    logger.error('Error disconnecting Prisma', { err: String(err) });
  }

  // 3. Flush Sentry (sends any buffered events before exit).
  if (Sentry) {
    try {
      await (Sentry as any).close?.(2000);
    } catch (_err) { /* ignore */ }
  }

  process.exit(0);
}

// Force-exit timeout if shutdown hangs.
process.on('SIGTERM', () => {
  setTimeout(() => {
    logger.error(`Shutdown took longer than ${FORCE_EXIT_MS}ms — force exit`);
    process.exit(1);
  }, FORCE_EXIT_MS).unref();
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  setTimeout(() => process.exit(1), FORCE_EXIT_MS).unref();
  void shutdown('SIGINT');
});

export default app;
