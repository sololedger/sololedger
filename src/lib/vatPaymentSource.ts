import {
  getPaymentAccountRoleRecommendation,
  isValidPaymentRoleAccountNumberForRole,
  type PaymentAccountRole,
  type PaymentAccountRoleRecommendation,
} from './accountingKnowledge.ts'
import type { ConfiguredPaymentAccountRole } from './paymentAccountRoles'

export const VAT_V2_PAYMENT_SOURCE_CHOICES = [
  'business_account',
  'owner_private',
] as const

export type VatV2PaymentSourceChoice =
  typeof VAT_V2_PAYMENT_SOURCE_CHOICES[number]

export interface VatV2PaymentSourceOption {
  choice: VatV2PaymentSourceChoice
  role: PaymentAccountRole
  label: string
  summary: string
}

export const VAT_V2_PAYMENT_SOURCE_OPTIONS:
  Record<VatV2PaymentSourceChoice, VatV2PaymentSourceOption> = {
    business_account: {
      choice: 'business_account',
      role: 'business_payment_account',
      label: 'Företagets konto',
      summary: 'Inköpet betalades från företagets betalningskonto.',
    },
    owner_private: {
      choice: 'owner_private',
      role: 'owner_private_payment',
      label: 'Privat betalning',
      summary: 'Ägaren betalade ett verksamhetsinköp med privata pengar.',
    },
  }

export type VatV2PaymentSourceConfiguration =
  | {
      status: 'configured'
      choice: VatV2PaymentSourceChoice
      role: PaymentAccountRole
      accountNumber: string
      recommendation: PaymentAccountRoleRecommendation
    }
  | {
      status: 'unconfigured'
      choice: VatV2PaymentSourceChoice
      role: PaymentAccountRole
      recommendation: PaymentAccountRoleRecommendation
    }
  | {
      status: 'invalid_configuration'
      choice: VatV2PaymentSourceChoice
      role: PaymentAccountRole
      accountNumber: string
      recommendation: PaymentAccountRoleRecommendation
    }

export type VatV2BookingReadiness =
  | {
      status: 'ready_to_book'
      paymentAccountNumber: string
      paymentRole: PaymentAccountRole
    }
  | {
      status: 'not_ready_to_book'
      blockers: VatV2BookingReadinessBlocker[]
    }

export type VatV2BookingReadinessBlocker =
  | 'vat_treatment_not_ready'
  | 'payment_source_inactive'
  | 'payment_roles_loading'
  | 'payment_roles_error'
  | 'payment_role_unconfigured'
  | 'payment_role_invalid_configuration'

export type VatV2PaymentRoleConfigurationState =
  | 'inactive'
  | 'loading'
  | 'error'
  | 'loaded'

export function getVatV2PaymentSourceOption(
  choice: VatV2PaymentSourceChoice
) {
  return VAT_V2_PAYMENT_SOURCE_OPTIONS[choice]
}

export function getVatV2PaymentSourceRole(
  choice: VatV2PaymentSourceChoice
) {
  return getVatV2PaymentSourceOption(choice).role
}

export function resolveVatV2PaymentSourceConfiguration(
  choice: VatV2PaymentSourceChoice,
  configuredRoles: readonly ConfiguredPaymentAccountRole[]
): VatV2PaymentSourceConfiguration {
  const role = getVatV2PaymentSourceRole(choice)
  const recommendation = getPaymentAccountRoleRecommendation(role)
  const configuredRole = configuredRoles.find(
    candidate => candidate.role === role
  )

  if (!configuredRole) {
    return {
      status: 'unconfigured',
      choice,
      role,
      recommendation,
    }
  }

  if (
    !isValidPaymentRoleAccountNumberForRole(
      role,
      configuredRole.accountNumber
    )
  ) {
    return {
      status: 'invalid_configuration',
      choice,
      role,
      accountNumber: configuredRole.accountNumber,
      recommendation,
    }
  }

  return {
    status: 'configured',
    choice,
    role,
    accountNumber: configuredRole.accountNumber.trim(),
    recommendation,
  }
}

export function buildVatV2BookingReadiness(input: {
  treatmentReady: boolean
  roleConfigurationState: VatV2PaymentRoleConfigurationState
  paymentSource: VatV2PaymentSourceConfiguration
}): VatV2BookingReadiness {
  const blockers: VatV2BookingReadinessBlocker[] = []

  if (!input.treatmentReady) {
    blockers.push('vat_treatment_not_ready')
  }

  if (input.roleConfigurationState === 'inactive') {
    blockers.push('payment_source_inactive')
  }

  if (input.roleConfigurationState === 'loading') {
    blockers.push('payment_roles_loading')
  }

  if (input.roleConfigurationState === 'error') {
    blockers.push('payment_roles_error')
  }

  if (input.paymentSource.status === 'unconfigured') {
    blockers.push('payment_role_unconfigured')
  }

  if (input.paymentSource.status === 'invalid_configuration') {
    blockers.push('payment_role_invalid_configuration')
  }

  if (
    blockers.length > 0 ||
    input.roleConfigurationState !== 'loaded' ||
    input.paymentSource.status !== 'configured'
  ) {
    return {
      status: 'not_ready_to_book',
      blockers,
    }
  }

  return {
    status: 'ready_to_book',
    paymentAccountNumber: input.paymentSource.accountNumber,
    paymentRole: input.paymentSource.role,
  }
}
