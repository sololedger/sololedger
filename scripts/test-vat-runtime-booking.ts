import {
  VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STORAGE_KEY,
  buildVatV2RuntimeBookingFileSignature,
  buildVatV2RuntimeBookingIntent,
  buildVatV2RuntimeBookingIntentDraft,
  buildVatV2RuntimeBookingRequest,
  classifyVatV2RuntimeBookingRpcError,
  clearVatV2RuntimeBookingIdempotency,
  clearVatV2RuntimeBookingIdempotencyStorage,
  createVatV2RuntimeSubmitGuard,
  isVatV2RuntimeBookingIntentDraftMatch,
  prepareVatV2RuntimeBookingIdempotencyKey,
  readVatV2RuntimeBookingIdempotencyFromStorage,
  reusableVatV2RuntimeBookingUploadedFileUrl,
  shouldRequireOrdinaryV1AmountForVatV2Form,
  shouldShowOrdinaryV1FieldsForVatV2Form,
  vatV2RuntimeBookingSubmissionFailureKind,
  writeVatV2RuntimeBookingIdempotencyToStorage,
} from '../src/lib/vatRuntimeBooking.ts'
import {
  buildVatV2TransactionPreflight,
} from '../src/lib/vatTransactionPreflight.ts'
import {
  buildVatV2BookingReadiness,
  resolveVatV2PaymentSourceConfiguration,
} from '../src/lib/vatPaymentSource.ts'
import type {
  CompanyVatProfile,
  VatTreatment,
} from '../src/lib/vatDomain.ts'
import type {
  ConfiguredPaymentAccountRole,
} from '../src/lib/paymentAccountRoles.ts'
import type {
  VatV2RuntimeBookingStorageLike,
} from '../src/lib/vatRuntimeBooking.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`)
  }
}

function createMemoryStorage(): VatV2RuntimeBookingStorageLike {
  const values = new Map<string, string>()

  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
  }
}

function createDeterministicUuidGenerator(prefix: string) {
  let counter = 0
  return () => {
    counter += 1
    return `${prefix}-${counter}`
  }
}

const companyProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'taxable',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'required',
  vatPeriodType: 'month',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'full',
}

const configuredRoles: ConfiguredPaymentAccountRole[] = [
  { role: 'business_payment_account', accountNumber: '1940' },
  { role: 'owner_private_payment', accountNumber: '2017' },
]

assert(
  !shouldShowOrdinaryV1FieldsForVatV2Form({ assessmentActive: true }) &&
    !shouldRequireOrdinaryV1AmountForVatV2Form({ assessmentActive: true }),
  'VAT V2 booking must not be blocked by ordinary V1 form fields or amount validation'
)

assert(
  shouldShowOrdinaryV1FieldsForVatV2Form({ assessmentActive: false }) &&
    shouldRequireOrdinaryV1AmountForVatV2Form({ assessmentActive: false }),
  'VAT V2 off must preserve ordinary V1 form fields and amount validation'
)

const readyPreflight = buildVatV2TransactionPreflight({
  companyProfile,
  transaction: {
    enabled: true,
    supplierCountry: 'IE',
    goodsOrService: 'service',
    supplierVatCharged: 'no',
    calculationRate: 25,
    acquisitionBaseAmount: '1000',
  },
  date: '2026-09-27',
  description: 'Adobe Ireland',
  accountingCategoryId: 'programvara',
  ordinaryAmount: '999999',
})

assert(
  readyPreflight.status === 'ready',
  'Narrow EU service reverse-charge preflight should be ready'
)

assert(
  readyPreflight.status === 'ready' &&
    readyPreflight.treatment.taxableBase === 1000,
  'Runtime path must use explicit acquisition base, not ordinary form amount'
)

const configuredPaymentSource = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  configuredRoles
)

const readyPayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: configuredPaymentSource,
})

assert(
  readyPayment.status === 'ready_to_book',
  'Configured payment source should make ready treatment bookable'
)

const readyRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  readyRuntime.status === 'ready',
  'Runtime request should be ready only when treatment and payment source are ready'
)

assert(readyRuntime.status === 'ready', 'Ready runtime request is required below')
const readyRuntimeRequest = readyRuntime.request

