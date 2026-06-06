'use client';

import { useState, useEffect } from 'react';
import { useRequireAuth } from '@/lib/hooks';
import { isDemoMode, DEMO_KEY_DATES } from '@/lib/demo-data';
import apiClient from '@/lib/api';
import {
  PageHeader,
  Card,
  Button,
  StatusBadge,
  showToast,
  LoadingSpinner,
  EmptyState,
} from '@/components/ui';
import { formatDate } from '@/lib/utils/format';
import {
  Calendar,
  AlertTriangle,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

interface LimitationPeriodOption {
  id: string;
  label: string;
  default_years: number;
}

interface PreActionProtocolOption {
  id: string;
  label: string;
}

interface LimitationResult {
  expiry_date: string;
  days_remaining: number;
  urgency: 'expired' | 'critical' | 'warning' | 'ok';
  statute_reference: string;
  warnings: string[];
}

interface CprDeadline {
  step_name: string;
  cpr_rule: string;
  deadline_date: string;
  description: string;
}

interface CprResult {
  deadlines: CprDeadline[];
}

interface PreActionStep {
  step_name: string;
  deadline_date: string;
  days_remaining: number;
  urgency: 'expired' | 'critical' | 'warning' | 'ok';
}

interface PreActionResult {
  steps: PreActionStep[];
}

export default function KeyDatesPage() {
  useRequireAuth();

  const [limitationOptions, setLimitationOptions] = useState<LimitationPeriodOption[]>([]);
  const [protocolOptions, setProtocolOptions] = useState<PreActionProtocolOption[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  // Limitation Period state
  const [limitationForm, setLimitationForm] = useState({
    claim_type: '',
    date_of_cause: '',
    claimant_is_minor: false,
    claimant_has_disability: false,
  });
  const [limitationResult, setLimitationResult] = useState<LimitationResult | null>(null);
  const [isCalculatingLimitation, setIsCalculatingLimitation] = useState(false);

  // CPR Deadline state
  const [cprForm, setCprForm] = useState({
    event_type: 'claim_issued' as
      | 'claim_issued'
      | 'claim_served'
      | 'judgement_given'
      | 'disclosure_ordered'
      | 'trial_listed',
    event_date: '',
  });
  const [cprResult, setCprResult] = useState<CprResult | null>(null);
  const [isCalculatingCpr, setIsCalculatingCpr] = useState(false);

  // Pre-Action Protocol state
  const [protocolForm, setProtocolForm] = useState({
    protocol_type: '',
    letter_sent_date: '',
  });
  const [protocolResult, setProtocolResult] = useState<PreActionResult | null>(null);
  const [isCalculatingProtocol, setIsCalculatingProtocol] = useState(false);

  // Fetch dropdown options
  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      setIsLoadingOptions(true);

      // Demo mode: set empty options
      if (isDemoMode()) {
        setLimitationOptions([]);
        setProtocolOptions([]);
        setIsLoadingOptions(false);
        return;
      }

      const [limitationRes, protocolRes] = await Promise.all([
        apiClient.get('/compliance/key-dates/limitation-periods'),
        apiClient.get('/compliance/key-dates/pre-action-protocols'),
      ]);
      // apiClient returns AxiosResponse — the array body is at `.data`.
      setLimitationOptions(Array.isArray(limitationRes.data) ? limitationRes.data : []);
      setProtocolOptions(Array.isArray(protocolRes.data) ? protocolRes.data : []);
    } catch (err) {
      console.error('Failed to load options:', err);
      showToast('Failed to load calculator options', 'error');
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const handleCalculateLimitation = async () => {
    if (!limitationForm.claim_type || !limitationForm.date_of_cause) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsCalculatingLimitation(true);
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 600));
        const causeDate = new Date(limitationForm.date_of_cause);
        const expiryDate = new Date(causeDate); expiryDate.setFullYear(expiryDate.getFullYear() + 6);
        const daysRemaining = Math.ceil((expiryDate.getTime() - Date.now()) / 86400000);
        setLimitationResult({ claim_type: limitationForm.claim_type, standard_period_years: 6, date_of_cause: limitationForm.date_of_cause, limitation_expiry: expiryDate.toISOString().split('T')[0], days_remaining: daysRemaining, urgency: daysRemaining < 30 ? 'critical' : daysRemaining < 180 ? 'warning' : 'ok', notes: 'Standard 6-year limitation period (demo).' } as any);
        showToast('Limitation period calculated', 'success');
        setIsCalculatingLimitation(false); return;
      }
      const result = await apiClient.post('/compliance/key-dates/limitation', {
        claim_type: limitationForm.claim_type,
        date_of_cause: limitationForm.date_of_cause,
        claimant_is_minor: limitationForm.claimant_is_minor,
        claimant_has_disability: limitationForm.claimant_has_disability,
      });
      setLimitationResult(result.data);
      showToast('Limitation period calculated', 'success');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to calculate limitation period';
      showToast(errorMsg, 'error');
    } finally {
      setIsCalculatingLimitation(false);
    }
  };

  const handleCalculateCpr = async () => {
    if (!cprForm.event_type || !cprForm.event_date) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsCalculatingCpr(true);
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 600));
        const eventDate = new Date(cprForm.event_date);
        const deadline14 = new Date(eventDate); deadline14.setDate(deadline14.getDate() + 14);
        const deadline28 = new Date(eventDate); deadline28.setDate(deadline28.getDate() + 28);
        setCprResult({ event_type: cprForm.event_type, event_date: cprForm.event_date, deadlines: [{ label: 'Acknowledgement of service', date: deadline14.toISOString().split('T')[0], days_remaining: Math.ceil((deadline14.getTime() - Date.now()) / 86400000) }, { label: 'Defence filing deadline', date: deadline28.toISOString().split('T')[0], days_remaining: Math.ceil((deadline28.getTime() - Date.now()) / 86400000) }] } as any);
        showToast('CPR deadlines calculated', 'success');
        setIsCalculatingCpr(false); return;
      }
      const result = await apiClient.post('/compliance/key-dates/cpr', {
        event_type: cprForm.event_type,
        event_date: cprForm.event_date,
      });
      setCprResult(result.data);
      showToast('CPR deadlines calculated', 'success');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to calculate CPR deadlines';
      showToast(errorMsg, 'error');
    } finally {
      setIsCalculatingCpr(false);
    }
  };

  const handleCalculateProtocol = async () => {
    if (!protocolForm.protocol_type || !protocolForm.letter_sent_date) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setIsCalculatingProtocol(true);
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 600));
        const sentDate = new Date(protocolForm.letter_sent_date);
        const responseDeadline = new Date(sentDate); responseDeadline.setDate(responseDeadline.getDate() + 90);
        setProtocolResult({ protocol_type: protocolForm.protocol_type, letter_sent_date: protocolForm.letter_sent_date, response_deadline: responseDeadline.toISOString().split('T')[0], days_remaining: Math.ceil((responseDeadline.getTime() - Date.now()) / 86400000), notes: '90-day standard pre-action protocol response period (demo).' } as any);
        showToast('Pre-action protocol deadlines calculated', 'success');
        setIsCalculatingProtocol(false); return;
      }
      const result = await apiClient.post('/compliance/key-dates/pre-action', {
        protocol_type: protocolForm.protocol_type,
        letter_sent_date: protocolForm.letter_sent_date,
      });
      setProtocolResult(result.data);
      showToast('Pre-action protocol deadlines calculated', 'success');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to calculate pre-action deadlines';
      showToast(errorMsg, 'error');
    } finally {
      setIsCalculatingProtocol(false);
    }
  };

  // Persist a calculated result as a tracked per-firm key_date row.
  // The backend's /key-dates/save endpoint is the only one that writes.
  const [isSaving, setIsSaving] = useState(false);
  const saveAsDeadline = async (title: string, date: string, category: string) => {
    if (!date) {
      showToast('Cannot save: no date on this calculation', 'error');
      return;
    }
    setIsSaving(true);
    try {
      if (isDemoMode()) {
        await new Promise(r => setTimeout(r, 400));
        showToast('Saved (demo mode — not persisted)', 'success');
        return;
      }
      await apiClient.post('/compliance/key-dates/save', { title, date, category });
      showToast('Saved as tracked deadline', 'success');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save deadline';
      showToast(errorMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getUrgencyBadge = (urgency: 'expired' | 'critical' | 'warning' | 'ok') => {
    switch (urgency) {
      case 'expired':
        return <StatusBadge status="error" label="Expired" />;
      case 'critical':
        return <StatusBadge status="error" label="Critical" />;
      case 'warning':
        return <StatusBadge status="warning" label="Warning" />;
      case 'ok':
        return <StatusBadge status="success" label="OK" />;
    }
  };

  if (isLoadingOptions) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Key Dates Calculator"
        description="Calculate critical legal deadlines for limitation periods, CPR rules, and pre-action protocols"
      />

      {/* Three Calculator Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Limitation Period Calculator */}
        <Card className="flex flex-col rounded-xl">
          <div className="flex items-center gap-2 mb-6">
            <Calendar className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Limitation Period</h3>
          </div>

          <div className="space-y-4 flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Claim Type *</label>
              <select
                value={limitationForm.claim_type}
                onChange={(e) => setLimitationForm({ ...limitationForm, claim_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Select claim type...</option>
                {limitationOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Cause *</label>
              <input
                type="date"
                value={limitationForm.date_of_cause}
                onChange={(e) => setLimitationForm({ ...limitationForm, date_of_cause: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={limitationForm.claimant_is_minor}
                  onChange={(e) => setLimitationForm({ ...limitationForm, claimant_is_minor: e.target.checked })}
                  className="rounded"
                />
                Claimant is Minor
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={limitationForm.claimant_has_disability}
                  onChange={(e) => setLimitationForm({ ...limitationForm, claimant_has_disability: e.target.checked })}
                  className="rounded"
                />
                Claimant has Disability
              </label>
            </div>

            <Button
              onClick={handleCalculateLimitation}
              disabled={isCalculatingLimitation}
              className="w-full mt-4"
            >
              {isCalculatingLimitation ? 'Calculating...' : 'Calculate'}
            </Button>

            {limitationResult && (
              <div className="mt-6 space-y-3 border-t pt-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase">Expiry Date</p>
                  <p className="text-lg font-bold text-gray-900">{formatDate(limitationResult.expiry_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase">Days Remaining</p>
                  <p className={`text-lg font-bold ${
                    limitationResult.days_remaining < 0 ? 'text-red-600' : limitationResult.days_remaining < 30 ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {limitationResult.days_remaining}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Urgency</p>
                  {getUrgencyBadge(limitationResult.urgency)}
                </div>
                {limitationResult.statute_reference && (
                  <div className="bg-gray-50 p-2 rounded text-xs text-gray-600">
                    <p className="font-medium">Statute:</p>
                    <p>{limitationResult.statute_reference}</p>
                  </div>
                )}
                {(limitationResult.warnings?.length ?? 0) > 0 && (
                  <div className="bg-yellow-50 p-2 rounded border border-yellow-200">
                    <p className="text-xs font-medium text-yellow-900 mb-1">Warnings:</p>
                    <ul className="text-xs text-yellow-800 space-y-1">
                      {limitationResult.warnings.map((warning, idx) => (
                        <li key={idx}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button
                  variant="secondary"
                  className="w-full mt-2"
                  disabled={isSaving}
                  onClick={() => saveAsDeadline(
                    `Limitation expiry — ${limitationOptions.find(o => o.id === limitationForm.claim_type)?.label || limitationForm.claim_type}`,
                    limitationResult.expiry_date,
                    'limitation',
                  )}
                >
                  {isSaving ? 'Saving…' : 'Save as tracked deadline'}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Card 2: CPR Deadline Calculator */}
        <Card className="flex flex-col rounded-xl">
          <div className="flex items-center gap-2 mb-6">
            <Clock className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">CPR Deadlines</h3>
          </div>

          <div className="space-y-4 flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Type *</label>
              <select
                value={cprForm.event_type}
                onChange={(e) =>
                  setCprForm({
                    ...cprForm,
                    event_type: e.target.value as
                      | 'claim_issued'
                      | 'claim_served'
                      | 'judgement_given'
                      | 'disclosure_ordered'
                      | 'trial_listed',
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              >
                <option value="claim_issued">Claim Issued</option>
                <option value="claim_served">Claim Served</option>
                <option value="judgement_given">Judgement Given</option>
                <option value="disclosure_ordered">Disclosure Ordered</option>
                <option value="trial_listed">Trial Listed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Date *</label>
              <input
                type="date"
                value={cprForm.event_date}
                onChange={(e) => setCprForm({ ...cprForm, event_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>

            <Button
              onClick={handleCalculateCpr}
              disabled={isCalculatingCpr}
              className="w-full mt-4"
            >
              {isCalculatingCpr ? 'Calculating...' : 'Calculate'}
            </Button>

            {cprResult && (
              <div className="mt-6 space-y-3 border-t pt-4 max-h-80 overflow-y-auto">
                <p className="text-xs font-medium text-gray-700 uppercase mb-2">Deadlines</p>
                {cprResult.deadlines.map((deadline, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded text-sm">
                    <p className="font-medium text-gray-900 mb-1">{deadline.step_name}</p>
                    <p className="text-xs text-gray-600 mb-1">Rule {deadline.cpr_rule}</p>
                    <p className="text-xs text-gray-700">{formatDate(deadline.deadline_date)}</p>
                    {deadline.description && (
                      <p className="text-xs text-gray-500 mt-1">{deadline.description}</p>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full mt-2"
                      disabled={isSaving}
                      onClick={() => saveAsDeadline(
                        `CPR — ${deadline.step_name}`,
                        deadline.deadline_date,
                        'cpr',
                      )}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Card 3: Pre-Action Protocol Calculator */}
        <Card className="flex flex-col rounded-xl">
          <div className="flex items-center gap-2 mb-6">
            <AlertCircle className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Pre-Action Protocol</h3>
          </div>

          <div className="space-y-4 flex-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Protocol Type *</label>
              <select
                value={protocolForm.protocol_type}
                onChange={(e) => setProtocolForm({ ...protocolForm, protocol_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              >
                <option value="">Select protocol...</option>
                {protocolOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Letter Sent Date *</label>
              <input
                type="date"
                value={protocolForm.letter_sent_date}
                onChange={(e) => setProtocolForm({ ...protocolForm, letter_sent_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
            </div>

            <Button
              onClick={handleCalculateProtocol}
              disabled={isCalculatingProtocol}
              className="w-full mt-4"
            >
              {isCalculatingProtocol ? 'Calculating...' : 'Calculate'}
            </Button>

            {protocolResult && (
              <div className="mt-6 space-y-3 border-t pt-4 max-h-80 overflow-y-auto">
                <p className="text-xs font-medium text-gray-700 uppercase mb-2">Steps</p>
                {protocolResult.steps.map((step, idx) => (
                  <div key={idx} className="bg-gray-50 p-3 rounded text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{step.step_name}</p>
                        <p className="text-xs text-gray-600 mt-1">{formatDate(step.deadline_date)}</p>
                      </div>
                      {getUrgencyBadge(step.urgency)}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full mt-2"
                      disabled={isSaving}
                      onClick={() => saveAsDeadline(
                        `Pre-action — ${step.step_name}`,
                        step.deadline_date,
                        'pre-action',
                      )}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </Button>
                    <p className={`text-xs font-medium mt-2 ${
                      step.days_remaining < 0 ? 'text-red-600' : step.days_remaining < 7 ? 'text-orange-600' : 'text-green-600'
                    }`}>
                      {step.days_remaining} days remaining
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Info Section */}
      <Card className="bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex gap-4">
          <CheckCircle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 mb-2">About Key Dates Calculators</h3>
            <p className="text-sm text-blue-800 mb-2">
              These calculators help you determine critical legal deadlines based on English law. Always verify results with your case management system and consult with fee earners before acting on calculated dates.
            </p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <strong>Limitation Period:</strong> Calculates when a claim must be issued (typically 3-6 years)</li>
              <li>• <strong>CPR Deadlines:</strong> Based on Civil Procedure Rules milestones and case events</li>
              <li>• <strong>Pre-Action Protocol:</strong> Compliance periods for protocol letter responses (typically 14-28 days)</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
