import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWithdrawalAssessment as assess } from '../src/lib/withdrawalAssessment.ts'
import { aggregateVatReport } from '../src/lib/vatReportAggregation.ts'
import { invoiceFixture, invoiceEvent, sealInvoice } from '../tests/fixtures/withdrawalInvoiceFixtures.ts'
import { addWithdrawalTx, addWithdrawalFact } from '../tests/fixtures/withdrawalFixtures.ts'
import { validateWithdrawalInvoices } from '../src/lib/withdrawalInvoiceValidation.ts'

test('existing VAT-only validation accepts unrelated capital rows: it is not an invoice proof', () => {
  for (const lines of [ [['1930', 1000], ['2018', -1000]], [['1930', 1250], ['3010', -1000], ['2611', -250], ['5410', 500], ['2018', -500]] ] as [string, number][][]) {
    assert.equal(aggregateVatReport({ transactions: [{ id: 't', source: 'customer_invoice' }], vatV2Snapshots: [], journalRows: lines.map(([accountNumber, value]) => ({ transactionId: 't', accountNumber, debit: Math.max(value, 0), credit: Math.max(-value, 0), inReportPeriod: true })) }).status, 'ready')
  }
})
for (const rate of [0, 6, 12, 25]) test(`verified same-year payment ${rate}% uses journal once`, () => {
  const s = invoiceEvent(invoiceFixture(rate), 'pay', 'payment_same_year', '2026-06-10')
  const r = assess(sealInvoice(s)).result
  assert.equal(r.bankOre, (1000 + rate * 10) * 100)
  assert.equal(r.vatOre, rate * 1000)
  assert.equal(r.incomeTaxOre, 30000)
  assert.equal(r.recommendedOre, 70000)
})
test('unpaid current-year invoice adds no bank, income or VAT', () => {
  const r = assess(sealInvoice(invoiceFixture(25, '2026-10-20'))).result
  assert.equal(r.bankOre, 0); assert.equal(r.vatOre, 0); assert.equal(r.incomeTaxOre, 0)
  assert.equal(r.recommendedOre, 0)
})
test('paid document without any provable booking stays under review', () => {
  const s = invoiceFixture(25, '2026-10-20')
  s.invoices[0].payment_status = 'paid'
  blocked(s)
})
test('year-end receivable and later settlement reserve old VAT and tax once', () => {
  const s = invoiceEvent(invoiceFixture(), 'ye', 'year_end_receivable', '2026-12-31')
  let r = assess(sealInvoice(s)).result
  assert.equal(r.bankOre, 0); assert.equal(r.vatOre, 25000); assert.equal(r.incomeTaxOre, 30000); assert.equal(r.recommendedOre, 0)
  invoiceEvent(s, 'settle', 'receivable_settlement', '2027-01-15')
  r = assess(sealInvoice(s)).result
  assert.equal(r.bankOre, 125000); assert.equal(r.vatOre, 25000); assert.equal(r.incomeTaxOre, 30000); assert.equal(r.recommendedOre, 70000)
})
test('payment, reversal and new payment are separate dated journals', () => {
  const s = invoiceEvent(invoiceFixture(), 'pay', 'payment_same_year', '2026-06-10')
  invoiceEvent(s, 'undo', 'payment_same_year_reversal', '2026-06-20', 'pay')
  invoiceEvent(s, 'repay', 'payment_same_year', '2026-07-01')
  assert.equal(assess(sealInvoice(s)).result.recommendedOre, 70000)
})
test('historical manual exempt link has no additional economic effect', () => {
  const s = invoiceEvent(invoiceFixture(0), 'legacy', 'historical_payment_same_year', '2026-06-10')
  assert.equal(assess(sealInvoice(s)).result.recommendedOre, 70000)
})

