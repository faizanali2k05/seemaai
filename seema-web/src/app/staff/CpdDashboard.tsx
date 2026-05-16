'use client';

/**
 * CPD Dashboard for the Staff & Training page (Task #51).
 *
 * The SRA scrapped the fixed 16-hour CPD requirement in 2016 in favour of
 * the "continuing competence" regime — solicitors must keep their
 * professional knowledge and skills up to date, but there is no minimum
 * hours requirement and individual reflection drives the activity, not a
 * tickbox course count.
 *
 * In practice almost every firm still tracks hours by category as
 * structured evidence and as a proxy for "engaged with development". This
 * dashboard exposes that view to the COLP:
 *   - per-staff total hours, category breakdown, gap to target, status pill;
 *   - missing-reflection counter (the SRA does require reflection);
 *   - drill-in to a staff member's CPD log with edit-in-place reflection;
 *   - admin "Set firm target" action;
 *   - per-staff "Export evidence pack" (HTML print view).
 *
 * Backend: GET /compliance/training/cpd-dashboard?year=YYYY
 * Targets: GET/PUT /compliance/training/cpd-targets
 * Records: PATCH /compliance/training/:trainingId
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Modal, EmptyState, showToast } from '@/components/ui';
import { Download, AlertTriangle, Edit3 } from 'lucide-react';
import apiClient from '@/lib/api';
import type { StaffTraining } from '@/lib/types';

const CPD_CATEGORIES = ['regulatory', 'technical', 'ethics', 'business_skills', 'other'] as const;
type CpdCategory = (typeof CPD_CATEGORIES)[number];

const CATEGORY_COLORS: Record<CpdCategory, string> = {
  regulatory: 'bg-blue-500',
  technical: 'bg-emerald-500',
  ethics: 'bg-purple-500',
  business_skills: 'bg-amber-500',
  other: 'bg-gray-400',
};

const CATEGORY_LABELS: Record<CpdCategory, string> = {
  regulatory: 'Regulatory',
  technical: 'Technical legal',
  ethics: 'Ethics',
  business_skills: 'Business skills',
  other: 'Other',
};

interface CpdStaffRow {
  staff_id: string;
  staff_name: string;
  role: string | null;
  total_hours: number;
  hours_by_category: Record<string, number>;
  target_hours: number;
  gap_hours: number;
  records_count: number;
  missing_reflections: number;
  last_record_date: string | null;
  status: 'on_track' | 'at_risk' | 'off_track' | 'no_records';
}

interface CpdDashboardData {
  year: number;
  firm_target_hours: number;
  uncategorised_records: number;
  summary: {
    total_hours: number;
    avg_per_fee_earner: number;
    on_track_pct: number;
    staff_count: number;
  };
  staff: CpdStaffRow[];
}

const STATUS_PILL: Record<CpdStaffRow['status'], { label: string; cls: string }> = {
  on_track: { label: 'On track', cls: 'bg-green-100 text-green-800 border-green-300' },
  at_risk: { label: 'At risk', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  off_track: { label: 'Off track', cls: 'bg-red-100 text-red-800 border-red-300' },
  no_records: { label: 'No records', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
};

interface Props {
  // The list of training records the parent already fetched — re-used so
  // the drill-in modal doesn't trigger another network round-trip and so
  // edits made here are reflected after the parent refetches.
  trainingList: StaffTraining[];
  // Called whenever a record is patched so the parent can refresh.
  onRecordsChanged: () => void;
  // Whether the current user is allowed to mutate firm-wide settings.
  isAdmin: boolean;
}

export default function CpdDashboard({ trainingList, onRecordsChanged, isAdmin }: Props) {
  const api = apiClient;
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [data, setData] = useState<CpdDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drillStaff, setDrillStaff] = useState<CpdStaffRow | null>(null);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetInput, setTargetInput] = useState<string>('16');

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/compliance/training/cpd-dashboard?year=${year}`);
      setData(res.data as CpdDashboardData);
      setTargetInput(String((res.data as CpdDashboardData).firm_target_hours ?? 16));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CPD dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const recordsForDrill = useMemo(() => {
    if (!drillStaff) return [] as StaffTraining[];
    return trainingList.filter((t) => t.staff_id === drillStaff.staff_id);
  }, [drillStaff, trainingList]);

  const handleSaveTarget = async () => {
    const hours = Number(targetInput);
    if (!Number.isFinite(hours) || hours < 0) {
      showToast('Enter a non-negative number of hours', 'error');
      return;
    }
    try {
      await api.put('/compliance/training/cpd-targets', { firm_target_hours: hours });
      showToast('Firm CPD target updated', 'success');
      setShowTargetModal(false);
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update target', 'error');
    }
  };

  const handlePatchRecord = async (
    recordId: string,
    patch: Partial<{ category: CpdCategory; reflection_notes: string; cpd_hours: number }>,
  ) => {
    try {
      await api.patch(`/compliance/training/${recordId}`, patch);
      showToast('Saved', 'success');
      onRecordsChanged();
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  };

  // Render a printable evidence pack in a new window. We deliberately use
  // window.print() rather than wiring a real PDF generator — the HTML
  // print view satisfies the SRA evidence requirement and avoids pulling
  // in a heavy PDF dep just for this surface.
  const handleExportPack = (row: CpdStaffRow) => {
    const records = trainingList.filter((t) => t.staff_id === row.staff_id);
    const win = window.open('', '_blank');
    if (!win) {
      showToast('Pop-up blocked — allow pop-ups to export', 'error');
      return;
    }
    const rows = records
      .map(
        (r: any) => `
        <tr>
          <td>${escapeHtml(r.course_name || r.training_type || r.title || 'Untitled')}</td>
          <td>${escapeHtml(r.category || 'other')}</td>
          <td style="text-align:right">${r.cpd_hours ?? '-'}</td>
          <td>${escapeHtml(r.completed_date || r.completed_at || r.due_date || '-')}</td>
          <td>${escapeHtml(r.reflection_notes || '— no reflection recorded —')}</td>
        </tr>`,
      )
      .join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>CPD Evidence — ${escapeHtml(row.staff_name)} ${row.target_hours ? '(' + row.target_hours + 'h target)' : ''}</title>
      <style>
        body{font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:2.5rem;color:#111}
        h1{font-size:20px;margin:0 0 4px}
        .meta{color:#555;margin-bottom:24px}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}
        th{background:#f5f5f5}
        footer{margin-top:32px;font-size:11px;color:#666;border-top:1px solid #eee;padding-top:12px}
      </style></head><body>
      <h1>CPD evidence pack — ${escapeHtml(row.staff_name)}</h1>
      <div class="meta">
        Role: ${escapeHtml(row.role || '—')} &nbsp;·&nbsp;
        Year: ${year} &nbsp;·&nbsp;
        Hours completed: <strong>${row.total_hours}</strong> / target ${row.target_hours} &nbsp;·&nbsp;
        Records: ${row.records_count} &nbsp;·&nbsp;
        Missing reflections: ${row.missing_reflections}
      </div>
      <table><thead><tr>
        <th>Activity</th><th>Category</th><th>Hours</th><th>Date</th><th>Reflection</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="5">No records for this year.</td></tr>'}</tbody></table>
      <footer>
        Generated by Seema · SRA Continuing Competence: solicitors must keep their professional knowledge and skills up to date.
        There is no minimum hour requirement; firms set their own targets.
        Source: https://www.sra.org.uk/solicitors/resources/continuing-competence/
      </footer>
      <script>window.onload=()=>window.print();</script>
      </body></html>`);
    win.document.close();
  };

  if (loading) {
    return <p className="text-sm text-gray-600 mt-6">Loading CPD dashboard…</p>;
  }
  if (error) {
    return (
      <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
    );
  }
  if (!data) return null;

  return (
    <div className="mt-6 space-y-6">
      {/* SRA citation banner — the COLP needs to know the source authority */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>SRA Continuing Competence.</strong> Solicitors must keep their professional knowledge
          and skills up to date. There is no minimum hour requirement; firms set their own targets and
          solicitors reflect on their learning needs each year.
        </p>
        <p className="text-xs text-blue-700 mt-2">
          <a
            href="https://www.sra.org.uk/solicitors/resources/continuing-competence/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            sra.org.uk/solicitors/resources/continuing-competence
          </a>
        </p>
      </div>

      {/* Year switcher + admin actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => setShowTargetModal(true)}>
            Set firm target
          </Button>
        )}
      </div>

      {/* Uncategorised records banner */}
      {data.uncategorised_records > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-900">
              {data.uncategorised_records} record{data.uncategorised_records === 1 ? '' : 's'} uncategorised
              — categorise them to improve dashboard accuracy.
            </p>
            <p className="text-xs text-amber-800 mt-1">
              Click any staff row below and use the per-record category dropdown to assign one of:
              regulatory, technical, ethics, business skills, other.
            </p>
          </div>
        </div>
      )}

      {/* Firm-wide summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <SummaryCard label="Total CPD hours" value={data.summary.total_hours} suffix="h" />
        <SummaryCard label="Avg per fee earner" value={data.summary.avg_per_fee_earner} suffix="h" />
        <SummaryCard label="Staff on track" value={data.summary.on_track_pct} suffix="%" />
        <SummaryCard label="Firm target" value={data.firm_target_hours} suffix="h" />
      </div>

      {/* Per-staff table */}
      {data.staff.length === 0 ? (
        <EmptyState title="No staff" description="Add staff members to see CPD progress" icon="users" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Staff</th>
                <th className="px-4 py-3 text-left font-semibold">Role</th>
                <th className="px-4 py-3 text-right font-semibold">Hours</th>
                <th className="px-4 py-3 text-left font-semibold w-64">Category split</th>
                <th className="px-4 py-3 text-right font-semibold">Gap</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.staff.map((row) => (
                <tr
                  key={row.staff_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setDrillStaff(row)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{row.staff_name}</td>
                  <td className="px-4 py-3 text-gray-700">{row.role || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.total_hours} / {row.target_hours}
                  </td>
                  <td className="px-4 py-3">
                    <CategoryBar hoursByCategory={row.hours_by_category} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.gap_hours > 0 ? `${row.gap_hours}h` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_PILL[row.status].cls}`}
                    >
                      {STATUS_PILL[row.status].label}
                    </span>
                    {row.missing_reflections > 0 && (
                      <span className="ml-2 text-xs text-amber-700">
                        {row.missing_reflections} no reflection
                      </span>
                    )}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportPack(row)}
                    >
                      <Download size={14} className="mr-1" />
                      Pack
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-in modal */}
      {drillStaff && (
        <Modal
          isOpen={!!drillStaff}
          onClose={() => setDrillStaff(null)}
          title={`${drillStaff.staff_name} — CPD ${year}`}
          actions={[{ label: 'Close', onClick: () => setDrillStaff(null) }]}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Hours</p>
                <p className="font-semibold tabular-nums">
                  {drillStaff.total_hours} / {drillStaff.target_hours}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Records</p>
                <p className="font-semibold tabular-nums">{drillStaff.records_count}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Missing reflections</p>
                <p className="font-semibold tabular-nums">{drillStaff.missing_reflections}</p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Records ({recordsForDrill.length})
              </h4>
              {recordsForDrill.length === 0 ? (
                <p className="text-sm text-gray-600">No CPD records for this staff member.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {recordsForDrill.map((r) => (
                    <RecordEditor
                      key={r.id}
                      record={r}
                      onSave={(patch) => handlePatchRecord(r.id, patch)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Set firm target modal */}
      {showTargetModal && (
        <Modal
          isOpen={showTargetModal}
          onClose={() => setShowTargetModal(false)}
          title="Set firm-wide CPD target"
          actions={[
            { label: 'Cancel', onClick: () => setShowTargetModal(false) },
            { label: 'Save', onClick: handleSaveTarget, variant: 'primary' },
          ]}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Internal target hours per staff member per year. The SRA does not require a fixed number;
              this is your firm&apos;s policy figure used as a structured proxy for "kept up to date".
            </p>
            <input
              type="number"
              min={0}
              step={1}
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <span className="ml-2 text-sm text-gray-600">hours / year</span>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SummaryCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 tabular-nums">
        {value}
        {suffix && <span className="text-sm font-medium text-gray-500 ml-1">{suffix}</span>}
      </p>
    </div>
  );
}

function CategoryBar({ hoursByCategory }: { hoursByCategory: Record<string, number> }) {
  const total = CPD_CATEGORIES.reduce((acc, c) => acc + (hoursByCategory[c] || 0), 0);
  if (total <= 0) {
    return <div className="h-2 w-full rounded-full bg-gray-100" />;
  }
  return (
    <div>
      <div className="flex h-2 w-full rounded-full overflow-hidden bg-gray-100">
        {CPD_CATEGORIES.map((cat) => {
          const v = hoursByCategory[cat] || 0;
          if (v <= 0) return null;
          return (
            <div
              key={cat}
              className={CATEGORY_COLORS[cat]}
              style={{ width: `${(v / total) * 100}%` }}
              title={`${CATEGORY_LABELS[cat]}: ${v}h`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-600">
        {CPD_CATEGORIES.map((cat) => {
          const v = hoursByCategory[cat] || 0;
          if (v <= 0) return null;
          return (
            <span key={cat} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-sm ${CATEGORY_COLORS[cat]}`} />
              {CATEGORY_LABELS[cat]} {v}h
            </span>
          );
        })}
      </div>
    </div>
  );
}

