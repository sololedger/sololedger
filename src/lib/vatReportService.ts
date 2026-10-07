import {
  aggregateVatReport,
  type VatReportAggregation,
  type VatReportAggregationError,
  type VatReportJournalRowInput,
  type VatReportSnapshotInput,
  type VatReportTransactionInput,
} from './vatReportAggregation.ts'
import {
  fetchAllRows,
  fetchAllRowsByChunks,
  type FetchAllRangeQuery,
} from './supabaseFetchAll.ts'

export type VatReportServiceErrorCode =
  | 'query_failed'
  | 'invalid_loaded_scope'
  | 'aggregation_blocked'

export interface VatReportServiceError {
  code: VatReportServiceErrorCode
  message: string
  details?: string
  aggregationErrors?: VatReportAggregationError[]
}

export type VatReportServiceResult =
  | {
      status: 'ready'
      report: VatReportAggregation
      errors: []
    }
  | {
      status: 'blocked'
      report: null
      errors: VatReportServiceError[]
    }

export interface VatReportTransactionRow {
  id: string
  user_id: string
  date: string
  source: string | null
  import_batch_id?: string | null
  import_batch_status?: string | null
}

export interface VatReportJournalEntryRow {
  user_id: string
  transaction_id: string
  account_number: string
  debit: number | string | null
  credit: number | string | null
  date: string | null
}

export interface VatReportAuditSnapshotRow {
  user_id: string
  transaction_id: string
  snapshot: unknown
  created_at?: string | null
}

export interface LoadedVatReportRows {
  transactions: VatReportTransactionRow[]
  journalRows: VatReportJournalEntryRow[]
  vatV2Snapshots: VatReportAuditSnapshotRow[]
}

type VatReportInputBuildResult =
  | {
      status: 'ready'
      input: {
        transactions: VatReportTransactionInput[]
        journalRows: VatReportJournalRowInput[]
        vatV2Snapshots: VatReportSnapshotInput[]
      }
      errors: []
    }
  | {
      status: 'blocked'
      input: null
      errors: VatReportServiceError[]
    }

type VatReportSupabaseFilterQuery = FetchAllRangeQuery<unknown> & {
  eq(column: string, value: unknown): VatReportSupabaseFilterQuery
  gte(column: string, value: string): VatReportSupabaseFilterQuery
  lte(column: string, value: string): VatReportSupabaseFilterQuery
  like(column: string, value: string): VatReportSupabaseFilterQuery
  in(column: string, values: string[]): VatReportSupabaseFilterQuery
}

type VatReportSupabaseQuery = {
  select(
    columns: string,
    options?: { count?: 'exact' }
  ): VatReportSupabaseFilterQuery
}

export type VatReportSupabaseClient = {
  from(table: string): VatReportSupabaseQuery
}

function isInPeriod(date: string | null | undefined, startDate: string, endDate: string) {
  return Boolean(date && date >= startDate && date <= endDate)
}

function isOutputVatAccount(accountNumber: string) {
  return (
    accountNumber.startsWith('261') ||
    accountNumber.startsWith('262') ||
    accountNumber.startsWith('263')
  )
}

function isInputVatAccount(accountNumber: string) {
  return accountNumber.startsWith('264')
}

function isVatReportCandidateAccount(accountNumber: string) {
  return isOutputVatAccount(accountNumber) || isInputVatAccount(accountNumber)
}

function isVat26Account(accountNumber: string) {
  return accountNumber.startsWith('26')
}

function numericAmount(value: number | string | null) {
  if (value == null) return 0
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : Number.NaN
}

function serviceError(
  code: VatReportServiceErrorCode,
  message: string,
  details?: string,
  aggregationErrors?: VatReportAggregationError[]
): VatReportServiceError {
  return { code, message, details, aggregationErrors }
}

function queryError(message: string, details: unknown): VatReportServiceResult {
  const detailText =
    details instanceof Error
      ? details.message
      : typeof details === 'string'
      ? details
      : undefined

  return {
    status: 'blocked',
    report: null,
    errors: [serviceError('query_failed', message, detailText)],
  }
}

function assertLoadedTenantScope(
  userId: string,
  rows: LoadedVatReportRows
): VatReportServiceError[] {
  const errors: VatReportServiceError[] = []

  if (rows.transactions.some(row => row.user_id !== userId)) {
    errors.push(serviceError(
      'invalid_loaded_scope',
      'Loaded VAT report transactions contain rows outside the authenticated user scope.'
    ))
  }

  if (rows.journalRows.some(row => row.user_id !== userId)) {
    errors.push(serviceError(
      'invalid_loaded_scope',
      'Loaded VAT report journal rows contain rows outside the authenticated user scope.'
    ))
  }

  if (rows.vatV2Snapshots.some(row => row.user_id !== userId)) {
    errors.push(serviceError(
      'invalid_loaded_scope',
      'Loaded VAT report snapshots contain rows outside the authenticated user scope.'
    ))
  }

  return errors
}

