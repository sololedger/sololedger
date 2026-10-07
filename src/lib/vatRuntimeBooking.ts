import type { PaymentAccountRole } from './paymentAccountRoles'
import { paymentAccountSemanticValidationMessage } from './accountingKnowledge.ts'
import type { VatV2BookingReadiness } from './vatPaymentSource'
import type { VatTreatment } from './vatDomain'
import type { VatV2BusinessFacts } from './vatBusinessFacts'
import type {
  VatV2TransactionPreflightResult,
} from './vatTransactionPreflight'

export type VatV2RuntimeTransactionEvent = 'purchase' | 'unsupported'

export type VatV2RuntimeBookingBlockCode =
  | 'vat_v2_assessment_inactive'
  | 'unsupported_transaction_event'
  | 'vat_treatment_not_ready'
  | 'payment_source_not_ready'
  | 'invalid_booking_fields'
  | 'unsupported_runtime_treatment'

export interface VatV2RuntimeBookingError {
  code: VatV2RuntimeBookingBlockCode
  message: string
}

export interface VatV2RuntimeBookingRequest {
  date: string
  description: string
  treatment: VatTreatment
  businessFacts: VatV2BusinessFacts
  paymentAccountNumber: string
  paymentRole: PaymentAccountRole
}

export interface VatV2RuntimeBookingIntent {
  date: string
  description: string
  treatmentCode: string
  calculationRate: number
  deductionEntitlement: string
  taxableBase: number
  outputVatAmount: number
  deductibleInputVatAmount: number
  acquisitionBaseField: string | null
  outputVatReportField: string | null
  deductibleInputVatReportField: string | null
  paymentRole: PaymentAccountRole
  ruleVersion: string
  factsVersion: string
  businessFacts: VatV2BusinessFacts
  fileUrl: string | null
}

export type VatV2RuntimeBookingIntentDraft = Omit<
  VatV2RuntimeBookingIntent,
  'fileUrl'
>

export interface VatV2RuntimeBookingIdempotencyState {
  fileSignature: string | null
  intent: VatV2RuntimeBookingIntent | null
  key: string | null
}

export interface VatV2RuntimeBookingFileLike {
  lastModified: number
  name: string
  size: number
  type: string
}

export interface VatV2RuntimeBookingStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface BuildVatV2RuntimeBookingRequestInput {
  assessmentActive: boolean
  transactionEvent: VatV2RuntimeTransactionEvent
  preflight: VatV2TransactionPreflightResult
  bookingReadiness: VatV2BookingReadiness
  date: string
  description: string
}

export type VatV2RuntimeBookingRequestResult =
  | {
      status: 'ready'
      request: VatV2RuntimeBookingRequest
      errors: []
    }
  | {
      status: 'blocked'
      request: null
      errors: VatV2RuntimeBookingError[]
    }

export type VatV2RuntimeSubmitGuardResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'blocked_duplicate' }

export type VatV2RuntimeBookingSubmissionFailureKind =
  | 'authoritative_rejection'
  | 'indeterminate'

export class VatV2RuntimeBookingSubmissionError extends Error {
  readonly kind: VatV2RuntimeBookingSubmissionFailureKind
  readonly serverMessage: string | null

  constructor(
    kind: VatV2RuntimeBookingSubmissionFailureKind,
    serverMessage: string | null = null
  ) {
    super('VAT V2 runtime booking submission failed')
    this.name = 'VatV2RuntimeBookingSubmissionError'
    this.kind = kind
    this.serverMessage = serverMessage
  }
}

export const EMPTY_VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STATE:
  VatV2RuntimeBookingIdempotencyState = {
    fileSignature: null,
    intent: null,
    key: null,
  }

export const VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STORAGE_KEY =
  'sololedger.vatV2RuntimeBooking.idempotency.v1'

export function shouldShowOrdinaryV1FieldsForVatV2Form(input: {
  assessmentActive: boolean
}) {
  return !input.assessmentActive
}

export function shouldRequireOrdinaryV1AmountForVatV2Form(input: {
  assessmentActive: boolean
}) {
  return shouldShowOrdinaryV1FieldsForVatV2Form(input)
}

