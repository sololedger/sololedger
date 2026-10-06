import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Dialog, type Page } from '@playwright/test'
import { assertWriteE2EEnvironment } from '../../scripts/e2e-preflight.mjs'

const authFile = 'tests/e2e/.auth/sololedger-playwright-e2e.storageState.json'
const year = 2026

const checkCreditCategoryId = 'e2e_checkkredit_2330'
const checkCreditCategoryName = 'E2E Checkräkningskredit 2330'

const imbalanceCategoryId = 'e2e_kan42_unmapped_1200'
const imbalanceCategoryName = 'E2E KAN-42 obalans 1200/2018'

test.describe('KAN-42 staging write acceptance', () => {
  test.setTimeout(120_000)

  test.beforeAll(() => {
    assertWriteE2EEnvironment()
  })

  test('blocks unsafe year closing and allows balanced NE scenarios', async ({ page }) => {
    await login(page)
    await page.context().storageState({ path: authFile })
    await cleanupOwnKan42Bookings(page)

    await ensureCustomCategory(page, {
      id: imbalanceCategoryId,
      name: imbalanceCategoryName,
      comment: 'E2E staging: unmapped 1200 D / 2018 K for KAN-42 close guard',
      debitAccount: '1200',
      creditAccount: '2018',
    })
    await ensureCustomCategory(page, {
      id: checkCreditCategoryId,
      name: checkCreditCategoryName,
      comment: 'E2E staging: 1930 D / 2330 K',
      debitAccount: '1930',
      creditAccount: '2330',
    })

    const imbalanceDescription = `E2E KAN-42 obalans ${Date.now()}`
    await bookTransaction(page, imbalanceCategoryId, imbalanceDescription)
    await verifyYearCloseBlockedInUi(
      page,
      /Balansdifferens/i,
      /Balansräkningen måste balansera innan räkenskapsåret låses/i
    )
    await expectDirectCloseYearFailure(/balansräkningen inte balanserar/i)
    await correctBooking(page, imbalanceDescription)
    await verifyNeBalanced(page)

    const negativeBankDescription = `E2E KAN-42 negativ 1930 ${Date.now()}`
    await bookTransaction(page, 'bankavgift', negativeBankDescription, '999999')
    await verifyYearCloseBlockedInUi(
      page,
      /Negativt saldo i kassa\/bank/i,
      /Stäm av negativt saldo i kassa\/bank innan räkenskapsåret låses/i
    )
    await expectDirectCloseYearFailure(/negativt oklassat saldo/i)
    await correctBooking(page, negativeBankDescription)
    await verifyNeBalanced(page)

    const saleDescription = `E2E KAN-42 positiv 1930 ${Date.now()}`
    await bookTransaction(page, 'forsaljning', saleDescription)
    await verifyYearCloseAvailable(page)
    await correctBooking(page, saleDescription)
    await verifyNeBalanced(page)

    const checkCreditDescription = `E2E KAN-42 2330 skuld ${Date.now()}`
    await bookTransaction(page, checkCreditCategoryId, checkCreditDescription)
    await verifyYearCloseAvailable(page)
    await expect(page.getByText(/B13.*Låneskulder/)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/NEGATIVT SALDO I KASSA\/BANK/i)).toHaveCount(0)
    await correctBooking(page, checkCreditDescription)
    await verifyNeBalanced(page)
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

async function ensureCustomCategory(
  page: Page,
  category: {
    id: string
    name: string
    comment: string
    debitAccount: string
    creditAccount: string
  }
) {
  if (await categoryOptionExists(page, category.id)) {
    return
  }

  await page.getByRole('button', { name: 'Kontoplan' }).click()

  if (!(await page.getByText(category.name, { exact: true }).first().isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /\+ Lägg till egen kategori manuellt/ }).click()
    await page.getByPlaceholder('resor', { exact: true }).fill(category.id)
    await page.getByPlaceholder('Resor', { exact: true }).fill(category.name)
    await page.getByPlaceholder('T.ex. tåg, taxi, parkering').fill(category.comment)
    await page.getByPlaceholder('5800').fill(category.debitAccount)
    await page.getByPlaceholder('1930').fill(category.creditAccount)
    await page.locator('select').last().selectOption('0')
    await page.getByRole('button', { name: 'Spara konto' }).click()
    await expect(page.getByText(category.name, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  }

  await expectCategoryOption(page, category.id)
}

async function categoryOptionExists(page: Page, categoryId: string) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  const form = bookkeepingForm(page)
  const categorySelect = form.locator('select').filter({
    has: page.locator(`option[value="${categoryId}"]`),
  })

  try {
    await expect(categorySelect).toHaveCount(1, { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

async function expectCategoryOption(page: Page, categoryId: string) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  await expect(bookkeepingForm(page).locator('select').filter({
    has: page.locator(`option[value="${categoryId}"]`),
  })).toHaveCount(1, { timeout: 15_000 })
}

async function bookTransaction(
  page: Page,
  categoryId: string,
  description: string,
  amount = '1000'
) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  const form = bookkeepingForm(page)

  await form.getByLabel('Datum').fill(`31/12/${year}`)
  await form.locator('select').filter({
    has: page.locator(`option[value="${categoryId}"]`),
  }).selectOption(categoryId)
  await form.locator('input[type="text"]').filter({ visible: true }).nth(1).fill(description)
  await form.locator('select').filter({
    has: page.locator('option[value="0"]'),
  }).last().selectOption('0')
  await form.locator('input[type="number"]').fill(amount)
  await form.getByRole('button', { name: 'Bokför' }).click()
  await expect(page.getByText(description).first()).toBeVisible({ timeout: 20_000 })
}

async function verifyYearCloseBlockedInUi(
  page: Page,
  visibleWarning: RegExp,
  visibleReason: RegExp
) {
  await page.getByRole('button', { name: 'NE-Bilaga' }).click()
  await expect(page.getByText(visibleWarning).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(visibleReason)).toBeVisible()
  await expect(page.getByRole('button', { name: `Lås räkenskapsår ${year}` })).toBeDisabled()
}

async function verifyYearCloseAvailable(page: Page) {
  await page.getByRole('button', { name: 'NE-Bilaga' }).click()
  await expect(page.getByText(/BALANSRÄKNINGEN BALANSERAR/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/NEGATIVT SALDO I KASSA\/BANK/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: `Lås räkenskapsår ${year}` })).toBeEnabled()
}

async function verifyNeBalanced(page: Page) {
  await page.getByRole('button', { name: 'NE-Bilaga' }).click()
  await expect(page.getByText(/BALANSRÄKNINGEN BALANSERAR/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/NEGATIVT SALDO I KASSA\/BANK/i)).toHaveCount(0)
}

async function correctBooking(page: Page, description: string) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  page.once('dialog', async (dialog: Dialog) => {
    await dialog.accept()
  })

  const row = page.locator('tr').filter({ hasText: description }).first()
  await row.getByTitle('Korrigera').click()
  await expect(page.getByText(/Rättar VER-/).first()).toBeVisible({ timeout: 20_000 })
}

async function expectDirectCloseYearFailure(messagePattern: RegExp) {
  const supabase = await createAuthenticatedSupabaseClient()
  const { error } = await supabase.rpc('close_year_atomic', {
    p_year: year,
  })

  expect(error?.message ?? '').toMatch(messagePattern)
}

function bookkeepingForm(page: Page) {
  return page.locator('form').filter({
    has: page.getByRole('button', { name: 'Bokför' }),
  }).first()
}

async function cleanupOwnKan42Bookings(page: Page) {
  await cleanupOwnKan42BookingsByRpc()
  await page.getByRole('button', { name: 'Bokföring' }).click()
}

async function cleanupOwnKan42BookingsByRpc() {
  const supabase = await createAuthenticatedSupabaseClient()
  await cleanupOwnKan46SameYearUndoBlockers(supabase)

  const { data: transactions, error: transactionError } = await supabase
    .from('transactions')
    .select('id, is_correction, corrects_ver_nr')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .ilike('description', '%E2E KAN-42%')

  if (transactionError) {
    throw new Error(`KAN-42 cleanup transaction lookup failed: ${transactionError.message}`)
  }

  const txIds = (transactions ?? []).map(row => String(row.id))
  if (txIds.length === 0) {
    return
  }

  const { data: journalRows, error: journalError } = await supabase
    .from('journal_entries')
    .select('transaction_id, ver_nr')
    .in('transaction_id', txIds)

  if (journalError) {
    throw new Error(`KAN-42 cleanup journal lookup failed: ${journalError.message}`)
  }

  const verNrByTransactionId = new Map<string, number>()
  for (const row of journalRows ?? []) {
    verNrByTransactionId.set(String(row.transaction_id), Number(row.ver_nr))
  }

  const correctedVerNrs = new Set(
    (transactions ?? [])
      .filter(row => row.is_correction === true && row.corrects_ver_nr != null)
      .map(row => Number(row.corrects_ver_nr))
  )

  for (const transaction of transactions ?? []) {
    if (transaction.is_correction === true) {
      continue
    }

    const verNr = verNrByTransactionId.get(String(transaction.id))
    if (!verNr || correctedVerNrs.has(verNr)) {
      continue
    }

    const { error } = await supabase.rpc('create_correction_transaction_atomic', {
      p_original_tx_id: transaction.id,
    })

    if (error) {
      throw new Error(`KAN-42 cleanup correction failed: ${error.message}`)
    }

    correctedVerNrs.add(verNr)
  }
}

async function cleanupOwnKan46SameYearUndoBlockers(supabase: SupabaseClient) {
  const { data: invoices, error: invoiceError } = await supabase
    .from('customer_invoices')
    .select('id, invoice_date')
    .gte('invoice_date', `${year}-01-01`)
    .lte('invoice_date', `${year}-12-31`)
    .eq('payment_status', 'unpaid')
    .like('invoice_number', 'E2E-KAN-46-RPC-%-edited')

  if (invoiceError) {
    throw new Error(`KAN-46 blocker cleanup invoice lookup failed: ${invoiceError.message}`)
  }

  for (const invoice of invoices ?? []) {
    const invoiceId = String(invoice.id)
    const { data: bookings, error: bookingError } = await supabase
      .from('customer_invoice_bookings')
      .select('booking_kind')
      .eq('invoice_id', invoiceId)

    if (bookingError) {
      throw new Error(`KAN-46 blocker cleanup booking lookup failed: ${bookingError.message}`)
    }

    const hasYearEndReceivable = (bookings ?? []).some(
      booking => booking.booking_kind === 'year_end_receivable'
    )
    if (hasYearEndReceivable) {
      continue
    }

    const { error } = await supabase.rpc('record_customer_invoice_payment_atomic', {
      p_invoice_id: invoiceId,
      p_payment_date: invoice.invoice_date,
      p_idempotency_key: crypto.randomUUID(),
    })

    if (error) {
      throw new Error(`KAN-46 blocker cleanup payment failed: ${error.message}`)
    }
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
