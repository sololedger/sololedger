import type {
  CompanyVatProfile,
  ValidationError,
  ValidationResult,
  VatCalculationRateInput,
  VatCounterpartyCountry,
  VatFactsInput,
  VatGoodsOrService,
  VatTreatment,
  VatYesNoUnknown,
} from './vatDomain'
import {
  decideVatTreatment,
  type VatTreatmentDecisionBlockCode,
  type VatTreatmentDecisionError,
} from './vatTreatmentDecision.ts'

export const VAT_V2_SUPPLIER_COUNTRIES = [
  { code: 'SE', label: 'Sverige' },
  { code: 'DK', label: 'Danmark' },
  { code: 'FI', label: 'Finland' },
  { code: 'DE', label: 'Tyskland' },
  { code: 'IE', label: 'Irland' },
  { code: 'NL', label: 'Nederländerna' },
  { code: 'FR', label: 'Frankrike' },
  { code: 'ES', label: 'Spanien' },
  { code: 'PL', label: 'Polen' },
  { code: 'NO', label: 'Norge' },
  { code: 'US', label: 'USA' },
] as const

export type VatV2SupplierCountryCode =
  typeof VAT_V2_SUPPLIER_COUNTRIES[number]['code']

export type VatV2SupplierCountryInput = VatV2SupplierCountryCode | 'unknown'

export interface VatV2TransactionFacts {
  enabled: boolean
  supplierCountry: VatV2SupplierCountryInput
  goodsOrService: VatGoodsOrService
  supplierVatCharged: VatYesNoUnknown
  calculationRate: VatCalculationRateInput
  acquisitionBaseAmount: string
}

export interface BuildVatV2TransactionPreflightInput {
  companyProfile: CompanyVatProfile
  transaction: VatV2TransactionFacts
  date: string
  description: string
  accountingCategoryId: string
  ordinaryAmount: string
}

export type VatV2TransactionPreflightBlockCode =
  | VatTreatmentDecisionBlockCode
  | 'vat_v2_not_enabled'
  | 'unsupported_vat_v2_persistence_path'

export type VatV2TransactionPreflightPath =
  | keyof VatV2TransactionFacts
  | keyof BuildVatV2TransactionPreflightInput
  | VatTreatmentDecisionError['path']
  | 'treatment.code'
  | 'treatment.calculationRate'
  | 'treatment.deductibleInputVat.entitlement'

export type VatV2TransactionPreflightError = ValidationError<
  VatV2TransactionPreflightBlockCode,
  VatV2TransactionPreflightPath
>

export type VatV2TransactionPreflightResult =
  | {
      status: 'disabled'
      facts: null
      treatment: null
      validation: ValidationResult<VatV2TransactionPreflightError> & {
        valid: false
        errors: VatV2TransactionPreflightError[]
      }
    }
  | {
      status: 'ready'
      facts: VatFactsInput
      treatment: VatTreatment
      validation: ValidationResult<VatV2TransactionPreflightError> & {
        valid: true
        errors: []
      }
    }
  | {
      status: 'blocked'
      facts: VatFactsInput | null
      treatment: VatTreatment | null
      validation: ValidationResult<VatV2TransactionPreflightError> & {
        valid: false
        errors: VatV2TransactionPreflightError[]
      }
    }

function error(
  code: VatV2TransactionPreflightBlockCode,
  path: VatV2TransactionPreflightPath,
  message: string
): VatV2TransactionPreflightError {
  return { code, path, message }
}

function blocked(
  errors: VatV2TransactionPreflightError[],
  facts: VatFactsInput | null = null,
  treatment: VatTreatment | null = null
): VatV2TransactionPreflightResult {
  return {
    status: 'blocked',
    facts,
    treatment,
    validation: {
      valid: false,
      errors,
    },
  }
}

function disabled(): VatV2TransactionPreflightResult {
  return {
    status: 'disabled',
    facts: null,
    treatment: null,
    validation: {
      valid: false,
      errors: [
        error(
          'vat_v2_not_enabled',
          'enabled',
          'VAT V2 assessment is not enabled for this transaction.'
        ),
      ],
    },
  }
}

