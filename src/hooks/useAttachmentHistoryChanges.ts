'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllRowsByChunks } from '@/lib/supabaseFetchAll'

interface Target { id: string; user_id?: string; file_url?: string | null }
interface Change { user_id: string; transaction_id: string; action: string }
const changedEvent = 'sololedger:attachment-history-changed'

export function notifyAttachmentHistoryChanged(owner: string, id: string) {
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: { owner, id } }))
}

// One paged query per owner/chunk, shared by the desktop and mobile lists.
export function useAttachmentHistoryChanges(transactions: Target[]) {
  const key = JSON.stringify(transactions.filter(tx => tx.user_id && tx.id)
    .map(tx => [tx.user_id, tx.id, tx.file_url ?? null]).sort())
  const [result, setResult] = useState<{ key: string; changed: Set<string> } | null>(null)

  useEffect(() => {
    let active = true
    let request = 0
    const targets = JSON.parse(key) as [string, string, string | null][]
    const owners = new Map<string, string[]>()
    for (const [owner, id] of targets) {
      const ids = owners.get(owner) ?? []
      ids.push(id); owners.set(owner, ids)
    }
    async function load() {
      const currentRequest = ++request
      const groups = await Promise.all([...owners].map(async ([owner, ids]) => {
        const rows = await fetchAllRowsByChunks<Change, string>({
          context: 'bilageändringar', values: ids, chunkSize: 100,
          createQuery: chunk => supabase.from('accounting_attachment_history')
            .select('user_id,transaction_id,action', { count: 'exact' })
            .eq('user_id', owner).in('transaction_id', chunk)
            .in('action', ['replacement', 'addition']).order('id'),
        })
        return rows.filter(row => row.user_id === owner && ids.includes(row.transaction_id)
          && (row.action === 'replacement' || row.action === 'addition'))
          .map(row => `${owner}:${row.transaction_id}`)
      }))
      if (active && currentRequest === request) setResult({ key, changed: new Set(groups.flat()) })
    }
    // A failed summary never invents a history link. Full history remains available.
    function refresh() {
      const nextRequest = request + 1
      void load().catch(() => { if (active && nextRequest === request) setResult({ key, changed: new Set() }) })
    }
    function changed(event: Event) {
      const detail = (event as CustomEvent<{ owner: string; id: string }>).detail
      if (detail && targets.some(([owner, id]) => owner === detail.owner && id === detail.id)) refresh()
    }
    window.addEventListener(changedEvent, changed)
    refresh()
    return () => { active = false; window.removeEventListener(changedEvent, changed) }
  }, [key])

  return (owner: string, id: string) => result?.key === key && result.changed.has(`${owner}:${id}`)
}
