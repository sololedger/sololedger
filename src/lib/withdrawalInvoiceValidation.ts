import { toOre, validWithdrawalDate } from './withdrawalModel.ts'
import type { WithdrawalSnapshot, WithdrawalJournal } from './withdrawalAssessment.ts'

type Money = number | string
export interface WithdrawalInvoice {
  id: string; user_id: string; invoice_date: string; service_date: string
  customer_country: string; currency: string; payment_status: string
  gross_amount: Money; net_amount: Money | null; vat_amount: Money | null; vat_rate: number | string | null
  vat_treatment: string; vat_policy_snapshot_status: string; vat_policy_vat_status: string | null
  vat_policy_domestic_sales_vat_treatment: string | null; vat_policy_captured_at: string | null; vat_policy_source: string
}
export interface WithdrawalInvoiceBooking {
  id: string; user_id: string; invoice_id: string; transaction_id: string; booking_kind: string
  booking_date: string; fiscal_year: number; gross_amount: Money; net_amount: Money; vat_amount: Money
  reverses_booking_id: string | null
}
const paymentKinds = ['payment_same_year', 'receivable_settlement', 'historical_payment_same_year']
const reversalKinds = ['payment_same_year_reversal', 'receivable_settlement_reversal']
function requireProof(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message) }
const year = (date: string) => Number(date.slice(0, 4))

