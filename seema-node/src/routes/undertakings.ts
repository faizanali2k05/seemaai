import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeUndertaking(u: any) {
  return {
    id: u.id,
    description: u.description,
    matter_ref: u.matterRef,
    given_to: u.givenTo,
    given_by: u.givenBy,
    due_date: u.dueDate,
    status: u.status,
    completed_at: u.completedAt,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

// GET /compliance/undertakings
router.get('/compliance/undertakings', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const undertakings = await prisma.undertaking.findMany({ where: { firmId } });
    res.json(undertakings.map(serializeUndertaking));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/undertakings
//
// Frontend sends snake_case (matter_ref, given_to, given_by, due_date);
// older callers sent camelCase. Accept both so the route doesn't 400.
// The frontend's "Register Undertaking" modal sends a richer payload than
// the Undertaking columns store. Required: description. Everything else is
// optional. `direction` decides whether the contact name lands in given_to
// (for outgoing undertakings) or given_by (for received). Fields the DB
// can't store (conditions, financial_value, risk_level, client_name) are
// accepted by the schema and ignored on insert — they'd need a schema
// migration to persist.
const createUndertakingSchema = z.object({
  description: z.string(),
  direction: z.enum(['given', 'received', '']).optional(),
  // snake_case (frontend)
  matter_ref: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  given_to: z.string().nullable().optional(),
  given_by: z.string().nullable().optional(),
  received_from: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  conditions: z.string().nullable().optional(),
  financial_value: z.number().nullable().optional(),
  risk_level: z.string().nullable().optional(),
  // camelCase (legacy)
  matterRef: z.string().nullable().optional(),
  givenTo: z.string().nullable().optional(),
  givenBy: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

router.post('/compliance/undertakings', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createUndertakingSchema.parse(req.body);

    const matterRef = data.matter_ref ?? data.matterRef ?? null;
    // If the form's `direction` is 'received', the contact name lives in
    // received_from; if 'given', it lives in given_to. We also keep
    // given_by populated when the caller supplied it directly.
    const givenTo = (data.direction === 'received'
      ? (data.received_from ?? null)
      : (data.given_to ?? data.givenTo ?? null));
    const givenBy = data.given_by ?? data.givenBy ?? null;
    const dueDate = data.due_date ?? data.dueDate ?? null;

    const undertaking = await prisma.undertaking.create({
      data: {
        firmId,
        description: data.description,
        matterRef,
        givenTo,
        givenBy,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    res.status(201).json(serializeUndertaking(undertaking));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/undertakings/:undertakingId/fulfil
router.post('/compliance/undertakings/:undertakingId/fulfil', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const result = await prisma.undertaking.updateMany({
      where: { id: (req.params.undertakingId as string), firmId },
      data: {
        status: 'fulfilled',
        completedAt: new Date(),
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Undertaking not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'undertaking_fulfilled',
      entityType: 'undertaking',
      entityId: (req.params.undertakingId as string),
    });

    const updated = await prisma.undertaking.findFirst({ where: { id: (req.params.undertakingId as string), firmId } });
    res.json(updated ? serializeUndertaking(updated) : null);
  } catch (err) {
    next(err);
  }
});

// POST /compliance/undertakings/:undertakingId/breach
router.post('/compliance/undertakings/:undertakingId/breach', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const existing = await prisma.undertaking.findFirst({
      where: { id: (req.params.undertakingId as string), firmId },
    });

    if (!existing) {
      res.status(404).json({ error: true, message: 'Undertaking not found' });
      return;
    }

    await prisma.undertaking.updateMany({
      where: { id: (req.params.undertakingId as string), firmId },
      data: { status: 'breached' },
    });

    await prisma.complianceAlert.create({
      data: {
        firmId,
        alertType: 'undertaking_breach',
        severity: 'high',
        title: `Undertaking breached: ${existing.description.substring(0, 100)}`,
        description: `Undertaking ${(req.params.undertakingId as string)} has been marked as breached.`,
        status: 'open',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'undertaking_breached',
      entityType: 'undertaking',
      entityId: (req.params.undertakingId as string),
    });

    const updated = await prisma.undertaking.findFirst({ where: { id: (req.params.undertakingId as string), firmId } });
    res.json(updated ? serializeUndertaking(updated) : null);
  } catch (err) {
    next(err);
  }
});

export default router;
