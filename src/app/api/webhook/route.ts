import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
})

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const body = await req.text()
  const headerList = await headers()
  const signature = headerList.get('Stripe-Signature')

  // Spärr: Avvisa direkt om signatur saknas
  if (!signature) {
    return NextResponse.json({ error: 'Mottog ingen Stripe-signatur' }, { status: 400 })
  }

  let event: Stripe.Event

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
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.client_reference_id
    const customerId = session.customer as string
    const subscriptionId = session.subscription as string

    if (userId && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const endDate = new Date(subscription.current_period_end * 1000).toISOString()

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
    const invoice = event.data.object as Stripe.Invoice
    const subscriptionId = invoice.subscription as string

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const endDate = new Date(subscription.current_period_end * 1000).toISOString()

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
    const subscription = event.data.object as Stripe.Subscription
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