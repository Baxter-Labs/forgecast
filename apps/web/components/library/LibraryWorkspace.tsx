'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AppNav } from '@/components/AppNav';
import { LibraryCard, type LibraryItem } from './LibraryCard';

type TypeFilter = 'all' | 'image' | 'video' | 'audio';
const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
  { id: 'audio', label: 'Voice' },
];

const chipBase = 'font-mono text-[11px] uppercase tracking-[0.1em] px-2.5 py-1 rounded border transition-all';
const chipOn = { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)', boxShadow: '0 0 10px var(--ember-glow)' } as const;
const chipOff = { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' } as const;

function matchesQuery(item: LibraryItem, q: string): boolean {
  if (!q) return true;
  const hay = [
    item.params.prompt, item.params.text, item.projectName, item.provider,
    ...(item.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

export function LibraryWorkspace() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { assets: LibraryItem[]; tags: string[] };
      setItems(body.assets ?? []);
      setAllTags(body.tags ?? []);
    } catch {
      setError('could not load your library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateTags = useCallback(async (assetId: string, tags: string[]) => {
    const res = await fetch(`/api/assets/${assetId}/tags`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tags }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { asset: { params: { tags?: string[] } } };
    const next = body.asset.params.tags ?? [];
    setItems((prev) => prev.map((it) => (it.id === assetId ? { ...it, tags: next, params: { ...it.params, tags: next } } : it)));
    setActiveTags((prev) => prev.filter((t) => next.includes(t) || items.some((it) => it.id !== assetId && it.tags.includes(t))));
  }, [items]);

  // Keep the tag-filter universe in sync as tags are added/removed.
  useEffect(() => {
    const union = [...new Set(items.flatMap((it) => it.tags))].sort((a, b) => a.localeCompare(b));
    setAllTags(union);
  }, [items]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (it) =>
        (typeFilter === 'all' || it.type === typeFilter) &&
        matchesQuery(it, q) &&
        activeTags.every((t) => it.tags.includes(t)),
    );
  }, [items, query, typeFilter, activeTags]);

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 border-b" style={{ borderColor: 'var(--forge-border)' }}>
        <AppNav />
        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
          Library <span className="text-[var(--forge-muted)]">· {items.length}</span>
        </p>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--forge-faint)]" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts, tags, projects…"
            aria-label="Search library"
            className="font-mono text-xs pl-8 pr-3 py-1.5 rounded border bg-transparent w-64 max-w-full outline-none focus:border-[var(--ember-2)]"
            style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-text)' }}
          />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-5 py-6 flex flex-col gap-5">
        {/* Type + tag filters */}
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Filter by type" className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((f) => {
              const on = f.id === typeFilter;
              return (
                <button key={f.id} type="button" aria-pressed={on} onClick={() => setTypeFilter(f.id)} className={chipBase} style={on ? chipOn : chipOff}>
                  {f.label}
                </button>
              );
            })}
          </div>
          {allTags.length > 0 && (
            <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-2 items-center">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-muted)] mr-1">Tags</span>
              {allTags.map((tag) => {
                const on = activeTags.includes(tag);
                return (
                  <button key={tag} type="button" aria-pressed={on} onClick={() => toggleTag(tag)} className="font-mono text-[10px] px-2 py-0.5 rounded border transition-all" style={on ? chipOn : chipOff}>
                    {tag}
                  </button>
                );
              })}
              {activeTags.length > 0 && (
                <button type="button" onClick={() => setActiveTags([])} className="font-mono text-[10px] text-[var(--forge-faint)] hover:text-[var(--forge-text)] transition-colors">
                  clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <p className="font-mono text-xs text-[var(--forge-faint)] py-16 text-center">loading…</p>
        ) : error ? (
          <p role="alert" className="font-mono text-xs text-red-300 py-16 text-center">{error}</p>
        ) : items.length === 0 ? (
          <p className="font-mono text-xs text-[var(--forge-faint)] py-16 text-center">
            nothing forged yet — head to the Studio and generate your first asset
          </p>
        ) : visible.length === 0 ? (
          <p className="font-mono text-xs text-[var(--forge-faint)] py-16 text-center">no assets match your filters</p>
        ) : (
          <div role="list" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {visible.map((item, i) => (
              <div role="listitem" key={item.id}>
                <LibraryCard item={item} index={i} onTagsChange={updateTags} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
