'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRowsByChunks } from '@/lib/supabaseFetchAll'

interface Target { id: string; user_id?: string; is_correction?: boolean }
interface Journal { user_id?: string; ver_nr?: number; transaction_id?: string }
interface Correction { id: string; user_id: string; date: string; is_correction: boolean; corrects_ver_nr: number }
interface Link { id: string; verNr: number; date: string }
export type CorrectionHistoryState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; links: Link[] }

// Display-only sidecar. Never merge these rows into yearly transactions/journals,
// or use this state to decide accounting amounts, strike-throughs or actions.
export function useTransactionCorrectionHistory(transactions: Target[], journalMap: Record<string, Journal[]>) {
  const key = JSON.stringify(transactions.filter(tx => !tx.is_correction && tx.user_id)
    .map(tx => [tx.id, tx.user_id, journalMap[tx.id]?.[0]?.ver_nr ?? null]).sort())
  // A refreshed year snapshot (even with unchanged IDs) must refresh the sidecar.
  // Scope identity also masks stale data during owner/year A -> B -> A changes.
  const scope = useMemo(() => ({ key, snapshot: transactions }), [key, transactions])
  const [result, setResult] = useState<{ scope: typeof scope; states: Map<string, CorrectionHistoryState> } | null>(null)
  useEffect(() => {
    let active = true
    const targets = JSON.parse(scope.key) as [string, string, number | null][]
    const owners = [...new Set(targets.map(([, owner]) => owner))]
    async function load() {
      const groups = await Promise.all(owners.map(async owner => {
        const owned = targets.filter(([, id]) => id === owner)
        try {
          const vers = owned.map(([, , ver]) => ver).filter((ver): ver is number => typeof ver === 'number' && Number.isInteger(ver) && ver > 0)
          const corrections = await fetchAllRowsByChunks<Correction, number>({
            context: 'rättelsekopplingar', values: vers, chunkSize: 100,
            createQuery: chunk => supabase.from('transactions')
              .select('id,user_id,date,is_correction,corrects_ver_nr', { count: 'exact' })
              .eq('user_id', owner).eq('is_correction', true).in('corrects_ver_nr', chunk).order('id'),
          })
          if (corrections.some(row => row.user_id !== owner || row.is_correction !== true || !vers.includes(row.corrects_ver_nr)
            || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !row.id)) throw Error('Invalid correction identity')
          const ids = corrections.map(row => row.id)
          const journal = await fetchAllRowsByChunks<Journal, string>({
            context: 'rättelsernas verifikationsnummer', values: ids, chunkSize: 100,
            createQuery: chunk => supabase.from('journal_entries')
              .select('id,user_id,transaction_id,ver_nr', { count: 'exact' })
              .eq('user_id', owner).in('transaction_id', chunk).order('id'),
          })
          if (journal.some(row => row.user_id !== owner || !ids.includes(row.transaction_id ?? ''))) throw Error('Invalid journal identity')
          const links = corrections.map(row => {
            const numbers = new Set(journal.filter(j => j.transaction_id === row.id).map(j => j.ver_nr))
            const verNr = [...numbers][0]
            if (numbers.size !== 1 || !Number.isInteger(verNr) || verNr! <= 0) throw Error('Unverified correction number')
            return { originalVer: row.corrects_ver_nr, id: row.id, verNr: verNr!, date: row.date }
          }).sort((a, b) => a.date.localeCompare(b.date) || a.verNr - b.verNr)
          return owned.map(([id, , ver]) => [id, typeof ver !== 'number' || !Number.isInteger(ver) || ver <= 0 ? { status: 'error' } : {
            status: 'ready', links: links.filter(link => link.originalVer === ver),
          }] as [string, CorrectionHistoryState])
        } catch {
          return owned.map(([id]) => [id, { status: 'error' }] as [string, CorrectionHistoryState])
        }
      }))
      if (active) setResult({ scope, states: new Map(groups.flat()) })
    }
    void load()
    return () => { active = false }
  }, [scope])
  return (id: string): CorrectionHistoryState => result?.scope === scope
    ? result.states.get(id) ?? { status: 'error' } : { status: 'loading' }
}

export default function TransactionCorrectionHistory({ state, labelled = false }: { state?: CorrectionHistoryState; labelled?: boolean }) {
  if (!state) return null
  if (state.status === 'loading') return <p className="mt-1 text-xs text-gray-600" role="status">Kontrollerar rättelsehistorik…</p>
  if (state.status === 'error') return <p className="mt-1 text-xs text-amber-800" role="alert">Rättelsehistoriken kunde inte verifieras. Ladda om vyn för att försöka igen.</p>
  if (!state.links.length) return null
  return <div className="mt-1 text-xs text-gray-700" data-testid="correction-history">
    {!labelled && <p className="font-bold">Rättat original</p>}
    {state.links.map(link => <p key={link.id}>Rättad genom VER-{link.verNr}, {link.date}</p>)}
  </div>
}
