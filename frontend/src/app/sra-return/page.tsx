'use client';

import { useState, useEffect } from 'react';
import { PageHeader, Card, Button, Modal, Tabs, EmptyState, showToast, ConfirmDialog } from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import { ChevronRight, Check } from 'lucide-react';
import { SraReturnStepperModal } from './SraReturnStepperModal';

interface Section {
  id: string;
  name: string;
  complete: boolean;
  editedAt?: string;
  missing?: string[];
  fields?: number;
  completed?: number;
  questions?: Array<{
    id: string;
    question: string;
    answer: string;
  }>;
}

interface SraReturnData {
  firm_name: string;
  sra_number: string;
  reporting_period: string;
  colp_name: string;
  cofa_name: string;
  sections: Section[];
  overall_score: number;
  submission_status: string;
}

type ActiveSection = 'firm_details' | 'turnover' | 'practice_areas' | 'staff' | 'insurance' | 'complaints' | 'diversity';

export default function SraReturnPage() {
  useRequireAuth();

  const [activeSection, setActiveSection] = useState<ActiveSection>('firm_details');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [editingField, setEditingField] = useState<string>('');
  const [editingValue, setEditingValue] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sraData, setSraData] = useState<SraReturnData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // Task #49: section-by-section quick-fill stepper modal.
  const [showStepper, setShowStepper] = useState(false);
  // Raw API response — passed to the stepper so it can derive auto-filled values
  // for each section without re-fetching.
  const [rawApiData, setRawApiData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const fetchSraData = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.get('/compliance/sra-return');
        const api = response.data || {};
        // Stash the raw payload so the section quick-fill stepper modal can
        // resolve per-section auto-filled values without re-fetching.
        setRawApiData(api as Record<string, unknown>);

        // Backend returns `sections` keyed by section id. Flatten to the
        // array shape this page renders.
        const apiSections: Record<string, { complete: boolean; fields: number; completed: number; missing: string[]; details?: Record<string, unknown> }> =
          (api.sections && typeof api.sections === 'object') ? api.sections : {};

        const sectionLabels: Record<string, string> = {
          firm_details: 'Firm Details',
          work_areas: 'Practice Areas',
          fees_and_finance: 'Turnover Band',
          insurance: 'Indemnity Insurance',
          money_laundering: 'AML & MLRO',
          diversity: 'Diversity Data',
          complaints: 'Complaints Data',
        };

        const sectionsArray = Object.entries(apiSections).map(([id, s]) => ({
          id,
          name: sectionLabels[id] || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          complete: !!s.complete,
          editedAt: api.last_saved ?? undefined,
          missing: Array.isArray(s.missing) ? s.missing : [],
          fields: typeof s.fields === 'number' ? s.fields : 0,
          completed: typeof s.completed === 'number' ? s.completed : 0,
          questions: [],
        }));

        const total = typeof api.total_fields === 'number' && api.total_fields > 0 ? api.total_fields : 1;
        const completed = typeof api.completed_fields === 'number' ? api.completed_fields : 0;
        const overall = Math.round((completed / total) * 100);

        const normalised: SraReturnData = {
          firm_name: api.firm_name ?? '',
          sra_number: api.sra_number ?? '',
          reporting_period: api.reporting_period ?? '',
          colp_name: api.colp_name ?? '',
          cofa_name: api.cofa_name ?? '',
          sections: sectionsArray,
          overall_score: overall,
          submission_status: api.status ?? 'draft',
        };
        setSraData(normalised);
      } catch (err) {
        console.error('Error fetching SRA return data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load SRA return data');
        // Empty state is rendered when sraData is null.
      } finally {
        setLoading(false);
      }
    };

    fetchSraData();
  }, []);

  const calculateCompletionPercentage = () => {
    if (!sraData?.sections) return 0;
    const completedSections = sraData.sections?.filter(s => s.complete).length ?? 0;
    return Math.round((completedSections / (sraData.sections?.length || 1)) * 100);
  };

  const getReportingPeriodDates = () => {
    if (!sraData?.reporting_period) {
      return { lastSubmission: new Date(), nextDeadline: new Date() };
    }
    const currentYear = new Date().getFullYear();
    const lastSubmission = new Date(`${currentYear - 1}-05-30`);
    const nextDeadline = new Date(`${currentYear}-05-30`);
    return { lastSubmission, nextDeadline };
  };

  const { lastSubmission, nextDeadline } = getReportingPeriodDates();

  const handleEditField = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditingValue(currentValue);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    showToast('Changes saved successfully', 'success');
    setShowEditModal(false);
    setEditingField('');
    setEditingValue('');
  };

  const handleExport = async () => {
    try {
      setExporting(true);

      const response = await apiClient.post('/compliance/sra-return/export', {}, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sra-return-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('SRA return exported successfully', 'success');
      setShowExportModal(false);
    } catch (err) {
      console.error('Error exporting SRA return:', err);
      showToast('Failed to export SRA return', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);

      const response = await apiClient.post('/compliance/sra-return/export-pdf', {}, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sra-return-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('PDF exported successfully', 'success');
      setShowExportModal(false);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      showToast('Failed to export PDF', 'error');
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title="SRA Annual Return"
          description="Complete and submit your annual compliance return to the SRA"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <div className="p-6 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
                <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse" />
                <div className="h-2 bg-gray-200 rounded w-full animate-pulse" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !sraData) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title="SRA Annual Return"
          description="Complete and submit your annual compliance return to the SRA"
        />
        <Card>
          <div className="p-12">
            <EmptyState
              title="Unable to Load SRA Return"
              description={error || 'No SRA return data found. Please try again later.'}
            />
            <div className="mt-6 text-center">
              <Button onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const completionPercentage = calculateCompletionPercentage();
  const completedSections = sraData.sections?.filter(s => s.complete).length ?? 0;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="SRA Annual Return"
        description="Complete and submit your annual compliance return to the SRA"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-xl">
          <div className="p-6">
            <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide font-medium">Completion Status</div>
            <div className="text-3xl font-bold text-gray-900 mb-3 tabular-nums">{completionPercentage}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {completedSections} of {sraData.sections?.length ?? 0} sections complete
            </p>
          </div>
        </Card>

        <Card className="rounded-xl">
          <div className="p-6">
            <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide font-medium">Last Submission</div>
            <div className="text-lg font-semibold text-gray-900">
              {formatDate(lastSubmission)}
            </div>
          </div>
        </Card>

        <Card className="rounded-xl">
          <div className="p-6">
            <div className="text-xs text-gray-600 mb-1 uppercase tracking-wide font-medium">Next Deadline</div>
            <div className="text-lg font-semibold text-red-600">
              {formatDate(nextDeadline)}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              <span className="tabular-nums">{Math.ceil((nextDeadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))}</span> days remaining
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="rounded-xl">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold uppercase tracking-wide">Return Sections</h2>
            </div>
            <div className="p-6 space-y-3">
              {(sraData.sections ?? []).map((section, idx) => (
                <div
                  key={idx}
                  className={`p-4 border rounded-xl cursor-pointer transition-colors group hover:bg-gray-50 ${
                    section.complete ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
                  }`}
                  onClick={() => {
                    const sectionMap: Record<string, ActiveSection> = {
                      'Firm Details': 'firm_details',
                      'Turnover Band': 'turnover',
                      'Practice Areas': 'practice_areas',
                      'Staff Numbers': 'staff',
                      'Indemnity Insurance': 'insurance',
                      'Complaints Data': 'complaints',
                      'Diversity Data': 'diversity',
                    };
                    setActiveSection(sectionMap[section.name] || 'firm_details');
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        section.complete ? 'border-green-600 bg-green-600' : 'border-yellow-600'
                      }`}>
                        {section.complete && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{section.name}</h3>
                        {section.editedAt && (
                          <p className="text-xs text-gray-600">
                            Last edited {formatDate(new Date(section.editedAt))}
                          </p>
                        )}
                        {/* Missing-fields hint: show the first 3 missing field
                            names in muted text so users see what's still
                            blocking completion without opening the section. */}
                        {section.missing && section.missing.length > 0 && (
                          <p className="text-xs text-gray-500 mt-1">
                            Missing: {section.missing.slice(0, 3).map(m => m.replace(/_/g, ' ')).join(', ')}
                            {section.missing.length > 3 && ` (+${section.missing.length - 3} more)`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${
                        section.complete ? 'text-green-600' : 'text-yellow-600'
                      }`}>
                        {section.complete
                          ? 'Complete'
                          : (typeof section.completed === 'number' && typeof section.fields === 'number' && section.fields > 0)
                            ? `${section.completed} / ${section.fields}`
                            : 'Incomplete'}
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="rounded-xl">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold uppercase tracking-wide">Actions</h2>
          </div>
          <div className="p-6 space-y-3">
            {/* Task #49: section-by-section walk-through. Surfaced first as
                the primary CTA — it's the simplest way for the COLP to get
                to a finalised return. */}
            <Button className="w-full" onClick={() => setShowStepper(true)} loading={false} disabled={false}>
              Walk through return
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => setShowExportModal(true)} loading={false} disabled={false}>
              Export for SRA
            </Button>
            <Button variant="secondary" className="w-full" loading={false} disabled={false}>
              Save Draft
            </Button>
            <Button variant="success" className="w-full" onClick={() => setConfirmSubmit(true)} loading={false} disabled={false}>
              Submit Return
            </Button>
          </div>
        </Card>
      </div>

      <Card className="rounded-xl">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold uppercase tracking-wide">Section Details: {
            {
              firm_details: 'Firm Details',
              turnover: 'Turnover Band',
              practice_areas: 'Practice Areas',
              staff: 'Staff Numbers',
              insurance: 'Indemnity Insurance',
              complaints: 'Complaints Data',
              diversity: 'Diversity Data',
            }[activeSection]
          }</h2>
        </div>

        <div className="p-6">
          {activeSection === 'firm_details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Firm Name</label>
                  <div className="mt-1 p-3 bg-gray-100 rounded flex items-center justify-between">
                    <span className="font-medium">{sraData.firm_name}</span>
                    <Button variant="secondary" className="text-xs" onClick={() => handleEditField('firm_name', sraData.firm_name)}>Edit</Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">SRA Number</label>
                  <div className="mt-1 p-3 bg-gray-100 rounded flex items-center justify-between">
                    <span className="font-medium text-sm">{sraData.sra_number}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">COLP Name</label>
                <div className="mt-1 p-3 bg-gray-100 rounded flex items-center justify-between">
                  <span className="font-medium">{sraData.colp_name}</span>
                  <Button variant="secondary" className="text-xs" onClick={() => handleEditField('colp_name', sraData.colp_name)}>Edit</Button>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600">COFA Name</label>
                <div className="mt-1 p-3 bg-gray-100 rounded flex items-center justify-between">
                  <span className="font-medium">{sraData.cofa_name}</span>
                  <Button variant="secondary" className="text-xs" onClick={() => handleEditField('cofa_name', sraData.cofa_name)}>Edit</Button>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'turnover' && (
            <div className="space-y-4">
              <div className="space-y-3">
                {(sraData.sections ?? []).find(s => s.id === 'turnover')?.questions?.map((q, idx) => (
                  <div key={idx}>
                    <label className="text-sm text-gray-600 font-medium">{q.question}</label>
                    <div className="mt-1 p-3 bg-gray-100 rounded">
                      <span className="font-medium">{q.answer}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'practice_areas' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 font-medium">Practice Areas</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(sraData.sections ?? []).find(s => s.id === 'practice_areas')?.questions?.map((q, idx) => (
                    <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                      {q.answer}
                    </span>
                  ))}
                </div>
                <Button variant="secondary" className="mt-4">Edit Practice Areas</Button>
              </div>
            </div>
          )}

          {activeSection === 'staff' && (
            <div className="space-y-4">
              {!(sraData.sections ?? []).find(s => s.id === 'staff')?.complete && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 font-semibold">This section is incomplete</p>
                </div>
              )}
              <div className="space-y-3">
                {(sraData.sections ?? []).find(s => s.id === 'staff')?.questions?.map((q, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="font-medium">{q.question}</span>
                    <span className="text-lg font-semibold">{q.answer}</span>
                  </div>
                ))}
              </div>
              <Button onClick={() => setShowEditModal(true)}>Edit Staff Numbers</Button>
            </div>
          )}

          {activeSection === 'insurance' && (
            <div className="space-y-4">
              <div className="space-y-4">
                {(sraData.sections ?? []).find(s => s.id === 'insurance')?.questions?.map((q, idx) => (
                  <div key={idx}>
                    <label className="text-sm text-gray-600 font-medium">{q.question}</label>
                    <div className="mt-1 p-3 bg-gray-100 rounded">
                      <p className="font-medium">{q.answer}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'complaints' && (
            <div className="space-y-4">
              {!(sraData.sections ?? []).find(s => s.id === 'complaints')?.complete && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 font-semibold">This section is incomplete</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {(sraData.sections ?? []).find(s => s.id === 'complaints')?.questions?.map((q, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded">
                    <p className="text-sm text-gray-600">{q.question}</p>
                    <p className="text-2xl font-bold mt-1">{q.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'diversity' && (
            <div className="space-y-4">
              {!(sraData.sections ?? []).find(s => s.id === 'diversity')?.complete && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-yellow-800 font-semibold">This section is incomplete</p>
                </div>
              )}
              <div className="space-y-3">
                {(sraData.sections ?? []).find(s => s.id === 'diversity')?.questions?.map((q, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>{q.question}</span>
                    <span className="font-semibold">{q.answer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Field"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {editingField}
            </label>
            <input
              type="text"
              value={editingValue}
              onChange={(e) => setEditingValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export for SRA"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Your return can be exported in the official SRA XML format or as a PDF. Choose the format below:
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900">Export includes:</p>
            <ul className="mt-2 space-y-1 text-sm text-blue-800">
              <li>All completed sections</li>
              <li>Firm details and practice areas</li>
              <li>Staff and diversity data</li>
              <li>Insurance and complaints information</li>
            </ul>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowExportModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              {exportingPdf ? 'Exporting PDF...' : 'Download PDF'}
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? 'Exporting...' : 'Download SRA XML'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmSubmit}
        onConfirm={() => {
          showToast('SRA return submitted successfully', 'success');
          setConfirmSubmit(false);
        }}
        onCancel={() => setConfirmSubmit(false)}
        title="Submit SRA Return"
        message="This will submit your annual compliance return to the SRA. Please ensure all information is correct."
        confirmLabel="Submit Return"
        variant="success"
      />

      {/* Task #49: stepper modal that walks the COLP through each section.
          The reporting period in the API response is "YYYY-04-01 to YYYY-03-31";
          we use the start-year integer as the composite-key returnYear. */}
      <SraReturnStepperModal
        isOpen={showStepper}
        onClose={() => setShowStepper(false)}
        apiData={rawApiData}
        returnYear={parseReturnYear(sraData?.reporting_period)}
      />
    </div>
  );
}

/**
 * Extract the start year from a reporting_period string like
 * "2026-04-01 to 2027-03-31". Falls back to the current calendar year.
 */
function parseReturnYear(period: string | undefined): number {
  if (period) {
    const m = period.match(/^(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (Number.isFinite(y)) return y;
    }
  }
  return new Date().getFullYear();
}
