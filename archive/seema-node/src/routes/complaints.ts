import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeComplaint(c: any) {
  return {
    id: c.id,
    complainant_name: c.complainantName,
    complainant_type: c.complainantType,
    category: c.category,
    description: c.description,
    priority: c.priority,
    status: c.status,
    resolution: c.resolution,
    closed_date: c.closedDate,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

// GET /compliance/complaints/stats
router.get('/compliance/complaints/stats', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const [total, open, acknowledged, resolved] = await Promise.all([
      prisma.complaint.count({ where: { firmId } }),
      prisma.complaint.count({ where: { firmId, status: 'open' } }),
      prisma.complaint.count({ where: { firmId, status: 'acknowledged' } }),
      prisma.complaint.count({ where: { firmId, status: 'resolved' } }),
    ]);

    res.json({ total, open, acknowledged, resolved });
  } catch (err) {
    next(err);
  }
});

// GET /compliance/complaints
router.get('/compliance/complaints', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const complaints = await prisma.complaint.findMany({ where: { firmId } });
    res.json(complaints.map(serializeComplaint));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/complaints
//
// Frontend sends snake_case (complainant_name, complainant_type); older
// callers sent camelCase. Accept both so the route doesn't 400.
const createComplaintSchema = z.object({
  category: z.string(),
  description: z.string(),
  priority: z.string(),
  // snake_case (frontend)
  complainant_name: z.string().optional(),
  complainant_type: z.string().optional(),
  // camelCase (legacy)
  complainantName: z.string().optional(),
  complainantType: z.string().optional(),
}).refine(
  (d) => Boolean(d.complainant_name || d.complainantName),
  { message: 'complainant_name (or complainantName) is required' },
).refine(
  (d) => Boolean(d.complainant_type || d.complainantType),
  { message: 'complainant_type (or complainantType) is required' },
);

router.post('/compliance/complaints', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createComplaintSchema.parse(req.body);

    const complaint = await prisma.complaint.create({
      data: {
        firmId,
        complainantName: (data.complainant_name ?? data.complainantName) as string,
        complainantType: (data.complainant_type ?? data.complainantType) as string,
        category: data.category,
        description: data.description,
        priority: data.priority,
      },
    });

    res.status(201).json(serializeComplaint(complaint));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/complaints/:complaintId/acknowledge
router.post('/compliance/complaints/:complaintId/acknowledge', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const result = await prisma.complaint.updateMany({
      where: { id: (req.params.complaintId as string), firmId },
      data: { status: 'acknowledged' },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Complaint not found' });
      return;
    }

    const updated = await prisma.complaint.findFirst({ where: { id: (req.params.complaintId as string), firmId } });
    res.json(updated ? serializeComplaint(updated) : null);
  } catch (err) {
    next(err);
  }
});

// POST /compliance/complaints/:complaintId/resolve
const resolveComplaintSchema = z.object({
  resolution: z.string(),
});

router.post('/compliance/complaints/:complaintId/resolve', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = resolveComplaintSchema.parse(req.body);

    const result = await prisma.complaint.updateMany({
      where: { id: (req.params.complaintId as string), firmId },
      data: {
        status: 'resolved',
        resolution: data.resolution,
        closedDate: new Date(),
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Complaint not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'complaint_resolved',
      entityType: 'complaint',
      entityId: (req.params.complaintId as string),
      metadata: { resolution: data.resolution },
    });

    const updated = await prisma.complaint.findFirst({ where: { id: (req.params.complaintId as string), firmId } });
    res.json(updated ? serializeComplaint(updated) : null);
  } catch (err) {
    next(err);
  }
});

export default router;
