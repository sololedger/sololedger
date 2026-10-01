import { exportSIEForUserFromDb } from '../src/lib/sieExport.ts'

const USER_ID = 'user-1'
const YEAR = 2026

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

type FakeTableName =
  | 'transactions'
  | 'journal_entries'
  | 'accounts'
  | 'profiles'
  | 'vat_periods'

type FakeRow = Record<string, unknown>
type FakeDbRows = Record<FakeTableName, FakeRow[]>

class FakeSieQuery {
  private readonly rows: FakeRow[]
  private readonly countOverride: number | null
  private filters: Array<(row: FakeRow) => boolean> = []
  private fromIndex = 0
  private toIndex = 999

  constructor(rows: FakeRow[], countOverride: number | null = null) {
    this.rows = rows
    this.countOverride = countOverride
  }

  select() {
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value)
    return this
  }

  gte(column: string, value: string) {
    this.filters.push(row => String(row[column]) >= value)
    return this
  }

  lte(column: string, value: string) {
    this.filters.push(row => String(row[column]) <= value)
    return this
  }

  in(column: string, values: string[]) {
    const allowed = new Set(values)
    this.filters.push(row => allowed.has(String(row[column])))
    return this
  }

  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null) {
      throw new Error(`Fake query only supports .not(column, 'is', null).`)
    }
    this.filters.push(row => row[column] !== null && row[column] !== undefined)
    return this
  }

  range(from: number, to: number) {
    const next = new FakeSieQuery(this.rows, this.countOverride)
    next.filters = [...this.filters]
    next.fromIndex = from
    next.toIndex = to
    return next
  }

  maybeSingle() {
    const filtered = this.filteredRows()
    return Promise.resolve({
      data: filtered[0] ?? null,
      error: null,
    })
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const filtered = this.filteredRows()
    const result = {
      data: filtered.slice(this.fromIndex, this.toIndex + 1),
      error: null,
      count: this.countOverride ?? filtered.length,
    }

    return Promise.resolve(result).then(onfulfilled, onrejected)
  }

  private filteredRows() {
    return this.filters.reduce(
      (rows, filter) => rows.filter(filter),
      this.rows
    )
  }
}

function fakeDb(
  rows: FakeDbRows,
  countOverrides: Partial<Record<FakeTableName, number>> = {}
) {
  return {
    from(table: FakeTableName) {
      return new FakeSieQuery(rows[table], countOverrides[table] ?? null)
    },
  }
}

function countMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length
}

console.log('\n=== SoloLedger SIE Export Completeness Tests ===\n')

const currentTransactions = Array.from({ length: 1001 }, (_, index) => {
  const verNr = index + 1
  return {
    id: `current-${verNr}`,
    user_id: USER_ID,
    date: '2026-06-30',
    description: `Current verification ${verNr}`,
    is_correction: false,
    corrects_ver_nr: null,
  }
})

const currentEntries = currentTransactions.flatMap((transaction, index) => {
  const verNr = index + 1
  return [
    {
      user_id: USER_ID,
      transaction_id: transaction.id,
      ver_nr: verNr,
      account_number: '1930',
      debit: 10,
      credit: 0,
      description: transaction.description,
      date: '2026-06-30',
    },
    {
      user_id: USER_ID,
      transaction_id: transaction.id,
      ver_nr: verNr,
      account_number: '3010',
      debit: 0,
      credit: 10,
      description: transaction.description,
      date: '2026-06-30',
    },
  ]
})

const previousTransactions = Array.from({ length: 1001 }, (_, index) => {
  const verNr = index + 1
  return {
    id: `previous-${verNr}`,
    user_id: USER_ID,
    date: '2025-06-30',
    description: `Previous verification ${verNr}`,
  }
})

const previousEntries = previousTransactions.flatMap((transaction, index) => {
  const verNr = index + 1
  return [
    {
      user_id: USER_ID,
      transaction_id: transaction.id,
      ver_nr: verNr,
      account_number: '1930',
      debit: 2,
      credit: 0,
      description: transaction.description,
      date: '2025-06-30',
    },
    {
      user_id: USER_ID,
      transaction_id: transaction.id,
      ver_nr: verNr,
      account_number: '3010',
      debit: 0,
      credit: 2,
      description: transaction.description,
      date: '2025-06-30',
    },
  ]
})

const sie = await exportSIEForUserFromDb(
  fakeDb({
    transactions: [
      ...currentTransactions,
      ...previousTransactions,
    ],
    journal_entries: [
      ...currentEntries,
      ...previousEntries,
    ],
    accounts: [
      { user_id: USER_ID, name: 'Företagskonto', debit_account: '1930', credit_account: null },
      { user_id: USER_ID, name: 'Försäljning', debit_account: null, credit_account: '3010' },
      { user_id: USER_ID, name: 'Eget kapital', debit_account: null, credit_account: '2010' },
    ],
    profiles: [
      { id: USER_ID, company_name: 'SoloLedger Test AB', org_nr: '559999-9999' },
    ],
    vat_periods: [],
  }) as Parameters<typeof exportSIEForUserFromDb>[0],
  USER_ID,
  YEAR,
  async (balanceYear): Promise<Record<string, number>> => {
    if (balanceYear === 2025) {
      return { '1930': 500, '2010': -500 }
    }
    if (balanceYear === 2026) {
      return { '1930': 10510, '2010': -500 }
    }
    return {}
  },
  new Date('2026-10-01T12:00:00Z')
)

assertEqual(
  countMatches(sie, /^#VER /gm),
  1001,
  'SIE export includes all 1001 current-year #VER blocks'
)
assertEqual(
  countMatches(sie, /^#TRANS /gm),
  2002,
  'SIE export includes all current-year #TRANS rows'
)
assertEqual(
  sie.includes('#VER A 1001 20260630 "Current verification 1001" 20260630'),
  true,
  'SIE export includes final verification after the 1000-row boundary'
)
assertEqual(
  sie.includes('#RES 0 3010 -10010.00'),
  true,
  'SIE export current-year #RES uses all 1001 verifications'
)
assertEqual(
  sie.includes('#RES -1 3010 -2002.00'),
  true,
  'SIE export previous-year #RES uses complete previous-year rows'
)
assertEqual(
  sie.includes('#IB 0 1930 500.00'),
  true,
  'SIE export #IB uses complete previous-year balance'
)
assertEqual(
  sie.includes('#UB 0 1930 10510.00'),
  true,
  'SIE export #UB uses complete current-year balance'
)

try {
  await exportSIEForUserFromDb(
    fakeDb({
      transactions: currentTransactions.slice(0, 1000),
      journal_entries: currentEntries.slice(0, 2000),
      accounts: [],
      profiles: [],
      vat_periods: [],
    }, { transactions: 1001 }) as Parameters<typeof exportSIEForUserFromDb>[0],
    USER_ID,
    YEAR,
    async (): Promise<Record<string, number>> => ({}),
    new Date('2026-10-01T12:00:00Z')
  )
  assertEqual(true, false, 'SIE export rejects unverifiable transaction completeness')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  assertEqual(
    message.includes('SIE export') &&
      message.includes('1001'),
    true,
    'SIE export rejects unverifiable transaction completeness'
  )
}

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('All SIE export completeness tests passed.\n')
}
