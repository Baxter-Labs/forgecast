import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';
import { handleVapiToolCalls } from '@/lib/voice/vapi';
import { makeVoiceActions } from '@/lib/voice/actions';

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));
  const out = await handleVapiToolCalls(payload, makeVoiceActions(getServices()));
  return NextResponse.json(out);
}
