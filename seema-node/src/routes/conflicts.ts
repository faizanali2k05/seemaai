import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeConflictCheck(c: any) {
  return {
    id: c.id,
    client_name: c.clientName,
    matter_type: c.matterType,
    parties: c.parties,
    status: c.status,
    conflict_type: c.conflictType,
    checked_by: c.checkedBy,
    resolution: c.resolution,
    resolved_at: c.resolvedAt,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function serializeConflictParty(p: any) {
  return {
    id: p.id,
    party_name: p.partyName,
    party_type: p.partyType,
    date_added: p.dateAdded,
    created_at: p.createdAt,
  };
}

// GET /compliance/conflicts/stats
router.get('/compliance/conflicts/stats', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const [total, pending, clear, flagged] = await Promise.all([
      prisma.conflictCheck.count({ where: { firmId } }),
      prisma.conflictCheck.count({ where: { firmId, status: 'pending' } }),
      prisma.conflictCheck.count({ where: { firmId, status: 'clear' } }),
      prisma.conflictCheck.count({ where: { firmId, status: 'flagged' } }),
    ]);

    res.json({ total, pending, clear, flagged });
  } catch (err) {
    next(err);
  }
});

// GET /compliance/conflicts
router.get('/compliance/conflicts', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const checks = await prisma.conflictCheck.findMany({ where: { firmId } });
    res.json(checks.map(serializeConflictCheck));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/conflicts/check
//
// Frontend sends snake_case (client_name, matter_type, opposing_party,
// related_parties, matter_description); older callers used camelCase. Accept
// both shapes so the route doesn't 400 on the snake_case payload.
//
// `related_parties` may arrive as either an array (preferred) or a
// comma-separated string (some legacy callers); normalize internally.
const createConflictCheckSchema = z.object({
  // snake_case (what the React form sends)
  client_name: z.string().optional(),
  matter_type: z.string().optional(),
  opposing_party: z.string().optional(),
  related_parties: z.union([z.array(z.string()), z.string()]).optional(),
  matter_description: z.string().optional(),
  // camelCase (legacy)
  clientName: z.string().optional(),
  matterType: z.string().optional(),
  parties: z.array(z.string()).optional(),
}).refine(
  (d) => Boolean(d.client_name || d.clientName),
  { message: 'client_name (or clientName) is required' },
);

router.post('/compliance/conflicts/check', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createConflictCheckSchema.parse(req.body);

    const primaryName = (data.client_name ?? data.clientName) as string;
    const matterType = data.matter_type ?? data.matterType ?? null;

    // Build the de-duplicated list of names to scan for. We always include
    // the primary client name plus the opposing party (if present) and any
    // related parties. The legacy `parties` array (camelCase) is also
    // honoured.
    const relatedFromBody: string[] = Array.isArray(data.related_parties)
      ? data.related_parties
      : typeof data.related_parties === 'string'
        ? data.related_parties.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

    const namesToScan = Array.from(
      new Set(
        [
          primaryName,
          data.opposing_party ?? '',
          ...relatedFromBody,
          ...(data.parties ?? []),
        ]
          .map((s) => (s ?? '').trim())
          .filter((s) => s.length > 0),
      ),
    );

    // For each name, perform a case-insensitive partial-match scan against
    // matters, client intakes, and the manually-maintained conflict_parties
    // register. Results are merged and de-duplicated by row id.
    const matterMap = new Map<string, any>();
    const intakeMap = new Map<string, any>();
    const partyMap = new Map<string, any>();

    await Promise.all(
      namesToScan.flatMap((name) => [
        prisma.matter
          .findMany({
            where: {
              firmId,
              clientName: { contains: name, mode: 'insensitive' },
            },
          })
          .then((rows) => rows.forEach((r) => matterMap.set(r.id, r))),
        prisma.clientIntake
          .findMany({
            where: {
              firmId,
              OR: [
                { clientName: { contains: name, mode: 'insensitive' } },
                { companyName: { contains: name, mode: 'insensitive' } },
              ],
            },
          })
          .then((rows) => rows.forEach((r) => intakeMap.set(r.id, r))),
        prisma.conflictParty
          .findMany({
            where: {
              firmId,
              partyName: { contains: name, mode: 'insensitive' },
            },
          })
          .then((rows) => rows.forEach((r) => partyMap.set(r.id, r))),
      ]),
    );

    const matterMatches = Array.from(matterMap.values()).map((m: any) => ({
      matter_ref: m.reference ?? m.id,
      matter_type: m.matterType,
      status: m.status,
      client_name: m.clientName,
      created_at: m.createdAt,
    }));

    const intakeMatches = Array.from(intakeMap.values()).map((i: any) => ({
      client_name: i.clientName,
      company_name: i.companyName,
      status: i.status,
      created_at: i.createdAt,
    }));

    const partyMatches = Array.from(partyMap.values()).map((p: any) => ({
      party_name: p.partyName,
      party_type: p.partyType,
      date_added: p.dateAdded,
    }));

    // Clio scaffold: if the firm has a connected Clio integration we surface
    // an empty placeholder array so the frontend can render "Clio scan: not
    // yet implemented" gracefully. Wiring the actual Clio contact search is
    // a separate engineering job.
    const clioIntegration = await prisma.integration.findFirst({
      where: { firmId, provider: 'clio', status: 'connected' },
    });
    const clioContacts: any[] = [];
    // TODO: when Clio search is implemented, populate clioContacts with the
    // results of querying the Clio Contacts API for each name in
    // namesToScan. For now we just expose whether the integration is wired.

    const totalMatches =
      matterMatches.length + intakeMatches.length + partyMatches.length;
    const conflictFound = totalMatches > 0;
    const status = conflictFound ? 'flagged' : 'clear';

    const summaryParts: string[] = [];
    if (matterMatches.length > 0) {
      summaryParts.push(
        `${matterMatches.length} prior matter${matterMatches.length === 1 ? '' : 's'}`,
      );
    }
    if (intakeMatches.length > 0) {
      summaryParts.push(
        `${intakeMatches.length} prior intake${intakeMatches.length === 1 ? '' : 's'}`,
      );
    }
    if (partyMatches.length > 0) {
      summaryParts.push(
        `${partyMatches.length} conflict party match${partyMatches.length === 1 ? '' : 'es'}`,
      );
    }
    const summary = conflictFound
      ? `Found ${summaryParts.join(', ')} with similar names`
      : `No matches found across matters, intakes${
          clioIntegration ? ', Clio contacts (pending),' : ''
        } or the conflict parties register`;

    const conflictType = conflictFound ? summaryParts.join('; ') : null;

    const check = await prisma.conflictCheck.create({
      data: {
        firmId,
        clientName: primaryName,
        matterType: matterType,
        parties: JSON.stringify(namesToScan),
        status,
        conflictType,
      },
    });

    res.status(201).json({
      ...serializeConflictCheck(check),
      conflict_found: conflictFound,
      matches: {
        matters: matterMatches,
        intakes: intakeMatches,
        parties: partyMatches,
        clio_contacts: clioContacts,
      },
      clio_integration_connected: Boolean(clioIntegration),
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// POST /compliance/conflicts/:checkId/resolve
const resolveConflictSchema = z.object({
  resolution: z.string(),
});

router.post('/compliance/conflicts/:checkId/resolve', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = resolveConflictSchema.parse(req.body);

    const result = await prisma.conflictCheck.updateMany({
      where: { id: (req.params.checkId as string), firmId },
      data: {
        status: 'resolved',
        resolution: data.resolution,
        resolvedAt: new Date(),
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Conflict check not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'conflict_resolved',
      entityType: 'conflict_check',
      entityId: (req.params.checkId as string),
      metadata: { resolution: data.resolution },
    });

    const updated = await prisma.conflictCheck.findFirst({ where: { id: (req.params.checkId as string), firmId } });
    res.json(updated ? serializeConflictCheck(updated) : null);
  } catch (err) {
    next(err);
  }
});

// GET /compliance/conflicts/parties
router.get('/compliance/conflicts/parties', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const parties = await prisma.conflictParty.findMany({ where: { firmId } });
    res.json(parties.map(serializeConflictParty));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/conflicts/parties
//
// Frontend sends snake_case (party_name, party_type); older callers sent
// camelCase. Accept both so the route doesn't 400.
const createPartySchema = z.object({
  // snake_case (frontend)
  party_name: z.string().optional(),
  party_type: z.string().optional(),
  // camelCase (legacy)
  partyName: z.string().optional(),
  partyType: z.string().optional(),
}).refine(
  (d) => Boolean(d.party_name || d.partyName),
  { message: 'party_name (or partyName) is required' },
).refine(
  (d) => Boolean(d.party_type || d.partyType),
  { message: 'party_type (or partyType) is required' },
);

router.post('/compliance/conflicts/parties', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createPartySchema.parse(req.body);

    const party = await prisma.conflictParty.create({
      data: {
        firmId,
        partyName: (data.party_name ?? data.partyName) as string,
        partyType: (data.party_type ?? data.partyType) as string,
      },
    });

    res.status(201).json(serializeConflictParty(party));
  } catch (err) {
    next(err);
  }
});

export default router;
