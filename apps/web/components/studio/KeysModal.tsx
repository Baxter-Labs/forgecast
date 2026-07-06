'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { useKeys, type KeyStatus } from '@/lib/use-keys';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after any successful save/clear so the Studio can refresh availability. */
  onChanged?: () => void;
}

const GROUPS: KeyStatus['group'][] = ['Generation', 'Agent brain', 'Extras'];

function SourceChip({ k }: { k: KeyStatus }) {
  if (k.source === 'user') {
    return (
      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,122,26,0.12)', color: 'var(--ember-1)', border: '1px solid var(--ember-2)' }}>
        your key {k.preview}
      </span>
    );
  }
  if (k.source === 'instance') {
    return (
      <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-muted)' }}>
        instance default
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}>
      not set
    </span>
  );
}

function KeyRow({ k, busy, onSave, onClear }: {
  k: KeyStatus;
  busy: boolean;
  onSave: (value: string) => Promise<boolean>;
  onClear: () => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--forge-text)]">{k.label}</p>
        <SourceChip k={k} />
        <span className="flex-1" />
        {k.source === 'user' && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            aria-label={`Remove your ${k.label} key`}
            className="flex items-center gap-1 font-mono text-[10px] uppercase px-2 py-1 rounded border transition-colors hover:border-red-400 hover:text-red-300"
            style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
          >
            <Trash2 size={11} aria-hidden="true" /> Remove
          </button>
        )}
      </div>
      <p className="font-mono text-[10px] text-[var(--forge-faint)] leading-relaxed">{k.hint}</p>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) void onSave(value.trim()).then((ok) => ok && setValue('')); }}
          placeholder={k.source === 'user' ? 'Paste a new key to replace yours…' : 'Paste your key…'}
          autoComplete="off"
          aria-label={`${k.label} API key`}
          className="flex-1 font-mono text-xs px-2.5 py-2 rounded-lg border bg-[var(--forge-bg)] outline-none focus:border-[var(--ember-2)] transition-colors"
          style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-text)', caretColor: 'var(--ember-1)' }}
        />
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={() => void onSave(value.trim()).then((ok) => ok && setValue(''))}
          className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-2 rounded-lg border transition-all disabled:opacity-40"
          style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)' }}
        >
          {busy ? '…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export function KeysModal({ open, onClose, onChanged }: Props) {
  const { keys, sealed, loading, busyId, error, save, clear } = useKeys(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Provider keys">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(10,8,6,0.75)', backdropFilter: 'blur(2px)' }} />
      <div className="panel relative w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 flex flex-col gap-4 rise">
        <div className="flex items-center gap-2">
          <KeyRound size={15} className="text-[var(--ember-1)]" aria-hidden="true" />
          <h2 className="font-mono text-sm uppercase tracking-[0.15em] text-[var(--forge-text)]">Provider keys</h2>
          <span className="flex-1" />
          <button type="button" onClick={onClose} aria-label="Close keys" className="w-7 h-7 rounded border flex items-center justify-center" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}>
            <X size={13} aria-hidden="true" />
          </button>
        </div>

        <p className="font-mono text-[10px] text-[var(--forge-faint)] leading-relaxed">
          paste keys here instead of editing env files — they take effect immediately, no restart or redeploy.
          your keys override the instance defaults and are used only for your workspace.
        </p>
        <p className="font-mono text-[10px] flex items-center gap-1.5 leading-relaxed" style={{ color: sealed ? 'var(--forge-muted)' : 'var(--forge-faint)' }}>
          <ShieldCheck size={11} aria-hidden="true" className={sealed ? 'text-[var(--ember-1)]' : ''} />
          {sealed
            ? 'stored encrypted (AES-256-GCM) — the UI only ever sees the masked tail'
            : 'stored in the local database (set AUTH_SECRET to encrypt at rest) — the UI only ever sees the masked tail'}
        </p>

        {error && <p role="alert" className="font-mono text-[10px] text-red-300">{error}</p>}
        {loading && keys.length === 0 && <p className="font-mono text-[10px] text-[var(--forge-faint)]">loading…</p>}

        {GROUPS.map((group) => {
          const rows = keys.filter((k) => k.group === group);
          if (rows.length === 0) return null;
          return (
            <div key={group} className="flex flex-col gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">{group}</p>
              {rows.map((k) => (
                <KeyRow
                  key={k.id}
                  k={k}
                  busy={busyId === k.id}
                  onSave={async (v) => { const ok = await save(k.id, v); if (ok) onChanged?.(); return ok; }}
                  onClear={() => void clear(k.id).then((ok) => ok && onChanged?.())}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
