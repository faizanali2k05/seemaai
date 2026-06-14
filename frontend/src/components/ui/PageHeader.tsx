import React from 'react';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  description,
  children,
  className = '',
}) => {
  const sub = subtitle || description;
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 mb-6 ${className}`}
    >
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {children && (
        // On mobile the action buttons stack and go full-width for an easy tap
        // target; from sm up they sit inline on the right as before.
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 [&>*]:w-full sm:[&>*]:w-auto">
          {children}
        </div>
      )}
    </div>
  );
};

PageHeader.displayName = 'PageHeader';