assert(
  readyRuntime.status === 'ready' &&
    readyRuntime.request.paymentAccountNumber === '2017',
  'Runtime booking uses explicit company payment-role configuration'
)

assert(
  readyRuntime.status === 'ready' &&
    readyRuntime.request.treatment.taxableBase === 1000,
  'Runtime booking carries the explicit VAT V2 acquisition base'
)

assert(
  readyRuntime.status === 'ready' &&
    !('user_id' in readyRuntime.request) &&
    !('amount' in readyRuntime.request) &&
    !('type' in readyRuntime.request) &&
    !('vat_rate' in readyRuntime.request) &&
    !('journalRows' in readyRuntime.request) &&
    !('journal_rows' in readyRuntime.request) &&
    !('auditSnapshot' in readyRuntime.request) &&
    !('audit_snapshot' in readyRuntime.request),
  'Runtime request must not carry user id, journal rows, or audit snapshot'
)

const firstIntent = buildVatV2RuntimeBookingIntent(
  readyRuntimeRequest,
  'attachments/vat-v2-receipt.pdf'
)
const firstFileSignature = buildVatV2RuntimeBookingFileSignature({
  lastModified: 1790486400000,
  name: 'receipt.pdf',
  size: 12345,
  type: 'application/pdf',
})
const nextIdempotencyKey = createDeterministicUuidGenerator('vat-v2-key')
const firstPreparedIdempotency = prepareVatV2RuntimeBookingIdempotencyKey(
  clearVatV2RuntimeBookingIdempotency(),
  firstIntent,
  nextIdempotencyKey,
  firstFileSignature
)
const repeatedPreparedIdempotency = prepareVatV2RuntimeBookingIdempotencyKey(
  firstPreparedIdempotency.state,
  firstIntent,
  nextIdempotencyKey
)

assertEqual(
  repeatedPreparedIdempotency.key,
  firstPreparedIdempotency.key,
  'Unchanged VAT V2 runtime booking intent must reuse the same key'
)

const idempotencyStorage = createMemoryStorage()
writeVatV2RuntimeBookingIdempotencyToStorage(
  idempotencyStorage,
  firstPreparedIdempotency.state
)
const restoredIdempotency =
  readVatV2RuntimeBookingIdempotencyFromStorage(idempotencyStorage)
const restoredPreparedIdempotency = prepareVatV2RuntimeBookingIdempotencyKey(
  restoredIdempotency,
  firstIntent,
  nextIdempotencyKey
)

assertEqual(
  restoredPreparedIdempotency.key,
  firstPreparedIdempotency.key,
  'Same-session restored VAT V2 runtime booking intent must reuse the stored key'
)

assertEqual(
  readVatV2RuntimeBookingIdempotencyFromStorage(idempotencyStorage).key,
  firstPreparedIdempotency.key,
  'Indeterminate VAT V2 runtime booking failure must leave the stored key available for retry'
)

clearVatV2RuntimeBookingIdempotencyStorage(idempotencyStorage)
assertEqual(
  readVatV2RuntimeBookingIdempotencyFromStorage(idempotencyStorage).key,
  null,
  'Successful or replayed VAT V2 runtime booking must clear the stored key'
)

const changedDescriptionIntent = buildVatV2RuntimeBookingIntent(
  {
    ...readyRuntimeRequest,
    description: 'Adobe Ireland changed',
  },
  firstIntent.fileUrl
)
const changedDescriptionPrepared = prepareVatV2RuntimeBookingIdempotencyKey(
  firstPreparedIdempotency.state,
  changedDescriptionIntent,
  nextIdempotencyKey
)

assert(
  changedDescriptionPrepared.key !== firstPreparedIdempotency.key,
  'Material VAT V2 runtime booking intent changes must mint a new key'
)

const changedFileIntent = buildVatV2RuntimeBookingIntent(
  readyRuntimeRequest,
  'attachments/vat-v2-different-receipt.pdf'
)
const changedFilePrepared = prepareVatV2RuntimeBookingIdempotencyKey(
  firstPreparedIdempotency.state,
  changedFileIntent,
  nextIdempotencyKey
)

assert(
  changedFilePrepared.key !== firstPreparedIdempotency.key,
  'Changed VAT V2 runtime booking file URL must mint a new key'
)

