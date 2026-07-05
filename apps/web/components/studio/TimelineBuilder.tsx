'use client';
import type { StudioAsset } from '@/lib/use-forgecast';

/** A clip as the Studio edits it (caption/transition always present for controlled inputs). */
export interface TimelineUIClip {
  id: string;
  assetId: string;
  durationSec: number;
  caption: string;
  transition: 'fade' | 'slide' | 'none';
}

/** The timeline as Studio state — mapped to the core EditorTimeline on save/render. */
export interface TimelineControls {
  clips: TimelineUIClip[];
  aspect: string;
  musicAssetId: string | null;
}

interface TimelineBuilderProps {
  assets: StudioAsset[];
  timeline: TimelineControls;
  setTimeline: (t: TimelineControls) => void;
}

const TRANSITIONS: TimelineUIClip['transition'][] = ['fade', 'slide', 'none'];

const FIELD_CLASS = 'rounded bg-[var(--forge-bg)] border border-[var(--forge-border)] text-[var(--forge-text)] text-xs outline-none focus:border-[var(--ember-2)] transition-colors';
const ICON_BTN_CLASS = 'w-7 h-7 shrink-0 rounded border font-mono text-xs flex items-center justify-center transition-all disabled:opacity-35 disabled:cursor-not-allowed';
const ICON_BTN_STYLE = { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' } as const;
const SELECT_CLASS = 'w-full rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] text-sm px-3 py-2.5 outline-none appearance-none cursor-pointer focus:border-[var(--ember-2)] transition-colors';
const SELECT_ARROW = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b5e54' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 12px center' };

function clipUid(): string {
  return 'clip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function assetLabel(a: StudioAsset): string {
  return a.params.prompt ?? a.params.text ?? a.id.slice(0, 8);
}

