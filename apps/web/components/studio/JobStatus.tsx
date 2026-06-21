'use client';
import { useEffect, useRef, useState } from 'react';

interface JobStatusProps {
  status: 'idle' | 'forging' | 'error';
  error: string | null;
}

export function JobStatus({ status, error }: JobStatusProps) {
  const prevRef = useRef(status);
  const [doneKey, setDoneKey] = useState(0); // bump to re-trigger animation

  useEffect(() => {
    if (prevRef.current === 'forging' && status === 'idle') {
      setDoneKey((k) => k + 1);
    }
    prevRef.current = status;
  }, [status]);

  if (status === 'forging') {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 mb-4">
        <div aria-hidden="true" className="heatbar h-2 flex-1">
          <span className="forging" style={{ width: '42%', transition: 'width 0.4s ease' }} />
        </div>
        <p className="font-mono text-xs text-[var(--ember-1)] shrink-0 forging">FORGING…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="panel p-4 mb-4"
        style={{ borderColor: 'rgba(229, 51, 27, 0.4)' }}
      >
        <p className="font-mono text-sm text-[var(--ember-1)] font-semibold mb-1">FORGE FAILED</p>
        <p className="text-sm text-[var(--forge-muted)]">{error}</p>
      </div>
    );
  }

  // idle — show brief completion flash when transitioning from forging
  if (doneKey === 0) return null;
  return (
    <div
      key={doneKey}
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 mb-4 forge-done"
    >
      <div aria-hidden="true" className="heatbar h-2 flex-1">
        <span style={{ width: '100%', display: 'block', height: '100%', background: 'var(--molten)', boxShadow: '0 0 24px var(--ember-glow)' }} />
      </div>
      <p className="font-mono text-xs text-[var(--ember-1)] shrink-0">FORGED ✓</p>
    </div>
  );
}