const restoredUploadDraft = buildVatV2RuntimeBookingIntentDraft(readyRuntimeRequest)
assert(
  isVatV2RuntimeBookingIntentDraftMatch(
    restoredIdempotency.intent,
    restoredUploadDraft
  ),
  'Stored VAT V2 runtime booking upload may be reused when non-file intent matches'
)

assertEqual(
  reusableVatV2RuntimeBookingUploadedFileUrl(
    restoredIdempotency,
    restoredUploadDraft,
    firstFileSignature
  ),
  firstIntent.fileUrl,
  'Same selected file may reuse the stored VAT V2 runtime booking upload'
)

assertEqual(
  reusableVatV2RuntimeBookingUploadedFileUrl(
    restoredIdempotency,
    restoredUploadDraft,
    null
  ),
  firstIntent.fileUrl,
  'Reloaded VAT V2 runtime booking without a selected file may reuse the stored upload'
)

assertEqual(
  reusableVatV2RuntimeBookingUploadedFileUrl(
    restoredIdempotency,
    restoredUploadDraft,
    buildVatV2RuntimeBookingFileSignature({
      lastModified: 1790572800000,
      name: 'different-receipt.pdf',
      size: 54321,
      type: 'application/pdf',
    })
  ),
  null,
  'Different selected file must not reuse a stale VAT V2 runtime booking upload'
)

assert(
  !isVatV2RuntimeBookingIntentDraftMatch(
    restoredIdempotency.intent,
    buildVatV2RuntimeBookingIntentDraft({
      ...readyRuntimeRequest,
      description: 'Different supplier',
    })
  ),
  'Stored VAT V2 runtime booking upload must not contaminate a different intent'
)

const malformedStorage = createMemoryStorage()
malformedStorage.setItem(
  VAT_V2_RUNTIME_BOOKING_IDEMPOTENCY_STORAGE_KEY,
  '{"key":null,"intent":"bad"}'
)
assertEqual(
  readVatV2RuntimeBookingIdempotencyFromStorage(malformedStorage).key,
  null,
  'Malformed VAT V2 runtime booking idempotency storage must fail closed'
)

assertEqual(
  classifyVatV2RuntimeBookingRpcError({
    code: '23505',
    message: 'idempotency conflict',
  }),
  'authoritative_rejection',
  'Structured VAT V2 runtime booking RPC errors are authoritative rejections'
)

assertEqual(
  classifyVatV2RuntimeBookingRpcError(new TypeError('fetch failed')),
  'indeterminate',
  'Thrown network failures are indeterminate VAT V2 runtime booking failures'
)

assertEqual(
  vatV2RuntimeBookingSubmissionFailureKind(new Error('plain failure')),
  'indeterminate',
  'Plain VAT V2 runtime booking errors default to indeterminate'
)

const inactiveRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: false,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  inactiveRuntime.status === 'blocked' &&
    inactiveRuntime.errors.some(
      error => error.code === 'vat_v2_assessment_inactive'
    ),
  'Runtime booking is blocked when VAT V2 assessment is inactive'
)

const saleRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'unsupported',
  preflight: readyPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  saleRuntime.status === 'blocked' &&
    saleRuntime.errors.some(
      error => error.code === 'unsupported_transaction_event'
    ),
  'Runtime booking is blocked for non-purchase transaction events'
)

const unconfiguredPaymentSource = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  []
)
const blockedPayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: unconfiguredPaymentSource,
})
const recommendationOnlyRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: blockedPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  recommendationOnlyRuntime.status === 'blocked' &&
    recommendationOnlyRuntime.errors.some(
      error => error.code === 'payment_source_not_ready'
    ),
  'System recommendation alone cannot make runtime booking ready'
)

const wrongRolePaymentSource = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  [{ role: 'business_payment_account', accountNumber: '1940' }]
)
const wrongRolePayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: wrongRolePaymentSource,
})
const wrongRoleRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: wrongRolePayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  wrongRoleRuntime.status === 'blocked' &&
    wrongRoleRuntime.errors.some(
      error => error.code === 'payment_source_not_ready'
    ),
  'Configured account for the wrong payment role cannot make runtime booking ready'
)

