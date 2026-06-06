'use client';

import { useEffect, useState } from 'react';
import { Modal, Button, showToast } from '@/components/ui';
import apiClient from '@/lib/api';

// ---------------------------------------------------------------------------
// SendPackModal — shared "send compliance pack to recipient" dialog used by
// both the SRA Inspection Pack and PII Renewal Pack pages.
//
// On submit:
//   1. POSTs to /packs/{packType}/send
//   2. Backend creates a pack_deliveries row + enqueues an email job
//   3. We surface success / error inline and via showToast
// ---------------------------------------------------------------------------

export type PackType = 'sra_audit' | 'pii_renewal';

const PACK_LABEL: Record<PackType, string> = {
  sra_audit: 'SRA Inspection Pack',
  pii_renewal: 'PII Renewal Pack',
};

export interface SendPackModalProps {
  isOpen: boolean;
  onClose: () => void;
  packType: PackType;
  /** Called when a delivery is successfully enqueued (for delivery history refresh). */
  onSent?: () => void;
}

export function SendPackModal({ isOpen, onClose, packType, onSent }: SendPackModalProps) {
  const label = PACK_LABEL[packType];
  const defaultMessage = `Please find attached our ${label} for review.`;

  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState(defaultMessage);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal re-opens. Without this the previous
  // success/error banner sticks across opens, which looks broken.
  useEffect(() => {
    if (isOpen) {
      setRecipientEmail('');
      setRecipientName('');
      setMessage(defaultMessage);
      setSuccess(false);
      setError(null);
      setSubmitting(false);
    }
  }, [isOpen, defaultMessage]);

  const handleSubmit = async () => {
    setError(null);
    if (!recipientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      setError('Please enter a valid recipient email address.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/packs/${packType}/send`, {
        recipientEmail: recipientEmail.trim(),
        recipientName: recipientName.trim() || null,
        message: message.trim() || null,
      });
      setSuccess(true);
      showToast(`${label} sent to ${recipientEmail}`, 'success');
      onSent?.();
    } catch (err) {
      const detail =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to send pack. Please try again.';
      setError(detail);
      showToast(detail, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Send ${label}`} size="lg">
      {success ? (
        <div className="space-y-4">
          <div className="rounded-md bg-green-50 border border-green-200 p-4">
            <p className="text-sm font-medium text-green-800">
              The pack is on its way to {recipientEmail}.
            </p>
            <p className="text-xs text-green-700 mt-1">
              Delivery status will appear in the &quot;Delivery history&quot; section below.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="broker@example.com"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recipient name (optional)
            </label>
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Jane Smith"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cover note (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-gray-500">
              We&apos;ll prepend this to the email body so the recipient knows why
              they&apos;re receiving the pack.
            </p>
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting} loading={submitting}>
              {submitting ? 'Sending…' : `Send ${label}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
