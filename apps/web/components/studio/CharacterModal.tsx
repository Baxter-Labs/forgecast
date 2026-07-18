'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Check, AlertCircle, Trash2 } from 'lucide-react';
import type { Character, StudioAsset } from '@/lib/use-forgecast';

const MAX_REFS = 4;

interface Props {
  open: boolean;
  onClose: () => void;
  characters: Character[];
  assets: StudioAsset[];
  onCreate: (input: { name: string; description?: string; refAssetIds: string[] }) => Promise<{ character?: Character; error?: string }>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onRefresh: () => void;
}

const inputCls = 'w-full font-mono text-xs px-2.5 py-2 rounded-lg border bg-transparent outline-none';
const inputStyle = { borderColor: 'var(--forge-border)', color: 'var(--forge-text)', caretColor: 'var(--ember-1)' } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">{label}</span>
      {children}
    </label>
  );
}

export function CharacterModal({ open, onClose, characters, assets, onCreate, onDelete, onRefresh }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [refIds, setRefIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the cast whenever the modal opens (mirrors BrandKitModal's open sync).
  useEffect(() => { if (open) { setError(null); setConfirmId(null); onRefresh(); } }, [open, onRefresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  const imageAssets = assets.filter((a) => a.type === 'image');

  function toggleRef(id: string) {
    setRefIds((prev) => prev.includes(id)
      ? prev.filter((x) => x !== id)
      : prev.length >= MAX_REFS ? prev : [...prev, id]);
  }

  async function handleCreate() {
    const n = name.trim();
    if (!n || refIds.length === 0 || busy) return;
    setBusy(true); setError(null);
    const r = await onCreate({ name: n, description: description.trim() || undefined, refAssetIds: refIds });
    setBusy(false);
    if (r.error) { setError(r.error); return; }
    setName(''); setDescription(''); setRefIds([]);
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id); setError(null);
    const r = await onDelete(id);
    setDeletingId(null); setConfirmId(null);
    if (r.error) setError(r.error);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-[560px] max-h-[88vh] overflow-y-auto rise"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Cast manager"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--forge-border)] sticky top-0 z-10" style={{ background: 'var(--forge-surface)' }}>
          <div className="flex items-center gap-2">
            <Users size={16} className="text-[var(--ember-1)]" />
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--forge-text)]">Cast</h2>
              <p className="font-mono text-[10px] text-[var(--forge-faint)]">The same faces, in everything you forge.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-[var(--forge-faint)] hover:text-[var(--forge-text)] hover:bg-white/5 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Existing cast */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">Your cast</span>
            {characters.length === 0 ? (
              <p className="font-mono text-[10px] text-[var(--forge-faint)]">no characters yet — create one below</p>
            ) : (
              characters.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-2.5 py-2 rounded-lg border"
                  style={{ borderColor: 'var(--forge-border)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/characters/${c.id}/refs/0`}
                    alt={`${c.name} reference portrait`}
                    className="w-10 h-10 rounded object-cover border border-[var(--forge-border)] shrink-0"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-[var(--forge-text)] truncate">{c.name}</p>
                    <p className="font-mono text-[10px] text-[var(--forge-faint)] truncate">
                      {c.refKeys.length} ref{c.refKeys.length !== 1 ? 's' : ''}
                      {c.createdAt ? <> · {new Date(c.createdAt).toLocaleDateString()}</> : null}
                      {c.description ? <> · {c.description}</> : null}
                    </p>
                  </div>
                  {confirmId === c.id ? (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => void handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        aria-label={`Confirm delete ${c.name}`}
                        className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-colors cursor-pointer disabled:opacity-40"
                        style={{ borderColor: 'var(--ember-3)', color: 'var(--ember-1)', background: 'rgba(255,80,40,0.08)' }}
                      >
                        {deletingId === c.id ? 'removing…' : 'delete?'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        aria-label="Cancel delete"
                        className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-1 rounded border text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors cursor-pointer"
                        style={{ borderColor: 'var(--forge-border)', background: 'transparent' }}
                      >
                        keep
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(c.id)}
                      aria-label={`Delete ${c.name}`}
                      className="p-1.5 rounded text-[var(--forge-faint)] hover:text-[var(--ember-1)] hover:bg-white/5 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Create form */}
          <div className="panel p-3 flex flex-col gap-3" style={{ borderColor: 'var(--ember-2)' }}>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ember-1)]">New character</span>

            <Field label="Name">
              <input
                className={inputCls}
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nova"
                aria-label="Character name"
              />
            </Field>

            <Field label="Persona notes (optional)">
              <textarea
                className={`${inputCls} resize-none`}
                style={inputStyle}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ember-lit founder, mid-30s, denim jacket"
                aria-label="Character description"
              />
            </Field>

            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
                Reference portraits <span className="normal-case tracking-normal">({refIds.length}/{MAX_REFS})</span>
              </span>
              {imageAssets.length === 0 ? (
                <p className="font-mono text-[10px] text-[var(--forge-faint)] leading-relaxed">
                  upload or forge 1–4 portraits of the same person first, then create a character
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {imageAssets.slice(0, 24).map((a) => {
                    const sel = refIds.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleRef(a.id)}
                        aria-pressed={sel}
                        aria-label={sel ? 'Remove reference image' : 'Add reference image'}
                        className="relative aspect-square rounded overflow-hidden border-2 transition-all cursor-pointer"
                        style={sel
                          ? { borderColor: 'var(--ember-2)', boxShadow: '0 0 10px var(--ember-glow)' }
                          : { borderColor: 'var(--forge-border)' }}
                        title={a.params.prompt ?? a.id}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/assets/${a.id}/raw`}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {sel && (
                          <span
                            className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold"
                            style={{ background: 'rgba(255,122,26,0.22)', color: 'var(--ember-1)' }}
                          >
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => void handleCreate()}
              disabled={busy || !name.trim() || refIds.length === 0}
              className="btn-forge font-mono text-[11px] uppercase tracking-[0.12em] px-4 py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Check size={13} /> {busy ? 'Creating…' : 'Create character'}
            </button>
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 font-mono text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,80,40,0.08)', border: '1px solid var(--ember-3)', color: 'var(--ember-1)' }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
