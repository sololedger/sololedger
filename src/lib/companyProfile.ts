export type VatNumberValidationResult =
  | { valid: true; value: string | null }
  | { valid: false; error: 'invalid_swedish_vat_number' }

const SWEDISH_VAT_NUMBER_PATTERN = /^SE\d{12}$/

export function normalizeCompanyVatNumber(value: string | null | undefined) {
  const normalized = (value ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return normalized === '' ? null : normalized
}

export function validateCompanyVatNumber(
  value: string | null | undefined
): VatNumberValidationResult {
  const normalized = normalizeCompanyVatNumber(value)

  if (normalized === null || SWEDISH_VAT_NUMBER_PATTERN.test(normalized)) {
    return { valid: true, value: normalized }
  }

  return { valid: false, error: 'invalid_swedish_vat_number' }
}
