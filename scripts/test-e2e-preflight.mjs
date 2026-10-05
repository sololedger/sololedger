import assert from 'node:assert/strict'
import {
  getSupabaseRefFromUrl,
  validateWriteE2EEnvironment,
} from './e2e-preflight.mjs'

const stagingRef = 'fzxqiqenqjzhlyxxpvhg'
const productionRef = 'wbaxmuvudpnkvuliicuy'
const baseEnv = {
  SOLOLEDGER_E2E_TARGET: 'staging',
  SOLOLEDGER_E2E_SUPABASE_REF: stagingRef,
  NEXT_PUBLIC_SUPABASE_URL: `https://${stagingRef}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fake-key',
  SOLOLEDGER_E2E_EMAIL: 'sololedger-playwright-e2e@sololedger.se',
  SOLOLEDGER_E2E_PASSWORD: 'fake-password',
}

assert.equal(getSupabaseRefFromUrl(`https://${stagingRef}.supabase.co`), stagingRef)
assert.equal(getSupabaseRefFromUrl('https://example.com'), null)

assert.equal(validateWriteE2EEnvironment(baseEnv).ok, true)

assert.equal(
  validateWriteE2EEnvironment({
    ...baseEnv,
    NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
    SOLOLEDGER_E2E_SUPABASE_REF: productionRef,
  }).ok,
  false
)

assert(
  validateWriteE2EEnvironment({
    ...baseEnv,
    NEXT_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
    SOLOLEDGER_E2E_SUPABASE_REF: productionRef,
  }).errors.some(error => error.includes('Production Supabase'))
)

assert.equal(
  validateWriteE2EEnvironment({
    ...baseEnv,
    SOLOLEDGER_E2E_TARGET: 'production',
  }).ok,
  false
)

assert.equal(
  validateWriteE2EEnvironment({
    ...baseEnv,
    SOLOLEDGER_E2E_EMAIL: 'pontus@example.com',
  }).ok,
  false
)

console.log('E2E preflight safety tests passed.')
