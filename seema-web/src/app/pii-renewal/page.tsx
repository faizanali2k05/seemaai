'use client';

import { useState } from 'react';
import {
  PageHeader,
  Card,
  Button,
  StatCard,
  LoadingSpinner,
  showToast,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { ShieldCheck, Download, Printer, Send } from 'lucide-react';
import { SendPackModal } from '@/components/SendPackModal';
import { PackDeliveryHistory } from '@/components/PackDeliveryHistory';

// ---------------------------------------------------------------------------
// PII Renewal Evidence Pack
//
// One-click report assembling everything a UK firm's professional indemnity
// insurer typically requests at renewal. The backend endpoint
// `POST /compliance/pii-renewal-pack/generate` returns a structured JSON
// pack; this page renders it in a print-friendly layout with stat cards.
// ---------------------------------------------------------------------------

interface FirmProfile {
  id?: string;
  name?: string | null;
  sra_number?: string | null;
  address?: string | null;
  firm_size?: number | null;
  practice_areas?: string[] | null;
  colp_name?: string | null;
  cofa_name?: string | null;
  mlro_name?: string | null;
  subscription_tier?: string | null;
  onboarding_status?: string | null;
  established_date?: string | null;
}

interface StaffSection {
  total_active?: number;
  solicitor_count?: number;
  trainee_count?: number;
  average_pqe?: number | null;
  staff_list?: Array<{
    id: string;
    name?: string | null;
    role?: string | null;
    pqe?: string | null;
    sra_id?: string | null;
  }>;
}

interface TrainingSection {
  total_last_12m?: number;
  completed_last_12m?: number;
  overdue_count?: number;
  aml_completion_rate_pct?: number | null;
  aml_total?: number;
  aml_completed?: number;
  gdpr_completion_rate_pct?: number | null;
  gdpr_total?: number;
  gdpr_completed?: number;
}

interface BreachItem {
  id: string;
  title: string;
  severity?: string | null;
  status?: string | null;
  reported_date?: string | null;
  ico_deadline?: string | null;
  resolution_date?: string | null;
}

interface BreachesSection {
  total_last_12m?: number;
  open_count?: number;
  by_severity?: Record<string, number>;
  average_resolution_days?: number | null;
  items?: BreachItem[];
}

interface ComplaintsSection {
  total_last_12m?: number;
  open_count?: number;
  by_category?: Record<string, number>;
  average_resolution_days?: number | null;
  ombudsman_escalations?: number;
}

interface AmlSection {
  total_cdd_records?: number;
  cdd_completion_rate_pct?: number | null;
  cdd_completed?: number;
  high_risk_client_count?: number;
  pep_flagged_count?: number;
  sars_last_12m?: number;
  sars_pending_mlro?: number;
}

interface SupervisionSection {
  active_count?: number;
  overdue_count?: number;
}

interface PolicyItem {
  id: string;
  title: string;
  category?: string | null;
  version?: string | null;
  status?: string | null;
  last_reviewed?: string | null;
  next_review?: string | null;
}

interface PoliciesSection {
  total_count?: number;
  overdue_for_review?: number;
  items?: PolicyItem[];
}

interface RiskManagementSection {
  latest_firm_risk_score?: {
    overall_score?: number | null;
    sra_score?: number | null;
    aml_score?: number | null;
    gdpr_score?: number | null;
    calculated_at?: string | null;
  } | null;
  latest_scan_date?: string | null;
  scan_category_breakdown?: Record<string, { pass: number; fail: number; other: number }>;
  open_alerts_by_severity?: Record<string, number>;
}

interface ConflictChecksSection {
  total_last_12m?: number;
  flagged_count?: number;
  resolved_count?: number;
}

interface PIIPack {
  generated_at?: string;
  firm?: FirmProfile | null;
  staff?: StaffSection;
  training?: TrainingSection;
  breaches?: BreachesSection;
  complaints?: ComplaintsSection;
  aml?: AmlSection;
  supervision?: SupervisionSection;
  policies?: PoliciesSection;
  risk_management?: RiskManagementSection;
  conflict_checks?: ConflictChecksSection;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const fmtNum = (n?: number | null) => (n === null || n === undefined ? '—' : String(n));

const fmtPct = (n?: number | null) => (n === null || n === undefined ? '—' : `${n}%`);

export default function PiiRenewalPage() {
  useRequireAuth();
  const [pack, setPack] = useState<PIIPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post('/compliance/pii-renewal-pack/generate', undefined, {
        timeout: 120000,
      });
      setPack(res.data || null);
      showToast('PII renewal pack generated', 'success');
    } catch (err) {
      const msg = 'Failed to generate PII renewal pack. Please try again.';
      setError(msg);
      showToast(msg, 'error');
      // eslint-disable-next-line no-console
      console.error('PII pack generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleDownload = () => {
    if (!pack) return;
    try {
      const html = renderHtmlForDownload(pack);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().split('T')[0];
      a.download = `pii-renewal-pack-${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Pack downloaded', 'success');
    } catch (err) {
      showToast('Failed to download pack', 'error');
      // eslint-disable-next-line no-console
      console.error('Pack download error:', err);
    }
  };

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="print:hidden">
        <PageHeader
          title="PII Renewal Pack"
          description="Auto-assembles the evidence your professional indemnity insurer typically requests at renewal. Click Generate to compile a comprehensive pack from your firm's compliance data."
        >
          {pack && (
            <>
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download HTML
              </Button>
              <Button variant="primary" onClick={() => setSendOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Send to recipient
              </Button>
            </>
          )}
        </PageHeader>
      </div>

      {!pack && (
        <Card className="rounded-xl print:hidden">
          <div className="p-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-blue-50 p-4 text-[#2563eb]">
                <ShieldCheck className="h-10 w-10" />
              </div>
            </div>
            <div className="max-w-2xl mx-auto">
              <h2 className="text-lg font-semibold text-gray-900">
                Generate your PII Renewal Pack
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                We&apos;ll pull together your firm profile, staff &amp; competence, training
                compliance, claims &amp; breach history, complaints, AML posture, supervision,
                policy library, risk management posture, and conflict-check volume from the
                last 12 months. Generation can take up to two minutes for large firms.
              </p>
            </div>
            <Button size="lg" onClick={handleGenerate} disabled={loading} loading={loading}>
              {loading ? 'Generating…' : 'Generate PII Renewal Pack'}
            </Button>
            {error && (
              <p className="text-sm text-red-600 mt-2">{error}</p>
            )}
          </div>
        </Card>
      )}

      {loading && pack && (
        <div className="py-8">
          <LoadingSpinner />
        </div>
      )}

      {pack && (
        <div className="space-y-6">
          {/* Firm profile — top card */}
          <Card className="rounded-xl">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {pack.firm?.name || 'Firm'}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    SRA Number: {pack.firm?.sra_number || '—'}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p>Generated: {fmtDate(pack.generated_at)}</p>
                  <p className="mt-1">Pack version: 1.0</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <Field label="Address" value={pack.firm?.address} />
                <Field label="Firm size" value={fmtNum(pack.firm?.firm_size)} />
                <Field label="Established" value={fmtDate(pack.firm?.established_date)} />
                <Field label="COLP" value={pack.firm?.colp_name} />
                <Field label="COFA" value={pack.firm?.cofa_name} />
                <Field label="MLRO" value={pack.firm?.mlro_name} />
                <Field
                  label="Practice areas"
                  value={
                    pack.firm?.practice_areas && pack.firm.practice_areas.length
                      ? pack.firm.practice_areas.join(', ')
                      : '—'
                  }
                />
                <Field label="Subscription tier" value={pack.firm?.subscription_tier} />
                <Field label="Onboarding status" value={pack.firm?.onboarding_status} />
              </div>
            </div>
          </Card>

          {/* Staff & Competence */}
          <Section title="Staff & Competence">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Total active staff" value={fmtNum(pack.staff?.total_active)} color="blue" />
              <StatCard title="Solicitors / Partners" value={fmtNum(pack.staff?.solicitor_count)} color="teal" />
              <StatCard title="Trainees" value={fmtNum(pack.staff?.trainee_count)} color="purple" />
              <StatCard title="Average PQE" value={fmtNum(pack.staff?.average_pqe)} color="green" />
            </div>
            {pack.staff?.staff_list && pack.staff.staff_list.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Role</th>
                      <th className="px-3 py-2">PQE</th>
                      <th className="px-3 py-2">SRA ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.staff.staff_list.map((s) => (
                      <tr key={s.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{s.name || '—'}</td>
                        <td className="px-3 py-2">{s.role || '—'}</td>
                        <td className="px-3 py-2">{s.pqe || '—'}</td>
                        <td className="px-3 py-2">{s.sra_id || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Training Compliance */}
          <Section title="Training Compliance (last 12 months)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Records" value={fmtNum(pack.training?.total_last_12m)} color="blue" />
              <StatCard title="Completed" value={fmtNum(pack.training?.completed_last_12m)} color="green" />
              <StatCard title="Overdue" value={fmtNum(pack.training?.overdue_count)} color="red" />
              <StatCard
                title="AML completion"
                value={fmtPct(pack.training?.aml_completion_rate_pct)}
                color="teal"
                subtitle={`${pack.training?.aml_completed ?? 0} / ${pack.training?.aml_total ?? 0}`}
              />
              <StatCard
                title="GDPR completion"
                value={fmtPct(pack.training?.gdpr_completion_rate_pct)}
                color="purple"
                subtitle={`${pack.training?.gdpr_completed ?? 0} / ${pack.training?.gdpr_total ?? 0}`}
              />
            </div>
          </Section>

          {/* Breaches & Claims */}
          <Section title="Breaches & Claims (last 12 months)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Total breaches" value={fmtNum(pack.breaches?.total_last_12m)} color="red" />
              <StatCard title="Open" value={fmtNum(pack.breaches?.open_count)} color="orange" />
              <StatCard
                title="Avg resolution (days)"
                value={fmtNum(pack.breaches?.average_resolution_days)}
                color="amber"
              />
              <StatCard
                title="Severities"
                value={
                  pack.breaches?.by_severity
                    ? Object.entries(pack.breaches.by_severity)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' · ') || '—'
                    : '—'
                }
                color="blue"
              />
            </div>
            {pack.breaches?.items && pack.breaches.items.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Severity</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Reported</th>
                      <th className="px-3 py-2">ICO deadline</th>
                      <th className="px-3 py-2">Resolved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.breaches.items.map((b) => (
                      <tr key={b.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{b.title}</td>
                        <td className="px-3 py-2">{b.severity || '—'}</td>
                        <td className="px-3 py-2">{b.status || '—'}</td>
                        <td className="px-3 py-2">{fmtDate(b.reported_date)}</td>
                        <td className="px-3 py-2">{fmtDate(b.ico_deadline)}</td>
                        <td className="px-3 py-2">{fmtDate(b.resolution_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Complaints */}
          <Section title="Complaints (last 12 months)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Total complaints" value={fmtNum(pack.complaints?.total_last_12m)} color="amber" />
              <StatCard title="Open" value={fmtNum(pack.complaints?.open_count)} color="orange" />
              <StatCard
                title="Avg resolution (days)"
                value={fmtNum(pack.complaints?.average_resolution_days)}
                color="blue"
              />
              <StatCard
                title="Ombudsman escalations"
                value={fmtNum(pack.complaints?.ombudsman_escalations)}
                color="red"
              />
            </div>
            {pack.complaints?.by_category && Object.keys(pack.complaints.by_category).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  By category
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(pack.complaints.by_category).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                    >
                      {k}: <span className="font-semibold ml-1">{v}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* AML Posture */}
          <Section title="AML Posture">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Total CDD records" value={fmtNum(pack.aml?.total_cdd_records)} color="blue" />
              <StatCard
                title="CDD completion rate"
                value={fmtPct(pack.aml?.cdd_completion_rate_pct)}
                color="green"
                subtitle={`${pack.aml?.cdd_completed ?? 0} verified`}
              />
              <StatCard title="High-risk clients" value={fmtNum(pack.aml?.high_risk_client_count)} color="orange" />
              <StatCard title="PEP-flagged" value={fmtNum(pack.aml?.pep_flagged_count)} color="red" />
              <StatCard title="SARs filed (12m)" value={fmtNum(pack.aml?.sars_last_12m)} color="amber" />
              <StatCard title="SARs pending MLRO" value={fmtNum(pack.aml?.sars_pending_mlro)} color="purple" />
            </div>
          </Section>

          {/* Supervision */}
          <Section title="Supervision">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Active records" value={fmtNum(pack.supervision?.active_count)} color="blue" />
              <StatCard title="Overdue" value={fmtNum(pack.supervision?.overdue_count)} color="red" />
            </div>
          </Section>

          {/* Policies */}
          <Section title="Policy Library">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Total policies" value={fmtNum(pack.policies?.total_count)} color="blue" />
              <StatCard title="Overdue for review" value={fmtNum(pack.policies?.overdue_for_review)} color="red" />
            </div>
            {pack.policies?.items && pack.policies.items.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Version</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Last reviewed</th>
                      <th className="px-3 py-2">Next review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.policies.items.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">{p.title}</td>
                        <td className="px-3 py-2">{p.category || '—'}</td>
                        <td className="px-3 py-2">{p.version || '—'}</td>
                        <td className="px-3 py-2">{p.status || '—'}</td>
                        <td className="px-3 py-2">{fmtDate(p.last_reviewed)}</td>
                        <td className="px-3 py-2">{fmtDate(p.next_review)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* Risk Management */}
          <Section title="Risk Management">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                title="Overall risk score"
                value={fmtNum(pack.risk_management?.latest_firm_risk_score?.overall_score)}
                color="blue"
                subtitle={
                  pack.risk_management?.latest_firm_risk_score?.calculated_at
                    ? `As of ${fmtDate(pack.risk_management.latest_firm_risk_score.calculated_at)}`
                    : undefined
                }
              />
              <StatCard
                title="SRA score"
                value={fmtNum(pack.risk_management?.latest_firm_risk_score?.sra_score)}
                color="teal"
              />
              <StatCard
                title="AML score"
                value={fmtNum(pack.risk_management?.latest_firm_risk_score?.aml_score)}
                color="amber"
              />
              <StatCard
                title="GDPR score"
                value={fmtNum(pack.risk_management?.latest_firm_risk_score?.gdpr_score)}
                color="purple"
              />
              <StatCard
                title="Latest scan"
                value={fmtDate(pack.risk_management?.latest_scan_date)}
                color="green"
              />
            </div>
            {pack.risk_management?.scan_category_breakdown &&
              Object.keys(pack.risk_management.scan_category_breakdown).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Scan results by category (pass / fail / other)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Pass</th>
                          <th className="px-3 py-2">Fail</th>
                          <th className="px-3 py-2">Other</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(pack.risk_management.scan_category_breakdown).map(
                          ([cat, counts]) => (
                            <tr key={cat} className="border-t border-gray-100">
                              <td className="px-3 py-2">{cat}</td>
                              <td className="px-3 py-2 text-green-700">{counts.pass}</td>
                              <td className="px-3 py-2 text-red-700">{counts.fail}</td>
                              <td className="px-3 py-2 text-gray-500">{counts.other}</td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            {pack.risk_management?.open_alerts_by_severity &&
              Object.keys(pack.risk_management.open_alerts_by_severity).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Open compliance alerts
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(pack.risk_management.open_alerts_by_severity).map(
                      ([sev, count]) => (
                        <span
                          key={sev}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                        >
                          {sev}: <span className="font-semibold ml-1">{count}</span>
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}
          </Section>

          {/* Conflict Checks Volume */}
          <Section title="Conflict Checks Volume (last 12 months)">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Total run" value={fmtNum(pack.conflict_checks?.total_last_12m)} color="blue" />
              <StatCard title="Flagged" value={fmtNum(pack.conflict_checks?.flagged_count)} color="orange" />
              <StatCard title="Resolved" value={fmtNum(pack.conflict_checks?.resolved_count)} color="green" />
            </div>
          </Section>

          {/* Delivery history — past sends of this pack */}
          <div className="print:hidden">
            <PackDeliveryHistory packType="pii_renewal" refreshKey={historyRefresh} />
          </div>
        </div>
      )}

      <SendPackModal
        isOpen={sendOpen}
        onClose={() => setSendOpen(false)}
        packType="pii_renewal"
        onSent={() => setHistoryRefresh((n) => n + 1)}
      />
    </div>
  );
}

const Field: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-0.5 text-gray-900">{value || '—'}</p>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="rounded-xl">
    <div className="p-6 space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  </Card>
);

// ---------------------------------------------------------------------------
// Standalone HTML download — turns the structured pack into a self-contained
// HTML file the user can email to their broker.
// ---------------------------------------------------------------------------
function renderHtmlForDownload(pack: PIIPack): string {
  const esc = (s: unknown): string => {
    if (s === null || s === undefined) return '—';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

  const firm = pack.firm || {};
  const breaches = pack.breaches || {};
  const policies = pack.policies || {};
  const staff = pack.staff || {};

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>PII Renewal Evidence Pack — ${esc(firm.name || 'Firm')}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111; padding: 40px; max-width: 1000px; margin: 0 auto; }
    h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 8px; }
    h2 { color: #1e40af; margin-top: 36px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    h3 { color: #374151; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
    th { background: #f9fafb; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #6b7280; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 12px; }
    .stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
    .stat .label { font-size: 11px; text-transform: uppercase; color: #6b7280; }
    .stat .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
    .footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 11px; }
  </style>
</head>
<body>
  <h1>PII Renewal Evidence Pack</h1>
  <p class="meta">Generated ${esc(date(pack.generated_at))} for <strong>${esc(firm.name)}</strong> (SRA ${esc(firm.sra_number)})</p>

  <h2>Firm Profile</h2>
  <table>
    <tr><th>Address</th><td>${esc(firm.address)}</td></tr>
    <tr><th>Firm size</th><td>${esc(firm.firm_size)}</td></tr>
    <tr><th>Established</th><td>${esc(date(firm.established_date))}</td></tr>
    <tr><th>COLP</th><td>${esc(firm.colp_name)}</td></tr>
    <tr><th>COFA</th><td>${esc(firm.cofa_name)}</td></tr>
    <tr><th>MLRO</th><td>${esc(firm.mlro_name)}</td></tr>
    <tr><th>Practice areas</th><td>${esc((firm.practice_areas || []).join(', '))}</td></tr>
  </table>

  <h2>Staff &amp; Competence</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total active</div><div class="value">${esc(staff.total_active)}</div></div>
    <div class="stat"><div class="label">Solicitors / Partners</div><div class="value">${esc(staff.solicitor_count)}</div></div>
    <div class="stat"><div class="label">Trainees</div><div class="value">${esc(staff.trainee_count)}</div></div>
    <div class="stat"><div class="label">Average PQE</div><div class="value">${esc(staff.average_pqe)}</div></div>
  </div>

  <h2>Training Compliance (last 12 months)</h2>
  <div class="stats">
    <div class="stat"><div class="label">Records</div><div class="value">${esc(pack.training?.total_last_12m)}</div></div>
    <div class="stat"><div class="label">Completed</div><div class="value">${esc(pack.training?.completed_last_12m)}</div></div>
    <div class="stat"><div class="label">Overdue</div><div class="value">${esc(pack.training?.overdue_count)}</div></div>
    <div class="stat"><div class="label">AML completion</div><div class="value">${esc(pack.training?.aml_completion_rate_pct)}%</div></div>
    <div class="stat"><div class="label">GDPR completion</div><div class="value">${esc(pack.training?.gdpr_completion_rate_pct)}%</div></div>
  </div>

  <h2>Breaches &amp; Claims (last 12 months)</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total</div><div class="value">${esc(breaches.total_last_12m)}</div></div>
    <div class="stat"><div class="label">Open</div><div class="value">${esc(breaches.open_count)}</div></div>
    <div class="stat"><div class="label">Avg resolution (days)</div><div class="value">${esc(breaches.average_resolution_days)}</div></div>
  </div>
  ${
    breaches.items && breaches.items.length > 0
      ? `<table><thead><tr><th>Title</th><th>Severity</th><th>Status</th><th>Reported</th><th>ICO deadline</th><th>Resolved</th></tr></thead><tbody>${breaches.items
          .map(
            (b) =>
              `<tr><td>${esc(b.title)}</td><td>${esc(b.severity)}</td><td>${esc(b.status)}</td><td>${esc(date(b.reported_date))}</td><td>${esc(date(b.ico_deadline))}</td><td>${esc(date(b.resolution_date))}</td></tr>`
          )
          .join('')}</tbody></table>`
      : ''
  }

  <h2>Complaints (last 12 months)</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total</div><div class="value">${esc(pack.complaints?.total_last_12m)}</div></div>
    <div class="stat"><div class="label">Open</div><div class="value">${esc(pack.complaints?.open_count)}</div></div>
    <div class="stat"><div class="label">Avg resolution (days)</div><div class="value">${esc(pack.complaints?.average_resolution_days)}</div></div>
    <div class="stat"><div class="label">Ombudsman escalations</div><div class="value">${esc(pack.complaints?.ombudsman_escalations)}</div></div>
  </div>

  <h2>AML Posture</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total CDD records</div><div class="value">${esc(pack.aml?.total_cdd_records)}</div></div>
    <div class="stat"><div class="label">CDD completion</div><div class="value">${esc(pack.aml?.cdd_completion_rate_pct)}%</div></div>
    <div class="stat"><div class="label">High-risk clients</div><div class="value">${esc(pack.aml?.high_risk_client_count)}</div></div>
    <div class="stat"><div class="label">PEP-flagged</div><div class="value">${esc(pack.aml?.pep_flagged_count)}</div></div>
    <div class="stat"><div class="label">SARs filed (12m)</div><div class="value">${esc(pack.aml?.sars_last_12m)}</div></div>
    <div class="stat"><div class="label">SARs pending MLRO</div><div class="value">${esc(pack.aml?.sars_pending_mlro)}</div></div>
  </div>

  <h2>Supervision</h2>
  <div class="stats">
    <div class="stat"><div class="label">Active</div><div class="value">${esc(pack.supervision?.active_count)}</div></div>
    <div class="stat"><div class="label">Overdue</div><div class="value">${esc(pack.supervision?.overdue_count)}</div></div>
  </div>

  <h2>Policy Library</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total policies</div><div class="value">${esc(policies.total_count)}</div></div>
    <div class="stat"><div class="label">Overdue for review</div><div class="value">${esc(policies.overdue_for_review)}</div></div>
  </div>
  ${
    policies.items && policies.items.length > 0
      ? `<table><thead><tr><th>Title</th><th>Category</th><th>Version</th><th>Status</th><th>Last reviewed</th><th>Next review</th></tr></thead><tbody>${policies.items
          .map(
            (p) =>
              `<tr><td>${esc(p.title)}</td><td>${esc(p.category)}</td><td>${esc(p.version)}</td><td>${esc(p.status)}</td><td>${esc(date(p.last_reviewed))}</td><td>${esc(date(p.next_review))}</td></tr>`
          )
          .join('')}</tbody></table>`
      : ''
  }

  <h2>Risk Management</h2>
  <div class="stats">
    <div class="stat"><div class="label">Overall risk score</div><div class="value">${esc(pack.risk_management?.latest_firm_risk_score?.overall_score)}</div></div>
    <div class="stat"><div class="label">SRA score</div><div class="value">${esc(pack.risk_management?.latest_firm_risk_score?.sra_score)}</div></div>
    <div class="stat"><div class="label">AML score</div><div class="value">${esc(pack.risk_management?.latest_firm_risk_score?.aml_score)}</div></div>
    <div class="stat"><div class="label">GDPR score</div><div class="value">${esc(pack.risk_management?.latest_firm_risk_score?.gdpr_score)}</div></div>
    <div class="stat"><div class="label">Latest scan date</div><div class="value">${esc(date(pack.risk_management?.latest_scan_date))}</div></div>
  </div>

  <h2>Conflict Checks Volume (last 12 months)</h2>
  <div class="stats">
    <div class="stat"><div class="label">Total run</div><div class="value">${esc(pack.conflict_checks?.total_last_12m)}</div></div>
    <div class="stat"><div class="label">Flagged</div><div class="value">${esc(pack.conflict_checks?.flagged_count)}</div></div>
    <div class="stat"><div class="label">Resolved</div><div class="value">${esc(pack.conflict_checks?.resolved_count)}</div></div>
  </div>

  <div class="footer">
    Generated by Seema Compliance Platform.
  </div>
</body>
</html>`;
}
