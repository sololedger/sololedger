export interface BankHistoryTransaction {
  id: string
  description?: string | null
  date?: string | null
  source?: string | null
  is_correction?: boolean | null
  corrects_ver_nr?: number | string | null
}

export interface BankHistoryJournalEntry {
  id?: string | number | null
  account_number?: string | number | null
  debit?: number | string | null
  credit?: number | string | null
  ver_nr?: number | string | null
}

export type BankHistoryEntryKind =
  | 'booked_bank_row'
  | 'correction'
  | 'neutralized_original'
  | 'uncertain_correction'

export interface BankHistoryEntry {
  id: string
  transactionId: string
  date: string
  description: string
  amount: number
  verNr: number | string | null
  source: string | null
  sourceLabel: string
  kind: BankHistoryEntryKind
  isInternalAdjustment: boolean
  direction: 'in' | 'out'
}

export interface BankAccountHistory {
  entries: BankHistoryEntry[]
  defaultEntries: BankHistoryEntry[]
  correctionEntries: BankHistoryEntry[]
  openingBalanceAmount: number
  openingBalanceCount: number
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function accountNumber(row: BankHistoryJournalEntry) {
  return String(row.account_number ?? '').trim()
}

function bankAmount(rows: BankHistoryJournalEntry[]) {
  return roundCurrency(
    rows.reduce(
      (sum, row) => sum + numberValue(row.debit) - numberValue(row.credit),
      0
    )
  )
}

function firstVerNr(rows: BankHistoryJournalEntry[]) {
  return rows.find(row => row.ver_nr != null)?.ver_nr ?? null
}

function sourceLabel(source: string | null) {
  switch (source) {
    case 'customer_invoice':
      return 'Kundfakturabetalning'
    case 'sie_import':
      return 'Importerad bokföringshistorik'
    case 'sie_import_undo':
      return 'Ångrad SIE-import'
    case 'fixed_asset':
      return 'Inventariebetalning'
    case 'vat_v2':
      return 'Utlandsinköp'
    case 'vat_settlement':
      return 'Momsbetalning'
    case 'tax_account_movement':
      return 'Skattekonto'
    case 'manual':
    case null:
    case '':
      return 'Bokförd bankrad'
    default:
      return 'Bokförd bankrad'
  }
}

function compareBankEntries(a: BankHistoryEntry, b: BankHistoryEntry) {
  const dateResult = b.date.localeCompare(a.date)
  if (dateResult !== 0) return dateResult

  const verA = numberValue(a.verNr)
  const verB = numberValue(b.verNr)
  if (verA !== verB) return verB - verA

  return b.id.localeCompare(a.id)
}

export function buildBankAccountHistory({
  transactions,
  journalMap,
}: {
  transactions: BankHistoryTransaction[]
  journalMap: Record<string, BankHistoryJournalEntry[] | undefined>
}): BankAccountHistory {
  const neutralizedVerNrs = new Set(
    transactions
      .filter(tx => tx.is_correction === true && tx.corrects_ver_nr != null)
      .map(tx => String(tx.corrects_ver_nr))
  )

  const entries: BankHistoryEntry[] = []
  let openingBalanceAmount = 0
  let openingBalanceCount = 0

  transactions.forEach(tx => {
    const journal = journalMap[tx.id] ?? []
    const bankRows = journal.filter(row => accountNumber(row) === '1930')
    if (bankRows.length === 0) return

    const amount = bankAmount(bankRows)
    if (amount === 0) return

    const source = String(tx.source ?? '').trim() || null
    if (source === 'sie_opening_balance') {
      openingBalanceAmount = roundCurrency(openingBalanceAmount + amount)
      openingBalanceCount += 1
      return
    }

    const verNr = firstVerNr(bankRows) ?? firstVerNr(journal)
    const isStructuredCorrection = tx.is_correction === true && tx.corrects_ver_nr != null
    const isNeutralizedOriginal =
      tx.is_correction !== true &&
      verNr != null &&
      neutralizedVerNrs.has(String(verNr))
    const isUncertainCorrection = tx.is_correction === true && tx.corrects_ver_nr == null

    const kind: BankHistoryEntryKind = isStructuredCorrection
      ? 'correction'
      : isNeutralizedOriginal
      ? 'neutralized_original'
      : isUncertainCorrection
      ? 'uncertain_correction'
      : 'booked_bank_row'

    entries.push({
      id: `${tx.id}:1930`,
      transactionId: tx.id,
      date: String(tx.date ?? ''),
      description: String(tx.description ?? '').trim() || 'Bokförd bankrad',
      amount,
      verNr,
      source,
      sourceLabel: sourceLabel(source),
      kind,
      isInternalAdjustment: kind === 'correction' || kind === 'neutralized_original',
      direction: amount >= 0 ? 'in' : 'out',
    })
  })

  const sortedEntries = entries.sort(compareBankEntries)
  const defaultEntries = sortedEntries.filter(entry => !entry.isInternalAdjustment)
  const correctionEntries = sortedEntries.filter(entry => entry.isInternalAdjustment)

  return {
    entries: sortedEntries,
    defaultEntries,
    correctionEntries,
    openingBalanceAmount,
    openingBalanceCount,
  }
}
