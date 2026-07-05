import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { getServices } from '@/lib/forgecast';
import { requireUser } from '@/lib/auth-guard';

/** Spawn ffmpeg with the given args; resolves on exit 0, rejects otherwise. */
function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with status ${code ?? 'null'}`));
    });
  });
}

export async function POST(req: Request) {
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  if (!who.ok) return NextResponse.json(who.body, { status: who.status });
  const svc = getServices();

  if (!svc.transcribeAvailable) {
    return NextResponse.json(
      { error: 'voice input not configured (set WISPRFLOW_API_KEY)' },
      { status: 503 },
    );
  }

  if (!ffmpegStatic) {
    return NextResponse.json({ error: 'audio conversion unavailable' }, { status: 503 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('audio');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'no audio' }, { status: 400 });
  }

  const bytes = new Uint8Array(await (file as Blob).arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), 'forgecast-transcribe-'));

  try {
    const inPath = join(dir, 'in');
    const outPath = join(dir, 'out.wav');
    writeFileSync(inPath, bytes);

    // Convert to 16kHz mono WAV — ffmpeg auto-detects the input format.
    await runFfmpeg(ffmpegStatic, ['-y', '-i', inPath, '-ar', '16000', '-ac', '1', '-f', 'wav', outPath]);

    const base64 = Buffer.from(readFileSync(outPath)).toString('base64');
    const result = await svc.transcriber.transcribe({ audioBase64Wav: base64 });

    return NextResponse.json({ text: result.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
