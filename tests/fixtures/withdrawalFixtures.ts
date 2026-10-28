import { stableWithdrawalValue, withdrawalFinancialRows, type WithdrawalSnapshot, type WithdrawalFact } from '../../src/lib/withdrawalAssessment.ts'
export function emptyWithdrawal(asOf = '2027-01-20'): WithdrawalSnapshot {
  return { result_closing_reviews: [], protocol: 3, invoices: [], invoice_bookings: [], invoice_journal: [], user_id: 'synthetic-a', as_of: asOf, signature: 'snapshot', financial_signature: 'empty', anchor_financial_signature: null,
    transactions: [], journal: [], periods: [], snapshots: [], events: [], movements: [], roles: [], revision: null }
}
export function addWithdrawalTx(s: WithdrawalSnapshot, id: string, date: string, source: string, lines: [string, number][]) {
  const year = Number(date.slice(0, 4))
  if (!s.result_closing_reviews.some(r => r.year === year)) s.result_closing_reviews.push({
    version: 1, year, through_date: year === Number(s.as_of.slice(0, 4)) ? s.as_of : `${year}-12-31`, blocked: false, entries: [],
  })
  s.transactions.push({ id, user_id: s.user_id, date, source, booked: true })
  for (const [i, [account_number, net]] of lines.entries()) s.journal.push({ id: id + ':' + i, user_id: s.user_id, transaction_id: id, date, account_number, debit: Math.max(net, 0), credit: Math.max(-net, 0) })
}
export function addWithdrawalFact(s: WithdrawalSnapshot, key: string, value: Record<string, unknown>) {
  s.revision ??= { id: 'revision', user_id: s.user_id, as_of_date: s.as_of, recorded_at: '2026-12-31T12:00:00Z', facts: [] }
  s.revision.facts = [...s.revision.facts.filter(f => f.key !== key), { key, value }]
}
export function sealWithdrawal(s: WithdrawalSnapshot) {
  // Synthetic server verdicts must follow harness date shifts. Never clear a
  // positive KAN-96 verdict; the real journal rule is verified in the DB suite.
  s.result_closing_reviews = [...new Set(s.journal.map(j => Number(j.date.slice(0, 4))))].map(year => {
    const existing = s.result_closing_reviews.find(r => r.year === year)
    return existing?.blocked ? existing : { version: 1 as const, year,
      through_date: year === Number(s.as_of.slice(0, 4)) ? s.as_of : `${year}-12-31`, blocked: false, entries: [] }
  })
  s.signature = stableWithdrawalValue({ asOf:s.as_of,transactions:s.transactions,journal:s.journal,periods:s.periods,snapshots:s.snapshots,events:s.events,movements:s.movements,roles:s.roles,invoices:s.invoices,invoice_bookings:s.invoice_bookings,invoice_journal:s.invoice_journal })
  s.financial_signature = withdrawalFinancialRows(s, s.as_of)
  const tax = s.revision?.facts.find(f => f.key === 'tax_account')?.value
  s.anchor_financial_signature = tax ? withdrawalFinancialRows(s, tax.date as string) : null
  return s
}
export function checkWithdrawalTax(s: WithdrawalSnapshot, saldoOre: number, date = s.as_of) {
  sealWithdrawal(s)
  const value = { saldoOre, date, basis: withdrawalFinancialRows(s, date) }
  addWithdrawalFact(s, 'tax_account', value)
  return sealWithdrawal(s)
}
export function saleWithdrawal() {
  const s = emptyWithdrawal()
  addWithdrawalTx(s, 'sale', '2026-12-10', 'manual', [['1930', 125000], ['3010', -100000], ['2611', -25000]])
  s.periods.push({ id: 'p', user_id: s.user_id, period_start: '2026-01-01', period_end: '2026-12-31', source: 'sololedger', status: 'open' })
  addWithdrawalFact(s, 'coverage', { from: '2026-12-10', noEarlierObligations: true })
  addWithdrawalFact(s, 'rate:2026', { rate: 30 })
  return sealWithdrawal(s)
}
export function replaceWithdrawalFacts(s: WithdrawalSnapshot, facts: WithdrawalFact[]) {
  s.revision = { id: 'revision', user_id: s.user_id, as_of_date: s.as_of, recorded_at: s.as_of, facts }
  return sealWithdrawal(s)
}
