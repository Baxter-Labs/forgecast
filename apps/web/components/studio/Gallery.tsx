import type { StudioAsset } from '@/lib/use-forgecast';
import { AssetCard } from './AssetCard';
import { EmptyState } from './EmptyState';

interface GalleryProps {
  assets: StudioAsset[];
}

export function Gallery({ assets }: GalleryProps) {
  if (assets.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
      {assets.map((asset, i) => (
        <AssetCard key={asset.id} asset={asset} index={i} />
      ))}
    </div>
  );
}
