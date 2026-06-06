import { create } from 'zustand';
import type { Firm, SubscriptionTier } from '../types';
import { get, put } from '../api-client';

// ---------------------------------------------------------------------------
// Tier configuration — mirrors backend middleware/tier_gate.py
// ---------------------------------------------------------------------------
export const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  essentials: 1,
  professional: 2,
};

export const TIER_LIMITS: Record<SubscriptionTier, { maxUsers: number | null }> = {
  essentials: { maxUsers: 10 },
  professional: { maxUsers: null },  // unlimited
};

/** Features only available on Professional */
export const PROFESSIONAL_FEATURES = [
  'multi_department_views',
  'custom_report_builder',
  'risk_heatmap',
  'bulk_training_assignments',
  'advanced_audit_exports',
  'unlimited_users',
] as const;

export type ProfessionalFeature = (typeof PROFESSIONAL_FEATURES)[number];

/** Human-readable labels for gated features */
export const FEATURE_LABELS: Record<ProfessionalFeature, string> = {
  multi_department_views: 'Multi-Department Views',
  custom_report_builder: 'Custom Report Builder',
  risk_heatmap: 'Firm-Wide Risk Heatmap',
  bulk_training_assignments: 'Bulk Training Assignments',
  advanced_audit_exports: 'Advanced Audit Exports',
  unlimited_users: 'Unlimited User Accounts',
};

// ---------------------------------------------------------------------------
// Tier info from the backend /tier/info endpoint
// ---------------------------------------------------------------------------
export interface TierInfo {
  tier: SubscriptionTier;
  tier_level: number;
  limits: {
    max_users: number | null;
    current_users: number;
    users_remaining: number | null;
  };
  professional_features_locked: boolean;
  locked_features: string[];
}

interface FirmState {
  // State
  firm: Firm | null;
  tierInfo: TierInfo | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchFirm: (firmId?: string) => Promise<void>;
  fetchTierInfo: () => Promise<void>;
  updateFirm: (firmId: string, data: Partial<Firm>) => Promise<void>;
  setFirm: (firm: Firm | null) => void;
  clearError: () => void;
}

/**
 * Zustand firm store
 */
export const useFirmStore = create<FirmState>((set) => ({
  // Initial state
  firm: null,
  tierInfo: null,
  isLoading: false,
  error: null,

  fetchFirm: async (firmId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const url = firmId ? `/firms/${firmId}` : '/firms/current';
      const firmData = await get<Firm>(url);
      set({ firm: firmData, isLoading: false });
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.data?.message || 'Failed to fetch firm data';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  fetchTierInfo: async () => {
    try {
      const info = await get<TierInfo>('/tier/info');
      set({ tierInfo: info });
    } catch (error: any) {
      // Non-critical — don't block the app if this fails
      console.warn('Failed to fetch tier info:', error?.message);
    }
  },

  updateFirm: async (firmId: string, data: Partial<Firm>) => {
    set({ isLoading: true, error: null });
    try {
      const updatedFirm = await put<Firm>(`/firms/${firmId}`, data);
      set({ firm: updatedFirm, isLoading: false });
    } catch (error: any) {
      const errorMessage =
        error?.message || error?.data?.message || 'Failed to update firm data';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  setFirm: (firm: Firm | null) => {
    set({ firm, error: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// ---------------------------------------------------------------------------
// Convenience helpers (can be called outside React components)
// ---------------------------------------------------------------------------

export const isFirmOnboarded = (): boolean => {
  const state = useFirmStore.getState();
  return state.firm?.onboarding_status === 'completed';
};

export const getFirmPracticeAreas = () => {
  const state = useFirmStore.getState();
  return state.firm?.practice_areas || [];
};

export const getFirmTier = (): SubscriptionTier => {
  const state = useFirmStore.getState();
  return state.firm?.subscription_tier || 'essentials';
};

export const canAccessFeature = (requiredTier: SubscriptionTier): boolean => {
  const currentTier = getFirmTier();
  return (TIER_HIERARCHY[currentTier] || 0) >= (TIER_HIERARCHY[requiredTier] || 0);
};

export const isProfessional = (): boolean => {
  return getFirmTier() === 'professional';
};

export const isFeatureLocked = (feature: ProfessionalFeature): boolean => {
  return !isProfessional() && PROFESSIONAL_FEATURES.includes(feature);
};

export const getUserLimit = (): number | null => {
  const tier = getFirmTier();
  return TIER_LIMITS[tier]?.maxUsers ?? null;
};

export const getUsersRemaining = (): number | null => {
  const state = useFirmStore.getState();
  if (!state.tierInfo) return null;
  return state.tierInfo.limits.users_remaining;
};

export const getFirmSRANumber = (): string => {
  const state = useFirmStore.getState();
  return state.firm?.sra_number || '';
};
