interface JobStatusProps {
  status: 'idle' | 'forging' | 'error';
  error: string | null;
}

export function JobStatus({ status, error }: JobStatusProps) {
  if (status === 'idle') return null;

  if (status === 'forging') {
    return (
      <div role="status" aria-live="polite" className="flex items-center gap-3 mb-4">
        <div aria-hidden="true" className="heatbar h-2 flex-1">
          <span
            className="forging"
            style={{ width: '42%', transition: 'width 0.4s ease' }}
          />
        </div>
        <p className="font-mono text-xs text-[var(--ember-1)] shrink-0 forging">FORGING…</p>
      </div>
    );
  }

  // error
  return (
    <div
      role="status"
      aria-live="polite"
      className="panel p-4 mb-4"
      style={{ borderColor: 'rgba(229, 51, 27, 0.4)' }}
    >
      <p className="font-mono text-sm text-[var(--ember-1)] font-semibold mb-1">FORGE FAILED</p>
      <p className="text-sm text-[var(--forge-muted)] mb-2">{error}</p>
      <p className="font-mono text-xs text-[var(--forge-faint)]">
        Set FAL_KEY to forge real images.
      </p>
    </div>
  );
}
