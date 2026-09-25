import {
  type CompanyVatProfile,
  type VatFactsInput,
} from '../src/lib/vatDomain.ts'
import {
  decideVatTreatment,
  type VatTreatmentDecisionBlockCode,
  type VatTreatmentDecisionResult,
} from '../src/lib/vatTreatmentDecision.ts'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`✓ ${description}`)
    passed++
    return
  }

  console.error(`✗ ${description}`)
  console.error(`  Förväntat: ${expected}`)
  console.error(`  Faktiskt:   ${actual}`)
  failed++
}

function assertReady(
  result: VatTreatmentDecisionResult,
  description: string
) {
  assertEqual(result.status, 'ready', `${description} → ready`)
  assertEqual(result.validation.valid, true, `${description} → valid`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced a VatTreatment.`)
  }

  return result.treatment
}

function assertBlocked(
  result: VatTreatmentDecisionResult,
  code: VatTreatmentDecisionBlockCode,
  description: string
) {
  assertEqual(result.status, 'blocked', `${description} → blocked`)
  assertEqual(result.treatment, null, `${description} → no fake treatment`)

  const hasCode =
    result.status === 'blocked' &&
    result.validation.errors.some(error => error.code === code)

  assertEqual(hasCode, true, `${description} → ${code}`)
}

const ordinaryProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'taxable',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'not_required',
  vatPeriodType: 'month',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'full',
}

const jessikaProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'small_business_exempt',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'required',
  vatPeriodType: 'quarter',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'none',
}

const domesticSaleFacts: VatFactsInput = {
  companyProfile: ordinaryProfile,
  eventKind: 'sale',
  goodsOrService: 'service',
  supplierCountry: { kind: 'not_applicable' },
  customerCountry: { kind: 'country', code: 'SE' },
  supplierVatCharged: 'no',
  usedForBusiness: 'yes',
  calculationRate: 25,
  deductionEntitlement: 'unknown',
  accountingCategoryId: 'forsaljning',
  invoiceDate: '2026-02-01',
  amount: 1000,
  currency: 'SEK',
}

const domesticPurchaseFacts: VatFactsInput = {
  companyProfile: ordinaryProfile,
  eventKind: 'purchase',
  goodsOrService: 'goods',
  supplierCountry: { kind: 'country', code: 'SE' },
  customerCountry: { kind: 'not_applicable' },
  supplierVatCharged: 'yes',
  usedForBusiness: 'yes',
  calculationRate: 25,
  deductionEntitlement: 'full',
  accountingCategoryId: 'forbrukningsinventarier',
  invoiceDate: '2026-02-01',
  amount: 1000,
  currency: 'SEK',
}

const euServiceNoDeductionFacts: VatFactsInput = {
  companyProfile: jessikaProfile,
  eventKind: 'purchase',
  goodsOrService: 'service',
  supplierCountry: { kind: 'country', code: 'IE' },
  customerCountry: { kind: 'country', code: 'SE' },
  supplierVatCharged: 'no',
  usedForBusiness: 'yes',
  calculationRate: 25,
  deductionEntitlement: 'none',
  accountingCategoryId: 'programvaror',
  invoiceDate: '2026-02-01',
  amount: 228,
  currency: 'SEK',
}

console.log('\n=== SoloLedger VAT Treatment Decision Tests ===\n')

const domesticSale = assertReady(
  decideVatTreatment(domesticSaleFacts),
  'Domestic taxable sale'
)

assertEqual(
  domesticSale.code,
  'DOMESTIC_TAXABLE_SALE',
  'Domestic taxable sale → treatment code'
)
assertEqual(domesticSale.taxableBase, 1000, 'Domestic taxable sale → base')
assertEqual(domesticSale.outputVat.amount, 250, 'Domestic taxable sale → output VAT')
assertEqual(domesticSale.outputVat.reportField, '10', 'Domestic taxable sale → output field')
assertEqual(domesticSale.domesticSalesBaseField, '05', 'Domestic taxable sale → base field')
assertEqual(domesticSale.deductibleInputVat.amount, 0, 'Domestic taxable sale → no input VAT')

assertBlocked(
  decideVatTreatment({
    ...domesticSaleFacts,
    customerCountry: { kind: 'unknown' },
  }),
  'unknown_customer_country',
  'Unknown customer country blocks domestic sale'
)

assertBlocked(
  decideVatTreatment({
    ...domesticSaleFacts,
    customerCountry: { kind: 'country', code: 'NO' },
  }),
  'unsupported_vat_treatment',
  'Non-Swedish sale is unsupported in first slice'
)

const domesticPurchase = assertReady(
  decideVatTreatment(domesticPurchaseFacts),
  'Domestic deductible purchase'
)

assertEqual(
  domesticPurchase.code,
  'DOMESTIC_DEDUCTIBLE_PURCHASE',
  'Domestic deductible purchase → treatment code'
)
assertEqual(domesticPurchase.taxableBase, 1000, 'Domestic deductible purchase → base')
assertEqual(domesticPurchase.outputVat.amount, 0, 'Domestic deductible purchase → no output VAT')
assertEqual(domesticPurchase.deductibleInputVat.amount, 250, 'Domestic deductible purchase → input VAT')
assertEqual(domesticPurchase.deductibleInputVat.reportField, '48', 'Domestic deductible purchase → input field')
assertEqual(domesticPurchase.deductibleInputVat.entitlement, 'full', 'Domestic deductible purchase → full deduction')

assertBlocked(
  decideVatTreatment({
    ...domesticPurchaseFacts,
    supplierVatCharged: 'unknown',
  }),
  'unknown_supplier_vat_charged',
  'Unknown supplier VAT status blocks domestic purchase'
)

assertBlocked(
  decideVatTreatment({
    ...domesticPurchaseFacts,
    supplierVatCharged: 'no',
  }),
  'unsupported_vat_treatment',
  'Domestic purchase without supplier-charged VAT is unsupported in first slice'
)

assertBlocked(
  decideVatTreatment({
    ...domesticPurchaseFacts,
    deductionEntitlement: 'none',
  }),
  'unsupported_vat_treatment',
  'Domestic no-deduction purchase is outside verified first slice'
)

const euServiceNoDeduction = assertReady(
  decideVatTreatment(euServiceNoDeductionFacts),
  'Jessika EU service no deduction'
)

assertEqual(
  euServiceNoDeduction.code,
  'EU_SERVICE_REVERSE_CHARGE',
  'Jessika EU service no deduction → treatment code'
)
assertEqual(euServiceNoDeduction.taxableBase, 228, 'Jessika EU service no deduction → acquisition base')
assertEqual(euServiceNoDeduction.outputVat.amount, 57, 'Jessika EU service no deduction → output VAT')
assertEqual(euServiceNoDeduction.outputVat.reportField, '30', 'Jessika EU service no deduction → output field')
assertEqual(euServiceNoDeduction.acquisitionBaseField, '21', 'Jessika EU service no deduction → acquisition field')
assertEqual(euServiceNoDeduction.deductibleInputVat.amount, 0, 'Jessika EU service no deduction → no input VAT')
assertEqual(euServiceNoDeduction.deductibleInputVat.reportField, null, 'Jessika EU service no deduction → no input field')
assertEqual(euServiceNoDeduction.deductibleInputVat.entitlement, 'none', 'Jessika EU service no deduction → no deduction')

const euServiceFullDeduction = assertReady(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    deductionEntitlement: 'full',
  }),
  'EU service full deduction'
)

assertEqual(
  euServiceFullDeduction.code,
  'EU_SERVICE_REVERSE_CHARGE',
  'EU service full deduction → same treatment family'
)
assertEqual(euServiceFullDeduction.outputVat.amount, 57, 'EU service full deduction → output VAT')
assertEqual(euServiceFullDeduction.outputVat.reportField, '30', 'EU service full deduction → output field')
assertEqual(euServiceFullDeduction.deductibleInputVat.amount, 57, 'EU service full deduction → input VAT')
assertEqual(euServiceFullDeduction.deductibleInputVat.reportField, '48', 'EU service full deduction → input field')
assertEqual(euServiceFullDeduction.deductibleInputVat.entitlement, 'full', 'EU service full deduction → full deduction')

assertEqual(
  domesticSale.calculationRate,
  euServiceNoDeduction.calculationRate,
  'Same calculation rate can appear in different treatments'
)
assertEqual(
  domesticSale.code === euServiceNoDeduction.code,
  false,
  'Calculation rate is not the whole VAT treatment'
)

assertBlocked(
  decideVatTreatment({
    ...domesticSaleFacts,
    calculationRate: 'unknown',
  }),
  'unknown_calculation_rate',
  'Unknown rate blocks when VAT amount is required'
)

assertBlocked(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    supplierCountry: { kind: 'unknown' },
  }),
  'unknown_supplier_country',
  'Unknown supplier country blocks relevant purchase'
)

assertBlocked(
  decideVatTreatment({
    ...domesticPurchaseFacts,
    deductionEntitlement: 'unknown',
  }),
  'unknown_deduction_entitlement',
  'Unknown deduction entitlement blocks deductible purchase'
)

assertBlocked(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    supplierVatCharged: 'unknown',
  }),
  'unknown_supplier_vat_charged',
  'Unknown supplier VAT status blocks EU service purchase'
)

assertBlocked(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    supplierVatCharged: 'yes',
  }),
  'unsupported_vat_treatment',
  'Supplier-charged foreign VAT is unsupported in first slice'
)

assertBlocked(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    companyProfile: {
      ...jessikaProfile,
      vatRegistrationStatus: 'unknown',
      foreignPurchaseReporting: 'not_required',
    },
  }),
  'unknown_vat_registration_status',
  'Unknown VAT registration blocks EU service purchase'
)

assertBlocked(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    companyProfile: {
      ...jessikaProfile,
      foreignPurchaseReporting: 'unknown',
    },
  }),
  'unknown_foreign_purchase_reporting',
  'Unknown foreign purchase reporting blocks EU service purchase'
)

assertBlocked(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    deductionEntitlement: 'partial',
  }),
  'unsupported_vat_treatment',
  'Partial deduction is unsupported in first slice'
)

assertBlocked(
  decideVatTreatment({
    ...domesticSaleFacts,
    companyProfile: {
      ...ordinaryProfile,
      domesticSalesVatTreatment: 'unknown',
    },
  }),
  'unknown_domestic_sales_vat_treatment',
  'Unknown domestic sales treatment blocks domestic sale'
)

assertBlocked(
  decideVatTreatment({
    ...domesticSaleFacts,
    companyProfile: {
      ...ordinaryProfile,
      domesticSalesVatTreatment: 'mixed',
    },
  }),
  'unsupported_vat_treatment',
  'Mixed domestic sales treatment is unsupported in first slice'
)

assertBlocked(
  decideVatTreatment({
    ...domesticSaleFacts,
    amount: Number.POSITIVE_INFINITY,
  }),
  'invalid_amount',
  'Infinite amount blocks treatment'
)

assertBlocked(
  decideVatTreatment({
    ...domesticSaleFacts,
    amount: -1,
  }),
  'invalid_amount',
  'Negative amount blocks treatment'
)

assertBlocked(
  decideVatTreatment({
    ...euServiceNoDeductionFacts,
    companyProfile: {
      ...jessikaProfile,
      vatRegistrationStatus: 'not_registered',
    },
  }),
  'foreign_purchase_reporting_requires_registration',
  'Invalid CompanyVatProfile blocks before treatment'
)

console.log('\n-----------------------------------')
console.log(`Godkända tester: ${passed}`)
console.log(`Misslyckade tester: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('✓ Alla VAT treatment decision-tester godkända.\n')
}
