import assert from 'node:assert/strict'
import { calculateVatReportFromLoadedRows, getVatReportForPeriodFromDb, type LoadedVatReportRows } from '../src/lib/vatReportService.ts'
import { dashboardVatBreakdownFromReportResult } from '../src/lib/dashboardVat.ts'
import { calculateDashboard } from '../src/lib/calculations.ts'
import { calculateBusinessResult } from '../src/lib/resultEngine.ts'
import { exportSIEForUserFromDb } from '../src/lib/sieExport.ts'
import { readFileSync } from 'node:fs'

const userId = 'kan71-fixture'
function fixture(originalDate = '2026-05-15', correctionDate = '2026-10-14'): LoadedVatReportRows {
  const transactions = [
    { id: 'original', user_id: userId, date: originalDate, source: 'sie_import', import_batch_id: 'batch', import_batch_status: 'undone' },
    { id: 'undo', user_id: userId, date: correctionDate, source: 'sie_import_undo', import_batch_id: 'batch', import_batch_status: 'undone' },
  ]
  const entries = [
    { account_number: '1930', debit: 1250, credit: 0 },
    { account_number: '3010', debit: 0, credit: 3000 },
    { account_number: '2611', debit: 0, credit: 750 },
    { account_number: '5410', debit: 2000, credit: 0 },
    { account_number: '2641', debit: 500, credit: 0 },
  ]
  return {
    transactions,
    journalRows: transactions.flatMap((tx, index) => entries.map(e => ({
      ...e, transaction_id: tx.id, user_id: userId, date: tx.date, ver_nr: index + 1,
      debit: index === 0 ? e.debit : e.credit,
      credit: index === 0 ? e.credit : e.debit,
    }))),
    vatV2Snapshots: [],
    vatPeriods: [
      { id: 'q2', user_id: userId, period_start: '2026-04-01', period_end: '2026-06-30', source: 'sololedger' },
      { id: 'q4', user_id: userId, period_start: '2026-10-01', period_end: '2026-12-31', source: 'sololedger' },
      { id: 'old', user_id: userId, period_start: '2025-04-01', period_end: '2025-06-30', source: 'sololedger' },
    ],
  }
}
function ready(rows: LoadedVatReportRows, startDate: string, endDate: string, uid = userId) {
  const result = calculateVatReportFromLoadedRows({ userId: uid, startDate, endDate, rows })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') throw Error('Expected report')
  return result
}
const crossPeriod = fixture()
assert.equal(ready(crossPeriod, '2026-04-01', '2026-06-30').report.fields['49'], 250)
assert.equal(ready(crossPeriod, '2026-10-01', '2026-12-31').report.fields['10'], -750)
assert.equal(ready(crossPeriod, '2026-10-01', '2026-12-31').report.fields['48'], -500)
assert.equal(ready(crossPeriod, '2026-10-01', '2026-12-31').report.fields['49'], -250)
const year = ready(crossPeriod, '2026-01-01', '2026-12-31')
assert.equal(year.report.fields['49'], 0)
assert.equal(year.report.historicalReviewRequired, true, 'year net zero must not conceal cross-period undo')
const overview = dashboardVatBreakdownFromReportResult(year)
assert.equal(overview.manualReviewRequired, true)
assert.equal(calculateDashboard({ '1930': 10000 }, 30, overview).sakertUttag, 0)
assert.match(overview.manualReviewMessage ?? '', /separat hantering/)
const samePeriod = fixture('2026-10-02', '2026-10-14')
const same = ready(samePeriod, '2026-10-01', '2026-12-31')
assert.equal(same.report.fields['49'], 0)
assert.equal(same.report.historicalReviewRequired, false)
assert.equal(dashboardVatBreakdownFromReportResult(same).manualReviewRequired, false)
const missing = { ...samePeriod, vatPeriods: [] }
const closedOrdinary = {
  ...samePeriod,
  transactions: samePeriod.transactions.map(tx => ({ ...tx, source: 'manual', import_batch_id: null, import_batch_status: null })),
  vatPeriods: samePeriod.vatPeriods!.map(period => ({ ...period, status: 'closed', closing_amount: 0 })),
}
const matchingClosing = ready(closedOrdinary, '2026-10-01', '2026-12-31')
assert.equal(matchingClosing.report.closingReconciliationRequired, false)
assert.equal(dashboardVatBreakdownFromReportResult(matchingClosing).manualReviewRequired, false)
const mismatchRows = { ...closedOrdinary, vatPeriods: closedOrdinary.vatPeriods.map(period => ({ ...period, closing_amount: 250 })) }
const mismatchClosing = ready(mismatchRows, '2026-10-01', '2026-12-31')
assert.equal(mismatchClosing.report.historicalReviewRequired, false)
assert.equal(mismatchClosing.report.closingReconciliationRequired, true)
assert.equal(calculateDashboard({ '1930': 10000 }, 30, dashboardVatBreakdownFromReportResult(mismatchClosing)).sakertUttag, 0)
const cancellingMismatches = {
  ...crossPeriod,
  transactions: crossPeriod.transactions.map(tx => ({ ...tx, source: 'manual', import_batch_id: null, import_batch_status: null })),
  vatPeriods: crossPeriod.vatPeriods!.filter(period => period.id !== 'old').map(period => ({
    ...period, status: period.id === 'q2' ? 'closed' : 'declared', closing_amount: period.id === 'q2' ? 100 : -100,
  })),
}
const annualMismatch = ready(cancellingMismatches, '2026-01-01', '2026-12-31')
assert.equal(annualMismatch.report.fields['49'], 0)
assert.equal(annualMismatch.report.historicalReviewRequired, false)
assert.equal(annualMismatch.report.closingReconciliationRequired, true, 'offsetting closing errors must be compared per period')
assert.equal(dashboardVatBreakdownFromReportResult(annualMismatch).manualReviewRequired, true)
assert.equal(ready(closedOrdinary, '2026-10-14', '2026-10-14').report.closingReconciliationRequired, true, 'partial closed period lacks complete reconciliation evidence')
assert.equal(ready(missing, '2026-10-01', '2026-12-31').report.historicalReviewRequired, true)
const overlapping = { ...samePeriod, vatPeriods: [...samePeriod.vatPeriods!, { ...samePeriod.vatPeriods![1], id: 'overlap' }] }
assert.equal(ready(overlapping, '2026-10-01', '2026-12-31').report.historicalReviewRequired, true)
const foreignPeriod = { ...samePeriod, vatPeriods: [{ ...samePeriod.vatPeriods![1], user_id: 'other-user' }] }
assert.equal(calculateVatReportFromLoadedRows({ userId, startDate: '2026-10-01', endDate: '2026-12-31', rows: foreignPeriod }).status, 'blocked')

