import type { PaymentAccountRole } from './paymentAccountRoles'
import { paymentAccountSemanticValidationMessage } from './accountingKnowledge.ts'
import type { VatV2BookingReadiness } from './vatPaymentSource'
import type { VatTreatment } from './vatDomain'
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
  paymentAccountNumber: string
  paymentRole: PaymentAccountRole
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

  if (treatment.deductibleInputVat.entitlement !== 'full') {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports full deduction.'
    ))
  }

  if (!isPositiveCurrencyAmount(treatment.taxableBase)) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking requires a positive acquisition base.'
    ))
  }

  if (
    treatment.outputVat.amount !== expectedVat ||
    treatment.deductibleInputVat.amount !== expectedVat
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime VAT amounts must match the 25 percent acquisition base.'
    ))
  }

  if (
    treatment.acquisitionBaseField !== '21' ||
    treatment.outputVat.reportField !== '30' ||
    treatment.deductibleInputVat.reportField !== '48'
  ) {
    errors.push(error(
      'unsupported_runtime_treatment',
      'VAT V2 runtime booking only supports VAT report fields 21, 30, and 48.'
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
      paymentAccountNumber:
        input.bookingReadiness.paymentAccountNumber.trim(),
      paymentRole: input.bookingReadiness.paymentRole,
    },
    errors: [],
  }
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
      return 'VAT V2-bokning är bara öppen för inköp i detta steg.'
    case 'vat_treatment_not_ready':
      return 'Momsbedömningen måste vara helt klar innan bokning.'
    case 'payment_source_not_ready':
      return 'Betalningskällan måste ha ett sparat konto innan bokning.'
    case 'invalid_booking_fields':
      return 'Datum och beskrivning måste vara ifyllda korrekt.'
    case 'unsupported_runtime_treatment':
      return 'Endast EU-tjänst med 25 % omvänd moms och full avdragsrätt kan bokföras här.'
    case 'vat_v2_assessment_inactive':
    default:
      return 'VAT V2-bokning är inte aktiv för den här transaktionen.'
  }
}