function RecordEditor({
  record,
  onSave,
}: {
  record: StaffTraining;
  onSave: (patch: { category?: CpdCategory; reflection_notes?: string; cpd_hours?: number }) => void;
}) {
  const r: any = record;
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState<CpdCategory>(((r.category as CpdCategory) || 'other'));
  const [reflection, setReflection] = useState<string>(r.reflection_notes || '');
  const [hours, setHours] = useState<string>(String(r.cpd_hours ?? ''));

  const handleSave = () => {
    const patch: { category?: CpdCategory; reflection_notes?: string; cpd_hours?: number } = {};
    if (category !== r.category) patch.category = category;
    if (reflection !== (r.reflection_notes || '')) patch.reflection_notes = reflection;
    const hoursNum = Number(hours);
    if (Number.isFinite(hoursNum) && hoursNum !== r.cpd_hours) patch.cpd_hours = hoursNum;
    onSave(patch);
    setEditing(false);
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 truncate">
            {r.course_name || r.training_type || r.title || 'Untitled activity'}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {r.cpd_hours ?? 0}h · {(r.category || 'other').toString().replace('_', ' ')} ·
            {' '}
            {r.completed_date || r.completed_at || r.due_date || 'no date'}
          </p>
          {!editing && r.reflection_notes && (
            <p className="text-xs text-gray-700 mt-2 line-clamp-2 italic">"{r.reflection_notes}"</p>
          )}
          {!editing && !r.reflection_notes && (
            <p className="text-xs text-amber-700 mt-2">No reflection recorded.</p>
          )}
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Edit3 size={12} className="mr-1" />
            Edit
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-600">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CpdCategory)}
                className="w-full mt-0.5 px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {CPD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Hours</label>
              <input
                type="number"
                min={0}
                step={1}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full mt-0.5 px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600">Reflection notes</label>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              rows={3}
              className="w-full mt-0.5 px-2 py-1 border border-gray-300 rounded text-sm"
              placeholder="What did you learn? How will you apply it?"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
