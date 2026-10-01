import {
  FetchAllRowsError,
  fetchAllRows,
  fetchAllRowsByChunks,
  type FetchAllQueryResult,
  type FetchAllRangeQuery,
} from '../src/lib/supabaseFetchAll.ts'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`PASS ${description}`)
    passed++
    return
  }

  console.error(`FAIL ${description}`)
  console.error(`  Expected: ${expected}`)
  console.error(`  Actual:   ${actual}`)
  failed++
}

async function assertThrows(
  action: () => Promise<unknown>,
  expectedText: string,
  description: string
) {
  try {
    await action()
    console.error(`FAIL ${description}`)
    console.error('  Expected an error but none was thrown.')
    failed++
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    assertEqual(err instanceof FetchAllRowsError, true, `${description} -> typed error`)
    assertEqual(message.includes(expectedText), true, `${description} -> message`)
  }
}

interface FakeRow {
  id: string
  group?: string
}

class FakeRangeQuery<T extends FakeRow> implements FetchAllRangeQuery<T> {
  private readonly rows: T[]
  private readonly options: {
    count?: number | null
    error?: Error | null
    ids?: string[]
  }
  private fromIndex = 0
  private toIndex = 999

  constructor(
    rows: T[],
    options: {
      count?: number | null
      error?: Error | null
      ids?: string[]
    } = {}
  ) {
    this.rows = rows
    this.options = options
  }

  range(from: number, to: number): FakeRangeQuery<T> {
    const next = new FakeRangeQuery(this.rows, this.options)
    next.fromIndex = from
    next.toIndex = to
    return next
  }

  then<TResult1 = FetchAllQueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: FetchAllQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const allowedIds = this.options.ids ? new Set(this.options.ids) : null
    const scopedRows = allowedIds
      ? this.rows.filter(row => allowedIds.has(row.id))
      : this.rows
    const result: FetchAllQueryResult<T> = {
      data: scopedRows.slice(this.fromIndex, this.toIndex + 1),
      error: this.options.error ?? null,
      count: this.options.count === undefined
        ? scopedRows.length
        : this.options.count,
    }

    return Promise.resolve(result).then(onfulfilled, onrejected)
  }
}

const rows1001: FakeRow[] = Array.from({ length: 1001 }, (_, index) => ({
  id: `row-${index}`,
}))

console.log('\n=== SoloLedger Supabase Fetch-All Tests ===\n')

const allRows = await fetchAllRows({
  context: '1001 fake rows',
  pageSize: 500,
  createQuery: () => new FakeRangeQuery(rows1001),
})

assertEqual(allRows.length, 1001, 'fetchAllRows loads more than 1000 rows')
assertEqual(allRows[0].id, 'row-0', 'fetchAllRows preserves first row')
assertEqual(allRows[1000].id, 'row-1000', 'fetchAllRows preserves last row')

await assertThrows(
  () => fetchAllRows({
    context: 'truncated fake rows',
    pageSize: 500,
    createQuery: () => new FakeRangeQuery(rows1001.slice(0, 1000), {
      count: 1001,
    }),
  }),
  'fetched 1000 of 1001',
  'fetchAllRows rejects count/data mismatch'
)

await assertThrows(
  () => fetchAllRows({
    context: 'uncounted fake rows',
    pageSize: 500,
    createQuery: () => new FakeRangeQuery(rows1001, {
      count: null,
    }),
  }),
  'did not return an exact row count',
  'fetchAllRows rejects missing exact count'
)

await assertThrows(
  () => fetchAllRows({
    context: 'errored fake rows',
    createQuery: () => new FakeRangeQuery(rows1001, {
      error: new Error('network unavailable'),
    }),
  }),
  'network unavailable',
  'fetchAllRows rejects query errors'
)

const chunkedRows = await fetchAllRowsByChunks({
  context: 'chunked fake rows',
  values: rows1001.map(row => row.id),
  chunkSize: 400,
  pageSize: 250,
  createQuery: ids => new FakeRangeQuery(rows1001, { ids }),
})

assertEqual(chunkedRows.length, 1001, 'fetchAllRowsByChunks loads 1001 rows')
assertEqual(chunkedRows[1000].id, 'row-1000', 'fetchAllRowsByChunks preserves final chunk')

const dedupedChunkedRows = await fetchAllRowsByChunks({
  context: 'chunked duplicate fake rows',
  values: ['row-0', 'row-0', 'row-1', 'row-1'],
  chunkSize: 1,
  createQuery: ids => new FakeRangeQuery(rows1001, { ids }),
})

assertEqual(
  dedupedChunkedRows.length,
  2,
  'fetchAllRowsByChunks deduplicates repeated input values'
)
assertEqual(
  dedupedChunkedRows.map(row => row.id).join(','),
  'row-0,row-1',
  'fetchAllRowsByChunks preserves unique input order'
)

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('All Supabase fetch-all tests passed.\n')
}
