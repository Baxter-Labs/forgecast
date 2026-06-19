'use client';
import { useState } from 'react';
import { imageModels } from '@forgecast/catalog';
import { useForgecast } from '@/lib/use-forgecast';
import { Header } from './Header';
import { ForgePanel } from './ForgePanel';
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
  const { providers, assets, status, error, generate } = useForgecast();
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(imageModels[0]?.id ?? '');
  const [ratio, setRatio] = useState('1:1');

  function handleForge() {
    const { width, height } = ratioToDimensions(ratio);
    void generate({ prompt, model, width, height });
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col gap-6">
      <Header providers={providers} />

      <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Left: Forge panel */}
        <div className="rise" style={{ animationDelay: '80ms' }}>
          <ForgePanel
            prompt={prompt}
            setPrompt={setPrompt}
            model={model}
            setModel={setModel}
            ratio={ratio}
            setRatio={setRatio}
            onForge={handleForge}
            forging={status === 'forging'}
          />
        </div>

        {/* Right: Status + Gallery */}
        <div className="rise flex flex-col" style={{ animationDelay: '160ms' }}>
          <JobStatus status={status} error={error} />
          <Gallery assets={assets} />
        </div>
      </div>
    </div>
  );
}
