import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logAudit } from '../middleware/auditLogger.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { runWithBypass, runWithFirm } from '../lib/tenantContext.js';

const router = Router();

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------
const JWT_SECRET = () => {
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret) throw new Error('JWT_SECRET_KEY is not configured');
  return secret;
};

const JWT_ALGORITHM = (process.env.JWT_ALGORITHM as jwt.Algorithm) || 'HS256';

const ACCESS_TOKEN_EXPIRE_MINUTES = parseInt(
  process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '30',
  10,
);

const REFRESH_TOKEN_EXPIRE_DAYS = parseInt(
  process.env.REFRESH_TOKEN_EXPIRE_DAYS || '7',
  10,
);

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firmName: z.string().min(1),
  sraNumber: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.string().min(1),
  staffId: z.string().optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------
router.post(
  '/auth/register',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = registerSchema.parse(req.body);

      // Registration creates the firm itself, so we have no firm context yet.
      // Run the whole flow under bypass — both reads (uniqueness check) and
      // writes (firm + user creation) need to skip RLS.
      const { firm, user } = await runWithBypass(
        'auth/register: bootstrapping a new firm + initial user',
        async () => {
          const existing = await prisma.userAccount.findUnique({
            where: { email: data.email },
          });
          if (existing) {
            return { firm: null as null, user: null as null };
          }

          const passwordHash = await bcrypt.hash(data.password, 10);
          const newFirmId = uuidv4();
          const newUserId = uuidv4();

          const createdFirm = await prisma.firm.create({
            data: {
              id: newFirmId,
              name: data.firmName,
              sraNumber: data.sraNumber,
              onboardingStatus: 'pending',
            },
          });

          const createdUser = await prisma.userAccount.create({
            data: {
              id: newUserId,
              firmId: createdFirm.id,
              email: data.email,
              passwordHash,
              role: 'colp',
              isActive: true,
            },
          });

          return { firm: createdFirm, user: createdUser };
        },
      );

      if (!firm || !user) {
        res.status(409).json({ error: true, message: 'Email already registered' });
        return;
      }

      logger.info('New firm registered', { firmId: firm.id, userId: user.id });

      res.status(201).json({
        id: user.id,
        email: user.email,
        role: user.role,
        firm_id: firm.id,
        firm_name: firm.name,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(422).json({ error: true, message: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
router.post(
  '/auth/login',
  authLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = loginSchema.parse(req.body);

      // Email lookup must run under bypass — we don't know the firm yet.
      const user = await runWithBypass(
        'auth/login: email lookup before firm context is known',
        () =>
          prisma.userAccount.findFirst({
            where: { email: data.email, isActive: true },
          }),
      );

      if (!user) {
        res.status(401).json({ error: true, message: 'Invalid email or password' });
        return;
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        res.status(423).json({ error: true, message: 'Account is temporarily locked. Please try again later.' });
        return;
      }

      // Compare password
      const valid = await bcrypt.compare(data.password, user.passwordHash);

      if (!valid) {
        const attempts = (user.failedLoginAttempts ?? 0) + 1;
        const updateData: Record<string, unknown> = { failedLoginAttempts: attempts };

        if (attempts >= 5) {
          updateData.lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
        }

        // Now that we know the firm, switch to scoped context for the update.
        await runWithFirm(user.firmId, () =>
          prisma.userAccount.update({
            where: { id: user.id },
            data: updateData,
          }),
        );

        res.status(401).json({ error: true, message: 'Invalid email or password' });
        return;
      }

      // Successful login — reset counters under firm scope.
      await runWithFirm(user.firmId, () =>
        prisma.userAccount.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLogin: new Date(),
          },
        }),
      );

      // Generate tokens
      const accessTokenExpiresAt = new Date(
        Date.now() + ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
      );

      // JWT must include both Node-side claims (userId, firmId, camelCase)
      // and FastAPI-side claims (sub, firm_id, type) so the same token
      // works against both backends. FastAPI's get_current_user reads
      // sub / firm_id / role / type='access'; Node's reads userId / firmId.
      const accessToken = jwt.sign(
        {
          // FastAPI claims
          sub: user.id,
          firm_id: user.firmId,
          type: 'access',
          // Node claims (kept for backward compatibility with Node middleware)
          userId: user.id,
          firmId: user.firmId,
          role: user.role,
          email: user.email,
        },
        JWT_SECRET(),
        { algorithm: JWT_ALGORITHM, expiresIn: `${ACCESS_TOKEN_EXPIRE_MINUTES}m` },
      );

      const refreshToken = jwt.sign(
        { sub: user.id, userId: user.id, type: 'refresh' },
        JWT_SECRET(),
        { algorithm: JWT_ALGORITHM, expiresIn: `${REFRESH_TOKEN_EXPIRE_DAYS}d` },
      );

      // Create session and look up firm — both under firm scope now that
      // we have authenticated the user.
      const { firm } = await runWithFirm(user.firmId, async () => {
        await prisma.userSession.create({
          data: {
            id: uuidv4(),
            userId: user.id,
            firmId: user.firmId,
            token: accessToken,
            refreshToken,
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
            expiresAt: accessTokenExpiresAt,
            isActive: true,
          },
        });
        // Firm is in the `firms` table which doesn't have RLS (it IS the
        // tenant table) but we still wrap it to keep the AsyncLocalStorage
        // active for any cascade lookups.
        const foundFirm = await prisma.firm.findUnique({
          where: { id: user.firmId },
        });
        return { firm: foundFirm };
      });

      logger.info('User logged in', { userId: user.id, firmId: user.firmId });

      res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          firm_id: user.firmId,
          firm_name: firm?.name || null,
          staff_id: user.staffId || null,
          onboarding_status: firm?.onboardingStatus || null,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(422).json({ error: true, message: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------
router.post(
  '/auth/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = refreshSchema.parse(req.body);

      // Verify refresh token
      let payload: jwt.JwtPayload;
      try {
        payload = jwt.verify(data.refresh_token, JWT_SECRET(), {
          algorithms: [JWT_ALGORITHM],
        }) as jwt.JwtPayload;
      } catch {
        res.status(401).json({ error: true, message: 'Invalid or expired refresh token' });
        return;
      }

      if (payload.type !== 'refresh') {
        res.status(401).json({ error: true, message: 'Invalid token type' });
        return;
      }

      // Find active session by refresh token — bypass since we don't yet
      // know the firm. The refresh token is the credential being verified.
      const session = await runWithBypass(
        'auth/refresh: session lookup before firm context is known',
        () =>
          prisma.userSession.findFirst({
            where: { refreshToken: data.refresh_token, isActive: true },
          }),
      );

      if (!session) {
        res.status(401).json({ error: true, message: 'Session not found or revoked' });
        return;
      }

      // Look up user under the session's firm scope.
      const user = await runWithFirm(session.firmId, () =>
        prisma.userAccount.findUnique({
          where: { id: session.userId },
        }),
      );

      if (!user || !user.isActive) {
        res.status(401).json({ error: true, message: 'User account not found or inactive' });
        return;
      }

      // Generate new access token — same claim shape as initial login
      // (see comment in /auth/login: must satisfy both Node and FastAPI auth)
      const newAccessToken = jwt.sign(
        {
          sub: user.id,
          firm_id: user.firmId,
          type: 'access',
          userId: user.id,
          firmId: user.firmId,
          role: user.role,
          email: user.email,
        },
        JWT_SECRET(),
        { algorithm: JWT_ALGORITHM, expiresIn: `${ACCESS_TOKEN_EXPIRE_MINUTES}m` },
      );

      // Update session under firm scope
      await runWithFirm(session.firmId, () =>
        prisma.userSession.update({
          where: { id: session.id },
          data: {
            token: newAccessToken,
            expiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000),
          },
        }),
      );

      // Frontend's api.ts refresh handler reads { accessToken } in camelCase.
      // We send both shapes so existing snake_case consumers (Python /
      // older mobile clients) and the camelCase web client both work.
      res.json({ access_token: newAccessToken, accessToken: newAccessToken });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(422).json({ error: true, message: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
router.post(
  '/auth/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.userSession.updateMany({
        where: { userId: req.user!.userId },
        data: { isActive: false },
      });

      logger.info('User logged out', { userId: req.user!.userId });

      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/change-password
// ---------------------------------------------------------------------------
router.post(
  '/auth/change-password',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = changePasswordSchema.parse(req.body);

      const user = await prisma.userAccount.findUnique({
        where: { id: req.user!.userId },
      });

      if (!user) {
        res.status(404).json({ error: true, message: 'User not found' });
        return;
      }

      const valid = await bcrypt.compare(data.current_password, user.passwordHash);
      if (!valid) {
        res.status(400).json({ error: true, message: 'Current password is incorrect' });
        return;
      }

      const newHash = await bcrypt.hash(data.new_password, 10);

      await prisma.userAccount.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });

      await logAudit({
        firmId: req.user!.firmId,
        userId: req.user!.userId,
        action: 'change_password',
        entityType: 'user_account',
        entityId: user.id,
        ipAddress: req.ip || undefined,
      });

      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(422).json({ error: true, message: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /auth/sessions
// ---------------------------------------------------------------------------
router.get(
  '/auth/sessions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessions = await prisma.userSession.findMany({
        where: { userId: req.user!.userId, isActive: true },
      });

      const result = sessions.map((s) => ({
        id: s.id,
        created_at: s.createdAt,
        last_active: s.createdAt,
        ip_address: s.ipAddress,
        user_agent: s.userAgent,
      }));

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/sessions/:sessionId/revoke
// ---------------------------------------------------------------------------
router.post(
  '/auth/sessions/:sessionId/revoke',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.userSession.update({
        where: { id: (req.params.sessionId as string) },
        data: { isActive: false },
      });

      res.json({ message: 'Session revoked' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/users
// ---------------------------------------------------------------------------
router.get(
  '/admin/users',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = getTenantFilter(req);

      const users = await prisma.userAccount.findMany({
        where: { firmId },
        select: {
          id: true,
          email: true,
          role: true,
          staffId: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
      });

      res.json(users);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /admin/users
// ---------------------------------------------------------------------------
router.post(
  '/admin/users',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createUserSchema.parse(req.body);
      const { firmId } = getTenantFilter(req);

      // Check email uniqueness
      const existing = await prisma.userAccount.findUnique({
        where: { email: data.email },
      });
      if (existing) {
        res.status(409).json({ error: true, message: 'Email already registered' });
        return;
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const user = await prisma.userAccount.create({
        data: {
          id: uuidv4(),
          firmId,
          email: data.email,
          passwordHash,
          role: data.role,
          staffId: data.staffId || null,
          isActive: true,
        },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'create_user',
        entityType: 'user_account',
        entityId: user.id,
        ipAddress: req.ip || undefined,
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        isActive: user.isActive,
        createdAt: user.createdAt,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(422).json({ error: true, message: 'Validation error', details: err.errors });
        return;
      }
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/users/:userId
// ---------------------------------------------------------------------------
router.put(
  '/admin/users/:userId',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = getTenantFilter(req);
      const { role, staffId, isActive } = req.body;

      // Verify user belongs to same firm (tenant isolation)
      const existing = await prisma.userAccount.findFirst({
        where: { id: (req.params.userId as string), firmId },
      });
      if (!existing) {
        res.status(404).json({ error: true, message: 'User not found' });
        return;
      }

      const user = await prisma.userAccount.update({
        where: { id: (req.params.userId as string) },
        data: {
          ...(role !== undefined && { role }),
          ...(staffId !== undefined && { staffId }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'update_user',
        entityType: 'user_account',
        entityId: user.id,
        ipAddress: req.ip || undefined,
        metadata: { role, staffId, isActive },
      });

      res.json({
        id: user.id,
        email: user.email,
        role: user.role,
        staffId: user.staffId,
        isActive: user.isActive,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /admin/users/:userId
// ---------------------------------------------------------------------------
router.delete(
  '/admin/users/:userId',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = getTenantFilter(req);

      // Verify user belongs to same firm (tenant isolation)
      const existing = await prisma.userAccount.findFirst({
        where: { id: (req.params.userId as string), firmId },
      });
      if (!existing) {
        res.status(404).json({ error: true, message: 'User not found' });
        return;
      }

      await prisma.userAccount.update({
        where: { id: (req.params.userId as string) },
        data: { isActive: false },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'delete_user',
        entityType: 'user_account',
        entityId: (req.params.userId as string),
        ipAddress: req.ip || undefined,
      });

      res.json({ message: 'User deactivated' });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/firm-settings
// ---------------------------------------------------------------------------
router.get(
  '/admin/firm-settings',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const firm = await prisma.firm.findUnique({
        where: { id: req.user!.firmId },
      });

      if (!firm) {
        res.status(404).json({ error: true, message: 'Firm not found' });
        return;
      }

      res.json(firm);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/firm-settings
// ---------------------------------------------------------------------------
router.put(
  '/admin/firm-settings',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, email, phone, address, postcode, website, colpName, cofaName, mlroName } =
        req.body;

      const firm = await prisma.firm.update({
        where: { id: req.user!.firmId },
        data: {
          ...(name !== undefined && { name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
          ...(address !== undefined && { address }),
          ...(postcode !== undefined && { postcode }),
          ...(website !== undefined && { website }),
          ...(colpName !== undefined && { colpName }),
          ...(cofaName !== undefined && { cofaName }),
          ...(mlroName !== undefined && { mlroName }),
        },
      });

      await logAudit({
        firmId: req.user!.firmId,
        userId: req.user!.userId,
        action: 'update_firm_settings',
        entityType: 'firm',
        entityId: firm.id,
        ipAddress: req.ip || undefined,
      });

      res.json(firm);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/notification-preferences
// ---------------------------------------------------------------------------
router.get(
  '/admin/notification-preferences',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const firm = await prisma.firm.findUnique({
        where: { id: req.user!.firmId },
        select: { notificationPreferences: true },
      });

      if (!firm) {
        res.status(404).json({ error: true, message: 'Firm not found' });
        return;
      }

      const prefs = firm.notificationPreferences
        ? JSON.parse(firm.notificationPreferences)
        : {};

      res.json(prefs);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/notification-preferences
// ---------------------------------------------------------------------------
router.put(
  '/admin/notification-preferences',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.firm.update({
        where: { id: req.user!.firmId },
        data: { notificationPreferences: JSON.stringify(req.body) },
      });

      res.json(req.body);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /admin/preferences
// ---------------------------------------------------------------------------
router.get(
  '/admin/preferences',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const firm = await prisma.firm.findUnique({
        where: { id: req.user!.firmId },
        select: { firmPreferences: true },
      });

      if (!firm) {
        res.status(404).json({ error: true, message: 'Firm not found' });
        return;
      }

      const prefs = firm.firmPreferences ? JSON.parse(firm.firmPreferences) : {};

      res.json(prefs);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /admin/preferences
// ---------------------------------------------------------------------------
router.put(
  '/admin/preferences',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.firm.update({
        where: { id: req.user!.firmId },
        data: { firmPreferences: JSON.stringify(req.body) },
      });

      res.json(req.body);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
