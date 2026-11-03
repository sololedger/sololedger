// Execute the actual component callbacks with synthetic deferred reads and React setters.
// This isolates loading/race behavior without invoking any booking or period-creation writes.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { vatReportBlockedMessage } from '../src/lib/vatReportPresentation.ts'

async function callbacks(file, names, context) {
  const source = await readFile(file, 'utf8')
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const parts = []
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) parts.push(node.getText(tree))
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) {
      assert(ts.isCallExpression(node.initializer))
      parts.push(`const ${node.name.getText(tree)} = ${node.initializer.arguments[0].getText(tree)}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(parts.length, names.length)
  const code = parts.join('\n')
  const state = { setSelectedPeriodId: '', setAvailableYears: [], setNotice: null }
  for (const name of new Set(code.match(/\bset[A-Z]\w+(?=\()/g))) {
    context[name] = value => {
      state[name] = typeof value === 'function' ? value(state[name]) : value
      if (name === 'setYear') context.year = value
    }
  }
  context.console = { error() {} }
  vm.createContext(context)
  vm.runInContext(ts.transpileModule(`${code}\nglobalThis.callbacks = { ${names.join(',')} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText, context)
  return { state, ...context.callbacks }
}
function deferredReads() {
  const requests = []
  return { requests, read: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) }
}

const invoiceReads = deferredReads()
const invoices = await callbacks('src/components/CustomerInvoicesPanel.tsx', ['loadInvoices'], {
  selectedYear: 2027, invoiceLoadSequence: { current: 0 }, getCustomerInvoices: invoiceReads.read,
})
let first = invoices.loadInvoices()
invoiceReads.requests.shift().resolve([{ grossAmount: 126 }]); await first
assert.equal(invoices.state.setInvoices[0].grossAmount, 126)
first = invoices.loadInvoices()
assert.equal(invoices.state.setInvoices.length, 0)
invoiceReads.requests.shift().reject(new Error('Synthetic read failure')); await first
assert.match(invoices.state.setLoadError, /2027.*Inga belopp visas/)
assert.equal(invoices.state.setLoading, false)
first = invoices.loadInvoices(); const olderInvoiceRead = invoiceReads.requests.shift()
const last = invoices.loadInvoices(); invoiceReads.requests.shift().resolve([{ grossAmount: 227 }]); await last
olderInvoiceRead.resolve([{ grossAmount: 126 }]); await first
assert.equal(invoices.state.setInvoices[0].grossAmount, 227)
assert.equal(invoices.state.setLoadError, null)
console.log('PASS invoice actual loader: hide previous amounts, failure, retry, out-of-order refresh')

const assetReads = deferredReads()
const assets = await callbacks('src/components/FixedAssetsPanel.tsx', ['loadPanel'], {
  selectedYear: 2027, panelLoadSequence: { current: 0 },
  getTaxRuleParametersForYear: assetReads.read, getFixedAssets: assetReads.read, getFixedAssetDepreciationRuns: assetReads.read,
  getFixedAssetDepreciationPreview: assetReads.read,
})
first = assets.loadPanel()
assetReads.requests.splice(0).forEach((read, i) => i === 1 ? read.reject(new Error('Synthetic read failure')) : read.resolve([]))
await first
assert.match(assets.state.setPanelLoadError, /2027.*Inga belopp visas/)
assert.equal(assets.state.setTaxRules, null)
first = assets.loadPanel(); const olderAssetReads = assetReads.requests.splice(0)
const latestAssets = assets.loadPanel()
assetReads.requests.splice(0).forEach(read => read.resolve([{ value: 227 }]))
await latestAssets
olderAssetReads.forEach(read => read.resolve([{ value: 126 }]))
await first
assert.equal(assets.state.setAssets[0].value, 227)
assert.equal(assets.state.setPanelLoadError, null)
console.log('PASS asset actual loader: distinct technical failure, retry, out-of-order refresh')

