'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  Button,
  StatusBadge,
  EmptyState,
  showToast,
  DataTable,
  LoadingSpinner,
} from '@/components/ui';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { formatDate } from '@/lib/utils/format';
import { isDemoMode, DEMO_STAFF_PORTAL } from '@/lib/demo-data';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  Mail,
  Loader,
  LogOut,
} from 'lucide-react';

interface StaffLoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  name?: string;
  role?: string;
  department?: string;
}

interface TrainingRecord {
  id: string;
  training_type?: string;
  title: string;
  status: 'completed' | 'pending' | 'overdue' | string;
  due_date?: string | null;
  completed_at?: string | null;
  cpd_hours?: number | null;
  assigned_at?: string;
  [key: string]: any;
}

interface Task {
  id: string;
  title: string;
  task_type?: string;
  status: string;
  due_date?: string | null;
  priority: 'high' | 'medium' | 'low' | string;
  assigned_at?: string;
  [key: string]: any;
}

interface Chase {
  id: string;
  entity_type?: string;
  chaser_type?: string;
  sent_at?: string;
  status: string;
  subject?: string;
  created_at?: string;
  last_sent?: string;
  [key: string]: any;
}

interface LoadingState {
  training: boolean;
  tasks: boolean;
  chasers: boolean;
}

interface ErrorState {
  training: string | null;
  tasks: string | null;
  chasers: string | null;
}

interface StaffMember {
  user_id: string;
  name: string;
  role?: string;
  department?: string;
  access_token: string;
}

