import { classifyResultAccount } from './resultEngine.ts'

export type TransactionHistoryCategoryFilter =
  | 'all'
  | 'costs'
  | 'income'
  | 'customer_invoices'
  | 'foreign_purchases'
  | 'vat_tax'
  | 'imports'
  | 'fixed_assets'

export type TransactionHistorySortMode =
  | 'date_desc'
  | 'date_asc'
  | 'ver_desc'
  | 'amount_desc'
  | 'amount_asc'

export interface TransactionHistoryFilterState {
  search: string
  category: TransactionHistoryCategoryFilter
  sort: TransactionHistorySortMode
}

export interface TransactionHistoryAccountLike {
  id?: string | null
  name?: string | null
  debit_account?: string | null
  credit_account?: string | null
}

export interface TransactionHistoryJournalLike {
  id?: string | null
  account_number?: string | number | null
  debit?: string | number | null
  credit?: string | number | null
  description?: string | null
  account_name?: string | null
  ver_nr?: string | number | null
}

export interface TransactionHistoryFilterItem {
  tx: {
    id?: string | null
    date?: string | null
    description?: string | null
    amount?: string | number | null
    type?: string | null
    source?: string | null
    source_ver_series?: string | null
    source_ver_number?: string | number | null
    customer_invoice_id?: string | null
    vat_rate?: string | number | null
    is_correction?: boolean | null
    corrects_ver_nr?: string | number | null
    import_batch_id?: string | null
  }
  journal: TransactionHistoryJournalLike[]
  verNr?: string | number | null
  accountDef?: TransactionHistoryAccountLike | null
  isSystemManaged?: boolean
  isVatClosing?: boolean
  isVatV2?: boolean
  isVatSettlement?: boolean
  isTaxAccountMovement?: boolean
  isSieUndo?: boolean
  isImported?: boolean
  isOpeningBalance?: boolean
  isFixedAsset?: boolean
  isFixedAssetDepreciation?: boolean
  isFixedAssetReclassification?: boolean
  isFixedAssetSystemSource?: boolean
  originalIndex?: number
}

export const TRANSACTION_HISTORY_CATEGORY_OPTIONS: Array<{
  value: TransactionHistoryCategoryFilter
  label: string
}> = [
  { value: 'all', label: 'Alla' },
  { value: 'costs', label: 'Kostnader' },
  { value: 'income', label: 'Intäkter' },
  { value: 'customer_invoices', label: 'Kundfakturor' },
  { value: 'foreign_purchases', label: 'Utlandsinköp' },
  { value: 'vat_tax', label: 'Moms/skatt' },
  { value: 'imports', label: 'Import' },
  { value: 'fixed_assets', label: 'Inventarier' },
]

export const TRANSACTION_HISTORY_SORT_OPTIONS: Array<{
  value: TransactionHistorySortMode
  label: string
}> = [
  { value: 'date_desc', label: 'Nyast först' },
  { value: 'date_asc', label: 'Äldst först' },
  { value: 'ver_desc', label: 'Ver.nr' },
  { value: 'amount_desc', label: 'Belopp högst' },
  { value: 'amount_asc', label: 'Belopp lägst' },
]

export const DEFAULT_TRANSACTION_HISTORY_FILTERS: TransactionHistoryFilterState = {
  search: '',
  category: 'all',
  sort: 'date_desc',
}

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase('sv-SE')
    .replace(/\s+/g, ' ')
    .trim()
}

function accountNumber(row: TransactionHistoryJournalLike) {
  return String(row.account_number ?? '').trim()
}

function accountNamesFor(
  account: string,
  accountsByNumber: Map<string, string[]>
) {
  return accountsByNumber.get(account) ?? []
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function amountCents(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100)
}

function searchAmountCents(search: string) {
  const raw = String(search ?? '').trim()
  const compact = raw.replace(/[\s\u00a0]/g, '')
  if (!compact || !/^\d+(?:[,.]\d{1,2})?$/.test(compact)) return null

  const match = compact.match(/^(\d+)(?:([,.])(\d{1,2}))?$/)
  if (!match) return null

  const kronor = Number(match[1])
  const oren = Number((match[3] ?? '').padEnd(2, '0'))
  if (!Number.isFinite(kronor) || !Number.isFinite(oren)) return null

  return kronor * 100 + oren
}

function hasResultAccountType(item: TransactionHistoryFilterItem, resultType: 'income' | 'expense') {
  return item.journal.some(row =>
    classifyResultAccount(accountNumber(row))?.resultType === resultType
  )
}

function sourceIs(item: TransactionHistoryFilterItem, sources: string[]) {
  const source = String(item.tx.source ?? '').trim()
  return sources.includes(source)
}

function itemMatchesCategory(
  item: TransactionHistoryFilterItem,
  category: TransactionHistoryCategoryFilter
) {
  if (category === 'all') return true
  if (category === 'income') return hasResultAccountType(item, 'income')
  if (category === 'costs') return hasResultAccountType(item, 'expense')
  if (category === 'customer_invoices') return sourceIs(item, ['customer_invoice'])
  if (category === 'foreign_purchases') return sourceIs(item, ['vat_v2'])
  if (category === 'vat_tax') {
    return sourceIs(item, ['vat_closing', 'vat_settlement', 'tax_account_movement'])
  }
  if (category === 'imports') {
    return sourceIs(item, ['sie_import', 'sie_opening_balance', 'sie_import_undo'])
  }
  if (category === 'fixed_assets') {
    return sourceIs(item, [
      'fixed_asset',
      'fixed_asset_reclassification',
      'fixed_asset_depreciation',
    ])
  }
  return true
}

