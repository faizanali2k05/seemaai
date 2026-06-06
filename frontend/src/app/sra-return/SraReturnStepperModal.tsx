'use client';

/**
 * SRA Annual Return — section-by-section quick-fill stepper modal.
 *
 * Walks the COLP through every section of the return one at a time. For
 * each section we show the auto-filled value pulled from real firm data
 * (matters / AML / staff / insurance / etc.) and offer three actions:
 *   - Accept  → use the auto-filled value as-is
 *   - Override → enter a custom value + a brief reason (audit trail)
 *   - Skip / not applicable → with a required reason
 *
 * Progress is persisted to the backend on every section change so the
 * COLP can close the modal and resume later. The final step shows a
 * summary and a "Save and finalise" button that POSTs to the finalise
 * endpoint and offers a printable view (browser Print > Save as PDF).
 *
 * NOTE on submission: this product does NOT actually submit to mySRA.
 * The final summary screen tells the COLP to file at
 *   https://my.sra.org.uk
 * directly using the values shown.
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, showToast } from '@/components/ui';
import apiClient from '@/lib/api';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

// ─── Canonical section list ──────────────────────────────────────────────────
// Mirrors the keys returned by GET /compliance/sra-return.sections (Node) but
// adds the human-friendly labels, descriptions, and field-type hints the
// stepper UI needs that the API does not provide.
export interface SectionDef {
  key: string;
  title: string;
  description: string;
  /** Field type used by the inline override editor. */
  fieldType: 'text' | 'number' | 'date' | 'json';
  /** Path into the GET /compliance/sra-return response that holds the auto-filled value. */
  // We support both top-level firm fields and nested section.completed-style hints.
  resolveValue: (apiData: Record<string, unknown>) => string | number | null;
}

const SECTION_DEFS: SectionDef[] = [
  {
    key: 'firm_details',
    title: 'Firm details',
    description: 'Confirms the firm name, SRA number, COLP, COFA and MLRO recorded on file.',
    fieldType: 'text',
    resolveValue: (d) => {
      const name = typeof d.firm_name === 'string' ? d.firm_name : '';
      const sra = typeof d.sra_number === 'string' ? d.sra_number : '';
      const colp = typeof d.colp_name === 'string' ? d.colp_name : '';
      const cofa = typeof d.cofa_name === 'string' ? d.cofa_name : '';
      return `${name} (SRA ${sra}) — COLP ${colp || 'unset'}, COFA ${cofa || 'unset'}`;
    },
  },
  {
    key: 'work_areas',
    title: 'Practice areas',
    description: 'The areas of law your firm undertook fee-earning work in during the reporting period.',
    fieldType: 'text',
    resolveValue: (d) => {
      const sections = (d.sections ?? {}) as Record<string, { completed?: number; fields?: number }>;
      const wa = sections.work_areas;
      if (!wa) return null;
      return `${wa.completed ?? 0} of ${wa.fields ?? 0} practice areas recorded`;
    },
  },
  {
    key: 'fees_and_finance',
    title: 'Turnover & client account',
    description: 'Your turnover band, client account presence, and most recent reconciliation.',
    fieldType: 'text',
    resolveValue: (d) => {
      const sections = (d.sections ?? {}) as Record<string, { completed?: number; fields?: number }>;
      const f = sections.fees_and_finance;
      if (!f) return null;
      return `${f.completed ?? 0} of ${f.fields ?? 0} finance checks satisfied`;
    },
  },
  {
    key: 'insurance',
    title: 'Professional Indemnity Insurance',
    description: 'Your PII insurer, policy number, sum insured, and renewal/expiry date.',
    fieldType: 'date',
    resolveValue: (d) => {
      const sections = (d.sections ?? {}) as Record<string, { completed?: number; fields?: number; missing?: string[] }>;
      const ins = sections.insurance;
      if (!ins) return null;
      const missing = (ins.missing ?? []).join(', ');
      return missing
        ? `${ins.completed ?? 0} of ${ins.fields ?? 0} fields complete (missing: ${missing})`
        : 'All PII fields complete';
    },
  },
  {
    key: 'money_laundering',
    title: 'AML compliance',
    description: 'MLRO, AML policy, CDD records, SARs filed, and AML training completion rate.',
    fieldType: 'text',
    resolveValue: (d) => {
      const sections = (d.sections ?? {}) as Record<string, { completed?: number; fields?: number }>;
      const aml = sections.money_laundering;
      if (!aml) return null;
      return `${aml.completed ?? 0} of ${aml.fields ?? 0} AML controls evidenced`;
    },
  },
  {
    key: 'complaints',
    title: 'Complaints handling',
    description: 'Number of complaints opened in the reporting period and how many were resolved within 8 weeks.',
    fieldType: 'number',
    resolveValue: (d) => {
      const cs = (d.complaints_summary ?? {}) as Record<string, number>;
      const total = cs.complaint_count ?? 0;
      const within8 = cs.complaints_resolved_within_8wks ?? 0;
      const ombudsman = cs.ombudsman_referrals ?? 0;
      return `${total} complaints, ${within8} resolved within 8 weeks, ${ombudsman} Legal Ombudsman referrals`;
    },
  },
  {
    key: 'diversity',
    title: 'Diversity data',
    description: 'Confirms the diversity survey was completed for this reporting period.',
    fieldType: 'text',
    resolveValue: (d) => {
      const sections = (d.sections ?? {}) as Record<string, { complete?: boolean }>;
      const div = sections.diversity;
      if (!div) return null;
      return div.complete ? 'Diversity survey completed' : 'Diversity survey NOT completed';
    },
  },
];

