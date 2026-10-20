/** Durable ordinary/periodized submission. Never replace an unresolved attempt. */
export interface StandardBookingPayload {
  idempotency_key: string
  date: string
  description: string
  amount: number
  type: string
  vat_rate: number
  input_vat_deduction_entitlement: 'profile_default' | 'full' | 'none'
  file_url: string | null
  future_date?: string
  ne_sales_basis?: 'small_business_exempt' | null
  ne_sales_basis_confirmed?: boolean
}

export interface StandardBookingAttempt {
  version: 1
  userId: string
  kind: 'ordinary' | 'periodized'
  payload: StandardBookingPayload
}

export interface BookingStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
export const bookingStorageKey = (userId: string) => `sololedger.standardBooking.v1.${userId}`

export function readStandardBookingAttempt(storage: BookingStorage, userId: string): StandardBookingAttempt | null {
  const raw = storage.getItem(bookingStorageKey(userId))
  if (raw === null) return null
  // Corrupt/foreign data must block booking, not silently generate another key.
  let a: StandardBookingAttempt
  try { a = JSON.parse(raw) as StandardBookingAttempt }
  catch { throw new Error('Det sparade bokningsförsöket kunde inte läsas säkert. Kontakta support innan du bokför igen.') }
  const p = a?.payload
  if (a?.version !== 1 || a.userId !== userId || !p || !uuid.test(p.idempotency_key) ||
      !['ordinary', 'periodized'].includes(a.kind) ||
      typeof p.date !== 'string' || typeof p.description !== 'string' ||
      typeof p.amount !== 'number' || !Number.isFinite(p.amount) ||
      typeof p.type !== 'string' || typeof p.vat_rate !== 'number' ||
      !['profile_default', 'full', 'none'].includes(p.input_vat_deduction_entitlement) ||
      !(p.file_url === null || (typeof p.file_url === 'string' && p.file_url.startsWith(`${userId}/`))) ||
      (a.kind === 'periodized' && typeof p.future_date !== 'string')) {
    throw new Error('Det sparade bokningsförsöket kunde inte läsas säkert. Kontakta support innan du bokför igen.')
  }
  return a
}

export function saveStandardBookingAttempt(storage: BookingStorage, attempt: StandardBookingAttempt) {
  if (readStandardBookingAttempt(storage, attempt.userId)) throw new Error('Återuppta det sparade bokningsförsöket först.')
  const raw = JSON.stringify(attempt)
  storage.setItem(bookingStorageKey(attempt.userId), raw)
  if (storage.getItem(bookingStorageKey(attempt.userId)) !== raw) throw new Error('Bokningsunderlaget kunde inte sparas. Ingen bokning skickades.')
}

export function clearStandardBookingAttempt(storage: BookingStorage, attempt: StandardBookingAttempt) {
  const saved = readStandardBookingAttempt(storage, attempt.userId)
  if (saved && JSON.stringify(saved) !== JSON.stringify(attempt)) throw new Error('Ett annat bokningsförsök väntar. Ladda om sidan.')
  storage.removeItem(bookingStorageKey(attempt.userId))
  if (storage.getItem(bookingStorageKey(attempt.userId)) !== null) throw new Error('Bokningskvittot kunde inte avslutas lokalt. Återuppta försöket efter omladdning.')
}

export class StandardBookingSubmissionError extends Error {
  readonly confirmedRejection: boolean
  constructor(confirmedRejection: boolean, message?: string) {
    super(confirmedRejection
      ? `Bokningen avvisades och inget bokfördes i försöket. ${message ?? 'Kontrollera uppgifterna och försök igen.'}`
      : 'SoloLedger kunde inte bekräfta bokningsresultatet. Återuppta det sparade försöket; samma bokning skapas bara en gång.')
    this.name = 'StandardBookingSubmissionError'
    this.confirmedRejection = confirmedRejection
  }
}

export interface StandardBookingReceipt {
  success: true
  transaction_id: string
  ver_nr: number
  idempotent_replay: boolean
  reversal_transaction_id?: string
  reversal_ver_nr?: number
  periodization_group_id?: string
}

export function parseStandardBookingReceipt(value: unknown, kind: StandardBookingAttempt['kind']): StandardBookingReceipt {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (v.success === false && v.confirmed_rejection === true && typeof v.error_code === 'string') {
      throw new StandardBookingSubmissionError(true, typeof v.message === 'string' ? v.message : undefined)
    }
    if (v.success === true && typeof v.transaction_id === 'string' && uuid.test(v.transaction_id) &&
        Number.isInteger(v.ver_nr) && Number(v.ver_nr) > 0 && typeof v.idempotent_replay === 'boolean' &&
        (kind === 'ordinary' || (typeof v.reversal_transaction_id === 'string' && uuid.test(v.reversal_transaction_id) &&
          Number.isInteger(v.reversal_ver_nr) && Number(v.reversal_ver_nr) > 0 && typeof v.periodization_group_id === 'string' && uuid.test(v.periodization_group_id)))) {
      return v as unknown as StandardBookingReceipt
    }
  }
  throw new StandardBookingSubmissionError(false)
}

/** Early errors (including structured gateway/SQL errors) do not prove an earlier call failed. */
export async function submitStandardBookingAttempt(
  attempt: StandardBookingAttempt,
  rpc: (name: string, args: { p_payload: StandardBookingPayload }) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<StandardBookingReceipt> {
  let response
  try {
    response = await rpc(attempt.kind === 'ordinary' ? 'book_transaction_atomic' : 'book_periodized_transaction_atomic', { p_payload: attempt.payload })
  } catch {
    throw new StandardBookingSubmissionError(false)
  }
  if (response.error) throw new StandardBookingSubmissionError(false)
  return parseStandardBookingReceipt(response.data, attempt.kind)
}
