'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Send, Download, Pencil, AudioLines } from 'lucide-react';
import type { StudioAsset } from '@/lib/use-forgecast';
import { Lightbox } from './Lightbox';

interface AssetCardProps {
  asset: StudioAsset;
  index: number;
  compact?: boolean;
  onPublish?: (asset: StudioAsset) => void;
  /** When true the card shows a selection ring and click selects instead of opening lightbox */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (assetId: string) => void;
}

export function AssetCard({
  asset, index, compact = false,
  onPublish,
  selectable = false, selected = false, onSelect,
}: AssetCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Voice-over assets carry their script in params.text rather than params.prompt.
  const prompt = asset.params.prompt ?? asset.params.text ?? '';
  const isVideo = asset.type === 'video';
  const isAudio = asset.type === 'audio';
  const w = asset.params.width;
  const h = asset.params.height;
  const modelId = asset.params.model ?? asset.provider;
  const ar = asset.params.aspectRatio;
  const badge = isAudio ? 'VOICE' : asset.provider === 'remotion' ? 'MONTAGE' : 'VIDEO';
  const dims = w && h ? `${w}×${h}` : ar ? ar : null;

  function handleCardClick() {
    if (selectable && onSelect) {
      onSelect(asset.id);
    } else if (!isAudio) {
      setLightboxOpen(true);
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
          className={`relative group ${selectable ? 'cursor-pointer' : isAudio ? 'cursor-default' : 'cursor-zoom-in'}`}
          onClick={handleCardClick}
        >
          {isVideo ? (
            <video
              src={`/api/assets/${asset.id}/raw`}
              muted loop playsInline
              className="w-full aspect-square object-cover block bg-black pointer-events-none"
            />
          ) : isAudio ? (
            <div
              className="w-full aspect-square flex flex-col items-center justify-center gap-4 px-5 bg-gradient-to-b from-[var(--forge-surface-2)] to-[var(--forge-bg)]"
              onClick={(e) => e.stopPropagation()}
            >
              <AudioLines size={40} className="text-[var(--ember-1)]" aria-hidden="true" />
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={`/api/assets/${asset.id}/raw`} controls className="w-full" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/assets/${asset.id}/raw`}
              alt={prompt}
              className="w-full aspect-square object-cover block"
              loading="lazy"
            />
          )}
          {(isVideo || isAudio) && (
            <span
              className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded"
              style={{ background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 10px var(--ember-glow)' }}
            >
              {badge}
            </span>
          )}
          {/* Expand hint (only in non-selectable, non-audio mode) */}
          {!selectable && !isAudio && (
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
              {!selectable && (
                <div className="flex items-center gap-1 shrink-0">
                  {!isAudio && (
                    <Link
                      href={`/edit/${asset.id}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Open in editor"
                      title="Open this asset in the editor"
                      className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-colors hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] cursor-pointer"
                      style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                    >
                      <Pencil size={10} /> Edit
                    </Link>
                  )}
                  {onPublish && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onPublish(asset); }}
                      title="Publish this asset"
                      aria-label="Publish asset"
                      className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded border transition-colors hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] cursor-pointer"
                      style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
                    >
                      <Send size={10} /> Cast
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!selectable && lightboxOpen && <Lightbox asset={asset} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}
