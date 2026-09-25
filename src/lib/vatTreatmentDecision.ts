import type {
  CompanyVatProfile,
  CompanyVatProfileValidationErrorCode,
  DeductionEntitlement,
  OutputVatReportField,
  ValidationError,
  ValidationResult,
  VatCounterpartyCountry,
  VatFactsInput,
  VatTreatment,
} from './vatDomain'
import {
  validateCompanyVatProfile,
} from './vatDomain.ts'

export type VatTreatmentDecisionBlockCode =
  | CompanyVatProfileValidationErrorCode
  | 'invalid_amount'
  | 'unknown_calculation_rate'
  | 'unknown_supplier_country'
  | 'unknown_customer_country'
  | 'unknown_goods_or_service'
  | 'unknown_supplier_vat_charged'
  | 'unknown_deduction_entitlement'
  | 'unknown_domestic_sales_vat_treatment'
  | 'unknown_vat_registration_status'
  | 'unknown_foreign_purchase_reporting'
  | 'unsupported_vat_treatment'

export type VatTreatmentDecisionPath =
  | keyof VatFactsInput
  | `companyProfile.${keyof CompanyVatProfile & string}`

export type VatTreatmentDecisionError = ValidationError<
  VatTreatmentDecisionBlockCode,
  VatTreatmentDecisionPath
>

export type VatTreatmentDecisionResult =
  | {
      status: 'ready'
      treatment: VatTreatment
      validation: ValidationResult<VatTreatmentDecisionError> & {
        valid: true
        errors: []
      }
    }
  | {
      status: 'blocked'
      treatment: null
      validation: ValidationResult<VatTreatmentDecisionError> & {
        valid: false
        errors: VatTreatmentDecisionError[]
      }
    }

const RULE_VERSION = 'vat-v2-kan18-first-slice'
const FACTS_VERSION = 'vat-facts-v1'
const HOME_COUNTRY = 'SE'

const EU_COUNTRY_CODES = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
])

