'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth, useClientMatterOptions } from '@/lib/hooks';
import { isDemoMode, DEMO_ACCOUNTS } from '@/lib/demo-data';
import apiClient from '@/lib/api';
import {
  PageHeader,
  DataTable,
  StatCard,
  StatusBadge,
  Card,
  Button,
  Modal,
  showToast,
  LoadingSpinner,
  EmptyState,
  Tabs,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  Plus,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface AccountStats {
  total_accounts: number;
  active_accounts: number;
  total_client_money: number;
  residual_balances: number;
  reconciliation_overdue: number;
}

interface ClientAccount {
  id: string;
  client_name: string;
  matter_ref: string;
  balance: number;
  status: 'active' | 'dormant' | 'closed';
  residual: boolean;
  last_reconciled: string | null;
  next_recon_due: string | null;
}

interface Transaction {
  id: string;
  account_id: string;
  transaction_type: 'receipt' | 'payment' | 'transfer_in' | 'transfer_out' | 'interest' | 'refund';
  amount: number;
  direction: 'in' | 'out';
  description: string;
  payer_payee: string;
  reference: string;
  payment_method: string;
  withdrawal_reason?: string;
  bill_reference?: string;
  created_at: string;
}

interface Reconciliation {
  id: string;
  client_ledger_total: number;
  bank_statement_total: number;
  difference: number;
  period_start: string;
  period_end: string;
  status: 'reconciled' | 'pending' | 'failed';
  created_at: string;
  cofa_signed_at?: string;
  cofa_signed_by?: string;
}

export default function AccountsPage() {
  useRequireAuth();
  const router = useRouter();

  // DB-driven combobox option lists (client names / matter refs)
  const { clientNames, matterReferences } = useClientMatterOptions();

  const [stats, setStats] = useState<AccountStats | null>(null);
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<ClientAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'accounts' | 'reconciliations'>('accounts');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showOpenAccountModal, setShowOpenAccountModal] = useState(false);
  const [showRecordTransactionModal, setShowRecordTransactionModal] = useState(false);
  const [showNewReconModal, setShowNewReconModal] = useState(false);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);

  // Form states
  const [openAccountForm, setOpenAccountForm] = useState({ client_name: '', matter_ref: '', fee_earner_id: '' });
  // Widen the literal types so the change handlers can set any allowed
  // value — keeping `as const` here would lock these to the initial
  // values, which is what was triggering "type X is not assignable to Y"
  // at the form's onChange sites.
  type TxnType = 'receipt' | 'payment' | 'transfer_in' | 'transfer_out' | 'interest' | 'refund';
  type TxnDirection = 'in' | 'out';
  const [transactionForm, setTransactionForm] = useState<{
    account_id: string;
    transaction_type: TxnType;
    amount: string;
    direction: TxnDirection;
    description: string;
    payer_payee: string;
    reference: string;
    payment_method: string;
    withdrawal_reason: string;
    bill_reference: string;
  }>({
    account_id: '',
    transaction_type: 'receipt',
    amount: '',
    direction: 'in',
    description: '',
    payer_payee: '',
    reference: '',
    payment_method: '',
    withdrawal_reason: '',
    bill_reference: '',
  });
  const [reconForm, setReconForm] = useState({
    client_ledger_total: '',
    bank_statement_total: '',
    period_start: '',
    period_end: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Demo mode fallback
      if (isDemoMode()) {
        setStats({
          total_accounts: 3,
          active_accounts: 3,
          total_client_money: DEMO_ACCOUNTS.client_account_balance,
          residual_balances: 5000,
          reconciliation_overdue: 1,
        });
        setAccounts([]);
        setReconciliations([]);
        setIsLoading(false);
        return;
      }

      const [statsRes, accountsRes, reconciliationsRes] = await Promise.all([
        apiClient.get('/compliance/accounts/stats'),
        apiClient.get('/compliance/accounts'),
        apiClient.get('/compliance/accounts/reconciliations'),
      ]);
      setStats(statsRes.data);
      setAccounts(Array.isArray(accountsRes.data) ? accountsRes.data : []);
      setReconciliations(Array.isArray(reconciliationsRes.data) ? reconciliationsRes.data : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load accounts data';
      setError(errorMessage);
      console.error('Error fetching accounts:', err);
      if (isDemoMode()) {
        setStats({
          total_accounts: 3,
          active_accounts: 3,
          total_client_money: DEMO_ACCOUNTS.client_account_balance,
          residual_balances: 5000,
          reconciliation_overdue: 1,
        });
        setAccounts([]);
        setReconciliations([]);
      }
      showToast(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = async (accountId: string) => {
    try {
      const response = await apiClient.get(`/compliance/accounts/${accountId}/transactions`);
      setTransactions(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      showToast('Failed to load transaction history', 'error');
    }
  };

  const handleOpenAccount = async () => {
    if (!openAccountForm.client_name || !openAccountForm.matter_ref) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/compliance/accounts', openAccountForm);
      showToast('Account opened successfully', 'success');
      setShowOpenAccountModal(false);
      setOpenAccountForm({ client_name: '', matter_ref: '', fee_earner_id: '' });
      fetchInitialData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to open account';
      showToast(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordTransaction = async () => {
    if (!transactionForm.account_id || !transactionForm.amount || !transactionForm.payer_payee) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/compliance/accounts/transactions', {
        ...transactionForm,
        amount: parseFloat(transactionForm.amount),
      });
      showToast('Transaction recorded successfully', 'success');
      setShowRecordTransactionModal(false);
      setTransactionForm({
        account_id: '',
        transaction_type: 'receipt',
        amount: '',
        direction: 'in',
        description: '',
        payer_payee: '',
        reference: '',
        payment_method: '',
        withdrawal_reason: '',
        bill_reference: '',
      });
      if (selectedAccount) {
        fetchTransactions(selectedAccount.id);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to record transaction';
      showToast(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewReconciliation = async () => {
    if (!reconForm.client_ledger_total || !reconForm.bank_statement_total || !reconForm.period_start || !reconForm.period_end) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/compliance/accounts/reconciliations', {
        client_ledger_total: parseFloat(reconForm.client_ledger_total),
        bank_statement_total: parseFloat(reconForm.bank_statement_total),
        period_start: reconForm.period_start,
        period_end: reconForm.period_end,
      });
      showToast('Reconciliation recorded successfully', 'success');
      setShowNewReconModal(false);
      setReconForm({ client_ledger_total: '', bank_statement_total: '', period_start: '', period_end: '' });
      fetchInitialData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to record reconciliation';
      showToast(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCofaSignOff = async (reconId: string) => {
    setIsSubmitting(true);
    try {
      await apiClient.post(`/compliance/accounts/reconciliations/${reconId}/cofa-signoff`);
      showToast('COFA sign-off recorded successfully', 'success');
      fetchInitialData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to record COFA sign-off';
      showToast(errorMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccountClick = async (account: ClientAccount) => {
    setSelectedAccount(account);
    setShowTransactionHistory(true);
    await fetchTransactions(account.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client Accounts"
          description="Manage client money accounts and reconciliations under SRA Account Rules"
        />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="rounded-xl p-6">
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
                <div className="h-8 bg-gray-200 rounded animate-pulse" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Client Accounts"
        description="Manage client money accounts and reconciliations under SRA Account Rules"
      />

      {/* DB-driven combobox suggestions (free text still allowed). */}
      <datalist id="accounts-client-options">
        {clientNames.map((name) => (
          <option key={`client-${name}`} value={name} />
        ))}
      </datalist>
      <datalist id="accounts-matter-options">
        {matterReferences.map((ref) => (
          <option key={`matter-${ref}`} value={ref} />
        ))}
      </datalist>

      {/* Error State */}
      {error && (
        <Card className="bg-red-50 border border-red-200 p-4 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error Loading Data</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard
            title="Total Accounts"
            value={stats.total_accounts?.toString() ?? '0'}
            icon={<TrendingUp className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            title="Active Accounts"
            value={stats.active_accounts?.toString() ?? '0'}
            icon={<CheckCircle className="h-5 w-5" />}
            color="green"
          />
          <StatCard
            title="Total Client Money"
            value={`£${((stats.total_client_money ?? 0) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`}
            icon={<TrendingUp className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            title="Residual Balances"
            value={`£${((stats.residual_balances ?? 0) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`}
            icon={<Clock className="h-5 w-5" />}
            color="amber"
          />
          <StatCard
            title="Recon. Overdue"
            value={stats.reconciliation_overdue?.toString() ?? '0'}
            icon={<AlertTriangle className="h-5 w-5" />}
            color="red"
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'accounts', label: 'Accounts' },
          { id: 'reconciliations', label: 'Reconciliations' },
        ]}
        activeTab={activeTab}
        onChange={(value) => setActiveTab(value as 'accounts' | 'reconciliations')}
      />

      {/* Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={() => setShowOpenAccountModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Open Account
            </Button>
            <Button onClick={() => setShowRecordTransactionModal(true)} variant="outline" className="gap-2">
              <ArrowRight className="h-4 w-4" />
              Record Transaction
            </Button>
          </div>

          {accounts.length > 0 ? (
            <Card className="overflow-hidden rounded-xl">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Client Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Matter Ref</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Balance</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Residual</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Last Reconciled</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Next Recon Due</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{account.client_name}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{account.matter_ref}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          £{(account.balance / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge
                            status={account.status === 'active' ? 'success' : account.status === 'dormant' ? 'warning' : 'neutral'}
                            label={(account.status || '').charAt(0).toUpperCase() + (account.status || '').slice(1)}
                          />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{account.residual ? 'Yes' : 'No'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {account.last_reconciled ? formatDate(account.last_reconciled) : 'Never'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {account.next_recon_due ? formatDate(account.next_recon_due) : 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          <Button size="sm" variant="outline" onClick={() => handleAccountClick(account)}>
                            View Transactions
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No Client Accounts"
              description="Create a new client account to get started"
            />
          )}
        </div>
      )}

      {/* Reconciliations Tab */}
      {activeTab === 'reconciliations' && (
        <div className="space-y-4">
          <Button onClick={() => setShowNewReconModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Reconciliation
          </Button>

          {reconciliations.length > 0 ? (
            <div className="space-y-3">
              {reconciliations.map((recon) => (
                <Card key={recon.id} className="p-4 rounded-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium text-gray-900">
                          Period: {formatDate(recon.period_start)} to {formatDate(recon.period_end)}
                        </h4>
                        <StatusBadge
                          status={recon.status === 'reconciled' ? 'success' : recon.status === 'pending' ? 'warning' : 'error'}
                          label={(recon.status || '').charAt(0).toUpperCase() + (recon.status || '').slice(1)}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600 mt-3">
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Client Ledger</p>
                          <p className="font-medium text-gray-900">
                            £{(recon.client_ledger_total / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Bank Statement</p>
                          <p className="font-medium text-gray-900">
                            £{(recon.bank_statement_total / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase">Difference</p>
                          <p className={`font-medium ${recon.difference === 0 ? 'text-green-600' : 'text-red-600'}`}>
                            £{(recon.difference / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      {recon.cofa_signed_at && (
                        <p className="text-xs text-gray-500 mt-3">
                          COFA signed by {recon.cofa_signed_by} on {formatDate(recon.cofa_signed_at)}
                        </p>
                      )}
                    </div>
                    {!recon.cofa_signed_at && (
                      <Button
                        size="sm"
                        onClick={() => handleCofaSignOff(recon.id)}
                        disabled={isSubmitting}
                        className="whitespace-nowrap"
                      >
                        {isSubmitting ? 'Signing...' : 'COFA Sign-off'}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle}
              title="No Reconciliations"
              description="Record a new reconciliation to get started"
            />
          )}
        </div>
      )}

      {/* Open Account Modal */}
      <Modal
        isOpen={showOpenAccountModal}
        onClose={() => setShowOpenAccountModal(false)}
        title="Open New Account"
        onSubmit={handleOpenAccount}
        submitText="Open Account"
        isLoading={isSubmitting}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
            <input
              type="text"
              list="accounts-client-options"
              value={openAccountForm.client_name}
              onChange={(e) => setOpenAccountForm({ ...openAccountForm, client_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter client name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Matter Reference *</label>
            <input
              type="text"
              list="accounts-matter-options"
              value={openAccountForm.matter_ref}
              onChange={(e) => setOpenAccountForm({ ...openAccountForm, matter_ref: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 2024-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee Earner ID</label>
            <input
              type="text"
              value={openAccountForm.fee_earner_id}
              onChange={(e) => setOpenAccountForm({ ...openAccountForm, fee_earner_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
            />
          </div>
        </div>
      </Modal>

      {/* Record Transaction Modal */}
      <Modal
        isOpen={showRecordTransactionModal}
        onClose={() => setShowRecordTransactionModal(false)}
        title="Record Transaction"
        onSubmit={handleRecordTransaction}
        submitText="Record"
        isLoading={isSubmitting}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account *</label>
            <select
              value={transactionForm.account_id}
              onChange={(e) => setTransactionForm({ ...transactionForm, account_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.client_name} - {acc.matter_ref}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
            <select
              value={transactionForm.transaction_type}
              onChange={(e) =>
                setTransactionForm({
                  ...transactionForm,
                  transaction_type: e.target.value as
                    | 'receipt'
                    | 'payment'
                    | 'transfer_in'
                    | 'transfer_out'
                    | 'interest'
                    | 'refund',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="receipt">Receipt</option>
              <option value="payment">Payment</option>
              <option value="transfer_in">Transfer In</option>
              <option value="transfer_out">Transfer Out</option>
              <option value="interest">Interest</option>
              <option value="refund">Refund</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£) *</label>
            <input
              type="number"
              step="0.01"
              value={transactionForm.amount}
              onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Direction *</label>
            <select
              value={transactionForm.direction}
              onChange={(e) => setTransactionForm({ ...transactionForm, direction: e.target.value as 'in' | 'out' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="in">In</option>
              <option value="out">Out</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payer/Payee *</label>
            <input
              type="text"
              value={transactionForm.payer_payee}
              onChange={(e) => setTransactionForm({ ...transactionForm, payer_payee: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
            <input
              type="text"
              value={transactionForm.reference}
              onChange={(e) => setTransactionForm({ ...transactionForm, reference: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <input
              type="text"
              value={transactionForm.payment_method}
              onChange={(e) => setTransactionForm({ ...transactionForm, payment_method: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Bank Transfer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={transactionForm.description}
              onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes"
              rows={2}
            />
          </div>
          {transactionForm.direction === 'out' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Withdrawal Reason</label>
              <input
                type="text"
                value={transactionForm.withdrawal_reason}
                onChange={(e) => setTransactionForm({ ...transactionForm, withdrawal_reason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>
          )}
          {transactionForm.transaction_type === 'payment' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bill Reference</label>
              <input
                type="text"
                value={transactionForm.bill_reference}
                onChange={(e) => setTransactionForm({ ...transactionForm, bill_reference: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Transaction History Modal */}
      <Modal
        isOpen={showTransactionHistory}
        onClose={() => {
          setShowTransactionHistory(false);
          setSelectedAccount(null);
          setTransactions([]);
        }}
        title={selectedAccount ? `Transactions - ${selectedAccount.client_name}` : 'Transactions'}
      >
        {transactions.length > 0 ? (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {transactions.map((txn) => (
              <div key={txn.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                <div className="flex justify-between items-start mb-2">
                  <p className="font-medium text-gray-900">{txn.description || txn.transaction_type}</p>
                  <p className={`font-bold ${txn.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                    {txn.direction === 'in' ? '+' : '-'}£{(txn.amount / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <p className="text-gray-600">{txn.payer_payee}</p>
                <p className="text-gray-500 text-xs mt-1">{formatDate(txn.created_at)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 text-center py-4">No transactions recorded</p>
        )}
      </Modal>

      {/* New Reconciliation Modal */}
      <Modal
        isOpen={showNewReconModal}
        onClose={() => setShowNewReconModal(false)}
        title="Record Reconciliation"
        onSubmit={handleNewReconciliation}
        submitText="Record Reconciliation"
        isLoading={isSubmitting}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period Start *</label>
            <input
              type="date"
              value={reconForm.period_start}
              onChange={(e) => setReconForm({ ...reconForm, period_start: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period End *</label>
            <input
              type="date"
              value={reconForm.period_end}
              onChange={(e) => setReconForm({ ...reconForm, period_end: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Ledger Total (£) *</label>
            <input
              type="number"
              step="0.01"
              value={reconForm.client_ledger_total}
              onChange={(e) => setReconForm({ ...reconForm, client_ledger_total: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Statement Total (£) *</label>
            <input
              type="number"
              step="0.01"
              value={reconForm.bank_statement_total}
              onChange={(e) => setReconForm({ ...reconForm, bank_statement_total: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
