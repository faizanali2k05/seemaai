'use client';

import { useState, useEffect } from 'react';
import { PageHeader, DataTable, Card, Button, Modal, Tabs, EmptyState, showToast, ConfirmDialog, LoadingSpinner, StatusBadge } from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { isDemoMode, DEMO_MATTERS } from '@/lib/demo-data';
import { ChevronRight } from 'lucide-react';

interface ChecklistItem {
  id: string;
  order?: number;
  description: string;
  completed: boolean;
  assignee?: string;
  notes?: string;
  dueDate?: Date;
}

interface Matter {
  id: string;
  matter_ref: string;
  client_name: string;
  matter_type: 'conveyancing' | 'litigation' | 'family' | 'criminal' | 'commercial' | string;
  fee_earner: string;
  status: 'open' | 'closed' | 'on_hold' | string;
  checklist_items?: ChecklistItem[];
  created_at?: string;
  completed_items?: number;
  total_items?: number;
  risk_level?: string;
  [key: string]: any;
}

type MatterType = 'conveyancing' | 'litigation' | 'family' | 'criminal' | 'commercial' | 'all';

export default function MattersPage() {
  useRequireAuth();

  const [activeTab, setActiveTab] = useState<MatterType>('all');
  const [showChecklistView, setShowChecklistView] = useState(false);
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMatterType, setSelectedMatterType] = useState<Matter['matter_type']>('conveyancing');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [matterRefInput, setMatterRefInput] = useState('');
  const [clientNameInput, setClientNameInput] = useState('');
  const [feeEarnerInput, setFeeEarnerInput] = useState('');
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  // AI Compliance Review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewResult, setReviewResult] = useState<any | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewMatterId, setReviewMatterId] = useState<string | null>(null);

  // Fetch matters from API
  useEffect(() => {
    const fetchMatters = async () => {
      try {
        setLoading(true);
        setError(null);

        // Demo mode fallback
        if (isDemoMode()) {
          const demoMatters = DEMO_MATTERS.map(m => ({
            ...m,
            matter_type: (m.matter_type || 'commercial') as any,
            checklist_items: [],
            completed_items: 0,
            total_items: 0,
            created_at: new Date().toISOString(),
          }));
          setMatters(demoMatters);
          setLoading(false);
          return;
        }

        const response = await apiClient.get('/compliance/matters');
        setMatters(Array.isArray(response.data) ? response.data : []);
      } catch (err: any) {
        console.error('Error fetching matters:', err);
        // Fallback to demo data on error only if in demo mode
        if (isDemoMode()) {
          const demoMatters = DEMO_MATTERS.map(m => ({
            ...m,
            matter_type: (m.matter_type || 'commercial') as any,
            checklist_items: [],
            completed_items: 0,
            total_items: 0,
            created_at: new Date().toISOString(),
          }));
          setMatters(demoMatters);
        }
        setError(err?.response?.data?.message || 'Failed to load matters');
      } finally {
        setLoading(false);
      }
    };

    fetchMatters();
  }, []);

  const filteredMatters = matters.filter(m =>
    activeTab === 'all' ? true : m.matter_type === activeTab
  );

  const columns = [
    { accessor: 'matter_ref', header: 'Matter Ref', width: '13%' },
    { accessor: 'client_name', header: 'Client', width: '17%' },
    { accessor: 'type', header: 'Type', width: '10%' },
    { accessor: 'progress', header: 'Progress', width: '16%' },
    { accessor: 'status', header: 'Status', width: '10%' },
    { accessor: 'fee_earner', header: 'Fee Earner', width: '12%' },
    { accessor: 'ai_review', header: '', width: '12%' },
    { accessor: 'action', header: '', width: '10%' },
  ];

  const getTypeLabel = (type: Matter['matter_type']) => {
    const labels: Record<Matter['matter_type'], string> = {
      conveyancing: 'Conveyancing',
      litigation: 'Litigation',
      family: 'Family',
      criminal: 'Criminal',
      commercial: 'Commercial',
    };
    return labels[type];
  };

  const formatMatterData = (matters: Matter[]) =>
    matters.map(matter => ({
      ...matter,
      type: getTypeLabel(matter.matter_type),
      progress: (
        <div className="space-y-1">
          <div className="text-sm font-medium tabular-nums">
            {matter.completed_items}/{matter.total_items} items
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((matter.completed_items ?? 0) / (matter.total_items || 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      ),
      status: (
        <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
          matter.status === 'open' ? 'bg-green-100 text-green-800' :
          matter.status === 'closed' ? 'bg-gray-100 text-gray-800' :
          'bg-yellow-100 text-yellow-800'
        }`}>
          {(matter.status || '').charAt(0).toUpperCase() + (matter.status || '').slice(1)}
        </span>
      ),
      ai_review: (
        <Button
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleReviewMatter(matter.id);
          }}
        >
          AI Review
        </Button>
      ),
      action: (
        <Button
          variant="secondary"
          className="text-xs"
          onClick={() => {
            setSelectedMatterId(matter.id);
            setShowChecklistView(true);
            setCheckedItems({});
          }}
        >
          View
        </Button>
      ),
    }));

  const selectedMatter = matters.find(m => m.id === selectedMatterId);

  const handleReviewMatter = async (matterId: string) => {
    setReviewMatterId(matterId);
    setReviewModalOpen(true);
    setReviewLoading(true);
    setReviewResult(null);
    try {
      const res = await apiClient.post(
        '/ai/review-matter',
        { matter_id: matterId },
        { timeout: 120000 },
      );
      setReviewResult(res.data);
    } catch (err: any) {
      setReviewResult({
        error: true,
        message: err?.response?.data?.message || err?.message || 'Review failed',
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const reviewMatterRow = matters.find(m => m.id === reviewMatterId);

  // Group findings by severity for clearer display.
  const groupedFindings: Record<string, any[]> = {};
  if (reviewResult && Array.isArray(reviewResult.findings)) {
    for (const f of reviewResult.findings) {
      const sev = (f?.severity || 'low') as string;
      if (!groupedFindings[sev]) groupedFindings[sev] = [];
      groupedFindings[sev].push(f);
    }
  }
  const severityOrder = ['critical', 'high', 'medium', 'low'];

  const handleCreateMatter = async () => {
    if (!matterRefInput.trim() || !clientNameInput.trim() || !feeEarnerInput.trim()) {
      showToast('Please fill in all required fields', 'error');
      setError('Please fill in all required fields');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      // Demo mode: add to local state
      if (isDemoMode()) {
        const newMatter: Matter = {
          id: `MAT-${Date.now()}`,
          matter_ref: matterRefInput,
          client_name: clientNameInput,
          matter_type: selectedMatterType,
          fee_earner: feeEarnerInput,
          status: 'open',
          risk_level: 'medium',
          opened_date: new Date().toISOString().split('T')[0],
          checklist_items: [],
          completed_items: 0,
          total_items: 0,
          created_at: new Date().toISOString(),
        };
        setMatters([...matters, newMatter]);
        showToast('Matter created successfully', 'success');
        setMatterRefInput('');
        setClientNameInput('');
        setFeeEarnerInput('');
        setShowCreateModal(false);
        return;
      }

      await apiClient.post('/compliance/matters', {
        matter_ref: matterRefInput,
        client_name: clientNameInput,
        matter_type: selectedMatterType,
        fee_earner: feeEarnerInput,
      });

      showToast('Matter created successfully', 'success');
      // Refresh matters list
      const response = await apiClient.get('/compliance/matters');
      setMatters(Array.isArray(response.data) ? response.data : []);

      // Reset form and close modal
      setMatterRefInput('');
      setClientNameInput('');
      setFeeEarnerInput('');
      setShowCreateModal(false);
    } catch (err: any) {
      console.error('Error creating matter:', err);
      const errorMsg = err?.response?.data?.message || 'Failed to create matter';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  const downloadFileReviewForm = async (matterId?: string) => {
    try {
      const url = matterId
        ? `/compliance/matters/${matterId}/file-review-form`
        : '/compliance/file-review-form/blank';
      const res = await apiClient.get(url, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(
        new Blob([res.data], { type: 'application/pdf' })
      );
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = 'File-Review-Form.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      showToast('Could not generate the File Review Form', 'error');
    }
  };

  const handleCompleteItem = async (itemId: string) => {
    try {
      await apiClient.post(`/compliance/matter-items/${itemId}/complete`);

      showToast('Item marked as complete', 'success');
      // Refresh matters list
      const response = await apiClient.get('/compliance/matters');
      setMatters(Array.isArray(response.data) ? response.data : []);
      setCheckedItems({});
    } catch (err: any) {
      console.error('Error completing item:', err);
      const errorMsg = err?.response?.data?.message || 'Failed to complete item';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Matter Compliance Review"
        description="AI-assisted compliance review across the firm's matters. Flags missing CDD, overdue checklist items, and regulatory gaps — synced from your PMS where connected."
      />

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
          </svg>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <Card className="rounded-xl">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <Tabs
            tabs={[
              { id: 'all', label: 'All' },
              { id: 'conveyancing', label: 'Conveyancing' },
              { id: 'litigation', label: 'Litigation' },
              { id: 'family', label: 'Family' },
              { id: 'criminal', label: 'Criminal' },
              { id: 'commercial', label: 'Commercial' },
            ]}
            activeTab={activeTab}
            onChange={(value) => setActiveTab(value as MatterType)}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => downloadFileReviewForm()}>
              File Review Form (PDF)
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              Create Checklist
            </Button>
          </div>
        </div>

        <div className="p-6 border-b border-gray-100">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-500">Loading matters...</p>
            </div>
          ) : filteredMatters.length > 0 ? (
            <DataTable columns={columns} data={formatMatterData(filteredMatters)} />
          ) : (
            <EmptyState
              title="No matters found"
              description={`No ${activeTab} matters to display`}
            />
          )}
        </div>
      </Card>

      {showChecklistView && selectedMatter && (
        <Card className="rounded-xl">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedMatter.matter_ref}</h2>
              <p className="text-sm text-gray-600 line-clamp-2">{selectedMatter.client_name}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => setConfirmClose(selectedMatter.id)}
              >
                Close Matter
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowChecklistView(false)}
              >
                Close Checklist
              </Button>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 pb-6 border-b border-gray-100">
              <div className="text-xs text-gray-600 mb-2 uppercase tracking-wide font-medium">Progress</div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{
                    width: `${((selectedMatter.completed_items ?? 0) / (selectedMatter.total_items || 1)) * 100}%`,
                  }}
                />
              </div>
              <p className="text-sm text-gray-700 mt-2 tabular-nums">
                {selectedMatter.completed_items} of {selectedMatter.total_items} items completed
              </p>
            </div>

            <div className="space-y-3">
              {selectedMatter.checklist_items?.map((item, idx) => (
                <div key={item.id} className="group flex items-start gap-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedItems[item.id] || item.completed}
                    onChange={(e) => {
                      if (e.target.checked) {
                        handleCompleteItem(item.id);
                      }
                      setCheckedItems({
                        ...checkedItems,
                        [item.id]: e.target.checked,
                      });
                    }}
                    className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {(item.order || idx + 1)}. {item.description}
                    </div>
                    {item.assignee && (
                      <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                        Assigned to: {item.assignee}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-sm text-gray-500 mt-1 italic line-clamp-2">
                        {item.notes}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Matter"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Matter Reference
            </label>
            <input
              type="text"
              value={matterRefInput}
              onChange={(e) => setMatterRefInput(e.target.value)}
              placeholder="e.g., CONV-2025-001"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Client Name
            </label>
            <input
              type="text"
              value={clientNameInput}
              onChange={(e) => setClientNameInput(e.target.value)}
              placeholder="e.g., Smith & Co Ltd"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Fee Earner
            </label>
            <input
              type="text"
              value={feeEarnerInput}
              onChange={(e) => setFeeEarnerInput(e.target.value)}
              placeholder="e.g., John Smith"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 uppercase tracking-wide">
              Matter Type
            </label>
            <select
              value={selectedMatterType}
              onChange={(e) => setSelectedMatterType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            >
              <option value="conveyancing">Conveyancing</option>
              <option value="litigation">Litigation</option>
              <option value="family">Family</option>
              <option value="criminal">Criminal</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateMatter}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Matter'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false);
          setReviewResult(null);
          setReviewMatterId(null);
        }}
        title="AI Compliance Review"
        size="3xl"
      >
        <div className="space-y-4">
          {reviewMatterRow && (
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{reviewMatterRow.matter_ref}</span>
              {reviewMatterRow.client_name ? ` — ${reviewMatterRow.client_name}` : ''}
            </div>
          )}

          {reviewLoading && (
            <div className="py-10 flex flex-col items-center justify-center gap-4">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-gray-600 text-center max-w-md">
                Seema is reviewing this matter — this usually takes 20-40 seconds.
              </p>
            </div>
          )}

          {!reviewLoading && reviewResult && reviewResult.error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800">Review failed</p>
              <p className="text-sm text-red-700 mt-1">{reviewResult.message}</p>
            </div>
          )}

          {!reviewLoading && reviewResult && !reviewResult.error && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
                <span className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                  Overall risk
                </span>
                <StatusBadge status={reviewResult.overall_risk || 'low'} />
                {reviewResult.ai_generated === false && (
                  <span className="text-xs text-gray-500 italic">
                    (rule-based fallback — AI unavailable)
                  </span>
                )}
              </div>

              {reviewResult.summary && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Summary</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {reviewResult.summary}
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Findings
                  {Array.isArray(reviewResult.findings) && (
                    <span className="ml-2 text-gray-500 font-normal">
                      ({reviewResult.findings.length})
                    </span>
                  )}
                </h3>
                {(!Array.isArray(reviewResult.findings) || reviewResult.findings.length === 0) ? (
                  <p className="text-sm text-gray-600 italic">
                    No findings — this matter looks clean.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {severityOrder
                      .filter((sev) => (groupedFindings[sev] || []).length > 0)
                      .map((sev) => (
                        <div key={sev} className="space-y-2">
                          {groupedFindings[sev].map((f, idx) => (
                            <div
                              key={`${sev}-${idx}`}
                              className="border border-gray-200 rounded-lg p-4 bg-white"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="font-medium text-gray-900">
                                  {f.title || '(untitled finding)'}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {f.category && (
                                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded uppercase tracking-wide">
                                      {f.category}
                                    </span>
                                  )}
                                  <StatusBadge status={sev} size="sm" />
                                </div>
                              </div>
                              {f.detail && (
                                <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                                  {f.detail}
                                </p>
                              )}
                              {f.recommended_action && (
                                <div className="mt-2 pt-2 border-t border-gray-100">
                                  <span className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                                    Recommended action
                                  </span>
                                  <p className="text-sm text-gray-800 mt-1">
                                    {f.recommended_action}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {Array.isArray(reviewResult.regulatory_references) &&
                reviewResult.regulatory_references.length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
                      Regulatory references
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {reviewResult.regulatory_references.map((ref: string, i: number) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => {
                setReviewModalOpen(false);
                setReviewResult(null);
                setReviewMatterId(null);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmClose}
        onConfirm={() => {
          if (confirmClose) {
            setMatters(matters.map(m => m.id === confirmClose ? { ...m, status: 'closed' } : m));
            showToast('Matter closed successfully', 'success');
            setShowChecklistView(false);
          }
          setConfirmClose(null);
        }}
        onCancel={() => setConfirmClose(null)}
        title="Close Matter"
        message="This will close the matter. You can still view closed matters but won't be able to edit them."
        confirmLabel="Close Matter"
        variant="warning"
      />
    </div>
  );
}
