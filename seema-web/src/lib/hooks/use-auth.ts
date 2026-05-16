import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '../stores/auth-store';
import type { User, UserRole } from '../types';

interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasRole: (role: UserRole) => boolean;
  canAccess: (minRole: UserRole) => boolean;
  refreshSession: () => Promise<void>;
}

/**
 * Custom hook for auth with automatic redirect
 * Wraps useAuthStore with convenient methods
 */
export function useAuth(requireAuth = false): UseAuthReturn {
  const router = useRouter();
  const pathname = usePathname();

  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const hasRole = useAuthStore((state) => state.hasRole);
  const canAccess = useAuthStore((state) => state.canAccess);
  const refreshSession = useAuthStore((state) => state.refreshSession);

  /**
   * Check authentication and redirect if needed.
   * Wait for Zustand hydration to complete before redirecting —
   * otherwise a page reload will flash to /login before the store restores.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Skip auth check on public pages
    if (pathname === '/login' || pathname === '/register' || pathname === '/onboarding') return;

    // Wait until Zustand has rehydrated from localStorage
    if (!isHydrated) return;

    // If auth is required and user is not authenticated, redirect to login
    if (requireAuth && !isAuthenticated && !isLoading) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, isHydrated, requireAuth, router, pathname]);

  return {
    user,
    isAuthenticated,
    isLoading,
    accessToken,
    login,
    logout,
    hasRole,
    canAccess,
    refreshSession,
  };
}

/**
 * Hook to require authentication
 * Redirects to /login if not authenticated
 */
export function useRequireAuth(): UseAuthReturn {
  return useAuth(true);
}

/**
 * Hook to check if user has a specific role
 */
export function useHasRole(requiredRole: UserRole): boolean {
  const hasRole = useAuthStore((state) => state.hasRole);
  return hasRole(requiredRole);
}

/**
 * Hook to check if user can access a feature
 */
export function useCanAccess(minRole: UserRole): boolean {
  const canAccess = useAuthStore((state) => state.canAccess);
  return canAccess(minRole);
}

/**
 * Hook to get current user
 */
export function useUser(): User | null {
  return useAuthStore((state) => state.user);
}

/**
 * Hook to get current access token
 */
export function useAccessToken(): string | null {
  return useAuthStore((state) => state.accessToken);
}

/**
 * Hook to perform login
 */
export function useLogin() {
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);

  return {
    login,
    isLoading,
  };
}

/**
 * Hook to perform logout
 */
export function useLogout() {
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return {
    logout: handleLogout,
  };
}

/**
 * Hook to check authentication status
 */
export function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.isAuthenticated);
}

/**
 * Hook to get authentication loading state
 */
export function useAuthLoading(): boolean {
  return useAuthStore((state) => state.isLoading);
}