function ready(treatment: VatTreatment): VatTreatmentDecisionResult {
  return {
    status: 'ready',
    treatment,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

function blocked(
  errors: VatTreatmentDecisionError[]
): VatTreatmentDecisionResult {
  return {
    status: 'blocked',
    treatment: null,
    validation: {
      valid: false,
      errors,
    },
  }
}

function error(
  code: VatTreatmentDecisionBlockCode,
  path: VatTreatmentDecisionPath,
  message: string
): VatTreatmentDecisionError {
  return { code, path, message }
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function outputFieldForRate(
  rate: VatFactsInput['calculationRate'],
  domestic: boolean
): OutputVatReportField | null {
  if (rate === 'unknown' || rate === 0) return null

  if (domestic) {
    if (rate === 25) return '10'
    if (rate === 12) return '11'
    return '12'
  }

  if (rate === 25) return '30'
  if (rate === 12) return '31'
  return '32'
}

function countryCode(country: VatCounterpartyCountry) {
  return country.kind === 'country' ? country.code.toUpperCase() : null
}

function isHomeCountry(country: VatCounterpartyCountry) {
  return countryCode(country) === HOME_COUNTRY
}

function isEuCountry(country: VatCounterpartyCountry) {
  const code = countryCode(country)
  return code !== null && EU_COUNTRY_CODES.has(code)
}

function isOtherEuCountry(country: VatCounterpartyCountry) {
  return isEuCountry(country) && !isHomeCountry(country)
}

function calculationRateError(): VatTreatmentDecisionError {
  return error(
    'unknown_calculation_rate',
    'calculationRate',
    'VAT calculation requires an explicit calculation rate.'
  )
}

function unknownDeductionError(): VatTreatmentDecisionError {
  return error(
    'unknown_deduction_entitlement',
    'deductionEntitlement',
    'Deduction entitlement must be known before deductible input VAT can be decided.'
  )
}

function unsupportedTreatment(message: string): VatTreatmentDecisionResult {
  return blocked([
    error(
      'unsupported_vat_treatment',
      'eventKind',
      message
    ),
  ])
}

function validateDecisionInput(facts: VatFactsInput): VatTreatmentDecisionError[] {
  const profileValidation = validateCompanyVatProfile(facts.companyProfile)
  const errors: VatTreatmentDecisionError[] = profileValidation.errors.map(
    profileError => ({
      code: profileError.code,
      path: `companyProfile.${profileError.path}`,
      message: profileError.message,
    })
  )

  if (!Number.isFinite(facts.amount) || facts.amount < 0) {
    errors.push(
      error(
        'invalid_amount',
        'amount',
        'VAT treatment decisions require a finite, non-negative amount.'
      )
    )
  }

  return errors
}

function createTreatmentBase(
  facts: VatFactsInput,
  code: VatTreatment['code'],
  outputVatAmount: number,
  outputVatField: OutputVatReportField | null,
  deductibleInputVatAmount: number,
  deductionEntitlement: DeductionEntitlement
): Omit<
  VatTreatment,
  'acquisitionBaseField' | 'domesticSalesBaseField'
> {
  if (facts.calculationRate === 'unknown') {
    throw new Error('Cannot create a VatTreatment with unknown calculation rate.')
  }

  return {
    code,
    ruleVersion: RULE_VERSION,
    taxableBase: facts.amount,
    calculationRate: facts.calculationRate,
    outputVat: {
      amount: outputVatAmount,
      reportField: outputVatField,
    },
    deductibleInputVat: {
      amount: deductibleInputVatAmount,
      reportField: deductibleInputVatAmount > 0 ? '48' : null,
      entitlement: deductionEntitlement,
    },
    evidence: {
      source: 'rule',
      factsVersion: FACTS_VERSION,
    },
  }
}

function decideDomesticSale(facts: VatFactsInput): VatTreatmentDecisionResult {
  if (facts.customerCountry.kind === 'unknown') {
    return blocked([
      error(
        'unknown_customer_country',
        'customerCountry',
        'Customer country must be known before domestic sale treatment can be decided.'
      ),
    ])
  }

  if (!isHomeCountry(facts.customerCountry)) {
    return unsupportedTreatment(
      'KAN-18 first slice only verifies Swedish domestic sales.'
    )
  }

  if (facts.companyProfile.domesticSalesVatTreatment === 'unknown') {
    return blocked([
      error(
        'unknown_domestic_sales_vat_treatment',
        'companyProfile.domesticSalesVatTreatment',
        'Domestic sales VAT treatment must be known before a domestic sale can be decided.'
      ),
    ])
  }

  if (facts.companyProfile.domesticSalesVatTreatment === 'taxable') {
    if (facts.calculationRate === 'unknown') {
      return blocked([calculationRateError()])
    }

    const outputVatAmount = roundCurrency(
      facts.amount * facts.calculationRate / 100
    )

    return ready({
      ...createTreatmentBase(
        facts,
        'DOMESTIC_TAXABLE_SALE',
        outputVatAmount,
        outputFieldForRate(facts.calculationRate, true),
        0,
        'none'
      ),
      domesticSalesBaseField: '05',
    })
  }

  if (
    facts.companyProfile.domesticSalesVatTreatment === 'small_business_exempt' ||
    facts.companyProfile.domesticSalesVatTreatment === 'exempt_other'
  ) {
    return ready({
      ...createTreatmentBase(
        {
          ...facts,
          calculationRate: 0,
        },
        'DOMESTIC_EXEMPT_SALE',
        0,
        null,
        0,
        'none'
      ),
      domesticSalesBaseField: '05',
    })
  }

  return unsupportedTreatment(
    'Mixed domestic sales VAT treatment needs a later explicit rule.'
  )
}

function decideDomesticPurchase(
  facts: VatFactsInput
): VatTreatmentDecisionResult {
  if (facts.calculationRate === 'unknown') {
    return blocked([calculationRateError()])
  }

  if (facts.deductionEntitlement === 'unknown') {
    return blocked([unknownDeductionError()])
  }

  if (facts.supplierVatCharged === 'unknown') {
    return blocked([
      error(
        'unknown_supplier_vat_charged',
        'supplierVatCharged',
        'Supplier VAT charged must be known for domestic deductible purchase treatment.'
      ),
    ])
  }

  if (facts.deductionEntitlement === 'partial') {
    return unsupportedTreatment(
      'Partial deduction is outside the verified KAN-18 first slice.'
    )
  }

  if (facts.deductionEntitlement === 'none') {
    return unsupportedTreatment(
      'Domestic no-deduction purchases are outside the verified KAN-18 first slice.'
    )
  }

  if (facts.supplierVatCharged !== 'yes') {
    return unsupportedTreatment(
      'Domestic purchase without supplier-charged VAT is outside the verified KAN-18 first slice.'
    )
  }

  const inputVatAmount =
    roundCurrency(facts.amount * facts.calculationRate / 100)

  return ready(
    createTreatmentBase(
      facts,
      'DOMESTIC_DEDUCTIBLE_PURCHASE',
      0,
      null,
      inputVatAmount,
      facts.deductionEntitlement
    )
  )
}

function decideEuServicePurchase(
  facts: VatFactsInput
): VatTreatmentDecisionResult {
  const errors: VatTreatmentDecisionError[] = []

  if (facts.calculationRate === 'unknown') {
    errors.push(calculationRateError())
  }

  if (facts.supplierVatCharged === 'unknown') {
    errors.push(
      error(
        'unknown_supplier_vat_charged',
        'supplierVatCharged',
        'Supplier VAT charged must be known for EU service reverse-charge treatment.'
      )
    )
  }

  if (facts.deductionEntitlement === 'unknown') {
    errors.push(unknownDeductionError())
  }

  if (facts.companyProfile.vatRegistrationStatus === 'unknown') {
    errors.push(
      error(
        'unknown_vat_registration_status',
        'companyProfile.vatRegistrationStatus',
        'VAT registration status must be known for EU service reverse-charge treatment.'
      )
    )
  }

  if (facts.companyProfile.foreignPurchaseReporting === 'unknown') {
    errors.push(
      error(
        'unknown_foreign_purchase_reporting',
        'companyProfile.foreignPurchaseReporting',
        'Foreign purchase reporting status must be known for EU service reverse-charge treatment.'
      )
    )
  }

  if (errors.length > 0) {
    return blocked(errors)
  }

  if (facts.supplierVatCharged !== 'no') {
    return unsupportedTreatment(
      'Supplier-charged foreign VAT is outside the verified KAN-18 first slice.'
    )
  }

  if (
    facts.companyProfile.vatRegistrationStatus !== 'registered' ||
    facts.companyProfile.foreignPurchaseReporting !== 'required'
  ) {
    return unsupportedTreatment(
      'EU service purchase treatment requires verified VAT registration and foreign purchase reporting.'
    )
  }

  if (facts.deductionEntitlement === 'partial') {
    return unsupportedTreatment(
      'Partial deduction is outside the verified KAN-18 first slice.'
    )
  }

  if (facts.calculationRate === 'unknown') {
    throw new Error('Blocked EU service treatment cannot have an unknown rate.')
  }

  const calculationRate = facts.calculationRate
  const outputVatAmount = roundCurrency(
    facts.amount * calculationRate / 100
  )
  const deductibleInputVatAmount =
    facts.deductionEntitlement === 'full' ? outputVatAmount : 0

  return ready({
    ...createTreatmentBase(
      facts,
      'EU_SERVICE_REVERSE_CHARGE',
      outputVatAmount,
      outputFieldForRate(calculationRate, false),
      deductibleInputVatAmount,
      facts.deductionEntitlement
    ),
    acquisitionBaseField: '21',
  })
}

function decidePurchase(facts: VatFactsInput): VatTreatmentDecisionResult {
  if (facts.supplierCountry.kind === 'unknown') {
    return blocked([
      error(
        'unknown_supplier_country',
        'supplierCountry',
        'Supplier country must be known before purchase VAT treatment can be decided.'
      ),
    ])
  }

  if (facts.goodsOrService === 'unknown') {
    return blocked([
      error(
        'unknown_goods_or_service',
        'goodsOrService',
        'Goods or service classification must be known before purchase VAT treatment can be decided.'
      ),
    ])
  }

  if (isHomeCountry(facts.supplierCountry)) {
    return decideDomesticPurchase(facts)
  }

  if (
    facts.goodsOrService === 'service' &&
    isOtherEuCountry(facts.supplierCountry)
  ) {
    if (facts.customerCountry.kind === 'unknown') {
      return blocked([
        error(
          'unknown_customer_country',
          'customerCountry',
          'Customer country must be known for EU service reverse-charge treatment.'
        ),
      ])
    }

    if (!isHomeCountry(facts.customerCountry)) {
      return unsupportedTreatment(
        'KAN-18 first slice only verifies Swedish company purchases.'
      )
    }

    return decideEuServicePurchase(facts)
  }

  return unsupportedTreatment(
    'This purchase VAT treatment is outside the verified KAN-18 first slice.'
  )
}

export function decideVatTreatment(
  facts: VatFactsInput
): VatTreatmentDecisionResult {
  const inputErrors = validateDecisionInput(facts)

  if (inputErrors.length > 0) {
    return blocked(inputErrors)
  }

  if (facts.eventKind === 'sale') {
    return decideDomesticSale(facts)
  }

  return decidePurchase(facts)
}
