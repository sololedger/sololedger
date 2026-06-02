import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as any,
})

export async function POST(req: Request) {
  try {
    // Vi läser direkt från bodyn – detta fungerar ALLTID på localhost!
    const body = await req.json()
    const userId = body.userId
    const userEmail = body.userEmail

    if (!userId) {
      return NextResponse.json({ error: 'Inte inloggad eller ogiltig session (userId saknas)' }, { status: 401 })
    }

    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/?status=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/?status=cancelled`,
      customer_email: userEmail || undefined, // Skickar med mailen om den finns
      client_reference_id: userId, // Detta ID aktiverar premium i Supabase via din webhook!
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err: any) {
    console.error('Stripe Checkout Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}