'use client';
import { useState, useRef } from 'react';
import { Send, Download } from 'lucide-react';
import type { StudioAsset } from '@/lib/use-forgecast';
import { Lightbox } from './Lightbox';

interface AssetCardProps {
  asset: StudioAsset;
  index: number;
  compact?: boolean;
  onPublish?: (asset: StudioAsset) => void;
  onEnhance?: (assetId: string) => void;
  enhancing?: boolean;
  onAnimate?: (assetId: string) => void;
  animating?: boolean;
  onEdit?: (assetId: string, prompt: string) => void;
  editing?: boolean;
  onCutout?: (assetId: string) => void;
  cutting?: boolean;
  onNarrate?: (assetId: string, text: string) => void;
  narrating?: boolean;
  narrateAvailable?: boolean;
  videoAvailable?: boolean;
  /** When true the card shows a selection ring and click selects instead of opening lightbox */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (assetId: string) => void;
}

export function AssetCard({
  asset, index, compact = false,
  onPublish, onEnhance, enhancing = false,
  onAnimate, animating = false,
  onEdit, editing = false,
  onCutout, cutting = false,
  onNarrate, narrating = false, narrateAvailable = false,
  videoAvailable = false,
  selectable = false, selected = false, onSelect,
}: AssetCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [narrateOpen, setNarrateOpen] = useState(false);
  const [narrateText, setNarrateText] = useState('');
  const narrateInputRef = useRef<HTMLInputElement>(null);
  const prompt = asset.params.prompt ?? '';
  const isVideo = asset.type === 'video';
  const w = asset.params.width;
  const h = asset.params.height;
  const modelId = asset.params.model ?? asset.provider;
  const ar = asset.params.aspectRatio;
  const videoTag = asset.provider === 'remotion' ? 'MONTAGE' : 'VIDEO';
  const dims = w && h ? `${w}×${h}` : ar ? ar : null;

  function handleCardClick() {
    if (selectable && onSelect) {
      onSelect(asset.id);
    } else {
      setLightboxOpen(true);
    }
  }

  function handleEditButtonClick(e: React.MouseEvent) {
    e.stopPropagation();
    setEditOpen(true);
    setEditPrompt('');
    setTimeout(() => editInputRef.current?.focus(), 0);
  }

  function handleEditSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = editPrompt.trim();
    if (!trimmed || !onEdit) return;
    onEdit(asset.id, trimmed);
    setEditOpen(false);
    setEditPrompt('');
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditSubmit();
    } else if (e.key === 'Escape') {
      setEditOpen(false);
      setEditPrompt('');
    }
  }

  function handleNarrateButtonClick(e: React.MouseEvent) {
    e.stopPropagation();
    setNarrateOpen(true);
    setNarrateText('');
    setTimeout(() => narrateInputRef.current?.focus(), 0);
  }

  function handleNarrateSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = narrateText.trim();
    if (!trimmed || !onNarrate) return;
    onNarrate(asset.id, trimmed);
    setNarrateOpen(false);
    setNarrateText('');
  }

  function handleNarrateKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNarrateSubmit();
    } else if (e.key === 'Escape') {
      setNarrateOpen(false);
      setNarrateText('');
    }
  }

  return (
    <>
      <div
        className="panel overflow-hidden rise"
        style={{
          animationDelay: `${index * 60}ms`,
          ...(selected ? {
            outline: '2px solid var(--ember-2)',
            boxShadow: '0 0 16px var(--ember-glow)',
          } : {}),
        }}
      >
        <div
          className={`relative group ${selectable ? 'cursor-pointer' : 'cursor-zoom-in'}`}
          onClick={handleCardClick}
        >
          {isVideo ? (
            <video
              src={`/api/assets/${asset.id}/raw`}
              muted loop playsInline
              className="w-full aspect-square object-cover block bg-black pointer-events-none"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/${asset.id}/raw`}
              alt={prompt}
              className="w-full aspect-square object-cover block"
              loading="lazy"
            />
          )}
          {isVideo && (
            <span
              className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 10px var(--ember-glow)' }}
            >
              {videoTag}
            </span>
          )}
          {/* Expand hint (only in non-selectable mode) */}
          {!selectable && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.3)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </div>
          )}
          {/* Quick download (only in non-selectable mode) */}
          {!selectable && (
            <a
              href={`/api/assets/${asset.id}/raw?download=1`}
              download
              onClick={(e) => e.stopPropagation()}
              title="Download"
              aria-label="Download asset"
              className="absolute top-2 right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(0,0,0,0.55)', color: 'white' }}
            >
              <Download size={13} />
            </a>
          )}
          {/* Selection check */}
          {selectable && (
            <div
              className="absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all"
              style={selected ? {
                background: 'var(--ember-2)',
                borderColor: 'var(--ember-2)',
                boxShadow: '0 0 8px var(--ember-glow)',
              } : {
                background: 'rgba(0,0,0,0.5)',
                borderColor: 'rgba(255,255,255,0.5)',
              }}
            >
              {selected && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                </svg>
              )}
            </div>
          )}
        </div>

        {!compact && (
          <div className="bg-[var(--forge-surface-2)] border-t border-[var(--forge-border)] px-3 py-2.5">
            <p className="font-mono text-xs text-[var(--forge-text)] truncate leading-snug mb-1">{prompt || '(no prompt)'}</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {dims && (
                  <>
                    <span className="font-mono text-[10px] text-[var(--forge-faint)]">{dims}</span>
                    <span className="text-[var(--forge-faint)] text-[10px]">·</span>
                  </>
                )}
                <span className="font-mono text-[10px] text-[var(--forge-faint)] truncate">{modelId}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 flex-wrap">
                {!isVideo && !selectable && onEnhance && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEnhance(asset.id); }}
                    disabled={enhancing}
                    title="Enhance this image"
                    aria-label="Enhance image"
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                  >
                    {enhancing ? 'enhancing…' : '✨ Enhance'}
                  </button>
                )}
                {!isVideo && !selectable && onCutout && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCutout(asset.id); }}
                    disabled={cutting}
                    title="Remove the background — clean product cutout"
                    aria-label="Remove background"
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                  >
                    {cutting ? 'cutting…' : '✂️ Cutout'}
                  </button>
                )}
                {!isVideo && !selectable && onEdit && (
                  <button
                    onClick={editing ? undefined : handleEditButtonClick}
                    disabled={editing}
                    title="Edit this image with a text instruction"
                    aria-label="Edit image"
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                  >
                    {editing ? 'editing…' : '✏️ Edit'}
                  </button>
                )}
                {!isVideo && !selectable && onAnimate && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onAnimate(asset.id); }}
                    disabled={animating || !videoAvailable}
                    title={!videoAvailable ? 'Video provider not configured (set FAL_KEY_VIDEO)' : 'Animate this image'}
                    aria-label="Animate image"
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                  >
                    {animating ? 'animating…' : '▶ Animate'}
                  </button>
                )}
                {isVideo && !selectable && onNarrate && (
                  <button
                    onClick={narrating ? undefined : handleNarrateButtonClick}
                    disabled={narrating || !narrateAvailable}
                    title={!narrateAvailable ? 'Voice provider not configured (run the VoxCPM-2 worker or set a fal voice key)' : 'Add an AI voice-over to this video'}
                    aria-label="Narrate video"
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                  >
                    {narrating ? 'narrating…' : '🎙 Narrate'}
                  </button>
                )}
                {!selectable && onPublish && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPublish(asset); }}
                    title="Publish this asset"
                    className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-2)] hover:text-[var(--ember-1)]"
                    style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                  >
                    <Send size={10} />
                    Cast
                  </button>
                )}
              </div>
            </div>
            {/* Inline edit prompt form */}
            {editOpen && !selectable && onEdit && (
              <form
                onSubmit={handleEditSubmit}
                className="mt-2 flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={editInputRef}
                  type="text"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  placeholder="describe the edit — e.g. 'make the background a sunset'"
                  aria-label="Edit instruction"
                  className="flex-1 font-mono text-[10px] px-2 py-1 rounded border bg-transparent outline-none min-w-0"
                  style={{ borderColor: 'var(--ember-2)', color: 'var(--forge-text)', caretColor: 'var(--ember-1)' }}
                />
                <button
                  type="submit"
                  disabled={!editPrompt.trim()}
                  aria-label="Submit edit instruction"
                  className="font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-1)] hover:text-[var(--ember-1)] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-2)' }}
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => { setEditOpen(false); setEditPrompt(''); }}
                  aria-label="Cancel edit"
                  className="font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--forge-text)] hover:text-[var(--forge-text)]"
                  style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                >
                  ✕
                </button>
              </form>
            )}
            {/* Inline narration script form */}
            {narrateOpen && !selectable && onNarrate && (
              <form
                onSubmit={handleNarrateSubmit}
                className="mt-2 flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  ref={narrateInputRef}
                  type="text"
                  value={narrateText}
                  onChange={(e) => setNarrateText(e.target.value)}
                  onKeyDown={handleNarrateKeyDown}
                  placeholder="voice-over script — what should the narrator say?"
                  aria-label="Narration script"
                  className="flex-1 font-mono text-[10px] px-2 py-1 rounded border bg-transparent outline-none min-w-0"
                  style={{ borderColor: 'var(--ember-2)', color: 'var(--forge-text)', caretColor: 'var(--ember-1)' }}
                />
                <button
                  type="submit"
                  disabled={!narrateText.trim()}
                  aria-label="Submit narration script"
                  className="font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--ember-1)] hover:text-[var(--ember-1)] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-2)' }}
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => { setNarrateOpen(false); setNarrateText(''); }}
                  aria-label="Cancel narration"
                  className="font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-all hover:border-[var(--forge-text)] hover:text-[var(--forge-text)]"
                  style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                >
                  ✕
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {!selectable && lightboxOpen && <Lightbox asset={asset} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}
