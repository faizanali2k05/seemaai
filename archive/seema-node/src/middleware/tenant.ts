import { Request, Response, NextFunction } from 'express';
import { runWithFirm } from '../lib/tenantContext.js';

/**
 * Returns a filter object scoped to the authenticated user's firm.
 * Use this in route handlers to ensure all database queries are
 * filtered by firmId for multi-tenant isolation.
 *
 * NOTE: With RLS enabled, the firmId filter is now redundant — the
 * database enforces it. We keep this helper for two reasons:
 *   1. Backward compatibility with existing route code.
 *   2. Defence in depth: the application-level filter still narrows
 *      the query at the SQL planner level, which can use indexes
 *      and improve performance even when RLS would also filter.
 */
export function getTenantFilter(req: Request): { firmId: string } {
  if (!req.user?.firmId) {
    throw new Error('Tenant context unavailable — user is not authenticated');
  }
  return { firmId: req.user.firmId };
}

/**
 * Middleware that validates tenant context is present on the request.
 * Should be applied after the `authenticate` middleware.
 *
 * IMPORTANT: this middleware now ALSO establishes the AsyncLocalStorage
 * tenant context that the Prisma proxy uses to set `app.current_firm_id`
 * inside each query's transaction. Every authenticated route MUST go
 * through this middleware or every Prisma model call will throw
 * TenantContextMissingError.
 */
export function tenantGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.firmId) {
    res.status(403).json({
      error: true,
      message: 'Tenant context missing. Authentication required.',
      statusCode: 403,
    });
    return;
  }

  // Run the rest of the request inside the AsyncLocalStorage scope so
  // any Prisma call (including async ones spawned by the route) inherits
  // the firmId. Calling next() inside runWithFirm propagates the context
  // through the rest of the middleware chain.
  runWithFirm(req.user.firmId, () => {
    next();
  });
}