for (const date of ['2026-05-15', '2025-05-15']) {
  const rows = fixture(date)
  const originalYear = date.slice(0, 4)
  assert.equal(ready(rows, originalYear + '-01-01', originalYear + '-12-31').report.fields['49'], originalYear === '2025' ? 250 : 0)
  for (const y of originalYear === '2025' ? ['2025', '2026'] : ['2026']) {
    const balances: Record<string, number> = {}
    for (const row of rows.journalRows.filter(r => r.date?.startsWith(y))) {
      balances[row.account_number] = (balances[row.account_number] ?? 0) + Number(row.debit) - Number(row.credit)
    }
    assert.equal(calculateBusinessResult(balances).bokfortResultat, originalYear === '2025' ? (y === '2025' ? 1000 : -1000) : 0)
  }
}

for (const source of ['sie_import', 'sie_import_undo']) {
  const ambiguous: LoadedVatReportRows = {
    transactions: [{ id: 'ambiguous', user_id: userId, date: '2026-05-15', source, import_batch_status: 'undone' }],
    journalRows: [
      { transaction_id: 'ambiguous', user_id: userId, date: '2026-05-15', account_number: '2614', debit: 0, credit: 250 },
      { transaction_id: 'ambiguous', user_id: userId, date: '2026-05-15', account_number: '2645', debit: 250, credit: 0 },
    ], vatV2Snapshots: [],
  }
  const result = calculateVatReportFromLoadedRows({ userId, startDate: '2026-04-01', endDate: '2026-06-30', rows: ambiguous })
  assert.equal(result.status, 'blocked')
  assert.equal(dashboardVatBreakdownFromReportResult(result).manualReviewRequired, true)
}

