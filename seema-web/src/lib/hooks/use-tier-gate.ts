'use client';

import { useEffect } from 'react';
import { useFirmStore, TIER_HIERARCHY, PROFESSIONAL_FEATURES, FEATURE_LABELS } from '../stores/firm-store';
import type { SubscriptionTier } from '../types';
import type { ProfessionalFeature, TierInfo } from '../stores/firm-store';

/**
 * Hook that provides tier-gating utilities for React components.
 *
 * Usage:
 *   const { isPro, canAccess, isLocked, tierInfo, userLimit } = useTierGate();
 *
 *   if (isLocked('risk_heatmap')) {
 *     return <UpgradeGate feature="risk_heatmap" />;
 *   }
 */
export function useTierGate() {
  const firm = useFirmStore((s) => s.firm);
  const tierInfo = useFirmStore((s) => s.tierInfo);
  const fetchTierInfo = useFirmStore((s) => s.fetchTierInfo);

  // Fetch tier info on mount if not already loaded
  useEffect(() => {
    if (!tierInfo && firm) {
      fetchTierInfo();
    }
  }, [firm, tierInfo, fetchTierInfo]);

  const currentTier: SubscriptionTier = firm?.subscription_tier || 'essentials';
  const currentLevel = TIER_HIERARCHY[currentTier] || 0;

  return {
    /** Current tier name */
    tier: currentTier,

    /** Whether the firm is on the Professional plan */
    isPro: currentTier === 'professional',

    /** Full tier info from backend (null until loaded) */
    tierInfo,

    /** Check if the firm's tier meets or exceeds the required tier */
    canAccess: (requiredTier: SubscriptionTier): boolean => {
      return currentLevel >= (TIER_HIERARCHY[requiredTier] || 0);
    },

    /** Check if a specific Professional feature is locked for this firm */
    isLocked: (feature: ProfessionalFeature): boolean => {
      return currentTier !== 'professional' && PROFESSIONAL_FEATURES.includes(feature);
    },

    /** Get human-readable label for a locked feature */
    getFeatureLabel: (feature: ProfessionalFeature): string => {
      return FEATURE_LABELS[feature] || feature;
    },

    /** Max users allowed (null = unlimited) */
    userLimit: tierInfo?.limits.max_users ?? (currentTier === 'professional' ? null : 10),

    /** Current active user count */
    currentUsers: tierInfo?.limits.current_users ?? 0,

    /** Users remaining before hitting the cap (null = unlimited) */
    usersRemaining: tierInfo?.limits.users_remaining ?? null,

    /** Whether the firm is at or above the user cap */
    atUserLimit: tierInfo
      ? tierInfo.limits.max_users !== null && tierInfo.limits.current_users >= tierInfo.limits.max_users
      : false,

    /** All Professional feature keys */
    professionalFeatures: PROFESSIONAL_FEATURES,

    /** Feature labels map */
    featureLabels: FEATURE_LABELS,
  };
}
