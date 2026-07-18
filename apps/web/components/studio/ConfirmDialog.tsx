'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, description, confirmLabel = 'Delete', onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    // Move focus into the dialog so keyboard/AT users land inside it.
    dialogRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel p-6 w-full max-w-sm rise outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">Confirm</p>
        <p className="text-sm font-semibold text-[var(--forge-text)] mb-1">{title}</p>
        <p className="text-xs text-[var(--forge-muted)] leading-relaxed mb-5">{description}</p>
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            className="font-mono text-xs px-4 py-2 rounded-lg border border-[var(--forge-border)] text-[var(--forge-muted)] hover:text-[var(--forge-text)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="font-mono text-xs px-4 py-2 rounded-lg transition-colors"
            style={{ background: 'var(--ember-3)', color: '#fff' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
