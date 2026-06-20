'use client';
import { useState } from 'react';
import type { StudioAsset } from '@/lib/use-forgecast';
import { Lightbox } from './Lightbox';

interface AssetCardProps {
  asset: StudioAsset;
  index: number;
  compact?: boolean;
}

export function AssetCard({ asset, index, compact = false }: AssetCardProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const prompt = asset.params.prompt ?? '';
  const isVideo = asset.type === 'video';
  const w = asset.params.width;
  const h = asset.params.height;
  const modelId = asset.params.model ?? asset.provider;
  const ar = asset.params.aspectRatio;
  const videoTag = asset.provider === 'remotion' ? 'MONTAGE' : 'VIDEO';
  const dims = w && h ? `${w}×${h}` : ar ? ar : null;

  return (
    <>
      <div className="panel overflow-hidden rise" style={{ animationDelay: `${index * 60}ms` }}>
        <div className="relative cursor-zoom-in group" onClick={() => setLightboxOpen(true)}>
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
          {/* Expand hint */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.3)' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </div>
        </div>

        {!compact && (
          <div className="bg-[var(--forge-surface-2)] border-t border-[var(--forge-border)] px-3 py-2.5">
            <p className="font-mono text-xs text-[var(--forge-text)] truncate leading-snug mb-1">{prompt || '(no prompt)'}</p>
            <div className="flex items-center gap-2">
              {dims && (
                <>
                  <span className="font-mono text-[10px] text-[var(--forge-faint)]">{dims}</span>
                  <span className="text-[var(--forge-faint)] text-[10px]">·</span>
                </>
              )}
              <span className="font-mono text-[10px] text-[var(--forge-faint)] truncate">{modelId}</span>
            </div>
          </div>
        )}
      </div>

      {lightboxOpen && <Lightbox asset={asset} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}
