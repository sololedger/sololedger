import {
  buildPaymentAccountRoleOptions,
  buildPaymentAccountRoleSetups,
  paymentAccountRoleConfigurationCanBeEvaluated,
  paymentAccountRoleConfigurationNeedsAction,
  paymentAccountRoleOptionLabel,
  paymentAccountRoleSetupNeedsAction,
  paymentAccountRoleSetupSummary,
  resolvePaymentAccountRoleSetup,
  type PaymentAccountRoleAccountLike,
  type PaymentAccountRoleConfigurationLoadState,
} from '../src/lib/paymentAccountRoleStatus.ts'
import type { ConfiguredPaymentAccountRole } from '../src/lib/paymentAccountRoles.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`)
  }
}

const accounts: PaymentAccountRoleAccountLike[] = [
  {
    id: 'bank',
    name: 'Företagskonto',
    debit_account: '1930',
    credit_account: '1930',
  },
  {
    id: 'owner-deposit',
    name: 'Egen insättning',
    debit_account: '2018',
    credit_account: '2018',
  },
  {
    id: 'other-bank',
    name: 'Sparkonto',
    debit_account: '1940',
    credit_account: '1940',
  },
  {
    id: 'vat',
    name: 'Utgående moms',
    debit_account: '2611',
    credit_account: '2611',
  },
  {
    id: 'tax-account',
    name: 'Skattekonto',
    debit_account: '2012',
    credit_account: '2012',
  },
]

const loadedState: PaymentAccountRoleConfigurationLoadState = {
  loaded: true,
  loading: false,
  error: null,
}

const loadingState: PaymentAccountRoleConfigurationLoadState = {
  loaded: false,
  loading: true,
  error: null,
}

const unloadedState: PaymentAccountRoleConfigurationLoadState = {
  loaded: false,
  loading: false,
  error: null,
}

const errorState: PaymentAccountRoleConfigurationLoadState = {
  loaded: false,
  loading: false,
  error: 'Kunde inte ladda kontoplanen.',
}

const businessOptions = buildPaymentAccountRoleOptions(
  'business_payment_account',
  accounts
)

assert(
  businessOptions.some(option => option.accountNumber === '1930'),
  'Profile payment role options include existing valid business recommendation'
)

assert(
  businessOptions.some(option => option.accountNumber === '1940'),
  'Profile payment role options include alternative valid business accounts'
)

assert(
  !businessOptions.some(option => option.accountNumber === '2018'),
  'Business payment options exclude owner equity accounts'
)

assert(
  !businessOptions.some(option => option.accountNumber === '2611'),
  'Payment role options exclude VAT accounts'
)

assert(
  !businessOptions.some(option => option.accountNumber === '2012'),
  'Payment role options exclude tax clearing account 2012'
)

const privateOptions = buildPaymentAccountRoleOptions(
  'owner_private_payment',
  accounts
)

assert(
  privateOptions.some(option => option.accountNumber === '2018'),
  'Profile payment role options include existing valid private recommendation'
)

assert(
  !privateOptions.some(option => option.accountNumber === '1930'),
  'Private payment options exclude business asset accounts'
)

const unconfiguredBusiness = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles: [],
  accounts,
  accountsState: loadedState,
})

assertEqual(
  unconfiguredBusiness.status,
  'unconfigured',
  'Recommendation-only business account is still unconfigured'
)

assert(
  paymentAccountRoleSetupNeedsAction(unconfiguredBusiness),
  'Unconfigured role needs user action'
)

assert(
  !paymentAccountRoleConfigurationNeedsAction({
    state: { paymentRoles: unloadedState, accounts: loadedState },
    setups: [unconfiguredBusiness],
  }),
  'Unloaded payment-role state must not show missing-account reminders'
)

assert(
  !paymentAccountRoleConfigurationNeedsAction({
    state: { paymentRoles: loadingState, accounts: loadedState },
    setups: [unconfiguredBusiness],
  }),
  'Loading payment-role state must not be treated as unconfigured'
)

assert(
  !paymentAccountRoleConfigurationCanBeEvaluated({
    loaded: true,
    loading: false,
    error: 'Kunde inte hämta betalningskonton.',
  }),
  'Errored payment-role state is not ready for missing-account decisions'
)

assert(
  paymentAccountRoleConfigurationNeedsAction({
    state: { paymentRoles: loadedState, accounts: loadedState },
    setups: [unconfiguredBusiness],
  }),
  'Loaded successful state may show missing-account reminders'
)

assertEqual(
  unconfiguredBusiness.recommendedOption?.accountNumber,
  '1930',
  'Existing recommendation is shown as an option, not a saved value'
)

const configuredRoles: ConfiguredPaymentAccountRole[] = [
  { role: 'business_payment_account', accountNumber: '1940' },
  { role: 'owner_private_payment', accountNumber: '2018' },
]

const configuredBusiness = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles,
  accounts,
  accountsState: loadedState,
})

