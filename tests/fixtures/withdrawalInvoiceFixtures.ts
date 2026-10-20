import { emptyWithdrawal, addWithdrawalFact, addWithdrawalTx, sealWithdrawal } from './withdrawalFixtures.ts'

// Synthetic persisted facts, deliberately independent of the proposed validator.
export function invoiceFixture(rate = 25, asOf = '2027-02-20') {
  const base = emptyWithdrawal(asOf)
  const invoice = {
    id: 'invoice', user_id: base.user_id, invoice_date: '2026-06-01', service_date: '2026-06-01',
    customer_country: 'SE', currency: 'SEK', payment_status: 'unpaid',
    gross_amount: 1000 + rate * 10, net_amount: 1000, vat_amount: rate * 10, vat_rate: rate,
    vat_treatment: rate ? 'taxable' : 'exempt', vat_policy_snapshot_status: 'captured',
    vat_policy_vat_status: 'registered', vat_policy_domestic_sales_vat_treatment: 'taxable',
    vat_policy_captured_at: '2026-06-01T12:00:00Z', vat_policy_source: 'create',
  }
  const s = { ...base, protocol: 3 as const, invoices: [invoice], invoice_bookings: [] as {
    id: string; user_id: string; invoice_id: string; transaction_id: string; booking_kind: string;
    booking_date: string; fiscal_year: number; gross_amount: number; net_amount: number;
    vat_amount: number; reverses_booking_id: string | null;
  }[] }
  for (const year of [2026, 2027]) {
    s.periods.push({ id: `p${year}`, user_id: s.user_id, period_start: `${year}-01-01`, period_end: `${year}-12-31`, source: 'sololedger', status: 'open' })
    addWithdrawalFact(base, `rate:${year}`, { rate: 30 })
  }
  s.revision = base.revision
  addWithdrawalFact(base, 'coverage', { from: '2026-01-01', noEarlierObligations: true })
  s.revision = base.revision
  return s
}
export type InvoiceFixture = ReturnType<typeof invoiceFixture>
export function invoiceEvent(s: InvoiceFixture, id: string, kind: string, date: string, reverses: string | null = null) {
  const inv = s.invoices[0], g = inv.gross_amount, n = inv.net_amount, m = inv.vat_amount
  const account = ({ 25: '2611', 12: '2621', 6: '2631' } as Record<number, string>)[inv.vat_rate]
  const reversal = kind.endsWith('_reversal')
  const settlement = kind.startsWith('receivable_settlement')
  const counter = kind === 'year_end_receivable' ? '1510' : '1930'
  const original = reverses && s.invoice_bookings.find(b => b.id === reverses)
  const lines: [string, number][] = settlement ? [['1930', g], ['1510', -g]] : [[counter, g], ['3010', -n], ...(m ? [[account, -m] as [string, number]] : [])]
  const compatible = s as unknown as Parameters<typeof addWithdrawalTx>[0]
  addWithdrawalTx(compatible, id, date, kind === 'historical_payment_same_year' ? 'manual' : 'customer_invoice', lines.map(([a, v]) => [a, reversal ? -v : v]))
  const ver = s.transactions.length
  Object.assign(s.transactions.at(-1)!, { amount: g, type: kind === 'historical_payment_same_year' ? 'försäljning' : 'customer_invoice', vat_rate: inv.vat_rate, is_correction: reversal, corrects_ver_nr: original ? s.journal.find(j => j.transaction_id === original.transaction_id)?.ver_nr : null, import_batch_id: null, is_periodized: false, is_periodized_reversal: false, periodization_group_id: null })
  for (const j of s.journal.filter(j => j.transaction_id === id)) Object.assign(j, { ver_nr: ver })
  s.invoice_bookings.push({ id, user_id: s.user_id, invoice_id: inv.id, transaction_id: id, booking_kind: kind, booking_date: date, fiscal_year: Number(date.slice(0, 4)), gross_amount: g, net_amount: n, vat_amount: m, reverses_booking_id: reverses })
  return s
}
export function sealInvoice(s: InvoiceFixture, completeJournal?: typeof s.journal) {
  const linked = new Set(s.invoice_bookings.map(b => b.transaction_id))
  s.invoice_journal = structuredClone(completeJournal ?? s.journal.filter(j => linked.has(j.transaction_id)))
  return sealWithdrawal(s)
}