const periodReads = deferredReads()
const reportReads = deferredReads()
const vatContext = {
  year: 2026, currentYear: 2026, canEnsurePeriods: false,
  vatManagementFrom: '2024-06-02',
  supabase: { auth: { getUser: async () => ({ data: { user: { id: 'synthetic-period-owner' } } }) } },
  fetchAllRows: async () => [],
  periodLoadSequence: { current: 0 }, reportRequestSeqRef: { current: 0 },
  settlementRequestSeqRef: { current: 0 }, movementRequestSeqRef: { current: 0 },
  selectionContextRef: { current: { periodId: '2026', contextKey: '2026' } },
  getVatPeriods: periodReads.read, getVatReportForPeriod: reportReads.read,
  ensureVatPeriods: () => { throw new Error('No writes allowed') },
  loadAvailableYears() {}, resetSettlementIntent() {}, resetMovementIntent() {},
  isVatReportRequestCurrent: (a, b) => a.periodId === b.periodId && a.contextKey === b.contextKey,
  buildVatReportPresentation: report => report,
  vatReportBlockedMessage,
}
const vat = await callbacks('src/components/Momsrapport.tsx', ['loadAvailableYears', 'loadVatPeriods', 'handleYearChange', 'handlePeriodChange', 'fetchMomsForPeriod'], vatContext)
await vat.loadAvailableYears()
assert.deepEqual(Array.from(vat.state.setAvailableYears), [2026, 2025, 2024])
console.log('PASS KAN117: historical managed years selectable even without journal or period rows')
const period = year => [{ id: String(year), period_start: `${year}-01-01`, period_end: `${year}-12-31` }]
first = vat.loadVatPeriods(); const oldPeriodRead = periodReads.requests.shift()
vat.handleYearChange(2027)
assert.equal(vat.state.setVatPeriods.length, 0)
assert.equal(vat.state.setSelectedPeriodId, '')
const year2027 = vat.loadVatPeriods(); periodReads.requests.shift().resolve(period(2027)); await year2027
oldPeriodRead.resolve(period(2026)); await first
assert.equal(vat.state.setVatPeriods[0].id, '2027')
first = vat.loadVatPeriods(); periodReads.requests.shift().reject(new Error('Synthetic period read failure')); await first
assert.equal(vat.state.setVatPeriods.length, 0)
assert(vat.state.setPeriodError)
first = vat.loadVatPeriods(); periodReads.requests.shift().resolve(period(2027)); await first
assert.equal(vat.state.setPeriodError, null)
console.log('PASS VAT actual period loader: immediate clear, stale response, failure and retry')

// KAN-117: all loader options remain read-only; creation lives in a separate confirmed panel.
vatContext.canEnsurePeriods = true
vatContext.currentYear = 2027
let generationCalls = 0
vatContext.ensureVatPeriods = async () => { generationCalls++; throw new Error('No legacy writes') }
first = vat.loadVatPeriods(undefined, { ensure: true, preserveReport: true, preservePeriodsOnError: true })
periodReads.requests.shift().resolve(period(2027)); await first
assert.equal(generationCalls, 0)
assert.equal(vat.state.setPeriodError, null)
assert.equal(vat.state.setVatPeriods[0].id, '2027')
console.log('PASS KAN117: pure period reads, no legacy generation path')

vatContext.selectionContextRef.current = { periodId: '2027', contextKey: '2027' }
first = vat.fetchMomsForPeriod(period(2027)[0], '2027')
vat.handleYearChange(2026); vat.handleYearChange(2027)
vatContext.selectionContextRef.current = { periodId: '2027', contextKey: '2027' }
reportReads.requests.shift().resolve({ status: 'ready', report: { amount: 126 } }); await first
assert.equal(vat.state.setVatReport, null, 'A -> B -> A cannot revive the old report')
assert.equal(vat.state.setLoading, false)
first = vat.fetchMomsForPeriod(period(2027)[0], '2027')
vat.handlePeriodChange('another'); vat.handlePeriodChange('2027')
vatContext.selectionContextRef.current = { periodId: '2027', contextKey: '2027' }
reportReads.requests.shift().resolve({ status: 'ready', report: { amount: 126 } }); await first
assert.equal(vat.state.setVatReport, null)
console.log('PASS VAT actual report: year/period A -> B -> A invalidates pending report and settlement/movement reads')

