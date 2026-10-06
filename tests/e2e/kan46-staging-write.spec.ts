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
    const originalInvoiceNumber = `${runTag}-dec`
    const invoiceNumber = `${runTag}-dec-rev`

    await login(page)
    await selectYear(page, year)
    await page.getByRole('button', { name: 'Fakturor' }).click()

    const panel = page.getByTestId('customer-invoices-panel')
    await expect(panel.getByRole('heading', { name: 'Kundfakturor som ska följas upp' })).toBeVisible()

    await panel.getByLabel('Fakturanr').fill(originalInvoiceNumber)
    await panel.getByLabel('Kund').fill('E2E svensk decemberkund')
    await panel.getByLabel('Fakturadatum', { exact: true }).fill(`20/12/${year}`)
    await panel.getByLabel('Tjänstedatum', { exact: true }).fill(`19/12/${year}`)
    await panel.locator('input[type="date"][aria-label="Välj förfallodatum i kalender"]').fill(`${year + 1}-01-20`)
    await expect(panel.getByLabel('Förfallodatum', { exact: true })).toHaveValue(`20/01/${year + 1}`)
    await panel.getByLabel('Belopp inkl moms').fill('2500')
    await panel.getByLabel('Momsfakta').selectOption('taxable')
    await panel.getByLabel('Moms %').selectOption('25')
    await panel.locator('input[type="file"]').setInputFiles({
      name: `${originalInvoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% SoloLedger KAN-46 E2E invoice\n%%EOF\n'),
    })
    await panel.getByRole('button', { name: 'Registrera faktura' }).click()

    let invoiceCard = page.getByTestId('customer-invoice-card').filter({ hasText: originalInvoiceNumber }).first()
    await expect(invoiceCard).toContainText('Obetald', { timeout: 20_000 })
    await expect(invoiceCard).toContainText('Inte med i bokslutet')
    await invoiceCard.getByRole('button').first().click()

    await invoiceCard.getByRole('button', { name: 'Redigera faktura' }).click()
    await invoiceCard.getByLabel('Fakturanr').fill(invoiceNumber)
    await invoiceCard.getByLabel('Kund').fill('E2E svensk decemberkund korrigerad')
    await invoiceCard.getByLabel('Fakturadatum', { exact: true }).fill(`20/12/${year}`)
    await invoiceCard.getByLabel('Tjänstedatum', { exact: true }).fill(`20/12/${year}`)
    await invoiceCard.getByLabel('Förfallodatum', { exact: true }).fill(`31/02/${year + 1}`)
    await invoiceCard.getByLabel('Belopp inkl moms').fill('3750')
    await invoiceCard.locator('input[type="file"]').setInputFiles({
      name: `${invoiceNumber}.pdf`,
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% SoloLedger KAN-46 edited E2E invoice\n%%EOF\n'),
    })
    await invoiceCard.getByRole('button', { name: 'Spara ändringar' }).click()
    await expect(invoiceCard.getByRole('button', { name: 'Spara ändringar' })).toBeVisible()
    await invoiceCard.locator('input[type="date"][aria-label="Välj förfallodatum i kalender"]').fill(`${year + 1}-01-20`)
    await expect(invoiceCard.getByLabel('Förfallodatum', { exact: true })).toHaveValue(`20/01/${year + 1}`)
    await invoiceCard.getByRole('button', { name: 'Spara ändringar' }).click()

    invoiceCard = page.getByTestId('customer-invoice-card').filter({ hasText: invoiceNumber }).first()
    await expect(invoiceCard).toContainText('E2E svensk decemberkund korrigerad', { timeout: 20_000 })
    await expect(invoiceCard).toContainText('3 750 kr')
    await expect(invoiceCard).toContainText(/behöver tas med i bokslutet/i)

    await page.getByRole('button', { name: 'NE-Bilaga' }).click()
    await expect(page.getByRole('button', { name: `Lås räkenskapsår ${year}` })).toBeDisabled()

    await page.getByRole('button', { name: 'Fakturor' }).click()
    await panel.getByRole('button', { name: 'Ta med fakturorna i bokslutet' }).click()
    await expect(invoiceCard).toContainText('Obetald', { timeout: 20_000 })
    await expect(invoiceCard).toContainText('Med i bokslutet')
    await invoiceCard.getByRole('button', { name: 'Visa detaljer' }).click()
    await expect(invoiceCard).toContainText(`31/12/${year}: togs med i bokslutet`)

    const invoice = await expectInvoiceByNumber(supabase, invoiceNumber)
    const receivableTxId = await expectBookingTransaction(
      supabase,
      invoice.id,
      'year_end_receivable'
    )
    await expectJournalBalance(supabase, receivableTxId, '1510', 3750)
    await expectJournalBalance(supabase, receivableTxId, '3010', -3000)
    await expectJournalBalance(supabase, receivableTxId, '2611', -750)

    await invoiceCard.getByLabel('Betalningsdatum', { exact: true }).fill(`15/01/${year + 1}`)
    await invoiceCard.getByRole('button', { name: 'Registrera betalning' }).click()
    await expect(invoiceCard).toContainText('Betald', { timeout: 20_000 })

    const settlementTxId = await expectBookingTransaction(
      supabase,
      invoice.id,
      'receivable_settlement'
    )
    await expectJournalBalance(supabase, settlementTxId, '1930', 3750)
    await expectJournalBalance(supabase, settlementTxId, '1510', -3750)
    await expectJournalBalance(supabase, settlementTxId, '3010', 0)
    await expectJournalBalance(supabase, settlementTxId, '2611', 0)
    await expectInvoicePaymentStatus(supabase, invoice.id, 'paid')

    await invoiceCard.getByRole('button', { name: 'Ångra registrerad betalning' }).click()
    const undoDialog = page.getByRole('dialog', { name: 'Ångra registrerad betalning?' })
    await expect(undoDialog).toContainText(/korrigerande bokning/i)
    await expect(undoDialog.getByRole('button', { name: 'Ångra betalning' })).toBeVisible()
    await undoDialog.getByRole('button', { name: 'Avbryt' }).click()
    await expect(undoDialog).toHaveCount(0)
    await expect(invoiceCard).toContainText('Betald')

    await invoiceCard.getByRole('button', { name: 'Ångra registrerad betalning' }).click()
    await page.getByRole('dialog', { name: 'Ångra registrerad betalning?' })
      .getByRole('button', { name: 'Ångra betalning' })
      .click()
    await expect(invoiceCard).toContainText('Obetald', { timeout: 20_000 })
    await expect(invoiceCard).toContainText('betalning efter bokslut ångrad')

    const settlementReversalTxId = await expectBookingTransaction(
      supabase,
      invoice.id,
      'receivable_settlement_reversal'
    )
    await expectJournalBalance(supabase, settlementReversalTxId, '1930', -3750)
    await expectJournalBalance(supabase, settlementReversalTxId, '1510', 3750)
    await expectBookingCount(supabase, invoice.id, 'year_end_receivable', 1)
    await expectInvoicePaymentStatus(supabase, invoice.id, 'unpaid')

    await selectYear(page, year + 1)
    await page.getByRole('button', { name: 'Fakturor' }).click()
    await expect(panel).not.toContainText(`fakturor återstår för bokslut ${year + 1}`)
    await expect(panel.getByRole('button', { name: 'Ta med fakturorna i bokslutet' })).toHaveCount(0)
  })

  test('supports edit-before-booking and same-year payment undo server invariants', async () => {
    const supabase = await createAuthenticatedSupabaseClient()
    const runTag = `E2E-KAN-46-RPC-${Date.now()}`
    const originalNumber = `${runTag}-orig`
    const editedNumber = `${runTag}-edited`

    const created = await createInvoiceByRpc(supabase, {
      invoiceNumber: originalNumber,
      customerName: 'E2E fel kund',
      invoiceDate: `${year}-10-03`,
      serviceDate: `${year}-10-03`,
      dueDate: `${year}-10-20`,
      grossAmount: 1250,
      vatTreatment: 'taxable',
      vatRate: 25,
      attachmentUrl: `${runTag}/original.pdf`,
    })

    await updateInvoiceByRpc(supabase, created.invoiceId, {
      invoiceNumber: editedNumber,
      customerName: 'E2E korrigerad kund',
      invoiceDate: `${year}-10-04`,
      serviceDate: `${year}-10-04`,
      dueDate: `${year}-10-25`,
      grossAmount: 2500,
      vatTreatment: 'taxable',
      vatRate: 25,
      attachmentUrl: `${runTag}/replacement.pdf`,
    })

    await expectInvoiceFacts(supabase, editedNumber, {
      customerName: 'E2E korrigerad kund',
      invoiceDate: `${year}-10-04`,
      grossAmount: 2500,
      attachmentUrl: `${runTag}/replacement.pdf`,
    })

    await recordPaymentByRpc(supabase, created.invoiceId, `${year}-10-15`, crypto.randomUUID())
    const paymentTxId = await expectBookingTransaction(
      supabase,
      created.invoiceId,
      'payment_same_year'
    )
    await expectJournalBalance(supabase, paymentTxId, '1930', 2500)
    await expectJournalBalance(supabase, paymentTxId, '3010', -2000)
    await expectJournalBalance(supabase, paymentTxId, '2611', -500)

    await expectUpdateInvoiceFailure(supabase, created.invoiceId, /obetalda|redan bokförd/i)

    const undoKey = crypto.randomUUID()
    const undoResult = await undoPaymentByRpc(supabase, created.invoiceId, undoKey)
    const reversalTxId = await expectBookingTransaction(
      supabase,
      created.invoiceId,
      'payment_same_year_reversal'
    )
    await expectJournalBalance(supabase, reversalTxId, '1930', -2500)
    await expectJournalBalance(supabase, reversalTxId, '3010', 2000)
    await expectJournalBalance(supabase, reversalTxId, '2611', 500)
    await expectInvoicePaymentStatus(supabase, created.invoiceId, 'unpaid')

    const replayResult = await undoPaymentByRpc(supabase, created.invoiceId, undoKey)
    expect(replayResult.booking_id).toBe(undoResult.booking_id)
    await expectBookingCount(supabase, created.invoiceId, 'payment_same_year_reversal', 1)
    await recordPaymentByRpc(supabase, created.invoiceId, `${year}-10-16`, crypto.randomUUID())
    await expectInvoicePaymentStatus(supabase, created.invoiceId, 'paid')
  })

  test('keeps year-end receivable intact when settlement is undone and rejects unsafe undo', async () => {
    const supabase = await createAuthenticatedSupabaseClient()
    const runTag = `E2E-KAN-46-UNDO-${Date.now()}`
    const invoiceNumber = `${runTag}-dec`

    const invoice = await createInvoiceByRpc(supabase, {
      invoiceNumber,
      customerName: 'E2E bokslutskund',
      invoiceDate: `${year}-12-20`,
      serviceDate: `${year}-12-20`,
      dueDate: `${year + 1}-01-20`,
      grossAmount: 2500,
      vatTreatment: 'taxable',
      vatRate: 25,
      attachmentUrl: `${runTag}/dec.pdf`,
    })

    await bookYearEndByRpc(supabase, invoice.invoiceId, year, crypto.randomUUID())
    await settleReceivableByRpc(supabase, invoice.invoiceId, `${year + 1}-01-15`, crypto.randomUUID())
    await undoPaymentByRpc(supabase, invoice.invoiceId, crypto.randomUUID())

    await expectBookingCount(supabase, invoice.invoiceId, 'year_end_receivable', 1)
    await expectBookingCount(supabase, invoice.invoiceId, 'receivable_settlement_reversal', 1)
    const reversalTxId = await expectBookingTransaction(
      supabase,
      invoice.invoiceId,
      'receivable_settlement_reversal'
    )
    await expectJournalBalance(supabase, reversalTxId, '1930', -2500)
    await expectJournalBalance(supabase, reversalTxId, '1510', 2500)
    await expectInvoicePaymentStatus(supabase, invoice.invoiceId, 'unpaid')
    await expectYearEndWrongYearFailure(supabase, invoice.invoiceId, year + 1)

    const lockedYear = 2090 + Math.floor(Date.now() % 1000)
    const lockedNumber = `${runTag}-locked-${lockedYear}`
    const lockedInvoice = await createInvoiceByRpc(supabase, {
      invoiceNumber: lockedNumber,
      customerName: 'E2E låst år',
      invoiceDate: `${lockedYear}-08-10`,
      serviceDate: `${lockedYear}-08-10`,
      dueDate: `${lockedYear}-08-20`,
      grossAmount: 1250,
      vatTreatment: 'exempt',
      vatRate: null,
      attachmentUrl: `${runTag}/locked.pdf`,
    })
    await recordPaymentByRpc(supabase, lockedInvoice.invoiceId, `${lockedYear}-08-15`, crypto.randomUUID())
    await closeYearByRpc(supabase, lockedYear)
    await expectUndoPaymentFailure(supabase, lockedInvoice.invoiceId, /låst räkenskapsår/i)
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
  bookingKind:
    | 'payment_same_year'
    | 'year_end_receivable'
    | 'receivable_settlement'
    | 'payment_same_year_reversal'
    | 'receivable_settlement_reversal'
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

async function expectBookingCount(
  supabase: SupabaseClient,
  invoiceId: string,
  bookingKind:
    | 'payment_same_year'
    | 'year_end_receivable'
    | 'receivable_settlement'
    | 'payment_same_year_reversal'
    | 'receivable_settlement_reversal',
  expected: number
) {
  const { count, error } = await supabase
    .from('customer_invoice_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)
    .eq('booking_kind', bookingKind)
  if (error) {
    throw new Error(`booking count failed: ${error.message}`)
  }
  expect(count).toBe(expected)
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

type InvoicePayload = {
  invoiceNumber: string
  customerName: string
  invoiceDate: string
  serviceDate: string
  dueDate: string
  grossAmount: number
  vatTreatment: 'taxable' | 'exempt' | 'unknown'
  vatRate: number | null
  attachmentUrl: string
}

async function createInvoiceByRpc(
  supabase: SupabaseClient,
  payload: InvoicePayload
) {
  const { data, error } = await supabase.rpc('create_customer_invoice_atomic', {
    p_payload: invoiceRpcPayload(payload),
  })
  if (error) {
    throw new Error(`create invoice failed: ${error.message}`)
  }
  return { invoiceId: String(data.invoice_id) }
}

async function updateInvoiceByRpc(
  supabase: SupabaseClient,
  invoiceId: string,
  payload: InvoicePayload
) {
  const { error } = await supabase.rpc('update_customer_invoice_unbooked_atomic', {
    p_invoice_id: invoiceId,
    p_payload: invoiceRpcPayload(payload),
  })
  if (error) {
    throw new Error(`update invoice failed: ${error.message}`)
  }
}

async function expectUpdateInvoiceFailure(
  supabase: SupabaseClient,
  invoiceId: string,
  messagePattern: RegExp
) {
  const { error } = await supabase.rpc('update_customer_invoice_unbooked_atomic', {
    p_invoice_id: invoiceId,
    p_payload: invoiceRpcPayload({
      invoiceNumber: `SHOULD-NOT-SAVE-${Date.now()}`,
      customerName: 'E2E otillåten ändring',
      invoiceDate: `${year}-10-04`,
      serviceDate: `${year}-10-04`,
      dueDate: `${year}-10-25`,
      grossAmount: 2500,
      vatTreatment: 'taxable',
      vatRate: 25,
      attachmentUrl: `blocked/${Date.now()}.pdf`,
    }),
  })
  expect(error?.message ?? '').toMatch(messagePattern)
}

async function recordPaymentByRpc(
  supabase: SupabaseClient,
  invoiceId: string,
  paymentDate: string,
  idempotencyKey: string
) {
  const { error } = await supabase.rpc('record_customer_invoice_payment_atomic', {
    p_invoice_id: invoiceId,
    p_payment_date: paymentDate,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    throw new Error(`record payment failed: ${error.message}`)
  }
}

async function bookYearEndByRpc(
  supabase: SupabaseClient,
  invoiceId: string,
  fiscalYear: number,
  idempotencyKey: string
) {
  const { error } = await supabase.rpc('book_customer_invoice_year_end_receivable_atomic', {
    p_invoice_id: invoiceId,
    p_fiscal_year: fiscalYear,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    throw new Error(`book year-end receivable failed: ${error.message}`)
  }
}

async function settleReceivableByRpc(
  supabase: SupabaseClient,
  invoiceId: string,
  paymentDate: string,
  idempotencyKey: string
) {
  const { error } = await supabase.rpc('settle_customer_invoice_receivable_atomic', {
    p_invoice_id: invoiceId,
    p_payment_date: paymentDate,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    throw new Error(`settle receivable failed: ${error.message}`)
  }
}

async function undoPaymentByRpc(
  supabase: SupabaseClient,
  invoiceId: string,
  idempotencyKey: string
) {
  const { data, error } = await supabase.rpc('undo_customer_invoice_payment_atomic', {
    p_invoice_id: invoiceId,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    throw new Error(`undo payment failed: ${error.message}`)
  }
  return data
}

async function expectUndoPaymentFailure(
  supabase: SupabaseClient,
  invoiceId: string,
  messagePattern: RegExp
) {
  const { error } = await supabase.rpc('undo_customer_invoice_payment_atomic', {
    p_invoice_id: invoiceId,
    p_idempotency_key: crypto.randomUUID(),
  })
  expect(error?.message ?? '').toMatch(messagePattern)
}

async function expectYearEndWrongYearFailure(
  supabase: SupabaseClient,
  invoiceId: string,
  fiscalYear: number
) {
  const { error } = await supabase.rpc('book_customer_invoice_year_end_receivable_atomic', {
    p_invoice_id: invoiceId,
    p_fiscal_year: fiscalYear,
    p_idempotency_key: crypto.randomUUID(),
  })
  expect(error?.message ?? '').toMatch(/hör till bokslut/i)
}

async function expectInvoiceFacts(
  supabase: SupabaseClient,
  invoiceNumber: string,
  expected: {
    customerName: string
    invoiceDate: string
    grossAmount: number
    attachmentUrl: string
  }
) {
  const { data, error } = await supabase
    .from('customer_invoices')
    .select('customer_name, invoice_date, gross_amount, attachment_url')
    .eq('invoice_number', invoiceNumber)
    .single()
  if (error) {
    throw new Error(`invoice fact lookup failed: ${error.message}`)
  }
  expect(data.customer_name).toBe(expected.customerName)
  expect(data.invoice_date).toBe(expected.invoiceDate)
  expect(Number(data.gross_amount)).toBe(expected.grossAmount)
  expect(data.attachment_url).toBe(expected.attachmentUrl)
}

async function closeYearByRpc(supabase: SupabaseClient, targetYear: number) {
  const { error } = await supabase.rpc('close_year_atomic', {
    p_year: targetYear,
  })
  if (error) {
    throw new Error(`close year failed: ${error.message}`)
  }
}

function invoiceRpcPayload(payload: InvoicePayload) {
  return {
    invoice_number: payload.invoiceNumber,
    customer_name: payload.customerName,
    customer_country: 'SE',
    currency: 'SEK',
    invoice_date: payload.invoiceDate,
    service_date: payload.serviceDate,
    due_date: payload.dueDate,
    gross_amount: payload.grossAmount,
    vat_treatment: payload.vatTreatment,
    vat_rate: payload.vatRate,
    attachment_url: payload.attachmentUrl,
  }
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
