import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getServices } from '@/lib/forgecast';
import { authConfig, sessionUser } from '@/lib/auth';

export const metadata = { title: 'Forgecast — Sign in' };

// Auth config + session are request-time state; never prerender this page
// (a keyless build would otherwise bake in the redirect('/')).
export const dynamic = 'force-dynamic';

/** Human-readable copy for callback error codes; anything unknown shows as-is. */
function errorCopy(error: string): string {
  if (error.includes('state')) return 'That sign-in attempt expired — please try again.';
  if (error.includes('exchange')) return "Google didn't accept the sign-in — please try again.";
  return error;
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const cfg = authConfig();
  if (!cfg) redirect('/'); // open self-host mode has no sign-in

  const cookieHeader = (await cookies()).toString();
  const user = await sessionUser(getServices(), cfg, cookieHeader);
  if (user) redirect('/');

  const { error } = await searchParams;

  return (
    <main
      aria-label="Sign in"
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'var(--forge-bg)', color: 'var(--forge-text)' }}
    >
      <div className="panel w-full max-w-sm p-8 flex flex-col items-center gap-6 rise text-center">
        {/* Wordmark */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-baseline leading-none tracking-tight">
            <span className="font-display text-4xl font-extrabold text-[var(--forge-text)]" style={{ fontWeight: 800 }}>FORGE</span>
            <span className="font-display text-4xl font-extrabold text-molten" style={{ fontWeight: 800 }}>CAST</span>
          </div>
          <p className="font-mono text-[11px] tracking-widest text-[var(--forge-muted)] uppercase">forge it · cast it</p>
          <a
            href="https://baxter-labs.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] tracking-wide text-[var(--forge-faint)] transition-colors hover:text-[var(--ember-1)]"
          >
            by Baxter Labs ↗
          </a>
        </div>

        <p className="text-sm text-[var(--forge-muted)] leading-relaxed">
          Sign in to your forge — your projects, assets and timelines live in your own workspace.
        </p>

        {error && (
          <p role="alert" className="w-full font-mono text-[11px] leading-relaxed px-3 py-2 rounded-lg border text-red-300" style={{ borderColor: 'rgba(229,51,27,0.4)', background: 'rgba(229,51,27,0.08)' }}>
            {errorCopy(error)}
          </p>
        )}

        <a
          href="/api/auth/google"
          className="w-full flex items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-transform hover:scale-[1.01]"
          style={{ background: '#ffffff', color: '#1f1f1f', boxShadow: '0 6px 24px -8px var(--ember-glow)' }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continue with Google
        </a>

        <p className="font-mono text-[10px] text-[var(--forge-faint)] leading-relaxed">
          self-hosting without sign-in? leave the auth env vars unset — see the README
        </p>
      </div>
    </main>
  );
}