function searchCorpus(
  item: TransactionHistoryFilterItem,
  accountsByNumber: Map<string, string[]>
) {
  const date = String(item.tx.date ?? '').trim()
  const values: string[] = [
    date,
    date.match(/^\d{4}-\d{2}-\d{2}$/) ? date.slice(0, 7) : '',
    date.match(/^\d{4}/)?.[0] ?? '',
    item.tx.description ?? '',
    item.tx.type ?? '',
    item.tx.source ?? '',
    item.tx.customer_invoice_id ?? '',
    item.accountDef?.id ?? '',
    item.accountDef?.name ?? '',
  ]

  if (item.verNr != null) {
    values.push(`VER-${item.verNr}`, String(item.verNr))
  }
  if (item.tx.corrects_ver_nr != null) {
    values.push(`VER-${item.tx.corrects_ver_nr}`, `rättar VER-${item.tx.corrects_ver_nr}`)
  }
  if (item.tx.source_ver_series || item.tx.source_ver_number) {
    values.push(`${item.tx.source_ver_series ?? ''}${item.tx.source_ver_number ?? ''}`)
  }

  for (const row of item.journal) {
    const account = accountNumber(row)
    values.push(
      account,
      row.description ?? '',
      row.account_name ?? '',
      ...accountNamesFor(account, accountsByNumber)
    )
    if (row.ver_nr != null) values.push(`VER-${row.ver_nr}`, String(row.ver_nr))
  }

  return normalizeSearchText(values.join(' '))
}

function itemMatchesSearch(
  item: TransactionHistoryFilterItem,
  search: string,
  accountsByNumber: Map<string, string[]>
) {
  const terms = normalizeSearchText(search).split(' ').filter(Boolean)
  if (terms.length === 0) return true
  const corpus = searchCorpus(item, accountsByNumber)
  if (terms.every(term => corpus.includes(term))) return true

  const searchedAmount = searchAmountCents(search)
  return searchedAmount != null && amountCents(item.tx.amount) === searchedAmount
}

function undoBatchId(item: TransactionHistoryFilterItem) {
  return item.isSieUndo && item.tx.import_batch_id ? String(item.tx.import_batch_id) : null
}

function sortNumber(a: number, b: number, direction: 'asc' | 'desc') {
  return direction === 'asc' ? a - b : b - a
}

function compareItems(
  a: TransactionHistoryFilterItem,
  b: TransactionHistoryFilterItem,
  sort: TransactionHistorySortMode
) {
  if (sort === 'date_asc' || sort === 'date_desc') {
    const dateResult = String(a.tx.date ?? '').localeCompare(String(b.tx.date ?? ''))
    if (dateResult !== 0) return sort === 'date_asc' ? dateResult : -dateResult
    const verResult = sortNumber(numberValue(a.verNr), numberValue(b.verNr), sort === 'date_asc' ? 'asc' : 'desc')
    if (verResult !== 0) return verResult
  }

  if (sort === 'ver_desc') {
    const verResult = sortNumber(numberValue(a.verNr), numberValue(b.verNr), 'desc')
    if (verResult !== 0) return verResult
    const dateResult = String(a.tx.date ?? '').localeCompare(String(b.tx.date ?? ''))
    if (dateResult !== 0) return -dateResult
  }

  if (sort === 'amount_asc' || sort === 'amount_desc') {
    const amountResult = sortNumber(
      numberValue(a.tx.amount),
      numberValue(b.tx.amount),
      sort === 'amount_asc' ? 'asc' : 'desc'
    )
    if (amountResult !== 0) return amountResult
    const dateResult = String(a.tx.date ?? '').localeCompare(String(b.tx.date ?? ''))
    if (dateResult !== 0) return -dateResult
  }

  const idResult = String(a.tx.id ?? '').localeCompare(String(b.tx.id ?? ''))
  if (idResult !== 0) return idResult
  return numberValue(a.originalIndex) - numberValue(b.originalIndex)
}

export function buildAccountNameIndex(accounts: TransactionHistoryAccountLike[]) {
  const collected = new Map<string, string[]>()

  for (const account of accounts) {
    for (const accountNumber of [account.debit_account, account.credit_account]) {
      const key = String(accountNumber ?? '').trim()
      if (!key || !account.name) continue
      const existing = collected.get(key) ?? []
      if (!existing.includes(account.name)) existing.push(account.name)
      collected.set(key, existing)
    }
  }

  const index = new Map<string, string[]>()
  for (const [accountNumber, names] of collected) {
    if (names.length === 1) index.set(accountNumber, names)
  }

  return index
}

export function hasActiveTransactionHistoryFilters(filters: TransactionHistoryFilterState) {
  return (
    normalizeSearchText(filters.search).length > 0 ||
    filters.category !== DEFAULT_TRANSACTION_HISTORY_FILTERS.category ||
    filters.sort !== DEFAULT_TRANSACTION_HISTORY_FILTERS.sort
  )
}

export function filterAndSortTransactionHistoryItems<T extends TransactionHistoryFilterItem>({
  items,
  filters,
  accounts,
}: {
  items: T[]
  filters: TransactionHistoryFilterState
  accounts: TransactionHistoryAccountLike[]
}) {
  const accountsByNumber = buildAccountNameIndex(accounts)
  const directlyMatched = items.filter(item =>
    itemMatchesCategory(item, filters.category) &&
    itemMatchesSearch(item, filters.search, accountsByNumber)
  )

  const matchedUndoBatches = new Set(
    directlyMatched
      .map(undoBatchId)
      .filter((id): id is string => Boolean(id))
  )

  const included = items.filter(item => {
    if (directlyMatched.includes(item)) return true
    const batchId = undoBatchId(item)
    return Boolean(batchId && matchedUndoBatches.has(batchId))
  })

  return [...included].sort((a, b) => compareItems(a, b, filters.sort))
}
