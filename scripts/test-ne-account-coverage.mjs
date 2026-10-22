/** Offline real NE service/render regression. No auth, database or remote transport. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'
import { parseSieFile } from '../src/lib/sieParser.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const compareHead = process.argv.includes('--compare-head')
const baseline = Object.fromEntries(await Promise.all(['accountingService.ts', '../components/NEBilaga.tsx'].map(async file => {
  const repoPath = path.posix.normalize('src/lib/' + file)
  return [file, compareHead ? execFileSync('git', ['show', 'HEAD:' + repoPath], { encoding: 'utf8' }) : await readFile(repoPath, 'utf8')]
})))
const bundle = await build({
  stdin: { contents: `export {getNEData} from './src/lib/accountingService'; export {default as NEBilaga} from './src/components/NEBilaga'; export {collectNeAccountCoverage} from './src/lib/neAccountCoverage'; export {getNEData as beforeNE} from 'before-service'; export {default as Before} from 'before-view'; export {calculateNeBalanceDiff} from './src/lib/neBalance'`, resolveDir: process.cwd(), loader: 'ts' },
  tsconfig: 'tsconfig.json', bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'offline-and-baseline', setup(b) {
    b.onResolve({ filter: /^before-/ }, args => ({ path: args.path, namespace: 'baseline' }))
    b.onLoad({ filter: /.*/, namespace: 'baseline' }, args => ({ contents: baseline[args.path === 'before-service' ? 'accountingService.ts' : '../components/NEBilaga.tsx'], loader: 'tsx', resolveDir: path.resolve(args.path === 'before-service' ? 'src/lib' : 'src/components') }))
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'offline', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase={rpc:(name,args)=>globalThis.__kan90Rpc(name,args)}' }))
  } }],
})
const mod = { exports: {} }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, require)
const api = mod.exports
const completeSales = { available: true, r2Reallocation: 0, unresolvedCount: 0, unresolvedAmount: 0, reviewRequired: false }
const status = (rows, account) => rows.find(row => row.accountNumber === account)?.status
const parsed = parseSieFile(`#FLAGGA 0\n#SIETYP 4\n#RAR 0 20260101 20261231\n#KONTO 1210 "Maskiner"\n#KONTO 2890 "Skuld"\n#IB 0 1210 1000\n#IB 0 2890 -1000\n`)
assert.equal(parsed.errors.length, 0)
const imported = Object.fromEntries(parsed.openingBalances.map(row => [row.accountNumber, row.amount]))
const cases = [
  { name: 'offsetting-balance', annual: { '1210': 1000, '2890': -1000 }, review: ['1210','2890'], reproduce: true },
  { name: 'result-zero-net', annual: { '3900': -100, '7970': 100 }, review: ['3900','7970'] },
  { name: 'unknown-result', annual: { '3300': -400, '8420': 400 }, review: ['3300','8420'] },
  { name: 'complete', annual: { '1930': 1000, '3010': -1000 }, review: [] },
  { name: 'signs-net-to-zero', annual: { '1510': 1000, '1511': -1000, '2440': -900, '2441': 900 }, review: ['1511','2441'] },
  { name: 'clipped-asset', annual: { '1510': -1000, '2010': 1000 }, review: ['1510'] },
  { name: 'negative-bank-small', annual: { '1930': 1000, '1940': -0.01, '2010': -999.99 }, review: ['1940'] },
  { name: 'tax-netting', annual: { '2611': -250, '2641': 100, '1930': 150 }, review: [] },
  { name: 'tax-receivable', annual: { '2641': 100, '2010': -100 }, review: [] },
  { name: 'unsupported-capital-liability', annual: { '2015': 10, '2420': -10 }, review: ['2015','2420'] },
  { name: 'signed-correction', annual: { '3900': 40, '7970': -40, '1210': -600, '2890': 600 }, review: ['1210','2890','3900','7970'] },
  { name: 'full-reversal-zero', annual: { '1210': 0, '2890': 0, '3900': 0, '7970': 0 }, review: [] },
  { name: 'year-crossing', annual: { '1930': 200, '3010': -200 }, cumulative: { '1930': 1200, '3010': -200, '2010': -1000, '1210': 1000, '2890': -1000, '3900': -50 }, review: ['1210','2890'], year: 2027 },
  { name: 'sie-opening-balances', annual: {}, cumulative: imported, review: ['1210','2890'] },
  { name: 'saved-r2', annual: { '1930': 1000, '3010': -1000 }, reallocation: 400, review: [] },
  { name: 'saved-reversal', annual: { '1930': -1000, '3010': 1000 }, reallocation: -400, review: ['1930'] },
  { name: 'missing-sales-summary', annual: { '1930': 1000, '3010': -1000 }, missing: true, review: ['3010'] },
  { name: 'unresolved-sale', annual: { '1930': 1000, '3010': -1000 }, unresolved: true, review: ['3010'] },
  { name: 'technical-result', annual: { '8999': 1000, '2019': -1000 }, review: [] },
  { name: 'empty', annual: {}, review: [] },
  { name: 'valid-contra-asset', annual: { '1220': 10000, '1229': -2000, '2010': -8000 }, review: ['1229'] },
]
function freeze(obj) { if (obj && typeof obj === 'object') { Object.freeze(obj); Object.values(obj).forEach(freeze) } return obj }
const reports = []
for (const item of cases) {
  const year = item.year ?? 2026
  const annual = Object.entries(item.annual).map(([account_number, balance]) => ({ account_number, balance }))
  const cumulative = Object.entries(item.cumulative ?? item.annual).map(([account_number, balance]) => ({ account_number, balance }))
  const fixture = freeze({ annual, cumulative, summary: { version: 1, balances: annual, r2_reallocation: item.reallocation ?? 0, unresolved_count: item.unresolved ? 1 : 0, unresolved_amount: item.unresolved ? 1000 : 0 } })
  const original = JSON.stringify(fixture)
  const reads = []
  globalThis.__kan90Rpc = async (name, args) => {
    reads.push([name, args])
    if (name === 'get_ne_sales_summary') { assert.deepEqual(args, { p_year: year }); return item.missing ? { data: null, error: { code: 'PGRST202' } } : { data: fixture.summary, error: null } }
    if (name === 'get_period_account_balances') { assert(item.missing); assert.deepEqual(args, { p_start_date: `${year}-01-01`, p_end_date: `${year}-12-31` }); return { data: fixture.annual, error: null } }
    if (name === 'get_cumulative_account_balances') { assert.deepEqual(args, { p_through_date: `${year}-12-31` }); return { data: fixture.cumulative, error: null } }
    throw Error('Unexpected read or write: ' + name)
  }
  const before = await api.beforeNE(year)
  const previousReads = reads.splice(0)
  const report = await api.getNEData(year)
  assert.deepEqual(reads, previousReads, 'No new reads or changed RPC arguments')
  const { accountCoverage, ...unchanged } = report
  if (compareHead) assert.deepEqual(unchanged, before, 'Every pre-existing field/decision/warning/amount unchanged: ' + item.name)
  assert.equal(JSON.stringify(fixture), original, 'No mutation of balances or saved metadata')
  assert.deepEqual(accountCoverage.filter(row => row.status === 'review').map(row => row.accountNumber), item.review)
  for (const locked of [false, true]) {
    const props = { neData: report, selectedYear: year, isYearLocked: locked, onLockYear: async () => { throw Error('No writes') } }
    const html = renderToStaticMarkup(React.createElement(api.NEBilaga, props))
    assert.equal(html.includes('Konton behöver granskas före deklaration'), item.review.length > 0)
    for (const row of accountCoverage.filter(row => row.status === 'review')) {
      assert(html.includes('Konto ' + row.accountNumber + ':'))
      assert(html.includes(row.reason))
    }
    for (const warning of before.warnings) assert(html.includes(warning.message), 'KAN-77 preserved')
    if (item.missing || item.unresolved) assert(html.includes('R1/R2 behöver kontrolleras före deklaration'))
    const beforeHtml = renderToStaticMarkup(React.createElement(api.Before, { ...props, neData: before }))
    assert.equal(html.match(/aria-disabled="[^"]+"/)?.[0], beforeHtml.match(/aria-disabled="[^"]+"/)?.[0], 'Year-lock behavior unchanged')
    if (item.reproduce) {
      assert.equal(api.calculateNeBalanceDiff(report), 0)
      if (compareHead) {
        assert(!beforeHtml.includes('1210') && !beforeHtml.includes('2890'), 'Pre-fix consumer omits both accounts')
        assert(beforeHtml.includes('✓ Balansräkningen balanserar'), 'Reproduced false reassurance before fix')
      }
      assert(!html.includes('✓ Balansräkningen balanserar'))
    }
  }
  if (item.name === 'technical-result') assert.equal(status(accountCoverage, '8999'), 'excluded')
  if (item.name === 'valid-contra-asset') {
    assert.equal(report.B4, 8000, 'Correct contra-asset continues to reduce B4')
    assert.equal(api.calculateNeBalanceDiff(report), 0)
    const html = renderToStaticMarkup(React.createElement(api.NEBilaga, { neData: report, selectedYear: year, isYearLocked: false, onLockYear: async () => {} }))
    assert(html.includes('aria-disabled="false"'), 'Conservative review must not introduce a year-lock blocker')
    assert(html.includes('Det kan vara korrekt'))
    assert(html.includes('Ändra inte bokföringen enbart för att få bort varningen.'))
  }
  reports.push({ name: item.name, report })
}
delete globalThis.__kan90Rpc

