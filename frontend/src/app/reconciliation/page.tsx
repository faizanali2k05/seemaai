'use client';

/**
 * Monthly Reconciliation — COFA-owned client-account reconciliation.
 *
 * Wired to the /compliance/reconciliations API: runs, per-account three-way
 * figures, the 8-phase progress, the COFA electronic sign-off and the
 * AI-drafted SRA Accounts Rules report are all persisted server-side. No
 * illustrative data — an empty firm sees an empty state until it starts a run.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth-store';
import { useFirmStore } from '@/lib/stores/firm-store';
import {
  Calculator,
  History,
  Plus,
  X,
  Check,
  Trash2,
  Sparkles,
  Loader2,
} from 'lucide-react';

// ── Types (mirror the backend serializer) ──
interface AccountLine {
  name: string;
  number?: string;
  bank?: string;
  cashbook?: string;
  ledger?: string;
  variance?: string;
  status?: string;
  statusKind?: 'progress' | 'reconciled' | 'pending';
}

interface Reconciliation {
  id: string;
  period_label: string | null;
  status: string;
  phase: number;
  client_money_held: number;
  variance_total: number;
  open_exceptions: number;
  aged_residuals: number;
  accounts: AccountLine[];
  notes: string | null;
  ai_report: string | null;
  ai_report_generated_at: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
  created_at: string | null;
}

const PHASES = [
  '1 · Period',
  '2 · Statements',
  '3 · Auto-match',
  '4 · Exceptions',
  '5 · Three-way',
  '6 · Aged balances',
  '7 · COFA sign-off',
  '8 · File & close',
];

const statusPill: Record<string, string> = {
  progress: 'bg-blue-100 text-blue-800',
  reconciled: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
};

const gbp = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n || 0);

function statusLabel(s: string): string {
  switch (s) {
    case 'in_progress':
      return 'In progress';
    case 'reconciled':
      return 'Reconciled';
    case 'signed_off':
      return 'Signed off';
    case 'filed':
      return 'Filed';
    default:
      return s;
  }
}

export default function ReconciliationPage() {
  useRequireAuth();
  const user = useAuthStore((s) => s.user);
  const firm = useFirmStore((s) => s.firm);

  const [recons, setRecons] = useState<Reconciliation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => recons.find((r) => r.id === selectedId) || recons[0] || null,
    [recons, selectedId]
  );

  const load = async () => {
    try {
      const res = await apiClient.get('/compliance/reconciliations');
      const list: Reconciliation[] = Array.isArray(res.data) ? res.data : [];
      setRecons(list);
      if (list.length && !list.some((r) => r.id === selectedId)) {
        setSelectedId(list[0].id);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load reconciliations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advancePhase = async (next: number) => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiClient.patch(`/compliance/reconciliations/${selected.id}`, {
        phase: next,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update phase');
    } finally {
      setBusy(false);
    }
  };

  const signOff = async (name: string) => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.post(`/compliance/reconciliations/${selected.id}/sign-off`, {
        signed_off_by: name,
        confirm: true,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Sign-off failed');
    } finally {
      setBusy(false);
    }
  };

  const generateReport = async () => {
    if (!selected) return;
    setAiLoading(true);
    setError(null);
    try {
      await apiClient.post(
        `/compliance/reconciliations/${selected.id}/ai-report`,
        undefined,
        { timeout: 120000 }
      );
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not generate the SRA report');
    } finally {
      setAiLoading(false);
    }
  };

  const signOffName =
    (firm as any)?.cofa_name || (user as any)?.name || 'COFA';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-seema-text-primary flex items-center gap-2">
            <Calculator className="h-6 w-6 text-seema-primary" /> Monthly Reconciliation
          </h1>
          <p className="text-sm text-seema-text-secondary mt-1">
            COFA-owned · <span className="text-purple-600 font-medium">SRA Accounts Rule 8.3</span>{' '}
            (five-weekly maximum) ·{' '}
            <span className="text-purple-600 font-medium">Rule 5.1</span> (residual balances) ·{' '}
            <span className="text-purple-600 font-medium">Rule 13</span> (6-year retention)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {recons.length > 1 && (
            <select
              value={selected?.id || ''}
              onChange={(e) => setSelectedId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium"
            >
              {recons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.period_label} · {statusLabel(r.status)}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover"
          >
            <Plus size={16} /> Run reconciliation
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-seema-text-muted">Loading reconciliations…</div>
      ) : !selected ? (
        <EmptyState onStart={() => setCreateOpen(true)} />
      ) : (
        <SelectedView
          recon={selected}
          busy={busy}
          aiLoading={aiLoading}
          signOffName={signOffName}
          onAdvance={advancePhase}
          onSignOff={signOff}
          onGenerateReport={generateReport}
        />
      )}

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={async (id) => {
            setCreateOpen(false);
            await load();
            setSelectedId(id);
          }}
          setError={setError}
        />
      )}
    </div>
  );
}

/* ──────────────────────────── Empty state ──────────────────────────── */
function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
      <Calculator className="h-10 w-10 text-seema-text-muted mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-seema-sidebar-bg">No reconciliations yet</h3>
      <p className="text-sm text-seema-text-muted mt-1 max-w-md mx-auto">
        Start your first client-account reconciliation. Enter the bank, cashbook and client-ledger
        balances for each in-scope account to run a live three-way reconciliation under SRA Accounts
        Rule 8.3.
      </p>
      <button
        onClick={onStart}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover"
      >
        <Plus size={16} /> Run your first reconciliation
      </button>
    </div>
  );
}

