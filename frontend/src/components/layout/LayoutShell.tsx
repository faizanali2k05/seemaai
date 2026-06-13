'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import NotificationBell from '../NotificationBell';
import { useAuthStore } from '@/lib/stores/auth-store';

const NO_SIDEBAR_ROUTES = ['/login', '/onboarding', '/register'];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const hideSidebar = NO_SIDEBAR_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  // Auth gate: on protected routes, once the store has rehydrated, send
  // unauthenticated users to /login. Doing this here (rather than letting each
  // page render then bounce) prevents the dashboard "flashing" for a second
  // before the redirect.
  useEffect(() => {
    if (hideSidebar) return;
    if (!isHydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [hideSidebar, isHydrated, isAuthenticated, router]);

  // Public pages (login/register/onboarding) render without the shell.
  if (hideSidebar) {
    return <>{children}</>;
  }

  // Protected pages: don't render anything until we know the auth state.
  // While hydrating, or when not authenticated (about to redirect), show a
  // neutral loading screen instead of the dashboard.
  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-seema-page-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-seema-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-seema-page-bg">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
          {/* pl-16 on mobile leaves room for the floating hamburger button */}
          <div className="max-w-[1400px] mx-auto px-6 py-4 lg:px-8 flex justify-end pl-16 lg:pl-8">
            <NotificationBell />
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
