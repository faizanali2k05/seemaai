import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Tier hierarchy & limits
// ---------------------------------------------------------------------------

const TIER_HIERARCHY: Record<string, number> = {
  starter: 0,
  essentials: 1,
  professional: 2,
};

interface TierLimits {
  maxUsers: number;
  maxPolicies: number;
  maxIntegrations: number;
}

const TIER_LIMITS: Record<string, TierLimits> = {
  starter: {
    maxUsers: 3,
    maxPolicies: 10,
    maxIntegrations: 0,
  },
  essentials: {
    maxUsers: 10,
    maxPolicies: 50,
    maxIntegrations: 1,
  },
  professional: {
    maxUsers: Infinity,
    maxPolicies: Infinity,
    maxIntegrations: Infinity,
  },
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function requireTier(minTier: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        error: true,
        message: 'Authentication required',
        statusCode: 401,
      });
      return;
    }

    const { firmId } = req.user;

    try {
      const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { subscriptionTier: true, name: true },
      });

      if (!firm) {
        res.status(404).json({
          error: true,
          message: 'Firm not found',
          statusCode: 404,
        });
        return;
      }

      const firmTier = firm.subscriptionTier ?? 'starter';
      const firmTierLevel = TIER_HIERARCHY[firmTier] ?? -1;
      const requiredLevel = TIER_HIERARCHY[minTier] ?? 0;

      if (firmTierLevel < requiredLevel) {
        logger.warn('Tier gate blocked request', {
          firmId,
          firmTier,
          requiredTier: minTier,
          path: req.path,
        });

        res.status(403).json({
          error: true,
          message: `This feature requires the ${minTier} plan or above. Your firm is currently on the ${firmTier} plan. Please upgrade to access this feature.`,
          statusCode: 403,
          currentTier: firmTier,
          requiredTier: minTier,
        });
        return;
      }

      next();
    } catch (err) {
      logger.error('Tier gate error', {
        firmId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });

      res.status(500).json({
        error: true,
        message: 'Internal server error',
        statusCode: 500,
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Limit check helpers (can be used in route handlers)
// ---------------------------------------------------------------------------

export async function checkTierLimit(
  firmId: string,
  resource: keyof TierLimits
): Promise<{ allowed: boolean; limit: number; current: number; tier: string }> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { subscriptionTier: true },
  });

  if (!firm) {
    return { allowed: false, limit: 0, current: 0, tier: 'unknown' };
  }

  const firmTier = firm.subscriptionTier ?? 'starter';
  const limits = TIER_LIMITS[firmTier] ?? TIER_LIMITS.starter;
  const limit = limits[resource];

  let current = 0;

  switch (resource) {
    case 'maxUsers':
      current = await prisma.userAccount.count({ where: { firmId, isActive: true } });
      break;
    case 'maxPolicies':
      current = await prisma.policyDocument.count({ where: { firmId } });
      break;
    case 'maxIntegrations':
      current = await prisma.integration.count({ where: { firmId, status: { not: 'disconnected' } } });
      break;
  }

  return {
    allowed: current < limit,
    limit: limit === Infinity ? -1 : limit,
    current,
    tier: firmTier,
  };
}

export { TIER_HIERARCHY, TIER_LIMITS };
export type { TierLimits };
