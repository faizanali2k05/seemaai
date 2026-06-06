import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// Default cadence (days) per legacy frequency string. Used when a
// SupervisionRecord row has no explicit cadenceDays value.
// SRA Code of Conduct for Firms, Rule 3 doesn't fix a cadence — most
// firms commit to monthly 1:1s for trainees/junior staff and quarterly
// for qualified solicitors. These defaults match that convention.
const DEFAULT_CADENCE_DAYS: Record<string, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

function cadenceDaysFor(record: { cadenceDays: number | null; frequency: string | null }): number {
  if (record.cadenceDays && record.cadenceDays > 0) return record.cadenceDays;
  const f = (record.frequency ?? '').toLowerCase();
  return DEFAULT_CADENCE_DAYS[f] ?? 30;
}

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeSupervision(s: any) {
  return {
    id: s.id,
    staff_id: s.staffId,
    staff_name: s.staffName,
    supervisor: s.supervisor,
    frequency: s.frequency,
    cadence_days: s.cadenceDays ?? null,
    next_due: s.nextDue,
    last_session: s.lastSession,
    notes_count: s.notesCount ?? 0,
    status: s.status,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function serializeSession(s: any) {
  return {
    id: s.id,
    relationship_id: s.relationshipId,
    session_date: s.sessionDate,
    duration_minutes: s.durationMinutes,
    topics_discussed: s.topicsDiscussed,
    action_items: s.actionItems,
    supervisee_acknowledged_at: s.superviseeAcknowledgedAt,
    created_by_user_id: s.createdByUserId,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

// GET /compliance/supervision — List supervision records for firm
router.get('/compliance/supervision', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const records = await prisma.supervisionRecord.findMany({
      where: { firmId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(records.map(serializeSupervision));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch supervision records' });
  }
});

// GET /compliance/supervision/overdue — List overdue supervision records
router.get('/compliance/supervision/overdue', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const now = new Date();

    const overdue = await prisma.supervisionRecord.findMany({
      where: {
        firmId,
        nextDue: { lt: now },
        status: { not: 'completed' },
      },
      orderBy: { nextDue: 'asc' },
    });
    res.json(overdue.map(serializeSupervision));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch overdue supervision records' });
  }
});

// POST /compliance/briefing/schedule-supervision — Schedule supervision
//
// Frontend sends snake_case (staff_id, staff_name, next_due); older callers
// sent camelCase. Accept both so the route doesn't 400.
const scheduleSchema = z.object({
  supervisor: z.string(),
  frequency: z.string(),
  // snake_case (frontend)
  staff_id: z.string().optional(),
  staff_name: z.string().optional(),
  next_due: z.string().optional(),
  // camelCase (legacy)
  staffId: z.string().optional(),
  staffName: z.string().optional(),
  nextDue: z.string().optional(),
}).refine(
  (d) => Boolean(d.staff_id || d.staffId),
  { message: 'staff_id (or staffId) is required' },
).refine(
  (d) => Boolean(d.staff_name || d.staffName),
  { message: 'staff_name (or staffName) is required' },
).refine(
  (d) => Boolean(d.next_due || d.nextDue),
  { message: 'next_due (or nextDue) is required' },
);

router.post('/compliance/briefing/schedule-supervision', authenticate, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parsed = scheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
      return;
    }

    const { supervisor, frequency } = parsed.data;
    const staffId = (parsed.data.staff_id ?? parsed.data.staffId) as string;
    const staffName = (parsed.data.staff_name ?? parsed.data.staffName) as string;
    const nextDue = (parsed.data.next_due ?? parsed.data.nextDue) as string;

    const record = await prisma.supervisionRecord.create({
      data: {
        firmId,
        staffId,
        staffName,
        supervisor,
        frequency,
        nextDue: new Date(nextDue),
        status: 'pending',
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'supervision_scheduled',
      entityType: 'supervision_record',
      entityId: record.id,
      metadata: { staffName, supervisor, frequency },
    });

    res.status(201).json(serializeSupervision(record));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to schedule supervision' });
  }
});

// POST /compliance/supervision/:supervisionId/complete — Complete supervision
router.post('/compliance/supervision/:supervisionId/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { supervisionId } = req.params as Record<string, string>;

    const record = await prisma.supervisionRecord.findFirst({
      where: { id: supervisionId, firmId },
    });
    if (!record) {
      res.status(404).json({ error: true, message: 'Supervision record not found' });
      return;
    }

    // Calculate next due based on frequency
    const now = new Date();
    let nextDue = new Date(now);
    switch (record.frequency) {
      case 'weekly':
        nextDue.setDate(nextDue.getDate() + 7);
        break;
      case 'fortnightly':
        nextDue.setDate(nextDue.getDate() + 14);
        break;
      case 'monthly':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'quarterly':
        nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'annually':
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
      default:
        nextDue.setMonth(nextDue.getMonth() + 1);
    }

    const updated = await prisma.supervisionRecord.update({
      where: { id: supervisionId },
      data: {
        status: 'completed',
        lastSession: now,
        nextDue,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'supervision_completed',
      entityType: 'supervision_record',
      entityId: supervisionId,
    });

    res.json(serializeSupervision(updated));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to complete supervision' });
  }
});

