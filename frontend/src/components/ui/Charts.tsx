'use client';

import React, { useId } from 'react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface MiniSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

interface TrendChartProps {
  data: Array<Record<string, any>>;
  dataKey: string;
  xAxisKey: string;
  color?: string;
  height?: number;
  showGrid?: boolean;
  title?: string;
}

interface DonutChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  size?: number;
  innerRadius?: number;
  title?: string;
  centerLabel?: string;
  centerValue?: string | number;
}

interface ComplianceGaugeProps {
  value: number;
  label: string;
  size?: number;
}

interface BarChartCardProps {
  data: Array<Record<string, any>>;
  dataKey: string;
  xAxisKey: string;
  color?: string;
  height?: number;
  title?: string;
}

interface TimelineItem {
  id: string | number;
  title: string;
  description?: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'error';
  icon?: React.ReactNode;
}

interface ActivityTimelineProps {
  items: TimelineItem[];
}

// ============================================================================
// SEEMA COLOR PALETTE
// ============================================================================

const SEEMA_COLORS = {
  primary: '#2563eb',
  accent: '#7c3aed',
  green: '#059669',
  amber: '#d97706',
  red: '#dc2626',
  teal: '#0891b2',
};

const TYPE_COLORS: Record<string, string> = {
  info: SEEMA_COLORS.primary,
  success: SEEMA_COLORS.green,
  warning: SEEMA_COLORS.amber,
  error: SEEMA_COLORS.red,
};

// ============================================================================
// MINI SPARKLINE
// ============================================================================

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  color = SEEMA_COLORS.primary,
  width = 80,
  height = 32,
}) => {
  const chartData = data.map((value, index) => ({
    value,
    index,
  }));

  const reactId = useId();
  const gradientId = `sparkline-${reactId}`;

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={true}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// TREND CHART
// ============================================================================

export const TrendChart: React.FC<TrendChartProps> = ({
  data,
  dataKey,
  xAxisKey,
  color = SEEMA_COLORS.primary,
  height = 200,
  showGrid = true,
  title,
}) => {
  const reactId = useId();
  const gradientId = `trend-${reactId}`;

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {title && (
        <h3 className="mb-4 text-sm font-semibold text-gray-900">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {showGrid && (
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          )}
          <XAxis
            dataKey={xAxisKey}
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
          />
          <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: `1px solid ${color}`,
              borderRadius: '0.375rem',
            }}
            wrapperStyle={{ outline: 'none' }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// DONUT CHART
// ============================================================================

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 160,
  innerRadius = 50,
  title,
  centerLabel,
  centerValue,
}) => {
  const outerRadius = size / 2;

  return (
    <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {title && (
        <h3 className="mb-4 text-sm font-semibold text-gray-900">{title}</h3>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              dataKey="value"
              animationDuration={1000}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center label overlay — positioned outside PieChart for reliable rendering */}
        {(centerValue !== undefined || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centerValue !== undefined && (
              <span className="text-sm font-semibold text-gray-900">{centerValue}</span>
            )}
            {centerLabel && (
              <span className="text-[11px] text-gray-500">{centerLabel}</span>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-600">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// COMPLIANCE GAUGE (SVG-based)
// ============================================================================

export const ComplianceGauge: React.FC<ComplianceGaugeProps> = ({
  value,
  label,
  size = 120,
}) => {
  const clampedValue = Math.min(Math.max(value, 0), 100);
  const percentage = clampedValue / 100;

  // Determine color based on value
  let color = SEEMA_COLORS.red;
  if (percentage >= 0.75) {
    color = SEEMA_COLORS.green;
  } else if (percentage >= 0.5) {
    color = SEEMA_COLORS.amber;
  }

  // SVG semi-circle gauge
  const radius = size / 2 - 12;
  const circumference = Math.PI * radius;
  const offset = circumference * (1 - percentage);
  const centerX = size / 2;
  const centerY = size / 2;

  return (
    <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        {/* Background arc */}
        <path
          d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        {/* Progress arc */}
        <path
          d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
        />
      </svg>
      <div className="mt-2 text-center">
        <div className="text-xl font-bold text-gray-900">{Math.round(clampedValue)}%</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
};

// ============================================================================
// BAR CHART CARD
// ============================================================================

export const BarChartCard: React.FC<BarChartCardProps> = ({
  data,
  dataKey,
  xAxisKey,
  color = SEEMA_COLORS.primary,
  height = 200,
  title,
}) => {
  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {title && (
        <h3 className="mb-4 text-sm font-semibold text-gray-900">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey={xAxisKey}
            stroke="#9ca3af"
            style={{ fontSize: '12px' }}
          />
          <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: `1px solid ${color}`,
              borderRadius: '0.375rem',
            }}
            wrapperStyle={{ outline: 'none' }}
          />
          <Bar
            dataKey={dataKey}
            fill={color}
            radius={[8, 8, 0, 0]}
            animationDuration={1000}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ============================================================================
// ACTIVITY TIMELINE
// ============================================================================

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ items }) => {
  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-6 text-sm font-semibold text-gray-900">Recent Activity</h3>
      <div className="space-y-6">
        {items.map((item, index) => {
          const typeColor = TYPE_COLORS[item.type];
          const isLast = index === items.length - 1;

          return (
            <div key={item.id} className="relative flex gap-4">
              {/* Timeline line */}
              {!isLast && (
                <div
                  className="absolute left-[5px] top-4 w-0.5 bg-gray-200"
                  style={{ height: 'calc(100% + 8px)' }}
                />
              )}

              {/* Timeline dot */}
              <div className="relative flex flex-col items-center">
                <div
                  className="h-3 w-3 rounded-full border-2 border-white"
                  style={{
                    backgroundColor: typeColor,
                    boxShadow: `0 0 8px ${typeColor}40`,
                  }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium text-gray-900">
                    {item.title}
                  </h4>
                  {item.icon && (
                    <span className="text-gray-400">{item.icon}</span>
                  )}
                </div>
                {item.description && (
                  <p className="mt-1 text-xs text-gray-600">
                    {item.description}
                  </p>
                )}
                <time className="mt-1 text-xs text-gray-400">
                  {item.time}
                </time>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
