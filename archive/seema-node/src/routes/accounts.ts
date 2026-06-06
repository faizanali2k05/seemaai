import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';

const router = Router();

// Serialize Prisma's camelCase to the snake_case shape the frontend expects.
function serializeAccount(a: any) {
  // The frontend's per-matter view reads `client_name` and `matter_ref` as
  // separate columns. The DB doesn't have those fields, so we recover them
  // from the synthesised `account_name` (format: "<client> — <matter_ref>").
  // Falls back gracefully when the format doesn't match.
  let clientName: string | null = null;
  let matterRef: string | null = null;
  if (typeof a.accountName === 'string' && a.accountName.includes(' — ')) {
    const [c, m] = a.accountName.split(' — ');
    clientName = c?.trim() || null;
    matterRef = m?.trim() || null;
  } else {
    clientName = a.accountName ?? null;
  }
  return {
    id: a.id,
    account_name: a.accountName,
    account_type: a.accountType,
    bank_name: a.bankName,
    account_number: a.accountNumber ?? null,
    sort_code: a.sortCode ?? null,
    balance: a.balance,
    status: a.status,
    client_name: clientName,
    matter_ref: matterRef,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

function serializeTransaction(t: any) {
  return {
    id: t.id,
    account_id: t.accountId,
    description: t.description,
    amount: t.amount,
    type: t.type,
    matter_ref: t.matterRef,
    date: t.date,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

function serializeReconciliation(r: any) {
  return {
    id: r.id,
    period: r.period,
    status: r.status,
    completed_at: r.completedAt,
    reconciled_by: r.reconciledBy,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

// GET /compliance/accounts/stats
router.get('/compliance/accounts/stats', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const [totalAccounts, balanceAgg, activeAccounts] = await Promise.all([
      prisma.clientAccount.count({ where: { firmId } }),
      prisma.clientAccount.aggregate({ where: { firmId }, _sum: { balance: true } }),
      prisma.clientAccount.count({ where: { firmId, status: 'active' } }),
    ]);

    res.json({
      total_accounts: totalAccounts,
      total_balance: balanceAgg._sum.balance || 0,
      active_accounts: activeAccounts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /compliance/accounts
router.get('/compliance/accounts', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const accounts = await prisma.clientAccount.findMany({ where: { firmId } });
    res.json(accounts.map(serializeAccount));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/accounts
//
// Frontend sends snake_case (account_name, account_type, bank_name); older
// callers sent camelCase. Accept both so the route doesn't 400.
// Two shapes are accepted:
// 1. Direct bank-account creation: {account_name, account_type, bank_name}
// 2. The frontend's per-matter "open client account" modal:
//    {client_name, matter_ref, fee_earner_id} — we synthesise account_name
//    from client_name + matter_ref and default account_type to "client".
const createAccountSchema = z.object({
  // direct bank-account form (snake_case)
  account_name: z.string().optional(),
  account_type: z.string().optional(),
  bank_name: z.string().optional(),
  // camelCase (legacy)
  accountName: z.string().optional(),
  accountType: z.string().optional(),
  bankName: z.string().optional(),
  // per-matter "open client account" form
  client_name: z.string().optional(),
  matter_ref: z.string().optional(),
  fee_earner_id: z.string().optional(),
}).refine(
  (d) => Boolean(d.account_name || d.accountName || d.client_name),
  { message: 'account_name (or accountName, or client_name) is required' },
);

router.post('/compliance/accounts', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createAccountSchema.parse(req.body);

    const accountName = (
      data.account_name
      ?? data.accountName
      ?? (data.client_name && data.matter_ref
        ? `${data.client_name} — ${data.matter_ref}`
        : data.client_name)
    ) as string;
    // Default to 'client' (a per-matter client account) when only the
    // matter form was used.
    const accountType = (data.account_type ?? data.accountType ?? 'client') as string;
    // Bank name optional — typically filled in later by the COFA.
    const bankName = data.bank_name ?? data.bankName ?? null;

    const account = await prisma.clientAccount.create({
      data: {
        firmId,
        accountName,
        accountType,
        bankName,
        balance: 0,
      },
    });

    res.status(201).json(serializeAccount(account));
  } catch (err) {
    next(err);
  }
});

// GET /compliance/accounts/:accountId/transactions
router.get('/compliance/accounts/:accountId/transactions', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const transactions = await prisma.transaction.findMany({
      where: { accountId: (req.params.accountId as string), firmId },
      orderBy: { date: 'desc' },
    });
    res.json(transactions.map(serializeTransaction));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/accounts/transactions
//
// Frontend sends snake_case (account_id, matter_ref); older callers sent
// camelCase. Accept both so the route doesn't 400.
const createTransactionSchema = z.object({
  description: z.string(),
  amount: z.number(),
  type: z.enum(['debit', 'credit', 'transfer']),
  // snake_case (frontend)
  account_id: z.string().optional(),
  matter_ref: z.string().optional(),
  // camelCase (legacy)
  accountId: z.string().optional(),
  matterRef: z.string().optional(),
}).refine(
  (d) => Boolean(d.account_id || d.accountId),
  { message: 'account_id (or accountId) is required' },
);

router.post('/compliance/accounts/transactions', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createTransactionSchema.parse(req.body);

    const accountId = (data.account_id ?? data.accountId) as string;
    const matterRef = data.matter_ref ?? data.matterRef ?? null;

    // Verify account belongs to firm
    const account = await prisma.clientAccount.findFirst({
      where: { id: accountId, firmId },
    });

    if (!account) {
      res.status(404).json({ error: true, message: 'Account not found' });
      return;
    }

    const transaction = await prisma.transaction.create({
      data: {
        firmId,
        accountId,
        description: data.description,
        amount: data.amount,
        type: data.type,
        matterRef,
        date: new Date(),
      },
    });

    // Update account balance
    const balanceChange = data.type === 'credit' ? data.amount : -data.amount;
    await prisma.clientAccount.update({
      where: { id: accountId },
      data: { balance: { increment: balanceChange } },
    });

    res.status(201).json(serializeTransaction(transaction));
  } catch (err) {
    next(err);
  }
});

// GET /compliance/accounts/reconciliations
router.get('/compliance/accounts/reconciliations', authenticate, async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const reconciliations = await prisma.reconciliation.findMany({ where: { firmId } });
    res.json(reconciliations.map(serializeReconciliation));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/accounts/reconciliations
const createReconciliationSchema = z.object({
  period: z.string(),
});

router.post('/compliance/accounts/reconciliations', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);
    const data = createReconciliationSchema.parse(req.body);

    const reconciliation = await prisma.reconciliation.create({
      data: {
        firmId,
        period: data.period,
        status: 'pending',
      },
    });

    res.status(201).json(serializeReconciliation(reconciliation));
  } catch (err) {
    next(err);
  }
});

// POST /compliance/accounts/reconciliations/:reconciliationId/cofa-signoff
router.post('/compliance/accounts/reconciliations/:reconciliationId/cofa-signoff', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const { firmId } = getTenantFilter(req);

    const result = await prisma.reconciliation.updateMany({
      where: { id: (req.params.reconciliationId as string), firmId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        reconciledBy: req.user!.userId,
      },
    });

    if (result.count === 0) {
      res.status(404).json({ error: true, message: 'Reconciliation not found' });
      return;
    }

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'cofa_signoff',
      entityType: 'reconciliation',
      entityId: (req.params.reconciliationId as string),
    });

    const updated = await prisma.reconciliation.findFirst({ where: { id: (req.params.reconciliationId as string), firmId } });
    res.json(updated ? serializeReconciliation(updated) : null);
  } catch (err) {
    next(err);
  }
});

export default router;