/* ──────────────────────────── Selected run view ──────────────────────────── */
function SelectedView({
  recon,
  busy,
  aiLoading,
  signOffName,
  onAdvance,
  onSignOff,
  onGenerateReport,
}: {
  recon: Reconciliation;
  busy: boolean;
  aiLoading: boolean;
  signOffName: string;
  onAdvance: (next: number) => void;
  onSignOff: (name: string) => void;
  onGenerateReport: () => void;
}) {
  const [cofaName, setCofaName] = useState(signOffName);
  const variance = recon.variance_total || 0;
  const signedOff = recon.status === 'signed_off' || recon.status === 'filed';

  const kpis = [
    { label: 'Current period', value: recon.period_label || '—', trend: statusLabel(recon.status), tone: '' },
    {
      label: 'Phase',
      value: `${recon.phase} / 8`,
      trend: PHASES[(recon.phase || 1) - 1]?.split('·')[1]?.trim() || '',
      tone: '',
    },
    { label: 'Client money held', value: gbp(recon.client_money_held), trend: `${recon.accounts.length} accounts`, tone: '' },
    {
      label: 'Total variance',
      value: gbp(variance),
      trend: variance === 0 ? 'Three-way agrees' : 'Must be cleared',
      tone: variance === 0 ? 'text-emerald-600' : 'text-red-600',
    },
    { label: 'Open exceptions', value: String(recon.open_exceptions), trend: 'This period', tone: recon.open_exceptions ? 'text-amber-600' : '' },
    {
      label: 'Last sign-off',
      value: recon.signed_off_at ? new Date(recon.signed_off_at).toLocaleDateString('en-GB') : '—',
      trend: recon.signed_off_by || 'Not signed',
      tone: recon.signed_off_at ? 'text-emerald-600' : '',
    },
  ];

  return (
    <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-[11px] uppercase tracking-wide text-seema-text-muted font-medium">{k.label}</p>
            <p className={`text-xl font-semibold mt-1.5 text-seema-sidebar-bg ${k.tone}`}>{k.value}</p>
            <p className="text-[11px] text-seema-text-muted mt-1">{k.trend}</p>
          </div>
        ))}
      </div>

      {/* Phase progress */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex gap-1 overflow-x-auto">
          {PHASES.map((p, i) => {
            const n = i + 1;
            const active = n === recon.phase;
            const done = n < recon.phase;
            return (
              <div
                key={p}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs whitespace-nowrap flex-shrink-0 border ${
                  active
                    ? 'bg-white border-seema-sidebar-bg text-seema-sidebar-bg font-semibold'
                    : 'border-transparent text-seema-text-muted'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                    done ? 'bg-emerald-500 text-white' : active ? 'bg-seema-sidebar-bg text-white' : 'bg-gray-200 text-seema-text-muted'
                  }`}
                >
                  {done ? '✓' : n}
                </span>
                {p}
              </div>
            );
          })}
        </div>
        {!signedOff && (
          <div className="flex justify-end gap-2 mt-3">
            <button
              disabled={busy || recon.phase <= 1}
              onClick={() => onAdvance(Math.max(1, recon.phase - 1))}
              className="px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              ← Back
            </button>
            <button
              disabled={busy || recon.phase >= 8}
              onClick={() => onAdvance(Math.min(8, recon.phase + 1))}
              className="px-3.5 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
        )}
      </div>

      {/* Accounts table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                {['Account', 'Bank balance', 'Cashbook', 'Client ledger', 'Variance', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-wide text-seema-text-muted font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recon.accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-seema-text-muted">
                    No accounts recorded for this run.
                  </td>
                </tr>
              ) : (
                recon.accounts.map((a, idx) => (
                  <tr key={`${a.number}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-seema-sidebar-bg">{a.name}</div>
                      <div className="text-[11px] text-seema-text-muted font-mono">{a.number}</div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">{a.bank}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{a.cashbook}</td>
                    <td className="px-4 py-3 font-mono tabular-nums">{a.ledger}</td>
                    <td className={`px-4 py-3 font-mono tabular-nums font-semibold ${a.variance === gbp(0) ? 'text-emerald-600' : 'text-red-600'}`}>
                      {a.variance}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${statusPill[a.statusKind || 'pending']}`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI SRA report */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-seema-sidebar-bg flex items-center gap-2">
              <Sparkles size={16} className="text-purple-600" /> SRA Accounts Rules report
            </h3>
            <p className="text-xs text-seema-text-muted mt-1">
              AI-drafted narrative reconciliation report for COFA review. Saved against this run.
            </p>
          </div>
          <button
            disabled={aiLoading}
            onClick={onGenerateReport}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-purple-300 bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100 disabled:opacity-60"
          >
            {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {recon.ai_report ? 'Regenerate report' : 'Generate report (AI)'}
          </button>
        </div>
        {recon.ai_report && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-[11px] text-seema-text-muted mb-2">
              Generated {recon.ai_report_generated_at ? new Date(recon.ai_report_generated_at).toLocaleString('en-GB') : ''}
            </p>
            <pre className="whitespace-pre-wrap font-sans text-sm text-seema-text-primary bg-gray-50 border border-gray-200 rounded-md p-4 max-h-[420px] overflow-y-auto">
              {recon.ai_report}
            </pre>
          </div>
        )}
      </div>

      {/* COFA sign-off */}
      {!signedOff ? (
        <div className="bg-seema-sidebar-bg text-white rounded-lg p-5">
          <h4 className="font-semibold mb-1 text-sm">COFA electronic sign-off</h4>
          <p className="text-xs text-white/70 mb-3">
            Recorded with name and timestamp against this reconciliation. Blocked while any variance is non-zero (Rule 8.3).
          </p>
          <input
            value={cofaName}
            onChange={(e) => setCofaName(e.target.value)}
            placeholder="COFA full name"
            className="w-full sm:w-80 px-3 py-2 rounded-md text-seema-text-primary text-sm mb-3"
          />
          <label className="flex items-start gap-2.5 text-xs text-white/90 leading-relaxed mb-4">
            <span>
              I, {cofaName || '[COFA]'}, confirm I have reviewed the {recon.period_label} reconciliation,
              that variance is zero across all in-scope accounts, and that the pack is true to the best of
              my knowledge.
            </span>
          </label>
          <div className="flex justify-end">
            <button
              disabled={busy || variance !== 0 || !cofaName.trim()}
              onClick={() => onSignOff(cofaName.trim())}
              title={variance !== 0 ? 'Clear the variance before signing off' : ''}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Check size={16} /> Sign and file
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 text-sm text-emerald-800 flex items-center gap-2">
          <Check size={18} /> Signed off by <strong>{recon.signed_off_by}</strong> on{' '}
          {recon.signed_off_at ? new Date(recon.signed_off_at).toLocaleString('en-GB') : ''}.
        </div>
      )}
    </>
  );
}

/* ──────────────────────────── Create modal ──────────────────────────── */
interface DraftAccount {
  name: string;
  number: string;
  bank: string;
  cashbook: string;
  ledger: string;
}

function CreateModal({
  onClose,
  onCreated,
  setError,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  setError: (s: string | null) => void;
}) {
  const now = new Date();
  const defaultPeriod = now.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const [periodLabel, setPeriodLabel] = useState(defaultPeriod);
  const [openExceptions, setOpenExceptions] = useState('0');
  const [agedResiduals, setAgedResiduals] = useState('0');
  const [accounts, setAccounts] = useState<DraftAccount[]>([
    { name: '', number: '', bank: '', cashbook: '', ledger: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const setAcct = (i: number, key: keyof DraftAccount, val: string) =>
    setAccounts((prev) => prev.map((a, idx) => (idx === i ? { ...a, [key]: val } : a)));

  const addAcct = () =>
    setAccounts((prev) => [...prev, { name: '', number: '', bank: '', cashbook: '', ledger: '' }]);
  const removeAcct = (i: number) =>
    setAccounts((prev) => prev.filter((_, idx) => idx !== i));

  const num = (s: string) => {
    const n = parseFloat((s || '').replace(/[£,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const submit = async () => {
    const filled = accounts.filter((a) => a.name.trim());
    if (!periodLabel.trim()) {
      setError('Enter a period label');
      return;
    }
    setSaving(true);
    setError(null);
    let clientMoney = 0;
    let varianceTotal = 0;
    const payloadAccounts = filled.map((a) => {
      const bank = num(a.bank);
      const cashbook = num(a.cashbook);
      const ledger = num(a.ledger);
      const variance = Math.round((bank - ledger) * 100) / 100;
      clientMoney += ledger;
      varianceTotal += variance;
      const reconciled = variance === 0 && bank === cashbook;
      return {
        name: a.name.trim(),
        number: a.number.trim(),
        bank: gbp(bank),
        cashbook: gbp(cashbook),
        ledger: gbp(ledger),
        variance: gbp(variance),
        status: reconciled ? 'Reconciled' : 'Variance — review',
        statusKind: reconciled ? 'reconciled' : 'pending',
      };
    });

    try {
      const res = await apiClient.post('/compliance/reconciliations', {
        period_label: periodLabel.trim(),
        period: 'monthly',
        accounts: payloadAccounts,
        client_money_held: Math.round(clientMoney * 100) / 100,
        variance_total: Math.round(varianceTotal * 100) / 100,
        open_exceptions: parseInt(openExceptions, 10) || 0,
        aged_residuals: num(agedResiduals),
      });
      onCreated(res.data.id);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create reconciliation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-seema-sidebar-bg/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Run reconciliation</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-200 text-seema-text-muted">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-seema-text-muted uppercase tracking-wide mb-1">Period</label>
              <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="May 2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-seema-text-muted uppercase tracking-wide mb-1">Open exceptions</label>
              <input value={openExceptions} onChange={(e) => setOpenExceptions(e.target.value)} type="number" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-seema-text-muted uppercase tracking-wide mb-1">Aged residuals (£)</label>
              <input value={agedResiduals} onChange={(e) => setAgedResiduals(e.target.value)} type="number" step="0.01" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-seema-text-muted uppercase tracking-wide">In-scope accounts</label>
              <button onClick={addAcct} className="text-xs text-seema-primary font-medium inline-flex items-center gap-1">
                <Plus size={13} /> Add account
              </button>
            </div>
            <p className="text-[11px] text-seema-text-muted mb-3">
              Enter the bank, cashbook (Clio) and sum-of-client-ledger balances. Variance is computed
              automatically; a zero variance across all accounts unlocks COFA sign-off.
            </p>
            <div className="space-y-3">
              {accounts.map((a, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input value={a.name} onChange={(e) => setAcct(i, 'name', e.target.value)} placeholder="Account name (e.g. Lloyds Client General)" className="flex-1 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm" />
                    <input value={a.number} onChange={(e) => setAcct(i, 'number', e.target.value)} placeholder="Acc no · sort code" className="w-44 px-2.5 py-1.5 border border-gray-300 rounded-md text-sm" />
                    {accounts.length > 1 && (
                      <button onClick={() => removeAcct(i)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input value={a.bank} onChange={(e) => setAcct(i, 'bank', e.target.value)} placeholder="Bank £" type="number" step="0.01" className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm font-mono" />
                    <input value={a.cashbook} onChange={(e) => setAcct(i, 'cashbook', e.target.value)} placeholder="Cashbook £" type="number" step="0.01" className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm font-mono" />
                    <input value={a.ledger} onChange={(e) => setAcct(i, 'ledger', e.target.value)} placeholder="Client ledger £" type="number" step="0.01" className="px-2.5 py-1.5 border border-gray-300 rounded-md text-sm font-mono" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={submit}
            className="px-4 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover inline-flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Start reconciliation
          </button>
        </div>
      </div>
    </div>
  );
}
