// Auth hooks
export {
  useAuth,
  useRequireAuth,
  useHasRole,
  useCanAccess,
  useUser,
  useAccessToken,
  useLogin,
  useLogout,
  useIsAuthenticated,
  useAuthLoading,
} from './use-auth';

// API hooks
export { useApi, useApiMutation, useApiList } from './use-api';

// Debounce/throttle hooks
export {
  useDebounce,
  useDebouncedCallback,
  useDebouncedValue,
  useThrottle,
} from './use-debounce';

// Tier gating hooks
export { useTierGate } from './use-tier-gate';

// DB-driven combobox option lists (client names / matter refs / conflict parties)
export { useClientMatterOptions } from './use-client-matter-options';
export type { ClientMatterOptions } from './use-client-matter-options';
