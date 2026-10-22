import { addWithdrawalFact, addWithdrawalTx, saleWithdrawal, sealWithdrawal } from './withdrawalFixtures.ts'
import type { WithdrawalSnapshot } from '../../src/lib/withdrawalAssessment.ts'
import type { WithdrawalSupplierEvent } from '../../src/lib/withdrawalSupplierValidation.ts'

export function supplierFixture(deduction: 'full' | 'none' = 'full', rate = 25) {
  const s = saleWithdrawal()
  const gross = 1000 + rate * 10, vat = rate * 10
  s.supplierProof = { owner: s.user_id, asOf: s.as_of, sourceSignature: s.signature, invoices: [{
    id: 'supplier', user_id: s.user_id, fiscal_year: 2026, invoice_date: '2026-12-20', received_date: '2026-12-21',
    gross_amount: gross, vat_rate: rate, invoice_vat: vat, deductible_vat: deduction === 'full' ? vat : 0,
    deduction, expense_account: '6110', attachment_path: s.user_id + '/invoice.pdf', year_end_transaction_id: 'origin',
  }], events: [], journal: [] }
  supplierEvent(s, 'origin', 'year_end', '2026-12-31')
  return s
}
export function supplierEvent(s: WithdrawalSnapshot, id: string, kind: string, date: string, reverses: string | null = null) {
  const proof = s.supplierProof!, i = proof.invoices[0]
  const acquisition = kind === 'year_end' || kind === 'year_end_reversal'
  const reversal = kind.endsWith('reversal')
  const gross = Number(i.gross_amount), deductible = Number(i.deductible_vat)
  const lines: [string, number][] = acquisition
    ? [[i.expense_account, gross - deductible], ['2440', -gross], ...(deductible ? [['2641', deductible] as [string, number]] : [])]
    : [['2440', gross], ['1930', -gross]]
  addWithdrawalTx(s, id, date, 'supplier_invoice', reversal ? lines.map(([a, n]) => [a, -n]) : lines)
  Object.assign(s.transactions.at(-1)!, { amount: gross, type: 'supplier_invoice', vat_rate: acquisition ? Number(i.vat_rate) : 0,
    is_correction: false, corrects_ver_nr: null, is_periodized: false, is_periodized_reversal: false,
    import_batch_id: null, periodization_group_id: null })
  s.journal.filter(j => j.transaction_id === id).forEach(j => { j.ver_nr = proof.events.length + 10 })
  const key = `00000000-0098-4000-8000-${String(proof.events.length + 1).padStart(12, '0')}`
  const actions: Record<string, string> = { year_end: 'book', payment: 'pay', payment_reversal: 'undo_payment', year_end_reversal: 'cancel' }
  const event: WithdrawalSupplierEvent = { id, user_id: s.user_id, invoice_id: i.id, transaction_id: id, kind, event_date: date,
    reverses_event_id: reverses, request_key: key, request_payload: { action: actions[kind], request_key: key, invoice_id: i.id } }
  if (kind === 'year_end') Object.assign(event.request_payload, { country: 'SE', currency: 'SEK', invoice_kind: 'ordinary_expense',
    wholly_unpaid: true, delivered_in_year: true, not_previously_booked: true, not_credit_or_partial: true,
    fiscal_year: i.fiscal_year, invoice_date: i.invoice_date, received_date: i.received_date, gross_amount: gross,
    invoice_vat: i.invoice_vat, vat_rate: i.vat_rate, deduction: i.deduction, expense_account: i.expense_account, attachment_path: i.attachment_path })
  if (kind === 'payment') Object.assign(event.request_payload, { payment_date: date, paid_amount: gross })
  proof.events.push(event)
  return sealSupplier(s)
}
export function sealSupplier(s: WithdrawalSnapshot) {
  sealWithdrawal(s)
  const proof = s.supplierProof!
  proof.sourceSignature = s.signature
  proof.asOf = s.as_of
  proof.journal = structuredClone(s.journal.filter(j => s.transactions.some(t => t.id === j.transaction_id && t.source === 'supplier_invoice')))
  return s
}
export function confirmSupplierDebt(s: WithdrawalSnapshot, amountOre: number) {
  addWithdrawalFact(s, 'other', { amountOre, basis: JSON.stringify({ '2440': -amountOre / 100 }) })
  return sealSupplier(s)
}
