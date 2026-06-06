import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant context.
 *
 * Stores the firmId for the lifetime of the current async chain so that
 * the Prisma extension (see prisma.ts) can read it when wrapping queries
 * with `SET LOCAL app.current_firm_id = '<id>'`.
 *
 * `bypass: true` means the caller is intentionally running outside any
 * tenant scope (system jobs, login lookup, cron). Bypass MUST be used
 * via the runWithBypass() helper so it's grep-able and auditable.
 */
export interface TenantContext {
  firmId: string | null;
  bypass: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}

/**
 * Run `fn` with the given firmId set as the current tenant. All Prisma
 * queries inside this scope will be wrapped in `SET LOCAL app.current_firm_id`.
 */
export function runWithFirm<T>(firmId: string, fn: () => Promise<T> | T): Promise<T> | T {
  if (!firmId) {
    throw new Error('runWithFirm called with empty firmId — refusing to set null tenant context');
  }
  return storage.run({ firmId, bypass: false }, fn);
}

/**
 * Run `fn` with RLS bypass. Use ONLY for:
 *   - the login flow (looking up a user by email before we know their firm)
 *   - background workers doing system-wide maintenance
 *   - data migration scripts
 *
 * Anything inside the bypass scope sees ALL rows from ALL firms.
 * This is the equivalent of running as the seema_admin role — treat it
 * like sudo. Every call site should have a comment justifying the bypass.
 */
export function runWithBypass<T>(reason: string, fn: () => Promise<T> | T): Promise<T> | T {
  if (!reason || reason.length < 10) {
    throw new Error('runWithBypass requires a meaningful reason (>= 10 chars) for audit purposes');
  }
  return storage.run({ firmId: null, bypass: true }, fn);
}
