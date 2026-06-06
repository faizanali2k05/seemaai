'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  DataTable,
  Tabs,
  Button,
  Modal,
  EmptyState,
  SearchBar,
  StatusBadge,
  ConfirmDialog,
  showToast,
  UserLimitWarning,
  UpgradeGate,
} from '@/components/ui';
import { useRequireAuth, useTierGate } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { formatDate, statusBadgeColor, formatRole } from '@/lib/utils/format';
import type { StaffMember, StaffTraining } from '@/lib/types';
import { Download, ChevronRight } from 'lucide-react';
import { isDemoMode, DEMO_STAFF, DEMO_TRAINING } from '@/lib/demo-data';
import CpdDashboard from './CpdDashboard';

interface FileReview {
  id: string;
  staff_id: string;
  staff_name: string;
  case_reference: string;
  reviewer_name: string;
  status: 'pending' | 'in_progress' | 'completed';
  due_date: string;
  score?: number;
}

export default function StaffPage() {
  const { user } = useRequireAuth();
  const { atUserLimit } = useTierGate();
  const api = apiClient;
  // CPD dashboard "Set firm target" / target-edit actions are admin-only.
  // Read role off the auth user; fall back to false in demo mode.
  const isAdmin = (user?.role || '').toLowerCase() === 'admin';

  const [activeTab, setActiveTab] = useState('directory');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [trainingList, setTrainingList] = useState<StaffTraining[]>([]);
  const [fileReviews, setFileReviews] = useState<FileReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [trainingFilter, setTrainingFilter] = useState('all');
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null);
  const [addStaffForm, setAddStaffForm] = useState({ name: '', email: '', role: 'solicitor', department: '' });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (isDemoMode()) {
          setStaffList(DEMO_STAFF as any);
          setTrainingList(DEMO_TRAINING as any);
          setFileReviews([]);
          setLoading(false);
          return;
        }

        const [staffRes, trainingRes, reviewsRes] = await Promise.allSettled([
          api.get('/compliance/staff'),
          api.get('/compliance/training'),
          api.get('/compliance/file-reviews'),
        ]);

        if (staffRes.status === 'fulfilled') {
          const data = staffRes.value.data;
          setStaffList(Array.isArray(data) ? data : []);
        }
        if (trainingRes.status === 'fulfilled') {
          const data = trainingRes.value.data;
          setTrainingList(Array.isArray(data) ? data : []);
        }
        if (reviewsRes.status === 'fulfilled') {
          const data = reviewsRes.value.data;
          setFileReviews(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        // Fall back to demo data on error
        if (isDemoMode()) {
          setStaffList(DEMO_STAFF as any);
          setTrainingList(DEMO_TRAINING as any);
          setFileReviews([]);
        }
        setError(err instanceof Error ? err.message : 'Failed to load staff data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [api]);

  const filteredStaff = staffList.filter(
    (s) =>
      (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredTraining = trainingList.filter((t) => {
    if (trainingFilter === 'all') return true;
    return t.status === trainingFilter;
  });

  const staffColumns = [
    { accessor: 'name', header: 'NAME', sortable: true },
    { accessor: 'role', header: 'ROLE', sortable: true },
    { accessor: 'department', header: 'DEPARTMENT', sortable: true },
    { accessor: 'email', header: 'EMAIL', sortable: false },
    { accessor: 'status', header: 'STATUS', sortable: true },
  ];

  const trainingColumns = [
    { accessor: 'staff_name', header: 'STAFF NAME', sortable: true },
    { accessor: 'training_type', header: 'TRAINING', sortable: true },
    { accessor: 'status', header: 'STATUS', sortable: true },
    { accessor: 'due_date', header: 'DUE DATE', sortable: true },
    { accessor: 'cpd_hours', header: 'CPD HOURS', sortable: false },
  ];

  const handleMarkTrainingComplete = async (trainingId: string) => {
    try {
      await api.post(`/compliance/training/${trainingId}/complete`);
      showToast('Training marked as complete', 'success');
      // Refresh training list
      const trainingRes = await api.get('/compliance/training');
      if (trainingRes.data) {
        const data = trainingRes.data;
        setTrainingList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to mark training complete';
      showToast(errorMsg, 'error');
    }
  };

  const handleDeactivateStaff = async (staffId: string) => {
    try {
      await api.post(`/compliance/staff/${staffId}/deactivate`);
      showToast('Staff member deactivated successfully', 'success');
      // Refresh staff list
      const staffRes = await api.get('/compliance/staff');
      if (staffRes.data) {
        const data = staffRes.data;
        setStaffList(Array.isArray(data) ? data : []);
      }
      setShowDetailModal(false);
      setSelectedStaff(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to deactivate staff member';
      showToast(errorMsg, 'error');
    }
    setConfirmDeactivate(null);
  };

  const handleAddStaff = async (name: string, email: string, role: string, department: string) => {
    if (!name.trim() || !email.trim()) {
      showToast('Name and email are required', 'error');
      return;
    }

    try {
      if (isDemoMode()) {
        // In demo mode, add to local state
        const newStaff: StaffMember = {
          id: `STF-${staffList.length + 1}`,
          name,
          email,
          role: (role as any) || 'solicitor',
          department: department || 'Administration',
          status: 'active',
          pqe: 0,
          sra_id: null,
          start_date: new Date().toISOString().split('T')[0],
          last_training: new Date().toISOString().split('T')[0],
          training_progress: 0,
        };
        setStaffList([...staffList, newStaff]);
        showToast('Staff member added successfully', 'success');
        setShowAddStaffModal(false);
        return;
      }

      await api.post('/compliance/staff', {
        name,
        email,
        role,
        department,
      });
      showToast('Staff member added successfully', 'success');
      const staffRes = await api.get('/compliance/staff');
      setStaffList(Array.isArray(staffRes.data) ? staffRes.data : []);
      setShowAddStaffModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to add staff member';
      showToast(errorMsg, 'error');
    }
  };

  const handleExportStaff = async () => {
    try {
      const response = await api.get('/admin/export/staff', {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Staff data exported successfully', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to export staff data';
      showToast(errorMsg, 'error');
    }
  };

  const reviewColumns = [
    { accessor: 'staff_name', header: 'STAFF', sortable: true },
    { accessor: 'case_id', header: 'CASE', sortable: true },
    { accessor: 'reviewer_name', header: 'REVIEWER', sortable: true },
    { accessor: 'status', header: 'STATUS', sortable: true },
    { accessor: 'due_date', header: 'DUE DATE', sortable: true },
    { accessor: 'score', header: 'SCORE', sortable: false },
  ];

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title="Staff & Training"
          description="Manage staff members, training requirements, and file reviews"
        />
        <div className="p-8 text-center text-gray-600">
          <p>Loading staff data...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Staff & Training"
        description="Manage staff members, training requirements, and file reviews"
      />

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <UserLimitWarning className="mb-4" />

      <div className="mb-6 flex gap-3">
        <Button
          onClick={() => setShowAddStaffModal(true)}
          disabled={atUserLimit}
          title={atUserLimit ? 'User limit reached — upgrade to Professional' : undefined}
        >
          Add Staff
        </Button>
        <Button variant="outline" onClick={handleExportStaff}>
          <Download className="mr-2 h-4 w-4" />
          Export Staff
        </Button>
      </div>

      <Tabs
        tabs={[
          { id: 'directory', label: 'Staff Directory', count: staffList.length },
          { id: 'training', label: 'Training Overview', count: trainingList.length },
          // Task #51 — CPD hours dashboard. The training overview lists raw
          // records; this tab aggregates them into the COLP view (hours by
          // category, gap-to-target, missing reflections per staff).
          { id: 'cpd', label: 'CPD Dashboard' },
          { id: 'reviews', label: 'File Reviews', count: fileReviews.length },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Staff Directory Tab */}
      {activeTab === 'directory' && (
        <div className="mt-6">
          <SearchBar
            placeholder="Search staff by name or email..."
            value={searchTerm}
            onChange={setSearchTerm}
          />
          <div className="mt-4">
            {filteredStaff.length > 0 ? (
              <DataTable
                columns={staffColumns}
                data={filteredStaff.map((s) => ({
                  ...s,
                  status: (
                    <StatusBadge status={s.status as any} />
                  ),
                }))}
                onRowClick={(row) => {
                  setSelectedStaff(row as StaffMember);
                  setShowDetailModal(true);
                }}
                rowClassName="group cursor-pointer transition-colors hover:bg-gray-50"
              />
            ) : (
              <EmptyState
                title="No staff found"
                description="Start by adding a staff member to your firm"
                icon="users"
              />
            )}
          </div>
        </div>
      )}

      {/* Training Overview Tab */}
      {activeTab === 'training' && (
        <div className="mt-6">
          <div className="mb-6 pb-4 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Filter by Status</p>
            <div className="flex gap-2">
              {['all', 'pending', 'in_progress', 'completed', 'overdue'].map((status) => (
                <button
                  key={status}
                  onClick={() => setTrainingFilter(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    trainingFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {(status || '').charAt(0).toUpperCase() + (status || '').slice(1)}
                </button>
              ))}
            </div>
          </div>
          {filteredTraining.length > 0 ? (
            <DataTable
              columns={trainingColumns}
              data={filteredTraining.map((t: any) => ({
                ...t,
                staff_name: t.staff_name || staffList.find((s) => s.id === t.staff_id)?.name || 'Unknown',
                training_type: (t.training_type || '').toUpperCase().replace(/_/g, ' '),
                status: t.status,
                due_date: formatDate(t.due_date),
                cpd_hours: <span className="font-mono tabular-nums">{t.cpd_hours ?? '-'}</span>,
              }))}
              rowClassName="group cursor-pointer transition-colors hover:bg-gray-50"
            />
          ) : (
            <EmptyState
              title="No training records"
              description="No staff training found for this filter"
              icon="award"
            />
          )}

          {/* Professional: Bulk Training Assignments */}
          <div className="mt-6">
            <UpgradeGate feature="bulk_training_assignments" inline>
              <Button variant="outline" onClick={() => showToast('Bulk assignment coming soon', 'info')}>
                Assign Training in Bulk
              </Button>
            </UpgradeGate>
          </div>
        </div>
      )}

      {/* CPD Dashboard Tab — Task #51 */}
      {activeTab === 'cpd' && (
        <CpdDashboard
          trainingList={trainingList}
          isAdmin={isAdmin}
          onRecordsChanged={async () => {
            // Re-fetch training so RecordEditor saves are reflected in the
            // parent's drill-in modal data on next open.
            try {
              const res = await api.get('/compliance/training');
              if (Array.isArray(res.data)) setTrainingList(res.data);
            } catch {
              // non-fatal — the dashboard refetches its own aggregate
            }
          }}
        />
      )}

      {/* File Reviews Tab */}
      {activeTab === 'reviews' && (
        <div className="mt-6">
          {fileReviews.length > 0 ? (
            <DataTable
              columns={reviewColumns}
              data={fileReviews.map((r: any) => ({
                ...r,
                staff_name: r.staff_name || 'Unknown',
                reviewer_name: r.reviewer_name || 'Unknown',
                due_date: formatDate(r.due_date),
                score: <span className="font-mono tabular-nums font-semibold">{r.score ? `${r.score}%` : '-'}</span>,
              }))}
              rowClassName="group cursor-pointer transition-colors hover:bg-gray-50"
            />
          ) : (
            <EmptyState
              title="No file reviews"
              description="No file reviews scheduled yet"
              icon="file-check"
            />
          )}
        </div>
      )}

      {/* Add Staff Modal */}
      <Modal
        isOpen={showAddStaffModal}
        onClose={() => {
          setShowAddStaffModal(false);
          setAddStaffForm({ name: '', email: '', role: 'solicitor', department: '' });
        }}
        title="Add New Staff Member"
        actions={[
          { label: 'Cancel', onClick: () => {
            setShowAddStaffModal(false);
            setAddStaffForm({ name: '', email: '', role: 'solicitor', department: '' });
          }},
          { label: 'Add Staff', onClick: () => {
            handleAddStaff(addStaffForm.name, addStaffForm.email, addStaffForm.role, addStaffForm.department);
          }, variant: 'primary' },
        ]}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Staff member name"
              value={addStaffForm.name}
              onChange={(e) => setAddStaffForm({ ...addStaffForm, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="staff@firm.com"
              value={addStaffForm.email}
              onChange={(e) => setAddStaffForm({ ...addStaffForm, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={addStaffForm.role}
              onChange={(e) => setAddStaffForm({ ...addStaffForm, role: e.target.value })}
            >
              <option value="solicitor">Solicitor</option>
              <option value="partner">Partner</option>
              <option value="colp">COLP</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Conveyancing"
              value={addStaffForm.department}
              onChange={(e) => setAddStaffForm({ ...addStaffForm, department: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* Staff Detail Modal */}
      {selectedStaff && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedStaff(null);
          }}
          title={selectedStaff.name}
          actions={[
            { label: 'Close', onClick: () => setShowDetailModal(false) },
          ]}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6 pb-6 border-b border-gray-200">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</p>
                <p className="font-medium text-gray-900">{selectedStaff.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Role</p>
                <p className="font-medium text-gray-900">{formatRole(selectedStaff.role)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Department</p>
                <p className="font-medium text-gray-900">{selectedStaff.department || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Status</p>
                <StatusBadge status={selectedStaff.status as any} />
              </div>
            </div>

            <div className="pb-6 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Start Date</p>
              <p className="font-medium text-gray-900">{formatDate(selectedStaff.start_date)}</p>
            </div>

            <div className="pb-6 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Training Progress</p>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition"
                    style={{ width: `${selectedStaff.training_progress || 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 tabular-nums w-12 text-right">{selectedStaff.training_progress || 0}%</span>
              </div>
            </div>

            {/* Training Records for this staff member */}
            <div className="pb-6 border-b border-gray-200">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-4">Assigned Training</h3>
              {trainingList.filter(t => t.staff_id === selectedStaff.id).length > 0 ? (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {trainingList
                    .filter(t => t.staff_id === selectedStaff.id)
                    .map(training => (
                      <div key={training.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors group">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-semibold text-sm text-gray-900 line-clamp-2">
                              {(training.training_type || '').toUpperCase().replace(/_/g, ' ')}
                            </p>
                            <p className="text-xs text-gray-600 mt-2">
                              Due: {formatDate(training.due_date)}
                            </p>
                            <div className="mt-2">
                              <StatusBadge status={training.status as any} />
                            </div>
                          </div>
                          {training.status !== 'completed' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleMarkTrainingComplete(training.id)}
                              className="ml-2 group-hover:opacity-100"
                            >
                              Mark Complete
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600">No training assigned</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => window.location.href = '/supervision'}
              >
                View Supervision Schedule
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setConfirmDeactivate(selectedStaff.id)}
              >
                Deactivate Staff Member
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!confirmDeactivate}
        onConfirm={() => {
          if (confirmDeactivate) {
            handleDeactivateStaff(confirmDeactivate);
          }
        }}
        onCancel={() => setConfirmDeactivate(null)}
        title="Deactivate Staff Member"
        message="This user will lose access to the system. This action can be reversed by reactivating the account."
        confirmLabel="Deactivate"
        variant="danger"
      />
    </>
  );
}
