import React from 'react';
import { Modal, ModalAction } from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'success' | 'warning' | 'destructive';
  className?: string;
  /** Optional body content to render below `message`. */
  children?: React.ReactNode;
  /** Alias for variant === 'danger'. */
  isDestructive?: boolean;
  /** Disables the confirm button + shows a spinner while pending. */
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  className = '',
  children,
  isDestructive,
  isLoading,
}) => {
  const effectiveVariant: ConfirmDialogProps['variant'] =
    isDestructive ? 'danger' : variant;
  const actions: ModalAction[] = [
    {
      label: cancelLabel,
      onClick: onCancel,
      variant: 'outline',
      disabled: isLoading,
    },
    {
      label: confirmLabel,
      onClick: onConfirm,
      variant: effectiveVariant,
      disabled: isLoading,
      loading: isLoading,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      actions={actions}
      className={className}
    >
      {message && <p className="text-gray-600">{message}</p>}
      {children}
    </Modal>
  );
};

ConfirmDialog.displayName = 'ConfirmDialog';
