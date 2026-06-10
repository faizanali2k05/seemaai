import React from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-4 py-2 border rounded-lg text-gray-900 placeholder-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)] ${
            error
              ? 'border-[#dc2626] focus:ring-[#dc2626] focus:shadow-[0_0_0_4px_rgba(220,38,38,0.08)]'
              : 'border-[#e2e5ed] hover:border-[#2563eb]'
          } ${className || ''}`}
          {...props}
        />
        {error && <p className="text-sm text-[#dc2626] mt-1">{error}</p>}
        {helper && !error && (
          <p className="text-sm text-gray-500 mt-1">{helper}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
