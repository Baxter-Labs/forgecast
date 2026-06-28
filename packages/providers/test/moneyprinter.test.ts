import { describe, it, expect, vi } from 'vitest';
import { MoneyPrinterWorker, moneyPrinterParams } from '../src/index';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('MoneyPrinterWorker', () => {
  it('is unavailable without a base url', () => {
    expect(new MoneyPrinterWorker({ baseUrl: undefined }).isAvailable()).toBe(false);
  });

  it('creates a video task (POST /api/v1/videos with video_subject)', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { task_id: 't1' } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const { taskId } = await w.createVideo({ subject: 'cats in space', extra: { video_aspect: 'portrait' } });
    expect(taskId).toBe('t1');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://worker:8080/api/v1/videos');
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.video_subject).toBe('cats in space');
    expect(sent.video_aspect).toBe('portrait');
  });

  it('maps task state and resolves the combined video url when complete', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ data: { state: 1, progress: 100, combined_videos: ['/tasks/t1/combined-1.mp4'] } }),
    );
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const task = await w.getTask('t1');
    expect(task.state).toBe('complete');
    expect(task.progress).toBe(100);
    expect(task.videoUrl).toBe('http://worker:8080/tasks/t1/combined-1.mp4');
  });

  it('reports processing without a url', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { state: 4, progress: 40 } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    const task = await w.getTask('t1');
    expect(task.state).toBe('processing');
    expect(task.videoUrl).toBeUndefined();
  });

  it('maps failure state', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { state: -1, progress: 0 } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    expect((await w.getTask('t1')).state).toBe('failed');
  });

  it('keeps an already-absolute video url as-is', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      json({ data: { state: 1, progress: 100, combined_videos: ['https://cdn/x/combined-1.mp4'] } }),
    );
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    expect((await w.getTask('t1')).videoUrl).toBe('https://cdn/x/combined-1.mp4');
  });
});

describe('moneyPrinterParams (option → VideoParams mapping)', () => {
  it('maps every option to the right MoneyPrinterTurbo field name', () => {
    expect(moneyPrinterParams({
      aspect: '9:16', script: 's', terms: ['a', 'b'], clipDuration: 4, count: 3,
      source: 'pixabay', concatMode: 'sequential', transition: 'FadeIn',
      voiceName: 'en-US', voiceVolume: 1.2, voiceRate: 1.1, bgmType: 'random', bgmVolume: 0.3,
      subtitles: true, subtitlePosition: 'bottom', fontName: 'Arial', textColor: '#fff',
      fontSize: 64, strokeColor: '#000', strokeWidth: 2, paragraphs: 3,
    })).toEqual({
      video_aspect: '9:16', video_script: 's', video_terms: ['a', 'b'], video_clip_duration: 4,
      video_count: 3, video_source: 'pixabay', video_concat_mode: 'sequential', video_transition_mode: 'FadeIn',
      voice_name: 'en-US', voice_volume: 1.2, voice_rate: 1.1, bgm_type: 'random', bgm_volume: 0.3,
      subtitle_enabled: true, subtitle_position: 'bottom', font_name: 'Arial', text_fore_color: '#fff',
      font_size: 64, stroke_color: '#000', stroke_width: 2, paragraph_number: 3,
    });
  });

  it('omits undefined options and maps transition "none" → null', () => {
    expect(moneyPrinterParams({ aspect: '16:9', transition: 'none' })).toEqual({ video_aspect: '16:9', video_transition_mode: null });
    expect(moneyPrinterParams(undefined)).toEqual({});
    expect(moneyPrinterParams({})).toEqual({});
  });
});

describe('MoneyPrinterWorker.createVideo (with options)', () => {
  it('sends video_subject + mapped options, with raw extra winning', async () => {
    const fetchFn = vi.fn(async (..._a: Parameters<typeof fetch>) => json({ data: { task_id: 't9' } }));
    const w = new MoneyPrinterWorker({ baseUrl: 'http://worker:8080', fetchFn });
    await w.createVideo({ subject: 'forge it', options: { aspect: '9:16', subtitles: true, count: 2 }, extra: { video_count: 5 } });
    const sent = JSON.parse((fetchFn.mock.calls[0]![1] as RequestInit).body as string);
    expect(sent.video_subject).toBe('forge it');
    expect(sent.video_aspect).toBe('9:16');
    expect(sent.subtitle_enabled).toBe(true);
    expect(sent.video_count).toBe(5); // raw extra overrides the mapped option
  });
});
