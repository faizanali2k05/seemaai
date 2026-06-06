import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    assigned_to: t.assignedTo,
    due_date: t.dueDate,
    completed_at: t.completedAt,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

function serializeTraining(t: any) {
  return {
    id: t.id,
    staff_id: t.staffId,
    course_name: t.courseName,
    provider: t.provider,
    due_date: t.dueDate,
    completed_date: t.completedDate,
    cpd_hours: t.cpdHours,
    status: t.status,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

function serializeChaser(c: any) {
  return {
    id: c.id,
    chaser_type: c.chaserType,
    recipient: c.recipient,
    recipient_email: c.recipient,
    subject: c.subject,
    status: c.status,
    attempts: c.attempts,
    sent_at: c.sentAt,
    response_at: c.responseAt,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

// GET /staff/portal — Get staff member's own tasks, training, chasers
router.get('/staff/portal', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const user = req.user!;

    // Look up the user account to get staffId
    const userAccount = await prisma.userAccount.findUnique({
      where: { id: user.userId },
    });
    const staffId = userAccount?.staffId;

    const [tasks, training, chasers] = await Promise.all([
      prisma.complianceTask.findMany({
        where: { firmId, assignedTo: staffId || user.userId },
        orderBy: { createdAt: 'desc' },
      }),
      staffId
        ? prisma.staffTraining.findMany({
            where: { firmId, staffId },
            orderBy: { createdAt: 'desc' },
          })
        : [],
      staffId
        ? prisma.chaserLog.findMany({
            where: { firmId },
            orderBy: { createdAt: 'desc' },
          })
        : [],
    ]);

    res.json({
      tasks: tasks.map(serializeTask),
      training: training.map(serializeTraining),
      chasers: chasers.map(serializeChaser),
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch staff portal data' });
  }
});

// POST /staff/complete-training/:trainingId — Mark training completed
router.post('/staff/complete-training/:trainingId', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { trainingId } = req.params as Record<string, string>;

    const training = await prisma.staffTraining.findFirst({
      where: { id: trainingId, firmId },
    });
    if (!training) {
      res.status(404).json({ error: true, message: 'Training not found' });
      return;
    }

    const updated = await prisma.staffTraining.update({
      where: { id: trainingId },
      data: {
        status: 'completed',
        completedDate: new Date().toISOString().split('T')[0],
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'training_completed',
      entityType: 'staff_training',
      entityId: trainingId,
    });

    res.json(serializeTraining(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to complete training' });
  }
});

// POST /staff/log-action — Create audit log entry for staff action
//
// Frontend sends snake_case (entity_type, entity_id); older callers sent
// camelCase. Accept both so the route doesn't 400.
const logActionSchema = z.object({
  action: z.string(),
  details: z.string().optional(),
  // snake_case (frontend)
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  // camelCase (legacy)
  entityType: z.string().optional(),
  entityId: z.string().optional(),
}).refine(
  (d) => Boolean(d.entity_type || d.entityType),
  { message: 'entity_type (or entityType) is required' },
);

router.post('/staff/log-action', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = logActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { action, details } = parsed.data;
    const entityType = (parsed.data.entity_type ?? parsed.data.entityType) as string;
    const entityId = parsed.data.entity_id ?? parsed.data.entityId;

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action,
      entityType,
      entityId,
      metadata: details ? { details } : undefined,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to log action' });
  }
});

// POST /staff/acknowledge-chaser/:chaserId — Acknowledge chaser
router.post('/staff/acknowledge-chaser/:chaserId', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { chaserId } = req.params as Record<string, string>;

    const chaser = await prisma.chaserLog.findFirst({
      where: { id: chaserId, firmId },
    });
    if (!chaser) {
      res.status(404).json({ error: true, message: 'Chaser not found' });
      return;
    }

    const updated = await prisma.chaserLog.update({
      where: { id: chaserId },
      data: {
        status: 'acknowledged',
        responseAt: new Date(),
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'chaser_acknowledged',
      entityType: 'chaser_log',
      entityId: chaserId,
    });

    res.json(serializeChaser(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to acknowledge chaser' });
  }
});

export default router;
