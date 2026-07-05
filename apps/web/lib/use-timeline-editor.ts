'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudioAsset } from './use-forgecast';
import { emptyControls, toDoc, toUI, type TimelineControls } from './timeline-ui';

interface RawAsset { id: string; type?: StudioAsset['type']; params?: StudioAsset['params']; provider?: string; createdAt?: string }

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200;
const AUTOSAVE_DEBOUNCE_MS = 900;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type RenderState = 'idle' | 'rendering' | 'done' | 'error';

/**
 * Standalone state for the /editor workspace: loads the project + assets + saved
 * timeline, autosaves edits (debounced), and renders through the montage pipeline.
 * Deliberately decoupled from useForgecast (same pattern as useAssetEditor).
 */
export function useTimelineEditor(requestedProjectId?: string | null) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [timeline, setTimeline] = useState<TimelineControls>(emptyControls());
  const [loaded, setLoaded] = useState(false);
  const [available, setAvailable] = useState(true); // montage renderer present
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [renderState, setRenderState] = useState<RenderState>('idle');
  const [resultAssetId, setResultAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Autosave bookkeeping: skip the hydration set, debounce user edits.
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(timeline);
  latestRef.current = timeline;

  const refreshAssets = useCallback(async (pid: string) => {
    const body = await fetch(`/api/projects/${pid}/assets`).then((r) => r.json()).catch(() => ({ assets: [] }));
    setAssets((((body.assets ?? []) as RawAsset[])).map((a) => ({
      id: a.id, type: a.type ?? 'image', params: a.params ?? {}, provider: a.provider ?? '', createdAt: a.createdAt ?? '',
    })).reverse());
  }, []);

  // Boot: resolve the project (requested or first), then assets + saved timeline + availability.
  useEffect(() => {
    (async () => {
      const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
      setAvailable((health?.providers?.montage ?? []).length > 0);

      let pid = requestedProjectId ?? null;
      if (!pid) {
        const list = await fetch('/api/projects').then((r) => r.json()).catch(() => ({ projects: [] }));
        pid = list.projects?.[0]?.id ?? null;
        if (!pid) {
          const created = await fetch('/api/projects', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'My Forge' }),
          }).then((r) => r.json()).catch(() => null);
          pid = created?.project?.id ?? null;
        }
      }
      if (!pid) { setError('No project available'); setLoaded(true); return; }
      setProjectId(pid);

      const [tl] = await Promise.all([
        fetch(`/api/projects/${pid}/timeline`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        refreshAssets(pid),
      ]);
      if (tl?.timeline) setTimeline(toUI(tl.timeline));
      hydratedRef.current = true;
      setLoaded(true);
    })();
  }, [requestedProjectId, refreshAssets]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!projectId) return false;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeline: toDoc(latestRef.current) }),
      });
      if (!res.ok) { setSaveState('error'); return false; }
      setSaveState('saved');
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }, [projectId]);

  // Debounced autosave on any edit after hydration.
  useEffect(() => {
    if (!hydratedRef.current || !projectId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void saveNow(); }, AUTOSAVE_DEBOUNCE_MS);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [timeline, projectId, saveNow]);

  const render = useCallback(async (): Promise<string | null> => {
    if (!projectId) return null;
    if (latestRef.current.clips.length === 0) { setError('Add at least one clip'); setRenderState('error'); return null; }
    setRenderState('rendering'); setError(null); setResultAssetId(null);
    try {
      await saveNow(); // agents see what was rendered
      const res = await fetch(`/api/projects/${projectId}/timeline/render`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeline: toDoc(latestRef.current) }),
      });
      const body = await res.json().catch(() => null);
      if (res.status !== 202) { setError(body?.error ?? 'Failed to start the render'); setRenderState('error'); return null; }
      const jobId = body.job.id as string;
      for (let i = 0; i < POLL_MAX_TRIES; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const job = await fetch(`/api/jobs/${jobId}`).then((r) => r.json()).then((b) => b.job).catch(() => null);
        if (job?.status === 'done') {
          await refreshAssets(projectId);
          setRenderState('done');
          setResultAssetId(job.resultAssetId ?? null);
          return job.resultAssetId ?? null;
        }
        if (job?.status === 'error') { setError(job.error ?? 'Render failed'); setRenderState('error'); return null; }
      }
      setError('Timed out waiting for the render'); setRenderState('error'); return null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setRenderState('error'); return null;
    }
  }, [projectId, saveNow, refreshAssets]);

  return {
    projectId, assets, loaded, available,
    timeline, setTimeline,
    saveState, saveNow,
    render, renderState, resultAssetId,
    error,
  };
}
