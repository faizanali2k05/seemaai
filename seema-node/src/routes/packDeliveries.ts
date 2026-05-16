import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { emailQueue } from '../workers/emailWorker.js';
import logger from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Pack delivery routes — "send a compliance pack to a recipient"
//
// Both the SRA Inspection Pack (audit) and the PII Renewal Pack are
// already generated as downloadable bundles by other endpoints. This
// router lets the COLP have Seema send the pack directly to a recipient
// (broker, SRA inspector, partner) and logs every send for the audit
// trail.
//
// Endpoints
// ---------
//   POST /packs/:packType/send         — enqueue a send
//   GET  /packs/:packType/deliveries   — list past sends for this firm
//   POST /packs/deliveries/:id/resend  — re-queue a previously failed send
//
// `packType` ∈ {'sra_audit', 'pii_renewal'}.
// ---------------------------------------------------------------------------

const router = Router();

const PACK_TYPES = ['sra_audit', 'pii_renewal'] as const;
type PackType = (typeof PACK_TYPES)[number];

const PACK_LABEL: Record<PackType, string> = {
  sra_audit: 'SRA Inspection Pack',
  pii_renewal: 'PII Renewal Pack',
};

const sendSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().trim().max(255).optional().nullable(),
  message: z.string().trim().max(5000).optional().nullable(),
});

function isPackType(s: string): s is PackType {
  return (PACK_TYPES as readonly string[]).includes(s);
}

function serializeDelivery(d: {
  id: string;
  firmId: string;
  packType: string;
  recipientEmail: string;
  recipientName: string | null;
  message: string | null;
  sentByUserId: string;
  sentAt: Date;
  packSnapshotUrl: string | null;
  status: string;
  failureReason: string | null;
}) {
  return {
    id: d.id,
    firm_id: d.firmId,
    pack_type: d.packType,
    pack_label: isPackType(d.packType) ? PACK_LABEL[d.packType] : d.packType,
    recipient_email: d.recipientEmail,
    recipient_name: d.recipientName,
    message: d.message,
    sent_by_user_id: d.sentByUserId,
    sent_at: d.sentAt,
    pack_snapshot_url: d.packSnapshotUrl,
    status: d.status,
    failure_reason: d.failureReason,
  };
}

// ---------------------------------------------------------------------------
// POST /packs/:packType/send
// ---------------------------------------------------------------------------
router.post(
  '/packs/:packType/send',
  authenticate,
  requireRole('partner'),
  async (req: Request, res: Response) => {
    try {
      const packType = req.params.packType as string;
      if (!isPackType(packType)) {
        return res.status(400).json({
          error: true,
          message: `Unknown pack type '${packType}'. Expected one of: ${PACK_TYPES.join(', ')}`,
        });
      }

      const parsed = sendSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: true,
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        });
      }
      const { recipientEmail, recipientName, message } = parsed.data;

      const { firmId } = getTenantFilter(req);
      const userId = req.user!.userId;

      // Default cover note if the COLP didn't write one — keeps the
      // recipient experience consistent ("why did this email arrive?").
      const finalMessage =
        message?.trim() ||
        `Please find attached our ${PACK_LABEL[packType]} for review.`;

      const delivery = await prisma.packDelivery.create({
        data: {
          firmId,
          packType,
          recipientEmail,
          recipientName: recipientName ?? null,
          message: finalMessage,
          sentByUserId: userId,
          status: 'queued',
        },
      });

      // Hand off to the email worker — the worker will actually generate
      // the PDF and send via SendGrid (or log + mark failed if SendGrid
      // isn't configured).
      await emailQueue.add('send_compliance_pack', {
        firmId,
        deliveryId: delivery.id,
        packType,
      });

      try {
        await logAudit({
          firmId,
          userId,
          action: 'pack_delivery_queued',
          entityType: 'pack_delivery',
          entityId: delivery.id,
        });
      } catch (auditErr) {
        logger.warn('Failed to write audit log for pack delivery', {
          err: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      return res.status(202).json(serializeDelivery(delivery));
    } catch (err) {
      logger.error('Failed to enqueue pack delivery', {
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({
        error: true,
        message: 'Failed to enqueue pack delivery',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /packs/:packType/deliveries
// ---------------------------------------------------------------------------
router.get(
  '/packs/:packType/deliveries',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const packType = req.params.packType as string;
      if (!isPackType(packType)) {
        return res.status(400).json({
          error: true,
          message: `Unknown pack type '${packType}'`,
        });
      }
      const { firmId } = getTenantFilter(req);

      const rows = await prisma.packDelivery.findMany({
        where: { firmId, packType },
        orderBy: { sentAt: 'desc' },
        take: 100,
      });

      return res.json(rows.map(serializeDelivery));
    } catch (err) {
      logger.error('Failed to list pack deliveries', {
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({
        error: true,
        message: 'Failed to list pack deliveries',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /packs/deliveries/:id/resend
// Re-queues a previously failed send (or any send the COLP wants
// to repeat) without forcing the user to re-type the recipient details.
// ---------------------------------------------------------------------------
router.post(
  '/packs/deliveries/:id/resend',
  authenticate,
  requireRole('partner'),
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const userId = req.user!.userId;
      const id = req.params.id as string;

      const original = await prisma.packDelivery.findFirst({ where: { id, firmId } });
      if (!original) {
        return res.status(404).json({ error: true, message: 'Delivery not found' });
      }

      const fresh = await prisma.packDelivery.create({
        data: {
          firmId,
          packType: original.packType,
          recipientEmail: original.recipientEmail,
          recipientName: original.recipientName,
          message: original.message,
          sentByUserId: userId,
          status: 'queued',
        },
      });

      await emailQueue.add('send_compliance_pack', {
        firmId,
        deliveryId: fresh.id,
        packType: fresh.packType,
      });

      try {
        await logAudit({
          firmId,
          userId,
          action: 'pack_delivery_resent',
          entityType: 'pack_delivery',
          entityId: fresh.id,
        });
      } catch (auditErr) {
        logger.warn('Failed to write audit log for pack delivery resend', {
          err: auditErr instanceof Error ? auditErr.message : String(auditErr),
        });
      }

      return res.status(202).json(serializeDelivery(fresh));
    } catch (err) {
      logger.error('Failed to resend pack delivery', {
        err: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({
        error: true,
        message: 'Failed to resend pack delivery',
      });
    }
  }
);

export default router;
