'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Plus, Check, AlertCircle, Palette } from 'lucide-react';
import type { BrandKit, useBrandKit } from '@/lib/use-brand-kit';

interface Props {
  open: boolean;
  onClose: () => void;
  brand: ReturnType<typeof useBrandKit>;
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

export function BrandKitModal({ open, onClose, brand }: Props) {
  const [draft, setDraft] = useState<BrandKit>({});
  const [url, setUrl] = useState('');
  const [colorInput, setColorInput] = useState('#FF7A1A');
  const [messageInput, setMessageInput] = useState('');

  // Sync the editable draft from the loaded kit whenever the modal opens or the
  // kit changes underneath (e.g. after a derive-from-website).
  useEffect(() => { if (open) setDraft(brand.kit); }, [open, brand.kit]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  const set = (patch: Partial<BrandKit>) => setDraft((d) => ({ ...d, ...patch }));
  const palette = draft.palette ?? [];
  const messages = draft.keyMessages ?? [];

  function addColor() {
    const c = colorInput.trim();
    if (!c || palette.includes(c)) return;
    set({ palette: [...palette, c].slice(0, 8) });
  }
  function addMessage() {
    const m = messageInput.trim();
    if (!m) return;
    set({ keyMessages: [...messages, m].slice(0, 8) });
    setMessageInput('');
  }
  async function handleDerive() {
    const u = url.trim();
    if (!u) return;
    const got = await brand.derive(u);
    if (got) setDraft(got);
  }
  async function handleSave() {
    const ok = await brand.save(draft);
    if (ok) onClose();
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
        aria-label="Brand Kit editor"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--forge-border)] sticky top-0 z-10" style={{ background: 'var(--forge-surface)' }}>
          <div className="flex items-center gap-2">
            <Palette size={16} className="text-[var(--ember-1)]" />
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.12em] text-[var(--forge-text)]">Brand Kit</h2>
              <p className="font-mono text-[10px] text-[var(--forge-faint)]">Everything you generate uses this.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-[var(--forge-faint)] hover:text-[var(--forge-text)] hover:bg-white/5 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Derive from website */}
          <div className="panel p-3 flex flex-col gap-2" style={{ borderColor: 'var(--ember-2)' }}>
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ember-1)]">Auto-fill from your website</span>
            <div className="flex items-center gap-1.5">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleDerive(); } }}
                placeholder="https://yourbrand.com"
                aria-label="Website URL to derive brand from"
                className={inputCls}
                style={inputStyle}
              />
              <button
                onClick={() => void handleDerive()}
                disabled={brand.deriving || !url.trim()}
                className="btn-forge font-mono text-[10px] uppercase tracking-[0.1em] px-3 py-2 inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Globe size={12} /> {brand.deriving ? 'Reading…' : 'Derive'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand name"><input className={inputCls} style={inputStyle} value={draft.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="Forgecast" /></Field>
            <Field label="Tagline"><input className={inputCls} style={inputStyle} value={draft.tagline ?? ''} onChange={(e) => set({ tagline: e.target.value })} placeholder="Forge it, cast it" /></Field>
          </div>

          {/* Palette */}
          <Field label="Brand colors">
            <div className="flex flex-wrap gap-2 mb-1.5">
              {palette.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5 font-mono text-[10px] px-1.5 py-1 rounded border" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-text)' }}>
                  <span className="w-3.5 h-3.5 rounded-sm border border-black/30" style={{ background: c }} />
                  {c}
                  <button onClick={() => set({ palette: palette.filter((x) => x !== c) })} aria-label={`Remove ${c}`} className="text-[var(--forge-faint)] hover:text-[var(--ember-1)] cursor-pointer"><X size={11} /></button>
                </span>
              ))}
              {palette.length === 0 && <span className="font-mono text-[10px] text-[var(--forge-faint)]">no colors yet</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(colorInput) ? colorInput : '#FF7A1A'} onChange={(e) => setColorInput(e.target.value)} aria-label="Pick a color" className="w-8 h-8 rounded cursor-pointer bg-transparent border border-[var(--forge-border)]" />
              <input className={inputCls} style={inputStyle} value={colorInput} onChange={(e) => setColorInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }} placeholder="#FF7A1A" aria-label="Hex color" />
              <button onClick={addColor} aria-label="Add color" className="p-2 rounded-lg border transition-colors cursor-pointer" style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)' }}><Plus size={14} /></button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Display font"><input className={inputCls} style={inputStyle} value={draft.fonts?.display ?? ''} onChange={(e) => set({ fonts: { ...draft.fonts, display: e.target.value } })} placeholder="Bricolage Grotesque" /></Field>
            <Field label="Body font"><input className={inputCls} style={inputStyle} value={draft.fonts?.body ?? ''} onChange={(e) => set({ fonts: { ...draft.fonts, body: e.target.value } })} placeholder="IBM Plex Mono" /></Field>
          </div>

          <Field label="Tone of voice"><input className={inputCls} style={inputStyle} value={draft.toneOfVoice ?? ''} onChange={(e) => set({ toneOfVoice: e.target.value })} placeholder="bold, terse, builder-to-builder" /></Field>

          {/* Key messages */}
          <Field label="Key messages">
            <div className="flex flex-col gap-1.5 mb-1.5">
              {messages.map((m, i) => (
                <span key={`${m}-${i}`} className="flex items-center justify-between gap-2 font-mono text-[11px] px-2 py-1.5 rounded border" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-text)' }}>
                  <span className="truncate">{m}</span>
                  <button onClick={() => set({ keyMessages: messages.filter((_, j) => j !== i) })} aria-label={`Remove "${m}"`} className="text-[var(--forge-faint)] hover:text-[var(--ember-1)] shrink-0 cursor-pointer"><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input className={inputCls} style={inputStyle} value={messageInput} onChange={(e) => setMessageInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMessage(); } }} placeholder="You own it" aria-label="Add a key message" />
              <button onClick={addMessage} aria-label="Add message" className="p-2 rounded-lg border transition-colors cursor-pointer" style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)' }}><Plus size={14} /></button>
            </div>
          </Field>

          <Field label="Notes / direction">
            <textarea className={`${inputCls} resize-none`} style={inputStyle} rows={2} value={draft.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Molten forge energy. Dark, ember glow, no pastels." />
          </Field>

          {brand.error && (
            <div role="alert" className="flex items-center gap-2 font-mono text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,80,40,0.08)', border: '1px solid var(--ember-3)', color: 'var(--ember-1)' }}>
              <AlertCircle size={14} /> {brand.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--forge-border)] sticky bottom-0" style={{ background: 'var(--forge-surface)' }}>
          <button onClick={onClose} className="font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-2 text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors cursor-pointer">Cancel</button>
          <button onClick={() => void handleSave()} disabled={brand.saving} className="btn-forge font-mono text-[11px] uppercase tracking-[0.12em] px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
            <Check size={13} /> {brand.saving ? 'Saving…' : 'Save brand kit'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