// All four-digit BAS 1–8 accounts receive one explicit state; no total/difference gate.
const all = Object.fromEntries(Array.from({ length: 8000 }, (_, i) => [String(1000 + i), 1]))
const allRows = api.collectNeAccountCoverage(all, all, completeSales)
assert.equal(allRows.length, 8000)
assert.equal(new Set(allRows.map(row => row.accountNumber)).size, 8000)
assert(allRows.every(row => row.reason && ['mapped','excluded','review'].includes(row.status)))
assert.equal(status(allRows,'1210'),'review')
assert.equal(status(allRows,'8990'),'excluded')
assert.equal(status(allRows,'2019'),'mapped')
assert.equal(status(allRows,'1220'),'mapped')
assert.equal(status(allRows,'2611'),'mapped')
assert.equal(status(allRows,'4700'),'mapped') // Existing disputed mapping is not changed by KAN-90.
assert.equal(status(allRows,'7970'),'review')

await mkdir('test-results/kan90-ne-coverage', { recursive: true })
await writeFile('test-results/kan90-ne-coverage/reports.json', JSON.stringify(reports, null, 2))
console.log(`PASS KAN-90: ${cases.length} real service/render cases, unchanged reads, 8000 explicit account states` + (compareHead ? ', HEAD reproduction and all pre-existing fields identical' : ''))

