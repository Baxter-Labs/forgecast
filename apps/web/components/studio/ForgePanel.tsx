'use client';
import { useState } from 'react';
import type { CatalogModel } from '@forgecast/catalog';
import { imageModels } from '@forgecast/catalog';
import type { Availability, StudioAsset } from '@/lib/use-forgecast';
import { MontageBuilder } from './MontageBuilder';
import type { StoredCampaign } from './CampaignPanel';

const FALLBACK_RATIOS = ['1:1', '16:9', '9:16', '4:3'];
const VIDEO_RATIOS = ['9:16', '16:9', '1:1'];

export type ForgeMode = 'image' | 'video' | 'montage' | 'voice' | 'short';

/** UI knobs for the MoneyPrinterTurbo short-video tab. */
export interface ShortControls {
  subtitles: boolean;
  count: number;
  music: boolean;
  voiceName: string;
}

interface ForgePanelProps {
  mode: ForgeMode;
  setMode: (m: ForgeMode) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  voiceName: string;
  setVoiceName: (v: string) => void;
  short: ShortControls;
  setShort: (s: ShortControls) => void;
  boostQuality: boolean;
  setBoostQuality: (v: boolean) => void;
  videoImageAssetId: string | null;
  setVideoImageAssetId: (id: string | null) => void;
  ratio: string;
  setRatio: (v: string) => void;
  onForge: () => void;
  forging: boolean;
  availability: Availability;
  assets: StudioAsset[];
  montagePrompts: string[];
  setMontagePrompts: (prompts: string[]) => void;
  campaigns: StoredCampaign[];
  activeCampaignId: string | null;
  setActiveCampaignId: (id: string | null) => void;
  onCreateCampaign: (name: string) => void;
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
      {children}
    </label>
  );
}

function FieldHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
      {children}
    </p>
  );
}

const SELECT_CLASS = 'w-full rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] text-sm px-3 py-2.5 outline-none appearance-none cursor-pointer focus:border-[var(--ember-2)] transition-colors';
const SELECT_ARROW = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b5e54' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat' as const, backgroundPosition: 'right 12px center' };

const SEGMENTS: { id: ForgeMode; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'montage', label: 'Montage' },
  { id: 'voice', label: 'Voice' },
  { id: 'short', label: 'Short' },
];