assertEqual(
  configuredBusiness.status,
  'configured',
  'Explicit saved account that exists in kontoplan is configured'
)

assert(
  !paymentAccountRoleSetupNeedsAction(configuredBusiness),
  'Configured existing valid account needs no action'
)

assert(
  paymentAccountRoleSetupSummary(configuredBusiness).includes('1940'),
  'Configured summary names the explicit saved account'
)

const missingRecommendationAccounts = accounts.filter(
  account => account.debit_account !== '1930' && account.credit_account !== '1930'
)
const missingRecommendedBusiness = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles: [],
  accounts: missingRecommendationAccounts,
  accountsState: loadedState,
})

assertEqual(
  missingRecommendedBusiness.recommendedOption,
  null,
  'Missing 1930 recommendation is not silently created as a selectable account'
)

assert(
  missingRecommendedBusiness.options.some(option => option.accountNumber === '1940'),
  'When recommendation is missing, another existing valid account can still be selected'
)

const missingSavedAccount = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles: [{ role: 'business_payment_account', accountNumber: '1950' }],
  accounts,
  accountsState: loadedState,
})

assertEqual(
  missingSavedAccount.status,
  'missing_account',
  'Existing saved state is defensive when the account is no longer in kontoplan'
)

assert(
  paymentAccountRoleSetupNeedsAction(missingSavedAccount),
  'Missing saved account requires replacement or clearing'
)

const invalidSavedAccount = resolvePaymentAccountRoleSetup({
  role: 'owner_private_payment',
  configuredRoles: [{ role: 'owner_private_payment', accountNumber: '1930' }],
  accounts,
  accountsState: loadedState,
})

assertEqual(
  invalidSavedAccount.status,
  'invalid_configuration',
  'Historically invalid saved state is detected defensively'
)

const allSetups = buildPaymentAccountRoleSetups({
  configuredRoles,
  accounts,
  accountsState: loadedState,
})

assertEqual(allSetups.length, 2, 'Both central payment roles are represented')
assert(
  allSetups.every(setup => setup.status === 'configured'),
  'Both central payment roles can be configured from existing valid accounts'
)

assertEqual(
  paymentAccountRoleOptionLabel({ accountNumber: '1930', name: 'Företagskonto' }),
  '1930 Företagskonto',
  'Account option labels are user-readable Swedish account choices'
)

const loadingSavedBusiness = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles: [{ role: 'business_payment_account', accountNumber: '1930' }],
  accounts: [],
  accountsState: loadingState,
})

assertEqual(
  loadingSavedBusiness.status,
  'accounts_unavailable',
  'Saved valid role with accounts still loading is not missing_account'
)

assert(
  !paymentAccountRoleSetupNeedsAction(loadingSavedBusiness),
  'Accounts-unavailable setup does not require replacement while accounts load state is unavailable'
)

assert(
  !paymentAccountRoleConfigurationNeedsAction({
    state: { paymentRoles: loadedState, accounts: loadingState },
    setups: [loadingSavedBusiness],
  }),
  'Saved valid role with accounts still loading does not show dashboard reminder'
)

const unloadedSavedBusiness = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles: [{ role: 'business_payment_account', accountNumber: '1930' }],
  accounts: [],
  accountsState: unloadedState,
})

assertEqual(
  unloadedSavedBusiness.status,
  'accounts_unavailable',
  'Saved valid role with accounts not yet loaded is not missing_account'
)

assert(
  !paymentAccountRoleConfigurationNeedsAction({
    state: { paymentRoles: loadedState, accounts: unloadedState },
    setups: [unloadedSavedBusiness],
  }),
  'Saved valid role with accounts not yet loaded does not show dashboard reminder'
)

const errorSavedBusiness = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles: [{ role: 'business_payment_account', accountNumber: '1930' }],
  accounts: [],
  accountsState: errorState,
})

assertEqual(
  errorSavedBusiness.status,
  'accounts_unavailable',
  'Accounts load error is not treated as missing_account'
)

assert(
  !paymentAccountRoleConfigurationNeedsAction({
    state: { paymentRoles: loadedState, accounts: errorState },
    setups: [errorSavedBusiness],
  }),
  'Accounts load error does not show missing-account reminder'
)

const loadedMissingSavedAccount = resolvePaymentAccountRoleSetup({
  role: 'business_payment_account',
  configuredRoles: [{ role: 'business_payment_account', accountNumber: '1930' }],
  accounts: accounts.filter(
    account => account.debit_account !== '1930' && account.credit_account !== '1930'
  ),
  accountsState: loadedState,
})

assertEqual(
  loadedMissingSavedAccount.status,
  'missing_account',
  'Saved valid role with loaded accounts that lack the account is missing_account'
)

assert(
  paymentAccountRoleConfigurationNeedsAction({
    state: { paymentRoles: loadedState, accounts: loadedState },
    setups: [loadedMissingSavedAccount],
  }),
  'Loaded accounts without the saved account show action required'
)

console.log('Payment account role status tests passed.')
