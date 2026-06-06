'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button, showToast } from '@/components/ui';
import apiClient from '@/lib/api';
import type { PackType } from './SendPackModal';

// ---------------------------------------------------------------------------
// PackDeliveryHistory — table of past sends for a given pack type. Renders
// inside the SRA Inspection Pack and PII Renewal Pack pages.
//
// Re-fetches when `refreshKey` changes so the parent page can trigger a
// refresh after a send completes (without lifting the data into the page).
// ---------------------------------------------------------------------------

export interface PackDeliveryRow {
  id: string;
  firm_id: string;
  pack_type: string;
  pack_label: string;
  recipient_email: string;
  recipient_name: string | null;
  message: string | null;
  sent_by_user_id: string;
  sent_at: string;
  pack_snapshot_url: string | null;
  status: 'queued' | 'sent' | 'failed' | string;
  failure_reason: string | null;
}

export interface PackDeliveryHistoryProps {
  packType: PackType;
  /** Bump this to force a re-fetch (e.g. after a successful send). */
  refreshKey?: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  queued: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Queued' },
  sent: { bg: 'bg-green-50', text: 'text-green-700', label: 'Sent' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', label: 'Failed' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function PackDeliveryHistory({ packType, refreshKey = 0 }: PackDeliveryHistoryProps) {
  const [rows, setRows] = useState<PackDeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [internalRefresh, setInternalRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<PackDeliveryRow[]>(`/packs/${packType}/deliveries`);
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      // 404 = no deliveries table yet (pre-migration); surface a friendly
      // empty state rather than a scary error so the page stays usable.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setRows([]);
      } else {
        setError('Failed to load delivery history');
      }
    } finally {
      setLoading(false);
    }
  }, [packType]);

  useEffect(() => {
    void load();
  }, [load, refreshKey, internalRefresh]);

  const handleResend = async (id: string) => {
    setResendingId(id);
    try {
      await apiClient.post(`/packs/deliveries/${id}/resend`);
      showToast('Pack re-queued', 'success');
      setInternalRefresh((n) => n + 1);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to resend';
      showToast(detail, 'error');
    } finally {
      setResendingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Delivery history</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Every time this pack has been emailed to a recipient.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setInternalRefresh((n) => n + 1)}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-red-600">{error}</div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">
          No deliveries yet. Use &quot;Send to recipient&quot; above to email this pack.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                <th className="px-4 py-2.5">Recipient</th>
                <th className="px-4 py-2.5">Sent</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Note</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const style = STATUS_STYLES[row.status] || STATUS_STYLES.queued;
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {row.recipient_name || row.recipient_email}
                      </div>
                      {row.recipient_name && (
                        <div className="text-xs text-gray-500">{row.recipient_email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(row.sent_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
                      >
                        {style.label}
                      </span>
                      {row.status === 'failed' && row.failure_reason && (
                        <p className="mt-1 text-xs text-red-600 max-w-xs">
                          {row.failure_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">
                      {row.message || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === 'failed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResend(row.id)}
                          disabled={resendingId === row.id}
                          loading={resendingId === row.id}
                        >
                          Resend
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
