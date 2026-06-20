import type { CatalogModel } from '@forgecast/catalog';
import { imageModels } from '@forgecast/catalog';
import type { StudioAsset, Availability } from '@/lib/use-forgecast';

const FALLBACK_RATIOS = ['1:1', '16:9', '9:16', '4:3'];
const VIDEO_RATIOS = ['9:16', '16:9', '1:1'];

export type ForgeMode = 'image' | 'video' | 'montage';

interface ForgePanelProps {
  mode: ForgeMode;
  setMode: (m: ForgeMode) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  ratio: string;
  setRatio: (v: string) => void;
  onForge: () => void;
  forging: boolean;
  availability: Availability;
  assets: StudioAsset[];
  selectedAssetIds: string[];
  toggleAsset: (id: string) => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
      {children}
    </p>
  );
}

const SEGMENTS: { id: ForgeMode; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'video', label: 'Video' },
  { id: 'montage', label: 'Montage' },
];

function RatioRow({ ratios, ratio, setRatio }: { ratios: string[]; ratio: string; setRatio: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ratios.map((r) => {
        const selected = r === ratio;
        return (
          <button
            key={r}
            onClick={() => setRatio(r)}
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

export function ForgePanel({
  mode, setMode, prompt, setPrompt, model, setModel, ratio, setRatio, onForge, forging,
  availability, assets, selectedAssetIds, toggleAsset,
}: ForgePanelProps) {
  const selectedModel: CatalogModel | undefined = imageModels.find((m) => m.id === model);
  const imageRatios = (selectedModel?.aspectRatios?.length ?? 0) > 0
    ? (selectedModel?.aspectRatios ?? FALLBACK_RATIOS)
    : FALLBACK_RATIOS;

  function segmentAvailable(id: ForgeMode): boolean {
    if (id === 'video') return availability.video;
    if (id === 'montage') return availability.montage;
    return true;
  }

  const missingHint = mode === 'video' && !availability.video
    ? 'video offline · set PIXVERSE_API_KEY'
    : mode === 'montage' && !availability.montage
      ? 'montage offline · set MONTAGE_WORKER_URL'
      : null;

  const canForge =
    !forging &&
    (mode === 'image'
      ? prompt.trim().length > 0
      : mode === 'video'
        ? prompt.trim().length > 0 && availability.video
        : selectedAssetIds.length > 0 && availability.montage);

  const forgeLabel =
    mode === 'video' ? (forging ? '⚒ FORGING…' : '⚒ FORGE CLIP →')
      : mode === 'montage' ? (forging ? '⚒ FORGING…' : '⚒ FORGE MONTAGE →')
        : (forging ? '⚒ FORGING…' : '⚒ FORGE →');

  return (
    <div className="panel p-5 flex flex-col gap-6">
      {/* MODE TOGGLE */}
      <div>
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)]">
          {SEGMENTS.map((seg) => {
            const active = seg.id === mode;
            const available = segmentAvailable(seg.id);
            return (
              <button
                key={seg.id}
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
            <FieldLabel>Prompt</FieldLabel>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A lone anvil glowing in a dark smithy, embers rising into black air…"
              rows={6}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
            />
          </div>

          <div>
            <FieldLabel>Model</FieldLabel>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] text-sm px-3 py-2.5 outline-none appearance-none cursor-pointer focus:border-[var(--ember-2)] transition-colors"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b5e54' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
            >
              {imageModels.map((m) => (
                <option key={m.id} value={m.id} style={{ background: '#221b16', color: '#f5eee6' }}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2 flex items-center gap-2">
              <span className="text-[var(--ember-1)] opacity-70">{model}</span>
              <span className="text-[var(--forge-faint)]">·</span>
              <span>active backend: fal</span>
            </p>
          </div>

          <div>
            <FieldLabel>Ratio</FieldLabel>
            <RatioRow ratios={imageRatios} ratio={ratio} setRatio={setRatio} />
          </div>
        </>
      )}

      {/* VIDEO MODE */}
      {mode === 'video' && (
        <>
          <div>
            <FieldLabel>Prompt</FieldLabel>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Sparks cascading off molten steel as a hammer strikes, slow motion, cinematic…"
              rows={6}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
            />
            <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-2">Pixverse · text→video</p>
          </div>

          <div>
            <FieldLabel>Ratio</FieldLabel>
            <RatioRow ratios={VIDEO_RATIOS} ratio={ratio} setRatio={setRatio} />
          </div>
        </>
      )}

      {/* MONTAGE MODE */}
      {mode === 'montage' && (
        <>
          <div>
            <FieldLabel>Scenes</FieldLabel>
            {assets.length === 0 ? (
              <p className="font-mono text-xs text-[var(--forge-faint)] py-6 text-center">
                generate some assets first
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto pr-1">
                {assets.map((a) => {
                  const selected = selectedAssetIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAsset(a.id)}
                      className="relative aspect-square rounded-md overflow-hidden border transition-all"
                      style={{
                        borderColor: selected ? 'var(--ember-2)' : 'var(--forge-border)',
                        boxShadow: selected ? '0 0 0 2px var(--ember-glow), 0 0 10px var(--ember-glow)' : 'none',
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/assets/${a.id}/raw`}
                        alt={a.params.prompt ?? ''}
                        className="w-full h-full object-cover block bg-black"
                        loading="lazy"
                      />
                      {a.type === 'video' && (
                        <span className="absolute bottom-0.5 left-0.5 text-[10px] leading-none text-[var(--ember-1)]" style={{ textShadow: '0 0 4px #000' }}>▶</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <FieldLabel>Ratio</FieldLabel>
            <RatioRow ratios={VIDEO_RATIOS} ratio={ratio} setRatio={setRatio} />
          </div>

          <p className="font-mono text-[10px] text-[var(--forge-faint)]">
            stitches selected assets into a longer-form video (Remotion)
          </p>
        </>
      )}

      {/* FORGE BUTTON */}
      <button
        onClick={onForge}
        disabled={!canForge}
        className={`btn-forge w-full rounded-lg py-3 text-sm flex items-center justify-center gap-2 ${forging ? 'forging' : ''}`}
      >
        {forgeLabel}
      </button>
    </div>
  );
}
