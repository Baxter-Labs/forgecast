import { spawn } from 'node:child_process';
import type { TrendTool } from '@forgecast/agent';

export interface TrendRunner {
  (args: string[]): Promise<{ ok: boolean; output: string }>;
}

const PLATFORM_MAP: Record<string, string> = {
  twitter: 'twitter', x: 'twitter', reddit: 'reddit', youtube: 'youtube', yt: 'youtube',
  github: 'github', linkedin: 'linkedin', instagram: 'instagram', ig: 'instagram',
  bilibili: 'bilibili', xiaohongshu: 'xiaohongshu', web: 'web',
};

function defaultRunner(bin: string): TrendRunner {
  return (args) =>
    new Promise((resolve) => {
      let out = '';
      let errOut = '';
      try {
        const child = spawn(bin, args, { timeout: 30000 });
        child.stdout?.on('data', (d) => { out += String(d); });
        child.stderr?.on('data', (d) => { errOut += String(d); });
        child.on('error', () => resolve({ ok: false, output: '' }));
        child.on('close', (code) => resolve({ ok: code === 0, output: out || errOut }));
      } catch {
        resolve({ ok: false, output: '' });
      }
    });
}

export interface AgentReachOptions {
  run?: TrendRunner;
  bin?: string;
  maxChars?: number;
}

export class AgentReachTrendTool implements TrendTool {
  private readonly run: TrendRunner;
  private readonly maxChars: number;

  constructor(opts: AgentReachOptions = {}) {
    this.run = opts.run ?? defaultRunner(opts.bin ?? process.env.AGENT_REACH_BIN ?? 'agent-reach');
    this.maxChars = opts.maxChars ?? 1500;
  }

  async trending(topic: string, platform: string): Promise<string> {
    const p = PLATFORM_MAP[platform.toLowerCase()];
    if (!p) return '';
    const { ok, output } = await this.run([`search-${p}`, topic]);
    if (!ok || output.trim().length === 0) return '';
    return `Trending on ${platform}:\n${output.trim().slice(0, this.maxChars)}`;
  }
}

/** Returns a trend tool only when AGENT_REACH_ENABLED is set (else undefined → agent plans without trends). */
export function maybeTrendTool(): AgentReachTrendTool | undefined {
  return process.env.AGENT_REACH_ENABLED ? new AgentReachTrendTool() : undefined;
}