// ---------------------------------------------------------------------------
// Session log endpoints (task #52)
//
// SRA Code of Conduct for Firms, Rule 3 expects firms to evidence that
// supervision actually happens. The /supervision/relationships/:id/sessions
// endpoints let supervisors log meetings against an existing
// SupervisionRecord (the "register" row) and let supervisees acknowledge
// they've seen each session note.
// ---------------------------------------------------------------------------

const sessionSchema = z.object({
  session_date: z.string().optional(),
  duration_minutes: z.number().int().nonnegative().optional(),
  topics_discussed: z.string().optional(),
  action_items: z.string().optional(),
});

// POST /compliance/supervision/relationships/:id/sessions — log a session
router.post(
  '/compliance/supervision/relationships/:id/sessions',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const { id: relationshipId } = req.params as Record<string, string>;

      const relationship = await prisma.supervisionRecord.findFirst({
        where: { id: relationshipId, firmId },
      });
      if (!relationship) {
        res.status(404).json({ error: true, message: 'Supervision relationship not found' });
        return;
      }

      const parsed = sessionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
        return;
      }

      const sessionDate = parsed.data.session_date
        ? new Date(parsed.data.session_date)
        : new Date();

      const session = await prisma.supervisionSession.create({
        data: {
          firmId,
          relationshipId,
          sessionDate,
          durationMinutes: parsed.data.duration_minutes ?? null,
          topicsDiscussed: parsed.data.topics_discussed ?? null,
          actionItems: parsed.data.action_items ?? null,
          createdByUserId: req.user!.userId,
        },
      });

      // Roll the relationship's lastSession + nextDue forward so the
      // existing register UI stays in sync.
      const cadence = cadenceDaysFor(relationship);
      const nextDue = new Date(sessionDate);
      nextDue.setDate(nextDue.getDate() + cadence);

      await prisma.supervisionRecord.update({
        where: { id: relationshipId },
        data: {
          lastSession: sessionDate,
          nextDue,
          notesCount: (relationship.notesCount ?? 0) + 1,
          status: 'on_track',
        },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'supervision_session_logged',
        entityType: 'supervision_session',
        entityId: session.id,
        metadata: { relationshipId, sessionDate: sessionDate.toISOString() },
      });

      res.status(201).json(serializeSession(session));
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to log supervision session' });
    }
  }
);

// GET /compliance/supervision/relationships/:id/sessions — list sessions for a relationship
router.get(
  '/compliance/supervision/relationships/:id/sessions',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const { id: relationshipId } = req.params as Record<string, string>;

      const sessions = await prisma.supervisionSession.findMany({
        where: { firmId, relationshipId },
        orderBy: { sessionDate: 'desc' },
      });

      res.json(sessions.map(serializeSession));
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to fetch supervision sessions' });
    }
  }
);

