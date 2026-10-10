import {
  beginTransactionHistoryLoad,
  completeTransactionHistoryLoad,
  createInitialTransactionHistoryState,
  failTransactionHistoryLoad,
  getTransactionHistoryViewState,
  getVisibleTransactionHistory,
  isCurrentTransactionHistoryLoad,
  isTransactionHistoryCompleteForYear,
  isTransactionHistoryLoadingForYear,
  transactionHistoryErrorForYear,
} from '../src/lib/transactionHistoryState.ts'

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`)
  }
}

console.log('\n=== SoloLedger Transaction History State Tests ===\n')

const oldTransactions = [{ id: 'tx-2026' }]
const oldJournalMap: Record<string, { id: string }[]> = { 'tx-2026': [{ id: 'je-2026' }] }

const initialState = createInitialTransactionHistoryState()
assertEqual(
  getTransactionHistoryViewState({
    isLoading: isTransactionHistoryLoadingForYear(initialState, 2026),
    error: transactionHistoryErrorForYear(initialState, 2026),
    isComplete: isTransactionHistoryCompleteForYear(initialState, 2026),
    transactionCount: oldTransactions.length,
  }),
  'loading',
  'idle history is treated as loading, not table or empty'
)

const firstLoad = beginTransactionHistoryLoad(initialState.sequence, 2026)
const firstComplete = completeTransactionHistoryLoad(firstLoad.marker)
assertDeepEqual(
  getVisibleTransactionHistory({
    state: firstComplete,
    selectedYear: 2026,
    transactions: oldTransactions,
    journalMap: oldJournalMap,
    emptyJournalMap: {},
  }),
  { transactions: oldTransactions, journalMap: oldJournalMap },
  'complete selected year exposes transactions and journal rows'
)
assertEqual(
  getTransactionHistoryViewState({
    isLoading: false,
    error: null,
    isComplete: true,
    transactionCount: oldTransactions.length,
  }),
  'table',
  'complete non-empty selected year renders table'
)

const secondLoad = beginTransactionHistoryLoad(firstLoad.marker.sequence, 2027)
assertDeepEqual(
  getVisibleTransactionHistory({
    state: secondLoad.state,
    selectedYear: 2027,
    transactions: oldTransactions,
    journalMap: oldJournalMap,
    emptyJournalMap: {},
  }),
  { transactions: [], journalMap: {} },
  'year switch hides old transactions and journal rows while new year loads'
)
assertEqual(
  getTransactionHistoryViewState({
    isLoading: isTransactionHistoryLoadingForYear(secondLoad.state, 2027),
    error: transactionHistoryErrorForYear(secondLoad.state, 2027),
    isComplete: isTransactionHistoryCompleteForYear(secondLoad.state, 2027),
    transactionCount: 0,
  }),
  'loading',
  'empty year still shows loading until complete history is verified'
)

const emptyComplete = completeTransactionHistoryLoad(secondLoad.marker)
assertEqual(
  getTransactionHistoryViewState({
    isLoading: false,
    error: null,
    isComplete: isTransactionHistoryCompleteForYear(emptyComplete, 2027),
    transactionCount: 0,
  }),
  'empty',
  'empty state is shown only after selected year is complete'
)

const refreshLoad = beginTransactionHistoryLoad(secondLoad.marker.sequence, 2027)
assertEqual(
  isCurrentTransactionHistoryLoad({
    marker: secondLoad.marker,
    latestYear: 2027,
    latestSequence: refreshLoad.marker.sequence,
  }),
  false,
  'older same-year refresh cannot write after a newer refresh starts'
)
assertEqual(
  isCurrentTransactionHistoryLoad({
    marker: refreshLoad.marker,
    latestYear: 2027,
    latestSequence: refreshLoad.marker.sequence,
  }),
  true,
  'latest same-year refresh is current'
)
assertEqual(
  getTransactionHistoryViewState({
    isLoading: isTransactionHistoryLoadingForYear(refreshLoad.state, 2027),
    error: transactionHistoryErrorForYear(refreshLoad.state, 2027),
    isComplete: isTransactionHistoryCompleteForYear(refreshLoad.state, 2027),
    transactionCount: oldTransactions.length,
  }),
  'loading',
  'same-year refresh hides table until refreshed history is complete'
)

assertEqual(
  isCurrentTransactionHistoryLoad({
    marker: firstLoad.marker,
    latestYear: 2027,
    latestSequence: refreshLoad.marker.sequence,
  }),
  false,
  'older year cannot write after selected year changes'
)

const failedLoad = failTransactionHistoryLoad(refreshLoad.marker, 'journal rows saknar exact count')
assertDeepEqual(
  getVisibleTransactionHistory({
    state: failedLoad,
    selectedYear: 2027,
    transactions: oldTransactions,
    journalMap: oldJournalMap,
    emptyJournalMap: {},
  }),
  { transactions: [], journalMap: {} },
  'history load error hides stale transactions and journal rows'
)
assertEqual(
  getTransactionHistoryViewState({
    isLoading: isTransactionHistoryLoadingForYear(failedLoad, 2027),
    error: transactionHistoryErrorForYear(failedLoad, 2027),
    isComplete: isTransactionHistoryCompleteForYear(failedLoad, 2027),
    transactionCount: oldTransactions.length,
  }),
  'error',
  'history load error renders error state, not table'
)

console.log('PASS transaction history state tests')
