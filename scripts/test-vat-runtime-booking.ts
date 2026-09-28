import {
  buildVatV2RuntimeBookingRequest,
  createVatV2RuntimeSubmitGuard,
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
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