export default function StaffPortalPage() {
  useRequireAuth();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [staffToken, setStaffToken] = useState<string | null>(null);

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dashboard state
  const [training, setTraining] = useState<TrainingRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [chasers, setChasers] = useState<Chase[]>([]);

  const [loading, setLoading] = useState<LoadingState>({
    training: false,
    tasks: false,
    chasers: false,
  });

  const [errors, setErrors] = useState<ErrorState>({
    training: null,
    tasks: null,
    chasers: null,
  });

  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  // Auto-login in demo mode
  useEffect(() => {
    if (isDemoMode() && !isLoggedIn) {
      const demoStaff = DEMO_STAFF_PORTAL.staff;
      setStaff({
        user_id: demoStaff.user_id,
        name: demoStaff.name,
        role: demoStaff.role,
        department: demoStaff.department,
        access_token: demoStaff.access_token,
      });
      setStaffToken(demoStaff.access_token);
      setIsLoggedIn(true);
      setTraining(DEMO_STAFF_PORTAL.training);
      setTasks(DEMO_STAFF_PORTAL.tasks);
      setChasers(DEMO_STAFF_PORTAL.chasers);
    }
  }, []);

  // Fetch dashboard data when logged in
  useEffect(() => {
    if (!isLoggedIn || !staffToken) {
      return;
    }
    if (isDemoMode()) return; // Already loaded demo data

    const fetchData = async () => {
      const staffApi = apiClient;
      // Create a custom axios instance with the staff token
      const headers = {
        Authorization: `Bearer ${staffToken}`,
      };

      const results = await Promise.allSettled([
        staffApi.get('/staff/my-training', { headers }),
        staffApi.get('/staff/my-tasks', { headers }),
        staffApi.get('/staff/my-chasers', { headers }),
      ]);

      const trainingResult = results[0];
      const tasksResult = results[1];
      const chasersResult = results[2];

      if (trainingResult.status === 'fulfilled') {
        setTraining(trainingResult.value.data || []);
        setErrors((prev) => ({ ...prev, training: null }));
      } else {
        setErrors((prev) => ({
          ...prev,
          training: 'Failed to load training records',
        }));
      }

      if (tasksResult.status === 'fulfilled') {
        setTasks(tasksResult.value.data || []);
        setErrors((prev) => ({ ...prev, tasks: null }));
      } else {
        setErrors((prev) => ({
          ...prev,
          tasks: 'Failed to load tasks',
        }));
      }

      if (chasersResult.status === 'fulfilled') {
        setChasers(chasersResult.value.data || []);
        setErrors((prev) => ({ ...prev, chasers: null }));
      } else {
        setErrors((prev) => ({
          ...prev,
          chasers: 'Failed to load chasers',
        }));
      }

      setLoading({
        training: false,
        tasks: false,
        chasers: false,
      });
    };

    setLoading({
      training: true,
      tasks: true,
      chasers: true,
    });

    fetchData();
  }, [isLoggedIn, staffToken]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    if (isDemoMode()) {
      const demoStaff = DEMO_STAFF_PORTAL.staff;
      setStaff({
        user_id: demoStaff.user_id,
        name: demoStaff.name,
        role: demoStaff.role,
        department: demoStaff.department,
        access_token: demoStaff.access_token,
      });
      setStaffToken(demoStaff.access_token);
      setIsLoggedIn(true);
      setTraining(DEMO_STAFF_PORTAL.training);
      setTasks(DEMO_STAFF_PORTAL.tasks);
      setChasers(DEMO_STAFF_PORTAL.chasers);
      showToast('Logged in successfully (Demo Mode)', 'success');
      setEmail('');
      setPassword('');
      setLoginLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password,
      });

      const data = response.data as StaffLoginResponse;

      const staffMember: StaffMember = {
        user_id: data.user_id,
        name: data.name || 'Staff Member',
        role: data.role,
        department: data.department,
        access_token: data.access_token,
      };

      setStaff(staffMember);
      setStaffToken(data.access_token);
      setIsLoggedIn(true);
      showToast('Logged in successfully', 'success');
      setEmail('');
      setPassword('');
    } catch (error) {
      const err = error as any;
      const message = err.response?.data?.detail || 'Login failed. Please check your credentials.';
      setLoginError(message);
      showToast(message, 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignOut = () => {
    setIsLoggedIn(false);
    setStaff(null);
    setStaffToken(null);
    setTraining([]);
    setTasks([]);
    setChasers([]);
    setEmail('');
    setPassword('');
    setLoginError(null);
    showToast('Signed out successfully', 'success');
  };

  const handleCompleteTraining = async (id: string) => {
    if (isDemoMode()) {
      setTraining(training.map(t => t.id === id ? { ...t, status: 'completed' as const, completed_at: new Date().toISOString() } : t));
      showToast('Training marked as complete', 'success');
      return;
    }
    if (!staffToken) return;
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const headers = { Authorization: `Bearer ${staffToken}` };
      await apiClient.post(
        `/staff/complete-training/${id}`,
        { certificate_ref: null, cpd_hours: null },
        { headers }
      );
      showToast('Training marked as complete', 'success');
      setTraining(
        training.map((t) =>
          t.id === id
            ? {
                ...t,
                status: 'completed' as const,
                completed_at: new Date().toISOString(),
              }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to complete training:', error);
      showToast('Failed to complete training', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleMarkTaskDone = async (id: string) => {
    if (isDemoMode()) {
      setTasks(tasks.map(t => t.id === id ? { ...t, status: 'completed' } : t));
      showToast('Task marked as done', 'success');
      return;
    }
    if (!staffToken) return;
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const headers = { Authorization: `Bearer ${staffToken}` };
      await apiClient.post(
        '/staff/log-action',
        {
          action_type: 'complete_task',
          entity_type: 'task',
          entity_id: id,
          details: 'Task completed',
        },
        { headers }
      );
      showToast('Task marked as done', 'success');
      setTasks(
        tasks.map((t) =>
          t.id === id
            ? { ...t, status: 'completed' }
            : t
        )
      );
    } catch (error) {
      console.error('Failed to complete task:', error);
      showToast('Failed to mark task as done', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleAcknowledgeChaser = async (id: string) => {
    if (isDemoMode()) {
      setChasers(chasers.map(c => c.id === id ? { ...c, status: 'acknowledged' } : c));
      showToast('Chaser acknowledged', 'success');
      return;
    }
    if (!staffToken) return;
    setActionLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const headers = { Authorization: `Bearer ${staffToken}` };
      await apiClient.post(
        `/staff/acknowledge-chaser/${id}`,
        { message: null },
        { headers }
      );
      showToast('Chaser acknowledged', 'success');
      setChasers(
        chasers.map((c) =>
          c.id === id ? { ...c, status: 'acknowledged' } : c
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge chaser:', error);
      showToast('Failed to acknowledge chaser', 'error');
    } finally {
      setActionLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'overdue':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const pendingTasks = tasks.filter((t) => t.status !== 'completed').length;
  const overdueTraining = training.filter((t) => t.status === 'overdue').length;
  const pendingChasers = chasers.filter((c) => c.status !== 'acknowledged').length;
  const completedTraining = training.filter((t) => t.status === 'completed').length;

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card className="p-8 rounded-xl">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Staff Portal</h1>
              <p className="text-gray-600">
                Sign in to access your compliance tasks and training
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                  {loginError}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                />
              </div>

              <Button
                type="submit"
                disabled={loginLoading}
                className="w-full"
              >
                {loginLoading ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex items-start justify-between">
        <div>
          <PageHeader
            title={`Welcome, ${staff?.name || 'Staff Member'}`}
            description="Your compliance dashboard and assigned tasks"
          />
          {staff?.role && (
            <div className="mt-2 text-sm text-gray-600">
              <p>
                {staff.role}
                {staff.department && ` • ${staff.department}`}
              </p>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="h-fit"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 rounded-xl">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide font-medium">My Tasks</p>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{pendingTasks}</p>
          <p className="text-xs text-gray-500 mt-2">Pending</p>
        </Card>
        <Card className="p-4 rounded-xl">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide font-medium">Overdue Training</p>
          <p className="text-3xl font-bold text-red-600 tabular-nums">{overdueTraining}</p>
          <p className="text-xs text-gray-500 mt-2">Needs attention</p>
        </Card>
        <Card className="p-4 rounded-xl">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide font-medium">Pending Reminders</p>
          <p className="text-3xl font-bold text-orange-600 tabular-nums">{pendingChasers}</p>
          <p className="text-xs text-gray-500 mt-2">Awaiting acknowledgment</p>
        </Card>
        <Card className="p-4 rounded-xl">
          <p className="text-xs text-gray-600 mb-1 uppercase tracking-wide font-medium">Training Completed</p>
          <p className="text-3xl font-bold text-green-600 tabular-nums">{completedTraining}</p>
          <p className="text-xs text-gray-500 mt-2">Finished</p>
        </Card>
      </div>

      {/* My Compliance Tasks Section */}
      <div>
        <h2 className="text-2xl font-bold mb-4">My Compliance Tasks</h2>
        <div className="space-y-3">
          {loading.tasks ? (
            <Card className="p-8 flex items-center justify-center rounded-xl">
              <Loader className="h-6 w-6 text-gray-400 animate-spin" />
              <span className="ml-2 text-gray-600">Loading tasks...</span>
            </Card>
          ) : errors.tasks ? (
            <Card className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800">{errors.tasks}</p>
            </Card>
          ) : tasks.length > 0 ? (
            <Card className="overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Task
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Priority
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-900">{task.title}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {task.due_date ? formatDate(task.due_date) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${getPriorityColor(task.priority)}`}>
                            {(task.priority || '').charAt(0).toUpperCase() + (task.priority || '').slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge
                            variant={
                              task.status === 'completed'
                                ? 'success'
                                : task.status === 'overdue'
                                  ? 'error'
                                  : 'info'
                            }
                          >
                            {(task.status || '').charAt(0).toUpperCase() + (task.status || '').slice(1)}
                          </StatusBadge>
                        </td>
                        <td className="px-6 py-4">
                          {task.status !== 'completed' && (
                            <Button
                              size="sm"
                              onClick={() => handleMarkTaskDone(task.id)}
                              disabled={actionLoading[task.id]}
                            >
                              {actionLoading[task.id] ? (
                                <>
                                  <Loader className="h-3 w-3 mr-1 animate-spin" />
                                  Marking...
                                </>
                              ) : (
                                'Mark Done'
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              title="No tasks assigned"
              description="Check back soon for new assignments"
            />
          )}
        </div>
      </div>

      {/* My Training Section */}
      <div>
        <h2 className="text-2xl font-bold mb-4">My Training</h2>
        <div className="space-y-3">
          {loading.training ? (
            <Card className="p-8 flex items-center justify-center rounded-xl">
              <Loader className="h-6 w-6 text-gray-400 animate-spin" />
              <span className="ml-2 text-gray-600">Loading training records...</span>
            </Card>
          ) : errors.training ? (
            <Card className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800">{errors.training}</p>
            </Card>
          ) : training.length > 0 ? (
            <Card className="overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Course
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Hours
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {training.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-900">{record.title}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {record.cpd_hours || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {record.due_date ? formatDate(record.due_date) : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge
                            variant={
                              record.status === 'completed'
                                ? 'success'
                                : record.status === 'overdue'
                                  ? 'error'
                                  : 'warning'
                            }
                          >
                            {(record.status || '').charAt(0).toUpperCase() + (record.status || '').slice(1)}
                          </StatusBadge>
                        </td>
                        <td className="px-6 py-4">
                          {record.status !== 'completed' && (
                            <Button
                              size="sm"
                              onClick={() => handleCompleteTraining(record.id)}
                              disabled={actionLoading[record.id]}
                            >
                              {actionLoading[record.id] ? (
                                <>
                                  <Loader className="h-3 w-3 mr-1 animate-spin" />
                                  Marking...
                                </>
                              ) : (
                                'Complete'
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              title="No training assigned"
              description="You're all caught up!"
            />
          )}
        </div>
      </div>

      {/* My Pending Reminders Section */}
      <div>
        <h2 className="text-2xl font-bold mb-4">My Pending Reminders</h2>
        <div className="space-y-3">
          {loading.chasers ? (
            <Card className="p-8 flex items-center justify-center rounded-xl">
              <Loader className="h-6 w-6 text-gray-400 animate-spin" />
              <span className="ml-2 text-gray-600">Loading reminders...</span>
            </Card>
          ) : errors.chasers ? (
            <Card className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800">{errors.chasers}</p>
            </Card>
          ) : chasers.length > 0 ? (
            <Card className="overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Subject
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Sent Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {chasers.map((chaser) => (
                      <tr key={chaser.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {chaser.entity_type}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs px-3 py-1 rounded-full font-medium bg-blue-100 text-blue-800">
                            {chaser.chaser_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {formatDate(chaser.sent_at)}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge
                            variant={
                              chaser.status === 'acknowledged' ? 'success' : 'warning'
                            }
                          >
                            {(chaser.status || '').charAt(0).toUpperCase() + (chaser.status || '').slice(1)}
                          </StatusBadge>
                        </td>
                        <td className="px-6 py-4">
                          {chaser.status !== 'acknowledged' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAcknowledgeChaser(chaser.id)}
                              disabled={actionLoading[chaser.id]}
                            >
                              {actionLoading[chaser.id] ? (
                                <>
                                  <Loader className="h-3 w-3 mr-1 animate-spin" />
                                  Acknowledging...
                                </>
                              ) : (
                                'Acknowledge'
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              title="No pending reminders"
              description="You're all caught up!"
            />
          )}
        </div>
      </div>
    </div>
  );
}
