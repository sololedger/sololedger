import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWithdrawalAssessment as assess, stableWithdrawalValue, withdrawalAnnualRate } from '../src/lib/withdrawalAssessment.ts'
import { addWithdrawalFact as fact, addWithdrawalTx as tx, checkWithdrawalTax as tax, emptyWithdrawal, saleWithdrawal, sealWithdrawal } from '../tests/fixtures/withdrawalFixtures.ts'

test('R1: standalone 2650 liability must block an unexplained recommendation', () => {
  const s = emptyWithdrawal()
  tx(s, 'capital', '2026-01-01', 'manual', [['1930', 100000], ['2018', -100000]])
  tx(s, 'debt', '2026-01-02', 'manual', [['1930', 25000], ['2650', -25000]])
  fact(s, 'coverage', { from: '2026-01-01', noEarlierObligations: true })
  assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null)
})

test('R2: uncovered VAT activity cannot be netted annually without proven period boundaries', () => {
  const s = emptyWithdrawal('2026-10-19')
  tx(s, 'capital', '2026-01-01', 'manual', [['1930', 100000], ['2018', -100000]])
  tx(s, 'sale', '2026-01-10', 'manual', [['1930', 125000], ['3010', -100000], ['2611', -25000]])
  tx(s, 'purchase', '2026-02-10', 'manual', [['1930', -150000], ['4010', 120000], ['2641', 30000]])
  fact(s, 'coverage', { from: '2026-01-01', noEarlierObligations: true })
  assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null)
})

test('R4: explicit annual rate overrides legacy income rate for that year', () => {
  const s = saleWithdrawal(); tax(s, 0)
  fact(s, 'income:2026', { rate: 30, debitedOre: 0, pendingOre: 0, finalOre: null, basis: '{}', taxBasis: stableWithdrawalValue(s.revision!.facts.find(f => f.key === 'tax_account')!.value) })
  fact(s, 'rate:2026', { rate: 55 })
  assert.equal(assess(s).result.incomeTaxOre, 5500000)
  assert.equal(assess(s).result.recommendedOre, 4500000)
})

test('R5: zero model remainder does not turn an estimate into checked final tax', () => {
  const s = saleWithdrawal(); tax(s, 0)
  fact(s, 'income:2026', { rate: 45, debitedOre: 0, pendingOre: 5000000, finalOre: null, basis: '{}', taxBasis: stableWithdrawalValue(s.revision!.facts.find(f => f.key === 'tax_account')!.value) })
  fact(s, 'bank', { date: s.as_of, amountOre: 12500000, bookOre: 12500000, signature: s.signature })
  assert.equal(assess(s).result.status, 'estimated')
})

