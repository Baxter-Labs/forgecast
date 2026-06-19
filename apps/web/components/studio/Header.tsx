interface HeaderProps {
  providers: string[];
}

export function Header({ providers }: HeaderProps) {
  const hasFal = providers.includes('fal');

  return (
    <header className="rise">
      <div className="flex items-center justify-between py-4">
        {/* Wordmark */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-0 leading-none tracking-tight">
            <span
              className="font-display text-4xl font-extrabold text-[var(--forge-text)] leading-none"
              style={{ fontWeight: 800 }}
            >
              FORGE
            </span>
            <span
              className="font-display text-4xl font-extrabold text-molten leading-none"
              style={{ fontWeight: 800 }}
            >
              CAST
            </span>
          </div>
          <p className="font-mono text-xs tracking-widest text-[var(--forge-muted)] uppercase">
            forge it · cast it
          </p>
        </div>

        {/* Provider chip */}
        <div
          className="font-mono text-xs flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--forge-border)] bg-[var(--forge-surface-2)]"
        >
          {hasFal ? (
            <>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{
                  background: 'var(--molten)',
                  boxShadow: '0 0 6px var(--ember-glow)',
                }}
              />
              <span className="text-[var(--forge-muted)]">fal</span>
            </>
          ) : (
            <>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 border border-[var(--forge-faint)]"
              />
              <span className="text-[var(--forge-faint)]">no key</span>
            </>
          )}
        </div>
      </div>

      {/* Molten hairline */}
      <div
        className="h-px w-full"
        style={{ background: 'var(--molten)', opacity: 0.3 }}
      />
    </header>
  );
}
