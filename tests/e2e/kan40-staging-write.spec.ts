import { expect, test, type Dialog, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { assertWriteE2EEnvironment } from '../../scripts/e2e-preflight.mjs'

const authFile = 'tests/e2e/.auth/sololedger-playwright-e2e.storageState.json'
const categoryId = 'e2e_checkkredit_2330'
const categoryName = 'E2E Checkräkningskredit 2330'
const bookingDescription = `E2E KAN-40 checkräkningskredit 2330 ${Date.now()}`
const testYear = 2026
const bookingDate = `${testYear}-12-31`
const bookingDateText = `31/12/${testYear}`
const bookingAmount = 1000
const bankAccount = '1930'
const loanAccount = '2330'

type E2EReadClient = any

interface TransactionRow {
  id: string
  date: string
  description: string
  type: string | null
  vat_rate: number | string | null
  is_correction: boolean | null
  corrects_ver_nr: number | null
}

interface JournalRow {
  account_number: string
  debit: number | string | null
  credit: number | string | null
  ver_nr: number | null
}

interface BookingVerification {
  transaction: TransactionRow
  journalRows: JournalRow[]
  verNr: number
}

test.describe('KAN-40 staging write acceptance', () => {
  test.setTimeout(90_000)

  test.beforeAll(() => {
    assertWriteE2EEnvironment()
  })

  test('treats the created 2330 booking as B13 debt and corrects it', async ({ page }) => {
    const supabase = await createE2EReadClient()
    const initialB13 = await getLoanDebtB13(supabase)
    const initialNegativeBank = await getUnclassifiedNegativeBank(supabase)

    await login(page)
    await page.context().storageState({ path: authFile })

    await ensureCheckCreditCategory(page)
    const booking = await bookCheckCredit(page, supabase)
    await expectLoanDebtDelta(supabase, initialB13, bookingAmount)
    await expectNegativeBankDelta(supabase, initialNegativeBank, bookingAmount)
    await verifyNeB13(page, initialB13 + bookingAmount)
    await correctCheckCreditBooking(page, booking.verNr)
    await verifyCorrection(supabase, booking.verNr)
    await verifyCleanup(supabase, initialB13, initialNegativeBank)
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

async function ensureCheckCreditCategory(page: Page) {
  if (await checkCreditCategoryOptionExists(page)) {
    return
  }

  await page.getByRole('button', { name: 'Kontoplan' }).click()

  if (await page.getByText(categoryName, { exact: true }).first().isVisible().catch(() => false)) {
    return
  }

  await page.getByRole('button', { name: /\+ Lägg till egen kategori manuellt/ }).click()
  await page.getByPlaceholder('resor', { exact: true }).fill(categoryId)
  await page.getByPlaceholder('Resor', { exact: true }).fill(categoryName)
  await page.getByPlaceholder('T.ex. tåg, taxi, parkering').fill('E2E staging: 1930 D / 2330 K')
  await page.getByPlaceholder('5800').fill('1930')
  await page.getByPlaceholder('1930').fill('2330')
  const accountForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Spara konto' }),
  }).first()
  const defaultVatSelect = selectAfterLabel(accountForm, /^Standard moms %$/)
  await defaultVatSelect.selectOption('0')
  await expect(defaultVatSelect).toHaveValue('0')
  await page.getByRole('button', { name: 'Spara konto' }).click()
  await expect(page.getByText(categoryName, { exact: true }).first()).toBeVisible({ timeout: 15_000 })
  await expectCheckCreditCategoryOption(page)
}

async function bookCheckCredit(page: Page, supabase: E2EReadClient): Promise<BookingVerification> {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  const form = bookkeepingForm(page)
  const dateInput = form.getByRole('textbox', { name: 'Datum', exact: true })
  const categorySelect = selectAfterLabel(form, /^Kategori$/)
  const descriptionInput = inputAfterLabel(form, /^Beskrivning$/)
  const vatRateSelect = selectAfterLabel(form, /^Moms på fakturan$/)
  const amountInput = inputAfterLabel(form, /^Belopp(?: inkl\. moms)?$/)

  await dateInput.fill(bookingDateText)
  await categorySelect.selectOption(categoryId)
  await descriptionInput.fill(bookingDescription)
  await vatRateSelect.selectOption('0')
  await amountInput.fill(String(bookingAmount))

  await expect(dateInput).toHaveValue(bookingDateText)
  await expect(categorySelect).toHaveValue(categoryId)
  await expect(descriptionInput).toHaveValue(bookingDescription)
  await expect(vatRateSelect).toHaveValue('0')
  await expect(amountInput).toHaveValue(String(bookingAmount))

  await form.getByRole('button', { name: 'Bokför' }).click()
  await expect(bookingTransactionRow(page)).toHaveCount(1, { timeout: 20_000 })
  await expect(bookingTransactionRow(page)).toBeVisible()

  const booking = await readBookingByDescription(supabase)

  expect(booking.transaction.date).toBe(bookingDate)
  expect(booking.transaction.type).toBe(categoryId)
  expect(Number(booking.transaction.vat_rate)).toBe(0)
  expect(booking.transaction.is_correction).toBe(false)
  expect(booking.transaction.corrects_ver_nr).toBeNull()
  expectOriginalJournal(booking.journalRows)

  return booking
}

async function checkCreditCategoryOptionExists(page: Page) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  const form = bookkeepingForm(page)

  const categoryOption = selectAfterLabel(form, /^Kategori$/).locator(`option[value="${categoryId}"]`)

  try {
    await expect(categoryOption).toHaveCount(1, { timeout: 5_000 })
    return true
  } catch {
    return false
  }
}

async function expectCheckCreditCategoryOption(page: Page) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  const form = bookkeepingForm(page)

  await expect(selectAfterLabel(form, /^Kategori$/).locator(`option[value="${categoryId}"]`))
    .toHaveCount(1, { timeout: 15_000 })
}

async function verifyNeB13(page: Page, expectedB13: number) {
  await page.getByRole('button', { name: 'NE-Bilaga' }).click()
  await selectAccountingYear(page, testYear)
  await expect(neB13Amount(page, expectedB13)).toBeVisible({ timeout: 20_000 })
}

async function correctCheckCreditBooking(page: Page, verNr: number) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  page.once('dialog', async (dialog: Dialog) => {
    await dialog.accept()
  })

  const row = bookingTransactionRow(page)
  await expect(row).toHaveCount(1)
  await row.getByTitle('Korrigera').click()
  await expect(page.getByText(new RegExp(`Rättar VER-${verNr}`)).first()).toBeVisible({ timeout: 20_000 })
}

