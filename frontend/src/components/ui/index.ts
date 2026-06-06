// Core Components
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { Input } from './Input';
export type { InputProps } from './Input';

export { Select } from './Select';
export type { SelectProps, SelectOption } from './Select';

export { Card } from './Card';
export type { CardProps } from './Card';

// Data Display Components
export { DataTable } from './DataTable';
export type { DataTableProps, Column } from './DataTable';

export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps } from './StatusBadge';

// Feedback Components
export { LoadingSpinner } from './LoadingSpinner';
export type { LoadingSpinnerProps } from './LoadingSpinner';

export { Modal } from './Modal';
export type { ModalProps, ModalAction } from './Modal';

export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

// Layout Components
export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { Tabs } from './Tabs';
export type { TabsProps, Tab } from './Tabs';

// Search & Navigation
export { SearchBar } from './SearchBar';
export type { SearchBarProps } from './SearchBar';

export { ComplianceFlowNav } from './ComplianceFlowNav';

// Toast Notifications
export { showToast, SeemaToaster, toast } from './Toast';
export type { ToastOptions } from './Toast';

// Charts & Data Visualization
// NOTE: Chart components use Recharts which crashes during SSR.
// Import them dynamically with { ssr: false } instead:
//   const TrendChart = dynamic(() => import('@/components/ui/Charts').then(m => m.TrendChart), { ssr: false });
// Do NOT re-export here — barrel exports eagerly evaluate the module.

// Loading Skeletons
export {
  Skeleton,
  SkeletonCard,
  SkeletonTable,
  SkeletonChart,
  DashboardSkeleton,
} from './Skeleton';

// Tier Gating Components
export { UpgradeGate, TierBadge, UserLimitWarning, ProBadge } from './UpgradeGate';
export type { UpgradeGateProps, TierBadgeProps, UserLimitWarningProps, ProBadgeProps } from './UpgradeGate';
