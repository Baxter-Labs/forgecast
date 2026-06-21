'use client';
import { useState, useCallback, useMemo, useRef } from 'react';
import { imageModels, videoModels } from '@forgecast/catalog';
import { useForgecast } from '@/lib/use-forgecast';
import { Header } from './Header';
import { ForgePanel, type ForgeMode } from './ForgePanel';
import { AgentChat } from './AgentChat';
import { JobStatus } from './JobStatus';
import { Gallery } from './Gallery';
import { CampaignPanel, type StoredCampaign } from './CampaignPanel';
import { PublishPanel } from './PublishPanel';
import type { ContentPlan } from '@forgecast/agent';
import type { StudioAsset } from '@/lib/use-forgecast';

// ─── Persistence keys ────────────────────────────────────────────────────────
const CAMPAIGNS_KEY = 'forgecast:campaigns';
const LEGACY_KEY = 'forgecast:campaign';

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function loadCampaigns(): StoredCampaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_KEY);
    if (raw) return JSON.parse(raw) as StoredCampaign[];
    // Migrate legacy single-campaign format
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const obj = JSON.parse(legacy) as Omit<StoredCampaign, 'id' | 'createdAt'> & { id?: string; createdAt?: string };
      const migrated: StoredCampaign[] = [{ ...obj, id: obj.id ?? uid(), createdAt: obj.createdAt ?? new Date().toISOString() }];
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY);
      return migrated;
    }
  } catch { /* ignore */ }
  return [];
}

// ─── Dimension helper ─────────────────────────────────────────────────────────
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

