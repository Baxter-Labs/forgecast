import { describe, it, expect, vi } from 'vitest';
import { AgentReachTrendTool, type TrendRunner } from '../lib/agent/trends';

const ok = (output: string): TrendRunner => vi.fn(async () => ({ ok: true, output }));

describe('AgentReachTrendTool', () => {
  it('runs search-<platform> and returns trimmed, prefixed notes', async () => {
    const run = ok('hook: bold text\nformat: fast cuts');
    const t = new AgentReachTrendTool({ run });
    const notes = await t.trending('eco sneakers', 'instagram');
    expect((run as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(['search-instagram', 'eco sneakers']);
    expect(notes).toContain('Trending on instagram');
    expect(notes).toContain('fast cuts');
  });

  it('maps aliases (x → twitter, yt → youtube)', async () => {
    const run = ok('t');
    await new AgentReachTrendTool({ run }).trending('q', 'x');
    expect((run as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual(['search-twitter', 'q']);
  });

  it('returns empty for an unknown platform (no run)', async () => {
    const run = vi.fn(async () => ({ ok: true, output: 'x' }));
    expect(await new AgentReachTrendTool({ run }).trending('q', 'myspace')).toBe('');
    expect(run).not.toHaveBeenCalled();
  });

  it('returns empty when the runner fails (e.g. agent-reach not installed)', async () => {
    const run: TrendRunner = vi.fn(async () => ({ ok: false, output: '' }));
    expect(await new AgentReachTrendTool({ run }).trending('q', 'reddit')).toBe('');
  });

  it('truncates long output to maxChars', async () => {
    const t = new AgentReachTrendTool({ run: ok('x'.repeat(5000)), maxChars: 100 });
    const notes = await t.trending('q', 'reddit');
    expect(notes.length).toBeLessThan(160);
  });
});
