import {
  loadCompleteTransactionHistory,
  transactionHistoryErrorMessage,
  type TransactionHistoryFixedAssetTrace,
  type TransactionHistoryJournalRow,
  type TransactionHistoryRow,
  type TransactionHistorySupabaseClient,
} from '../src/lib/transactionHistoryLoader.ts'
import type { FetchAllQueryResult, FetchAllRangeQuery } from '../src/lib/supabaseFetchAll.ts'

type TableName = 'transactions' | 'journal_entries' | 'fixed_asset_events' | 'fixed_assets'
type FixedAssetEventTestRow = {
  id: string
  user_id?: string | null
  asset_id: string
  transaction_id: string
  event_type: string
  event_date: string
  amount?: number | string | null
  [key: string]: unknown
}
type FixedAssetTestRow = {
  id: string
  user_id?: string | null
  acquisition_transaction_id: string
  name?: string | null
  [key: string]: unknown
}
type TestRow =
  | TransactionHistoryRow
  | TransactionHistoryJournalRow
  | FixedAssetEventTestRow
  | FixedAssetTestRow

interface QueryCall {
  table: TableName
  selectCount?: 'exact'
  filters: string[]
  orders: Array<{ column: string; ascending: boolean }>
  ranges: Array<{ from: number; to: number }>
}

