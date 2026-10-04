import {
  getPaymentAccountRoleRecommendation,
  isValidPaymentRoleAccountNumberForRole,
  paymentAccountRoleAccountNumberValidationMessage,
  type PaymentAccountRole,
  type PaymentAccountRoleRecommendation,
} from './accountingKnowledge.ts'
import type { ConfiguredPaymentAccountRole } from './paymentAccountRoleState.ts'

export interface PaymentAccountRoleAccountLike {
  id?: string | null
  name?: string | null
  debit_account?: string | null
  credit_account?: string | null
}

export interface PaymentAccountRoleOption {
  accountNumber: string
  name: string
}

export type PaymentAccountRoleSetupStatus =
  | 'configured'
  | 'unconfigured'
  | 'accounts_unavailable'
  | 'invalid_configuration'
  | 'missing_account'

export interface PaymentAccountRoleSetup {
  role: PaymentAccountRole
  label: string
  purpose: string
  recommendation: PaymentAccountRoleRecommendation
  options: PaymentAccountRoleOption[]
  recommendedOption: PaymentAccountRoleOption | null
  status: PaymentAccountRoleSetupStatus
  accountNumber: string | null
  accountName: string | null
  validationMessage: string | null
}

export interface PaymentAccountRoleConfigurationLoadState {
  loaded: boolean
  loading: boolean
  error: string | null
}

export interface PaymentAccountRoleConfigurationEvaluationState {
  paymentRoles: PaymentAccountRoleConfigurationLoadState
  accounts: PaymentAccountRoleConfigurationLoadState
}

export const PAYMENT_ACCOUNT_ROLE_UI:
  Record<PaymentAccountRole, { label: string; purpose: string }> = {
    business_payment_account: {
      label: 'Företagets betalningskonto',
      purpose:
        'Kontot som pengar normalt betalas från eller till för företaget, till exempel företagskontot.',
    },
    owner_private_payment: {
      label: 'Privat betalning / egen insättning',
      purpose:
        'Används när ägaren betalar en kostnad för företaget med privata pengar.',
    },
  }

function normalizeAccountNumber(value: string | null | undefined) {
  return (value ?? '').trim()
}

function accountName(account: PaymentAccountRoleAccountLike) {
  return (account.name ?? 'Konto').trim() || 'Konto'
}

function accountNumbersFor(account: PaymentAccountRoleAccountLike) {
  return [
    normalizeAccountNumber(account.debit_account),
    normalizeAccountNumber(account.credit_account),
  ].filter(Boolean)
}

export function accountContainsNumber(
  account: PaymentAccountRoleAccountLike,
  accountNumber: string
): boolean {
  const normalized = normalizeAccountNumber(accountNumber)
  return accountNumbersFor(account).includes(normalized)
}

export function findAccountByNumber(
  accounts: readonly PaymentAccountRoleAccountLike[],
  accountNumber: string
) {
  return accounts.find(account => accountContainsNumber(account, accountNumber)) ?? null
}

export function paymentAccountRoleOptionLabel(option: PaymentAccountRoleOption) {
  return `${option.accountNumber} ${option.name}`
}

export function buildPaymentAccountRoleOptions(
  role: PaymentAccountRole,
  accounts: readonly PaymentAccountRoleAccountLike[]
): PaymentAccountRoleOption[] {
  const options = new Map<string, PaymentAccountRoleOption>()

  for (const account of accounts) {
    for (const accountNumber of accountNumbersFor(account)) {
      if (!isValidPaymentRoleAccountNumberForRole(role, accountNumber)) continue
      if (!options.has(accountNumber)) {
        options.set(accountNumber, {
          accountNumber,
          name: accountName(account),
        })
      }
    }
  }

  return [...options.values()].sort((left, right) =>
    left.accountNumber.localeCompare(right.accountNumber, 'sv')
  )
}

