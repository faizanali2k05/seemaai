import React from 'react';

// Accept anything string-shaped — previously the union was strict and
// callers passed values like 'neutral', 'error', 'reconciled', etc. that
// weren't in the union. We keep a known set of mapped colours and fall
// back to a neutral grey for unknown values.
export type StatusBadgeVariant = string;

export interface StatusBadgeProps {
  status?: StatusBadgeVariant;
  variant?: StatusBadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  children?: React.ReactNode;
  /** Alias for children — used by ~30 call sites that pass label="…" */
  label?: React.ReactNode;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status: statusProp,
  variant,
  size = 'md',
  className = '',
  children,
  label,
}) => {
  const status = statusProp || variant || 'info';
  const sizeStyles = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
  };

  const statusMap: Record<string, { bg: string; text: string }> = {
    // Red — danger / failure
    critical: { bg: 'bg-red-100', text: 'text-[#dc2626]' },
    overdue: { bg: 'bg-red-100', text: 'text-[#dc2626]' },
    high: { bg: 'bg-red-100', text: 'text-[#dc2626]' },
    error: { bg: 'bg-red-100', text: 'text-[#dc2626]' },
    failed: { bg: 'bg-red-100', text: 'text-[#dc2626]' },
    rejected: { bg: 'bg-red-100', text: 'text-[#dc2626]' },
    // Amber — caution / pending
    warning: { bg: 'bg-amber-100', text: 'text-[#d97706]' },
    pending: { bg: 'bg-amber-100', text: 'text-[#d97706]' },
    medium: { bg: 'bg-amber-100', text: 'text-[#d97706]' },
    in_progress: { bg: 'bg-amber-100', text: 'text-[#d97706]' },
    review: { bg: 'bg-amber-100', text: 'text-[#d97706]' },
    // Green — success / good
    active: { bg: 'bg-green-100', text: 'text-[#059669]' },
    completed: { bg: 'bg-green-100', text: 'text-[#059669]' },
    success: { bg: 'bg-green-100', text: 'text-[#059669]' },
    low: { bg: 'bg-green-100', text: 'text-[#059669]' },
    reconciled: { bg: 'bg-green-100', text: 'text-[#059669]' },
    approved: { bg: 'bg-green-100', text: 'text-[#059669]' },
    clear: { bg: 'bg-green-100', text: 'text-[#059669]' },
    // Blue — informational
    info: { bg: 'bg-blue-100', text: 'text-[#2563eb]' },
    draft: { bg: 'bg-blue-100', text: 'text-[#2563eb]' },
    open: { bg: 'bg-blue-100', text: 'text-[#2563eb]' },
    // Grey — neutral / unknown
    neutral: { bg: 'bg-gray-100', text: 'text-gray-600' },
    closed: { bg: 'bg-gray-100', text: 'text-gray-600' },
    dormant: { bg: 'bg-gray-100', text: 'text-gray-600' },
  };

  const style = statusMap[status] || statusMap.neutral;
  const displayLabel = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');

  return (
    <span
      className={`inline-block font-medium rounded-full whitespace-nowrap ${sizeStyles[size]} ${style.bg} ${style.text} ${className}`}
    >
      {label ?? children ?? displayLabel}
    </span>
  );
};

StatusBadge.displayName = 'StatusBadge';
