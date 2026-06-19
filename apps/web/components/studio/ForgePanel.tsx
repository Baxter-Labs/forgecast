import type { CatalogModel } from '@forgecast/catalog';
import { imageModels } from '@forgecast/catalog';

const FALLBACK_RATIOS = ['1:1', '16:9', '9:16', '4:3'];

interface ForgePanelProps {
  prompt: string;
  setPrompt: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  ratio: string;
  setRatio: (v: string) => void;
  onForge: () => void;
  forging: boolean;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">
      {children}
    </p>
  );
}

export function ForgePanel({
  prompt, setPrompt, model, setModel, ratio, setRatio, onForge, forging,
}: ForgePanelProps) {
  const selectedModel: CatalogModel | undefined = imageModels.find((m) => m.id === model);
  const ratios = (selectedModel?.aspectRatios?.length ?? 0) > 0
    ? (selectedModel?.aspectRatios ?? FALLBACK_RATIOS)
    : FALLBACK_RATIOS;

  return (
    <div className="panel p-5 flex flex-col gap-6">
      {/* PROMPT */}
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

      {/* MODEL */}
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

      {/* RATIO */}
      <div>
        <FieldLabel>Ratio</FieldLabel>
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
      </div>

      {/* FORGE BUTTON */}
      <button
        onClick={onForge}
        disabled={!prompt.trim() || forging}
        className={`btn-forge w-full rounded-lg py-3 text-sm flex items-center justify-center gap-2 ${forging ? 'forging' : ''}`}
      >
        {forging ? '⚒ FORGING…' : '⚒ FORGE →'}
      </button>
    </div>
  );
}
