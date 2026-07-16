'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Film, Music2, Trash2, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { StudioAsset } from '@/lib/use-forgecast';
import { useTimelineEditor } from '@/lib/use-timeline-editor';
import { AppNav } from '@/components/AppNav';
import { EditorAgent } from './EditorAgent';
import {
  TIMELINE_TRANSITIONS, TIMELINE_CAMERA_PRESETS, newClipFrom, moveItem, moveItemTo, totalDurationSec,
  type TimelineUIClip,
} from '@/lib/timeline-ui';

const ASPECTS = ['9:16', '16:9', '1:1'];
const FIELD = 'rounded bg-[var(--forge-bg)] border border-[var(--forge-border)] text-[var(--forge-text)] text-xs outline-none focus:border-[var(--ember-2)] transition-colors';
const PANEL_LABEL = 'font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]';
const DRAG_MIME = 'text/forgecast-clip';

function Thumb({ asset, className = 'w-full h-full object-cover' }: { asset: StudioAsset; className?: string }) {
  if (asset.type === 'video') {
    return <video src={`/api/assets/${asset.id}/raw`} muted playsInline preload="metadata" className={className} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/assets/${asset.id}/raw`} alt="" loading="lazy" className={className} />;
}

export function TimelineWorkspace() {
  const params = useSearchParams();
  const editor = useTimelineEditor(params.get('project'));
  const { timeline, setTimeline } = editor;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const visual = editor.assets.filter((a) => a.type === 'image' || a.type === 'video');
  const audio = editor.assets.filter((a) => a.type === 'audio');
  const byId = new Map(editor.assets.map((a) => [a.id, a]));
  const selected = timeline.clips.find((c) => c.id === selectedId) ?? null;
  const selectedAsset = selected ? byId.get(selected.assetId) : null;
  const total = totalDurationSec(timeline.clips);

  function addClip(asset: StudioAsset) {
    const clip = newClipFrom(asset);
    setTimeline((prev) => ({ ...prev, clips: [...prev.clips, clip] }));
    setSelectedId(clip.id);
  }
  function updateClip(id: string, fields: Partial<TimelineUIClip>) {
    setTimeline((prev) => ({ ...prev, clips: prev.clips.map((c) => (c.id === id ? { ...c, ...fields } : c)) }));
  }
  function removeClip(id: string) {
    setTimeline((prev) => ({ ...prev, clips: prev.clips.filter((c) => c.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }
  function stepClip(id: string, dir: -1 | 1) {
    setTimeline((prev) => ({ ...prev, clips: moveItem(prev.clips, id, dir) }));
  }
  function dropOn(targetIndex: number, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME) || dragId;
    if (!id) return;
    setTimeline((prev) => ({ ...prev, clips: moveItemTo(prev.clips, id, targetIndex) }));
    setDragId(null);
  }

  const saveBadge =
    editor.saveState === 'saving' ? 'saving…'
      : editor.saveState === 'saved' ? 'saved ✓'
        : editor.saveState === 'error' ? 'save failed — retrying on next edit'
          : 'autosaves';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--forge-bg)', color: 'var(--forge-text)' }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 border-b" style={{ borderColor: 'var(--forge-border)' }}>
        <AppNav />

        <div className="flex items-center gap-1.5" role="group" aria-label="Aspect ratio">
          {ASPECTS.map((r) => {
            const active = timeline.aspect === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={active}
                onClick={() => setTimeline((prev) => ({ ...prev, aspect: r }))}
                className="font-mono text-[11px] px-2.5 py-1 rounded border transition-all"
                style={active
                  ? { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)', boxShadow: '0 0 10px var(--ember-glow)' }
                  : { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
              >
                {r}
              </button>
            );
          })}
        </div>

        <p className="font-mono text-[11px] text-[var(--forge-faint)]">
          {timeline.clips.length} clip{timeline.clips.length === 1 ? '' : 's'} · <span className="text-[var(--ember-1)] opacity-80">≈ {total}s</span>
        </p>

        <span className="flex-1" />

        <p className="font-mono text-[10px] text-[var(--forge-faint)]" role="status">{saveBadge}</p>
        <button
          type="button"
          onClick={() => void editor.render()}
          disabled={editor.renderState === 'rendering' || timeline.clips.length === 0 || !editor.available}
          className={`btn-forge rounded-lg px-5 py-2 text-sm ${editor.renderState === 'rendering' ? 'forging' : ''}`}
        >
          {editor.renderState === 'rendering' ? '⚒ FORGING…' : '⚒ RENDER →'}
        </button>
      </header>

      {!editor.available && (
        <p role="alert" className="px-5 py-2 font-mono text-[10px] text-[var(--forge-faint)] border-b" style={{ borderColor: 'var(--forge-border)' }}>
          renderer offline — the bundled ffmpeg or MONTAGE_WORKER_URL is required to render (editing still works)
        </p>
      )}
      {editor.error && (
        <p role="alert" className="px-5 py-2 font-mono text-[10px] text-red-300 border-b" style={{ borderColor: 'var(--forge-border)' }}>
          {editor.error}
        </p>
      )}

      {/* ── Result bar ──────────────────────────────────────────────────────── */}
      {editor.renderState === 'done' && editor.resultAssetId && (
        <div className="forge-done flex flex-wrap items-center gap-4 px-5 py-3 border-b" style={{ borderColor: 'var(--ember-2)', background: 'rgba(255,122,26,0.05)' }}>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ember-1)]">Forged ✓</span>
          <video src={`/api/assets/${editor.resultAssetId}/raw`} controls className="h-24 rounded border" style={{ borderColor: 'var(--forge-border)' }} />
          <a
            href={`/api/assets/${editor.resultAssetId}/raw?download=1`}
            className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--forge-muted)] hover:text-[var(--ember-1)] transition-colors"
          >
            <Download size={13} aria-hidden="true" /> Download
          </a>
        </div>
      )}

      {/* ── Workspace ───────────────────────────────────────────────────────── */}
      <main aria-label="Timeline editor" className="flex-1 grid gap-4 p-4 lg:grid-cols-[250px_1fr_280px] items-start">
        {/* Asset drawer */}
        <section aria-label="Assets" className="panel p-4 flex flex-col gap-3 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto">
          <p className={PANEL_LABEL}>Assets · tap to add</p>
          {!editor.loaded ? (
            <p className="font-mono text-[10px] text-[var(--forge-faint)]">loading…</p>
          ) : visual.length === 0 ? (
            <p className="font-mono text-[10px] text-[var(--forge-faint)] leading-relaxed">
              no assets yet — <Link href="/" className="text-[var(--ember-1)] underline underline-offset-2">forge or upload in the Studio</Link> first
            </p>
          ) : (
            <div className="grid grid-cols-3 lg:grid-cols-2 gap-1.5">
              {visual.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => addClip(a)}
                  aria-label={`Add this ${a.type} to the timeline`}
                  title={a.params.prompt ?? a.params.text ?? a.id}
                  className="relative aspect-square rounded overflow-hidden border-2 transition-all hover:border-[var(--ember-2)]"
                  style={{ borderColor: 'var(--forge-border)' }}
                >
                  <Thumb asset={a} />
                  <span aria-hidden="true" className="absolute bottom-0.5 right-0.5 font-mono text-[9px] px-1 rounded" style={{ background: 'rgba(16,13,11,0.75)', color: 'var(--ember-1)' }}>
                    {a.type === 'video' ? '▶' : '+'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Preview + timeline lane */}
        <section aria-label="Preview and timeline" className="flex flex-col gap-4 min-w-0">
          <div className="panel p-4 flex items-center justify-center min-h-[300px] lg:min-h-[380px]">
            {selected && selectedAsset ? (
              <div className="flex flex-col items-center gap-3 max-w-full">
                {selectedAsset.type === 'video'
                  ? <video key={selectedAsset.id} src={`/api/assets/${selectedAsset.id}/raw`} controls className="max-h-[320px] max-w-full rounded" />
                  /* eslint-disable-next-line @next/next/no-img-element */
                  : <img src={`/api/assets/${selectedAsset.id}/raw`} alt="Selected clip" className="max-h-[320px] max-w-full rounded object-contain" />}
                {selected.caption.trim() && (
                  <p className="font-mono text-xs px-3 py-1 rounded" style={{ background: 'rgba(16,13,11,0.85)', color: 'var(--forge-text)' }}>
                    {selected.caption}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center flex flex-col items-center gap-2">
                <Film size={22} className="text-[var(--forge-faint)]" aria-hidden="true" />
                <p className="font-mono text-[11px] text-[var(--forge-faint)]">
                  {timeline.clips.length === 0 ? 'tap an asset on the left to start your timeline' : 'select a clip below to preview & edit it'}
                </p>
              </div>
            )}
          </div>

          {/* Lane */}
          <div className="panel p-3">
            <p className={`${PANEL_LABEL} mb-2`}>Timeline</p>
            {timeline.clips.length === 0 ? (
              <div className="rounded-lg border border-dashed px-4 py-6 text-center font-mono text-[10px] text-[var(--forge-faint)]" style={{ borderColor: 'var(--forge-border)' }}>
                empty — clips appear here in play order
              </div>
            ) : (
              <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Clips in play order">
                {timeline.clips.map((clip, i) => {
                  const asset = byId.get(clip.assetId);
                  const isSel = clip.id === selectedId;
                  return (
                    <li key={clip.id} className="shrink-0">
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, clip.id); e.dataTransfer.effectAllowed = 'move'; setDragId(clip.id); }}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => dropOn(i, e)}
                        onClick={() => setSelectedId(isSel ? null : clip.id)}
                        aria-pressed={isSel}
                        aria-label={`Clip ${i + 1}, ${clip.durationSec}s — click to ${isSel ? 'deselect' : 'select'}, drag to reorder`}
                        className="relative w-28 h-20 rounded-lg overflow-hidden border-2 transition-all"
                        style={isSel
                          ? { borderColor: 'var(--ember-2)', boxShadow: '0 0 12px var(--ember-glow)' }
                          : { borderColor: dragId === clip.id ? 'var(--ember-1)' : 'var(--forge-border)', opacity: dragId === clip.id ? 0.6 : 1 }}
                      >
                        {asset ? <Thumb asset={asset} /> : <span className="w-full h-full flex items-center justify-center font-mono text-[10px] text-[var(--forge-faint)]">?</span>}
                        <span aria-hidden="true" className="absolute top-1 left-1 font-mono text-[9px] px-1 rounded" style={{ background: 'rgba(16,13,11,0.8)', color: 'var(--forge-muted)' }}>{i + 1}</span>
                        <span aria-hidden="true" className="absolute bottom-1 right-1 font-mono text-[9px] px-1 rounded" style={{ background: 'rgba(16,13,11,0.8)', color: 'var(--ember-1)' }}>{clip.durationSec}s</span>
                      </button>
                    </li>
                  );
                })}
                {/* End drop zone */}
                <li
                  className="shrink-0 w-10 rounded-lg border border-dashed"
                  style={{ borderColor: dragId ? 'var(--ember-2)' : 'var(--forge-border)' }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => dropOn(timeline.clips.length, e)}
                  aria-hidden="true"
                />
              </ol>
            )}
          </div>
        </section>

        {/* Inspector */}
        <section aria-label="Inspector" className="panel p-4 flex flex-col gap-5 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto">
          <div>
            <p className={`${PANEL_LABEL} mb-3`}>Clip</p>
            {selected ? (
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--forge-faint)]">
                  Duration
                  <span className="flex items-center gap-1">
                    <input
                      type="number" min={0.5} max={60} step={0.5}
                      value={selected.durationSec}
                      onChange={(e) => { const v = Number(e.target.value); updateClip(selected.id, { durationSec: Number.isFinite(v) ? v : 0 }); }}
                      className={`${FIELD} w-16 px-1.5 py-1`}
                    />
                    s
                  </span>
                </label>
                <label className="flex flex-col gap-1.5 font-mono text-[10px] text-[var(--forge-faint)]">
                  Caption
                  <input
                    type="text"
                    value={selected.caption}
                    onChange={(e) => updateClip(selected.id, { caption: e.target.value })}
                    placeholder="Optional overlay text…"
                    className={`${FIELD} w-full px-2 py-1.5 placeholder:text-[var(--forge-faint)]`}
                  />
                </label>
                <label className="flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--forge-faint)]">
                  Transition
                  <select
                    value={selected.transition}
                    onChange={(e) => updateClip(selected.id, { transition: e.target.value as TimelineUIClip['transition'] })}
                    className={`${FIELD} px-1.5 py-1 cursor-pointer`}
                  >
                    {TIMELINE_TRANSITIONS.map((t) => <option key={t} value={t} style={{ background: '#221b16', color: '#f5eee6' }}>{t}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2 font-mono text-[10px] text-[var(--forge-faint)]">
                  Camera
                  <select
                    value={selected.cameraPreset}
                    onChange={(e) => updateClip(selected.id, { cameraPreset: e.target.value as TimelineUIClip['cameraPreset'] })}
                    aria-label="Camera motion preset"
                    className={`${FIELD} px-1.5 py-1 cursor-pointer`}
                  >
                    {TIMELINE_CAMERA_PRESETS.map((c) => <option key={c} value={c} style={{ background: '#221b16', color: '#f5eee6' }}>{c}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={() => stepClip(selected.id, -1)} aria-label="Move clip earlier" className="w-8 h-8 rounded border flex items-center justify-center" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-muted)' }}>
                    <ChevronLeft size={14} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => stepClip(selected.id, 1)} aria-label="Move clip later" className="w-8 h-8 rounded border flex items-center justify-center" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-muted)' }}>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  <span className="flex-1" />
                  <button type="button" onClick={() => removeClip(selected.id)} aria-label="Remove clip" className="flex items-center gap-1.5 font-mono text-[10px] uppercase px-2.5 py-1.5 rounded border transition-colors hover:border-red-400 hover:text-red-300" style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)' }}>
                    <Trash2 size={12} aria-hidden="true" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <p className="font-mono text-[10px] text-[var(--forge-faint)]">no clip selected</p>
            )}
          </div>

          <div>
            <p className={`${PANEL_LABEL} mb-3 flex items-center gap-1.5`}><Music2 size={11} aria-hidden="true" /> Music</p>
            <select
              value={timeline.musicAssetId ?? ''}
              onChange={(e) => { const v = e.target.value || null; setTimeline((prev) => ({ ...prev, musicAssetId: v })); }}
              aria-label="Background music"
              className={`${FIELD} w-full px-2 py-2 cursor-pointer`}
            >
              <option value="" style={{ background: '#221b16', color: '#6b5e54' }}>— none —</option>
              {audio.map((a) => (
                <option key={a.id} value={a.id} style={{ background: '#221b16', color: '#f5eee6' }}>
                  {(a.params.text ?? a.params.prompt ?? a.id).slice(0, 40)}
                </option>
              ))}
            </select>
            {audio.length === 0 && (
              <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2">no audio assets — forge one in the Studio&apos;s Voice tab</p>
            )}
          </div>

          <div>
            <p className={`${PANEL_LABEL} mb-3 flex items-center gap-1.5`}><Music2 size={11} aria-hidden="true" /> Voice-over</p>
            <select
              value={timeline.voiceoverAssetId ?? ''}
              onChange={(e) => { const v = e.target.value || null; setTimeline((prev) => ({ ...prev, voiceoverAssetId: v })); }}
              aria-label="Narration voice-over"
              className={`${FIELD} w-full px-2 py-2 cursor-pointer`}
            >
              <option value="" style={{ background: '#221b16', color: '#6b5e54' }}>— none —</option>
              {audio.map((a) => (
                <option key={a.id} value={a.id} style={{ background: '#221b16', color: '#f5eee6' }}>
                  {(a.params.text ?? a.params.prompt ?? a.id).slice(0, 40)}
                </option>
              ))}
            </select>
            <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2">plays over the whole cut — music ducks underneath it</p>
          </div>

          <EditorAgent projectId={editor.projectId} onDone={(r) => void editor.applyAgentResult(r)} />

          <p className="font-mono text-[10px] text-[var(--forge-faint)] leading-relaxed">
            agents edit this same timeline over MCP too — changes land in the same document
          </p>
        </section>
      </main>
    </div>
  );
}
