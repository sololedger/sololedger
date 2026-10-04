import {
  isPaymentAccountRole,
  type PaymentAccountRole,
} from './accountingKnowledge.ts'

export type { PaymentAccountRole }

export interface ConfiguredPaymentAccountRole {
  role: PaymentAccountRole
  accountNumber: string
}

export function mergeConfiguredPaymentAccountRole(
  roles: readonly ConfiguredPaymentAccountRole[],
  saved: ConfiguredPaymentAccountRole
) {
  return [
    ...roles.filter(role => role.role !== saved.role),
    saved,
  ].sort((left, right) => left.role.localeCompare(right.role))
}

export function removeConfiguredPaymentAccountRole(
  roles: readonly ConfiguredPaymentAccountRole[],
  role: PaymentAccountRole
) {
  if (!isPaymentAccountRole(role)) {
    throw new Error(`Unsupported payment account role: ${role}`)
  }

  return roles.filter(candidate => candidate.role !== role)
}
