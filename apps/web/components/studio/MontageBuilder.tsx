'use client';

interface MontageBuilderProps {
  prompts: string[];
  setPrompts: (prompts: string[]) => void;
}

const SCENE_LABELS = ['Scene 1', 'Scene 2', 'Scene 3'];
const SCENE_PLACEHOLDERS = [
  'Molten steel poured into a mold, sparks cascade, extreme close-up, cinematic slow motion…',
  'A blacksmith striking an anvil, embers fly, dark forge environment, dramatic lighting…',
  'The finished piece cooling on stone, glowing orange fading to iron grey, epic reveal shot…',
];

export function MontageBuilder({ prompts, setPrompts }: MontageBuilderProps) {
  function update(index: number, value: string) {
    const next = [...prompts];
    next[index] = value;
    setPrompts(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
        Video Scenes
      </p>
      {SCENE_LABELS.map((label, i) => (
        <div key={i}>
          <label
            htmlFor={`montage-scene-${i}`}
            className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--forge-faint)] mb-1.5"
          >
            {label}
          </label>
          <textarea
            id={`montage-scene-${i}`}
            value={prompts[i] ?? ''}
            onChange={(e) => update(i, e.target.value)}
            placeholder={SCENE_PLACEHOLDERS[i]}
            rows={3}
            className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)]"
          />
        </div>
      ))}
    </div>
  );
}