async function verifyCorrection(supabase: E2EReadClient, originalVerNr: number) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, description, type, vat_rate, is_correction, corrects_ver_nr')
    .eq('is_correction', true)
    .eq('corrects_ver_nr', originalVerNr)

  if (error) throw error

  const corrections = (data ?? []) as TransactionRow[]
  expect(corrections).toHaveLength(1)

  const correction = corrections[0]
  expect(correction.type).toBe(categoryId)
  expect(correction.is_correction).toBe(true)
  expect(correction.corrects_ver_nr).toBe(originalVerNr)

  const journalRows = await readJournalRows(supabase, correction.id)
  expectCorrectionJournal(journalRows, originalVerNr)
}

async function verifyCleanup(
  supabase: E2EReadClient,
  initialB13: number,
  initialNegativeBank: number
) {
  expect(await getLoanDebtB13(supabase)).toBe(initialB13)
  expect(await getUnclassifiedNegativeBank(supabase)).toBe(initialNegativeBank)
}

function bookkeepingForm(page: Page) {
  return page.locator('form').filter({
    has: page.getByRole('button', { name: 'Bokför' }),
  }).first()
}

function inputAfterLabel(form: Locator, labelText: RegExp) {
  return form.locator('label').filter({ hasText: labelText }).locator('xpath=following-sibling::input[1]')
}

function selectAfterLabel(form: Locator, labelText: RegExp) {
  return form.locator('label').filter({ hasText: labelText }).locator('xpath=following-sibling::select[1]')
}

function bookingTransactionRow(page: Page) {
  return page.locator('tr').filter({
    hasText: bookingDescription,
    has: page.getByTitle('Korrigera'),
  })
}

async function selectAccountingYear(page: Page, year: number) {
  const yearSelect = page.locator('select').filter({
    has: page.locator(`option[value="${year}"]`),
  }).first()

  await yearSelect.selectOption(String(year))
  await expect(yearSelect).toHaveValue(String(year))
}

async function createE2EReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const email = process.env.SOLOLEDGER_E2E_EMAIL
  const password = process.env.SOLOLEDGER_E2E_PASSWORD

  if (!url || !anonKey || !email || !password) {
    throw new Error('Missing staging E2E read credentials.')
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return supabase
}

