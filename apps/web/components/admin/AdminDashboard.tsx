'use client';
import { useEffect, useState, type ReactNode } from 'react';

interface AdminUserRow {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
  projects: number;
}
interface AdminData { users: AdminUserRow[]; totalUsers: number; totalProjects: number }

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="panel p-4">
      <div className="font-display text-2xl font-bold text-[var(--forge-text)]">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--forge-faint)] mt-1">{label}</div>
    </div>
  );
}

export function AdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/users');
        if (!res.ok) {
          if (alive) setError(res.status === 403 ? 'Admin access required.' : `Failed to load (${res.status}).`);
          return;
        }
        const body = (await res.json()) as AdminData;
        if (alive) setData(body);
      } catch {
        if (alive) setError('Failed to load users.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const avg = data && data.totalUsers ? (data.totalProjects / data.totalUsers).toFixed(1) : '0';

  return (
    <main className="min-h-screen px-6 py-10" style={{ background: 'var(--forge-bg)', color: 'var(--forge-text)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin · Users</h1>
            <p className="font-mono text-xs tracking-widest text-[var(--forge-muted)] uppercase mt-1">who&apos;s in the forge</p>
          </div>
          <a href="/" className="font-mono text-xs text-[var(--ember-1)] hover:underline">← back to Studio</a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
          <Stat label="Users" value={data ? data.totalUsers : loading ? '…' : 0} />
          <Stat label="Projects" value={data ? data.totalProjects : loading ? '…' : 0} />
          <Stat label="Avg projects / user" value={avg} />
        </div>

        {error && <p role="alert" className="panel p-4 text-sm text-red-300">{error}</p>}
        {loading && !error && <p className="text-sm text-[var(--forge-muted)]">Loading users…</p>}

        {data && data.users.length === 0 && !error && (
          <p className="panel p-6 text-sm text-[var(--forge-muted)]">
            No users yet — accounts show up here after people sign in with Google.
          </p>
        )}

        {data && data.users.length > 0 && (
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-[var(--forge-faint)] border-b border-[var(--forge-border)]">
                  <th scope="col" className="px-4 py-3 font-medium">User</th>
                  <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Projects</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--forge-border)] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="w-8 h-8 rounded-full flex items-center justify-center font-mono text-[11px] font-bold flex-shrink-0"
                            style={{ background: 'var(--molten)', color: '#1a0c03' }}
                          >
                            {(u.name ?? u.email).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          {u.name && <div className="font-medium text-[var(--forge-text)] truncate">{u.name}</div>}
                          <div className="text-[var(--forge-muted)] text-xs truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--forge-muted)] whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--forge-text)]">{u.projects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
