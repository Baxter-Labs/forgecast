'use client';
import { useCallback, useEffect, useState } from 'react';

export interface StudioAsset {
  id: string;
  type: 'image' | 'video' | 'audio';
  params: { prompt?: string; width?: number; height?: number; model?: string; aspectRatio?: string };
  provider: string;
  createdAt: string;
}

export interface Availability {
  image: boolean;
  video: boolean;
  montage: boolean;
}

interface RawAsset {
  id: string;
  type?: 'image' | 'video' | 'audio';
  params?: StudioAsset['params'];
  provider?: string;
  createdAt?: string;
}

function normalizeAsset(a: RawAsset): StudioAsset {
  return {
    id: a.id,
    type: a.type ?? 'image',
    params: a.params ?? {},
    provider: a.provider ?? '',
    createdAt: a.createdAt ?? '',
  };
}

interface GenerateImageArgs { prompt: string; model?: string; width?: number; height?: number }
interface GenerateVideoArgs { prompt: string; aspectRatio?: string }
interface GenerateMontageArgs { assetIds: string[]; aspectRatio?: string }

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_TRIES = 120;

export function useForgecast() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Availability>({ image: false, video: false, montage: false });
  const [pro, setPro] = useState(false);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [status, setStatus] = useState<'idle' | 'forging' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const refreshPro = useCallback(async () => {
    const billing = await fetch('/api/billing/status').then((r) => r.json()).catch(() => null);
    setPro(Boolean(billing?.pro));
  }, []);

  useEffect(() => {
    (async () => {
      const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
      const image: string[] = health?.providers?.image ?? [];
      const video: string[] = health?.providers?.video ?? [];
      const montage: string[] = health?.providers?.montage ?? [];
      setProviders(image);
      setAvailability({ image: image.length > 0, video: video.length > 0, montage: montage.length > 0 });

      await refreshPro();

      const list = await fetch('/api/projects').then((r) => r.json()).catch(() => ({ projects: [] }));
      let id: string | undefined = list.projects?.[0]?.id;
      if (!id) {
        const created = await fetch('/api/projects', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'My Forge' }),
        }).then((r) => r.json());
        id = created.project.id;
      }
      setProjectId(id!);
      const a = await fetch(`/api/projects/${id}/assets`).then((r) => r.json()).catch(() => ({ assets: [] }));
      setAssets(((a.assets ?? []) as RawAsset[]).map(normalizeAsset).reverse());
    })();
  }, [refreshPro]);

  const refreshAssets = useCallback(async (id?: string | null) => {
    const pid = id ?? projectId;
    if (!pid) return;
    const a = await fetch(`/api/projects/${pid}/assets`).then((r) => r.json()).catch(() => ({ assets: [] }));
    setAssets(((a.assets ?? []) as RawAsset[]).map(normalizeAsset).reverse());
  }, [projectId]);

  // Poll a job until terminal; refresh assets on success. Returns the terminal status.
  const pollJob = useCallback(async (jobId: string): Promise<'done' | 'error'> => {
    for (let i = 0; i < POLL_MAX_TRIES; i++) {
      await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
      const job = await fetch(`/api/jobs/${jobId}`).then((r) => r.json()).then((b) => b.job).catch(() => null);
      if (job?.status === 'done') { await refreshAssets(); return 'done'; }
      if (job?.status === 'error') { setError(job.error ?? 'Generation failed'); return 'error'; }
    }
    setError('Timed out waiting for the forge.');
    return 'error';
  }, [refreshAssets]);

  // Read a JSON {error} body from a non-2xx response so the UI can show WHY.
  async function readError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    return body?.error ?? fallback;
  }

  const generateImage = useCallback(async (args: GenerateImageArgs) => {
    if (!projectId) return;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Generation failed'); setStatus('error'); return; }
      if (body.job?.status === 'done' && body.asset) {
        setAssets((prev) => [normalizeAsset(body.asset), ...prev]); setStatus('idle');
      } else {
        setError(body.job?.error ?? 'Generation failed'); setStatus('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error');
    }
  }, [projectId]);

  const generateVideo = useCallback(async ({ prompt, aspectRatio }: GenerateVideoArgs) => {
    if (!projectId) return;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-clip`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio }),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start clip')); setStatus('error'); return; }
      const { job } = await res.json();
      const terminal = await pollJob(job.id);
      setStatus(terminal === 'done' ? 'idle' : 'error');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error');
    }
  }, [projectId, pollJob]);

  const generateMontage = useCallback(async ({ assetIds, aspectRatio }: GenerateMontageArgs) => {
    if (!projectId) return;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-montage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetIds, aspectRatio }),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start montage')); setStatus('error'); return; }
      const { job } = await res.json();
      const terminal = await pollJob(job.id);
      setStatus(terminal === 'done' ? 'idle' : 'error');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error');
    }
  }, [projectId, pollJob]);

  const agentPlan = useCallback(async (brief: string, platforms: string[]) => {
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'plan', brief, platforms }),
      });
      return (await res.json().catch(() => ({ error: 'Network error' }))) as { plan?: unknown; error?: string };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }, []);

  const agentExecute = useCallback(async (plan: unknown, opts?: { projectName?: string; publish?: boolean }) => {
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        // Generate into the project the gallery is showing so results are visible.
        body: JSON.stringify({ mode: 'execute', plan, projectId, ...opts }),
      });
      return (await res.json().catch(() => ({ error: 'Network error' }))) as { result?: unknown; error?: string };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }, [projectId]);

  return {
    projectId, providers, availability, pro, refreshPro,
    assets, status, error,
    generateImage, generateVideo, generateMontage,
    agentPlan, agentExecute, refreshAssets,
  };
}
