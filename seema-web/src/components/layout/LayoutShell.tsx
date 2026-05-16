'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import NotificationBell from '../NotificationBell';

const NO_SIDEBAR_ROUTES = ['/login', '/onboarding', '/register'];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideSidebar = NO_SIDEBAR_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-seema-page-bg">
        {/* Top Bar */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-[1400px] mx-auto px-6 py-4 lg:px-8 flex justify-end">
            <NotificationBell />
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[1400px] mx-auto px-6 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
