import { useRef, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEscapeKey(onCancel);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableEls = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];

    firstEl?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    };

    dialog.addEventListener('keydown', handleTab);
    return () => dialog.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        className="relative bg-surface border border-border rounded-2xl p-6 w-full max-w-sm shadow-layered-lg ring-1 ring-white/[0.03] animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center mb-4">
            <AlertTriangle size={20} className="text-danger" />
          </div>
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-text-primary tracking-tight">
            {title}
          </h2>
          {message && (
            <p className="text-sm text-text-secondary/60 mt-1.5">{message}</p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-text-primary bg-surface-light border border-border/40 hover:bg-surface-hover transition-colors active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-danger hover:bg-danger/90 transition-colors active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