// GET /compliance/supervision/sessions — firm-wide session feed (Sessions tab)
router.get('/compliance/supervision/sessions', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const sessions = await prisma.supervisionSession.findMany({
      where: { firmId },
      orderBy: { sessionDate: 'desc' },
      take: 200,
    });
    res.json(sessions.map(serializeSession));
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch supervision sessions' });
  }
});

// PATCH /compliance/supervision/sessions/:id/acknowledge — supervisee marks as read
router.patch(
  '/compliance/supervision/sessions/:id/acknowledge',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const { id: sessionId } = req.params as Record<string, string>;

      const session = await prisma.supervisionSession.findFirst({
        where: { id: sessionId, firmId },
      });
      if (!session) {
        res.status(404).json({ error: true, message: 'Supervision session not found' });
        return;
      }

      if (session.superviseeAcknowledgedAt) {
        res.json(serializeSession(session));
        return;
      }

      const updated = await prisma.supervisionSession.update({
        where: { id: sessionId },
        data: { superviseeAcknowledgedAt: new Date() },
      });

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'supervision_session_acknowledged',
        entityType: 'supervision_session',
        entityId: sessionId,
      });

      res.json(serializeSession(updated));
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to acknowledge supervision session' });
    }
  }
);

// GET /compliance/supervision/overdue-sessions — relationships overdue against cadence
//
// Distinct from the legacy /compliance/supervision/overdue (which uses the
// register's nextDue column). This endpoint computes overdue status from
// the actual supervision_sessions log: (today - last_session_date) >
// cadence_days, plus relationships with no sessions ever.
router.get(
  '/compliance/supervision/overdue-sessions',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const records = await prisma.supervisionRecord.findMany({
        where: { firmId },
        orderBy: { createdAt: 'desc' },
      });

      const now = Date.now();
      const out: Array<Record<string, unknown>> = [];

      for (const r of records) {
        const cadence = cadenceDaysFor(r);
        // Prefer the most recent session_date from supervision_sessions over
        // the legacy lastSession column, which can drift if sessions are
        // back-dated.
        const lastSession = await prisma.supervisionSession.findFirst({
          where: { firmId, relationshipId: r.id },
          orderBy: { sessionDate: 'desc' },
          select: { sessionDate: true },
        });

        const lastDate = lastSession?.sessionDate ?? r.lastSession ?? null;
        let status: 'never' | 'on_track' | 'amber' | 'red' = 'never';
        let daysSince: number | null = null;

        if (lastDate) {
          daysSince = Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
          const overdueBy = daysSince - cadence;
          if (overdueBy <= 0) status = 'on_track';
          else if (overdueBy <= 7) status = 'amber';
          else status = 'red';
        }

        if (status === 'never' || status === 'amber' || status === 'red') {
          out.push({
            ...serializeSupervision(r),
            cadence_days: cadence,
            last_session_date: lastDate,
            days_since_last: daysSince,
            overdue_status: status,
          });
        }
      }

      res.json(out);
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to fetch overdue supervision' });
    }
  }
);

// PATCH /compliance/supervision/relationships/:id — update cadence (admin only)
const cadencePatchSchema = z.object({
  cadence_days: z.number().int().positive().optional(),
  frequency: z.string().optional(),
});

router.patch(
  '/compliance/supervision/relationships/:id',
  authenticate,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const { firmId } = getTenantFilter(req);
      const { id } = req.params as Record<string, string>;

      const parsed = cadencePatchSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: true, message: 'Validation failed', details: parsed.error.errors });
        return;
      }

      const existing = await prisma.supervisionRecord.findFirst({ where: { id, firmId } });
      if (!existing) {
        res.status(404).json({ error: true, message: 'Supervision relationship not found' });
        return;
      }

      const updated = await prisma.supervisionRecord.update({
        where: { id },
        data: {
          ...(parsed.data.cadence_days !== undefined && { cadenceDays: parsed.data.cadence_days }),
          ...(parsed.data.frequency !== undefined && { frequency: parsed.data.frequency }),
        },
      });

      res.json(serializeSupervision(updated));
    } catch (err) {
      res.status(500).json({ error: true, message: 'Failed to update supervision relationship' });
    }
  }
);

export default router;