// ─── View toggle ──────────────────────────────────────────────────────────────
type View = 'gallery' | 'history';

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <div
      className="flex rounded-lg p-1 gap-1 mb-4"
      style={{ background: 'var(--forge-surface-2)', border: '1px solid var(--forge-border)' }}
    >
      {(['history', 'gallery'] as View[]).map((tab) => {
        const active = view === tab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className="flex-1 font-mono text-[11px] uppercase tracking-[0.12em] py-2 rounded-md border transition-all duration-200"
            style={active ? {
              borderColor: 'var(--ember-2)',
              color: 'var(--ember-1)',
              background: 'rgba(255,122,26,0.08)',
              boxShadow: '0 0 12px var(--ember-glow)',
            } : {
              borderColor: 'transparent',
              color: 'var(--forge-faint)',
              background: 'transparent',
            }}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}

// ─── Studio ───────────────────────────────────────────────────────────────────
export function Studio() {
  const {
    providers, publishers, availability, pro, assets, status, error,
    generateImage, generateVideo, generateMontage,
    publishAsset,
    agentPlan, agentExecute, agentRun, refreshAssets, awaitAgentJobs, awaitAgenticJobs,
    transcribeAudio,
  } = useForgecast();

  const [mode, setMode] = useState<ForgeMode>('image');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(imageModels[0]?.id ?? '');
  const [videoModel, setVideoModel] = useState(videoModels[0]?.id ?? '');
  const [videoImageAssetId, setVideoImageAssetId] = useState<string | null>(null);
  const [ratio, setRatio] = useState('1:1');
  const [montagePrompts, setMontagePrompts] = useState<string[]>(['', '', '']);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [publishingAsset, setPublishingAsset] = useState<StudioAsset | null>(null);

  // Campaign history
  const [campaigns, setCampaigns] = useState<StoredCampaign[]>(() =>
    typeof window !== 'undefined' ? loadCampaigns() : [],
  );
  const [view, setView] = useState<View>('history');
  // Tracks the most recently created campaign so async video jobs can be
  // appended to it once they resolve (agent campaigns fire onCampaignExecuted
  // before video jobs start, so the ref is always set by the time they finish).
  const latestCampaignIdRef = useRef<string | null>(null);

  // ── Derive maps ─────────────────────────────────────────────────────────────
  const assetById = useMemo(
    () => new Map(assets.map((a) => [a.id, a])),
    [assets],
  );

  // ── Campaign handlers ────────────────────────────────────────────────────────
  const addCampaign = useCallback((c: { brief: string; platforms: string[]; plan: ContentPlan; assetIds: string[] }) => {
    const id = uid();
    const entry: StoredCampaign = {
      id,
      brief: c.brief,
      platforms: c.platforms,
      plan: c.plan,
      assetIds: c.assetIds,
      createdAt: new Date().toISOString(),
    };
    setCampaigns((prev) => {
      const next = [entry, ...prev];
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(next));
      return next;
    });
    latestCampaignIdRef.current = id;
    setView('history');
  }, []);

  const appendVideoAssets = useCallback((campaignId: string, newAssetIds: string[]) => {
    if (!newAssetIds.length) return;
    setCampaigns((prev) => {
      const next = prev.map((c) =>
        c.id === campaignId
          ? { ...c, assetIds: [...new Set([...c.assetIds, ...newAssetIds])] }
          : c,
      );
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeCampaign = useCallback((id: string) => {
    setCampaigns((prev) => {
      const next = prev.filter((c) => c.id !== id);
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Manual campaign creation (from ForgePanel "+" button) ───────────────────
  const createManualCampaign = useCallback((name: string) => {
    const id = uid();
    const entry: StoredCampaign = {
      id,
      brief: name,
      platforms: [],
      plan: { concept: name, assets: [], posts: [] },
      assetIds: [],
      createdAt: new Date().toISOString(),
    };
    setCampaigns((prev) => {
      const next = [entry, ...prev];
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(next));
      return next;
    });
    setActiveCampaignId(id);
    setView('history');
  }, []);

  // ── Forge handler ────────────────────────────────────────────────────────────
  function handleForge() {
    if (!activeCampaignId) return;
    const attach = (assetId: string | null | undefined) => {
      if (assetId) appendVideoAssets(activeCampaignId, [assetId]);
    };
    if (mode === 'image') {
      const { width, height } = ratioToDimensions(ratio);
      void generateImage({ prompt, model, width, height }).then(attach);
    } else if (mode === 'video') {
      void generateVideo({ prompt, aspectRatio: ratio, model: videoModel, imageAssetId: videoImageAssetId ?? undefined }).then(attach);
    } else {
      void generateMontage({ prompts: montagePrompts, aspectRatio: ratio, model: videoModel }).then(attach);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col gap-6">
      <Header providers={providers} pro={pro} />

      <main aria-label="Forgecast Studio" className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Left: Forge panel */}
        <section aria-label="Create" className="rise" style={{ animationDelay: '80ms' }}>
          <ForgePanel
            mode={mode}
            setMode={setMode}
            prompt={prompt}
            setPrompt={setPrompt}
            model={model}
            setModel={setModel}
            videoModel={videoModel}
            setVideoModel={setVideoModel}
            videoImageAssetId={videoImageAssetId}
            setVideoImageAssetId={setVideoImageAssetId}
            ratio={ratio}
            setRatio={setRatio}
            onForge={handleForge}
            forging={status === 'forging'}
            availability={availability}
            assets={assets}
            montagePrompts={montagePrompts}
            setMontagePrompts={setMontagePrompts}
            campaigns={campaigns}
            activeCampaignId={activeCampaignId}
            setActiveCampaignId={setActiveCampaignId}
            onCreateCampaign={createManualCampaign}
          />
        </section>

        {/* Right: Agent + Status + Gallery/History */}
        <div className="rise flex flex-col min-w-0 overflow-x-hidden" style={{ animationDelay: '160ms' }}>
          <AgentChat
            agentPlan={agentPlan}
            agentExecute={agentExecute}
            agentRun={agentRun}
            onExecuted={(result) => {
              void refreshAssets();
              void awaitAgentJobs(result).then((videoAssetIds) => {
                const campId = latestCampaignIdRef.current;
                if (campId) appendVideoAssets(campId, videoAssetIds);
              });
            }}
            onAgenticDone={(r) => {
              void refreshAssets();
              void awaitAgenticJobs(r);
            }}
            onCampaignExecuted={addCampaign}
            transcribeAudio={transcribeAudio}
            voiceInputAvailable={availability.transcribe}
          />
          <JobStatus status={status} error={error} />

          {/* View toggle */}
          <ViewToggle view={view} onChange={setView} />

          {/* Sliding panel — inactive pane is absolute (no flow width); active pane
              is relative with explicit width:100% so content can't push it wider */}
          <div className="relative overflow-hidden">
            {/* Gallery pane */}
            <div
              style={view === 'gallery'
                ? { position: 'relative', width: '100%', transition: 'transform 300ms ease, opacity 300ms ease', transform: 'translateX(0)', opacity: 1 }
                : { position: 'absolute', inset: 0, transition: 'transform 300ms ease, opacity 300ms ease', transform: 'translateX(-105%)', opacity: 0, pointerEvents: 'none' }}
            >
              <Gallery assets={assets} onPublish={(asset) => setPublishingAsset(asset)} />
            </div>

            {/* History pane */}
            <div
              style={view === 'history'
                ? { position: 'relative', width: '100%', minWidth: 0, transition: 'transform 300ms ease, opacity 300ms ease', transform: 'translateX(0)', opacity: 1 }
                : { position: 'absolute', inset: 0, transition: 'transform 300ms ease, opacity 300ms ease', transform: 'translateX(105%)', opacity: 0, pointerEvents: 'none' }}
              className="flex flex-col gap-4"
            >
              {campaigns.length === 0 ? (
                <div className="panel p-10 flex flex-col items-center gap-3 text-center">
                  <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">No campaigns yet</p>
                  <p className="text-xs text-[var(--forge-muted)] max-w-[240px] leading-relaxed">
                    Use the Agent to plan and execute a campaign — it will appear here.
                  </p>
                </div>
              ) : (
                campaigns.map((c) => (
                  <CampaignPanel
                    key={c.id}
                    campaign={c}
                    assets={c.assetIds.map((id) => assetById.get(id)).filter((a): a is NonNullable<typeof a> => a != null)}
                    onRemove={() => removeCampaign(c.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Publish panel — slides in when user clicks Cast on an asset */}
          {publishingAsset && (
            <div className="rise mt-4" style={{ animationDelay: '0ms' }}>
              <PublishPanel
                asset={publishingAsset}
                publishers={publishers}
                onPublish={publishAsset}
                onClose={() => setPublishingAsset(null)}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
