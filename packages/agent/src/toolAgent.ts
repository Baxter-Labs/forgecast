import type { ForgecastActions, LlmChatMessage, LlmClient, LlmTool, TrendTool } from './types';

/** The outcome of a tool-calling agent run. */
export interface AgenticResult {
  projectId: string;
  imageAssetIds: string[];
  videoJobIds: string[]; // b-roll clips (no audio)
  presenterJobIds: string[]; // talking-head presenter videos (voice-over)
  /** A transcript of the tools the agent invoked, in order. */
  steps: { tool: string; summary: string }[];
  /** The agent's final message describing what it produced. */
  summary: string;
}

export interface ToolCallingAgentDeps {
  llm: LlmClient;
  forgecast: ForgecastActions;
  trends?: TrendTool;
}

export interface ToolCallingAgentRunOpts {
  projectId?: string;
  platforms?: string[];
  maxSteps?: number;
}

const SYSTEM_PROMPT = `You are Forgecast's creative director — an autonomous agent that turns a product brief into a short, scroll-stopping social campaign and then PRODUCES it by calling tools.

Given the brief (and any trending notes), first brainstorm a tight campaign idea, then build it. You MUST make at least one image and at least one video. For every video, DECIDE which format best fits the beat:
- generate_broll_video → a silent, cinematic product b-roll clip (mood, beauty shots, the product in motion). No spokesperson.
- generate_presenter_video → a real-looking person presenting the product to camera, lip-synced to a spoken voice-over. Use this when a spokesperson, explainer, or human hook adds value.

Prefer 9:16 (vertical) for social. Keep presenter scripts under ~25 seconds of speech. Do not call more than a few tools — be decisive. When the campaign's assets are produced, call finish with a summary of what you made.`;

const TOOLS: LlmTool[] = [
  {
    name: 'generate_image',
    description: 'Generate a still product/hero image.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Vivid, specific description of the image to generate.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_broll_video',
    description: 'Generate a short product b-roll video clip with NO audio (cinematic footage of the product).',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Cinematic description of the b-roll footage.' },
        aspect_ratio: { type: 'string', description: 'e.g. "9:16" for vertical social video.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_presenter_video',
    description:
      'Generate a video where a person presents the product to camera, lip-synced to a spoken voice-over. presenter_description describes the on-camera presenter (a real-looking person, front-facing); script is what they say (keep under ~25 seconds of speech).',
    parameters: {
      type: 'object',
      properties: {
        presenter_description: { type: 'string', description: 'The on-camera presenter (a real-looking, front-facing person).' },
        script: { type: 'string', description: 'What the presenter says — under ~25 seconds of speech.' },
        aspect_ratio: { type: 'string', description: 'e.g. "9:16" for vertical social video.' },
      },
      required: ['presenter_description', 'script'],
    },
  },
  {
    name: 'finish',
    description: 'Call when the campaign assets are produced; summary describes what you made.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'A short summary of the campaign you produced.' },
      },
      required: ['summary'],
    },
  },
];

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json || '{}') as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export class ToolCallingAgent {
  constructor(private readonly deps: ToolCallingAgentDeps) {}

  async run(brief: string, opts: ToolCallingAgentRunOpts = {}): Promise<AgenticResult> {
    if (!this.deps.llm.chat) throw new Error('this LLM client does not support tool calling');

    const projectId = opts.projectId ?? (await this.deps.forgecast.ensureProject(brief.slice(0, 60) || 'Forgecast'));

    // Gather trending notes (optional), like ContentAgent.plan.
    let trendingNotes = '';
    const platforms = opts.platforms ?? ['instagram'];
    if (this.deps.trends) {
      const notes = await Promise.all(platforms.map((p) => this.deps.trends!.trending(brief, p).catch(() => '')));
      trendingNotes = notes.filter((n) => n && n.trim()).join('\n');
    }

    const userParts = [`Brief: ${brief}`, `Target platforms: ${platforms.join(', ') || 'instagram'}`];
    if (trendingNotes.trim()) userParts.push(`Trending notes:\n${trendingNotes.trim()}`);
    userParts.push('Brainstorm the campaign, then produce it by calling tools.');

    const messages: LlmChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userParts.join('\n\n') },
    ];

    const imageAssetIds: string[] = [];
    const videoJobIds: string[] = [];
    const presenterJobIds: string[] = [];
    const steps: { tool: string; summary: string }[] = [];
    let summary = '';

    const maxSteps = opts.maxSteps ?? 8;
    for (let step = 0; step < maxSteps; step++) {
      const { content, toolCalls } = await this.deps.llm.chat({ messages, tools: TOOLS });

      if (toolCalls.length === 0) {
        summary = content;
        break;
      }

      messages.push({ role: 'assistant', content, toolCalls });

      let finished = false;
      for (const tc of toolCalls) {
        const args = safeParse(tc.argumentsJson);
        let result = 'unknown tool';

        if (tc.name === 'generate_image') {
          const prompt = asString(args.prompt) ?? '';
          const { assetId } = await this.deps.forgecast.generateImage(projectId, prompt);
          if (assetId) {
            imageAssetIds.push(assetId);
            result = `image asset created: ${assetId}`;
          } else {
            result = 'image generation failed';
          }
          steps.push({ tool: tc.name, summary: prompt });
        } else if (tc.name === 'generate_broll_video') {
          const prompt = asString(args.prompt) ?? '';
          const aspect = asString(args.aspect_ratio);
          const { jobId } = await this.deps.forgecast.generateVideo(projectId, prompt, aspect);
          if (jobId) videoJobIds.push(jobId);
          result = `b-roll video queued: ${jobId}`;
          steps.push({ tool: tc.name, summary: prompt });
        } else if (tc.name === 'generate_presenter_video') {
          const presenter = asString(args.presenter_description) ?? '';
          const script = asString(args.script) ?? '';
          const { jobId } = await this.deps.forgecast.generatePresenter(projectId, {
            imagePrompt: presenter,
            script,
          });
          if (jobId) presenterJobIds.push(jobId);
          result = `presenter video queued: ${jobId}`;
          steps.push({ tool: tc.name, summary: `${presenter} — "${script}"` });
        } else if (tc.name === 'finish') {
          summary = asString(args.summary) ?? content;
          steps.push({ tool: tc.name, summary });
          finished = true;
          break;
        } else {
          steps.push({ tool: tc.name, summary: 'unknown tool' });
        }

        messages.push({ role: 'tool', toolCallId: tc.id, content: result });
      }

      if (finished) {
        return { projectId, imageAssetIds, videoJobIds, presenterJobIds, steps, summary };
      }
    }

    return { projectId, imageAssetIds, videoJobIds, presenterJobIds, steps, summary };
  }
}