function error(
  code: VatV2RuntimeBookingBlockCode,
  message: string
): VatV2RuntimeBookingError {
  return { code, message }
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function isPositiveCurrencyAmount(value: number) {
  return (
    Number.isFinite(value) &&
    value > 0 &&
    roundCurrency(value) === value
  )
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

function isValidRuntimePaymentAccount(accountNumber: string) {
  const normalized = accountNumber.trim()
  return (
    /^[12]\d{3}$/.test(normalized) &&
    paymentAccountSemanticValidationMessage(normalized) === null
  )
}

function isStructuredPostgrestError(
  error: unknown
): error is { code: string; message: string } {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

function sameIntent(
  left: VatV2RuntimeBookingIntent | null,
  right: VatV2RuntimeBookingIntent
) {
  return (
    left?.date === right.date &&
    left.description === right.description &&
    left.treatmentCode === right.treatmentCode &&
    left.calculationRate === right.calculationRate &&
    left.deductionEntitlement === right.deductionEntitlement &&
    left.taxableBase === right.taxableBase &&
    left.outputVatAmount === right.outputVatAmount &&
    left.deductibleInputVatAmount === right.deductibleInputVatAmount &&
    left.acquisitionBaseField === right.acquisitionBaseField &&
    left.outputVatReportField === right.outputVatReportField &&
    left.deductibleInputVatReportField === right.deductibleInputVatReportField &&
    left.paymentRole === right.paymentRole &&
    left.ruleVersion === right.ruleVersion &&
    left.factsVersion === right.factsVersion &&
    JSON.stringify(left.businessFacts) === JSON.stringify(right.businessFacts) &&
    left.fileUrl === right.fileUrl
  )
}

function paymentRoleFromLegacyStoredAccount(
  accountNumber: unknown
): PaymentAccountRole | null {
  if (typeof accountNumber !== 'string') return null
  const normalized = accountNumber.trim()
  if (/^1\d{3}$/.test(normalized)) return 'business_payment_account'
  if (/^2\d{3}$/.test(normalized)) return 'owner_private_payment'
  return null
}

function parseStoredIntent(value: unknown): VatV2RuntimeBookingIntent | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as VatV2RuntimeBookingIntent
  const paymentRole =
    candidate.paymentRole === 'business_payment_account' ||
    candidate.paymentRole === 'owner_private_payment'
      ? candidate.paymentRole
      : paymentRoleFromLegacyStoredAccount(
          (value as { paymentAccountNumber?: unknown }).paymentAccountNumber
        )

  if (!paymentRole) return null

  const hasStoredIntentShape =
    typeof candidate.date === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.treatmentCode === 'string' &&
    typeof candidate.calculationRate === 'number' &&
    typeof candidate.deductionEntitlement === 'string' &&
    typeof candidate.taxableBase === 'number' &&
    typeof candidate.outputVatAmount === 'number' &&
    typeof candidate.deductibleInputVatAmount === 'number' &&
    (typeof candidate.acquisitionBaseField === 'string' ||
      candidate.acquisitionBaseField === null) &&
    (typeof candidate.outputVatReportField === 'string' ||
      candidate.outputVatReportField === null) &&
    (typeof candidate.deductibleInputVatReportField === 'string' ||
      candidate.deductibleInputVatReportField === null) &&
    typeof candidate.ruleVersion === 'string' &&
    typeof candidate.factsVersion === 'string' &&
    Boolean(candidate.businessFacts) &&
    typeof candidate.businessFacts === 'object' &&
    (typeof candidate.fileUrl === 'string' || candidate.fileUrl === null)
  if (!hasStoredIntentShape) return null

  return {
    date: candidate.date,
    description: candidate.description,
    treatmentCode: candidate.treatmentCode,
    calculationRate: candidate.calculationRate,
    deductionEntitlement: candidate.deductionEntitlement,
    taxableBase: candidate.taxableBase,
    outputVatAmount: candidate.outputVatAmount,
    deductibleInputVatAmount: candidate.deductibleInputVatAmount,
    acquisitionBaseField: candidate.acquisitionBaseField,
    outputVatReportField: candidate.outputVatReportField,
    deductibleInputVatReportField: candidate.deductibleInputVatReportField,
    paymentRole,
    ruleVersion: candidate.ruleVersion,
    factsVersion: candidate.factsVersion,
    businessFacts: candidate.businessFacts,
    fileUrl: candidate.fileUrl,
  }
}

function parseStoredIdempotencyState(
  value: unknown
): VatV2RuntimeBookingIdempotencyState | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as VatV2RuntimeBookingIdempotencyState
  const intent = parseStoredIntent(candidate.intent)

  if (
    typeof candidate.key !== 'string' ||
    !intent ||
    !(
      typeof candidate.fileSignature === 'string' ||
      candidate.fileSignature === null
    )
  ) {
    return null
  }

  return {
    fileSignature: candidate.fileSignature,
    intent,
    key: candidate.key,
  }
}

function validateRuntimeTreatment(
  treatment: VatTreatment
): VatV2RuntimeBookingError[] {
  const errors: VatV2RuntimeBookingError[] = []
  const expectedVat = roundCurrency(treatment.taxableBase * 0.25)

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports EU service reverse charge.'
    ))
  }

  if (treatment.calculationRate !== 25) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports 25 percent calculation rate.'
    ))
  }

  if (
    treatment.deductibleInputVat.entitlement !== 'full' &&
    treatment.deductibleInputVat.entitlement !== 'none'
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports full or no deduction.'
    ))
  }

  if (!isPositiveCurrencyAmount(treatment.taxableBase)) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking requires a positive acquisition base.'
    ))
  }

  if (treatment.outputVat.amount !== expectedVat) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime output VAT must match the 25 percent acquisition base.'
    ))
  }

  if (
    treatment.deductibleInputVat.entitlement === 'full' &&
    treatment.deductibleInputVat.amount !== expectedVat
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime full deduction requires deductible input VAT to match calculated output VAT.'
    ))
  }

  if (
    treatment.deductibleInputVat.entitlement === 'none' &&
    treatment.deductibleInputVat.amount !== 0
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime no-deduction booking requires deductible input VAT to be zero.'
    ))
  }

  if (
    treatment.acquisitionBaseField !== '21' ||
    treatment.outputVat.reportField !== '30'
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports VAT report fields 21 and 30.'
    ))
  }

  if (
    treatment.deductibleInputVat.entitlement === 'full' &&
    treatment.deductibleInputVat.reportField !== '48'
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime full deduction requires deductible input VAT report field 48.'
    ))
  }

  if (
    treatment.deductibleInputVat.entitlement === 'none' &&
    treatment.deductibleInputVat.reportField !== null
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime no-deduction booking must not use deductible input VAT report field 48.'
    ))
  }

  return errors
}

