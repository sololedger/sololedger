import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  errorMessage,
  getPortalStripeConfig,
  stripeUnavailableResponse,
} from '@/lib/stripeServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    // Samma princip som /api/checkout: identiteten kommer ALDRIG från
    // request-body. Utan detta kunde vem som helst som kände till en
    // annan användares Supabase-UUID få en Stripe-portallänk för det kontot.
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')

    if (!token) {
      return NextResponse.json({ error: 'Ingen giltig session (saknar Authorization-token).' }, { status: 401 })
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Ogiltig eller utgången session.' }, { status: 401 })
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'Ingen Stripe-kund hittades' }, { status: 404 })
    }
    const stripeConfig = getPortalStripeConfig()

    if (!stripeConfig.ok) {
      return stripeUnavailableResponse(stripeConfig.missing)
    }

    const session = await stripeConfig.stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${stripeConfig.siteUrl}/`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    console.error('Portal error:', err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}
