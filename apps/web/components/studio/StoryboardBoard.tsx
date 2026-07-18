'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, Film, Image as ImageIcon, ArrowRight } from 'lucide-react';
import type { Character, EditorTimeline, Storyboard, StoryboardShot } from '@/lib/use-forgecast';

/**
 * The Director's board: brief → LLM shot list → identity-consistent stills →
 * optional animation per shot → assemble onto the editor timeline. Mirrors the
 * MCP storyboard tools so the same board is drivable by hand or by an agent.
 */

const SHOT_COUNTS = [4, 6, 8, 10, 12] as const;
const RATIOS = ['9:16', '16:9', '1:1'] as const;

interface StoryboardBoardProps {
  projectId: string | null;
  characters: Character[];
  loadStoryboard: () => Promise<Storyboard | null>;
  saveStoryboard: (s: Storyboard) => Promise<Storyboard | null>;
  generateStoryboard: (args: { brief: string; shotCount?: number; characterId?: string; aspectRatio?: string }) => Promise<Storyboard | null>;
  renderStoryboardShot: (shotId: string) => Promise<StoryboardShot | null>;
  animateStoryboardShot: (shotId: string) => Promise<string | null>;
  storyboardToTimeline: () => Promise<EditorTimeline | null>;
  videoAvailable: boolean;
}

