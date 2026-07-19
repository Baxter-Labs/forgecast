'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lightbulb, Sparkles } from 'lucide-react';
import { AppNav } from '@/components/AppNav';
import { BrainstormBoardCard, type Board } from './BrainstormBoardCard';

const PLATFORMS = ['instagram', 'linkedin', 'youtube', 'tiktok'];

/**
 * Brainstorm boards — the persisted, revisitable version of the agent's chat-only
 * ideation. Plan a brief into a board (concept + idea prompts + captions), which
 * is saved server-side per project; each idea can be forged into the gallery.
 */
export function BrainstormWorkspace() {
  const params = useSearchParams();
  const projectParam = params.get('project');

  const [projectId, setProjectId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);

  // New-board planner state
  const [brief, setBrief] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['instagram']);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Per-idea generation state
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [ideaError, setIdeaError] = useState<{ ideaId: string; message: string } | null>(null);

  // Resolve a project (URL param → first project → create one), then load boards.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // Capability check so the Generate buttons can be disabled with a hint.
        fetch('/api/health')
          .then((r) => (r.ok ? r.json() : null))
          .then((h: { providers?: { image?: string[]; video?: string[] } } | null) => {
            if (!cancelled) setCanGenerate(Boolean((h?.providers?.image?.length ?? 0) || (h?.providers?.video?.length ?? 0)));
          })
          .catch(() => undefined);

        let id = projectParam ?? undefined;
        if (!id) {
          const list = await fetch('/api/projects').then((r) => r.json()).catch(() => ({ projects: [] }));
          id = list.projects?.[0]?.id;
          if (!id) {
            const created = await fetch('/api/projects', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: 'My Forge' }),
            }).then((r) => r.json());
            id = created.project?.id;
          }
        }
        if (!id) throw new Error('Could not resolve a project');
        if (cancelled) return;
        setProjectId(id);
        const res = await fetch(`/api/projects/${id}/brainstorm`);
        const body = await res.json().catch(() => ({ boards: [] }));
        if (cancelled) return;
        if (!res.ok) throw new Error((body as { error?: string })?.error ?? 'Failed to load boards');
        setBoards(((body as { boards?: Board[] }).boards ?? []));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load boards');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectParam]);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const planBoard = useCallback(async () => {
    if (!brief.trim() || !projectId) return;
    setPlanning(true); setPlanError(null);
    try {
      const chosen = platforms.length ? platforms : ['instagram'];
      const planRes = await fetch('/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'plan', brief, platforms: chosen, projectId }),
      });
      const planBody = await planRes.json().catch(() => null);
      if (!planRes.ok || !planBody?.plan) {
        setPlanError((planBody as { error?: string })?.error ?? 'Planning failed');
        return;
      }
      const saveRes = await fetch(`/api/projects/${projectId}/brainstorm`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: planBody.plan, brief, platforms: chosen }),
      });
      const saveBody = await saveRes.json().catch(() => null);
      if (!saveRes.ok || !saveBody?.board) {
        setPlanError((saveBody as { error?: string })?.error ?? 'Failed to save the board');
        return;
      }
      setBoards((prev) => [saveBody.board as Board, ...prev]);
      setBrief('');
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setPlanning(false);
    }
  }, [brief, platforms, projectId]);

  const generateIdea = useCallback(async (boardId: string, ideaId: string) => {
    if (!projectId) return;
    setGeneratingId(ideaId); setIdeaError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/brainstorm/${boardId}/ideas/${ideaId}/generate`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setIdeaError({ ideaId, message: (body as { error?: string })?.error ?? 'Generation failed' });
        return;
      }
      // Image ideas return the updated board (assetId stamped); reflect it.
      if (body?.board) {
        setBoards((prev) => prev.map((b) => (b.id === boardId ? (body.board as Board) : b)));
      }
    } catch (e) {
      setIdeaError({ ideaId, message: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setGeneratingId(null);
    }
  }, [projectId]);

  const removeBoard = useCallback(async (boardId: string) => {
    if (!projectId) return;
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    await fetch(`/api/projects/${projectId}/brainstorm/${boardId}`, { method: 'DELETE' }).catch(() => undefined);
  }, [projectId]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--forge-bg)', color: 'var(--forge-text)' }}>
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 border-b" style={{ borderColor: 'var(--forge-border)' }}>
        <AppNav />
        <div className="flex items-center gap-2">
          <Lightbulb size={15} className="text-[var(--ember-1)]" aria-hidden="true" />
          <h1 className="font-mono text-[13px] uppercase tracking-[0.16em] text-[var(--forge-text)]">
            Brainstorm <span className="text-[var(--forge-faint)]">· {boards.length}</span>
          </h1>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-5 py-6 flex flex-col gap-6">
        {/* New board planner */}
        <div className="panel p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="grid place-items-center w-6 h-6 rounded-md" style={{ background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 12px var(--ember-glow)' }}>
              <Sparkles size={14} strokeWidth={2.2} />
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--forge-text)]">
              New board · <span className="text-[var(--forge-muted)]">brief it, save it, forge it later</span>
            </span>
          </div>

          <label htmlFor="board-brief" className="sr-only">Creative brief</label>
          <textarea
            id="board-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Ideas for an eco-friendly sneaker launch across socials…"
            rows={3}
            disabled={planning}
            className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)] disabled:opacity-60"
          />

          <div role="group" aria-label="Target platforms" className="flex flex-wrap items-center gap-2 mt-3">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  aria-pressed={on}
                  className="font-mono text-[11px] px-2.5 py-1 rounded-full border transition-all lowercase"
                  style={on
                    ? { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', boxShadow: '0 0 10px var(--ember-glow)', background: 'rgba(255,122,26,0.06)' }
                    : { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="button"
              onClick={() => void planBoard()}
              disabled={!brief.trim() || planning || !projectId}
              className={`btn-forge rounded-lg py-2.5 px-5 text-xs ${planning ? 'forging' : ''}`}
            >
              {planning ? '⚒ PLANNING…' : 'GENERATE IDEAS'}
            </button>
            {planError && <p className="font-mono text-[11px] text-[var(--forge-muted)] leading-relaxed">{planError}</p>}
          </div>
        </div>

        {/* Boards */}
        {loading ? (
          <p className="font-mono text-xs text-[var(--forge-faint)] forging">loading boards…</p>
        ) : loadError ? (
          <div className="panel p-4" style={{ borderColor: 'rgba(229, 51, 27, 0.4)' }}>
            <p className="font-mono text-xs text-[var(--forge-muted)]">{loadError}</p>
          </div>
        ) : boards.length === 0 ? (
          <div className="panel p-8 text-center">
            <Lightbulb size={22} className="mx-auto text-[var(--forge-faint)] mb-3" aria-hidden="true" />
            <p className="text-sm text-[var(--forge-muted)]">No boards yet — brief an idea above to save your first board.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {boards.map((board) => (
              <BrainstormBoardCard
                key={board.id}
                board={board}
                canGenerate={canGenerate}
                generatingId={generatingId}
                ideaError={ideaError}
                onGenerate={(ideaId) => generateIdea(board.id, ideaId)}
                onRemove={() => void removeBoard(board.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
