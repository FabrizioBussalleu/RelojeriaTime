'use client';

// Diálogo accesible del panel (foco atrapado, Escape, lector de pantalla) sobre Radix.
import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonClass } from './ui';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/75" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col border border-border bg-card text-foreground shadow-2xl focus:outline-none',
            widths[size]
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <RadixDialog.Title className="font-display text-lg tracking-wide">{title}</RadixDialog.Title>
              {description ? <RadixDialog.Description className="mt-1 text-sm text-muted-foreground">{description}</RadixDialog.Description> : null}
            </div>
            <RadixDialog.Close className="p-1 text-muted-foreground hover:text-foreground" aria-label="Cerrar">
              <X className="h-5 w-5" aria-hidden />
            </RadixDialog.Close>
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

// Confirmación de acciones destructivas o importantes.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'danger',
  pending,
  extra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button type="button" className={buttonClass.secondary} onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </button>
          {extra}
          <button type="button" className={tone === 'danger' ? buttonClass.danger : buttonClass.primary} onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
