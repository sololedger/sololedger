export const LEGACY_VAT_INFERENCE_SOURCES = new Set([
  'manual',
  'sie_import',
  'sie_opening_balance',
  'sie_import_undo',
])

const LEGACY_REVERSE_CHARGE_VAT_ACCOUNTS = new Set([
  '2614',
  '2624',
  '2634',
  '2645',
])

export function isLegacyVatInferenceSource(source: string | null | undefined) {
  return source == null || LEGACY_VAT_INFERENCE_SOURCES.has(source)
}

export function isOutputVatAccount(accountNumber: string) {
  return (
    accountNumber.startsWith('261') ||
    accountNumber.startsWith('262') ||
    accountNumber.startsWith('263')
  )
}

export function isInputVatAccount(accountNumber: string) {
  return accountNumber.startsWith('264')
}

export function isSettlementAccount(accountNumber: string) {
  return accountNumber.startsWith('265')
}

export function isLegacyReverseChargeVatIndicator(accountNumber: string) {
  return LEGACY_REVERSE_CHARGE_VAT_ACCOUNTS.has(accountNumber)
}

export function legacyVatRateForAccount(accountNumber: string): 25 | 12 | 6 | null {
  if (accountNumber.startsWith('261')) return 25
  if (accountNumber.startsWith('262')) return 12
  if (accountNumber.startsWith('263')) return 6
  return null
}