function blocked(s: ReturnType<typeof invoiceFixture>) {
  try { assert.equal(assess(sealInvoice(s)).result.recommendedOre, null) }
  catch (e) {
    if (e instanceof assert.AssertionError) throw e
    assert(e instanceof Error)
    assert.match(e.message, /Uttagsunderlaget.*användare|Dubblerade/, 'only an explicit tenant/duplicate rejection may replace a blocked assessment')
  }
}
const paid = () => invoiceEvent(invoiceFixture(), 'pay', 'payment_same_year', '2026-06-10')
for (const [name, change] of Object.entries({
  'extra zero row': (s: ReturnType<typeof paid>) => s.journal.push({ ...s.journal[0], id: 'extra', debit: 0, credit: 0 }),
  'balanced unrelated expense and capital': (s: ReturnType<typeof paid>) => s.journal.push({ ...s.journal[0], id: 'cost', account_number: '5410', debit: 500, credit: 0 }, { ...s.journal[0], id: 'capital', account_number: '2018', debit: 0, credit: 500 }),
  'missing sales': (s: ReturnType<typeof paid>) => { s.journal[1].account_number = '2018' },
  'wrong account': (s: ReturnType<typeof paid>) => { s.journal[0].account_number = '1940' },
  'wrong invoice amount': (s: ReturnType<typeof paid>) => { s.invoices[0].gross_amount++ },
  'wrong booking amount': (s: ReturnType<typeof paid>) => { s.invoice_bookings[0].net_amount++ },
  'wrong transaction amount': (s: ReturnType<typeof paid>) => { s.transactions[0].amount = 1 },
  'wrong direction': (s: ReturnType<typeof paid>) => { for (const j of s.journal) [j.debit, j.credit] = [j.credit, j.debit] },
  'missing row': (s: ReturnType<typeof paid>) => { s.journal.pop() },
  'split same account': (s: ReturnType<typeof paid>) => { s.journal[0].debit = 625; s.journal.push({ ...s.journal[0], id: 'split' }) },
  'wrong year': (s: ReturnType<typeof paid>) => { s.invoice_bookings[0].fiscal_year = 2025 },
  'wrong booking date': (s: ReturnType<typeof paid>) => { s.invoice_bookings[0].booking_date = '2026-06-11' },
  'wrong row date': (s: ReturnType<typeof paid>) => { s.journal[0].date = '2026-06-11' },
  'wrong VAT account': (s: ReturnType<typeof paid>) => { s.journal[2].account_number = '2621' },
  'wrong rate': (s: ReturnType<typeof paid>) => { s.invoices[0].vat_rate = 12 },
  'missing policy': (s: ReturnType<typeof paid>) => { s.invoices[0].vat_policy_snapshot_status = 'missing' },
  'manual legacy policy is not auto-authorized': (s: ReturnType<typeof paid>) => { s.invoices[0].vat_policy_snapshot_status = 'manually_verified' },
  'mixed historical policy': (s: ReturnType<typeof paid>) => { s.invoices[0].vat_policy_domestic_sales_vat_treatment = 'mixed' },
  'missing booking': (s: ReturnType<typeof paid>) => { s.invoice_bookings = [] },
  'missing invoice': (s: ReturnType<typeof paid>) => { s.invoices = [] },
  'duplicate booking for same transaction': (s: ReturnType<typeof paid>) => { s.invoice_bookings.push({ ...s.invoice_bookings[0], id: 'duplicate' }) },
  'foreign invoice owner': (s: ReturnType<typeof paid>) => { s.invoices[0].user_id = 'synthetic-b' },
  'foreign booking owner': (s: ReturnType<typeof paid>) => { s.invoice_bookings[0].user_id = 'synthetic-b' },
  'foreign transaction owner': (s: ReturnType<typeof paid>) => { s.transactions[0].user_id = 'synthetic-b' },
  'foreign row owner': (s: ReturnType<typeof paid>) => { s.journal[0].user_id = 'synthetic-b' },
  'unknown kind': (s: ReturnType<typeof paid>) => { s.invoice_bookings[0].booking_kind = 'future_kind' },
  'import metadata': (s: ReturnType<typeof paid>) => { s.transactions[0].import_batch_id = 'import' },
  'unexpected correction': (s: ReturnType<typeof paid>) => { s.transactions[0].is_correction = true },
  'conflicting verification number': (s: ReturnType<typeof paid>) => { s.journal[0].ver_nr = 777 },
})) test(`fail closed: ${name}`, () => { const s = paid(); change(s); blocked(s) })

