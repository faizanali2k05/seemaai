'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import {
  PageHeader,
  Card,
  Button,
  DataTable,
  showToast,
  LoadingSpinner,
  ConfirmDialog,
} from '@/components/ui';
import { Shield, Key, Monitor, LogOut, CheckCircle2, ChevronRight } from 'lucide-react';

interface Session {
  id: string;
  created_at: string | null;
  last_active: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export default function SecurityPage() {
  useRequireAuth();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  // Fetch active sessions
  useEffect(() => {
    const fetchSessions = async () => {
      setSessionsLoading(true);
      try {
        const response = await apiClient.get('/auth/sessions');
        setSessions(Array.isArray(response.data) ? response.data : Array.isArray(response) ? response : []);
      } catch (error) {
        console.error('Failed to load sessions:', error);
      } finally {
        setSessionsLoading(false);
      }
    };
    fetchSessions();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from current password');
      return;
    }

    setPasswordLoading(true);
    try {
      await apiClient.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password changed successfully', 'success');
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || 'Failed to change password';
      setPasswordError(msg);
      showToast(msg, 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.post(`/auth/sessions/${sessionId}/revoke`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showToast('Session revoked', 'success');
    } catch (error) {
      showToast('Failed to revoke session', 'error');
    }
    setRevokeTarget(null);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_e) {
      return dateStr;
    }
  };

  const sessionColumns = [
    {
      accessor: 'created_at',
      header: 'CREATED',
      render: (_v: any, row: Session) => formatDate(row.created_at),
    },
    {
      accessor: 'last_active',
      header: 'LAST ACTIVE',
      render: (_v: any, row: Session) => formatDate(row.last_active),
    },
    {
      accessor: 'ip_address',
      header: 'IP ADDRESS',
      render: (_v: any, row: Session) => row.ip_address || '—',
    },
    {
      accessor: 'user_agent',
      header: 'BROWSER',
      render: (_v: any, row: Session) => {
        const ua = row.user_agent || '';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Edge')) return 'Edge';
        return ua.slice(0, 30) || '—';
      },
    },
    {
      accessor: 'id',
      header: 'ACTIONS',
      render: (_v: any, row: Session) => (
        <Button
          variant="outline"
          onClick={() => setRevokeTarget(row.id)}
          className="text-red-600 hover:text-red-800 hover:bg-red-50 text-sm px-2 py-1 transition-colors group"
        >
          <LogOut className="h-3 w-3 mr-1" />
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Security Settings"
        description="Manage your password and active sessions"
      />

      {/* Password Change */}
      <Card className="rounded-xl border-b border-gray-200 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-100 p-2 rounded-xl">
            <Key className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold uppercase tracking-wide">Change Password</h3>
            <p className="text-sm text-gray-500">
              Update your account password. You will need to enter your current password.
            </p>
          </div>
        </div>

        {passwordSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-800">Password changed successfully</span>
          </div>
        )}

        {passwordError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter current password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Minimum 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Confirm new password"
            />
          </div>

          <Button type="submit" disabled={passwordLoading}>
            {passwordLoading ? 'Changing...' : 'Change Password'}
          </Button>
        </form>
      </Card>

      {/* Active Sessions */}
      <Card className="rounded-xl border-b border-gray-200 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-purple-100 p-2 rounded-xl">
            <Monitor className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold uppercase tracking-wide">Active Sessions</h3>
            <p className="text-sm text-gray-500">
              View and manage your active login sessions. Revoke any session you don't recognise.
            </p>
          </div>
        </div>

        {sessionsLoading ? (
          <LoadingSpinner />
        ) : sessions.length > 0 ? (
          <DataTable columns={sessionColumns} data={sessions} />
        ) : (
          <p className="text-sm text-gray-500">No active sessions found.</p>
        )}
      </Card>

      {/* Security Info */}
      <Card className="rounded-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-green-100 p-2 rounded-xl">
            <Shield className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold uppercase tracking-wide">Security Overview</h3>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
            <p className="font-medium mb-1 uppercase tracking-wide text-gray-900">Encryption</p>
            <p>All data is encrypted at rest (AES-256) and in transit (TLS 1.3).</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
            <p className="font-medium mb-1 uppercase tracking-wide text-gray-900">Password Security</p>
            <p>Passwords are hashed with bcrypt. Account locks after 5 failed attempts.</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
            <p className="font-medium mb-1 uppercase tracking-wide text-gray-900">Data Isolation</p>
            <p>Multi-tenant architecture with firm-level isolation on every database query.</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
            <p className="font-medium mb-1 uppercase tracking-wide text-gray-900">Audit Trail</p>
            <p>Every action is logged to an immutable audit trail for compliance review.</p>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        isOpen={!!revokeTarget}
        onConfirm={() => { if (revokeTarget) handleRevokeSession(revokeTarget); }}
        onCancel={() => setRevokeTarget(null)}
        title="Revoke Session"
        message="This will log out this session immediately. Are you sure?"
        confirmLabel="Revoke"
        variant="danger"
      />
    </div>
  );
}
