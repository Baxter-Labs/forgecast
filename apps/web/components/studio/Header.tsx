'use client';
import { useState } from 'react';

interface HeaderProps {
  providers: string[];
  pro: boolean;
}

export function Header({ providers, pro }: HeaderProps) {
  const hasFal = providers.includes('fal');
  const [billingNote, setBillingNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function goPro() {
    if (busy) return;
    setBusy(true); setBillingNote(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.checkoutUrl) {
        window.open(body.checkoutUrl, '_blank');
      } else {
        setBillingNote('billing offline');
        setTimeout(() => setBillingNote(null), 3000);
      }
    } catch {
      setBillingNote('billing offline');
      setTimeout(() => setBillingNote(null), 3000);
    } finally {
      setBusy(false);
    }
  }

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

        {/* Provider chip + Pro */}
        <div className="flex items-center gap-2.5">
          <div className="font-mono text-xs flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--forge-border)] bg-[var(--forge-surface-2)]">
            {hasFal ? (
              <>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--molten)', boxShadow: '0 0 6px var(--ember-glow)' }}
                />
                <span className="text-[var(--forge-muted)]">fal</span>
              </>
            ) : (
              <>
                <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 border border-[var(--forge-faint)]" />
                <span className="text-[var(--forge-faint)]">no key</span>
              </>
            )}
          </div>

          {pro ? (
            <span
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] px-2.5 py-1.5 rounded-full"
              style={{ background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 0 1px rgba(255,194,75,0.4), 0 6px 20px -6px var(--ember-glow)' }}
            >
              PRO
            </span>
          ) : (
            <div className="flex items-center gap-2">
              {billingNote && (
                <span className="font-mono text-[10px] text-[var(--forge-faint)]">{billingNote}</span>
              )}
              <button
                onClick={goPro}
                disabled={busy}
                className="font-mono text-[11px] uppercase tracking-[0.12em] px-2.5 py-1.5 rounded-full border transition-all"
                style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-muted)', background: 'transparent' }}
              >
                {busy ? '…' : 'Go Pro'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Molten hairline */}
      <div className="h-px w-full" style={{ background: 'var(--molten)', opacity: 0.3 }} />
    </header>
  );
}