export function buildVatV2RuntimeBookingRequest(
  input: BuildVatV2RuntimeBookingRequestInput
): VatV2RuntimeBookingRequestResult {
  const errors: VatV2RuntimeBookingError[] = []

  if (!input.assessmentActive) {
    errors.push(error(
      'vat_v2_assessment_inactive',
      'VAT V2 assessment must be active before runtime booking.'
    ))
  }

  if (input.transactionEvent !== 'purchase') {
    errors.push(error(
      'unsupported_transaction_event',
      'VAT V2 runtime booking only supports purchase transactions.'
    ))
  }

  if (input.preflight.status !== 'ready') {
    errors.push(error(
      'vat_treatment_not_ready',
      'VAT V2 treatment must be ready before runtime booking.'
    ))
  }

  if (input.bookingReadiness.status !== 'ready_to_book') {
    errors.push(error(
      'payment_source_not_ready',
      'VAT V2 payment source must be explicitly configured before booking.'
    ))
  }

  if (!isValidDateOnly(input.date)) {
    errors.push(error(
      'invalid_booking_fields',
      'VAT V2 runtime booking requires a valid date.'
    ))
  }

  if (input.description.trim() === '') {
    errors.push(error(
      'invalid_booking_fields',
      'VAT V2 runtime booking requires a description.'
    ))
  }

  if (input.preflight.status === 'ready') {
    errors.push(...validateRuntimeTreatment(input.preflight.treatment))
  }

  if (
    input.bookingReadiness.status === 'ready_to_book' &&
    !isValidRuntimePaymentAccount(input.bookingReadiness.paymentAccountNumber)
  ) {
    errors.push(error(
      'payment_source_not_ready',
      'VAT V2 payment account must be a configured BAS asset/equity account.'
    ))
  }

  if (
    errors.length > 0 ||
    input.preflight.status !== 'ready' ||
    input.bookingReadiness.status !== 'ready_to_book'
  ) {
    return {
      status: 'blocked',
      request: null,
      errors,
    }
  }

  return {
    status: 'ready',
    request: {
      date: input.date,
      description: input.description.trim(),
      treatment: input.preflight.treatment,
      businessFacts: input.preflight.businessFacts,
      paymentAccountNumber:
        input.bookingReadiness.paymentAccountNumber.trim(),
      paymentRole: input.bookingReadiness.paymentRole,
    },
    errors: [],
  }
}

