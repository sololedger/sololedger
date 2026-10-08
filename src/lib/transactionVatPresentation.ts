export interface TransactionVatPresentationTransaction {
  source?: string | null
  vat_rate?: number | string | null
  is_correction?: boolean | null
  is_periodized_reversal?: boolean | null
}

export interface TransactionVatPresentationJournalRow {
  account_number?: string | number | null
  debit?: number | string | null
}

export interface TransactionVatPresentationInput {
  transaction: TransactionVatPresentationTransaction
  journalRows: TransactionVatPresentationJournalRow[]
  isSystemManaged: boolean
  isIncome: boolean
}

export interface TransactionVatBadge {
  label: 'Fakturamoms' | 'Registrerad moms' | 'Momsavdrag'
  value: string
}

function numberFrom(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function formatPercent(value: number) {
  return value.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' %'
}

export function formatVatDeductionAmount(value: number) {
  return (
    Math.round(value * 100) / 100
  ).toLocaleString('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }) + ' kr'
}

export function calculateBookedInputVatDeduction(
  journalRows: TransactionVatPresentationJournalRow[]
) {
  return journalRows.reduce((sum, row) => {
    const accountNumber = String(row.account_number ?? '').trim()
    if (!accountNumber.startsWith('264')) return sum
    return sum + Math.max(0, numberFrom(row.debit))
  }, 0)
}

export function transactionVatBadges({
  transaction,
  journalRows,
  isSystemManaged,
  isIncome,
}: TransactionVatPresentationInput): TransactionVatBadge[] {
  const source = transaction.source ?? 'manual'
  if (
    source !== 'manual' ||
    isSystemManaged ||
    isIncome ||
    transaction.is_correction === true ||
    transaction.is_periodized_reversal === true
  ) {
    return []
  }

  const vatRate = numberFrom(transaction.vat_rate)
  const inputVatDeduction = calculateBookedInputVatDeduction(journalRows)
  const vatRateLabel = vatRate > 0 ? 'Fakturamoms' : 'Registrerad moms'

  return [
    {
      label: vatRateLabel,
      value: formatPercent(vatRate),
    },
    {
      label: 'Momsavdrag',
      value: formatVatDeductionAmount(inputVatDeduction),
    },
  ]
}
