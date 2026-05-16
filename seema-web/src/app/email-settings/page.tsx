'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import {
  PageHeader,
  Card,
  Button,
  Input,
  StatCard,
  StatusBadge,
  EmptyState,
  LoadingSpinner,
  showToast,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  Mail,
  Send,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  FileText,
  TrendingUp,
  Download,
  ChevronRight,
} from 'lucide-react';

interface EmailSettings {
  id: string;
  smtp_host: string | null;
  smtp_port: number | null;
  from_address: string | null;
  reply_to_address: string | null;
  auto_chaser_enabled: boolean;
  chaser_frequency_days: number | null;
}

interface EmailQueueEntry {
  id: string;
  to_email: string;
  subject: string;
  template: string | null;
  status: 'queued' | 'sent' | 'failed' | 'pending';
  scheduled_at: string | null;
  sent_at: string | null;
  retry_count: number;
}

interface EmailQueueStats {
  sent_7d: number;
  queued: number;
  failed: number;
  total_sent: number;
}

interface EmailTemplate {
  id: string;
  template_id: string;
  subject_pattern: string;
  description: string | null;
}

interface SmtpForm {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface AutoChaseForm {
  autoChaseTraining: boolean;
  autoChaseReviews: boolean;
  autoChaseCDD: boolean;
  chaseFrequency: number;
  escalateAfter: number;
}

export default function EmailSettingsPage() {
  useRequireAuth();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<EmailQueueStats | null>(null);
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [emailQueue, setEmailQueue] = useState<EmailQueueEntry[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  const [smtpForm, setSmtpForm] = useState<SmtpForm>({
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassword: '',
    fromEmail: '',
    fromName: '',
    enabled: true,
  });

  const [autoChaseForm, setAutoChaseForm] = useState<AutoChaseForm>({
    autoChaseTraining: true,
    autoChaseReviews: true,
    autoChaseCDD: true,
    chaseFrequency: 7,
    escalateAfter: 21,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [runningChase, setRunningChase] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        const [statsRes, settingsRes, queueRes, templatesRes] = await Promise.all([
          apiClient.get('/admin/email-queue/stats'),
          apiClient.get('/admin/email-settings'),
          apiClient.get('/admin/email-queue'),
          apiClient.get('/admin/email-templates'),
        ]);

        setStats(statsRes.data);
        setSettings(settingsRes.data);
        setEmailQueue(Array.isArray(queueRes.data) ? queueRes.data : []);
        setTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : []);

        // Populate SMTP form from settings
        if (settingsRes.data) {
          setSmtpForm({
            smtpHost: settingsRes.data.smtp_host || '',
            smtpPort: settingsRes.data.smtp_port || 587,
            smtpUser: '',
            smtpPassword: '',
            fromEmail: settingsRes.data.from_address || '',
            fromName: '',
            enabled: true,
          });
        }
      } catch (error) {
        console.error('Failed to load email settings:', error);
        showToast('Failed to load email settings', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const validateSmtpForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!smtpForm.fromEmail.trim()) {
      newErrors.fromEmail = 'From email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpForm.fromEmail)) {
      newErrors.fromEmail = 'Please enter a valid email address';
    }

    if (!smtpForm.fromName.trim()) {
      newErrors.fromName = 'From name is required';
    }

    if (smtpForm.smtpHost && !smtpForm.smtpPort) {
      newErrors.smtpPort = 'SMTP port is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveSmtp = async () => {
    if (!validateSmtpForm()) {
      return;
    }

    try {
      setSavingSmtp(true);
      await apiClient.post('/admin/email-settings', {
        smtp_host: smtpForm.smtpHost || null,
        smtp_port: smtpForm.smtpPort || null,
        from_address: smtpForm.fromEmail,
        reply_to_address: smtpForm.fromEmail,
        auto_chaser_enabled: autoChaseForm.autoChaseTraining || autoChaseForm.autoChaseReviews || autoChaseForm.autoChaseCDD,
        chaser_frequency_days: autoChaseForm.chaseFrequency,
      });
      showToast('SMTP settings saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save SMTP settings:', error);
      showToast('Failed to save SMTP settings', 'error');
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleSendTestEmail = async () => {
    try {
      setSendingTest(true);
      await apiClient.post('/admin/email/test', {
        recipient: smtpForm.fromEmail,
        subject: 'Test Email from Seema',
      });
      showToast(`Test email sent to ${smtpForm.fromEmail}`, 'success');
      // Refresh queue
      const queueRes = await apiClient.get('/admin/email-queue');
      setEmailQueue(Array.isArray(queueRes.data) ? queueRes.data : []);
    } catch (error) {
      console.error('Failed to send test email:', error);
      showToast('Failed to send test email', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const handleSendAllQueued = async () => {
    try {
      setSendingAll(true);
      await apiClient.post('/admin/email-queue/send-all');
      showToast('All queued emails sent successfully', 'success');
      // Refresh stats and queue
      const [statsRes, queueRes] = await Promise.all([
        apiClient.get('/admin/email-queue/stats'),
        apiClient.get('/admin/email-queue'),
      ]);
      setStats(statsRes.data);
      setEmailQueue(Array.isArray(queueRes.data) ? queueRes.data : []);
    } catch (error) {
      console.error('Failed to send all queued emails:', error);
      showToast('Failed to send all queued emails', 'error');
    } finally {
      setSendingAll(false);
    }
  };

  const handleSendIndividualEmail = async (emailId: string) => {
    try {
      await apiClient.post(`/admin/email-queue/${emailId}/send`);
      showToast('Email sent successfully', 'success');
      // Refresh stats and queue
      const [statsRes, queueRes] = await Promise.all([
        apiClient.get('/admin/email-queue/stats'),
        apiClient.get('/admin/email-queue'),
      ]);
      setStats(statsRes.data);
      setEmailQueue(Array.isArray(queueRes.data) ? queueRes.data : []);
    } catch (error) {
      console.error('Failed to send email:', error);
      showToast('Failed to send email', 'error');
    }
  };

  const handleRunAutoChase = async () => {
    try {
      setRunningChase(true);
      await apiClient.post('/admin/email/auto-chase', {
        training_ids: [],
        review_ids: [],
      });
      showToast('Auto-chase emails queued successfully', 'success');
      // Refresh stats and queue
      const [statsRes, queueRes] = await Promise.all([
        apiClient.get('/admin/email-queue/stats'),
        apiClient.get('/admin/email-queue'),
      ]);
      setStats(statsRes.data);
      setEmailQueue(Array.isArray(queueRes.data) ? queueRes.data : []);
    } catch (error) {
      console.error('Failed to run auto-chase:', error);
      showToast('Failed to run auto-chase', 'error');
    } finally {
      setRunningChase(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  const queuedCount = emailQueue.filter((e) => e.status === 'queued' || e.status === 'pending').length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Email Settings"
        description="Configure SMTP, manage email templates, and monitor delivery"
      />

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            title="Sent (7d)"
            value={stats.sent_7d}
            icon={<TrendingUp className="h-5 w-5" />}
            color="green"
          />
          <StatCard
            title="Queued"
            value={stats.queued}
            icon={<Clock className="h-5 w-5" />}
            color="amber"
          />
          <StatCard
            title="Failed"
            value={stats.failed}
            icon={<AlertCircle className="h-5 w-5" />}
            color="red"
          />
          <StatCard
            title="Total Sent"
            value={stats.total_sent}
            icon={<Mail className="h-5 w-5" />}
            color="blue"
          />
        </div>
      )}

      {/* SMTP Configuration */}
      <Card className="rounded-xl border-b border-gray-200 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 p-2 rounded-xl">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold uppercase tracking-wide">SMTP Configuration</h3>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SMTP Host
              </label>
              <Input
                type="text"
                value={smtpForm.smtpHost}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtpHost: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SMTP Port
              </label>
              <Input
                type="number"
                value={smtpForm.smtpPort}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtpPort: parseInt(e.target.value) })}
                placeholder="587"
              />
              {errors.smtpPort && <p className="text-red-500 text-xs mt-1">{errors.smtpPort}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SMTP User
              </label>
              <Input
                type="text"
                value={smtpForm.smtpUser}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtpUser: e.target.value })}
                placeholder="username@gmail.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SMTP Password
              </label>
              <Input
                type="password"
                value={smtpForm.smtpPassword}
                onChange={(e) => setSmtpForm({ ...smtpForm, smtpPassword: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Email <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                value={smtpForm.fromEmail}
                onChange={(e) => {
                  setSmtpForm({ ...smtpForm, fromEmail: e.target.value });
                  if (errors.fromEmail) setErrors({ ...errors, fromEmail: '' });
                }}
                placeholder="compliance@firm.com"
                className={errors.fromEmail ? 'border-red-500' : ''}
              />
              {errors.fromEmail && <p className="text-red-500 text-xs mt-1">{errors.fromEmail}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Name <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={smtpForm.fromName}
                onChange={(e) => {
                  setSmtpForm({ ...smtpForm, fromName: e.target.value });
                  if (errors.fromName) setErrors({ ...errors, fromName: '' });
                }}
                placeholder="Seema Compliance"
                className={errors.fromName ? 'border-red-500' : ''}
              />
              {errors.fromName && <p className="text-red-500 text-xs mt-1">{errors.fromName}</p>}
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              checked={smtpForm.enabled}
              onChange={(e) => setSmtpForm({ ...smtpForm, enabled: e.target.checked })}
              className="rounded"
              id="smtp-enabled"
            />
            <label htmlFor="smtp-enabled" className="text-sm font-medium text-gray-700">
              Enable email notifications
            </label>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleSaveSmtp}
              disabled={savingSmtp || !smtpForm.fromEmail.trim() || !smtpForm.fromName.trim()}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {savingSmtp ? 'Saving...' : 'Save Configuration'}
            </Button>
            <Button
              variant="outline"
              onClick={handleSendTestEmail}
              disabled={sendingTest || !smtpForm.fromEmail.trim()}
            >
              <Send className="mr-2 h-4 w-4" />
              {sendingTest ? 'Sending...' : 'Send Test Email'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Auto-Chase Rules */}
      <Card className="rounded-xl border-b border-gray-200 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-100 p-2 rounded-xl">
            <Zap className="h-5 w-5 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold uppercase tracking-wide">Auto-Chase Rules</h3>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Automatically send follow-up emails for incomplete tasks based on your configured rules and thresholds.
        </p>

        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors group">
            <div>
              <p className="font-medium text-gray-900 uppercase tracking-wide">Auto-chase Overdue Training</p>
              <p className="text-sm text-gray-600">Send reminders for incomplete training assignments</p>
            </div>
            <input
              type="checkbox"
              checked={autoChaseForm.autoChaseTraining}
              onChange={(e) => setAutoChaseForm({ ...autoChaseForm, autoChaseTraining: e.target.checked })}
              className="rounded"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors group">
            <div>
              <p className="font-medium text-gray-900 uppercase tracking-wide">Auto-chase Overdue File Reviews</p>
              <p className="text-sm text-gray-600">Send reminders for pending file review tasks</p>
            </div>
            <input
              type="checkbox"
              checked={autoChaseForm.autoChaseReviews}
              onChange={(e) => setAutoChaseForm({ ...autoChaseForm, autoChaseReviews: e.target.checked })}
              className="rounded"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors group">
            <div>
              <p className="font-medium text-gray-900 uppercase tracking-wide">Auto-chase Pending CDD</p>
              <p className="text-sm text-gray-600">Send reminders for incomplete CDD reviews</p>
            </div>
            <input
              type="checkbox"
              checked={autoChaseForm.autoChaseCDD}
              onChange={(e) => setAutoChaseForm({ ...autoChaseForm, autoChaseCDD: e.target.checked })}
              className="rounded"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chase Frequency (days)
            </label>
            <Input
              type="number"
              min="1"
              value={autoChaseForm.chaseFrequency}
              onChange={(e) => setAutoChaseForm({ ...autoChaseForm, chaseFrequency: parseInt(e.target.value) })}
            />
            <p className="text-xs text-gray-500 mt-1">Days between auto-chase emails</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Escalate After (days)
            </label>
            <Input
              type="number"
              min="1"
              value={autoChaseForm.escalateAfter}
              onChange={(e) => setAutoChaseForm({ ...autoChaseForm, escalateAfter: parseInt(e.target.value) })}
            />
            <p className="text-xs text-gray-500 mt-1">Days before escalating to COLP</p>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={handleRunAutoChase}
            disabled={runningChase}
            variant="outline"
          >
            <Zap className="mr-2 h-4 w-4" />
            {runningChase ? 'Running...' : 'Run Auto-Chase Now'}
          </Button>
          <Button variant="outline" disabled>
            <Clock className="mr-2 h-4 w-4" />
            Run Daily Schedule
          </Button>
          <Button variant="outline" disabled>
            <Download className="mr-2 h-4 w-4" />
            Download Weekly Summary PDF
          </Button>
        </div>
      </Card>

      {/* Email Templates */}
      {templates.length > 0 && (
        <Card className="overflow-hidden rounded-xl border-b border-gray-200 pb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-purple-100 p-2 rounded-xl">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold uppercase tracking-wide">Email Templates</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Template ID</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Subject Pattern</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Description</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <StatusBadge variant="info">{template.template_id}</StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{template.subject_pattern}</td>
                    <td className="py-3 px-4 text-gray-500">{template.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Email Queue */}
      <Card className="overflow-hidden rounded-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-xl">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold uppercase tracking-wide">Email Queue</h3>
          </div>
          {queuedCount > 0 && (
            <Button
              onClick={handleSendAllQueued}
              disabled={sendingAll}
              size="sm"
              className="group hover:bg-blue-600 transition-colors"
            >
              <Send className="mr-2 h-4 w-4" />
              {sendingAll ? 'Sending All...' : 'Send All Queued'}
            </Button>
          )}
        </div>

        {emailQueue.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">To</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Subject</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Template</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {emailQueue.map((email) => (
                  <tr key={email.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
                    <td className="py-3 px-4 text-gray-900">{email.to_email}</td>
                    <td className="py-3 px-4">
                      <span className="truncate max-w-xs block text-gray-600">{email.subject}</span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge variant="info">{email.template || 'N/A'}</StatusBadge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {email.status === 'sent' && <CheckCircle className="h-4 w-4 text-green-600" />}
                        {(email.status === 'queued' || email.status === 'pending') && <Clock className="h-4 w-4 text-amber-600" />}
                        {email.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-600" />}
                        <StatusBadge
                          variant={
                            email.status === 'sent'
                              ? 'success'
                              : email.status === 'queued' || email.status === 'pending'
                                ? 'warning'
                                : 'critical'
                          }
                        >
                          {(email.status || '').charAt(0).toUpperCase() + (email.status || '').slice(1)}
                        </StatusBadge>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {email.sent_at ? formatDate(email.sent_at) : email.scheduled_at ? formatDate(email.scheduled_at) : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {(email.status === 'queued' || email.status === 'pending') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendIndividualEmail(email.id)}
                          className="group hover:bg-gray-50 transition-colors"
                        >
                          Send
                          <ChevronRight className="ml-1 h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Mail}
            title="No queued emails"
            description="Email queue is empty"
          />
        )}
      </Card>
    </div>
  );
}