export function resolvePaymentAccountRoleSetup(input: {
  role: PaymentAccountRole
  configuredRoles: readonly ConfiguredPaymentAccountRole[]
  accounts: readonly PaymentAccountRoleAccountLike[]
  accountsState: PaymentAccountRoleConfigurationLoadState
}): PaymentAccountRoleSetup {
  const recommendation = getPaymentAccountRoleRecommendation(input.role)
  const ui = PAYMENT_ACCOUNT_ROLE_UI[input.role]
  const options = buildPaymentAccountRoleOptions(input.role, input.accounts)
  const recommendedOption =
    options.find(option => option.accountNumber === recommendation.accountNumber) ??
    null
  const configuredRole =
    input.configuredRoles.find(candidate => candidate.role === input.role) ?? null

  if (!configuredRole) {
    return {
      role: input.role,
      label: ui.label,
      purpose: ui.purpose,
      recommendation,
      options,
      recommendedOption,
      status: 'unconfigured',
      accountNumber: null,
      accountName: null,
      validationMessage: null,
    }
  }

  const accountNumber = configuredRole.accountNumber.trim()
  const validationMessage =
    paymentAccountRoleAccountNumberValidationMessage(input.role, accountNumber)
  if (validationMessage) {
    return {
      role: input.role,
      label: ui.label,
      purpose: ui.purpose,
      recommendation,
      options,
      recommendedOption,
      status: 'invalid_configuration',
      accountNumber,
      accountName: null,
      validationMessage,
    }
  }

  if (!paymentAccountRoleConfigurationCanBeEvaluated(input.accountsState)) {
    return {
      role: input.role,
      label: ui.label,
      purpose: ui.purpose,
      recommendation,
      options,
      recommendedOption,
      status: 'accounts_unavailable',
      accountNumber,
      accountName: null,
      validationMessage: input.accountsState.error,
    }
  }

  const account = findAccountByNumber(input.accounts, accountNumber)
  if (!account) {
    return {
      role: input.role,
      label: ui.label,
      purpose: ui.purpose,
      recommendation,
      options,
      recommendedOption,
      status: 'missing_account',
      accountNumber,
      accountName: null,
      validationMessage:
        'Det sparade kontot finns inte i den nuvarande kontoplanen.',
    }
  }

  return {
    role: input.role,
    label: ui.label,
    purpose: ui.purpose,
    recommendation,
    options,
    recommendedOption,
    status: 'configured',
    accountNumber,
    accountName: accountName(account),
    validationMessage: null,
  }
}

export function paymentAccountRoleSetupNeedsAction(
  setup: PaymentAccountRoleSetup
) {
  return setup.status !== 'configured' && setup.status !== 'accounts_unavailable'
}

export function paymentAccountRoleConfigurationCanBeEvaluated(
  state: PaymentAccountRoleConfigurationLoadState
) {
  return state.loaded && !state.loading && !state.error
}

export function paymentAccountRoleConfigurationStateCanBeEvaluated(
  state: PaymentAccountRoleConfigurationEvaluationState
) {
  return (
    paymentAccountRoleConfigurationCanBeEvaluated(state.paymentRoles) &&
    paymentAccountRoleConfigurationCanBeEvaluated(state.accounts)
  )
}

export function paymentAccountRoleConfigurationNeedsAction(input: {
  state: PaymentAccountRoleConfigurationEvaluationState
  setups: readonly PaymentAccountRoleSetup[]
}) {
  return (
    paymentAccountRoleConfigurationStateCanBeEvaluated(input.state) &&
    input.setups.some(paymentAccountRoleSetupNeedsAction)
  )
}

export function paymentAccountRoleSetupSummary(setup: PaymentAccountRoleSetup) {
  if (setup.status === 'configured') {
    return `${setup.label}: ${setup.accountNumber} ${setup.accountName}`
  }

  if (setup.status === 'missing_account') {
    return `${setup.label}: sparat konto ${setup.accountNumber} finns inte i kontoplanen`
  }

  if (setup.status === 'invalid_configuration') {
    return `${setup.label}: sparat konto ${setup.accountNumber} är inte giltigt`
  }

  if (setup.status === 'accounts_unavailable') {
    return setup.validationMessage ?? `${setup.label}: kontoplanen är inte färdigladdad`
  }

  return `${setup.label}: saknas`
}

export function buildPaymentAccountRoleSetups(input: {
  configuredRoles: readonly ConfiguredPaymentAccountRole[]
  accounts: readonly PaymentAccountRoleAccountLike[]
  accountsState: PaymentAccountRoleConfigurationLoadState
}) {
  return ([
    'business_payment_account',
    'owner_private_payment',
  ] as const).map(role =>
    resolvePaymentAccountRoleSetup({
      role,
      configuredRoles: input.configuredRoles,
      accounts: input.accounts,
      accountsState: input.accountsState,
    })
  )
}
