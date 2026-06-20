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
interface GenerateVideoArgs { prompt: string; aspectRatio?: string; model?: string }
interface GenerateMontageArgs { prompts: string[]; aspectRatio?: string; model?: string }

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_TRIES = 120;

export function useForgecast() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [publishers, setPublishers] = useState<string[]>([]);
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
      const pubs: string[] = health?.publishers ?? [];
      setProviders(image);
      setPublishers(pubs);
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

  // Poll a job until terminal; refresh assets on success.
  const pollJob = useCallback(async (jobId: string): Promise<{ outcome: 'done' | 'error'; assetId?: string }> => {
    for (let i = 0; i < POLL_MAX_TRIES; i++) {
      await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
      const job = await fetch(`/api/jobs/${jobId}`).then((r) => r.json()).then((b) => b.job).catch(() => null);
      if (job?.status === 'done') { await refreshAssets(); return { outcome: 'done', assetId: job.resultAssetId }; }
      if (job?.status === 'error') { setError(job.error ?? 'Generation failed'); return { outcome: 'error' }; }
    }
    setError('Timed out waiting for the forge.');
    return { outcome: 'error' };
  }, [refreshAssets]);

  // Read a JSON {error} body from a non-2xx response so the UI can show WHY.
  async function readError(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    return body?.error ?? fallback;
  }

  const generateImage = useCallback(async (args: GenerateImageArgs): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Generation failed'); setStatus('error'); return null; }
      if (body.job?.status === 'done' && body.asset) {
        setAssets((prev) => [normalizeAsset(body.asset), ...prev]); setStatus('idle');
        return (body.asset as { id?: string }).id ?? null;
      } else {
        setError(body.job?.error ?? 'Generation failed'); setStatus('error'); return null;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId]);

  const generateVideo = useCallback(async ({ prompt, aspectRatio, model }: GenerateVideoArgs): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-clip`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, aspectRatio, model }),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start clip')); setStatus('error'); return null; }
      const { job } = await res.json();
      const { outcome, assetId } = await pollJob(job.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return assetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId, pollJob]);

  const generateMontage = useCallback(async ({ prompts, aspectRatio, model }: GenerateMontageArgs): Promise<string | null> => {
    if (!projectId) return null;
    const validPrompts = prompts.filter((p) => p.trim());
    if (validPrompts.length < 2) { setError('Add at least 2 video prompts to build a montage'); setStatus('error'); return null; }
    setStatus('forging'); setError(null);
    try {
      // 1. Submit all video clip jobs in parallel.
      const jobIds = await Promise.all(validPrompts.map(async (prompt) => {
        const res = await fetch(`/api/projects/${projectId}/generate-clip`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt, aspectRatio, model }),
        });
        if (res.status !== 202) throw new Error(await readError(res, 'Failed to start clip'));
        const { job } = await res.json();
        return job.id as string;
      }));

      // 2. Poll all clip jobs to completion.
      const clipResults = await Promise.all(jobIds.map((id) => pollJob(id)));
      const assetIds = clipResults.flatMap((r) => (r.assetId ? [r.assetId] : []));
      if (clipResults.some((r) => r.outcome === 'error') || assetIds.length < 2) {
        setError('One or more video clips failed — cannot stitch montage'); setStatus('error'); return null;
      }

      // 3. Stitch the completed clips into a montage.
      const montageRes = await fetch(`/api/projects/${projectId}/generate-montage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetIds, aspectRatio }),
      });
      if (montageRes.status !== 202) { setError(await readError(montageRes, 'Failed to start montage')); setStatus('error'); return null; }
      const { job: montageJob } = await montageRes.json();
      const { outcome, assetId } = await pollJob(montageJob.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return assetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId, pollJob]);

  // After an agent run, video jobs and montage clip jobs render in the background.
  // Poll both tracks in parallel; once montage clips are done, stitch them.
  const awaitAgentJobs = useCallback(async (result: {
    videoJobIds?: string[];
    montageJobIds?: string[];
    montageJobId?: string;
    pendingMontage?: { aspectRatio?: string };
  }): Promise<string[]> => {
    const videoIds = [...(result.videoJobIds ?? []), ...(result.montageJobId ? [result.montageJobId] : [])].filter(Boolean);
    const clipIds = (result.montageJobIds ?? []).filter(Boolean);
    if (videoIds.length === 0 && clipIds.length === 0) return [];
    setStatus('forging'); setError(null);

    let allAssetIds: string[] = [];

    // Poll regular video assets and montage clips concurrently.
    const [videoResults, clipResults] = await Promise.all([
      videoIds.length > 0 ? Promise.all(videoIds.map((id) => pollJob(id))) : Promise.resolve([]),
      clipIds.length > 0 ? Promise.all(clipIds.map((id) => pollJob(id))) : Promise.resolve([]),
    ]);

    allAssetIds = videoResults.flatMap((r) => (r.assetId ? [r.assetId] : []));
    if (videoResults.some((r) => r.outcome === 'error')) { setStatus('error'); return allAssetIds; }

    // Stitch the montage clips once they've all completed.
    if (result.pendingMontage && clipIds.length >= 2 && projectId) {
      const clipAssetIds = clipResults.flatMap((r) => (r.assetId ? [r.assetId] : []));
      if (clipAssetIds.length >= 2) {
        const res = await fetch(`/api/projects/${projectId}/generate-montage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ assetIds: clipAssetIds, aspectRatio: result.pendingMontage.aspectRatio ?? '9:16' }),
        });
        if (res.ok) {
          const { job } = await res.json() as { job: { id: string } };
          const { outcome, assetId } = await pollJob(job.id);
          if (assetId) allAssetIds = [...allAssetIds, assetId];
          if (outcome === 'error') { setStatus('error'); return allAssetIds; }
        }
      }
    }

    setStatus('idle');
    return allAssetIds;
  }, [pollJob, projectId]);

  const publishAsset = useCallback(async (assetId: string, content: string, channels?: string[], publisher?: string): Promise<{ postId?: string; status?: string; error?: string }> => {
    try {
      const body: Record<string, unknown> = { content };
      if (channels && channels.length > 0) body.channels = channels;
      if (publisher) body.publisher = publisher;
      const res = await fetch(`/api/assets/${assetId}/publish`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: data?.error ?? `Publish failed (${res.status})` };
      return data?.published ?? { error: 'Unexpected response' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }, []);

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
    projectId, providers, publishers, availability, pro, refreshPro,
    assets, status, error,
    generateImage, generateVideo, generateMontage,
    publishAsset,
    agentPlan, agentExecute, refreshAssets, awaitAgentJobs,
  };
}
