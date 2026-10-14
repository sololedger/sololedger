const invalidAmountMessage = 'Ange ett giltigt belopp större än 0 kr, i hela ören.'
const maxAmountInCents = BigInt('999999999999999') // PostgreSQL numeric(15, 2).

/** Expand decimal/exponent notation using digits only, before any Number conversion. */
function decimalCents(value: string): bigint | null {
  const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value)
  if (!match) return null
  const fraction = match[2] ?? match[3] ?? ''
  const digits = ((match[1] ?? '0') + fraction).replace(/^0+/, '')
  if (!digits) return BigInt(0)

  const shift = BigInt(match[4] ?? '0') - BigInt(fraction.length) + BigInt(2)
  const length = BigInt(digits.length) + shift
  if (length > BigInt(15)) throw new Error('Beloppet är för stort.')
  if (length <= BigInt(0)) return null

  // Valid results have at most 15 digits. Never allocate zeroes for huge exponents.
  if (shift < BigInt(0)) {
    const kept = Number(length)
    if (/[1-9]/.test(digits.slice(kept))) return null
    return BigInt(digits.slice(0, kept))
  }
  return BigInt(digits + '0'.repeat(Number(shift)))
}

/** Validate the raw decimal contract; never round, change sign or lose precision. */
export function parseStandardBookingAmount(value: string | number): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(invalidAmountMessage)
  }
  const text = typeof value === 'string' ? value.trim() : String(value)
  const cents = decimalCents(text)
  if (cents === null || cents <= BigInt(0)) throw new Error(invalidAmountMessage)
  if (cents > maxAmountInCents) throw new Error('Beloppet är för stort.')

  const amount = Number(text)
  if (!Number.isFinite(amount) || decimalCents(String(amount)) !== cents) {
    throw new Error(invalidAmountMessage)
  }
  return amount
}

export function standardBookingAmountError(value: string | number): string | null {
  try {
    parseStandardBookingAmount(value)
    return null
  } catch (error) {
    return error instanceof Error ? error.message : invalidAmountMessage
  }
}
