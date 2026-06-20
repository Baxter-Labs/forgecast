'use client';
import { useState } from 'react';
import type { StudioAsset } from '@/lib/use-forgecast';
import { AssetCard } from './AssetCard';
import { EmptyState } from './EmptyState';

interface GalleryProps {
  assets: StudioAsset[];
}

type Filter = 'all' | 'image' | 'video';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
];

export function Gallery({ assets }: GalleryProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const counts = {
    all: assets.length,
    image: assets.filter((a) => a.type === 'image').length,
    video: assets.filter((a) => a.type === 'video').length,
  };

  if (assets.length === 0) {
    return <EmptyState />;
  }

  const visible = filter === 'all' ? assets : assets.filter((a) => a.type === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Gallery header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
          Gallery <span className="text-[var(--forge-muted)]">· {counts.all}</span>
        </p>

        <div role="group" aria-label="Filter assets by type" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const selected = f.id === filter;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={selected}
                className="font-mono text-xs px-3 py-1.5 rounded border transition-all"
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
                {f.label} {counts[f.id]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid / filtered-empty message */}
      {visible.length === 0 ? (
        <p className="font-mono text-xs text-[var(--forge-faint)] py-12 text-center">
          no {filter === 'image' ? 'images' : 'videos'} yet
        </p>
      ) : (
        <div role="list" className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((asset, i) => (
            <div role="listitem" key={asset.id}>
              <AssetCard asset={asset} index={i} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
