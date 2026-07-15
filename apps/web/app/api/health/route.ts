import { NextResponse } from 'next/server';
import { getServices, getServicesForUser } from '@/lib/forgecast';
import { requireUser } from '@/lib/auth-guard';

export async function GET(req: Request) {
  // Availability reflects the CALLER's effective keys (their BYO keys → instance
  // env). Anonymous callers on an auth-enabled deployment see the instance view.
  const who = await requireUser(getServices(), req.headers.get('cookie'));
  const svc = who.ok ? await getServicesForUser(who.userId) : getServices();
  return NextResponse.json({
    ok: true,
    providers: {
      image: svc.imageRegistry.available(),
      video: svc.videoProviders,
      montage: svc.montageAvailable ? ['ffmpeg'] : [],
      short: svc.videoWorker.isAvailable() ? [svc.videoWorker.name] : [],
      voice: svc.voiceAvailable ? [svc.voiceProvider.name] : [],
      transcribe: svc.transcribeAvailable ? [svc.transcriber.name] : [],
      presenter: svc.presenterAvailable ? [svc.presenterProvider.name] : [],
      footage: svc.footageAvailable,
    },
    publishers: svc.publishers.available(),
  });
}