function closedSale() {
  const s = saleWithdrawal()
  tx(s, 'closing', '2026-12-31', 'vat_closing', [['2611', 25000], ['2650', -25000]])
  Object.assign(s.periods[0], { status: 'closed', closing_amount: 25000 })
  return sealWithdrawal(s)
}
test('R1: matched closing is reserved once, before and after settlement to S', () => {
  const s = closedSale()
  assert.equal(assess(s).result.recommendedOre, 7000000)
  tax(s, 0, '2027-01-01')
  tx(s, 'settled', '2027-01-10', 'vat_settlement', [['2650', 25000], ['2012', -25000]])
  s.events.push({ id: 'event', user_id: s.user_id, transaction_id: 'settled', vat_period_id: 'p', event_date: '2027-01-10', event_kind: 'vat_debit', amount: 25000 })
  const a = assess(sealWithdrawal(s)).result
  assert.equal(a.vatOre, 0)
  assert.equal(a.taxAccountOre, -2500000)
  assert.equal(a.recommendedOre, 7000000)
  s.events[0].amount = 24000
  assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null, 'mismatched event cannot explain a settlement')
})
test('R1: partial/unexplained liabilities do not hide behind a matching V or S total', () => {
  for (const account of ['2650', '2651', '2659']) {
    const s = closedSale(); tax(s, -2500000)
    tx(s, 'residual', '2027-01-01', 'manual', [['1930', 1000], [account, -1000]])
    assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null)
  }
  const s = closedSale()
  tx(s, 'other-year', '2027-01-01', 'manual', [['2650', 25000], ['2018', -25000]])
  assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null, 'net zero across years is not evidence of a settlement')
  const falseClosing = closedSale(); falseClosing.journal.find(j => j.transaction_id === 'closing' && j.account_number === '2650')!.credit = 24000
  assert.equal(assess(sealWithdrawal(falseClosing)).result.recommendedOre, null)
})
test('R1: a matched refund closing is not added as a positive debt', () => {
  const s = emptyWithdrawal()
  tx(s, 'capital', '2026-01-01', 'manual', [['1930', 10000], ['2018', -10000]])
  tx(s, 'cost', '2026-01-10', 'manual', [['5420', 1000], ['2641', 250], ['1930', -1250]])
  tx(s, 'close', '2026-12-31', 'vat_closing', [['2641', -250], ['2650', 250]])
  s.periods.push({ id: 'p', user_id: s.user_id, period_start: '2026-01-01', period_end: '2026-12-31', source: 'sololedger', status: 'closed', closing_amount: -250 })
  fact(s, 'coverage', { from: '2026-01-01', noEarlierObligations: true })
  assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, 875000)
})
function oppositeVat() {
  const s = emptyWithdrawal('2027-01-20')
  tx(s, 'capital', '2026-01-01', 'manual', [['1930', 100000], ['2018', -100000]])
  tx(s, 'sale', '2026-01-10', 'manual', [['1930', 125000], ['3010', -100000], ['2611', -25000]])
  tx(s, 'purchase', '2026-02-10', 'manual', [['1930', -150000], ['4010', 120000], ['2641', 30000]])
  fact(s, 'coverage', { from: '2026-01-01', noEarlierObligations: true })
  return s
}
test('R2: proven month/quarter/year boundaries; no writes or annual fallback', () => {
  for (const [bounds, vat, amount] of [
    [[['2026-01-01', '2026-01-31'], ['2026-02-01', '2026-02-28']], 2500000, 5000000],
    [[['2026-01-01', '2026-03-31']], 0, 7500000],
    [[['2026-01-01', '2026-12-31']], 0, 7500000],
  ] as [string[][], number, number][]) {
    const s = oppositeVat()
    s.periods = bounds.map(([period_start, period_end], i) => ({ id: String(i), user_id: s.user_id, period_start, period_end, source: 'sololedger', status: 'open' }))
    sealWithdrawal(s)
    const before = stableWithdrawalValue(s)
    assert.equal(assess(s).result.vatOre, vat)
    assert.equal(assess(s).result.recommendedOre, amount)
    assert.equal(stableWithdrawalValue(s), before, 'assessment is read-only')
    s.periods = []
    assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null, 'unknown configuration must not imply annual VAT')
  }
})
test('R2: mixed coverage, missing positive/negative periods and year boundaries', () => {
  const s = oppositeVat()
  s.periods = [{ id: 'jan', user_id: s.user_id, period_start: '2026-01-01', period_end: '2026-01-31', source: 'sololedger', status: 'open' }]
  assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null)
  s.periods[0].period_start = '2026-02-01'; s.periods[0].period_end = '2026-02-28'
  assert.equal(assess(sealWithdrawal(s)).result.recommendedOre, null)
  const cross = saleWithdrawal(); cross.as_of = '2027-02-10'
  tx(cross, 'purchase', '2027-01-10', 'manual', [['1930', -150000], ['4010', 120000], ['2641', 30000]])
  assert.equal(assess(sealWithdrawal(cross)).result.recommendedOre, null)
  cross.periods.push({ id: 'jan27', user_id: cross.user_id, period_start: '2027-01-01', period_end: '2027-01-31', source: 'sololedger', status: 'open' })
  assert.equal(assess(sealWithdrawal(cross)).result.vatOre, 2500000, 'refund in new year cannot cancel older payable VAT')
})
test('R4: per-year rates, legacy fallback, preliminary decisions, final net and validation', () => {
  const s = saleWithdrawal(); tax(s, 0)
  const taxBasis = stableWithdrawalValue(s.revision!.facts.find(f => f.key === 'tax_account')!.value)
  fact(s, 'income:2026', { rate: 30, debitedOre: 1000000, pendingOre: 500000, finalOre: null, basis: stableWithdrawalValue({ '3010': -100000 }), taxBasis })
  fact(s, 'rate:2026', { rate: 55 })
  fact(s, 'rate:2025', { rate: 25 })
  assert.equal(assess(s).result.incomeTaxOre, 4500000, '55 000 less 10 000 already debited; pending counted once')
  assert.equal(withdrawalAnnualRate(s.revision!.facts, 2025), 25)
  assert.equal(withdrawalAnnualRate(s.revision!.facts, 2026), 55)
  const income = s.revision!.facts.find(f => f.key === 'income:2026')!
  income.value.finalOre = 1500000
  assert.equal(assess(s).result.incomeTaxOre, 1500000, 'final net replaces estimate and preliminary amounts')
  fact(s, 'rate:2026', { rate: 25 })
  assert.equal(assess(s).result.incomeTaxOre, 1500000, 'rate never rewrites a final decision')
  s.revision!.facts = s.revision!.facts.filter(f => f.key !== 'rate:2026')
  assert.equal(withdrawalAnnualRate(s.revision!.facts, 2026), 30, 'legacy income remains readable')
  for (const rate of [24, 56, 30.5, '55', NaN]) {
    fact(s, 'rate:2026', { rate }); assert.throws(() => assess(s))
  }
})
test('R4: changing one profitable year leaves another profitable year unchanged', () => {
  const s = saleWithdrawal()
  tx(s, 'older-sale', '2025-12-10', 'manual', [['1930', 125000], ['3010', -100000], ['2611', -25000]])
  s.periods.push({ id: 'older', user_id: s.user_id, period_start: '2025-01-01', period_end: '2025-12-31', source: 'sololedger', status: 'open' })
  fact(s, 'coverage', { from: '2025-01-01', noEarlierObligations: true })
  fact(s, 'rate:2025', { rate: 25 }); fact(s, 'rate:2026', { rate: 55 })
  let a = assess(sealWithdrawal(s))
  assert.equal(a.result.incomeTaxOre, 8000000)
  assert.equal(a.result.recommendedOre, 12000000)
  assert.deepEqual(a.taxRates, ['2025: 25 %', '2026: 55 %'])
  fact(s, 'rate:2026', { rate: 30 })
  a = assess(sealWithdrawal(s))
  assert.deepEqual(a.taxRates, ['2025: 25 %', '2026: 30 %'])
  assert.equal(a.result.recommendedOre, 14500000)
})
