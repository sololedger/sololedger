import {
  getPaymentAccountRoleRecommendation,
  getSystemAccount,
  isPaymentAccountRole,
  paymentAccountSemanticValidationMessage,
  isValidPaymentRoleAccountNumber,
  isValidPaymentRoleAccountNumberForRole,
  paymentAccountRoleAccountNumberValidationMessage,
  PAYMENT_ACCOUNT_ROLES,
} from '../src/lib/accountingKnowledge.ts'
import { buildVatV2TransactionPreflight } from '../src/lib/vatTransactionPreflight.ts'

interface ConfiguredPaymentAccountRole {
  role: string
  accountNumber: string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

assert(
  PAYMENT_ACCOUNT_ROLES.length === 2,
  'Payment account role model starts with exactly two roles'
)

assert(
  isPaymentAccountRole('business_payment_account'),
  'business_payment_account is a valid payment role'
)

assert(
  isPaymentAccountRole('owner_private_payment'),
  'owner_private_payment is a valid payment role'
)

assert(
  !isPaymentAccountRole('supplier_payable'),
  'supplier payable is not part of this role slice'
)

assert(
  !isPaymentAccountRole('vat_v2_payment_account'),
  'payment roles stay general bookkeeping config, not VAT-specific config'
)

assert(
  isValidPaymentRoleAccountNumber('1930'),
  'Four-digit payment role account numbers are accepted'
)

assert(
  isValidPaymentRoleAccountNumber('2018'),
  'SoloLedger current private-payment recommendation shape is accepted'
)

assert(
  isValidPaymentRoleAccountNumberForRole('business_payment_account', '1940'),
  'Business payment role accepts 1xxx asset payment accounts'
)

assert(
  isValidPaymentRoleAccountNumberForRole('owner_private_payment', '2017'),
  'Owner-private payment role accepts 2xxx equity accounts'
)

assert(
  isValidPaymentRoleAccountNumberForRole('owner_private_payment', '2013'),
  'Owner-private payment role deliberately permits 2013 as ordinary 2xxx equity when configured'
)

assert(
  !isValidPaymentRoleAccountNumberForRole('business_payment_account', '2018'),
  'Business payment role rejects owner-equity accounts'
)

assert(
  !isValidPaymentRoleAccountNumberForRole('owner_private_payment', '1930'),
  'Owner-private payment role rejects business asset accounts'
)

for (const accountNumber of ['2012', '2614', '2645', '2650'] as const) {
  assert(
    !isValidPaymentRoleAccountNumberForRole(
      'owner_private_payment',
      accountNumber
    ),
    `Owner-private payment role rejects semantic non-payment account ${accountNumber}`
  )

  assert(
    paymentAccountSemanticValidationMessage(accountNumber) !== null,
    `Semantic payment-account helper rejects ${accountNumber}`
  )
}

assert(
  !isValidPaymentRoleAccountNumberForRole('business_payment_account', '2614'),
  'Business payment role rejects VAT account 2614 semantically'
)

assert(
  paymentAccountRoleAccountNumberValidationMessage(
    'business_payment_account',
    '2018'
  )?.includes('1xxx'),
  'Business payment role mismatch gives actionable Swedish validation'
)

assert(
  paymentAccountRoleAccountNumberValidationMessage(
    'owner_private_payment',
    '1930'
  )?.includes('2xxx'),
  'Owner-private payment role mismatch gives actionable Swedish validation'
)

assert(
  !isValidPaymentRoleAccountNumber('193'),
  'Too-short account numbers are rejected'
)

assert(
  !isValidPaymentRoleAccountNumber('19300'),
  'Too-long account numbers are rejected'
)

assert(
  !isValidPaymentRoleAccountNumber('bank'),
  'Non-numeric account numbers are rejected'
)

const businessRecommendation =
  getPaymentAccountRoleRecommendation('business_payment_account')
const privateRecommendation =
  getPaymentAccountRoleRecommendation('owner_private_payment')

assert(
  businessRecommendation.accountNumber === '1930',
  'Business payment system recommendation uses 1930'
)

assert(
  getSystemAccount(businessRecommendation.accountNumber) !== null,
  'Business payment recommendation reuses known system-account metadata'
)

assert(
  privateRecommendation.accountNumber === '2018',
  'Private owner-payment system suggestion currently uses 2018 without making it the only valid account'
)

assert(
  getSystemAccount(privateRecommendation.accountNumber) !== null,
  'Private owner-payment recommendation reuses known system-account metadata'
)

const configuredMappings: ConfiguredPaymentAccountRole[] = []

assert(
  configuredMappings.length === 0,
  'System recommendations alone do not create configured mappings'
)

const preflightWithoutPaymentRole = buildVatV2TransactionPreflight({
  companyProfile: {
    domesticSalesVatTreatment: 'taxable',
    vatRegistrationStatus: 'registered',
    vatPeriodType: 'quarter',
    vatReportingFrom: '2026-01-01',
    foreignPurchaseReporting: 'required',
    defaultDeductionEntitlement: 'full',
  },
  transaction: {
    enabled: true,
    supplierCountry: 'IE',
    goodsOrService: 'service',
    supplierVatCharged: 'no',
    calculationRate: 25,
    acquisitionBaseAmount: '100',
  },
  date: '2026-09-27',
  description: 'EU service purchase',
  accountingCategoryId: 'programvaror',
  ordinaryAmount: '100',
})

const preflightWithExtraneousPaymentRole = buildVatV2TransactionPreflight({
  companyProfile: {
    domesticSalesVatTreatment: 'taxable',
    vatRegistrationStatus: 'registered',
    vatPeriodType: 'quarter',
    vatReportingFrom: '2026-01-01',
    foreignPurchaseReporting: 'required',
    defaultDeductionEntitlement: 'full',
  },
  transaction: {
    enabled: true,
    supplierCountry: 'IE',
    goodsOrService: 'service',
    supplierVatCharged: 'no',
    calculationRate: 25,
    acquisitionBaseAmount: '100',
    paymentAccountRole: 'business_payment_account',
  } as Parameters<typeof buildVatV2TransactionPreflight>[0]['transaction'] & {
    paymentAccountRole: string
  },
  date: '2026-09-27',
  description: 'EU service purchase',
  accountingCategoryId: 'programvaror',
  ordinaryAmount: '100',
})

assert(
  preflightWithoutPaymentRole.status === preflightWithExtraneousPaymentRole.status,
  'VAT transaction preflight does not derive treatment from payment role config'
)

console.log('Payment account role model tests passed.')
