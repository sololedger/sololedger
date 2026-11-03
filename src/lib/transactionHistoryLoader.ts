import {
  fetchAllRows,
  fetchAllRowsByChunks,
  type FetchAllRangeQuery,
} from './supabaseFetchAll.ts'

export interface TransactionHistoryRow {
  id: string
  user_id?: string | null
  date?: string | null
  // Read-only presentation evidence, rebuilt on every complete history load.
  historical_customer_invoice_link?: boolean
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

export interface TransactionHistoryFixedAssetReclassificationLink {
  assetId: string
  assetName: string
  amount: number
  eventDate: string
  originalTransactionId: string
  reclassificationTransactionId: string
  originalVerNr: number | null
  reclassificationVerNr: number | null
}

export interface TransactionHistoryFixedAssetTrace {
  reclassifiedBy: TransactionHistoryFixedAssetReclassificationLink[]
  reclassifies: TransactionHistoryFixedAssetReclassificationLink[]
}

interface TransactionHistoryFixedAssetRow {
  id: string
  user_id?: string | null
  acquisition_transaction_id: string
  name?: string | null
}

interface HistoricalCustomerInvoiceBookingRow {
  id: string
  user_id: string
  transaction_id: string
  invoice_id: string
  booking_kind: string
  booking_date: string
  fiscal_year: number
  reverses_booking_id: string | null
}

interface HistoricalCustomerInvoiceRow {
  id: string
  user_id: string
}

interface TransactionHistoryFixedAssetEventRow {
  id: string
  user_id?: string | null
  asset_id: string
  transaction_id: string
  event_type: string
  event_date: string
  amount?: number | string | null
}

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

function firstVerNr(journalMap: TransactionHistoryJournalMap, transactionId: string) {
  const verNr = journalMap[transactionId]?.[0]?.ver_nr
  return typeof verNr === 'number' ? verNr : null
}

function emptyFixedAssetTrace(): TransactionHistoryFixedAssetTrace {
  return {
    reclassifiedBy: [],
    reclassifies: [],
  }
}

function fixedAssetTraceFor(
  transaction: TransactionHistoryRow
): TransactionHistoryFixedAssetTrace {
  const existing = transaction.fixed_asset_trace
  if (
    existing &&
    typeof existing === 'object' &&
    'reclassifiedBy' in existing &&
    'reclassifies' in existing
  ) {
    return existing as TransactionHistoryFixedAssetTrace
  }

  const trace = emptyFixedAssetTrace()
  transaction.fixed_asset_trace = trace
  return trace
}

async function attachFixedAssetReclassificationTrace({
  client,
  userId,
  transactions,
  journalMap,
}: {
  client: TransactionHistorySupabaseClient
  userId: string
  transactions: TransactionHistoryRow[]
  journalMap: TransactionHistoryJournalMap
}) {
  const transactionIds = transactions.map(transaction => transaction.id)
  if (transactionIds.length === 0) return

  const transactionById = new Map(transactions.map(transaction => [transaction.id, transaction]))
  const events = await fetchAllRowsByChunks<TransactionHistoryFixedAssetEventRow, string>({
    context: 'transaction history fixed asset reclassification events',
    values: transactionIds,
    createQuery: ids =>
      client
        .from<TransactionHistoryFixedAssetEventRow>('fixed_asset_events')
        .select('id, user_id, asset_id, transaction_id, event_type, event_date, amount', { count: 'exact' })
        .eq('user_id', userId)
        .eq('event_type', 'reclassification')
        .in('transaction_id', ids)
        .order('event_date', { ascending: true })
        .order('id', { ascending: true }) as TransactionHistoryQueryBuilder<TransactionHistoryFixedAssetEventRow> &
        FetchAllRangeQuery<TransactionHistoryFixedAssetEventRow>,
  })

  const relevantEvents = events.filter(event => transactionById.has(event.transaction_id))
  if (relevantEvents.length === 0) return

  for (const event of relevantEvents) {
    if (event.user_id !== userId) {
      throw new TransactionHistoryLoadError(
        'Inventariehändelserna kunde inte verifieras: en rad tillhör fel användare.'
      )
    }
    const amount = Number(event.amount)
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) / 100 !== amount ||
      event.event_type !== 'reclassification' || new Set(relevantEvents.map(row => row.id)).size !== relevantEvents.length) {
      throw new TransactionHistoryLoadError('Inventariehändelsernas belopp eller identitet kunde inte verifieras.')
    }
  }

  const assetIds = Array.from(new Set(relevantEvents.map(event => event.asset_id)))
  const assets = await fetchAllRowsByChunks<TransactionHistoryFixedAssetRow, string>({
    context: 'transaction history fixed asset reclassified assets',
    values: assetIds,
    createQuery: ids =>
      client
        .from<TransactionHistoryFixedAssetRow>('fixed_assets')
        .select('id, user_id, acquisition_transaction_id, name', { count: 'exact' })
        .eq('user_id', userId)
        .in('id', ids)
        .order('id', { ascending: true }) as TransactionHistoryQueryBuilder<TransactionHistoryFixedAssetRow> &
        FetchAllRangeQuery<TransactionHistoryFixedAssetRow>,
  })

  const assetById = new Map<string, TransactionHistoryFixedAssetRow>()
  for (const asset of assets) {
    if (asset.user_id !== userId) {
      throw new TransactionHistoryLoadError(
        'Inventariekopplingarna kunde inte verifieras: en rad tillhör fel användare.'
      )
    }
    assetById.set(asset.id, asset)
  }

  for (const event of relevantEvents) {
    const asset = assetById.get(event.asset_id)
    if (!asset || !transactionById.has(asset.acquisition_transaction_id)) {
      throw new TransactionHistoryLoadError('Inventarieomklassningens ursprung saknas i årets underlag.')
    }

    const originalTransaction = transactionById.get(asset.acquisition_transaction_id)
    const reclassificationTransaction = transactionById.get(event.transaction_id)
    if (!originalTransaction || !reclassificationTransaction) continue

    const link: TransactionHistoryFixedAssetReclassificationLink = {
      assetId: asset.id,
      assetName: asset.name || 'Inventarie',
      amount: Number(event.amount ?? 0),
      eventDate: event.event_date,
      originalTransactionId: asset.acquisition_transaction_id,
      reclassificationTransactionId: event.transaction_id,
      originalVerNr: firstVerNr(journalMap, asset.acquisition_transaction_id),
      reclassificationVerNr: firstVerNr(journalMap, event.transaction_id),
    }

    fixedAssetTraceFor(originalTransaction).reclassifiedBy.push(link)
    fixedAssetTraceFor(reclassificationTransaction).reclassifies.push(link)
  }
}

