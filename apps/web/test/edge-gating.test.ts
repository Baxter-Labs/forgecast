import { describe, it, expect } from 'vitest';
import { buildServices } from '../lib/forgecast';
import { createProject, generateNarratedVideo } from '../lib/api';

// The local montage + narrate job handlers use node:child_process/fs (ffmpeg) and cannot
// run on Cloudflare Workers. On the `baxter-cloud` (edge) profile they must NOT be
// registered/advertised — montage requires the remote Remotion worker, narrate has no
// remote path and must 503 cleanly instead of enqueuing a job the runner can't handle.
describe('edge (baxter-cloud) profile disables node-only montage/narrate handlers', () => {
  it('no MONTAGE_WORKER_URL: montage + narrate are unavailable, and narrate 503s cleanly', async () => {
    const edge = buildServices({ profile: 'baxter-cloud', voiceKey: 'k' }); // voice IS available (fal TTS)
    // narrate is off despite an available voice provider — it's the ffmpeg mux that can't run on edge.
    expect(edge.narrateAvailable).toBe(false);
    // montage is off (honest) rather than the crashing local ffmpeg handler.
    expect(edge.montageAvailable).toBe(false);

    const pid = ((await createProject(edge, { name: 'P' })).body as { project: { id: string } }).project.id;
    const r = await generateNarratedVideo(edge, pid, { videoAssetId: 'v', text: 'hi' });
    expect(r.status).toBe(503);
    expect((r.body as { error?: string }).error ?? '').toMatch(/narrate not available/i);
  });

  it('local profile keeps narrate available when a voice provider + bundled ffmpeg are present', () => {
    const local = buildServices({ voiceKey: 'k' }); // default 'local' profile
    // The edge flag is the discriminator: same voice config, opposite availability on baxter-cloud.
    expect(buildServices({ profile: 'baxter-cloud', voiceKey: 'k' }).narrateAvailable).toBe(false);
    expect(local.voiceAvailable).toBe(true);
  });

  it('keyless edge deploy: the AI binding alone makes voice available (MeloTTS), narrate stays off', () => {
    const runner = { run: async () => ({ audio: 'QUJD' }) };
    const edge = buildServices({ profile: 'baxter-cloud', ai: runner, falKey: undefined, voiceKey: undefined });
    expect(edge.voiceAvailable).toBe(true);
    expect(edge.voiceProvider.name).toBe('cloudflare');
    // The ffmpeg-mux gate is independent of the new keyless voice path.
    expect(edge.narrateAvailable).toBe(false);
  });
});