function Thumb({ asset }: { asset: StudioAsset }) {
  if (asset.type === 'video') {
    return <video src={`/api/assets/${asset.id}/raw`} muted playsInline preload="metadata" className="w-full h-full object-cover" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/assets/${asset.id}/raw`} alt="" loading="lazy" className="w-full h-full object-cover" />;
}

export function TimelineBuilder({ assets, timeline, setTimeline }: TimelineBuilderProps) {
  const visual = assets.filter((a) => a.type === 'image' || a.type === 'video');
  const audio = assets.filter((a) => a.type === 'audio');
  const byId = new Map(assets.map((a) => [a.id, a]));
  const totalSec = Math.round(timeline.clips.reduce((s, c) => s + (c.durationSec || 0), 0) * 10) / 10;

  function patch(next: Partial<TimelineControls>) {
    setTimeline({ ...timeline, ...next });
  }
  function updateClip(id: string, fields: Partial<TimelineUIClip>) {
    patch({ clips: timeline.clips.map((c) => (c.id === id ? { ...c, ...fields } : c)) });
  }
  function moveClip(id: string, dir: -1 | 1) {
    const i = timeline.clips.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= timeline.clips.length) return;
    const next = [...timeline.clips];
    const moved = next.splice(i, 1)[0];
    if (!moved) return;
    next.splice(j, 0, moved);
    patch({ clips: next });
  }
  function removeClip(id: string) {
    patch({ clips: timeline.clips.filter((c) => c.id !== id) });
  }
  function addClip(asset: StudioAsset) {
    patch({
      clips: [
        ...timeline.clips,
        { id: clipUid(), assetId: asset.id, durationSec: asset.type === 'video' ? 5 : 3, caption: '', transition: 'fade' },
      ],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* CLIP LIST */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
            Timeline · {timeline.clips.length} clip{timeline.clips.length === 1 ? '' : 's'}
          </p>
          {timeline.clips.length > 0 && (
            <p className="font-mono text-[10px] text-[var(--ember-1)] opacity-80">≈ {totalSec}s</p>
          )}
        </div>

        {timeline.clips.length === 0 ? (
          <p className="font-mono text-[10px] text-[var(--forge-faint)]">no clips yet — tap an asset below to add it</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {timeline.clips.map((clip, i) => {
              const asset = byId.get(clip.assetId);
              return (
                <li
                  key={clip.id}
                  className="rounded-lg border p-2 flex flex-col gap-2"
                  style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="w-10 h-10 rounded overflow-hidden border shrink-0 flex items-center justify-center"
                      style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-bg)' }}
                    >
                      {asset ? <Thumb asset={asset} /> : <span className="font-mono text-[10px] text-[var(--forge-faint)]">?</span>}
                    </span>

                    <label className="font-mono text-[10px] text-[var(--forge-faint)] flex items-center gap-1">
                      <input
                        type="number"
                        min={0.5}
                        max={60}
                        step={0.5}
                        value={clip.durationSec}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateClip(clip.id, { durationSec: Number.isFinite(v) ? v : 0 });
                        }}
                        aria-label={`Clip ${i + 1} duration in seconds`}
                        className={`${FIELD_CLASS} w-14 px-1.5 py-1`}
                      />
                      s
                    </label>

                    <select
                      value={clip.transition}
                      onChange={(e) => updateClip(clip.id, { transition: e.target.value as TimelineUIClip['transition'] })}
                      aria-label={`Clip ${i + 1} transition`}
                      className={`${FIELD_CLASS} px-1.5 py-1 cursor-pointer`}
                    >
                      {TRANSITIONS.map((t) => (
                        <option key={t} value={t} style={{ background: '#221b16', color: '#f5eee6' }}>{t}</option>
                      ))}
                    </select>

                    <span className="flex-1" />

                    <button type="button" onClick={() => moveClip(clip.id, -1)} disabled={i === 0} aria-label={`Move clip ${i + 1} up`} className={ICON_BTN_CLASS} style={ICON_BTN_STYLE}>↑</button>
                    <button type="button" onClick={() => moveClip(clip.id, 1)} disabled={i === timeline.clips.length - 1} aria-label={`Move clip ${i + 1} down`} className={ICON_BTN_CLASS} style={ICON_BTN_STYLE}>↓</button>
                    <button type="button" onClick={() => removeClip(clip.id)} aria-label={`Remove clip ${i + 1}`} className={ICON_BTN_CLASS} style={ICON_BTN_STYLE}>✕</button>
                  </div>

                  <input
                    type="text"
                    value={clip.caption}
                    onChange={(e) => updateClip(clip.id, { caption: e.target.value })}
                    placeholder="Caption (optional)…"
                    aria-label={`Clip ${i + 1} caption`}
                    className={`${FIELD_CLASS} w-full px-2 py-1.5 placeholder:text-[var(--forge-faint)]`}
                  />
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* ASSET PICKER */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">Add clip</p>
        {visual.length === 0 ? (
          <p className="font-mono text-[10px] text-[var(--forge-faint)]">no assets yet — forge or upload images/clips first</p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {visual.slice(0, 24).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => addClip(a)}
                aria-label={`Add this ${a.type} to the timeline`}
                title={assetLabel(a)}
                className="relative aspect-square rounded overflow-hidden border-2 transition-all hover:border-[var(--ember-2)]"
                style={{ borderColor: 'var(--forge-border)' }}
              >
                <Thumb asset={a} />
                <span
                  aria-hidden="true"
                  className="absolute bottom-0.5 right-0.5 font-mono text-[9px] px-1 rounded"
                  style={{ background: 'rgba(16,13,11,0.75)', color: 'var(--ember-1)' }}
                >
                  {a.type === 'video' ? '▶' : '+'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MUSIC */}
      <div>
        <label htmlFor="timeline-music" className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
          Music <span className="normal-case tracking-normal">(optional)</span>
        </label>
        <select
          id="timeline-music"
          value={timeline.musicAssetId ?? ''}
          onChange={(e) => patch({ musicAssetId: e.target.value || null })}
          className={SELECT_CLASS}
          style={SELECT_ARROW}
        >
          <option value="" style={{ background: '#221b16', color: '#6b5e54' }}>— none —</option>
          {audio.map((a) => (
            <option key={a.id} value={a.id} style={{ background: '#221b16', color: '#f5eee6' }}>
              {assetLabel(a).slice(0, 44)}
            </option>
          ))}
        </select>
        {audio.length === 0 && (
          <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2">no audio assets — forge one in Voice mode to lay under the video</p>
        )}
      </div>
    </div>
  );
}
