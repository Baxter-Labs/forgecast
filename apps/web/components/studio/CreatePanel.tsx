'use client';
import { useRef, useState } from 'react';
import { Lightbulb, Globe, Upload, Check } from 'lucide-react';

type Source = 'idea' | 'website' | 'upload';

interface CreatePanelProps {
  /** The existing "From Idea" creator (ForgePanel), rendered as-is. */
  idea: React.ReactNode;
  onBuildFromWebsite: (args: { url: string; generate: boolean; enhance: boolean }) => void;
  building: boolean;
  imageAvailable: boolean;
  onUpload: (file: File) => void;
}

const TABS: { id: Source; label: string; Icon: typeof Lightbulb }[] = [
  { id: 'idea', label: 'Idea', Icon: Lightbulb },
  { id: 'website', label: 'Website', Icon: Globe },
  { id: 'upload', label: 'Upload', Icon: Upload },
];

function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 font-mono text-[11px] text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      style={{ color: checked ? 'var(--forge-text)' : 'var(--forge-faint)' }}
    >
      <span
        className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors"
        style={checked
          ? { background: 'var(--ember-2)', border: '1px solid var(--ember-2)' }
          : { background: 'transparent', border: '1px solid var(--forge-border)' }}
      >
        {checked && <Check size={11} stroke="#1a0c03" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

export function CreatePanel({ idea, onBuildFromWebsite, building, imageAvailable, onUpload }: CreatePanelProps) {
  const [source, setSource] = useState<Source>('idea');
  const [url, setUrl] = useState('');
  const [generate, setGenerate] = useState(true);
  const [enhance, setEnhance] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function emitFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) onUpload(f);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Source switcher */}
      <div
        role="tablist"
        aria-label="What do you want to create from?"
        className="grid grid-cols-3 gap-1 p-1 rounded-xl"
        style={{ background: 'var(--forge-surface-2)', border: '1px solid var(--forge-border)' }}
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = id === source;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setSource(id)}
              className="flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-2 rounded-lg transition-colors cursor-pointer"
              style={active
                ? { background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 12px var(--ember-glow)' }
                : { color: 'var(--forge-faint)' }}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      {source === 'idea' && idea}

      {source === 'website' && (
        <div className="panel p-4 flex flex-col gap-3">
          <label htmlFor="web-url" className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">Product website</label>
          <input
            id="web-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && url.trim() && !building) onBuildFromWebsite({ url: url.trim(), generate, enhance }); }}
            placeholder="https://yourbrand.com"
            className="w-full font-mono text-xs px-3 py-2.5 rounded-lg border bg-transparent outline-none"
            style={{ borderColor: 'var(--forge-border)', color: 'var(--forge-text)', caretColor: 'var(--ember-1)' }}
          />
          <p className="text-[11px] text-[var(--forge-muted)] leading-relaxed">
            We import the product images on the page{generate ? ', generate on-brand options' : ''}{enhance ? ', and sharpen the imports' : ''}.
          </p>
          <div className="flex flex-col gap-2">
            <Toggle label="Generate on-brand images" checked={generate} onChange={setGenerate} disabled={!imageAvailable} />
            <Toggle label="Enhance imported images" checked={enhance} onChange={setEnhance} disabled={!imageAvailable} />
          </div>
          {!imageAvailable && (
            <p className="font-mono text-[10px] text-[var(--forge-faint)]">Set FAL_KEY to also generate &amp; enhance — importing still works.</p>
          )}
          <button
            type="button"
            onClick={() => { if (url.trim()) onBuildFromWebsite({ url: url.trim(), generate, enhance }); }}
            disabled={building || !url.trim()}
            className="btn-forge font-mono text-[12px] uppercase tracking-[0.12em] px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {building ? '⚒ Building…' : '⚒ Build from website →'}
          </button>
        </div>
      )}

      {source === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); emitFiles(e.dataTransfer.files); }}
          className="panel p-8 flex flex-col items-center gap-3 text-center transition-colors"
          style={dragging ? { borderColor: 'var(--ember-2)', boxShadow: '0 0 16px var(--ember-glow)' } : undefined}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            aria-label="Upload product image or clip"
            className="sr-only"
            onChange={(e) => { emitFiles(e.target.files); e.target.value = ''; }}
          />
          <Upload size={26} className="text-[var(--ember-1)]" />
          <p className="text-sm text-[var(--forge-text)]">Drop a product image or clip here</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn-forge font-mono text-[11px] uppercase tracking-[0.12em] px-4 py-2 cursor-pointer"
          >
            Choose file
          </button>
        </div>
      )}
    </div>
  );
}
