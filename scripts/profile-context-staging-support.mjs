// Explicit opt-in integration test. Existing synthetic identities only; no
// production fallback, user creation, email, payments or schema writes.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
import { loadEnvFile } from './e2e-env.mjs'
export { assert, chromium, expect }
loadEnvFile(process.env.SOLOLEDGER_E2E_ENV_FILE ?? '.env.e2e.local')
export const url = 'https://fzxqiqenqjzhlyxxpvhg.supabase.co'
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ''), url)
assert.equal(process.env.SOLOLEDGER_E2E_SUPABASE_REF, 'fzxqiqenqjzhlyxxpvhg')
export const origin = process.env.SOLOLEDGER_PROFILE_TEST_BASE_URL
assert.match(origin ?? '', /^http:\/\/127\.0\.0\.1:\d+$/)
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
assert.ok(anonKey)
assert.ok(process.env.SOLOLEDGER_PROFILE_TEST_IDENTITIES, 'Ignored synthetic identity file must be explicitly selected')
const owners = new Set(['535a8629-d554-4467-b1bb-85d4002b0738', '3974c719-c171-4ec0-add6-0b3ad1fe9fde'])
export function checked(result) { if (result.error) throw Error(result.error.message); return result.data }
export const admin = createClient(url, process.env.SOLOLEDGER_E2E_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch(input, init) {
    assert.equal(new URL(typeof input === 'string' ? input : input.url ?? input.toString()).origin, url)
    return fetch(input, init)
  } },
})
export async function preflight(client, owner, label) {
  assert.equal(client.supabaseUrl.replace(/\/$/, ''), url)
  if (owner) {
    assert.ok(owners.has(owner))
    const result = await client.auth.getUser()
    assert.equal(checked(result).user.id, owner)
  } else checked(await admin.from('profiles').select('id').eq('id', '00000000-0000-0000-0000-000000000104'))
  console.log('STAGING VERIFIED ' + label)
}
export async function identities() {
  const users = JSON.parse(fs.readFileSync(process.env.SOLOLEDGER_PROFILE_TEST_IDENTITIES, 'utf8'))
  assert.equal(users.length, 2)
  assert.deepEqual(new Set(users.map(u => u.id)), owners)
  for (const user of users) {
    assert.match(user.email, /^sololedger-kan78-[ab]-\d+@example\.invalid$/)
    assert.equal(checked(await admin.auth.admin.getUserById(user.id)).user.email, user.email)
    user.client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    checked(await user.client.auth.signInWithPassword({ email: user.email, password: user.password }))
    await preflight(user.client, user.id, 'existing synthetic identity')
  }
  return users
}
export async function attachRoutes(context, users, state) {
  const allowed = new Set(users.map(u => u.id))
  await context.route('**/*', async route => {
    const req = route.request(), target = new URL(req.url())
    try {
      if (target.origin === origin) return route.continue()
      if (target.hostname.endsWith('.supabase.co')) {
        assert.equal(target.origin, url, 'Production / other backend denied')
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && !target.pathname.startsWith('/auth/v1/')) {
          const token = req.headers().authorization?.replace(/^Bearer /, '')
          const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
          assert.ok(allowed.has(claims.sub), 'Only selected synthetic owners may write')
          const profileSave = state.allowProfileSave && req.method() === 'PATCH' && target.pathname === '/rest/v1/profiles' && target.searchParams.get('id') === 'eq.' + claims.sub
          assert.ok(profileSave || target.pathname === '/rest/v1/rpc/book_transaction_atomic' || target.pathname === '/rest/v1/rpc/ensure_vat_periods' || target.pathname.startsWith('/rest/v1/rpc/get_'), 'Unexpected write endpoint')
        }
        if (state.profileRoute && target.pathname === '/rest/v1/profiles' && req.method() === 'GET') return state.profileRoute(route)
        if (target.pathname.endsWith('/book_transaction_atomic') && req.method() === 'POST') {
          const response = await route.fetch(), receipt = await response.json()
          state.calls.push({ payload: req.postDataJSON().p_payload, receipt })
          return route.fulfill({ response })
        }
        return route.continue()
      }
      if (target.hostname === 'fonts.googleapis.com' || target.hostname === 'fonts.gstatic.com') return route.continue()
      return route.abort()
    } catch (error) { state.errors.push(error.message); return route.abort() }
  })
}
export async function login(page, user) {
  await page.getByPlaceholder('E-postadress').fill(user.email)
  await page.getByPlaceholder('Lösenord', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Logga in', exact: true }).click()
  await expect(page.getByText('Översikt', { exact: true })).toBeVisible({ timeout: 45000 })
}
export async function nav(page, name, width) {
  await expect(page.getByText(/Inloggad som:/)).toBeVisible({ timeout: 45000 })
  let button = page.getByRole('button', { name, exact: true }).filter({ visible: true })
  if (!await button.count()) {
    await page.getByRole('button', { name: width === 390 ? 'Öppna meny' : 'Fler sidor', exact: true }).click()
    button = page.getByRole('button', { name, exact: true }).filter({ visible: true })
  }
  await button.first().click()
}
