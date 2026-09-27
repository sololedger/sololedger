import type {
  CompanyVatProfile,
  CompanyVatProfileValidationError,
  DeductionEntitlement,
  DomesticSalesVatTreatment,
  ForeignPurchaseReporting,
  ValidationResult,
  VatPeriodType,
  VatRegistrationStatus,
} from './vatDomain'
import { validateCompanyVatProfile } from './vatDomain.ts'

export type PersistedDefaultDeductionEntitlement = Exclude<
  DeductionEntitlement,
  'partial'
>

export interface PersistedVatProfile {
  domestic_sales_vat_treatment?: DomesticSalesVatTreatment | null
  vat_status?: VatRegistrationStatus | null
  foreign_purchase_reporting?: ForeignPurchaseReporting | null
  vat_period_type?: VatPeriodType | null
  vat_management_from?: string | null
  default_deduction_entitlement?: PersistedDefaultDeductionEntitlement | null
}

export interface CompanyVatProfileAdapterResult {
  profile: CompanyVatProfile
  validation: ValidationResult<CompanyVatProfileValidationError>
}

function knownOrUnknown<T extends string>(
  value: T | null | undefined,
  allowed: readonly T[]
): T | 'unknown' {
  if (value == null || value === '') return 'unknown'
  return allowed.includes(value) ? value : 'unknown'
}

function knownPeriodOrNull(
  value: VatPeriodType | null | undefined
): VatPeriodType | null {
  if (value === 'month' || value === 'quarter' || value === 'year') {
    return value
  }

  return null
}

export function profileToCompanyVatProfile(
  persisted: PersistedVatProfile | null | undefined
): CompanyVatProfileAdapterResult {
  const profile: CompanyVatProfile = {
    domesticSalesVatTreatment: knownOrUnknown(
      persisted?.domestic_sales_vat_treatment,
      ['taxable', 'small_business_exempt', 'mixed', 'exempt_other', 'unknown']
    ),
    vatRegistrationStatus: knownOrUnknown(
      persisted?.vat_status,
      ['registered', 'not_registered', 'unknown']
    ),
    foreignPurchaseReporting: knownOrUnknown(
      persisted?.foreign_purchase_reporting,
      ['required', 'not_required', 'unknown']
    ),
    vatPeriodType: knownPeriodOrNull(persisted?.vat_period_type),
    vatReportingFrom: persisted?.vat_management_from ?? null,
    defaultDeductionEntitlement: knownOrUnknown(
      persisted?.default_deduction_entitlement,
      ['full', 'none', 'unknown']
    ),
  }

  return {
    profile,
    validation: validateCompanyVatProfile(profile),
  }
}
