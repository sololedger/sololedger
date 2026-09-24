export type Unknownable<T extends string> = T | 'unknown'

export type VatPeriodType = 'month' | 'quarter' | 'year'

export type DomesticSalesVatTreatment = Unknownable<
  'taxable' | 'small_business_exempt' | 'mixed' | 'exempt_other'
>

export type VatRegistrationStatus = Unknownable<
  'registered' | 'not_registered'
>

export type ForeignPurchaseReporting = Unknownable<
  'required' | 'not_required'
>

export type DeductionEntitlement = Unknownable<
  'full' | 'none' | 'partial'
>

export interface CompanyVatProfile {
  /**
   * Domestic small-business exemption is separate from VAT registration.
   * A company can be exempt for domestic sales and still be registered for
   * reporting specific foreign purchases.
   */
  domesticSalesVatTreatment: DomesticSalesVatTreatment
  vatRegistrationStatus: VatRegistrationStatus
  foreignPurchaseReporting: ForeignPurchaseReporting
  vatPeriodType: VatPeriodType | null
  vatReportingFrom: string | null

  /**
   * Company-level deduction is context/default only. Final deduction belongs
   * to the transaction-level VatTreatment.
   */
  defaultDeductionEntitlement: DeductionEntitlement
  defaultDeductionPercent?: number
}

export type CompanyVatProfileValidationErrorCode =
  | 'registered_requires_vat_period_type'
  | 'registered_requires_vat_reporting_from'
  | 'vat_reporting_from_invalid_date'
  | 'foreign_purchase_reporting_requires_registration'
  | 'partial_deduction_requires_percent'
  | 'deduction_percent_requires_partial_entitlement'
  | 'deduction_percent_out_of_range'

export interface ValidationError<
  TCode extends string = string,
  TPath extends string = string,
> {
  code: TCode
  path: TPath
  message: string
}

export type CompanyVatProfileValidationError = ValidationError<
  CompanyVatProfileValidationErrorCode,
  keyof CompanyVatProfile & string
>

export interface ValidationResult<TError extends ValidationError = ValidationError> {
  valid: boolean
  errors: TError[]
}

function isValidIsoDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function validateCompanyVatProfile(
  profile: CompanyVatProfile
): ValidationResult<CompanyVatProfileValidationError> {
  const errors: CompanyVatProfileValidationError[] = []

  if (profile.vatRegistrationStatus === 'registered') {
    if (profile.vatPeriodType === null) {
      errors.push({
        code: 'registered_requires_vat_period_type',
        path: 'vatPeriodType',
        message: 'A VAT registered company must have a VAT period type.',
      })
    }

    if (profile.vatReportingFrom === null) {
      errors.push({
        code: 'registered_requires_vat_reporting_from',
        path: 'vatReportingFrom',
        message: 'A VAT registered company must have a VAT reporting start date.',
      })
    } else if (!isValidIsoDateOnly(profile.vatReportingFrom)) {
      errors.push({
        code: 'vat_reporting_from_invalid_date',
        path: 'vatReportingFrom',
        message: 'VAT reporting start must be an ISO date string: YYYY-MM-DD.',
      })
    }
  }

  if (
    profile.foreignPurchaseReporting === 'required' &&
    profile.vatRegistrationStatus !== 'registered'
  ) {
    errors.push({
      code: 'foreign_purchase_reporting_requires_registration',
      path: 'foreignPurchaseReporting',
      message:
        'Foreign purchase reporting requires VAT registration; unknown is not registered.',
    })
  }

  if (
    profile.defaultDeductionEntitlement === 'partial' &&
    profile.defaultDeductionPercent === undefined
  ) {
    errors.push({
      code: 'partial_deduction_requires_percent',
      path: 'defaultDeductionPercent',
      message: 'Partial default deduction requires an explicit percent.',
    })
  }

  if (
    profile.defaultDeductionPercent !== undefined &&
    profile.defaultDeductionEntitlement !== 'partial'
  ) {
    errors.push({
      code: 'deduction_percent_requires_partial_entitlement',
      path: 'defaultDeductionPercent',
      message:
        'Default deduction percent is only valid with partial default deduction.',
    })
  }

  if (
    profile.defaultDeductionPercent !== undefined &&
    (
      !Number.isFinite(profile.defaultDeductionPercent) ||
      profile.defaultDeductionPercent < 0 ||
      profile.defaultDeductionPercent > 100
    )
  ) {
    errors.push({
      code: 'deduction_percent_out_of_range',
      path: 'defaultDeductionPercent',
      message: 'Default deduction percent must be between 0 and 100.',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export type VatEventKind = 'sale' | 'purchase'
export type VatGoodsOrService = 'goods' | 'service' | 'unknown'
export type VatYesNoUnknown = 'yes' | 'no' | 'unknown'
export type VatBusinessUse = 'yes' | 'no' | 'mixed' | 'unknown'

export type IsoCountryCode = string

export type VatCounterpartyCountry =
  | { kind: 'country'; code: IsoCountryCode }
  | { kind: 'unknown' }
  | { kind: 'not_applicable' }

export interface VatFactsInput {
  eventKind: VatEventKind
  goodsOrService: VatGoodsOrService
  supplierCountry: VatCounterpartyCountry
  customerCountry: VatCounterpartyCountry
  supplierVatCharged: VatYesNoUnknown
  usedForBusiness: VatBusinessUse
  accountingCategoryId: string
  invoiceDate: string
  amount: number
  currency: string
}

export type VatReturnField =
  | '05'
  | '10'
  | '11'
  | '12'
  | '20'
  | '21'
  | '22'
  | '30'
  | '31'
  | '32'
  | '48'
  | '49'
  | '50'
  | '60'
  | '61'
  | '62'

export type OutputVatReportField =
  | '10'
  | '11'
  | '12'
  | '30'
  | '31'
  | '32'
  | '60'
  | '61'
  | '62'

export type AcquisitionBaseField = '20' | '21' | '22' | '50'
export type DomesticSalesBaseField = '05'
export type DeductibleInputVatReportField = '48'
export type VatCalculationRate = 25 | 12 | 6 | 0

export type VatTreatmentCode =
  | 'DOMESTIC_TAXABLE_SALE'
  | 'DOMESTIC_DEDUCTIBLE_PURCHASE'
  | 'DOMESTIC_EXEMPT_SALE'
  | 'EU_SERVICE_REVERSE_CHARGE'
  | 'EU_GOODS_ACQUISITION'
  | 'NON_EU_SERVICE_REVERSE_CHARGE'
  | 'IMPORT_GOODS'
  | 'NO_VAT_CONSEQUENCE'

export type VatTreatmentEvidenceSource =
  | 'user'
  | 'invoice'
  | 'profile'
  | 'rule'

export interface VatTreatment {
  /**
   * A VatTreatment is the VAT consequence snapshot. It is not a journal plan,
   * account mapping, RPC payload, or booking decision engine.
   */
  code: VatTreatmentCode
  ruleVersion: string
  taxableBase: number
  calculationRate: VatCalculationRate
  outputVat: {
    amount: number
    reportField: OutputVatReportField | null
  }
  deductibleInputVat: {
    amount: number
    reportField: DeductibleInputVatReportField | null
    entitlement: DeductionEntitlement
  }
  acquisitionBaseField?: AcquisitionBaseField
  domesticSalesBaseField?: DomesticSalesBaseField
  evidence: {
    source: VatTreatmentEvidenceSource
    factsVersion: string
  }
}
