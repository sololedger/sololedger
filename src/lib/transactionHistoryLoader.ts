import {
  fetchAllRows,
  fetchAllRowsByChunks,
  type FetchAllRangeQuery,
} from './supabaseFetchAll.ts'

export interface TransactionHistoryRow {
  id: string
  user_id?: string | null
  date?: string | null
  [key: string]: unknown
}

export interface TransactionHistoryJournalRow {
  id: string
  user_id?: string | null
  transaction_id: string
  ver_nr?: number | null
  [key: string]: unknown
}

export type TransactionHistoryJournalMap = Record<string, TransactionHistoryJournalRow[]>

interface TransactionHistoryQueryBuilder<T> {
  select(columns: string, options?: { count?: 'exact' }): TransactionHistoryQueryBuilder<T>
  eq(column: string, value: unknown): TransactionHistoryQueryBuilder<T>
  gte(column: string, value: unknown): TransactionHistoryQueryBuilder<T>
  lte(column: string, value: unknown): TransactionHistoryQueryBuilder<T>
  in(column: string, values: readonly unknown[]): TransactionHistoryQueryBuilder<T>
  order(column: string, options?: { ascending?: boolean }): TransactionHistoryQueryBuilder<T>
}

export interface TransactionHistorySupabaseClient {
  from<T = unknown>(table: string): TransactionHistoryQueryBuilder<T> & FetchAllRangeQuery<T>
}

export interface CompleteTransactionHistoryResult {
  transactions: TransactionHistoryRow[]
  journalMap: TransactionHistoryJournalMap
}

export class TransactionHistoryLoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransactionHistoryLoadError'
  }
}

function assertTransactionRows(
  rows: TransactionHistoryRow[],
  userId: string,
  startDate: string,
  endDate: string
) {
  for (const row of rows) {
    if (!row.id) {
      throw new TransactionHistoryLoadError(
        'Transaktionshistoriken kunde inte verifieras: en transaktion saknar id.'
      )
    }
    if (row.user_id !== userId) {
      throw new TransactionHistoryLoadError(
        'Transaktionshistoriken kunde inte verifieras: en transaktion tillhör fel användare.'
      )
    }
    if (typeof row.date !== 'string' || row.date < startDate || row.date > endDate) {
      throw new TransactionHistoryLoadError(
        'Transaktionshistoriken kunde inte verifieras: en transaktion ligger utanför valt år.'
      )
    }
  }
}

function buildJournalMap(
  rows: TransactionHistoryJournalRow[],
  userId: string,
  allowedTransactionIds: Set<string>
): TransactionHistoryJournalMap {
  const journalMap: TransactionHistoryJournalMap = {}

  for (const row of rows) {
    if (!row.id) {
      throw new TransactionHistoryLoadError(
        'Journalraderna kunde inte verifieras: en rad saknar id.'
      )
    }
    if (row.user_id !== userId) {
      throw new TransactionHistoryLoadError(
        'Journalraderna kunde inte verifieras: en rad tillhör fel användare.'
      )
    }
    if (!allowedTransactionIds.has(row.transaction_id)) {
      throw new TransactionHistoryLoadError(
        'Journalraderna kunde inte verifieras: en rad hör inte till årets transaktioner.'
      )
    }

    if (!journalMap[row.transaction_id]) journalMap[row.transaction_id] = []
    journalMap[row.transaction_id].push(row)
  }

  return journalMap
}

export async function loadCompleteTransactionHistory({
  client,
  userId,
  startDate,
  endDate,
}: {
  client: TransactionHistorySupabaseClient
  userId: string
  startDate: string
  endDate: string
}): Promise<CompleteTransactionHistoryResult> {
  const transactions = await fetchAllRows<TransactionHistoryRow>({
    context: 'transaction history transactions',
    createQuery: () =>
      client
        .from<TransactionHistoryRow>('transactions')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })
        .order('id', { ascending: false }) as TransactionHistoryQueryBuilder<TransactionHistoryRow> &
        FetchAllRangeQuery<TransactionHistoryRow>,
  })

  assertTransactionRows(transactions, userId, startDate, endDate)

  const transactionIds = transactions.map(transaction => transaction.id)
  const allowedTransactionIds = new Set(transactionIds)

  const journalRows =
    transactionIds.length === 0
      ? []
      : await fetchAllRowsByChunks<TransactionHistoryJournalRow, string>({
        context: 'transaction history journal rows',
        values: transactionIds,
        createQuery: ids =>
          client
            .from<TransactionHistoryJournalRow>('journal_entries')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .in('transaction_id', ids)
            .order('transaction_id', { ascending: true })
            .order('ver_nr', { ascending: true })
            .order('id', { ascending: true }) as TransactionHistoryQueryBuilder<TransactionHistoryJournalRow> &
            FetchAllRangeQuery<TransactionHistoryJournalRow>,
      })

  return {
    transactions,
    journalMap: buildJournalMap(journalRows, userId, allowedTransactionIds),
  }
}

export function transactionHistoryErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Transaktionshistoriken kunde inte laddas komplett.'
}
