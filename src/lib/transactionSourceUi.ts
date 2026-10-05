export interface TransactionSourceLike {
  source?: string | null
}

export interface TransactionSourceUiPolicy {
  source: string | null
  systemManaged: boolean
  genericEditOffered: boolean
  genericCorrectionOffered: boolean
  label: string | null
  kind:
    | 'ordinary'
    | 'sie_import'
    | 'sie_opening_balance'
    | 'vat_closing'
    | 'vat_v2'
    | 'vat_settlement'
    | 'tax_account_movement'
    | 'customer_invoice'
}

const SYSTEM_SOURCE_POLICIES: Record<string, TransactionSourceUiPolicy> = {
  sie_import: {
    source: 'sie_import',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Importerade verifikationer',
    kind: 'sie_import',
  },
  sie_opening_balance: {
    source: 'sie_opening_balance',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Ingående balanser',
    kind: 'sie_opening_balance',
  },
  vat_closing: {
    source: 'vat_closing',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Momsavslut',
    kind: 'vat_closing',
  },
  vat_v2: {
    source: 'vat_v2',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'VAT V2-bokningar',
    kind: 'vat_v2',
  },
  vat_settlement: {
    source: 'vat_settlement',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Momsavräkning',
    kind: 'vat_settlement',
  },
  tax_account_movement: {
    source: 'tax_account_movement',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Skattekontorörelse',
    kind: 'tax_account_movement',
  },
  customer_invoice: {
    source: 'customer_invoice',
    systemManaged: true,
    genericEditOffered: false,
    genericCorrectionOffered: false,
    label: 'Kundfaktura',
    kind: 'customer_invoice',
  },
}

const ORDINARY_TRANSACTION_POLICY: TransactionSourceUiPolicy = {
  source: null,
  systemManaged: false,
  genericEditOffered: true,
  genericCorrectionOffered: true,
  label: null,
  kind: 'ordinary',
}

function sourceFrom(input: string | null | undefined | TransactionSourceLike) {
  if (typeof input === 'string' || input == null) return input ?? null
  return input.source ?? null
}

export function getTransactionSourceUiPolicy(
  input: string | null | undefined | TransactionSourceLike
): TransactionSourceUiPolicy {
  const source = sourceFrom(input)
  return (source && SYSTEM_SOURCE_POLICIES[source]) || ORDINARY_TRANSACTION_POLICY
}

export function isTransactionSystemManagedInUi(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).systemManaged
}

export function shouldOfferGenericTransactionEdit(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).genericEditOffered
}

export function shouldOfferGenericTransactionCorrection(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).genericCorrectionOffered
}

export function transactionSourceUiLabel(
  input: string | null | undefined | TransactionSourceLike
) {
  return getTransactionSourceUiPolicy(input).label
}