function RatioRow({ ratios, ratio, setRatio }: { ratios: string[]; ratio: string; setRatio: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ratios.map((r) => {
        const selected = r === ratio;
        return (
          <button
            key={r}
            type="button"
            onClick={() => setRatio(r)}
            aria-pressed={selected}
            className="font-mono text-xs px-3 py-1.5 rounded border transition-all"
            style={selected ? {
              borderColor: 'var(--ember-2)',
              color: 'var(--ember-1)',
              boxShadow: '0 0 12px var(--ember-glow)',
              background: 'rgba(255,122,26,0.06)',
            } : {
              borderColor: 'var(--forge-border)',
              color: 'var(--forge-faint)',
              background: 'transparent',
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

function BoostToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <div>
      <FieldHeading>Quality</FieldHeading>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        className="flex items-center gap-2.5 rounded-lg px-4 py-2.5 border font-mono text-[11px] uppercase tracking-[0.12em] transition-all"
        style={active ? {
          borderColor: 'var(--ember-2)',
          color: 'var(--ember-1)',
          background: 'rgba(255,122,26,0.08)',
          boxShadow: '0 0 12px var(--ember-glow)',
        } : {
          borderColor: 'var(--forge-border)',
          color: 'var(--forge-faint)',
          background: 'transparent',
        }}
      >
      <span aria-hidden="true">{active ? '⚡' : '○'}</span>
        Boost Quality
      </button>
      <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2">
        {active
          ? <><span className="text-[var(--ember-1)] opacity-70">Veo 3.1 Fast</span> · best · 4K + native audio</>
          : <><span style={{ color: 'var(--forge-muted)' }}>Seedance 1.5 Pro</span> · best value · native audio</>}
      </p>
    </div>
  );
}

function ShortToggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className="flex items-center gap-2 rounded-lg px-3 py-2 border font-mono text-[10px] uppercase tracking-[0.1em] transition-all"
      style={active
        ? { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)' }
        : { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
    >
      <span aria-hidden="true">{active ? '⚡' : '○'}</span>
      {label}
    </button>
  );
}

function ImageSourcePicker({
  assets,
  selectedId,
  onSelect,
}: {
  assets: StudioAsset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const imageAssets = assets.filter((a) => a.type === 'image');
  if (imageAssets.length === 0) {
    return (
      <div>
        <FieldHeading>Source image</FieldHeading>
        <p className="font-mono text-[10px] text-[var(--forge-faint)]">no images yet — forge one in Image mode first</p>
      </div>
    );
  }
  return (
    <div>
      <FieldHeading>Source image</FieldHeading>
      <div className="grid grid-cols-4 gap-1.5">
        {imageAssets.slice(0, 16).map((a) => {
          const sel = a.id === selectedId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(sel ? null : a.id)}
              aria-pressed={sel}
              className="relative aspect-square rounded overflow-hidden border-2 transition-all"
              style={sel ? {
                borderColor: 'var(--ember-2)',
                boxShadow: '0 0 10px var(--ember-glow)',
              } : {
                borderColor: 'var(--forge-border)',
              }}
              title={a.params.prompt ?? a.id}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/assets/${a.id}/raw`}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {sel && (
                <span
                  className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold"
                  style={{ background: 'rgba(255,122,26,0.22)', color: 'var(--ember-1)' }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ForgePanel({
  mode, setMode, prompt, setPrompt, model, setModel, voiceName, setVoiceName, short, setShort, boostQuality, setBoostQuality,
  videoImageAssetId, setVideoImageAssetId,
  ratio, setRatio, onForge, forging, availability,
  assets,
  montagePrompts, setMontagePrompts,
  campaigns, activeCampaignId, setActiveCampaignId, onCreateCampaign,
}: ForgePanelProps) {
  const [newCampaignMode, setNewCampaignMode] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');

  const selectedModel: CatalogModel | undefined = imageModels.find((m) => m.id === model);
  const imageRatios = (selectedModel?.aspectRatios?.length ?? 0) > 0
    ? (selectedModel?.aspectRatios ?? FALLBACK_RATIOS)
    : FALLBACK_RATIOS;

  function segmentAvailable(id: ForgeMode): boolean {
    if (id === 'video') return availability.video;
    if (id === 'montage') return availability.video && availability.montage;
    if (id === 'voice') return availability.voice;
    if (id === 'short') return availability.short;
    return true;
  }

  const missingHint = mode === 'video' && !availability.video
    ? 'video offline · set FAL_KEY_VIDEO'
    : mode === 'montage' && !availability.video
      ? 'montage offline · set FAL_KEY_VIDEO (clips required)'
      : mode === 'montage' && !availability.montage
        ? 'montage offline · set MONTAGE_WORKER_URL'
        : mode === 'voice' && !availability.voice
          ? 'voice offline · set VOXCPM_URL (self-hosted) or FAL_KEY_VOICE'
          : mode === 'short' && !availability.short
            ? 'short video offline · run the MoneyPrinterTurbo worker + set FORGECAST_VIDEO_WORKER_URL'
            : null;

  const hasCampaign = !!activeCampaignId;

  const isI2V = false; // boost-quality toggle only exposes t2v models

  const canForge =
    !forging &&
    hasCampaign &&
    (mode === 'image'
      ? prompt.trim().length > 0
      : mode === 'video'
        ? prompt.trim().length > 0 && availability.video && (!isI2V || !!videoImageAssetId)
        : mode === 'voice'
          ? prompt.trim().length > 0 && availability.voice
          : mode === 'short'
            ? prompt.trim().length > 0 && availability.short
            : montagePrompts.filter((p) => p.trim()).length >= 2 && availability.video && availability.montage);

  const forgeLabel =
    !hasCampaign ? '⚒ SELECT A CAMPAIGN FIRST'
      : mode === 'video' ? (forging ? '⚒ FORGING…' : '⚒ FORGE CLIP →')
        : mode === 'montage' ? (forging ? '⚒ FORGING…' : '⚒ FORGE MONTAGE →')
          : mode === 'voice' ? (forging ? '⚒ FORGING…' : '⚒ FORGE VOICE →')
            : mode === 'short' ? (forging ? '⚒ FORGING…' : '⚒ FORGE SHORT →')
              : (forging ? '⚒ FORGING…' : '⚒ FORGE →');

  const forgeAction =
    mode === 'video' ? 'Forge video clip' : mode === 'montage' ? 'Forge montage' : mode === 'voice' ? 'Forge voice-over' : mode === 'short' ? 'Forge short video' : 'Forge image';

  function submitNewCampaign() {
    const name = newCampaignName.trim();
    if (!name) return;
    onCreateCampaign(name);
    setNewCampaignName('');
    setNewCampaignMode(false);
  }

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId);

  return (
    <div className="panel p-5 flex flex-col gap-6">
      {/* CAMPAIGN SELECTOR */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">Campaign</p>
        {newCampaignMode ? (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNewCampaign(); if (e.key === 'Escape') setNewCampaignMode(false); }}
              placeholder="Campaign name…"
              className="flex-1 rounded-lg bg-[var(--forge-surface-2)] border border-[var(--ember-2)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm px-3 py-2 outline-none"
            />
            <button
              type="button"
              onClick={submitNewCampaign}
              className="font-mono text-xs px-3 py-2 rounded-lg border"
              style={{ borderColor: 'var(--ember-2)', color: 'var(--ember-1)', background: 'rgba(255,122,26,0.08)' }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setNewCampaignMode(false)}
              className="font-mono text-xs px-3 py-2 rounded-lg border"
              style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <select
                value={activeCampaignId ?? ''}
                onChange={(e) => setActiveCampaignId(e.target.value || null)}
                className={SELECT_CLASS}
                style={SELECT_ARROW}
              >
                <option value="" style={{ background: '#221b16', color: '#6b5e54' }}>
                  {campaigns.length === 0 ? '— no campaigns yet —' : '— select campaign —'}
                </option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: '#221b16', color: '#f5eee6' }}>
                    {c.brief.length > 0 ? (c.brief.length > 40 ? c.brief.slice(0, 40) + '…' : c.brief) : `Campaign ${c.id.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              title="New campaign"
              onClick={() => setNewCampaignMode(true)}
              className="w-9 h-9 flex-shrink-0 rounded-lg border font-mono text-lg flex items-center justify-center transition-all"
              style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
            >
              +
            </button>
          </div>
        )}
        {activeCampaign && (
          <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-1.5 truncate">
            <span className="text-[var(--ember-1)] opacity-70">→</span> {activeCampaign.brief || `Campaign ${activeCampaign.id.slice(0, 6)}`}
          </p>
        )}
        {!hasCampaign && !newCampaignMode && (
          <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-1.5">
            select or create a campaign to enable generation
          </p>
        )}
      </div>

      {/* MODE TOGGLE */}
      <div>
        <div className="grid grid-cols-5 gap-1 p-1 rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)]">
          {SEGMENTS.map((seg) => {
            const active = seg.id === mode;
            const available = segmentAvailable(seg.id);
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => { if (available) setMode(seg.id); }}
                disabled={!available}
                aria-pressed={active}
                className="font-mono text-[11px] uppercase tracking-[0.12em] py-2 rounded-md border transition-all"
                style={active ? {
                  borderColor: 'var(--ember-2)',
                  color: 'var(--ember-1)',
                  boxShadow: '0 0 12px var(--ember-glow)',
                  background: 'rgba(255,122,26,0.08)',
                } : {
                  borderColor: 'transparent',
                  color: available ? 'var(--forge-faint)' : 'var(--forge-border)',
                  background: 'transparent',
                  cursor: available ? 'pointer' : 'not-allowed',
                  opacity: available ? 1 : 0.6,
                }}
              >
                {seg.label}
              </button>
            );
          })}
        </div>
        {missingHint && (
          <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2">{missingHint}</p>
        )}
      </div>

      {/* IMAGE MODE */}
      {mode === 'image' && (
        <>
          <div>
            <FieldLabel htmlFor="forge-prompt">Prompt</FieldLabel>
            <textarea
              id="forge-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A lone anvil glowing in a dark smithy, embers rising into black air…"
              rows={6}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
            />
          </div>

          <div>
            <FieldLabel htmlFor="forge-model">Model</FieldLabel>
            <select
              id="forge-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={SELECT_CLASS}
              style={SELECT_ARROW}
            >
              {imageModels.map((m) => (
                <option key={m.id} value={m.id} style={{ background: '#221b16', color: '#f5eee6' }}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2 flex items-center gap-2">
              <span className="text-[var(--ember-1)] opacity-70">{model}</span>
              {selectedModel?.note && (
                <>
                  <span className="text-[var(--forge-faint)]">·</span>
                  <span>{selectedModel.note}</span>
                </>
              )}
            </p>
          </div>

          <div>
            <FieldHeading>Ratio</FieldHeading>
            <RatioRow ratios={imageRatios} ratio={ratio} setRatio={setRatio} />
          </div>
        </>
      )}

      {/* VIDEO MODE */}
      {mode === 'video' && (
        <>
          <div>
            <FieldLabel htmlFor="forge-video-prompt">Prompt</FieldLabel>
            <textarea
              id="forge-video-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Sparks cascading off molten steel as a hammer strikes, slow motion, cinematic…"
              rows={6}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
            />
          </div>

          <BoostToggle active={boostQuality} onToggle={() => setBoostQuality(!boostQuality)} />

          {isI2V && (
            <>
              <ImageSourcePicker
                assets={assets}
                selectedId={videoImageAssetId}
                onSelect={setVideoImageAssetId}
              />
              {!videoImageAssetId && (
                <p className="font-mono text-[10px] text-[var(--forge-faint)] -mt-3">
                  pick a source image above to enable forging
                </p>
              )}
            </>
          )}

          <div>
            <FieldHeading>Ratio</FieldHeading>
            <RatioRow ratios={VIDEO_RATIOS} ratio={ratio} setRatio={setRatio} />
          </div>
        </>
      )}

      {/* MONTAGE MODE */}
      {mode === 'montage' && (
        <>
          <MontageBuilder
            prompts={montagePrompts}
            setPrompts={setMontagePrompts}
          />

          <BoostToggle active={boostQuality} onToggle={() => setBoostQuality(!boostQuality)} />

          <div>
            <FieldHeading>Ratio</FieldHeading>
            <RatioRow ratios={VIDEO_RATIOS} ratio={ratio} setRatio={setRatio} />
          </div>

          <p className="font-mono text-[10px] text-[var(--forge-faint)]">
            generates 3 video clips and stitches them into a montage (Remotion)
          </p>
        </>
      )}

      {/* VOICE MODE */}
      {mode === 'voice' && (
        <>
          <div>
            <FieldLabel htmlFor="forge-voice-script">Script</FieldLabel>
            <textarea
              id="forge-voice-script"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="The words to speak — Forgecast turns them into a natural voice-over you can narrate a video with or cast on its own…"
              rows={6}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
            />
          </div>

          <div>
            <FieldLabel htmlFor="forge-voice-name">Voice <span className="normal-case tracking-normal text-[var(--forge-faint)]">(optional)</span></FieldLabel>
            <input
              id="forge-voice-name"
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              placeholder="e.g. narrator · leave blank for the default"
              className="w-full rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm px-3 py-2.5 outline-none focus:border-[var(--ember-2)] transition-colors"
            />
            <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2">
              self-hosted <span className="text-[var(--ember-1)] opacity-70">VoxCPM-2</span> when configured, else fal TTS
            </p>
          </div>
        </>
      )}

      {/* SHORT MODE — MoneyPrinterTurbo: topic → captioned vertical clip */}
      {mode === 'short' && (
        <>
          <div>
            <FieldLabel htmlFor="forge-short">Topic or script</FieldLabel>
            <textarea
              id="forge-short"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A topic to turn into a captioned vertical short — it writes the script, pulls stock footage, narrates, and burns in captions…"
              rows={5}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
            />
          </div>

          <div>
            <FieldHeading>Aspect</FieldHeading>
            <RatioRow ratios={VIDEO_RATIOS} ratio={ratio} setRatio={setRatio} />
          </div>

          <div className="flex flex-wrap gap-2">
            <ShortToggle label="Burn-in captions" active={short.subtitles} onToggle={() => setShort({ ...short, subtitles: !short.subtitles })} />
            <ShortToggle label="Background music" active={short.music} onToggle={() => setShort({ ...short, music: !short.music })} />
          </div>

          <div>
            <FieldHeading>How many (batch)</FieldHeading>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => {
                const selected = short.count === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setShort({ ...short, count: n })}
                    aria-pressed={selected}
                    className="font-mono text-xs w-9 py-1.5 rounded border transition-all"
                    style={selected
                      ? { borderColor: 'var(--ember-2)', color: 'var(--ember-1)', boxShadow: '0 0 12px var(--ember-glow)', background: 'rgba(255,122,26,0.06)' }
                      : { borderColor: 'var(--forge-border)', color: 'var(--forge-faint)', background: 'transparent' }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="short-voice">Voice <span className="normal-case tracking-normal text-[var(--forge-faint)]">(optional)</span></FieldLabel>
            <input
              id="short-voice"
              type="text"
              value={short.voiceName}
              onChange={(e) => setShort({ ...short, voiceName: e.target.value })}
              placeholder="e.g. en-US-AvaNeural · blank for the worker default"
              className="w-full rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm px-3 py-2.5 outline-none focus:border-[var(--ember-2)] transition-colors"
            />
          </div>

          <p className="font-mono text-[10px] text-[var(--forge-faint)]">
            topic → script → stock footage → narration → captions → music (MoneyPrinterTurbo)
          </p>
        </>
      )}

      {/* FORGE BUTTON */}
      <button
        type="button"
        onClick={onForge}
        disabled={!canForge}
        aria-label={forgeAction}
        className={`btn-forge w-full rounded-lg py-3 text-sm flex items-center justify-center gap-2 ${forging ? 'forging' : ''}`}
      >
        <span aria-hidden="true">{forgeLabel}</span>
      </button>
    </div>
  );
}
