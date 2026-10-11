import Stripe from 'stripe'

const STRIPE_API_VERSION =
  '2023-10-16' as unknown as NonNullable<ConstructorParameters<typeof Stripe>[1]>['apiVersion']

type StripeEnv = Record<string, string | undefined>

export type StripeConfigResult<T extends Record<string, unknown>> =
  | ({ ok: true; stripe: Stripe } & T)
  | { ok: false; missing: string[] }

let cachedStripe: Stripe | null = null
let cachedSecretKey: string | null = null

function present(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function getStripeClient(secretKey: string): Stripe {
  if (!cachedStripe || cachedSecretKey !== secretKey) {
    cachedStripe = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
    })
    cachedSecretKey = secretKey
  }

  return cachedStripe
}

function missingStripeConfigResponse(missing: string[]) {
  console.warn(`Stripe is not configured for this environment. Missing: ${missing.join(', ')}`)
  return {
    error: 'Stripe är inte konfigurerat i den här miljön.',
  }
}

export function stripeUnavailableResponse(missing: string[]) {
  return Response.json(missingStripeConfigResponse(missing), { status: 503 })
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ett oväntat fel inträffade.'
}

export function getCheckoutStripeConfig(env: StripeEnv = process.env): StripeConfigResult<{
  priceId: string
  siteUrl: string
}> {
  const secretKey = present(env.STRIPE_SECRET_KEY)
  const priceId = present(env.STRIPE_PRICE_ID)
  const siteUrl = present(env.NEXT_PUBLIC_SITE_URL)
  const missing: string[] = []

  if (!secretKey) missing.push('STRIPE_SECRET_KEY')
  if (!priceId) missing.push('STRIPE_PRICE_ID')
  if (!siteUrl) missing.push('NEXT_PUBLIC_SITE_URL')

  if (!secretKey || !priceId || !siteUrl) {
    return { ok: false, missing }
  }

  return {
    ok: true,
    stripe: getStripeClient(secretKey),
    priceId,
    siteUrl,
  }
}

export function getPortalStripeConfig(env: StripeEnv = process.env): StripeConfigResult<{
  siteUrl: string
}> {
  const secretKey = present(env.STRIPE_SECRET_KEY)
  const siteUrl = present(env.NEXT_PUBLIC_SITE_URL)
  const missing: string[] = []

  if (!secretKey) missing.push('STRIPE_SECRET_KEY')
  if (!siteUrl) missing.push('NEXT_PUBLIC_SITE_URL')

  if (!secretKey || !siteUrl) {
    return { ok: false, missing }
  }

  return {
    ok: true,
    stripe: getStripeClient(secretKey),
    siteUrl,
  }
}

export function getWebhookStripeConfig(env: StripeEnv = process.env): StripeConfigResult<{
  webhookSecret: string
}> {
  const secretKey = present(env.STRIPE_SECRET_KEY)
  const webhookSecret = present(env.STRIPE_WEBHOOK_SECRET)
  const missing: string[] = []

  if (!secretKey) missing.push('STRIPE_SECRET_KEY')
  if (!webhookSecret) missing.push('STRIPE_WEBHOOK_SECRET')

  if (!secretKey || !webhookSecret) {
    return { ok: false, missing }
  }

  return {
    ok: true,
    stripe: getStripeClient(secretKey),
    webhookSecret,
  }
}
