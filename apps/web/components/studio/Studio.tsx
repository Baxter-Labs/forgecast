'use client';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { imageModels, videoModels, defaultVideoModelId } from '@forgecast/catalog';
import { toUI, toDoc } from '@/lib/timeline-ui';
import { Palette, Activity } from 'lucide-react';
import { useForgecast } from '@/lib/use-forgecast';
import { useBrandKit, brandKitIsEmpty } from '@/lib/use-brand-kit';
import { BrandKitModal } from './BrandKitModal';
import { KeysModal } from './KeysModal';
import { PerformancePanel } from './PerformancePanel';
import { Header } from './Header';
import { ForgePanel, type ForgeMode, type ShortControls } from './ForgePanel';
import type { TimelineControls } from './TimelineBuilder';
import { CreatePanel } from './CreatePanel';
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
    projectId,
    providers, publishers, availability, pro, assets, status, error,
    refreshAvailability,
    session, signOut,
    generateImage, generateVideo, generateMontage, generateVoiceover, generateShortVideo,
    composeVideo,
    loadTimeline, saveTimeline, renderTimeline,
    publishAsset, generateAdCopy, auditAds, optimizeCreatives, uploadAsset, createFromWebsite,
    agentPlan, agentExecute, agentRun, refreshAssets, awaitAgentJobs, awaitAgenticJobs,
    transcribeAudio,
  } = useForgecast();

  const brand = useBrandKit(projectId);
  const [brandKitOpen, setBrandKitOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);

  const [mode, setMode] = useState<ForgeMode>('image');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(imageModels[0]?.id ?? '');
  const [voiceName, setVoiceName] = useState('');
  const [short, setShort] = useState<ShortControls>({ subtitles: true, count: 1, music: true, voiceName: '' });
  const [boostQuality, setBoostQuality] = useState(false);
  const videoModel = boostQuality ? 'fal-ai/veo3.1/fast' : 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video';
  const [videoImageAssetId, setVideoImageAssetId] = useState<string | null>(null);
  const [ratio, setRatio] = useState('1:1');
  const [montagePrompts, setMontagePrompts] = useState<string[]>(['', '', '']);
  const [timeline, setTimeline] = useState<TimelineControls>({ clips: [], aspect: '9:16', musicAssetId: null });
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [publishingAsset, setPublishingAsset] = useState<StudioAsset | null>(null);
  const [webBuilding, setWebBuilding] = useState(false);

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

  // ── Timeline hydration — pick up the saved arrangement (yours or an agent's) ─
  useEffect(() => {
    if (!projectId) return;
    void loadTimeline().then((t) => {
      if (!t || t.clips.length === 0) return;
      setTimeline(toUI(t));
    });
  }, [projectId, loadTimeline]);

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

  // ── Upload handler ────────────────────────────────────────────────────────────
  function handleUpload(file: File) {
    void uploadAsset(file).then((assetId) => {
      if (assetId && activeCampaignId) appendVideoAssets(activeCampaignId, [assetId]);
    });
  }

  // ── From-website handler (import + generate + enhance) ───────────────────────
  function handleFromWebsite(args: { url: string; generate: boolean; enhance: boolean }) {
    setWebBuilding(true);
    void createFromWebsite(args).then((n) => {
      setWebBuilding(false);
      if (n > 0) setView('gallery');
    });
  }

  // ── Compose handler (Gallery multi-select → montage) ────────────────────────
  async function handleCompose(ids: string[], ar: string, dur: number) {
    const attach = (assetId: string | null | undefined) => {
      if (assetId && activeCampaignId) appendVideoAssets(activeCampaignId, [assetId]);
    };
    const result = await composeVideo({ assetIds: ids, aspectRatio: ar, durationSec: dur });
    attach(result);
  }

  // ── Forge handler ────────────────────────────────────────────────────────────
  // Campaigns are optional organizers: forging always works; results land in the
  // Gallery, and additionally attach to the campaign active at forge time.
  function handleForge() {
    const campaignId = activeCampaignId;
    const attach = (assetId: string | null | undefined) => {
      if (assetId && campaignId) appendVideoAssets(campaignId, [assetId]);
    };
    if (mode === 'image') {
      const { width, height } = ratioToDimensions(ratio);
      void generateImage({ prompt, model, aspectRatio: ratio, width, height }).then(attach);
    } else if (mode === 'video') {
      void generateVideo({ prompt, aspectRatio: ratio, model: videoModel, imageAssetId: videoImageAssetId ?? undefined }).then(attach);
    } else if (mode === 'voice') {
      void generateVoiceover({ text: prompt, voice: voiceName.trim() || undefined }).then(attach);
    } else if (mode === 'short') {
      void generateShortVideo(prompt, {
        aspect: ratio === '9:16' || ratio === '16:9' || ratio === '1:1' ? ratio : '9:16',
        subtitles: short.subtitles,
        count: short.count,
        bgmType: short.music ? 'random' : '',
        voiceName: short.voiceName.trim() || undefined,
      }).then(attach);
    } else if (mode === 'timeline') {
      // Persist the arrangement (so agents see it over MCP), then render it.
      const doc = toDoc(timeline);
      void saveTimeline(doc).then(() => renderTimeline(doc)).then(attach);
    } else {
      void generateMontage({ prompts: montagePrompts, aspectRatio: ratio, model: videoModel }).then(attach);
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col gap-6">
      <Header providers={providers} pro={pro} session={session} onSignOut={signOut} onOpenKeys={() => setKeysOpen(true)} />

      <main aria-label="Forgecast Studio" className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Left: unified Create surface (Idea · Website · Upload) */}
        <section aria-label="Create" className="rise flex flex-col gap-3" style={{ animationDelay: '80ms' }}>
          {/* Brand Kit — grounds every generation */}
          <button
            type="button"
            onClick={() => setBrandKitOpen(true)}
            aria-label="Open Brand Kit"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-colors cursor-pointer hover:border-[var(--ember-2)]"
            style={{ borderColor: brandKitIsEmpty(brand.kit) ? 'var(--forge-border)' : 'var(--ember-2)', background: 'var(--forge-surface-2)' }}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Palette size={14} className="text-[var(--ember-1)] shrink-0" />
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--forge-text)] truncate">
                Brand Kit{brand.kit.name ? <span className="text-[var(--forge-faint)] normal-case tracking-normal"> · {brand.kit.name}</span> : null}
              </span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              {(brand.kit.palette ?? []).slice(0, 4).map((c) => (
                <span key={c} className="w-3 h-3 rounded-sm border border-black/30" style={{ background: c }} />
              ))}
              <span className="font-mono text-[10px] text-[var(--forge-faint)]">{brandKitIsEmpty(brand.kit) ? 'set up' : 'edit'}</span>
            </span>
          </button>

          {/* Ad Performance — audit fatigue + regenerate on-brand */}
          <button
            type="button"
            onClick={() => setPerfOpen(true)}
            aria-label="Open Ad Performance"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-colors cursor-pointer hover:border-[var(--ember-2)]"
            style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
          >
            <span className="flex items-center gap-2 min-w-0">
              <Activity size={14} className="text-[var(--ember-1)] shrink-0" />
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--forge-text)] truncate">Ad Performance</span>
            </span>
            <span className="font-mono text-[10px] text-[var(--forge-faint)] shrink-0">audit &amp; optimize</span>
          </button>

          <CreatePanel
            building={webBuilding}
            imageAvailable={availability.image}
            onBuildFromWebsite={handleFromWebsite}
            onUpload={handleUpload}
            idea={
              <ForgePanel
                mode={mode}
                setMode={setMode}
                prompt={prompt}
                setPrompt={setPrompt}
                model={model}
                setModel={setModel}
                voiceName={voiceName}
                setVoiceName={setVoiceName}
                short={short}
                setShort={setShort}
                boostQuality={boostQuality}
                setBoostQuality={setBoostQuality}
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
                timeline={timeline}
                setTimeline={setTimeline}
                campaigns={campaigns}
                activeCampaignId={activeCampaignId}
                setActiveCampaignId={setActiveCampaignId}
                onCreateCampaign={createManualCampaign}
              />
            }
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
            boostQuality={boostQuality}
            setBoostQuality={setBoostQuality}
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
              <Gallery
                assets={assets}
                onPublish={(asset) => setPublishingAsset(asset)}
                onUpload={handleUpload}
                onCompose={handleCompose}
                montageAvailable={availability.montage}
              />
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
                onGenerateAdCopy={generateAdCopy}
                onClose={() => setPublishingAsset(null)}
              />
            </div>
          )}
        </div>
      </main>

      <BrandKitModal open={brandKitOpen} onClose={() => setBrandKitOpen(false)} brand={brand} />
      <KeysModal open={keysOpen} onClose={() => setKeysOpen(false)} onChanged={() => void refreshAvailability()} />
      <PerformancePanel open={perfOpen} onClose={() => setPerfOpen(false)} onAudit={auditAds} onOptimize={optimizeCreatives} />
    </div>
  );
}
