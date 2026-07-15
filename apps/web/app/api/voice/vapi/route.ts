import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { LOCAL_OWNER } from '@/lib/auth-guard';
import { handleVapiToolCalls, verifyVapiSecret } from '@/lib/voice/vapi';
import { makeVoiceActions } from '@/lib/voice/actions';

// The Vapi voice webhook runs the agent (generate + PUBLISH) and lists projects, so it
// is fail-closed: it requires the shared VAPI_WEBHOOK_SECRET, and acts only within one
// owner's workspace (VAPI_OWNER, else the local operator) — never across tenants.
export async function POST(req: Request) {
  const gate = verifyVapiSecret(req.headers.get('x-vapi-secret'));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const ownerId = process.env.VAPI_OWNER || LOCAL_OWNER;
  const services = ownerId === LOCAL_OWNER ? getServices() : await getServicesForUser(ownerId);
  const payload = await req.json().catch(() => ({}));
  const out = await handleVapiToolCalls(payload, makeVoiceActions(services, ownerId));
  return NextResponse.json(out);
}
