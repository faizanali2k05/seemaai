import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
// `staffMap` is an optional id→name lookup so we can return a human-readable
// `assigned_to` (the column stores a staff UUID).
function serializeDeadline(d: any, staffMap?: Map<string, string>) {
  const assignedId: string | null = d.assignedTo ?? null;
  const assignedName = assignedId ? staffMap?.get(assignedId) : undefined;
  return {
    id: d.id,
    title: d.title,
    due_date: d.dueDate,
    priority: d.priority,
    category: d.category,
    source_type: d.category,    // legacy alias used by the React form
    // Show the staff member's display name when we can resolve it; otherwise
    // fall back to the stored value (could be a UUID for unresolvable rows
    // or a free-text name for legacy entries).
    assigned_to: assignedName || assignedId,
    assigned_to_id: assignedId,
    assigned_to_name: assignedName || null,
    status: d.status,
    notes: d.notes ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

// Categories that count as firm-wide compliance deadlines (not matter-level).
// Matter-specific categories like 'litigation', 'family', 'conveyancing' etc.
// live in the firm's PMS, not here.
const COMPLIANCE_CATEGORIES = [
  'training',
  'regulatory',
  'aml',
  'policy_review',
  'policy-review',     // tolerate either separator style
  'supervision',
  'sra_return',
  'sra-return',
  'insurance',
  'cdd',
  'compliance',
];

// GET /compliance/deadlines — List firm-wide compliance deadlines.
// Pass ?include_all=true to bypass the compliance-category filter (used by
// PMS-synced or admin views).
router.get('/compliance/deadlines', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const includeAll = String(req.query.include_all ?? '').toLowerCase() === 'true';
    const where = includeAll
      ? { firmId }
      : {
          firmId,
          OR: [
            { category: { in: COMPLIANCE_CATEGORIES } },
            { category: null },   // un-categorised rows surface here too
          ],
        };
    const deadlines = await prisma.deadline.findMany({
      where,
      orderBy: { dueDate: 'asc' },
    });

    // Single round-trip to resolve assignee UUIDs → names. Cheap and
    // avoids per-row queries / N+1.
    const assignedIds = Array.from(new Set(
      deadlines.map((d) => d.assignedTo).filter((v): v is string => Boolean(v)),
    ));
    const staffMap = new Map<string, string>();
    if (assignedIds.length) {
      const staff = await prisma.staffMember.findMany({
        where: { firmId, id: { in: assignedIds } },
        select: { id: true, name: true },
      });
      staff.forEach((s) => { if (s.name) staffMap.set(s.id, s.name); });
    }

    res.json(deadlines.map((d) => serializeDeadline(d, staffMap)));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch deadlines' });
  }
});

// POST /compliance/deadlines — Create deadline
//
// Frontend sends snake_case (due_date, assigned_to, source_type, notes); older
// callers sent camelCase. Accept both — title and one of due_date/dueDate
// are required; everything else is optional.
const createDeadlineSchema = z.object({
  title: z.string(),
  // snake_case (current frontend)
  due_date: z.string().optional(),
  assigned_to: z.string().optional(),
  source_type: z.string().optional(),
  notes: z.string().optional(),
  // camelCase (legacy)
  dueDate: z.string().optional(),
  assignedTo: z.string().optional(),
  category: z.string().optional(),
  priority: z.string(),
}).refine(
  (d) => Boolean(d.due_date || d.dueDate),
  { message: 'due_date (or dueDate) is required' },
);

router.post('/compliance/deadlines', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = createDeadlineSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const data = parsed.data;
    const dueDate = (data.due_date ?? data.dueDate) as string;
    const category = data.category ?? data.source_type ?? null;
    const assignedTo = data.assigned_to ?? data.assignedTo ?? null;

    const deadline = await prisma.deadline.create({
      data: {
        firmId,
        title: data.title,
        dueDate: new Date(dueDate),
        priority: data.priority,
        category,
        assignedTo,
        status: 'pending',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'deadline_created',
      entityType: 'deadline',
      entityId: deadline.id,
      metadata: { title: data.title, dueDate, priority: data.priority },
    });

    res.status(201).json(serializeDeadline(deadline));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create deadline' });
  }
});

// PUT /compliance/deadlines/:deadlineId — Update deadline
//
// Frontend sends snake_case (due_date, assigned_to, source_type); older
// callers sent camelCase. Accept both.
router.put('/compliance/deadlines/:deadlineId', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { deadlineId } = req.params as Record<string, string>;

    const existing = await prisma.deadline.findFirst({
      where: { id: deadlineId, firmId },
    });
    if (!existing) {
      res.status(404).json({ error: true, message: 'Deadline not found' });
      return;
    }

    const b = req.body ?? {};
    const updateData: Record<string, unknown> = {};
    if (b.title !== undefined) updateData.title = b.title;
    const dueDate = b.due_date ?? b.dueDate;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (b.priority !== undefined) updateData.priority = b.priority;
    const category = b.category ?? b.source_type;
    if (category !== undefined) updateData.category = category;
    const assignedTo = b.assigned_to ?? b.assignedTo;
    if (assignedTo !== undefined) updateData.assignedTo = assignedTo;
    if (b.status !== undefined) updateData.status = b.status;

    const updated = await prisma.deadline.update({
      where: { id: deadlineId },
      data: updateData,
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'deadline_updated',
      entityType: 'deadline',
      entityId: deadlineId,
    });

    res.json(serializeDeadline(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to update deadline' });
  }
});

// POST /compliance/deadlines/:deadlineId/complete — Complete deadline
router.post('/compliance/deadlines/:deadlineId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { deadlineId } = req.params as Record<string, string>;

    const existing = await prisma.deadline.findFirst({
      where: { id: deadlineId, firmId },
    });
    if (!existing) {
      res.status(404).json({ error: true, message: 'Deadline not found' });
      return;
    }

    const updated = await prisma.deadline.update({
      where: { id: deadlineId },
      data: { status: 'completed' },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'deadline_completed',
      entityType: 'deadline',
      entityId: deadlineId,
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to complete deadline' });
  }
});

export default router;
