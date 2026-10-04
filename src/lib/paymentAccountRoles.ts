import {
  isPaymentAccountRole,
  paymentAccountRoleAccountNumberValidationMessage,
  type PaymentAccountRole,
} from './accountingKnowledge'
import { supabase } from './supabaseClient'
export {
  mergeConfiguredPaymentAccountRole,
  removeConfiguredPaymentAccountRole,
  type ConfiguredPaymentAccountRole,
  type PaymentAccountRole,
} from './paymentAccountRoleState'
import type { ConfiguredPaymentAccountRole } from './paymentAccountRoleState'

interface PaymentAccountRoleRow {
  role: string
  account_number: string
}

function assertPaymentAccountRole(role: string): asserts role is PaymentAccountRole {
  if (!isPaymentAccountRole(role)) {
    throw new Error(`Unsupported payment account role: ${role}`)
  }
}

function assertPaymentRoleAccountNumber(
  role: PaymentAccountRole,
  accountNumber: string
) {
  const message = paymentAccountRoleAccountNumberValidationMessage(
    role,
    accountNumber
  )
  if (message) {
    throw new Error(message)
  }
}

function toConfiguredRole(row: PaymentAccountRoleRow): ConfiguredPaymentAccountRole {
  assertPaymentAccountRole(row.role)

  return {
    role: row.role,
    accountNumber: row.account_number,
  }
}

export async function getConfiguredPaymentAccountRoles() {
  const { data, error } = await supabase
    .from('company_payment_account_roles')
    .select('role, account_number')
    .order('role')

  if (error) throw error

  return (data ?? []).map(row => toConfiguredRole(row as PaymentAccountRoleRow))
}

export async function setConfiguredPaymentAccountRole(
  role: PaymentAccountRole,
  accountNumber: string
) {
  assertPaymentAccountRole(role)
  assertPaymentRoleAccountNumber(role, accountNumber)

  const { data, error } = await supabase
    .from('company_payment_account_roles')
    .upsert(
      {
        role,
        account_number: accountNumber.trim(),
      },
      { onConflict: 'user_id,role' }
    )
    .select('role, account_number')
    .single()

  if (error) throw error

  return toConfiguredRole(data as PaymentAccountRoleRow)
}

export async function clearConfiguredPaymentAccountRole(
  role: PaymentAccountRole
) {
  assertPaymentAccountRole(role)

  const { error } = await supabase
    .from('company_payment_account_roles')
    .delete()
    .eq('role', role)

  if (error) throw error
}
