'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Scan, AlertCircle, RotateCcw, ChevronRight } from 'lucide-react';

/**
 * Visual workflow strip that lives at the top of the three pages that form
 * the compliance health loop: Scan → Alerts → Remediation. Each page sees
 * the same strip so the COLP understands they're in a multi-step flow and
 * can jump between views without diving back into the sidebar.
 *
 * The current page is highlighted; the others are clickable links.
 */
const STEPS = [
  { href: '/compliance-scan', label: 'Compliance Scan', icon: Scan },
  { href: '/alerts',          label: 'Alerts',          icon: AlertCircle },
  { href: '/remediation',     label: 'Remediation',     icon: RotateCcw },
];

export function ComplianceFlowNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg overflow-x-auto">
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const isActive = pathname === step.href || pathname?.startsWith(step.href + '/');
        return (
          <div key={step.href} className="flex items-center gap-1 flex-shrink-0">
            <Link
              href={step.href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-100 text-blue-800'
                  : 'text-gray-600 hover:bg-white hover:text-gray-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {step.label}
            </Link>
            {idx < STEPS.length - 1 && (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}
