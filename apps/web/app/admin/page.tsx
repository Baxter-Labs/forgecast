import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getServices } from '@/lib/forgecast';
import { requireAdmin } from '@/lib/auth-guard';
import { authConfig } from '@/lib/auth';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export const metadata = { title: 'Forgecast — Admin' };

// Admin gating is request-time state; never prerender.
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const cookieHeader = (await cookies()).toString();
  const who = await requireAdmin(getServices(), cookieHeader, authConfig());

  if (!who.ok) {
    // 401 → not signed in; the edge middleware normally redirects, but guard here too.
    if (who.status === 401) redirect('/signin');
    // 403 → signed in, but not an operator.
    return (
      <main
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: 'var(--forge-bg)', color: 'var(--forge-text)' }}
      >
        <div className="panel max-w-md p-8 text-center rise">
          <h1 className="font-display text-2xl font-bold mb-2">Operators only</h1>
          <p className="text-sm text-[var(--forge-muted)] leading-relaxed">
            This dashboard is restricted to Forgecast operators. If that&apos;s you, add your
            email to the <code className="text-[var(--ember-1)]">ADMIN_EMAILS</code> Worker secret.
          </p>
          <a href="/" className="inline-block mt-6 font-mono text-xs text-[var(--ember-1)] hover:underline">
            ← back to the forge
          </a>
        </div>
      </main>
    );
  }

  return <AdminDashboard />;
}
