'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Dynamic import to avoid Recharts SSR crash in production standalone builds
const MiniSparkline = dynamic(
  () => import('./Charts').then(m => ({ default: m.MiniSparkline })),
  { ssr: false }
);

export interface StatCardProps {
  title: string;
  value: string | number;
  /** Icon — pass JSX like `<Icon />` or a component reference like `Icon` */
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  trend?: number | string;
  trendDirection?: 'up' | 'down';
  color?: 'blue' | 'green' | 'amber' | 'red' | 'orange' | 'yellow' | 'teal' | 'purple';
  className?: string;
  /** Optional sparkline data — array of recent values */
  sparklineData?: number[];
  /** Optional subtitle/description below the value */
  subtitle?: string;
  /** Click handler */
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  trendDirection,
  color = 'blue',
  className = '',
  sparklineData,
  subtitle,
  onClick,
}) => {
  const colorMap: Record<string, { bg: string; text: string; border: string; sparkline: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-[#2563eb]', border: 'border-blue-200', sparkline: '#2563eb' },
    green: { bg: 'bg-green-50', text: 'text-[#059669]', border: 'border-green-200', sparkline: '#059669' },
    amber: { bg: 'bg-amber-50', text: 'text-[#d97706]', border: 'border-amber-200', sparkline: '#d97706' },
    red: { bg: 'bg-red-50', text: 'text-[#dc2626]', border: 'border-red-200', sparkline: '#dc2626' },
    orange: { bg: 'bg-orange-50', text: 'text-[#ea580c]', border: 'border-orange-200', sparkline: '#ea580c' },
    yellow: { bg: 'bg-yellow-50', text: 'text-[#ca8a04]', border: 'border-yellow-200', sparkline: '#ca8a04' },
    teal: { bg: 'bg-teal-50', text: 'text-[#0891b2]', border: 'border-teal-200', sparkline: '#0891b2' },
    purple: { bg: 'bg-purple-50', text: 'text-[#7c3aed]', border: 'border-purple-200', sparkline: '#7c3aed' },
  };

  const colors = colorMap[color] || colorMap.blue;

  const trendColor =
    trendDirection === 'up' ? 'text-[#059669]' : 'text-[#dc2626]';

  return (
    <div
      className={`bg-white border border-[#e2e5ed] rounded-xl p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 ${onClick ? 'cursor-pointer active:translate-y-0' : ''} ${className}`}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? title : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide leading-tight">
            {title}
          </p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {value}
            </p>
            {trend !== undefined && typeof trend === 'number' && (
              <div className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
                <span className="text-[10px]">
                  {trendDirection === 'up' ? '▲' : '▼'}
                </span>
                {Math.abs(trend)}%
              </div>
            )}
            {trend !== undefined && typeof trend === 'string' && (
              <span className="text-xs text-gray-500">{trend}</span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 ml-3">
          {icon && (
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-lg shadow-sm ${colors.bg} ${colors.text} ${colors.border} border`}
            >
              {React.isValidElement(icon)
                ? icon
                : React.createElement(icon as React.ComponentType<{ className?: string }>, { className: 'h-5 w-5' })}
            </div>
          )}
          {/* Sparkline removed — only render when data has real time-series context */}
        </div>
      </div>
    </div>
  );
};

StatCard.displayName = 'StatCard';
