'use client';
import { useCallback, useEffect, useState } from 'react';

export interface EditorAsset {
  id: string;
  projectId: string;
  type: 'image' | 'video' | 'audio';
  provider: string;
  params: { prompt?: string; width?: number; height?: number; model?: string; aspectRatio?: string };
  createdAt: string;
}

export interface EditorAvailability {
  image: boolean;
  video: boolean;
  voice: boolean;
  /** Voice+video narrate (ffmpeg mux) — node-only, false on the Workers/edge deploy. */
  narrate: boolean;
  /** Lip-sync new speech onto existing footage (fal sync-lipsync). */
  lipsync: boolean;
  /** AI sound effects / ambience for a video (fal mmaudio-v2). */
  sfx: boolean;
}

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200;

interface RawEditorAsset {
  id: string;
  projectId?: string;
  type?: 'image' | 'video' | 'audio';
  provider?: string;
  params?: EditorAsset['params'];
  createdAt?: string;
}

function normalize(a: RawEditorAsset): EditorAsset {
  return {
    id: a.id,
    projectId: a.projectId ?? '',
    type: a.type ?? 'image',
    provider: a.provider ?? '',
    params: a.params ?? {},
    createdAt: a.createdAt ?? '',
  };
}

/**
 * Self-contained data layer for the standalone editor page. Loads a single asset
 * by id (incl. its projectId) and drives every per-asset operation against the
 * existing API routes — decoupled from the gallery's useForgecast hook.
 */
export function useAssetEditor(assetId: string) {
  const [asset, setAsset] = useState<EditorAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Name of the op currently running (for spinners), or null. */
  const [busy, setBusy] = useState<string | null>(null);
  const [availability, setAvailability] = useState<EditorAvailability>({ image: false, video: false, voice: false, narrate: false, lipsync: false, sfx: false });
  const [variations, setVariations] = useState<EditorAsset[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, health] = await Promise.all([
        fetch(`/api/assets/${assetId}`),
        fetch('/api/health').then((r) => r.json()).catch(() => null),
      ]);
      if (!aRes.ok) throw new Error('asset not found');
      const body = (await aRes.json()) as { asset: RawEditorAsset };
      setAsset(normalize(body.asset));
      if (health?.providers) {
        setAvailability({
          image: (health.providers.image ?? []).length > 0,
          video: (health.providers.video ?? []).length > 0,
          voice: (health.providers.voice ?? []).length > 0,
          narrate: (health.providers.narrate ?? []).length > 0,
          lipsync: (health.providers.lipsync ?? []).length > 0,
          sfx: (health.providers.sfx ?? []).length > 0,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load asset');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pollJob = useCallback(async (jobId: string): Promise<string | null> => {
    for (let i = 0; i < POLL_MAX_TRIES; i++) {
      await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
      const job = await fetch(`/api/jobs/${jobId}`).then((r) => r.json()).then((b) => b.job).catch(() => null);
      if (job?.status === 'done') return job.resultAssetId ?? null;
      if (job?.status === 'error') {
        setError(job.error ?? 'Generation failed');
        return null;
      }
    }
    setError('Timed out waiting for the forge.');
    return null;
  }, []);

  const pid = asset?.projectId;

  // A synchronous op (enhance/edit/cutout): the route returns { job, asset } once done.
  const syncOp = useCallback(
    async (op: string, path: string, body?: unknown): Promise<string | null> => {
      if (!pid) return null;
      setBusy(op);
      setError(null);
      try {
        const res = await fetch(path, body
          ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : { method: 'POST' });
        const data = (await res.json().catch(() => null)) as { error?: string; job?: { status?: string; error?: string }; asset?: { id?: string } } | null;
        if (!res.ok) { setError(data?.error ?? `${op} failed`); return null; }
        if (data?.job && data.job.status !== 'done') { setError(data.job.error ?? `${op} failed`); return null; }
        return data?.asset?.id ?? null;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [pid],
  );

  // An async op (animate/narrate): the route returns 202 + a job to poll.
  const asyncOp = useCallback(
    async (op: string, path: string, body: unknown): Promise<string | null> => {
      if (!pid) return null;
      setBusy(op);
      setError(null);
      try {
        const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        const data = (await res.json().catch(() => null)) as { error?: string; job?: { id: string } } | null;
        if (res.status !== 202 || !data?.job) { setError(data?.error ?? `${op} failed`); return null; }
        return await pollJob(data.job.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
        return null;
      } finally {
        setBusy(null);
      }
    },
    [pid, pollJob],
  );

  const enhance = useCallback(() => syncOp('enhance', `/api/projects/${pid}/assets/${assetId}/enhance`), [syncOp, pid, assetId]);
  const edit = useCallback((prompt: string) => syncOp('edit', `/api/projects/${pid}/assets/${assetId}/edit`, { prompt }), [syncOp, pid, assetId]);
  const cutout = useCallback(() => syncOp('cutout', `/api/projects/${pid}/assets/${assetId}/cutout`), [syncOp, pid, assetId]);
  /** One-click camera re-angle: a preset chip id and/or a custom instruction. */
  const reangle = useCallback(
    (body: { preset?: string; instruction?: string }) => syncOp('reangle', `/api/projects/${pid}/assets/${assetId}/reangle`, body),
    [syncOp, pid, assetId],
  );
  /** One-click scene relight: a preset chip id and/or a custom instruction. */
  const relight = useCallback(
    (body: { preset?: string; instruction?: string }) => syncOp('relight', `/api/projects/${pid}/assets/${assetId}/relight`, body),
    [syncOp, pid, assetId],
  );
  const animate = useCallback(
    () => asyncOp('animate', `/api/projects/${pid}/generate-clip`, {
      prompt: 'subtle natural cinematic motion, gentle camera move',
      model: 'fal-ai/wan-pro/image-to-video',
      aspectRatio: asset?.params.aspectRatio ?? '9:16',
      imageAssetId: assetId,
    }),
    [asyncOp, pid, assetId, asset],
  );
  const narrate = useCallback((text: string) => asyncOp('narrate', `/api/projects/${pid}/narrate`, { videoAssetId: assetId, text }), [asyncOp, pid, assetId]);
  const lipsync = useCallback((text: string) => asyncOp('lipsync', `/api/projects/${pid}/lipsync`, { videoAssetId: assetId, text }), [asyncOp, pid, assetId]);
  const sfx = useCallback((prompt: string) => asyncOp('sfx', `/api/projects/${pid}/sfx`, { videoAssetId: assetId, prompt }), [asyncOp, pid, assetId]);

  const makeVariations = useCallback(async (count = 3): Promise<EditorAsset[]> => {
    if (!pid) return [];
    setBusy('variations');
    setError(null);
    try {
      const res = await fetch(`/api/projects/${pid}/assets/${assetId}/variations`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ count }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; assets?: RawEditorAsset[] } | null;
      if (!res.ok || !data?.assets) { setError(data?.error ?? 'variations failed'); return []; }
      const got = data.assets.map(normalize);
      setVariations(got);
      return got;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      return [];
    } finally {
      setBusy(null);
    }
  }, [pid, assetId]);

  return { asset, loading, error, busy, availability, variations, reload: load, enhance, edit, cutout, reangle, relight, animate, narrate, lipsync, sfx, makeVariations };
}
