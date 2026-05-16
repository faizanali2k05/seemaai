import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializePolicy(p: any) {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    content: p.content,
    version: p.version,
    status: p.status,
    last_reviewed: p.lastReviewed,
    next_review: p.nextReview,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// GET /compliance/policies — List policy documents for firm
router.get('/compliance/policies', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const policies = await prisma.policyDocument.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(policies.map(serializePolicy));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch policies' });
  }
});

// POST /compliance/policies — Create policy document
const createPolicySchema = z.object({
  title: z.string(),
  category: z.string().optional(),
  content: z.string().optional(),
  version: z.string().optional(),
});

router.post('/compliance/policies', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { title, category, content, version } = parsed.data;

    const policy = await prisma.policyDocument.create({
      data: {
        firmId,
        title,
        category: category || null,
        content: content || null,
        version: version || '1.0',
        status: 'draft',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'policy_created',
      entityType: 'policy_document',
      entityId: policy.id,
      metadata: { title, category },
    });

    res.status(201).json(serializePolicy(policy));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create policy' });
  }
});

// PUT /compliance/policies/:policyId — Update policy
router.put('/compliance/policies/:policyId', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { policyId } = req.params as Record<string, string>;

    const existing = await prisma.policyDocument.findFirst({
      where: { id: policyId, firmId },
    });
    if (!existing) {
      res.status(404).json({ error: true, message: 'Policy not found' });
      return;
    }

    // Policy fields are simple single-word names; keep snake/camel parity for
    // anything that might split (currently nothing — but safe pattern).
    const b = req.body ?? {};
    const updateData: Record<string, unknown> = {};
    if (b.title !== undefined) updateData.title = b.title;
    if (b.category !== undefined) updateData.category = b.category;
    if (b.content !== undefined) updateData.content = b.content;
    if (b.version !== undefined) updateData.version = b.version;
    if (b.status !== undefined) updateData.status = b.status;

    const updated = await prisma.policyDocument.update({
      where: { id: policyId },
      data: updateData,
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'policy_updated',
      entityType: 'policy_document',
      entityId: policyId,
    });

    res.json(serializePolicy(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to update policy' });
  }
});

// POST /compliance/policies/:policyId/review — Mark policy as reviewed
router.post('/compliance/policies/:policyId/review', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { policyId } = req.params as Record<string, string>;

    const existing = await prisma.policyDocument.findFirst({
      where: { id: policyId, firmId },
    });
    if (!existing) {
      res.status(404).json({ error: true, message: 'Policy not found' });
      return;
    }

    const now = new Date();
    const nextReview = new Date(now);
    nextReview.setFullYear(nextReview.getFullYear() + 1);

    const updated = await prisma.policyDocument.update({
      where: { id: policyId },
      data: {
        lastReviewed: now,
        nextReview,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'policy_reviewed',
      entityType: 'policy_document',
      entityId: policyId,
    });

    res.json(serializePolicy(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to review policy' });
  }
});

export default router;
