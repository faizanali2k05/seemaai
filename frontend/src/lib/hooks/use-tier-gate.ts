'use client';

import { useEffect } from 'react';
// SUBSCRIPTIONS TEMPORARILY DISABLED — TIER_HIERARCHY no longer needed (gating bypassed)
import { useFirmStore, PROFESSIONAL_FEATURES, FEATURE_LABELS } from '../stores/firm-store';
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

  // ── SUBSCRIPTIONS TEMPORARILY DISABLED ──────────────────────────────────
  // All tier-gating is bypassed: every feature is treated as unlocked and no
  // user cap is enforced. The plan/limit infrastructure below is preserved so
  // subscriptions can be re-enabled later — just flip these return values back
  // to the tier-driven versions (kept in git history) when ready.
  return {
    /** Current tier name (kept for reference; gating ignores it) */
    tier: currentTier,

    /** Subscriptions disabled — treat everyone as fully unlocked */
    isPro: true,

    /** Full tier info from backend (null until loaded) */
    tierInfo,

    /** Subscriptions disabled — every tier check passes */
    canAccess: (_requiredTier: SubscriptionTier): boolean => true,

    /** Subscriptions disabled — no feature is ever locked */
    isLocked: (_feature: ProfessionalFeature): boolean => false,

    /** Get human-readable label for a feature */
    getFeatureLabel: (feature: ProfessionalFeature): string => {
      return FEATURE_LABELS[feature] || feature;
    },

    /** Subscriptions disabled — unlimited users */
    userLimit: null,

    /** Current active user count */
    currentUsers: tierInfo?.limits.current_users ?? 0,

    /** Subscriptions disabled — unlimited users remaining */
    usersRemaining: null,

    /** Subscriptions disabled — never at a user cap */
    atUserLimit: false,

    /** All Professional feature keys */
    professionalFeatures: PROFESSIONAL_FEATURES,

    /** Feature labels map */
    featureLabels: FEATURE_LABELS,
  };
}