// KAN-81: execute the unchanged report loader and its real render/action guards.
const vatSource = await readFile('src/components/Momsrapport.tsx', 'utf8')
const vatTree = ts.createSourceFile('Momsrapport.tsx', vatSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const guardNames = ['hasCurrentReport', 'canCloseSelectedPeriod', 'canDeclareSelectedPeriod', 'currentVatReport']
const expressions = new Map(), disabledExpressions = new Map()
function findGuards(node) {
  if (ts.isVariableDeclaration(node) && guardNames.includes(node.name.getText(vatTree))) {
    expressions.set(node.name.getText(vatTree), node.initializer.getText(vatTree))
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(vatTree) === 'button') {
    const props = node.attributes.properties.filter(ts.isJsxAttribute)
    const action = props.find(prop => prop.name.getText(vatTree) === 'onClick')?.initializer?.expression?.getText(vatTree)
    if (['handleClosePeriod', 'handleDeclarePeriod'].includes(action)) {
      disabledExpressions.set(action, props.find(prop => prop.name.getText(vatTree) === 'disabled').initializer.expression.getText(vatTree))
    }
  }
  ts.forEachChild(node, findGuards)
}
findGuards(vatTree)
assert.equal(expressions.size, 4); assert.equal(disabledExpressions.size, 2)
assert.match(vatSource, /\{currentVatReport && selectedPeriod && \(/, 'report amounts stay behind the current-report gate')
function reportGuards() {
  const code = guardNames.map(name => `const ${name} = ${expressions.get(name)};`).join('\n') + `
    ({hasCurrentReport,currentVatReport,closeDisabled:${disabledExpressions.get('handleClosePeriod')},declareDisabled:${disabledExpressions.get('handleDeclarePeriod')}})`
  const result = vm.runInNewContext(code, {
    selectedPeriod: period(2027)[0], selectedPeriodContextKey: '2027',
    fetched: vat.state.setFetched, loading: vat.state.setLoading, vatReport: vat.state.setVatReport,
    reportPeriodId: vat.state.setReportPeriodId, reportContextKey: vat.state.setReportContextKey,
    lifecycleCanCloseSelectedPeriod: true, lifecycleCanDeclareSelectedPeriod: true,
    reportNeedsReview: false, declarationSubmittedOnIsValid: true,
    closing: false, declaring: false, periodsLoading: false,
  })
  return JSON.parse(JSON.stringify(result))
}
first = vat.fetchMomsForPeriod(period(2027)[0], '2027')
reportReads.requests.shift().resolve({ status: 'ready', report: { netVat: 126 } }); await first
assert.deepEqual(reportGuards(), { hasCurrentReport: true, currentVatReport: { netVat: 126 }, closeDisabled: false, declareDisabled: false })
for (const [code, fragment] of [
  ['customer_invoice_voucher_inconsistent', 'Fakturor/Bokföring'], ['customer_invoice_vat_unsupported', 'kundfakturas momsunderlag'],
  ['vat_v2_snapshot_missing', 'omvänd moms'], ['legacy_reverse_charge_ambiguous', 'Äldre eller importerad'],
  ['fixed_asset_voucher_inconsistent', 'Inventarier/Bokföring'], ['supplier_invoice_voucher_inconsistent', 'Bokslutsskulder/Bokföring'],
  ['future_reason', 'underlaget inte kan verifieras'],
]) {
  first = vat.fetchMomsForPeriod(period(2027)[0], '2027')
  assert.equal(vat.state.setVatReport, null, 'previous amounts cleared before the read')
  reportReads.requests.shift().resolve({ status: 'blocked', report: null, errors: [{ code: 'aggregation_blocked', message: 'raw',
    aggregationErrors: [{ code, transactionId: 'synthetic', message: 'raw' }] }] })
  await first
  assert.equal(vat.state.setFetched, false)
  assert(vat.state.setReportError.includes(fragment))
  assert.deepEqual(reportGuards(), { hasCurrentReport: false, currentVatReport: null, closeDisabled: true, declareDisabled: true })
}
const blockedActions = await callbacks('src/components/Momsrapport.tsx', ['handleClosePeriod', 'handleDeclarePeriod'], {
  selectedPeriod: period(2027)[0], canCloseSelectedPeriod: false, canDeclareSelectedPeriod: false,
  closeInFlightRef: { current: false }, declareInFlightRef: { current: false },
})
await blockedActions.handleClosePeriod(); await blockedActions.handleDeclarePeriod()
console.log('PASS KAN81 actual report callback and guards: correct reasons, no old amounts, disabled closing/declaration, blocked action handlers return without writes')