async function readBookingByDescription(supabase: E2EReadClient): Promise<BookingVerification> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, date, description, type, vat_rate, is_correction, corrects_ver_nr')
    .eq('description', bookingDescription)

  if (error) throw error

  const transactions = (data ?? []) as TransactionRow[]
  expect(transactions).toHaveLength(1)

  const transaction = transactions[0]
  const journalRows = await readJournalRows(supabase, transaction.id)
  const verNr = singleVerNr(journalRows)

  return { transaction, journalRows, verNr }
}

async function readJournalRows(
  supabase: E2EReadClient,
  transactionId: string
): Promise<JournalRow[]> {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('account_number, debit, credit, ver_nr')
    .eq('transaction_id', transactionId)
    .order('account_number', { ascending: true })

  if (error) throw error
  return (data ?? []) as JournalRow[]
}

async function getLoanDebtB13(supabase: E2EReadClient) {
  const balances = await getCumulativeBalances(supabase)
  const rawLoanBalance = Object.entries(balances)
    .filter(([accountNumber]) => accountNumber >= '2300' && accountNumber <= '2399')
    .reduce((sum, [, balance]) => sum + balance, 0)

  return round2(Math.max(0, -rawLoanBalance))
}

async function getUnclassifiedNegativeBank(supabase: E2EReadClient) {
  const balances = await getCumulativeBalances(supabase)
  const negativeBank = Object.entries(balances)
    .filter(([accountNumber]) => accountNumber >= '1900' && accountNumber <= '1999')
    .reduce((sum, [, balance]) => sum + Math.max(0, -balance), 0)

  return round2(negativeBank)
}

async function getCumulativeBalances(supabase: E2EReadClient) {
  const { data, error } = await supabase.rpc('get_cumulative_account_balances', {
    p_through_date: `${testYear}-12-31`,
  })

  if (error) throw error

  const balances: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ account_number: string | number; balance: number | string | null }>) {
    balances[String(row.account_number)] = Number(row.balance ?? 0)
  }

  return balances
}

async function expectLoanDebtDelta(
  supabase: E2EReadClient,
  initialB13: number,
  expectedDelta: number
) {
  expect(await getLoanDebtB13(supabase)).toBe(round2(initialB13 + expectedDelta))
}

async function expectNegativeBankDelta(
  supabase: E2EReadClient,
  initialNegativeBank: number,
  expectedDebitIncrease: number
) {
  const expected = round2(Math.max(0, initialNegativeBank - expectedDebitIncrease))
  expect(await getUnclassifiedNegativeBank(supabase)).toBe(expected)
}

function expectOriginalJournal(rows: JournalRow[]) {
  expectBalancedJournal(rows)
  expectJournalLine(rows, bankAccount, bookingAmount, 0)
  expectJournalLine(rows, loanAccount, 0, bookingAmount)
}

function expectCorrectionJournal(rows: JournalRow[], originalVerNr: number) {
  expectBalancedJournal(rows)
  const correctionVerNr = singleVerNr(rows)
  expect(correctionVerNr).not.toBe(originalVerNr)
  expectJournalLine(rows, bankAccount, 0, bookingAmount)
  expectJournalLine(rows, loanAccount, bookingAmount, 0)
}

function expectBalancedJournal(rows: JournalRow[]) {
  expect(rows).toHaveLength(2)
  expect(round2(rows.reduce((sum, row) => sum + Number(row.debit ?? 0), 0))).toBe(bookingAmount)
  expect(round2(rows.reduce((sum, row) => sum + Number(row.credit ?? 0), 0))).toBe(bookingAmount)
}

function expectJournalLine(
  rows: JournalRow[],
  accountNumber: string,
  expectedDebit: number,
  expectedCredit: number
) {
  const row = rows.find(entry => entry.account_number === accountNumber)
  expect(row).toBeTruthy()
  expect(Number(row?.debit ?? 0)).toBe(expectedDebit)
  expect(Number(row?.credit ?? 0)).toBe(expectedCredit)
}

function singleVerNr(rows: JournalRow[]) {
  const verNrs = Array.from(new Set(rows.map(row => row.ver_nr)))
  expect(verNrs).toHaveLength(1)
  expect(verNrs[0]).not.toBeNull()
  return Number(verNrs[0])
}

function neB13Amount(page: Page, amount: number) {
  return page.getByText(new RegExp(`B13\\s+Låneskulder\\s+${escapeRegex(formatKr(amount))}`))
}

function formatKr(amount: number) {
  return `${amount.toLocaleString('sv-SE')} kr`
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}
