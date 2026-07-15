/**
 * Montage render worker HTTP service.
 *
 * Contract:
 *   POST /render          body: MontageSpec JSON  → { taskId }
 *   GET  /render/:id                              → { state, videoUrl? }
 *   GET  /files/:id.mp4                           → stream mp4
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { renderMontage } from './render';
import type { MontageSpec } from './timeline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env['PORT'] ?? '8787';
const PUBLIC_BASE = (process.env['MONTAGE_PUBLIC_URL'] ?? `http://localhost:${PORT}`).replace(/\/$/, '');

const OUT_DIR = path.join(__dirname, '..', 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// In-memory task store
// ---------------------------------------------------------------------------

interface TaskRecord {
  state: 'processing' | 'complete' | 'failed';
  videoUrl?: string;
}

const tasks = new Map<string, TaskRecord>();

// Monotonic counter + fixed nonce for stable, non-random IDs
let taskCounter = 0;
const START_NONCE = crypto.createHash('sha1').update(String(process.hrtime.bigint())).digest('hex').slice(0, 6);

function newTaskId(): string {
  taskCounter += 1;
  return `mtg_${taskCounter}_${START_NONCE}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handlePostRender(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  let spec: MontageSpec;
  try {
    const raw = await readBody(req);
    spec = JSON.parse(raw) as MontageSpec;
  } catch {
    send(res, 400, { error: 'invalid JSON body' });
    return;
  }

  if (!Array.isArray(spec.scenes) || spec.scenes.length === 0) {
    send(res, 400, { error: 'body must have a non-empty scenes array' });
    return;
  }

  const taskId = newTaskId();
  tasks.set(taskId, { state: 'processing' });
  send(res, 200, { taskId });

  // Kick off async render — deliberately not awaited in the handler
  const outFile = path.join(OUT_DIR, `${taskId}.mp4`);
  renderMontage(spec, outFile)
    .then(() => {
      tasks.set(taskId, {
        state: 'complete',
        videoUrl: `${PUBLIC_BASE}/files/${taskId}.mp4`,
      });
    })
    .catch((err: unknown) => {
      console.error(`[montage] render failed for ${taskId}:`, err);
      tasks.set(taskId, { state: 'failed' });
    });
}

function handleGetRender(res: http.ServerResponse, taskId: string): void {
  const task = tasks.get(taskId);
  if (!task) {
    send(res, 404, { error: 'unknown task id' });
    return;
  }
  send(res, 200, task);
}

function handleGetFile(res: http.ServerResponse, fileId: string): void {
  const filePath = path.join(OUT_DIR, `${fileId}.mp4`);
  if (!fs.existsSync(filePath)) {
    send(res, 404, { error: 'file not found' });
    return;
  }
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': String(stat.size),
    'Cache-Control': 'public, max-age=3600',
  });
  fs.createReadStream(filePath).pipe(res);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function router(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = req.url ?? '/';

  // GET /health — liveness for the deploy host's health checks.
  if (method === 'GET' && url === '/health') {
    send(res, 200, { ok: true });
    return;
  }

  // POST /render
  if (method === 'POST' && url === '/render') {
    await handlePostRender(req, res);
    return;
  }

  // GET /render/:id
  const renderMatch = url.match(/^\/render\/([^/]+)$/);
  if (method === 'GET' && renderMatch?.[1]) {
    handleGetRender(res, renderMatch[1]);
    return;
  }

  // GET /files/:id.mp4
  const fileMatch = url.match(/^\/files\/([^/]+)\.mp4$/);
  if (method === 'GET' && fileMatch?.[1]) {
    handleGetFile(res, fileMatch[1]);
    return;
  }

  send(res, 404, { error: 'not found' });
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  router(req, res).catch((err: unknown) => {
    console.error('[montage] unhandled error:', err);
    if (!res.headersSent) {
      send(res, 500, { error: 'internal server error' });
    }
  });
});

server.listen(Number(PORT), () => {
  console.log(`montage worker listening on :${PORT}`);
});
