import type { StudioAsset } from '@/lib/use-forgecast';

interface AssetCardProps {
  asset: StudioAsset;
  index: number;
}

export function AssetCard({ asset, index }: AssetCardProps) {
  const prompt = asset.params.prompt ?? '';
  const w = asset.params.width ?? 1024;
  const h = asset.params.height ?? 1024;
  const modelId = asset.params.model ?? asset.provider;

  return (
    <div
      className="panel overflow-hidden rise"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/assets/${asset.id}/raw`}
        alt={prompt}
        className="w-full aspect-square object-cover block"
        loading="lazy"
      />

      {/* Caption strip */}
      <div className="bg-[var(--forge-surface-2)] border-t border-[var(--forge-border)] px-3 py-2.5">
        <p className="font-mono text-xs text-[var(--forge-text)] truncate leading-snug mb-1">
          {prompt || '(no prompt)'}
        </p>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--forge-faint)]">
            {w}×{h}
          </span>
          <span className="text-[var(--forge-faint)] text-[10px]">·</span>
          <span className="font-mono text-[10px] text-[var(--forge-faint)] truncate">
            {modelId}
          </span>
        </div>
      </div>
    </div>
  );
}
