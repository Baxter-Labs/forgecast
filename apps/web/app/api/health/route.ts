import { NextResponse } from 'next/server';
import { getServices } from '@/lib/forgecast';

export async function GET() {
  const svc = getServices();
  return NextResponse.json({
    ok: true,
    providers: {
      image: svc.imageRegistry.available(),
      video: svc.videoProvider.isAvailable() ? ['pixverse'] : [],
      montage: svc.montageWorker.isAvailable() ? ['remotion'] : [],
    },
    publishers: svc.publishers.available(),
  });
}
