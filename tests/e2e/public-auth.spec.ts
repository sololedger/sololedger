import { expect, test } from '@playwright/test'

test.describe('public authentication UI', () => {
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
