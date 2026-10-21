import type { DomesticSalesVatTreatment, ForeignPurchaseReporting } from './vatDomain'

export interface ProfileDraftFields {
  companyName: string
  orgNr: string
  vatNumber: string
  vatStatus: 'registered' | 'not_registered' | 'unknown'
  vatPeriodType: 'month' | 'quarter' | 'year' | ''
  vatManagementFrom: string
  domesticSalesVatTreatment: DomesticSalesVatTreatment
  foreignPurchaseReporting: ForeignPurchaseReporting
  defaultDeductionEntitlement: 'full' | 'none' | 'unknown'
  business_payment_account: string
  owner_private_payment: string
  newPassword: string
  confirmPassword: string
}

// Memory only, owned by HomeSession. Never passed to accounting/profile policy.
export interface ProfileSettingsDraft {
  ownerId: string
  fields: Partial<ProfileDraftFields>
}

export function changeProfileDraft<K extends keyof ProfileDraftFields>(
  current: ProfileSettingsDraft | null, ownerId: string, key: K, value: ProfileDraftFields[K]
): ProfileSettingsDraft {
  return { ownerId, fields: { ...(current?.ownerId === ownerId ? current.fields : {}), [key]: value } }
}

export function clearSavedDraftFields(
  current: ProfileSettingsDraft | null, ownerId: string, submitted: Partial<ProfileDraftFields>
): ProfileSettingsDraft | null {
  if (!current || current.ownerId !== ownerId) return current
  const fields = { ...current.fields }
  for (const key of Object.keys(submitted) as (keyof ProfileDraftFields)[]) {
    // Edits made while save was in flight remain unsaved.
    if (fields[key] === submitted[key]) delete fields[key]
  }
  return Object.keys(fields).length ? { ownerId, fields } : null
}
