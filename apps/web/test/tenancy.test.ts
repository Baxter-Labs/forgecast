import { describe, it, expect } from 'vitest';
import { newUser, newAsset, newJob, signSession } from '@forgecast/core';
import { buildServices, type Services } from '../lib/forgecast';
import { createProject, listProjects } from '../lib/api';
import { requireUser, requireProject, requireAsset, requireJob } from '../lib/auth-guard';
import { SESSION_COOKIE, type AuthConfig } from '../lib/auth';

const CFG: AuthConfig = {
  clientId: 'cid', clientSecret: 'cs',
  secret: 'tenancy-secret-32-bytes-or-more!!', baseUrl: 'https://forge.example.com',
};

async function cookieFor(uid: string): Promise<string> {
  const token = await signSession({ uid, exp: Math.floor(Date.now() / 1000) + 3600 }, CFG.secret);
  return `${SESSION_COOKIE}=${token}`;
}

async function seedUsers(svc: Services) {
  await svc.users.upsert(newUser({ email: 'a@x.co', name: 'A' }, { id: 'user-a', now: svc.ids.nowIso() }));
  await svc.users.upsert(newUser({ email: 'b@x.co', name: 'B' }, { id: 'user-b', now: svc.ids.nowIso() }));
}

describe('open mode (auth disabled)', () => {
  it('acts as the local operator and sees legacy unowned projects', async () => {
    const svc = buildServices({});
    const who = await requireUser(svc, null, null);
    expect(who).toEqual({ ok: true, userId: 'local' });

    await createProject(svc, { name: 'legacy' }, 'local'); // 'local' owner is stored as unowned
    const list = await listProjects(svc, 'local');
    expect((list.body as { projects: unknown[] }).projects).toHaveLength(1);

    const pid = ((await listProjects(svc, 'local')).body as { projects: { id: string }[] }).projects[0]!.id;
    expect((await requireProject(svc, null, pid, null)).ok).toBe(true);
  });
});

describe('auth enabled', () => {
  it('401s without a session and resolves the session user with one', async () => {
    const svc = buildServices({});
    await seedUsers(svc);
    expect(await requireUser(svc, null, CFG)).toMatchObject({ ok: false, status: 401 });
    expect(await requireUser(svc, await cookieFor('user-a'), CFG)).toEqual({ ok: true, userId: 'user-a' });
  });

  it('isolates projects between users (404, not 403, on foreign access)', async () => {
    const svc = buildServices({});
    await seedUsers(svc);
    const created = await createProject(svc, { name: 'A forge' }, 'user-a');
    const pid = (created.body as { project: { id: string } }).project.id;

    expect((await requireProject(svc, await cookieFor('user-a'), pid, CFG)).ok).toBe(true);
    expect(await requireProject(svc, await cookieFor('user-b'), pid, CFG)).toMatchObject({ ok: false, status: 404 });
    expect(await requireProject(svc, null, pid, CFG)).toMatchObject({ ok: false, status: 401 });

    const mine = (await listProjects(svc, 'user-a')).body as { projects: { id: string }[] };
    const theirs = (await listProjects(svc, 'user-b')).body as { projects: { id: string }[] };
    expect(mine.projects.map((p) => p.id)).toEqual([pid]);
    expect(theirs.projects).toEqual([]);
  });

  it('scopes assets and jobs through their project owner', async () => {
    const svc = buildServices({});
    await seedUsers(svc);
    const pid = ((await createProject(svc, { name: 'A' }, 'user-a')).body as { project: { id: string } }).project.id;
    const asset = await svc.assets.create(newAsset(
      { projectId: pid, type: 'image', provider: 'fal', storageKey: 'k', params: {} },
      { id: 'asset-1', now: svc.ids.nowIso() },
    ));
    const job = await svc.jobs.create(newJob(
      { projectId: pid, kind: 'image', provider: 'fal', params: {} },
      { id: 'job-1', now: svc.ids.nowIso() },
    ));

    expect((await requireAsset(svc, await cookieFor('user-a'), asset.id, CFG)).ok).toBe(true);
    expect(await requireAsset(svc, await cookieFor('user-b'), asset.id, CFG)).toMatchObject({ ok: false, status: 404 });
    expect((await requireJob(svc, await cookieFor('user-a'), job.id, CFG)).ok).toBe(true);
    expect(await requireJob(svc, await cookieFor('user-b'), job.id, CFG)).toMatchObject({ ok: false, status: 404 });
  });

  it('legacy unowned projects belong to local, not to signed-in users', async () => {
    const svc = buildServices({});
    await seedUsers(svc);
    const pid = ((await createProject(svc, { name: 'legacy' }, 'local')).body as { project: { id: string } }).project.id;
    expect(await requireProject(svc, await cookieFor('user-a'), pid, CFG)).toMatchObject({ ok: false, status: 404 });
    expect((await requireProject(svc, null, pid, null)).ok).toBe(true); // open mode still reaches it
  });
});
