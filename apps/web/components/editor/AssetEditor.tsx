'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Download, Sparkles, Pencil, Scissors, Film, Layers, Mic,
  ExternalLink, Check, X, AlertCircle, Camera, Sun,
} from 'lucide-react';
import { ANGLE_PRESETS, LIGHT_PRESETS, type ReimaginePreset } from '@forgecast/core';
import { useAssetEditor } from '@/lib/use-asset-editor';
import { BeforeAfter } from './BeforeAfter';

interface Props {
  assetId: string;
}

const RAIL = 'flex items-center gap-2.5 w-full text-left font-mono text-[11px] uppercase tracking-[0.1em] px-3 py-2.5 rounded-lg border transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

export function AssetEditor({ assetId }: Props) {
  const router = useRouter();
  const ed = useAssetEditor(assetId);
  const { asset, loading, error, busy, availability, variations } = ed;

  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [narrateOpen, setNarrateOpen] = useState(false);
  const [narrateText, setNarrateText] = useState('');
  const [anglePreset, setAnglePreset] = useState<string | null>(null);
  const [angleCustom, setAngleCustom] = useState('');
  const [lightPreset, setLightPreset] = useState<string | null>(null);
  const [lightCustom, setLightCustom] = useState('');
  const [result, setResult] = useState<{ id: string; kind: 'image' | 'video' } | null>(null);

  const isImage = asset?.type === 'image';
  const isVideo = asset?.type === 'video';
  const src = `/api/assets/${assetId}/raw`;

  async function run(fn: () => Promise<string | null>, kind: 'image' | 'video') {
    const id = await fn();
    if (id) setResult({ id, kind });
  }

  function railStyle(): React.CSSProperties {
    return { borderColor: 'var(--forge-border)', color: 'var(--forge-text)', background: 'var(--forge-surface-2)' };
  }

  if (loading) {
    return (
      <div className="min-h-screen p-6 max-w-[1200px] mx-auto">
        <div className="h-10 w-48 rounded shimmer mb-6" />
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="aspect-square rounded-xl shimmer" />
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-11 rounded-lg shimmer" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle size={28} className="text-[var(--ember-1)]" />
        <p className="font-mono text-sm text-[var(--forge-text)]">{error ?? 'Asset not found'}</p>
        <Link href="/" className="font-mono text-xs px-4 py-2 rounded border border-[var(--forge-border)] text-[var(--forge-faint)] hover:text-[var(--ember-1)] hover:border-[var(--ember-2)] transition-colors cursor-pointer">
          ‹ Back to Studio
        </Link>
      </div>
    );
  }

  const title = asset.params.prompt?.trim() || `${asset.provider} ${asset.type}`;

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 mb-5">
        <Link
          href="/"
          aria-label="Back to Studio"
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--forge-faint)] hover:text-[var(--ember-1)] transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} /> Studio
        </Link>
        <h1 className="flex-1 text-center font-mono text-xs text-[var(--forge-muted)] truncate px-2">{title}</h1>
        <a
          href={`${src}?download=1`}
          download
          aria-label="Download asset"
          className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-lg border border-[var(--forge-border)] text-[var(--forge-faint)] hover:text-[var(--ember-1)] hover:border-[var(--ember-2)] transition-colors cursor-pointer"
        >
          <Download size={14} /> Download
        </a>
      </header>

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 font-mono text-[11px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,80,40,0.08)', border: '1px solid var(--ember-3)', color: 'var(--ember-1)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Preview / compare */}
        <section className="panel overflow-hidden relative">
          {result && result.kind === 'image' && isImage ? (
            <div className="p-3">
              <BeforeAfter beforeId={assetId} afterId={result.id} />
            </div>
          ) : result ? (
            <div className="grid grid-cols-2 divide-x divide-[var(--forge-border)]">
              <figure className="m-0">
                <figcaption className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--forge-faint)] px-3 py-2 border-b border-[var(--forge-border)]">Source</figcaption>
                <Media id={assetId} type={asset.type} />
              </figure>
              <figure className="m-0">
                <figcaption className="font-mono text-[9px] uppercase tracking-[0.15em] text-[var(--ember-1)] px-3 py-2 border-b border-[var(--forge-border)]">Result</figcaption>
                <Media id={result.id} type={result.kind} />
              </figure>
            </div>
          ) : (
            <Media id={assetId} type={asset.type} />
          )}

          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(10,6,4,0.72)', backdropFilter: 'blur(2px)' }}>
              <div className="forge-spinner" aria-hidden />
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ember-1)]">{busy}…</p>
            </div>
          )}
        </section>

        {/* Ops rail */}
        <aside className="flex flex-col gap-2.5">
          {result && (
            <div className="panel p-3 flex flex-col gap-2" style={{ borderColor: 'var(--ember-2)' }}>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ember-1)]">Result ready</p>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/edit/${result.id}`)}
                  className="flex-1 btn-forge font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-1.5 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink size={12} /> Open result
                </button>
                <button
                  onClick={() => setResult(null)}
                  aria-label="Dismiss result"
                  className="tap-target rounded-lg border border-[var(--forge-border)] text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mt-1 mb-0.5">Operations</p>

          {isImage && (
            <>
              <button onClick={() => run(ed.enhance, 'image')} disabled={!!busy || !availability.image} className={RAIL} style={railStyle()} aria-label="Enhance and upscale">
                <Sparkles size={15} className="text-[var(--ember-1)]" /> Enhance · Upscale
              </button>

              <button onClick={() => setEditOpen((v) => !v)} disabled={!!busy || !availability.image} className={RAIL} style={railStyle()} aria-label="Edit with a prompt" aria-expanded={editOpen}>
                <Pencil size={15} className="text-[var(--ember-1)]" /> Edit with a prompt
              </button>
              {editOpen && (
                <InlinePrompt
                  placeholder="describe the edit — e.g. 'make the background a sunset'"
                  value={editPrompt}
                  setValue={setEditPrompt}
                  onSubmit={async () => { const p = editPrompt.trim(); if (!p) return; setEditOpen(false); setEditPrompt(''); await run(() => ed.edit(p), 'image'); }}
                  onCancel={() => { setEditOpen(false); setEditPrompt(''); }}
                  disabled={!!busy}
                />
              )}

              <button onClick={() => run(ed.cutout, 'image')} disabled={!!busy || !availability.image} className={RAIL} style={railStyle()} aria-label="Remove background">
                <Scissors size={15} className="text-[var(--ember-1)]" /> Remove background
              </button>

              <PresetSection
                title="Angle"
                icon={<Camera size={13} className="text-[var(--ember-1)]" aria-hidden />}
                presets={ANGLE_PRESETS}
                activeId={anglePreset}
                disabled={!!busy || !availability.image}
                unavailableHint={!availability.image ? 'Image editing not configured (set FAL_KEY)' : undefined}
                onPreset={async (p) => { setAnglePreset(p.id); await run(() => ed.reangle({ preset: p.id }), 'image'); }}
                custom={angleCustom}
                setCustom={setAngleCustom}
                onCustom={async () => {
                  const t = angleCustom.trim(); if (!t) return;
                  setAnglePreset(null); setAngleCustom('');
                  await run(() => ed.reangle({ instruction: t }), 'image');
                }}
                placeholder="custom angle — e.g. 'over-the-shoulder from the left'"
              />

              <PresetSection
                title="Light"
                icon={<Sun size={13} className="text-[var(--ember-1)]" aria-hidden />}
                presets={LIGHT_PRESETS}
                activeId={lightPreset}
                disabled={!!busy || !availability.image}
                unavailableHint={!availability.image ? 'Image editing not configured (set FAL_KEY)' : undefined}
                onPreset={async (p) => { setLightPreset(p.id); await run(() => ed.relight({ preset: p.id }), 'image'); }}
                custom={lightCustom}
                setCustom={setLightCustom}
                onCustom={async () => {
                  const t = lightCustom.trim(); if (!t) return;
                  setLightPreset(null); setLightCustom('');
                  await run(() => ed.relight({ instruction: t }), 'image');
                }}
                placeholder="custom lighting — e.g. 'moonlight through blinds'"
              />

              <button onClick={() => run(ed.animate, 'video')} disabled={!!busy || !availability.video} className={RAIL} style={railStyle()} aria-label="Animate to video" title={!availability.video ? 'Video provider not configured (set FAL_KEY_VIDEO)' : 'Animate this image into a video'}>
                <Film size={15} className="text-[var(--ember-1)]" /> Animate → video
              </button>

              <button onClick={() => void ed.makeVariations(3)} disabled={!!busy || !availability.image} className={RAIL} style={railStyle()} aria-label="Generate variations">
                <Layers size={15} className="text-[var(--ember-1)]" /> Variations ×3
              </button>
            </>
          )}

          {isVideo && (
            <>
              <button onClick={() => setNarrateOpen((v) => !v)} disabled={!!busy || !availability.narrate} className={RAIL} style={railStyle()} aria-label="Add a voice-over" aria-expanded={narrateOpen} title={!availability.narrate ? 'Narration needs a voice provider + local ffmpeg (not available on the cloud deploy)' : 'Add an AI voice-over'}>
                <Mic size={15} className="text-[var(--ember-1)]" /> Narrate (voice-over)
              </button>
              {narrateOpen && (
                <InlinePrompt
                  placeholder="voice-over script — what should the narrator say?"
                  value={narrateText}
                  setValue={setNarrateText}
                  onSubmit={async () => { const t = narrateText.trim(); if (!t) return; setNarrateOpen(false); setNarrateText(''); await run(() => ed.narrate(t), 'video'); }}
                  onCancel={() => { setNarrateOpen(false); setNarrateText(''); }}
                  disabled={!!busy}
                />
              )}
            </>
          )}

          <a href={`${src}?download=1`} download className={RAIL} style={railStyle()} aria-label="Download this asset">
            <Download size={15} className="text-[var(--ember-1)]" /> Download
          </a>
        </aside>
      </div>

      {/* Variations strip */}
      {variations.length > 0 && (
        <section className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">Variations</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {variations.map((v) => (
              <button
                key={v.id}
                onClick={() => router.push(`/edit/${v.id}`)}
                className="panel overflow-hidden group relative cursor-pointer"
                aria-label="Open this variation in the editor"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/assets/${v.id}/raw`} alt="variation" className="w-full aspect-square object-cover" loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.35)' }}>
                  <ExternalLink size={16} className="text-white" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Media({ id, type }: { id: string; type: 'image' | 'video' | 'audio' }) {
  const src = `/api/assets/${id}/raw`;
  if (type === 'video') {
    return <video src={src} controls loop playsInline className="w-full max-h-[70vh] object-contain bg-black block" />;
  }
  if (type === 'audio') {
    return <div className="p-6"><audio src={src} controls className="w-full" /></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="asset preview" className="w-full max-h-[70vh] object-contain block" />;
}

/**
 * A rail section of one-click preset chips (camera re-angle / scene relight)
 * plus a small custom-instruction input. Chips fire the op immediately; the
 * active chip carries aria-pressed in the house segmented-chip style.
 */
function PresetSection({
  title, icon, presets, activeId, disabled, unavailableHint, onPreset, custom, setCustom, onCustom, placeholder,
}: {
  title: string;
  icon: React.ReactNode;
  presets: readonly ReimaginePreset[];
  activeId: string | null;
  disabled: boolean;
  unavailableHint?: string;
  onPreset: (p: ReimaginePreset) => void;
  custom: string;
  setCustom: (v: string) => void;
  onCustom: () => void;
  placeholder: string;
}) {
  return (
    <div className="panel p-3 flex flex-col gap-2" style={{ borderColor: 'var(--forge-border)' }}>
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] m-0" title={unavailableHint}>
        {icon} {title}
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${title} presets`}>
        {presets.map((p) => {
          const selected = p.id === activeId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPreset(p)}
              disabled={disabled}
              aria-pressed={selected}
              title={unavailableHint ?? p.instruction}
              className="font-mono text-[10px] px-2.5 py-1.5 rounded border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={selected ? {
                borderColor: 'var(--ember-2)',
                color: 'var(--ember-1)',
                boxShadow: '0 0 12px var(--ember-glow)',
                background: 'rgba(255,122,26,0.06)',
              } : {
                borderColor: 'var(--forge-border)',
                color: 'var(--forge-faint)',
                background: 'transparent',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (!disabled) onCustom(); } }}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          title={unavailableHint}
          className="flex-1 font-mono text-[10px] px-2.5 py-2 rounded-lg border bg-transparent outline-none min-w-0 disabled:opacity-40"
          style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-text)', caretColor: 'var(--ember-1)' }}
        />
        <button
          onClick={onCustom}
          disabled={disabled || !custom.trim()}
          aria-label={`Apply custom ${title.toLowerCase()} instruction`}
          className="p-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)' }}
        >
          <Check size={13} />
        </button>
      </div>
    </div>
  );
}

function InlinePrompt({
  placeholder, value, setValue, onSubmit, onCancel, disabled,
}: {
  placeholder: string; value: string; setValue: (v: string) => void;
  onSubmit: () => void; onCancel: () => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 -mt-1 mb-1">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } else if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 font-mono text-[10px] px-2.5 py-2 rounded-lg border bg-transparent outline-none min-w-0"
        style={{ borderColor: 'var(--ember-2)', color: 'var(--forge-text)', caretColor: 'var(--ember-1)' }}
      />
      <button onClick={onSubmit} disabled={disabled || !value.trim()} aria-label="Apply" className="tap-target rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)' }}>
        <Check size={13} />
      </button>
      <button onClick={onCancel} aria-label="Cancel" className="tap-target rounded-lg border border-[var(--forge-border)] text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors cursor-pointer">
        <X size={13} />
      </button>
    </div>
  );
}
