import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo, type MontageSpec,
} from '@forgecast/core';

export interface LocalMontageJobHandlerDeps {
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  ffmpegPath: string; // path to the ffmpeg binary (injected by the app)
  fetchFn?: typeof fetch; // to fetch scene media (defaults to global fetch)
  tmpDir?: string; // defaults to os.tmpdir()
  // Injectable runner so tests avoid spawning a real process. Resolves on success, rejects on non-zero status.
  run?: (ffmpegPath: string, args: string[]) => Promise<void>;
}

interface Dimensions {
  width: number;
  height: number;
}

const evenize = (n: number): number => {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
};

/**
 * Resolve output dimensions from a MontageSpec aspect ratio.
 * Known ratios map to 1080-based even dimensions; arbitrary "W:H" is scaled so the
 * larger side is 1920 (rounded to even). Falls back to portrait 1080x1920.
 */
export function resolveDimensions(aspectRatio: string): Dimensions {
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    default: {
      const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspectRatio.trim());
      if (m) {
        const w = Number(m[1]);
        const h = Number(m[2]);
        if (w > 0 && h > 0) {
          if (w >= h) {
            return { width: evenize(1920), height: evenize((1920 * h) / w) };
          }
          return { width: evenize((1920 * w) / h), height: evenize(1920) };
        }
      }
      return { width: 1080, height: 1920 };
    }
  }
}

const defaultRun = (ffmpegPath: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with status ${code ?? 'null'}`));
    });
  });

export class LocalMontageJobHandler implements JobHandler {
  readonly kind = 'montage';

  constructor(private readonly deps: LocalMontageJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const spec = (job.params as { spec?: MontageSpec }).spec;
    if (!spec || !Array.isArray(spec.scenes) || spec.scenes.length === 0) {
      throw new Error('montage requires at least one scene');
    }

    const { width, height } = resolveDimensions(spec.aspectRatio);
    const fps = spec.fps ?? 30;
    const fetchFn = this.deps.fetchFn ?? fetch;
    const tmp = this.deps.tmpDir ?? tmpdir();
    const work = join(tmp, `forgecast-montage-${job.id}`);
    mkdirSync(work, { recursive: true });

    try {
      // 1. Fetch each scene's media into the working dir.
      const scenes: { path: string; durationSec: number; kind: 'image' | 'video' }[] = [];
      for (let i = 0; i < spec.scenes.length; i += 1) {
        const scene = spec.scenes[i]!;
        const res = await fetchFn(scene.url);
        if (!res.ok) throw new Error(`failed to fetch scene ${i} (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const path = join(work, `scene-${i}`);
        writeFileSync(path, bytes);
        scenes.push({ path, durationSec: Math.max(0.5, scene.durationSec), kind: scene.kind });
      }
      await report(0.4);

      // 2. Optional audio tracks as the LAST inputs: background music, then a
      // narration voice-over. With both, music is ducked under the narration.
      let audioPath: string | undefined;
      if (spec.musicUrl) {
        const res = await fetchFn(spec.musicUrl);
        if (!res.ok) throw new Error(`failed to fetch music (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        audioPath = join(work, 'audio');
        writeFileSync(audioPath, bytes);
      }
      let voiceoverPath: string | undefined;
      if (spec.voiceoverUrl) {
        const res = await fetchFn(spec.voiceoverUrl);
        if (!res.ok) throw new Error(`failed to fetch voiceover (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        voiceoverPath = join(work, 'voiceover');
        writeFileSync(voiceoverPath, bytes);
      }

      // 3. Build the ffmpeg args for a normalized concat. Every scene input is
      // normalized to identical W/H/fps/SAR/pix_fmt so `concat` is valid even for
      // mixed image/video sources.
      const outPath = join(work, 'out.mp4');
      const args: string[] = ['-y'];

      for (const scene of scenes) {
        if (scene.kind === 'image') {
          args.push('-loop', '1', '-t', String(scene.durationSec), '-i', scene.path);
        } else {
          args.push('-t', String(scene.durationSec), '-i', scene.path);
        }
      }

      const musicIndex = scenes.length;
      if (audioPath) {
        args.push('-i', audioPath);
      }
      const voiceoverIndex = scenes.length + (audioPath ? 1 : 0);
      if (voiceoverPath) {
        args.push('-i', voiceoverPath);
      }

      const filters: string[] = [];
      for (let i = 0; i < scenes.length; i += 1) {
        filters.push(
          `[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[v${i}]`,
        );
      }
      const concatInputs = scenes.map((_, i) => `[v${i}]`).join('');
      let filterComplex = `${filters.join(';')};${concatInputs}concat=n=${scenes.length}:v=1:a=0[outv]`;
      // Both audio tracks: duck the music to 25% and mix the narration on top
      // (mirrors the Remotion worker's <Audio volume={0.25}> behavior).
      if (audioPath && voiceoverPath) {
        filterComplex += `;[${musicIndex}:a]volume=0.25[m];[m][${voiceoverIndex}:a]amix=inputs=2:duration=first[outa]`;
      }
      // TODO(v1): captions (drawtext) and per-scene transitions (xfade) are out of scope.
      args.push('-filter_complex', filterComplex);

      args.push('-map', '[outv]');
      if (audioPath && voiceoverPath) {
        args.push('-map', '[outa]', '-shortest');
      } else if (audioPath) {
        args.push('-map', `${musicIndex}:a`, '-shortest');
      } else if (voiceoverPath) {
        args.push('-map', `${voiceoverIndex}:a`, '-shortest');
      }

      args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart');
      if (audioPath || voiceoverPath) {
        args.push('-c:a', 'aac');
      }
      args.push(outPath);

      const runner = this.deps.run ?? defaultRun;
      await runner(this.deps.ffmpegPath, args);
      await report(0.9);

      // 4. Store the rendered mp4 and record a video asset.
      const bytes = readFileSync(outPath);
      const id = this.deps.idGen();
      const key = `projects/${job.projectId}/videos/${id}.mp4`;
      const stored = await this.deps.storage.put(key, new Uint8Array(bytes), 'video/mp4');

      const asset = await this.deps.assets.create(
        newAsset(
          { projectId: job.projectId, type: 'video', provider: 'ffmpeg-montage', storageKey: stored.key, params: job.params },
          { id, now: this.deps.clock() },
        ),
      );
      return { assetId: asset.id };
    } finally {
      try {
        rmSync(work, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }
}
