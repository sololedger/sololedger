import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  errorMessage,
  getCheckoutStripeConfig,
  stripeUnavailableResponse,
} from '@/lib/stripeServer'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    // Identiteten hämtas ALLTID server-side ur access-token, aldrig ur body.
    // Body innehåller inte längre userId/userEmail - klienten kan inte
    // längre bestämma vilket konto som uppgraderas.
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')

    if (!token) {
      return NextResponse.json({ error: 'Ingen giltig session (saknar Authorization-token).' }, { status: 401 })
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Ogiltig eller utgången session.' }, { status: 401 })
    }

    const userId = user.id
    const userEmail = user.email
    const stripeConfig = getCheckoutStripeConfig()

    if (!stripeConfig.ok) {
      return stripeUnavailableResponse(stripeConfig.missing)
    }

    const stripeSession = await stripeConfig.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripeConfig.priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: `${stripeConfig.siteUrl}/?status=success`,
      cancel_url: `${stripeConfig.siteUrl}/?status=cancelled`,
      customer_email: userEmail || undefined, // Skickar med mailen om den finns
      client_reference_id: userId, // Detta ID aktiverar premium i Supabase via din webhook!
    })

    return NextResponse.json({ url: stripeSession.url })
  } catch (err: unknown) {
    console.error('Stripe Checkout Error:', err)
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}
