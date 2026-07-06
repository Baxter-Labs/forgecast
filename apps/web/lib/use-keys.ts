'use client';
import { useCallback, useEffect, useState } from 'react';
import type { KeyId, KeyStatus } from './keys';

export type { KeyId, KeyStatus };

/**
 * BYO provider keys, managed from the Studio. The server only ever returns
 * masked previews — raw values go up on save and never come back down.
 */
export function useKeys(open: boolean) {
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [sealed, setSealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<KeyId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const body = await fetch('/api/keys').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (body?.keys) { setKeys(body.keys as KeyStatus[]); setSealed(Boolean(body.sealed)); }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  const save = useCallback(async (id: KeyId, value: string): Promise<boolean> => {
    setBusyId(id); setError(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Could not save the key'); return false; }
      setKeys(body.keys as KeyStatus[]);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      return false;
    } finally {
      setBusyId(null);
    }
  }, []);

  const clear = useCallback(async (id: KeyId): Promise<boolean> => {
    setBusyId(id); setError(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(body?.error ?? 'Could not clear the key'); return false; }
      setKeys(body.keys as KeyStatus[]);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      return false;
    } finally {
      setBusyId(null);
    }
  }, []);

  return { keys, sealed, loading, busyId, error, refresh, save, clear };
}
