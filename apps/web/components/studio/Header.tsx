'use client';
import { useState } from 'react';
import { AppNav } from '@/components/AppNav';
import type { SessionInfo } from '@/lib/use-forgecast';

interface HeaderProps {
  providers: string[];
  pro: boolean;
  session?: SessionInfo;
  onSignOut?: () => void;
  onOpenKeys?: () => void;
}

export function Header({ providers, pro, session, onSignOut, onOpenKeys }: HeaderProps) {
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
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
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

        {/* Top-level tabs: Studio ⇄ Editor */}
        <AppNav />

        {/* Provider chip + Pro */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenKeys}
            className="font-mono text-xs flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--forge-border)] bg-[var(--forge-surface-2)] transition-colors hover:border-[var(--ember-2)] cursor-pointer"
            aria-label={hasFal ? 'Image provider: fal connected — manage keys' : 'No image provider key configured — add keys'}
            title="Manage provider keys"
          >
            {hasFal ? (
              <>
                <span
                  aria-hidden="true"
                  className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: 'var(--molten)', boxShadow: '0 0 6px var(--ember-glow)' }}
                />
                <span className="text-[var(--forge-muted)]">fal</span>
              </>
            ) : (
              <>
                <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 border border-[var(--forge-faint)]" />
                <span className="text-[var(--forge-faint)]">no key</span>
              </>
            )}
            <span aria-hidden="true" className="text-[var(--forge-faint)]">· keys</span>
          </button>

          {session?.enabled && session.user && (
            <div
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full border"
              style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
            >
              {session.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.avatarUrl} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span
                  aria-hidden="true"
                  className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-bold"
                  style={{ background: 'var(--molten)', color: '#1a0c03' }}
                >
                  {(session.user.name ?? session.user.email).slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="font-mono text-[11px] text-[var(--forge-muted)] max-w-[140px] truncate">
                {session.user.name ?? session.user.email}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-1 rounded-full border transition-colors hover:border-[var(--ember-2)] hover:text-[var(--ember-1)]"
                style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
              >
                Sign out
              </button>
            </div>
          )}

          {pro ? (
            <span
              aria-label="Pro plan active"
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
                type="button"
                onClick={goPro}
                disabled={busy}
                aria-label="Upgrade to Pro"
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
