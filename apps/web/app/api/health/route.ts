import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';

export async function GET() {
  const svc = getServices();
  return NextResponse.json({
    ok: true,
    providers: {
      image: svc.imageRegistry.available(),
      video: svc.videoProvider.isAvailable() ? [svc.videoProvider.name] : [],
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
