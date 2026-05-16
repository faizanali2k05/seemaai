'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth-store';
import apiClient from '@/lib/api';
import { showToast } from '@/components/ui/Toast';

interface Notification {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  entity_id: string;
  entity_type: string;
  created_at: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  total: number;
}

export default function NotificationBell() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initialCheckRef = useRef(false);

  // Fetch notifications
  const fetchNotifications = async () => {
    if (!isAuthenticated) return;

    try {
      setIsLoading(true);
      const response = await apiClient.get<NotificationsResponse>('/dashboard/notifications');
      const newNotifications = response.data.notifications;

      // Sort by severity: critical first, then high, then medium
      const severityOrder: Record<Notification['severity'], number> = {
        critical: 0, high: 1, medium: 2, low: 3,
      };
      newNotifications.sort(
        (a: Notification, b: Notification) =>
          severityOrder[a.severity] - severityOrder[b.severity]
      );

      setNotifications(newNotifications);

      // On first check, show toast if there are critical notifications
      if (!initialCheckRef.current && newNotifications.some((n: Notification) => n.severity === 'critical')) {
        const criticalCount = newNotifications.filter((n: Notification) => n.severity === 'critical').length;
        showToast(
          `You have ${criticalCount} critical notification${criticalCount > 1 ? 's' : ''}`,
          'error',
          { position: 'top-right' }
        );
      }
      initialCheckRef.current = true;
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount and set up polling
  useEffect(() => {
    if (!isAuthenticated) return;

    // Fetch immediately
    fetchNotifications();

    // Set up polling every 60 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchNotifications();
    }, 60000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isAuthenticated]);

  // Handle clicks outside the panel
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    // Navigate based on entity_type
    const navigationMap: Record<string, string> = {
      staff: '/staff',
      case: '/alerts',
      intake: '/intake',
      supervision: '/supervision',
    };

    const destination = navigationMap[notification.entity_type] || '/alerts';
    router.push(destination);
    setIsOpen(false);
  };

  const formatRelativeTime = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getSeverityDotColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-blue-500';
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label={`Notifications (${unreadCount})`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full w-6 h-6">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">
                <div className="animate-pulse">Loading notifications...</div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">
                <AlertCircle size={24} className="mx-auto mb-2 text-gray-400" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-start gap-3"
                  >
                    {/* Severity Dot */}
                    <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${getSeverityDotColor(notification.severity)}`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatRelativeTime(notification.created_at)}
                      </p>
                    </div>

                    {/* Severity Badge */}
                    <div className="flex-shrink-0">
                      <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${getSeverityColor(notification.severity)}`}>
                        {notification.severity.charAt(0).toUpperCase() + notification.severity.slice(1)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
            <a
              href="/alerts"
              onClick={() => setIsOpen(false)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all alerts →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
