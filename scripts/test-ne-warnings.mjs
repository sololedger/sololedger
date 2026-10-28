/** Offline KAN-77 regression: real NE service/consumer; synthetic RPC transport only. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { calculateBusinessResult } from '../src/lib/resultEngine.ts'

const reproduce = process.argv.includes('--reproduce')
const output = 'test-results/kan77-ne-warnings'
const cases = [
  { name: 'complete', balances: { '1930': 1000, '3010': -1000 } },
  { name: 'scenario', balances: { '1930': 1200, '3010': -1000, '3900': -200 }, code: 'scenario_required' },
  { name: 'unknown-mapping', balances: { '1930': 900, '3010': -1000, '7970': 100 }, code: 'unknown_ne_mapping' },
  { name: 'unknown-account', balances: { '1930': 1200, '3010': -1000, '3300': -200 }, code: 'unknown_result_account' },
  { name: 'offsetting', balances: { '1930': 1000, '3010': -1000, '3900': -100, '7970': 100 }, code: 'scenario_required' },
  { name: 'classified-r2', balances: { '1930': 1000, '3010': -1000 }, reallocation: 400 },
  { name: 'warnings-with-r2', balances: { '1930': 1200, '3010': -1000, '3300': -200 }, reallocation: 400, code: 'unknown_result_account' },
  { name: 'missing-summary', balances: { '1930': 1200, '3010': -1000, '3300': -200 }, missing: true, code: 'unknown_result_account' },
  { name: 'unresolved-3010', balances: { '1930': 1000, '3010': -1000 }, unclassifiedSale: true },
  { name: 'empty', balances: {} },
]
const bundle = await build({
  stdin: { contents: "export {getNEData} from './src/lib/accountingService'; export {default as NEBilaga} from './src/components/NEBilaga'", resolveDir: process.cwd(), loader: 'ts' },
  tsconfig: 'tsconfig.json', bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'synthetic-read-only-transport', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'offline', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase={rpc:(name,args)=>globalThis.__kan77Rpc(name,args)}' }))
  } }],
})
const require = createRequire(import.meta.url)
const mod = { exports: {} }
new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(mod, mod.exports, require)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item) }
  return value
}
const reports = {}
for (const item of cases) {
  const balances = Object.entries(item.balances).map(([account_number, balance]) => ({ account_number, balance }))
  const fixture = freeze({
    summary: { version: 1,result_closing_review:{version:1,year:2026,through_date:"2026-12-31",blocked:false,entries:[]}, balances, r2_reallocation: item.reallocation ?? 0, unresolved_count: item.unclassifiedSale ? 1 : 0, unresolved_amount: item.unclassifiedSale ? 1000 : 0 },
    cumulative: balances,
  })
  const inputBefore = JSON.stringify(fixture)
  const reads = []
  globalThis.__kan77Rpc = async (name, args) => {
    reads.push(name)
    if (name === 'get_ne_sales_summary') {
      assert.deepEqual(args, { p_year: 2026 })
      return item.missing ? { data: null, error: { code: 'PGRST202' } } : { data: fixture.summary, error: null }
    }
    if (name === 'get_period_account_balances') {
      assert(item.missing, 'Legacy balances read only when summary is unavailable')
      return { data: balances, error: null }
    }
    if (name === 'get_cumulative_account_balances') {
      assert.deepEqual(args, { p_through_date: '2026-12-31' })
      return { data: fixture.cumulative, error: null }
    }
    throw Error('Unexpected RPC or write: ' + name)
  }
  const expected = calculateBusinessResult(item.balances)
  if (item.code) assert(expected.warnings.some(w => w.code === item.code), 'Fixture produces intended warning: ' + item.name)
  if (item.missing) { await assert.rejects(mod.exports.getNEData(2026), /Kontrollen av bokslutsposter/); continue }
  const report = await mod.exports.getNEData(2026)
  reports[item.name] = report
  const render = (extra = {}) => renderToStaticMarkup(React.createElement(mod.exports.NEBilaga, {
    neData: report, selectedYear: 2026, isYearLocked: false,
    onLockYear: async () => { throw Error('No year-lock writes in this test') }, ...extra,
  }))
  const html = render()
  assert.equal(JSON.stringify(fixture), inputBefore, 'RPC payloads, balances and classification decisions are immutable')
  assert.equal(reads.length, item.missing ? 4 : 3, 'Only existing report reads occur')
  assert.equal(report.R1, expected.neRows.R1 - (item.reallocation ?? 0))
  assert.equal(report.R2, expected.neRows.R2 + (item.reallocation ?? 0))
  assert.equal(report.bokfortResultat, expected.bokfortResultat)
  assert.equal(report.R17, expected.skattemassigtResultat)
  for (const row of ['R3','R4','R5','R6','R7','R8','R9','R10']) assert.equal(report[row], expected.neRows[row])
  if (reproduce) {
    assert.equal(report.warnings, undefined, 'Pre-fix service drops engine warnings')
    assert(!html.includes('NE-underlaget är inte komplett'), 'Pre-fix UI hides general classification warning')
    continue
  }
  assert.deepEqual(report.warnings, expected.warnings, 'Engine warning details survive getNEData')
  assert.equal(report.unresolvedResultEffect, expected.unresolvedResultEffect)
  if (expected.warnings.length) {
    assert.match(html, /role="alert"/)
    assert(html.includes('NE-underlaget är inte komplett'))
    assert(html.includes('Använd inte NE-underlaget för deklaration innan kontona har granskats.'))
    for (const warning of expected.warnings) assert(html.includes(warning.message))
    assert(render({ isYearLocked: true }).includes('NE-underlaget är inte komplett'), 'Locked-year view still warns')
    assert.match(html, /aria-disabled="false"/, 'KAN-77 introduces no year-lock blocker')
  } else {
    assert(!html.includes('NE-underlaget är inte komplett'), 'No general warning for complete classification')
  }
  if (item.name === 'offsetting') {
    assert.equal(report.unresolvedResultEffect, 0)
    assert.equal(report.warnings.length, 2, 'Opposing effects must not hide incomplete classification')
  }
  if (item.missing || item.unclassifiedSale) assert(html.includes('R1/R2 behöver kontrolleras före deklaration'), 'KAN-88 warning preserved')
  else assert(!html.includes('R1/R2 behöver kontrolleras före deklaration'), 'General warnings independent of saved R1/R2 decisions')
}
await mkdir(output, { recursive: true })
if (reproduce) {
  await writeFile(output + '/before.json', JSON.stringify(reports, null, 2))
  console.log('REPRODUCED KAN-77: synthetic engine warnings disappear in getNEData and the rendered NE view; complete/R2 fixtures captured')
} else {
  // Optional one-time before/after check, using only this session's synthetic pre-fix capture.
  let baseline
  try { baseline = JSON.parse(await readFile(output + '/before.json', 'utf8')) } catch (e) { if (e.code !== 'ENOENT') throw e }
  if (baseline) {
    for (const [name, report] of Object.entries(reports)) {
      const unchanged = { ...report }
      delete unchanged.warnings
      delete unchanged.unresolvedResultEffect
      assert.deepEqual(JSON.parse(JSON.stringify(unchanged)), baseline[name], 'All pre-existing NE fields unchanged: ' + name)
    }
  }
  console.log('PASS KAN-77: 10 synthetic service/render cases; all warning types, zero-net ambiguity, complete/empty, R1/R2 and fallback; amounts and immutable inputs preserved')
}
delete globalThis.__kan77Rpc