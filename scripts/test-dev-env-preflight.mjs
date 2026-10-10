import assert from 'node:assert/strict'
import {
  getSupabaseRefFromUrl,
  validateLocalDevEnvironment,
} from './dev-env-preflight.mjs'

const stagingRef = 'fzxqiqenqjzhlyxxpvhg'
const productionRef = 'wbaxmuvudpnkvuliicuy'
const baseEnv = {
  SOLOLEDGER_LOCAL_DEV_TARGET: 'staging',
  NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
}

assert.equal(getSupabaseRefFromUrl(`https://${stagingRef}.supabase.co`), stagingRef)
assert.equal(getSupabaseRefFromUrl('https://example.com'), null)

assert.equal(validateLocalDevEnvironment(baseEnv).ok, true)

const productionResult = validateLocalDevEnvironment({
  ...baseEnv,
  NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
})

assert.equal(productionResult.ok, false)
assert(productionResult.errors.some(error => error.includes('Production Supabase')))

assert.equal(
  validateLocalDevEnvironment({
    ...baseEnv,
    NEXT_PUBLIC_SUPABASE_URL: undefined,
  }).ok,
  false
)

assert.equal(
  validateLocalDevEnvironment({
    ...baseEnv,
    SOLOLEDGER_LOCAL_DEV_TARGET: undefined,
  }).ok,
  false
)

assert.equal(
  validateLocalDevEnvironment({
    ...baseEnv,
    SOLOLEDGER_LOCAL_DEV_TARGET: 'production',
  }).ok,
  false
)

console.log('Local dev preflight safety tests passed.')
