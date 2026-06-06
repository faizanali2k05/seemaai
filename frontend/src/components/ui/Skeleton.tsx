import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

/**
 * Base Skeleton component - a reusable loading placeholder with shimmer animation
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
  width,
  height,
}) => {
  const baseClasses = 'animate-pulse bg-gray-200';

  let variantClasses = '';
  switch (variant) {
    case 'circular':
      variantClasses = 'rounded-full';
      break;
    case 'rectangular':
      variantClasses = 'rounded-lg';
      break;
    case 'text':
    default:
      variantClasses = 'rounded';
      break;
  }

  const widthStyle = width ? (typeof width === 'number' ? `${width}px` : width) : '100%';
  const heightStyle = height ? (typeof height === 'number' ? `${height}px` : height) : undefined;

  return (
    <div
      className={`${baseClasses} ${variantClasses} ${className}`}
      style={{
        width: widthStyle,
        height: heightStyle || (variant === 'circular' ? widthStyle : '16px'),
      }}
    />
  );
};

interface SkeletonCardProps {
  className?: string;
}

/**
 * SkeletonCard - A card-shaped skeleton matching StatCard layout
 * Shows title bar, large value bar, and icon placeholder
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({ className = '' }) => {
  return (
    <div className={`bg-white border border-[#e2e5ed] rounded-lg shadow-sm p-6 ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Title skeleton */}
          <Skeleton variant="text" width="60%" height={14} className="mb-3" />

          {/* Value skeleton - larger */}
          <Skeleton variant="rectangular" width="80%" height={32} className="mb-2" />

          {/* Subtitle/label skeleton */}
          <Skeleton variant="text" width="45%" height={12} />
        </div>

        {/* Icon area skeleton */}
        <Skeleton
          variant="circular"
          width={48}
          height={48}
          className="ml-4 flex-shrink-0"
        />
      </div>
    </div>
  );
};

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/**
 * SkeletonTable - Table skeleton with header and body rows
 * Shows darker header skeletons and lighter body skeletons
 */
export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  className = '',
}) => {
  return (
    <div className={`w-full ${className}`}>
      {/* Table header */}
      <div className="grid gap-4 p-4 bg-gray-50 rounded-t-lg border-b border-[#e2e5ed]" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={`header-${i}`}
            variant="text"
            width="80%"
            height={16}
            className="bg-gray-300"
          />
        ))}
      </div>

      {/* Table body rows */}
      <div className="border border-t-0 border-[#e2e5ed] rounded-b-lg overflow-hidden">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            className="grid gap-4 p-4 border-b border-[#e2e5ed] last:border-b-0"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={`cell-${rowIdx}-${colIdx}`}
                variant="text"
                width="70%"
                height={14}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

interface SkeletonChartProps {
  height?: number;
  className?: string;
}

/**
 * SkeletonChart - Chart placeholder with hint of bar/line shapes
 * Shows a rectangular skeleton with internal visual hints
 */
export const SkeletonChart: React.FC<SkeletonChartProps> = ({
  height = 200,
  className = '',
}) => {
  return (
    <div className={`bg-white border border-[#e2e5ed] rounded-lg shadow-sm p-6 ${className}`}>
      {/* Chart title skeleton */}
      <Skeleton variant="text" width="40%" height={16} className="mb-6" />

      {/* Chart content area */}
      <div className="relative w-full" style={{ height: `${height}px` }}>
        {/* Simulate bar/line chart with multiple skeleton bars at different heights */}
        <div className="flex items-end justify-around h-full gap-2 px-2">
          {[0.7, 0.9, 0.6, 0.8, 0.85, 0.75].map((heightPercent, idx) => (
            <div key={`bar-${idx}`} className="flex-1 flex flex-col items-center justify-end">
              <Skeleton
                variant="rectangular"
                width="100%"
                height={Math.round(height * heightPercent * 0.8)}
                className="rounded-t"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Chart legend skeleton */}
      <div className="flex gap-4 mt-6 pt-4 border-t border-[#e2e5ed]">
        {[1, 2].map((item) => (
          <div key={`legend-${item}`} className="flex items-center gap-2">
            <Skeleton
              variant="circular"
              width={12}
              height={12}
              className="bg-gray-300"
            />
            <Skeleton variant="text" width={80} height={12} />
          </div>
        ))}
      </div>
    </div>
  );
};

interface DashboardSkeletonProps {
  className?: string;
}

/**
 * DashboardSkeleton - Full dashboard skeleton layout
 * Shows: greeting, status banner, 6 stat cards in grid, and 2 charts side by side
 */
export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ className = '' }) => {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Greeting section skeleton */}
      <div className="space-y-2">
        <Skeleton variant="text" width="30%" height={28} />
        <Skeleton variant="text" width="50%" height={14} />
      </div>

      {/* Status banner skeleton */}
      <div className="bg-white border border-[#e2e5ed] rounded-lg shadow-sm p-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="circular" width={20} height={20} className="flex-shrink-0" />
          <Skeleton variant="text" width="60%" height={14} />
        </div>
      </div>

      {/* Stat cards grid - 6 cards in 2 rows of 3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <SkeletonCard key={`stat-card-${idx}`} />
        ))}
      </div>

      {/* Charts section - 2 charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SkeletonChart height={250} />
        <SkeletonChart height={250} />
      </div>
    </div>
  );
};

export default Skeleton;