function buildVatReportAggregatorInput(input: {
  userId: string
  startDate: string
  endDate: string
  rows: LoadedVatReportRows
}): VatReportInputBuildResult {
  const tenantErrors = assertLoadedTenantScope(input.userId, input.rows)

  if (tenantErrors.length > 0) {
    return { status: 'blocked', input: null, errors: tenantErrors }
  }

  const periodCandidateTransactionIds = new Set(
    input.rows.journalRows
      .filter(row => (
        isInPeriod(row.date, input.startDate, input.endDate) &&
        isVatReportCandidateAccount(row.account_number)
      ))
      .map(row => row.transaction_id)
  )
  const reportVatV2TransactionIds = new Set(
    input.rows.transactions
      .filter(row => (
        row.source === 'vat_v2' &&
        isInPeriod(row.date, input.startDate, input.endDate)
      ))
      .map(row => row.id)
  )
  const relevantTransactionIds = new Set([
    ...periodCandidateTransactionIds,
    ...reportVatV2TransactionIds,
  ])
  const transactions: VatReportTransactionInput[] = []
  const seenTransactions = new Set<string>()

  for (const row of input.rows.transactions) {
    if (
      !relevantTransactionIds.has(row.id) &&
      row.source !== 'vat_v2'
    ) {
      continue
    }

    if (
      row.source === 'vat_v2' &&
      !periodCandidateTransactionIds.has(row.id) &&
      !reportVatV2TransactionIds.has(row.id)
    ) {
      continue
    }

    if (seenTransactions.has(row.id)) continue

    transactions.push({
      id: row.id,
      source: row.source,
      importBatchStatus: row.import_batch_status ?? null,
      inReportPeriod: isInPeriod(row.date, input.startDate, input.endDate),
    })
    seenTransactions.add(row.id)
  }

  const knownTransactionIds = new Set(transactions.map(row => row.id))
  const journalRows: VatReportJournalRowInput[] = input.rows.journalRows
    .filter(row => (
      knownTransactionIds.has(row.transaction_id) &&
      isVat26Account(row.account_number)
    ))
    .map(row => ({
      transactionId: row.transaction_id,
      accountNumber: row.account_number,
      debit: numericAmount(row.debit),
      credit: numericAmount(row.credit),
      inReportPeriod: isInPeriod(row.date, input.startDate, input.endDate),
    }))

  if (
    journalRows.some(row => !Number.isFinite(row.debit) || !Number.isFinite(row.credit))
  ) {
    return {
      status: 'blocked',
      input: null,
      errors: [serviceError(
        'invalid_loaded_scope',
        'Loaded VAT report journal rows contain non-numeric debit or credit amounts.'
      )],
    }
  }

  const vatV2Snapshots: VatReportSnapshotInput[] = input.rows.vatV2Snapshots
    .filter(row => reportVatV2TransactionIds.has(row.transaction_id))
    .map(row => ({
      transactionId: row.transaction_id,
      snapshot: row.snapshot,
    }))

  return {
    status: 'ready',
    input: {
      transactions,
      journalRows,
      vatV2Snapshots,
    },
    errors: [],
  }
}

export function calculateVatReportFromLoadedRows(input: {
  userId: string
  startDate: string
  endDate: string
  rows: LoadedVatReportRows
}): VatReportServiceResult {
  const aggregatorInput = buildVatReportAggregatorInput(input)

  if (aggregatorInput.status === 'blocked') {
    return {
      status: 'blocked',
      report: null,
      errors: aggregatorInput.errors,
    }
  }

  const aggregation = aggregateVatReport(aggregatorInput.input)

  if (aggregation.status === 'blocked') {
    return {
      status: 'blocked',
      report: null,
      errors: [serviceError(
        'aggregation_blocked',
        'VAT report could not be safely calculated from loaded data.',
        undefined,
        aggregation.errors
      )],
    }
  }

  return {
    status: 'ready',
    report: aggregation.report,
    errors: [],
  }
}

async function loadTransactionsByIds(
  db: VatReportSupabaseClient,
  userId: string,
  transactionIds: string[]
): Promise<{ data: VatReportTransactionRow[]; error: unknown }> {
  if (transactionIds.length === 0) return { data: [], error: null }

  try {
    const data = await fetchAllRowsByChunks<VatReportTransactionRow, string>({
      context: 'VAT report transactions',
      values: transactionIds,
      createQuery: ids => db
        .from('transactions')
        .select('id, user_id, date, source, import_batch_id', { count: 'exact' })
        .eq('user_id', userId)
        .in('id', ids) as FetchAllRangeQuery<VatReportTransactionRow>,
    })

    return { data, error: null }
  } catch (error) {
    return { data: [], error }
  }
}

