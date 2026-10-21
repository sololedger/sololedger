import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const reproduce = process.argv.includes('--reproduce-before')
const artifacts = `coverage/kan105-auth-focus-${Date.now()}`
await mkdir(artifacts, { recursive: true })
const modules = {
  subscriptionLimits: 'export const FREE_TRANSACTION_LIMIT=15; export const getFreeTransactionUsage=async()=>0;export const canCreateTransactions=()=>true;',
  usePaymentAccountRoleConfiguration: 'export const usePaymentAccountRoleConfiguration=()=>({configuredRoles:[],loaded:true,loading:false,error:null,reload:async()=>{}});',
  accountingService: `export {getUserId,getAccountBalances,getBalanceSheetBalances,getNEData,isYearClosed} from './tests/fixtures/accountingLoadMocks';export const getCustomerInvoices=async()=>[];export const bookStandardBookingAttempt=async()=>{throw Error('No writes')};export const bookVatV2EuServiceReverseChargeTransaction=bookStandardBookingAttempt;export const createCorrectionTransaction=bookStandardBookingAttempt;export const closeYear=bookStandardBookingAttempt;export const updateTransaction=bookStandardBookingAttempt;`,
}
const bundle = await build({ entryPoints: ['tests/fixtures/authFocusHarness.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', plugins: [{ name: 'offline-auth-focus', setup(b) {
  if (reproduce) b.onLoad({ filter: /useAuth\.ts$/ }, () => ({ contents: execFileSync('git', ['show', 'af412c0ea06219ea625f341f15d158a84ca6c0dc:src/hooks/useAuth.ts'], { encoding: 'utf8' }), loader: 'ts', resolveDir: resolve('src/hooks') }))
  b.onResolve({ filter: /.*/ }, args => {
    const leaf = args.path.split('/').at(-1)
    if (leaf === 'supabaseClient') return { path: resolve('tests/fixtures/authFocusMocks.ts') }
    if (leaf === 'withdrawalService') return { path: resolve('tests/fixtures/withdrawalMocks.ts') }
    if (['setupDefaultAccounts', 'dashboardVat', 'transactionHistoryLoader'].includes(leaf)) return { path: resolve('tests/fixtures/accountingLoadMocks.ts') }
    if (modules[leaf]) return { path: leaf, namespace: 'focus' }
    if (args.importer.replaceAll('\\', '/').endsWith('/src/app/page.tsx') && args.path.startsWith('@/components/') && !['AccountingDataBoundary', 'DashboardOverview', 'SubscriptionGuard'].includes(leaf)) return { path: 'panel-' + leaf, namespace: 'focus' }
  })
  b.onLoad({ filter: /.*/, namespace: 'focus' }, args => ({ contents: modules[args.path] ?? (args.path === 'panel-Layout' ? 'export default function Layout(p){return <main>{p.children}</main>}' : 'export default function Panel(){return null}'), loader: 'tsx', resolveDir: process.cwd() }))
} }] })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'))
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', route => route.abort())
    await page.setContent('<html lang="sv"><meta charset="utf-8"><div id="root"></div></html>')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.waitForFunction(() => window.focusTest)
    const call = (name, ...args) => page.evaluate(([n, a]) => window.focusTest[n](...a), [name, args])
    async function login(owner) {
      await call('event', owner)
      await expect.poll(() => call('pendingProfiles').then(p => p.length)).toBe(1)
      await call('finishProfile', 0)
      await finishData()
    }
    async function finishData() {
      await page.waitForFunction(() => window.focusTest.accountingPending().length >= 6)
      // Initial hydration can cancel a prior year's read. Resolve every batch;
      // the real hook must accept only the current owner/year/sequence.
      const groups = await page.evaluate(() => [...new Set(window.focusTest.accountingPending().map(p => p.group))])
      for (const group of groups) await call('finishAccounting', group, 1250)
      await expect(page.getByRole('button', { name: 'Visa beräkning och underlag' })).toBeVisible()
      await page.waitForFunction(() => window.focusTest.withdrawal.pending().length > 0)
      const pending = await page.evaluate(() => window.focusTest.withdrawal.pending())
      for (const p of pending) await page.evaluate(i => window.focusTest.withdrawal.finish(i), p.index)
    }
    await login('A')
    await page.getByRole('button', { name: 'Visa beräkning och underlag' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.getByLabel('Vad vill du kontrollera?').selectOption('buffer')
    await page.getByLabel('Belopp i kronor', { exact: true }).fill('777')
    const reads = await page.evaluate(() => window.focusTest.withdrawal.pending().length)
    await call('installVisibilityRecovery', 'A')
    // Drive the installed Supabase Auth SDK's real hidden -> visible recovery
    // path using a synthetic session; its SIGNED_IN callback reaches useAuth.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      window.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => call('pendingProfiles').then(p => p.length)).toBe(1)
    if (reproduce) {
      await expect(dialog).toHaveCount(0)
      await call('finishProfile', 0)
      await expect(page.getByRole('status')).toContainText('Laddar ekonomiska uppgifter för 2026')
      results.push({ width, reproduced: true, reason: 'same-owner SIGNED_IN clears profile, unmounts modal and changes accounting subscription dependency' })
      await page.screenshot({ path: `${artifacts}/before-${width}.png` })
      await page.close(); continue
    }
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel('Belopp i kronor', { exact: true })).toHaveValue('777')
    assert.equal(await call('canWrite'), false, 'writes blocked during renewed profile validation')
    await call('finishProfile', 0)
    await expect(dialog).toBeVisible()
    assert.equal(await call('canWrite'), true)
    assert.equal((await call('accountingPending')).length, 0, 'no unnecessary accounting reload')
    assert.equal(await page.evaluate(() => window.focusTest.withdrawal.pending().length), reads, 'no withdrawal reload')
    for (const event of ['TOKEN_REFRESHED', 'SIGNED_IN']) {
      // Focus/visibility are dispatched independently; Supabase's installed
      // recovery handler emits the same-owner event on returning to visible.
      await page.evaluate(() => { window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
      await call('event', 'A', event)
      await expect(dialog).toBeVisible()
      await call('finishProfile', 0)
      await expect(page.getByLabel('Belopp i kronor', { exact: true })).toHaveValue('777')
    }
    await page.clock.fastForward(35 * 60 * 1000)
    await call('event', 'A', 'TOKEN_REFRESHED')
    await expect(dialog).toBeVisible(); await call('finishProfile', 0)
    await page.screenshot({ path: `${artifacts}/after-${width}.png` })
    await call('event', 'A', 'USER_UPDATED')
    await expect(dialog).toHaveCount(0)
    assert.equal(await call('canWrite'), false, 'identity/permission update must re-enter the closed validation path')
    await call('finishProfile', 0); await finishData()
    await page.getByRole('button', { name: 'Visa beräkning och underlag' }).click()
    await call('event', 'A'); await call('event', 'B')
    await expect(dialog).toHaveCount(0)
    assert.equal(await call('canWrite'), false)
    await call('finishProfile', 1)
    await call('finishProfile', 0, true)
    await finishData()
    await page.getByRole('button', { name: 'Visa beräkning och underlag' }).click()
    await expect(dialog).toBeVisible()
    await call('event', null)
    await expect(dialog).toHaveCount(0)
    assert.equal(await call('canWrite'), false)
    await login('A')
    await page.getByRole('button', { name: 'Visa beräkning och underlag' }).click()
    await call('event', 'A'); await call('finishProfile', 0, true)
    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('Kunde inte ladda din profil', { exact: true })).toBeVisible()
    assert.equal(await call('canWrite'), false, 'failed/denied validation must close access')
    assert.deepEqual(errors, [])
    results.push({ width, status: 'PASS', sameOwnerPreservesModalAndDraft: true, noAccountingReload: true, refreshStillValidates: true, identityUpdateHidesDuringValidation: true, logoutAndAccountSwitchHideImmediately: true, failedProfileClosesAccess: true })
    await page.close()
  }
  await writeFile(`${artifacts}/result.json`, JSON.stringify({ reproduce, results }, null, 2))
  console.log(JSON.stringify({ artifacts, reproduce, results }))
} finally { await browser.close() }
