import { expect, test } from '@playwright/test'

test.describe('public authentication UI', () => {
  test('keeps a question link through reload and the signed-out reset form', async ({ page }) => {
    await page.goto('/?help=ne-r14')
    await expect(page.getByRole('button', { name: 'Logga in', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Hjälp & FAQ', exact: true })).toHaveCount(0)
    await page.reload()
    await page.getByRole('button', { name: 'Glömt lösenord?', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Skicka återställningslänk', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\?help=ne-r14$/)
    await page.getByRole('button', { name: 'Tillbaka till inloggning', exact: true }).click()
    await expect(page).toHaveURL(/\?help=ne-r14$/)
  })

  test('renders the login screen without an existing session', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'SoloLedger' })).toBeVisible()
    await expect(page.getByText('Fleranvändarsystem')).toBeVisible()
    await expect(page.getByPlaceholder('E-postadress')).toBeVisible()
    await expect(page.getByPlaceholder('Lösenord')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Logga in' })).toBeVisible()
  })

  test('can switch between login, registration, and password reset views', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Inget konto? Skapa ett här' }).click()
    await expect(page.getByText('Skapa nytt konto')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrera dig' })).toBeVisible()

    await page.getByRole('button', { name: 'Har du redan ett konto? Logga in' }).click()
    await expect(page.getByText('Fleranvändarsystem')).toBeVisible()

    await page.getByRole('button', { name: 'Glömt lösenord?' }).click()
    await expect(page.getByText('Återställ lösenord')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skicka återställningslänk' })).toBeVisible()

    await page.getByRole('button', { name: 'Tillbaka till inloggning' }).click()
    await expect(page.getByRole('button', { name: 'Logga in' })).toBeVisible()
  })
})
