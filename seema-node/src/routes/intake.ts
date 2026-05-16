import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeIntake(i: any) {
  return {
    id: i.id,
    client_name: i.clientName,
    client_email: i.clientEmail,
    client_phone: i.clientPhone,
    client_type: i.clientType,
    company_name: i.companyName,
    practice_area: i.practiceArea,
    risk_level: i.riskLevel,
    risk_score: i.riskScore,
    assigned_to: i.assignedTo,
    source_of_funds: i.sourceOfFunds,
    pep_screening: i.pepScreening,
    sanctions_check: i.sanctionsCheck,
    cdd_status: i.cddStatus,
    conflict_check_status: i.conflictCheckStatus,
    conflict_check_details: i.conflictCheckDetails,
    client_care_letter_sent: i.clientCareLetterSent,
    status: i.status,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  };
}

// GET /compliance/intake
router.get('/compliance/intake', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const intakes = await prisma.clientIntake.findMany({ where: { firmId } });
    res.json(intakes.map(serializeIntake));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/intake
//
// Accepts either snake_case (the frontend sends this) or camelCase keys —
// the backend was previously requiring camelCase that the UI never sent,
// causing every create to 400. We accept both so existing API clients +
// any new ones don't break.
const createIntakeSchema = z.object({
  // snake_case (frontend)
  client_name: z.string().optional(),
  client_email: z.string().optional(),
  client_phone: z.string().optional(),
  client_type: z.string().optional(),
  company_name: z.string().optional(),
  matter_type: z.string().optional(),
  practice_area: z.string().optional(),
  assigned_fee_earner: z.string().optional(),
  client_reference: z.string().optional(),
  // camelCase (alternative)
  clientName: z.string().optional(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
  clientType: z.string().optional(),
  companyName: z.string().optional(),
  practiceArea: z.string().optional(),
  assignedTo: z.string().optional(),
  sourceOfFunds: z.string().optional(),
}).refine(
  (d) => Boolean(d.client_name || d.clientName),
  { message: 'client_name (or clientName) is required' },
);

// Postgres text/varchar columns reject literal NUL (0x00) bytes — strip them
// from any string input before saving. Browsers occasionally smuggle them in
// via autofill or paste from rich-text sources.
const clean = (v: string | null | undefined): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/\u0000/g, '').trim();
  return s.length ? s : null;
};

router.post('/compliance/intake', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createIntakeSchema.parse(req.body);

    const intake = await prisma.clientIntake.create({
      data: {
        firmId,
        clientName: clean(data.client_name ?? data.clientName) as string,
        clientEmail: clean(data.client_email ?? data.clientEmail),
        clientPhone: clean(data.client_phone ?? data.clientPhone),
        clientType: clean(data.client_type ?? data.clientType),
        companyName: clean(data.company_name ?? data.companyName),
        // matter_type maps to practiceArea — we treat them as the same field
        practiceArea: clean(data.practice_area ?? data.practiceArea ?? data.matter_type),
        assignedTo: clean(data.assigned_fee_earner ?? data.assignedTo),
        sourceOfFunds: clean(data.client_reference ?? data.sourceOfFunds),
        status: 'pending',
      },
    });

    res.status(201).json(serializeIntake(intake));
  } catch (err) {
    next(err);
  }
});

// PUT /compliance/intake/:intakeId
//
// Frontend sends snake_case (client_name, client_email, etc.); older callers
// sent camelCase. Accept both — every field optional for partial updates.
const updateIntakeSchema = z.object({
  // snake_case (frontend)
  client_name: z.string().optional(),
  client_email: z.string().optional(),
  client_phone: z.string().optional(),
  client_type: z.string().optional(),
  company_name: z.string().optional(),
  matter_type: z.string().optional(),
  practice_area: z.string().optional(),
  assigned_fee_earner: z.string().optional(),
  client_reference: z.string().optional(),
  risk_level: z.string().optional(),
  // camelCase (legacy)
  clientName: z.string().optional(),
  clientEmail: z.string().optional(),
  clientPhone: z.string().optional(),
  clientType: z.string().optional(),
  companyName: z.string().optional(),
  practiceArea: z.string().optional(),
  matterType: z.string().optional(),
  assignedTo: z.string().optional(),
  riskLevel: z.string().optional(),
  sourceOfFunds: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

router.put('/compliance/intake/:intakeId', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = updateIntakeSchema.parse(req.body);

    const updateData: Record<string, unknown> = {};
    const clientName = data.client_name ?? data.clientName;
    if (clientName !== undefined) updateData.clientName = clean(clientName);
    const clientEmail = data.client_email ?? data.clientEmail ?? data.email;
    if (clientEmail !== undefined) updateData.clientEmail = clean(clientEmail);
    const clientPhone = data.client_phone ?? data.clientPhone ?? data.phone;
    if (clientPhone !== undefined) updateData.clientPhone = clean(clientPhone);
    const clientType = data.client_type ?? data.clientType;
    if (clientType !== undefined) updateData.clientType = clean(clientType);
    const companyName = data.company_name ?? data.companyName;
    if (companyName !== undefined) updateData.companyName = clean(companyName);
    const practiceArea = data.practice_area ?? data.practiceArea ?? data.matter_type ?? data.matterType;
    if (practiceArea !== undefined) updateData.practiceArea = clean(practiceArea);
    const assignedTo = data.assigned_fee_earner ?? data.assignedTo;
    if (assignedTo !== undefined) updateData.assignedTo = clean(assignedTo);
    const sourceOfFunds = data.client_reference ?? data.sourceOfFunds;
    if (sourceOfFunds !== undefined) updateData.sourceOfFunds = clean(sourceOfFunds);
    const riskLevel = data.risk_level ?? data.riskLevel;
    if (riskLevel !== undefined) updateData.riskLevel = clean(riskLevel);
    if (data.status !== undefined) updateData.status = data.status;

    const result = await prisma.clientIntake.updateMany({
      where: { id: (req.params.intakeId as string), firmId },
      data: updateData,
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Intake not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'intake_updated',
      entityType: 'client_intake',
      entityId: (req.params.intakeId as string),
    });

    const updated = await prisma.clientIntake.findFirst({ where: { id: (req.params.intakeId as string), firmId } });
    res.json(updated ? serializeIntake(updated) : null);
  } catch (err) {
    next(err);
  }
});

// POST /compliance/intake/:intakeId/approve
router.post('/compliance/intake/:intakeId/approve', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const result = await prisma.clientIntake.updateMany({
      where: { id: (req.params.intakeId as string), firmId },
      data: { status: 'approved' },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Intake not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'intake_approved',
      entityType: 'client_intake',
      entityId: (req.params.intakeId as string),
    });

    const updated = await prisma.clientIntake.findFirst({ where: { id: (req.params.intakeId as string), firmId } });
    res.json(updated ? serializeIntake(updated) : null);
  } catch (err) {
    next(err);
  }
});

// POST /compliance/intake/:intakeId/reject
router.post('/compliance/intake/:intakeId/reject', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const result = await prisma.clientIntake.updateMany({
      where: { id: (req.params.intakeId as string), firmId },
      data: { status: 'rejected' },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Intake not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'intake_rejected',
      entityType: 'client_intake',
      entityId: (req.params.intakeId as string),
    });

    const updated = await prisma.clientIntake.findFirst({ where: { id: (req.params.intakeId as string), firmId } });
    res.json(updated ? serializeIntake(updated) : null);
  } catch (err) {
    next(err);
  }
});

export default router;