test('unbooked older invoice requires year-end review; unknown current invoice adds no cash', () => {
  blocked(invoiceFixture())
  const s = invoiceFixture(25, '2026-10-20'); Object.assign(s.invoices[0], { vat_treatment: 'unknown', net_amount: null, vat_amount: null, vat_rate: null })
  assert.equal(assess(sealInvoice(s)).result.recommendedOre, 0)
})
test('unproven settlement, wrong reversal target and double reversal remain blocked', () => {
  blocked(invoiceEvent(invoiceFixture(), 's', 'receivable_settlement', '2027-01-15'))
  const s = paid(); invoiceEvent(s, 'undo', 'payment_same_year_reversal', '2026-06-20', 'missing'); blocked(s)
  const twice = paid(); invoiceEvent(twice, 'u1', 'payment_same_year_reversal', '2026-06-20', 'pay'); invoiceEvent(twice, 'u2', 'payment_same_year_reversal', '2026-06-21', 'pay'); blocked(twice)
})
test('reversing/rebooking a receivable settlement never adds sales or VAT', () => {
  const s = invoiceEvent(invoiceFixture(), 'ye', 'year_end_receivable', '2026-12-31')
  invoiceEvent(s, 'settle', 'receivable_settlement', '2027-01-10')
  invoiceEvent(s, 'undo', 'receivable_settlement_reversal', '2027-01-20', 'settle')
  let r = assess(sealInvoice(s)).result
  assert.equal(r.bankOre, 0); assert.equal(r.vatOre, 25000); assert.equal(r.incomeTaxOre, 30000)
  invoiceEvent(s, 'again', 'receivable_settlement', '2027-02-01')
  r = assess(sealInvoice(s)).result
  assert.equal(r.recommendedOre, 70000)
  s.transactions.find(t => t.id === 'undo')!.corrects_ver_nr = 999; blocked(s)
})
test('overlapping and backdated repayment chains remain blocked', () => {
  const s = paid(); invoiceEvent(s, 'another', 'payment_same_year', '2026-07-01'); blocked(s)
  const back = paid(); invoiceEvent(back, 'undo', 'payment_same_year_reversal', '2026-07-20', 'pay'); invoiceEvent(back, 'again', 'payment_same_year', '2026-07-10'); blocked(back)
})
test('same-day undo/rebooking and reversed payment before year-end receivable are valid', () => {
  const s = paid(); invoiceEvent(s, 'undo', 'payment_same_year_reversal', '2026-06-10', 'pay'); invoiceEvent(s, 'again', 'payment_same_year', '2026-06-10')
  assert.equal(assess(sealInvoice(s)).result.recommendedOre, 70000)
  const ye = paid(); invoiceEvent(ye, 'undo', 'payment_same_year_reversal', '2026-06-20', 'pay'); invoiceEvent(ye, 'ye', 'year_end_receivable', '2026-12-31')
  assert.equal(assess(sealInvoice(ye)).result.bankOre, 0)
  assert.equal(assess(sealInvoice(ye)).result.vatOre, 25000)
  assert.equal(assess(sealInvoice(ye)).result.incomeTaxOre, 30000)
})
test('cross-year reversal preserves old positive tax and VAT reserves', () => {
  const s = paid(); invoiceEvent(s, 'undo', 'payment_same_year_reversal', '2027-01-20', 'pay')
  const r = assess(sealInvoice(s)).result
  assert.equal(r.bankOre, 0); assert.equal(r.incomeTaxOre, 30000); assert.equal(r.vatOre, 25000); assert.equal(r.recommendedOre, 0)
})
test('read-only mixed manual purchases, corrections and periodization retain shared calculations', () => {
  const s = paid()
  addWithdrawalTx(s, 'purchase', '2026-06-15', 'manual', [['1930', -125], ['5420', 100], ['2641', 25]])
  addWithdrawalTx(s, 'correction', '2026-06-16', 'manual', [['1930', 125], ['5420', -100], ['2641', -25]])
  addWithdrawalTx(s, 'periodization', '2026-12-31', 'manual', [['1790', 100], ['5420', -100]])
  addWithdrawalTx(s, 'periodization-reversal', '2027-01-01', 'manual', [['1790', -100], ['5420', 100]])
  sealInvoice(s); const before = structuredClone(s)
  const r = assess(s).result
  assert.equal(r.bankOre, 125000); assert.equal(r.incomeTaxOre, 33000); assert.equal(r.vatOre, 25000); assert.equal(r.recommendedOre, 67000)
  assert.deepEqual(s, before)
})
test('invoice VAT periods remain independent across month/quarter/year boundaries', () => {
  for (const end of ['2026-06-30', '2026-09-30', '2026-12-31']) {
    const s = paid(); s.periods = [{ id: 'p', user_id: s.user_id, period_start: '2026-06-01', period_end: end, source: 'sololedger', status: 'open' }]
    assert.equal(assess(sealInvoice(s)).result.recommendedOre, 70000)
    s.periods = []; blocked(s)
  }
})
test('invoice reversal in another VAT month cannot release the first month reserve', () => {
  const s = paid(); invoiceEvent(s, 'undo', 'payment_same_year_reversal', '2026-07-10', 'pay'); invoiceEvent(s, 'again', 'payment_same_year', '2026-08-01')
  s.periods = ['06', '07', '08'].map((month, i) => ({ id: 'p'+i, user_id: s.user_id, period_start: `2026-${month}-01`, period_end: `2026-${month}-${month === '06' ? '30' : '31'}`, source: 'sololedger', status: 'open' }))
  const r = assess(sealInvoice(s)).result
  assert.equal(r.vatOre, 50000); assert.equal(r.incomeTaxOre, 30000); assert.equal(r.recommendedOre, 45000)
})
test('negative bank never yields a positive recommendation with verified invoices', () => {
  const s = paid(); addWithdrawalTx(s, 'withdrawn', '2026-06-15', 'manual', [['1930', -2000], ['2013', 2000]])
  const r = assess(sealInvoice(s)).result; assert.equal(r.bankOre, -75000); assert.equal(r.recommendedOre, 0)
})
test('later generic correction of historical manual link requires review', () => {
  const s = invoiceEvent(invoiceFixture(0), 'legacy', 'historical_payment_same_year', '2026-06-10')
  addWithdrawalTx(s, 'corrected', '2026-07-01', 'manual', [['1930', -1000], ['3010', 1000]])
  Object.assign(s.transactions.at(-1)!, { is_correction: true, corrects_ver_nr: s.journal[0].ver_nr })
  blocked(s)
})
test('rounding discrepancy stays blocked by existing VAT engine, no new tolerance/formula', () => {
  const s = invoiceFixture(); Object.assign(s.invoices[0], { gross_amount: 0.07, net_amount: 0.06, vat_amount: 0.01 })
  invoiceEvent(s, 'pay', 'payment_same_year', '2026-06-10')
  assert.deepEqual(validateWithdrawalInvoices(sealInvoice(s)).issues, [])
  assert(assess(s).result.issues.some(i => i.includes('Momsunderlaget'))); blocked(s)
})
test('tax decisions remain authoritative, saved annual rate is not bypassed', () => {
  const s = paid(); addWithdrawalFact(s, 'rate:2026', { rate: 55 })
  assert.equal(assess(sealInvoice(s)).result.incomeTaxOre, 55000)
})
test('protocol 1/2 and missing invoice evidence fail closed', () => {
  for (const override of [{ protocol: 1 }, { protocol: 2 }, { invoices: undefined }, { invoice_bookings: undefined }, { invoice_journal: undefined }]) {
    assert.throws(() => assess(Object.assign(sealInvoice(paid()), override)))
  }
})
for (const source of ['fixed_asset', 'fixed_asset_reclassification', 'fixed_asset_depreciation', 'sie_import', 'sie_opening_balance', 'sie_import_undo', 'unknown']) test(`unsupported ${source} remains blocked alongside verified invoice`, () => {
  const s = paid(); addWithdrawalTx(s, 'unsupported', '2026-06-15', source, [['1930', 100], ['2018', -100]]); blocked(s)
})

