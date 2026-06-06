import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Frontend sends snake_case (client_name, matter_type, matter_ref, fee_earner).
// Older callers used camelCase. Accept both — the title/practiceArea fields
// are optional fallbacks since the React form doesn't surface them.
const matterSchema = z.object({
  // snake_case (current frontend)
  client_name: z.string().optional(),
  matter_type: z.string().optional(),
  matter_ref: z.string().optional(),
  fee_earner: z.string().optional(),
  // camelCase (legacy)
  clientName: z.string().optional(),
  matterType: z.string().optional(),
  title: z.string().optional(),
  practiceArea: z.string().optional(),
}).refine(
  (d) => Boolean(d.client_name || d.clientName),
  { message: 'client_name (or clientName) is required' },
).refine(
  (d) => Boolean(d.matter_type || d.matterType),
  { message: 'matter_type (or matterType) is required' },
);

// GET /compliance/matters
//
// The frontend table uses snake_case accessors (client_name, matter_type,
// matter_ref, fee_earner, created_at). Prisma returns camelCase by default,
// so we explicitly serialize to the shape the React page expects — otherwise
// rows render with empty cells even though the data is there.
function serializeMatter(m: any) {
  return {
    id: m.id,
    matter_ref: m.reference,
    client_name: m.clientName,
    matter_type: m.matterType,
    practice_area: m.practiceArea,
    title: m.title,
    description: m.description,
    status: m.status,
    risk_level: m.riskLevel,
    fee_estimate: m.feeEstimate,
    fee_earner: m.assignedTo,           // UUID; UI may render or look up
    open_date: m.openDate,
    close_date: m.closeDate,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

router.get('/compliance/matters', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const matters = await prisma.matter.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });

    res.json(matters.map(serializeMatter));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch matters' });
  }
});

// POST /compliance/matters
router.post('/compliance/matters', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = matterSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const data = parsed.data;
    const clientName = (data.client_name ?? data.clientName) as string;
    const matterType = (data.matter_type ?? data.matterType) as string;
    // `title` and `practiceArea` aren't always sent — fall back to sensible
    // values derived from what we do have.
    const title = data.title ?? `${clientName} — ${matterType}`;
    const practiceArea = data.practiceArea ?? matterType;
    const reference = data.matter_ref ?? `MAT-${Date.now().toString(36).toUpperCase()}`;

    // Note: data.fee_earner from the form is a free-text name, but the
    // Matter.assignedTo column expects a staff UUID. We drop fee_earner
    // here — the user can pick a real assignee from the matter detail
    // view after creation.
    const matter = await prisma.matter.create({
      data: {
        firmId,
        clientName,
        matterType,
        title,
        practiceArea,
        reference,
        status: 'open',
        openDate: new Date().toISOString().split('T')[0],
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'create_matter',
      entityType: 'matter',
      entityId: matter.id,
      ipAddress: req.ip,
    });

    res.status(201).json(serializeMatter(matter));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create matter' });
  }
});

// POST /compliance/matter-items/:itemId/complete
router.post('/compliance/matter-items/:itemId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { itemId } = req.params as Record<string, string>;

    const existing = await prisma.complianceTask.findFirst({
      where: { id: itemId, firmId },
    });

    if (!existing) {
      res.status(404).json({ error: true, message: 'Item not found' });
      return;
    }

    const task = await prisma.complianceTask.update({
      where: { id: itemId },
      data: {
        completedAt: existing.completedAt ? null : new Date(),
      },
    });

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to toggle item completion' });
  }
});

export default router;
