'use client';
import { useCallback, useEffect, useState } from 'react';

export interface StudioAsset {
  id: string;
  params: { prompt?: string; width?: number; height?: number; model?: string };
  provider: string;
  createdAt: string;
}

interface GenerateArgs { prompt: string; model?: string; width?: number; height?: number }

export function useForgecast() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [status, setStatus] = useState<'idle' | 'forging' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
      setProviders(health?.providers?.image ?? []);
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
      setAssets((a.assets ?? []).slice().reverse());
    })();
  }, []);

  const generate = useCallback(async (args: GenerateArgs) => {
    if (!projectId) return;
    setStatus('forging'); setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args),
      }).then((r) => r.json());
      if (res.job?.status === 'done' && res.asset) {
        setAssets((prev) => [res.asset, ...prev]); setStatus('idle');
      } else {
        setError(res.job?.error ?? 'Generation failed'); setStatus('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error'); setStatus('error');
    }
  }, [projectId]);

  return { projectId, providers, assets, status, error, generate };
}
