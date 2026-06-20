import type { StudioAsset } from '@/lib/use-forgecast';

interface AssetCardProps {
  asset: StudioAsset;
  index: number;
}

export function AssetCard({ asset, index }: AssetCardProps) {
  const prompt = asset.params.prompt ?? '';
  const isVideo = asset.type === 'video';
  const w = asset.params.width;
  const h = asset.params.height;
  const modelId = asset.params.model ?? asset.provider;
  const ar = asset.params.aspectRatio;
  const videoTag = asset.provider === 'remotion' ? 'MONTAGE' : 'VIDEO';

  // Image assets carry pixel dims; video assets may only carry an aspect ratio.
  const dims = w && h ? `${w}×${h}` : ar ? ar : null;

  const mediaLabel = prompt
    ? `${isVideo ? 'Generated video' : 'Generated image'}: ${prompt}`
    : isVideo ? 'Generated video' : 'Generated image';

  return (
    <div
      className="panel overflow-hidden rise"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Media */}
      <div className="relative">
        {isVideo ? (
          <video
            src={`/api/assets/${asset.id}/raw`}
            controls
            muted
            loop
            playsInline
            aria-label={mediaLabel}
            className="w-full aspect-square object-cover block bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/assets/${asset.id}/raw`}
            alt={mediaLabel}
            className="w-full aspect-square object-cover block"
            loading="lazy"
          />
        )}
        {isVideo && (
          <span
            aria-hidden="true"
            className="absolute top-2 left-2 font-mono text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded"
            style={{ background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 10px var(--ember-glow)' }}
          >
            {videoTag}
          </span>
        )}
      </div>

      {/* Caption strip */}
      <div className="bg-[var(--forge-surface-2)] border-t border-[var(--forge-border)] px-3 py-2.5">
        <p className="font-mono text-xs text-[var(--forge-text)] truncate leading-snug mb-1">
          {prompt || '(no prompt)'}
        </p>
        <div className="flex items-center gap-2">
          {dims && (
            <>
              <span className="font-mono text-[10px] text-[var(--forge-faint)]">{dims}</span>
              <span className="text-[var(--forge-faint)] text-[10px]">·</span>
            </>
          )}
          <span className="font-mono text-[10px] text-[var(--forge-faint)] truncate">
            {modelId}
          </span>
        </div>
      </div>
    </div>
  );
}
