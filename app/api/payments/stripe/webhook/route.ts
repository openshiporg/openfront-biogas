import { NextRequest, NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'
import { handleStripeWebhook } from '@/features/keystone/services/payments'

/** Stripe webhook (4.5). Point the Stripe endpoint at /api/payments/stripe/webhook; the signature is checked on the raw body. */
export async function POST(request: NextRequest) {
  const raw = Buffer.from(await request.arrayBuffer())
  const result = await handleStripeWebhook(keystoneContext.prisma as never, raw, request.headers.get('stripe-signature'))
  return NextResponse.json(result.body, { status: result.status })
}
