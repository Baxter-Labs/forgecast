import { describe, it, expect, afterEach } from 'vitest';
import { signSession } from '@forgecast/core';
import type { AuthConfig } from '../lib/auth';
import { buildServices } from '../lib/forgecast';
import { requireAdmin } from '../lib/auth-guard';
import { listUsersForAdmin } from '../lib/admin';
import { createProject } from '../lib/api';

const cfg: AuthConfig = { clientId: 'x', clientSecret: 'y', secret: 'test-secret', baseUrl: 'http://localhost' };

const savedAdmins = process.env.ADMIN_EMAILS;
afterEach(() => { if (savedAdmins === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = savedAdmins; });

function svc() { return buildServices({}); }
async function seedUser(s: ReturnType<typeof buildServices>, email: string) {
  return s.users.upsert({ id: s.ids.randomId(), email: email.toLowerCase(), createdAt: s.ids.nowIso() });
}
async function cookieFor(uid: string): Promise<string> {
  const token = await signSession({ uid, exp: Math.floor(Date.now() / 1000) + 3600 }, cfg.secret);
  return `fc_session=${token}`;
}

describe('requireAdmin', () => {
  it('open self-host mode (auth off) trusts the local operator', async () => {
    expect(await requireAdmin(svc(), null, null)).toEqual({ ok: true, userId: 'local' });
  });

  it('401 for an anonymous request when auth is on', async () => {
    const r = await requireAdmin(svc(), null, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('403 for a signed-in NON-admin', async () => {
    process.env.ADMIN_EMAILS = 'boss@forge.com';
    const s = svc();
    const u = await seedUser(s, 'nobody@forge.com');
    const r = await requireAdmin(s, await cookieFor(u.id), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('403 for everyone when ADMIN_EMAILS is empty (fail closed)', async () => {
    delete process.env.ADMIN_EMAILS;
    const s = svc();
    const u = await seedUser(s, 'boss@forge.com');
    const r = await requireAdmin(s, await cookieFor(u.id), cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('ok for a signed-in admin (case- and space-insensitive allowlist)', async () => {
    process.env.ADMIN_EMAILS = ' Boss@Forge.com , other@x.com ';
    const s = svc();
    const u = await seedUser(s, 'boss@forge.com');
    expect(await requireAdmin(s, await cookieFor(u.id), cfg)).toEqual({ ok: true, userId: u.id });
  });
});

describe('listUsersForAdmin', () => {
  it('returns users with per-user project counts + totals', async () => {
    const s = svc();
    const a = await seedUser(s, 'a@forge.com');
    const b = await seedUser(s, 'b@forge.com');
    await createProject(s, { name: 'p1' }, a.id);
    await createProject(s, { name: 'p2' }, a.id);
    await createProject(s, { name: 'p3' }, b.id);
    const r = await listUsersForAdmin(s);
    expect(r.status).toBe(200);
    const body = r.body as { users: Array<{ email: string; projects: number }>; totalUsers: number; totalProjects: number };
    expect(body.totalUsers).toBe(2);
    expect(body.totalProjects).toBe(3);
    const byEmail = Object.fromEntries(body.users.map((u) => [u.email, u.projects]));
    expect(byEmail['a@forge.com']).toBe(2);
    expect(byEmail['b@forge.com']).toBe(1);
  });
});
