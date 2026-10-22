import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWithdrawalAssessment as assess, stableWithdrawalValue } from '../src/lib/withdrawalAssessment.ts'
import { validateWithdrawalSuppliers } from '../src/lib/withdrawalSupplierValidation.ts'
import { supplierFixture, supplierEvent, sealSupplier, confirmSupplierDebt } from '../tests/fixtures/withdrawalSupplierFixtures.ts'

const paid = () => supplierEvent(supplierFixture(), 'paid', 'payment', '2027-01-15')
for (const rate of [0, 6, 12, 25]) for (const deduction of ['full', 'none'] as const) {
  test(`unpaid ${rate}/${deduction}: journal-only debt reserve exactly once`, () => {
    const s = supplierFixture(deduction, rate), gross = 1000 + rate * 10
    assert.equal(assess(s).result.recommendedOre, null, 'unconfirmed other debts still require review')
    confirmSupplierDebt(s, gross * 100)
    const result = assess(s).result
    assert.deepEqual(result.issues, [])
    assert.equal(result.otherOre, gross * 100)
    const manual = structuredClone(s); delete manual.supplierProof
    manual.transactions.forEach(t => { if (t.source === 'supplier_invoice') t.source = 'manual' })
    assert.deepEqual(result, assess(manual).result, 'no additional contribution outside the existing journal model')
    assert.equal(result.recommendedOre, 12500000 - result.reserveOre! - gross * 100)
    const oldOther = s.revision!.facts.find(f => f.key === 'other')!
    oldOther.value.amountOre = 0
    assert.equal(assess(s).result.recommendedOre, null, 'known debt cannot be reduced by an advisory fact')
  })
  test(`paid ${rate}/${deduction}: lower bank, no residual debt or duplicate cost/VAT`, () => {
    const s = supplierEvent(supplierFixture(deduction, rate), 'paid', 'payment', '2027-01-15')
    const r = assess(s).result
    assert.deepEqual(r.issues, []); assert.equal(r.otherOre, 0)
    assert.equal(r.bankOre, (125000 - (1000 + rate * 10)) * 100)
    const manual = structuredClone(s); delete manual.supplierProof
    manual.transactions.forEach(t => { if (t.source === 'supplier_invoice') t.source = 'manual' })
    assert.deepEqual(r, assess(manual).result)
  })
}
test('payment reversal, repay and cancellation preserve signed journal economics', () => {
  const s = paid()
  supplierEvent(s, 'undo', 'payment_reversal', '2027-01-15', 'paid')
  confirmSupplierDebt(s, 125000)
  assert.deepEqual(assess(s).result.issues, []); assert.equal(assess(s).result.otherOre, 125000)
  supplierEvent(s, 'repay', 'payment', '2027-01-16')
  s.revision!.facts = s.revision!.facts.filter(f => f.key !== 'other')
  assert.deepEqual(assess(s).result.issues, [])
  supplierEvent(s, 'undo2', 'payment_reversal', '2027-01-16', 'repay')
  supplierEvent(s, 'cancel', 'year_end_reversal', '2026-12-31', 'origin')
  const r = assess(s).result
  assert.deepEqual(r.issues, []); assert.equal(r.otherOre, 0); assert.equal(r.bankOre, 12500000)
  assert.equal(r.recommendedOre, 7000000, 'cancelled cost restores original tax reserve; no artificial extra withdrawal')
})
test('unpaid at historical year end ignores current paid status and future payment', () => {
  const s = supplierFixture()
  s.as_of = '2026-12-31'; sealSupplier(s); confirmSupplierDebt(s, 125000)
  assert.deepEqual(assess(s).result.issues, [])
  assert.equal(assess(s).result.bankOre, 12500000)
})
test('higher externally confirmed other obligations replace, never add to, booked debt', () => {
  const s = confirmSupplierDebt(supplierFixture(), 125000)
  s.revision!.facts.find(f => f.key === 'other')!.value.amountOre = 200000
  assert.equal(assess(s).result.otherOre, 200000)
})
function blocked(s: ReturnType<typeof paid>) {
  assert.equal(assess(s).result.recommendedOre, null)
  assert(validateWithdrawalSuppliers(s).issues.length > 0)
}
for (const [name, change] of Object.entries({
  'missing proof': (s: ReturnType<typeof paid>) => { delete s.supplierProof },
  'missing invoice': (s: ReturnType<typeof paid>) => { s.supplierProof!.invoices = [] },
  'missing event': (s: ReturnType<typeof paid>) => { s.supplierProof!.events.pop() },
  'wrong invoice link': (s: ReturnType<typeof paid>) => { s.supplierProof!.events[1].invoice_id = 'missing' },
  'wrong origin': (s: ReturnType<typeof paid>) => { s.supplierProof!.invoices[0].year_end_transaction_id = 'paid' },
  'duplicate invoice': (s: ReturnType<typeof paid>) => { s.supplierProof!.invoices.push(s.supplierProof!.invoices[0]) },
  'duplicate event': (s: ReturnType<typeof paid>) => { s.supplierProof!.events.push(s.supplierProof!.events[0]) },
  'duplicate receipt': (s: ReturnType<typeof paid>) => { s.supplierProof!.events[1].request_key = s.supplierProof!.events[0].request_key },
  'duplicate journal': (s: ReturnType<typeof paid>) => { s.supplierProof!.journal.push(s.supplierProof!.journal[0]) },
  'missing full journal': (s: ReturnType<typeof paid>) => { s.supplierProof!.journal.pop() },
  'extra future row': (s: ReturnType<typeof paid>) => { s.supplierProof!.journal.push({ ...s.supplierProof!.journal[0], id: 'extra', date: '2028-01-01' }) },
  'wrong journal sign': (s: ReturnType<typeof paid>) => { const j = s.supplierProof!.journal[0]; [j.debit, j.credit] = [j.credit, j.debit] },
  'forged bank payment': (s: ReturnType<typeof paid>) => { s.journal.find(j => j.transaction_id === 'paid' && j.account_number === '1930')!.credit = 1 },
  'VAT on settlement': (s: ReturnType<typeof paid>) => { s.transactions[2].vat_rate = 25 },
  'partial payment': (s: ReturnType<typeof paid>) => { s.supplierProof!.events[1].request_payload.paid_amount = 100 },
  'unknown event': (s: ReturnType<typeof paid>) => { s.supplierProof!.events[1].kind = 'future' },
  'unknown transaction source': (s: ReturnType<typeof paid>) => { s.transactions[2].source = 'unknown' },
  'wrong transaction type': (s: ReturnType<typeof paid>) => { s.transactions[2].type = 'manual' },
  'import metadata': (s: ReturnType<typeof paid>) => { s.transactions[2].import_batch_id = 'import' },
  'unbooked transaction': (s: ReturnType<typeof paid>) => { s.transactions[2].booked = false },
  'mismatching VAT decision': (s: ReturnType<typeof paid>) => { s.supplierProof!.invoices[0].deductible_vat = 0 },
  'foreign country': (s: ReturnType<typeof paid>) => { s.supplierProof!.events[0].request_payload.country = 'DK' },
  'missing receipt': (s: ReturnType<typeof paid>) => { s.supplierProof!.events[0].request_payload = {} },
  'foreign attachment': (s: ReturnType<typeof paid>) => { s.supplierProof!.invoices[0].attachment_path = 'other/invoice.pdf' },
  'foreign proof': (s: ReturnType<typeof paid>) => { s.supplierProof!.owner = 'other' },
  'foreign invoice': (s: ReturnType<typeof paid>) => { s.supplierProof!.invoices[0].user_id = 'other' },
  'foreign event': (s: ReturnType<typeof paid>) => { s.supplierProof!.events[0].user_id = 'other' },
  'foreign journal': (s: ReturnType<typeof paid>) => { s.supplierProof!.journal[0].user_id = 'other' },
  'different snapshot': (s: ReturnType<typeof paid>) => { s.supplierProof!.sourceSignature = 'different' },
  'different date': (s: ReturnType<typeof paid>) => { s.supplierProof!.asOf = '2026-12-31' },
})) test(`fail closed: ${name}`, () => { const s = paid(); change(s); blocked(s) })
test('double payment, wrong reversal and cancellation of active payment are rejected', () => {
  const double = paid(); supplierEvent(double, 'double', 'payment', '2027-01-16'); blocked(double)
  const wrong = paid(); supplierEvent(wrong, 'wrong', 'payment_reversal', '2027-01-15', 'origin'); blocked(wrong)
  const cancelled = paid(); supplierEvent(cancelled, 'cancel', 'year_end_reversal', '2026-12-31', 'origin'); blocked(cancelled)
  const duplicate = paid(); supplierEvent(duplicate, 'u1', 'payment_reversal', '2027-01-15', 'paid')
  supplierEvent(duplicate, 'u2', 'payment_reversal', '2027-01-15', 'paid'); blocked(duplicate)
})
test('unknown source without any supplier records is still blocked', () => {
  const s = paid(); delete s.supplierProof; s.transactions[2].source = 'future'
  assert.equal(assess(s).result.recommendedOre, null)
})
test('verification never mutates journal, invoices or advice facts', () => {
  const s = paid(), before = stableWithdrawalValue(s)
  assess(s); assess(s)
  assert.equal(stableWithdrawalValue(s), before)
})
