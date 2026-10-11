import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import {
  errorMessage,
  getWebhookStripeConfig,
  stripeUnavailableResponse,
} from '@/lib/stripeServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type StripeSubscriptionSummary = {
  status: string
  current_period_end: string | number
}

function parseEndDate(rawEnd: string | number): string {
  if (typeof rawEnd === 'number') {
    return new Date(rawEnd * 1000).toISOString()
  }
  return new Date(rawEnd).toISOString()
}

function mapSubscriptionType(status: string): 'trial' | 'paid' | 'free' {
  if (status === 'trialing') return 'trial'
  if (status === 'active') return 'paid'
  return 'free'
}

export async function POST(req: Request) {
  const body = await req.text()
  const headerList = await headers()
  const signature = headerList.get('Stripe-Signature')

  if (!signature) {
    return NextResponse.json({ error: 'Mottog ingen Stripe-signatur' }, { status: 400 })
  }
  const stripeConfig = getWebhookStripeConfig()

  if (!stripeConfig.ok) {
    return stripeUnavailableResponse(stripeConfig.missing)
  }

  let event: Stripe.Event

  try {
    event = stripeConfig.stripe.webhooks.constructEvent(
      body,
      signature,
      stripeConfig.webhookSecret
    )
  } catch (err: unknown) {
    return NextResponse.json({ error: `Webhook Error: ${errorMessage(err)}` }, { status: 400 })
  }

  // 1. Köp slutförs / Trial påbörjas
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id
    const customerId = typeof session.customer === 'string' ? session.customer : null
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null

    if (userId && subscriptionId) {
      const subscription = await stripeConfig.stripe.subscriptions.retrieve(subscriptionId) as unknown as StripeSubscriptionSummary
      const endDate = parseEndDate(subscription.current_period_end)

      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_type: mapSubscriptionType(subscription.status),
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_end: endDate,
        })
        .eq('id', userId)
    }
  }

  // 2. Förnyelse lyckas
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as unknown as { subscription?: string | null }
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null

    if (subscriptionId) {
      const subscription = await stripeConfig.stripe.subscriptions.retrieve(subscriptionId) as unknown as StripeSubscriptionSummary
      const endDate = parseEndDate(subscription.current_period_end)

      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_type: mapSubscriptionType(subscription.status),
          subscription_end: endDate,
        })
        .eq('stripe_subscription_id', subscriptionId)
    }
  }

  // 3. Prenumeration ändras (t.ex. trial -> active, cancel_at_period_end,
  // statusändring eller nytt current_period_end)
  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object as unknown as StripeSubscriptionSummary & { id: string }
    const subscriptionId = subscription.id
    const endDate = parseEndDate(subscription.current_period_end)

    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_type: mapSubscriptionType(subscription.status),
        subscription_end: endDate,
      })
      .eq('stripe_subscription_id', subscriptionId)
  }

  // 4. Prenumeration avslutas permanent
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as { id: string }
    const subscriptionId = subscription.id

    await supabaseAdmin
      .from('profiles')
      .update({
        subscription_type: 'free',
        subscription_end: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscriptionId)
  }

  return NextResponse.json({ received: true })
}
