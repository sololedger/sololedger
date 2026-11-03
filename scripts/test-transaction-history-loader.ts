import {
  loadCompleteTransactionHistory,
  transactionHistoryErrorMessage,
  type TransactionHistoryFixedAssetTrace,
  type TransactionHistoryJournalRow,
  type TransactionHistoryRow,
  type TransactionHistorySupabaseClient,
} from '../src/lib/transactionHistoryLoader.ts'
import type { FetchAllQueryResult, FetchAllRangeQuery } from '../src/lib/supabaseFetchAll.ts'

type TableName = 'transactions' | 'journal_entries' | 'fixed_asset_events' | 'fixed_assets' |
  'customer_invoice_bookings' | 'customer_invoices'
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
  beforeResponse?: (table: TableName) => Promise<void>
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

    return Promise.resolve(this.options.beforeResponse?.(this.table)).then(() => result).then(onfulfilled, onrejected)
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
      customer_invoice_bookings: tables.customer_invoice_bookings ?? [],
      customer_invoices: tables.customer_invoices ?? [],
    }
    this.options = options
  }

  from(table: string): unknown {
    if (
      table !== 'transactions' &&
      table !== 'journal_entries' &&
      table !== 'fixed_asset_events' &&
      table !== 'fixed_assets' &&
      table !== 'customer_invoice_bookings' &&
      table !== 'customer_invoices'
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
function historicalFixture() {
  return {
    transactions: [
      { id: 'manual-linked', user_id: 'owner', date: '2026-02-03', source: 'manual' },
      { id: 'manual-ordinary', user_id: 'owner', date: '2026-02-03', source: 'manual', customer_invoice_id: 'unverified-id', historical_customer_invoice_link: true },
      { id: 'native', user_id: 'owner', date: '2026-02-03', source: 'customer_invoice' },
      { id: 'old', user_id: 'owner', date: '2025-02-03', source: 'manual' },
      { id: 'foreign', user_id: 'other-owner', date: '2026-02-03', source: 'manual' },
    ],
    customer_invoice_bookings: [{ id: 'link', user_id: 'owner', transaction_id: 'manual-linked', invoice_id: 'invoice',
      booking_kind: 'historical_payment_same_year', booking_date: '2026-02-03', fiscal_year: 2026, reverses_booking_id: null as string | null }],
    customer_invoices: [{ id: 'invoice', user_id: 'owner' }],
  }
}
async function loadHistorical(client: FakeSupabaseClient) {
  return loadCompleteTransactionHistory({ client: asHistoryClient(client), userId: 'owner', startDate: '2026-01-01', endDate: '2026-12-31' })
}
const historicalTables = historicalFixture()
const originalTables = JSON.stringify(historicalTables)
const historicalClient = new FakeSupabaseClient(historicalTables)
const historical = await loadHistorical(historicalClient)
assertEqual(historical.transactions.length, 3, 'historical links do not add transactions from other owners or years')
assertTrue(historical.transactions.find(tx => tx.id === 'manual-linked')?.historical_customer_invoice_link === true, 'valid historical link is marked')
assertTrue(historical.transactions.find(tx => tx.id === 'manual-ordinary')?.historical_customer_invoice_link === false, 'raw flags and customer_invoice_id never prove historical linkage')
assertTrue(historical.transactions.find(tx => tx.id === 'manual-linked')?.source === 'manual', 'stored source is preserved')
assertEqual(JSON.stringify(historicalTables), originalTables, 'classification never mutates input or stored rows')
for (const table of ['customer_invoice_bookings', 'customer_invoices'] as const) {
  assertTrue(historicalClient.calls.filter(call => call.table === table).every(call => call.selectCount === 'exact' && call.filters.includes('user_id=') && call.orders.some(order => order.column === 'id')), `${table} uses owner scope, exact count and stable order`)
}
assertTrue(historicalClient.calls.find(call => call.table === 'customer_invoice_bookings')!.filters.includes('transaction_id in 2'), 'only already loaded manual transactions are queried')

const malformedBookings: Array<Partial<typeof historicalTables.customer_invoice_bookings[number]>> = [
  { user_id: 'other-owner' }, { transaction_id: 'unknown' }, { transaction_id: 'native' },
  { transaction_id: 'old' }, { transaction_id: 'foreign' }, { invoice_id: '' }, { id: '' },
  { booking_kind: 'payment_same_year' }, { fiscal_year: 2025 }, { booking_date: '2026-02-04' },
  { booking_date: '2026-02-30' }, { booking_date: '2026-2-03' }, { reverses_booking_id: 'reversal' },
]
for (const change of malformedBookings) {
  const tables = historicalFixture()
  Object.assign(tables.customer_invoice_bookings[0], change)
  await assertThrows(() => loadHistorical(new FakeSupabaseClient(tables, { ignoreFiltersTable: 'customer_invoice_bookings' })),
    'Historiska kundfakturalänkar', 'invalid booking fails closed: ' + JSON.stringify(change))
}
const wrongKindTables = historicalFixture()
wrongKindTables.customer_invoice_bookings[0].booking_kind = 'payment_same_year'
await assertThrows(() => loadHistorical(new FakeSupabaseClient(wrongKindTables)), 'Historiska kundfakturalänkar',
  'unexpected booking kind for a manual transaction is not silently excluded by a query filter')
for (const duplicate of [
  { id: 'link' },
  { id: 'another', invoice_id: 'another-invoice' },
  { id: 'another', transaction_id: 'manual-ordinary' },
]) {
  const tables = historicalFixture()
  tables.customer_invoice_bookings.push({ ...tables.customer_invoice_bookings[0], ...duplicate })
  await assertThrows(() => loadHistorical(new FakeSupabaseClient(tables)), 'Historiska kundfakturalänkar', 'duplicate booking, transaction or historical invoice fails closed')
}
for (const invoices of [[], [{ id: 'invoice', user_id: 'other-owner' }],
  [{ id: 'unexpected', user_id: 'owner' }], [{ id: 'invoice', user_id: 'owner' }, { id: 'invoice', user_id: 'owner' }]]) {
  const tables = historicalFixture()
  tables.customer_invoices = invoices
  await assertThrows(() => loadHistorical(new FakeSupabaseClient(tables, { ignoreFiltersTable: 'customer_invoices' })),
    'Historiska kundfakturor', 'missing, foreign, unexpected or duplicate invoice fails closed')
}
for (const table of ['customer_invoice_bookings', 'customer_invoices'] as const) {
  for (const options of [{ missingCountTable: table }, { countOffsetTable: table }, { errorTable: table }]) {
    await assertThrows(() => loadHistorical(new FakeSupabaseClient(historicalFixture(), options)),
      table === 'customer_invoice_bookings' ? 'historical customer invoice bookings' : 'historical customer invoices',
      `${table}: absent count, incomplete pagination or read error fails closed`)
  }
}

// The same input objects are reused to expose any stale annotation across refreshes.
const refreshTables = historicalFixture(), refreshClient = new FakeSupabaseClient(refreshTables)
const savedLink = refreshTables.customer_invoice_bookings.pop()!
assertTrue((await loadHistorical(refreshClient)).transactions.every(tx => !tx.historical_customer_invoice_link), 'no link initially')
refreshTables.customer_invoice_bookings.push(savedLink)
assertTrue((await loadHistorical(refreshClient)).transactions.some(tx => tx.historical_customer_invoice_link), 'refresh discovers a new link without new bookkeeping')
refreshTables.customer_invoice_bookings.length = 0
assertTrue((await loadHistorical(refreshClient)).transactions.every(tx => !tx.historical_customer_invoice_link), 'refresh rebuilds all temporary classifications')

let invoiceReadStarted!: () => void, releaseOldInvoiceRead!: () => void
const invoiceRead = new Promise<void>(resolve => { invoiceReadStarted = resolve })
const oldInvoiceReply = new Promise<void>(resolve => { releaseOldInvoiceRead = resolve })
const overlappingTables = historicalFixture()
const oldLoad = loadHistorical(new FakeSupabaseClient(overlappingTables, { beforeResponse: table => {
  if (table === 'customer_invoices') { invoiceReadStarted(); return oldInvoiceReply }
  return Promise.resolve()
} }))
await invoiceRead
overlappingTables.customer_invoice_bookings.length = 0
const newLoad = await loadHistorical(new FakeSupabaseClient(overlappingTables))
releaseOldInvoiceRead()
assertTrue((await oldLoad).transactions.some(tx => tx.historical_customer_invoice_link), 'delayed invoice existence check finishes its own snapshot')
assertTrue(newLoad.transactions.every(tx => !tx.historical_customer_invoice_link), 'late link verification cannot mutate a newer history snapshot')

const manyTransactions = Array.from({ length: 1101 }, (_, i) => ({ id: 'manual-' + i, user_id: 'owner', date: '2026-02-03', source: 'manual' }))
const manyBookings = manyTransactions.map(tx => ({ ...savedLink, id: 'link-' + tx.id, transaction_id: tx.id, invoice_id: 'invoice-' + tx.id }))
const manyClient = new FakeSupabaseClient({ transactions: manyTransactions, customer_invoice_bookings: manyBookings,
  customer_invoices: manyBookings.map(b => ({ id: b.invoice_id, user_id: 'owner' })) })
assertEqual((await loadHistorical(manyClient)).transactions.filter(tx => tx.historical_customer_invoice_link).length, 1101, 'all historical links load beyond both 200 and 1000 rows')
assertEqual(manyClient.calls.filter(call => call.table === 'customer_invoice_bookings').length, 3, 'booking queries are safely chunked')
assertEqual(manyClient.calls.filter(call => call.table === 'customer_invoices').length, 3, 'invoice existence checks are safely chunked')
const noManualClient = new FakeSupabaseClient({ transactions: historicalFixture().transactions.filter(tx => tx.source === 'customer_invoice') })
await loadHistorical(noManualClient)
assertTrue(noManualClient.calls.every(call => !call.table.startsWith('customer_invoice')), 'no extra requests without manual candidates')
console.log('\nAll transaction history loader tests passed.\n')
