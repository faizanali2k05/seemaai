import React from 'react';

export interface CardProps {
  title?: string;
  padding?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
  /** Optional click handler — several pages render Card as a clickable tile. */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const Card: React.FC<CardProps> = ({
  title,
  padding = 'md',
  children,
  className = '',
  onClick,
}) => {
  const paddingStyles = {
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-[#e2e5ed] rounded-xl shadow-sm transition-all duration-200 hover:shadow-md ${onClick ? 'cursor-pointer hover:border-blue-200 hover:-translate-y-0.5 active:translate-y-0' : ''} ${paddingStyles[padding]} ${className}`}
    >
      {title && (
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      )}
      {children}
    </div>
  );
};

Card.displayName = 'Card';
