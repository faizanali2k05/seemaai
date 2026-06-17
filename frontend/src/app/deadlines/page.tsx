'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  DataTable,
  Button,
  Modal,
  EmptyState,
  Tabs,
  StatusBadge,
  showToast,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { formatDate, isOverdue, daysUntilDeadline, statusBadgeColor } from '@/lib/utils/format';
import type { DeadlineItem } from '@/lib/types';
import { ChevronRight } from 'lucide-react';
import { isDemoMode, DEMO_DEADLINES } from '@/lib/demo-data';

interface DeadlineFiltered extends DeadlineItem {
  days_until?: number;
  is_overdue?: boolean;
  source_type?: string;
  [key: string]: any;
}

export default function DeadlinesPage() {
  useRequireAuth();
  const api = apiClient;

  const [deadlines, setDeadlines] = useState<DeadlineFiltered[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [showAddDeadlineModal, setShowAddDeadlineModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    description: '',
    type: 'training',
    dueDate: '',
    priority: 'medium',
    assignedTo: '',
    notes: '',
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    } else {
      const selectedDate = new Date(formData.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        newErrors.dueDate = 'Due date must be in the future';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddDeadline = async () => {
    if (!validateForm()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    try {
      setSubmitting(true);

      if (isDemoMode()) {
        // Add to local state in demo mode
        const newDeadline: DeadlineFiltered = {
          id: `DL-${deadlines.length + 1}`,
          title: formData.description,
          category: formData.type as any,
          source_type: formData.type,
          due_date: formData.dueDate,
          priority: formData.priority as any,
          status: 'pending',
          assigned_to: formData.assignedTo || 'Unassigned',
          days_until: daysUntilDeadline(formData.dueDate),
          is_overdue: isOverdue(formData.dueDate),
        };
        setDeadlines([...deadlines, newDeadline]);
        showToast('Deadline added successfully', 'success');

        // Reset form
        setFormData({
          description: '',
          type: 'training',
          dueDate: '',
          priority: 'medium',
          assignedTo: '',
          notes: '',
        });
        setErrors({});
        setShowAddDeadlineModal(false);
        return;
      }

      await api.post('/compliance/deadlines', {
        title: formData.description,
        category: formData.type,
        due_date: formData.dueDate,
        priority: formData.priority,
        assigned_to: formData.assignedTo,
      });

      showToast('Deadline added successfully', 'success');

      // Reset form
      setFormData({
        description: '',
        type: 'training',
        dueDate: '',
        priority: 'medium',
        assignedTo: '',
        notes: '',
      });
      setErrors({});

      // Refresh list
      fetchData();
      setShowAddDeadlineModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to add deadline';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (isDemoMode()) {
        const items = DEMO_DEADLINES;
        const enriched = items.map((deadline: any) => ({
          ...deadline,
          days_until: daysUntilDeadline(deadline.due_date),
          is_overdue: isOverdue(deadline.due_date),
        }));
        setDeadlines(enriched);
        setLoading(false);
        return;
      }

      const response = await api.get('/compliance/deadlines');
      const items = Array.isArray(response.data) ? response.data : [];
      const enriched = items.map((deadline: any) => ({
        ...deadline,
        // Backend returns `category`; the table column reads `source_type`.
        source_type: deadline.source_type ?? deadline.category,
        days_until: daysUntilDeadline(deadline.due_date),
        is_overdue: isOverdue(deadline.due_date),
      }));
      setDeadlines(enriched);
    } catch (err) {
      console.error('Failed to load deadlines:', err);
      // Fall back to demo data on error only if in demo mode
      if (isDemoMode()) {
        const items = DEMO_DEADLINES;
        const enriched = items.map((deadline: any) => ({
          ...deadline,
          days_until: daysUntilDeadline(deadline.due_date),
          is_overdue: isOverdue(deadline.due_date),
        }));
        setDeadlines(enriched);
      }
      setError(err instanceof Error ? err.message : 'Failed to load deadlines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [api]);

  const getFilteredDeadlines = () => {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    switch (activeTab) {
      case 'overdue':
        return deadlines.filter((d) => d.is_overdue);
      case 'week':
        return deadlines.filter((d) => !d.is_overdue && d.days_until != null && d.days_until >= 0 && d.days_until <= 7);
      case 'upcoming':
        return deadlines.filter((d) => d.days_until != null && d.days_until > 7);
      default:
        return deadlines;
    }
  };

  const filteredDeadlines = getFilteredDeadlines();

  const columns = [
    { accessor: 'title', header: 'DESCRIPTION', sortable: true },
    { accessor: 'source_type', header: 'TYPE', sortable: true },
    { accessor: 'due_date', header: 'DUE DATE', sortable: true },
    { accessor: 'priority', header: 'PRIORITY', sortable: true },
    { accessor: 'assigned_to', header: 'ASSIGNED TO', sortable: true },
    { accessor: 'status', header: 'STATUS', sortable: true },
  ];

  const getRowClassName = (row: DeadlineFiltered) => {
    if (row.is_overdue) return 'bg-red-50 hover:bg-red-100';
    if (row.days_until != null && row.days_until <= 7) return 'bg-yellow-50 hover:bg-yellow-100';
    return '';
  };

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title="Compliance Deadlines"
          description="Firm-wide compliance dates: training renewals, policy reviews, AML refreshes, SRA filings, and supervision sessions. Matter-level deadlines stay in your PMS."
        />
        <div className="p-8 text-center text-gray-600">
          <p>Loading deadlines...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Deadlines"
        description="Track all compliance, legal, and training deadlines"
      />

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 flex gap-4">
        <Button onClick={() => setShowAddDeadlineModal(true)}>
          Add Deadline
        </Button>
        <Button
          variant={showCalendarView ? undefined : 'secondary'}
          onClick={() => setShowCalendarView(!showCalendarView)}
        >
          {showCalendarView ? 'List View' : 'Calendar View'}
        </Button>
      </div>

      {!showCalendarView && (
        <>
          <Tabs
            tabs={[
              { id: 'all', label: 'All', count: deadlines.length },
              {
                id: 'week',
                label: 'This Week',
                count: deadlines.filter((d) => d.days_until != null && d.days_until >= 0 && d.days_until <= 7).length,
              },
              {
                id: 'overdue',
                label: 'Overdue',
                count: deadlines.filter((d) => d.is_overdue).length,
              },
              {
                id: 'upcoming',
                label: 'Upcoming',
                count: deadlines.filter((d) => d.days_until != null && d.days_until > 7).length,
              },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

          <div className="mt-6">
            {filteredDeadlines.length > 0 ? (
              <DataTable
                columns={columns}
                data={filteredDeadlines.map((deadline) => ({
                  ...deadline,
                  category: (deadline.category || '').toUpperCase().replace(/_/g, ' '),
                  due_date: <span className="tabular-nums">{formatDate(deadline.due_date)}</span>,
                  priority: (
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${priorityColor(deadline.priority)}`}>
                      {(deadline.priority || '').charAt(0).toUpperCase() + (deadline.priority || '').slice(1)}
                    </span>
                  ),
                  status: <StatusBadge status={deadline.status as any} />,
                }))}
                rowClassName={`${getRowClassName} group transition-colors hover:bg-opacity-100`}
              />
            ) : (
              <EmptyState
                title={activeTab === 'all' ? 'No deadlines' : `No ${activeTab} deadlines`}
                description="No deadlines match this filter"
                icon="calendar"
              />
            )}
          </div>
        </>
      )}

      {showCalendarView && (
        <div className="mt-6">
          <CalendarView deadlines={filteredDeadlines} />
        </div>
      )}

      {/* Add Deadline Modal */}
      <Modal
        isOpen={showAddDeadlineModal}
        onClose={() => {
          setShowAddDeadlineModal(false);
          setFormData({
            description: '',
            type: 'training',
            dueDate: '',
            priority: 'medium',
            assignedTo: '',
            notes: '',
          });
          setErrors({});
        }}
        title="Add New Deadline"
        actions={[
          { label: 'Cancel', onClick: () => {
            setShowAddDeadlineModal(false);
            setFormData({
              description: '',
              type: 'training',
              dueDate: '',
              priority: 'medium',
              assignedTo: '',
              notes: '',
            });
            setErrors({});
          }},
          { label: 'Add Deadline', onClick: handleAddDeadline, variant: 'primary', disabled: submitting || !formData.description.trim() || !formData.dueDate },
        ]}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.description ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Deadline description"
              value={formData.description}
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value });
                if (errors.description) setErrors({ ...errors, description: '' });
              }}
              disabled={submitting}
            />
            {errors.description && (
              <p className="text-red-500 text-xs mt-1">{errors.description}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              disabled={submitting}
            >
              <option value="training">Training</option>
              <option value="report">Report</option>
              <option value="review">Review</option>
              <option value="filing">Filing</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.dueDate ? 'border-red-500' : 'border-gray-300'
              }`}
              value={formData.dueDate}
              onChange={(e) => {
                setFormData({ ...formData, dueDate: e.target.value });
                if (errors.dueDate) setErrors({ ...errors, dueDate: '' });
              }}
              disabled={submitting}
            />
            {errors.dueDate && (
              <p className="text-red-500 text-xs mt-1">{errors.dueDate}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              disabled={submitting}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Staff member responsible (optional)"
              value={formData.assignedTo}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes (Optional)</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Additional details..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              disabled={submitting}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

function CalendarView({ deadlines }: { deadlines: DeadlineFiltered[] }) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{monthName}</h3>

      <div className="grid grid-cols-7 gap-2 mb-4 pb-4 border-b border-gray-200">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-gray-600 uppercase tracking-wide py-2">
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {emptyDays.map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {days.map((day) => {
          const date = new Date(currentYear, currentMonth, day);
          const dateStr = date.toISOString().split('T')[0];
          const dayDeadlines = deadlines.filter((d) => d.due_date.split('T')[0] === dateStr);

          return (
            <div
              key={day}
              className="aspect-square border border-gray-200 rounded-xl p-2 hover:bg-gray-50 transition-colors cursor-pointer group"
            >
              <p className="text-sm font-semibold text-gray-900 mb-1">{day}</p>
              <div className="space-y-1">
                {dayDeadlines.slice(0, 2).map((deadline) => (
                  <div
                    key={deadline.id}
                    className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800 truncate line-clamp-1 group-hover:bg-blue-200 transition-colors"
                    title={deadline.title}
                  >
                    {deadline.title}
                  </div>
                ))}
                {dayDeadlines.length > 2 && (
                  <div className="text-xs text-gray-600 px-1 font-semibold">
                    +{dayDeadlines.length - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
