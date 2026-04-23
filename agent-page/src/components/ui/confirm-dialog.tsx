import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { Separator } from './separator';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info' | 'success';
  loading?: boolean;
}

// chart 配色: 1=信息 2=成功 4=警告 5=危险
const variantButtonClass: Record<string, string> = {
  danger: 'bg-chart-5 text-white hover:opacity-90',
  warning: 'bg-chart-4 text-white hover:opacity-90',
  info: 'bg-chart-1 text-white hover:opacity-90',
  success: 'bg-chart-2 text-white hover:opacity-90',
};

const variantTitleClass: Record<string, string> = {
  danger: 'text-chart-5',
  warning: 'text-chart-4',
  info: '',
  success: 'text-chart-2',
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = '继续',
  cancelText = '取消',
  variant = 'warning',
  loading = false,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className={cn(variantTitleClass[variant])}>
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <Separator />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={loading}
            className={cn(variantButtonClass[variant])}
          >
            {loading ? '处理中...' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const useConfirmDialog = () => {
  const [dialogState, setDialogState] = React.useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
    onConfirm?: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
  });

  const [loading, setLoading] = React.useState(false);

  const showConfirm = (options: {
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info' | 'success';
    onConfirm: () => void | Promise<void>;
  }) => {
    setDialogState({ isOpen: true, ...options });
  };

  const handleConfirm = async () => {
    if (dialogState.onConfirm) {
      setLoading(true);
      try {
        await dialogState.onConfirm();
      } finally {
        setLoading(false);
        setDialogState((prev) => ({ ...prev, isOpen: false }));
      }
    }
  };

  const handleClose = () => {
    if (!loading) {
      setDialogState((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const ConfirmDialogComponent = () => (
    <ConfirmDialog
      isOpen={dialogState.isOpen}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={dialogState.title}
      description={dialogState.description}
      confirmText={dialogState.confirmText}
      cancelText={dialogState.cancelText}
      variant={dialogState.variant}
      loading={loading}
    />
  );

  return { showConfirm, ConfirmDialog: ConfirmDialogComponent };
};
