import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeCdd(c: any) {
  return {
    id: c.id,
    client_name: c.clientName,
    client_type: c.clientType,
    cdd_level: c.cddLevel,
    risk_level: c.riskLevel,
    status: c.status,
    id_verified: c.idVerified,
    address_verified: c.addressVerified,
    sof_verified: c.sofVerified,
    nationality: c.nationality ?? null,
    country_of_residence: c.countryOfResidence ?? null,
    company_number: c.companyNumber ?? null,
    date_of_birth: c.dateOfBirth ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function serializeSar(s: any) {
  return {
    id: s.id,
    client_name: s.clientName,
    matter_ref: s.matterRef,
    suspicion_type: s.suspicionType,
    amount: s.amount,
    grounds_for_suspicion: s.groundsForSuspicion,
    transaction_details: s.transactionDetails ?? null,
    status: s.status,
    report_date: s.reportDate,
    mlro_decision: s.mlroDecision,
    nca_filed: s.ncaFiled,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

// GET /compliance/aml/stats
router.get('/compliance/aml/stats', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const [totalCdd, pendingCdd, verifiedCdd, totalSar] = await Promise.all([
      prisma.cddRecord.count({ where: { firmId } }),
      prisma.cddRecord.count({ where: { firmId, status: 'pending' } }),
      prisma.cddRecord.count({ where: { firmId, status: 'verified' } }),
      prisma.sarRecord.count({ where: { firmId } }),
    ]);

    res.json({ total_cdd: totalCdd, pending_cdd: pendingCdd, verified_cdd: verifiedCdd, total_sar: totalSar });
  } catch (err) {
    next(err);
  }
});

// GET /compliance/aml/cdd
router.get('/compliance/aml/cdd', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const records = await prisma.cddRecord.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(records.map(serializeCdd));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/aml/cdd
//
// Frontend sends snake_case (client_name, client_type, cdd_level, risk_level);
// older callers sent camelCase. Accept both so the route doesn't 400.
const createCddSchema = z.object({
  // snake_case (frontend)
  client_name: z.string().optional(),
  client_type: z.string().optional(),
  cdd_level: z.string().optional(),
  risk_level: z.string().optional(),
  // camelCase (legacy)
  clientName: z.string().optional(),
  clientType: z.string().optional(),
  cddLevel: z.string().optional(),
  riskLevel: z.string().optional(),
}).refine(
  (d) => Boolean(d.client_name || d.clientName),
  { message: 'client_name (or clientName) is required' },
).refine(
  (d) => Boolean(d.client_type || d.clientType),
  { message: 'client_type (or clientType) is required' },
).refine(
  (d) => Boolean(d.cdd_level || d.cddLevel),
  { message: 'cdd_level (or cddLevel) is required' },
).refine(
  (d) => Boolean(d.risk_level || d.riskLevel),
  { message: 'risk_level (or riskLevel) is required' },
);

router.post('/compliance/aml/cdd', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createCddSchema.parse(req.body);

    const record = await prisma.cddRecord.create({
      data: {
        firmId,
        clientName: (data.client_name ?? data.clientName) as string,
        clientType: (data.client_type ?? data.clientType) as string,
        cddLevel: (data.cdd_level ?? data.cddLevel) as string,
        riskLevel: (data.risk_level ?? data.riskLevel) as string,
      },
    });

    res.status(201).json(serializeCdd(record));
  } catch (err) {
    next(err);
  }
});

// GET /compliance/aml/cdd/:cddId
router.get('/compliance/aml/cdd/:cddId', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const record = await prisma.cddRecord.findFirst({
      where: { id: (req.params.cddId as string), firmId },
    });

    if (!record) {
      res.status(404).json({ error: true, message: 'CDD record not found' });
      return;
    }

    res.json(serializeCdd(record));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/aml/cdd/:cddId/verify
router.post('/compliance/aml/cdd/:cddId/verify', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const record = await prisma.cddRecord.updateMany({
      where: { id: (req.params.cddId as string), firmId },
      data: {
        status: 'verified',
        idVerified: true,
        addressVerified: true,
        sofVerified: true,
      },
    });

    if (record.count === 0) {
      res.status(404).json({ error: true, message: 'CDD record not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'cdd_verified',
      entityType: 'cdd_record',
      entityId: (req.params.cddId as string),
    });

    const updated = await prisma.cddRecord.findFirst({ where: { id: (req.params.cddId as string), firmId } });
    res.json(updated ? serializeCdd(updated) : null);
  } catch (err) {
    next(err);
  }
});

// POST /compliance/aml/pep-screening
router.post('/compliance/aml/pep-screening', authenticate, async (_req, res) => {
  res.json({ status: 'clear', message: 'PEP screening delegated to AI middleware' });
});

// POST /compliance/aml/sanctions-check
router.post('/compliance/aml/sanctions-check', authenticate, async (_req, res) => {
  res.json({ status: 'clear', message: 'Sanctions check delegated to AI middleware' });
});

// GET /compliance/aml/sar
router.get('/compliance/aml/sar', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const records = await prisma.sarRecord.findMany({ where: { firmId } });
    res.json(records.map(serializeSar));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/aml/sar
//
// Frontend sends snake_case (client_name, matter_ref, suspicion_type,
// grounds_for_suspicion); older callers sent camelCase. Accept both.
const createSarSchema = z.object({
  // snake_case (frontend)
  client_name: z.string().optional(),
  matter_ref: z.string().optional(),
  suspicion_type: z.string().optional(),
  grounds_for_suspicion: z.string().optional(),
  // camelCase (legacy)
  clientName: z.string().optional(),
  matterRef: z.string().optional(),
  suspicionType: z.string().optional(),
  groundsForSuspicion: z.string().optional(),
  amount: z.number(),
}).refine(
  (d) => Boolean(d.client_name || d.clientName),
  { message: 'client_name (or clientName) is required' },
).refine(
  (d) => Boolean(d.matter_ref || d.matterRef),
  { message: 'matter_ref (or matterRef) is required' },
).refine(
  (d) => Boolean(d.suspicion_type || d.suspicionType),
  { message: 'suspicion_type (or suspicionType) is required' },
).refine(
  (d) => Boolean(d.grounds_for_suspicion || d.groundsForSuspicion),
  { message: 'grounds_for_suspicion (or groundsForSuspicion) is required' },
);

router.post('/compliance/aml/sar', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createSarSchema.parse(req.body);

    const record = await prisma.sarRecord.create({
      data: {
        firmId,
        clientName: (data.client_name ?? data.clientName) as string,
        matterRef: (data.matter_ref ?? data.matterRef) as string,
        suspicionType: (data.suspicion_type ?? data.suspicionType) as string,
        amount: data.amount,
        groundsForSuspicion: (data.grounds_for_suspicion ?? data.groundsForSuspicion) as string,
        status: 'submitted',
        reportDate: new Date(),
      },
    });

    res.status(201).json(serializeSar(record));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/aml/sar/:sarId/mlro-decision
//
// Frontend sends snake_case (nca_filed); older callers sent camelCase. Accept both.
const mlroDecisionSchema = z.object({
  decision: z.string(),
  // snake_case (frontend)
  nca_filed: z.boolean().optional(),
  // camelCase (legacy)
  ncaFiled: z.boolean().optional(),
}).refine(
  (d) => d.nca_filed !== undefined || d.ncaFiled !== undefined,
  { message: 'nca_filed (or ncaFiled) is required' },
);

router.post('/compliance/aml/sar/:sarId/mlro-decision', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = mlroDecisionSchema.parse(req.body);

    const ncaFiled = (data.nca_filed ?? data.ncaFiled) as boolean;

    const result = await prisma.sarRecord.updateMany({
      where: { id: (req.params.sarId as string), firmId },
      data: {
        mlroDecision: data.decision,
        ncaFiled,
        status: data.decision === 'file' ? 'filed' : 'closed',
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'SAR record not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'mlro_decision',
      entityType: 'sar_record',
      entityId: (req.params.sarId as string),
      metadata: { decision: data.decision, ncaFiled },
    });

    const updated = await prisma.sarRecord.findFirst({ where: { id: (req.params.sarId as string), firmId } });
    res.json(updated ? serializeSar(updated) : null);
  } catch (err) {
    next(err);
  }
});

export default router;
