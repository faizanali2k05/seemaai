'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequireAuth } from '@/lib/hooks';
import { isDemoMode, DEMO_SETTINGS } from '@/lib/demo-data';
import {
  PageHeader,
  DataTable,
  Card,
  Button,
  Input,
  Select,
  Tabs,
  StatusBadge,
  EmptyState,
  showToast,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import apiClient from '@/lib/api';
import {
  Lock,
  LogOut,
  Shield,
  Download,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader,
  ChevronRight,
  Bell,
  BellOff,
  Clock,
  Globe,
  Zap,
  Calendar,
  Archive,
  LayoutDashboard,
  CreditCard,
  Plus,
  Trash2,
  Star,
} from 'lucide-react';

interface Session {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
}

interface BillingRecord {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  invoiceUrl?: string;
}

interface LoginLog {
  id: string;
  timestamp: string;
  ip: string;
  device: string;
  status: 'success' | 'failed';
}

interface SubscriptionInfo {
  planName: string;
  monthlyPrice: number;
  users: string;
  trainingRecords: string;
  storage: string;
  nextBillingDate?: string;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

export default function SettingsPage() {
  const { user } = useRequireAuth();
  const searchParams = useSearchParams();

  // SUBSCRIPTIONS TEMPORARILY DISABLED — 'billing' is no longer a selectable tab.
  // The type still includes it so the billing code below stays valid/restorable,
  // but it's filtered out of the allowlist so ?tab=billing falls back to 'firm'.
  const [activeTab, setActiveTab] = useState<'firm' | 'billing' | 'security' | 'notifications' | 'preferences' | 'integrations'>(
    () => {
      const tab = searchParams?.get('tab');
      if (tab && ['firm', 'security', 'notifications', 'preferences', 'integrations'].includes(tab)) {
        return tab as any;
      }
      return 'firm';
    }
  );

  // ── Notification preferences state ──
  const [notificationPrefs, setNotificationPrefs] = useState({
    // Email notifications
    complianceAlerts: true,
    deadlineReminders: true,
    breachNotifications: true,
    sraUpdates: true,
    syncCompletions: false,
    weeklyDigest: true,
    staffTrainingDue: true,
    undertakingsDue: true,
    complaintUpdates: true,
    // Delivery
    emailFrequency: 'realtime' as 'realtime' | 'daily' | 'weekly',
    // Quiet hours
    quietHoursEnabled: false,
    quietHoursStart: '20:00',
    quietHoursEnd: '08:00',
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);

  // ── Firm preferences state ──
  const [preferences, setPreferences] = useState({
    timezone: 'Europe/London',
    dateFormat: 'DD/MM/YYYY' as 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD',
    workingHoursStart: '09:00',
    workingHoursEnd: '17:30',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as string[],
    // Auto-chase
    autoChaseEnabled: true,
    autoChaseFrequencyDays: 7,
    autoChaseMaxAttempts: 3,
    autoChaseChannel: 'email' as 'email' | 'both',
    // Data retention
    auditRetentionYears: 6,
    documentRetentionYears: 6,
    closedMatterRetentionYears: 6,
    // Dashboard
    defaultDashboardView: 'overview' as 'overview' | 'compliance' | 'deadlines',
    showCompletedItems: false,
    itemsPerPage: 25,
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Clio integration state
  const [clioStatus, setClioStatus] = useState<any>(null);
  const [clioLoading, setClioLoading] = useState(false);
  const [clioSyncing, setClioSyncing] = useState(false);
  const [clioSyncHistory, setClioSyncHistory] = useState<any[]>([]);
  const [clioDisconnecting, setClioDisconnecting] = useState(false);

  // Firm settings state
  const [firmSettings, setFirmSettings] = useState({
    firmName: '',
    sraNumber: '',
    practiceAreas: [] as string[],
    firmSize: '',
    colp: '',
    cofa: '',
    mlro: '',
  });
  const [firmSettingsLoading, setFirmSettingsLoading] = useState(true);
  const [firmSettingsSaving, setFirmSettingsSaving] = useState(false);
  const [firmSettingsError, setFirmSettingsError] = useState<string | null>(null);
  const [firmSettingsMessage, setFirmSettingsMessage] = useState<string | null>(null);
  const [firmSettingsErrors, setFirmSettingsErrors] = useState<Record<string, string>>({});

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});

  // Billing state
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(true);
  const [showAddCard, setShowAddCard] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [removingCardId, setRemovingCardId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  // Card form state (used when Stripe Elements aren't available — demo/dev)
  const [cardForm, setCardForm] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: '',
  });

  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Login history state
  const [loginHistory, setLoginHistory] = useState<LoginLog[]>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(true);
  const [loginHistoryError, setLoginHistoryError] = useState<string | null>(null);

  // Load firm settings from backend API
  useEffect(() => {
    const loadFirmSettings = async () => {
      try {
        setFirmSettingsLoading(true);

        // Demo mode fallback
        if (isDemoMode()) {
          setFirmSettings({
            firmName: DEMO_SETTINGS.firm.firm_name,
            sraNumber: DEMO_SETTINGS.firm.sra_number,
            practiceAreas: [],
            firmSize: '',
            colp: DEMO_SETTINGS.firm.colp_id,
            cofa: DEMO_SETTINGS.firm.cofa_id,
            mlro: '',
          });
          setFirmSettingsLoading(false);
          return;
        }

        const response = await apiClient.get('/admin/firm-settings');
        const data = response.data?.data || response.data;
        setFirmSettings({
          firmName: data.firmName || '',
          sraNumber: data.sraNumber || '',
          practiceAreas: data.practiceAreas || [],
          firmSize: data.firmSize || '',
          colp: data.colp || '',
          cofa: data.cofa || '',
          mlro: data.mlro || '',
        });
      } catch (err) {
        console.error(err);
        // Fallback to localStorage if API fails (e.g. during onboarding)
        const stored = localStorage.getItem('firmSettings');
        if (stored) {
          try {
            setFirmSettings(JSON.parse(stored));
          } catch (_e) {
            // Demo mode fallback
            if (isDemoMode()) {
              setFirmSettings({
                firmName: DEMO_SETTINGS.firm.firm_name,
                sraNumber: DEMO_SETTINGS.firm.sra_number,
                practiceAreas: [],
                firmSize: '',
                colp: DEMO_SETTINGS.firm.colp_id,
                cofa: DEMO_SETTINGS.firm.cofa_id,
                mlro: '',
              });
            }
          }
        } else if (isDemoMode()) {
          setFirmSettings({
            firmName: DEMO_SETTINGS.firm.firm_name,
            sraNumber: DEMO_SETTINGS.firm.sra_number,
            practiceAreas: [],
            firmSize: '',
            colp: DEMO_SETTINGS.firm.colp_id,
            cofa: DEMO_SETTINGS.firm.cofa_id,
            mlro: '',
          });
        }
        setFirmSettingsError('Failed to load firm settings from server');
      } finally {
        setFirmSettingsLoading(false);
      }
    };

    loadFirmSettings();
  }, []);

  // Load subscription info
  useEffect(() => {
    const loadSubscription = async () => {
      try {
        setBillingLoading(true);

        if (isDemoMode()) {
          setSubscription({
            planName: 'Professional',
            monthlyPrice: 700,
            users: '25 / Unlimited',
            trainingRecords: '142',
            storage: '12.4 GB / 50 GB',
            nextBillingDate: '2026-05-15',
          });
          setBillingLoading(false);
          return;
        }

        const response = await apiClient.get('/billing/subscription');
        const data = response.data?.data || response.data;
        setSubscription({
          planName: data.plan || data.planName || 'Essentials',
          monthlyPrice: data.monthlyPrice || data.monthly_price || 200,
          users: data.users || '—',
          trainingRecords: data.trainingRecords || data.training_records || '—',
          storage: data.storage || '—',
          nextBillingDate: data.nextBillingDate || data.next_billing_date,
        });
      } catch (err) {
        console.error(err);
        // Fallback to demo data if API unreachable
        if (isDemoMode()) {
          setSubscription({
            planName: 'Professional',
            monthlyPrice: 700,
            users: '25 / Unlimited',
            trainingRecords: '142',
            storage: '12.4 GB / 50 GB',
            nextBillingDate: '2026-05-15',
          });
        } else {
          setBillingError('Failed to load subscription information');
        }
      } finally {
        setBillingLoading(false);
      }
    };

    loadSubscription();
  }, []);

  // Load billing history
  useEffect(() => {
    const loadBillingHistory = async () => {
      try {
        if (isDemoMode()) {
          setBillingRecords([
            { id: 'inv_demo_1', date: '2026-04-15', description: 'Seema Professional Plan - April 2026', amount: 999, status: 'paid' as const },
            { id: 'inv_demo_2', date: '2026-03-15', description: 'Seema Professional Plan - March 2026', amount: 999, status: 'paid' as const },
            { id: 'inv_demo_3', date: '2026-02-15', description: 'Seema Professional Plan - February 2026', amount: 999, status: 'paid' as const },
          ]);
          return;
        }

        const response = await apiClient.get('/billing/history');
        setBillingRecords(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error('Failed to load billing history:', err);
        if (isDemoMode()) {
          setBillingRecords([
            { id: 'inv_demo_1', date: '2026-04-15', description: 'Seema Professional Plan - April 2026', amount: 999, status: 'paid' as const },
            { id: 'inv_demo_2', date: '2026-03-15', description: 'Seema Professional Plan - March 2026', amount: 999, status: 'paid' as const },
            { id: 'inv_demo_3', date: '2026-02-15', description: 'Seema Professional Plan - February 2026', amount: 999, status: 'paid' as const },
          ]);
        } else {
          setBillingRecords([]);
        }
      }
    };

    loadBillingHistory();
  }, []);

  // Load active sessions from backend
  useEffect(() => {
    const loadSessions = async () => {
      try {
        setSessionsLoading(true);

        if (isDemoMode()) {
          setSessions([
            { id: 'sess_1', device: 'Chrome on Windows', location: 'London, UK', lastActive: '2026-04-29T10:30:00Z', current: true },
            { id: 'sess_2', device: 'Safari on iPhone', location: 'London, UK', lastActive: '2026-04-28T18:15:00Z', current: false },
          ]);
          setSessionsLoading(false);
          return;
        }

        const response = await apiClient.get('/auth/sessions');
        const data = response.data?.data || response.data;
        setSessions(Array.isArray(data) ? data.map((s: any) => ({
          id: s.id,
          device: s.user_agent || 'Unknown device',
          location: s.ip_address || 'Unknown',
          lastActive: s.last_active || s.created_at || '',
          current: false,
        })) : []);
      } catch (err) {
        if (isDemoMode()) {
          setSessions([
            { id: 'sess_1', device: 'Chrome on Windows', location: 'London, UK', lastActive: '2026-04-29T10:30:00Z', current: true },
          ]);
        } else {
          setSessionsError('Failed to load sessions');
        }
        console.error(err);
      } finally {
        setSessionsLoading(false);
      }
    };

    loadSessions();
  }, []);

  // Load login history from audit trail
  useEffect(() => {
    const loadLoginHistory = async () => {
      try {
        setLoginHistoryLoading(true);

        if (isDemoMode()) {
          setLoginHistory([
            { id: 'log_1', timestamp: '2026-04-29T09:12:00Z', ip: '82.132.241.18', device: 'Chrome on Windows', status: 'success' as const },
            { id: 'log_2', timestamp: '2026-04-28T08:45:00Z', ip: '82.132.241.18', device: 'Chrome on Windows', status: 'success' as const },
            { id: 'log_3', timestamp: '2026-04-27T17:30:00Z', ip: '86.14.92.55', device: 'Safari on iPhone', status: 'success' as const },
            { id: 'log_4', timestamp: '2026-04-25T09:05:00Z', ip: '82.132.241.18', device: 'Chrome on Windows', status: 'success' as const },
          ]);
          setLoginHistoryLoading(false);
          return;
        }

        const response = await apiClient.get('/compliance/audit-trail', {
          params: { action: 'login', limit: 20 },
        });
        const data = response.data?.data || response.data;
        setLoginHistory(Array.isArray(data) ? data.map((entry: any) => ({
          id: entry.id,
          timestamp: entry.performed_at || entry.created_at || '',
          ip: entry.ip_address || 'Unknown',
          device: entry.details || 'Login',
          status: 'success' as const,
        })) : []);
      } catch (err) {
        console.error(err);
        if (isDemoMode()) {
          setLoginHistory([
            { id: 'log_1', timestamp: '2026-04-29T09:12:00Z', ip: '82.132.241.18', device: 'Chrome on Windows', status: 'success' as const },
          ]);
        } else {
          setLoginHistory([]);
        }
      } finally {
        setLoginHistoryLoading(false);
      }
    };

    loadLoginHistory();
  }, []);

  // Load payment methods
  useEffect(() => {
    const loadPaymentMethods = async () => {
      try {
        setPaymentMethodsLoading(true);
        if (isDemoMode()) {
          // Demo mode — show a sample card
          setPaymentMethods([
            {
              id: 'pm_demo_1',
              brand: 'visa',
              last4: '4242',
              exp_month: 12,
              exp_year: 2027,
              is_default: true,
            },
          ]);
          return;
        }
        const response = await apiClient.get('/billing/payment-methods');
        const data = response.data?.data || response.data;
        setPaymentMethods(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load payment methods:', err);
        setPaymentMethods([]);
      } finally {
        setPaymentMethodsLoading(false);
      }
    };
    loadPaymentMethods();
  }, []);

  const handleAddCard = async () => {
    setAddingCard(true);
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 1000));
        const brands = ['visa', 'mastercard', 'amex'];
        const newCard: PaymentMethod = {
          id: `pm_demo_${Date.now()}`,
          brand: brands[Math.floor(Math.random() * brands.length)],
          last4: cardForm.number.slice(-4) || String(Math.floor(1000 + Math.random() * 9000)),
          exp_month: parseInt(cardForm.expiry.split('/')[0]) || 12,
          exp_year: 2000 + (parseInt(cardForm.expiry.split('/')[1]) || 28),
          is_default: paymentMethods.length === 0,
        };
        setPaymentMethods((prev) => [...prev, newCard]);
        setShowAddCard(false);
        setCardForm({ number: '', expiry: '', cvc: '', name: '' });
        showToast('Card added successfully', 'success');
        return;
      }

      // Real Stripe flow: create SetupIntent, then use Stripe.js
      // For now, show an info message since Stripe Elements require @stripe/react-stripe-js
      const response = await apiClient.post('/billing/setup-intent');
      const { client_secret } = response.data?.data || response.data;

      // In production, you'd pass client_secret to Stripe's confirmCardSetup
      // then reload payment methods. For now we just reload.
      showToast('Card setup initiated. Complete in Stripe checkout.', 'info');

      // Reload payment methods after a delay
      setTimeout(async () => {
        try {
          const pmRes = await apiClient.get('/billing/payment-methods');
          const data = pmRes.data?.data || pmRes.data;
          setPaymentMethods(Array.isArray(data) ? data : []);
        } catch (_e) {}
      }, 2000);

      setShowAddCard(false);
      setCardForm({ number: '', expiry: '', cvc: '', name: '' });
    } catch (err) {
      showToast('Failed to add card', 'error');
      console.error(err);
    } finally {
      setAddingCard(false);
    }
  };

  const handleRemoveCard = async (pmId: string) => {
    setRemovingCardId(pmId);
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 500));
        setPaymentMethods((prev) => prev.filter((pm) => pm.id !== pmId));
        showToast('Card removed', 'success');
        return;
      }
      await apiClient.delete(`/billing/payment-methods/${pmId}`);
      setPaymentMethods((prev) => prev.filter((pm) => pm.id !== pmId));
      showToast('Card removed', 'success');
    } catch (err) {
      showToast('Failed to remove card', 'error');
      console.error(err);
    } finally {
      setRemovingCardId(null);
    }
  };

  const handleSetDefaultCard = async (pmId: string) => {
    setSettingDefaultId(pmId);
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 500));
        setPaymentMethods((prev) =>
          prev.map((pm) => ({ ...pm, is_default: pm.id === pmId }))
        );
        showToast('Default payment method updated', 'success');
        return;
      }
      await apiClient.post(`/billing/payment-methods/${pmId}/default`);
      setPaymentMethods((prev) =>
        prev.map((pm) => ({ ...pm, is_default: pm.id === pmId }))
      );
      showToast('Default payment method updated', 'success');
    } catch (err) {
      showToast('Failed to set default card', 'error');
      console.error(err);
    } finally {
      setSettingDefaultId(null);
    }
  };

  const getCardBrandIcon = (brand: string) => {
    const colors: Record<string, string> = {
      visa: 'text-blue-700',
      mastercard: 'text-orange-600',
      amex: 'text-blue-500',
      discover: 'text-orange-500',
    };
    return colors[brand?.toLowerCase()] || 'text-gray-600';
  };

  const formatCardBrand = (brand: string) => {
    const names: Record<string, string> = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay',
    };
    return names[brand?.toLowerCase()] || brand?.toUpperCase() || 'Card';
  };

  // Load notification preferences
  useEffect(() => {
    const loadNotifPrefs = async () => {
      try {
        setNotifLoading(true);
        if (isDemoMode()) {
          // Keep defaults for demo
          setNotifLoading(false);
          return;
        }
        const response = await apiClient.get('/admin/notification-preferences');
        const data = response.data?.data || response.data;
        if (data) {
          setNotificationPrefs((prev) => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to load notification preferences:', err);
      } finally {
        setNotifLoading(false);
      }
    };
    loadNotifPrefs();
  }, []);

  // Load firm preferences
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        setPrefsLoading(true);
        if (isDemoMode()) {
          setPrefsLoading(false);
          return;
        }
        const response = await apiClient.get('/admin/preferences');
        const data = response.data?.data || response.data;
        if (data) {
          setPreferences((prev) => ({ ...prev, ...data }));
        }
      } catch (err) {
        console.error('Failed to load preferences:', err);
      } finally {
        setPrefsLoading(false);
      }
    };
    loadPrefs();
  }, []);

  const handleSaveNotifications = async () => {
    try {
      setNotifSaving(true);
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 500));
        showToast('Notification preferences saved', 'success');
        setNotifSaving(false);
        return;
      }
      await apiClient.put('/admin/notification-preferences', notificationPrefs);
      showToast('Notification preferences saved', 'success');
    } catch (err) {
      showToast('Failed to save notification preferences', 'error');
      console.error(err);
    } finally {
      setNotifSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      setPrefsSaving(true);
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 500));
        showToast('Preferences saved successfully', 'success');
        setPrefsSaving(false);
        return;
      }
      await apiClient.put('/admin/preferences', preferences);
      showToast('Preferences saved successfully', 'success');
    } catch (err) {
      showToast('Failed to save preferences', 'error');
      console.error(err);
    } finally {
      setPrefsSaving(false);
    }
  };

  const validateFirmSettings = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!firmSettings.firmName.trim()) {
      newErrors.firmName = 'Firm name is required';
    }

    setFirmSettingsErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveFirmSettings = async () => {
    if (!validateFirmSettings()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    try {
      setFirmSettingsSaving(true);
      setFirmSettingsError(null);
      setFirmSettingsMessage(null);

      // Demo mode: just show success
      if (isDemoMode()) {
        showToast('Firm settings saved successfully', 'success');
        setFirmSettingsMessage('Firm settings saved successfully');
        setTimeout(() => {
          setFirmSettingsMessage(null);
        }, 3000);
        setFirmSettingsSaving(false);
        return;
      }

      await apiClient.put('/admin/firm-settings', firmSettings);
      showToast('Firm settings saved successfully', 'success');
      setFirmSettingsMessage('Firm settings saved successfully');

      setTimeout(() => {
        setFirmSettingsMessage(null);
      }, 3000);
    } catch (err) {
      showToast('Failed to save firm settings', 'error');
      setFirmSettingsError('Failed to save firm settings');
      console.error(err);
    } finally {
      setFirmSettingsSaving(false);
    }
  };

  const validatePassword = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!passwordForm.current) {
      newErrors.current = 'Current password is required';
    }

    if (!passwordForm.new) {
      newErrors.new = 'New password is required';
    } else if (passwordForm.new.length < 8) {
      newErrors.new = 'Password must be at least 8 characters long';
    } else if (!/[A-Z]/.test(passwordForm.new)) {
      newErrors.new = 'Password must contain at least one uppercase letter';
    } else if (!/[0-9]/.test(passwordForm.new)) {
      newErrors.new = 'Password must contain at least one number';
    }

    if (!passwordForm.confirm) {
      newErrors.confirm = 'Please confirm your new password';
    } else if (passwordForm.new !== passwordForm.confirm) {
      newErrors.confirm = 'Passwords do not match';
    }

    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChangePassword = async () => {
    if (!validatePassword()) {
      showToast('Please fix the errors in the form', 'error');
      return;
    }

    try {
      await apiClient.post('/auth/change-password', {
        current_password: passwordForm.current,
        new_password: passwordForm.new,
      });

      showToast('Password changed successfully', 'success');
      setPasswordChanged(true);
      setTimeout(() => {
        setPasswordChanged(false);
        setShowPasswordForm(false);
        setPasswordForm({ current: '', new: '', confirm: '' });
        setPasswordErrors({});
      }, 2000);
    } catch (err) {
      const errorMsg = 'Failed to change password. Please check your current password.';
      showToast(errorMsg, 'error');
      setPasswordError(errorMsg);
      console.error(err);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.post(`/auth/sessions/${sessionId}/revoke`);
      setSessions(sessions.filter(s => s.id !== sessionId));
      showToast('Session revoked successfully', 'success');
    } catch (err) {
      showToast('Failed to revoke session', 'error');
      console.error('Failed to revoke session:', err);
    }
  };

  const sessionColumns = [
    { accessor: 'device', header: 'DEVICE' },
    { accessor: 'location', header: 'LOCATION' },
    {
      accessor: 'lastActive',
      header: 'LAST ACTIVE',
      render: (_value: any, row: Session) => (
        <span className="text-gray-600">{formatDate(row.lastActive)}</span>
      ),
    },
    {
      accessor: 'status',
      header: 'STATUS',
      render: (_value: any, row: Session) =>
        row.current ? (
          <StatusBadge variant="success">Current</StatusBadge>
        ) : (
          <StatusBadge variant="info">Inactive</StatusBadge>
        ),
    },
    {
      accessor: 'actions',
      header: 'ACTIONS',
      render: (_value: any, row: Session) =>
        !row.current && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleRevokeSession(row.id)}
            className="group hover:bg-red-600 transition-colors"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Revoke
          </Button>
        ),
    },
  ];

  const billingColumns = [
    {
      accessor: 'date',
      header: 'DATE',
      render: (_value: any, row: BillingRecord) => (
        <span className="text-gray-600">{formatDate(row.date)}</span>
      ),
    },
    { accessor: 'description', header: 'DESCRIPTION' },
    {
      accessor: 'amount',
      header: 'AMOUNT',
      render: (_value: any, row: BillingRecord) => (
        <span className="font-medium tabular-nums">£{row.amount.toFixed(2)}</span>
      ),
    },
    {
      accessor: 'status',
      header: 'STATUS',
      render: (_value: any, row: BillingRecord) => (
        <StatusBadge
          variant={
            row.status === 'paid'
              ? 'success'
              : row.status === 'pending'
                ? 'warning'
                : 'critical'
          }
        >
          {(row.status || '').charAt(0).toUpperCase() + (row.status || '').slice(1)}
        </StatusBadge>
      ),
    },
    {
      accessor: 'invoice',
      header: 'INVOICE',
      render: (_value: any, row: BillingRecord) =>
        row.invoiceUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={row.invoiceUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
            </a>
          </Button>
        ),
    },
  ];

  const loginColumns = [
    {
      accessor: 'timestamp',
      header: 'TIME',
      render: (_value: any, row: LoginLog) => (
        <span className="text-gray-600">{formatDate(row.timestamp)}</span>
      ),
    },
    { accessor: 'device', header: 'DEVICE' },
    {
      accessor: 'ip',
      header: 'IP ADDRESS',
      render: (_value: any, row: LoginLog) => (
        <code className="text-sm font-mono">{row.ip}</code>
      ),
    },
    {
      accessor: 'status',
      header: 'STATUS',
      render: (_value: any, row: LoginLog) => (
        <div className="flex items-center gap-2">
          {row.status === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
          <StatusBadge
            variant={row.status === 'success' ? 'success' : 'critical'}
          >
            {(row.status || '').charAt(0).toUpperCase() + (row.status || '').slice(1)}
          </StatusBadge>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings"
        description="Manage firm profile and security settings"
      />

      <Tabs
        tabs={[
          { id: 'firm', label: 'Firm Profile' },
          // SUBSCRIPTIONS TEMPORARILY DISABLED — 'Billing' tab hidden from nav.
          // The billing tab panel below is kept (just unreachable) so it can be
          // re-enabled by restoring this entry.
          { id: 'security', label: 'Security' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'preferences', label: 'Preferences' },
          { id: 'integrations', label: 'Integrations' },
        ]}
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as typeof activeTab)}
      >
        {activeTab === 'firm' && (
          <div className="space-y-6">
            {firmSettingsError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-800">{firmSettingsError}</span>
              </div>
            )}

            {firmSettingsMessage && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-sm text-green-800">{firmSettingsMessage}</span>
              </div>
            )}

            {firmSettingsLoading ? (
              <Card className="rounded-xl flex items-center justify-center py-12">
                <div className="flex items-center gap-3">
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Loading firm settings...</span>
                </div>
              </Card>
            ) : (
              <>
                <Card className="rounded-xl border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold mb-6 uppercase tracking-wide text-gray-900">Firm Information</h3>

                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Firm Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={firmSettings.firmName}
                        onChange={(e) => {
                          setFirmSettings({
                            ...firmSettings,
                            firmName: e.target.value,
                          });
                          if (firmSettingsErrors.firmName) {
                            setFirmSettingsErrors({ ...firmSettingsErrors, firmName: '' });
                          }
                        }}
                        className={firmSettingsErrors.firmName ? 'border-red-500' : ''}
                      />
                      {firmSettingsErrors.firmName && (
                        <p className="text-red-500 text-xs mt-1">{firmSettingsErrors.firmName}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        SRA Number
                      </label>
                      <Input
                        value={firmSettings.sraNumber}
                        onChange={(e) =>
                          setFirmSettings({
                            ...firmSettings,
                            sraNumber: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Firm Size
                      </label>
                      <Select
                        value={firmSettings.firmSize}
                        onChange={(e) =>
                          setFirmSettings({
                            ...firmSettings,
                            firmSize: e.target.value,
                          })
                        }
                        options={[
                          { value: '1-10', label: '1-10 staff' },
                          { value: '11-25', label: '11-25 staff' },
                          { value: '26-50', label: '26-50 staff' },
                          { value: '50-100', label: '50-100 staff' },
                          { value: '100+', label: '100+ staff' },
                        ]}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Practice Areas (select all that apply)
                      </label>
                      <div className="space-y-2">
                        {[
                          'Corporate',
                          'Litigation',
                          'Property',
                          'Banking & Finance',
                          'Employment',
                        ].map((area) => (
                          <label key={area} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={firmSettings.practiceAreas.includes(area)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFirmSettings({
                                    ...firmSettings,
                                    practiceAreas: [
                                      ...firmSettings.practiceAreas,
                                      area,
                                    ],
                                  });
                                } else {
                                  setFirmSettings({
                                    ...firmSettings,
                                    practiceAreas: firmSettings.practiceAreas.filter(
                                      (a) => a !== area
                                    ),
                                  });
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-sm text-gray-700">{area}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-xl border-b border-gray-200 pb-6">
                  <h3 className="text-lg font-semibold mb-6 uppercase tracking-wide text-gray-900">Key Personnel</h3>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        COLP
                      </label>
                      <Input
                        value={firmSettings.colp}
                        onChange={(e) =>
                          setFirmSettings({ ...firmSettings, colp: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        COFA
                      </label>
                      <Input
                        value={firmSettings.cofa}
                        onChange={(e) =>
                          setFirmSettings({ ...firmSettings, cofa: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        MLRO
                      </label>
                      <Input
                        value={firmSettings.mlro}
                        onChange={(e) =>
                          setFirmSettings({ ...firmSettings, mlro: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleSaveFirmSettings}
                    disabled={firmSettingsSaving}
                  >
                    {firmSettingsSaving ? (
                      <>
                        <Loader className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Firm Profile'
                    )}
                  </Button>
                </Card>

                {/* SUBSCRIPTIONS TEMPORARILY DISABLED — the "Your Plan" /
                    upgrade card that previously sat here has been removed.
                    Restore it (and the Billing tab) when plans return. */}
              </>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="space-y-6">
            {billingError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-800">{billingError}</span>
              </div>
            )}

            {billingLoading ? (
              <Card className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3">
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Loading billing information...</span>
                </div>
              </Card>
            ) : subscription ? (
              <>
                <Card className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                  <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide text-gray-900">Current Plan</h3>
                  <div className="mb-6">
                    <p className="text-3xl font-bold text-blue-900">
                      {subscription.planName}
                    </p>
                    <p className="text-blue-700 mt-2 font-medium tabular-nums">
                      £{subscription.monthlyPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per month
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-white rounded-xl">
                    <div>
                      <p className="text-sm text-gray-600 uppercase tracking-wide">Users</p>
                      <p className="text-2xl font-semibold tabular-nums">{subscription.users}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 uppercase tracking-wide">Training Records</p>
                      <p className="text-2xl font-semibold tabular-nums">
                        {subscription.trainingRecords}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 uppercase tracking-wide">Storage</p>
                      <p className="text-2xl font-semibold tabular-nums">{subscription.storage}</p>
                    </div>
                  </div>

                  {subscription.nextBillingDate && (
                    <p className="text-sm text-blue-700 mb-4">
                      Next billing date: {formatDate(subscription.nextBillingDate)}
                    </p>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline">Downgrade Plan</Button>
                    <Button>Upgrade Plan</Button>
                  </div>
                </Card>

                {/* Payment Methods */}
                <Card className="rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold uppercase tracking-wide text-gray-900 flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Payment Methods
                    </h3>
                    {!showAddCard && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowAddCard(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Card
                      </Button>
                    )}
                  </div>

                  {paymentMethodsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="flex items-center gap-3">
                        <Loader className="h-5 w-5 animate-spin" />
                        <span className="text-sm text-gray-600">Loading payment methods...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {paymentMethods.map((pm) => (
                        <div
                          key={pm.id}
                          className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                            pm.is_default
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-white border border-gray-200 ${getCardBrandIcon(pm.brand)}`}>
                              <CreditCard className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900">
                                  {formatCardBrand(pm.brand)} ending in {pm.last4}
                                </p>
                                {pm.is_default && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    <Star className="h-3 w-3" />
                                    Default
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Expires {String(pm.exp_month).padStart(2, '0')}/{pm.exp_year}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!pm.is_default && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSetDefaultCard(pm.id)}
                                disabled={settingDefaultId === pm.id}
                              >
                                {settingDefaultId === pm.id ? (
                                  <Loader className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Set Default'
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRemoveCard(pm.id)}
                              disabled={removingCardId === pm.id}
                            >
                              {removingCardId === pm.id ? (
                                <Loader className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}

                      {paymentMethods.length === 0 && !showAddCard && (
                        <div className="text-center py-8 bg-gray-50 rounded-xl">
                          <CreditCard className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-sm font-medium text-gray-900">No payment methods</p>
                          <p className="text-xs text-gray-500 mt-1">Add a card to manage your subscription payments</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-4"
                            onClick={() => setShowAddCard(true)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Card
                          </Button>
                        </div>
                      )}

                      {/* Add Card Form */}
                      {showAddCard && (
                        <div className="border-2 border-dashed border-blue-300 rounded-xl p-6 bg-blue-50/50">
                          <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Add New Card
                          </h4>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Cardholder Name</label>
                              <Input
                                value={cardForm.name}
                                onChange={(e) => setCardForm((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="Name on card"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Card Number</label>
                              <Input
                                value={cardForm.number}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                                  const formatted = val.replace(/(\d{4})(?=\d)/g, '$1 ');
                                  setCardForm((prev) => ({ ...prev, number: formatted }));
                                }}
                                placeholder="4242 4242 4242 4242"
                                maxLength={19}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Expiry</label>
                                <Input
                                  value={cardForm.expiry}
                                  onChange={(e) => {
                                    let val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                    if (val.length >= 3) val = val.slice(0, 2) + '/' + val.slice(2);
                                    setCardForm((prev) => ({ ...prev, expiry: val }));
                                  }}
                                  placeholder="MM/YY"
                                  maxLength={5}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">CVC</label>
                                <Input
                                  value={cardForm.cvc}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                    setCardForm((prev) => ({ ...prev, cvc: val }));
                                  }}
                                  placeholder="123"
                                  maxLength={4}
                                />
                              </div>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <p className="text-xs text-amber-800">
                                <strong>Demo mode:</strong> Card details are not sent anywhere. In production, this form is replaced by Stripe&apos;s secure payment element — card data never touches Seema&apos;s servers.
                              </p>
                            </div>

                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setShowAddCard(false);
                                  setCardForm({ number: '', expiry: '', cvc: '', name: '' });
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={handleAddCard}
                                disabled={addingCard || !cardForm.number || !cardForm.expiry || !cardForm.cvc}
                              >
                                {addingCard ? (
                                  <>
                                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                                    Adding...
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="mr-2 h-4 w-4" />
                                    Add Card
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>

                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide text-gray-900">Billing History</h3>
                  {billingRecords.length > 0 ? (
                    <DataTable columns={billingColumns} data={billingRecords} />
                  ) : (
                    <EmptyState
                      title="No billing records"
                      description="Your billing history will appear here"
                    />
                  )}
                </Card>
              </>
            ) : (
              <Card>
                <EmptyState
                  title="No subscription information"
                  description="Unable to load billing information at this time"
                />
              </Card>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Password Change */}
            <Card className="rounded-xl border-b border-gray-200 pb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                <Lock className="h-5 w-5" />
                Change Password
              </h3>

              {passwordError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <span className="text-sm text-red-800">{passwordError}</span>
                </div>
              )}

              {!showPasswordForm ? (
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordForm(true)}
                >
                  Change Password
                </Button>
              ) : (
                <div className="space-y-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Password <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="password"
                      value={passwordForm.current}
                      onChange={(e) => {
                        setPasswordForm({
                          ...passwordForm,
                          current: e.target.value,
                        });
                        if (passwordErrors.current) {
                          setPasswordErrors({ ...passwordErrors, current: '' });
                        }
                      }}
                      placeholder="Enter current password"
                      className={passwordErrors.current ? 'border-red-500' : ''}
                    />
                    {passwordErrors.current && (
                      <p className="text-red-500 text-xs mt-1">{passwordErrors.current}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={passwordForm.new}
                        onChange={(e) => {
                          setPasswordForm({
                            ...passwordForm,
                            new: e.target.value,
                          });
                          if (passwordErrors.new) {
                            setPasswordErrors({ ...passwordErrors, new: '' });
                          }
                        }}
                        placeholder="Enter new password (8+ chars, uppercase, number)"
                        className={passwordErrors.new ? 'border-red-500' : ''}
                      />
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-gray-500" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-500" />
                        )}
                      </button>
                    </div>
                    {passwordErrors.new && (
                      <p className="text-red-500 text-xs mt-1">{passwordErrors.new}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="password"
                      value={passwordForm.confirm}
                      onChange={(e) => {
                        setPasswordForm({
                          ...passwordForm,
                          confirm: e.target.value,
                        });
                        if (passwordErrors.confirm) {
                          setPasswordErrors({ ...passwordErrors, confirm: '' });
                        }
                      }}
                      placeholder="Confirm new password"
                      className={passwordErrors.confirm ? 'border-red-500' : ''}
                    />
                    {passwordErrors.confirm && (
                      <p className="text-red-500 text-xs mt-1">{passwordErrors.confirm}</p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setPasswordForm({
                          current: '',
                          new: '',
                          confirm: '',
                        });
                        setPasswordErrors({});
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleChangePassword}
                      disabled={!passwordForm.current || !passwordForm.new || !passwordForm.confirm}
                    >
                      Change Password
                    </Button>
                  </div>
                </div>
              )}

              {passwordChanged && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-sm font-medium text-green-800">
                    Password changed successfully
                  </span>
                </div>
              )}
            </Card>

            {/* Active Sessions */}
            <Card className="rounded-xl border-b border-gray-200 pb-6">
              <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide text-gray-900">Active Sessions</h3>
              {sessionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <Loader className="h-5 w-5 animate-spin" />
                    <span>Loading sessions...</span>
                  </div>
                </div>
              ) : sessionsError ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{sessionsError}</p>
                </div>
              ) : sessions.length > 0 ? (
                <DataTable columns={sessionColumns} data={sessions} />
              ) : (
                <EmptyState
                  title="No active sessions"
                  description="No additional active sessions found"
                />
              )}
            </Card>

            {/* Two-Factor Authentication */}
            <Card className="rounded-xl border-yellow-200 bg-yellow-50 border-b border-gray-200 pb-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-yellow-900 mb-1 uppercase tracking-wide">
                    Two-Factor Authentication
                  </h4>
                  <p className="text-sm text-yellow-800 mb-3">
                    Enhance your account security with 2FA (coming soon)
                  </p>
                  <Button variant="outline" disabled>
                    Enable 2FA
                  </Button>
                </div>
              </div>
            </Card>

            {/* Login History */}
            <Card className="rounded-xl">
              <h3 className="text-lg font-semibold mb-4 uppercase tracking-wide text-gray-900">Login History</h3>
              {loginHistoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <Loader className="h-5 w-5 animate-spin" />
                    <span>Loading login history...</span>
                  </div>
                </div>
              ) : loginHistoryError ? (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{loginHistoryError}</p>
                </div>
              ) : loginHistory.length > 0 ? (
                <DataTable columns={loginColumns} data={loginHistory} />
              ) : (
                <EmptyState
                  title="No login history"
                  description="No login records available"
                />
              )}
            </Card>
          </div>
        )}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            {notifLoading ? (
              <Card className="rounded-xl flex items-center justify-center py-12">
                <div className="flex items-center gap-3">
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Loading notification preferences...</span>
                </div>
              </Card>
            ) : (
              <>
                {/* Email Alert Toggles */}
                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                    <Bell className="h-5 w-5" />
                    Email Notifications
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">Choose which events trigger an email notification to your team.</p>

                  <div className="space-y-4">
                    {[
                      { key: 'complianceAlerts', label: 'Compliance Alerts', desc: 'SRA compliance issues and audit findings' },
                      { key: 'deadlineReminders', label: 'Deadline Reminders', desc: 'Upcoming matter deadlines and limitation dates' },
                      { key: 'breachNotifications', label: 'Breach Notifications', desc: 'New breaches logged or escalated' },
                      { key: 'sraUpdates', label: 'SRA Regulatory Updates', desc: 'New rules, consultations, and guidance from the SRA' },
                      { key: 'staffTrainingDue', label: 'Training Due', desc: 'Staff CPD and training records approaching expiry' },
                      { key: 'undertakingsDue', label: 'Undertakings Due', desc: 'Outstanding undertakings nearing their deadline' },
                      { key: 'complaintUpdates', label: 'Complaint Updates', desc: 'Status changes on client complaints' },
                      { key: 'syncCompletions', label: 'Sync Completions', desc: 'Clio data sync results and errors' },
                      { key: 'weeklyDigest', label: 'Weekly Compliance Digest', desc: 'Summary email every Monday morning' },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{label}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                        </div>
                        <button
                          onClick={() =>
                            setNotificationPrefs((prev) => ({
                              ...prev,
                              [key]: !prev[key as keyof typeof prev],
                            }))
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            notificationPrefs[key as keyof typeof notificationPrefs]
                              ? 'bg-blue-600'
                              : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              notificationPrefs[key as keyof typeof notificationPrefs]
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Delivery Settings */}
                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                    <Clock className="h-5 w-5" />
                    Delivery Settings
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">Control when and how often notifications are delivered.</p>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email Frequency</label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: 'realtime', label: 'Real-time', desc: 'Instant emails' },
                          { value: 'daily', label: 'Daily Digest', desc: 'Once per day at 8am' },
                          { value: 'weekly', label: 'Weekly Digest', desc: 'Monday mornings' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() =>
                              setNotificationPrefs((prev) => ({
                                ...prev,
                                emailFrequency: opt.value as any,
                              }))
                            }
                            className={`p-4 rounded-xl border-2 text-left transition-all ${
                              notificationPrefs.emailFrequency === opt.value
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                            <p className="text-xs text-gray-500 mt-1">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quiet Hours */}
                    <div className="border-t border-gray-200 pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            <BellOff className="h-4 w-4" />
                            Quiet Hours
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">Suppress non-critical notifications during these hours</p>
                        </div>
                        <button
                          onClick={() =>
                            setNotificationPrefs((prev) => ({
                              ...prev,
                              quietHoursEnabled: !prev.quietHoursEnabled,
                            }))
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            notificationPrefs.quietHoursEnabled ? 'bg-blue-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              notificationPrefs.quietHoursEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {notificationPrefs.quietHoursEnabled && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                            <input
                              type="time"
                              value={notificationPrefs.quietHoursStart}
                              onChange={(e) =>
                                setNotificationPrefs((prev) => ({
                                  ...prev,
                                  quietHoursStart: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                            <input
                              type="time"
                              value={notificationPrefs.quietHoursEnd}
                              onChange={(e) =>
                                setNotificationPrefs((prev) => ({
                                  ...prev,
                                  quietHoursEnd: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>

                <Button onClick={handleSaveNotifications} disabled={notifSaving}>
                  {notifSaving ? (
                    <>
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Notification Preferences'
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {activeTab === 'preferences' && (
          <div className="space-y-6">
            {prefsLoading ? (
              <Card className="rounded-xl flex items-center justify-center py-12">
                <div className="flex items-center gap-3">
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Loading preferences...</span>
                </div>
              </Card>
            ) : (
              <>
                {/* Working Hours & Timezone */}
                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                    <Globe className="h-5 w-5" />
                    Working Hours & Timezone
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">These settings affect deadline calculations, automated reminders, and notification delivery.</p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
                      <Select
                        value={preferences.timezone}
                        onChange={(e) => setPreferences((prev) => ({ ...prev, timezone: e.target.value }))}
                        options={[
                          { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
                          { value: 'Europe/Dublin', label: 'Europe/Dublin (GMT/IST)' },
                          { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
                          { value: 'America/New_York', label: 'America/New York (EST/EDT)' },
                          { value: 'Asia/Dubai', label: 'Asia/Dubai (GST)' },
                          { value: 'Asia/Hong_Kong', label: 'Asia/Hong Kong (HKT)' },
                        ]}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Working Hours Start</label>
                        <input
                          type="time"
                          value={preferences.workingHoursStart}
                          onChange={(e) => setPreferences((prev) => ({ ...prev, workingHoursStart: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Working Hours End</label>
                        <input
                          type="time"
                          value={preferences.workingHoursEnd}
                          onChange={(e) => setPreferences((prev) => ({ ...prev, workingHoursEnd: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Working Days</label>
                      <div className="flex gap-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                          <button
                            key={day}
                            onClick={() => {
                              setPreferences((prev) => ({
                                ...prev,
                                workingDays: prev.workingDays.includes(day)
                                  ? prev.workingDays.filter((d) => d !== day)
                                  : [...prev.workingDays, day],
                              }));
                            }}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                              preferences.workingDays.includes(day)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date Format</label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '28/04/2026' },
                          { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '04/28/2026' },
                          { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-04-28' },
                        ].map((fmt) => (
                          <button
                            key={fmt.value}
                            onClick={() => setPreferences((prev) => ({ ...prev, dateFormat: fmt.value as any }))}
                            className={`p-3 rounded-xl border-2 text-left transition-all ${
                              preferences.dateFormat === fmt.value
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <p className="text-sm font-semibold text-gray-900">{fmt.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{fmt.example}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Auto-Chase Settings */}
                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                    <Zap className="h-5 w-5" />
                    Auto-Reminder Configuration
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">Automatically follow up on overdue undertakings, outstanding documents, and compliance items.</p>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Enable Auto-Reminders</p>
                        <p className="text-xs text-gray-500 mt-0.5">Seema will automatically send follow-up reminders</p>
                      </div>
                      <button
                        onClick={() => setPreferences((prev) => ({ ...prev, autoChaseEnabled: !prev.autoChaseEnabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          preferences.autoChaseEnabled ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            preferences.autoChaseEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {preferences.autoChaseEnabled && (
                      <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Chase Every (days)</label>
                          <Select
                            value={String(preferences.autoChaseFrequencyDays)}
                            onChange={(e) => setPreferences((prev) => ({ ...prev, autoChaseFrequencyDays: parseInt(e.target.value) }))}
                            options={[
                              { value: '3', label: 'Every 3 days' },
                              { value: '5', label: 'Every 5 days' },
                              { value: '7', label: 'Every 7 days' },
                              { value: '14', label: 'Every 14 days' },
                            ]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Max Attempts</label>
                          <Select
                            value={String(preferences.autoChaseMaxAttempts)}
                            onChange={(e) => setPreferences((prev) => ({ ...prev, autoChaseMaxAttempts: parseInt(e.target.value) }))}
                            options={[
                              { value: '2', label: '2 attempts' },
                              { value: '3', label: '3 attempts' },
                              { value: '5', label: '5 attempts' },
                              { value: '10', label: '10 attempts' },
                            ]}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Channel</label>
                          <Select
                            value={preferences.autoChaseChannel}
                            onChange={(e) => setPreferences((prev) => ({ ...prev, autoChaseChannel: e.target.value as any }))}
                            options={[
                              { value: 'email', label: 'Email only' },
                              { value: 'both', label: 'Email + in-app' },
                            ]}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Data Retention */}
                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                    <Archive className="h-5 w-5" />
                    Data Retention
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">
                    Configure how long records are kept. The SRA requires firms to retain files for a minimum of 6 years after matter closure.
                  </p>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Audit Trail Retention</label>
                      <Select
                        value={String(preferences.auditRetentionYears)}
                        onChange={(e) => setPreferences((prev) => ({ ...prev, auditRetentionYears: parseInt(e.target.value) }))}
                        options={[
                          { value: '3', label: '3 years' },
                          { value: '6', label: '6 years (SRA minimum)' },
                          { value: '10', label: '10 years' },
                          { value: '15', label: '15 years' },
                          { value: '0', label: 'Indefinite' },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Document Retention</label>
                      <Select
                        value={String(preferences.documentRetentionYears)}
                        onChange={(e) => setPreferences((prev) => ({ ...prev, documentRetentionYears: parseInt(e.target.value) }))}
                        options={[
                          { value: '6', label: '6 years (SRA minimum)' },
                          { value: '10', label: '10 years' },
                          { value: '15', label: '15 years' },
                          { value: '0', label: 'Indefinite' },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Closed Matter Retention</label>
                      <Select
                        value={String(preferences.closedMatterRetentionYears)}
                        onChange={(e) => setPreferences((prev) => ({ ...prev, closedMatterRetentionYears: parseInt(e.target.value) }))}
                        options={[
                          { value: '6', label: '6 years (SRA minimum)' },
                          { value: '10', label: '10 years' },
                          { value: '15', label: '15 years' },
                          { value: '25', label: '25 years (property)' },
                          { value: '0', label: 'Indefinite' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-xs text-amber-800">
                      <strong>Note:</strong> Under the SRA Standards and Regulations, firms must retain files for at least 6 years.
                      Property files should be retained for up to 25 years. Reducing below these thresholds may create compliance risk.
                    </p>
                  </div>
                </Card>

                {/* Dashboard Defaults */}
                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                    <LayoutDashboard className="h-5 w-5" />
                    Display Preferences
                  </h3>
                  <p className="text-sm text-gray-600 mb-6">Customise your default views and display options.</p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Default Dashboard View</label>
                      <Select
                        value={preferences.defaultDashboardView}
                        onChange={(e) => setPreferences((prev) => ({ ...prev, defaultDashboardView: e.target.value as any }))}
                        options={[
                          { value: 'overview', label: 'Overview — Key stats and recent activity' },
                          { value: 'compliance', label: 'Compliance — Audit score and open items' },
                          { value: 'deadlines', label: 'Deadlines — Upcoming dates and tasks' },
                        ]}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Items Per Page</label>
                        <Select
                          value={String(preferences.itemsPerPage)}
                          onChange={(e) => setPreferences((prev) => ({ ...prev, itemsPerPage: parseInt(e.target.value) }))}
                          options={[
                            { value: '10', label: '10 items' },
                            { value: '25', label: '25 items' },
                            { value: '50', label: '50 items' },
                            { value: '100', label: '100 items' },
                          ]}
                        />
                      </div>
                      <div className="flex items-end pb-1">
                        <div className="flex items-center justify-between w-full py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">Show Completed Items</p>
                            <p className="text-xs text-gray-500 mt-0.5">Display resolved items in lists by default</p>
                          </div>
                          <button
                            onClick={() => setPreferences((prev) => ({ ...prev, showCompletedItems: !prev.showCompletedItems }))}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              preferences.showCompletedItems ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                preferences.showCompletedItems ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Experimental features (Lab) toggle.
                    Persisted in localStorage rather than `preferences` because
                    it controls the rendered sidebar synchronously on next load
                    and isn't a per-firm preference — different users on the
                    same firm can each opt in independently. */}
                <Card className="rounded-xl">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 uppercase tracking-wide text-gray-900">
                    Experimental Features
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Surface features still in early Lab status: Key Dates Calculator, Client Accounts,
                    Evidence Locker, Staff Portal. These exist but aren&apos;t recommended for daily
                    use yet.
                  </p>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Show Lab features in the sidebar</p>
                      <p className="text-xs text-gray-500 mt-0.5">A page reload is required after toggling.</p>
                    </div>
                    <button
                      onClick={() => {
                        const next = typeof window !== 'undefined' &&
                          localStorage.getItem('seema_lab_features_enabled') !== 'true';
                        if (typeof window !== 'undefined') {
                          if (next) {
                            localStorage.setItem('seema_lab_features_enabled', 'true');
                          } else {
                            localStorage.removeItem('seema_lab_features_enabled');
                          }
                          showToast(
                            next ? 'Lab features enabled — reloading…' : 'Lab features hidden — reloading…',
                            'success',
                          );
                          setTimeout(() => window.location.reload(), 600);
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        typeof window !== 'undefined' && localStorage.getItem('seema_lab_features_enabled') === 'true'
                          ? 'bg-amber-500'
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          typeof window !== 'undefined' && localStorage.getItem('seema_lab_features_enabled') === 'true'
                            ? 'translate-x-6'
                            : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </Card>

                <Button onClick={handleSavePreferences} disabled={prefsSaving}>
                  {prefsSaving ? (
                    <>
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Preferences'
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {activeTab === 'integrations' && (
          <IntegrationsPanel
            clioStatus={clioStatus}
            setClioStatus={setClioStatus}
            clioLoading={clioLoading}
            setClioLoading={setClioLoading}
            clioSyncing={clioSyncing}
            setClioSyncing={setClioSyncing}
            clioSyncHistory={clioSyncHistory}
            setClioSyncHistory={setClioSyncHistory}
            clioDisconnecting={clioDisconnecting}
            setClioDisconnecting={setClioDisconnecting}
          />
        )}
      </Tabs>
    </div>
  );
}

// ── Integrations Panel Component ──

interface IntegrationsPanelProps {
  clioStatus: any;
  setClioStatus: (s: any) => void;
  clioLoading: boolean;
  setClioLoading: (b: boolean) => void;
  clioSyncing: boolean;
  setClioSyncing: (b: boolean) => void;
  clioSyncHistory: any[];
  setClioSyncHistory: React.Dispatch<React.SetStateAction<any[]>>;
  clioDisconnecting: boolean;
  setClioDisconnecting: (b: boolean) => void;
}

function IntegrationsPanel({
  clioStatus, setClioStatus,
  clioLoading, setClioLoading,
  clioSyncing, setClioSyncing,
  clioSyncHistory, setClioSyncHistory,
  clioDisconnecting, setClioDisconnecting,
}: IntegrationsPanelProps) {
  useEffect(() => {
    fetchClioStatus();
  }, []);

  const fetchClioStatus = async () => {
    setClioLoading(true);
    try {
      if (isDemoMode()) {
        // Demo mode: show connected state with sample data
        setClioStatus({
          connected: true,
          clio_firm_name: 'Harrison Morgan Solicitors',
          clio_user_name: 'Sarah Chen',
          status: 'connected',
          connected_at: '2026-03-15T10:00:00Z',
          last_sync: {
            sync_type: 'full',
            status: 'completed',
            records_synced: 247,
            started_at: '2026-04-27T09:00:00Z',
            completed_at: '2026-04-27T09:02:15Z',
            duration_seconds: 135,
          },
          sync_stats: {
            total_syncs: 12,
            total_records_synced: 1847,
            total_created: 1523,
            total_updated: 324,
          },
        });
        setClioSyncHistory([
          { id: '1', sync_type: 'full', status: 'completed', records_synced: 247, records_created: 12, records_updated: 235, started_at: '2026-04-27T09:00:00Z', completed_at: '2026-04-27T09:02:15Z', duration_seconds: 135 },
          { id: '2', sync_type: 'matters', status: 'completed', records_synced: 45, records_created: 3, records_updated: 42, started_at: '2026-04-26T09:00:00Z', completed_at: '2026-04-26T09:00:45Z', duration_seconds: 45 },
          { id: '3', sync_type: 'contacts', status: 'completed', records_synced: 128, records_created: 8, records_updated: 120, started_at: '2026-04-25T09:00:00Z', completed_at: '2026-04-25T09:01:30Z', duration_seconds: 90 },
          { id: '4', sync_type: 'full', status: 'completed', records_synced: 312, records_created: 45, records_updated: 267, started_at: '2026-04-20T09:00:00Z', completed_at: '2026-04-20T09:03:10Z', duration_seconds: 190 },
        ]);
        return;
      }

      const response = await apiClient.get('/integrations/clio/status');
      setClioStatus(response.data?.data || response.data);

      const historyResponse = await apiClient.get('/integrations/clio/sync-history');
      const histData = historyResponse.data?.data || historyResponse.data;
      setClioSyncHistory(Array.isArray(histData) ? histData : []);
    } catch (err) {
      console.error('Failed to fetch Clio status:', err);
      setClioStatus({ connected: false });
    } finally {
      setClioLoading(false);
    }
  };

  const handleConnect = async () => {
    if (isDemoMode()) {
      showToast('Clio connected successfully (demo)', 'success');
      setClioStatus({
        connected: true,
        clio_firm_name: 'Harrison Morgan Solicitors',
        clio_user_name: 'Sarah Chen',
        status: 'connected',
        connected_at: new Date().toISOString(),
        last_sync: null,
        sync_stats: { total_syncs: 0, total_records_synced: 0, total_created: 0, total_updated: 0 },
      });
      return;
    }

    try {
      const response = await apiClient.get('/integrations/clio/auth-url');
      const authUrl = response.data?.data?.auth_url || response.data?.auth_url;
      if (authUrl) {
        window.location.href = authUrl;
      } else {
        showToast('Failed to get Clio authorization URL', 'error');
      }
    } catch (err) {
      showToast('Failed to connect to Clio. Please check configuration.', 'error');
    }
  };

  const handleDisconnect = async () => {
    setClioDisconnecting(true);
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 500));
        setClioStatus({ connected: false });
        setClioSyncHistory([]);
        showToast('Disconnected from Clio', 'success');
        return;
      }

      await apiClient.delete('/integrations/clio/disconnect');
      setClioStatus({ connected: false });
      setClioSyncHistory([]);
      showToast('Disconnected from Clio', 'success');
    } catch (err) {
      showToast('Failed to disconnect from Clio', 'error');
    } finally {
      setClioDisconnecting(false);
    }
  };

  const handleSync = async (syncType: string = 'full') => {
    setClioSyncing(true);
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 2000));
        const newSync = {
          id: String(Date.now()),
          sync_type: syncType,
          status: 'completed',
          records_synced: Math.floor(Math.random() * 100) + 50,
          records_created: Math.floor(Math.random() * 20) + 5,
          records_updated: Math.floor(Math.random() * 80) + 30,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          duration_seconds: Math.floor(Math.random() * 120) + 30,
        };
        setClioSyncHistory(prev => [newSync, ...prev]);
        setClioStatus((prev: any) => ({
          ...prev,
          last_sync: newSync,
          sync_stats: {
            ...prev?.sync_stats,
            total_syncs: (prev?.sync_stats?.total_syncs || 0) + 1,
            total_records_synced: (prev?.sync_stats?.total_records_synced || 0) + newSync.records_synced,
          },
        }));
        showToast(`Sync complete: ${newSync.records_synced} records synced`, 'success');
        return;
      }

      const response = await apiClient.post('/integrations/clio/sync', { sync_type: syncType });
      const result = response.data?.data || response.data;
      if (result.success) {
        showToast(`Sync complete: ${result.records_synced} records synced`, 'success');
        await fetchClioStatus();
      } else {
        showToast(`Sync failed: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      showToast('Sync failed. Please try again.', 'error');
    } finally {
      setClioSyncing(false);
    }
  };

  if (clioLoading) {
    return (
      <div className="space-y-6">
        <Card className="rounded-xl">
          <div className="p-6 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Clio Integration Card */}
      <Card className="rounded-xl">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-blue-600" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Clio</h3>
                <p className="text-sm text-gray-600">Practice management integration</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {clioStatus?.connected ? (
                <>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Connected
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={clioDisconnecting}
                  >
                    {clioDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    Not Connected
                  </span>
                  <Button variant="primary" onClick={handleConnect}>
                    Connect Clio
                  </Button>
                </>
              )}
            </div>
          </div>

          {clioStatus?.connected && (
            <div className="space-y-6">
              {/* Connection Details */}
              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Clio Firm</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{clioStatus.clio_firm_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Connected By</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">{clioStatus.clio_user_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Connected Since</p>
                  <p className="text-sm font-semibold text-gray-900 mt-1">
                    {clioStatus.connected_at ? formatDate(new Date(clioStatus.connected_at)) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Sync Stats */}
              {clioStatus.sync_stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">Total Syncs</p>
                    <p className="text-2xl font-bold text-blue-900 mt-1 tabular-nums">{clioStatus.sync_stats.total_syncs}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-xs text-green-600 uppercase tracking-wide font-medium">Records Synced</p>
                    <p className="text-2xl font-bold text-green-900 mt-1 tabular-nums">{clioStatus.sync_stats.total_records_synced}</p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                    <p className="text-xs text-purple-600 uppercase tracking-wide font-medium">Created</p>
                    <p className="text-2xl font-bold text-purple-900 mt-1 tabular-nums">{clioStatus.sync_stats.total_created}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <p className="text-xs text-amber-600 uppercase tracking-wide font-medium">Updated</p>
                    <p className="text-2xl font-bold text-amber-900 mt-1 tabular-nums">{clioStatus.sync_stats.total_updated}</p>
                  </div>
                </div>
              )}

              {/* Sync Actions */}
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => handleSync('full')}
                  disabled={clioSyncing}
                >
                  {clioSyncing ? 'Syncing...' : 'Sync All Data'}
                </Button>
                <Button variant="secondary" onClick={() => handleSync('matters')} disabled={clioSyncing}>
                  Sync Matters
                </Button>
                <Button variant="secondary" onClick={() => handleSync('contacts')} disabled={clioSyncing}>
                  Sync Contacts
                </Button>
                <Button variant="secondary" onClick={() => handleSync('staff')} disabled={clioSyncing}>
                  Sync Staff
                </Button>
              </div>

              {/* Last Sync Info */}
              {clioStatus.last_sync && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-green-900">
                    Last sync: {clioStatus.last_sync.sync_type} — {clioStatus.last_sync.records_synced} records
                    {clioStatus.last_sync.duration_seconds && ` in ${Math.round(clioStatus.last_sync.duration_seconds)}s`}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    {clioStatus.last_sync.started_at ? formatDate(new Date(clioStatus.last_sync.started_at)) : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {!clioStatus?.connected && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
              <h4 className="font-semibold text-blue-900 mb-2">Connect your Clio account</h4>
              <p className="text-sm text-blue-800 mb-4">
                Sync matters, contacts, staff, activities, tasks, and billing data from Clio into Seema.
                Data is synced securely using OAuth2 and can be disconnected at any time.
              </p>
              <div className="text-sm text-blue-700 space-y-1">
                <p>• <strong>Matters</strong> — Cases, practice areas, and status</p>
                <p>• <strong>Contacts</strong> — Clients, companies, and contact details</p>
                <p>• <strong>Staff</strong> — Users, roles, and assignments</p>
                <p>• <strong>Activities</strong> — Time entries and billing records</p>
                <p>• <strong>Tasks</strong> — Deadlines and assignments</p>
                <p>• <strong>Billing</strong> — Invoices and payment status</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Sync History */}
      {clioStatus?.connected && clioSyncHistory.length > 0 && (
        <Card className="overflow-hidden rounded-xl">
          <div className="p-6">
            <h3 className="text-lg font-semibold uppercase tracking-wide mb-4">Sync History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-medium text-gray-600 uppercase text-xs tracking-wide">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 uppercase text-xs tracking-wide">Type</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600 uppercase text-xs tracking-wide">Status</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 uppercase text-xs tracking-wide">Records</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 uppercase text-xs tracking-wide">Created</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 uppercase text-xs tracking-wide">Updated</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600 uppercase text-xs tracking-wide">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {clioSyncHistory.map((sync) => (
                    <tr key={sync.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900">
                        {sync.started_at ? formatDate(new Date(sync.started_at)) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {sync.sync_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          sync.status === 'completed' ? 'bg-green-100 text-green-800' :
                          sync.status === 'failed' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            sync.status === 'completed' ? 'bg-green-500' :
                            sync.status === 'failed' ? 'bg-red-500' :
                            'bg-yellow-500'
                          }`}></span>
                          {sync.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-medium">{sync.records_synced}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-green-700">{sync.records_created}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-blue-700">{sync.records_updated}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-gray-600">
                        {sync.duration_seconds ? `${Math.round(sync.duration_seconds)}s` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* CSV Import Info */}
      <Card className="rounded-xl">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <Download className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">CSV Import</h3>
                <p className="text-sm text-gray-600">Import data via CSV files</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Available
            </span>
          </div>
          <div className="mt-4 bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-700">
              Import staff, cases, training records, and clients via CSV. Go to{' '}
              <a href="/data-management" className="text-blue-600 hover:text-blue-700 font-medium">
                Data Management
              </a>{' '}
              to upload files.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
