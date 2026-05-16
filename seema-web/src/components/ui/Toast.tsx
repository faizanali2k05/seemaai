import { Toaster, toast } from 'react-hot-toast';
import React from 'react';

export interface ToastOptions {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

const defaultOptions: ToastOptions = {
  duration: 4000,
  position: 'bottom-right',
};

// `warning` is accepted as a synonym for `error` to avoid breaking callers.
export type ToastType = 'success' | 'error' | 'info' | 'warning';

export const showToast = (
  message: string,
  type: ToastType = 'info',
  options?: ToastOptions,
) => {
  // Map warning → error for styling/icon purposes.
  if (type === 'warning') type = 'error';
  const mergedOptions = { ...defaultOptions, ...options };

  const Icon: Record<'success' | 'error' | 'info', React.ReactNode> = {
    success: (
      <svg
        className="w-5 h-5 text-[#059669]"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
    error: (
      <svg
        className="w-5 h-5 text-[#dc2626]"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    ),
    info: (
      <svg
        className="w-5 h-5 text-[#2563eb]"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
  };

  toast.custom((t) => (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
        type === 'success'
          ? 'bg-[#059669] text-white'
          : type === 'error'
            ? 'bg-[#dc2626] text-white'
            : 'bg-[#2563eb] text-white'
      }`}
    >
      {Icon[type]}
      <p className="font-medium">{message}</p>
    </div>
  ), {
    duration: mergedOptions.duration,
    position: mergedOptions.position as any,
  });
};

export const SeemaToaster = () => (
  <Toaster
    position="bottom-right"
    reverseOrder={false}
    toastOptions={{
      duration: 4000,
      style: {
        background: 'transparent',
        boxShadow: 'none',
        padding: '0',
      },
    }}
  />
);

export { toast };
