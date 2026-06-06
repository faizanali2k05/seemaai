import React from 'react';

export interface SelectOption {
  value: string | number;
  label: string;
}

// `onChange` keeps the native ChangeEvent signature so existing
// `onChange={(e) => …}` callers continue to type-check. For callers that
// just want the string value (e.g. `onValueChange={setX}`), use
// `onValueChange` — when provided, it's called with `e.target.value`.
export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  // Explicit re-declaration so contextual typing always fires for
  // `<Select onChange={(e) => …}>` inline handlers.
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  onValueChange?: (value: string) => void;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, placeholder, className, onChange, onValueChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange?.(e);
      onValueChange?.(e.target.value);
    };
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <select
          ref={ref}
          onChange={handleChange}
          className={`w-full px-4 py-2 border rounded-lg text-gray-900 bg-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent appearance-none cursor-pointer ${
            error
              ? 'border-[#dc2626] focus:ring-[#dc2626]'
              : 'border-[#e2e5ed] hover:border-[#2563eb]'
          } ${className || ''}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-[#dc2626] mt-1">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
