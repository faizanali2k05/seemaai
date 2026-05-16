import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeAlert(a: any) {
  return {
    id: a.id,
    alert_type: a.alertType,
    severity: a.severity,
    title: a.title,
    description: a.description,
    status: a.status,
    acknowledged_at: a.acknowledgedAt,
    resolved_at: a.resolvedAt,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

function serializeDeadline(d: any) {
  return {
    id: d.id,
    title: d.title,
    due_date: d.dueDate,
    priority: d.priority,
    category: d.category,
    source_type: d.category,
    assigned_to: d.assignedTo,
    status: d.status,
    notes: d.notes ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

// GET /dashboard/stats
router.get('/dashboard/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const [alerts, breaches, intakes, training, scans, staff, matters] =
      await Promise.all([
        prisma.complianceAlert.count({ where: { firmId, status: 'open' } }),
        prisma.breachReport.count({ where: { firmId, status: 'open' } }),
        prisma.clientIntake.count({ where: { firmId, status: 'pending' } }),
        prisma.staffTraining.count({ where: { firmId, status: 'pending' } }),
        prisma.complianceScanResult.count({ where: { firmId } }),
        prisma.staffMember.count({ where: { firmId, status: 'active' } }),
        prisma.matter.count({ where: { firmId, status: 'open' } }),
      ]);

    res.json({ alerts, breaches, intakes, training, scans, staff, matters });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch dashboard stats' });
  }
});

// GET /dashboard/notifications — stub.
// The frontend polls this on every dashboard load; if it doesn't exist
// the console fills with 404 errors. Returns an empty list of notifications
// for now so the UI is quiet. Replace with a real implementation when we
// have a notifications model.
router.get('/dashboard/notifications', authenticate, async (_req: Request, res: Response) => {
  res.json({ notifications: [], unread_count: 0 });
});

// GET /compliance/daily-briefing
router.get('/compliance/daily-briefing', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [alerts, overdueItems, upcomingDeadlines] = await Promise.all([
      prisma.complianceAlert.findMany({
        where: {
          firmId,
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.deadline.findMany({
        where: {
          firmId,
          dueDate: { lt: now },
          status: { not: 'completed' },
        },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.deadline.findMany({
        where: {
          firmId,
          dueDate: { gte: now, lte: sevenDaysFromNow },
        },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    res.json({
      alerts: alerts.map(serializeAlert),
      overdue_items: overdueItems.map(serializeDeadline),
      upcoming_deadlines: upcomingDeadlines.map(serializeDeadline),
      generated_at: now.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch daily briefing' });
  }
});

export default router;
