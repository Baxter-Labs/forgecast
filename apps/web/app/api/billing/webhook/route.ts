import { NextResponse } from 'next/server';
import { MollieClient } from '@/lib/billing/mollie';
import { markPaid } from '@/lib/billing/entitlements';

export async function POST(req: Request) {
  const form = await req.text();
  const id = new URLSearchParams(form).get('id') ?? '';
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const payment = await new MollieClient().getPayment(id);
    if (payment.paid) markPaid(payment.paymentId);
  } catch { /* Mollie retries webhooks; swallow */ }
  return NextResponse.json({ ok: true });
}
