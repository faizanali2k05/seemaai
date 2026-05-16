import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantContext } from './tenantContext.js';

/**
 * Tenant-aware Prisma client.
 *
 * Wraps the base PrismaClient in a Proxy so every model query
 * (e.g. prisma.matter.findMany(...)) is transparently executed inside an
 * interactive transaction with `SET LOCAL app.current_firm_id = '<id>'`.
 * That session GUC drives the RLS policies defined in the enable_rls
 * migration. Without it (or with the wrong firm), Postgres returns zero
 * rows / blocks writes — fail-closed.
 *
 * Performance note: every query becomes BEGIN + SET LOCAL + query + COMMIT
 * (3 extra round trips). For typical request volumes that's a few extra
 * milliseconds; acceptable cost for defence-in-depth tenant isolation.
 *
 * Top-level methods (prisma.$transaction, prisma.$queryRaw, prisma.$executeRaw,
 * prisma.$connect/$disconnect/$on) are passed through to the base client.
 * If you call $transaction/$queryRaw directly you are responsible for
 * setting the GUC inside the tx yourself — use the runWithFirm helper or
 * call prisma.$forFirm(...) for ergonomic access.
 */

const globalForPrisma = globalThis as unknown as {
  basePrisma: PrismaClient | undefined;
  adminPrismaClient: PrismaClient | undefined;
};

const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

/**
 * Admin client that connects as seema_admin (BYPASSRLS). Use via
 * `adminPrisma` for system operations: login lookups, registration,
 * Stripe webhooks, and worker bootstrap. Every use should be paired
 * with an audit log entry.
 *
 * If ADMIN_DATABASE_URL is not set we fall back to the default DATABASE_URL
 * — fine for local dev where you might be running as superuser, dangerous
 * in production. The runtime check below logs a warning in that case.
 */
const adminPrismaClient =
  globalForPrisma.adminPrismaClient ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || '',
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.basePrisma = basePrisma;
  globalForPrisma.adminPrismaClient = adminPrismaClient;
}

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[prisma] ADMIN_DATABASE_URL is not set — admin client is using DATABASE_URL. ' +
      'In production this means RLS bypass operations run as the application role and ' +
      'will return zero rows / be blocked. Set ADMIN_DATABASE_URL to a seema_admin connection string.'
  );
}

export const adminPrisma = adminPrismaClient;

// --- Methods that should NOT be wrapped (passed through to base client) ---
const PASSTHROUGH_KEYS = new Set<string | symbol>([
  '$connect',
  '$disconnect',
  '$on',
  '$use',
  '$extends',
  '$transaction',
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
  '$runCommandRaw',
  'then', // so promise detection doesn't trip
  Symbol.toStringTag,
  Symbol.iterator,
  Symbol.asyncIterator,
]);

class TenantContextMissingError extends Error {
  constructor(operation: string) {
    super(
      `Prisma operation "${operation}" ran outside any tenant context. ` +
        `Wrap the call in runWithFirm(firmId, () => ...) or runWithBypass(reason, () => ...).`
    );
    this.name = 'TenantContextMissingError';
  }
}

/**
 * Escape a firmId for inline SQL. firmIds are UUIDs (36-char strings of
 * [0-9a-f-]) so this is belt-and-braces — we still validate to refuse
 * anything that looks suspicious.
 */
function safeFirmId(firmId: string): string {
  if (!/^[0-9a-fA-F-]{32,40}$/.test(firmId)) {
    throw new Error(`Refusing to use suspicious firmId in SQL: "${firmId}"`);
  }
  return firmId;
}

function isModelKey(target: PrismaClient, key: string | symbol): boolean {
  if (typeof key !== 'string') return false;
  if (key.startsWith('$') || key.startsWith('_')) return false;
  const value = (target as any)[key];
  return value && typeof value === 'object';
}

const prismaProxy = new Proxy(basePrisma, {
  get(target, prop, receiver) {
    if (PASSTHROUGH_KEYS.has(prop)) {
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }

    if (!isModelKey(target, prop)) {
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }

    const modelName = prop as string;
    const model = (target as any)[modelName];

    return new Proxy(model, {
      get(modelTarget, methodName, modelReceiver) {
        const original = Reflect.get(modelTarget, methodName, modelReceiver);
        if (typeof original !== 'function') return original;

        return (...args: unknown[]) => {
          const ctx = getTenantContext();

          if (!ctx) {
            // Fail closed: refuse to run any model query without explicit
            // tenant context. This catches forgotten middleware/worker setup
            // at request time rather than silently leaking data.
            throw new TenantContextMissingError(`${modelName}.${String(methodName)}`);
          }

          if (ctx.bypass) {
            // Bypass mode: route through adminPrisma which connects as
            // seema_admin (BYPASSRLS). This is the ONLY way to truly skip
            // RLS — running the query on basePrisma (seema_app) would still
            // hit the policies and return zero rows.
            const adminModel = (adminPrismaClient as any)[modelName];
            const adminMethod = adminModel[methodName as string];
            return adminMethod.apply(adminModel, args);
          }

          const firmId = safeFirmId(ctx.firmId!);

          return basePrisma.$transaction(async (tx) => {
            // Use set_config(..., true) to mark the value as transaction-local.
            await tx.$executeRawUnsafe(
              `SELECT set_config('app.current_firm_id', '${firmId}', true)`
            );
            const txModel = (tx as any)[modelName];
            const txMethod = txModel[methodName as string];
            return txMethod.apply(txModel, args);
          });
        };
      },
    });
  },
});

// Type assertion: the proxy mirrors PrismaClient's surface for TypeScript.
const prisma = prismaProxy as PrismaClient;

export default prisma;
export { basePrisma, TenantContextMissingError };

/**
 * Convenience helper for one-off tenant-scoped operations outside an
 * Express request (e.g. inside a worker). Equivalent to:
 *   runWithFirm(firmId, () => prisma.foo.bar(...))
 */
export async function withFirm<T>(firmId: string, fn: (client: typeof prisma) => Promise<T>): Promise<T> {
  const { runWithFirm } = await import('./tenantContext.js');
  return runWithFirm(firmId, () => fn(prisma));
}
