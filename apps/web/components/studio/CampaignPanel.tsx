'use client';
import { useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import type { ContentPlan } from '@forgecast/agent';
import type { StudioAsset } from '@/lib/use-forgecast';
import { AssetCard } from './AssetCard';
import { ConfirmDialog } from './ConfirmDialog';

export interface StoredCampaign {
  id: string;
  brief: string;
  platforms: string[];
  plan: ContentPlan;
  assetIds: string[];
  createdAt: string;
}

interface CampaignPanelProps {
  campaign: StoredCampaign;
  assets: StudioAsset[];
  onRemove: () => void;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-1.5">
      {children}
    </p>
  );
}

export function CampaignPanel({ campaign, assets, onRemove }: CampaignPanelProps) {
  const [open, setOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const { brief, plan } = campaign;

  return (
    <div className="panel p-5 overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 flex-1 text-left min-w-0"
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] shrink-0">Campaign</span>
          <span className="text-[var(--forge-border)] shrink-0">·</span>
          <span className="font-mono text-xs text-[var(--forge-muted)] truncate min-w-0">{brief}</span>
          <ChevronDown
            size={14}
            className="text-[var(--forge-faint)] transition-transform shrink-0 ml-1"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </button>
        <button
          onClick={() => setConfirming(true)}
          title="Delete campaign"
          aria-label="Delete campaign"
          className="tap-target ml-3 rounded text-[var(--forge-faint)] hover:text-[var(--ember-3)] hover:bg-[var(--forge-surface-2)] transition-colors shrink-0"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete campaign?"
          description={`"${brief}" and all its associated media will be removed from your view.`}
          confirmLabel="Delete"
          onConfirm={() => { setConfirming(false); onRemove(); }}
          onCancel={() => setConfirming(false)}
        />
      )}

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Concept */}
          <div>
            <FieldLabel>Concept</FieldLabel>
            <p className="text-sm text-[var(--forge-text)] leading-relaxed">{plan.concept}</p>
          </div>

          {/* Trend */}
          {plan.trendingNotes && (
            <div className="rounded-lg px-3 py-2.5 border" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}>
              <FieldLabel>Trend</FieldLabel>
              <p className="text-xs italic text-[var(--forge-muted)] leading-relaxed">{plan.trendingNotes}</p>
            </div>
          )}

          {/* Asset prompts */}
          {plan.assets.length > 0 && (
            <div>
              <FieldLabel>Prompts</FieldLabel>
              <div className="flex flex-col gap-1.5">
                {plan.assets.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md px-2.5 py-1.5 border" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}>
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 mt-px" style={{ color: 'var(--ember-1)', border: '1px solid var(--ember-2)' }}>
                      {a.kind}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--forge-muted)] leading-relaxed" style={{ overflowWrap: 'break-word', minWidth: 0 }}>{a.prompt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Platform captions */}
          {plan.posts.length > 0 && (
            <div>
              <FieldLabel>Captions</FieldLabel>
              <div className="grid sm:grid-cols-2 gap-2">
                {plan.posts.map((post, i) => (
                  <div key={i} className="rounded-lg px-3 py-2.5 border" style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ember-1)] opacity-80 mb-1.5">{post.platform}</p>
                    <p className="text-xs text-[var(--forge-text)] leading-relaxed">{post.caption}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Media */}
          {assets.length > 0 && (
            <div className="border-t border-[var(--forge-border)] pt-4">
              <FieldLabel>Media ({assets.length})</FieldLabel>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                {assets.map((asset, i) => (
                  <AssetCard key={asset.id} asset={asset} index={i} compact />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