export function buildVatV2RuntimeBookingIntentDraft(
  request: VatV2RuntimeBookingRequest
): VatV2RuntimeBookingIntentDraft {
  const treatment = request.treatment
  return {
    date: request.date,
    description: request.description.trim(),
    treatmentCode: treatment.code,
    calculationRate: treatment.calculationRate,
    deductionEntitlement: treatment.deductibleInputVat.entitlement,
    taxableBase: treatment.taxableBase,
    outputVatAmount: treatment.outputVat.amount,
    deductibleInputVatAmount: treatment.deductibleInputVat.amount,
    acquisitionBaseField: treatment.acquisitionBaseField ?? null,
    outputVatReportField: treatment.outputVat.reportField,
    deductibleInputVatReportField: treatment.deductibleInputVat.reportField,
    paymentRole: request.paymentRole,
    ruleVersion: treatment.ruleVersion,
    factsVersion: treatment.evidence.factsVersion,
    businessFacts: request.businessFacts,
  }
}

export function buildVatV2RuntimeBookingIntent(
  request: VatV2RuntimeBookingRequest,
  fileUrl: string | null | undefined
): VatV2RuntimeBookingIntent {
  return {
    ...buildVatV2RuntimeBookingIntentDraft(request),
    fileUrl: normalizeOptionalText(fileUrl),
  }
}

export function buildVatV2RuntimeBookingFileSignature(
  file: VatV2RuntimeBookingFileLike | null | undefined
) {
  if (!file) return null

  return JSON.stringify({
    lastModified: file.lastModified,
    name: file.name,
    size: file.size,
    type: file.type,
  })
}

export function isVatV2RuntimeBookingIntentDraftMatch(
  intent: VatV2RuntimeBookingIntent | null,
  draft: VatV2RuntimeBookingIntentDraft
) {
  if (!intent) return false

  return (
    intent.date === draft.date &&
    intent.description === draft.description &&
    intent.treatmentCode === draft.treatmentCode &&
    intent.calculationRate === draft.calculationRate &&
    intent.deductionEntitlement === draft.deductionEntitlement &&
    intent.taxableBase === draft.taxableBase &&
    intent.outputVatAmount === draft.outputVatAmount &&
    intent.deductibleInputVatAmount === draft.deductibleInputVatAmount &&
    intent.acquisitionBaseField === draft.acquisitionBaseField &&
    intent.outputVatReportField === draft.outputVatReportField &&
    intent.deductibleInputVatReportField === draft.deductibleInputVatReportField &&
    intent.paymentRole === draft.paymentRole &&
    intent.ruleVersion === draft.ruleVersion &&
    intent.factsVersion === draft.factsVersion &&
    JSON.stringify(intent.businessFacts) ===
      JSON.stringify(draft.businessFacts)
  )
}

export function reusableVatV2RuntimeBookingUploadedFileUrl(
  state: VatV2RuntimeBookingIdempotencyState,
  draft: VatV2RuntimeBookingIntentDraft,
  fileSignature: string | null
) {
  if (
    !state.intent?.fileUrl ||
    !isVatV2RuntimeBookingIntentDraftMatch(state.intent, draft)
  ) {
    return null
  }

  if (fileSignature && state.fileSignature !== fileSignature) {
    return null
  }

  return state.intent.fileUrl
}

export function prepareVatV2RuntimeBookingIdempotencyKey(
  state: VatV2RuntimeBookingIdempotencyState,
  intent: VatV2RuntimeBookingIntent,
  generateKey: () => string,
  fileSignature: string | null = null
): { state: VatV2RuntimeBookingIdempotencyState; key: string } {
  if (state.key && sameIntent(state.intent, intent)) {
    return { state, key: state.key }
  }

  const key = generateKey()
  return {
    key,
    state: {
      fileSignature,
      intent,
      key,
    },
  }
}

export function clearVatV2RuntimeBookingIdempotency():
  VatV2RuntimeBookingIdempotencyState {
  return { ...EMPTY_VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STATE }
}