type Status = 'accepted' | 'overridden' | 'skipped';

interface SectionResponse {
  status: Status;
  value: string | null;
  notes: string | null;
}

interface SavedResponse {
  section_key: string;
  status: Status;
  value: string | null;
  notes: string | null;
  completed_at?: string;
}

interface PriorYearValues {
  // Map of sectionKey → previously-submitted value, used to flag "changed since last year".
  [sectionKey: string]: string | number | null;
}

export interface SraReturnStepperModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Raw response from GET /compliance/sra-return — used to derive auto-filled values. */
  apiData: Record<string, unknown> | null;
  /** Reporting year integer (e.g. 2026) — composite key with firm_id. */
  returnYear: number;
  /** Previously-submitted values, keyed by section_key. Optional. */
  priorYearValues?: PriorYearValues;
}

export function SraReturnStepperModal({
  isOpen,
  onClose,
  apiData,
  returnYear,
  priorYearValues = {},
}: SraReturnStepperModalProps) {
  const sections = SECTION_DEFS;
  const [stepIdx, setStepIdx] = useState(0);
  const [responses, setResponses] = useState<Record<string, SectionResponse>>({});
  const [overrideValue, setOverrideValue] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [showOverride, setShowOverride] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [finalising, setFinalising] = useState(false);
  const [finalSummary, setFinalSummary] = useState<null | {
    finalised_at: string;
    next_step_text: string;
  }>(null);

  const onSummaryStep = stepIdx >= sections.length;
  const currentSection = onSummaryStep ? null : sections[stepIdx];
  const currentResponse = currentSection ? responses[currentSection.key] : undefined;

  // Hydrate previously-saved responses from the backend whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        setHydrating(true);
        const res = await apiClient.get(`/compliance/sra-return/${returnYear}/responses`);
        if (cancelled) return;
        const saved: SavedResponse[] = Array.isArray(res.data?.responses) ? res.data.responses : [];
        const map: Record<string, SectionResponse> = {};
        for (const r of saved) {
          map[r.section_key] = { status: r.status, value: r.value, notes: r.notes };
        }
        setResponses(map);
        // Resume at the first unanswered section.
        const firstUnanswered = sections.findIndex((s) => !map[s.key]);
        setStepIdx(firstUnanswered === -1 ? sections.length : firstUnanswered);
      } catch {
        // Non-fatal — first-time use, no saved responses yet.
        setResponses({});
        setStepIdx(0);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, returnYear, sections]);

  // Reset the inline editors whenever the visible section changes.
  useEffect(() => {
    setShowOverride(false);
    setShowSkip(false);
    setOverrideValue('');
    setNotes('');
  }, [stepIdx]);

  const autoFilled = useMemo(() => {
    if (!currentSection || !apiData) return null;
    return currentSection.resolveValue(apiData);
  }, [currentSection, apiData]);

  const priorValue = currentSection ? priorYearValues[currentSection.key] : null;
  const changedSinceLastYear =
    priorValue !== undefined &&
    priorValue !== null &&
    autoFilled !== null &&
    String(priorValue) !== String(autoFilled);

  const totalSections = sections.length;
  const completedCount = sections.filter((s) => responses[s.key]).length;
  const progressPct = Math.round(((onSummaryStep ? totalSections : stepIdx) / totalSections) * 100);

  // ── Save handlers ──────────────────────────────────────────────────────────
  const persistResponse = async (status: Status, value: string | null, n: string | null) => {
    if (!currentSection) return;
    try {
      setSaving(true);
      await apiClient.put(
        `/compliance/sra-return/${returnYear}/responses/${currentSection.key}`,
        { status, value, notes: n },
      );
      setResponses((prev) => ({
        ...prev,
        [currentSection.key]: { status, value, notes: n },
      }));
      // Advance to the next step.
      setStepIdx((i) => i + 1);
    } catch (err) {
      showToast('Failed to save section — please try again', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAccept = () => {
    const v = autoFilled === null ? null : String(autoFilled);
    void persistResponse('accepted', v, null);
  };

  const handleOverrideSubmit = () => {
    if (!overrideValue.trim()) {
      showToast('Override value cannot be empty', 'error');
      return;
    }
    if (!notes.trim()) {
      showToast('Please add a brief reason for the override (audit trail)', 'error');
      return;
    }
    void persistResponse('overridden', overrideValue.trim(), notes.trim());
  };

  const handleSkipSubmit = () => {
    if (!notes.trim()) {
      showToast('Please add a reason for skipping this section', 'error');
      return;
    }
    void persistResponse('skipped', null, notes.trim());
  };

  const handlePrev = () => {
    setStepIdx((i) => Math.max(0, i - 1));
  };

  const handleFinalise = async () => {
    try {
      setFinalising(true);
      const res = await apiClient.post(`/compliance/sra-return/${returnYear}/finalise`, {});
      setFinalSummary({
        finalised_at: res.data?.finalised_at ?? new Date().toISOString(),
        next_step_text:
          res.data?.next_step_text ?? 'Submit this to mySRA at https://my.sra.org.uk',
      });
      showToast('SRA Return finalised', 'success');
    } catch {
      showToast('Failed to finalise — please try again', 'error');
    } finally {
      setFinalising(false);
    }
  };

  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    const w = window.open('', '_blank');
    if (!w) {
      showToast('Pop-up blocked — allow pop-ups to print', 'error');
      return;
    }
    const rows = sections
      .map((s) => {
        const r = responses[s.key];
        const status = r?.status ?? 'not answered';
        const value = r?.value ?? '(no value)';
        const note = r?.notes ?? '';
        return `<tr>
          <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(s.title)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-transform:capitalize;">${escapeHtml(status)}</td>
          <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(value)}</td>
          <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(note)}</td>
        </tr>`;
      })
      .join('');
    w.document.write(`<!DOCTYPE html><html><head><title>SRA Annual Return ${returnYear}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:40px;color:#1a1a1a}
        h1{color:#1e3a5f;border-bottom:2px solid #1e3a5f;padding-bottom:10px}
        table{border-collapse:collapse;width:100%;margin-top:20px}
        th{background:#1e3a5f;color:#fff;padding:10px;text-align:left}
        .next{margin-top:30px;padding:16px;background:#fff7e6;border:1px solid #f0c674;border-radius:6px}
      </style></head><body>
      <h1>SRA Annual Return ${returnYear} — Summary</h1>
      <p>Generated ${new Date().toLocaleString('en-GB')}</p>
      <table><thead><tr><th>Section</th><th>Status</th><th>Value</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <p class="next"><strong>Next step:</strong> Submit this to mySRA at
        <a href="https://my.sra.org.uk">https://my.sra.org.uk</a> — Seema does not submit on your behalf.</p>
      </body></html>`);
    w.document.close();
    w.onload = () => w.print();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Walk through SRA Return ${returnYear}`}
      size="2xl"
    >
      {hydrating ? (
        <div className="py-12 text-center text-gray-500">Loading saved progress…</div>
      ) : onSummaryStep ? (
        // ── Summary step ─────────────────────────────────────────────────────
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Summary</h3>
          <p className="text-sm text-gray-600">
            Review your answers below, then save and finalise. This product does not
            submit to the SRA on your behalf — you will need to file your return on
            the mySRA portal.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-3">Section</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Value</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => {
                  const r = responses[s.key];
                  return (
                    <tr key={s.key} className="border-t">
                      <td className="p-3">{s.title}</td>
                      <td className="p-3">
                        <StatusPill status={r?.status} />
                      </td>
                      <td className="p-3 text-gray-700">
                        {r?.status === 'skipped'
                          ? <em className="text-gray-500">Skipped — {r.notes}</em>
                          : r?.value ?? <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {finalSummary ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-semibold text-green-900">Return finalised</p>
              <p className="text-sm text-green-800 mt-1">
                {finalSummary.next_step_text}
              </p>
              <a
                href="https://my.sra.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-700 underline"
              >
                Open mySRA portal
              </a>
            </div>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
              <strong>Reminder:</strong> Seema does not submit on your behalf.
              After finalising, file the return on{' '}
              <a
                href="https://my.sra.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                mySRA
              </a>.
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={handlePrev} disabled={finalising}>
              <ChevronLeft className="h-4 w-4 inline" /> Back
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handlePrint} disabled={finalising}>
                Print / Save as PDF
              </Button>
              {!finalSummary && (
                <Button onClick={handleFinalise} disabled={finalising}>
                  {finalising ? 'Saving…' : 'Save and finalise'}
                </Button>
              )}
              {finalSummary && (
                <Button onClick={onClose} variant="success">Done</Button>
              )}
            </div>
          </div>
        </div>
      ) : currentSection ? (
        // ── Section step ─────────────────────────────────────────────────────
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{currentSection.title}</h3>
            <p className="text-sm text-gray-600 mt-1">{currentSection.description}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
              Auto-filled value
            </div>
            <div className="text-base font-medium text-gray-900">
              {autoFilled === null || autoFilled === ''
                ? <span className="text-gray-500 italic">No data found — you may need to override or skip</span>
                : String(autoFilled)}
            </div>
            {changedSinceLastYear && (
              <div className="mt-2 text-xs text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Changed from last year (was: {String(priorValue)})
              </div>
            )}
          </div>

          {currentResponse && !showOverride && !showSkip && (
            <div className="text-xs text-gray-500">
              Previously saved: <StatusPill status={currentResponse.status} />
              {currentResponse.value && ` — ${currentResponse.value}`}
            </div>
          )}

          {showOverride && (
            <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <label className="block text-sm font-medium text-gray-700">
                Override value
              </label>
              <input
                type={
                  currentSection.fieldType === 'date'
                    ? 'date'
                    : currentSection.fieldType === 'number'
                    ? 'number'
                    : 'text'
                }
                value={overrideValue}
                onChange={(e) => setOverrideValue(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Enter the corrected value"
              />
              <label className="block text-sm font-medium text-gray-700">
                Reason for override <span className="text-red-600">*</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="Brief justification — this becomes part of the audit trail"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setShowOverride(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleOverrideSubmit} disabled={saving}>
                  {saving ? 'Saving…' : 'Save override'}
                </Button>
              </div>
            </div>
          )}

          {showSkip && (
            <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
              <label className="block text-sm font-medium text-gray-700">
                Reason for skipping <span className="text-red-600">*</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Not applicable to our firm, no clients in this category"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setShowSkip(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSkipSubmit} disabled={saving}>
                  {saving ? 'Saving…' : 'Save skip'}
                </Button>
              </div>
            </div>
          )}

          {!showOverride && !showSkip && (
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={handleAccept} disabled={saving} variant="success">
                Accept
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowOverride(true);
                  setOverrideValue(autoFilled === null ? '' : String(autoFilled));
                }}
                disabled={saving}
              >
                Override
              </Button>
              <Button variant="secondary" onClick={() => setShowSkip(true)} disabled={saving}>
                Skip / N/A
              </Button>
            </div>
          )}

          {/* Footer: progress + nav */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
              <span>
                Section <span className="font-semibold">{stepIdx + 1}</span> of{' '}
                <span className="font-semibold">{totalSections}</span>
                {' '}({completedCount} answered)
              </span>
              <span>{progressPct}% complete</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between">
              <Button
                variant="secondary"
                onClick={handlePrev}
                disabled={stepIdx === 0 || saving}
              >
                <ChevronLeft className="h-4 w-4 inline" /> Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setStepIdx((i) => i + 1)}
                disabled={saving}
              >
                Next <ChevronRight className="h-4 w-4 inline" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function StatusPill({ status }: { status?: Status }) {
  if (!status) {
    return <span className="text-xs text-gray-400">Not answered</span>;
  }
  const styles: Record<Status, string> = {
    accepted: 'bg-green-100 text-green-800',
    overridden: 'bg-amber-100 text-amber-800',
    skipped: 'bg-gray-200 text-gray-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
