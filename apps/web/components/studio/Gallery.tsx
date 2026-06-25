'use client';
import { useRef, useState } from 'react';
import type { StudioAsset } from '@/lib/use-forgecast';
import { AssetCard } from './AssetCard';
import { EmptyState } from './EmptyState';

interface GalleryProps {
  assets: StudioAsset[];
  onPublish?: (asset: StudioAsset) => void;
  onUpload?: (file: File) => void;
  onEnhance?: (assetId: string) => void;
  enhancingId?: string | null;
  onAnimate?: (assetId: string) => void;
  animatingId?: string | null;
  onEdit?: (assetId: string, prompt: string) => void;
  editingId?: string | null;
  onNarrate?: (assetId: string, text: string) => void;
  narratingId?: string | null;
  voiceAvailable?: boolean;
  videoAvailable?: boolean;
  onCompose?: (assetIds: string[], aspectRatio: string, durationSec: number) => Promise<void>;
  montageAvailable?: boolean;
}

type Filter = 'all' | 'image' | 'video';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
];

const DURATION_OPTIONS = [2, 3, 4, 5] as const;
const RATIO_OPTIONS = ['9:16', '16:9', '1:1'] as const;

// ── ComposeBar ────────────────────────────────────────────────────────────────
interface ComposeBarProps {
  count: number;
  durationSec: number;
  setDurationSec: (d: number) => void;
  aspectRatio: string;
  setAspectRatio: (r: string) => void;
  onCompose: () => void;
  onClear: () => void;
  composing: boolean;
  montageAvailable: boolean;
}

function ComposeBar({
  count, durationSec, setDurationSec, aspectRatio, setAspectRatio,
  onCompose, onClear, composing, montageAvailable,
}: ComposeBarProps) {
  const btnBase = 'font-mono text-[10px] uppercase tracking-[0.1em] px-2.5 py-1 rounded border transition-all';
  const btnActive = { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)', boxShadow: '0 0 10px var(--ember-glow)' };
  const btnInactive = { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' };

  return (
    <div
      className="sticky bottom-0 mt-4 panel p-3 flex flex-wrap items-center gap-3 z-10"
      style={{ borderColor: 'var(--ember-2)', boxShadow: '0 -2px 20px var(--ember-glow)' }}
    >
      {/* Count */}
      <span className="font-mono text-xs text-[var(--ember-1)] shrink-0">
        {count} selected
      </span>

      <div className="flex items-center gap-1.5 shrink-0">
        <span className="font-mono text-[10px] text-[var(--forge-faint)] mr-1">s/scene</span>
        {DURATION_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={durationSec === d}
            onClick={() => setDurationSec(d)}
            className={btnBase}
            style={durationSec === d ? btnActive : btnInactive}
          >
            {d}s
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {RATIO_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={aspectRatio === r}
            onClick={() => setAspectRatio(r)}
            className={btnBase}
            style={aspectRatio === r ? btnActive : btnInactive}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 ml-auto shrink-0">
        {!montageAvailable && (
          <span className="font-mono text-[10px] text-[var(--forge-faint)] opacity-60">montage offline</span>
        )}
        {composing && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.15em] px-2 py-1 rounded forging"
            style={{ color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)', border: '1px solid var(--ember-2)' }}
          >
            RENDERING…
          </span>
        )}
        <button
          type="button"
          onClick={onClear}
          className="font-mono text-[10px] text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onCompose}
          disabled={!montageAvailable || composing || count < 1}
          aria-label={`Compose video from ${count} selected assets`}
          className="btn-forge font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ▶ Compose video
        </button>
      </div>
    </div>
  );
}

// ── Gallery ───────────────────────────────────────────────────────────────────
export function Gallery({
  assets, onPublish, onUpload, onEnhance, enhancingId,
  onAnimate, animatingId,
  onEdit, editingId,
  onNarrate, narratingId, voiceAvailable,
  videoAvailable,
  onCompose, montageAvailable = false,
}: GalleryProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Selection state
  const [selectMode, setSelectMode] = useState(false);
  // Use array to preserve selection order
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [durationSec, setDurationSec] = useState(4);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [composing, setComposing] = useState(false);

  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) {
        // Exiting select mode — clear selection
        setSelectedIds([]);
      }
      return !prev;
    });
  }

  function handleSelect(assetId: string) {
    setSelectedIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
    );
  }

  function handleClear() {
    setSelectedIds([]);
    setSelectMode(false);
  }

  async function handleCompose() {
    if (!onCompose || selectedIds.length < 1) return;
    setComposing(true);
    try {
      await onCompose(selectedIds, aspectRatio, durationSec);
    } finally {
      setComposing(false);
      setSelectedIds([]);
      setSelectMode(false);
    }
  }

  const counts = {
    all: assets.length,
    image: assets.filter((a) => a.type === 'image').length,
    video: assets.filter((a) => a.type === 'video').length,
  };

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !onUpload) return;
    for (const file of Array.from(files)) {
      onUpload(file);
    }
    e.target.value = '';
  }

  const uploadButton = onUpload ? (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        aria-label="Upload asset files"
        className="sr-only"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="font-mono text-xs px-3 py-1.5 rounded border transition-all"
        style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
      >
        ⬆ Upload asset
      </button>
    </div>
  ) : null;

  if (assets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {uploadButton}
        <EmptyState />
      </div>
    );
  }

  const visible = filter === 'all' ? assets : assets.filter((a) => a.type === filter);

  return (
    <div className="flex flex-col gap-4">
      {/* Gallery header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
          Gallery <span className="text-[var(--forge-muted)]">· {counts.all}</span>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {uploadButton}
          {/* Select toggle */}
          <button
            type="button"
            aria-pressed={selectMode}
            onClick={toggleSelectMode}
            className="font-mono text-xs px-3 py-1.5 rounded border transition-all"
            style={selectMode ? {
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
            {selectMode ? `✓ Select (${selectedIds.length})` : 'Select'}
          </button>
        </div>

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
              <AssetCard
                asset={asset}
                index={i}
                onPublish={selectMode ? undefined : onPublish}
                onEnhance={selectMode ? undefined : onEnhance}
                enhancing={enhancingId === asset.id}
                onAnimate={selectMode ? undefined : onAnimate}
                animating={animatingId === asset.id}
                onEdit={selectMode ? undefined : onEdit}
                editing={editingId === asset.id}
                onNarrate={selectMode ? undefined : onNarrate}
                narrating={narratingId === asset.id}
                narrateAvailable={voiceAvailable}
                videoAvailable={videoAvailable}
                selectable={selectMode}
                selected={selectedIds.includes(asset.id)}
                onSelect={handleSelect}
              />
            </div>
          ))}
        </div>
      )}

      {/* Compose bar — visible when select mode is on and ≥1 asset selected */}
      {selectMode && selectedIds.length >= 1 && (
        <ComposeBar
          count={selectedIds.length}
          durationSec={durationSec}
          setDurationSec={setDurationSec}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          onCompose={handleCompose}
          onClear={handleClear}
          composing={composing}
          montageAvailable={montageAvailable}
        />
      )}
    </div>
  );
}
