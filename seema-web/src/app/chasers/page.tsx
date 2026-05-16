'use client';

import { useState, useEffect } from 'react';
import { PageHeader, DataTable, StatCard, StatusBadge, Card, Button, Modal, Tabs, EmptyState, showToast, ConfirmDialog } from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import apiClient from '@/lib/api';

interface ChaseRecord {
  id: string;
  chaser_type: 'training' | 'review' | 'cdd' | 'supervision';
  recipient_name: string;
  recipient_email: string;
  subject: string;
  body: string;
  sent_at: string;
  status: 'pending' | 'acknowledged' | 'escalated';
  acknowledged_at?: string;
  escalated: boolean;
  escalation_count: number;
}

interface DailyBriefingAction {
  timestamp: Date;
  action: string;
  count: number;
  details: string;
}

export default function ChasersPage() {
  useRequireAuth();

  const [activeTab, setActiveTab] = useState<'active' | 'escalated' | 'history'>('active');
  const [showManualChaseModal, setShowManualChaseModal] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState('');
  const [selectedType, setSelectedType] = useState<ChaseRecord['chaser_type']>('training');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedBody, setSelectedBody] = useState('');
  const [chasers, setChasers] = useState<ChaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingChase, setSendingChase] = useState(false);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [confirmEscalate, setConfirmEscalate] = useState<string | null>(null);
  const [bulkChaseLoading, setBulkChaseLoading] = useState(false);
  const [bulkReviewChaseLoading, setBulkReviewChaseLoading] = useState(false);

  // Fetch chasers data
  useEffect(() => {
    const fetchChasers = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.get('/compliance/chasers');
        setChasers(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chasers');
      } finally {
        setLoading(false);
      }
    };

    fetchChasers();
  }, []);

  // Calculate stats from actual data
  const pendingCount = chasers.filter(c => c.status === 'pending').length;
  const awaitingCount = chasers.filter(c => c.status === 'pending' && !c.escalated).length;
  const resolvedThisWeek = chasers.filter(c => {
    if (c.status !== 'acknowledged' || !c.acknowledged_at) return false;
    const ackDate = new Date(c.acknowledged_at);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return ackDate >= weekAgo;
  }).length;
  const escalatedCount = chasers.filter(c => c.escalated).length;

  const stats = [
    {
      label: 'Pending Chases',
      value: pendingCount.toString(),
      color: 'blue' as const,
    },
    {
      label: 'Awaiting Response',
      value: awaitingCount.toString(),
      color: 'amber' as const,
    },
    {
      label: 'Resolved This Week',
      value: resolvedThisWeek.toString(),
      color: 'green' as const,
    },
    {
      label: 'Escalated',
      value: escalatedCount.toString(),
      color: 'red' as const,
    },
  ];

  const dailyBriefing: DailyBriefingAction[] = [];

  const columns = [
    { accessor: 'chaser_type', header: 'Type', width: '12%' },
    { accessor: 'recipient_name', header: 'Recipient', width: '20%' },
    { accessor: 'subject', header: 'Subject', width: '28%' },
    { accessor: 'sent_at', header: 'Sent Date', width: '15%' },
    { accessor: 'status', header: 'Status', width: '12%' },
    { accessor: 'acknowledged_at', header: 'Acknowledged', width: '12%' },
    { accessor: 'escalated', header: 'Escalated', width: '11%' },
  ];

  const getFilteredChases = () => {
    if (activeTab === 'escalated') {
      return chasers.filter(c => c.escalated);
    }
    if (activeTab === 'history') {
      return chasers.filter(c => c.status === 'acknowledged' || c.escalated);
    }
    return chasers.filter(c => c.status === 'pending');
  };

  const filteredChases = getFilteredChases();

  const formatChaseData = (chases: ChaseRecord[]) =>
    chases.map(chase => ({
      ...chase,
      chaser_type: (chase.chaser_type || '').charAt(0).toUpperCase() + (chase.chaser_type || '').slice(1),
      sent_at: formatDate(new Date(chase.sent_at)),
      status: (
        <StatusBadge
          status={chase.status}
          label={(chase.status || '').charAt(0).toUpperCase() + (chase.status || '').slice(1)}
        />
      ),
      acknowledged_at: chase.acknowledged_at ? 'Yes' : 'No',
      escalated: chase.escalated ? 'Yes' : 'No',
    }));

  const handleSendChase = async () => {
    if (!selectedRecipient || !selectedRecipientEmail || !selectedType || !selectedSubject || !selectedBody) {
      showToast('Please fill in all required fields', 'error');
      setError('Please fill in all required fields');
      return;
    }

    try {
      setSendingChase(true);
      await apiClient.post('/compliance/chasers/send', {
        chaser_type: selectedType,
        recipient_email: selectedRecipientEmail,
        subject: selectedSubject,
        body: selectedBody,
      });

      showToast('Chase sent successfully', 'success');
      // Refresh the chasers list
      const response = await apiClient.get('/compliance/chasers');
      setChasers(Array.isArray(response.data) ? response.data : []);

      // Reset form
      setSelectedRecipient('');
      setSelectedRecipientEmail('');
      setSelectedType('training');
      setSelectedSubject('');
      setSelectedBody('');
      setShowManualChaseModal(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send chase';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    } finally {
      setSendingChase(false);
    }
  };

  const handleEscalate = async (chaserId: string) => {
    try {
      setEscalatingId(chaserId);
      await apiClient.post(`/compliance/chasers/${chaserId}/escalate`);

      showToast('Chase escalated successfully', 'success');
      // Refresh the chasers list
      const response = await apiClient.get('/compliance/chasers');
      setChasers(Array.isArray(response.data) ? response.data : []);
      setConfirmEscalate(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to escalate chaser';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    } finally {
      setEscalatingId(null);
    }
  };

  const handleResend = async (chaserId: string) => {
    try {
      setResendingId(chaserId);

      await apiClient.post(`/compliance/chasers/${chaserId}/resend`);

      showToast('Chase resent successfully', 'success');
      // Refresh the chasers list
      const response = await apiClient.get('/compliance/chasers');
      setChasers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to resend chaser';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    } finally {
      setResendingId(null);
    }
  };

  const handleAcknowledge = async (chaserId: string) => {
    try {
      await apiClient.post(`/compliance/chasers/${chaserId}/acknowledge`);
      showToast('Chase acknowledged successfully', 'success');
      const response = await apiClient.get('/compliance/chasers');
      setChasers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to acknowledge chaser';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    }
  };

  const handleBulkChaseTraining = async () => {
    try {
      setBulkChaseLoading(true);
      await apiClient.post('/compliance/briefing/chase-training');

      showToast('Chase notifications sent to all staff with overdue training', 'success');
      // Refresh the chasers list
      const response = await apiClient.get('/compliance/chasers');
      setChasers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send bulk chase';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    } finally {
      setBulkChaseLoading(false);
    }
  };

  const handleBulkChaseReview = async () => {
    try {
      setBulkReviewChaseLoading(true);
      await apiClient.post('/compliance/briefing/chase-review');

      showToast('Chase notifications sent to all staff with overdue reviews', 'success');
      // Refresh the chasers list
      const response = await apiClient.get('/compliance/chasers');
      setChasers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send review chase';
      showToast(errorMsg, 'error');
      setError(errorMsg);
    } finally {
      setBulkReviewChaseLoading(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-6 pb-12">
        <PageHeader
          title="Reminders & Follow-ups"
          description="Track compliance reminders, follow up on overdue training and reviews, manage escalations"
        />
        <Card>
          <div className="p-6 text-center">
            <p className="text-red-600 font-medium">Error: {error}</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Reminders & Follow-ups"
        description="Track compliance reminders, follow up on overdue training and reviews, manage escalations"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <StatCard key={idx} title={stat.label} value={stat.value} color={stat.color} />
        ))}
      </div>

      <Card className="rounded-xl">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold uppercase tracking-wide">Daily Briefing</h2>
        </div>
        <div className="p-6 space-y-4">
          {dailyBriefing.length > 0 ? (
            dailyBriefing.map((item, idx) => (
              <div key={idx} className="flex items-start gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{item.action}</div>
                  <div className="text-sm text-gray-600 mt-1">{item.details}</div>
                </div>
                <div className="text-sm text-gray-500">{formatDateTime(item.timestamp)}</div>
              </div>
            ))
          ) : (
            <div className="py-6 px-4">
              <p className="text-sm text-gray-700 mb-1 font-medium">No reminders sent in the last 7 days.</p>
              <p className="text-sm text-gray-500 mb-5">
                Reminders automatically follow up with staff about overdue training, file reviews, and policy acknowledgments. Two ways to start:
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="secondary"
                  onClick={() => window.location.href = '/compliance-scan'}
                  className="flex-1 justify-center"
                >
                  Run Compliance Scan
                </Button>
                <Button
                  onClick={() => setShowManualChaseModal(true)}
                  className="flex-1 justify-center"
                >
                  Send Manual Reminder
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="rounded-xl">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <Tabs
            tabs={[
              { id: 'active', label: 'Active' },
              { id: 'escalated', label: 'Escalated' },
              { id: 'history', label: 'History' },
            ]}
            activeTab={activeTab}
            onChange={(value) => setActiveTab(value as any)}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => handleBulkChaseReview()}
              disabled={loading || bulkReviewChaseLoading}
            >
              {bulkReviewChaseLoading ? 'Sending...' : 'Chase Overdue Reviews'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleBulkChaseTraining()}
              disabled={loading || bulkChaseLoading}
            >
              {bulkChaseLoading ? 'Sending...' : 'Chase Overdue Training'}
            </Button>
            <Button
              onClick={() => setShowManualChaseModal(true)}
              disabled={loading}
            >
              Send Manual Chase
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.location.href = '/staff'}
            >
              View Staff
            </Button>
          </div>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading chasers...</div>
          ) : filteredChases.length > 0 ? (
            <DataTable columns={columns} data={formatChaseData(filteredChases)} />
          ) : (
            <EmptyState
              title="No chasers"
              description={`No ${activeTab} chasers to display`}
            />
          )}
        </div>
      </Card>

      <Modal
        isOpen={showManualChaseModal}
        onClose={() => setShowManualChaseModal(false)}
        title="Send Manual Chase"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Name
            </label>
            <input
              type="text"
              value={selectedRecipient}
              onChange={(e) => setSelectedRecipient(e.target.value)}
              placeholder="Enter recipient name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Recipient Email
            </label>
            <input
              type="email"
              value={selectedRecipientEmail}
              onChange={(e) => setSelectedRecipientEmail(e.target.value)}
              placeholder="Enter recipient email"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chase Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="training">Training</option>
              <option value="review">Review</option>
              <option value="cdd">CDD</option>
              <option value="supervision">Supervision</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              placeholder="Enter chase subject"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message Body
            </label>
            <textarea
              value={selectedBody}
              onChange={(e) => setSelectedBody(e.target.value)}
              placeholder="Enter chase message"
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowManualChaseModal(false);
                setSelectedRecipient('');
                setSelectedRecipientEmail('');
                setSelectedType('training');
                setSelectedSubject('');
                setSelectedBody('');
              }}
              disabled={sendingChase}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendChase}
              disabled={sendingChase}
            >
              {sendingChase ? 'Sending...' : 'Send Chase'}
            </Button>
          </div>
        </div>
      </Modal>


      <ConfirmDialog
        isOpen={!!confirmEscalate}
        onConfirm={() => {
          if (confirmEscalate) {
            handleEscalate(confirmEscalate);
          }
        }}
        onCancel={() => setConfirmEscalate(null)}
        title="Escalate Chase"
        message="This will escalate the chase and notify relevant management staff."
        confirmLabel="Escalate"
        variant="warning"
      />
    </div>
  );
}