async function attachHistoricalCustomerInvoiceLinks({
  client, userId, transactions,
}: {
  client: TransactionHistorySupabaseClient
  userId: string
  transactions: TransactionHistoryRow[]
}) {
  const manualById = new Map(transactions.filter(tx => tx.source === 'manual').map(tx => [tx.id, tx]))
  if (manualById.size === 0) return

  const bookings = await fetchAllRowsByChunks<HistoricalCustomerInvoiceBookingRow, string>({
    context: 'transaction history historical customer invoice bookings',
    values: [...manualById.keys()],
    createQuery: ids => client.from<HistoricalCustomerInvoiceBookingRow>('customer_invoice_bookings')
      .select('id, user_id, transaction_id, invoice_id, booking_kind, booking_date, fiscal_year, reverses_booking_id', { count: 'exact' })
      .eq('user_id', userId)
      // Read every link for these manual rows: an unexpected kind is an error,
      // not evidence that the manual transaction has no invoice link.
      .in('transaction_id', ids)
      .order('id', { ascending: true }) as TransactionHistoryQueryBuilder<HistoricalCustomerInvoiceBookingRow> &
      FetchAllRangeQuery<HistoricalCustomerInvoiceBookingRow>,
  })

  const bookingIds = new Set<string>(), transactionIds = new Set<string>(), invoiceIds = new Set<string>()
  for (const booking of bookings) {
    const tx = manualById.get(booking.transaction_id)
    const date = booking.booking_date
    const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
    if (typeof booking.id !== 'string' || !booking.id.trim() ||
      typeof booking.invoice_id !== 'string' || !booking.invoice_id.trim() || booking.user_id !== userId || !tx ||
      booking.booking_kind !== 'historical_payment_same_year' || booking.reverses_booking_id !== null ||
      !validDate || date !== tx.date || booking.fiscal_year !== Number(date.slice(0, 4)) ||
      bookingIds.has(booking.id) || transactionIds.has(booking.transaction_id) || invoiceIds.has(booking.invoice_id)) {
      throw new TransactionHistoryLoadError('Historiska kundfakturalänkar kunde inte verifieras: fel ägare, koppling, datum, år eller dubbla uppgifter.')
    }
    bookingIds.add(booking.id)
    transactionIds.add(booking.transaction_id)
    invoiceIds.add(booking.invoice_id)
  }

  const invoices = await fetchAllRowsByChunks<HistoricalCustomerInvoiceRow, string>({
    context: 'transaction history historical customer invoices',
    values: [...invoiceIds],
    createQuery: ids => client.from<HistoricalCustomerInvoiceRow>('customer_invoices')
      .select('id, user_id', { count: 'exact' })
      .eq('user_id', userId)
      .in('id', ids)
      .order('id', { ascending: true }) as TransactionHistoryQueryBuilder<HistoricalCustomerInvoiceRow> &
      FetchAllRangeQuery<HistoricalCustomerInvoiceRow>,
  })
  const verifiedInvoices = new Set<string>()
  for (const invoice of invoices) {
    if (invoice.user_id !== userId || !invoiceIds.has(invoice.id) || verifiedInvoices.has(invoice.id)) {
      throw new TransactionHistoryLoadError('Historiska kundfakturor kunde inte verifieras: fel ägare, koppling eller dubbla uppgifter.')
    }
    verifiedInvoices.add(invoice.id)
  }
  if (verifiedInvoices.size !== invoiceIds.size) {
    throw new TransactionHistoryLoadError('Historiska kundfakturor kunde inte verifieras: en kopplad faktura saknas.')
  }
  // Do not expose any classification until all pages and references are verified.
  for (const id of transactionIds) manualById.get(id)!.historical_customer_invoice_link = true
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
  const rawTransactions = await fetchAllRows<TransactionHistoryRow>({
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

  assertTransactionRows(rawTransactions, userId, startDate, endDate)
  const transactions = rawTransactions.map(tx => ({ ...tx, historical_customer_invoice_link: false }))

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

  const journalMap = buildJournalMap(journalRows, userId, allowedTransactionIds)

  await attachFixedAssetReclassificationTrace({
    client,
    userId,
    transactions,
    journalMap,
  })

  await attachHistoricalCustomerInvoiceLinks({ client, userId, transactions })

  return {
    transactions,
    journalMap,
  }
}

export function transactionHistoryErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Transaktionshistoriken kunde inte laddas komplett.'
}
