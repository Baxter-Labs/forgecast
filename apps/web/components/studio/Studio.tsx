'use client';
import { useState } from 'react';
import { imageModels } from '@forgecast/catalog';
import { useForgecast } from '@/lib/use-forgecast';
import { Header } from './Header';
import { ForgePanel, type ForgeMode } from './ForgePanel';
import { AgentChat } from './AgentChat';
import { JobStatus } from './JobStatus';
import { Gallery } from './Gallery';

function ratioToDimensions(ratio: string): { width: number; height: number } {
  const map: Record<string, { width: number; height: number }> = {
    '1:1':  { width: 1024, height: 1024 },
    '16:9': { width: 1024, height: 576 },
    '9:16': { width: 576,  height: 1024 },
    '4:3':  { width: 1024, height: 768 },
    '3:4':  { width: 768,  height: 1024 },
  };
  return map[ratio] ?? { width: 1024, height: 1024 };
}

export function Studio() {
  const {
    providers, availability, pro, assets, status, error,
    generateImage, generateVideo, generateMontage,
    agentPlan, agentExecute, refreshAssets,
  } = useForgecast();

  const [mode, setMode] = useState<ForgeMode>('image');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(imageModels[0]?.id ?? '');
  const [ratio, setRatio] = useState('1:1');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  function toggleAsset(id: string) {
    setSelectedAssetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleForge() {
    if (mode === 'image') {
      const { width, height } = ratioToDimensions(ratio);
      void generateImage({ prompt, model, width, height });
    } else if (mode === 'video') {
      void generateVideo({ prompt, aspectRatio: ratio });
    } else {
      void generateMontage({ assetIds: selectedAssetIds, aspectRatio: ratio });
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col gap-6">
      <Header providers={providers} pro={pro} />

      <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Left: Forge panel */}
        <div className="rise" style={{ animationDelay: '80ms' }}>
          <ForgePanel
            mode={mode}
            setMode={setMode}
            prompt={prompt}
            setPrompt={setPrompt}
            model={model}
            setModel={setModel}
            ratio={ratio}
            setRatio={setRatio}
            onForge={handleForge}
            forging={status === 'forging'}
            availability={availability}
            assets={assets}
            selectedAssetIds={selectedAssetIds}
            toggleAsset={toggleAsset}
          />
        </div>

        {/* Right: Agent + Status + Gallery */}
        <div className="rise flex flex-col" style={{ animationDelay: '160ms' }}>
          <AgentChat
            agentPlan={agentPlan}
            agentExecute={agentExecute}
            onExecuted={() => void refreshAssets()}
          />
          <JobStatus status={status} error={error} />
          <Gallery assets={assets} />
        </div>
      </div>
    </div>
  );
}
