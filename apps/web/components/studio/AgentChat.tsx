'use client';
import { useState, useRef } from 'react';
import { Sparkles, ChevronDown, Mic, MicOff } from 'lucide-react';
import type { ContentPlan, ExecutionResult } from '@forgecast/agent';

interface AgentChatProps {
  agentPlan: (brief: string, platforms: string[]) => Promise<{ plan?: unknown; error?: string }>;
  agentExecute: (plan: unknown, opts?: { projectName?: string; publish?: boolean }) => Promise<{ result?: unknown; error?: string }>;
  onExecuted: (result: ExecutionResult) => void;
  onCampaignExecuted: (c: { brief: string; platforms: string[]; plan: ContentPlan; assetIds: string[] }) => void;
  transcribeAudio: (blob: Blob) => Promise<string | null>;
  voiceInputAvailable: boolean;
}

type Phase = 'idle' | 'planning' | 'planned' | 'executing' | 'done' | 'error';

const PLATFORMS = ['instagram', 'linkedin', 'youtube', 'tiktok'];

function isAgentOffline(err: string): boolean {
  const e = err.toLowerCase();
  return e.includes('openai') || e.includes('agent');
}

export function AgentChat({ agentPlan, agentExecute, onExecuted, onCampaignExecuted, transcribeAudio, voiceInputAvailable }: AgentChatProps) {
  const [open, setOpen] = useState(true);
  const [brief, setBrief] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['instagram']);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  // Voice input state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const srRef = useRef<{ stop(): void; onend: (() => void) | null; onerror: (() => void) | null } | null>(null);

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
    // Campaign must be created before onExecuted starts background job polling,
    // so Studio can attach the resolved video asset IDs to the right entry.
    onCampaignExecuted({ brief, platforms, plan, assetIds: execResult.assetIds ?? [] });
    onExecuted(execResult);
  }

  async function handleMicClick() {
    if (transcribing) return;

    // ── STOP ───────────────────────────────────────────────────────────────────
    if (recording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      } else if (srRef.current) {
        srRef.current.stop();
        srRef.current = null;
        setRecording(false);
      }
      return;
    }

    setVoiceHint(null);

    // ── START — Wispr Flow path ────────────────────────────────────────────────
    if (voiceInputAvailable && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunksRef.current = [];
        const rec = new MediaRecorder(stream);
        mediaRecorderRef.current = rec;

        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        rec.onstop = async () => {
          setRecording(false);
          // Stop all tracks so the mic indicator disappears.
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: rec.mimeType });
          chunksRef.current = [];
          mediaRecorderRef.current = null;
          setTranscribing(true);
          const text = await transcribeAudio(blob);
          setTranscribing(false);
          if (text) {
            setBrief((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
          }
        };

        rec.start();
        setRecording(true);
      } catch (err) {
        console.error('mic error:', err);
        setVoiceHint('Microphone access denied.');
      }
      return;
    }

    // ── START — Web Speech API fallback ────────────────────────────────────────
    type SRCtor = new () => {
      continuous: boolean;
      interimResults: boolean;
      start(): void;
      stop(): void;
      onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
      onend: (() => void) | null;
      onerror: (() => void) | null;
    };
    const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined;
    const SR: SRCtor | undefined =
      (win?.['SpeechRecognition'] as SRCtor | undefined) ??
      (win?.['webkitSpeechRecognition'] as SRCtor | undefined);

    if (SR) {
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = false;
      srRef.current = recognition;

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
        if (transcript) {
          setBrief((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        }
      };
      recognition.onend = () => {
        srRef.current = null;
        setRecording(false);
      };
      recognition.onerror = () => {
        srRef.current = null;
        setRecording(false);
      };

      recognition.start();
      setRecording(true);
      return;
    }

    // ── No voice path available ────────────────────────────────────────────────
    setVoiceHint('Voice input needs WISPRFLOW_API_KEY (or a Chromium browser)');
    setTimeout(() => setVoiceHint(null), 4000);
  }

  const offline = phase === 'error' && error != null && isAgentOffline(error);

  return (
    <div className="panel p-5 mb-6">
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
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
          <div className="relative">
            <label htmlFor="agent-brief" className="sr-only">Creative brief</label>
            <textarea
              id="agent-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Make a 15s teaser for an eco-friendly sneaker drop…"
              rows={3}
              disabled={phase === 'planning' || phase === 'executing'}
              className="w-full resize-none rounded-lg bg-[var(--forge-surface-2)] border border-[var(--forge-border)] text-[var(--forge-text)] placeholder:text-[var(--forge-faint)] text-sm leading-relaxed px-4 py-3 pr-12 outline-none transition-all focus:border-[var(--ember-2)] focus:shadow-[0_0_0_3px_rgba(255,122,26,0.15)] disabled:opacity-60"
            />
            {/* Mic button — top-right corner of textarea */}
            <button
              type="button"
              onClick={handleMicClick}
              disabled={transcribing || phase === 'planning' || phase === 'executing'}
              aria-label={recording ? 'Stop recording' : 'Record voice input'}
              className="absolute top-2 right-2 grid place-items-center w-7 h-7 rounded-md border transition-all disabled:opacity-40"
              style={recording ? {
                borderColor: 'var(--ember-2)',
                color: 'var(--ember-1)',
                background: 'rgba(255,122,26,0.12)',
                boxShadow: '0 0 10px var(--ember-glow)',
                animation: 'pulse 1.4s ease-in-out infinite',
              } : {
                borderColor: 'var(--forge-border)',
                color: 'var(--forge-faint)',
                background: 'transparent',
              }}
            >
              {recording ? <MicOff size={14} strokeWidth={2} /> : <Mic size={14} strokeWidth={2} />}
            </button>
          </div>

          {/* Transcribing indicator */}
          {transcribing && (
            <p className="font-mono text-[10px] text-[var(--ember-1)] tracking-[0.12em] forging">
              transcribing…
            </p>
          )}

          {/* Voice hint (no-key / permission-denied notice) */}
          {voiceHint && !transcribing && (
            <p className="font-mono text-[10px] text-[var(--forge-muted)] tracking-[0.1em]">{voiceHint}</p>
          )}

          {/* Platform chips */}
          <div role="group" aria-label="Target platforms" className="flex flex-wrap items-center gap-2">
            {PLATFORMS.map((p) => {
              const on = platforms.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  aria-pressed={on}
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
            type="button"
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
                  className="rounded-lg px-3 py-2.5 border"
                  style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)] mb-1">Trend</p>
                  <p className="text-xs italic text-[var(--forge-muted)] leading-relaxed">{plan.trendingNotes}</p>
                </div>
              )}

              {/* Asset list */}
              {plan.assets.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">Assets</p>
                  {plan.assets.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md px-2.5 py-1.5 border"
                      style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
                    >
                      <span
                        className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 mt-px"
                        style={{ color: 'var(--ember-1)', border: '1px solid var(--ember-2)' }}
                      >
                        {a.kind}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--forge-muted)] leading-relaxed">{a.prompt}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Montage plan */}
              {plan.montage && plan.montage.scenes.length >= 2 && (
                <div className="flex flex-col gap-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--forge-faint)]">
                    Montage · {plan.montage.scenes.length} clips → stitched video
                  </p>
                  {plan.montage.scenes.map((scene, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md px-2.5 py-1.5 border"
                      style={{ borderColor: 'var(--ember-2)', background: 'rgba(255,122,26,0.04)' }}
                    >
                      <span
                        className="font-mono text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded shrink-0 mt-px"
                        style={{ color: 'var(--ember-1)', border: '1px solid var(--ember-2)' }}
                      >
                        clip {i + 1}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--forge-muted)] leading-relaxed">{scene.prompt}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Post captions */}
              {plan.posts.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-2">
                  {plan.posts.map((post, i) => (
                    <div
                      key={i}
                      className="rounded-lg px-3 py-2.5 border"
                      style={{ borderColor: 'var(--forge-border)', background: 'var(--forge-surface-2)' }}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ember-1)] opacity-80 mb-1.5">{post.platform}</p>
                      <p className="text-xs text-[var(--forge-text)] leading-relaxed">{post.caption}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* EXECUTE button */}
              {phase === 'planned' && (
                <button
                  type="button"
                  onClick={runExecute}
                  className="btn-forge rounded-lg py-2.5 px-5 text-xs self-start"
                >
                  EXECUTE →
                </button>
              )}

              {/* Executing heatbar */}
              {phase === 'executing' && (
                <div className="flex items-center gap-3">
                  <div className="heatbar h-2 flex-1">
                    <span className="forging" style={{ width: '72%' }} />
                  </div>
                  <p className="font-mono text-xs text-[var(--ember-1)] shrink-0 forging">FORGING…</p>
                </div>
              )}

              {/* Done */}
              {phase === 'done' && result && (
                <p className="font-mono text-xs text-[var(--forge-muted)]">
                  ✓ {result.assetIds?.length ?? 0} asset{(result.assetIds?.length ?? 0) !== 1 ? 's' : ''} forged — check the gallery.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
