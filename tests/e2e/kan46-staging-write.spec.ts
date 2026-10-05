import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { assertWriteE2EEnvironment } from '../../scripts/e2e-preflight.mjs'

const year = 2026

test.describe('KAN-46 staging write acceptance', () => {
  test.setTimeout(120_000)

  test.beforeAll(() => {
    assertWriteE2EEnvironment()
  })

  test('handles customer invoice lifecycle through the UI', async ({ page }) => {
    const supabase = await createAuthenticatedSupabaseClient()
    const runTag = `E2E-KAN-46-UI-${Date.now()}`
    const invoiceNumber = `${runTag}-dec`

    await login(page)
    await selectYear(page, year)
    await page.getByRole('button', { name: 'Fakturor' }).click()

    const panel = page.getByTestId('customer-invoices-panel')
    await expect(panel.getByRole('heading', { name: 'Kundfakturor som ska följas upp' })).toBeVisible()

    await panel.getByLabel('Fakturanr').fill(invoiceNumber)
    await panel.getByLabel('Kund').fill('E2E svensk decemberkund')
    await panel.getByLabel('Fakturadatum').fill(`20/12/${year}`)
    await panel.getByLabel('Tjänstedatum').fill(`19/12/${year}`)
    await panel.getByLabel('Förfallodatum').fill(`20/01/${year + 1}`)
    await panel.getByLabel('Belopp inkl moms').fill('2500')
    await panel.getByLabel('Momsfakta').selectOption('taxable')
    await panel.getByLabel('Moms %').selectOption('25')
    await panel.locator('input[type="file"]').setInputFiles({
      name: `${invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% SoloLedger KAN-46 E2E invoice\n%%EOF\n'),
    })
    await panel.getByRole('button', { name: 'Registrera faktura' }).click()

    const invoiceCard = page.getByTestId('customer-invoice-card').filter({ hasText: invoiceNumber }).first()
    await expect(invoiceCard).toContainText('Obetald', { timeout: 20_000 })
    await expect(invoiceCard).toContainText('Inte med i bokslutet')
    await invoiceCard.getByRole('button').first().click()
    await expect(invoiceCard).toContainText(/behöver tas med i bokslutet/i)

    await page.getByRole('button', { name: 'NE-Bilaga' }).click()
    await expect(page.getByRole('button', { name: `Lås räkenskapsår ${year}` })).toBeDisabled()

    await page.getByRole('button', { name: 'Fakturor' }).click()
    await panel.getByRole('button', { name: 'Ta med fakturorna i bokslutet' }).click()
    await expect(invoiceCard).toContainText('Obetald', { timeout: 20_000 })
    await expect(invoiceCard).toContainText('Med i bokslutet')
    await invoiceCard.getByRole('button').first().click()
    await expect(invoiceCard).toContainText(`31/12/${year}: togs med i bokslutet`)

    const invoice = await expectInvoiceByNumber(supabase, invoiceNumber)
    const receivableTxId = await expectBookingTransaction(
      supabase,
      invoice.id,
      'year_end_receivable'
    )
    await expectJournalBalance(supabase, receivableTxId, '1510', 2500)
    await expectJournalBalance(supabase, receivableTxId, '3010', -2000)
    await expectJournalBalance(supabase, receivableTxId, '2611', -500)

    await invoiceCard.getByLabel('Betalningsdatum').fill(`15/01/${year + 1}`)
    await invoiceCard.getByRole('button', { name: 'Registrera betalning' }).click()
    await expect(invoiceCard).toContainText('Betald', { timeout: 20_000 })

    const settlementTxId = await expectBookingTransaction(
      supabase,
      invoice.id,
      'receivable_settlement'
    )
    await expectJournalBalance(supabase, settlementTxId, '1930', 2500)
    await expectJournalBalance(supabase, settlementTxId, '1510', -2500)
    await expectJournalBalance(supabase, settlementTxId, '3010', 0)
    await expectJournalBalance(supabase, settlementTxId, '2611', 0)
    await expectInvoicePaymentStatus(supabase, invoice.id, 'paid')

    await selectYear(page, year + 1)
    await page.getByRole('button', { name: 'Fakturor' }).click()
    await expect(panel).not.toContainText(`fakturor återstår för bokslut ${year + 1}`)
    await expect(panel.getByRole('button', { name: 'Ta med fakturorna i bokslutet' })).toHaveCount(0)
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

async function selectYear(page: Page, targetYear: number) {
  await page.getByRole('button', { name: 'Bokföring' }).click()
  await page.locator('select').filter({
    has: page.locator(`option[value="${targetYear}"]`),
  }).first().selectOption(String(targetYear))
}

async function expectInvoiceByNumber(
  supabase: SupabaseClient,
  invoiceNumber: string
) {
  const { data, error } = await supabase
    .from('customer_invoices')
    .select('id, payment_status')
    .eq('invoice_number', invoiceNumber)
    .single()

  if (error) {
    throw new Error(`invoice lookup failed: ${error.message}`)
  }

  expect(data.payment_status).toBe('unpaid')
  return { id: String(data.id) }
}

async function expectBookingTransaction(
  supabase: SupabaseClient,
  invoiceId: string,
  bookingKind: 'year_end_receivable' | 'receivable_settlement'
) {
  const { data, error } = await supabase
    .from('customer_invoice_bookings')
    .select('transaction_id')
    .eq('invoice_id', invoiceId)
    .eq('booking_kind', bookingKind)
    .single()

  if (error) {
    throw new Error(`booking lookup failed: ${error.message}`)
  }

  return String(data.transaction_id)
}

async function expectJournalBalance(
  supabase: SupabaseClient,
  transactionId: string,
  accountNumber: string,
  expected: number
) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('debit, credit')
    .eq('transaction_id', transactionId)
    .eq('account_number', accountNumber)
  if (error) {
    throw new Error(`journal lookup failed: ${error.message}`)
  }

  const actual = (data ?? []).reduce(
    (sum, row) => sum + Number(row.debit ?? 0) - Number(row.credit ?? 0),
    0
  )
  expect(Math.round(actual * 100) / 100).toBe(expected)
}

async function expectInvoicePaymentStatus(
  supabase: SupabaseClient,
  invoiceId: string,
  expected: 'unpaid' | 'paid'
) {
  const { data, error } = await supabase
    .from('customer_invoices')
    .select('payment_status')
    .eq('id', invoiceId)
    .single()
  if (error) {
    throw new Error(`invoice lookup failed: ${error.message}`)
  }
  expect(data.payment_status).toBe(expected)
}

async function createAuthenticatedSupabaseClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.SOLOLEDGER_E2E_EMAIL
  const password = process.env.SOLOLEDGER_E2E_PASSWORD

  if (!url || !anonKey || !email || !password) {
    throw new Error('Missing staging E2E Supabase environment.')
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { error: loginError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  expect(loginError).toBeNull()

  return supabase
}
