'use client';

/**
 * Monthly Reconciliation — COFA-owned client-account reconciliation.
 *
 * This is a faithful native port of the seema-reconciliation design. It
 * currently runs on illustrative data (there is no reconciliation backend
 * endpoint yet); the "Run reconciliation" wizard demonstrates the 8-phase
 * flow. Wiring the table + wizard to a /reconciliation API is the next step.
 */
import { useState } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import {
  Calculator,
  Download,
  History,
  Plus,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface Account {
  name: string;
  number: string;
  bank: string;
  cashbook: string;
  ledger: string;
  variance: string;
  status: string;
  statusKind: 'progress' | 'reconciled' | 'pending';
}

const ACCOUNTS: Account[] = [
  {
    name: 'Lloyds Client (General)',
    number: '12345678 · sort 30-90-95',
    bank: '£842,317.23',
    cashbook: '£842,317.23',
    ledger: '£842,317.23',
    variance: '£0.00',
    status: 'In progress · Phase 4',
    statusKind: 'progress',
  },
  {
    name: 'Cater Allen Designated',
    number: '87654321 · Hesketh Estate (AH-2025-0145)',
    bank: '£125,000.00',
    cashbook: '£125,000.00',
    ledger: '£125,000.00',
    variance: '£0.00',
    status: 'Reconciled · awaiting COFA',
    statusKind: 'reconciled',
  },
  {
    name: 'Aldridge & Hayward Office',
    number: '99887766 · for context only',
    bank: '£312,440.18',
    cashbook: '—',
    ledger: '—',
    variance: '—',
    status: 'Office account · not in scope',
    statusKind: 'pending',
  },
];

const KPIS = [
  { label: 'Current period', value: 'May 2026', trend: 'Day 1 of 31', tone: '' },
  { label: 'Days since last recon', value: '31', trend: '28d amber · 35d red', tone: 'text-amber-600' },
  { label: 'Client money held', value: '£967,317', trend: '2 accounts', tone: '' },
  { label: 'Open exceptions', value: '8', trend: 'All current period', tone: 'text-amber-600' },
  { label: 'Aged residuals (Rule 5.1)', value: '£284', trend: '3 items >12 months', tone: 'text-red-600' },
  { label: 'Last COFA sign-off', value: '30 Apr', trend: "James O'Brien", tone: 'text-emerald-600' },
];

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

const statusPill: Record<Account['statusKind'], string> = {
  progress: 'bg-blue-100 text-blue-800',
  reconciled: 'bg-emerald-100 text-emerald-800',
  pending: 'bg-amber-100 text-amber-800',
};

export default function ReconciliationPage() {
  useRequireAuth();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [phase, setPhase] = useState(4);

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
          <button className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50">
            <Download size={15} /> Export pack (PDF)
          </button>
          <button className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50">
            <History size={15} /> History
          </button>
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover"
          >
            <Plus size={16} /> Run reconciliation
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPIS.map((k) => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-[11px] uppercase tracking-wide text-seema-text-muted font-medium">
              {k.label}
            </p>
            <p className={`text-xl font-semibold mt-1.5 text-seema-sidebar-bg ${k.tone}`}>{k.value}</p>
            <p className="text-[11px] text-seema-text-muted mt-1">{k.trend}</p>
          </div>
        ))}
      </div>

      {/* Alert strip */}
      <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex flex-wrap items-center gap-4">
        <div className="h-6 w-6 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold flex-shrink-0">
          !
        </div>
        <div className="flex-1 min-w-[200px] text-sm text-amber-900">
          <strong>May 2026 reconciliation due.</strong> You're at day 31 since the last sign-off.
          Auto-breach to <span className="underline">/breaches</span> at day 35 under Rule 8.3.
        </div>
        <div className="text-lg font-semibold text-amber-700 bg-white px-3 py-1 rounded-md border border-amber-300 tabular-nums">
          4d remaining
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="px-4 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover"
        >
          Start reconciliation
        </button>
      </div>

      {/* Accounts table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                {['Account', 'Bank balance', 'Cashbook', 'Client ledger', 'Variance', 'Status'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] uppercase tracking-wide text-seema-text-muted font-semibold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {ACCOUNTS.map((a) => (
                <tr key={a.number} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-seema-sidebar-bg">{a.name}</div>
                    <div className="text-[11px] text-seema-text-muted font-mono">{a.number}</div>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums">{a.bank}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{a.cashbook}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">{a.ledger}</td>
                  <td
                    className={`px-4 py-3 font-mono tabular-nums font-semibold ${
                      a.variance === '£0.00' ? 'text-emerald-600' : 'text-seema-text-primary'
                    }`}
                  >
                    {a.variance}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${statusPill[a.statusKind]}`}
                    >
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-seema-text-muted">
        Showing illustrative data. Connect this firm's bank statements + Clio cashbook to run a live
        three-way reconciliation.
      </p>

      {wizardOpen && (
        <ReconciliationWizard phase={phase} setPhase={setPhase} onClose={() => setWizardOpen(false)} />
      )}
    </div>
  );
}

/* ──────────────────────────── Wizard modal ──────────────────────────── */

function ReconciliationWizard({
  phase,
  setPhase,
  onClose,
}: {
  phase: number;
  setPhase: (n: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] bg-seema-sidebar-bg/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Head */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Run reconciliation · May 2026</h2>
            <p className="text-xs text-seema-text-muted font-mono">
              RECON-2026-05 · Auto-saving
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-200 text-seema-text-muted">
            <X size={22} />
          </button>
        </div>

        {/* Phase nav */}
        <div className="flex gap-1 px-6 py-3 bg-gray-50 border-b border-gray-200 overflow-x-auto">
          {PHASES.map((p, i) => {
            const n = i + 1;
            const active = n === phase;
            const done = n < phase;
            return (
              <button
                key={p}
                onClick={() => setPhase(n)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs whitespace-nowrap flex-shrink-0 border ${
                  active
                    ? 'bg-white border-seema-sidebar-bg text-seema-sidebar-bg font-semibold'
                    : 'border-transparent text-seema-text-muted hover:bg-white'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${
                    done
                      ? 'bg-emerald-500 text-white'
                      : active
                        ? 'bg-seema-sidebar-bg text-white'
                        : 'bg-gray-200 text-seema-text-muted'
                  }`}
                >
                  {done ? '✓' : n}
                </span>
                {p}
              </button>
            );
          })}
        </div>

        {/* Phase content */}
        <div className="flex-1 overflow-y-auto px-7 py-6">
          <PhaseContent phase={phase} />
        </div>

        {/* Foot */}
        <div className="px-6 py-3.5 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <span className="text-xs text-seema-text-muted">
            Auto-saved · COFA-only workflow · single-tier
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPhase(Math.max(1, phase - 1))}
              className="px-3.5 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              onClick={() => setPhase(Math.min(8, phase + 1))}
              className="px-3.5 py-2 rounded-lg bg-seema-primary text-white text-sm font-medium hover:bg-seema-primary-hover"
            >
              Continue →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 bg-gray-50 border border-gray-200 rounded-lg p-5">
      <h4 className="text-sm font-semibold text-seema-sidebar-bg mb-3">{title}</h4>
      {children}
    </div>
  );
}

function PhaseContent({ phase }: { phase: number }) {
  if (phase === 4) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1">Phase 4 · Exception resolution</h3>
        <p className="text-sm text-seema-text-muted mb-5">
          Each unmatched bank or cashbook line needs a reason. Clearing as timing feeds an adjustment
          into the three-way statement; anything else updates Clio with an audit trail.
        </p>
        <Section title="Lloyds Client · 8 exceptions to resolve">
          {[
            { t: 'Outstanding lodgement — Wilkinson Holdings', a: '+£45,000.00', kind: 'ok' },
            { t: 'Outstanding lodgement — Bramble & Hawthorn', a: '+£12,500.00', kind: 'ok' },
            { t: 'Unpresented cheque — Pemberton Plaza', a: '-£3,420.00', kind: 'ok' },
            { t: 'Bank charge debited to client account', a: '-£12.50', kind: 'bad' },
            { t: 'Unidentified receipt — "BACS TRANSFER 04221"', a: '+£8,420.00', kind: 'bad' },
          ].map((e) => (
            <div
              key={e.t}
              className={`bg-white border rounded-md p-3.5 mb-2 flex items-center justify-between gap-3 ${
                e.kind === 'bad' ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-amber-400'
              }`}
            >
              <div className="text-sm font-medium text-seema-sidebar-bg">{e.t}</div>
              <div
                className={`font-mono font-semibold text-sm ${
                  e.a.startsWith('+') ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {e.a}
              </div>
            </div>
          ))}
          <p className="text-xs text-seema-text-muted mt-1">3 more exceptions hidden · scroll to see all.</p>
        </Section>
      </div>
    );
  }

  if (phase === 5) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1">Phase 5 · Three-way reconciliation statement</h3>
        <p className="text-sm text-seema-text-muted mb-5">
          Bank, cashbook and client-ledger totals must all agree.{' '}
          <span className="text-purple-600">Rule 8.3 requires three-way.</span> Non-zero variance blocks
          COFA sign-off.
        </p>
        <Section title="Lloyds Client (General) · 12345678">
          <div className="bg-white rounded-md p-4 text-sm">
            {[
              ['Bank balance per statement (31 May)', '£842,317.23'],
              ['Add: outstanding lodgements (4)', '+ £58,420.00'],
              ['Less: unpresented cheques (1)', '− £3,420.00'],
              ['Adjusted bank balance', '£897,317.23'],
              ['Cashbook balance (Clio)', '£897,317.23'],
              ['Sum of individual client matter ledgers', '£897,317.23'],
            ].map(([k, v], i) => (
              <div key={k} className={`flex justify-between py-2 ${i === 3 ? 'font-semibold border-t-2 border-seema-sidebar-bg' : 'border-b border-gray-100'}`}>
                <span>{k}</span>
                <span className="font-mono">{v}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-emerald-50 border border-emerald-400 rounded-md p-3 text-center text-emerald-800 font-semibold text-sm">
            ✓ Three-way reconciliation complete · all three balances match
          </div>
        </Section>
      </div>
    );
  }

  if (phase === 7) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-1">Phase 7 · COFA review & sign-off</h3>
        <p className="text-sm text-seema-text-muted mb-5">
          Your personal regulatory sign-off under the SRA Authorisation Rules. Recorded with name, SRA
          number, timestamp, IP, and a hash of the reconciliation pack.
        </p>
        <Section title="Pre-sign-off checklist">
          <div className="space-y-2">
            {[
              ['Variance is £0.00 on all in-scope accounts', true],
              ['All exceptions resolved with documented reasons', true],
              ['Aged balances reviewed and actioned', true],
              ['Breach implications assessed for /breaches', false],
              ['Working papers archived for 6-year retention (Rule 13)', false],
            ].map(([t, checked]) => (
              <label
                key={t as string}
                className={`flex items-start gap-2 p-2.5 rounded-md border text-sm cursor-pointer ${
                  checked ? 'bg-purple-50 border-purple-300' : 'bg-white border-gray-200'
                }`}
              >
                <input type="checkbox" defaultChecked={checked as boolean} className="mt-0.5" />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </Section>
        <div className="bg-seema-sidebar-bg text-white rounded-lg p-5">
          <h4 className="font-semibold mb-3 text-sm">COFA electronic sign-off</h4>
          <label className="flex items-start gap-2.5 text-xs text-white/90 leading-relaxed">
            <input type="checkbox" className="mt-0.5" />
            <span>
              I, James O'Brien, COFA of Aldridge &amp; Hayward Solicitors LLP, confirm I have reviewed
              the May 2026 reconciliation, that variance is zero across all in-scope accounts, and that
              the pack is true to the best of my knowledge.
            </span>
          </label>
          <div className="flex justify-end mt-4">
            <button className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium inline-flex items-center gap-2">
              <Check size={16} /> Sign and file
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Generic content for the remaining phases.
  const titles: Record<number, [string, string]> = {
    1: ['Phase 1 · Period & scope', 'Confirm the period dates and which client/designated accounts are in scope. Rule 8.3 maximum is five weeks (35 days); the firm target is 28.'],
    2: ['Phase 2 · Statement upload', 'Upload bank statements per in-scope account. PDF is kept as hashed audit evidence; CSV is used for matching.'],
    3: ['Phase 3 · Auto-match', 'Conservative matching: exact reference + amount + date only. Anything fuzzy lands in exceptions for COFA review.'],
    6: ['Phase 6 · Aged balances review', 'Rule 5.1: no residual balances should remain on the ledger. Each item aged over 12 months needs a traced return, charity payment, or escalation.'],
    8: ['Phase 8 · File, notify & schedule next', 'Pack archived, partners briefed, breach flags pushed to /breaches, remediation rows created, and the next reconciliation scheduled.'],
  };
  const [t, sub] = titles[phase] || ['', ''];
  return (
    <div>
      <h3 className="text-lg font-semibold mb-1">{t}</h3>
      <p className="text-sm text-seema-text-muted mb-5">{sub}</p>
      <Section title="Status">
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <AlertTriangle size={16} className="text-amber-500" />
          This phase is part of the designed flow. Connect bank + Clio data to make it live.
        </div>
      </Section>
    </div>
  );
}