export function readVatV2RuntimeBookingIdempotencyFromStorage(
  storage: VatV2RuntimeBookingStorageLike | null | undefined
): VatV2RuntimeBookingIdempotencyState {
  if (!storage) return clearVatV2RuntimeBookingIdempotency()

  try {
    const stored = storage.getItem(VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STORAGE_KEY)
    if (!stored) return clearVatV2RuntimeBookingIdempotency()
    const parsed = JSON.parse(stored) as unknown
    return (
      parseStoredIdempotencyState(parsed) ??
      clearVatV2RuntimeBookingIdempotency()
    )
  } catch {
    return clearVatV2RuntimeBookingIdempotency()
  }
}

export function writeVatV2RuntimeBookingIdempotencyToStorage(
  storage: VatV2RuntimeBookingStorageLike | null | undefined,
  state: VatV2RuntimeBookingIdempotencyState
) {
  if (!storage || !state.key || !state.intent) return

  try {
    storage.setItem(
      VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STORAGE_KEY,
      JSON.stringify(state)
    )
  } catch {
    // If sessionStorage is unavailable, server-side idempotency still protects
    // the submitted key for this in-memory attempt.
  }
}

export function clearVatV2RuntimeBookingIdempotencyStorage(
  storage: VatV2RuntimeBookingStorageLike | null | undefined
) {
  try {
    storage?.removeItem(VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STORAGE_KEY)
  } catch {
    // Clearing browser storage is best-effort; a later intent mismatch mints a key.
  }
}

export function classifyVatV2RuntimeBookingRpcError(
  error: unknown
): VatV2RuntimeBookingSubmissionFailureKind {
  return isStructuredPostgrestError(error)
    ? 'authoritative_rejection'
    : 'indeterminate'
}

export function createVatV2RuntimeBookingSubmissionError(error: unknown) {
  return new VatV2RuntimeBookingSubmissionError(
    classifyVatV2RuntimeBookingRpcError(error),
    isStructuredPostgrestError(error) ? error.message : null
  )
}

export function vatV2RuntimeBookingSubmissionFailureKind(
  error: unknown
): VatV2RuntimeBookingSubmissionFailureKind {
  if (error instanceof VatV2RuntimeBookingSubmissionError) return error.kind
  return 'indeterminate'
}

export function vatV2RuntimeBookingSubmissionErrorMessage(
  kindOrError: VatV2RuntimeBookingSubmissionFailureKind | unknown
) {
  const kind = vatV2RuntimeBookingSubmissionFailureKind(kindOrError)

  if (kind === 'authoritative_rejection') {
    return 'Utlandsinköpet kunde inte registreras. Kontrollera uppgifterna och försök igen.'
  }

  return 'SoloLedger kunde inte bekräfta om utlandsinköpet registrerades. Försök igen med samma uppgifter; då används samma försök så dubbelregistrering undviks.'
}

export function createVatV2RuntimeSubmitGuard() {
  let inFlight = false

  return {
    isInFlight() {
      return inFlight
    },

    async run<T>(
      operation: () => Promise<T>
    ): Promise<VatV2RuntimeSubmitGuardResult<T>> {
      if (inFlight) {
        return { status: 'blocked_duplicate' }
      }

      inFlight = true
      try {
        const value = await operation()
        return { status: 'completed', value }
      } finally {
        inFlight = false
      }
    },
  }
}

export function describeVatV2RuntimeBookingError(
  error: VatV2RuntimeBookingError
) {
  switch (error.code) {
    case 'unsupported_transaction_event':
      return 'Utlandsinköp är bara öppet för inköp i detta steg.'
    case 'vat_treatment_not_ready':
      return 'Momsbedömningen måste vara helt klar innan bokning.'
    case 'payment_source_not_ready':
      return 'Betalningskällan måste ha ett sparat konto innan bokning.'
    case 'invalid_booking_fields':
      return 'Datum och beskrivning måste vara ifyllda korrekt.'
    case 'unsupported_runtime_treatment':
      return 'Endast stödd EU-tjänst med 25 % svensk moms och full eller ingen avdragsrätt kan bokföras automatiskt här.'
    case 'vat_v2_assessment_inactive':
    default:
      return 'Utlandsinköpskontrollen är inte aktiv för den här transaktionen.'
  }
}
