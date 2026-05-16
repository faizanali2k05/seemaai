'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import apiClient from '@/lib/api';
import { isDemoMode, DEMO_USERS } from '@/lib/demo-data';
import {
  PageHeader,
  DataTable,
  Card,
  Button,
  Modal,
  Input,
  Select,
  StatusBadge,
  EmptyState,
  LoadingSpinner,
  showToast,
  ConfirmDialog,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import { User as UserIcon, Plus, Lock, Unlock, Trash2, ChevronRight } from 'lucide-react';

type UserRole = 'COLP' | 'Partner' | 'Admin' | 'Solicitor' | 'Staff';
type UserStatus = 'active' | 'locked' | 'disabled';

interface User {
  id: string;
  name?: string;
  email: string;
  role: UserRole | string;
  status?: UserStatus | string;
  lastLogin?: string | null;
  created?: string;
  // Backend (snake_case) shape — kept loose to match DEMO_USERS shape.
  full_name?: string;
  department?: string;
  is_active?: boolean;
  last_login_at?: string;
  created_at?: string;
  [key: string]: any;
}

export default function UserManagementPage() {
  const { user } = useRequireAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch users from API
  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      // Demo mode fallback
      if (isDemoMode()) {
        setUsers(DEMO_USERS);
        setLoading(false);
        return;
      }

      const response = await apiClient.get('/admin/users');
      const data = response.data || response;
      const mapped = (Array.isArray(data) ? data : []).map((u: any) => ({
        id: u.id,
        name: u.email?.split('@')[0] || u.email || 'Unknown',
        email: u.email,
        role: (u.role || 'staff').charAt(0).toUpperCase() + (u.role || 'staff').slice(1) as UserRole,
        status: u.is_active === false ? 'disabled' : 'active' as UserStatus,
        lastLogin: u.last_login || null,
        created: u.created_at || new Date().toISOString(),
      }));
      setUsers(mapped);
    } catch (err: any) {
      console.error(err);
      // Belt-and-suspenders: demo fallback in catch block
      if (isDemoMode()) {
        setUsers(DEMO_USERS);
      } else {
        setError(err?.message || 'Failed to load users');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'Staff' as UserRole, sendInvite: true });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmToggleLock, setConfirmToggleLock] = useState<{id: string, action: 'lock' | 'unlock'} | null>(null);
  const [addUserErrors, setAddUserErrors] = useState<Record<string, string>>({});
  const [editUserErrors, setEditUserErrors] = useState<Record<string, string>>({});

  const validateAddUser = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!newUser.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!newUser.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email)) {
      newErrors.email = 'Please enter a valid email address';
    } else if (users.some(u => u.email === newUser.email)) {
      newErrors.email = 'This email is already in use';
    }

    setAddUserErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAddUser = async () => {
    if (!validateAddUser()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    try {
      const tempPassword = `Seema${Date.now().toString(36)}!`;
      await apiClient.post('/admin/users', {
        email: newUser.email,
        password: tempPassword,
        role: newUser.role.toLowerCase(),
      });
      showToast('User added successfully', 'success');
      setNewUser({ name: '', email: '', role: 'Staff', sendInvite: true });
      setAddUserErrors({});
      setShowAddModal(false);
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to add user';
      showToast(msg, 'error');
    }
  };

  const validateEditUser = (): boolean => {
    if (!selectedUser) return false;

    const newErrors: Record<string, string> = {};

    if (!selectedUser.name?.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!selectedUser.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selectedUser.email)) {
      newErrors.email = 'Please enter a valid email address';
    } else if (users.some(u => u.id !== selectedUser.id && u.email === selectedUser.email)) {
      newErrors.email = 'This email is already in use';
    }

    setEditUserErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleEditUser = async () => {
    if (!validateEditUser()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    if (!selectedUser) return;
    try {
      await apiClient.put(`/admin/users/${selectedUser.id}`, {
        role: selectedUser.role.toLowerCase(),
        is_active: selectedUser.status === 'active',
      });
      showToast('User updated successfully', 'success');
      setShowEditModal(false);
      setSelectedUser(null);
      setEditUserErrors({});
      fetchUsers();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to update user';
      showToast(msg, 'error');
    }
  };

  const handleToggleLock = async (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const newActive = targetUser.status !== 'active';
    try {
      await apiClient.put(`/admin/users/${userId}`, { is_active: newActive });
      fetchUsers();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update user', 'error');
    }
    setConfirmToggleLock(null);
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      fetchUsers();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete user', 'error');
    }
    setConfirmDelete(null);
  };

  const columns = [
    { accessor: 'name', header: 'NAME' },
    { accessor: 'email', header: 'EMAIL' },
    {
      accessor: 'role',
      header: 'ROLE',
      render: (_value: any, row: User) => <StatusBadge variant="info">{row.role}</StatusBadge>,
    },
    {
      accessor: 'status',
      header: 'STATUS',
      render: (_value: any, row: User) => (
        <div className="flex items-center gap-2">
          <StatusBadge
            variant={
              row.status === 'active'
                ? 'success'
                : row.status === 'locked'
                  ? 'warning'
                  : 'critical'
            }
          >
            {(row.status || '').charAt(0).toUpperCase() + (row.status || '').slice(1)}
          </StatusBadge>
          {row.status === 'locked' && (
            <button
              onClick={() => setConfirmToggleLock({id: row.id, action: 'unlock'})}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              title="Unlock user"
            >
              <Unlock className="h-4 w-4 text-gray-500" />
            </button>
          )}
          {row.status === 'active' && (
            <button
              onClick={() => setConfirmToggleLock({id: row.id, action: 'lock'})}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              title="Lock user"
            >
              <Lock className="h-4 w-4 text-gray-500" />
            </button>
          )}
        </div>
      ),
    },
    {
      accessor: 'lastLogin',
      header: 'LAST LOGIN',
      render: (_value: any, row: User) => (
        <span className="text-gray-600">
          {row.lastLogin ? formatDate(row.lastLogin) : 'Never'}
        </span>
      ),
    },
    {
      accessor: 'created',
      header: 'CREATED',
      render: (_value: any, row: User) => <span className="text-gray-600">{formatDate(row.created)}</span>,
    },
    {
      accessor: 'actions',
      header: 'ACTIONS',
      sortable: false,
      render: (_value: any, row: User) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedUser(row);
              setShowEditModal(true);
            }}
            className="group hover:bg-gray-50 transition-colors"
          >
            Edit
            <ChevronRight className="ml-1 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
          </Button>
          <button
            onClick={() => setConfirmDelete(row.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete user"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-6">
        <PageHeader
          title="User Management"
          description="Manage firm staff, roles, and permissions"
        />
        <Button onClick={() => setShowAddModal(true)} className="group hover:bg-blue-600 transition-colors">
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}

      <Card className="rounded-xl">
        {loading ? (
          <LoadingSpinner />
        ) : users.length > 0 ? (
          <DataTable columns={columns} data={users} onRowClick={(row) => {
            setSelectedUser(row);
            setShowEditModal(true);
          }} />
        ) : (
          <EmptyState
            icon={UserIcon}
            title="No users found"
            description="Add your first team member to get started"
          />
        )}
      </Card>

      {showAddModal && (
        <Modal
          title="Add New User"
          isOpen={showAddModal}
          onClose={() => {
            setShowAddModal(false);
            setNewUser({ name: '', email: '', role: 'Staff', sendInvite: true });
            setAddUserErrors({});
          }}
        >
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={newUser.name}
                onChange={(e) => {
                  setNewUser({ ...newUser, name: e.target.value });
                  if (addUserErrors.name) setAddUserErrors({ ...addUserErrors, name: '' });
                }}
                placeholder="Full name"
                className={addUserErrors.name ? 'border-red-500' : ''}
              />
              {addUserErrors.name && (
                <p className="text-red-500 text-xs mt-1">{addUserErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <Input
                type="email"
                value={newUser.email}
                onChange={(e) => {
                  setNewUser({ ...newUser, email: e.target.value });
                  if (addUserErrors.email) setAddUserErrors({ ...addUserErrors, email: '' });
                }}
                placeholder="Email address"
                className={addUserErrors.email ? 'border-red-500' : ''}
              />
              {addUserErrors.email && (
                <p className="text-red-500 text-xs mt-1">{addUserErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <Select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                options={[
                  { value: 'COLP', label: 'COLP' },
                  { value: 'Partner', label: 'Partner' },
                  { value: 'Admin', label: 'Admin' },
                  { value: 'Solicitor', label: 'Solicitor' },
                  { value: 'Staff', label: 'Staff' },
                ]}
              />
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newUser.sendInvite}
                onChange={(e) => setNewUser({ ...newUser, sendInvite: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Send invite email</span>
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setNewUser({ name: '', email: '', role: 'Staff', sendInvite: true });
                setAddUserErrors({});
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddUser} disabled={!newUser.name.trim() || !newUser.email.trim()}>
              Add User
            </Button>
          </div>
        </Modal>
      )}

      {showEditModal && selectedUser && (
        <Modal
          title="Edit User"
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedUser(null);
            setEditUserErrors({});
          }}
        >
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={selectedUser.name}
                onChange={(e) => {
                  setSelectedUser({ ...selectedUser, name: e.target.value });
                  if (editUserErrors.name) setEditUserErrors({ ...editUserErrors, name: '' });
                }}
                className={editUserErrors.name ? 'border-red-500' : ''}
              />
              {editUserErrors.name && (
                <p className="text-red-500 text-xs mt-1">{editUserErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <Input type="email" value={selectedUser.email} disabled className="bg-gray-50" />
              {editUserErrors.email && (
                <p className="text-red-500 text-xs mt-1">{editUserErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <Select
                value={selectedUser.role}
                onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value as UserRole })}
                options={[
                  { value: 'COLP', label: 'COLP' },
                  { value: 'Partner', label: 'Partner' },
                  { value: 'Admin', label: 'Admin' },
                  { value: 'Solicitor', label: 'Solicitor' },
                  { value: 'Staff', label: 'Staff' },
                ]}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Status
              </label>
              <div className="space-y-2">
                <Button
                  variant={selectedUser.status === 'locked' ? 'primary' : 'outline'}
                  onClick={() => setSelectedUser({ ...selectedUser, status: 'locked' })}
                  className="w-full justify-start"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Lock Account
                </Button>
                <Button
                  variant={selectedUser.status === 'active' ? 'primary' : 'outline'}
                  onClick={() => setSelectedUser({ ...selectedUser, status: 'active' })}
                  className="w-full justify-start"
                >
                  <Unlock className="mr-2 h-4 w-4" />
                  Unlock Account
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditModal(false);
                setSelectedUser(null);
                setEditUserErrors({});
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={!selectedUser.name?.trim()}>
              Save Changes
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onConfirm={() => {
          if (confirmDelete) {
            handleDeleteUser(confirmDelete);
            showToast('User deleted successfully', 'success');
          }
        }}
        onCancel={() => setConfirmDelete(null)}
        title="Delete User"
        message="This will permanently remove the user account. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={!!confirmToggleLock}
        onConfirm={() => {
          if (confirmToggleLock) {
            handleToggleLock(confirmToggleLock.id);
            const action = confirmToggleLock.action === 'lock' ? 'locked' : 'unlocked';
            showToast(`User ${action} successfully`, 'success');
          }
        }}
        onCancel={() => setConfirmToggleLock(null)}
        title={confirmToggleLock?.action === 'lock' ? 'Lock User' : 'Unlock User'}
        message={confirmToggleLock?.action === 'lock'
          ? 'This will prevent the user from accessing the system.'
          : 'This will restore the user access to the system.'}
        confirmLabel={confirmToggleLock?.action === 'lock' ? 'Lock' : 'Unlock'}
        variant={confirmToggleLock?.action === 'lock' ? 'warning' : 'success'}
      />
    </div>
  );
}
