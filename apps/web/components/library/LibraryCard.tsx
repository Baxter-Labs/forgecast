'use client';
import { useState } from 'react';
import { X, Plus, Tag } from 'lucide-react';
import type { StudioAsset } from '@/lib/use-forgecast';
import { AssetCard } from '@/components/studio/AssetCard';

export interface LibraryItem extends StudioAsset {
  projectId: string;
  projectName: string | null;
  tags: string[];
}

interface LibraryCardProps {
  item: LibraryItem;
  index: number;
  onTagsChange: (assetId: string, tags: string[]) => Promise<void>;
}

export function LibraryCard({ item, index, onTagsChange }: LibraryCardProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function commit(next: string[]) {
    setBusy(true);
    try {
      await onTagsChange(item.id, next);
    } finally {
      setBusy(false);
    }
  }

  async function addTag() {
    const t = draft.trim();
    setDraft('');
    setAdding(false);
    if (!t || item.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    await commit([...item.tags, t]);
  }

  async function removeTag(tag: string) {
    await commit(item.tags.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-col gap-2">
      <AssetCard asset={item} index={index} />
      <div className="flex flex-col gap-1.5 px-0.5">
        {item.projectName && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--forge-faint)] truncate">
            {item.projectName}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Tags">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border"
              style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.06)' }}
            >
              <Tag size={9} aria-hidden="true" /> {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={busy}
                aria-label={`Remove tag ${tag}`}
                className="hover:text-[var(--forge-text)] transition-colors disabled:opacity-40"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {adding ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={addTag}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void addTag(); }
                if (e.key === 'Escape') { setDraft(''); setAdding(false); }
              }}
              placeholder="tag…"
              aria-label="New tag"
              className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-transparent w-20 outline-none"
              style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-text)' }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              disabled={busy}
              aria-label="Add tag"
              className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors hover:border-[var(--ember-2)] hover:text-[var(--ember-1)] disabled:opacity-40"
              style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}
            >
              <Plus size={10} /> tag
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
