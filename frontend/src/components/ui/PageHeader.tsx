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
      className={`flex items-start justify-between gap-4 mb-6 ${className}`}
    >
      <div className="flex-1">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
};

PageHeader.displayName = 'PageHeader';
