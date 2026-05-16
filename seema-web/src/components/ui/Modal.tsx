import React, { useEffect } from 'react';
import { Button } from './Button';

export interface ModalAction {
  label: string;
  onClick: () => void | Promise<void>;
  // Loose variant — matches Button's expanded list.
  variant?:
    | 'primary'
    | 'secondary'
    | 'success'
    | 'danger'
    | 'outline'
    | 'ghost'
    | 'warning'
    | 'destructive';
  disabled?: boolean;
  loading?: boolean;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: ModalAction[];
  className?: string;
  /** Tailwind max-w token used for the dialog body. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
  /**
   * Convenience: if provided, renders a primary "submit" action button in
   * the footer that calls this handler. Used by ~10+ pages that pass
   * onSubmit/submitText/isLoading directly. Equivalent to passing actions
   * with one entry.
   */
  onSubmit?: () => void | Promise<void>;
  submitText?: string;
  isLoading?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  className = '',
  size,
  onSubmit,
  submitText = 'Submit',
  isLoading = false,
}) => {
  const sizeClass = size ? `max-w-${size}` : '';
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity duration-200 ${
        isOpen ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-lg w-full ${sizeClass || (className.includes('max-w-') ? '' : 'max-w-md')} mx-4 transform transition-all duration-200 ${
          isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-[#e2e5ed]">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-6">{children}</div>

        {(actions || onSubmit) && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-[#e2e5ed]">
            {actions?.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'primary'}
                onClick={() => { void action.onClick(); }}
                disabled={action.disabled}
                loading={action.loading}
              >
                {action.label}
              </Button>
            ))}
            {onSubmit && (
              <>
                <Button variant="outline" onClick={onClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => { void onSubmit(); }}
                  disabled={isLoading}
                >
                  {isLoading ? 'Working…' : submitText}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

Modal.displayName = 'Modal';
