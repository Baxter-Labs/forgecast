import { NextResponse } from 'next/server';
import { MollieClient } from '@/lib/billing/mollie';

export async function POST(req: Request) {
  const mollie = new MollieClient();
  if (!mollie.isAvailable()) return NextResponse.json({ error: 'billing not configured (set MOLLIE_API_KEY)' }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { redirectUrl?: string };
  const origin = new URL(req.url).origin;
  try {
    const payment = await mollie.createPayment({
      amount: '9.00',
      description: 'Forgecast Pro',
      redirectUrl: body.redirectUrl ?? `${origin}/?pro=success`,
      webhookUrl: `${origin}/api/billing/webhook`,
    });
    return NextResponse.json({ checkoutUrl: payment.checkoutUrl, paymentId: payment.paymentId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
