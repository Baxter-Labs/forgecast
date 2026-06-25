'use client';
import { useCallback, useEffect, useState } from 'react';

export interface BrandKit {
  name?: string;
  tagline?: string;
  palette?: string[];
  fonts?: { display?: string; body?: string };
  toneOfVoice?: string;
  keyMessages?: string[];
  logoAssetId?: string;
  notes?: string;
  sourceUrl?: string;
}

/** True when the kit carries no usable brand signal. */
export function brandKitIsEmpty(k: BrandKit): boolean {
  return !(k.name || k.tagline || (k.palette && k.palette.length) || k.fonts?.display || k.fonts?.body
    || k.toneOfVoice || (k.keyMessages && k.keyMessages.length) || (k.notes && k.notes.trim()));
}

/** Loads/saves a project's brand kit and can derive one from a website. */
export function useBrandKit(projectId: string | null) {
  const [kit, setKit] = useState<BrandKit>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/brand-kit`);
      const data = (await res.json().catch(() => null)) as { brandKit?: BrandKit } | null;
      if (res.ok) setKit(data?.brandKit ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load brand kit');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async (next: BrandKit): Promise<boolean> => {
    if (!projectId) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/brand-kit`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next),
      });
      const data = (await res.json().catch(() => null)) as { brandKit?: BrandKit; error?: string } | null;
      if (!res.ok) { setError(data?.error ?? 'Save failed'); return false; }
      setKit(data?.brandKit ?? {});
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const derive = useCallback(async (url: string): Promise<BrandKit | null> => {
    if (!projectId) return null;
    setDeriving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/brand-kit/from-website`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }),
      });
      const data = (await res.json().catch(() => null)) as { brandKit?: BrandKit; error?: string } | null;
      if (!res.ok) { setError(data?.error ?? 'Could not read that site'); return null; }
      const got = data?.brandKit ?? {};
      setKit(got);
      return got;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      return null;
    } finally {
      setDeriving(false);
    }
  }, [projectId]);

  return { kit, loading, saving, deriving, error, reload: load, save, derive };
}
