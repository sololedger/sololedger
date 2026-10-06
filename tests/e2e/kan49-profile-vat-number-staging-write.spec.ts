import { expect, test, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { assertWriteE2EEnvironment } from '../../scripts/e2e-preflight.mjs'

type ProfileSnapshot = {
  id: string
  vat_number: string | null
  vat_status: string | null
  domestic_sales_vat_treatment: string | null
  foreign_purchase_reporting: string | null
  default_deduction_entitlement: string | null
}

test.describe('KAN-49 staging profile VAT number', () => {
  test.setTimeout(180_000)

  test.beforeAll(() => {
    assertWriteE2EEnvironment()
  })

  test('saves, reads, validates, and clears VAT number without changing VAT policy fields', async ({ page }) => {
    const client = await createSignedInClient()
    const originalProfile = await readProfile(client)

    try {
      await login(page)
      await page.getByRole('button', { name: 'Profil' }).click()
      await expect(page.getByText('Företagsinformation')).toBeVisible({ timeout: 20_000 })

      const vatNumberInput = page.getByPlaceholder('SE860825858101')
      await expect(vatNumberInput).toBeVisible()

      await vatNumberInput.fill('SE860825858101')
      await page.getByRole('button', { name: 'Spara ändringar' }).click()
      await expect(page.getByRole('button', { name: /Sparat/ })).toBeVisible({ timeout: 20_000 })

      const savedProfile = await readProfile(client)
      expect(savedProfile.vat_number).toBe('SE860825858101')
      expectVatPolicyFieldsUnchanged(savedProfile, originalProfile)

      await vatNumberInput.fill('')
      await page.getByRole('button', { name: 'Spara ändringar' }).click()
      await expect(page.getByRole('button', { name: /Sparat/ })).toBeVisible({ timeout: 20_000 })

      const clearedProfile = await readProfile(client)
      expect(clearedProfile.vat_number).toBeNull()
      expectVatPolicyFieldsUnchanged(clearedProfile, originalProfile)
    } finally {
      await restoreVatNumber(client, originalProfile)
    }
  })
})

async function login(page: Page) {
  const email = process.env.SOLOLEDGER_E2E_EMAIL
  const password = process.env.SOLOLEDGER_E2E_PASSWORD

  if (!email || !password) {
    throw new Error('Missing staging E2E credentials.')
  }

  await page.goto('/')
  await page.getByPlaceholder('E-postadress').fill(email)
  await page.getByPlaceholder('Lösenord').fill(password)
  await page.getByRole('button', { name: 'Logga in' }).click()
  await page.getByText(/Inloggad som:/).waitFor({ state: 'visible', timeout: 20_000 })
}

async function createSignedInClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.SOLOLEDGER_E2E_EMAIL
  const password = process.env.SOLOLEDGER_E2E_PASSWORD

  if (!url || !anonKey || !email || !password) {
    throw new Error('Missing staging E2E Supabase environment.')
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`staging E2E login failed: ${error.message}`)

  return client
}

async function readProfile(client: Awaited<ReturnType<typeof createSignedInClient>>) {
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) {
    throw new Error(`Could not resolve staging E2E user: ${userError?.message}`)
  }

  const { data, error } = await client
    .from('profiles')
    .select('id, vat_number, vat_status, domestic_sales_vat_treatment, foreign_purchase_reporting, default_deduction_entitlement')
    .eq('id', user.id)
    .single()

  if (error) throw new Error(`profile read failed: ${error.message}`)
  return data as ProfileSnapshot
}

async function restoreVatNumber(
  client: Awaited<ReturnType<typeof createSignedInClient>>,
  originalProfile: ProfileSnapshot
) {
  const { error } = await client
    .from('profiles')
    .update({ vat_number: originalProfile.vat_number })
    .eq('id', originalProfile.id)

  if (error) throw new Error(`profile restore failed: ${error.message}`)
}

function expectVatPolicyFieldsUnchanged(
  actual: ProfileSnapshot,
  expected: ProfileSnapshot
) {
  expect(actual.vat_status).toBe(expected.vat_status)
  expect(actual.domestic_sales_vat_treatment).toBe(
    expected.domestic_sales_vat_treatment
  )
  expect(actual.foreign_purchase_reporting).toBe(
    expected.foreign_purchase_reporting
  )
  expect(actual.default_deduction_entitlement).toBe(
    expected.default_deduction_entitlement
  )
}
