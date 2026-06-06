'use client';

import React from 'react';
import { useTierGate } from '../../lib/hooks/use-tier-gate';
import type { ProfessionalFeature } from '../../lib/stores/firm-store';
import { Button } from './Button';

// ---------------------------------------------------------------------------
// UpgradeGate — wraps Professional-only content with an upgrade prompt
// ---------------------------------------------------------------------------

export interface UpgradeGateProps {
  /** The Professional feature key to gate on */
  feature: ProfessionalFeature;
  /** Content to render when the feature is unlocked */
  children: React.ReactNode;
  /** Optional custom title for the upgrade prompt */
  title?: string;
  /** Optional custom description */
  description?: string;
  /** Callback when "Upgrade" is clicked (defaults to navigating to /settings?tab=billing) */
  onUpgrade?: () => void;
  /** Render as inline (compact) instead of card-style */
  inline?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export const UpgradeGate: React.FC<UpgradeGateProps> = ({
  feature,
  children,
  title,
  description,
  onUpgrade,
  inline = false,
  className = '',
}) => {
  const { isLocked, getFeatureLabel } = useTierGate();

  // If the feature is unlocked, just render children
  if (!isLocked(feature)) {
    return <>{children}</>;
  }

  const featureLabel = getFeatureLabel(feature);
  const defaultTitle = title || `${featureLabel}`;
  const defaultDescription =
    description ||
    `${featureLabel} is available on the Professional plan. Upgrade to unlock this feature for your firm.`;

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.location.href = '/settings?tab=billing';
    }
  };

  // Inline variant — compact, single-line style
  if (inline) {
    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg ${className}`}
      >
        <LockIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span className="text-sm text-blue-800 flex-1">
          <span className="font-medium">{featureLabel}</span> — Professional plan
        </span>
        <button
          onClick={handleUpgrade}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap"
        >
          Upgrade
        </button>
      </div>
    );
  }

  // Card variant — larger, centered prompt
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-6 text-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 border border-blue-200 rounded-xl ${className}`}
    >
      <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
        <LockIcon className="w-7 h-7 text-blue-600" />
      </div>

      <h3 className="text-base font-semibold text-gray-900 mb-2">
        {defaultTitle}
      </h3>

      <p className="text-sm text-gray-600 mb-6 max-w-md">
        {defaultDescription}
      </p>

      <Button variant="primary" size="md" onClick={handleUpgrade}>
        Upgrade to Professional
      </Button>

      <p className="text-xs text-gray-400 mt-3">
        Starting at £700/month for 10-50 solicitors
      </p>
    </div>
  );
};

UpgradeGate.displayName = 'UpgradeGate';

// ---------------------------------------------------------------------------
// TierBadge — shows current plan name as a small badge
// ---------------------------------------------------------------------------

export interface TierBadgeProps {
  className?: string;
}

export const TierBadge: React.FC<TierBadgeProps> = ({ className = '' }) => {
  const { tier, isPro } = useTierGate();

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isPro
          ? 'bg-indigo-100 text-indigo-700'
          : 'bg-gray-100 text-gray-600'
      } ${className}`}
    >
      {isPro && <StarIcon className="w-3 h-3" />}
      {tier === 'professional' ? 'Professional' : 'Essentials'}
    </span>
  );
};

TierBadge.displayName = 'TierBadge';

// ---------------------------------------------------------------------------
// UserLimitWarning — shows when approaching or at the user cap
// ---------------------------------------------------------------------------

export interface UserLimitWarningProps {
  className?: string;
}

export const UserLimitWarning: React.FC<UserLimitWarningProps> = ({
  className = '',
}) => {
  const { tier, userLimit, currentUsers, atUserLimit, usersRemaining } = useTierGate();

  // No limit (Professional) or no data yet
  if (userLimit === null || tier === 'professional') {
    return null;
  }

  // Show warning when within 2 users of the limit, or at the limit
  if (usersRemaining !== null && usersRemaining > 2) {
    return null;
  }

  const handleUpgrade = () => {
    window.location.href = '/settings?tab=billing';
  };

  if (atUserLimit) {
    return (
      <div
        className={`flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg ${className}`}
      >
        <WarningIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">
            User limit reached ({currentUsers}/{userLimit})
          </p>
          <p className="text-xs text-red-600">
            Upgrade to Professional for unlimited user accounts.
          </p>
        </div>
        <button
          onClick={handleUpgrade}
          className="text-xs font-semibold text-red-600 hover:text-red-800 whitespace-nowrap"
        >
          Upgrade
        </button>
      </div>
    );
  }

  // Approaching limit
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg ${className}`}
    >
      <WarningIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-800">
          {usersRemaining} user {usersRemaining === 1 ? 'slot' : 'slots'} remaining ({currentUsers}/{userLimit})
        </p>
        <p className="text-xs text-amber-600">
          Upgrade to Professional for unlimited users.
        </p>
      </div>
    </div>
  );
};

UserLimitWarning.displayName = 'UserLimitWarning';

// ---------------------------------------------------------------------------
// ProBadge — small "PRO" indicator next to Professional-only nav items
// ---------------------------------------------------------------------------

export interface ProBadgeProps {
  feature?: ProfessionalFeature;
  className?: string;
}

export const ProBadge: React.FC<ProBadgeProps> = ({ feature, className = '' }) => {
  const { isPro, isLocked } = useTierGate();

  // Don't show badge if the firm already has Professional
  if (isPro) return null;
  // If a feature is specified and it's not locked, don't show
  if (feature && !isLocked(feature)) return null;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-gradient-to-r from-blue-500 to-indigo-500 text-white ${className}`}
    >
      PRO
    </span>
  );
};

ProBadge.displayName = 'ProBadge';

// ---------------------------------------------------------------------------
// SVG icons (inline to avoid external dependencies)
// ---------------------------------------------------------------------------

const LockIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const StarIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
  </svg>
);

const WarningIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);
