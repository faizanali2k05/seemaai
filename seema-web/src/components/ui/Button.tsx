import React from 'react';

// Loose variant list — accepts the legacy aliases used across pages
// ('warning' renders as success-yellow, 'destructive' as danger). Falls back
// to 'primary' if an unknown value comes in.
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'danger'
  | 'outline'
  | 'ghost'
  | 'warning'
  | 'destructive';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Some pages pass `asChild` (shadcn pattern) — accepted but ignored. */
  asChild?: boolean;
  /** Some pages pass `as="div"` (polymorphic pattern) — accepted but ignored. */
  as?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    children,
    className,
    asChild: _asChild, // ignored — accepted for compat with shadcn callers
    as: _as, // ignored — accepted for compat with polymorphic callers
    ...props
  }, ref) => {
    const baseStyles =
      'font-medium rounded-lg transition-colors duration-200 inline-flex items-center justify-center gap-2 whitespace-nowrap';

    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-[#2563eb] text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
      secondary:
        'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed',
      success:
        'bg-[#059669] text-white hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
      danger:
        'bg-[#dc2626] text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
      outline:
        'border-2 border-[#2563eb] text-[#2563eb] hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-300 disabled:cursor-not-allowed',
      ghost:
        'text-[#2563eb] hover:bg-blue-50 disabled:text-gray-300 disabled:cursor-not-allowed',
      // Legacy aliases
      warning:
        'bg-[#d97706] text-white hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
      destructive:
        'bg-[#dc2626] text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed',
    };

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${variantStyles[variant] || variantStyles.primary} ${sizeStyles[size]} ${className || ''}`}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
