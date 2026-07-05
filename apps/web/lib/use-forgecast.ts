'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ShortVideoOptions, EditorTimeline } from '@forgecast/core';

export type { ShortVideoOptions, EditorTimeline };

export interface StudioAsset {
  id: string;
  type: 'image' | 'video' | 'audio';
  params: { prompt?: string; text?: string; width?: number; height?: number; model?: string; aspectRatio?: string };
  provider: string;
  createdAt: string;
}

export interface Availability {
  image: boolean;
  video: boolean;
  montage: boolean;
  short: boolean;
  voice: boolean;
  transcribe: boolean;
  presenter: boolean;
}

export interface SessionUser { id: string; email: string; name?: string; avatarUrl?: string }
export interface SessionInfo { enabled: boolean; user: SessionUser | null }

/** Fetch the session; when auth is enabled and there is no user, bounce to /signin. */
export async function ensureSignedIn(): Promise<SessionInfo> {
  const session = (await fetch('/api/auth/session').then((r) => r.json()).catch(() => null)) as SessionInfo | null;
  const info: SessionInfo = session ?? { enabled: false, user: null };
  if (info.enabled && !info.user && typeof window !== 'undefined') {
    window.location.href = '/signin';
  }
  return info;
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

interface GenerateImageArgs { prompt: string; model?: string; aspectRatio?: string; width?: number; height?: number }
interface GenerateVideoArgs { prompt: string; aspectRatio?: string; model?: string; imageAssetId?: string }
interface GenerateMontageArgs { prompts: string[]; aspectRatio?: string; model?: string }
interface GenerateVoiceoverArgs { text: string; voice?: string }
interface NarrateVideoArgs { videoAssetId: string; text: string; voice?: string }
interface GeneratePresenterArgs { imagePrompt?: string; imageUrl?: string; text?: string; audioUrl?: string; voice?: string }
interface ComposeVideoArgs { assetIds: string[]; aspectRatio?: string; durationSec?: number }
interface AnimateAssetOpts { aspectRatio?: string; model?: string }

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200;

export function useForgecast() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [publishers, setPublishers] = useState<string[]>([]);
  const [availability, setAvailability] = useState<Availability>({ image: false, video: false, montage: false, short: false, voice: false, transcribe: false, presenter: false });
  const [pro, setPro] = useState(false);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [status, setStatus] = useState<'idle' | 'forging' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionInfo>({ enabled: false, user: null });

  const refreshPro = useCallback(async () => {
    const billing = await fetch('/api/billing/status').then((r) => r.json()).catch(() => null);
    setPro(Boolean(billing?.pro));
  }, []);

  useEffect(() => {
    (async () => {
      // Session first: when auth is enabled and we're signed out, ensureSignedIn
      // redirects to /signin — don't boot the rest against 401s.
      const info = await ensureSignedIn();
      setSession(info);
      if (info.enabled && !info.user) return;

      const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
      const image: string[] = health?.providers?.image ?? [];
      const video: string[] = health?.providers?.video ?? [];
      const montage: string[] = health?.providers?.montage ?? [];
      const short: string[] = health?.providers?.short ?? [];
      const voice: string[] = health?.providers?.voice ?? [];
      const transcribe: string[] = health?.providers?.transcribe ?? [];
      const presenter: string[] = health?.providers?.presenter ?? [];
      const pubs: string[] = health?.publishers ?? [];
      setProviders(image);
      setPublishers(pubs);
      setAvailability({ image: image.length > 0, video: video.length > 0, montage: montage.length > 0, short: short.length > 0, voice: voice.length > 0, transcribe: transcribe.length > 0, presenter: presenter.length > 0 });

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

  const generateVideo = useCallback(async ({ prompt, aspectRatio, model, imageAssetId }: GenerateVideoArgs): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const body: Record<string, unknown> = { prompt, aspectRatio, model };
      if (imageAssetId) body.imageAssetId = imageAssetId;
      const res = await fetch(`/api/projects/${projectId}/generate-clip`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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

  const generateShortVideo = useCallback(async (subject: string, options?: ShortVideoOptions): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-video`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject, options }),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start short video')); setStatus('error'); return null; }
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

  const generateAdCopy = useCallback(async (
    brief: string,
    platform: string,
    count = 3,
  ): Promise<{ platform?: string; label?: string; limit?: number; variants?: { id: string; text: string; chars: number }[]; error?: string }> => {
    if (!projectId) return { error: 'No active project' };
    try {
      const res = await fetch(`/api/projects/${projectId}/ad-copy`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief, platform, count }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: data?.error ?? `Ad-copy failed (${res.status})` };
      return data ?? { error: 'Unexpected response' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }, [projectId]);

  const auditAds = useCallback(async (metrics: unknown[]): Promise<{ source?: string; audit?: unknown; error?: string }> => {
    try {
      const res = await fetch('/api/ads/audit', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metrics }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: data?.error ?? `Audit failed (${res.status})` };
      return data ?? { error: 'Unexpected response' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }, []);

  const optimizeCreatives = useCallback(async (metrics: unknown[], max = 3): Promise<{ imageReady?: boolean; regenerated?: Array<{ creativeId: string; newAssetId: string }>; optimizations?: unknown[]; note?: string; error?: string }> => {
    if (!projectId) return { error: 'No active project' };
    try {
      const res = await fetch(`/api/projects/${projectId}/ads/optimize`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ metrics, max }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: data?.error ?? `Optimize failed (${res.status})` };
      await refreshAssets();
      return data ?? { error: 'Unexpected response' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }, [projectId, refreshAssets]);

  const generateVoiceover = useCallback(async ({ text, voice }: GenerateVoiceoverArgs): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const body: Record<string, unknown> = { text };
      if (voice) body.voice = voice;
      const res = await fetch(`/api/projects/${projectId}/generate-voiceover`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start voiceover')); setStatus('error'); return null; }
      const { job } = await res.json();
      const { outcome, assetId } = await pollJob(job.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return assetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId, pollJob]);

  const narrateVideo = useCallback(async ({ videoAssetId, text, voice }: NarrateVideoArgs): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const body: Record<string, unknown> = { videoAssetId, text };
      if (voice) body.voice = voice;
      const res = await fetch(`/api/projects/${projectId}/narrate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start narration')); setStatus('error'); return null; }
      const { job } = await res.json();
      const { outcome, assetId } = await pollJob(job.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return assetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId, pollJob]);

  const generatePresenter = useCallback(async ({ imagePrompt, imageUrl, text, audioUrl, voice }: GeneratePresenterArgs): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (imagePrompt) body.imagePrompt = imagePrompt;
      if (imageUrl) body.imageUrl = imageUrl;
      if (text) body.text = text;
      if (audioUrl) body.audioUrl = audioUrl;
      if (voice) body.voice = voice;
      const res = await fetch(`/api/projects/${projectId}/generate-presenter`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start presenter')); setStatus('error'); return null; }
      const { job } = await res.json();
      const { outcome, assetId } = await pollJob(job.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return assetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId, pollJob]);

  const uploadAsset = useCallback(async (file: File): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/assets/upload`, { method: 'POST', body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Upload failed'); setStatus('error'); return null; }
      const asset = (body as { asset?: RawAsset }).asset;
      if (asset) { setAssets((prev) => [normalizeAsset(asset), ...prev]); }
      setStatus('idle');
      return asset?.id ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId]);

  const createFromWebsite = useCallback(async (
    args: { url: string; generate?: boolean; enhance?: boolean; generateCount?: number },
  ): Promise<number> => {
    if (!projectId) return 0;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/from-website`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? 'Failed to build from website'); setStatus('error'); return 0; }
      await refreshAssets();
      setStatus('idle');
      return ((data as { assets?: unknown[] })?.assets ?? []).length;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return 0;
    }
  }, [projectId, refreshAssets]);

  const enhanceAsset = useCallback(async (assetId: string): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/assets/${assetId}/enhance`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Enhance failed'); setStatus('error'); return null; }
      const enhanced = (body as { asset?: RawAsset }).asset;
      if (enhanced) { setAssets((prev) => [normalizeAsset(enhanced), ...prev]); }
      setStatus('idle');
      return enhanced?.id ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId]);

  const cutoutAsset = useCallback(async (assetId: string): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/assets/${assetId}/cutout`, { method: 'POST' });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Cutout failed'); setStatus('error'); return null; }
      const cut = (body as { job?: { status?: string; error?: string }; asset?: RawAsset });
      if (cut.job?.status !== 'done' || !cut.asset) {
        setError(cut.job?.error ?? 'Cutout failed'); setStatus('error'); return null;
      }
      setAssets((prev) => [normalizeAsset(cut.asset!), ...prev]);
      setStatus('idle');
      return cut.asset.id ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId]);

  const editAsset = useCallback(async (assetId: string, prompt: string): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/assets/${assetId}/edit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Edit failed'); setStatus('error'); return null; }
      const edited = (body as { job?: { status?: string; error?: string }; asset?: RawAsset });
      if (edited.job?.status !== 'done' || !edited.asset) {
        setError(edited.job?.error ?? 'Edit failed'); setStatus('error'); return null;
      }
      setAssets((prev) => [normalizeAsset(edited.asset!), ...prev]);
      setStatus('idle');
      return edited.asset.id ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId]);

  const transcribeAudio = useCallback(async (blob: Blob): Promise<string | null> => {
    try {
      const form = new FormData();
      form.append('audio', blob, 'rec.webm');
      const res = await fetch('/api/transcribe', { method: 'POST', body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? `Transcription failed (${res.status})`);
        return null;
      }
      return (body?.text as string | undefined) ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      return null;
    }
  }, []);

  const composeVideo = useCallback(async ({ assetIds, aspectRatio, durationSec }: ComposeVideoArgs): Promise<string | null> => {
    if (!projectId) return null;
    if (assetIds.length < 1) { setError('Select at least 1 asset to compose a video'); setStatus('error'); return null; }
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-montage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assetIds, aspectRatio: aspectRatio ?? '9:16', durationSec: durationSec ?? 4 }),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start compose')); setStatus('error'); return null; }
      const { job } = await res.json();
      const { outcome, assetId } = await pollJob(job.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return assetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId, pollJob]);

  // ── Timeline editor (get / save / render a project's clip arrangement) ──────
  const loadTimeline = useCallback(async (): Promise<EditorTimeline | null> => {
    if (!projectId) return null;
    const body = await fetch(`/api/projects/${projectId}/timeline`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return (body?.timeline as EditorTimeline | undefined) ?? null;
  }, [projectId]);

  const saveTimeline = useCallback(async (timeline: EditorTimeline): Promise<EditorTimeline | null> => {
    if (!projectId) return null;
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeline }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Failed to save timeline'); return null; }
      return (body?.timeline as EditorTimeline) ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); return null;
    }
  }, [projectId]);

  const renderTimeline = useCallback(async (timeline?: EditorTimeline): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/render`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(timeline ? { timeline } : {}),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start timeline render')); setStatus('error'); return null; }
      const { job } = await res.json();
      const { outcome, assetId } = await pollJob(job.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return assetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
    }
  }, [projectId, pollJob]);

  const animateAsset = useCallback(async (assetId: string, opts?: AnimateAssetOpts): Promise<string | null> => {
    if (!projectId) return null;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-clip`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: 'subtle natural cinematic motion, gentle camera move',
          model: opts?.model ?? 'fal-ai/wan-pro/image-to-video',
          aspectRatio: opts?.aspectRatio ?? '9:16',
          imageAssetId: assetId,
        }),
      });
      if (res.status !== 202) { setError(await readError(res, 'Failed to start animation')); setStatus('error'); return null; }
      const { job } = await res.json();
      const { outcome, assetId: resultAssetId } = await pollJob(job.id);
      setStatus(outcome === 'done' ? 'idle' : 'error');
      return resultAssetId ?? null;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error'); return null;
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

  // Tool-calling "auto-run": the agent brainstorms AND produces the campaign in
  // one shot via OpenAI function calling. Returns the agentic result transcript.
  const agentRun = useCallback(async (brief: string, platforms: string[]) => {
    try {
      const res = await fetch('/api/agent', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'agentic', brief, platforms, projectId }),
      });
      return (await res.json().catch(() => ({ error: 'Network error' }))) as { result?: unknown; error?: string };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Network error' };
    }
  }, [projectId]);

  // After an agentic run, b-roll video jobs and presenter video jobs render in
  // the background. Poll both tracks to completion, then refresh the gallery.
  const awaitAgenticJobs = useCallback(async (result: {
    videoJobIds?: string[];
    presenterJobIds?: string[];
  }): Promise<string[]> => {
    const jobIds = [...(result.videoJobIds ?? []), ...(result.presenterJobIds ?? [])].filter(Boolean);
    if (jobIds.length === 0) return [];
    setStatus('forging'); setError(null);
    const results = await Promise.all(jobIds.map((id) => pollJob(id)));
    const assetIds = results.flatMap((r) => (r.assetId ? [r.assetId] : []));
    setStatus(results.some((r) => r.outcome === 'error') ? 'error' : 'idle');
    await refreshAssets();
    return assetIds;
  }, [pollJob, refreshAssets]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => null);
    window.location.href = '/signin';
  }, []);

  return {
    projectId, providers, publishers, availability, pro, refreshPro,
    session, signOut,
    assets, status, error,
    generateImage, generateVideo, generateMontage, generateShortVideo,
    composeVideo, animateAsset,
    loadTimeline, saveTimeline, renderTimeline,
    generateVoiceover, narrateVideo, generatePresenter,
    publishAsset, generateAdCopy, auditAds, optimizeCreatives, uploadAsset, createFromWebsite, enhanceAsset, editAsset, cutoutAsset,
    agentPlan, agentExecute, agentRun, refreshAssets, awaitAgentJobs, awaitAgenticJobs,
    transcribeAudio,
  };
}