// Evidence gate only: never creates journal rows or contributes money to a report.
// Every economic contribution still comes from the original dated journal.
export function validateWithdrawalInvoices(s: WithdrawalSnapshot) {
  const issues: string[] = []
  const verifiedTransactionIds = new Set<string>()
  if ([...s.invoices, ...s.invoice_bookings, ...s.transactions, ...s.journal, ...s.invoice_journal].some(row => row.user_id !== s.user_id)) {
    return { issues: ['Fakturaunderlaget tillhör en annan användare.'], verifiedTransactionIds }
  }
  const txs = new Map(s.transactions.map(t => [t.id, t]))
  const invoices = new Map(s.invoices.map(i => [i.id, i]))
  const bookingById = new Map(s.invoice_bookings.map(b => [b.id, b]))
  const rowsByTx = new Map<string, WithdrawalJournal[]>()
  for (const row of s.invoice_journal) {
    const rows = rowsByTx.get(row.transaction_id) ?? []
    rows.push(row); rowsByTx.set(row.transaction_id, rows)
  }
  const seenTx = new Set<string>()
  for (const b of s.invoice_bookings) {
    if (!invoices.has(b.invoice_id) || !txs.has(b.transaction_id) || seenTx.has(b.transaction_id)) issues.push('Fakturakopplingen saknas, är dubblerad eller har ofullständigt bokföringsunderlag.')
    seenTx.add(b.transaction_id)
  }
  for (const invoice of s.invoices) {
    try {
      requireProof(['id', 'user_id', 'invoice_date', 'service_date', 'customer_country', 'currency', 'payment_status', 'gross_amount', 'net_amount', 'vat_amount', 'vat_rate', 'vat_treatment', 'vat_policy_snapshot_status', 'vat_policy_vat_status', 'vat_policy_domestic_sales_vat_treatment', 'vat_policy_captured_at', 'vat_policy_source'].every(key => Object.hasOwn(invoice, key)), 'Fakturan saknar nödvändiga historiska bevisuppgifter.')
      requireProof(invoice.customer_country === 'SE' && invoice.currency === 'SEK', 'Fakturans land eller valuta stöds inte i uttagsunderlaget.')
      requireProof(validWithdrawalDate(invoice.invoice_date) && validWithdrawalDate(invoice.service_date), 'Fakturans datum behöver kontrolleras.')
      const bookings = s.invoice_bookings.filter(b => b.invoice_id === invoice.id)
      requireProof(['unpaid', 'paid'].includes(invoice.payment_status), 'Makulerad eller okänd fakturahistorik behöver kontrolleras.')
      const targetYear = Math.max(year(invoice.invoice_date), year(invoice.service_date))
      const yearEnd = `${targetYear}-12-31`
      const receivables = bookings.filter(b => b.booking_kind === 'year_end_receivable')
      requireProof(receivables.length <= 1, 'Fakturan har flera bokslutsfordringar.')
      const reversals = bookings.filter(b => reversalKinds.includes(b.booking_kind))
      const reversed = new Map<string, WithdrawalInvoiceBooking>()
      for (const r of reversals) {
        const original = r.reverses_booking_id && bookingById.get(r.reverses_booking_id)
        requireProof(original && original.invoice_id === invoice.id && original.user_id === s.user_id && !reversed.has(original.id), 'Ångerbokningen saknar en entydig ursprungsbetalning.')
        const expected = r.booking_kind === 'payment_same_year_reversal' ? 'payment_same_year' : 'receivable_settlement'
        requireProof(original.booking_kind === expected && r.booking_date >= original.booking_date, 'Ångerbokningens typ eller datum motsäger betalningen.')
        reversed.set(original.id, r)
      }
      const payments = bookings.filter(b => paymentKinds.includes(b.booking_kind))
      // Non-empty intervals are half-open. A zero-day undo/rebook can be at
      // a boundary, but cannot hide strictly inside another active payment.
      for (let i = 0; i < payments.length; i++) for (let j = i + 1; j < payments.length; j++) {
        const a = payments[i], b = payments[j]
        const aEnd = reversed.get(a.id)?.booking_date ?? '9999-12-31'
        const bEnd = reversed.get(b.id)?.booking_date ?? '9999-12-31'
        const separate = a.booking_date === aEnd
          ? a.booking_date <= b.booking_date || bEnd <= a.booking_date
          : b.booking_date === bEnd
            ? b.booking_date <= a.booking_date || aEnd <= b.booking_date
            : aEnd <= b.booking_date || bEnd <= a.booking_date
        requireProof(separate, 'Fakturans betalningskedja överlappar och behöver kontrolleras.')
      }
      const paidAtYearEnd = payments.some(b => b.booking_date <= yearEnd && (reversed.get(b.id)?.booking_date ?? '9999-12-31') > yearEnd)
      if (invoice.invoice_date <= s.as_of && yearEnd <= s.as_of) requireProof(receivables.length === 1 || paidAtYearEnd, 'En obetald faktura saknar verifierad bokslutsfordran.')
      if (!bookings.length) {
        // Today's paid flag is not historical evidence. If the snapshot has
        // no causal booking, keep review (also conservative before a later payment).
        requireProof(invoice.payment_status === 'unpaid', 'Fakturan är markerad betald men saknar verifierbar betalningshistorik för datumet.')
        continue // Unpaid current-year document has no accounting effect.
      }

      const gross = toOre(invoice.gross_amount), net = toOre(invoice.net_amount), vat = toOre(invoice.vat_amount)
      requireProof(gross > 0 && net > 0 && vat >= 0 && gross === net + vat, 'Fakturans sparade belopp är ofullständiga eller motsägelsefulla.')
      const rate = Number(invoice.vat_rate)
      const outputAccount = ({ 6: '2631', 12: '2621', 25: '2611' } as Record<number, string>)[rate]
      if (invoice.vat_treatment === 'exempt') requireProof(invoice.vat_rate !== null && rate === 0 && vat === 0 && net === gross, 'Den momsfria fakturans sparade momsfakta motsäger journalen.')
      else {
        requireProof(invoice.vat_treatment === 'taxable' && outputAccount && vat > 0, 'Fakturans momsstatus eller momssats saknar säkert underlag.')
        requireProof(invoice.vat_policy_snapshot_status === 'captured' && invoice.vat_policy_vat_status === 'registered' && invoice.vat_policy_domestic_sales_vat_treatment === 'taxable' && invoice.vat_policy_captured_at && Number.isFinite(Date.parse(invoice.vat_policy_captured_at)) && ['create', 'vat_edit'].includes(invoice.vat_policy_source), 'Äldre faktura saknar verifierbart sparat momsbeslut och behöver kontrolleras.')
      }
      for (const b of bookings) {
        const t = txs.get(b.transaction_id)
        const rows = rowsByTx.get(b.transaction_id) ?? []
        const historical = b.booking_kind === 'historical_payment_same_year'
        const reversal = reversalKinds.includes(b.booking_kind)
        const settlement = b.booking_kind.startsWith('receivable_settlement')
        requireProof(paymentKinds.includes(b.booking_kind) || reversal || b.booking_kind === 'year_end_receivable', 'Okänd fakturahändelse behöver kontrolleras.')
        requireProof(validWithdrawalDate(b.booking_date) && b.booking_date <= s.as_of && b.fiscal_year === year(b.booking_date), 'Fakturabokningens datum eller år är motsägelsefullt.')
        requireProof(t && t.booked && t.date === b.booking_date && t.source === (historical ? 'manual' : 'customer_invoice'), 'Fakturabokningen saknar rätt bokförd verifikation.')
        requireProof(rows.every(j => j.date === b.booking_date), 'Fakturans fullständiga journal har rader med avvikande datum, även utanför värderingsdatumet.')
        const economicRows = s.journal.filter(j => j.transaction_id === b.transaction_id)
        const visibleProof = rows.filter(j => j.date <= s.as_of)
        requireProof(economicRows.length === visibleProof.length && economicRows.every(j => visibleProof.some(p => p.id === j.id && p.date === j.date && p.account_number === j.account_number && p.ver_nr === j.ver_nr && toOre(p.debit) === toOre(j.debit) && toOre(p.credit) === toOre(j.credit))), 'Fakturans journalbevis stämmer inte med det datumavgränsade ekonomiunderlaget.')
        requireProof(toOre(b.gross_amount) === gross && toOre(b.net_amount) === net && toOre(b.vat_amount) === vat && toOre(t.amount) === gross && t.vat_rate != null && Number(t.vat_rate) === rate, 'Faktura, koppling och verifikation har olika belopp eller moms.')
        requireProof(t.type === (historical ? 'försäljning' : 'customer_invoice') && t.is_correction === reversal && t.is_periodized === false && t.is_periodized_reversal === false && t.import_batch_id === null && t.periodization_group_id === null, 'Fakturans verifikation har avvikande ursprung eller rättelsemarkering.')
        requireProof(rows.length > 0 && rows.every(j => Number.isSafeInteger(j.ver_nr) && Number(j.ver_nr) > 0 && j.ver_nr === rows[0].ver_nr), 'Fakturans verifikationsnummer är ofullständigt eller motsägelsefullt.')
        requireProof(reversal || (b.reverses_booking_id === null && t.corrects_ver_nr === null), 'Fakturabokningen har en oväntad rättelselänk.')
        if (historical) {
          requireProof(invoice.vat_treatment === 'exempt', 'Historisk manuell fakturakoppling stöds bara för verifierad momsfri försäljning.')
          requireProof(!s.transactions.some(other => other.is_correction && other.corrects_ver_nr === rows[0].ver_nr), 'Den historiska manuella fakturaverifikationen har en senare rättelse och behöver kontrolleras.')
        }
        if (b.booking_kind === 'payment_same_year' || historical) requireProof(year(b.booking_date) === year(invoice.invoice_date) && !receivables.some(r => r.booking_date <= b.booking_date), 'Betalningen motsäger fakturaåret eller en befintlig bokslutsfordran.')
        if (b.booking_kind === 'year_end_receivable') requireProof(b.booking_date === yearEnd && !paidAtYearEnd, 'Bokslutsfordran motsäger fakturans år eller betalningskedja.')
        if (settlement) requireProof(receivables.length === 1 && receivables[0].booking_date < b.booking_date, 'Regleringen saknar föregående bokslutsfordran.')

        const counter = b.booking_kind === 'year_end_receivable' ? '1510' : '1930'
        const expected: [string, number, number][] = settlement ? [['1930', gross, 0], ['1510', 0, gross]] : [[counter, gross, 0], ['3010', 0, net], ...(vat ? [[outputAccount, 0, vat] as [string, number, number]] : [])]
        const expectedRows = reversal ? expected.map(([a, d, c]) => [a, c, d] as [string, number, number]) : expected
        requireProof(rows.length === expectedRows.length && expectedRows.every(([a, d, c]) => rows.filter(j => j.account_number === a && toOre(j.debit) === d && toOre(j.credit) === c).length === 1), 'Fakturajournalen har fel konton, riktning, belopp eller extra/saknade rader.')
        if (reversal) {
          const original = bookingById.get(b.reverses_booking_id!)!
          const originalRows = rowsByTx.get(original.transaction_id) ?? []
          requireProof(originalRows.length === rows.length && t.corrects_ver_nr === originalRows[0]?.ver_nr && originalRows.every(j => rows.some(r => r.account_number === j.account_number && toOre(r.debit) === toOre(j.credit) && toOre(r.credit) === toOre(j.debit))), 'Ångerjournalen är inte exakt omvänd mot ursprungsbetalningen.')
        }
      }
      for (const b of bookings) if (txs.get(b.transaction_id)?.source === 'customer_invoice') verifiedTransactionIds.add(b.transaction_id)
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'Fakturaunderlaget behöver kontrolleras.')
    }
  }
  for (const t of s.transactions) if (t.source === 'customer_invoice' && !verifiedTransactionIds.has(t.id)) issues.push('Fakturaverifikationen saknar en fullständigt verifierad fakturakedja.')
  return { issues: [...new Set(issues)], verifiedTransactionIds }
}