export async function getVatReportForPeriodFromDb(
  db: VatReportSupabaseClient,
  userId: string,
  startDate: string,
  endDate: string
): Promise<VatReportServiceResult> {
  try {
    const period26Rows = await fetchAllRows<
      Pick<VatReportJournalEntryRow, 'user_id' | 'transaction_id' | 'account_number' | 'date'>
    >({
      context: 'VAT report candidate journal rows',
      createQuery: () => db
        .from('journal_entries')
        .select('user_id, transaction_id, account_number, date', { count: 'exact' })
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .like('account_number', '26%') as FetchAllRangeQuery<
          Pick<VatReportJournalEntryRow, 'user_id' | 'transaction_id' | 'account_number' | 'date'>
        >,
    })

    const periodCandidateTransactionIds = Array.from(new Set(
      period26Rows
        .filter(row => isVatReportCandidateAccount(row.account_number))
        .map(row => row.transaction_id)
    ))

    const periodVatV2TransactionRows = await fetchAllRows<VatReportTransactionRow>({
      context: 'native VAT V2 transactions',
      createQuery: () => db
        .from('transactions')
        .select('id, user_id, date, source, import_batch_id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('source', 'vat_v2')
        .gte('date', startDate)
        .lte('date', endDate) as FetchAllRangeQuery<VatReportTransactionRow>,
    })

    const periodVatV2TransactionIds = periodVatV2TransactionRows.map(row => row.id)
    const relevantTransactionIds = Array.from(new Set([
      ...periodCandidateTransactionIds,
      ...periodVatV2TransactionIds,
    ]))
    const { data: candidateTransactionRows, error: transactionError } =
      await loadTransactionsByIds(db, userId, relevantTransactionIds)

    if (transactionError) {
      return queryError('Could not load VAT report transactions.', transactionError)
    }

    const allTransactionsById = new Map<string, VatReportTransactionRow>()

    for (const row of candidateTransactionRows) {
      allTransactionsById.set(row.id, row)
    }

    for (const row of periodVatV2TransactionRows) {
      allTransactionsById.set(row.id, row)
    }

    const allTransactionRows = Array.from(allTransactionsById.values())
    const importBatchIds = Array.from(new Set(
      allTransactionRows
        .map(row => row.import_batch_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ))
    const importBatchRows =
      importBatchIds.length === 0
        ? [] as { id: string; status: string | null }[]
        : await fetchAllRowsByChunks<{ id: string; status: string | null }, string>({
          context: 'SIE import batch status for VAT report',
          values: importBatchIds,
          createQuery: ids => db
            .from('import_batches')
            .select('id, status', { count: 'exact' })
            .eq('user_id', userId)
            .in('id', ids) as FetchAllRangeQuery<{ id: string; status: string | null }>,
        })

    const importBatchStatusById = new Map(
      importBatchRows.map(row => [row.id, row.status])
    )
    const allTransactionRowsWithBatchStatus = allTransactionRows.map(row => ({
      ...row,
      import_batch_status: row.import_batch_id
        ? importBatchStatusById.get(row.import_batch_id) ?? null
        : null,
    }))
    const all26Rows =
      relevantTransactionIds.length === 0
        ? [] as VatReportJournalEntryRow[]
        : await fetchAllRowsByChunks<VatReportJournalEntryRow, string>({
          context: 'complete VAT report journal rows',
          values: relevantTransactionIds,
          createQuery: ids => db
            .from('journal_entries')
            .select('user_id, transaction_id, account_number, debit, credit, date', { count: 'exact' })
            .eq('user_id', userId)
            .in('transaction_id', ids)
            .like('account_number', '26%') as FetchAllRangeQuery<VatReportJournalEntryRow>,
        })

    const snapshotRows =
      periodVatV2TransactionIds.length === 0
        ? [] as VatReportAuditSnapshotRow[]
        : await fetchAllRowsByChunks<VatReportAuditSnapshotRow, string>({
          context: 'VAT V2 audit snapshots',
          values: periodVatV2TransactionIds,
          createQuery: ids => db
            .from('vat_audit_snapshots')
            .select('user_id, transaction_id, snapshot, created_at', { count: 'exact' })
            .eq('user_id', userId)
            .in('transaction_id', ids) as FetchAllRangeQuery<VatReportAuditSnapshotRow>,
        })

    return calculateVatReportFromLoadedRows({
      userId,
      startDate,
      endDate,
      rows: {
        transactions: allTransactionRowsWithBatchStatus,
        journalRows: all26Rows,
        vatV2Snapshots: snapshotRows,
      },
    })
  } catch (err) {
    return queryError('Could not load complete VAT report source data.', err)
  }
}

export async function getVatReportForPeriod(
  startDate: string,
  endDate: string
): Promise<VatReportServiceResult> {
  const [{ supabase }, { getUserId }] = await Promise.all([
    import('./supabaseClient'),
    import('./accountingService'),
  ])

  try {
    const userId = await getUserId()
    return getVatReportForPeriodFromDb(
      supabase as unknown as VatReportSupabaseClient,
      userId,
      startDate,
      endDate
    )
  } catch (err) {
    return queryError('Could not determine authenticated user for VAT report.', err)
  }
}
