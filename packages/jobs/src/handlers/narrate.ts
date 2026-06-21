import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  newAsset,
  type Job, type JobHandler, type JobOutcome, type ProgressReporter,
  type StorageDriver, type AssetRepo, type VoiceProvider,
} from '@forgecast/core';

export interface NarrateJobHandlerDeps {
  voiceProvider: VoiceProvider;
  storage: StorageDriver;
  assets: AssetRepo;
  idGen: () => string;
  clock: () => string;
  ffmpegPath: string;
  fetchFn?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
  tmpDir?: string;
  /** Injectable runner so tests avoid spawning a real process. */
  run?: (ffmpegPath: string, args: string[]) => Promise<void>;
}

const defaultWait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const defaultRun = (ffmpegPath: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with status ${code ?? 'null'}`));
    });
  });

export class NarrateJobHandler implements JobHandler {
  readonly kind = 'narrate';

  constructor(private readonly deps: NarrateJobHandlerDeps) {}

  async run(job: Job, report: ProgressReporter): Promise<JobOutcome> {
    const params = job.params as {
      videoAssetId?: unknown;
      videoUrl?: unknown;
      text?: unknown;
      voice?: unknown;
    };

    if (typeof params.text !== 'string' || params.text.trim().length === 0) {
      throw new Error('narrate job requires a non-empty "text" (script) param');
    }

    const text = params.text;
    const voice = typeof params.voice === 'string' ? params.voice : undefined;
    const fetchFn = this.deps.fetchFn ?? fetch;
    const tmp = this.deps.tmpDir ?? tmpdir();
    const work = join(tmp, `forgecast-narrate-${job.id}`);
    mkdirSync(work, { recursive: true });

    try {
      // 1. Resolve the source video bytes.
      let videoBytes: Uint8Array;
      if (typeof params.videoAssetId === 'string' && params.videoAssetId.length > 0) {
        const asset = await this.deps.assets.get(params.videoAssetId);
        if (!asset) throw new Error(`asset ${params.videoAssetId} not found`);
        const stored = await this.deps.storage.get(asset.storageKey);
        if (!stored) throw new Error(`storage object for asset ${params.videoAssetId} not found`);
        videoBytes = stored.data;
      } else if (typeof params.videoUrl === 'string' && params.videoUrl.length > 0) {
        const res = await fetchFn(params.videoUrl);
        if (!res.ok) throw new Error(`failed to fetch video from URL (${res.status})`);
        videoBytes = new Uint8Array(await res.arrayBuffer());
      } else {
        throw new Error('narrate job requires "videoAssetId" or "videoUrl"');
      }
      writeFileSync(join(work, 'in.mp4'), videoBytes);
      await report(0.1);

      // 2. Generate the voice-over via the voice provider.
      const wait = this.deps.wait ?? defaultWait;
      const interval = this.deps.pollIntervalMs ?? 4000;
      const maxPolls = this.deps.maxPolls ?? 150;

      const { taskId } = await this.deps.voiceProvider.create({ text, voice });
      await report(0.2);

      let audioUrl: string | undefined;
      for (let i = 0; i < maxPolls; i += 1) {
        const task = await this.deps.voiceProvider.getTask(taskId);
        if (task.state === 'failed') throw new Error(`voice generation failed for task ${taskId}`);
        if (task.state === 'complete') { audioUrl = task.audioUrl; break; }
        await wait(interval);
      }
      if (!audioUrl) throw new Error(`voice task ${taskId} did not complete in time`);

      const audioRes = await fetchFn(audioUrl);
      if (!audioRes.ok) throw new Error(`failed to download generated audio (${audioRes.status})`);
      writeFileSync(join(work, 'vo.mp3'), new Uint8Array(await audioRes.arrayBuffer()));
      await report(0.5);

      // 3. Mux video + voice-over with ffmpeg.
      const inVideo = join(work, 'in.mp4');
      const inAudio = join(work, 'vo.mp3');
      const outPath = join(work, 'out.mp4');
      const args = [
        '-y',
        '-i', inVideo,
        '-i', inAudio,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-movflags', '+faststart',
        outPath,
      ];

      const runner = this.deps.run ?? defaultRun;
      await runner(this.deps.ffmpegPath, args);
      await report(0.9);

      // 4. Store the narrated mp4 and record a video asset.
      const bytes = readFileSync(outPath);
      const id = this.deps.idGen();
      const key = `projects/${job.projectId}/videos/${id}.mp4`;
      const stored = await this.deps.storage.put(key, new Uint8Array(bytes), 'video/mp4');

      const asset = await this.deps.assets.create(
        newAsset(
          { projectId: job.projectId, type: 'video', provider: 'narrate', storageKey: stored.key, params: job.params },
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
