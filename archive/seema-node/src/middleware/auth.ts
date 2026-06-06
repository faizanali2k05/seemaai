import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import logger from '../utils/logger';
import { runWithFirm } from '../lib/tenantContext.js';

const ROLE_HIERARCHY: Record<string, number> = {
  staff: 0,
  solicitor: 1,
  admin: 2,
  partner: 3,
  colp: 4,
};

interface TokenPayload extends JwtPayload {
  userId: string;
  firmId: string;
  role: string;
  email: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for health check
  if (req.path === '/api/health') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: true,
      message: 'Missing or invalid Authorization header',
      statusCode: 401,
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET_KEY;
    if (!secret) {
      throw new Error('JWT_SECRET_KEY is not configured');
    }

    const decoded = jwt.verify(token, secret, {
      algorithms: [
        (process.env.JWT_ALGORITHM as jwt.Algorithm) || 'HS256',
      ],
    }) as TokenPayload;

    req.user = {
      userId: decoded.userId,
      firmId: decoded.firmId,
      role: decoded.role,
      email: decoded.email,
    };

    // Push the firmId into AsyncLocalStorage for the rest of this request.
    // The tenant-aware Prisma proxy reads this context when wrapping each
    // query in a transaction with `SET LOCAL app.current_firm_id`.
    // Calling next() inside runWithFirm propagates the context through the
    // remaining middleware and the route handler.
    runWithFirm(decoded.firmId, () => {
      next();
    });
    return;
  } catch (err) {
    logger.warn('JWT verification failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
      ip: req.ip,
    });

    res.status(401).json({
      error: true,
      message: 'Invalid or expired token',
      statusCode: 401,
    });
  }
}

export function requireRole(minRole: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: true,
        message: 'Authentication required',
        statusCode: 401,
      });
      return;
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] ?? -1;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      logger.warn('Insufficient role', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRole: minRole,
      });

      res.status(403).json({
        error: true,
        message: `Insufficient permissions. Required role: ${minRole}`,
        statusCode: 403,
      });
      return;
    }

    next();
  };
}