test('P2 full journal: five rows must block even when two are after valuation date', () => {
  const s = invoiceEvent(invoiceFixture(25, '2026-10-20'), 'pay', 'payment_same_year', '2026-06-10')
  const complete = [...s.journal, { ...s.journal[0], id: 'future-cost', date: '2026-12-01', account_number: '5410', debit: 500, credit: 0 }, { ...s.journal[0], id: 'future-bank', date: '2026-12-01', account_number: '1930', debit: 0, credit: 500 }]
  s.journal = complete.filter(j => j.date <= s.as_of)
  assert.equal(assess(sealInvoice(s, complete)).result.recommendedOre, null)
})
test('P2 overlap: an additional zero-day pair inside an active payment must block', () => {
  const s = paid(); invoiceEvent(s, 'extra', 'payment_same_year', '2026-06-20'); invoiceEvent(s, 'undo-extra', 'payment_same_year_reversal', '2026-06-20', 'extra')
  blocked(s)
})
test('P2 overlap: a zero-day pair inside an active settlement across years must block', () => {
  const s = invoiceEvent(invoiceFixture(), 'ye', 'year_end_receivable', '2026-12-31')
  invoiceEvent(s, 'settle', 'receivable_settlement', '2027-01-10')
  invoiceEvent(s, 'extra', 'receivable_settlement', '2027-01-20')
  invoiceEvent(s, 'undo-extra', 'receivable_settlement_reversal', '2027-01-20', 'extra')
  blocked(s)
})
test('P2 overlap: zero-day undo before a later payment remains valid', () => {
  const s = paid(); invoiceEvent(s, 'undo', 'payment_same_year_reversal', '2026-06-10', 'pay'); invoiceEvent(s, 'again', 'payment_same_year', '2026-06-20')
  assert.equal(assess(sealInvoice(s)).result.recommendedOre, 70000)
})
test('P2 full journal: proof cannot disagree with the economic rows', () => {
  const s = paid(); const proof = structuredClone(s.journal); proof[0].id = 'different-id'
  assert.equal(assess(sealInvoice(s, proof)).result.recommendedOre, null)
})
test('P2 full journal: foreign proof owner fails closed', () => {
  const s = paid(); const proof = structuredClone(s.journal); proof[0].user_id = 'synthetic-b'
  assert.throws(() => assess(sealInvoice(s, proof)), /användare/)
})
test('P2 full journal: missing row or incomplete proof cannot authorize an invoice', () => {
  const s = paid()
  assert.equal(assess(sealInvoice(s, s.journal.slice(0, 2))).result.recommendedOre, null)
})
test('P2 full journal: hidden future row changes proof signature but not dated bank', () => {
  const s = paid(); s.as_of = '2026-10-20'
  sealInvoice(s); const previous = s.signature
  const proof = [...s.journal, { ...s.journal[0], id: 'future-zero', date: '2027-01-01', debit: 0, credit: 0 }]
  const r = assess(sealInvoice(s, proof)).result
  assert.notEqual(s.signature, previous); assert.equal(r.bankOre, 125000); assert.equal(r.recommendedOre, null)
})
test('P2 overlap: zero-day pair followed by later-year receivable settlement is legitimate', () => {
  const s = invoiceEvent(invoiceFixture(), 'pay', 'payment_same_year', '2026-06-10')
  invoiceEvent(s, 'undo', 'payment_same_year_reversal', '2026-06-10', 'pay')
  invoiceEvent(s, 'ye', 'year_end_receivable', '2026-12-31')
  invoiceEvent(s, 'settle', 'receivable_settlement', '2027-01-10')
  assert.equal(assess(sealInvoice(s)).result.recommendedOre, 70000)
})
