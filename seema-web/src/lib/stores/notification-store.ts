import { create } from 'zustand';
import type { Notification, PaginatedResponse } from '../types';
// Rename to avoid shadowing zustand's `get` setter inside the store body.
import { get as apiGet, post as apiPost, patch as apiPatch } from '../api-client';

interface NotificationState {
  // State
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  totalCount: number;
  page: number;
  perPage: number;

  // Actions
  fetchNotifications: (page?: number, perPage?: number) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  getUnreadCount: () => number;
  setNotifications: (notifications: Notification[]) => void;
}

/**
 * Zustand notification store
 */
export const useNotificationStore = create<NotificationState>((set, getState) => ({
  // Initial state
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  totalCount: 0,
  page: 1,
  perPage: 20,

  /**
   * Fetch notifications from API
   */
  fetchNotifications: async (page = 1, perPage = 20) => {
    set({ isLoading: true });
    try {
      const response = await apiGet<PaginatedResponse<Notification>>(
        `/notifications?page=${page}&per_page=${perPage}`
      );

      const unreadCount = response.items.filter((n: Notification) => !n.read).length;

      set({
        notifications: response.items,
        totalCount: response.total,
        unreadCount,
        page: response.page,
        perPage: response.per_page,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false });
      console.error('Failed to fetch notifications:', error);
      throw error;
    }
  },

  /**
   * Mark a single notification as read
   */
  markRead: async (id: string) => {
    try {
      await apiPatch<Notification>(`/notifications/${id}`, { read: true });

      set((state) => {
        const notifications = state.notifications.map((n) =>
          n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n
        );

        const unreadCount = notifications.filter((n) => !n.read).length;

        return {
          notifications,
          unreadCount,
        };
      });
    } catch (error) {
      console.error(`Failed to mark notification ${id} as read:`, error);
      throw error;
    }
  },

  /**
   * Mark all notifications as read
   */
  markAllRead: async () => {
    try {
      await apiPost<void>('/notifications/mark-all-read', {});

      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          read: true,
          read_at: new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      throw error;
    }
  },

  /**
   * Add a new notification to the list (optimistic update)
   */
  addNotification: (notification: Notification) => {
    set((state) => {
      const newNotifications = [notification, ...state.notifications];
      const unreadCount = newNotifications.filter((n) => !n.read).length;

      return {
        notifications: newNotifications,
        unreadCount,
        totalCount: state.totalCount + 1,
      };
    });
  },

  /**
   * Remove a notification from the list
   */
  removeNotification: (id: string) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      const unreadCount = notifications.filter((n) => !n.read).length;

      return {
        notifications,
        unreadCount,
        totalCount: Math.max(0, state.totalCount - 1),
      };
    });
  },

  /**
   * Clear all notifications
   */
  clearNotifications: () => {
    set({
      notifications: [],
      unreadCount: 0,
      totalCount: 0,
    });
  },

  /**
   * Get current unread count
   */
  getUnreadCount: (): number => {
    return getState().unreadCount;
  },

  /**
   * Directly set notifications (for manual updates)
   */
  setNotifications: (notifications: Notification[]) => {
    const unreadCount = notifications.filter((n) => !n.read).length;
    set({
      notifications,
      unreadCount,
      totalCount: notifications.length,
    });
  },
}));

/**
 * Helper to subscribe to unread count changes
 */
export const useUnreadCount = () => {
  return useNotificationStore((state) => state.unreadCount);
};

/**
 * Helper to get recent unread notifications
 */
export const getRecentUnread = (limit = 5): Notification[] => {
  const state = useNotificationStore.getState();
  return state.notifications.filter((n) => !n.read).slice(0, limit);
};
