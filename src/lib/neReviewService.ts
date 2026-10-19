// KAN-94: SELECT/read-only RPC transport only. Never call booking/review/close RPCs.
import { supabase } from './supabaseClient'
import { getNEData, getUserId } from './accountingService'
import { fetchAllRows, fetchAllRowsByChunks, type FetchAllRangeQuery } from './supabaseFetchAll'
import { buildNeReview, type NeReviewEntry, type NeReviewPeriod } from './neReview'

async function requireOwner(owner: string) {
  if (!owner || await getUserId() !== owner) throw new Error('Användaren har ändrats. Öppna underlaget igen.')
}
function checkYear(year: number) {
  if (!Number.isInteger(year) || year < 1900 || year > 9998) throw new Error('Ogiltigt räkenskapsår.')
}
type Tx = { id: string; user_id: string; date: string; description: string | null; vat_rate: number | null }
type Journal = { id: string; user_id: string; transaction_id: string; account_number: string; debit: number | null; credit: number | null; ver_nr: number | null; date: string; description?: string | null }
type Decision = { journal_entry_id: string; transaction_id: string; user_id: string; ne_row: 'R1' | 'R2'; basis: string }

export async function getNeReviewEntries(owner: string, year: number, account: string, period: NeReviewPeriod, expectedBalance: number): Promise<NeReviewEntry[]> {
  checkYear(year)
  if (!/^\d{4}$/.test(account) || !['annual', 'cumulative'].includes(period) || !Number.isFinite(expectedBalance)) throw new Error('Ogiltigt kontounderlag.')
  await requireOwner(owner)
  const end = `${year}-12-31`, start = period === 'annual' ? `${year}-01-01` : '0001-01-01'
  const transactions = await fetchAllRows<Tx>({ context: 'NE-underlagets transaktioner', createQuery: () => supabase.from('transactions')
    .select('id,user_id,date,description,vat_rate', { count: 'exact' }).eq('user_id', owner).gte('date', start).lte('date', end)
    .order('id') as unknown as FetchAllRangeQuery<Tx> })
  const txMap = new Map(transactions.map(tx => [tx.id, tx]))
  if (txMap.size !== transactions.length || transactions.some(tx => tx.user_id !== owner || tx.date < start || tx.date > end)) throw new Error('Transaktionsunderlaget kunde inte verifieras.')
  const journal = await fetchAllRowsByChunks<Journal, string>({ context: 'NE-underlagets journalrader', values: [...txMap.keys()], createQuery: ids => supabase.from('journal_entries')
    .select('id,user_id,transaction_id,account_number,debit,credit,ver_nr,date,description', { count: 'exact' }).eq('user_id', owner).eq('account_number', account).in('transaction_id', ids)
    .order('id') as unknown as FetchAllRangeQuery<Journal> })
  // Match existing read RPCs: SQL coalesce(debit/credit, 0), preserving all signs.
  if (journal.length === 0 || new Set(journal.map(j => j.id)).size !== journal.length || journal.some(j => j.user_id !== owner || j.account_number !== account || !txMap.has(j.transaction_id) || !Number.isFinite(Number(j.debit)) || !Number.isFinite(Number(j.credit)))) throw new Error('Journalunderlaget kunde inte verifieras.')
  const balance = Math.round(journal.reduce((sum, j) => sum + Number(j.debit) - Number(j.credit), 0) * 100) / 100
  if (balance !== expectedBalance) throw new Error('Bokföringsunderlaget har ändrats eller är ofullständigt. Stäng och öppna kontrollen igen.')
  const decisions = account !== '3010' ? [] : await fetchAllRowsByChunks<Decision, string>({ context: 'sparade NE-beslut', values: journal.map(j => j.id), createQuery: ids => supabase.from('ne_sales_classifications')
    .select('journal_entry_id,transaction_id,user_id,ne_row,basis', { count: 'exact' }).eq('user_id', owner).in('journal_entry_id', ids)
    .order('journal_entry_id') as unknown as FetchAllRangeQuery<Decision> })
  const byId = new Map(journal.map(j => [j.id, j]))
  if (new Set(decisions.map(d => d.journal_entry_id)).size !== decisions.length || decisions.some(d => d.user_id !== owner || byId.get(d.journal_entry_id)?.transaction_id !== d.transaction_id || !['R1', 'R2'].includes(d.ne_row) || !['small_business_exempt','taxable','reviewed_legacy','inherited_correction'].includes(d.basis))) throw new Error('Sparade NE-beslut kunde inte verifieras.')
  const decisionMap = new Map(decisions.map(d => [d.journal_entry_id, d]))
  await requireOwner(owner)
  return journal.map(j => {
    const tx = txMap.get(j.transaction_id)!, decision = decisionMap.get(j.id)
    return { id: j.id, transactionId: tx.id, date: tx.date, journalDate: j.date, description: tx.description || 'Beskrivning saknas', rowDescription: j.description ?? null, verNr: j.ver_nr,
      debit: Number(j.debit), credit: Number(j.credit), vatRate: tx.vat_rate,
      ...(decision ? { decision: { row: decision.ne_row, basis: decision.basis } } : {}) }
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.verNr ?? 0) - (a.verNr ?? 0) || a.id.localeCompare(b.id))
}

export async function getNeReviewData(owner: string, year: number) {
  checkYear(year)
  await requireOwner(owner)
  const report = await getNEData(year, true)
  if (!report.reviewSources || !report.neSalesClassification.available) throw new Error('NE-underlaget är inte tillgängligt. Ingen fullständighetsbedömning kan visas.')
  const sales = Object.hasOwn(report.reviewSources.annual, '3010')
    ? await getNeReviewEntries(owner, year, '3010', 'annual', report.reviewSources.annual['3010']) : []
  await requireOwner(owner)
  return buildNeReview(report, sales)
}
