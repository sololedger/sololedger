import { supabase } from './supabaseClient'
import { verifyProfileWrite } from './profileWriteGuard'
import { requireProfileContext } from './profileContext'
import { fetchAllRows, fetchAllRowsByChunks, type FetchAllRangeQuery } from './supabaseFetchAll'
import type { WithdrawalSnapshot, WithdrawalJournal } from './withdrawalAssessment'
import type { WithdrawalSupplierInvoice, WithdrawalSupplierEvent, WithdrawalSupplierProof } from './withdrawalSupplierValidation'

// Read-only supplemental evidence. The caller brackets this read with two identical
// server snapshots. Every in-scope event also has an atomic journal/transaction in that signature.
export async function loadWithdrawalSupplierProof(s: WithdrawalSnapshot): Promise<WithdrawalSupplierProof> {
  const ticket = requireProfileContext()
  if (ticket.userId !== s.user_id) throw new Error('Leverantörsunderlaget tillhör en annan användare.')
  const token = await verifyProfileWrite(ticket)
  const select = (table: string) => {
    requireProfileContext(ticket)
    return supabase.from(table).select('*', { count: 'exact' }).eq('user_id', s.user_id)
      .setHeader('Authorization', `Bearer ${token}`)
  }
  const lastYearEnd = Number(s.as_of.slice(0, 4)) - (s.as_of.slice(5) < '12-31' ? 1 : 0)
  const invoices = await fetchAllRows<WithdrawalSupplierInvoice>({ context: 'uttagets leverantörsfakturor', createQuery: () =>
    select('supplier_year_end_invoices').lte('fiscal_year', lastYearEnd).order('id') as FetchAllRangeQuery<WithdrawalSupplierInvoice> })
  const events = await fetchAllRowsByChunks<WithdrawalSupplierEvent, string>({ context: 'uttagets leverantörshändelser',
    values: invoices.map(i => i.id), chunkSize: 200, createQuery: ids => select('supplier_year_end_events')
      .in('invoice_id', ids).lte('event_date', s.as_of).order('id') as FetchAllRangeQuery<WithdrawalSupplierEvent> })
  // No journal date filter: even one extra future/misdated row must invalidate the proof.
  const journal = await fetchAllRowsByChunks<WithdrawalJournal, string>({ context: 'uttagets fullständiga leverantörsjournal',
    values: events.map(e => e.transaction_id), chunkSize: 200, createQuery: ids => select('journal_entries')
      .in('transaction_id', ids).order('id') as FetchAllRangeQuery<WithdrawalJournal> })
  requireProfileContext(ticket)
  return { owner: s.user_id, asOf: s.as_of, sourceSignature: s.signature, invoices, events, journal }
}