function ready(
  facts: VatFactsInput,
  treatment: VatTreatment
): VatV2TransactionPreflightResult {
  return {
    status: 'ready',
    facts,
    treatment,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

type AcquisitionBaseAmountParseResult =
  | { amount: number }
  | { error: VatV2TransactionPreflightError }

function parseAcquisitionBaseAmount(
  value: string
): AcquisitionBaseAmountParseResult {
  const trimmed = value.trim()

  if (trimmed === '') {
    return {
      error: error(
        'invalid_amount',
        'acquisitionBaseAmount',
        'VAT V2 preflight requires an explicit acquisition base amount.'
      ),
    }
  }

  const normalized = trimmed.replace(',', '.')
  const parsed = Number(normalized)
  const rounded = Math.round(parsed * 100) / 100

  if (!Number.isFinite(parsed) || parsed <= 0 || rounded !== parsed) {
    return {
      error: error(
        'invalid_amount',
        'acquisitionBaseAmount',
        'Acquisition base amount must be a finite positive amount rounded to two decimals.'
      ),
    }
  }

  return { amount: parsed }
}

function supplierCountryToDomain(
  country: VatV2SupplierCountryInput
): VatCounterpartyCountry {
  return country === 'unknown'
    ? { kind: 'unknown' }
    : { kind: 'country', code: country }
}

function assertSupportedPersistenceTreatment(
  treatment: VatTreatment
): VatV2TransactionPreflightError[] {
  const errors: VatV2TransactionPreflightError[] = []

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(
      error(
        'unsupported_vat_v2_persistence_path',
        'treatment.code',
        'This preflight slice only supports EU service reverse charge.'
      )
    )
  }

  if (treatment.calculationRate !== 25) {
    errors.push(
      error(
        'unsupported_vat_v2_persistence_path',
        'treatment.calculationRate',
        'This preflight slice only supports 25 percent calculation rate.'
      )
    )
  }

  if (treatment.deductibleInputVat.entitlement !== 'full') {
    errors.push(
      error(
        'unsupported_vat_v2_persistence_path',
        'treatment.deductibleInputVat.entitlement',
        'This preflight slice only supports full deduction.'
      )
    )
  }

  return errors
}

export function buildVatV2TransactionPreflight(
  input: BuildVatV2TransactionPreflightInput
): VatV2TransactionPreflightResult {
  if (!input.transaction.enabled) {
    return disabled()
  }

  const amountResult = parseAcquisitionBaseAmount(
    input.transaction.acquisitionBaseAmount
  )

  if ('error' in amountResult) {
    return blocked([amountResult.error])
  }

  const facts: VatFactsInput = {
    companyProfile: input.companyProfile,
    eventKind: 'purchase',
    goodsOrService: input.transaction.goodsOrService,
    supplierCountry: supplierCountryToDomain(input.transaction.supplierCountry),
    customerCountry: { kind: 'country', code: 'SE' },
    supplierVatCharged: input.transaction.supplierVatCharged,
    usedForBusiness: 'unknown',
    calculationRate: input.transaction.calculationRate,
    deductionEntitlement: input.companyProfile.defaultDeductionEntitlement,
    accountingCategoryId: input.accountingCategoryId,
    invoiceDate: input.date,
    amount: amountResult.amount,
    currency: 'SEK',
  }

  const decision = decideVatTreatment(facts)

  if (decision.status === 'blocked') {
    return blocked(decision.validation.errors, facts)
  }

  const supportErrors = assertSupportedPersistenceTreatment(decision.treatment)

  if (supportErrors.length > 0) {
    return blocked(supportErrors, facts, decision.treatment)
  }

  return ready(facts, decision.treatment)
}

export function describeVatV2PreflightError(
  error: VatV2TransactionPreflightError
) {
  switch (error.code) {
    case 'invalid_amount':
      return 'Ange ett separat inköpsbelopp för momsberäkningen.'
    case 'unknown_supplier_country':
      return 'Leverantörsland saknas.'
    case 'unknown_customer_country':
      return 'Företagsland saknas för bedömningen.'
    case 'unknown_goods_or_service':
      return 'Ange om inköpet gäller vara eller tjänst.'
    case 'unknown_supplier_vat_charged':
      return 'Ange om leverantören har debiterat moms.'
    case 'unknown_calculation_rate':
      return 'Ange vilken momssats som ska användas för beräkningen.'
    case 'unknown_deduction_entitlement':
      return 'Företagsprofilen saknar uppgift om avdragsrätt.'
    case 'unknown_vat_registration_status':
      return 'Företagsprofilen saknar uppgift om momsregistrering.'
    case 'unknown_foreign_purchase_reporting':
      return 'Företagsprofilen saknar uppgift om utländska inköp ska redovisas.'
    case 'foreign_purchase_reporting_requires_registration':
      return 'Företagsprofilen säger att utländska inköp ska redovisas utan att momsregistrering är angiven.'
    case 'registered_requires_vat_period_type':
      return 'Företagsprofilen saknar momsperiod.'
    case 'registered_requires_vat_reporting_from':
      return 'Företagsprofilen saknar startdatum för momshantering.'
    case 'vat_reporting_from_invalid_date':
      return 'Företagsprofilens startdatum för momshantering är ogiltigt.'
    case 'partial_deduction_requires_percent':
    case 'deduction_percent_requires_partial_entitlement':
    case 'deduction_percent_out_of_range':
      return 'Delvis avdragsrätt är inte färdig i detta momsflöde.'
    case 'unsupported_vat_treatment':
      if (error.path === 'supplierVatCharged') {
        return 'Leverantören har debiterat moms. Det stöds inte säkert här ännu.'
      }
      return 'Den här typen av utlandsinköp stöds inte säkert här ännu.'
    case 'unsupported_vat_v2_persistence_path':
      if (error.path === 'treatment.calculationRate') {
        return 'Den momssatsen stöds inte för bokning i detta VAT V2-steg ännu.'
      }
      if (error.path === 'treatment.deductibleInputVat.entitlement') {
        return 'Avdragsrätten är inte full. Det stöds inte för bokning i detta VAT V2-steg ännu.'
      }
      return 'Bedömningen är inte den stödda EU-tjänst med omvänd beskattning som detta steg hanterar.'
    case 'vat_v2_not_enabled':
      return 'VAT V2-förhandskontroll är inte aktiverad för transaktionen.'
    case 'unknown_domestic_sales_vat_treatment':
      return 'Företagsprofilen saknar uppgift om inhemsk försäljning.'
    default:
      return 'SoloLedger kan inte bedöma momsflödet säkert med uppgifterna som finns.'
  }
}
