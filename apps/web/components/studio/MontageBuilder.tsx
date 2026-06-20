'use client';
import { useState } from 'react';
import type { StudioAsset } from '@/lib/use-forgecast';

const DND_TYPE = 'text/forgecast-asset';

interface MontageBuilderProps {
  assets: StudioAsset[];
  selectedAssetIds: string[];
  setSelectedAssetIds: (ids: string[] | ((p: string[]) => string[])) => void;
}

function AssetThumb({ asset, className }: { asset: StudioAsset; className: string }) {
  const alt = asset.params.prompt
    ? `${asset.type === 'video' ? 'Video' : 'Image'}: ${asset.params.prompt}`
    : asset.type === 'video' ? 'Generated video' : 'Generated image';
  if (asset.type === 'video') {
    return (
      <video
        src={`/api/assets/${asset.id}/raw`}
        muted
        playsInline
        aria-label={alt}
        className={className}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/assets/${asset.id}/raw`}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
}

export function MontageBuilder({ assets, selectedAssetIds, setSelectedAssetIds }: MontageBuilderProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  function add(id: string) {
    setSelectedAssetIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function remove(id: string) {
    setSelectedAssetIds((prev) => prev.filter((x) => x !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setSelectedAssetIds((prev) => {
      const i = prev.indexOf(id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  // Insert draggedId immediately before targetId (both must already be in the tray).
  function reorder(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    setSelectedAssetIds((prev) => {
      if (!prev.includes(draggedId)) return prev;
      const without = prev.filter((x) => x !== draggedId);
      const target = without.indexOf(targetId);
      if (target < 0) return [...without, draggedId];
      return [...without.slice(0, target), draggedId, ...without.slice(target)];
    });
  }

  const byId = new Map(assets.map((a) => [a.id, a]));
  const scenes = selectedAssetIds.map((id) => byId.get(id)).filter((a): a is StudioAsset => Boolean(a));

  function onTrayDrop(e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData(DND_TYPE);
    setDraggingId(null);
    if (id) add(id);
  }

  function onChipDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(DND_TYPE);
    setDraggingId(null);
    if (!id) return;
    if (selectedAssetIds.includes(id)) {
      reorder(id, targetId);
    } else {
      add(id); // dropping a source asset onto a chip: just append
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* (a) SCENE TRAY = DROP ZONE */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
          Scenes
        </p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onTrayDrop}
          role="list"
          aria-label="Montage scenes, in play order"
          className={`rounded-lg p-2.5 min-h-[92px] transition-colors ${
            scenes.length === 0
              ? 'border border-dashed border-[var(--forge-border)] grid place-items-center'
              : 'border border-[var(--forge-border)] bg-[var(--forge-surface-2)] flex flex-wrap gap-2'
          }`}
        >
          {scenes.length === 0 ? (
            <div className="text-center px-4 py-3">
              <p className="font-mono text-xs text-[var(--forge-faint)]">
                Drop assets here to build a montage
              </p>
              <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-1 opacity-80">
                or use ⊕ on a thumbnail below
              </p>
            </div>
          ) : (
            scenes.map((a, i) => {
              const num = i + 1;
              return (
                <div
                  key={a.id}
                  role="listitem"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_TYPE, a.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDraggingId(a.id);
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onChipDrop(e, a.id)}
                  className="group relative w-16 h-16 rounded-md overflow-hidden border cursor-grab active:cursor-grabbing"
                  style={{
                    borderColor: 'var(--ember-2)',
                    boxShadow: '0 0 0 1px var(--ember-glow)',
                    opacity: draggingId === a.id ? 0.4 : 1,
                  }}
                >
                  <AssetThumb asset={a} className="w-full h-full object-cover block bg-black pointer-events-none" />

                  {/* Order number badge */}
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 left-0.5 font-mono text-[10px] leading-none w-4 h-4 grid place-items-center rounded"
                    style={{ background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 6px var(--ember-glow)' }}
                  >
                    {num}
                  </span>

                  {a.type === 'video' && (
                    <span aria-hidden="true" className="absolute bottom-0.5 left-0.5 text-[10px] leading-none text-[var(--ember-1)]" style={{ textShadow: '0 0 4px #000' }}>▶</span>
                  )}

                  {/* Hover/focus controls */}
                  <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" style={{ background: 'rgba(16,13,11,0.7)' }}>
                    <button
                      type="button"
                      onClick={() => move(a.id, -1)}
                      disabled={i === 0}
                      aria-label={`Move scene ${num} left`}
                      className="font-mono text-[11px] leading-none w-4 h-4 grid place-items-center rounded text-[var(--forge-text)] disabled:opacity-30 hover:text-[var(--ember-1)]"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => move(a.id, 1)}
                      disabled={i === scenes.length - 1}
                      aria-label={`Move scene ${num} right`}
                      className="font-mono text-[11px] leading-none w-4 h-4 grid place-items-center rounded text-[var(--forge-text)] disabled:opacity-30 hover:text-[var(--ember-1)]"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      aria-label={`Remove scene ${num}`}
                      className="font-mono text-[11px] leading-none w-4 h-4 grid place-items-center rounded text-[var(--forge-text)] hover:text-[var(--ember-3)]"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* (b) SOURCE STRIP */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
          Add scenes
        </p>
        {assets.length === 0 ? (
          <p className="font-mono text-xs text-[var(--forge-faint)] py-6 text-center">
            generate some assets first
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto pr-1">
            {assets.map((a) => {
              const added = selectedAssetIds.includes(a.id);
              const label = `Add ${a.params.prompt ?? 'asset'} to montage`;
              return (
                <button
                  key={a.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_TYPE, a.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => add(a.id)}
                  aria-label={label}
                  aria-pressed={added}
                  className="group relative aspect-square rounded-md overflow-hidden border transition-all cursor-grab active:cursor-grabbing"
                  style={{
                    borderColor: added ? 'var(--ember-2)' : 'var(--forge-border)',
                    boxShadow: added ? '0 0 0 2px var(--ember-glow), 0 0 10px var(--ember-glow)' : 'none',
                  }}
                >
                  <AssetThumb asset={a} className="w-full h-full object-cover block bg-black pointer-events-none" />

                  {a.type === 'video' && (
                    <span aria-hidden="true" className="absolute bottom-0.5 left-0.5 text-[10px] leading-none text-[var(--ember-1)]" style={{ textShadow: '0 0 4px #000' }}>▶</span>
                  )}

                  {/* Add / added overlay */}
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 text-[12px] leading-none w-4 h-4 grid place-items-center rounded"
                    style={
                      added
                        ? { background: 'var(--molten)', color: '#1a0c03' }
                        : { color: 'var(--forge-text)', background: 'rgba(16,13,11,0.6)' }
                    }
                  >
                    {added ? '✓' : '⊕'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
