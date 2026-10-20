import type { TransactionHistoryFilterState } from './transactionHistoryFilters.ts'

export interface AttachmentGroupItem {
  tx: {
    user_id?: string | null
    file_url?: string | null
    date?: string | null
    source?: string | null
    import_batch_id?: string | null
  }
}

export type AttachmentDisplayItem<T> =
  | { kind: 'transaction'; item: T }
  | { kind: 'attachmentGroup'; key: string; fileUrl: string; startDate: string; endDate: string; items: T[] }

// Only the new attachment view is paused. Existing SIE undo handling is independent.
export function attachmentGroupingPauseReason(filters: TransactionHistoryFilterState) {
  if (filters.search.trim() || filters.category !== 'all') {
    return 'Gruppering pausad under sökning och filtrering så att varje träff visas.'
  }
  if (filters.sort !== 'date_desc' && filters.sort !== 'date_asc') {
    return 'Gruppering pausad vid sortering på belopp eller verifikationsnummer.'
  }
  return null
}

function groupKey(item: AttachmentGroupItem) {
  const { user_id: owner, file_url: path, source, import_batch_id: batch } = item.tx
  // SIE undo groups retain precedence. Missing ownership must never imply a shared owner.
  if (source === 'sie_import_undo' && batch) return null
  if (typeof owner !== 'string' || !owner.trim()) return null
  if (typeof path !== 'string' || !path.trim()) return null
  // No trimming, case folding, URL decoding, filename extraction or description matching.
  return JSON.stringify([owner, 'attachments', path])
}

// Input is already filtered and sorted. Emit each group at its first sorted member;
// keep the existing member order and original objects. No accounting totals are made.
export function groupTransactionsByAttachment<T extends AttachmentGroupItem>(
  items: T[],
  enabled: boolean,
): AttachmentDisplayItem<T>[] {
  const groups = new Map<string, T[]>()
  if (enabled) {
    for (const item of items) {
      const key = groupKey(item)
      if (key !== null) {
        const members = groups.get(key) ?? []
        members.push(item)
        groups.set(key, members)
      }
    }
  }

  const emitted = new Set<string>()
  const result: AttachmentDisplayItem<T>[] = []
  for (const item of items) {
    const key = enabled ? groupKey(item) : null
    const members = key !== null ? groups.get(key) : undefined
    if (key !== null && members && members.length >= 2) {
      if (emitted.has(key)) continue
      emitted.add(key)
      const dates = members.map(member => member.tx.date ?? '').filter(Boolean).sort()
      result.push({
        kind: 'attachmentGroup', key, fileUrl: item.tx.file_url!,
        startDate: dates[0] ?? '', endDate: dates[dates.length - 1] ?? '', items: members,
      })
    } else {
      result.push({ kind: 'transaction', item })
    }
  }
  return result
}
