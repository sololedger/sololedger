import {
  buildVatV2BookingReadiness,
  getVatV2PaymentSourceRole,
  resolveVatV2PaymentSourceConfiguration,
} from '../src/lib/vatPaymentSource.ts'
import type { ConfiguredPaymentAccountRole } from '../src/lib/paymentAccountRoles.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const emptyConfiguration: ConfiguredPaymentAccountRole[] = []

assert(
  getVatV2PaymentSourceRole('business_account') === 'business_payment_account',
  'Business payment source maps to the generic business payment role'
)

assert(
  getVatV2PaymentSourceRole('owner_private') === 'owner_private_payment',
  'Owner-private payment source maps to the generic owner-private role'
)

const unconfiguredBusiness = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  emptyConfiguration
)

assert(
  unconfiguredBusiness.status === 'unconfigured',
  'Missing business payment mapping remains unconfigured'
)

assert(
  unconfiguredBusiness.recommendation.accountNumber === '1930',
  'Business payment recommendation is exposed separately from configuration'
)

assert(
  !('accountNumber' in unconfiguredBusiness),
  'System recommendation does not become a configured account number'
)

const recommendationOnlyBusinessReady = buildVatV2BookingReadiness({
  treatmentReady: true,
  roleConfigurationState: 'loaded',
  paymentSource: unconfiguredBusiness,
})

assert(
  recommendationOnlyBusinessReady.status === 'not_ready_to_book',
  'Recommendation-only business payment source is not ready-to-book'
)

const unconfiguredPrivate = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  emptyConfiguration
)

assert(
  unconfiguredPrivate.status === 'unconfigured',
  'Missing owner-private mapping remains unconfigured'
)

assert(
  unconfiguredPrivate.recommendation.accountNumber === '2018',
  'Owner-private payment recommendation is available as a suggestion only'
)

const configured: ConfiguredPaymentAccountRole[] = [
  { role: 'business_payment_account', accountNumber: '1940' },
  { role: 'owner_private_payment', accountNumber: '2017' },
]

const configuredBusiness = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  configured
)

assert(
  configuredBusiness.status === 'configured',
  'Explicit business payment configuration is authoritative'
)

assert(
  configuredBusiness.status === 'configured' &&
    configuredBusiness.accountNumber === '1940',
  'Business payment does not require the 1930 system recommendation'
)

const configuredPrivate = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  configured
)

assert(
  configuredPrivate.status === 'configured',
  'Explicit owner-private configuration is authoritative'
)

assert(
  configuredPrivate.status === 'configured' &&
    configuredPrivate.accountNumber === '2017',
  'Owner-private payment does not require the 2018 system recommendation'
)

const invalidConfiguredBusiness = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  [{ role: 'business_payment_account', accountNumber: 'bank' }]
)

assert(
  invalidConfiguredBusiness.status === 'invalid_configuration',
  'Invalid configured account numbers fail closed'
)

assert(
  resolveVatV2PaymentSourceConfiguration(
    'business_account',
    [{ role: 'business_payment_account', accountNumber: '2018' }]
  ).status === 'invalid_configuration',
  'Stored business payment role with owner-equity account fails closed'
)

assert(
  resolveVatV2PaymentSourceConfiguration(
    'owner_private',
    [{ role: 'owner_private_payment', accountNumber: '1930' }]
  ).status === 'invalid_configuration',
  'Stored owner-private payment role with business asset account fails closed'
)

assert(
  resolveVatV2PaymentSourceConfiguration('owner_private', [
    { role: 'business_payment_account', accountNumber: '1930' },
  ]).status === 'unconfigured',
  'Configured business account does not satisfy owner-private payment'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'loaded',
    paymentSource: unconfiguredBusiness,
  }).status === 'not_ready_to_book',
  'READY VAT treatment is not ready-to-book without configured payment source'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: false,
    roleConfigurationState: 'loaded',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Configured payment source cannot make blocked VAT treatment ready-to-book'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'loading',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Loading payment configuration is not ready-to-book'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'error',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Failed payment configuration load is not ready-to-book'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'inactive',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Inactive VAT V2 payment-source flow is not ready-to-book'
)

const readyToBook = buildVatV2BookingReadiness({
  treatmentReady: true,
  roleConfigurationState: 'loaded',
  paymentSource: configuredPrivate,
})

assert(
  readyToBook.status === 'ready_to_book',
  'VAT V2 is ready-to-book only when treatment and payment source are both ready'
)

assert(
  readyToBook.status === 'ready_to_book' &&
    readyToBook.paymentAccountNumber === '2017',
  'Ready-to-book uses explicit company configuration, not the recommendation'
)

const savedSuggestionConfiguration: ConfiguredPaymentAccountRole[] = [
  {
    role: unconfiguredBusiness.role,
    accountNumber: unconfiguredBusiness.recommendation.accountNumber,
  },
]

assert(
  resolveVatV2PaymentSourceConfiguration(
    'business_account',
    savedSuggestionConfiguration
  ).status === 'configured',
  'Explicit save establishes configuration for the confirmed role'
)

const failedSaveConfiguration: ConfiguredPaymentAccountRole[] = []

assert(
  resolveVatV2PaymentSourceConfiguration(
    'business_account',
    failedSaveConfiguration
  ).status === 'unconfigured',
  'Failed save does not establish configuration'
)

assert(
  emptyConfiguration.length === 0,
  'No automatic persistence occurs while only displaying recommendations'
)

console.log('VAT V2 payment-source tests passed.')
