import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'

// Exercise the real React hook, boundary, dashboard and NE in Chromium.
// All data dependencies are replaced at bundle time; no network/DB is used.
const directory = await mkdtemp(join(tmpdir(), 'sololedger-kan78-'))
let browser
const baseline = process.argv.includes('--reproduce-before')
try {
  const outfile = join(directory, 'harness.js')
  await build({
    entryPoints: ['tests/fixtures/accountingLoadHarness.tsx'], bundle: true,
    outfile, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { KAN78_BASELINE: String(baseline) },
    plugins: [{ name: 'synthetic-accounting', setup(builder) {
      if (baseline) builder.onLoad({ filter: /useAccountingData\.ts$/ }, () => ({ contents: execFileSync('git', ['show', 'e7f1442:src/hooks/useAccountingData.ts'], { encoding: 'utf8' }), loader: 'ts', resolveDir: resolve('src/hooks') }))
      builder.onResolve({ filter: /(?:accountingService|supabaseClient|setupDefaultAccounts|dashboardVat|transactionHistoryLoader)(?:\.ts)?$/ }, () => ({ path: resolve('tests/fixtures/accountingLoadMocks.ts') }))
    } }],
  })
  const bundle = await readFile(outfile)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => route.abort())
  await page.setContent('<html><meta charset="utf-8"><div id="root"></div></html>')
  await page.addScriptTag({ content: bundle.toString('utf8') })
  async function batch() {
    await page.waitForFunction(() => window.harness?.pending().length >= 6)
    return page.evaluate(() => Math.max(...window.harness.pending().map(item => item.group)))
  }
  async function finish(group, amount, failKind) { await page.evaluate(([g, a, f]) => window.harness.finish(g, a, f), [group, amount, failKind]) }
  async function amount(value) { await page.waitForFunction(v => document.querySelector('[data-testid="amount"]')?.textContent === String(v), value) }
  async function select(owner, year) {
    assert.equal(await page.evaluate(([u, y]) => window.harness.select(u, y), [owner, year]), true, 'stale values hidden in the first render')
  }
  async function hidden() { assert.equal(await page.locator('[data-testid="values"]').count(), 0) }
  await finish(await batch(), 126); await amount(126)
  if (baseline) {
    await page.evaluate(() => window.harness.select('company-a', 2027))
    await finish(await batch(), 227, 'ne')
    await page.waitForFunction(() => window.harness.pending().length === 0)
    await amount(126)
    assert.equal(await page.getByTestId('year').innerText(), '2027')
    console.log('PASS reproduced original KAN-78: year 2027 displays old 2026 amount 126 after NE failure')
    process.exitCode = 0
  } else {
  console.log('PASS 2026 successful load; real dashboard and NE rendered')
  await select('company-a', 2027); await finish(await batch(), 227); await amount(227)
  console.log('PASS 2026 -> 2027 success, immediate masking')
  for (const kind of ['balances', 'cumulative', 'ne', 'history', 'vat', 'lock', 'missing-ne']) {
    await select('company-a', 2026); await finish(await batch(), 126); await amount(126)
    await select('company-a', 2027); await finish(await batch(), 227, kind)
    await page.getByRole('alert').waitFor(); await hidden()
    assert.match(await page.getByRole('alert').innerText(), /2027.*Inga belopp visas/)
    const visible = await page.evaluate(() => window.harness.visible())
    assert.deepEqual(visible, { balances: {}, ne: null, vat: null, history: [], ready: false })
    await page.getByRole('button', { name: 'Försök igen' }).click()
    await hidden(); await finish(await batch(), 327); await amount(327)
    console.log(`PASS ${kind} failure hides all financial views; retry recovers`)
  }
  await select('company-a', 2028); const old = await batch()
  await select('company-a', 2029); const middle = await batch()
  await select('company-a', 2028); const newest = await batch()
  await finish(newest, 428); await amount(428)
  await finish(middle, 529); await finish(old, 628)
  await amount(428)
  console.log('PASS rapid A -> B -> A, replies out of order')
  await page.evaluate(() => { void window.harness.refresh() }); const refreshOld = await batch()
  await page.evaluate(() => { void window.harness.refresh() }); const refreshNew = await batch()
  await finish(refreshNew, 728); await amount(728)
  await finish(refreshOld, 828, 'ne'); await amount(728)
  console.log('PASS overlapping refreshes in same year, stale failure ignored')
  await page.evaluate(() => { void window.harness.refresh() }); const userOld = await batch()
  await select('company-b', 2028); const userNew = await batch()
  await finish(userNew, 928); await amount(928)
  await finish(userOld, 1028); await amount(928)
  console.log('PASS user/company switch in same year')
  await page.evaluate(() => { void window.harness.refresh() }); const logoutOld = await batch()
  await select(null, 2028); await finish(logoutOld, 1128); await hidden()
  assert.equal((await page.evaluate(() => window.harness.visible())).ready, false)
  console.log('PASS logout invalidates pending replies')
  await select('company-b', 2030); await finish(await batch(), 0); await amount(0)
  assert.equal(await page.getByTestId('history').innerText(), 'Tomt år')
  assert.equal(await page.getByText(/Kunde inte hämta ekonomiska uppgifter/).count(), 0)
  console.log('PASS genuine empty year remains distinct from read failure')
  await page.evaluate(() => window.harness.setBootstrapError(true))
  await select('company-b', 2031)
  await page.getByRole('alert').filter({ hasText: /Kunde inte hämta ekonomiska/ }).waitFor()
  await hidden()
  await page.evaluate(() => window.harness.setBootstrapError(false))
  await page.getByRole('button', { name: 'Försök igen' }).click()
  await finish(await batch(), 131); await amount(131)
  console.log('PASS initial account lookup failure and retry; React StrictMode')
  assert.deepEqual(errors, [], 'No rendering errors')
  // Verify that the application wires the boundary and independently loaded views.
  const source = await readFile('src/app/page.tsx', 'utf8')
  assert.match(source, /<AccountingDataBoundary[\s\S]*<DashboardOverview[\s\S]*<NEBilaga[\s\S]*<\/AccountingDataBoundary>/)
  const dashboard = await readFile('src/components/DashboardOverview.tsx', 'utf8')
  assert.match(dashboard, /<OverviewCards\b/)
  assert.match(source, /<DashboardOverview\s+owner=\{user.id\}/)
  for (const component of ['CustomerInvoicesPanel', 'FixedAssetsPanel', 'NEBilaga']) {
    assert.match(source, new RegExp(`<${component}\\s+key=\\{\x60\\$\\{user.id\\}:\\$\\{selectedYear\\}\x60\\}`))
  }
  console.log('PASS application coverage: dashboard/NE boundary and owner/year keys')
  }
} finally {
  await browser?.close()
  await rm(directory, { recursive: true, force: true })
}
