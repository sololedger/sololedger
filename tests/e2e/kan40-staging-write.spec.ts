import { expect, test, type Dialog, type Locator, type Page } from '@playwright/test'
import { assertWriteE2EEnvironment } from '../../scripts/e2e-preflight.mjs'

const authFile = 'tests/e2e/.auth/sololedger-playwright-e2e.storageState.json'
const categoryId = 'e2e_checkkredit_2330'
const categoryName = 'E2E Checkräkningskredit 2330'
const bookingDescription = `E2E KAN-40 checkräkningskredit 2330 ${Date.now()}`

test.describe('KAN-40 staging write acceptance', () => {
  test.setTimeout(90_000)

  test.beforeAll(() => {
    assertWriteE2EEnvironment()
  })

  test('treats 2330 as B13 debt without negative cash/bank warning', async ({ page }) => {
    await login(page)
    await page.context().storageState({ path: authFile })

    await ensureCheckCreditCategory(page)
    await bookCheckCredit(page)
    await verifyNeB13(page)
    await correctCheckCreditBooking(page)
    await verifyCleanup(page)
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

async function bookCheckCredit(page: Page) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  const form = bookkeepingForm(page)
  const dateInput = form.getByRole('textbox', { name: 'Datum', exact: true })
  const categorySelect = selectAfterLabel(form, /^Kategori$/)
  const descriptionInput = inputAfterLabel(form, /^Beskrivning$/)
  const vatRateSelect = selectAfterLabel(form, /^Moms på fakturan$/)
  const amountInput = inputAfterLabel(form, /^Belopp(?: inkl\. moms)?$/)

  await dateInput.fill('31/12/2026')
  await categorySelect.selectOption(categoryId)
  await descriptionInput.fill(bookingDescription)
  await vatRateSelect.selectOption('0')
  await amountInput.fill('1000')

  await expect(dateInput).toHaveValue('31/12/2026')
  await expect(categorySelect).toHaveValue(categoryId)
  await expect(descriptionInput).toHaveValue(bookingDescription)
  await expect(vatRateSelect).toHaveValue('0')
  await expect(amountInput).toHaveValue('1000')

  await form.getByRole('button', { name: 'Bokför' }).click()
  await expect(bookingTransactionRow(page)).toHaveCount(1, { timeout: 20_000 })
  await expect(bookingTransactionRow(page)).toBeVisible()
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

async function verifyNeB13(page: Page) {
  await page.getByRole('button', { name: 'NE-Bilaga' }).click()
  await expect(page.getByText(/B13.*Låneskulder/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('1 000 kr').first()).toBeVisible()
  await expect(page.getByText(/BALANSRÄKNINGEN BALANSERAR/i)).toBeVisible()
  await expect(page.getByText(/NEGATIVT SALDO I KASSA\/BANK/i)).toHaveCount(0)
}

async function correctCheckCreditBooking(page: Page) {
  await page.getByRole('button', { name: 'Bokföring' }).click()

  page.once('dialog', async (dialog: Dialog) => {
    await dialog.accept()
  })

  const row = bookingTransactionRow(page)
  await expect(row).toHaveCount(1)
  await row.getByTitle('Korrigera').click()
  await expect(page.getByText(/Rättar VER-/).first()).toBeVisible({ timeout: 20_000 })
}

async function verifyCleanup(page: Page) {
  await page.getByRole('button', { name: 'NE-Bilaga' }).click()
  await expect(page.getByText(/BALANSRÄKNINGEN BALANSERAR/i)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/NEGATIVT SALDO I KASSA\/BANK/i)).toHaveCount(0)
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
