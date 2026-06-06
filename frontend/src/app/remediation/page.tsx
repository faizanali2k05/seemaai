'use client';

import { useState, useEffect } from 'react';
import {
  PageHeader,
  ComplianceFlowNav,
  DataTable,
  Card,
  Button,
  StatusBadge,
  Modal,
  showToast,
  ConfirmDialog,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { isDemoMode, DEMO_REMEDIATION } from '@/lib/demo-data';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';

interface RemediationStep {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed';
  assignee?: string;
  dueDate?: Date;
  notes?: string;
}

interface RemediationPlan {
  id: string;
  alert_id?: string;
  title: string;
  status: 'draft' | 'active' | 'completed' | string;
  priority: string;
  assigned_to?: string;
  steps: RemediationStep[];
  created_at: string;
  due_date?: string;
  completed_at?: string;
  owner?: string;
  trigger?: string;
  completed_steps?: number;
  total_steps?: number;
  [key: string]: any;
}

export default function RemediationPage() {
  useRequireAuth();
  const [plans, setPlans] = useState<RemediationPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<RemediationPlan | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      setLoading(true);
      setError(null);

      // Demo mode fallback
      if (isDemoMode()) {
        const demoPlans = DEMO_REMEDIATION.map(r => {
          const anyR = r as any;
          return {
            ...r,
            status: r.status as 'draft' | 'active' | 'completed' | string,
            steps: r.steps.map((s: any, idx: number) => ({
              id: typeof s === 'string' ? `${r.id}-step-${idx}` : (s.id ?? `${r.id}-step-${idx}`),
              title: typeof s === 'string' ? s : (s.description ?? ''),
              status: 'pending' as const,
              assignee: anyR.assigned_to ?? anyR.owner ?? '',
              dueDate: anyR.due_date ? new Date(anyR.due_date) : new Date(),
              notes: '',
            })),
            alert_id: '',
            assigned_to: anyR.assigned_to ?? anyR.owner ?? '',
            due_date: anyR.due_date ?? '',
            completed_at: undefined,
          };
        }) as unknown as RemediationPlan[];
        setPlans(demoPlans);
        setLoading(false);
        return;
      }

      const response = await apiClient.get('/compliance/remediation-plans');
      setPlans(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError('Failed to load remediation plans');
      // Fallback to demo data
      if (isDemoMode()) {
        const demoPlans = DEMO_REMEDIATION.map(r => {
          const anyR = r as any;
          return {
            ...r,
            status: r.status as 'draft' | 'active' | 'completed' | string,
            steps: r.steps.map((s: any, idx: number) => ({
              id: typeof s === 'string' ? `${r.id}-step-${idx}` : (s.id ?? `${r.id}-step-${idx}`),
              title: typeof s === 'string' ? s : (s.description ?? ''),
              status: 'pending' as const,
              assignee: anyR.assigned_to ?? anyR.owner ?? '',
              dueDate: anyR.due_date ? new Date(anyR.due_date) : new Date(),
              notes: '',
            })),
            alert_id: '',
            assigned_to: anyR.assigned_to ?? anyR.owner ?? '',
            due_date: anyR.due_date ?? '',
            completed_at: undefined,
          };
        }) as unknown as RemediationPlan[];
        setPlans(demoPlans);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStepComplete = async (planId: string, stepId: string) => {
    try {
      // Demo mode: update local state
      if (isDemoMode()) {
        setPlans(plans.map(p =>
          p.id === planId
            ? {
              ...p,
              steps: p.steps.map(s =>
                s.id === stepId ? { ...s, status: 'completed' as const } : s
              ),
            }
            : p
        ));
        showToast('Step completed successfully', 'success');
        const updatedPlan = plans.find(p => p.id === planId);
        if (updatedPlan) setSelectedPlan(updatedPlan);
        return;
      }

      await apiClient.post(`/compliance/remediation-steps/${stepId}/complete`);
      showToast('Step completed successfully', 'success');
      await fetchPlans();
      if (selectedPlan?.id === planId) {
        const updatedPlan = plans.find(p => p.id === planId);
        if (updatedPlan) setSelectedPlan(updatedPlan);
      }
    } catch (err) {
      showToast('Failed to complete step', 'error');
      setError('Failed to complete step');
      console.error(err);
    }
  };

  const getStepsCompleted = (plan: RemediationPlan) => {
    return plan.steps?.filter(s => s.status === 'completed').length ?? 0;
  };

  const columns = [
    { accessor: 'title', header: 'Plan Title', sortable: true },
    { accessor: 'alert_id', header: 'Alert ID' },
    {
      accessor: 'status',
      header: 'Status',
      render: (_value: any, row: any) => (
        <StatusBadge status={row.status} variant={row.status === 'completed' ? 'success' : 'info'} />
      ),
    },
    {
      accessor: 'steps',
      header: 'Steps Completed',
      render: (_value: any, row: RemediationPlan) => `${getStepsCompleted(row)}/${row.steps?.length ?? 0}`,
    },
    { accessor: 'assigned_to', header: 'Assigned To' },
    {
      accessor: 'due_date',
      header: 'Deadline',
      render: (_value: any, row: any) => formatDate(new Date(row.due_date)),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Remediation Plans" description="Track and execute remediation actions" />
        <Card className="rounded-xl">
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Remediation Plans" description="Track and execute remediation actions" />
      <ComplianceFlowNav />

      {error && (
        <Card className="rounded-xl">
          <div className="p-6 bg-red-50 text-red-700 rounded-xl">{error}</div>
        </Card>
      )}

      <Card className="rounded-xl">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold uppercase tracking-wide">Active Plans</h3>
            <Button onClick={() => setShowCreateModal(true)}>Create Plan</Button>
          </div>

          {plans.length === 0 ? (
            <div className="text-center text-gray-500 py-8">No remediation plans found</div>
          ) : (
            <DataTable
              columns={columns}
              data={plans}
              onRowClick={(row) => setSelectedPlan(row as RemediationPlan)}
            />
          )}
        </div>
      </Card>

      {selectedPlan && (
        <Modal
          isOpen={!!selectedPlan}
          onClose={() => setSelectedPlan(null)}
          title={selectedPlan.title}
        >
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="font-semibold">Progress</span>
                <span className="text-sm text-gray-600">
                  {getStepsCompleted(selectedPlan)}/{selectedPlan.steps?.length ?? 0}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{
                    width: (selectedPlan.steps?.length ?? 0) > 0
                      ? `${(getStepsCompleted(selectedPlan) / (selectedPlan.steps?.length ?? 1)) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3">Steps</h4>
              <div className="space-y-2">
                {selectedPlan.steps.map(step => (
                  <div key={step.id} className="p-3 border rounded flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={step.status === 'completed'}
                      onChange={() => handleStepComplete(selectedPlan.id, step.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-semibold">{step.title}</div>
                      {step.assignee && (
                        <div className="text-sm text-gray-600">
                          Assigned to: {step.assignee}
                        </div>
                      )}
                      {step.dueDate && (
                        <div className="text-sm text-gray-600">
                          Due: {formatDate(step.dueDate)}
                        </div>
                      )}
                      {step.notes && (
                        <div className="text-sm text-gray-600 mt-1">
                          Notes: {step.notes}
                        </div>
                      )}
                      <div className="mt-2">
                        <StatusBadge status={step.status} variant="info" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedPlan.status !== 'completed' && (
              <div className="pt-4 border-t">
                <Button
                  variant="success"
                  className="w-full"
                  onClick={() => setConfirmComplete(selectedPlan.id)}
                >
                  Mark Plan as Completed
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {showCreateModal && (
        <CreatePlanModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            fetchPlans();
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirmComplete}
        onConfirm={() => {
          if (confirmComplete) {
            setPlans(plans.map(p => p.id === confirmComplete ? { ...p, status: 'completed' } : p));
            showToast('Remediation plan marked as completed', 'success');
            setSelectedPlan(null);
          }
          setConfirmComplete(null);
        }}
        onCancel={() => setConfirmComplete(null)}
        title="Complete Remediation Plan"
        message="This will mark the remediation plan as completed. All outstanding steps will be considered resolved."
        confirmLabel="Complete Plan"
        variant="success"
      />
    </div>
  );
}

interface CreatePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function CreatePlanModal({ isOpen, onClose, onSuccess }: CreatePlanModalProps) {
  const [title, setTitle] = useState('');
  const [alertId, setAlertId] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim() || !alertId.trim() || !assignedTo.trim()) {
      showToast('All fields are required', 'error');
      setError('All fields are required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 800));
        showToast('Remediation plan created successfully', 'success');
        onSuccess();
        setTitle(''); setAlertId(''); setPriority('medium'); setAssignedTo('');
        setLoading(false);
        return;
      }
      // POST /compliance/remediate resolves an existing plan; the create
      // endpoint is /compliance/remediation-plans.
      await apiClient.post('/compliance/remediation-plans', {
        alert_id: alertId,
        title,
        priority,
        assigned_to: assignedTo,
      });
      showToast('Remediation plan created successfully', 'success');
      onSuccess();
      setTitle('');
      setAlertId('');
      setPriority('medium');
      setAssignedTo('');
    } catch (err) {
      const errorMsg = 'Failed to create remediation plan';
      showToast(errorMsg, 'error');
      setError(errorMsg);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Remediation Plan"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold mb-1">Plan Title</label>
          <input
            type="text"
            placeholder="Enter plan title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Alert ID</label>
          <input
            type="text"
            placeholder="Enter related alert ID"
            value={alertId}
            onChange={(e) => setAlertId(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            disabled={loading}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">Assigned To</label>
          <input
            type="text"
            placeholder="Enter assignee name"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            disabled={loading}
          />
        </div>
        <Button
          variant="success"
          className="w-full"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create Plan'}
        </Button>
      </div>
    </Modal>
  );
}