const chipBase = 'font-mono text-xs px-3 py-1.5 rounded border transition-all';
const chipOn = { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', boxShadow: '0 0 12px var(--ember-glow)', background: 'rgba(255,122,26,0.06)' } as const;
const chipOff = { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' } as const;

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">{children}</p>;
}

type ShotBusy = 'render' | 'animate' | undefined;

function ShotCard({
  shot, index, busy, videoAvailable,
  onEdit, onCommit, onRender, onAnimate,
}: {
  shot: StoryboardShot;
  index: number;
  busy: ShotBusy;
  videoAvailable: boolean;
  onEdit: (patch: Partial<StoryboardShot>) => void;
  onCommit: () => void;
  onRender: () => void;
  onAnimate: () => void;
}) {
  const frameLabel = shot.clipAssetId ? 'clip ready' : shot.imageAssetId ? 'frame ready' : 'not rendered';
  return (
    <li className="panel p-3 flex flex-col gap-3 list-none">
      {/* Header: number + shot type chip + state */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="font-mono text-[11px] w-6 h-6 shrink-0 rounded flex items-center justify-center"
          style={{ background: 'rgba(255,122,26,0.1)', color: 'var(--ember-1)', border: '1px solid var(--ember-2)' }}
        >
          {index + 1}
        </span>
        <span className="sr-only">Shot {index + 1}</span>
        {shot.shotType && (
          <span
            className="font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded border"
            style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-muted)' }}
          >
            {shot.shotType}
          </span>
        )}
        <span className="font-mono text-[10px] text-[var(--forge-faint)] ml-auto">{shot.durationSec}s · {frameLabel}</span>
      </div>

      {/* Frame: clip > still > placeholder */}
      <div
        className="relative w-full aspect-video rounded-lg overflow-hidden border"
        style={{ borderColor: shot.imageAssetId || shot.clipAssetId ? 'var(--ember-2)' : 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
      >
        {shot.clipAssetId ? (
          <video
            src={`/api/assets/${shot.clipAssetId}/raw`}
            className="w-full h-full object-cover"
            muted loop playsInline controls
            aria-label={`Shot ${index + 1} animated clip`}
          />
        ) : shot.imageAssetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/assets/${shot.imageAssetId}/raw`}
            alt={`Shot ${index + 1} frame: ${shot.prompt.slice(0, 80)}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-[var(--forge-faint)]">
            <ImageIcon size={18} aria-hidden="true" />
            <span className="font-mono text-[10px]">render the frame to see it here</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(16,13,11,0.6)' }}>
            <span className="forge-spinner" role="status" aria-label={busy === 'render' ? 'Rendering frame' : 'Animating shot'} />
          </div>
        )}
      </div>

      {/* Editable prompt + caption (committed on blur) */}
      <div>
        <label htmlFor={`shot-prompt-${shot.id}`} className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)] mb-1.5">
          Prompt
        </label>
        <textarea
          id={`shot-prompt-${shot.id}`}
          value={shot.prompt}
          onChange={(e) => onEdit({ prompt: e.target.value })}
          onBlur={onCommit}
          rows={3}
          className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-3 py-2 outline-none transition-all focus:border-[var(--ember-2)]"
        />
      </div>
      <div>
        <label htmlFor={`shot-caption-${shot.id}`} className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)] mb-1.5">
          Caption <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <input
          id={`shot-caption-${shot.id}`}
          type="text"
          value={shot.caption ?? ''}
          onChange={(e) => onEdit({ caption: e.target.value })}
          onBlur={onCommit}
          placeholder="On-screen text for this shot…"
          className="w-full rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm px-3 py-2 outline-none focus:border-[var(--ember-2)] transition-colors"
        />
      </div>

      {/* Per-shot actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRender}
          disabled={!!busy || shot.prompt.trim().length === 0}
          aria-label={`Render frame for shot ${index + 1}`}
          className={`${chipBase} flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
          style={chipOn}
        >
          <ImageIcon size={12} aria-hidden="true" /> {shot.imageAssetId ? 'Re-render frame' : 'Render frame'}
        </button>
        <button
          type="button"
          onClick={onAnimate}
          disabled={!!busy || !shot.imageAssetId || !videoAvailable}
          aria-label={`Animate shot ${index + 1}`}
          title={!videoAvailable ? 'video offline — add a video provider in keys' : !shot.imageAssetId ? 'render the frame first' : undefined}
          className={`${chipBase} flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
          style={shot.clipAssetId ? chipOff : chipOn}
        >
          <Film size={12} aria-hidden="true" /> {shot.clipAssetId ? 'Re-animate' : 'Animate'}
        </button>
      </div>
    </li>
  );
}

export function StoryboardBoard({
  projectId, characters,
  loadStoryboard, saveStoryboard, generateStoryboard,
  renderStoryboardShot, animateStoryboardShot, storyboardToTimeline,
  videoAvailable,
}: StoryboardBoardProps) {
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [brief, setBrief] = useState('');
  const [shotCount, setShotCount] = useState<number>(6);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<string>('9:16');
  const [planning, setPlanning] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [busyShots, setBusyShots] = useState<Record<string, ShotBusy>>({});
  const dirtyRef = useRef(false);

  // Load any previously saved board for this project.
  useEffect(() => {
    if (!projectId) return;
    void loadStoryboard().then((sb) => {
      if (!sb) return;
      if (sb.shots.length > 0) setStoryboard(sb);
      if (sb.brief) setBrief((prev) => prev || sb.brief);
      if (sb.aspectRatio) setAspectRatio(sb.aspectRatio);
    });
  }, [projectId, loadStoryboard]);

  const patchShot = useCallback((shotId: string, patch: Partial<StoryboardShot>) => {
    dirtyRef.current = true;
    setStoryboard((prev) => prev
      ? { ...prev, shots: prev.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)) }
      : prev);
  }, []);

  // Persist prompt/caption edits when a field blurs (whole-document save).
  const commitEdits = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setStoryboard((prev) => {
      if (prev) void saveStoryboard(prev);
      return prev;
    });
  }, [saveStoryboard]);

  async function handlePlan() {
    if (!brief.trim() || planning) return;
    setPlanning(true);
    const sb = await generateStoryboard({
      brief: brief.trim(),
      shotCount,
      aspectRatio,
      ...(characterId ? { characterId } : {}),
    });
    if (sb) setStoryboard(sb);
    setPlanning(false);
  }

  async function handleRender(shotId: string) {
    setBusyShots((b) => ({ ...b, [shotId]: 'render' }));
    const shot = await renderStoryboardShot(shotId);
    if (shot) patchShot(shotId, { imageAssetId: shot.imageAssetId });
    dirtyRef.current = false; // the server already persisted the stamp
    setBusyShots((b) => ({ ...b, [shotId]: undefined }));
  }

  async function handleAnimate(shotId: string) {
    setBusyShots((b) => ({ ...b, [shotId]: 'animate' }));
    const clipAssetId = await animateStoryboardShot(shotId);
    if (clipAssetId) patchShot(shotId, { clipAssetId });
    dirtyRef.current = false; // the server already persisted the stamp
    setBusyShots((b) => ({ ...b, [shotId]: undefined }));
  }

  async function handleAssemble() {
    if (assembling || !projectId) return;
    setAssembling(true);
    const timeline = await storyboardToTimeline();
    setAssembling(false);
    if (timeline) window.location.href = `/editor?project=${projectId}`;
  }

  const renderedCount = storyboard?.shots.filter((s) => s.imageAssetId || s.clipAssetId).length ?? 0;
  const anyBusy = Object.values(busyShots).some(Boolean);

  return (
    <section aria-label="Storyboard director" className="flex flex-col gap-4">
      {/* Brief + planning controls */}
      <div className="panel p-5 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <Clapperboard size={14} className="text-[var(--ember-1)]" aria-hidden="true" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--forge-text)]">
            Director{storyboard?.title ? <span className="text-[var(--forge-faint)] normal-case tracking-normal"> · {storyboard.title}</span> : null}
          </h2>
        </div>

        <div>
          <label htmlFor="storyboard-brief" className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
            Brief
          </label>
          <textarea
            id="storyboard-brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="A 30-second launch film for a hand-forged chef's knife — from raw steel to the first cut, moody workshop light…"
            rows={3}
            className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
          />
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <Heading>Shots</Heading>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Number of shots">
              {SHOT_COUNTS.map((n) => (
                <button key={n} type="button" onClick={() => setShotCount(n)} aria-pressed={shotCount === n} className={chipBase} style={shotCount === n ? chipOn : chipOff}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Heading>Ratio</Heading>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Aspect ratio">
              {RATIOS.map((r) => (
                <button key={r} type="button" onClick={() => setAspectRatio(r)} aria-pressed={aspectRatio === r} className={chipBase} style={aspectRatio === r ? chipOn : chipOff}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <Heading>Cast</Heading>
            {characters.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Starring cast member">
                {[null, ...characters.map((c) => c.id)].map((id) => {
                  const selected = id === characterId;
                  const label = id === null ? 'none' : characters.find((c) => c.id === id)?.name ?? id;
                  return (
                    <button
                      key={id ?? 'none'}
                      type="button"
                      onClick={() => setCharacterId(id)}
                      aria-pressed={selected}
                      className={`${chipBase} max-w-[160px] truncate`}
                      style={selected ? chipOn : chipOff}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="font-mono text-[10px] text-[var(--forge-faint)]">
                no cast yet — create a character to star the same face in every shot
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void handlePlan()}
          disabled={planning || brief.trim().length === 0}
          aria-label="Plan storyboard shots"
          className={`btn-forge w-full rounded-lg py-3 text-sm flex items-center justify-center gap-2 ${planning ? 'forging' : ''}`}
        >
          <span aria-hidden="true">{planning ? '⚒ DIRECTING…' : '⚒ PLAN SHOTS →'}</span>
        </button>
        {storyboard && storyboard.shots.length > 0 && (
          <p className="font-mono text-[10px] text-[var(--forge-faint)] -mt-2">
            re-planning replaces the current board · {storyboard.shots.length} shots
            {storyboard.voiceoverScript ? ' · voice-over scripted' : ''}
          </p>
        )}
      </div>

      {/* The board */}
      {storyboard && storyboard.shots.length > 0 && (
        <>
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 m-0 p-0" aria-label="Storyboard shots">
            {storyboard.shots.map((shot, i) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={i}
                busy={busyShots[shot.id]}
                videoAvailable={videoAvailable}
                onEdit={(patch) => patchShot(shot.id, patch)}
                onCommit={commitEdits}
                onRender={() => void handleRender(shot.id)}
                onAnimate={() => void handleAnimate(shot.id)}
              />
            ))}
          </ul>

          {/* Assemble */}
          <div className="panel p-4 flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] text-[var(--forge-faint)]">
              {renderedCount}/{storyboard.shots.length} shots rendered
              {storyboard.voiceoverScript ? ' · voice-over will be synthesized' : ''}
            </span>
            <button
              type="button"
              onClick={() => void handleAssemble()}
              disabled={assembling || anyBusy || renderedCount === 0}
              aria-label="Assemble storyboard into the timeline editor"
              className={`btn-forge ml-auto rounded-lg px-4 py-2.5 text-sm flex items-center justify-center gap-2 ${assembling ? 'forging' : ''}`}
            >
              <span aria-hidden="true">{assembling ? '⚒ ASSEMBLING…' : 'ASSEMBLE TO TIMELINE'}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
