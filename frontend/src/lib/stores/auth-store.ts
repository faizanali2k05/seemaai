import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole, LoginRequest, LoginResponse } from '../types';
import { ROLE_HIERARCHY } from '../utils/constants';
import { post } from '../api-client';

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isHydrated: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  setUser: (user: User | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  hasRole: (requiredRole: UserRole) => boolean;
  canAccess: (minRole: UserRole) => boolean;
}

/**
 * Zustand auth store with localStorage persistence
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isHydrated: false,

      /**
       * Login with email and password
       */
      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await post<LoginResponse>('/auth/login', {
            email,
            password,
          } as LoginRequest);

          const { user, accessToken, refreshToken } = response;

          // Store tokens in localStorage
          if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
          }

          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      /**
       * Logout user and clear session
       */
      logout: () => {
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
        }

        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },

      /**
       * Refresh authentication session
       */
      refreshSession: async () => {
        const state = get();
        if (!state.refreshToken) {
          get().logout();
          return;
        }

        try {
          const response = await post<LoginResponse>('/auth/refresh', {
            refresh_token: state.refreshToken,
          });

          const { accessToken, refreshToken } = response;

          if (typeof window !== 'undefined') {
            localStorage.setItem('accessToken', accessToken);
            if (refreshToken) {
              localStorage.setItem('refreshToken', refreshToken);
            }
          }

          set({
            accessToken,
            refreshToken: refreshToken || state.refreshToken,
          });
        } catch (error) {
          get().logout();
          throw error;
        }
      },

      /**
       * Set user information
       */
      setUser: (user: User | null) => {
        if (user) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('user', JSON.stringify(user));
          }
        } else {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('user');
          }
        }
        set({ user, isAuthenticated: !!user });
      },

      /**
       * Set authentication tokens
       */
      setTokens: (accessToken: string, refreshToken: string) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
        }
        set({ accessToken, refreshToken });
      },

      /**
       * Check if user has a specific role
       * Uses role hierarchy: colp > partner > admin > solicitor > staff
       */
      hasRole: (requiredRole: UserRole): boolean => {
        const state = get();
        if (!state.user) return false;

        const userHierarchy = ROLE_HIERARCHY[state.user.role] || 0;
        const requiredHierarchy = ROLE_HIERARCHY[requiredRole] || 0;

        return userHierarchy >= requiredHierarchy;
      },

      /**
       * Check if user can access a feature requiring minimum role
       */
      canAccess: (minRole: UserRole): boolean => {
        return get().hasRole(minRole);
      },
    }),

    {
      name: 'auth-store',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      version: 1,
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Validate restored data
          if (state.user && typeof state.user !== 'object') {
            state.user = null;
            state.isAuthenticated = false;
          }
          state.isHydrated = true;
        }
      },
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          return persistedState;
        }
        return persistedState as AuthState;
      },
    }
  )
);

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  if (typeof window === 'undefined') return false;
  const state = useAuthStore.getState();
  return state.isAuthenticated && !!state.accessToken;
};

/**
 * Get current user
 */
export const getCurrentUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().user;
};

/**
 * Get current access token
 */
export const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().accessToken;
};
