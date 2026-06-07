import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// @ts-ignore
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {} as any)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseEndDate(rawEnd: any): string {
  if (typeof rawEnd === 'number') {
    return new Date(rawEnd * 1000).toISOString()
  }
  return new Date(rawEnd).toISOString()
}

export async function POST(req: Request) {
  const body = await req.text()
  const headerList = await headers()
  const signature = headerList.get('Stripe-Signature')

  if (!signature) {
    return NextResponse.json({ error: 'Mottog ingen Stripe-signatur' }, { status: 400 })
  }

  let event: any

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  // 1. Köp slutförs / Trial påbörjas
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as any
    const userId = session.client_reference_id
    const customerId = session.customer as string
    const subscriptionId = session.subscription as string

    if (userId && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
      console.log('SUBSCRIPTION DATA:', JSON.stringify(subscription.current_period_end))
      const endDate = parseEndDate(subscription.current_period_end)

      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_type: subscription.status === 'trialing' ? 'trial' : 'paid',
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_end: endDate,
        })
        .eq('id', userId)
    }
  }

  // 2. Förnyelse lyckas
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as any
    const subscriptionId = invoice.subscription as string

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
      const endDate = parseEndDate(subscription.current_period_end)

      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_type: subscription.status === 'trialing' ? 'trial' : 'paid',
          subscription_end: endDate,
        })
        .eq('stripe_subscription_id', subscriptionId)
    }
  }

  // 3. Prenumeration avslutas permanent
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as any
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