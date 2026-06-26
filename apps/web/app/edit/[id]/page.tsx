import { AssetEditor } from '@/components/editor/AssetEditor';

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssetEditor assetId={id} />;
}