// Exercise the real paginated loader, not only aggregation: counterpart rows
// outside this report period/year and the whole batch must be loaded.
type Row = Record<string, unknown>
class Query {
  rows: Row[]; filters: ((r: Row) => boolean)[] = []; start = 0; end = Infinity
  constructor(rows: Row[]) { this.rows = rows }
  select() { return this }
  eq(k: string, v: unknown) { this.filters.push(r => r[k] === v); return this }
  gte(k: string, v: string) { this.filters.push(r => String(r[k]) >= v); return this }
  lte(k: string, v: string) { this.filters.push(r => String(r[k]) <= v); return this }
  like(k: string, v: string) { this.filters.push(r => String(r[k]).startsWith(v.slice(0, -1))); return this }
  in(k: string, v: string[]) { this.filters.push(r => v.includes(String(r[k]))); return this }
  range(a: number, b: number) { this.start = a; this.end = b; return this }
  result() { const a = this.rows.filter(r => this.filters.every(f => f(r))); return { data: a.slice(this.start, this.end + 1), error: null, count: a.length } }
  maybeSingle() { return Promise.resolve({ data: this.result().data[0] ?? null, error: null }) }
  then(ok: (v: ReturnType<Query['result']>) => unknown) { return Promise.resolve(this.result()).then(ok) }
}
function dbFor(rows: LoadedVatReportRows, uid = userId) {
  const tables: Record<string, Row[]> = {
    transactions: rows.transactions.map(row => ({ ...row })), journal_entries: rows.journalRows.map(row => ({ ...row })),
    vat_periods: rows.vatPeriods ?? [], vat_audit_snapshots: [],
    import_batches: [{ id: 'batch', user_id: uid, status: 'undone' }], accounts: [],
    profiles: [{ id: uid, company_name: 'KAN71 synthetic', org_nr: null }],
  }
  return {
    from: (table: string) => new Query(tables[table]),
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, 'get_sie_vat_history_review')
      assert.equal(typeof args.p_start_date, 'string')
      assert.equal(typeof args.p_end_date, 'string')
      assert.equal(Object.keys(args).length, 2, 'tenant identity comes from authenticated DB session')
      return { data: rows.sieCorrectionHistoryReviewRequired ?? false, error: null }
    },
  }
}
const loaded = await getVatReportForPeriodFromDb(dbFor(fixture('2025-05-15')) as never, userId, '2025-04-01', '2025-06-30')
assert.equal(loaded.status, 'ready')
if (loaded.status === 'ready') {
  assert.equal(loaded.report.fields['49'], 250)
  assert.equal(loaded.report.historicalReviewRequired, true)
}
const loadedMismatch = await getVatReportForPeriodFromDb(dbFor(mismatchRows) as never, userId, '2026-10-01', '2026-12-31')
assert.equal(loadedMismatch.status, 'ready')
if (loadedMismatch.status === 'ready') assert.equal(loadedMismatch.report.closingReconciliationRequired, true, 'loader must fetch stored closings without undone batches')
// The Q2 original can match its stored close exactly while a manual descendant
// in Q3 makes the chain unsafe. The authoritative verdict must still win.
const manualLegacy = {
  ...fixture('2026-05-15', '2026-08-15'),
  sieCorrectionHistoryReviewRequired: true,
  transactions: fixture('2026-05-15', '2026-08-15').transactions.map((tx, i) => ({
    ...tx, source: i === 0 ? 'sie_import' : 'manual', import_batch_id: null, import_batch_status: null,
  })),
}
for (const [start, end] of [['2026-04-01', '2026-06-30'], ['2026-07-01', '2026-09-30'], ['2026-01-01', '2026-12-31']]) {
  const result = await getVatReportForPeriodFromDb(dbFor(manualLegacy) as never, userId, start, end)
  assert.equal(result.status, 'ready')
  if (result.status === 'ready') assert.equal(result.report.historicalReviewRequired, true)
  assert.equal(calculateDashboard({ '1930': 10000 }, 30, dashboardVatBreakdownFromReportResult(result)).sakertUttag, 0)
}
for (const response of [{ data: null, error: null }, { data: false, error: new Error('unavailable') }]) {
  const result = await getVatReportForPeriodFromDb({ ...dbFor(manualLegacy), rpc: async () => response } as never, userId, '2026-04-01', '2026-06-30')
  assert.equal(result.status, 'blocked', 'missing/failed authoritative history check fails closed')
  assert.equal(dashboardVatBreakdownFromReportResult(result).manualReviewRequired, true)
}
for (const [rows, year, count] of [[crossPeriod, 2026, 2], [fixture('2025-05-15'), 2025, 1], [fixture('2025-05-15'), 2026, 1]] as const) {
  const text = await exportSIEForUserFromDb(dbFor(rows) as never, userId, year, async () => ({}))
  assert.equal([...text.matchAll(/^#VER /gm)].length, count, 'SIE retains original and correction in respective years')
}

// Optional SQL fixture evidence from the isolated DB runner.
if (process.argv[2]) {
  const snapshots = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
    scenario: string; rows: LoadedVatReportRows; userId: string; startDate: string; endDate: string; net: number; review: boolean
  }[]
  for (const snapshot of snapshots) {
    const result = ready(snapshot.rows, snapshot.startDate, snapshot.endDate, snapshot.userId)
    assert.equal(result.report.fields['49'], snapshot.net, snapshot.scenario)
    assert.equal(result.report.historicalReviewRequired, snapshot.review, snapshot.scenario + ' review')
    if (snapshot.review) {
      assert.equal(calculateDashboard({ '1930': 10000 }, 30, dashboardVatBreakdownFromReportResult(result)).sakertUttag, 0)
    }
  }
  console.log('PASS actual RPC-generated journal/report assertions: ' + snapshots.length)
}
console.log('PASS KAN-71: signed periods, year crossing, unsafe VAT, historical review, tenant scope, loader, safe withdrawal, NE/result and SIE')