// Offline browser uses the same real consumer, actual Tailwind styles and service reports.
const uiBundle = await build({
  stdin: { contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import NEBilaga from './src/components/NEBilaga'; const reports=${JSON.stringify(reports)}; function App(){const [state,setState]=useState({index:0,locked:false}); window.configure=(index,locked)=>setState({index,locked});return <NEBilaga key={state.index+':'+state.locked} neData={reports[state.index].report} selectedYear={2026} isYearLocked={state.locked} onLockYear={async()=>{throw Error('No writes')}}/>} createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  tsconfig: 'tsconfig.json', bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
})
const styles = (await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./src/components/NEBilaga.tsx";\n@source "./src/components/NEAccountTable.tsx";')
const css = await postcss([tailwindcss()]).process(styles, { from: path.resolve('kan90-test.css') })
const browser = await chromium.launch({ headless: true })
try {
  for (const width of [1440,390,320]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } })
    const errors = [], requests = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort() })
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css.css })
    await page.addScriptTag({ content: uiBundle.outputFiles[0].text })
    for (const index of [0,1,3,4,6,14,16,18,19,20]) for (const locked of [false,true]) {
      await page.evaluate(({index,locked}) => window.configure(index,locked), { index, locked })
      const heading = page.getByText('NE-Bilaga Specifikation', { exact: true })
      await expect(heading).toBeVisible()
      if (locked) await expect(page.getByText('Räkenskapsår 2026 är låst',{exact:true})).toBeVisible()
      else await expect(page.getByRole('button',{name:'Lås räkenskapsår 2026'})).toBeVisible()
      const review = reports[index].report.accountCoverage.filter(row => row.status === 'review')
      const alert = page.getByRole('alert').filter({ hasText: 'Konton behöver granskas före deklaration' })
      await expect(alert).toHaveCount(review.length ? 1 : 0)
      if (review.length) {
        for (const row of review) await expect(alert.getByText('Konto ' + row.accountNumber + ':', { exact: false })).toBeVisible()
        const box = await alert.boundingBox()
        assert(box && box.x >= 0 && box.x + box.width <= width, 'Warning fits viewport')
      }
      await page.locator('summary').filter({ hasText: 'Kontotäckning' }).click()
      for (const row of reports[index].report.accountCoverage) {
        const accountRow=page.locator('tr').filter({has:page.getByLabel('Visa bokföringsposter för '+row.accountNumber,{exact:true})})
        await expect(accountRow).toBeVisible()
        await expect(accountRow).toContainText(row.accountNumber)
        await expect(accountRow).toContainText(row.status === 'review' ? 'Behöver granskas' : row.status === 'excluded' ? 'Undantaget från direkt koppling' : 'Känd koppling')
      }
      if (!review.length) await expect(page.getByText('Inga osäkra kontokopplingar hittades. Skatteuppgifter och underlag behöver fortfarande granskas.',{exact:true})).toBeVisible()
      if (index === 18) await expect(page.locator('tr').filter({has:page.getByLabel('Visa bokföringsposter för 8999',{exact:true})})).toContainText('Tekniskt resultatkonto')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow')
      if (index === 0 && !locked) await page.screenshot({ path: `test-results/kan90-ne-coverage/${width}.png`, fullPage: true })
    }
    assert.deepEqual(errors,[])
    assert.deepEqual(requests,[])
    await page.close()
    console.log(`PASS KAN-90 ${width}px: warning/details, locked/unlocked, amounts and no overflow/network`)
  }
} finally { await browser.close() }
