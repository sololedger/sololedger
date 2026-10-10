export type TransactionHistoryLoadState =
  | { status: 'idle'; year: null; sequence: number; error: null }
  | { status: 'loading'; year: number; sequence: number; error: null }
  | { status: 'complete'; year: number; sequence: number; error: null }
  | { status: 'error'; year: number; sequence: number; error: string }

export type TransactionHistoryLoadMarker = {
  year: number
  sequence: number
}

export type TransactionHistoryViewState = 'loading' | 'error' | 'empty' | 'table'

export function createInitialTransactionHistoryState(): TransactionHistoryLoadState {
  return { status: 'idle', year: null, sequence: 0, error: null }
}

export function beginTransactionHistoryLoad(
  previousSequence: number,
  year: number
): { marker: TransactionHistoryLoadMarker; state: TransactionHistoryLoadState } {
  const sequence = previousSequence + 1
  return {
    marker: { year, sequence },
    state: { status: 'loading', year, sequence, error: null },
  }
}

export function completeTransactionHistoryLoad(
  marker: TransactionHistoryLoadMarker
): TransactionHistoryLoadState {
  return { status: 'complete', year: marker.year, sequence: marker.sequence, error: null }
}

export function failTransactionHistoryLoad(
  marker: TransactionHistoryLoadMarker,
  error: string
): TransactionHistoryLoadState {
  return { status: 'error', year: marker.year, sequence: marker.sequence, error }
}

export function isCurrentTransactionHistoryLoad({
  marker,
  latestYear,
  latestSequence,
}: {
  marker: TransactionHistoryLoadMarker
  latestYear: number
  latestSequence: number
}) {
  return marker.year === latestYear && marker.sequence === latestSequence
}

export function isTransactionHistoryCompleteForYear(
  state: TransactionHistoryLoadState,
  selectedYear: number
) {
  return state.status === 'complete' && state.year === selectedYear
}

export function isTransactionHistoryLoadingForYear(
  state: TransactionHistoryLoadState,
  selectedYear: number
) {
  return state.status === 'loading' && state.year === selectedYear
}

export function transactionHistoryErrorForYear(
  state: TransactionHistoryLoadState,
  selectedYear: number
) {
  return state.status === 'error' && state.year === selectedYear ? state.error : null
}

export function getVisibleTransactionHistory<TTransaction, TJournalMap>({
  state,
  selectedYear,
  transactions,
  journalMap,
  emptyJournalMap,
}: {
  state: TransactionHistoryLoadState
  selectedYear: number
  transactions: TTransaction[]
  journalMap: TJournalMap
  emptyJournalMap: TJournalMap
}) {
  if (!isTransactionHistoryCompleteForYear(state, selectedYear)) {
    return { transactions: [] as TTransaction[], journalMap: emptyJournalMap }
  }

  return { transactions, journalMap }
}

export function getTransactionHistoryViewState({
  isLoading,
  error,
  isComplete,
  transactionCount,
}: {
  isLoading: boolean
  error: string | null
  isComplete: boolean
  transactionCount: number
}): TransactionHistoryViewState {
  if (isLoading) return 'loading'
  if (error) return 'error'
  if (!isComplete) return 'loading'
  return transactionCount === 0 ? 'empty' : 'table'
}