interface FakeClientOptions {
  missingCountTable?: TableName
  countOffsetTable?: TableName
  errorTable?: TableName
  ignoreFiltersTable?: TableName
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`)
  }
  console.log(`PASS: ${label}`)
}

function assertTrue(value: boolean, label: string) {
  if (!value) {
    throw new Error(`${label}: expected true`)
  }
  console.log(`PASS: ${label}`)
}

async function assertThrows(
  fn: () => Promise<unknown>,
  expectedMessagePart: string,
  label: string
) {
  try {
    await fn()
  } catch (error) {
    const message = transactionHistoryErrorMessage(error)
    if (!message.includes(expectedMessagePart)) {
      throw new Error(`${label}: expected "${expectedMessagePart}" in "${message}"`)
    }
    console.log(`PASS: ${label}`)
    return
  }

  throw new Error(`${label}: expected error`)
}

class FakeQuery<T extends TestRow> implements FetchAllRangeQuery<T> {
  private readonly table: TableName
  private readonly sourceRows: T[]
  private readonly calls: QueryCall[]
  private readonly options: FakeClientOptions
  private filters: Array<(row: T) => boolean> = []
  private filterLabels: string[] = []
  private orders: Array<{ column: string; ascending: boolean }> = []
  private rangeFrom = 0
  private rangeTo = Number.MAX_SAFE_INTEGER

  constructor(
    table: TableName,
    sourceRows: T[],
    calls: QueryCall[],
    options: FakeClientOptions
  ) {
    this.table = table
    this.sourceRows = sourceRows
    this.calls = calls
    this.options = options
  }

  select(_columns: string, options?: { count?: 'exact' }) {
    this.calls.push({
      table: this.table,
      selectCount: options?.count,
      filters: this.filterLabels,
      orders: this.orders,
      ranges: [],
    })
    return this
  }

  eq(column: string, value: unknown) {
    this.filterLabels.push(`${column}=`)
    this.filters.push(row => row[column] === value)
    return this
  }

  gte(column: string, value: unknown) {
    this.filterLabels.push(`${column}>=`)
    this.filters.push(row => String(row[column]) >= String(value))
    return this
  }

  lte(column: string, value: unknown) {
    this.filterLabels.push(`${column}<=`)
    this.filters.push(row => String(row[column]) <= String(value))
    return this
  }

  in(column: string, values: readonly unknown[]) {
    const valueSet = new Set(values)
    this.filterLabels.push(`${column} in ${values.length}`)
    this.filters.push(row => valueSet.has(row[column]))
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false })
    return this
  }

  range(from: number, to: number) {
    this.rangeFrom = from
    this.rangeTo = to
    const latestCall = this.calls[this.calls.length - 1]
    latestCall?.ranges.push({ from, to })
    return this
  }

  then<TResult1 = FetchAllQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: FetchAllQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const filteredRows = (this.options.ignoreFiltersTable === this.table
      ? this.sourceRows
      : this.sourceRows.filter(row => this.filters.every(filter => filter(row))))
      .sort((a, b) => {
        for (const order of this.orders) {
          const aValue = String(a[order.column] ?? '')
          const bValue = String(b[order.column] ?? '')
          const direction = order.ascending ? 1 : -1
          const comparison = aValue.localeCompare(bValue)
          if (comparison !== 0) return comparison * direction
        }
        return 0
      })

    const count =
      this.options.missingCountTable === this.table
        ? null
        : filteredRows.length + (this.options.countOffsetTable === this.table ? 1 : 0)

    const result: FetchAllQueryResult<T> = {
      data: filteredRows.slice(this.rangeFrom, this.rangeTo + 1),
      error: this.options.errorTable === this.table ? new Error(`${this.table} failed`) : null,
      count,
    }

    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

class FakeSupabaseClient {
  readonly calls: QueryCall[] = []
  private readonly tables: Record<TableName, TestRow[]>
  private readonly options: FakeClientOptions

  constructor(
    tables: Partial<Record<TableName, TestRow[]>>,
    options: FakeClientOptions = {}
  ) {
    this.tables = {
      transactions: tables.transactions ?? [],
      journal_entries: tables.journal_entries ?? [],
      fixed_asset_events: tables.fixed_asset_events ?? [],
      fixed_assets: tables.fixed_assets ?? [],
    }
    this.options = options
  }

  from(table: string): unknown {
    if (
      table !== 'transactions' &&
      table !== 'journal_entries' &&
      table !== 'fixed_asset_events' &&
      table !== 'fixed_assets'
    ) {
      throw new Error(`Unexpected table: ${table}`)
    }

    return new FakeQuery(
      table,
      this.tables[table],
      this.calls,
      this.options
    )
  }
}

function asHistoryClient(client: FakeSupabaseClient): TransactionHistorySupabaseClient {
  return client as unknown as TransactionHistorySupabaseClient
}

function createFixture() {
  const userA = 'user-a'
  const userB = 'user-b'
  const transactions: TransactionHistoryRow[] = []
  const journalEntries: TransactionHistoryJournalRow[] = []
  const fixedAssetEvents: FixedAssetEventTestRow[] = []
  const fixedAssets: FixedAssetTestRow[] = []

  for (let index = 0; index < 1001; index += 1) {
    const id = `tx-${String(index).padStart(4, '0')}`
    const isCorrection = index === 1000
    const isInvoice = index === 999
    const verNr = 2000 + index

    transactions.push({
      id,
      user_id: userA,
      date: index < 900 ? '2026-06-30' : '2026-12-31',
      description: isCorrection
        ? 'Korrigering av testverifikation'
        : isInvoice
          ? 'Kundfaktura TEST-999'
          : `Historikrad ${index}`,
      amount: 100 + index,
      type: isInvoice ? 'kundfaktura' : 'forsaljning',
      source: isInvoice ? 'customer_invoice_payment' : 'manual',
      customer_invoice_id: isInvoice ? 'invoice-999' : null,
      is_correction: isCorrection,
      corrects_ver_nr: isCorrection ? 1999 : null,
    })

    const rowCount = index < 500 ? 3 : 2
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      journalEntries.push({
        id: `je-${String(index).padStart(4, '0')}-${rowIndex}`,
        user_id: userA,
        transaction_id: id,
        ver_nr: verNr,
        account_number: rowIndex === 0 ? '1930' : rowIndex === 1 ? '3010' : '2611',
        debit: rowIndex === 0 ? 100 + index : 0,
        credit: rowIndex === 0 ? 0 : 50 + index,
        date: index < 900 ? '2026-06-30' : '2026-12-31',
      })
    }
  }

  transactions.push({
    id: 'other-year',
    user_id: userA,
    date: '2025-12-31',
    description: 'Fel år',
  })
  transactions.push({
    id: 'other-user',
    user_id: userB,
    date: '2026-06-30',
    description: 'Fel användare',
  })
  journalEntries.push({
    id: 'other-user-je',
    user_id: userB,
    transaction_id: 'other-user',
    ver_nr: 1,
  })

  transactions.push(
    {
      id: 'tx-fixed-original',
      user_id: userA,
      date: '2026-09-10',
      description: 'TEST – Datormus',
      amount: 1000,
      source: 'fixed_asset',
    },
    {
      id: 'tx-fixed-reclass',
      user_id: userA,
      date: '2026-10-10',
      description: 'Omklassificering TEST – Datormus',
      amount: 1000,
      source: 'fixed_asset_reclassification',
    }
  )
  journalEntries.push(
    {
      id: 'je-fixed-original-1',
      user_id: userA,
      transaction_id: 'tx-fixed-original',
      ver_nr: 151,
      account_number: '5410',
      debit: 1000,
      credit: 0,
    },
    {
      id: 'je-fixed-original-2',
      user_id: userA,
      transaction_id: 'tx-fixed-original',
      ver_nr: 151,
      account_number: '1930',
      debit: 0,
      credit: 1000,
    },
    {
      id: 'je-fixed-reclass-1',
      user_id: userA,
      transaction_id: 'tx-fixed-reclass',
      ver_nr: 152,
      account_number: '1220',
      debit: 1000,
      credit: 0,
    },
    {
      id: 'je-fixed-reclass-2',
      user_id: userA,
      transaction_id: 'tx-fixed-reclass',
      ver_nr: 152,
      account_number: '5410',
      debit: 0,
      credit: 1000,
    }
  )
  fixedAssets.push({
    id: 'asset-mouse',
    user_id: userA,
    acquisition_transaction_id: 'tx-fixed-original',
    name: 'TEST – Datormus',
  })
  fixedAssetEvents.push({
    id: 'event-fixed-reclass',
    user_id: userA,
    asset_id: 'asset-mouse',
    transaction_id: 'tx-fixed-reclass',
    event_type: 'reclassification',
    event_date: '2026-10-10',
    amount: 1000,
  })

  return { userA, transactions, journalEntries, fixedAssetEvents, fixedAssets }
}

console.log('\n=== SoloLedger Transaction History Loader Tests ===\n')

const fixture = createFixture()
const client = new FakeSupabaseClient({
  transactions: fixture.transactions,
  journal_entries: fixture.journalEntries,
  fixed_asset_events: fixture.fixedAssetEvents,
  fixed_assets: fixture.fixedAssets,
})

const result = await loadCompleteTransactionHistory({
  client: asHistoryClient(client),
  userId: fixture.userA,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
})

assertEqual(result.transactions.length, 1003, 'loads more than 1000 transactions')
assertEqual(
  Object.values(result.journalMap).flat().length,
  2506,
  'loads more than 1000 journal rows'
)
assertEqual(result.journalMap['tx-0000'].length, 3, 'maps multiple journal rows per transaction')
assertEqual(result.journalMap['tx-1000'].length, 2, 'maps final correction journal rows')
assertEqual(result.transactions[0].id, 'tx-1000', 'stable database order uses date desc and id desc')
assertEqual(result.transactions[1002].id, 'tx-0000', 'stable paging preserves last same-date row')
assertTrue(
  result.transactions.every(row => row.user_id === fixture.userA && row.date?.startsWith('2026')),
  'tenant isolation and year filter are preserved'
)
assertTrue(
  result.transactions.some(row => row.is_correction === true && row.corrects_ver_nr === 1999),
  'correction metadata is preserved'
)
assertTrue(
  result.transactions.some(row => row.source === 'customer_invoice_payment' && row.customer_invoice_id === 'invoice-999'),
  'invoice transaction metadata is preserved'
)
const originalFixedAssetTx = result.transactions.find(row => row.id === 'tx-fixed-original')
const reclassificationTx = result.transactions.find(row => row.id === 'tx-fixed-reclass')
const originalFixedAssetTrace =
  originalFixedAssetTx?.fixed_asset_trace as TransactionHistoryFixedAssetTrace | undefined
const reclassificationTrace =
  reclassificationTx?.fixed_asset_trace as TransactionHistoryFixedAssetTrace | undefined
assertEqual(
  originalFixedAssetTrace?.reclassifiedBy?.[0]?.reclassificationVerNr,
  152,
  'original fixed-asset purchase is linked to the real reclassification VER number'
)
assertEqual(
  originalFixedAssetTrace?.reclassifiedBy?.[0]?.amount,
  1000,
  'original fixed-asset purchase trace includes the reclassified amount'
)
assertEqual(
  reclassificationTrace?.reclassifies?.[0]?.originalVerNr,
  151,
  'reclassification transaction links back to the real original VER number'
)
assertEqual(
  reclassificationTrace?.reclassifies?.[0]?.assetName,
  'TEST – Datormus',
  'reclassification trace uses the existing fixed-asset name'
)

const transactionCall = client.calls.find(call => call.table === 'transactions')
assertEqual(transactionCall?.selectCount, 'exact', 'transactions request asks for exact count')
assertEqual(
  transactionCall?.orders.map(order => `${order.column}:${order.ascending ? 'asc' : 'desc'}`).join(','),
  'date:desc,id:desc',
  'transactions request uses stable unique order'
)

const journalCalls = client.calls.filter(call => call.table === 'journal_entries')
assertTrue(journalCalls.length >= 3, 'journal rows are loaded in chunks')
assertTrue(
  journalCalls.every(call => call.selectCount === 'exact'),
  'journal requests ask for exact count'
)
assertTrue(
  journalCalls.every(call =>
    call.orders.map(order => `${order.column}:${order.ascending ? 'asc' : 'desc'}`).join(',') ===
    'transaction_id:asc,ver_nr:asc,id:asc'
  ),
  'journal requests use stable order'
)
assertTrue(
  journalCalls.some(call => call.ranges.some(range => range.from >= 1000)),
  'journal row paging continues beyond 1000 rows inside a chunk'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: fixture.transactions,
      journal_entries: fixture.journalEntries,
    }, { missingCountTable: 'transactions' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'did not return an exact row count',
  'missing transaction count fails closed'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: fixture.transactions,
      journal_entries: fixture.journalEntries,
    }, { countOffsetTable: 'transactions' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'fetched 1003 of 1004',
  'transaction count/data mismatch fails closed'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: fixture.transactions,
      journal_entries: fixture.journalEntries,
    }, { errorTable: 'journal_entries' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'journal_entries failed',
  'journal query error fails closed'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: fixture.transactions,
      journal_entries: fixture.journalEntries,
    }, { missingCountTable: 'journal_entries' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'did not return an exact row count',
  'missing journal count fails closed'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: fixture.transactions,
      journal_entries: fixture.journalEntries,
    }, { countOffsetTable: 'journal_entries' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'fetched 1000 of 1001',
  'journal count/data mismatch fails closed'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: fixture.transactions,
      journal_entries: [
        ...fixture.journalEntries,
        {
          id: 'bad-cross-tenant-je',
          user_id: 'user-b',
          transaction_id: 'tx-0000',
          ver_nr: 9999,
        },
      ],
    }, { ignoreFiltersTable: 'journal_entries' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'fel användare',
  'cross-tenant journal row fails closed'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: fixture.transactions,
      journal_entries: fixture.journalEntries,
      fixed_asset_events: [
        ...fixture.fixedAssetEvents,
        {
          id: 'bad-cross-tenant-event',
          user_id: 'user-b',
          asset_id: 'asset-mouse',
          transaction_id: 'tx-fixed-reclass',
          event_type: 'reclassification',
          event_date: '2026-10-10',
          amount: 1000,
        },
      ],
      fixed_assets: fixture.fixedAssets,
    }, { ignoreFiltersTable: 'fixed_asset_events' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'Inventariehändelserna kunde inte verifieras',
  'cross-tenant fixed-asset event fails closed'
)

await assertThrows(
  () => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({
      transactions: [
        ...fixture.transactions.filter(row => row.user_id === fixture.userA),
        {
          id: 'bad-cross-year-tx',
          user_id: fixture.userA,
          date: '2027-01-01',
          description: 'Fel år men felaktigt returnerad',
        },
      ],
      journal_entries: fixture.journalEntries,
    }, { ignoreFiltersTable: 'transactions' })),
    userId: fixture.userA,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  }),
  'utanför valt år',
  'cross-year transaction row fails closed if the backend returns it'
)

for (const invalid of [
  { fixed_asset_events: fixture.fixedAssetEvents.map(event => ({ ...event, amount: -1 })), fixed_assets: fixture.fixedAssets },
  { fixed_asset_events: fixture.fixedAssetEvents, fixed_assets: [] },
]) {
  await assertThrows(() => loadCompleteTransactionHistory({
    client: asHistoryClient(new FakeSupabaseClient({transactions:fixture.transactions,journal_entries:fixture.journalEntries,...invalid})),
    userId:fixture.userA,startDate:'2026-01-01',endDate:'2026-12-31',
  }), 'Inventarie', 'incomplete or invalid reclassification trace fails closed')
}
console.log('\nAll transaction history loader tests passed.\n')