const invalidPaymentSource = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  [{ role: 'business_payment_account', accountNumber: 'bank' }]
)
const invalidPayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: invalidPaymentSource,
})
const invalidPaymentRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: invalidPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  invalidPaymentRuntime.status === 'blocked' &&
    invalidPaymentRuntime.errors.some(
      error => error.code === 'payment_source_not_ready'
    ),
  'Invalid configured account cannot make runtime booking ready'
)

for (const accountNumber of ['2012', '2614', '2645', '2650'] as const) {
  const semanticInvalidSource = resolveVatV2PaymentSourceConfiguration(
    'owner_private',
    [{ role: 'owner_private_payment', accountNumber }]
  )
  const semanticInvalidPayment = buildVatV2BookingReadiness({
    treatmentReady: readyPreflight.status === 'ready',
    roleConfigurationState: 'loaded',
    paymentSource: semanticInvalidSource,
  })
  const semanticInvalidRuntime = buildVatV2RuntimeBookingRequest({
    assessmentActive: true,
    transactionEvent: 'purchase',
    preflight: readyPreflight,
    bookingReadiness: semanticInvalidPayment,
    date: '2026-09-27',
    description: `Adobe Ireland ${accountNumber}`,
  })

  assert(
    semanticInvalidRuntime.status === 'blocked' &&
      semanticInvalidRuntime.errors.some(
        error => error.code === 'payment_source_not_ready'
      ),
    `Semantic non-payment account ${accountNumber} cannot make runtime booking ready`
  )
}

const unsupportedDeductionTreatment: VatTreatment = {
  ...readyPreflight.treatment,
  deductibleInputVat: {
    ...readyPreflight.treatment.deductibleInputVat,
    amount: 0,
    reportField: null,
    entitlement: 'none',
  },
}

const unsupportedDeductionPreflight = {
  ...readyPreflight,
  treatment: unsupportedDeductionTreatment,
} as typeof readyPreflight

const unsupportedDeductionRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: unsupportedDeductionPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  unsupportedDeductionRuntime.status === 'blocked' &&
    unsupportedDeductionRuntime.errors.some(
      error => error.code === 'unsupported_runtime_treatment'
    ),
  'Runtime booking blocks non-full deduction even if a caller supplies a treatment object'
)

const unsupportedTreatment: VatTreatment = {
  ...readyPreflight.treatment,
  calculationRate: 12,
  outputVat: {
    ...readyPreflight.treatment.outputVat,
    amount: 120,
    reportField: '31',
  },
}

const unsupportedPreflight = {
  ...readyPreflight,
  treatment: unsupportedTreatment,
} as typeof readyPreflight

const unsupportedRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: unsupportedPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  unsupportedRuntime.status === 'blocked' &&
    unsupportedRuntime.errors.some(
      error => error.code === 'unsupported_runtime_treatment'
    ),
  'Runtime booking rechecks the narrow supported treatment semantics'
)

async function testSubmitGuard() {
  const guard = createVatV2RuntimeSubmitGuard()
  let bookingCalls = 0
  let releaseFirstBooking: (() => void) | null = null
  const firstBooking = guard.run(async () => {
    bookingCalls += 1
    await new Promise<void>(resolve => {
      releaseFirstBooking = resolve
    })
    return 'booked'
  })
  const duplicateBooking = guard.run(async () => {
    bookingCalls += 1
    return 'duplicate-booked'
  })

  assert(
    guard.isInFlight(),
    'Submit guard exposes in-flight state while the first booking is pending'
  )

  const duplicateResult = await duplicateBooking
  assert(
    duplicateResult.status === 'blocked_duplicate',
    'Submit guard blocks a parallel duplicate booking call'
  )

  assert(
    bookingCalls === 1,
    'Duplicate submit guard must not call the booking operation twice'
  )

  assert(
    releaseFirstBooking !== null,
    'First booking must have a release callback'
  )
  const releaseBooking = releaseFirstBooking as () => void
  releaseBooking()

  const firstResult = await firstBooking
  assert(
    firstResult.status === 'completed' &&
      firstResult.value === 'booked' &&
      !guard.isInFlight(),
    'Submit guard releases after the first booking settles'
  )
}

testSubmitGuard()
  .then(() => {
    console.log('VAT V2 runtime booking tests passed.')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
