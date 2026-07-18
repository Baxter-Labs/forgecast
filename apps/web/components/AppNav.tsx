'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Hammer, Clapperboard, Lightbulb } from 'lucide-react';

const TABS = [
  { href: '/', label: 'Studio', Icon: Hammer, match: (p: string) => p === '/' },
  { href: '/editor', label: 'Editor', Icon: Clapperboard, match: (p: string) => p.startsWith('/editor') },
  { href: '/brainstorm', label: 'Brainstorm', Icon: Lightbulb, match: (p: string) => p.startsWith('/brainstorm') },
] as const;

/**
 * Top-level navigation across the phases of the product: the Studio (forge new
 * assets), the Editor (cut them into a video, with the agent), and Brainstorm
 * (revisitable idea boards). A single segmented control, shared by the pages, so
 * each surface is a first-class tab rather than a buried link.
 */
export function AppNav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav aria-label="Primary" className="flex rounded-lg p-1 gap-1" style={{ background: 'var(--forge-surface-2)', border: '1px solid var(--forge-border)' }}>
      {TABS.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] px-3 py-1.5 rounded-md border transition-all"
            style={active
              ? { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)', boxShadow: '0 0 12px var(--ember-glow)' }
              : { borderColor: 'transparent', color: 'var(--forge-faint)', background: 'transparent' }}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
