import assert from 'node:assert/strict'
import {
  getCheckoutStripeConfig,
  getPortalStripeConfig,
  getWebhookStripeConfig,
} from '../src/lib/stripeServer.ts'

const baseEnv = {
  STRIPE_SECRET_KEY: 'sk_test_123456789',
  STRIPE_PRICE_ID: 'price_123456789',
  STRIPE_WEBHOOK_SECRET: 'whsec_123456789',
  NEXT_PUBLIC_SITE_URL: 'https://staging.example.test',
}

const missingCheckout = getCheckoutStripeConfig({})
assert.equal(missingCheckout.ok, false)
assert.deepEqual(
  missingCheckout.missing,
  ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'NEXT_PUBLIC_SITE_URL']
)

const checkout = getCheckoutStripeConfig(baseEnv)
assert.equal(checkout.ok, true)
assert.equal(checkout.priceId, baseEnv.STRIPE_PRICE_ID)
assert.equal(checkout.siteUrl, baseEnv.NEXT_PUBLIC_SITE_URL)
assert.equal(typeof checkout.stripe.checkout.sessions.create, 'function')

const missingPortal = getPortalStripeConfig({
  STRIPE_SECRET_KEY: baseEnv.STRIPE_SECRET_KEY,
})
assert.equal(missingPortal.ok, false)
assert.deepEqual(missingPortal.missing, ['NEXT_PUBLIC_SITE_URL'])

const portal = getPortalStripeConfig(baseEnv)
assert.equal(portal.ok, true)
assert.equal(portal.siteUrl, baseEnv.NEXT_PUBLIC_SITE_URL)
assert.equal(typeof portal.stripe.billingPortal.sessions.create, 'function')

const missingWebhook = getWebhookStripeConfig({
  STRIPE_SECRET_KEY: baseEnv.STRIPE_SECRET_KEY,
})
assert.equal(missingWebhook.ok, false)
assert.deepEqual(missingWebhook.missing, ['STRIPE_WEBHOOK_SECRET'])

const webhook = getWebhookStripeConfig(baseEnv)
assert.equal(webhook.ok, true)
assert.equal(webhook.webhookSecret, baseEnv.STRIPE_WEBHOOK_SECRET)
assert.equal(typeof webhook.stripe.webhooks.constructEvent, 'function')

console.log('Stripe server configuration tests passed.')
