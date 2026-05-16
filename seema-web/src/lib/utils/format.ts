import type { RiskLevel, ComplianceStatus } from '../types';

/**
 * Format date as "24 Apr 2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format date and time as "24 Apr 2026, 14:30"
 */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const dateStr = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const timeStr = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${dateStr}, ${timeStr}`;
}

/**
 * Format relative time as "2 hours ago", "3 days ago", etc.
 */
export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 4) {
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }

  const years = Math.floor(months / 12);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Format currency as "£1,234.56"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '£0.00';

  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format percentage as "45.5%"
 */
export function formatPercentage(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) return '0%';
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format number with thousand separators
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0';
  return new Intl.NumberFormat('en-GB').format(value);
}

/**
 * Get Tailwind color class for risk level
 */
export function riskColor(level: RiskLevel | null | undefined): string {
  switch (level) {
    case 'critical':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'high':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'medium':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'low':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'info':
      return 'text-gray-600 bg-gray-50 border-gray-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

/**
 * Get Tailwind text color class for risk level
 */
export function riskTextColor(level: RiskLevel | null | undefined): string {
  switch (level) {
    case 'critical':
      return 'text-red-600';
    case 'high':
      return 'text-orange-600';
    case 'medium':
      return 'text-yellow-600';
    case 'low':
      return 'text-blue-600';
    case 'info':
      return 'text-gray-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Get Tailwind badge color class for risk level
 */
export function riskBadgeColor(level: RiskLevel | null | undefined): string {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'high':
      return 'bg-orange-100 text-orange-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-blue-100 text-blue-800';
    case 'info':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get Tailwind color class for status
 */
export function statusColor(status: ComplianceStatus | string | null | undefined): string {
  switch (status) {
    case 'open':
      return 'text-red-600 bg-red-50 border-red-200';
    case 'in_progress':
      return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'resolved':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'closed':
      return 'text-gray-600 bg-gray-50 border-gray-200';
    case 'on_hold':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'pending':
      return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'completed':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'cancelled':
      return 'text-gray-600 bg-gray-50 border-gray-200';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

/**
 * Get Tailwind badge color class for status
 */
export function statusBadgeColor(status: ComplianceStatus | string | null | undefined): string {
  switch (status) {
    case 'open':
      return 'bg-red-100 text-red-800';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800';
    case 'resolved':
      return 'bg-green-100 text-green-800';
    case 'closed':
      return 'bg-gray-100 text-gray-800';
    case 'on_hold':
      return 'bg-yellow-100 text-yellow-800';
    case 'pending':
      return 'bg-orange-100 text-orange-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get human-readable status label
 */
export function formatStatus(status: string | null | undefined): string {
  if (!status) return '';
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if date is overdue
 */
export function isOverdue(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  return d < new Date();
}

/**
 * Get days until deadline
 */
// Returns `undefined` rather than `null` so the value lines up with an
// optional field (`days_until?: number`) on the Deadline interface.
export function daysUntilDeadline(dueDate: string | Date | null | undefined): number | undefined {
  if (!dueDate) return undefined;
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const now = new Date();
  const diffTime = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Get deadline status text
 */
export function getDeadlineStatusText(dueDate: string | Date | null | undefined): string {
  if (!dueDate) return '';

  const days = daysUntilDeadline(dueDate);
  if (days === undefined) return '';

  if (days < 0) {
    return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`;
  }

  if (days === 0) {
    return 'Due today';
  }

  if (days === 1) {
    return 'Due tomorrow';
  }

  return `Due in ${days} days`;
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string | null | undefined, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format email domain
 */
export function getEmailDomain(email: string | null | undefined): string {
  if (!email) return '';
  const parts = email.split('@');
  return parts.length > 1 ? parts[1] : '';
}

/**
 * Capitalize string
 */
export function capitalize(str: string | null | undefined): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Format role name
 */
export function formatRole(role: string | null | undefined): string {
  if (!role) return '';
  switch (role) {
    case 'colp':
      return 'COLP/COMC';
    case 'partner':
      return 'Partner';
    case 'admin':
      return 'Admin';
    case 'solicitor':
      return 'Solicitor';
    case 'staff':
      return 'Staff';
    default:
      return capitalize(role);
  }
}
