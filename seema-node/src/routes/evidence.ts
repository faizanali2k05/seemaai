import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeEvidence(d: any) {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    category: d.category,
    uploaded_by: d.uploadedBy,
    status: d.status,
    file_path: d.filePath,
    file_size: d.fileSize,
    review_date: d.reviewDate,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

// Schema is already plain text fields with no camelCase keys, so we keep it
// as-is. Title/description/category map directly to the snake_case payload.
const evidenceSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
});

// GET /compliance/evidence
router.get('/compliance/evidence', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    const documents = await prisma.evidenceDocument.findMany({
      where: { firmId },
    });

    res.json(documents.map(serializeEvidence));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch evidence documents' });
  }
});

// POST /compliance/evidence
router.post('/compliance/evidence', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = evidenceSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const document = await prisma.evidenceDocument.create({
      data: {
        firmId,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        uploadedBy: req.user!.userId,
        status: 'pending',
      },
    });

    res.status(201).json(serializeEvidence(document));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to create evidence record' });
  }
});

// POST /compliance/evidence/:id/verify (admin only)
router.post('/compliance/evidence/:id/verify', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { id } = req.params as Record<string, string>;

    const document = await prisma.evidenceDocument.update({
      where: { id, firmId },
      data: {
        status: 'verified',
        reviewDate: new Date(),
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'verify_evidence',
      entityType: 'evidence_document',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json(serializeEvidence(document));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to verify evidence' });
  }
});

// GET /compliance/evidence/:id/download
router.get('/compliance/evidence/:id/download', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { id } = req.params as Record<string, string>;

    const document = await prisma.evidenceDocument.findFirst({
      where: { id, firmId },
    });

    if (!document) {
      res.status(404).json({ error: true, message: 'Evidence document not found' });
      return;
    }

    res.json({
      id: document.id,
      title: document.title,
      file_path: document.filePath,
      file_size: document.fileSize,
    });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to get download info' });
  }
});

export default router;
