'use client';
import { useState } from 'react';
import { Sparkles, ChevronDown } from 'lucide-react';
import type { ContentPlan, ExecutionResult } from '@forgecast/agent';

interface AgentChatProps {
  agentPlan: (brief: string, platforms: string[]) => Promise<{ plan?: unknown; error?: string }>;
  agentExecute: (plan: unknown, opts?: { projectName?: string; publish?: boolean }) => Promise<{ result?: unknown; error?: string }>;
  onExecuted: (result: ExecutionResult) => void;
}

type Phase = 'idle' | 'planning' | 'planned' | 'executing' | 'done' | 'error';

const PLATFORMS = ['instagram', 'linkedin', 'youtube', 'tiktok'];

function isAgentOffline(err: string): boolean {
  const e = err.toLowerCase();
  return e.includes('openai') || e.includes('agent');
}

export function AgentChat({ agentPlan, agentExecute, onExecuted }: AgentChatProps) {
  const [open, setOpen] = useState(true);
  const [brief, setBrief] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['instagram']);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function runPlan() {
    if (!brief.trim()) return;
    setPhase('planning'); setError(null); setPlan(null); setResult(null);
    const res = await agentPlan(brief, platforms.length ? platforms : ['instagram']);
    if (res.error || !res.plan) {
      setError(res.error ?? 'Planning failed'); setPhase('error'); return;
    }
    setPlan(res.plan as ContentPlan); setPhase('planned');
  }

  async function runExecute() {
    if (!plan) return;
    setPhase('executing'); setError(null);
    const res = await agentExecute(plan);
    if (res.error || !res.result) {
      setError(res.error ?? 'Execution failed'); setPhase('error'); return;
    }
    const execResult = res.result as ExecutionResult;
    setResult(execResult);
    setPhase('done');
    onExecuted(execResult);
  }

  const offline = phase === 'error' && error != null && isAgentOffline(error);

  return (
    <div className="panel p-5 mb-6">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="grid place-items-center w-6 h-6 rounded-md"
            style={{ background: 'var(--molten)', color: '#1a0c03', boxShadow: '0 0 12px var(--ember-glow)' }}
          >
            <Sparkles size={14} strokeWidth={2.2} />
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--forge-text)]">
            Agent · <span className="text-[var(--forge-muted)]">speak it, forge it, cast it</span>
          </span>
        </div>
        <ChevronDown
          size={16}
          className="text-[var(--forge-faint)] transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Brief */}
          <div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Make a 15s teaser for an eco-friendly sneaker drop…"
              rows={3}
              disabled={phase === 'planning' || phase === 'executing'}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)] disabled:opacity-60"
            />
          </div>

          {/* Platform chips */}
          <div className="flex flex-wrap items-center gap-2">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className="font-mono text-[11px] px-2.5 py-1 rounded-full border transition-all lowercase"
                  style={on ? {
                    borderColor: 'var(--ember-2)',
                    color: 'var(--ember-1)',
                    boxShadow: '0 0 10px var(--ember-glow)',
                    background: 'rgba(255,122,26,0.06)',
                  } : {
                    borderColor: 'var(--forge-border)',
                    color: 'var(--forge-faint)',
                    background: 'transparent',
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* PLAN button */}
          <button
            onClick={runPlan}
            disabled={!brief.trim() || phase === 'planning' || phase === 'executing'}
            className={`btn-forge rounded-lg py-2.5 px-5 text-xs self-start ${phase === 'planning' ? 'forging' : ''}`}
          >
            {phase === 'planning' ? '⚒ PLANNING…' : 'PLAN'}
          </button>

          {/* Planning heatbar */}
          {phase === 'planning' && (
            <div className="flex items-center gap-3">
              <div className="heatbar h-2 flex-1">
                <span className="forging" style={{ width: '48%' }} />
              </div>
              <p className="font-mono text-xs text-[var(--ember-1)] shrink-0 forging">PLANNING…</p>
            </div>
          )}

          {/* Offline / error notice */}
          {phase === 'error' && (
            <div className="panel p-3" style={{ borderColor: 'rgba(229, 51, 27, 0.4)' }}>
              <p className="font-mono text-xs text-[var(--forge-muted)]">
                {offline ? 'Agent offline — set OPENAI_API_KEY to plan.' : error}
              </p>
            </div>
          )}

          {/* PLAN render */}
          {plan && (phase === 'planned' || phase === 'executing' || phase === 'done') && (
            <div className="flex flex-col gap-4 rise">
              {/* Concept */}
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-1">Concept</p>
                <p className="text-sm text-[var(--forge-text)] leading-relaxed">{plan.concept}</p>
              </div>

              {/* Trending notes */}
              {plan.trendingNotes && (
                <div
                  className="rounded-lg px-3 py-2 border"
                  style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ember-1)] opacity-80 mb-1">Trend</p>
                  <p className="text-xs italic text-[var(--forge-muted)] leading-relaxed">{plan.trendingNotes}</p>
                </div>
              )}

              {/* Assets */}
              {plan.assets.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">Assets</p>
                  <div className="flex flex-col gap-1.5">
                    {plan.assets.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-md px-2.5 py-1.5 border"
                        style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
                      >
                        <span
                          className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0"
                          style={{ color: 'var(--ember-1)', border: '1px solid var(--ember-2)' }}
                        >
                          {a.kind}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--forge-muted)] truncate">{a.prompt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Posts */}
              {plan.posts.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-2">Captions</p>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {plan.posts.map((post, i) => (
                      <div
                        key={i}
                        className="rounded-lg px-3 py-2 border"
                        style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ember-1)] opacity-80 mb-1">{post.platform}</p>
                        <p className="text-xs text-[var(--forge-text)] leading-relaxed">{post.caption}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EXECUTE button */}
              {phase !== 'done' && (
                <button
                  onClick={runExecute}
                  disabled={phase === 'executing'}
                  className={`btn-forge rounded-lg py-2.5 px-5 text-xs self-start ${phase === 'executing' ? 'forging' : ''}`}
                >
                  {phase === 'executing' ? '⚒ EXECUTING…' : 'APPROVE & EXECUTE ⚒'}
                </button>
              )}

              {phase === 'executing' && (
                <div className="flex items-center gap-3">
                  <div className="heatbar h-2 flex-1">
                    <span className="forging" style={{ width: '64%' }} />
                  </div>
                  <p className="font-mono text-xs text-[var(--ember-1)] shrink-0 forging">EXECUTING…</p>
                </div>
              )}

              {/* Result */}
              {phase === 'done' && result && (
                <div
                  className="rounded-lg px-3 py-2.5 border rise"
                  style={{ borderColor: 'var(--ember-2)', background: 'rgba(255,122,26,0.06)' }}
                >
                  <p className="font-mono text-xs text-[var(--ember-1)]">
                    forged {result.assetIds.length} asset{result.assetIds.length === 1 ? '' : 's'}
                    {' · '}{result.videoJobIds.length} video job{result.videoJobIds.length === 1 ? '' : 's'}
                    {result.montageJobId ? ' · montage ⚒' : ''}
                    {' · '}published {result.published ? '✓' : '—'}
                  </p>
                  {(result.videoJobIds.length > 0 || result.montageJobId) && (
                    <p className="font-mono text-[10px] text-[var(--forge-faint)] mt-1.5 forging">
                      rendering video — appears in the gallery when ready…
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
