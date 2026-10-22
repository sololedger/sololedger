import { toOre, validWithdrawalDate } from './withdrawalModel.ts'
import type { WithdrawalSnapshot, WithdrawalJournal } from './withdrawalAssessment.ts'

export interface WithdrawalSupplierInvoice {
  id: string; user_id: string; fiscal_year: number; invoice_date: string; received_date: string
  gross_amount: number | string; vat_rate: number | string; invoice_vat: number | string
  deductible_vat: number | string; deduction: string; expense_account: string
  attachment_path: string; year_end_transaction_id: string
}
export interface WithdrawalSupplierEvent {
  id: string; user_id: string; invoice_id: string; transaction_id: string; kind: string
  event_date: string; request_key: string; request_payload: Record<string, unknown>
  reverses_event_id: string | null
}
export interface WithdrawalSupplierProof {
  owner: string; asOf: string; sourceSignature: string
  invoices: WithdrawalSupplierInvoice[]; events: WithdrawalSupplierEvent[]; journal: WithdrawalJournal[]
}
const expenses = new Set(['6110', '6212', '6310', '6540', '5910', '5420'])
const actions: Record<string, string> = { year_end: 'book', payment: 'pay', payment_reversal: 'undo_payment', year_end_reversal: 'cancel' }
function requireProof(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
function unique(rows: { id: string }[]) { return new Set(rows.map(r => r.id)).size === rows.length }

// Evidence gate only. Journal balances remain the sole source of costs, VAT, bank and debt.
// Current invoice status is deliberately not used to infer its status at a historical as-of date.
export function validateWithdrawalSuppliers(s: WithdrawalSnapshot) {
  const issues: string[] = []
  const verifiedTransactionIds = new Set<string>()
  const supplierIds = s.transactions.filter(t => t.source === 'supplier_invoice').map(t => t.id)
  const proof = s.supplierProof
  if (!proof && !supplierIds.length) return { issues, verifiedTransactionIds }
  try {
    requireProof(proof && proof.owner === s.user_id && proof.asOf === s.as_of && proof.sourceSignature === s.signature,
      'Leverantörsskuldernas bevis saknas eller tillhör ett annat uttagsunderlag.')
    requireProof([proof.invoices, proof.events, proof.journal].every(rows => Array.isArray(rows) && unique(rows) && rows.every(r => r.user_id === s.user_id)),
      'Leverantörsskuldernas bevis är dubblerade, ofullständiga eller tillhör en annan användare.')
    const invoices = new Map(proof.invoices.map(i => [i.id, i]))
    const events = new Map(proof.events.map(e => [e.id, e]))
    const transactions = new Map(s.transactions.map(t => [t.id, t]))
    requireProof(new Set(proof.events.map(e => e.transaction_id)).size === proof.events.length &&
      new Set(proof.events.map(e => e.request_key)).size === proof.events.length,
    'Leverantörsskulderna har dubbla händelse- eller bokningskopplingar.')
    requireProof(proof.events.every(e => invoices.has(e.invoice_id)) &&
      proof.journal.every(j => proof.events.some(e => e.transaction_id === j.transaction_id)),
    'Leverantörsskuldens faktura- eller journalanknytning saknas.')
    for (const invoice of proof.invoices) {
      const yearEnd = `${invoice.fiscal_year}-12-31`
      requireProof(Number.isInteger(invoice.fiscal_year) && invoice.fiscal_year >= 2025 && invoice.fiscal_year <= 9998 && yearEnd <= s.as_of &&
        validWithdrawalDate(invoice.invoice_date) && validWithdrawalDate(invoice.received_date) &&
        invoice.invoice_date >= `${invoice.fiscal_year}-01-01` && invoice.invoice_date <= invoice.received_date && invoice.received_date <= yearEnd,
      'Leverantörsfakturans bokslutsår eller datum kan inte verifieras.')
      const gross = toOre(invoice.gross_amount), vat = toOre(invoice.invoice_vat), deductible = toOre(invoice.deductible_vat)
      const rate = Number(invoice.vat_rate)
      requireProof(invoice.vat_rate !== null && gross > 0 && vat >= 0 && vat < gross && [0, 6, 12, 25].includes(rate) &&
        vat === Math.round(gross * rate / (100 + rate)) &&
        ((invoice.deduction === 'none' && deductible === 0) || (invoice.deduction === 'full' && deductible === vat)) &&
        expenses.has(invoice.expense_account) && typeof invoice.attachment_path === 'string' &&
        invoice.attachment_path.split('/')[0] === s.user_id && !invoice.attachment_path.includes('..'),
      'Leverantörsfakturans belopp, moms, kostnad eller underlagsägare kan inte verifieras.')
      const own = proof.events.filter(e => e.invoice_id === invoice.id)
      const origins = own.filter(e => e.kind === 'year_end')
      const cancellations = own.filter(e => e.kind === 'year_end_reversal')
      requireProof(origins.length === 1 && origins[0].transaction_id === invoice.year_end_transaction_id && cancellations.length <= 1,
        'Leverantörsskulden saknar en entydig bokslutskoppling.')
      const reversed = new Set<string>()
      for (const event of own) {
        const action = actions[event.kind]
        const reversal = event.kind === 'payment_reversal' || event.kind === 'year_end_reversal'
        const acquisition = event.kind === 'year_end' || event.kind === 'year_end_reversal'
        requireProof(Object.hasOwn(actions, event.kind) && validWithdrawalDate(event.event_date) && event.event_date <= s.as_of &&
          (acquisition ? event.event_date === yearEnd : event.event_date > yearEnd),
        'Leverantörsskuldens händelsetyp eller datum kan inte verifieras.')
        requireProof(typeof event.request_key === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.request_key) &&
          event.request_payload?.request_key === event.request_key && event.request_payload.action === action &&
          (event.kind === 'year_end' || event.request_payload.invoice_id === invoice.id),
        'Leverantörshändelsens bokningskvitto stämmer inte med fakturan.')
        if (event.kind === 'year_end') {
          const p = event.request_payload
          requireProof(p.country === 'SE' && p.currency === 'SEK' && p.invoice_kind === 'ordinary_expense' &&
            p.wholly_unpaid === true && p.delivered_in_year === true && p.not_previously_booked === true && p.not_credit_or_partial === true &&
            p.fiscal_year === invoice.fiscal_year && p.invoice_date === invoice.invoice_date && p.received_date === invoice.received_date &&
            toOre(p.gross_amount) === gross && toOre(p.invoice_vat) === vat && Number(p.vat_rate) === rate &&
            p.deduction === invoice.deduction && p.expense_account === invoice.expense_account && p.attachment_path === invoice.attachment_path,
          'Leverantörsfakturans sparade beslut motsäger bokningskvittot.')
        }
        if (event.kind === 'payment') requireProof(event.request_payload.payment_date === event.event_date && toOre(event.request_payload.paid_amount) === gross,
          'Leverantörsskulden saknar styrkt helbetalning.')
        if (reversal) {
          const original = events.get(event.reverses_event_id ?? '')
          requireProof(original && original.invoice_id === invoice.id && original.event_date === event.event_date &&
            original.kind === (event.kind === 'payment_reversal' ? 'payment' : 'year_end') && !reversed.has(original.id),
          'Leverantörsskuldens rättelse saknar ett entydigt original.')
          reversed.add(original.id)
        } else requireProof(event.reverses_event_id === null, 'Leverantörshändelsen har en oväntad rättelselänk.')
        const tx = transactions.get(event.transaction_id)
        requireProof(tx && tx.user_id === s.user_id && tx.source === 'supplier_invoice' && tx.type === 'supplier_invoice' && tx.booked &&
          tx.date === event.event_date && toOre(tx.amount) === gross && tx.vat_rate != null && Number(tx.vat_rate) === (acquisition ? rate : 0) &&
          tx.is_correction === false && tx.corrects_ver_nr === null && tx.is_periodized === false &&
          tx.is_periodized_reversal === false && tx.import_batch_id === null && tx.periodization_group_id === null,
        'Leverantörsskuldens verifikation har fel källa, belopp eller metadata.')
        const rows = proof.journal.filter(j => j.transaction_id === event.transaction_id)
        requireProof(rows.length > 0 && rows.every(j => j.date === event.event_date &&
          Number.isSafeInteger(j.ver_nr) && Number(j.ver_nr) > 0 && j.ver_nr === rows[0].ver_nr),
        'Leverantörsskuldens fullständiga journalbevis kan inte verifieras.')
        const economic = s.journal.filter(j => j.transaction_id === event.transaction_id)
        requireProof(economic.length === rows.length && economic.every(j => rows.some(p => p.id === j.id &&
          p.date === j.date && p.account_number === j.account_number && p.ver_nr === j.ver_nr &&
          toOre(p.debit) === toOre(j.debit) && toOre(p.credit) === toOre(j.credit))),
        'Leverantörsskuldens journalbevis motsäger uttagsunderlaget.')
        const expected: [string, number, number][] = acquisition
          ? [[invoice.expense_account, gross - deductible, 0], ['2440', 0, gross], ...(deductible ? [['2641', deductible, 0] as [string, number, number]] : [])]
          : [['2440', gross, 0], ['1930', 0, gross]]
        const signed = reversal ? expected.map(([a, d, c]) => [a, c, d] as [string, number, number]) : expected
        requireProof(rows.length === signed.length && signed.every(([a, d, c]) => rows.filter(j =>
          j.account_number === a && toOre(j.debit) === d && toOre(j.credit) === c).length === 1),
        'Leverantörsjournalen har fel konton, riktning, belopp eller extra/saknade rader.')
      }
      const activePayments = own.filter(e => e.kind === 'payment' && !reversed.has(e.id))
      requireProof(activePayments.length <= 1 && (!cancellations.length || activePayments.length === 0),
        'Leverantörsskuldens betalnings- och rättelsekedja är motsägelsefull.')
      for (const event of own) verifiedTransactionIds.add(event.transaction_id)
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'Leverantörsskulderna behöver kontrolleras.')
    verifiedTransactionIds.clear()
  }
  if (supplierIds.some(id => !verifiedTransactionIds.has(id))) issues.push('Leverantörsverifikationen saknar en fullständigt verifierad fakturakedja.')
  return { issues: [...new Set(issues)], verifiedTransactionIds }
}
