export interface FetchAllQueryResult<T> {
  data: T[] | null
  error: unknown
  count: number | null
}

export type FetchAllRangeQuery<T> = PromiseLike<FetchAllQueryResult<T>> & {
  range(from: number, to: number): FetchAllRangeQuery<T>
}

export class FetchAllRowsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FetchAllRowsError'
  }
}

export interface FetchAllRowsOptions<T> {
  context: string
  createQuery: () => FetchAllRangeQuery<T>
  pageSize?: number
}

const DEFAULT_PAGE_SIZE = 1000
const DEFAULT_CHUNK_SIZE = 500

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new FetchAllRowsError(`${label} must be a positive integer.`)
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return String(error)
}

export async function fetchAllRows<T>({
  context,
  createQuery,
  pageSize = DEFAULT_PAGE_SIZE,
}: FetchAllRowsOptions<T>): Promise<T[]> {
  assertPositiveInteger(pageSize, 'pageSize')

  const rows: T[] = []
  let expectedCount: number | null = null

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error, count } = await createQuery().range(from, to)

    if (error) {
      throw new FetchAllRowsError(
        `Could not load complete ${context}: ${errorMessage(error)}`
      )
    }

    if (typeof count !== 'number') {
      throw new FetchAllRowsError(
        `Could not verify complete ${context}: Supabase did not return an exact row count.`
      )
    }

    if (expectedCount === null) {
      expectedCount = count
    } else if (count !== expectedCount) {
      throw new FetchAllRowsError(
        `Could not verify complete ${context}: row count changed from ${expectedCount} to ${count} while paging.`
      )
    }

    const pageRows = data ?? []
    rows.push(...pageRows)

    if (rows.length >= expectedCount) break

    if (pageRows.length === 0) {
      throw new FetchAllRowsError(
        `Could not load complete ${context}: fetched ${rows.length} of ${expectedCount} rows before paging stopped.`
      )
    }
  }

  if (expectedCount === null) {
    throw new FetchAllRowsError(
      `Could not verify complete ${context}: no Supabase response was received.`
    )
  }

  if (rows.length !== expectedCount) {
    throw new FetchAllRowsError(
      `Could not load complete ${context}: expected ${expectedCount} rows but fetched ${rows.length}.`
    )
  }

  return rows
}

export function chunkValues<T>(
  values: readonly T[],
  chunkSize = DEFAULT_CHUNK_SIZE
): T[][] {
  assertPositiveInteger(chunkSize, 'chunkSize')

  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize))
  }
  return chunks
}

export interface FetchAllRowsByChunksOptions<T, TValue> {
  context: string
  values: readonly TValue[]
  createQuery: (values: TValue[]) => FetchAllRangeQuery<T>
  pageSize?: number
  chunkSize?: number
}

export async function fetchAllRowsByChunks<T, TValue>({
  context,
  values,
  createQuery,
  pageSize = DEFAULT_PAGE_SIZE,
  chunkSize = DEFAULT_CHUNK_SIZE,
}: FetchAllRowsByChunksOptions<T, TValue>): Promise<T[]> {
  assertPositiveInteger(pageSize, 'pageSize')
  assertPositiveInteger(chunkSize, 'chunkSize')

  const rows: T[] = []
  const uniqueValues = Array.from(new Set(values))
  const chunks = chunkValues(uniqueValues, chunkSize)

  for (const [index, chunk] of chunks.entries()) {
    const chunkRows = await fetchAllRows({
      context: `${context} chunk ${index + 1}/${chunks.length}`,
      createQuery: () => createQuery(chunk),
      pageSize,
    })
    rows.push(...chunkRows)
  }

  return rows
}
