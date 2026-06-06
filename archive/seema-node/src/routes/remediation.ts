import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
// `steps` is stored as a JSON string — parse before returning. `assigned_to`
// and `due_date` come straight from the columns of the same name.
function serializeRemediationPlan(p: any) {
  let steps: unknown[] = [];
  try {
    steps = p.steps ? JSON.parse(p.steps) : [];
  } catch { /* leave as empty array */ }
  // Derived counters for the UI.
  const stepsArr = Array.isArray(steps) ? steps as any[] : [];
  const totalSteps = stepsArr.length;
  const completedSteps = stepsArr.filter(
    (s: any) => s?.status === 'completed' || s?.completed === true,
  ).length;
  return {
    id: p.id,
    title: p.title,
    source: p.source,
    source_type: p.source,           // legacy alias
    priority: p.priority,
    status: p.status,
    assigned_to: p.assignedTo,
    due_date: p.dueDate,
    steps,
    total_steps: totalSteps,
    completed_steps: completedSteps,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// GET /compliance/remediation-plans — List remediation plans for firm
router.get('/compliance/remediation-plans', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const plans = await prisma.remediationPlan.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(plans.map(serializeRemediationPlan));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch remediation plans' });
  }
});

// POST /compliance/remediation-plans — Create remediation plan
//
// Required: title, priority. `steps` is optional — the frontend often creates
// a plan from an alert with no pre-set steps; users then add steps later.
// `alert_id` and `assigned_to` are accepted but currently stored only as
// metadata on the plan (no foreign-key column for alert_id yet).
const createPlanSchema = z.object({
  title: z.string(),
  priority: z.string(),
  status: z.string().optional(),
  // Description / source_id are accepted but not persisted (no columns yet).
  description: z.string().nullable().optional(),
  source_id: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  // snake_case (frontend)
  alert_id: z.string().nullable().optional(),
  assigned_to: z.string().nullable().optional(),
  source_type: z.string().nullable().optional(),
  // camelCase (legacy)
  source: z.string().optional(),
  alertId: z.string().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  steps: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    completed: z.boolean().optional(),
  })).optional(),
});

router.post('/compliance/remediation-plans', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = createPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { title, priority } = parsed.data;
    const source = parsed.data.source ?? parsed.data.source_type ?? null;
    const assignedTo = parsed.data.assigned_to ?? parsed.data.assignedTo ?? null;
    const dueDateStr = parsed.data.due_date ?? parsed.data.dueDate ?? null;
    const status = parsed.data.status ?? 'pending';
    const steps = parsed.data.steps ?? [];

    const plan = await prisma.remediationPlan.create({
      data: {
        firmId,
        title,
        source,
        priority,
        assignedTo,
        dueDate: dueDateStr ? new Date(dueDateStr) : null,
        status,
        steps: JSON.stringify(steps),
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'remediation_plan_created',
      entityType: 'remediation_plan',
      entityId: plan.id,
      metadata: {
        title,
        priority,
        alert_id: parsed.data.alert_id ?? parsed.data.alertId ?? null,
        assigned_to: parsed.data.assigned_to ?? parsed.data.assignedTo ?? null,
      },
    });

    res.status(201).json(serializeRemediationPlan(plan));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create remediation plan' });
  }
});

// POST /compliance/remediation-steps/:stepId/complete — Complete a step in a plan
router.post('/compliance/remediation-steps/:stepId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { stepId } = req.params as Record<string, string>;
    // Frontend sends snake_case (plan_id); older callers sent camelCase
    // (planId). Accept both.
    const planId = (req.body.plan_id ?? req.body.planId) as string | undefined;

    if (!planId) {
      res.status(400).json({ error: true, message: 'plan_id (or planId) is required' });
      return;
    }

    const plan = await prisma.remediationPlan.findFirst({
      where: { id: planId, firmId },
    });
    if (!plan) {
      res.status(404).json({ error: true, message: 'Remediation plan not found' });
      return;
    }

    let steps: Array<{ title: string; description?: string; completed?: boolean; id?: string }> = [];
    try {
      steps = JSON.parse(plan.steps || '[]');
    } catch {
      res.status(500).json({ error: true, message: 'Failed to parse plan steps' });
      return;
    }

    const stepIndex = parseInt(stepId, 10);
    if (isNaN(stepIndex) || stepIndex < 0 || stepIndex >= steps.length) {
      res.status(404).json({ error: true, message: 'Step not found' });
      return;
    }

    steps[stepIndex].completed = true;

    const updated = await prisma.remediationPlan.update({
      where: { id: planId },
      data: { steps: JSON.stringify(steps) },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'remediation_step_completed',
      entityType: 'remediation_plan',
      entityId: planId,
      metadata: { stepId, stepTitle: steps[stepIndex].title },
    });

    res.json(serializeRemediationPlan(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to complete remediation step' });
  }
});

// POST /compliance/remediate — Resolve a remediation plan
//
// Frontend sends snake_case (plan_id); older callers sent camelCase
// (planId). Accept both.
const remediateSchema = z.object({
  // snake_case (frontend)
  plan_id: z.string().optional(),
  // camelCase (legacy)
  planId: z.string().optional(),
}).refine(
  (d) => Boolean(d.plan_id || d.planId),
  { message: 'plan_id (or planId) is required' },
);

router.post('/compliance/remediate', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = remediateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const planId = (parsed.data.plan_id ?? parsed.data.planId) as string;

    const plan = await prisma.remediationPlan.findFirst({
      where: { id: planId, firmId },
    });
    if (!plan) {
      res.status(404).json({ error: true, message: 'Remediation plan not found' });
      return;
    }

    const updated = await prisma.remediationPlan.update({
      where: { id: planId },
      data: { status: 'resolved' },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'remediation_plan_resolved',
      entityType: 'remediation_plan',
      entityId: planId,
    });

    res.json(serializeRemediationPlan(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to resolve remediation plan' });
  }
});

export default router;
