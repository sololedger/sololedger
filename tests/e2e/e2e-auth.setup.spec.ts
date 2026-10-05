import { test as setup } from '@playwright/test'

const authFile = 'tests/e2e/.auth/sololedger-playwright-e2e.storageState.json'

setup('authenticate staging E2E user', async ({ page }) => {
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
  await page.context().storageState({ path: authFile })
})
