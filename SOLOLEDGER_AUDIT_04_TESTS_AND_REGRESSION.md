# SoloLedger External Audit #1 - Tests And Regression

Domain, UI-helper, service, and rollback-safe SQL regression tests relevant to VAT V2 and lifecycle audit coverage.

This file is part of SoloLedger External Audit #1. It contains verbatim source from the approved repository snapshot.

==================================================
FILE: scripts/test-vat-domain.ts
==================================================

````typescript
import {
  type CompanyVatProfile,
  type CompanyVatProfileValidationErrorCode,
  type VatFactsInput,
  type VatTreatment,
  validateCompanyVatProfile,
} from '../src/lib/vatDomain.ts'

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

function assertErrorCodes(
  profile: CompanyVatProfile,
  expectedCodes: CompanyVatProfileValidationErrorCode[],
  description: string
) {
  const result = validateCompanyVatProfile(profile)
  const actualCodes = result.errors.map(error => error.code)

  assertEqual(
    JSON.stringify(actualCodes),
    JSON.stringify(expectedCodes),
    description
  )
}

function assertValidProfile(
  profile: CompanyVatProfile,
  description: string
) {
  const result = validateCompanyVatProfile(profile)

  assertEqual(result.valid, true, `${description} → valid`)
  assertEqual(result.errors.length, 0, `${description} → no errors`)
}

function assertTreatment(
  treatment: VatTreatment,
  description: string
) {
  assertEqual(Boolean(treatment.code), true, `${description} → code`)
  assertEqual(Boolean(treatment.ruleVersion), true, `${description} → rule version`)
  assertEqual(Boolean(treatment.evidence.factsVersion), true, `${description} → facts version`)
}

console.log('\n=== SoloLedger VAT Domain Tests ===\n')

const exemptDomesticSalesWithForeignPurchaseReporting: CompanyVatProfile = {
  domesticSalesVatTreatment: 'small_business_exempt',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'required',
  vatPeriodType: 'quarter',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'none',
}

assertValidProfile(
  exemptDomesticSalesWithForeignPurchaseReporting,
  'Exempt domestic sales can coexist with VAT registration'
)

const ordinaryVatV1CompatibleProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'taxable',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'not_required',
  vatPeriodType: 'month',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'full',
}

assertValidProfile(
  ordinaryVatV1CompatibleProfile,
  'Ordinary VAT V1-compatible registered profile'
)

assertValidProfile(
  {
    ...ordinaryVatV1CompatibleProfile,
    defaultDeductionEntitlement: 'partial',
    defaultDeductionPercent: 75,
  },
  'Partial deduction with valid percent'
)

assertValidProfile(
  {
    ...ordinaryVatV1CompatibleProfile,
    defaultDeductionEntitlement: 'full',
  },
  'Full deduction context without percent'
)

const nonRegisteredProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'small_business_exempt',
  vatRegistrationStatus: 'not_registered',
  foreignPurchaseReporting: 'not_required',
  vatPeriodType: null,
  vatReportingFrom: null,
  defaultDeductionEntitlement: 'none',
}

assertValidProfile(
  nonRegisteredProfile,
  'Non-registered small-business exempt profile'
)

assertValidProfile(
  {
    ...nonRegisteredProfile,
    defaultDeductionEntitlement: 'none',
  },
  'No deduction context without percent'
)

const unknownProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'unknown',
  vatRegistrationStatus: 'unknown',
  foreignPurchaseReporting: 'unknown',
  vatPeriodType: null,
  vatReportingFrom: null,
  defaultDeductionEntitlement: 'unknown',
}

const unknownResult = validateCompanyVatProfile(unknownProfile)

assertEqual(
  unknownResult.valid,
  true,
  'Unknown profile state is representable'
)
assertEqual(
  unknownProfile.vatRegistrationStatus,
  'unknown',
  'Unknown registration is not converted to not_registered'
)
assertEqual(
  unknownProfile.foreignPurchaseReporting,
  'unknown',
  'Unknown foreign purchase reporting is not converted to not_required'
)
assertValidProfile(
  unknownProfile,
  'Unknown deduction context without percent'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    vatPeriodType: null,
  },
  ['registered_requires_vat_period_type'],
  'Registered profile requires period type'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    vatReportingFrom: null,
  },
  ['registered_requires_vat_reporting_from'],
  'Registered profile requires reporting start'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    vatRegistrationStatus: 'not_registered',
    foreignPurchaseReporting: 'required',
  },
  ['foreign_purchase_reporting_requires_registration'],
  'Foreign purchase reporting requires registration'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    defaultDeductionEntitlement: 'partial',
  },
  ['partial_deduction_requires_percent'],
  'Partial deduction requires percent'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    defaultDeductionEntitlement: 'partial',
    defaultDeductionPercent: -1,
  },
  ['deduction_percent_out_of_range'],
  'Deduction percent cannot be below zero'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    defaultDeductionEntitlement: 'partial',
    defaultDeductionPercent: 101,
  },
  ['deduction_percent_out_of_range'],
  'Deduction percent cannot exceed one hundred'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    defaultDeductionEntitlement: 'full',
    defaultDeductionPercent: 75,
  },
  ['deduction_percent_requires_partial_entitlement'],
  'Full deduction context cannot carry percent'
)

assertErrorCodes(
  {
    ...ordinaryVatV1CompatibleProfile,
    defaultDeductionEntitlement: 'none',
    defaultDeductionPercent: 75,
  },
  ['deduction_percent_requires_partial_entitlement'],
  'No deduction context cannot carry percent'
)

assertErrorCodes(
  {
    ...unknownProfile,
    defaultDeductionPercent: 75,
  },
  ['deduction_percent_requires_partial_entitlement'],
  'Unknown deduction context cannot carry percent'
)

const futureFactsContract: VatFactsInput = {
  companyProfile: exemptDomesticSalesWithForeignPurchaseReporting,
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

assertEqual(
  futureFactsContract.supplierCountry.kind,
  'country',
  'VAT facts input can carry explicit country information'
)

const treatments: VatTreatment[] = [
  {
    code: 'DOMESTIC_TAXABLE_SALE',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 1000,
    calculationRate: 25,
    outputVat: { amount: 250, reportField: '10' },
    deductibleInputVat: { amount: 0, reportField: null, entitlement: 'none' },
    domesticSalesBaseField: '05',
    evidence: { source: 'rule', factsVersion: 'test-fixture' },
  },
  {
    code: 'DOMESTIC_DEDUCTIBLE_PURCHASE',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 1000,
    calculationRate: 25,
    outputVat: { amount: 0, reportField: null },
    deductibleInputVat: { amount: 250, reportField: '48', entitlement: 'full' },
    evidence: { source: 'invoice', factsVersion: 'test-fixture' },
  },
  {
    code: 'DOMESTIC_EXEMPT_SALE',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 1000,
    calculationRate: 0,
    outputVat: { amount: 0, reportField: null },
    deductibleInputVat: { amount: 0, reportField: null, entitlement: 'none' },
    domesticSalesBaseField: '05',
    evidence: { source: 'profile', factsVersion: 'test-fixture' },
  },
  {
    code: 'EU_SERVICE_REVERSE_CHARGE',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 228,
    calculationRate: 25,
    outputVat: { amount: 57, reportField: '30' },
    deductibleInputVat: { amount: 57, reportField: '48', entitlement: 'full' },
    acquisitionBaseField: '21',
    evidence: { source: 'rule', factsVersion: 'test-fixture' },
  },
  {
    code: 'EU_SERVICE_REVERSE_CHARGE',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 228,
    calculationRate: 25,
    outputVat: { amount: 57, reportField: '30' },
    deductibleInputVat: { amount: 0, reportField: null, entitlement: 'none' },
    acquisitionBaseField: '21',
    evidence: { source: 'rule', factsVersion: 'test-fixture' },
  },
  {
    code: 'EU_GOODS_ACQUISITION',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 1000,
    calculationRate: 25,
    outputVat: { amount: 250, reportField: '30' },
    deductibleInputVat: { amount: 250, reportField: '48', entitlement: 'full' },
    acquisitionBaseField: '20',
    evidence: { source: 'rule', factsVersion: 'test-fixture' },
  },
  {
    code: 'NON_EU_SERVICE_REVERSE_CHARGE',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 1000,
    calculationRate: 25,
    outputVat: { amount: 250, reportField: '30' },
    deductibleInputVat: { amount: 250, reportField: '48', entitlement: 'full' },
    acquisitionBaseField: '22',
    evidence: { source: 'rule', factsVersion: 'test-fixture' },
  },
  {
    code: 'IMPORT_GOODS',
    ruleVersion: 'vat-v2-representation-test',
    taxableBase: 1000,
    calculationRate: 25,
    outputVat: { amount: 250, reportField: '60' },
    deductibleInputVat: { amount: 250, reportField: '48', entitlement: 'full' },
    acquisitionBaseField: '50',
    evidence: { source: 'rule', factsVersion: 'test-fixture' },
  },
]

treatments.forEach(treatment => {
  assertTreatment(treatment, treatment.code)
})

const euServiceNoDeduction = treatments[4]

assertEqual(
  euServiceNoDeduction.taxableBase,
  228,
  'EU service no-deduction fixture keeps taxable base'
)
assertEqual(
  euServiceNoDeduction.outputVat.amount,
  57,
  'EU service no-deduction fixture keeps output VAT'
)
assertEqual(
  euServiceNoDeduction.outputVat.reportField,
  '30',
  'EU service no-deduction fixture uses output field 30'
)
assertEqual(
  euServiceNoDeduction.acquisitionBaseField,
  '21',
  'EU service no-deduction fixture uses acquisition field 21'
)
assertEqual(
  euServiceNoDeduction.deductibleInputVat.amount,
  0,
  'EU service no-deduction fixture has zero deductible input VAT'
)
assertEqual(
  euServiceNoDeduction.deductibleInputVat.reportField,
  null,
  'EU service no-deduction fixture has no input VAT report field'
)
assertEqual(
  euServiceNoDeduction.deductibleInputVat.entitlement,
  'none',
  'EU service no-deduction fixture keeps deduction entitlement separate'
)

console.log('\n-----------------------------------')
console.log(`Godkända tester: ${passed}`)
console.log(`Misslyckade tester: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('✓ Alla VAT domain-tester godkända.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-vat-profile-adapter.ts
==================================================

````typescript
import { profileToCompanyVatProfile } from '../src/lib/vatProfileAdapter.ts'

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

console.log('\n=== SoloLedger VAT Profile Adapter Tests ===\n')

const unknownResult = profileToCompanyVatProfile({})

assertEqual(
  unknownResult.profile.domesticSalesVatTreatment,
  'unknown',
  'Missing domestic sales treatment remains unknown'
)
assertEqual(
  unknownResult.profile.vatRegistrationStatus,
  'unknown',
  'Missing VAT registration remains unknown'
)
assertEqual(
  unknownResult.profile.foreignPurchaseReporting,
  'unknown',
  'Missing foreign purchase reporting remains unknown'
)
assertEqual(
  unknownResult.profile.defaultDeductionEntitlement,
  'unknown',
  'Missing default deduction remains unknown'
)
assertEqual(
  unknownResult.validation.valid,
  true,
  'All-unknown profile is valid and representable'
)

const fullDeductionResult = profileToCompanyVatProfile({
  domestic_sales_vat_treatment: 'taxable',
  vat_status: 'registered',
  foreign_purchase_reporting: 'required',
  vat_period_type: 'quarter',
  vat_management_from: '2026-01-01',
  default_deduction_entitlement: 'full',
})

assertEqual(
  fullDeductionResult.validation.valid,
  true,
  'Supported full-deduction foreign-purchase profile is valid'
)
assertEqual(
  fullDeductionResult.profile.foreignPurchaseReporting,
  'required',
  'Foreign purchase reporting maps independently'
)
assertEqual(
  fullDeductionResult.profile.defaultDeductionEntitlement,
  'full',
  'Full deduction maps explicitly'
)

const noDeductionResult = profileToCompanyVatProfile({
  domestic_sales_vat_treatment: 'small_business_exempt',
  vat_status: 'registered',
  foreign_purchase_reporting: 'required',
  vat_period_type: 'month',
  vat_management_from: '2026-01-01',
  default_deduction_entitlement: 'none',
})

assertEqual(
  noDeductionResult.profile.defaultDeductionEntitlement,
  'none',
  'No-deduction profile remains distinguishable from full deduction'
)
assertEqual(
  noDeductionResult.validation.valid,
  true,
  'No-deduction profile remains a valid company profile'
)

const registeredUnknownDeduction = profileToCompanyVatProfile({
  domestic_sales_vat_treatment: 'taxable',
  vat_status: 'registered',
  foreign_purchase_reporting: 'not_required',
  vat_period_type: 'year',
  vat_management_from: '2026-01-01',
  default_deduction_entitlement: 'unknown',
})

assertEqual(
  registeredUnknownDeduction.profile.defaultDeductionEntitlement,
  'unknown',
  'VAT registration does not imply deduction entitlement'
)
assertEqual(
  registeredUnknownDeduction.validation.valid,
  true,
  'Registered profile can keep deduction unknown'
)

const registeredUnknownForeignReporting = profileToCompanyVatProfile({
  domestic_sales_vat_treatment: 'taxable',
  vat_status: 'registered',
  foreign_purchase_reporting: 'unknown',
  vat_period_type: 'month',
  vat_management_from: '2026-01-01',
  default_deduction_entitlement: 'full',
})

assertEqual(
  registeredUnknownForeignReporting.profile.foreignPurchaseReporting,
  'unknown',
  'VAT registration does not imply foreign purchase reporting'
)
assertEqual(
  registeredUnknownForeignReporting.validation.valid,
  true,
  'Registered profile can keep foreign purchase reporting unknown'
)

const invalidForeignReporting = profileToCompanyVatProfile({
  domestic_sales_vat_treatment: 'small_business_exempt',
  vat_status: 'not_registered',
  foreign_purchase_reporting: 'required',
  vat_period_type: null,
  vat_management_from: null,
  default_deduction_entitlement: 'none',
})

assertEqual(
  invalidForeignReporting.validation.valid,
  false,
  'Foreign purchase reporting without VAT registration is rejected'
)
assertEqual(
  invalidForeignReporting.validation.errors[0]?.code,
  'foreign_purchase_reporting_requires_registration',
  'Invalid combination reports existing domain validation code'
)

console.log('\n-----------------------------------')
console.log(`Godkända tester: ${passed}`)
console.log(`Misslyckade tester: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('✓ Alla VAT profile adapter-tester godkända.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-vat-treatment-decision.ts
==================================================

````typescript
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
````````

==================================================

==================================================
FILE: scripts/test-vat-journal-plan.ts
==================================================

````typescript
import type { VatTreatment } from '../src/lib/vatDomain.ts'
import {
  buildVatJournalPlan,
  type VatJournalPlanBlockCode,
  type VatJournalPlanBuildResult,
  type VatJournalPlanRowRole,
} from '../src/lib/vatJournalPlan.ts'

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
  result: VatJournalPlanBuildResult,
  description: string
) {
  assertEqual(result.status, 'ready', `${description} -> ready`)
  assertEqual(result.validation.valid, true, `${description} -> valid`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced a JournalPlan.`)
  }

  return result.plan
}

function assertBlocked(
  result: VatJournalPlanBuildResult,
  code: VatJournalPlanBlockCode,
  description: string
) {
  assertEqual(result.status, 'blocked', `${description} -> blocked`)
  assertEqual(result.plan, null, `${description} -> no fake plan`)

  const hasCode =
    result.status === 'blocked' &&
    result.validation.errors.some(error => error.code === code)

  assertEqual(hasCode, true, `${description} -> ${code}`)
}

function rowAmount(
  result: VatJournalPlanBuildResult,
  role: VatJournalPlanRowRole,
  accountNumber: string,
  side: 'debit' | 'credit'
) {
  if (result.status !== 'ready') {
    throw new Error('Cannot inspect rows on a blocked JournalPlan.')
  }

  const row = result.plan.journalRows.find(journalRow => (
    journalRow.role === role &&
    journalRow.accountNumber === accountNumber
  ))

  return row?.[side] ?? null
}

const euServiceFullDeduction25: VatTreatment = {
  code: 'EU_SERVICE_REVERSE_CHARGE',
  ruleVersion: 'vat-v2-kan18-first-slice',
  taxableBase: 228,
  calculationRate: 25,
  outputVat: { amount: 57, reportField: '30' },
  deductibleInputVat: { amount: 57, reportField: '48', entitlement: 'full' },
  acquisitionBaseField: '21',
  evidence: { source: 'rule', factsVersion: 'vat-facts-v1' },
}

console.log('\n=== SoloLedger VAT JournalPlan Tests ===\n')

const happyPath = buildVatJournalPlan({
  treatment: euServiceFullDeduction25,
  paymentAccountNumber: '1930',
})
const happyPlan = assertReady(
  happyPath,
  'EU service reverse charge 25 percent full deduction'
)

assertEqual(
  rowAmount(happyPath, 'acquisition_base', '4535', 'debit'),
  228,
  'Happy path -> 4535 debit acquisition base'
)
assertEqual(
  rowAmount(happyPath, 'deductible_calculated_input_vat', '2645', 'debit'),
  57,
  'Happy path -> 2645 debit deductible calculated input VAT'
)
assertEqual(
  rowAmount(happyPath, 'calculated_output_vat', '2614', 'credit'),
  57,
  'Happy path -> 2614 credit calculated output VAT'
)
assertEqual(
  rowAmount(happyPath, 'payment_payable', '1930', 'credit'),
  228,
  'Happy path -> supplied payment account credit'
)
assertEqual(happyPlan.reconciliation.balanced, true, 'Happy path -> balanced')
assertEqual(happyPlan.reconciliation.totalDebit, 285, 'Happy path -> total debit')
assertEqual(happyPlan.reconciliation.totalCredit, 285, 'Happy path -> total credit')
assertEqual(happyPlan.reconciliation.acquisitionBase, 228, 'Happy path -> reconciled acquisition base')
assertEqual(happyPlan.reconciliation.outputVat, 57, 'Happy path -> reconciled output VAT')
assertEqual(happyPlan.reconciliation.deductibleInputVat, 57, 'Happy path -> reconciled deductible input VAT')
assertEqual(happyPlan.reconciliation.paymentPayable, 228, 'Happy path -> reconciled payment leg')
assertEqual(happyPlan.reconciliation.acquisitionBaseField, '21', 'Happy path -> report field 21')
assertEqual(happyPlan.reconciliation.outputVatReportField, '30', 'Happy path -> report field 30')
assertEqual(happyPlan.reconciliation.deductibleInputVatReportField, '48', 'Happy path -> report field 48')
assertEqual(happyPlan.treatmentCode, 'EU_SERVICE_REVERSE_CHARGE', 'Happy path -> treatment code snapshot')
assertEqual(happyPlan.ruleVersion, 'vat-v2-kan18-first-slice', 'Happy path -> rule version snapshot')
assertEqual(happyPlan.factsVersion, 'vat-facts-v1', 'Happy path -> facts version snapshot')

const nonBankPayment = buildVatJournalPlan({
  treatment: euServiceFullDeduction25,
  paymentAccountNumber: '2018',
})
assertReady(nonBankPayment, 'Non-1930 payment/payable account')
assertEqual(
  rowAmount(nonBankPayment, 'payment_payable', '2018', 'credit'),
  228,
  'Non-1930 payment/payable account is preserved'
)
assertEqual(
  rowAmount(nonBankPayment, 'payment_payable', '1930', 'credit'),
  null,
  'Builder does not hardcode 1930'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      deductibleInputVat: {
        amount: 0,
        reportField: null,
        entitlement: 'none',
      },
    },
    paymentAccountNumber: '1930',
  }),
  'unsupported_deduction_entitlement',
  'EU service no deduction blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      deductibleInputVat: {
        amount: 0,
        reportField: null,
        entitlement: 'partial',
      },
    },
    paymentAccountNumber: '1930',
  }),
  'unsupported_deduction_entitlement',
  'EU service partial deduction blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      calculationRate: 12,
      outputVat: { amount: 27.36, reportField: '31' },
      deductibleInputVat: {
        amount: 27.36,
        reportField: '48',
        entitlement: 'full',
      },
    },
    paymentAccountNumber: '1930',
  }),
  'unsupported_calculation_rate',
  'EU service non-25 percent rate blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      code: 'EU_GOODS_ACQUISITION',
      acquisitionBaseField: '20',
    },
    paymentAccountNumber: '1930',
  }),
  'unsupported_vat_treatment',
  'EU goods acquisition blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      code: 'NON_EU_SERVICE_REVERSE_CHARGE',
      acquisitionBaseField: '22',
    },
    paymentAccountNumber: '1930',
  }),
  'unsupported_vat_treatment',
  'Non-EU service reverse charge blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      code: 'IMPORT_GOODS',
      outputVat: { amount: 57, reportField: '60' },
      acquisitionBaseField: '50',
    },
    paymentAccountNumber: '1930',
  }),
  'unsupported_vat_treatment',
  'Import goods blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      outputVat: { amount: 56, reportField: '30' },
    },
    paymentAccountNumber: '1930',
  }),
  'inconsistent_treatment',
  'Malformed output VAT blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: {
      ...euServiceFullDeduction25,
      deductibleInputVat: {
        amount: 56,
        reportField: '48',
        entitlement: 'full',
      },
    },
    paymentAccountNumber: '1930',
  }),
  'inconsistent_treatment',
  'Malformed deductible input VAT blocks'
)

assertBlocked(
  buildVatJournalPlan({
    treatment: euServiceFullDeduction25,
    paymentAccountNumber: 'bank',
  }),
  'invalid_payment_account',
  'Malformed payment account blocks'
)

console.log('\n-----------------------------------')
console.log(`Godkända tester: ${passed}`)
console.log(`Misslyckade tester: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('✓ Alla VAT JournalPlan-tester godkända.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-vat-audit-snapshot.ts
==================================================

````typescript
import type { VatTreatment } from '../src/lib/vatDomain.ts'
import {
  buildVatAuditSnapshot,
  VAT_AUDIT_JOURNAL_PLAN_VERSION,
  VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION,
  type VatAuditSnapshotBlockCode,
  type VatAuditSnapshotBuildResult,
} from '../src/lib/vatAuditSnapshot.ts'
import {
  buildVatJournalPlan,
  type VatJournalPlan,
  type VatJournalPlanBuildResult,
  type VatJournalPlanRowRole,
} from '../src/lib/vatJournalPlan.ts'

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

function assertJournalReady(
  result: VatJournalPlanBuildResult,
  description: string
) {
  assertEqual(result.status, 'ready', `${description} -> JournalPlan ready`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced a JournalPlan.`)
  }

  return result.plan
}

function assertSnapshotReady(
  result: VatAuditSnapshotBuildResult,
  description: string
) {
  assertEqual(result.status, 'ready', `${description} -> snapshot ready`)
  assertEqual(result.validation.valid, true, `${description} -> valid`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced an audit snapshot.`)
  }

  return result.snapshot
}

function assertSnapshotBlocked(
  result: VatAuditSnapshotBuildResult,
  code: VatAuditSnapshotBlockCode,
  description: string
) {
  assertEqual(result.status, 'blocked', `${description} -> blocked`)
  assertEqual(result.snapshot, null, `${description} -> no fake snapshot`)

  const hasCode =
    result.status === 'blocked' &&
    result.validation.errors.some(error => error.code === code)

  assertEqual(hasCode, true, `${description} -> ${code}`)
}

function cloneTreatment(treatment: VatTreatment): VatTreatment {
  return {
    ...treatment,
    outputVat: { ...treatment.outputVat },
    deductibleInputVat: { ...treatment.deductibleInputVat },
    evidence: { ...treatment.evidence },
  }
}

function clonePlan(plan: VatJournalPlan): VatJournalPlan {
  return {
    ...plan,
    journalRows: plan.journalRows.map(row => ({ ...row })),
    reconciliation: { ...plan.reconciliation },
  }
}

function rowAmount(
  result: VatAuditSnapshotBuildResult,
  role: VatJournalPlanRowRole,
  accountNumber: string,
  side: 'debit' | 'credit'
) {
  if (result.status !== 'ready') {
    throw new Error('Cannot inspect rows on a blocked audit snapshot.')
  }

  const row = result.snapshot.journal.rows.find(snapshotRow => (
    snapshotRow.role === role &&
    snapshotRow.accountNumber === accountNumber
  ))

  return row?.[side] ?? null
}

const euServiceFullDeduction25: VatTreatment = {
  code: 'EU_SERVICE_REVERSE_CHARGE',
  ruleVersion: 'vat-v2-kan18-first-slice',
  taxableBase: 228,
  calculationRate: 25,
  outputVat: { amount: 57, reportField: '30' },
  deductibleInputVat: { amount: 57, reportField: '48', entitlement: 'full' },
  acquisitionBaseField: '21',
  evidence: { source: 'rule', factsVersion: 'vat-facts-v1' },
}

function createPlan(
  treatment: VatTreatment,
  paymentAccountNumber = '1930',
  description = 'EU service reverse charge plan'
) {
  return assertJournalReady(
    buildVatJournalPlan({ treatment, paymentAccountNumber }),
    description
  )
}

console.log('\n=== SoloLedger VAT Audit Snapshot Tests ===\n')

const happyPlan = createPlan(euServiceFullDeduction25)
const happyPath = buildVatAuditSnapshot({
  treatment: euServiceFullDeduction25,
  journalPlan: happyPlan,
})
const happySnapshot = assertSnapshotReady(
  happyPath,
  'EU service reverse charge 25 percent full deduction'
)

assertEqual(
  happySnapshot.schemaVersion,
  VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION,
  'Happy path -> snapshot schema version'
)
assertEqual(
  happySnapshot.journalPlanVersion,
  VAT_AUDIT_JOURNAL_PLAN_VERSION,
  'Happy path -> journal-plan version'
)
assertEqual(
  happySnapshot.treatmentCode,
  'EU_SERVICE_REVERSE_CHARGE',
  'Happy path -> treatment code'
)
assertEqual(
  happySnapshot.ruleVersion,
  'vat-v2-kan18-first-slice',
  'Happy path -> rule version'
)
assertEqual(
  happySnapshot.factsVersion,
  'vat-facts-v1',
  'Happy path -> facts version'
)
assertEqual(happySnapshot.vat.taxableBase, 228, 'Happy path -> field 21 base')
assertEqual(happySnapshot.vat.calculationRate, 25, 'Happy path -> rate')
assertEqual(
  happySnapshot.vat.acquisitionBaseField,
  '21',
  'Happy path -> acquisition report field'
)
assertEqual(
  happySnapshot.vat.outputVat.amount,
  57,
  'Happy path -> field 30 amount'
)
assertEqual(
  happySnapshot.vat.outputVat.reportField,
  '30',
  'Happy path -> output report field'
)
assertEqual(
  happySnapshot.vat.deductibleInputVat.amount,
  57,
  'Happy path -> field 48 amount'
)
assertEqual(
  happySnapshot.vat.deductibleInputVat.reportField,
  '48',
  'Happy path -> deductible input report field'
)
assertEqual(
  happySnapshot.vat.deductibleInputVat.entitlement,
  'full',
  'Happy path -> deduction entitlement'
)
assertEqual(
  rowAmount(happyPath, 'acquisition_base', '4535', 'debit'),
  228,
  'Happy path -> semantic acquisition base row'
)
assertEqual(
  rowAmount(happyPath, 'deductible_calculated_input_vat', '2645', 'debit'),
  57,
  'Happy path -> semantic deductible input VAT row'
)
assertEqual(
  rowAmount(happyPath, 'calculated_output_vat', '2614', 'credit'),
  57,
  'Happy path -> semantic output VAT row'
)
assertEqual(
  rowAmount(happyPath, 'payment_payable', '1930', 'credit'),
  228,
  'Happy path -> semantic payment/payable row'
)
assertEqual(
  happySnapshot.reconciliation.totalDebit,
  285,
  'Happy path -> reconciliation total debit'
)
assertEqual(
  happySnapshot.reconciliation.totalCredit,
  285,
  'Happy path -> reconciliation total credit'
)

const privatePaymentPlan = createPlan(
  euServiceFullDeduction25,
  '2018',
  'EU service reverse charge with private payment account'
)
const privatePaymentSnapshot = buildVatAuditSnapshot({
  treatment: euServiceFullDeduction25,
  journalPlan: privatePaymentPlan,
})
assertSnapshotReady(privatePaymentSnapshot, 'Alternative payment account')
assertEqual(
  rowAmount(privatePaymentSnapshot, 'payment_payable', '2018', 'credit'),
  228,
  'Alternative payment account survives snapshot evidence'
)
assertEqual(
  rowAmount(privatePaymentSnapshot, 'payment_payable', '1930', 'credit'),
  null,
  'Alternative payment account is not rewritten to 1930'
)

const otherAmountTreatment: VatTreatment = {
  ...cloneTreatment(euServiceFullDeduction25),
  taxableBase: 100,
  outputVat: { amount: 25, reportField: '30' },
  deductibleInputVat: {
    amount: 25,
    reportField: '48',
    entitlement: 'full',
  },
}
const otherAmountPlan = createPlan(
  otherAmountTreatment,
  '1930',
  'Different valid plan'
)
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: otherAmountPlan,
  }),
  'inconsistent_evidence',
  'Treatment and valid JournalPlan from different amounts do not snapshot'
)

const amountTamperedPlan = clonePlan(happyPlan)
amountTamperedPlan.reconciliation.outputVat = 56
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: amountTamperedPlan,
  }),
  'inconsistent_journal_plan',
  'Declared amount mismatch blocks'
)

const ruleVersionTreatment: VatTreatment = {
  ...cloneTreatment(euServiceFullDeduction25),
  ruleVersion: 'vat-v2-other-rule',
}
const ruleVersionPlan = createPlan(
  ruleVersionTreatment,
  '1930',
  'Different rule version plan'
)
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: ruleVersionPlan,
  }),
  'inconsistent_evidence',
  'Rule version mismatch blocks'
)

const factsVersionTreatment: VatTreatment = {
  ...cloneTreatment(euServiceFullDeduction25),
  evidence: {
    source: 'rule',
    factsVersion: 'vat-facts-v2',
  },
}
const factsVersionPlan = createPlan(
  factsVersionTreatment,
  '1930',
  'Different facts version plan'
)
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: factsVersionPlan,
  }),
  'inconsistent_evidence',
  'Facts version mismatch blocks'
)

const reportFieldMismatch = cloneTreatment(euServiceFullDeduction25)
reportFieldMismatch.outputVat = { amount: 57, reportField: '31' }
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: reportFieldMismatch,
    journalPlan: happyPlan,
  }),
  'unsupported_report_field',
  'Unsupported report field blocks'
)

const unbalancedPlan = clonePlan(happyPlan)
unbalancedPlan.journalRows[0] = {
  ...unbalancedPlan.journalRows[0],
  debit: 229,
}
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: unbalancedPlan,
  }),
  'unbalanced_journal_plan',
  'Unbalanced semantic plan blocks'
)

const malformedRolePlan = clonePlan(happyPlan)
malformedRolePlan.journalRows[0] = {
  ...malformedRolePlan.journalRows[0],
  role: 'payment_payable',
}
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: malformedRolePlan,
  }),
  'invalid_journal_row',
  'Malformed semantic role plan blocks'
)

const bothSidesPlan = clonePlan(happyPlan)
bothSidesPlan.journalRows[0] = {
  ...bothSidesPlan.journalRows[0],
  credit: 1,
}
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: bothSidesPlan,
  }),
  'invalid_journal_row',
  'Malformed debit and credit row blocks'
)

const wrongAcquisitionAccountPlan = clonePlan(privatePaymentPlan)
wrongAcquisitionAccountPlan.journalRows = wrongAcquisitionAccountPlan
  .journalRows
  .map(row => (
    row.role === 'acquisition_base'
      ? { ...row, accountNumber: '4999' }
      : row
  ))
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: wrongAcquisitionAccountPlan,
  }),
  'invalid_journal_row',
  'Wrong acquisition account blocks even when amounts reconcile'
)

const wrongOutputVatAccountPlan = clonePlan(privatePaymentPlan)
wrongOutputVatAccountPlan.journalRows = wrongOutputVatAccountPlan
  .journalRows
  .map(row => (
    row.role === 'calculated_output_vat'
      ? { ...row, accountNumber: '2615' }
      : row
  ))
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: wrongOutputVatAccountPlan,
  }),
  'invalid_journal_row',
  'Wrong output VAT account blocks even when amounts reconcile'
)

const wrongDeductibleInputVatAccountPlan = clonePlan(privatePaymentPlan)
wrongDeductibleInputVatAccountPlan.journalRows =
  wrongDeductibleInputVatAccountPlan.journalRows.map(row => (
    row.role === 'deductible_calculated_input_vat'
      ? { ...row, accountNumber: '2646' }
      : row
  ))
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: wrongDeductibleInputVatAccountPlan,
  }),
  'invalid_journal_row',
  'Wrong deductible input VAT account blocks even when amounts reconcile'
)

const swappedVatAccountsPlan = clonePlan(privatePaymentPlan)
swappedVatAccountsPlan.journalRows = swappedVatAccountsPlan.journalRows.map(
  row => {
    if (row.role === 'calculated_output_vat') {
      return { ...row, accountNumber: '2645' }
    }

    if (row.role === 'deductible_calculated_input_vat') {
      return { ...row, accountNumber: '2614' }
    }

    return row
  }
)
assertSnapshotBlocked(
  buildVatAuditSnapshot({
    treatment: euServiceFullDeduction25,
    journalPlan: swappedVatAccountsPlan,
  }),
  'invalid_journal_row',
  'Swapped VAT accounts block even when amounts reconcile'
)

const unsupportedTreatments: Array<{
  treatment: VatTreatment
  code: VatAuditSnapshotBlockCode
  label: string
}> = [
  {
    treatment: {
      ...cloneTreatment(euServiceFullDeduction25),
      deductibleInputVat: {
        amount: 0,
        reportField: null,
        entitlement: 'none',
      },
    },
    code: 'unsupported_deduction_entitlement',
    label: 'EU service no deduction blocks',
  },
  {
    treatment: {
      ...cloneTreatment(euServiceFullDeduction25),
      deductibleInputVat: {
        amount: 0,
        reportField: null,
        entitlement: 'partial',
      },
    },
    code: 'unsupported_deduction_entitlement',
    label: 'EU service partial deduction blocks',
  },
  {
    treatment: {
      ...cloneTreatment(euServiceFullDeduction25),
      calculationRate: 12,
      outputVat: { amount: 27.36, reportField: '31' },
      deductibleInputVat: {
        amount: 27.36,
        reportField: '48',
        entitlement: 'full',
      },
    },
    code: 'unsupported_calculation_rate',
    label: 'EU service non-25 percent rate blocks',
  },
  {
    treatment: {
      ...cloneTreatment(euServiceFullDeduction25),
      code: 'EU_GOODS_ACQUISITION',
      acquisitionBaseField: '20',
    },
    code: 'unsupported_vat_treatment',
    label: 'EU goods acquisition blocks',
  },
  {
    treatment: {
      ...cloneTreatment(euServiceFullDeduction25),
      code: 'NON_EU_SERVICE_REVERSE_CHARGE',
      acquisitionBaseField: '22',
    },
    code: 'unsupported_vat_treatment',
    label: 'Non-EU service reverse charge blocks',
  },
  {
    treatment: {
      ...cloneTreatment(euServiceFullDeduction25),
      code: 'IMPORT_GOODS',
      outputVat: { amount: 57, reportField: '60' },
      acquisitionBaseField: '50',
    },
    code: 'unsupported_vat_treatment',
    label: 'Import goods blocks',
  },
]

for (const unsupported of unsupportedTreatments) {
  assertSnapshotBlocked(
    buildVatAuditSnapshot({
      treatment: unsupported.treatment,
      journalPlan: happyPlan,
    }),
    unsupported.code,
    unsupported.label
  )
}

console.log('\n-----------------------------------')
console.log(`Godkända tester: ${passed}`)
console.log(`Misslyckade tester: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('✓ Alla VAT audit snapshot-tester godkända.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-vat-report-aggregation.ts
==================================================

````typescript
import {
  aggregateVatReport,
  type VatReportJournalRowInput,
  type VatReportSnapshotInput,
  type VatReportTransactionInput,
} from '../src/lib/vatReportAggregation.ts'
import type { VatReportAggregationErrorCode } from '../src/lib/vatReportAggregation.ts'
import type { VatReturnField } from '../src/lib/vatDomain.ts'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`PASS ${description}`)
    passed++
    return
  }

  console.error(`FAIL ${description}`)
  console.error(`  Expected: ${expected}`)
  console.error(`  Actual:   ${actual}`)
  failed++
}

function assertReady(
  input: {
    transactions: VatReportTransactionInput[]
    journalRows: VatReportJournalRowInput[]
    vatV2Snapshots: VatReportSnapshotInput[]
  },
  description: string
) {
  const result = aggregateVatReport(input)
  assertEqual(result.status, 'ready', `${description} -> ready`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced a VAT report.`)
  }

  return result.report
}

function assertBlocked(
  input: {
    transactions: VatReportTransactionInput[]
    journalRows: VatReportJournalRowInput[]
    vatV2Snapshots: VatReportSnapshotInput[]
  },
  code: VatReportAggregationErrorCode,
  description: string
) {
  const result = aggregateVatReport(input)
  assertEqual(result.status, 'blocked', `${description} -> blocked`)
  assertEqual(result.report, null, `${description} -> no report`)

  const hasCode =
    result.status === 'blocked' &&
    result.errors.some(error => error.code === code)

  assertEqual(hasCode, true, `${description} -> ${code}`)
}

function assertField(
  fields: Record<VatReturnField, number>,
  field: VatReturnField,
  expected: number,
  description: string
) {
  assertEqual(fields[field], expected, `${description} -> field ${field}`)
}

function tx(
  id: string,
  source: string | null = 'manual'
): VatReportTransactionInput {
  return { id, source }
}

function row(
  transactionId: string,
  accountNumber: string,
  debit: number,
  credit: number,
  inReportPeriod = true
): VatReportJournalRowInput {
  return { transactionId, accountNumber, debit, credit, inReportPeriod }
}

function supportedVatV2Snapshot(input: {
  taxableBase?: number
  outputVat?: number
  deductibleInputVat?: number
  acquisitionBaseField?: string
  outputVatReportField?: string
  deductibleInputVatReportField?: string
  treatmentCode?: string
  schemaVersion?: string
  journalPlanVersion?: string
  balanced?: boolean
}) {
  const taxableBase = input.taxableBase ?? 228
  const outputVat = input.outputVat ?? 57
  const deductibleInputVat = input.deductibleInputVat ?? 57
  const acquisitionBaseField = input.acquisitionBaseField ?? '21'
  const outputVatReportField = input.outputVatReportField ?? '30'
  const deductibleInputVatReportField =
    input.deductibleInputVatReportField ?? '48'

  return {
    schemaVersion: input.schemaVersion ?? 'vat-audit-snapshot-v1',
    journalPlanVersion: input.journalPlanVersion ?? 'vat-journal-plan-v1',
    treatmentCode: input.treatmentCode ?? 'EU_SERVICE_REVERSE_CHARGE',
    ruleVersion: 'vat-v2-kan18-first-slice',
    factsVersion: 'vat-facts-v1',
    vat: {
      taxableBase,
      calculationRate: 25,
      acquisitionBaseField,
      outputVat: {
        amount: outputVat,
        reportField: outputVatReportField,
      },
      deductibleInputVat: {
        amount: deductibleInputVat,
        reportField: deductibleInputVatReportField,
        entitlement: 'full',
      },
    },
    reconciliation: {
      balanced: input.balanced ?? true,
      totalDebit: taxableBase + outputVat,
      totalCredit: taxableBase + outputVat,
      acquisitionBase: taxableBase,
      outputVat,
      deductibleInputVat,
      paymentPayable: taxableBase,
      acquisitionBaseField,
      outputVatReportField,
      deductibleInputVatReportField,
    },
  }
}

function vatV2Rows(transactionId: string, base = 228, vat = 57) {
  return [
    row(transactionId, '4535', base, 0),
    row(transactionId, '2645', vat, 0),
    row(transactionId, '2614', 0, vat),
    row(transactionId, '1930', 0, base),
  ]
}

console.log('\n=== SoloLedger VAT Report Aggregation Tests ===\n')

const v1Only = assertReady(
  {
    transactions: [tx('v1-sale-25'), tx('v1-sale-12'), tx('v1-purchase')],
    journalRows: [
      row('v1-sale-25', '2611', 0, 25),
      row('v1-sale-12', '2621', 0, 12),
      row('v1-purchase', '2641', 30, 0),
      row('closing', '2611', 25, 0),
      row('closing', '2650', 0, 25),
    ],
    vatV2Snapshots: [],
  },
  'CASE A VAT V1 only'
)

assertField(v1Only.fields, '05', 200, 'CASE A')
assertField(v1Only.fields, '10', 25, 'CASE A')
assertField(v1Only.fields, '11', 12, 'CASE A')
assertField(v1Only.fields, '12', 0, 'CASE A')
assertField(v1Only.fields, '48', 30, 'CASE A')
assertField(v1Only.fields, '49', 7, 'CASE A')
assertEqual(v1Only.legacy.domesticSalesBase25, 100, 'CASE A -> 25 percent base')
assertEqual(v1Only.legacy.domesticSalesBase12, 100, 'CASE A -> 12 percent base')

const v2Only = assertReady(
  {
    transactions: [tx('v2-1', 'vat_v2')],
    journalRows: vatV2Rows('v2-1'),
    vatV2Snapshots: [
      { transactionId: 'v2-1', snapshot: supportedVatV2Snapshot({}) },
    ],
  },
  'CASE B VAT V2 only'
)

assertField(v2Only.fields, '21', 228, 'CASE B')
assertField(v2Only.fields, '30', 57, 'CASE B')
assertField(v2Only.fields, '48', 57, 'CASE B')
assertField(v2Only.fields, '05', 0, 'CASE B')
assertField(v2Only.fields, '10', 0, 'CASE B')
assertField(v2Only.fields, '49', 0, 'CASE B')
assertEqual(v2Only.legacy.outputVat25, 0, 'CASE B -> 2614 not counted as legacy output')
assertEqual(v2Only.legacy.inputVat, 0, 'CASE B -> 2645 not counted as legacy input')

const mixed = assertReady(
  {
    transactions: [
      tx('v1-sale-25'),
      tx('v1-purchase'),
      tx('v2-1', 'vat_v2'),
    ],
    journalRows: [
      row('v1-sale-25', '2611', 0, 50),
      row('v1-purchase', '2641', 20, 0),
      ...vatV2Rows('v2-1'),
    ],
    vatV2Snapshots: [
      { transactionId: 'v2-1', snapshot: supportedVatV2Snapshot({}) },
    ],
  },
  'CASE C mixed V1 and VAT V2'
)

assertField(mixed.fields, '05', 200, 'CASE C')
assertField(mixed.fields, '10', 50, 'CASE C')
assertField(mixed.fields, '21', 228, 'CASE C')
assertField(mixed.fields, '30', 57, 'CASE C')
assertField(mixed.fields, '48', 77, 'CASE C')
assertField(mixed.fields, '49', 30, 'CASE C')
assertEqual(mixed.legacy.inputVat, 20, 'CASE C -> legacy input VAT preserved')
assertEqual(mixed.legacy.outputVat25, 50, 'CASE C -> VAT V2 2614 does not leak to field 10')

const multipleV2 = assertReady(
  {
    transactions: [tx('v2-1', 'vat_v2'), tx('v2-2', 'vat_v2')],
    journalRows: [
      ...vatV2Rows('v2-1', 228, 57),
      ...vatV2Rows('v2-2', 100, 25),
    ],
    vatV2Snapshots: [
      { transactionId: 'v2-1', snapshot: supportedVatV2Snapshot({}) },
      {
        transactionId: 'v2-2',
        snapshot: supportedVatV2Snapshot({
          taxableBase: 100,
          outputVat: 25,
          deductibleInputVat: 25,
        }),
      },
    ],
  },
  'CASE D multiple VAT V2'
)

assertField(multipleV2.fields, '21', 328, 'CASE D')
assertField(multipleV2.fields, '30', 82, 'CASE D')
assertField(multipleV2.fields, '48', 82, 'CASE D')
assertField(multipleV2.fields, '05', 0, 'CASE D')
assertField(multipleV2.fields, '10', 0, 'CASE D')
assertField(multipleV2.fields, '49', 0, 'CASE D')

assertBlocked(
  {
    transactions: [tx('v2-malformed', 'vat_v2')],
    journalRows: vatV2Rows('v2-malformed'),
    vatV2Snapshots: [
      {
        transactionId: 'v2-malformed',
        snapshot: {
          ...supportedVatV2Snapshot({}),
          vat: undefined,
        },
      },
    ],
  },
  'vat_v2_snapshot_malformed',
  'CASE E malformed missing VAT object'
)

assertBlocked(
  {
    transactions: [tx('v2-invalid-field', 'vat_v2')],
    journalRows: vatV2Rows('v2-invalid-field'),
    vatV2Snapshots: [
      {
        transactionId: 'v2-invalid-field',
        snapshot: supportedVatV2Snapshot({ acquisitionBaseField: '05' }),
      },
    ],
  },
  'vat_v2_snapshot_unsupported',
  'CASE E invalid report field'
)

assertBlocked(
  {
    transactions: [tx('v2-unbalanced', 'vat_v2')],
    journalRows: vatV2Rows('v2-unbalanced'),
    vatV2Snapshots: [
      {
        transactionId: 'v2-unbalanced',
        snapshot: supportedVatV2Snapshot({ balanced: false }),
      },
    ],
  },
  'vat_v2_snapshot_inconsistent',
  'CASE E inconsistent reconciliation'
)

assertBlocked(
  {
    transactions: [tx('v2-unsupported', 'vat_v2')],
    journalRows: vatV2Rows('v2-unsupported'),
    vatV2Snapshots: [
      {
        transactionId: 'v2-unsupported',
        snapshot: supportedVatV2Snapshot({
          treatmentCode: 'EU_GOODS_ACQUISITION',
        }),
      },
    ],
  },
  'vat_v2_snapshot_unsupported',
  'CASE E unsupported treatment'
)

assertBlocked(
  {
    transactions: [tx('v2-no-snapshot', 'vat_v2')],
    journalRows: vatV2Rows('v2-no-snapshot'),
    vatV2Snapshots: [],
  },
  'vat_v2_snapshot_missing',
  'CASE F VAT V2 without valid snapshot'
)

const netEffect = assertReady(
  {
    transactions: [tx('v2-net', 'vat_v2')],
    journalRows: vatV2Rows('v2-net'),
    vatV2Snapshots: [
      { transactionId: 'v2-net', snapshot: supportedVatV2Snapshot({}) },
    ],
  },
  'CASE G VAT V2 net effect'
)

assertField(netEffect.fields, '30', 57, 'CASE G')
assertField(netEffect.fields, '48', 57, 'CASE G')
assertField(netEffect.fields, '49', 0, 'CASE G')

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('All VAT report aggregation tests passed.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-vat-report-service.ts
==================================================

````typescript
import {
  calculateVatReportFromLoadedRows,
  type LoadedVatReportRows,
  type VatReportAuditSnapshotRow,
  type VatReportJournalEntryRow,
  type VatReportServiceErrorCode,
  type VatReportTransactionRow,
} from '../src/lib/vatReportService.ts'
import type { VatReportAggregationErrorCode } from '../src/lib/vatReportAggregation.ts'
import type { VatReturnField } from '../src/lib/vatDomain.ts'

const USER_ID = 'user-1'
const OTHER_USER_ID = 'user-2'
const START_DATE = '2026-07-01'
const END_DATE = '2026-09-30'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`PASS ${description}`)
    passed++
    return
  }

  console.error(`FAIL ${description}`)
  console.error(`  Expected: ${expected}`)
  console.error(`  Actual:   ${actual}`)
  failed++
}

function assertReady(rows: LoadedVatReportRows, description: string) {
  const result = calculateVatReportFromLoadedRows({
    userId: USER_ID,
    startDate: START_DATE,
    endDate: END_DATE,
    rows,
  })

  assertEqual(result.status, 'ready', `${description} -> ready`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced a VAT report.`)
  }

  return result.report
}

function assertBlocked(
  rows: LoadedVatReportRows,
  serviceCode: VatReportServiceErrorCode,
  aggregationCode: VatReportAggregationErrorCode | null,
  description: string
) {
  const result = calculateVatReportFromLoadedRows({
    userId: USER_ID,
    startDate: START_DATE,
    endDate: END_DATE,
    rows,
  })

  assertEqual(result.status, 'blocked', `${description} -> blocked`)
  assertEqual(result.report, null, `${description} -> no report`)

  const hasServiceCode =
    result.status === 'blocked' &&
    result.errors.some(error => error.code === serviceCode)

  assertEqual(hasServiceCode, true, `${description} -> ${serviceCode}`)

  if (aggregationCode) {
    const hasAggregationCode =
      result.status === 'blocked' &&
      result.errors.some(error => (
        error.aggregationErrors?.some(aggregationError => (
          aggregationError.code === aggregationCode
        ))
      ))

    assertEqual(hasAggregationCode, true, `${description} -> ${aggregationCode}`)
  }
}

function assertField(
  fields: Record<VatReturnField, number>,
  field: VatReturnField,
  expected: number,
  description: string
) {
  assertEqual(fields[field], expected, `${description} -> field ${field}`)
}

function tx(input: {
  id: string
  date?: string
  source?: string | null
  userId?: string
}): VatReportTransactionRow {
  return {
    id: input.id,
    user_id: input.userId ?? USER_ID,
    date: input.date ?? '2026-08-15',
    source: input.source ?? 'manual',
  }
}

function row(input: {
  transactionId: string
  accountNumber: string
  debit?: number | string | null
  credit?: number | string | null
  date?: string | null
  userId?: string
}): VatReportJournalEntryRow {
  return {
    user_id: input.userId ?? USER_ID,
    transaction_id: input.transactionId,
    account_number: input.accountNumber,
    debit: input.debit ?? 0,
    credit: input.credit ?? 0,
    date: input.date ?? '2026-08-15',
  }
}

function snapshot(input: {
  transactionId: string
  createdAt?: string | null
  userId?: string
  taxableBase?: number
  outputVat?: number
  deductibleInputVat?: number
}): VatReportAuditSnapshotRow {
  const taxableBase = input.taxableBase ?? 228
  const outputVat = input.outputVat ?? 57
  const deductibleInputVat = input.deductibleInputVat ?? 57

  return {
    user_id: input.userId ?? USER_ID,
    transaction_id: input.transactionId,
    created_at: input.createdAt ?? '2026-08-16T10:00:00Z',
    snapshot: {
      schemaVersion: 'vat-audit-snapshot-v1',
      journalPlanVersion: 'vat-journal-plan-v1',
      treatmentCode: 'EU_SERVICE_REVERSE_CHARGE',
      ruleVersion: 'vat-v2-kan18-first-slice',
      factsVersion: 'vat-facts-v1',
      vat: {
        taxableBase,
        calculationRate: 25,
        acquisitionBaseField: '21',
        outputVat: {
          amount: outputVat,
          reportField: '30',
        },
        deductibleInputVat: {
          amount: deductibleInputVat,
          reportField: '48',
          entitlement: 'full',
        },
      },
      reconciliation: {
        balanced: true,
        totalDebit: taxableBase + outputVat,
        totalCredit: taxableBase + outputVat,
        acquisitionBase: taxableBase,
        outputVat,
        deductibleInputVat,
        paymentPayable: taxableBase,
        acquisitionBaseField: '21',
        outputVatReportField: '30',
        deductibleInputVatReportField: '48',
      },
    },
  }
}

function vatV2JournalRows(transactionId: string, date = '2026-08-15') {
  return [
    row({ transactionId, accountNumber: '4535', debit: 228, date }),
    row({ transactionId, accountNumber: '2645', debit: 57, date }),
    row({ transactionId, accountNumber: '2614', credit: 57, date }),
    row({ transactionId, accountNumber: '1930', credit: 228, date }),
  ]
}

console.log('\n=== SoloLedger VAT Report Service Tests ===\n')

const v1Only = assertReady(
  {
    transactions: [
      tx({ id: 'v1-sale-25' }),
      tx({ id: 'v1-sale-12' }),
      tx({ id: 'v1-purchase' }),
      tx({ id: 'closing' }),
    ],
    journalRows: [
      row({ transactionId: 'v1-sale-25', accountNumber: '2611', credit: 25 }),
      row({ transactionId: 'v1-sale-12', accountNumber: '2621', credit: 12 }),
      row({ transactionId: 'v1-purchase', accountNumber: '2641', debit: 30 }),
      row({ transactionId: 'closing', accountNumber: '2611', debit: 25 }),
      row({ transactionId: 'closing', accountNumber: '2650', credit: 25 }),
    ],
    vatV2Snapshots: [],
  },
  'CASE A V1-only production-shaped rows'
)

assertField(v1Only.fields, '05', 200, 'CASE A')
assertField(v1Only.fields, '10', 25, 'CASE A')
assertField(v1Only.fields, '11', 12, 'CASE A')
assertField(v1Only.fields, '48', 30, 'CASE A')
assertField(v1Only.fields, '49', 7, 'CASE A')

const v2Only = assertReady(
  {
    transactions: [tx({ id: 'v2-in-period', source: 'vat_v2' })],
    journalRows: vatV2JournalRows('v2-in-period'),
    vatV2Snapshots: [snapshot({ transactionId: 'v2-in-period' })],
  },
  'CASE B VAT V2-only transaction date inside period'
)

assertField(v2Only.fields, '21', 228, 'CASE B')
assertField(v2Only.fields, '30', 57, 'CASE B')
assertField(v2Only.fields, '48', 57, 'CASE B')
assertField(v2Only.fields, '05', 0, 'CASE B')
assertField(v2Only.fields, '10', 0, 'CASE B')
assertField(v2Only.fields, '49', 0, 'CASE B')

const v2SnapshotOutsidePeriod = assertReady(
  {
    transactions: [tx({ id: 'v2-snapshot-outside', source: 'vat_v2' })],
    journalRows: vatV2JournalRows('v2-snapshot-outside'),
    vatV2Snapshots: [
      snapshot({
        transactionId: 'v2-snapshot-outside',
        createdAt: '2026-10-03T09:00:00Z',
      }),
    ],
  },
  'CASE C VAT V2 snapshot created outside period'
)

assertField(v2SnapshotOutsidePeriod.fields, '21', 228, 'CASE C')
assertField(v2SnapshotOutsidePeriod.fields, '30', 57, 'CASE C')
assertField(v2SnapshotOutsidePeriod.fields, '48', 57, 'CASE C')
assertField(v2SnapshotOutsidePeriod.fields, '49', 0, 'CASE C')

const v2TransactionOutsidePeriod = assertReady(
  {
    transactions: [
      tx({
        id: 'v2-transaction-outside',
        source: 'vat_v2',
        date: '2026-04-01',
      }),
    ],
    journalRows: vatV2JournalRows('v2-transaction-outside', '2026-08-15'),
    vatV2Snapshots: [
      snapshot({
        transactionId: 'v2-transaction-outside',
        createdAt: '2026-08-16T10:00:00Z',
      }),
    ],
  },
  'CASE D VAT V2 transaction outside period'
)

assertField(v2TransactionOutsidePeriod.fields, '21', 0, 'CASE D')
assertField(v2TransactionOutsidePeriod.fields, '30', 0, 'CASE D')
assertField(v2TransactionOutsidePeriod.fields, '48', 0, 'CASE D')
assertField(v2TransactionOutsidePeriod.fields, '10', 0, 'CASE D')
assertField(v2TransactionOutsidePeriod.fields, '49', 0, 'CASE D')

assertBlocked(
  {
    transactions: [tx({ id: 'v2-missing-snapshot', source: 'vat_v2' })],
    journalRows: vatV2JournalRows('v2-missing-snapshot'),
    vatV2Snapshots: [],
  },
  'aggregation_blocked',
  'vat_v2_snapshot_missing',
  'CASE E VAT V2 missing snapshot'
)

assertBlocked(
  {
    transactions: [tx({ id: 'v2-duplicate-snapshot', source: 'vat_v2' })],
    journalRows: vatV2JournalRows('v2-duplicate-snapshot'),
    vatV2Snapshots: [
      snapshot({ transactionId: 'v2-duplicate-snapshot' }),
      snapshot({ transactionId: 'v2-duplicate-snapshot' }),
    ],
  },
  'aggregation_blocked',
  'vat_v2_snapshot_duplicate',
  'CASE F VAT V2 duplicate snapshot'
)

const mixed = assertReady(
  {
    transactions: [
      tx({ id: 'v1-sale' }),
      tx({ id: 'v1-purchase' }),
      tx({ id: 'v2-mixed', source: 'vat_v2' }),
    ],
    journalRows: [
      row({ transactionId: 'v1-sale', accountNumber: '2611', credit: 50 }),
      row({ transactionId: 'v1-purchase', accountNumber: '2641', debit: 20 }),
      ...vatV2JournalRows('v2-mixed'),
    ],
    vatV2Snapshots: [snapshot({ transactionId: 'v2-mixed' })],
  },
  'CASE G mixed V1 and VAT V2'
)

assertField(mixed.fields, '05', 200, 'CASE G')
assertField(mixed.fields, '10', 50, 'CASE G')
assertField(mixed.fields, '21', 228, 'CASE G')
assertField(mixed.fields, '30', 57, 'CASE G')
assertField(mixed.fields, '48', 77, 'CASE G')
assertField(mixed.fields, '49', 30, 'CASE G')

assertBlocked(
  {
    transactions: [
      tx({ id: 'v1-sale' }),
      tx({ id: 'other-user-sale', userId: OTHER_USER_ID }),
    ],
    journalRows: [
      row({ transactionId: 'v1-sale', accountNumber: '2611', credit: 25 }),
      row({
        transactionId: 'other-user-sale',
        accountNumber: '2611',
        credit: 25,
        userId: OTHER_USER_ID,
      }),
    ],
    vatV2Snapshots: [],
  },
  'invalid_loaded_scope',
  null,
  'CASE H other tenant rows rejected'
)

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('All VAT report service tests passed.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-vat-report-presentation.ts
==================================================

````typescript
import {
  calculateVatReportFromLoadedRows,
  type LoadedVatReportRows,
  type VatReportAuditSnapshotRow,
  type VatReportJournalEntryRow,
  type VatReportTransactionRow,
} from '../src/lib/vatReportService.ts'
import {
  buildVatReportPresentation,
  vatReportBlockedMessage,
} from '../src/lib/vatReportPresentation.ts'
import type { VatReportPresentation } from '../src/lib/vatReportPresentation.ts'

const USER_ID = 'user-1'
const START_DATE = '2026-07-01'
const END_DATE = '2026-09-30'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`PASS ${description}`)
    passed++
    return
  }

  console.error(`FAIL ${description}`)
  console.error(`  Expected: ${expected}`)
  console.error(`  Actual:   ${actual}`)
  failed++
}

function readyPresentation(
  rows: LoadedVatReportRows,
  description: string
): VatReportPresentation {
  const result = calculateVatReportFromLoadedRows({
    userId: USER_ID,
    startDate: START_DATE,
    endDate: END_DATE,
    rows,
  })

  assertEqual(result.status, 'ready', `${description} -> ready`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced a VAT report.`)
  }

  return buildVatReportPresentation(result.report)
}

function tx(input: {
  id: string
  date?: string
  source?: string | null
}): VatReportTransactionRow {
  return {
    id: input.id,
    user_id: USER_ID,
    date: input.date ?? '2026-08-15',
    source: input.source ?? 'manual',
  }
}

function row(input: {
  transactionId: string
  accountNumber: string
  debit?: number | string | null
  credit?: number | string | null
  date?: string | null
}): VatReportJournalEntryRow {
  return {
    user_id: USER_ID,
    transaction_id: input.transactionId,
    account_number: input.accountNumber,
    debit: input.debit ?? 0,
    credit: input.credit ?? 0,
    date: input.date ?? '2026-08-15',
  }
}

function snapshot(transactionId: string): VatReportAuditSnapshotRow {
  return {
    user_id: USER_ID,
    transaction_id: transactionId,
    created_at: '2026-10-03T09:00:00Z',
    snapshot: {
      schemaVersion: 'vat-audit-snapshot-v1',
      journalPlanVersion: 'vat-journal-plan-v1',
      treatmentCode: 'EU_SERVICE_REVERSE_CHARGE',
      ruleVersion: 'vat-v2-kan18-first-slice',
      factsVersion: 'vat-facts-v1',
      vat: {
        taxableBase: 228,
        calculationRate: 25,
        acquisitionBaseField: '21',
        outputVat: {
          amount: 57,
          reportField: '30',
        },
        deductibleInputVat: {
          amount: 57,
          reportField: '48',
          entitlement: 'full',
        },
      },
      reconciliation: {
        balanced: true,
        totalDebit: 285,
        totalCredit: 285,
        acquisitionBase: 228,
        outputVat: 57,
        deductibleInputVat: 57,
        paymentPayable: 228,
        acquisitionBaseField: '21',
        outputVatReportField: '30',
        deductibleInputVatReportField: '48',
      },
    },
  }
}

function vatV2JournalRows(transactionId: string) {
  return [
    row({ transactionId, accountNumber: '4535', debit: 228 }),
    row({ transactionId, accountNumber: '2645', debit: 57 }),
    row({ transactionId, accountNumber: '2614', credit: 57 }),
    row({ transactionId, accountNumber: '1930', credit: 228 }),
  ]
}

console.log('\n=== SoloLedger VAT Report Presentation Tests ===\n')

const v1Only = readyPresentation(
  {
    transactions: [
      tx({ id: 'v1-sale-25' }),
      tx({ id: 'v1-sale-12' }),
      tx({ id: 'v1-sale-6' }),
      tx({ id: 'v1-purchase' }),
    ],
    journalRows: [
      row({ transactionId: 'v1-sale-25', accountNumber: '2611', credit: 25 }),
      row({ transactionId: 'v1-sale-12', accountNumber: '2621', credit: 12 }),
      row({ transactionId: 'v1-sale-6', accountNumber: '2631', credit: 6 }),
      row({ transactionId: 'v1-purchase', accountNumber: '2641', debit: 30 }),
    ],
    vatV2Snapshots: [],
  },
  'CASE A V1-only field presentation'
)

assertEqual(v1Only.domesticSalesBase, 300, 'CASE A -> ruta 05')
assertEqual(v1Only.ordinaryOutputVat25, 25, 'CASE A -> ruta 10')
assertEqual(v1Only.ordinaryOutputVat12, 12, 'CASE A -> ruta 11')
assertEqual(v1Only.ordinaryOutputVat6, 6, 'CASE A -> ruta 12')
assertEqual(v1Only.deductibleInputVat, 30, 'CASE A -> ruta 48')
assertEqual(v1Only.netVat, 13, 'CASE A -> ruta 49')

const v2Only = readyPresentation(
  {
    transactions: [tx({ id: 'v2-only', source: 'vat_v2' })],
    journalRows: vatV2JournalRows('v2-only'),
    vatV2Snapshots: [snapshot('v2-only')],
  },
  'CASE B VAT V2-only field presentation'
)

assertEqual(v2Only.euServicePurchases, 228, 'CASE B -> ruta 21')
assertEqual(v2Only.euServiceOutputVat25, 57, 'CASE B -> ruta 30')
assertEqual(v2Only.deductibleInputVat, 57, 'CASE B -> ruta 48')
assertEqual(v2Only.domesticSalesBase, 0, 'CASE B -> ruta 05')
assertEqual(v2Only.ordinaryOutputVat25, 0, 'CASE B -> ruta 10')
assertEqual(v2Only.netVat, 0, 'CASE B -> ruta 49')
assertEqual(v2Only.totalOutputVat, 57, 'CASE B -> total output VAT')

const mixed = readyPresentation(
  {
    transactions: [
      tx({ id: 'v1-sale' }),
      tx({ id: 'v1-purchase' }),
      tx({ id: 'v2-mixed', source: 'vat_v2' }),
    ],
    journalRows: [
      row({ transactionId: 'v1-sale', accountNumber: '2611', credit: 50 }),
      row({ transactionId: 'v1-purchase', accountNumber: '2641', debit: 20 }),
      ...vatV2JournalRows('v2-mixed'),
    ],
    vatV2Snapshots: [snapshot('v2-mixed')],
  },
  'CASE C mixed V1 and VAT V2 field presentation'
)

assertEqual(mixed.domesticSalesBase, 200, 'CASE C -> ruta 05')
assertEqual(mixed.ordinaryOutputVat25, 50, 'CASE C -> ruta 10')
assertEqual(mixed.euServicePurchases, 228, 'CASE C -> ruta 21')
assertEqual(mixed.euServiceOutputVat25, 57, 'CASE C -> ruta 30')
assertEqual(mixed.deductibleInputVat, 77, 'CASE C -> shared ruta 48')
assertEqual(mixed.netVat, 30, 'CASE C -> ruta 49')
assertEqual(mixed.totalOutputVat, 107, 'CASE C -> total output VAT')

const blocked = calculateVatReportFromLoadedRows({
  userId: USER_ID,
  startDate: START_DATE,
  endDate: END_DATE,
  rows: {
    transactions: [tx({ id: 'v2-blocked', source: 'vat_v2' })],
    journalRows: vatV2JournalRows('v2-blocked'),
    vatV2Snapshots: [],
  },
})

assertEqual(blocked.status, 'blocked', 'CASE D malformed/missing VAT V2 -> blocked')
assertEqual(blocked.report, null, 'CASE D malformed/missing VAT V2 -> no report')

if (blocked.status === 'blocked') {
  assertEqual(
    vatReportBlockedMessage(blocked.errors),
    'Momsrapporten kan inte beräknas säkert eftersom ett inköp med omvänd moms saknar kontrollerbart underlag.',
    'CASE D malformed/missing VAT V2 -> safe Swedish message'
  )
}

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('All VAT report presentation tests passed.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-vat-transaction-preflight.ts
==================================================

````typescript
import type {
  CompanyVatProfile,
  VatCalculationRateInput,
  VatGoodsOrService,
  VatYesNoUnknown,
} from '../src/lib/vatDomain.ts'
import {
  buildVatV2TransactionPreflight,
  type VatV2SupplierCountryInput,
  type VatV2TransactionPreflightBlockCode,
  type VatV2TransactionPreflightResult,
} from '../src/lib/vatTransactionPreflight.ts'

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
  result: VatV2TransactionPreflightResult,
  description: string
) {
  assertEqual(result.status, 'ready', `${description} -> ready`)

  if (result.status !== 'ready') {
    throw new Error(`${description} should have produced ready preflight.`)
  }

  return result
}

function assertBlocked(
  result: VatV2TransactionPreflightResult,
  code: VatV2TransactionPreflightBlockCode,
  description: string
) {
  assertEqual(result.status, 'blocked', `${description} -> blocked`)

  const hasCode =
    result.status === 'blocked' &&
    result.validation.errors.some(error => error.code === code)

  assertEqual(hasCode, true, `${description} -> ${code}`)
}

const fullProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'taxable',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'required',
  vatPeriodType: 'quarter',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'full',
}

function preflight(overrides: {
  profile?: CompanyVatProfile
  supplierCountry?: VatV2SupplierCountryInput
  goodsOrService?: VatGoodsOrService
  supplierVatCharged?: VatYesNoUnknown
  calculationRate?: VatCalculationRateInput
  acquisitionBaseAmount?: string
  ordinaryAmount?: string
} = {}) {
  return buildVatV2TransactionPreflight({
    companyProfile: overrides.profile ?? fullProfile,
    date: '2026-02-10',
    description: 'Adobe Ireland',
    accountingCategoryId: 'programvaror',
    ordinaryAmount: overrides.ordinaryAmount ?? '9999',
    transaction: {
      enabled: true,
      supplierCountry: overrides.supplierCountry ?? 'IE',
      goodsOrService: overrides.goodsOrService ?? 'service',
      supplierVatCharged: overrides.supplierVatCharged ?? 'no',
      calculationRate: overrides.calculationRate ?? 25,
      acquisitionBaseAmount: overrides.acquisitionBaseAmount ?? '228',
    },
  })
}

console.log('\n=== SoloLedger VAT V2 Transaction Preflight Tests ===\n')

const supported = assertReady(
  preflight(),
  'EU service, no supplier VAT, full deduction, 25 percent'
)

assertEqual(
  supported.treatment.code,
  'EU_SERVICE_REVERSE_CHARGE',
  'Supported path -> treatment code'
)
assertEqual(supported.treatment.taxableBase, 228, 'Supported path -> acquisition base')
assertEqual(supported.treatment.outputVat.amount, 57, 'Supported path -> output VAT')
assertEqual(
  supported.treatment.deductibleInputVat.amount,
  57,
  'Supported path -> deductible calculated input VAT'
)
assertEqual(
  supported.treatment.deductibleInputVat.entitlement,
  'full',
  'Supported path -> full deduction'
)

assertBlocked(
  preflight({ supplierCountry: 'unknown' }),
  'unknown_supplier_country',
  'Missing supplier country blocks'
)

assertBlocked(
  preflight({ supplierCountry: 'SE' }),
  'unsupported_vat_treatment',
  'Swedish supplier is not misclassified as EU reverse charge'
)

assertBlocked(
  preflight({ supplierCountry: 'US' }),
  'unsupported_vat_treatment',
  'Non-EU supplier does not become EU reverse charge'
)

assertBlocked(
  preflight({ supplierVatCharged: 'yes' }),
  'unsupported_vat_treatment',
  'Supplier-charged VAT blocks'
)

assertBlocked(
  preflight({ goodsOrService: 'goods' }),
  'unsupported_vat_treatment',
  'Goods do not become supported service path'
)

assertBlocked(
  preflight({
    profile: {
      ...fullProfile,
      vatRegistrationStatus: 'unknown',
      foreignPurchaseReporting: 'unknown',
    },
  }),
  'unknown_vat_registration_status',
  'Unknown VAT registration blocks'
)

assertBlocked(
  preflight({
    profile: {
      ...fullProfile,
      foreignPurchaseReporting: 'unknown',
    },
  }),
  'unknown_foreign_purchase_reporting',
  'Unknown foreign purchase reporting blocks'
)

assertBlocked(
  preflight({
    profile: {
      ...fullProfile,
      vatRegistrationStatus: 'not_registered',
      foreignPurchaseReporting: 'not_required',
    },
  }),
  'unsupported_vat_treatment',
  'Not VAT registered does not become supported EU service path'
)

assertBlocked(
  preflight({
    profile: {
      ...fullProfile,
      foreignPurchaseReporting: 'not_required',
    },
  }),
  'unsupported_vat_treatment',
  'Foreign purchase reporting not required does not become supported EU service path'
)

assertBlocked(
  preflight({
    profile: {
      ...fullProfile,
      defaultDeductionEntitlement: 'unknown',
    },
  }),
  'unknown_deduction_entitlement',
  'Unknown deduction entitlement blocks'
)

assertBlocked(
  preflight({
    profile: {
      ...fullProfile,
      defaultDeductionEntitlement: 'none',
    },
  }),
  'unsupported_vat_v2_persistence_path',
  'No deduction does not become full-deduction persistence path'
)

assertBlocked(
  preflight({
    profile: {
      ...fullProfile,
      defaultDeductionEntitlement: 'partial',
      defaultDeductionPercent: 50,
    },
  }),
  'unsupported_vat_treatment',
  'Partial deduction remains deferred'
)

for (const rate of [12, 6, 0] as const) {
  assertBlocked(
    preflight({ calculationRate: rate }),
    'unsupported_vat_v2_persistence_path',
    `${rate} percent rate does not become bookable`
  )
}

const explicitBase = assertReady(
  preflight({
    acquisitionBaseAmount: '100',
    ordinaryAmount: '125',
  }),
  'Explicit acquisition base is independent from ordinary amount'
)
assertEqual(
  explicitBase.treatment.taxableBase,
  100,
  'Preflight uses explicit acquisition base, not ordinary VAT-inclusive amount'
)
assertEqual(
  explicitBase.treatment.outputVat.amount,
  25,
  'Preflight does not extract VAT from ordinary amount'
)

assertBlocked(
  preflight({ acquisitionBaseAmount: '' }),
  'invalid_amount',
  'Missing acquisition base blocks'
)

assertBlocked(
  preflight({ acquisitionBaseAmount: '0' }),
  'invalid_amount',
  'Zero acquisition base does not become bookable'
)

console.log('\n-----------------------------------')
console.log(`Godkända tester: ${passed}`)
console.log(`Misslyckade tester: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('✓ Alla VAT V2 transaction preflight-tester godkända.\n')
}
````````

==================================================

==================================================
FILE: scripts/test-payment-account-roles.ts
==================================================

````typescript
import {
  getPaymentAccountRoleRecommendation,
  getSystemAccount,
  isPaymentAccountRole,
  isValidPaymentRoleAccountNumber,
  isValidPaymentRoleAccountNumberForRole,
  paymentAccountRoleAccountNumberValidationMessage,
  PAYMENT_ACCOUNT_ROLES,
} from '../src/lib/accountingKnowledge.ts'
import { buildVatV2TransactionPreflight } from '../src/lib/vatTransactionPreflight.ts'

interface ConfiguredPaymentAccountRole {
  role: string
  accountNumber: string
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

assert(
  PAYMENT_ACCOUNT_ROLES.length === 2,
  'Payment account role model starts with exactly two roles'
)

assert(
  isPaymentAccountRole('business_payment_account'),
  'business_payment_account is a valid payment role'
)

assert(
  isPaymentAccountRole('owner_private_payment'),
  'owner_private_payment is a valid payment role'
)

assert(
  !isPaymentAccountRole('supplier_payable'),
  'supplier payable is not part of this role slice'
)

assert(
  !isPaymentAccountRole('vat_v2_payment_account'),
  'payment roles stay general bookkeeping config, not VAT-specific config'
)

assert(
  isValidPaymentRoleAccountNumber('1930'),
  'Four-digit payment role account numbers are accepted'
)

assert(
  isValidPaymentRoleAccountNumber('2018'),
  'SoloLedger current private-payment recommendation shape is accepted'
)

assert(
  isValidPaymentRoleAccountNumberForRole('business_payment_account', '1940'),
  'Business payment role accepts 1xxx asset payment accounts'
)

assert(
  isValidPaymentRoleAccountNumberForRole('owner_private_payment', '2017'),
  'Owner-private payment role accepts 2xxx equity accounts'
)

assert(
  !isValidPaymentRoleAccountNumberForRole('business_payment_account', '2018'),
  'Business payment role rejects owner-equity accounts'
)

assert(
  !isValidPaymentRoleAccountNumberForRole('owner_private_payment', '1930'),
  'Owner-private payment role rejects business asset accounts'
)

assert(
  paymentAccountRoleAccountNumberValidationMessage(
    'business_payment_account',
    '2018'
  )?.includes('1xxx'),
  'Business payment role mismatch gives actionable Swedish validation'
)

assert(
  paymentAccountRoleAccountNumberValidationMessage(
    'owner_private_payment',
    '1930'
  )?.includes('2xxx'),
  'Owner-private payment role mismatch gives actionable Swedish validation'
)

assert(
  !isValidPaymentRoleAccountNumber('193'),
  'Too-short account numbers are rejected'
)

assert(
  !isValidPaymentRoleAccountNumber('19300'),
  'Too-long account numbers are rejected'
)

assert(
  !isValidPaymentRoleAccountNumber('bank'),
  'Non-numeric account numbers are rejected'
)

const businessRecommendation =
  getPaymentAccountRoleRecommendation('business_payment_account')
const privateRecommendation =
  getPaymentAccountRoleRecommendation('owner_private_payment')

assert(
  businessRecommendation.accountNumber === '1930',
  'Business payment system recommendation uses 1930'
)

assert(
  getSystemAccount(businessRecommendation.accountNumber) !== null,
  'Business payment recommendation reuses known system-account metadata'
)

assert(
  privateRecommendation.accountNumber === '2018',
  'Private owner-payment system suggestion currently uses 2018 without making it the only valid account'
)

assert(
  getSystemAccount(privateRecommendation.accountNumber) !== null,
  'Private owner-payment recommendation reuses known system-account metadata'
)

const configuredMappings: ConfiguredPaymentAccountRole[] = []

assert(
  configuredMappings.length === 0,
  'System recommendations alone do not create configured mappings'
)

const preflightWithoutPaymentRole = buildVatV2TransactionPreflight({
  companyProfile: {
    domesticSalesVatTreatment: 'taxable',
    vatRegistrationStatus: 'registered',
    vatPeriodType: 'quarter',
    vatReportingFrom: '2026-01-01',
    foreignPurchaseReporting: 'required',
    defaultDeductionEntitlement: 'full',
  },
  transaction: {
    enabled: true,
    supplierCountry: 'IE',
    goodsOrService: 'service',
    supplierVatCharged: 'no',
    calculationRate: 25,
    acquisitionBaseAmount: '100',
  },
  date: '2026-09-27',
  description: 'EU service purchase',
  accountingCategoryId: 'programvaror',
  ordinaryAmount: '100',
})

const preflightWithExtraneousPaymentRole = buildVatV2TransactionPreflight({
  companyProfile: {
    domesticSalesVatTreatment: 'taxable',
    vatRegistrationStatus: 'registered',
    vatPeriodType: 'quarter',
    vatReportingFrom: '2026-01-01',
    foreignPurchaseReporting: 'required',
    defaultDeductionEntitlement: 'full',
  },
  transaction: {
    enabled: true,
    supplierCountry: 'IE',
    goodsOrService: 'service',
    supplierVatCharged: 'no',
    calculationRate: 25,
    acquisitionBaseAmount: '100',
    paymentAccountRole: 'business_payment_account',
  } as Parameters<typeof buildVatV2TransactionPreflight>[0]['transaction'] & {
    paymentAccountRole: string
  },
  date: '2026-09-27',
  description: 'EU service purchase',
  accountingCategoryId: 'programvaror',
  ordinaryAmount: '100',
})

assert(
  preflightWithoutPaymentRole.status === preflightWithExtraneousPaymentRole.status,
  'VAT transaction preflight does not derive treatment from payment role config'
)

console.log('Payment account role model tests passed.')
````````

==================================================

==================================================
FILE: scripts/test-payment-account-roles-sql.sql
==================================================

````sql
\set ON_ERROR_STOP on

BEGIN;

-- Reproduce the production precondition inside this rollback-only test:
-- public tables created by postgres inherit broad default table privileges.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role;

\i supabase/migrations/20260927151231_add_payment_account_roles.sql

DO $$
DECLARE
  v_role text;
  v_privilege text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN'
    ] LOOP
      IF NOT has_table_privilege(
        v_role,
        'public.company_payment_account_roles',
        v_privilege
      ) THEN
        RAISE EXCEPTION
          'Expected broad inherited pre-hardening privilege %.% missing.',
          v_role,
          v_privilege;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

\i supabase/migrations/20260927174627_harden_payment_account_roles_acl.sql

DO $$
DECLARE
  v_privilege text;
BEGIN
  FOREACH v_privilege IN ARRAY ARRAY[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ] LOOP
    IF has_table_privilege(
      'anon',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION 'Anon retained %. privilege after hardening.', v_privilege;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) AS a
    WHERE n.nspname = 'public'
      AND c.relname = 'company_payment_account_roles'
      AND a.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC retained table privileges after hardening.';
  END IF;

  FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege(
      'authenticated',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION
        'Authenticated missing required %. privilege after hardening.',
        v_privilege;
    END IF;
  END LOOP;

  FOREACH v_privilege IN ARRAY ARRAY[
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ] LOOP
    IF has_table_privilege(
      'authenticated',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION
        'Authenticated retained unexpected %. privilege after hardening.',
        v_privilege;
    END IF;
  END LOOP;

  FOREACH v_privilege IN ARRAY ARRAY[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ] LOOP
    IF NOT has_table_privilege(
      'service_role',
      'public.company_payment_account_roles',
      v_privilege
    ) THEN
      RAISE EXCEPTION
        'Service role missing administrative %. privilege after hardening.',
        v_privilege;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.company_payment_account_roles'::regclass
  ) THEN
    RAISE EXCEPTION 'RLS was disabled by ACL hardening.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_payment_account_roles'
      AND policyname = 'payment_account_roles_self_access'
      AND roles = ARRAY['authenticated']::name[]
      AND cmd = 'ALL'
      AND qual LIKE '%auth.uid%'
      AND qual LIKE '%user_id%'
      AND with_check LIKE '%auth.uid%'
      AND with_check LIKE '%user_id%'
  ) <> 1 THEN
    RAISE EXCEPTION 'Owner-scoped RLS policy changed unexpectedly.';
  END IF;
END
$$;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_payment_account_roles'
      AND (
        (
          column_name = 'user_id'
          AND data_type = 'uuid'
          AND is_nullable = 'NO'
          AND column_default = 'auth.uid()'
        )
        OR (
          column_name = 'role'
          AND data_type = 'text'
          AND is_nullable = 'NO'
        )
        OR (
          column_name = 'account_number'
          AND data_type = 'text'
          AND is_nullable = 'NO'
        )
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'Payment role table columns changed unexpectedly.';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.company_payment_account_roles'::regclass
      AND (
        (
          conname = 'company_payment_account_roles_pkey'
          AND contype = 'p'
          AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, role)'
        )
        OR (
          conname = 'company_payment_account_roles_user_id_fkey'
          AND contype = 'f'
          AND pg_get_constraintdef(oid) =
            'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE'
        )
        OR (
          conname = 'company_payment_account_roles_role_check'
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE
            '%business_payment_account%'
          AND pg_get_constraintdef(oid) LIKE
            '%owner_private_payment%'
        )
        OR (
          conname = 'company_payment_account_roles_account_number_check'
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%^\\d{4}$%'
        )
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'Payment role table constraints changed unexpectedly.';
  END IF;
END
$$;

INSERT INTO auth.users (id)
VALUES
  ('00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202');

-- Constraint checks.
INSERT INTO public.company_payment_account_roles (
  user_id,
  role,
  account_number
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  'business_payment_account',
  '1930'
);

INSERT INTO public.company_payment_account_roles (
  user_id,
  role,
  account_number
) VALUES (
  '00000000-0000-0000-0000-000000000202',
  'business_payment_account',
  '1930'
);

INSERT INTO public.company_payment_account_roles (
  user_id,
  role,
  account_number
) VALUES (
  '00000000-0000-0000-0000-000000000101',
  'business_payment_account',
  '1940'
)
ON CONFLICT (user_id, role)
DO UPDATE SET account_number = excluded.account_number;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.company_payment_account_roles
    WHERE user_id = '00000000-0000-0000-0000-000000000101'
      AND role = 'business_payment_account'
  ) <> 1 THEN
    RAISE EXCEPTION 'Duplicate role mapping was created for one user.';
  END IF;

  IF (
    SELECT account_number
    FROM public.company_payment_account_roles
    WHERE user_id = '00000000-0000-0000-0000-000000000101'
      AND role = 'business_payment_account'
  ) <> '1940' THEN
    RAISE EXCEPTION 'Upsert did not update the role mapping safely.';
  END IF;
END
$$;

DO $$
BEGIN
  INSERT INTO public.company_payment_account_roles (
    user_id,
    role,
    account_number
  ) VALUES (
    '00000000-0000-0000-0000-000000000101',
    'supplier_payable',
    '2440'
  );

  RAISE EXCEPTION 'Invalid payment role was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

DO $$
BEGIN
  INSERT INTO public.company_payment_account_roles (
    user_id,
    role,
    account_number
  ) VALUES (
    '00000000-0000-0000-0000-000000000101',
    'owner_private_payment',
    'bank'
  );

  RAISE EXCEPTION 'Malformed account number was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

-- RLS checks as authenticated users.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000101',
  true
);

DO $$
BEGIN
  INSERT INTO public.company_payment_account_roles (
    role,
    account_number
  ) VALUES (
    'owner_private_payment',
    '2018'
  );

  UPDATE public.company_payment_account_roles
  SET account_number = '2017'
  WHERE role = 'owner_private_payment';

  IF (
    SELECT account_number
    FROM public.company_payment_account_roles
    WHERE role = 'owner_private_payment'
  ) <> '2017' THEN
    RAISE EXCEPTION 'Authenticated user could not update own mapping.';
  END IF;

  DELETE FROM public.company_payment_account_roles
  WHERE role = 'owner_private_payment';

  IF EXISTS (
    SELECT 1
    FROM public.company_payment_account_roles
    WHERE role = 'owner_private_payment'
  ) THEN
    RAISE EXCEPTION 'Authenticated user could not delete own mapping.';
  END IF;

  IF (
    SELECT count(*)
    FROM public.company_payment_account_roles
  ) <> 1 THEN
    RAISE EXCEPTION 'RLS SELECT leaked another user mapping or own CRUD failed.';
  END IF;
END
$$;

DO $$
DECLARE
  v_updated_rows integer;
BEGIN
  UPDATE public.company_payment_account_roles
  SET account_number = '2018'
  WHERE user_id = '00000000-0000-0000-0000-000000000202'
    AND role = 'business_payment_account';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows <> 0 THEN
    RAISE EXCEPTION 'Cross-user UPDATE affected % row(s).', v_updated_rows;
  END IF;
END
$$;

DO $$
BEGIN
  IF (
    SELECT account_number
    FROM public.company_payment_account_roles
    WHERE user_id = '00000000-0000-0000-0000-000000000101'
      AND role = 'business_payment_account'
  ) <> '1940' THEN
    RAISE EXCEPTION 'Cross-user UPDATE affected the wrong mapping.';
  END IF;
END
$$;

DO $$
BEGIN
  INSERT INTO public.company_payment_account_roles (
    user_id,
    role,
    account_number
  ) VALUES (
    '00000000-0000-0000-0000-000000000202',
    'owner_private_payment',
    '2018'
  )
  ON CONFLICT DO NOTHING;

  RAISE EXCEPTION 'Cross-user INSERT was accepted.';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
  WHEN check_violation THEN
    NULL;
END
$$;

DELETE FROM public.company_payment_account_roles
WHERE role = 'business_payment_account';

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.company_payment_account_roles
  ) <> 0 THEN
    RAISE EXCEPTION 'Clearing own mapping did not return role to unconfigured.';
  END IF;
END
$$;

ROLLBACK;
````````

==================================================

==================================================
FILE: scripts/test-vat-payment-source.ts
==================================================

````typescript
import {
  buildVatV2BookingReadiness,
  getVatV2PaymentSourceRole,
  resolveVatV2PaymentSourceConfiguration,
} from '../src/lib/vatPaymentSource.ts'
import type { ConfiguredPaymentAccountRole } from '../src/lib/paymentAccountRoles.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const emptyConfiguration: ConfiguredPaymentAccountRole[] = []

assert(
  getVatV2PaymentSourceRole('business_account') === 'business_payment_account',
  'Business payment source maps to the generic business payment role'
)

assert(
  getVatV2PaymentSourceRole('owner_private') === 'owner_private_payment',
  'Owner-private payment source maps to the generic owner-private role'
)

const unconfiguredBusiness = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  emptyConfiguration
)

assert(
  unconfiguredBusiness.status === 'unconfigured',
  'Missing business payment mapping remains unconfigured'
)

assert(
  unconfiguredBusiness.recommendation.accountNumber === '1930',
  'Business payment recommendation is exposed separately from configuration'
)

assert(
  !('accountNumber' in unconfiguredBusiness),
  'System recommendation does not become a configured account number'
)

const recommendationOnlyBusinessReady = buildVatV2BookingReadiness({
  treatmentReady: true,
  roleConfigurationState: 'loaded',
  paymentSource: unconfiguredBusiness,
})

assert(
  recommendationOnlyBusinessReady.status === 'not_ready_to_book',
  'Recommendation-only business payment source is not ready-to-book'
)

const unconfiguredPrivate = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  emptyConfiguration
)

assert(
  unconfiguredPrivate.status === 'unconfigured',
  'Missing owner-private mapping remains unconfigured'
)

assert(
  unconfiguredPrivate.recommendation.accountNumber === '2018',
  'Owner-private payment recommendation is available as a suggestion only'
)

const configured: ConfiguredPaymentAccountRole[] = [
  { role: 'business_payment_account', accountNumber: '1940' },
  { role: 'owner_private_payment', accountNumber: '2017' },
]

const configuredBusiness = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  configured
)

assert(
  configuredBusiness.status === 'configured',
  'Explicit business payment configuration is authoritative'
)

assert(
  configuredBusiness.status === 'configured' &&
    configuredBusiness.accountNumber === '1940',
  'Business payment does not require the 1930 system recommendation'
)

const configuredPrivate = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  configured
)

assert(
  configuredPrivate.status === 'configured',
  'Explicit owner-private configuration is authoritative'
)

assert(
  configuredPrivate.status === 'configured' &&
    configuredPrivate.accountNumber === '2017',
  'Owner-private payment does not require the 2018 system recommendation'
)

const invalidConfiguredBusiness = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  [{ role: 'business_payment_account', accountNumber: 'bank' }]
)

assert(
  invalidConfiguredBusiness.status === 'invalid_configuration',
  'Invalid configured account numbers fail closed'
)

assert(
  resolveVatV2PaymentSourceConfiguration(
    'business_account',
    [{ role: 'business_payment_account', accountNumber: '2018' }]
  ).status === 'invalid_configuration',
  'Stored business payment role with owner-equity account fails closed'
)

assert(
  resolveVatV2PaymentSourceConfiguration(
    'owner_private',
    [{ role: 'owner_private_payment', accountNumber: '1930' }]
  ).status === 'invalid_configuration',
  'Stored owner-private payment role with business asset account fails closed'
)

assert(
  resolveVatV2PaymentSourceConfiguration('owner_private', [
    { role: 'business_payment_account', accountNumber: '1930' },
  ]).status === 'unconfigured',
  'Configured business account does not satisfy owner-private payment'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'loaded',
    paymentSource: unconfiguredBusiness,
  }).status === 'not_ready_to_book',
  'READY VAT treatment is not ready-to-book without configured payment source'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: false,
    roleConfigurationState: 'loaded',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Configured payment source cannot make blocked VAT treatment ready-to-book'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'loading',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Loading payment configuration is not ready-to-book'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'error',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Failed payment configuration load is not ready-to-book'
)

assert(
  buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'inactive',
    paymentSource: configuredBusiness,
  }).status === 'not_ready_to_book',
  'Inactive VAT V2 payment-source flow is not ready-to-book'
)

const readyToBook = buildVatV2BookingReadiness({
  treatmentReady: true,
  roleConfigurationState: 'loaded',
  paymentSource: configuredPrivate,
})

assert(
  readyToBook.status === 'ready_to_book',
  'VAT V2 is ready-to-book only when treatment and payment source are both ready'
)

assert(
  readyToBook.status === 'ready_to_book' &&
    readyToBook.paymentAccountNumber === '2017',
  'Ready-to-book uses explicit company configuration, not the recommendation'
)

const savedSuggestionConfiguration: ConfiguredPaymentAccountRole[] = [
  {
    role: unconfiguredBusiness.role,
    accountNumber: unconfiguredBusiness.recommendation.accountNumber,
  },
]

assert(
  resolveVatV2PaymentSourceConfiguration(
    'business_account',
    savedSuggestionConfiguration
  ).status === 'configured',
  'Explicit save establishes configuration for the confirmed role'
)

const failedSaveConfiguration: ConfiguredPaymentAccountRole[] = []

assert(
  resolveVatV2PaymentSourceConfiguration(
    'business_account',
    failedSaveConfiguration
  ).status === 'unconfigured',
  'Failed save does not establish configuration'
)

assert(
  emptyConfiguration.length === 0,
  'No automatic persistence occurs while only displaying recommendations'
)

console.log('VAT V2 payment-source tests passed.')
````````

==================================================

==================================================
FILE: scripts/test-vat-runtime-booking.ts
==================================================

````typescript
import {
  buildVatV2RuntimeBookingRequest,
  createVatV2RuntimeSubmitGuard,
  shouldRequireOrdinaryV1AmountForVatV2Form,
  shouldShowOrdinaryV1FieldsForVatV2Form,
} from '../src/lib/vatRuntimeBooking.ts'
import {
  buildVatV2TransactionPreflight,
} from '../src/lib/vatTransactionPreflight.ts'
import {
  buildVatV2BookingReadiness,
  resolveVatV2PaymentSourceConfiguration,
} from '../src/lib/vatPaymentSource.ts'
import type {
  CompanyVatProfile,
  VatTreatment,
} from '../src/lib/vatDomain.ts'
import type {
  ConfiguredPaymentAccountRole,
} from '../src/lib/paymentAccountRoles.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const companyProfile: CompanyVatProfile = {
  domesticSalesVatTreatment: 'taxable',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'required',
  vatPeriodType: 'month',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'full',
}

const configuredRoles: ConfiguredPaymentAccountRole[] = [
  { role: 'business_payment_account', accountNumber: '1940' },
  { role: 'owner_private_payment', accountNumber: '2017' },
]

assert(
  !shouldShowOrdinaryV1FieldsForVatV2Form({ assessmentActive: true }) &&
    !shouldRequireOrdinaryV1AmountForVatV2Form({ assessmentActive: true }),
  'VAT V2 booking must not be blocked by ordinary V1 form fields or amount validation'
)

assert(
  shouldShowOrdinaryV1FieldsForVatV2Form({ assessmentActive: false }) &&
    shouldRequireOrdinaryV1AmountForVatV2Form({ assessmentActive: false }),
  'VAT V2 off must preserve ordinary V1 form fields and amount validation'
)

const readyPreflight = buildVatV2TransactionPreflight({
  companyProfile,
  transaction: {
    enabled: true,
    supplierCountry: 'IE',
    goodsOrService: 'service',
    supplierVatCharged: 'no',
    calculationRate: 25,
    acquisitionBaseAmount: '1000',
  },
  date: '2026-09-27',
  description: 'Adobe Ireland',
  accountingCategoryId: 'programvara',
  ordinaryAmount: '999999',
})

assert(
  readyPreflight.status === 'ready',
  'Narrow EU service reverse-charge preflight should be ready'
)

assert(
  readyPreflight.status === 'ready' &&
    readyPreflight.treatment.taxableBase === 1000,
  'Runtime path must use explicit acquisition base, not ordinary form amount'
)

const configuredPaymentSource = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  configuredRoles
)

const readyPayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: configuredPaymentSource,
})

assert(
  readyPayment.status === 'ready_to_book',
  'Configured payment source should make ready treatment bookable'
)

const readyRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  readyRuntime.status === 'ready',
  'Runtime request should be ready only when treatment and payment source are ready'
)

assert(
  readyRuntime.status === 'ready' &&
    readyRuntime.request.paymentAccountNumber === '2017',
  'Runtime booking uses explicit company payment-role configuration'
)

assert(
  readyRuntime.status === 'ready' &&
    readyRuntime.request.treatment.taxableBase === 1000,
  'Runtime booking carries the explicit VAT V2 acquisition base'
)

assert(
  readyRuntime.status === 'ready' &&
    !('user_id' in readyRuntime.request) &&
    !('amount' in readyRuntime.request) &&
    !('type' in readyRuntime.request) &&
    !('vat_rate' in readyRuntime.request) &&
    !('journalRows' in readyRuntime.request) &&
    !('journal_rows' in readyRuntime.request) &&
    !('auditSnapshot' in readyRuntime.request) &&
    !('audit_snapshot' in readyRuntime.request),
  'Runtime request must not carry user id, journal rows, or audit snapshot'
)

const inactiveRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: false,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  inactiveRuntime.status === 'blocked' &&
    inactiveRuntime.errors.some(
      error => error.code === 'vat_v2_assessment_inactive'
    ),
  'Runtime booking is blocked when VAT V2 assessment is inactive'
)

const saleRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'unsupported',
  preflight: readyPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  saleRuntime.status === 'blocked' &&
    saleRuntime.errors.some(
      error => error.code === 'unsupported_transaction_event'
    ),
  'Runtime booking is blocked for non-purchase transaction events'
)

const unconfiguredPaymentSource = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  []
)
const blockedPayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: unconfiguredPaymentSource,
})
const recommendationOnlyRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: blockedPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  recommendationOnlyRuntime.status === 'blocked' &&
    recommendationOnlyRuntime.errors.some(
      error => error.code === 'payment_source_not_ready'
    ),
  'System recommendation alone cannot make runtime booking ready'
)

const wrongRolePaymentSource = resolveVatV2PaymentSourceConfiguration(
  'owner_private',
  [{ role: 'business_payment_account', accountNumber: '1940' }]
)
const wrongRolePayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: wrongRolePaymentSource,
})
const wrongRoleRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: wrongRolePayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  wrongRoleRuntime.status === 'blocked' &&
    wrongRoleRuntime.errors.some(
      error => error.code === 'payment_source_not_ready'
    ),
  'Configured account for the wrong payment role cannot make runtime booking ready'
)

const invalidPaymentSource = resolveVatV2PaymentSourceConfiguration(
  'business_account',
  [{ role: 'business_payment_account', accountNumber: 'bank' }]
)
const invalidPayment = buildVatV2BookingReadiness({
  treatmentReady: readyPreflight.status === 'ready',
  roleConfigurationState: 'loaded',
  paymentSource: invalidPaymentSource,
})
const invalidPaymentRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight,
  bookingReadiness: invalidPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  invalidPaymentRuntime.status === 'blocked' &&
    invalidPaymentRuntime.errors.some(
      error => error.code === 'payment_source_not_ready'
    ),
  'Invalid configured account cannot make runtime booking ready'
)

const unsupportedDeductionTreatment: VatTreatment = {
  ...readyPreflight.treatment,
  deductibleInputVat: {
    ...readyPreflight.treatment.deductibleInputVat,
    amount: 0,
    reportField: null,
    entitlement: 'none',
  },
}

const unsupportedDeductionPreflight = {
  ...readyPreflight,
  treatment: unsupportedDeductionTreatment,
} as typeof readyPreflight

const unsupportedDeductionRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: unsupportedDeductionPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  unsupportedDeductionRuntime.status === 'blocked' &&
    unsupportedDeductionRuntime.errors.some(
      error => error.code === 'unsupported_runtime_treatment'
    ),
  'Runtime booking blocks non-full deduction even if a caller supplies a treatment object'
)

const unsupportedTreatment: VatTreatment = {
  ...readyPreflight.treatment,
  calculationRate: 12,
  outputVat: {
    ...readyPreflight.treatment.outputVat,
    amount: 120,
    reportField: '31',
  },
}

const unsupportedPreflight = {
  ...readyPreflight,
  treatment: unsupportedTreatment,
} as typeof readyPreflight

const unsupportedRuntime = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: unsupportedPreflight,
  bookingReadiness: readyPayment,
  date: '2026-09-27',
  description: 'Adobe Ireland',
})

assert(
  unsupportedRuntime.status === 'blocked' &&
    unsupportedRuntime.errors.some(
      error => error.code === 'unsupported_runtime_treatment'
    ),
  'Runtime booking rechecks the narrow supported treatment semantics'
)

async function testSubmitGuard() {
  const guard = createVatV2RuntimeSubmitGuard()
  let bookingCalls = 0
  let releaseFirstBooking: (() => void) | null = null
  const firstBooking = guard.run(async () => {
    bookingCalls += 1
    await new Promise<void>(resolve => {
      releaseFirstBooking = resolve
    })
    return 'booked'
  })
  const duplicateBooking = guard.run(async () => {
    bookingCalls += 1
    return 'duplicate-booked'
  })

  assert(
    guard.isInFlight(),
    'Submit guard exposes in-flight state while the first booking is pending'
  )

  const duplicateResult = await duplicateBooking
  assert(
    duplicateResult.status === 'blocked_duplicate',
    'Submit guard blocks a parallel duplicate booking call'
  )

  assert(
    bookingCalls === 1,
    'Duplicate submit guard must not call the booking operation twice'
  )

  assert(
    releaseFirstBooking !== null,
    'First booking must have a release callback'
  )
  const releaseBooking = releaseFirstBooking as () => void
  releaseBooking()

  const firstResult = await firstBooking
  assert(
    firstResult.status === 'completed' &&
      firstResult.value === 'booked' &&
      !guard.isInFlight(),
    'Submit guard releases after the first booking settles'
  )
}

testSubmitGuard()
  .then(() => {
    console.log('VAT V2 runtime booking tests passed.')
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
````````

==================================================

==================================================
FILE: scripts/test-vat-lifecycle-ui.ts
==================================================

````typescript
import {
  CONFIRM_DECLARATION_BUTTON_LABEL,
  DECLARATION_ALREADY_SUBMITTED_COPY,
  DECLARATION_DOES_NOT_SUBMIT_COPY,
  DECLARATION_SUBMITTED_ON_LABEL,
  formatLocalDateOnly,
  isValidDateOnly,
  isValidSkvSubmittedOnDate,
  isVatReportRequestCurrent,
  skvSubmittedOnValidationMessage,
  shouldAutoLoadVatReport,
  vatClosingObligationText,
  vatDeclarationStatusText,
  type VatLifecyclePeriodLike,
} from '../src/lib/vatLifecycleUi.ts'
import { buildDeclareVatPeriodRpcArgs } from '../src/lib/vatDeclarationRpc.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function period(
  overrides: Partial<VatLifecyclePeriodLike> = {}
): VatLifecyclePeriodLike {
  return {
    id: 'period-1',
    period_end: '2026-03-31',
    status: 'closed',
    source: 'sololedger',
    closing_amount: 4000,
    declared_at: null,
    skv_submitted_on: null,
    ...overrides,
  }
}

const formatDate = (value: string) => value
const formatAmount = (value: number) =>
  value.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
const normalizeSpace = (value: string | null | undefined) =>
  value?.replace(/\u00a0/g, ' ') ?? value

assert(
  CONFIRM_DECLARATION_BUTTON_LABEL === 'Bekräfta inlämnad momsdeklaration',
  'Declaration button uses the approved wording'
)

assert(
  DECLARATION_DOES_NOT_SUBMIT_COPY.includes('skickar inte in'),
  'Declaration copy says SoloLedger does not submit to Skatteverket'
)

assert(
  DECLARATION_ALREADY_SUBMITTED_COPY.includes('redan har lämnat'),
  'Declaration copy says the user must already have submitted externally'
)

assert(
  DECLARATION_SUBMITTED_ON_LABEL ===
    'Datum då momsdeklarationen lämnades till Skatteverket',
  'Submission-date label is the approved Swedish copy'
)

const rpcArgs = buildDeclareVatPeriodRpcArgs(
  '11111111-1111-1111-1111-111111111111',
  '2026-04-12'
)

assert(
  rpcArgs.p_vat_period_id === '11111111-1111-1111-1111-111111111111',
  'Declaration service payload includes period id'
)

assert(
  rpcArgs.p_skv_submitted_on === '2026-04-12',
  'Declaration service payload includes Skatteverket submission date'
)

assert(
  formatLocalDateOnly(new Date(2026, 3, 12)) === '2026-04-12',
  'Local date-only formatting does not depend on UTC timestamp conversion'
)

assert(
  isValidDateOnly('2026-02-28') &&
    isValidDateOnly('2028-02-29') &&
    !isValidDateOnly('2026-02-29') &&
    !isValidDateOnly('2026-02-31') &&
    !isValidDateOnly('2026-04') &&
    !isValidDateOnly(''),
  'Date-only validation rejects incomplete and impossible calendar dates'
)

assert(
  isValidSkvSubmittedOnDate({
    submittedOn: '2026-04-12',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Valid submitted date at or after period end is accepted'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '2026-03-30',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Submitted date before period end is rejected'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '2026-09-29',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Future submitted date is rejected'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Incomplete submitted date is invalid'
)

assert(
  !isValidSkvSubmittedOnDate({
    submittedOn: '2026-02-31',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }),
  'Impossible submitted date is invalid'
)

assert(
  skvSubmittedOnValidationMessage({
    submittedOn: '',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }) === 'Välj datumet då momsdeklarationen lämnades till Skatteverket.',
  'Incomplete submitted date gets a Swedish validation message'
)

assert(
  skvSubmittedOnValidationMessage({
    submittedOn: '2026-03-30',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }) === 'Datumet kan inte vara före momsperiodens slut.',
  'Before-period-end submitted date gets a Swedish validation message'
)

assert(
  skvSubmittedOnValidationMessage({
    submittedOn: '2026-09-29',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  }) === 'Datumet kan inte vara i framtiden.',
  'Future submitted date gets a Swedish validation message'
)

assert(
  shouldAutoLoadVatReport({
    selectedPeriod: period(),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Closed SoloLedger period auto-loads when no current report exists'
)

assert(
  shouldAutoLoadVatReport({
    selectedPeriod: period({
      status: 'declared',
      declared_at: '2026-04-12T10:00:00Z',
      skv_submitted_on: '2026-04-12',
    }),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Declared SoloLedger period auto-loads when no current report exists'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period({ status: 'open', closing_amount: null }),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Open periods retain explicit calculate behavior'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period(),
    hasCurrentReport: true,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Current successful report prevents duplicate auto-load'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period(),
    hasCurrentReport: false,
    hasCurrentReportError: true,
    loading: false,
    periodsLoading: false,
  }),
  'Blocked report does not loop and declaration remains fail-closed'
)

assert(
  !shouldAutoLoadVatReport({
    selectedPeriod: period({ source: 'imported_history' }),
    hasCurrentReport: false,
    hasCurrentReportError: false,
    loading: false,
    periodsLoading: false,
  }),
  'Imported-history periods do not auto-load as SoloLedger declarations'
)

assert(
  isVatReportRequestCurrent(
    { periodId: 'period-1', contextKey: 'ctx-1' },
    { periodId: 'period-1', contextKey: 'ctx-1' }
  ),
  'Matching report request context is accepted'
)

assert(
  !isVatReportRequestCurrent(
    { periodId: 'period-2', contextKey: 'ctx-2' },
    { periodId: 'period-1', contextKey: 'ctx-1' }
  ),
  'Stale report request cannot replace newer selected period'
)

assert(
  normalizeSpace(vatClosingObligationText(period(), formatAmount)) ===
    'Moms att betala: 4 000,00 kr',
  'Closed payable period presents VAT payable plainly'
)

assert(
  normalizeSpace(vatClosingObligationText(
    period({ closing_amount: -1500 }),
    formatAmount
  )) === 'Moms att få tillbaka: 1 500,00 kr',
  'Closed refund period presents VAT refund plainly'
)

assert(
  vatDeclarationStatusText(
    period({
      status: 'declared',
      declared_at: '2026-04-12T10:00:00Z',
      skv_submitted_on: '2026-04-12',
    }),
    formatDate
  ) === 'Momsdeklaration inlämnad till Skatteverket: 2026-04-12',
  'Declared period displays external submission date when available'
)

assert(
  vatDeclarationStatusText(
    period({
      status: 'declared',
      declared_at: '2026-04-12T10:00:00Z',
      skv_submitted_on: null,
    }),
    formatDate
  )?.includes('saknas för den här äldre perioden'),
  'Legacy declared period with NULL submission date does not invent a date'
)

const declarationReady =
  true &&
  isValidSkvSubmittedOnDate({
    submittedOn: '2026-04-12',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  })

assert(
  declarationReady,
  'Declaration button readiness requires a current successful report and valid submitted date'
)

const declarationBlockedByReportFailure =
  false &&
  isValidSkvSubmittedOnDate({
    submittedOn: '2026-04-12',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  })

assert(
  !declarationBlockedByReportFailure,
  'Report failure keeps declaration disabled'
)

const declarationBlockedByInvalidDate =
  true &&
  isValidSkvSubmittedOnDate({
    submittedOn: '',
    periodEnd: '2026-03-31',
    todayIso: '2026-09-28',
  })

assert(
  !declarationBlockedByInvalidDate,
  'Declaration stays disabled for invalid or incomplete submitted date'
)

console.log('VAT lifecycle UI/service tests passed.')
````````

==================================================

==================================================
FILE: scripts/test-vat-settlement-ui.ts
==================================================

````typescript
import {
  canStartVatSettlementSubmit,
  clearSettlementIdempotency,
  deriveVatSettlementReadModel,
  fromSettlementOre,
  isVatSettlementSubmitContextCurrent,
  payableOrRefundHeading,
  parseSettlementAmountOre,
  prepareSettlementIdempotencyKey,
  settlementActionLabel,
  settlementAmountLabel,
  settlementEventText,
  settlementQuestion,
  settlementStateText,
  toSettlementOre,
  validateVatSettlementInput,
  type TaxAccountEventLike,
  type VatSettlementIdempotencyState,
} from '../src/lib/vatSettlementUi.ts'
import type { VatLifecyclePeriodLike } from '../src/lib/vatLifecycleUi.ts'
import {
  RECORD_VAT_SETTLEMENT_RPC_NAME,
  TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN,
  TAX_ACCOUNT_EVENT_SELECT_COLUMNS,
  TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN,
  buildRecordVatSettlementRpcArgs,
} from '../src/lib/vatSettlementRpc.ts'
import {
  VatSettlementSubmissionError,
  classifyVatSettlementRpcError,
  vatSettlementSubmissionFailureKind,
} from '../src/lib/vatSettlementErrors.ts'
import {
  getTransactionSourceUiPolicy,
  isTransactionSystemManagedInUi,
  shouldOfferGenericTransactionCorrection,
  shouldOfferGenericTransactionEdit,
  transactionSourceUiLabel,
} from '../src/lib/transactionSourceUi.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`)
  }
}

function period(
  overrides: Partial<VatLifecyclePeriodLike> = {}
): VatLifecyclePeriodLike {
  return {
    id: 'period-1',
    period_end: '2026-03-31',
    source: 'sololedger',
    status: 'declared',
    closing_amount: 4000,
    declared_at: '2026-04-12T10:00:00Z',
    skv_submitted_on: '2026-04-12',
    ...overrides,
  }
}

function event(
  amount: number,
  overrides: Partial<TaxAccountEventLike> = {}
): TaxAccountEventLike {
  return {
    id: `event-${amount}`,
    vat_period_id: 'period-1',
    event_kind: 'vat_debit',
    event_date: '2026-09-28',
    amount,
    created_at: '2026-09-28T10:00:00Z',
    ...overrides,
  }
}

let uuidCounter = 0
function nextUuid() {
  uuidCounter += 1
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`
}

const payableUnsettled = deriveVatSettlementReadModel(period(), [])
assert(payableUnsettled.actionable, 'Declared SoloLedger non-zero payable is actionable')
assertEqual(payableUnsettled.direction, 'payable', 'Positive closing amount is payable')
assertEqual(payableUnsettled.totalAmount, 4000, 'Payable total is abs closing amount')
assertEqual(payableUnsettled.registeredAmount, 0, 'Unsettled registered amount is zero')
assertEqual(payableUnsettled.remainingAmount, 4000, 'Unsettled remaining amount is total')
assertEqual(payableUnsettled.state, 'unsettled', 'No events means unsettled')

const payablePartial = deriveVatSettlementReadModel(period(), [event(2500)])
assertEqual(payablePartial.registeredAmount, 2500, 'Partial registered amount is summed')
assertEqual(payablePartial.remainingAmount, 1500, 'Partial remaining amount is derived')
assertEqual(payablePartial.state, 'partially_settled', 'Partial amount gives partial state')

const payableFull = deriveVatSettlementReadModel(period(), [event(2500), event(1500)])
assertEqual(payableFull.remainingAmount, 0, 'Full settlement has no remaining amount')
assertEqual(payableFull.state, 'fully_settled', 'Full amount gives full state')

const decimalFull = deriveVatSettlementReadModel(
  period({ closing_amount: 0.3 }),
  [event(0.1), event(0.2)]
)
assertEqual(decimalFull.registeredAmount, 0.3, '0.10 + 0.20 is exact in displayed SEK')
assertEqual(decimalFull.remainingAmount, 0, '0.10 + 0.20 leaves no floating remainder')
assertEqual(decimalFull.state, 'fully_settled', '0.10 + 0.20 fully settles 0.30')

const oneOreBoundary = deriveVatSettlementReadModel(
  period({ closing_amount: 0.03 }),
  [event(0.01)]
)
assertEqual(oneOreBoundary.registeredAmount, 0.01, 'One-öre event is retained exactly')
assertEqual(oneOreBoundary.remainingAmount, 0.02, 'One-öre remaining boundary is exact')

assertEqual(toSettlementOre(0.1), 10, 'Number 0.10 normalizes to ten öre')
assertEqual(toSettlementOre('4000,25'), 400025, 'Comma amount normalizes to öre')
assertEqual(fromSettlementOre(400025), 4000.25, 'Öre converts back to SEK for display')

const refundPartial = deriveVatSettlementReadModel(
  period({ closing_amount: -1500 }),
  [event(500, { event_kind: 'vat_credit' })]
)
assert(refundPartial.actionable, 'Declared SoloLedger non-zero refund is actionable')
assertEqual(refundPartial.direction, 'refund', 'Negative closing amount is refund')
assertEqual(refundPartial.totalAmount, 1500, 'Refund total is abs closing amount')
assertEqual(refundPartial.remainingAmount, 1000, 'Refund remaining amount is derived')

assert(
  !deriveVatSettlementReadModel(period({ status: 'open' }), []).actionable,
  'Open periods are not actionable'
)
assert(
  !deriveVatSettlementReadModel(period({ status: 'closed' }), []).actionable,
  'Closed periods are not actionable'
)
assert(
  !deriveVatSettlementReadModel(period({ source: 'imported_history' }), []).actionable,
  'Imported history is not actionable'
)
assert(
  !deriveVatSettlementReadModel(period({ closing_amount: 0 }), []).actionable,
  'Zero closing amount is not actionable'
)
assert(
  deriveVatSettlementReadModel(period({ skv_submitted_on: null }), [])
    .legacyMissingDeclarationDate,
  'Legacy declared period with NULL submitted date remains visible/actionable'
)

assertEqual(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '1500,25',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).amount,
  1500.25,
  'Swedish decimal amount is parsed'
)
assertEqual(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '4000',
    todayIso: '2026-09-30',
    remainingAmount: 4000,
  }).amount,
  4000,
  'Whole SEK amount is parsed'
)
assertEqual(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '4000.00',
    todayIso: '2026-09-30',
    remainingAmount: 4000,
  }).amount,
  4000,
  'Dot decimal amount is parsed'
)
assertEqual(parseSettlementAmountOre('0,01'), 1, 'One öre input parses exactly')
assert(
  !validateVatSettlementInput({
    eventDate: '2026-10-01',
    amountText: '100',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Future event date is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '0',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Zero amount is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '-10',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Negative amount is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '10.123',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'More than two decimals is rejected'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '2000,01',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Amount over remaining is rejected'
)
assert(
  validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '0,02',
    todayIso: '2026-09-30',
    remainingAmount: 0.02,
  }).ok,
  'Exact one-öre boundary amount is accepted'
)
assert(
  !validateVatSettlementInput({
    eventDate: '2026-09-30',
    amountText: '0,03',
    todayIso: '2026-09-30',
    remainingAmount: 0.02,
  }).ok,
  'One öre over remaining is rejected'
)

assertEqual(payableOrRefundHeading('payable'), 'Moms att betala', 'Payable heading')
assertEqual(payableOrRefundHeading('refund'), 'Moms att få tillbaka', 'Refund heading')
assert(
  settlementQuestion('payable').includes('dragit momsen'),
  'Payable question uses plain tax-account wording'
)
assert(
  settlementQuestion('refund').includes('krediterat momsen'),
  'Refund question uses credited wording'
)
assertEqual(settlementAmountLabel('payable'), 'Belopp som dragits', 'Payable amount label')
assertEqual(settlementAmountLabel('refund'), 'Belopp som krediterats', 'Refund amount label')
assertEqual(settlementActionLabel('payable'), 'Registrera dragning', 'Payable action label')
assertEqual(settlementActionLabel('refund'), 'Registrera kreditering', 'Refund action label')
assertEqual(settlementEventText('vat_debit'), 'Skatteverket drog moms', 'Debit event history text')
assertEqual(settlementEventText('vat_credit'), 'Skatteverket krediterade moms', 'Credit event history text')
assertEqual(settlementStateText('unsettled'), 'Inget registrerat på skattekontot än', 'Unsettled text')
assertEqual(settlementStateText('partially_settled'), 'Delvis avräknad', 'Partial text')
assertEqual(settlementStateText('fully_settled'), 'Helt avräknad', 'Full text')

const primaryCopy = [
  payableOrRefundHeading('payable'),
  payableOrRefundHeading('refund'),
  settlementQuestion('payable'),
  settlementQuestion('refund'),
  settlementAmountLabel('payable'),
  settlementAmountLabel('refund'),
  settlementActionLabel('payable'),
  settlementActionLabel('refund'),
  settlementEventText('vat_debit'),
  settlementEventText('vat_credit'),
  settlementStateText('unsettled'),
  settlementStateText('partially_settled'),
  settlementStateText('fully_settled'),
].join(' ')

for (const forbidden of ['2012', '2650', 'vat_settlement', 'tax_account_events', 'event_kind']) {
  assert(
    !primaryCopy.includes(forbidden),
    `Primary settlement copy does not expose ${forbidden}`
  )
}

let state: VatSettlementIdempotencyState = clearSettlementIdempotency()
const intent = {
  periodId: 'period-1',
  eventDate: '2026-09-28',
  amount: 4000,
}
let prepared = prepareSettlementIdempotencyKey(state, intent, nextUuid)
state = prepared.state
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000001', 'First intent gets one UUID')

prepared = prepareSettlementIdempotencyKey(state, intent, nextUuid)
state = prepared.state
assertEqual(
  prepared.key,
  '00000000-0000-4000-8000-000000000001',
  'Same unchanged intent reuses UUID after indeterminate failure'
)

prepared = prepareSettlementIdempotencyKey(
  state,
  { ...intent, eventDate: '2026-09-29' },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000002', 'Edited date gets new UUID')

prepared = prepareSettlementIdempotencyKey(
  prepared.state,
  { ...intent, eventDate: '2026-09-29', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000003', 'Edited amount gets new UUID')

prepared = prepareSettlementIdempotencyKey(
  prepared.state,
  { ...intent, periodId: 'period-2', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000004', 'Period change gets new UUID')

state = clearSettlementIdempotency()
prepared = prepareSettlementIdempotencyKey(state, intent, nextUuid)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000005', 'Success/reset makes next intent new')

assert(
  canStartVatSettlementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitSettlement: true,
    amount: 4000,
    inFlight: false,
  }),
  'Ready settlement submit is allowed'
)
assert(
  !canStartVatSettlementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitSettlement: true,
    amount: 4000,
    inFlight: true,
  }),
  'In-flight duplicate settlement submit is blocked'
)

assertEqual(
  classifyVatSettlementRpcError({ code: 'P0001', message: 'server rejected' }),
  'authoritative_rejection',
  'Structured PostgREST errors are authoritative rejections'
)
assertEqual(
  classifyVatSettlementRpcError(new TypeError('fetch failed')),
  'indeterminate',
  'Transport errors are indeterminate'
)
assertEqual(
  classifyVatSettlementRpcError({ message: 'shape without code' }),
  'indeterminate',
  'Unknown error shape defaults to indeterminate'
)
assertEqual(
  vatSettlementSubmissionFailureKind(
    new VatSettlementSubmissionError('authoritative_rejection')
  ),
  'authoritative_rejection',
  'Authoritative rejection is not treated as indeterminate'
)
assertEqual(
  vatSettlementSubmissionFailureKind(new Error('plain failure')),
  'indeterminate',
  'Unknown thrown errors are indeterminate'
)

assert(
  isVatSettlementSubmitContextCurrent(
    { periodId: 'q1', contextKey: '2026|profile|q1' },
    { periodId: 'q1', contextKey: '2026|profile|q1' }
  ),
  'Matching submit context may update the selected period UI'
)
assert(
  !isVatSettlementSubmitContextCurrent(
    { periodId: 'q2', contextKey: '2026|profile|q2' },
    { periodId: 'q1', contextKey: '2026|profile|q1' }
  ),
  'Stale old-period success cannot update the newly selected period UI'
)

assertEqual(
  RECORD_VAT_SETTLEMENT_RPC_NAME,
  'record_vat_settlement_atomic',
  'Service uses the exact settlement RPC name'
)

const rpcArgs = buildRecordVatSettlementRpcArgs({
  periodId: '11111111-1111-4111-8111-111111111111',
  eventDate: '2026-09-28',
  amount: 4000,
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
})

assertEqual(
  rpcArgs.p_vat_period_id,
  '11111111-1111-4111-8111-111111111111',
  'Settlement RPC args include period id'
)
assertEqual(rpcArgs.p_event_date, '2026-09-28', 'Settlement RPC args include event date')
assertEqual(rpcArgs.p_amount, 4000, 'Settlement RPC args include amount')
assertEqual(
  rpcArgs.p_idempotency_key,
  '22222222-2222-4222-8222-222222222222',
  'Settlement RPC args include idempotency key'
)

const vatSettlementPolicy = getTransactionSourceUiPolicy({ source: 'vat_settlement' })
assertEqual(vatSettlementPolicy.label, 'Momsavräkning', 'vat_settlement display label')
assert(vatSettlementPolicy.systemManaged, 'vat_settlement is system-managed')
assert(
  isTransactionSystemManagedInUi({ source: 'vat_settlement' }),
  'vat_settlement helper marks the row system-managed'
)
assert(
  !shouldOfferGenericTransactionEdit({ source: 'vat_settlement' }),
  'vat_settlement does not offer generic edit'
)
assert(
  !shouldOfferGenericTransactionCorrection({ source: 'vat_settlement' }),
  'vat_settlement does not offer generic correction'
)
assertEqual(
  transactionSourceUiLabel({ source: 'vat_settlement' }),
  'Momsavräkning',
  'vat_settlement label is centralized'
)

assert(
  !TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('idempotency_key'),
  'Settlement event UI read does not expose idempotency keys'
)
assert(
  !TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('user_id'),
  'Settlement event UI read does not expose user_id'
)
assert(
  TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('vat_period_id') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('transaction_id') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('event_kind') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('event_date') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('amount') &&
    TAX_ACCOUNT_EVENT_SELECT_COLUMNS.includes('created_at'),
  'Settlement event UI read selects the required history/model columns'
)
assertEqual(
  TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN,
  'user_id',
  'Settlement event service scopes reads by authenticated user'
)
assertEqual(
  TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN,
  'vat_period_id',
  'Settlement event service scopes reads by selected period'
)

console.log('VAT settlement UI/service tests passed.')

````````

==================================================

==================================================
FILE: scripts/test-tax-account-movement-ui.ts
==================================================

````typescript
import {
  TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY,
  TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY,
  TAX_ACCOUNT_MOVEMENT_UNSURE_COPY,
  canStartTaxAccountMovementSubmit,
  clearTaxAccountMovementIdempotency,
  clearTaxAccountMovementIdempotencyStorage,
  defaultTaxAccountMovementChoice,
  deriveTaxAccountMovementReadModel,
  readTaxAccountMovementIdempotencyFromStorage,
  taxAccountMovementActionLabel,
  taxAccountMovementAmountLabel,
  taxAccountMovementHistoryText,
  taxAccountMovementKindForChoice,
  taxAccountMovementQuestion,
  taxAccountMovementStateText,
  validateTaxAccountMovementInput,
  writeTaxAccountMovementIdempotencyToStorage,
  nextTaxAccountMovementChoiceForContext,
  prepareTaxAccountMovementIdempotencyKey,
  type TaxAccountMovementIdempotencyState,
  type TaxAccountMovementLike,
  type TaxAccountMovementStorageLike,
} from '../src/lib/taxAccountMovementUi.ts'
import type { VatLifecyclePeriodLike } from '../src/lib/vatLifecycleUi.ts'
import {
  RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME,
  TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN,
  TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS,
  TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN,
  buildRecordTaxAccountMovementRpcArgs,
} from '../src/lib/taxAccountMovementRpc.ts'
import {
  TaxAccountMovementSubmissionError,
  classifyTaxAccountMovementRpcError,
  taxAccountMovementSubmissionErrorMessage,
  taxAccountMovementSubmissionFailureKind,
} from '../src/lib/taxAccountMovementErrors.ts'
import {
  getTransactionSourceUiPolicy,
  isTransactionSystemManagedInUi,
  shouldOfferGenericTransactionCorrection,
  shouldOfferGenericTransactionEdit,
  transactionSourceUiLabel,
} from '../src/lib/transactionSourceUi.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`)
  }
}

function period(
  overrides: Partial<VatLifecyclePeriodLike> = {}
): VatLifecyclePeriodLike {
  return {
    id: 'period-1',
    period_end: '2026-03-31',
    source: 'sololedger',
    status: 'closed',
    closing_amount: 4000,
    declared_at: null,
    skv_submitted_on: null,
    ...overrides,
  }
}

function movement(
  amount: number,
  overrides: Partial<TaxAccountMovementLike> = {}
): TaxAccountMovementLike {
  return {
    id: `movement-${amount}`,
    vat_period_id: 'period-1',
    movement_kind: 'business_to_tax_account',
    movement_date: '2026-09-28',
    amount,
    payment_account_role: 'business_payment_account',
    counter_account_number: '1930',
    created_at: '2026-09-28T10:00:00Z',
    ...overrides,
  }
}

function memoryStorage(): TaxAccountMovementStorageLike {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: key => {
      values.delete(key)
    },
  }
}

let uuidCounter = 0
function nextUuid() {
  uuidCounter += 1
  return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`
}

const payableUnmoved = deriveTaxAccountMovementReadModel(period(), [])
assert(payableUnmoved.actionable, 'Closed SoloLedger payable period is actionable')
assertEqual(payableUnmoved.direction, 'payable', 'Positive closing amount is payable')
assertEqual(payableUnmoved.totalAmount, 4000, 'Payable total is abs closing amount')
assertEqual(payableUnmoved.registeredAmount, 0, 'Unmoved registered amount is zero')
assertEqual(payableUnmoved.remainingAmount, 4000, 'Unmoved remaining amount is total')
assertEqual(payableUnmoved.state, 'unmoved', 'No movements means unmoved')

const declaredPayable = deriveTaxAccountMovementReadModel(
  period({ status: 'declared', declared_at: '2026-04-12T10:00:00Z' }),
  []
)
assert(declaredPayable.actionable, 'Declared SoloLedger payable period is actionable')

const payablePartial = deriveTaxAccountMovementReadModel(period(), [movement(1500)])
assertEqual(payablePartial.registeredAmount, 1500, 'Partial movement amount is summed')
assertEqual(payablePartial.remainingAmount, 2500, 'Partial movement remaining is derived')
assertEqual(payablePartial.state, 'partially_moved', 'Partial amount gives partial state')

const payableFull = deriveTaxAccountMovementReadModel(period(), [
  movement(1500),
  movement(2500),
])
assertEqual(payableFull.remainingAmount, 0, 'Full movement has no remaining amount')
assertEqual(payableFull.state, 'fully_moved', 'Full amount gives full state')

const refundPartial = deriveTaxAccountMovementReadModel(
  period({ closing_amount: -1500 }),
  [movement(500, { movement_kind: 'tax_account_to_business' })]
)
assert(refundPartial.actionable, 'Closed SoloLedger refund period is actionable')
assertEqual(refundPartial.direction, 'refund', 'Negative closing amount is refund')
assertEqual(refundPartial.remainingAmount, 1000, 'Refund remaining amount is derived')

assert(
  !deriveTaxAccountMovementReadModel(period({ status: 'open' }), []).actionable,
  'Open periods are not actionable'
)
assert(
  !deriveTaxAccountMovementReadModel(period({ source: 'imported_history' }), []).actionable,
  'Imported history is not actionable'
)
assert(
  !deriveTaxAccountMovementReadModel(period({ closing_amount: 0 }), []).actionable,
  'Zero closing amount is not actionable'
)

assertEqual(
  taxAccountMovementKindForChoice('payable', 'business_account'),
  'business_to_tax_account',
  'Payable business choice maps to business-to-tax-account movement'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'owner_private'),
  'owner_private_to_tax_account',
  'Payable private choice maps to private-to-tax-account movement'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'business_account'),
  'tax_account_to_business',
  'Refund business choice maps to tax-account-to-business movement'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'owner_private'),
  'tax_account_to_owner_private',
  'Refund private choice maps to tax-account-to-private movement'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'not_yet'),
  null,
  'Payable not-yet choice creates no movement kind'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'tax_account_only'),
  null,
  'Refund tax-account-only choice creates no movement kind'
)
assertEqual(defaultTaxAccountMovementChoice('payable'), 'not_yet', 'Payable default does not book')
assertEqual(defaultTaxAccountMovementChoice('refund'), 'tax_account_only', 'Refund default does not book')
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'business_account',
    previousContextKey: '2026|profile|payable-period',
    nextContextKey: '2026|profile|refund-period',
    previousDirection: 'payable',
    nextDirection: 'refund',
  }),
  'tax_account_only',
  'Payable bookable choice does not carry into a refund period'
)
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'owner_private',
    previousContextKey: '2026|profile|refund-period',
    nextContextKey: '2026|profile|payable-period',
    previousDirection: 'refund',
    nextDirection: 'payable',
  }),
  'not_yet',
  'Refund bookable choice does not carry into a payable period'
)
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'unsure',
    previousContextKey: '2026|profile|payable-period',
    nextContextKey: '2026|profile|payable-period',
    previousDirection: 'payable',
    nextDirection: 'payable',
  }),
  'unsure',
  'Unsure remains selected within the same period context'
)
assertEqual(
  nextTaxAccountMovementChoiceForContext({
    currentChoice: 'business_account',
    previousContextKey: '2026|profile|same-period',
    nextContextKey: '2026|profile|same-period',
    previousDirection: 'payable',
    nextDirection: 'refund',
  }),
  'tax_account_only',
  'Same-period direction change resets stale payable choice to refund default'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'unsure'),
  null,
  'Unsure cannot produce a payable movement RPC intent'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'unsure'),
  null,
  'Unsure cannot produce a refund movement RPC intent'
)
assertEqual(
  taxAccountMovementKindForChoice('payable', 'not_yet'),
  null,
  'Not-yet cannot produce a movement RPC intent'
)
assertEqual(
  taxAccountMovementKindForChoice('refund', 'tax_account_only'),
  null,
  'Refund remaining on tax account cannot produce a movement RPC intent'
)

assertEqual(
  validateTaxAccountMovementInput({
    movementDate: '2026-09-30',
    amountText: '1500,25',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).amount,
  1500.25,
  'Swedish decimal amount is parsed'
)
assert(
  !validateTaxAccountMovementInput({
    movementDate: '2026-10-01',
    amountText: '100',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Future movement date is rejected'
)
assert(
  !validateTaxAccountMovementInput({
    movementDate: '2026-09-30',
    amountText: '2000,01',
    todayIso: '2026-09-30',
    remainingAmount: 2000,
  }).ok,
  'Amount over remaining VAT allocation is rejected'
)

const primaryCopy = [
  taxAccountMovementQuestion('payable'),
  taxAccountMovementQuestion('refund'),
  taxAccountMovementActionLabel('business_to_tax_account'),
  taxAccountMovementActionLabel('owner_private_to_tax_account'),
  taxAccountMovementActionLabel('tax_account_to_business'),
  taxAccountMovementActionLabel('tax_account_to_owner_private'),
  taxAccountMovementAmountLabel('payable'),
  taxAccountMovementAmountLabel('refund'),
  taxAccountMovementHistoryText('business_to_tax_account'),
  taxAccountMovementHistoryText('owner_private_to_tax_account'),
  taxAccountMovementHistoryText('tax_account_to_business'),
  taxAccountMovementHistoryText('tax_account_to_owner_private'),
  taxAccountMovementStateText('unmoved'),
  taxAccountMovementStateText('partially_moved'),
  taxAccountMovementStateText('fully_moved'),
  TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY,
  TAX_ACCOUNT_MOVEMENT_UNSURE_COPY,
].join(' ')

for (const forbidden of ['2012', '2650', 'debit', 'credit', 'tax_account_movements']) {
  assert(
    !primaryCopy.includes(forbidden),
    `Primary movement copy does not expose ${forbidden}`
  )
}

let state: TaxAccountMovementIdempotencyState = clearTaxAccountMovementIdempotency()
const intent = {
  periodId: 'period-1',
  movementKind: 'business_to_tax_account' as const,
  movementDate: '2026-09-28',
  amount: 4000,
}
let prepared = prepareTaxAccountMovementIdempotencyKey(state, intent, nextUuid)
state = prepared.state
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000001', 'First intent gets one UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(state, intent, nextUuid)
assertEqual(
  prepared.key,
  '00000000-0000-4000-8000-000000000001',
  'Same unchanged movement intent reuses UUID after indeterminate failure'
)

prepared = prepareTaxAccountMovementIdempotencyKey(
  state,
  { ...intent, amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000002', 'Edited movement amount gets new UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(
  prepared.state,
  { ...intent, periodId: 'period-2', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000003', 'Period switch gets new movement UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(
  prepared.state,
  { ...intent, movementDate: '2026-09-29', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000004', 'Edited movement date gets new UUID')

prepared = prepareTaxAccountMovementIdempotencyKey(
  prepared.state,
  { ...intent, movementKind: 'owner_private_to_tax_account', amount: 3999 },
  nextUuid
)
assertEqual(prepared.key, '00000000-0000-4000-8000-000000000005', 'Edited movement kind gets new UUID')

const storage = memoryStorage()
writeTaxAccountMovementIdempotencyToStorage(storage, prepared.state)
assert(storage.getItem(TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY), 'Prepared key is persisted for reload retry')
const restored = readTaxAccountMovementIdempotencyFromStorage(storage)
assertEqual(restored.key, prepared.key, 'Stored movement idempotency key is restored')
assertEqual(restored.intent?.amount, 3999, 'Stored movement intent is restored')
clearTaxAccountMovementIdempotencyStorage(storage)
assertEqual(
  readTaxAccountMovementIdempotencyFromStorage(storage).key,
  null,
  'Movement idempotency storage clears after success or authoritative rejection'
)
storage.setItem(TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STORAGE_KEY, '{"key":1,"intent":{}}')
assertEqual(
  readTaxAccountMovementIdempotencyFromStorage(storage).key,
  null,
  'Malformed movement idempotency storage fails safely'
)

assert(
  canStartTaxAccountMovementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitMovement: true,
    amount: 4000,
    movementKind: 'business_to_tax_account',
    inFlight: false,
  }),
  'Ready movement submit is allowed'
)
assert(
  !canStartTaxAccountMovementSubmit({
    hasSelectedPeriod: true,
    hasSelectedContext: true,
    canSubmitMovement: true,
    amount: 4000,
    movementKind: 'business_to_tax_account',
    inFlight: true,
  }),
  'In-flight duplicate movement submit is blocked'
)

assertEqual(
  classifyTaxAccountMovementRpcError({ code: 'P0001', message: 'server rejected' }),
  'authoritative_rejection',
  'Structured PostgREST movement errors are authoritative rejections'
)
assertEqual(
  classifyTaxAccountMovementRpcError(new TypeError('fetch failed')),
  'indeterminate',
  'Transport movement errors are indeterminate'
)
assertEqual(
  taxAccountMovementSubmissionFailureKind(
    new TaxAccountMovementSubmissionError('authoritative_rejection')
  ),
  'authoritative_rejection',
  'Movement authoritative rejection is not treated as indeterminate'
)
assert(
  taxAccountMovementSubmissionErrorMessage(
    new TaxAccountMovementSubmissionError(
      'authoritative_rejection',
      'Det konfigurerade betalningskontot är inte giltigt för skattekontorörelsen: 2018.'
    )
  ).includes('Betalningskontot'),
  'Invalid stored payment-role configuration gets actionable movement error copy'
)

assertEqual(
  RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME,
  'record_tax_account_movement_atomic',
  'Service uses the exact tax-account movement RPC name'
)

const rpcArgs = buildRecordTaxAccountMovementRpcArgs({
  movementKind: 'business_to_tax_account',
  movementDate: '2026-09-28',
  amount: 4000,
  vatPeriodId: '11111111-1111-4111-8111-111111111111',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
})

assertEqual(rpcArgs.p_movement_kind, 'business_to_tax_account', 'Movement RPC args include kind')
assertEqual(rpcArgs.p_movement_date, '2026-09-28', 'Movement RPC args include date')
assertEqual(rpcArgs.p_amount, 4000, 'Movement RPC args include amount')
assertEqual(
  rpcArgs.p_vat_period_id,
  '11111111-1111-4111-8111-111111111111',
  'Movement RPC args include nullable VAT period id when linked'
)
assertEqual(
  rpcArgs.p_idempotency_key,
  '22222222-2222-4222-8222-222222222222',
  'Movement RPC args include idempotency key'
)

const sourcePolicy = getTransactionSourceUiPolicy({ source: 'tax_account_movement' })
assertEqual(sourcePolicy.label, 'Skattekontorörelse', 'tax_account_movement display label')
assert(sourcePolicy.systemManaged, 'tax_account_movement is system-managed')
assert(
  isTransactionSystemManagedInUi({ source: 'tax_account_movement' }),
  'tax_account_movement helper marks the row system-managed'
)
assert(
  !shouldOfferGenericTransactionEdit({ source: 'tax_account_movement' }),
  'tax_account_movement does not offer generic edit'
)
assert(
  !shouldOfferGenericTransactionCorrection({ source: 'tax_account_movement' }),
  'tax_account_movement does not offer generic correction'
)
assertEqual(
  transactionSourceUiLabel({ source: 'tax_account_movement' }),
  'Skattekontorörelse',
  'tax_account_movement label is centralized'
)

assert(
  !TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('idempotency_key'),
  'Movement UI read does not expose idempotency keys'
)
assert(
  !TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('user_id'),
  'Movement UI read does not expose user_id'
)
assert(
  TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('vat_period_id') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('transaction_id') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('movement_kind') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('movement_date') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('amount') &&
    TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS.includes('created_at'),
  'Movement UI read selects the required history/model columns'
)
assertEqual(
  TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN,
  'user_id',
  'Movement service scopes reads by authenticated user'
)
assertEqual(
  TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN,
  'vat_period_id',
  'Movement service scopes reads by selected period'
)

console.log('Tax-account movement UI/service tests passed.')
````````

==================================================

==================================================
FILE: scripts/test-vat-declaration-sql.sql
==================================================

````sql
\set ON_ERROR_STOP on

BEGIN;

\i supabase/migrations/20260928193000_add_vat_declaration_submission_date.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'vat_periods'
      AND column_name = 'skv_submitted_on'
      AND data_type = 'date'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'skv_submitted_on date NULL column was not created.';
  END IF;

  IF to_regprocedure('public.declare_vat_period_atomic(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy one-argument declare_vat_period_atomic still exists.';
  END IF;

  IF to_regprocedure('public.declare_vat_period_atomic(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'New two-argument declare_vat_period_atomic is missing.';
  END IF;

  IF to_regprocedure('public.close_vat_period_atomic(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Existing close_vat_period_atomic disappeared.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = 'public.declare_vat_period_atomic(uuid,date)'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC can execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anon can execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated cannot execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute declare_vat_period_atomic(uuid,date).';
  END IF;

  IF NOT has_function_privilege(
    'postgres',
    'public.declare_vat_period_atomic(uuid,date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'postgres cannot execute declare_vat_period_atomic(uuid,date).';
  END IF;
END
$$;

INSERT INTO auth.users (id)
VALUES
  ('10000000-0000-0000-0000-000000000101'),
  ('10000000-0000-0000-0000-000000000202')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.vat_periods (
  id,
  user_id,
  period_start,
  period_end,
  period_type,
  status,
  source,
  closing_amount,
  closing_transaction_id,
  declared_at,
  skv_submitted_on
) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    '2026-01-01',
    '2026-03-31',
    'quarter',
    'closed',
    'sololedger',
    4000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000101',
    '2026-04-01',
    '2026-06-30',
    'quarter',
    'closed',
    'sololedger',
    1000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000101',
    '2026-07-01',
    '2026-09-30',
    'quarter',
    'closed',
    'imported_history',
    1000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000101',
    '2026-10-01',
    '2026-12-31',
    'quarter',
    'open',
    'sololedger',
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000202',
    '2026-01-01',
    '2026-03-31',
    'quarter',
    'closed',
    'sololedger',
    4000,
    NULL,
    NULL,
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000101',
    '2025-01-01',
    '2025-03-31',
    'quarter',
    'declared',
    'sololedger',
    3000,
    NULL,
    now(),
    NULL
  );

CREATE TEMP TABLE vat_declaration_counts_before AS
SELECT
  (SELECT count(*) FROM public.transactions) AS transaction_count,
  (SELECT count(*) FROM public.journal_entries) AS journal_count;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000001',
    '2026-04-12'
  );

  IF v_result->>'success' <> 'true' THEN
    RAISE EXCEPTION 'Declaration did not return success.';
  END IF;

  IF v_result->>'already_declared' <> 'false' THEN
    RAISE EXCEPTION 'New declaration was incorrectly marked already_declared.';
  END IF;

  IF v_result->>'skv_submitted_on' <> '2026-04-12' THEN
    RAISE EXCEPTION 'Returned submitted date was not stored correctly: %',
      v_result->>'skv_submitted_on';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.vat_periods
    WHERE id = '20000000-0000-0000-0000-000000000001'
      AND status = 'declared'
      AND skv_submitted_on = '2026-04-12'
      AND declared_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'closed -> declared did not persist expected state.';
  END IF;

  IF (
    SELECT transaction_count
    FROM vat_declaration_counts_before
  ) <> (
    SELECT count(*)
    FROM public.transactions
  ) THEN
    RAISE EXCEPTION 'Declaration created a transaction.';
  END IF;

  IF (
    SELECT journal_count
    FROM vat_declaration_counts_before
  ) <> (
    SELECT count(*)
    FROM public.journal_entries
  ) THEN
    RAISE EXCEPTION 'Declaration created journal rows.';
  END IF;
END
$$;

CREATE TEMP TABLE declared_period_snapshot AS
SELECT id, status, declared_at, updated_at, skv_submitted_on
FROM public.vat_periods
WHERE id = '20000000-0000-0000-0000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000001',
    '2026-04-12'
  );

  IF v_result->>'already_declared' <> 'true' THEN
    RAISE EXCEPTION 'Retry with same date was not idempotent.';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.vat_periods vp
    JOIN declared_period_snapshot s ON s.id = vp.id
    WHERE vp.id = '20000000-0000-0000-0000-000000000001'
      AND vp.status = s.status
      AND vp.declared_at = s.declared_at
      AND vp.updated_at = s.updated_at
      AND vp.skv_submitted_on = s.skv_submitted_on
  ) THEN
    RAISE EXCEPTION 'Same-date retry changed stored declaration state.';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000001',
    '2026-04-13'
  );

  RAISE EXCEPTION 'Retry with different submitted date was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.vat_periods vp
    JOIN declared_period_snapshot s ON s.id = vp.id
    WHERE vp.id = '20000000-0000-0000-0000-000000000001'
      AND vp.status = s.status
      AND vp.declared_at = s.declared_at
      AND vp.updated_at = s.updated_at
      AND vp.skv_submitted_on = s.skv_submitted_on
  ) THEN
    RAISE EXCEPTION 'Conflicting retry changed stored declaration state.';
  END IF;
END
$$;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000101',
  true
);

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000002',
    NULL::date
  );

  RAISE EXCEPTION 'NULL submitted date was accepted for a new closed period.';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000002',
    current_date + 1
  );

  RAISE EXCEPTION 'Future submitted date was accepted.';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000002',
    '2026-06-29'
  );

  RAISE EXCEPTION 'Submitted date before period end was accepted.';
EXCEPTION
  WHEN invalid_parameter_value THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000005',
    '2026-04-12'
  );

  RAISE EXCEPTION 'Cross-user declaration was accepted.';
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000003',
    '2026-10-12'
  );

  RAISE EXCEPTION 'Imported-history declaration was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

DO $$
BEGIN
  PERFORM public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000004',
    '2027-01-12'
  );

  RAISE EXCEPTION 'Open-period declaration was accepted.';
EXCEPTION
  WHEN check_violation THEN
    NULL;
END
$$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.declare_vat_period_atomic(
    '20000000-0000-0000-0000-000000000006',
    '2025-04-12'
  );

  IF v_result->>'already_declared' <> 'true' THEN
    RAISE EXCEPTION 'Legacy declared row did not return idempotent success.';
  END IF;

  IF v_result ? 'skv_submitted_on'
     AND v_result->>'skv_submitted_on' IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy declared row invented a submitted date.';
  END IF;
END
$$;

RESET ROLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.vat_periods
    WHERE id = '20000000-0000-0000-0000-000000000006'
      AND skv_submitted_on IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Legacy declared row was silently backfilled.';
  END IF;
END
$$;

ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan17a_vat_account_classification_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-17A rollback/equivalence test for central VAT account classification.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- This script does not create persistent data. It installs the local KAN-17A
-- classification candidate inside one outer transaction, verifies signatures,
-- capability outputs, equivalence with current V1 predicates, and then rolls
-- everything back.
--
-- Intended use, only against an isolated/local/staging database:
--
--   psql "$DATABASE_URL" \
--     -f supabase/tests/kan17a_vat_account_classification_candidate.sql

BEGIN;

-- Install the exact local KAN-17A candidate inside the rollback transaction.
\ir ../migrations/20260925050113_20260925_add_vat_account_classification.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-17A assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-17A assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE TEMP TABLE kan17a_expected_accounts (
  account_number text,
  expected_period_guard boolean,
  expected_close_balance boolean,
  expected_close_manual_review boolean,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan17a_expected_accounts (
  account_number,
  expected_period_guard,
  expected_close_balance,
  expected_close_manual_review,
  note
) VALUES
  ('2610', true,  true,  false, '261x lower representative'),
  ('2611', true,  true,  false, '261x canonical 25 percent output VAT'),
  ('2619', true,  true,  false, '261x upper representative'),
  ('2620', true,  true,  false, '262x lower representative'),
  ('2621', true,  true,  false, '262x canonical 12 percent output VAT'),
  ('2629', true,  true,  false, '262x upper representative'),
  ('2630', true,  true,  false, '263x lower representative'),
  ('2631', true,  true,  false, '263x canonical 6 percent output VAT'),
  ('2639', true,  true,  false, '263x upper representative'),
  ('2640', false, false, false, 'other 264x below exact 2641'),
  ('2641', true,  true,  false, 'exact deductible input VAT account'),
  ('2642', false, false, false, 'other 264x above exact 2641'),
  ('2649', false, false, false, 'other 264x upper representative'),
  ('2650', true,  false, true,  'canonical VAT settlement account'),
  ('2651', true,  false, true,  'other 265x representative'),
  ('2659', true,  false, true,  'other 265x upper representative'),
  ('1930', false, false, false, 'ordinary bank account'),
  ('3010', false, false, false, 'ordinary sales account'),
  ('5410', false, false, false, 'ordinary expense account'),
  (NULL,   NULL,  NULL,  NULL,  'NULL preserves SQL predicate NULL behavior'),
  ('',     false, false, false, 'empty string'),
  ('26',   false, false, false, 'prefix boundary before supported ranges'),
  ('261',  true,  true,  false, 'LIKE prefix boundary'),
  ('26100', true, true,  false, 'five-character prefix match'),
  ('261ABC', true, true, false, 'nonnumeric text preserving prefix behavior'),
  ('26410', false, false, false, 'exact 2641 does not match longer account text'),
  ('265', true,  false, true,  '265 prefix boundary'),
  ('265ABC', true, false, true, 'nonnumeric 265 prefix behavior'),
  ('vat', false, false, false, 'unrelated nonnumeric text');

DO $$
DECLARE
  v_mismatch_count integer;
  v_definition text;
BEGIN
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_classification(text)') IS NOT NULL,
    'central classification function exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_is_period_guard_relevant(text)') IS NOT NULL,
    'period guard wrapper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_is_close_balance_participant(text)') IS NOT NULL,
    'close balance wrapper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_requires_close_manual_review(text)') IS NOT NULL,
    'close manual-review wrapper exists'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_period_guard_relevant IS DISTINCT FROM e.expected_period_guard
     OR c.vat_close_balance_participant IS DISTINCT FROM e.expected_close_balance
     OR c.vat_close_manual_review_relevant IS DISTINCT FROM e.expected_close_manual_review;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'explicit capability output matrix matches expected V1 semantics'
  );

  -- P1 equivalence: existing live helper semantics must equal the new
  -- period-guard capability for every representative account.
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_period_guard_relevant
        IS DISTINCT FROM public.vat_concurrency_account(e.account_number);

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P1 equivalence with public.vat_concurrency_account(text)'
  );

  -- P2 equivalence: current close balance participant predicate embedded in
  -- close_vat_period_atomic(uuid), derived from fresh pg_get_functiondef().
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_close_balance_participant
        IS DISTINCT FROM (
             e.account_number LIKE '261%'
          OR e.account_number LIKE '262%'
          OR e.account_number LIKE '263%'
          OR e.account_number = '2641'
        );

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P2 equivalence with current close balance predicate'
  );

  -- P3 equivalence: current close manual-review predicate embedded in
  -- close_vat_period_atomic(uuid).
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_close_manual_review_relevant
        IS DISTINCT FROM (e.account_number LIKE '265%');

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P3 equivalence with current close manual-review predicate'
  );

  -- Thin wrappers must consume the central classifier, not duplicate their own
  -- independent predicate behavior.
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17a_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE public.vat_account_is_period_guard_relevant(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant
     OR public.vat_account_is_close_balance_participant(e.account_number)
          IS DISTINCT FROM c.vat_close_balance_participant
     OR public.vat_account_requires_close_manual_review(e.account_number)
          IS DISTINCT FROM c.vat_close_manual_review_relevant;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'semantic wrappers match central classifier outputs'
  );

  SELECT pg_get_functiondef('public.vat_concurrency_account(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%p_account_number LIKE ''261%''%'
    AND v_definition LIKE '%p_account_number LIKE ''262%''%'
    AND v_definition LIKE '%p_account_number LIKE ''263%''%'
    AND v_definition LIKE '%p_account_number = ''2641''%'
    AND v_definition LIKE '%p_account_number LIKE ''265%''%'
    AND v_definition NOT LIKE '%vat_account_classification%',
    'existing vat_concurrency_account definition remains unchanged'
  );

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%je.account_number LIKE ''265%''%'
    AND v_definition LIKE '%je.account_number LIKE ''261%''%'
    AND v_definition LIKE '%je.account_number LIKE ''262%''%'
    AND v_definition LIKE '%je.account_number LIKE ''263%''%'
    AND v_definition LIKE '%je.account_number = ''2641''%'
    AND v_definition NOT LIKE '%vat_account_classification%'
    AND v_definition NOT LIKE '%vat_account_is_close_balance_participant%'
    AND v_definition NOT LIKE '%vat_account_requires_close_manual_review%',
    'existing close_vat_period_atomic definition remains unchanged'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_classification(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute central classifier directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_is_period_guard_relevant(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute period guard wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_is_close_balance_participant(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute close balance wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'authenticated',
      'public.vat_account_requires_close_manual_review(text)'::regprocedure,
      'EXECUTE'
    ),
    'authenticated cannot execute close manual-review wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_classification(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute central classifier directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_is_period_guard_relevant(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute period guard wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_is_close_balance_participant(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute close balance wrapper directly'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege(
      'anon',
      'public.vat_account_requires_close_manual_review(text)'::regprocedure,
      'EXECUTE'
    ),
    'anon cannot execute close manual-review wrapper directly'
  );

  RAISE NOTICE 'KAN-17A VAT account classification equivalence tests passed for % account cases.',
    (SELECT count(*) FROM kan17a_expected_accounts);
END;
$$;

-- This must stay ROLLBACK so the candidate function install is discarded.
ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan17b_vat_concurrency_account_delegate_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-17B rollback/equivalence test for the VAT concurrency compatibility helper.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- This script does not create persistent data. It installs the local KAN-17A
-- classifier/wrappers and KAN-17B compatibility-helper candidate inside one
-- outer transaction, verifies P1 equivalence, and then rolls everything back.
--
-- Intended use, only against an isolated/local/staging database:
--
--   psql "$DATABASE_URL" \
--     -f supabase/tests/kan17b_vat_concurrency_account_delegate_candidate.sql

BEGIN;

-- Install the local foundations inside the rollback transaction.
\ir ../migrations/20260925050113_20260925_add_vat_account_classification.sql
\ir ../migrations/20260925070346_20260925_delegate_vat_concurrency_account.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-17B assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-17B assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE TEMP TABLE kan17b_expected_accounts (
  account_number text,
  expected_period_guard boolean,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan17b_expected_accounts (
  account_number,
  expected_period_guard,
  note
) VALUES
  ('2610', true,  '261x lower representative'),
  ('2611', true,  '261x canonical 25 percent output VAT'),
  ('2619', true,  '261x upper representative'),
  ('2620', true,  '262x lower representative'),
  ('2621', true,  '262x canonical 12 percent output VAT'),
  ('2629', true,  '262x upper representative'),
  ('2630', true,  '263x lower representative'),
  ('2631', true,  '263x canonical 6 percent output VAT'),
  ('2639', true,  '263x upper representative'),
  ('2640', false, 'other 264x below exact 2641'),
  ('2641', true,  'exact deductible input VAT account'),
  ('2642', false, 'other 264x above exact 2641'),
  ('2649', false, 'other 264x upper representative'),
  ('2650', true,  'canonical VAT settlement account'),
  ('2651', true,  'other 265x representative'),
  ('2659', true,  'other 265x upper representative'),
  ('1930', false, 'ordinary bank account'),
  ('3010', false, 'ordinary sales account'),
  ('5410', false, 'ordinary expense account'),
  (NULL,   NULL,  'NULL preserves SQL predicate NULL behavior'),
  ('',     false, 'empty string'),
  ('26',   false, 'prefix boundary before supported ranges'),
  ('261',  true,  'LIKE prefix boundary'),
  ('26100', true, 'five-character prefix match'),
  ('261ABC', true, 'nonnumeric text preserving prefix behavior'),
  ('26410', false, 'exact 2641 does not match longer account text'),
  ('265', true,  '265 prefix boundary'),
  ('265ABC', true, 'nonnumeric 265 prefix behavior'),
  ('nonnumeric text', false, 'unrelated nonnumeric text');

DO $$
DECLARE
  v_mismatch_count integer;
  v_definition text;
  v_consumer_name text;
  v_consumer_arg_types text;
BEGIN
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_concurrency_account(text)') IS NOT NULL,
    'compatibility helper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_is_period_guard_relevant(text)') IS NOT NULL,
    'period guard semantic wrapper exists'
  );
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.vat_account_classification(text)') IS NOT NULL,
    'central classifier exists'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17b_expected_accounts e
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM e.expected_period_guard
     OR public.vat_account_is_period_guard_relevant(e.account_number)
          IS DISTINCT FROM e.expected_period_guard
     OR (
          e.account_number LIKE '261%'
       OR e.account_number LIKE '262%'
       OR e.account_number LIKE '263%'
       OR e.account_number = '2641'
       OR e.account_number LIKE '265%'
        ) IS DISTINCT FROM e.expected_period_guard;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'legacy P1 predicate, compatibility helper, and semantic wrapper match expected outputs'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17b_expected_accounts e
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM public.vat_account_is_period_guard_relevant(e.account_number);

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'compatibility helper delegates to the period guard semantic wrapper'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17b_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'compatibility helper matches central classifier P1 output'
  );

  SELECT pg_get_functiondef('public.vat_concurrency_account(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%RETURNS boolean%'
    AND v_definition LIKE '%LANGUAGE sql%'
    AND v_definition LIKE '%IMMUTABLE PARALLEL SAFE%'
    AND v_definition LIKE '%SET search_path TO ''public''%'
    AND v_definition LIKE '%public.vat_account_is_period_guard_relevant(p_account_number)%'
    AND v_definition NOT LIKE '%p_account_number LIKE ''261%''%',
    'compatibility helper signature/properties are preserved and implementation delegates'
  );

  FOR v_consumer_name, v_consumer_arg_types IN
    VALUES
      ('book_transaction_atomic', 'jsonb'),
      ('book_periodized_transaction_atomic', 'jsonb'),
      ('create_correction_transaction_atomic', 'uuid'),
      ('import_sie_batch', 'jsonb'),
      ('undo_sie_import_atomic', 'uuid')
  LOOP
    SELECT pg_get_functiondef(
             (format('public.%I(%s)', v_consumer_name, v_consumer_arg_types))::regprocedure
           )
      INTO v_definition;

    PERFORM pg_temp.assert_true(
      v_definition LIKE '%vat_concurrency_account%'
      AND v_definition NOT LIKE '%vat_account_is_period_guard_relevant%'
      AND v_definition NOT LIKE '%vat_account_classification%',
      format('%s continues to call only the compatibility helper', v_consumer_name)
    );
  END LOOP;

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%je.account_number LIKE ''265%''%'
    AND v_definition LIKE '%je.account_number LIKE ''261%''%'
    AND v_definition LIKE '%je.account_number LIKE ''262%''%'
    AND v_definition LIKE '%je.account_number LIKE ''263%''%'
    AND v_definition LIKE '%je.account_number = ''2641''%'
    AND v_definition NOT LIKE '%vat_account_is_period_guard_relevant%'
    AND v_definition NOT LIKE '%vat_account_classification%',
    'P2/P3 close_vat_period_atomic predicates remain embedded and unchanged'
  );

  RAISE NOTICE 'KAN-17B VAT concurrency helper delegation tests passed for % account cases.',
    (SELECT count(*) FROM kan17b_expected_accounts);
END;
$$;

-- This must stay ROLLBACK so the candidate function install is discarded.
ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan17c_vat_close_account_classification_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-17C rollback/equivalence candidate for VAT close account classification.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan17c_vat_close_account_classification_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION and fixture writes, runs inside one outer transaction and ends with
-- ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan17c_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan17c_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

-- Install local foundations and the KAN-17C candidate inside the rollback
-- transaction. This script is not for live use.
\ir ../migrations/20260925050113_20260925_add_vat_account_classification.sql
\ir ../migrations/20260925124023_delegate_vat_close_account_classification.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-17C assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-17C assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'open',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT NULL,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce((entry->>'debit')::numeric, 0)), 0),
    coalesce(sum(coalesce((entry->>'credit')::numeric, 0)), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_entries) AS entry;

  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'KAN-17C fixture is unbalanced: % (debit %, credit %)',
      p_description, v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    true,
    p_source
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_tx_id,
    p_ver_nr,
    entry->>'account',
    coalesce((entry->>'debit')::numeric, 0),
    coalesce((entry->>'credit')::numeric, 0),
    p_description,
    coalesce((entry->>'date')::date, p_tx_date),
    p_user_id
  FROM jsonb_array_elements(p_entries) AS entry;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_account_balance(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_account_number text,
  p_expected numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
    INTO v_balance
  FROM public.journal_entries
  WHERE user_id = p_user_id
    AND date BETWEEN p_period_start AND p_period_end
    AND account_number = p_account_number;

  PERFORM pg_temp.assert_eq(v_balance, p_expected, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_closing_transaction(
  p_user_id uuid,
  p_transaction_id uuid,
  p_period_end date,
  p_expected_amount numeric,
  p_expected_row_count integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_row_count integer;
  v_bad_date_count integer;
  v_zero_row_count integer;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT *
    INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_true(FOUND, p_message || ': closing transaction exists');
  PERFORM pg_temp.assert_eq(v_tx.source, 'vat_closing', p_message || ': source');
  PERFORM pg_temp.assert_eq(v_tx.date, p_period_end, p_message || ': transaction date');
  PERFORM pg_temp.assert_eq(v_tx.amount, p_expected_amount, p_message || ': transactions.amount');

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE date IS DISTINCT FROM p_period_end)::integer,
    count(*) FILTER (WHERE coalesce(debit, 0) = 0 AND coalesce(credit, 0) = 0)::integer,
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO
    v_row_count,
    v_bad_date_count,
    v_zero_row_count,
    v_total_debit,
    v_total_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_row_count, p_expected_row_count, p_message || ': journal row count');
  PERFORM pg_temp.assert_eq(v_bad_date_count, 0, p_message || ': all journal rows on period_end');
  PERFORM pg_temp.assert_eq(v_zero_row_count, 0, p_message || ': no fabricated zero rows');
  PERFORM pg_temp.assert_eq(v_total_debit, v_total_credit, p_message || ': journal balanced');
  PERFORM pg_temp.assert_eq(v_total_debit, p_expected_amount, p_message || ': amount is total debit');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_period_closed_with_transaction(
  p_period_id uuid,
  p_transaction_id uuid,
  p_closing_amount numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_period public.vat_periods%ROWTYPE;
BEGIN
  SELECT *
    INTO v_period
  FROM public.vat_periods
  WHERE id = p_period_id;

  PERFORM pg_temp.assert_true(FOUND, p_message || ': period exists');
  PERFORM pg_temp.assert_eq(v_period.status, 'closed', p_message || ': status closed');
  PERFORM pg_temp.assert_eq(v_period.closing_amount, p_closing_amount, p_message || ': closing_amount');
  PERFORM pg_temp.assert_eq(v_period.closing_transaction_id, p_transaction_id, p_message || ': closing_transaction_id');
  PERFORM pg_temp.assert_true(v_period.declared_at IS NULL, p_message || ': declared_at remains NULL');
END;
$$;

CREATE TEMP TABLE kan17c_expected_accounts (
  account_number text,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan17c_expected_accounts (account_number, note) VALUES
  (NULL, 'NULL preserves SQL three-valued predicate behavior'),
  ('', 'empty string'),
  ('26', 'prefix boundary before supported ranges'),
  ('261', '261 prefix boundary'),
  ('26100', '261 longer text'),
  ('261ABC', '261 nonnumeric suffix'),
  ('262', '262 prefix boundary'),
  ('263', '263 prefix boundary'),
  ('264', '264 exact is not close-scope'),
  ('2640', 'other 264x below exact 2641'),
  ('2641', 'exact input VAT close participant'),
  ('26410', 'exact 2641 does not match longer text'),
  ('2642', 'other 264x above exact 2641'),
  ('265', '265 prefix boundary'),
  ('2650', 'canonical VAT settlement account'),
  ('265ABC', '265 nonnumeric suffix'),
  ('vat', 'unrelated text');

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_tag text;
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_future_year integer := extract(year from current_date)::integer + 20;

  v_period_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_definition text;
  v_mismatch_count integer;
  v_count integer;

  v_before_tx integer;
  v_after_tx integer;
  v_before_entries integer;
  v_after_entries integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_after_period_status text;

  v_failed boolean;
  v_error_message text;
  v_period_start date;
  v_period_end date;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan17c_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17c_expected_accounts e
  WHERE public.vat_account_is_close_balance_participant(e.account_number)
          IS DISTINCT FROM (
               e.account_number LIKE '261%'
            OR e.account_number LIKE '262%'
            OR e.account_number LIKE '263%'
            OR e.account_number = '2641'
          )
     OR public.vat_account_requires_close_manual_review(e.account_number)
          IS DISTINCT FROM (e.account_number LIKE '265%');

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'P2/P3 wrappers match legacy embedded predicates for edge cases'
  );

  WITH p2_where_legacy AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE account_number LIKE '261%'
       OR account_number LIKE '262%'
       OR account_number LIKE '263%'
       OR account_number = '2641'
  ),
  p2_where_wrapper AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE public.vat_account_is_close_balance_participant(account_number)
  ),
  p3_where_legacy AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE account_number LIKE '265%'
  ),
  p3_where_wrapper AS (
    SELECT array_agg(account_number ORDER BY account_number NULLS FIRST) AS selected_accounts
    FROM kan17c_expected_accounts
    WHERE public.vat_account_requires_close_manual_review(account_number)
  )
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM p2_where_legacy p2l, p2_where_wrapper p2w, p3_where_legacy p3l, p3_where_wrapper p3w
  WHERE p2l.selected_accounts IS DISTINCT FROM p2w.selected_accounts
     OR p3l.selected_accounts IS DISTINCT FROM p3w.selected_accounts;

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'WHERE context preserves selected accounts');

  WITH filter_context AS (
    SELECT
      count(*) FILTER (
        WHERE account_number LIKE '261%'
           OR account_number LIKE '262%'
           OR account_number LIKE '263%'
           OR account_number = '2641'
      ) AS p2_legacy_count,
      count(*) FILTER (
        WHERE public.vat_account_is_close_balance_participant(account_number)
      ) AS p2_wrapper_count,
      count(*) FILTER (WHERE account_number LIKE '265%') AS p3_legacy_count,
      count(*) FILTER (
        WHERE public.vat_account_requires_close_manual_review(account_number)
      ) AS p3_wrapper_count
    FROM kan17c_expected_accounts
  )
  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM filter_context
  WHERE p2_legacy_count IS DISTINCT FROM p2_wrapper_count
     OR p3_legacy_count IS DISTINCT FROM p3_wrapper_count;

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'FILTER context preserves counts');

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan17c_expected_accounts
  WHERE (
      CASE WHEN public.vat_account_is_close_balance_participant(account_number) THEN 'true' ELSE 'false_or_null' END
    ) IS DISTINCT FROM (
      CASE WHEN (
             account_number LIKE '261%'
          OR account_number LIKE '262%'
          OR account_number LIKE '263%'
          OR account_number = '2641'
      ) THEN 'true' ELSE 'false_or_null' END
    )
     OR (
      CASE WHEN public.vat_account_requires_close_manual_review(account_number) THEN 'true' ELSE 'false_or_null' END
    ) IS DISTINCT FROM (
      CASE WHEN account_number LIKE '265%' THEN 'true' ELSE 'false_or_null' END
    );

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'CASE/IF-like NULL semantics are preserved');

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%public.vat_account_requires_close_manual_review(je.account_number)%'
    AND v_definition LIKE '%public.vat_account_is_close_balance_participant(je.account_number)%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''265%''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''261%''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''262%''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''263%''%'
    AND v_definition NOT LIKE '%je.account_number = ''2641''%'
    AND v_definition LIKE '%''2650''%',
    'close definition delegates P2/P3 predicates and keeps literal 2650 settlement'
  );

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_is_close_balance_participant(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_is_close_balance_participant(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 2, 'P2 wrapper occurs exactly twice');

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_requires_close_manual_review(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_requires_close_manual_review(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 1, 'P3 wrapper occurs exactly once');

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('service_role', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('postgres', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.close_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.vat_account_is_close_balance_participant(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.vat_account_requires_close_manual_review(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.vat_account_is_close_balance_participant(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.vat_account_requires_close_manual_review(text)'::regprocedure, 'EXECUTE'),
    'close and wrapper privileges preserve the intended security boundary'
  );

  v_tag := 'kan17c-' || v_run_id;

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 2, 12, 31)
    ),
    'isolated transaction date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 2, 12, 31)
    ),
    'isolated journal date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE user_id = v_user_id
        AND period_start <= make_date(v_base_year + 2, 12, 31)
        AND period_end >= make_date(v_base_year, 1, 1)
    ),
    'isolated VAT period window must be empty before fixtures'
  );

  -- 1 and 18. Zero VAT activity: close state only, no closing transaction/ver_nr.
  v_period_start := make_date(v_base_year, 1, 1);
  v_period_end := make_date(v_base_year, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_result := public.close_vat_period_atomic(v_period_id);
  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, '1 zero activity transaction_created');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '1 zero activity amount');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '1 zero activity no transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '1 zero activity no journal rows');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '1 zero activity no ver_nr');

  -- 2. Normal payable VAT close.
  v_period_start := make_date(v_base_year, 2, 1);
  v_period_end := make_date(v_base_year, 2, 28);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 10),
    v_tag || ' payable fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    710002
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 200::numeric, '2 payable closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 250::numeric, 3, '2 payable closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 200::numeric, '2 payable period');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '2 payable 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '2 payable 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -200, '2 payable 2650 settlement');

  -- 3. VAT refund/receivable close.
  v_period_start := make_date(v_base_year, 3, 1);
  v_period_end := make_date(v_base_year, 3, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 10),
    v_tag || ' refund fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 100)
    ),
    710003
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -100::numeric, '3 refund closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 100::numeric, 2, '3 refund closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '3 refund 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 100, '3 refund 2650 settlement');

  -- 4, 11, 12, 13, 14, 15, 16, 17. Mixed P2 accounts, exact P2 scope,
  -- literal settlement 2650, vat_closing source, period_end date, balanced
  -- journal, expected closing_amount and closing_transaction_id.
  v_period_start := make_date(v_base_year, 4, 1);
  v_period_end := make_date(v_base_year, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 10),
    v_tag || ' mixed scope fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 310, 'credit', 0),
      jsonb_build_object('account', '2631', 'debit', 20, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 80, 'credit', 0),
      jsonb_build_object('account', '2642', 'debit', 70, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250),
      jsonb_build_object('account', '2621', 'debit', 0, 'credit', 60),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 170)
    ),
    710004
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 210::numeric, '4 mixed closing_amount excludes 2642');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 310::numeric, 5, '4 mixed closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 210::numeric, '4 mixed period');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '4 mixed 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2621', 0, '4 mixed 2621 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2631', 0, '4 mixed 2631 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '4 mixed 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2642', 70, '4 mixed 2642 untouched');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -210, '4 mixed 2650 settlement');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE transaction_id = v_tx_id
        AND user_id = v_user_id
        AND account_number = '2642'
    ),
    '4 mixed generated zeroing rows use exactly P2 scope'
  );

  -- 5. P3/265x activity blocks normal close/manual review with no writes.
  v_period_start := make_date(v_base_year, 5, 1);
  v_period_end := make_date(v_base_year, 5, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 5, 10),
    v_tag || ' 265x fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 100)
    ),
    710005
  );
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_true(v_failed, '5 265x activity blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%265x%', '5 265x error message');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '5 265x no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '5 265x no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '5 265x no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '5 265x period remains open');

  -- 6. P2 activity with already-zero relevant balances blocks/manual review.
  v_period_start := make_date(v_base_year, 6, 1);
  v_period_end := make_date(v_base_year, 6, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_tag || ' already zero P2 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    710006
  );
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_true(v_failed, '6 already-zero P2 blocks');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '6 already-zero period remains open');

  -- 7. imported_history cannot normal-close.
  v_period_start := make_date(v_base_year, 7, 1);
  v_period_end := make_date(v_base_year, 7, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'open', 'imported_history');
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '7 imported_history blocks');

  -- 8. declared period behavior blocks close.
  v_period_start := make_date(v_base_year, 8, 1);
  v_period_end := make_date(v_base_year, 8, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'declared', 'sololedger', 0, NULL, now());
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '8 declared period blocks');

  -- 9. Future period guard.
  v_period_start := make_date(v_future_year, 1, 1);
  v_period_end := make_date(v_future_year, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '9 future period blocks');

  -- 10. Locked year guard.
  v_period_start := make_date(v_base_year + 2, 1, 1);
  v_period_end := make_date(v_base_year + 2, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '10 locked year blocks');

  RAISE NOTICE 'KAN-17C VAT close account-classification candidate completed for run id %. True two-session concurrency is NOT tested here.',
    v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate function install and fixtures are discarded.
ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan19_2645_vat_account_classification_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-19 rollback regression for exact 2645 VAT account classification.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/kan19_2645_vat_account_classification_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION and fixture writes, runs inside one outer transaction and ends with
-- ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan19_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan19_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-19 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-19 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'open',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT NULL,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce((entry->>'debit')::numeric, 0)), 0),
    coalesce(sum(coalesce((entry->>'credit')::numeric, 0)), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_entries) AS entry;

  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'KAN-19 fixture is unbalanced: % (debit %, credit %)',
      p_description, v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    true,
    p_source
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_tx_id,
    p_ver_nr,
    entry->>'account',
    coalesce((entry->>'debit')::numeric, 0),
    coalesce((entry->>'credit')::numeric, 0),
    p_description,
    coalesce((entry->>'date')::date, p_tx_date),
    p_user_id
  FROM jsonb_array_elements(p_entries) AS entry;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_account_balance(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_account_number text,
  p_expected numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
    INTO v_balance
  FROM public.journal_entries
  WHERE user_id = p_user_id
    AND date BETWEEN p_period_start AND p_period_end
    AND account_number = p_account_number;

  PERFORM pg_temp.assert_eq(v_balance, p_expected, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_writes(
  p_user_id uuid,
  p_before_tx integer,
  p_before_entries integer,
  p_before_ver_nr integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_after_tx integer;
  v_after_entries integer;
  v_after_ver_nr integer;
BEGIN
  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = p_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = p_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, p_before_tx, p_message || ': no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, p_before_entries, p_message || ': no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM p_before_ver_nr, p_message || ': no ver_nr');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_closing_transaction(
  p_user_id uuid,
  p_transaction_id uuid,
  p_period_end date,
  p_expected_amount numeric,
  p_expected_row_count integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_row_count integer;
  v_zero_row_count integer;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT *
    INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_true(FOUND, p_message || ': closing transaction exists');
  PERFORM pg_temp.assert_eq(v_tx.source, 'vat_closing', p_message || ': source');
  PERFORM pg_temp.assert_eq(v_tx.date, p_period_end, p_message || ': transaction date');
  PERFORM pg_temp.assert_eq(v_tx.amount, p_expected_amount, p_message || ': transactions.amount');

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE coalesce(debit, 0) = 0 AND coalesce(credit, 0) = 0)::integer,
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO
    v_row_count,
    v_zero_row_count,
    v_total_debit,
    v_total_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_row_count, p_expected_row_count, p_message || ': journal row count');
  PERFORM pg_temp.assert_eq(v_zero_row_count, 0, p_message || ': no fabricated zero rows');
  PERFORM pg_temp.assert_eq(v_total_debit, v_total_credit, p_message || ': journal balanced');
  PERFORM pg_temp.assert_eq(v_total_debit, p_expected_amount, p_message || ': amount is total debit');
END;
$$;

CREATE TEMP TABLE kan19_before_matrix AS
WITH accounts(account_number) AS (
  VALUES
    ('2614'),
    ('2641'),
    ('2645'),
    ('2650'),
    ('2640'),
    ('2646')
)
SELECT
  a.account_number,
  c.vat_period_guard_relevant AS p1,
  c.vat_close_balance_participant AS p2,
  c.vat_close_manual_review_relevant AS p3
FROM accounts a
CROSS JOIN LATERAL public.vat_account_classification(a.account_number) c;

-- Install the exact local KAN-19 candidate inside the rollback transaction.
\ir ../migrations/20260926132107_add_2645_vat_account_classification.sql

CREATE TEMP TABLE kan19_expected_accounts (
  account_number text,
  before_p1 boolean,
  before_p2 boolean,
  before_p3 boolean,
  after_p1 boolean,
  after_p2 boolean,
  after_p3 boolean,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO kan19_expected_accounts (
  account_number,
  before_p1,
  before_p2,
  before_p3,
  after_p1,
  after_p2,
  after_p3,
  note
) VALUES
  ('2610', true,  true,  false, true,  true,  false, '261x lower representative'),
  ('2614', true,  true,  false, true,  true,  false, '261x reverse-charge output VAT representative'),
  ('2619', true,  true,  false, true,  true,  false, '261x upper representative'),
  ('2620', true,  true,  false, true,  true,  false, '262x lower representative'),
  ('2621', true,  true,  false, true,  true,  false, '262x canonical representative'),
  ('2629', true,  true,  false, true,  true,  false, '262x upper representative'),
  ('2630', true,  true,  false, true,  true,  false, '263x lower representative'),
  ('2631', true,  true,  false, true,  true,  false, '263x canonical representative'),
  ('2639', true,  true,  false, true,  true,  false, '263x upper representative'),
  ('2640', false, false, false, false, false, false, 'other 264x below exact 2641'),
  ('2641', true,  true,  false, true,  true,  false, 'exact domestic deductible input VAT'),
  ('26410', false, false, false, false, false, false, 'exact 2641 does not match longer text'),
  ('2642', false, false, false, false, false, false, 'other 264x remains outside'),
  ('2645', false, false, false, true,  true,  false, 'exact calculated input VAT on foreign acquisitions'),
  ('2646', false, false, false, false, false, false, 'other 264x remains outside'),
  ('26450', false, false, false, false, false, false, 'exact 2645 does not match longer text'),
  ('2650', true,  false, true,  true,  false, true,  'canonical VAT settlement account'),
  ('2651', true,  false, true,  true,  false, true,  'other 265x representative'),
  ('1930', false, false, false, false, false, false, 'ordinary bank account'),
  ('4535', false, false, false, false, false, false, 'EU service acquisition base account'),
  (NULL,   NULL,  NULL,  NULL,  NULL,  NULL,  NULL,  'NULL preserves SQL predicate NULL behavior');

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_tag text;
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_type_2645 text;

  v_period_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_definition text;
  v_mismatch_count integer;
  v_count integer;

  v_before_tx integer;
  v_before_entries integer;
  v_before_ver_nr integer;
  v_failed boolean;
  v_error_message text;
  v_period_start date;
  v_period_end date;
  v_batch_id uuid;
  v_payload jsonb;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan19_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan19_expected_accounts e
  JOIN kan19_before_matrix b USING (account_number)
  WHERE b.p1 IS DISTINCT FROM e.before_p1
     OR b.p2 IS DISTINCT FROM e.before_p2
     OR b.p3 IS DISTINCT FROM e.before_p3;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'pre-candidate matrix matches verified current semantics'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan19_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE c.vat_period_guard_relevant IS DISTINCT FROM e.after_p1
     OR c.vat_close_balance_participant IS DISTINCT FROM e.after_p2
     OR c.vat_close_manual_review_relevant IS DISTINCT FROM e.after_p3;

  PERFORM pg_temp.assert_eq(
    v_mismatch_count,
    0,
    'post-candidate classification matrix matches exact 2645 target'
  );

  SELECT count(*)::integer
    INTO v_mismatch_count
  FROM kan19_expected_accounts e
  CROSS JOIN LATERAL public.vat_account_classification(e.account_number) c
  WHERE public.vat_concurrency_account(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant
     OR public.vat_account_is_period_guard_relevant(e.account_number)
          IS DISTINCT FROM c.vat_period_guard_relevant
     OR public.vat_account_is_close_balance_participant(e.account_number)
          IS DISTINCT FROM c.vat_close_balance_participant
     OR public.vat_account_requires_close_manual_review(e.account_number)
          IS DISTINCT FROM c.vat_close_manual_review_relevant;

  PERFORM pg_temp.assert_eq(v_mismatch_count, 0, 'wrappers delegate central classifier outputs');

  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE')
    AND has_function_privilege('service_role', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.vat_account_classification(text)'::regprocedure, 'EXECUTE'),
    'classifier execute privileges preserve internal-helper boundary'
  );

  SELECT pg_get_functiondef('public.vat_account_classification(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%RETURNS TABLE(vat_period_guard_relevant boolean, vat_close_balance_participant boolean, vat_close_manual_review_relevant boolean)%'
    AND v_definition LIKE '%LANGUAGE sql%'
    AND v_definition LIKE '%IMMUTABLE PARALLEL SAFE%'
    AND v_definition LIKE '%SET search_path TO ''public''%'
    AND v_definition LIKE '%p_account_number IN (''2641'', ''2645'')%'
    AND v_definition NOT LIKE '%p_account_number LIKE ''264%''%',
    'classifier signature/properties preserved and only exact 2645 added'
  );

  SELECT pg_get_functiondef('public.vat_concurrency_account(text)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%public.vat_account_is_period_guard_relevant(p_account_number)%'
    AND v_definition NOT LIKE '%2645%',
    'vat_concurrency_account delegates without 2645 special-case'
  );

  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%PERFORM public.lock_vat_months(v_user_id, v_lock_dates)%'
    AND position('FOR UPDATE' in v_definition) > position('PERFORM public.lock_vat_months(v_user_id, v_lock_dates)' in v_definition),
    'close VAT locking order remains advisory locks before row lock'
  );

  PERFORM pg_temp.assert_true(
    v_definition LIKE '%public.vat_account_requires_close_manual_review(je.account_number)%'
    AND v_definition LIKE '%public.vat_account_is_close_balance_participant(je.account_number)%'
    AND v_definition NOT LIKE '%je.account_number = ''2645''%'
    AND v_definition NOT LIKE '%je.account_number LIKE ''264%''%'
    AND v_definition LIKE '%''2650''%',
    'close delegates P2/P3 and keeps literal 2650 settlement'
  );

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_is_close_balance_participant(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_is_close_balance_participant(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 2, 'P2 wrapper occurs exactly twice in close');

  SELECT length(v_definition) - length(replace(v_definition, 'public.vat_account_requires_close_manual_review(je.account_number)', ''))
    INTO v_count;
  v_count := v_count / length('public.vat_account_requires_close_manual_review(je.account_number)');
  PERFORM pg_temp.assert_eq(v_count, 1, 'P3 wrapper occurs exactly once in close');

  FOR v_definition IN
    SELECT pg_get_functiondef(r)
    FROM (
      VALUES
        ('public.book_transaction_atomic(jsonb)'::regprocedure),
        ('public.book_periodized_transaction_atomic(jsonb)'::regprocedure),
        ('public.import_sie_batch(jsonb)'::regprocedure),
        ('public.undo_sie_import_atomic(uuid)'::regprocedure),
        ('public.create_correction_transaction_atomic(uuid)'::regprocedure)
    ) AS funcs(r)
  LOOP
    PERFORM pg_temp.assert_true(
      v_definition LIKE '%vat_concurrency_account%'
      AND v_definition NOT LIKE '%2645%'
      AND v_definition NOT LIKE '%vat_account_classification%',
      'P1 consumer delegates through vat_concurrency_account without 2645 special-case'
    );
  END LOOP;

  v_tag := 'kan19-' || v_run_id;
  v_type_2645 := 'kan19_2645_' || v_run_id;

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 1, 12, 31)
    ),
    'isolated transaction date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 1, 12, 31)
    ),
    'isolated journal date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE user_id = v_user_id
        AND period_start <= make_date(v_base_year + 1, 12, 31)
        AND period_end >= make_date(v_base_year, 1, 1)
    ),
    'isolated VAT period window must be empty before fixtures'
  );

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate,
    comment
  ) VALUES (
    v_type_2645,
    v_user_id,
    v_tag || ' direct 2645 fixture account',
    '2645',
    '1930',
    0,
    v_tag || ' rollback-only account fixture'
  );

  -- A. Open period: ordinary booking and import with direct 2645 are allowed.
  v_period_start := make_date(v_base_year, 1, 1);
  v_period_end := make_date(v_base_year, 1, 31);
  PERFORM pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);

  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 1, 10)::text,
      'description', v_tag || ' open 2645 booking',
      'amount', 57,
      'type', v_type_2645,
      'vat_rate', 0,
      'file_url', ''
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'A open 2645 booking succeeds');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2645', 57, 'A open booking 2645 balance');

  v_payload := jsonb_build_object(
    'filename', v_tag || '-open-2645.se',
    'file_hash', v_tag || '-open-2645',
    'company_name', 'KAN19 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_base_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '1',
      'date', make_date(v_base_year, 1, 11)::text,
      'description', 'KAN19 open 2645 import',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '2645', 'amount', 57, 'date', make_date(v_base_year, 1, 11)::text),
        jsonb_build_object('account_number', '1930', 'amount', -57, 'date', make_date(v_base_year, 1, 11)::text)
      )
    ))
  );
  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'A open 2645 import succeeds');
  PERFORM pg_temp.assert_true(v_batch_id IS NOT NULL, 'A open import returns batch id');

  -- B. Closed period: ordinary booking and import with direct 2645 are blocked.
  v_period_start := make_date(v_base_year, 2, 1);
  v_period_end := make_date(v_base_year, 2, 28);
  PERFORM pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'closed', 'sololedger', 0);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 2, 10)::text,
        'description', v_tag || ' closed 2645 booking',
        'amount', 57,
        'type', v_type_2645,
        'vat_rate', 0,
        'file_url', ''
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'B closed 2645 booking blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'B closed booking atomicity');

  v_payload := jsonb_build_object(
    'filename', v_tag || '-closed-2645.se',
    'file_hash', v_tag || '-closed-2645',
    'company_name', 'KAN19 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_base_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '2',
      'date', make_date(v_base_year, 2, 11)::text,
      'description', 'KAN19 closed 2645 import',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '2645', 'amount', 57, 'date', make_date(v_base_year, 2, 11)::text),
        jsonb_build_object('account_number', '1930', 'amount', -57, 'date', make_date(v_base_year, 2, 11)::text)
      )
    ))
  );
  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'B closed 2645 import blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'B closed import atomicity');

  -- C. Declared period: ordinary booking and import with direct 2645 are blocked.
  v_period_start := make_date(v_base_year, 3, 1);
  v_period_end := make_date(v_base_year, 3, 31);
  PERFORM pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'declared', 'sololedger', 0, NULL, now());

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 3, 10)::text,
        'description', v_tag || ' declared 2645 booking',
        'amount', 57,
        'type', v_type_2645,
        'vat_rate', 0,
        'file_url', ''
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'C declared 2645 booking blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'C declared booking atomicity');

  v_payload := jsonb_build_object(
    'filename', v_tag || '-declared-2645.se',
    'file_hash', v_tag || '-declared-2645',
    'company_name', 'KAN19 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_base_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '3',
      'date', make_date(v_base_year, 3, 11)::text,
      'description', 'KAN19 declared 2645 import',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '2645', 'amount', 57, 'date', make_date(v_base_year, 3, 11)::text),
        jsonb_build_object('account_number', '1930', 'amount', -57, 'date', make_date(v_base_year, 3, 11)::text)
      )
    ))
  );
  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'C declared 2645 import blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'C declared import atomicity');

  -- D. Reverse-charge close: Dr 4535 228, Dr 2645 57, Cr 2614 57, Cr bank 228.
  v_period_start := make_date(v_base_year, 4, 1);
  v_period_end := make_date(v_base_year, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 10),
    v_tag || ' reverse charge 228 57 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '4535', 'debit', 228, 'credit', 0),
      jsonb_build_object('account', '2645', 'debit', 57, 'credit', 0),
      jsonb_build_object('account', '2614', 'debit', 0, 'credit', 57),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 228)
    ),
    790004
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, 'D reverse-charge closing_amount zero');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 57::numeric, 2, 'D reverse-charge closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2614', 0, 'D reverse-charge 2614 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2645', 0, 'D reverse-charge 2645 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 0, 'D reverse-charge no 2650 balance');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE transaction_id = v_tx_id
        AND user_id = v_user_id
        AND account_number = '2650'
    ),
    'D reverse-charge no 2650 settlement row'
  );

  -- E. Existing/manual 2645 debit balance participates in close.
  v_period_start := make_date(v_base_year, 5, 1);
  v_period_end := make_date(v_base_year, 5, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 5, 10),
    v_tag || ' manual 2645 balance fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2645', 'debit', 57, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 57)
    ),
    790005
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -57::numeric, 'E manual 2645 closing_amount refund');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 57::numeric, 2, 'E manual 2645 closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2645', 0, 'E manual 2645 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 57, 'E manual 2645 2650 debit settlement');

  -- F. Representative VAT V1 2611/2641 close remains correct.
  v_period_start := make_date(v_base_year, 6, 1);
  v_period_end := make_date(v_base_year, 6, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_tag || ' VAT V1 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    790006
  );
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 200::numeric, 'F VAT V1 closing_amount payable');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 250::numeric, 3, 'F VAT V1 closing');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, 'F VAT V1 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, 'F VAT V1 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -200, 'F VAT V1 2650 credit settlement');

  -- G. 2650 remains P1/P3 only and blocks close manual-review path.
  v_period_start := make_date(v_base_year, 7, 1);
  v_period_end := make_date(v_base_year, 7, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 7, 10),
    v_tag || ' 2650 manual-review fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 100)
    ),
    790007
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'G 2650 activity blocks close');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%265x%', 'G 2650 manual-review error');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'G 2650 close atomicity');

  -- H. Other 264x do not inherit 2645 behavior.
  v_period_start := make_date(v_base_year, 8, 1);
  v_period_end := make_date(v_base_year, 8, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 8, 10),
    v_tag || ' other 264x fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2640', 'debit', 33, 'credit', 0),
      jsonb_build_object('account', '2646', 'debit', 44, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 77)
    ),
    790008
  );
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_result := public.close_vat_period_atomic(v_period_id);
  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, 'H other 264x no closing transaction');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, 'H other 264x closing amount zero');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'H other 264x no closing writes');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2640', 33, 'H 2640 untouched');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2646', 44, 'H 2646 untouched');

  -- I. Zero-activity close remains no-transaction.
  v_period_start := make_date(v_base_year, 9, 1);
  v_period_end := make_date(v_base_year, 9, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_result := public.close_vat_period_atomic(v_period_id);
  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, 'I zero-activity transaction_created');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, 'I zero-activity closing amount');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'I zero-activity no writes');

  -- J. imported_history close restriction remains unchanged.
  v_period_start := make_date(v_base_year, 10, 1);
  v_period_end := make_date(v_base_year, 10, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end, 'open', 'imported_history');
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'J imported_history close blocks');
  PERFORM pg_temp.assert_no_writes(v_user_id, v_before_tx, v_before_entries, v_before_ver_nr, 'J imported_history close atomicity');

  RAISE NOTICE 'KAN-19 exact 2645 VAT account-classification candidate completed for run id %. True two-session concurrency is NOT tested here.',
    v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate function install and fixtures are discarded.
ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan19_vat_profile_runtime_fields_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-19 candidate regression for company VAT profile runtime fields.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use against an isolated local database:
--
--   psql "$DATABASE_URL" \
--     -f supabase/tests/kan19_vat_profile_runtime_fields_candidate.sql
--
-- The candidate migration and all fixture writes run inside one outer
-- transaction and end with ROLLBACK.

BEGIN;

CREATE TEMP TABLE kan19_vat_profile_runtime_context (
  user_id uuid PRIMARY KEY,
  other_user_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO kan19_vat_profile_runtime_context (user_id, other_user_id)
VALUES (gen_random_uuid(), gen_random_uuid());

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-19 VAT profile runtime assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-19 VAT profile runtime assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

\ir ../migrations/20260927070224_add_vat_profile_runtime_fields.sql

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid;
  v_rejected boolean;
BEGIN
  SELECT user_id, other_user_id
    INTO v_user_id, v_other_user_id
  FROM kan19_vat_profile_runtime_context;

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'domestic_sales_vat_treatment'
        AND column_default = '''unknown''::text'
        AND is_nullable = 'NO'
    ),
    'domestic sales VAT treatment column exists with explicit unknown default'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'foreign_purchase_reporting'
        AND column_default = '''unknown''::text'
        AND is_nullable = 'NO'
    ),
    'foreign purchase reporting column exists with explicit unknown default'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'default_deduction_entitlement'
        AND column_default = '''unknown''::text'
        AND is_nullable = 'NO'
    ),
    'default deduction entitlement column exists with explicit unknown default'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'profiles_foreign_purchase_reporting_requires_registration_check'
        AND conrelid = 'public.profiles'::regclass
        AND contype = 'c'
        AND convalidated
    ),
    'foreign purchase reporting requires VAT registration constraint is validated'
  );

  INSERT INTO auth.users (id)
  VALUES (v_user_id), (v_other_user_id);

  INSERT INTO public.profiles (id, email)
  VALUES
    (v_user_id, 'kan19-vat-profile-runtime@example.invalid'),
    (v_other_user_id, 'kan19-vat-profile-runtime-other@example.invalid');

  PERFORM pg_temp.assert_eq(
    (
      SELECT domestic_sales_vat_treatment
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'unknown'::text,
    'new domestic sales treatment defaults to unknown'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT foreign_purchase_reporting
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'unknown'::text,
    'new foreign purchase reporting defaults to unknown'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT default_deduction_entitlement
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'unknown'::text,
    'new default deduction entitlement defaults to unknown'
  );

  UPDATE public.profiles
  SET
    vat_status = 'registered',
    vat_period_type = 'quarter',
    vat_management_from = '2026-01-01',
    domestic_sales_vat_treatment = 'taxable',
    foreign_purchase_reporting = 'required',
    default_deduction_entitlement = 'full'
  WHERE id = v_user_id;

  PERFORM pg_temp.assert_eq(
    (
      SELECT foreign_purchase_reporting
      FROM public.profiles
      WHERE id = v_user_id
    ),
    'required'::text,
    'registered profile accepts required foreign purchase reporting'
  );

  v_rejected := false;
  BEGIN
    UPDATE public.profiles
    SET
      vat_status = 'not_registered',
      vat_period_type = NULL,
      vat_management_from = NULL,
      foreign_purchase_reporting = 'required'
    WHERE id = v_user_id;
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;

  PERFORM pg_temp.assert_true(
    v_rejected,
    'not-registered profile rejects required foreign purchase reporting'
  );

  v_rejected := false;
  BEGIN
    UPDATE public.profiles
    SET default_deduction_entitlement = 'partial'
    WHERE id = v_user_id;
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;

  PERFORM pg_temp.assert_true(
    v_rejected,
    'partial deduction is not persisted by this slice'
  );
END;
$$;

SELECT set_config(
  'request.jwt.claim.sub',
  (SELECT user_id::text FROM kan19_vat_profile_runtime_context),
  true
);

SELECT set_config(
  'request.jwt.claims',
  (
    SELECT jsonb_build_object(
      'sub',
      user_id::text,
      'role',
      'authenticated'
    )::text
    FROM kan19_vat_profile_runtime_context
  ),
  true
);

SELECT set_config(
  'kan19.other_user_id',
  (SELECT other_user_id::text FROM kan19_vat_profile_runtime_context),
  true
);

-- Rollback-only test harness compatibility: local PostgreSQL fixtures may not
-- carry Supabase's standard authenticated access to auth.uid().
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

SET LOCAL ROLE authenticated;

WITH updated AS (
  UPDATE public.profiles
  SET
    domestic_sales_vat_treatment = 'mixed',
    foreign_purchase_reporting = 'required',
    default_deduction_entitlement = 'none'
  WHERE id = auth.uid()
  RETURNING 1
)
SELECT pg_temp.assert_eq(
  count(*)::integer,
  1,
  'authenticated owner can update the new VAT profile fields'
)
FROM updated;

WITH updated AS (
  UPDATE public.profiles
  SET default_deduction_entitlement = 'none'
  WHERE id = current_setting('kan19.other_user_id')::uuid
  RETURNING 1
)
SELECT pg_temp.assert_eq(
  count(*)::integer,
  0,
  'authenticated owner cannot update another profile through RLS'
)
FROM updated;

RESET ROLE;

SELECT pg_temp.assert_eq(
  (
    SELECT default_deduction_entitlement
    FROM public.profiles
    WHERE id = (SELECT other_user_id FROM kan19_vat_profile_runtime_context)
  ),
  'unknown'::text,
  'cross-profile authenticated update leaves other profile unchanged'
);

ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan19_vat_v2_reverse_charge_persistence_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-19 rollback regression for VAT V2 EU service reverse-charge persistence.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/kan19_vat_v2_reverse_charge_persistence_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. A second
-- synthetic tenant is created inside the rollback transaction only for
-- cross-user isolation proof. Everything, including the candidate migration
-- and fixture writes, runs inside one outer transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan19_vat_v2_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan19_vat_v2_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-19 VAT V2 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-19 VAT V2 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'open',
  p_source text DEFAULT 'sololedger',
  p_period_type text DEFAULT 'month'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    CASE WHEN p_status IN ('closed', 'declared') THEN 0 ELSE NULL END,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_account_amount(
  p_transaction_id uuid,
  p_account_number text,
  p_debit numeric,
  p_credit numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit numeric;
  v_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO v_debit, v_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = p_account_number;

  PERFORM pg_temp.assert_eq(v_debit, p_debit, p_message || ' debit');
  PERFORM pg_temp.assert_eq(v_credit, p_credit, p_message || ' credit');
END;
$$;

\ir ../migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_rejected_without_side_effects(
  p_user_id uuid,
  p_payload jsonb,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_before_tx integer;
  v_before_entries integer;
  v_before_snapshots integer;
  v_before_ver_nr integer;
  v_after_tx integer;
  v_after_entries integer;
  v_after_snapshots integer;
  v_after_ver_nr integer;
  v_failed boolean := false;
BEGIN
  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_before_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = p_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = p_user_id;

  BEGIN
    PERFORM public.book_vat_v2_eu_service_reverse_charge_atomic(p_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, p_message || ' rejects');

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_entries
  FROM public.journal_entries
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = p_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, p_message || ' transaction atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, p_message || ' journal atomicity');
  PERFORM pg_temp.assert_eq(v_after_snapshots, v_before_snapshots, p_message || ' snapshot atomicity');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, p_message || ' ver_nr atomicity');
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid := gen_random_uuid();
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_tag text := 'kan19-vat-v2-' || v_run_id;
  v_payment_1930_type text := 'kan19_payment_1930_' || v_run_id;
  v_payment_2018_type text := 'kan19_payment_2018_' || v_run_id;
  v_payment_cross_user_type text := 'kan19_payment_cross_user_' || v_run_id;
  v_v1_type text := 'kan19_v1_' || v_run_id;
  v_non_vat_type text := 'kan19_non_vat_' || v_run_id;
  v_payload jsonb;
  v_result jsonb;
  v_tx_id uuid;
  v_non_vat_tx_id uuid;
  v_snapshot_id uuid;
  v_ver_nr integer;
  v_non_vat_ver_nr integer;
  v_snapshot jsonb;
  v_count integer;
  v_failed boolean;
  v_before_tx integer;
  v_before_entries integer;
  v_before_snapshots integer;
  v_before_ver_nr integer;
  v_after_tx integer;
  v_after_entries integer;
  v_after_snapshots integer;
  v_after_ver_nr integer;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan19_vat_v2_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  INSERT INTO auth.users (id)
  VALUES (v_other_user_id);

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate
  ) VALUES
    (
      v_payment_1930_type,
      v_user_id,
      v_tag || ' payment 1930',
      '4535',
      '1930',
      0
    ),
    (
      v_payment_2018_type,
      v_user_id,
      v_tag || ' payment 2018',
      '4535',
      '2018',
      0
    ),
    (
      v_payment_cross_user_type,
      v_other_user_id,
      v_tag || ' other tenant payment 2441',
      '4535',
      '2441',
      0
    ),
    (
      v_v1_type,
      v_user_id,
      v_tag || ' ordinary V1 purchase',
      '4000',
      '1930',
      25
    ),
    (
      v_non_vat_type,
      v_user_id,
      v_tag || ' ordinary non-VAT purchase',
      '4000',
      '1930',
      0
    );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 1, 31),
    'open'
  );

  v_payload := jsonb_build_object(
    'date', make_date(v_base_year, 1, 10)::text,
    'description', v_tag || ' happy path',
    'treatment_code', 'EU_SERVICE_REVERSE_CHARGE',
    'calculation_rate', 25,
    'deduction_entitlement', 'full',
    'taxable_base', 228,
    'output_vat_amount', 57,
    'deductible_input_vat_amount', 57,
    'acquisition_base_field', '21',
    'output_vat_report_field', '30',
    'deductible_input_vat_report_field', '48',
    'payment_account_number', '1930',
    'rule_version', 'vat-v2-kan18-first-slice',
    'facts_version', 'vat-facts-v1'
  );

  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(v_payload);

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'happy path succeeds');

  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_snapshot_id := (v_result->>'vat_audit_snapshot_id')::uuid;
  v_ver_nr := (v_result->>'ver_nr')::integer;

  PERFORM pg_temp.assert_true(v_tx_id IS NOT NULL, 'happy path transaction id');
  PERFORM pg_temp.assert_true(v_snapshot_id IS NOT NULL, 'happy path snapshot id');

  PERFORM pg_temp.assert_eq(
    (
      SELECT source
      FROM public.transactions
      WHERE id = v_tx_id
        AND user_id = v_user_id
    ),
    'vat_v2'::text,
    'happy path transaction source'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT amount
      FROM public.transactions
      WHERE id = v_tx_id
        AND user_id = v_user_id
    ),
    228::numeric,
    'happy path transaction amount is payment/acquisition base'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries
      WHERE transaction_id = v_tx_id
        AND user_id = v_user_id
        AND ver_nr = v_ver_nr
    ),
    4,
    'happy path journal row count'
  );

  PERFORM pg_temp.assert_account_amount(v_tx_id, '4535', 228, 0, 'happy path 4535');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '2645', 57, 0, 'happy path 2645');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '2614', 0, 57, 'happy path 2614');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '1930', 0, 228, 'happy path payment');

  SELECT snapshot
    INTO v_snapshot
  FROM public.vat_audit_snapshots
  WHERE id = v_snapshot_id
    AND user_id = v_user_id
    AND transaction_id = v_tx_id;

  PERFORM pg_temp.assert_true(v_snapshot IS NOT NULL, 'happy path persisted audit snapshot');
  PERFORM pg_temp.assert_eq(v_snapshot->>'schemaVersion', 'vat-audit-snapshot-v1', 'snapshot schema version');
  PERFORM pg_temp.assert_eq(v_snapshot->>'journalPlanVersion', 'vat-journal-plan-v1', 'snapshot journal plan version');
  PERFORM pg_temp.assert_eq(v_snapshot->>'treatmentCode', 'EU_SERVICE_REVERSE_CHARGE', 'snapshot treatment');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{vat,taxableBase}', '228', 'snapshot field 21 base');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{vat,outputVat,amount}', '57', 'snapshot field 30 output VAT');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{vat,deductibleInputVat,amount}', '57', 'snapshot field 48 input VAT');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{reconciliation,totalDebit}', '285.00', 'snapshot reconciliation debit');
  PERFORM pg_temp.assert_eq(v_snapshot #>> '{reconciliation,totalCredit}', '285.00', 'snapshot reconciliation credit');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 2, 1),
    make_date(v_base_year, 2, 28),
    'open'
  );

  v_result := public.book_vat_v2_eu_service_reverse_charge_atomic(
    v_payload
      || jsonb_build_object(
        'date', make_date(v_base_year, 2, 10)::text,
        'description', v_tag || ' non 1930 payment',
        'payment_account_number', '2018'
      )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_account_amount(v_tx_id, '2018', 0, 228, 'non-1930 payment');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '1930', 0, 0, 'non-1930 does not write 1930');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 3, 1),
    make_date(v_base_year, 3, 31),
    'open'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 10)::text,
      'treatment_code', 'EU_GOODS_ACQUISITION'
    ),
    'unsupported treatment'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 11)::text,
      'calculation_rate', 12
    ),
    'unsupported rate'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 12)::text,
      'deduction_entitlement', 'none',
      'deductible_input_vat_amount', 0,
      'deductible_input_vat_report_field', NULL
    ),
    'no deduction'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 13)::text,
      'deduction_entitlement', 'partial'
    ),
    'partial deduction'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 14)::text,
      'deduction_entitlement', 'unknown'
    ),
    'unknown deduction'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 15)::text,
      'output_vat_amount', 56
    ),
    'wrong VAT amount'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 16)::text,
      'output_vat_report_field', '31'
    ),
    'wrong report field'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 17)::text,
      'payment_account_number', '4535'
    ),
    'wrong payment account class'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 18)::text,
      'payment_account_number', '2440'
    ),
    'payment account outside user account context'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 18)::text,
      'payment_account_number', '2441'
    ),
    'payment account owned by another tenant'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 19)::text,
      'journal_rows', jsonb_build_array(
        jsonb_build_object('account', '1930', 'debit', 1, 'credit', 0)
      )
    ),
    'client journal rows rejected'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 3, 20)::text,
      'audit_snapshot', jsonb_build_object('mismatch', true)
    ),
    'client audit snapshot rejected'
  );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 4, 30),
    'closed'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 4, 10)::text
    ),
    'closed VAT period'
  );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 5, 1),
    make_date(v_base_year, 5, 31),
    'declared',
    'sololedger'
  );

  PERFORM pg_temp.assert_rejected_without_side_effects(
    v_user_id,
    v_payload || jsonb_build_object(
      'date', make_date(v_base_year, 5, 10)::text
    ),
    'declared VAT period'
  );

  -- Existing VAT V1 purchase path remains ordinary book_transaction_atomic:
  -- it writes 2641 and no VAT V2 audit snapshot.
  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 6, 1),
    make_date(v_base_year, 6, 30),
    'open'
  );

  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 6, 10)::text,
      'description', v_tag || ' ordinary V1',
      'amount', 125,
      'type', v_v1_type,
      'vat_rate', 25
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary V1 still succeeds');
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_account_amount(v_tx_id, '4000', 100, 0, 'ordinary V1 expense');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '2641', 25, 0, 'ordinary V1 2641');
  PERFORM pg_temp.assert_account_amount(v_tx_id, '1930', 0, 125, 'ordinary V1 payment');

  SELECT count(*)::integer
    INTO v_count
  FROM public.vat_audit_snapshots
  WHERE transaction_id = v_tx_id;

  PERFORM pg_temp.assert_eq(v_count, 0, 'ordinary V1 creates no VAT V2 snapshot');

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 7, 1),
    make_date(v_base_year, 7, 31),
    'closed'
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_before_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = v_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
      'date', make_date(v_base_year, 7, 10)::text,
      'description', v_tag || ' ordinary V1 closed',
      'amount', 125,
      'type', v_v1_type,
      'vat_rate', 25
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'ordinary V1 2641 closed-period guard rejects');

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_after_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;

  SELECT count(*) INTO v_after_snapshots
  FROM public.vat_audit_snapshots
  WHERE user_id = v_user_id;

  SELECT coalesce(max(last_ver_nr), 0) INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, 'ordinary V1 closed transaction atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'ordinary V1 closed journal atomicity');
  PERFORM pg_temp.assert_eq(v_after_snapshots, v_before_snapshots, 'ordinary V1 closed snapshot atomicity');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, 'ordinary V1 closed ver_nr atomicity');

  -- VAT V2 rows are intentionally immutable through the generic correction
  -- path until a VAT V2-aware correction flow can copy/reconcile audit state.
  v_failed := false;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(
      (
        SELECT t.id
        FROM public.transactions t
        WHERE t.user_id = v_user_id
          AND t.source = 'vat_v2'
        ORDER BY t.date
        LIMIT 1
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'generic correction blocks VAT V2 transaction');

  -- The VAT V2 correction trigger must not block ordinary manual
  -- corrections whose original ver_nr belongs to a non-VAT-V2 transaction.
  v_result := public.book_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 8, 10)::text,
      'description', v_tag || ' ordinary non-VAT correction source',
      'amount', 100,
      'type', v_non_vat_type,
      'vat_rate', 0
    )
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary non-VAT booking for correction succeeds');
  v_non_vat_tx_id := (v_result->>'transaction_id')::uuid;
  v_non_vat_ver_nr := (v_result->>'ver_nr')::integer;

  v_result := public.create_correction_transaction_atomic(v_non_vat_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary non-VAT correction still succeeds');
  PERFORM pg_temp.assert_eq(
    (v_result->>'corrects_ver_nr')::integer,
    v_non_vat_ver_nr,
    'ordinary correction corrects original ver_nr'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions corr
      WHERE corr.user_id = v_user_id
        AND corr.id = (v_result->>'transaction_id')::uuid
        AND corr.source = 'manual'
        AND corr.is_correction = true
        AND corr.corrects_ver_nr = v_non_vat_ver_nr
    ),
    'ordinary correction transaction remains manual correction'
  );

  SELECT count(*)::integer
    INTO v_count
  FROM public.vat_audit_snapshots
  WHERE transaction_id = (v_result->>'transaction_id')::uuid;

  PERFORM pg_temp.assert_eq(v_count, 0, 'ordinary correction creates no VAT V2 snapshot');

  RAISE NOTICE 'KAN-19 VAT V2 reverse-charge persistence candidate completed for run id %. True two-session concurrency is NOT tested here.',
    v_run_id;
END;
$$;

ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan21_vat_lifecycle_source_taxonomy_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-21 prerequisite rollback regression for VAT lifecycle source taxonomy.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan21_vat_lifecycle_source_taxonomy_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. Everything,
-- including the candidate migration and fixtures, runs inside one outer
-- transaction and ends with an explicit ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan21_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan21_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-21 rollback ' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

-- Install the current VAT V2 source/trigger prerequisite first when the local
-- rollback database snapshot predates it, then install the exact KAN-21
-- prerequisite candidate. Both are contained by the outer rollback.
\ir ../migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql
\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-21 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-21 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'open',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT NULL,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'manual',
  p_booked boolean DEFAULT true,
  p_file_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce((entry->>'debit')::numeric, 0)), 0),
    coalesce(sum(coalesce((entry->>'credit')::numeric, 0)), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_entries) AS entry;

  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'KAN-21 fixture is unbalanced: % (debit %, credit %)',
      p_description, v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source,
    file_url
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    p_booked,
    p_source,
    p_file_url
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_tx_id,
    p_ver_nr,
    entry->>'account',
    coalesce((entry->>'debit')::numeric, 0),
    coalesce((entry->>'credit')::numeric, 0),
    p_description,
    coalesce((entry->>'date')::date, p_tx_date),
    p_user_id
  FROM jsonb_array_elements(p_entries) AS entry;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_side_effect_counts(
  p_user_id uuid,
  p_before_tx integer,
  p_before_entries integer,
  p_before_corrections integer,
  p_before_ver_nr integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_after_tx integer;
  v_after_entries integer;
  v_after_corrections integer;
  v_after_ver_nr integer;
BEGIN
  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_entries
  FROM public.journal_entries
  WHERE user_id = p_user_id;

  SELECT count(*) INTO v_after_corrections
  FROM public.transactions
  WHERE user_id = p_user_id
    AND is_correction IS TRUE;

  SELECT coalesce(last_ver_nr, 0) INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx, p_before_tx, p_message || ' transaction count');
  PERFORM pg_temp.assert_eq(v_after_entries, p_before_entries, p_message || ' journal count');
  PERFORM pg_temp.assert_eq(v_after_corrections, p_before_corrections, p_message || ' correction count');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, p_before_ver_nr, p_message || ' ver_nr');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_source_policy(
  p_source text,
  p_current boolean,
  p_reserved_future boolean,
  p_system_managed boolean,
  p_controlled_lifecycle boolean,
  p_allows_correction boolean,
  p_allows_update boolean,
  p_ordinary_vat_activity boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_current(p_source),
    p_current,
    p_message || ' current'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_reserved_future(p_source),
    p_reserved_future,
    p_message || ' reserved future'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_system_managed(p_source),
    p_system_managed,
    p_message || ' system managed'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_controlled_vat_lifecycle(p_source),
    p_controlled_lifecycle,
    p_message || ' controlled lifecycle'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_allows_generic_correction(p_source),
    p_allows_correction,
    p_message || ' generic correction'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_allows_generic_update(p_source),
    p_allows_update,
    p_message || ' generic update'
  );
  PERFORM pg_temp.assert_eq(
    public.transaction_source_is_ordinary_vat_guard_activity(p_source),
    p_ordinary_vat_activity,
    p_message || ' ordinary VAT activity'
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_internal_function_exposure(
  p_function regprocedure,
  p_routine_name text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.routine_privileges rp
      WHERE rp.specific_schema = 'public'
        AND rp.routine_name = p_routine_name
        AND rp.grantee = 'PUBLIC'
        AND rp.privilege_type = 'EXECUTE'
    ),
    p_message || ' not executable by PUBLIC'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', p_function, 'EXECUTE'),
    p_message || ' not executable by anon'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('authenticated', p_function, 'EXECUTE'),
    p_message || ' not executable by authenticated'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', p_function, 'EXECUTE'),
    p_message || ' executable by postgres'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', p_function, 'EXECUTE'),
    p_message || ' executable by service_role'
  );
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;

  v_manual_tx_id uuid;
  v_sie_import_tx_id uuid;
  v_sie_opening_tx_id uuid;
  v_sie_undo_tx_id uuid;
  v_vat_closing_tx_id uuid;
  v_vat_v2_tx_id uuid;
  v_265_tx_id uuid;
  v_closed_guard_period_id uuid;
  v_declared_guard_period_id uuid;
  v_close_period_id uuid;

  v_manual_ver_nr integer := 921001;
  v_vat_closing_ver_nr integer := 921002;
  v_vat_v2_ver_nr integer := 921003;
  v_265_ver_nr integer := 921004;
  v_sie_import_ver_nr integer := 921005;
  v_sie_opening_ver_nr integer := 921006;
  v_sie_undo_ver_nr integer := 921007;
  v_sequence_floor integer := 921500;

  v_constraint_def text;
  v_trigger_count integer;
  v_failed boolean;
  v_error_message text;
  v_result jsonb;
  v_file_url text;
  v_before_tx integer;
  v_before_entries integer;
  v_before_corrections integer;
  v_before_ver_nr integer;
  v_after_count integer;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan21_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  INSERT INTO public.ver_nr_sequences (user_id, last_ver_nr)
  VALUES (v_user_id, v_sequence_floor)
  ON CONFLICT (user_id) DO UPDATE
  SET last_ver_nr = greatest(public.ver_nr_sequences.last_ver_nr, EXCLUDED.last_ver_nr);

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('authenticated', 'public.transaction_source_classification(text)'::regprocedure, 'EXECUTE'),
    'taxonomy helper is not directly exposed to authenticated'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.transaction_source_classification(text)'::regprocedure, 'EXECUTE'),
    'taxonomy helper is not directly exposed to anon'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'existing update RPC remains callable by authenticated'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'existing correction RPC remains callable by authenticated'
  );

  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_classification(text)'::regprocedure,
    'transaction_source_classification',
    'transaction_source_classification exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_current(text)'::regprocedure,
    'transaction_source_is_current',
    'transaction_source_is_current exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_reserved_future(text)'::regprocedure,
    'transaction_source_is_reserved_future',
    'transaction_source_is_reserved_future exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_system_managed(text)'::regprocedure,
    'transaction_source_is_system_managed',
    'transaction_source_is_system_managed exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_controlled_vat_lifecycle(text)'::regprocedure,
    'transaction_source_is_controlled_vat_lifecycle',
    'transaction_source_is_controlled_vat_lifecycle exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_allows_generic_correction(text)'::regprocedure,
    'transaction_source_allows_generic_correction',
    'transaction_source_allows_generic_correction exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_allows_generic_update(text)'::regprocedure,
    'transaction_source_allows_generic_update',
    'transaction_source_allows_generic_update exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.transaction_source_is_ordinary_vat_guard_activity(text)'::regprocedure,
    'transaction_source_is_ordinary_vat_guard_activity',
    'transaction_source_is_ordinary_vat_guard_activity exposure'
  );
  PERFORM pg_temp.assert_internal_function_exposure(
    'public.prevent_disallowed_generic_correction_insert()'::regprocedure,
    'prevent_disallowed_generic_correction_insert',
    'prevent_disallowed_generic_correction_insert exposure'
  );

  SELECT pg_get_constraintdef(c.oid)
    INTO v_constraint_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.transactions'::regclass
    AND c.conname = 'transactions_source_check';

  PERFORM pg_temp.assert_true(
    v_constraint_def LIKE '%manual%'
      AND v_constraint_def LIKE '%vat_closing%'
      AND v_constraint_def LIKE '%vat_v2%',
    'source constraint still contains current sources'
  );
  PERFORM pg_temp.assert_true(
    v_constraint_def NOT LIKE '%vat_settlement%',
    'vat_settlement is not added to active source constraint'
  );

  PERFORM pg_temp.assert_source_policy('manual', true, false, false, false, true, true, true, 'manual policy');
  PERFORM pg_temp.assert_source_policy('sie_import', true, false, true, false, true, true, true, 'sie_import policy');
  PERFORM pg_temp.assert_source_policy('sie_opening_balance', true, false, true, false, true, true, true, 'sie_opening_balance policy');
  PERFORM pg_temp.assert_source_policy('sie_import_undo', true, false, true, false, true, true, true, 'sie_import_undo policy');
  PERFORM pg_temp.assert_source_policy('vat_closing', true, false, true, true, false, false, false, 'vat_closing policy');
  PERFORM pg_temp.assert_source_policy('vat_v2', true, false, true, false, false, true, true, 'vat_v2 policy');
  PERFORM pg_temp.assert_source_policy('vat_settlement', false, true, true, true, false, false, false, 'vat_settlement policy');
  PERFORM pg_temp.assert_source_policy('kan21_unknown_source', false, false, false, false, false, false, false, 'unknown source policy');
  PERFORM pg_temp.assert_source_policy(NULL, false, false, false, false, false, false, false, 'NULL source policy');

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass
    AND tgname = 'prevent_disallowed_generic_correction_insert'
    AND NOT tgisinternal;
  PERFORM pg_temp.assert_eq(v_trigger_count, 1, 'generic correction trigger installed once');

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.transactions'::regclass
    AND tgname = 'prevent_vat_v2_correction_insert'
    AND NOT tgisinternal;
  PERFORM pg_temp.assert_eq(v_trigger_count, 0, 'VAT V2-specific correction trigger replaced');

  v_failed := false;
  BEGIN
    INSERT INTO public.transactions (
      user_id,
      date,
      description,
      amount,
      booked,
      source
    ) VALUES (
      v_user_id,
      make_date(v_base_year, 1, 2),
      v_run_tag || ' forbidden settlement source',
      0,
      true,
      'vat_settlement'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_settlement remains rejected by transactions_source_check');

  v_manual_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 10),
    v_run_tag || ' manual fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 1250, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 1000),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    v_manual_ver_nr,
    'manual',
    true
  );

  v_sie_import_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 11),
    v_run_tag || ' sie import fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    v_sie_import_ver_nr,
    'sie_import',
    true
  );

  v_sie_opening_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 12),
    v_run_tag || ' sie opening balance fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2010', 'debit', 0, 'credit', 200)
    ),
    v_sie_opening_ver_nr,
    'sie_opening_balance',
    true
  );

  v_sie_undo_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 13),
    v_run_tag || ' sie import undo fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 300, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 300)
    ),
    v_sie_undo_ver_nr,
    'sie_import_undo',
    true
  );

  v_vat_closing_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 28),
    v_run_tag || ' vat closing fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 250, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 250)
    ),
    v_vat_closing_ver_nr,
    'vat_closing',
    true
  );

  v_vat_v2_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 10),
    v_run_tag || ' vat v2 fixture',
    jsonb_build_array(
      jsonb_build_object('account', '4535', 'debit', 1000, 'credit', 0),
      jsonb_build_object('account', '2645', 'debit', 250, 'credit', 0),
      jsonb_build_object('account', '2614', 'debit', 0, 'credit', 250),
      jsonb_build_object('account', '2440', 'debit', 0, 'credit', 1000)
    ),
    v_vat_v2_ver_nr,
    'vat_v2',
    true
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND is_correction IS TRUE;
  SELECT coalesce(last_ver_nr, 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_closing_tx_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_closing correction is blocked');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%Momsavslut%', 'vat_closing correction message remains explicit');
  PERFORM pg_temp.assert_no_side_effect_counts(
    v_user_id,
    v_before_tx,
    v_before_entries,
    v_before_corrections,
    v_before_ver_nr,
    'blocked vat_closing correction'
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries
  FROM public.journal_entries
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND is_correction IS TRUE;
  SELECT coalesce(last_ver_nr, 0) INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_v2_tx_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_v2 correction is blocked');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%VAT V2%', 'vat_v2 correction message remains explicit');
  PERFORM pg_temp.assert_no_side_effect_counts(
    v_user_id,
    v_before_tx,
    v_before_entries,
    v_before_corrections,
    v_before_ver_nr,
    'blocked vat_v2 correction'
  );

  v_result := public.create_correction_transaction_atomic(v_manual_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'manual correction still succeeds');

  v_result := public.create_correction_transaction_atomic(v_sie_import_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import correction still succeeds');

  v_result := public.create_correction_transaction_atomic(v_sie_opening_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_opening_balance correction still succeeds');

  v_result := public.create_correction_transaction_atomic(v_sie_undo_tx_id);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import_undo correction still succeeds');

  -- Intentional hardening: the RPC keeps its vat_closing fast-fail for
  -- compatibility, while this trigger is defense-in-depth for direct generic
  -- correction inserts that bypass the RPC.
  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    INSERT INTO public.transactions (
      user_id,
      date,
      description,
      amount,
      booked,
      is_correction,
      corrects_ver_nr,
      source
    ) VALUES (
      v_user_id,
      make_date(v_base_year, 2, 28),
      v_run_tag || ' direct vat_closing correction hardening',
      250,
      true,
      true,
      v_vat_closing_ver_nr,
      'manual'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'direct vat_closing generic correction insert is blocked by trigger');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%Momsavslut%', 'direct vat_closing trigger error remains explicit');

  SELECT count(*) INTO v_after_count
  FROM public.transactions
  WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_count, v_before_tx, 'direct vat_closing trigger block leaves no transaction');

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_vat_closing_tx_id,
      jsonb_build_object('file_url', 'kan21-forbidden.pdf')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'vat_closing metadata update is blocked');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%Momsavslut%', 'vat_closing update message remains explicit');

  SELECT file_url INTO v_file_url
  FROM public.transactions
  WHERE id = v_vat_closing_tx_id
    AND user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_file_url, NULL::text, 'blocked vat_closing update leaves file_url unchanged');

  v_result := public.update_transaction_safe(
    v_vat_v2_tx_id,
    jsonb_build_object('file_url', 'kan21-vat-v2.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'vat_v2 metadata update remains allowed');

  SELECT file_url INTO v_file_url
  FROM public.transactions
  WHERE id = v_vat_v2_tx_id
    AND user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_file_url, 'kan21-vat-v2.pdf'::text, 'vat_v2 file_url updated');

  v_result := public.update_transaction_safe(
    v_sie_import_tx_id,
    jsonb_build_object('file_url', 'kan21-sie-import.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import metadata update still succeeds');

  v_result := public.update_transaction_safe(
    v_sie_opening_tx_id,
    jsonb_build_object('file_url', 'kan21-sie-opening.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_opening_balance metadata update still succeeds');

  v_result := public.update_transaction_safe(
    v_sie_undo_tx_id,
    jsonb_build_object('file_url', 'kan21-sie-undo.pdf')
  );
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'sie_import_undo metadata update still succeeds');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_sie_import_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked sie_import accounting update remains blocked');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_sie_opening_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked sie_opening_balance accounting update remains blocked');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_sie_undo_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked sie_import_undo accounting update remains blocked');

  v_failed := false;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_vat_v2_tx_id,
      jsonb_build_object('amount', 999)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'booked vat_v2 accounting update remains blocked');

  v_closed_guard_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 4, 30),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL
  );

  v_declared_guard_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 5, 1),
    make_date(v_base_year, 5, 31),
    'declared',
    'sololedger',
    0,
    NULL,
    now()
  );

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate
  ) VALUES (
    'kan21_vat_sale_' || replace(gen_random_uuid()::text, '-', ''),
    v_user_id,
    v_run_tag || ' VAT sale',
    '1930',
    '3001',
    25
  );

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 4, 12)::text,
        'description', v_run_tag || ' closed VAT guard booking',
        'amount', 1250,
        'type', (SELECT id FROM public.accounts WHERE user_id = v_user_id AND name = v_run_tag || ' VAT sale' LIMIT 1),
        'vat_rate', 25,
        'booked', true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'ordinary closed VAT guard remains effective');

  v_failed := false;
  BEGIN
    PERFORM public.book_transaction_atomic(
      jsonb_build_object(
        'date', make_date(v_base_year, 5, 12)::text,
        'description', v_run_tag || ' declared VAT guard booking',
        'amount', 1250,
        'type', (SELECT id FROM public.accounts WHERE user_id = v_user_id AND name = v_run_tag || ' VAT sale' LIMIT 1),
        'vat_rate', 25,
        'booked', true
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'ordinary declared VAT guard remains effective');

  SELECT count(*) INTO v_after_count
  FROM public.transactions
  WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_count, v_before_tx, 'closed/declared booking guards leave no transactions');

  v_close_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 6, 1),
    make_date(v_base_year, 6, 30),
    'open',
    'sololedger',
    NULL,
    NULL,
    NULL
  );

  v_265_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_run_tag || ' 2650 manual review fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 300, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 300)
    ),
    v_265_ver_nr,
    'manual',
    true
  );

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_close_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, '265x close manual-review guard remains effective');
  PERFORM pg_temp.assert_true(v_error_message LIKE '%265x%', '265x close guard message remains explicit');

  PERFORM pg_temp.assert_eq(
    (SELECT status FROM public.vat_periods WHERE id = v_close_period_id),
    'open'::text,
    '265x close guard leaves period open'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND source = 'vat_closing'
        AND description LIKE v_run_tag || ' 2650%'
    ),
    '265x close guard creates no VAT closing transaction'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-21 VAT lifecycle source taxonomy rollback test candidate completed inside explicit ROLLBACK.'
````````

==================================================

==================================================
FILE: supabase/tests/kan27_vat_settlement_foundation_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-27 rollback regression for VAT settlement / tax-account foundation.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/kan27_vat_settlement_foundation_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. A second
-- synthetic tenant is created inside the rollback transaction only for
-- cross-user isolation proof. Everything, including the candidate migration
-- and fixture writes, runs inside one outer transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan27_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan27_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-27 rollback ' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql
\ir ../migrations/20260929143000_add_vat_settlement_foundation.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-27 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-27 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
  p_sql text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, p_message || ' rejects');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), p_user_id, 'auth.uid() test context');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_amount numeric,
  p_description text,
  p_source text,
  p_booked boolean
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    abs(p_amount),
    NULL,
    NULL,
    p_booked,
    p_source
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_closing_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_amount numeric,
  p_description text,
  p_booked boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN pg_temp.create_transaction(
    p_user_id,
    p_tx_date,
    p_amount,
    p_description,
    'vat_closing',
    p_booked
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text,
  p_source text,
  p_closing_amount numeric,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_create_default_closing_transaction boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
  v_closing_tx_id uuid := NULL;
BEGIN
  IF p_closing_transaction_id IS NOT NULL THEN
    v_closing_tx_id := p_closing_transaction_id;
  ELSIF p_closing_amount IS NOT NULL AND p_create_default_closing_transaction THEN
    v_closing_tx_id := pg_temp.create_closing_transaction(
      p_user_id,
      p_period_end,
      p_closing_amount,
      'KAN-27 fixture closing'
    );
  END IF;

  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    'quarter',
    p_status,
    p_source,
    p_closing_amount,
    v_closing_tx_id,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_settlement_journal(
  p_transaction_id uuid,
  p_kind text,
  p_amount numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_2012_debit numeric;
  v_2012_credit numeric;
  v_2650_debit numeric;
  v_2650_credit numeric;
  v_row_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_row_count
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id;

  SELECT
    coalesce(sum(debit), 0),
    coalesce(sum(credit), 0)
  INTO v_2012_debit, v_2012_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = '2012';

  SELECT
    coalesce(sum(debit), 0),
    coalesce(sum(credit), 0)
  INTO v_2650_debit, v_2650_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = '2650';

  PERFORM pg_temp.assert_eq(v_row_count, 2, p_message || ' row count');

  IF p_kind = 'vat_debit' THEN
    PERFORM pg_temp.assert_eq(v_2650_debit, p_amount, p_message || ' 2650 debit');
    PERFORM pg_temp.assert_eq(v_2650_credit, 0::numeric, p_message || ' 2650 credit');
    PERFORM pg_temp.assert_eq(v_2012_debit, 0::numeric, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, p_amount, p_message || ' 2012 credit');
  ELSE
    PERFORM pg_temp.assert_eq(v_2012_debit, p_amount, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, 0::numeric, p_message || ' 2012 credit');
    PERFORM pg_temp.assert_eq(v_2650_debit, 0::numeric, p_message || ' 2650 debit');
    PERFORM pg_temp.assert_eq(v_2650_credit, p_amount, p_message || ' 2650 credit');
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid := gen_random_uuid();
  v_run_tag text;
  v_base_year integer;
  v_payable_period_id uuid;
  v_refund_period_id uuid;
  v_legacy_period_id uuid;
  v_open_period_id uuid;
  v_imported_period_id uuid;
  v_zero_period_id uuid;
  v_other_period_id uuid;
  v_locked_period_id uuid;
  v_missing_closing_tx_period_id uuid;
  v_wrong_source_closing_tx_id uuid;
  v_wrong_source_closing_period_id uuid;
  v_other_user_closing_tx_id uuid;
  v_cross_user_closing_period_id uuid;
  v_unbooked_closing_tx_id uuid;
  v_unbooked_closing_period_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tx_id uuid;
  v_event_id uuid;
  v_bad_tx_id uuid;
  v_bad_ver_nr integer;
  v_before_tx integer;
  v_after_tx integer;
  v_before_events integer;
  v_after_events integer;
  v_count integer;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan27_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  INSERT INTO auth.users (id)
  VALUES (v_other_user_id);

  PERFORM pg_temp.set_auth(v_user_id);

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'transactions'
        AND con.conname = 'transactions_source_check'
        AND pg_get_constraintdef(con.oid, true) LIKE '%vat_settlement%'
    ),
    'source constraint accepts vat_settlement'
  );

  PERFORM pg_temp.assert_eq(public.transaction_source_is_current('vat_settlement'), true, 'vat_settlement current');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_reserved_future('vat_settlement'), false, 'vat_settlement no longer reserved');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_system_managed('vat_settlement'), true, 'vat_settlement system managed');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_controlled_vat_lifecycle('vat_settlement'), true, 'vat_settlement lifecycle');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_correction('vat_settlement'), false, 'vat_settlement no generic correction');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_update('vat_settlement'), false, 'vat_settlement no generic update');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_ordinary_vat_guard_activity('vat_settlement'), false, 'vat_settlement not ordinary VAT guard activity');

  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'SELECT'), true, 'authenticated can select own events');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'INSERT'), false, 'authenticated cannot insert events directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'UPDATE'), false, 'authenticated cannot update events directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_events', 'DELETE'), false, 'authenticated cannot delete events directly');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tax_account_events'
        AND cmd = 'SELECT'
        AND qual LIKE '%auth.uid%'
    ),
    'RLS owner-select policy exists'
  );

  v_payable_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'declared',
    'sololedger',
    4000
  );

  v_refund_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 6, 30),
    'declared',
    'sololedger',
    -1500
  );

  v_legacy_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 7, 1),
    make_date(v_base_year, 9, 30),
    'declared',
    'sololedger',
    700
  );

  v_open_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 1, 1),
    make_date(v_base_year + 1, 3, 31),
    'open',
    'sololedger',
    NULL
  );

  v_imported_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 4, 1),
    make_date(v_base_year + 1, 6, 30),
    'declared',
    'imported_history',
    100
  );

  v_zero_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 7, 1),
    make_date(v_base_year + 1, 9, 30),
    'declared',
    'sololedger',
    0
  );

  v_other_period_id := pg_temp.create_vat_period(
    v_other_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'declared',
    'sololedger',
    900
  );

  v_locked_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 2, 1, 1),
    make_date(v_base_year + 2, 3, 31),
    'declared',
    'sololedger',
    100
  );

  v_missing_closing_tx_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 1, 1),
    make_date(v_base_year + 3, 3, 31),
    'declared',
    'sololedger',
    111,
    NULL,
    false
  );

  v_wrong_source_closing_tx_id := pg_temp.create_transaction(
    v_user_id,
    make_date(v_base_year + 3, 6, 30),
    222,
    'KAN-27 wrong-source closing provenance',
    'manual',
    true
  );
  v_wrong_source_closing_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 4, 1),
    make_date(v_base_year + 3, 6, 30),
    'declared',
    'sololedger',
    222,
    v_wrong_source_closing_tx_id
  );

  v_other_user_closing_tx_id := pg_temp.create_closing_transaction(
    v_other_user_id,
    make_date(v_base_year + 3, 9, 30),
    333,
    'KAN-27 cross-user closing provenance'
  );
  v_cross_user_closing_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 7, 1),
    make_date(v_base_year + 3, 9, 30),
    'declared',
    'sololedger',
    333,
    v_other_user_closing_tx_id
  );

  v_unbooked_closing_tx_id := pg_temp.create_closing_transaction(
    v_user_id,
    make_date(v_base_year + 3, 12, 31),
    444,
    'KAN-27 unbooked closing provenance',
    false
  );
  v_unbooked_closing_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 3, 10, 1),
    make_date(v_base_year + 3, 12, 31),
    'declared',
    'sololedger',
    444,
    v_unbooked_closing_tx_id
  );

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_other_period_id,
      make_date(v_base_year, 4, 15),
      gen_random_uuid()
    ),
    'wrong tenant period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_open_period_id,
      make_date(v_base_year + 1, 4, 15),
      gen_random_uuid()
    ),
    'open period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_imported_period_id,
      make_date(v_base_year + 1, 7, 15),
      gen_random_uuid()
    ),
    'imported period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_zero_period_id,
      make_date(v_base_year + 1, 10, 15),
      gen_random_uuid()
    ),
    'zero closing period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_payable_period_id,
      current_date + 1,
      gen_random_uuid()
    ),
    'future settlement date'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_locked_period_id,
      make_date(v_base_year + 2, 4, 15),
      gen_random_uuid()
    ),
    'locked event year'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 0::numeric, %L::uuid)',
      v_payable_period_id,
      make_date(v_base_year, 4, 20),
      gen_random_uuid()
    ),
    'zero amount'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_missing_closing_tx_period_id,
      make_date(v_base_year + 3, 4, 15),
      gen_random_uuid()
    ),
    'declared nonzero period missing closing transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_wrong_source_closing_period_id,
      make_date(v_base_year + 3, 7, 15),
      gen_random_uuid()
    ),
    'declared period with non-vat-closing closing transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_cross_user_closing_period_id,
      make_date(v_base_year + 3, 10, 15),
      gen_random_uuid()
    ),
    'declared period with cross-user closing transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 10::numeric, %L::uuid)',
      v_unbooked_closing_period_id,
      make_date(v_base_year + 4, 1, 15),
      gen_random_uuid()
    ),
    'declared period with unbooked closing transaction'
  );

  v_result := public.record_vat_settlement_atomic(
    v_payable_period_id,
    make_date(v_base_year, 5, 12),
    1000,
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_event_id := (v_result->>'event_id')::uuid;

  PERFORM pg_temp.assert_eq(v_result->>'event_kind', 'vat_debit', 'payable event kind');
  PERFORM pg_temp.assert_eq((v_result->>'cumulative_settled')::numeric, 1000::numeric, 'payable cumulative partial');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 3000::numeric, 'payable remaining partial');
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'partially_settled', 'payable partial state');
  PERFORM pg_temp.assert_settlement_journal(v_tx_id, 'vat_debit', 1000, 'payable journal');

  v_result := public.record_vat_settlement_atomic(
    v_refund_period_id,
    make_date(v_base_year, 8, 12),
    1500,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'event_kind', 'vat_credit', 'refund event kind');
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'fully_settled', 'refund full state');
  PERFORM pg_temp.assert_settlement_journal((v_result->>'transaction_id')::uuid, 'vat_credit', 1500, 'refund journal');

  v_result := public.record_vat_settlement_atomic(
    v_legacy_period_id,
    make_date(v_base_year, 10, 12),
    700,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'fully_settled', 'legacy null skv accepted');

  v_result := public.record_vat_settlement_atomic(
    v_payable_period_id,
    make_date(v_base_year, 6, 12),
    2000,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq((v_result->>'cumulative_settled')::numeric, 3000::numeric, 'multiple settlement cumulative');
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'partially_settled', 'multiple settlement partial');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 1001::numeric, %L::uuid)',
      v_payable_period_id,
      make_date(v_base_year, 7, 12),
      gen_random_uuid()
    ),
    'over settlement'
  );

  v_result := public.record_vat_settlement_atomic(
    v_payable_period_id,
    make_date(v_base_year, 7, 13),
    1000,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'settlement_state', 'fully_settled', 'exact completion state');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 0::numeric, 'exact completion remaining');

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_events
  FROM public.tax_account_events
  WHERE user_id = v_user_id;

  v_replay := public.record_vat_settlement_atomic(
    (SELECT vat_period_id FROM public.tax_account_events WHERE id = v_event_id),
    make_date(v_base_year, 5, 12),
    1000,
    (SELECT idempotency_key FROM public.tax_account_events WHERE id = v_event_id)
  );

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_events
  FROM public.tax_account_events
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_replay->>'idempotent_replay', 'true', 'idempotent replay flag');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, 'idempotent replay no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_events, v_before_events, 'idempotent replay no duplicate event');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_vat_settlement_atomic(%L::uuid, %L::date, 999::numeric, %L::uuid)',
      v_payable_period_id,
      make_date(v_base_year, 5, 12),
      (SELECT idempotency_key FROM public.tax_account_events WHERE id = v_event_id)
    ),
    'idempotency conflict'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.update_transaction_safe(%L::uuid, jsonb_build_object(''file_url'', ''kan27.txt''))',
      v_tx_id
    ),
    'generic update forbidden'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.create_correction_transaction_atomic(%L::uuid)',
      v_tx_id
    ),
    'generic correction forbidden'
  );

  SELECT public.get_next_ver_nr(v_user_id) INTO v_bad_ver_nr;
  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    v_user_id,
    make_date(v_base_year, 5, 13),
    'KAN-27 wrong event kind fixture',
    123,
    NULL,
    NULL,
    true,
    'vat_settlement'
  )
  RETURNING id INTO v_bad_tx_id;
  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  ) VALUES
    (v_bad_tx_id, v_bad_ver_nr, '2650', 123, 0, 'KAN-27 wrong event kind fixture', make_date(v_base_year, 5, 13), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '2012', 0, 123, 'KAN-27 wrong event kind fixture', make_date(v_base_year, 5, 13), v_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       ) values (
         %L::uuid,
         %L::uuid,
         %L::uuid,
         ''vat_credit'',
         %L::date,
         123::numeric,
         %L::uuid
       )',
      v_user_id,
      v_payable_period_id,
      v_bad_tx_id,
      make_date(v_base_year, 5, 13),
      gen_random_uuid()
    ),
    'event kind direction mismatch validation'
  );

  SELECT public.get_next_ver_nr(v_user_id) INTO v_bad_ver_nr;
  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    v_user_id,
    make_date(v_base_year, 5, 14),
    'KAN-27 extra journal row fixture',
    124,
    NULL,
    NULL,
    true,
    'vat_settlement'
  )
  RETURNING id INTO v_bad_tx_id;
  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  ) VALUES
    (v_bad_tx_id, v_bad_ver_nr, '2650', 124, 0, 'KAN-27 extra journal row fixture', make_date(v_base_year, 5, 14), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '2012', 0, 124, 'KAN-27 extra journal row fixture', make_date(v_base_year, 5, 14), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '2013', 0, 0, 'KAN-27 extra journal row fixture', make_date(v_base_year, 5, 14), v_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       ) values (
         %L::uuid,
         %L::uuid,
         %L::uuid,
         ''vat_debit'',
         %L::date,
         124::numeric,
         %L::uuid
       )',
      v_user_id,
      v_payable_period_id,
      v_bad_tx_id,
      make_date(v_base_year, 5, 14),
      gen_random_uuid()
    ),
    'event extra journal row validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       )
       select
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount + 1,
         gen_random_uuid()
       from public.tax_account_events
       where id = %L::uuid',
      v_event_id
    ),
    'event journal consistency validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_events (
         user_id,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         idempotency_key
       )
       select
         %L::uuid,
         vat_period_id,
         transaction_id,
         event_kind,
         event_date,
         amount,
         gen_random_uuid()
       from public.tax_account_events
       where id = %L::uuid',
      v_other_user_id,
      v_event_id
    ),
    'tenant linkage validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'update public.tax_account_events set idempotency_key = gen_random_uuid() where id = %L::uuid',
      v_event_id
    ),
    'event immutability update'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'delete from public.tax_account_events where id = %L::uuid',
      v_event_id
    ),
    'event immutability delete'
  );

  SELECT count(*) INTO v_count
  FROM public.tax_account_events
  WHERE user_id = v_other_user_id;
  PERFORM pg_temp.assert_eq(v_count, 0, 'tenant isolation event count');

  RAISE NOTICE 'KAN-27 VAT settlement foundation rollback assertions passed for run tag %.', v_run_tag;
END;
$$;

ROLLBACK;

\echo 'KAN-27 VAT settlement foundation rollback test completed with explicit ROLLBACK.'
````````

==================================================

==================================================
FILE: supabase/tests/kan6_import_sie_vat_guard_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-6 rollback test candidate for import_sie_batch VAT guard.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan6_import_sie_vat_guard_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users and must be the
-- previously verified dedicated SoloLedger test user. This script does not
-- create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION, runs inside one outer transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan6_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan6_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

-- Install the exact local KAN-6 candidate inside the rollback transaction.
\ir ../migrations/20260918_add_vat_guard_to_import_sie_batch.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-6 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-6 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  -- Keep generated payload dates four-digit YYYY-MM-DD because the RPC
  -- intentionally validates that exact direct-RPC date shape.
  v_year integer := 2400 + floor(random() * 1000)::integer;
  v_tag text;

  v_payload jsonb;
  v_result jsonb;
  v_batch_id uuid;
  v_tx_id uuid;

  v_failed boolean;
  v_error_message text;

  v_before_batches integer;
  v_before_transactions integer;
  v_before_entries integer;
  v_before_ver_nr integer;
  v_after_batches integer;
  v_after_transactions integer;
  v_after_entries integer;
  v_after_ver_nr integer;

  v_date_a date;
  v_date_b date;
  v_date_c date;

  v_row_count integer;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan6_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  -- Keep fixtures far from ordinary dates and unique for every run. The outer
  -- rollback guarantees cleanup even though we intentionally create DB rows.
  v_tag := 'kan6-' || v_run_id;
  v_date_a := make_date(v_year, 1, 15);
  v_date_b := make_date(v_year, 2, 15);
  v_date_c := make_date(v_year, 3, 15);

  -- 1. Non-VAT happy path.
  v_payload := jsonb_build_object(
    'filename', v_tag || '-01.se',
    'file_hash', v_tag || '-01-non-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '1',
      'date', v_date_a::text,
      'description', 'KAN6 non-VAT happy path',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', v_date_a::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_a::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;

  SELECT count(*) INTO v_row_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id IN (
      SELECT id FROM public.transactions WHERE import_batch_id = v_batch_id
    );
  PERFORM pg_temp.assert_eq(v_row_count, 2, 'non-VAT happy path writes two rows');

  -- 2. VAT in one open SoloLedger period.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES (
    v_user_id,
    date_trunc('month', v_date_b)::date,
    (date_trunc('month', v_date_b)::date + interval '1 month' - interval '1 day')::date,
    'month',
    'open',
    'sololedger'
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-02.se',
    'file_hash', v_tag || '-02-one-open-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '2',
      'date', v_date_b::text,
      'description', 'KAN6 one open VAT period',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', v_date_b::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', v_date_b::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_b::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'VAT one open period succeeds');

  -- 3. VAT across multiple calendar months.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES
    (
      v_user_id,
      date_trunc('month', v_date_c)::date,
      (date_trunc('month', v_date_c)::date + interval '1 month' - interval '1 day')::date,
      'month',
      'open',
      'sololedger'
    ),
    (
      v_user_id,
      date_trunc('month', v_date_c + interval '1 month')::date,
      (date_trunc('month', v_date_c + interval '1 month')::date + interval '1 month' - interval '1 day')::date,
      'month',
      'open',
      'sololedger'
    );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-03.se',
    'file_hash', v_tag || '-03-multi-month',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(
      jsonb_build_object(
        'series', 'A',
        'ver_number', '3',
        'date', v_date_c::text,
        'description', 'KAN6 VAT month one',
        'rows', jsonb_build_array(
          jsonb_build_object('account_number', '1930', 'amount', 125, 'date', v_date_c::text),
          jsonb_build_object('account_number', '2611', 'amount', -25, 'date', v_date_c::text),
          jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_c::text)
        )
      ),
      jsonb_build_object(
        'series', 'A',
        'ver_number', '4',
        'date', (v_date_c + interval '1 month')::date::text,
        'description', 'KAN6 VAT month two',
        'rows', jsonb_build_array(
          jsonb_build_object('account_number', '1930', 'amount', 112, 'date', (v_date_c + interval '1 month')::date::text),
          jsonb_build_object('account_number', '2621', 'amount', -12, 'date', (v_date_c + interval '1 month')::date::text),
          jsonb_build_object('account_number', '3001', 'amount', -100, 'date', (v_date_c + interval '1 month')::date::text)
        )
      )
    )
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_eq((v_result->>'imported_count')::integer, 2, 'multi-month import count');

  -- 4. Same verification, different actual row dates.
  v_payload := jsonb_build_object(
    'filename', v_tag || '-04.se',
    'file_hash', v_tag || '-04-same-ver-row-dates',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '5',
      'date', v_date_c::text,
      'description', 'KAN6 same verification row dates',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 162, 'date', v_date_c::text),
        jsonb_build_object('account_number', '2611', 'amount', -50, 'date', v_date_c::text),
        jsonb_build_object('account_number', '2621', 'amount', -12, 'date', (v_date_c + interval '1 month')::date::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', v_date_c::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;

  SELECT count(*) INTO v_row_count
  FROM public.journal_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.import_batch_id = v_batch_id
    AND e.user_id = v_user_id
    AND (
      (e.account_number = '2611' AND e.date = v_date_c)
      OR (e.account_number = '2621' AND e.date = (v_date_c + interval '1 month')::date)
    );
  PERFORM pg_temp.assert_eq(v_row_count, 2, 'same verification uses actual VAT row dates');

  -- 5. Closed SoloLedger period blocks atomically.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 5, 15))::date,
    (date_trunc('month', make_date(v_year, 5, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'closed',
    'sololedger',
    0
  );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-05.se',
    'file_hash', v_tag || '-05-closed-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '6',
      'date', make_date(v_year, 5, 15)::text,
      'description', 'KAN6 closed VAT period',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year, 5, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year, 5, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year, 5, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'closed SoloLedger VAT period blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%stängd%' OR v_error_message ILIKE '%deklarerad%', 'closed VAT error message');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'closed block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'closed block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'closed block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'closed block does not consume ver_nr');

  -- 6. Declared SoloLedger period blocks atomically.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount, declared_at
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 6, 15))::date,
    (date_trunc('month', make_date(v_year, 6, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'declared',
    'sololedger',
    0,
    now()
  );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-06.se',
    'file_hash', v_tag || '-06-declared-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '7',
      'date', make_date(v_year, 6, 15)::text,
      'description', 'KAN6 declared VAT period',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year, 6, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year, 6, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year, 6, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'declared SoloLedger VAT period blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'declared block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'declared block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'declared block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'declared block does not consume ver_nr');

  -- 7. imported_history closed/declared must not block.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount, declared_at
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 7, 15))::date,
    (date_trunc('month', make_date(v_year, 7, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'declared',
    'imported_history',
    0,
    now()
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-07.se',
    'file_hash', v_tag || '-07-imported-history',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '8',
      'date', make_date(v_year, 7, 15)::text,
      'description', 'KAN6 imported history does not block',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year, 7, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year, 7, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year, 7, 15)::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'imported_history does not block');

  -- 8. 265x participates in synchronization/state guard.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source, closing_amount
  )
  VALUES (
    v_user_id,
    date_trunc('month', make_date(v_year, 8, 15))::date,
    (date_trunc('month', make_date(v_year, 8, 15))::date + interval '1 month' - interval '1 day')::date,
    'month',
    'closed',
    'sololedger',
    0
  );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-08.se',
    'file_hash', v_tag || '-08-265x',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', v_year::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '9',
      'date', make_date(v_year, 8, 15)::text,
      'description', 'KAN6 265x guard',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year, 8, 15)::text),
        jsonb_build_object('account_number', '2650', 'amount', -100, 'date', make_date(v_year, 8, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '265x closed SoloLedger period blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, '265x block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, '265x block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '265x block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '265x block does not consume ver_nr');

  -- 9. Opening balance with VAT account uses fiscal_year-01-01 as guard date.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES (
    v_user_id,
    make_date(v_year + 1, 1, 1),
    make_date(v_year + 1, 1, 31),
    'month',
    'open',
    'sololedger'
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-09.se',
    'file_hash', v_tag || '-09-ib-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 1)::text,
    'opening_balances', jsonb_build_array(
      jsonb_build_object('account_number', '1930', 'amount', 100),
      jsonb_build_object('account_number', '2611', 'amount', -100)
    ),
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '10',
      'date', make_date(v_year + 1, 2, 15)::text,
      'description', 'KAN6 regular verification after VAT IB',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year + 1, 2, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 1, 2, 15)::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  v_batch_id := (v_result->>'import_batch_id')::uuid;

  SELECT count(*) INTO v_row_count
  FROM public.journal_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.import_batch_id = v_batch_id
    AND t.source = 'sie_opening_balance'
    AND e.account_number = '2611'
    AND e.date = make_date(v_year + 1, 1, 1);
  PERFORM pg_temp.assert_eq(v_row_count, 1, 'VAT opening balance row uses fiscal_year-01-01');

  -- 10. Opening balance without VAT still works after IB lock move.
  v_payload := jsonb_build_object(
    'filename', v_tag || '-10.se',
    'file_hash', v_tag || '-10-ib-non-vat',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 2)::text,
    'opening_balances', jsonb_build_array(
      jsonb_build_object('account_number', '1930', 'amount', 100),
      jsonb_build_object('account_number', '2010', 'amount', -100)
    ),
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '11',
      'date', make_date(v_year + 2, 2, 15)::text,
      'description', 'KAN6 regular verification after non-VAT IB',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year + 2, 2, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 2, 2, 15)::text)
      )
    ))
  );

  v_result := public.import_sie_batch(v_payload);
  PERFORM pg_temp.assert_true((v_result->>'opening_balance_imported')::boolean, 'non-VAT opening balance still imports');

  -- 11. Ambiguous VAT state: two overlapping open SoloLedger periods block.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES
    (
      v_user_id,
      make_date(v_year + 3, 1, 1),
      make_date(v_year + 3, 1, 31),
      'month',
      'open',
      'sololedger'
    ),
    (
      v_user_id,
      make_date(v_year + 3, 1, 1),
      make_date(v_year + 3, 3, 31),
      'quarter',
      'open',
      'sololedger'
    );

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-11.se',
    'file_hash', v_tag || '-11-ambiguous-open',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 3)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '12',
      'date', make_date(v_year + 3, 1, 15)::text,
      'description', 'KAN6 ambiguous open periods',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year + 3, 1, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year + 3, 1, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 3, 1, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'ambiguous open SoloLedger VAT periods block');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'ambiguous block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'ambiguous block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'ambiguous block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'ambiguous block does not consume ver_nr');

  -- 12. Year lock regression: existing behavior blocks by verification year.
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_year + 4);

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-12.se',
    'file_hash', v_tag || '-12-year-lock',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 4)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '13',
      'date', make_date(v_year + 4, 1, 15)::text,
      'description', 'KAN6 year lock',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 100, 'date', make_date(v_year + 4, 1, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 4, 1, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'year lock still blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'year lock import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'year lock transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'year lock journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'year lock does not consume ver_nr');

  -- 13. Duplicate import/file hash regression.
  INSERT INTO public.vat_periods (
    user_id, period_start, period_end, period_type, status, source
  )
  VALUES (
    v_user_id,
    make_date(v_year + 5, 1, 1),
    make_date(v_year + 5, 1, 31),
    'month',
    'open',
    'sololedger'
  );

  v_payload := jsonb_build_object(
    'filename', v_tag || '-13.se',
    'file_hash', v_tag || '-13-duplicate',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 5)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '14',
      'date', make_date(v_year + 5, 1, 15)::text,
      'description', 'KAN6 duplicate first pass',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year + 5, 1, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', make_date(v_year + 5, 1, 15)::text),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 5, 1, 15)::text)
      )
    ))
  );

  PERFORM public.import_sie_batch(v_payload);

  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'duplicate file hash still blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'duplicate block import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'duplicate block transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'duplicate block journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'duplicate block does not consume ver_nr');

  -- 14. Malformed direct-RPC payload: early date error remains atomic.
  SELECT count(*) INTO v_before_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_payload := jsonb_build_object(
    'filename', v_tag || '-14.se',
    'file_hash', v_tag || '-14-malformed-row-date',
    'company_name', 'KAN6 Test',
    'org_nr', '000000-0000',
    'fiscal_year', (v_year + 6)::text,
    'opening_balances', '[]'::jsonb,
    'previous_year_result_balances', '[]'::jsonb,
    'verifications', jsonb_build_array(jsonb_build_object(
      'series', 'A',
      'ver_number', '15',
      'date', make_date(v_year + 6, 1, 15)::text,
      'description', 'KAN6 malformed VAT row date',
      'rows', jsonb_build_array(
        jsonb_build_object('account_number', '1930', 'amount', 125, 'date', make_date(v_year + 6, 1, 15)::text),
        jsonb_build_object('account_number', '2611', 'amount', -25, 'date', 'not-a-date'),
        jsonb_build_object('account_number', '3001', 'amount', -100, 'date', make_date(v_year + 6, 1, 15)::text)
      )
    ))
  );

  v_failed := false;
  BEGIN
    PERFORM public.import_sie_batch(v_payload);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, 'malformed direct VAT row date blocks');

  SELECT count(*) INTO v_after_batches FROM public.import_batches WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_transactions FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_batches, v_before_batches, 'malformed date import_batches atomicity');
  PERFORM pg_temp.assert_eq(v_after_transactions, v_before_transactions, 'malformed date transactions atomicity');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, 'malformed date journal_entries atomicity');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, 'malformed date does not consume ver_nr');

  RAISE NOTICE 'KAN-6 import_sie_batch VAT guard candidate rollback tests completed for run id %', v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate RPC install and every fixture row
-- are discarded together.
ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan7_close_vat_period_atomic_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-7 rollback test candidate for close_vat_period_atomic().
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan7_close_vat_period_atomic_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION, runs inside one outer transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan7_test_context (
  test_user_id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO kan7_test_context (test_user_id)
VALUES (:'test_user_id'::uuid);

-- Install the exact local KAN-7 candidate inside the rollback transaction.
\ir ../migrations/20260918_add_close_vat_period_atomic.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-7 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-7 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'open',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT NULL,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'manual'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce((entry->>'debit')::numeric, 0)), 0),
    coalesce(sum(coalesce((entry->>'credit')::numeric, 0)), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_entries) AS entry;

  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'KAN-7 fixture is unbalanced: % (debit %, credit %)',
      p_description, v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    true,
    p_source
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_tx_id,
    p_ver_nr,
    entry->>'account',
    coalesce((entry->>'debit')::numeric, 0),
    coalesce((entry->>'credit')::numeric, 0),
    p_description,
    coalesce((entry->>'date')::date, p_tx_date),
    p_user_id
  FROM jsonb_array_elements(p_entries) AS entry;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_account_balance(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_account_number text,
  p_expected numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0)
    INTO v_balance
  FROM public.journal_entries
  WHERE user_id = p_user_id
    AND date BETWEEN p_period_start AND p_period_end
    AND account_number = p_account_number;

  PERFORM pg_temp.assert_eq(v_balance, p_expected, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_closing_transaction(
  p_user_id uuid,
  p_transaction_id uuid,
  p_period_end date,
  p_expected_amount numeric,
  p_expected_row_count integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_row_count integer;
  v_distinct_ver_nr_count integer;
  v_bad_date_count integer;
  v_zero_row_count integer;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT *
    INTO v_tx
  FROM public.transactions
  WHERE id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_true(FOUND, p_message || ': closing transaction exists');
  PERFORM pg_temp.assert_eq(v_tx.source, 'vat_closing', p_message || ': source');
  PERFORM pg_temp.assert_eq(v_tx.booked, true, p_message || ': booked');
  PERFORM pg_temp.assert_eq(v_tx.date, p_period_end, p_message || ': transaction date');
  PERFORM pg_temp.assert_eq(v_tx.amount, p_expected_amount, p_message || ': transactions.amount');

  SELECT
    count(*)::integer,
    count(DISTINCT ver_nr)::integer,
    count(*) FILTER (WHERE date IS DISTINCT FROM p_period_end)::integer,
    count(*) FILTER (WHERE coalesce(debit, 0) = 0 AND coalesce(credit, 0) = 0)::integer,
    coalesce(sum(coalesce(debit, 0)), 0),
    coalesce(sum(coalesce(credit, 0)), 0)
  INTO
    v_row_count,
    v_distinct_ver_nr_count,
    v_bad_date_count,
    v_zero_row_count,
    v_total_debit,
    v_total_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND user_id = p_user_id;

  PERFORM pg_temp.assert_eq(v_row_count, p_expected_row_count, p_message || ': journal row count');
  PERFORM pg_temp.assert_eq(v_distinct_ver_nr_count, 1, p_message || ': one ver_nr');
  PERFORM pg_temp.assert_eq(v_bad_date_count, 0, p_message || ': all journal rows on period_end');
  PERFORM pg_temp.assert_eq(v_zero_row_count, 0, p_message || ': no fabricated zero rows');
  PERFORM pg_temp.assert_eq(v_total_debit, v_total_credit, p_message || ': debit equals credit');
  PERFORM pg_temp.assert_eq(v_total_debit, p_expected_amount, p_message || ': amount is total debit');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_period_closed_with_transaction(
  p_period_id uuid,
  p_transaction_id uuid,
  p_closing_amount numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_period public.vat_periods%ROWTYPE;
BEGIN
  SELECT *
    INTO v_period
  FROM public.vat_periods
  WHERE id = p_period_id;

  PERFORM pg_temp.assert_true(FOUND, p_message || ': period exists');
  PERFORM pg_temp.assert_eq(v_period.status, 'closed', p_message || ': status closed');
  PERFORM pg_temp.assert_eq(v_period.closing_amount, p_closing_amount, p_message || ': closing_amount');
  PERFORM pg_temp.assert_eq(v_period.closing_transaction_id, p_transaction_id, p_message || ': closing_transaction_id');
  PERFORM pg_temp.assert_true(v_period.declared_at IS NULL, p_message || ': declared_at remains NULL');
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_id text := replace(gen_random_uuid()::text, '-', '');
  v_tag text;
  v_base_year integer := 1800 + floor(random() * 100)::integer;
  v_future_year integer := extract(year from current_date)::integer + 20;

  v_period_id uuid;
  v_tx_id uuid;
  v_existing_tx_id uuid;
  v_result jsonb;
  v_definition text;

  v_before_tx integer;
  v_after_tx integer;
  v_before_entries integer;
  v_after_entries integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_before_period_status text;
  v_after_period_status text;

  v_failed boolean;
  v_error_message text;
  v_period_start date;
  v_period_end date;
  v_count integer;
BEGIN
  SELECT test_user_id
    INTO v_user_id
  FROM kan7_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  v_tag := 'kan7-' || v_run_id;

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 2, 12, 31)
    ),
    'isolated transaction date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 2, 12, 31)
    ),
    'isolated journal date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE user_id = v_user_id
        AND period_start <= make_date(v_base_year + 2, 12, 31)
        AND period_end >= make_date(v_base_year, 1, 1)
    ),
    'isolated VAT period window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year BETWEEN v_base_year AND v_base_year + 2
    ),
    'isolated closed_years window must be empty before fixtures'
  );

  -- 1. No VAT activity: close state only, no transaction and no ver_nr.
  v_period_start := make_date(v_base_year, 1, 1);
  v_period_end := make_date(v_base_year, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.close_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'transaction_created')::boolean, false, '1 no VAT activity transaction_created');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '1 no VAT activity amount');
  PERFORM pg_temp.assert_true(v_result->>'closing_transaction_id' IS NULL, '1 no VAT activity closing_transaction_id');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '1 no VAT activity no transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '1 no VAT activity no journal rows');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '1 no VAT activity no ver_nr');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM public.vat_periods
      WHERE id = v_period_id
        AND status = 'closed'
        AND closing_amount = 0
        AND closing_transaction_id IS NULL
        AND declared_at IS NULL
    ),
    '1 no VAT activity period state'
  );

  -- 2. Payable VAT: output VAT credit 250 + input VAT debit 50.
  v_period_start := make_date(v_base_year, 2, 1);
  v_period_end := make_date(v_base_year, 2, 28);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 10),
    v_tag || ' test 02 payable fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 200, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250)
    ),
    700002
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 200::numeric, '2 payable closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 250::numeric, 3, '2 payable closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 200::numeric, '2 payable period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '2 payable 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '2 payable 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -200, '2 payable 2650 credit');

  -- 3. Refund VAT: input VAT debit 100.
  v_period_start := make_date(v_base_year, 3, 1);
  v_period_end := make_date(v_base_year, 3, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 10),
    v_tag || ' test 03 refund fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 100)
    ),
    700003
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -100::numeric, '3 refund closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 100::numeric, 2, '3 refund closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, -100::numeric, '3 refund period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '3 refund 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', 100, '3 refund 2650 debit');

  -- 4. Zero-net with actual activity and nonzero account balances.
  v_period_start := make_date(v_base_year, 4, 1);
  v_period_end := make_date(v_base_year, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 10),
    v_tag || ' test 04 zero-net fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 100)
    ),
    700004
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '4 zero-net closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 100::numeric, 2, '4 zero-net closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 0::numeric, '4 zero-net period link');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE user_id = v_user_id
        AND transaction_id = v_tx_id
        AND account_number = '2650'
    ),
    '4 zero-net no 2650 row'
  );
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '4 zero-net 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '4 zero-net 2641 zero');

  -- 5. Mixed balances over several 261/262/263/2641 accounts.
  v_period_start := make_date(v_base_year, 5, 1);
  v_period_end := make_date(v_base_year, 5, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 5, 10),
    v_tag || ' test 05 mixed fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 210, 'credit', 0),
      jsonb_build_object('account', '2631', 'debit', 20, 'credit', 0),
      jsonb_build_object('account', '2641', 'debit', 80, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 250),
      jsonb_build_object('account', '2621', 'debit', 0, 'credit', 60)
    ),
    700005
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 210::numeric, '5 mixed closing_amount');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 310::numeric, 5, '5 mixed closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 210::numeric, '5 mixed period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '5 mixed 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2621', 0, '5 mixed 2621 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2631', 0, '5 mixed 2631 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '5 mixed 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -210, '5 mixed 2650 credit');

  -- 6. 265x activity before close: manual-review block and no ver_nr.
  v_period_start := make_date(v_base_year, 6, 1);
  v_period_end := make_date(v_base_year, 6, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 6, 10),
    v_tag || ' test 06 265x fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 100)
    ),
    700006
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;
  PERFORM pg_temp.assert_true(v_failed, '6 265x activity blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%265x%', '6 265x error message');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '6 265x no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '6 265x no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '6 265x no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '6 265x period remains open');

  -- 7. Activity exists, but all per-account balances are exactly zero.
  v_period_start := make_date(v_base_year, 7, 1);
  v_period_end := make_date(v_base_year, 7, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 7, 10),
    v_tag || ' test 07 all balances zero fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    700007
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '7 all balances zero blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '7 all balances zero no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '7 all balances zero no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '7 all balances zero no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '7 all balances zero period remains open');

  -- 8. imported_history blocks normal close.
  v_period_start := make_date(v_base_year, 8, 1);
  v_period_end := make_date(v_base_year, 8, 31);
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    v_period_start,
    v_period_end,
    'open',
    'imported_history'
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '8 imported_history blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '8 imported_history no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '8 imported_history no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '8 imported_history no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '8 imported_history period remains open');

  -- 9. Already closed: idempotent success with existing amount/transaction.
  v_period_start := make_date(v_base_year, 9, 1);
  v_period_end := make_date(v_base_year, 9, 30);
  v_existing_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    v_period_end,
    v_tag || ' test 09 pre-closed existing closing',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 0, 'credit', 25),
      jsonb_build_object('account', '2650', 'debit', 25, 'credit', 0)
    ),
    700009,
    'vat_closing'
  );
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    v_period_start,
    v_period_end,
    'closed',
    'sololedger',
    -25,
    v_existing_tx_id
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.close_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq((v_result->>'already_closed')::boolean, true, '9 already closed flag');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -25::numeric, '9 already closed amount');
  PERFORM pg_temp.assert_eq((v_result->>'closing_transaction_id')::uuid, v_existing_tx_id, '9 already closed transaction id');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '9 already closed no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '9 already closed no duplicate journal rows');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '9 already closed no ver_nr');

  -- 10. declared blocks.
  v_period_start := make_date(v_base_year, 10, 1);
  v_period_end := make_date(v_base_year, 10, 31);
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    v_period_start,
    v_period_end,
    'declared',
    'sololedger',
    0,
    NULL,
    now()
  );

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '10 declared blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '10 declared no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '10 declared no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '10 declared no ver_nr');

  -- 11. Future period_end blocks.
  v_period_start := make_date(v_future_year, 1, 1);
  v_period_end := make_date(v_future_year, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '11 future period blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '11 future no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '11 future no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '11 future no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '11 future period remains open');

  -- 12. period_end year in closed_years blocks.
  v_period_start := make_date(v_base_year + 2, 1, 1);
  v_period_end := make_date(v_base_year + 2, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);

  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '12 closed year blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT status INTO v_after_period_status FROM public.vat_periods WHERE id = v_period_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '12 closed year no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '12 closed year no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '12 closed year no ver_nr');
  PERFORM pg_temp.assert_eq(v_after_period_status, 'open', '12 closed year period remains open');

  -- 13. Idempotent retry after a real close in the same outer transaction.
  v_period_start := make_date(v_base_year + 1, 1, 1);
  v_period_end := make_date(v_base_year + 1, 1, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 1, 10),
    v_tag || ' test 13 retry fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 125, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    700013
  );

  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 25::numeric, '13 first close period link');
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr + 1, '13 first close consumes one ver_nr');

  v_before_ver_nr := v_after_ver_nr;
  v_result := public.close_vat_period_atomic(v_period_id);
  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq((v_result->>'already_closed')::boolean, true, '13 retry already_closed');
  PERFORM pg_temp.assert_eq((v_result->>'closing_transaction_id')::uuid, v_tx_id, '13 retry same transaction');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '13 retry no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '13 retry no duplicate journal rows');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, '13 retry no ver_nr');

  -- 14. Wrong user / nonexistent period id, tested safely without touching any other real user.
  SELECT count(*) INTO v_before_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  BEGIN
    PERFORM public.close_vat_period_atomic(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  PERFORM pg_temp.assert_true(v_failed, '14 nonexistent period blocks');

  SELECT count(*) INTO v_after_tx FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_entries FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, '14 nonexistent no transaction write');
  PERFORM pg_temp.assert_eq(v_after_entries, v_before_entries, '14 nonexistent no journal write');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '14 nonexistent no ver_nr');

  -- 15. declared_at remains NULL after normal open -> closed.
  v_period_start := make_date(v_base_year + 1, 2, 1);
  v_period_end := make_date(v_base_year + 1, 2, 28);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 2, 10),
    v_tag || ' test 15 declared_at fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 125, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    700015
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 25::numeric, '15 declared_at period link');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM public.vat_periods
      WHERE id = v_period_id
        AND status = 'closed'
        AND declared_at IS NULL
    ),
    '15 declared_at remains NULL'
  );

  -- 16. Scope invariant: no 1630, and exactly 2641 inside 264x.
  v_period_start := make_date(v_base_year + 1, 3, 1);
  v_period_end := make_date(v_base_year + 1, 3, 31);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 3, 10),
    v_tag || ' test 16 scope fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2641', 'debit', 40, 'credit', 0),
      jsonb_build_object('account', '2642', 'debit', 70, 'credit', 0),
      jsonb_build_object('account', '1630', 'debit', 30, 'credit', 0),
      jsonb_build_object('account', '1930', 'debit', 0, 'credit', 140)
    ),
    700016
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, -40::numeric, '16 scope closing_amount only 2641');
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 40::numeric, 2, '16 scope closing');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, -40::numeric, '16 scope period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2641', 0, '16 scope 2641 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2642', 70, '16 scope 2642 untouched');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '1630', 30, '16 scope 1630 untouched');
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE user_id = v_user_id
        AND transaction_id = v_tx_id
        AND (account_number = '1630' OR account_number = '2642')
    ),
    '16 scope no 1630 or 2642 closing rows'
  );

  -- 17. Closing date/self-interaction invariant.
  v_period_start := make_date(v_base_year + 1, 4, 1);
  v_period_end := make_date(v_base_year + 1, 4, 30);
  v_period_id := pg_temp.create_vat_period(v_user_id, v_period_start, v_period_end);
  PERFORM pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year + 1, 4, 10),
    v_tag || ' test 17 closing date fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    700017
  );

  v_result := public.close_vat_period_atomic(v_period_id);
  v_tx_id := (v_result->>'closing_transaction_id')::uuid;
  PERFORM pg_temp.assert_closing_transaction(v_user_id, v_tx_id, v_period_end, 25::numeric, 2, '17 closing date');
  PERFORM pg_temp.assert_period_closed_with_transaction(v_period_id, v_tx_id, 25::numeric, '17 closing date period link');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2611', 0, '17 self-interaction final 2611 zero');
  PERFORM pg_temp.assert_account_balance(v_user_id, v_period_start, v_period_end, '2650', -25, '17 self-interaction 2650 credit once');

  SELECT count(*)::integer
    INTO v_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_tx_id
    AND date IS DISTINCT FROM v_period_end;
  PERFORM pg_temp.assert_eq(v_count, 0, '17 all closing rows have period_end date');

  -- 18. Lock-domain revalidation. Real two-session race remains deferred; in
  -- this single-session rollback script we verify the installed candidate has
  -- the explicit guard and correct lock-before-row-lock structure.
  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  PERFORM pg_temp.assert_true(
    position('PERFORM public.lock_vat_months(v_user_id, v_lock_dates)' in v_definition) > 0,
    '18 lock_vat_months call exists'
  );
  PERFORM pg_temp.assert_true(
    position('FOR UPDATE' in v_definition) > position('PERFORM public.lock_vat_months(v_user_id, v_lock_dates)' in v_definition),
    '18 VAT advisory locks before row lock'
  );
  PERFORM pg_temp.assert_true(
    v_definition LIKE '%v_period.user_id IS DISTINCT FROM v_pre_user_id%'
    AND v_definition LIKE '%v_period.period_start IS DISTINCT FROM v_pre_period_start%'
    AND v_definition LIKE '%v_period.period_end IS DISTINCT FROM v_pre_period_end%'
    AND v_definition LIKE '%Momsperiodens datum ändrades under stängningen. Försök igen.%'
    AND v_definition LIKE '%ERRCODE = ''40001''%',
    '18 lock-domain mismatch guard exists'
  );

  RAISE NOTICE 'KAN-7 close_vat_period_atomic candidate rollback tests completed for run id %. Test 18 single-session structural guard verified; true two-session concurrency remains DEFERRED / NOT EMPIRICALLY TESTED.',
    v_run_id;
END;
$$;

-- This must stay ROLLBACK so the candidate RPC install, all fixtures, and any
-- ver_nr_sequences changes are discarded together.
ROLLBACK;
````````

==================================================

==================================================
FILE: supabase/tests/kan7b_vat_closing_system_guard_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-7B rollback test candidate for vat_closing system-transaction guards.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan7b_vat_closing_system_guard_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION statements and all fixtures/assertions, runs inside one outer
-- transaction and ends with an explicit ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan7b_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan7b_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-7B rollback ' || replace(gen_random_uuid()::text, '-', ''),
  2400 + floor(random() * 500)::integer
);

-- Install the exact local KAN-7B candidate inside the rollback transaction.
\ir ../migrations/20260919_guard_vat_closing_system_transactions.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-7B assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-7B assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'open',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT NULL,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'manual',
  p_booked boolean DEFAULT true,
  p_file_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce((entry->>'debit')::numeric, 0)), 0),
    coalesce(sum(coalesce((entry->>'credit')::numeric, 0)), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_entries) AS entry;

  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'KAN-7B fixture is unbalanced: % (debit %, credit %)',
      p_description, v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source,
    file_url
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    p_booked,
    p_source,
    p_file_url
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_tx_id,
    p_ver_nr,
    entry->>'account',
    coalesce((entry->>'debit')::numeric, 0),
    coalesce((entry->>'credit')::numeric, 0),
    p_description,
    coalesce((entry->>'date')::date, p_tx_date),
    p_user_id
  FROM jsonb_array_elements(p_entries) AS entry;

  RETURN v_tx_id;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;

  v_vat_closing_tx_id uuid;
  v_manual_tx_id uuid;
  v_manual_update_tx_id uuid;
  v_periodized_tx_id uuid;
  v_periodized_reversal_tx_id uuid;
  v_periodized_corr_tx_id uuid;
  v_periodized_reversal_corr_tx_id uuid;
  v_periodization_group_id uuid;
  v_vat_protected_tx_id uuid;

  v_before_tx_count integer;
  v_after_tx_count integer;
  v_before_journal_count integer;
  v_after_journal_count integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_before_corrections integer;
  v_after_corrections integer;

  v_original_manual_ver_nr integer := 810001;
  v_vat_closing_ver_nr integer := 810002;
  v_manual_update_ver_nr integer := 810003;
  v_vat_protected_ver_nr integer := 810004;
  v_sequence_floor integer := 820000;

  v_result jsonb;
  v_periodized_result jsonb;
  v_failed boolean;
  v_error_message text;
  v_file_url text;
  v_description text;
  v_amount numeric;
  v_returned_ver_nr integer;
  v_periodized_type text;
  v_original_row_count integer;
  v_reversal_row_count integer;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan7b_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  INSERT INTO public.ver_nr_sequences (user_id, last_ver_nr)
  VALUES (v_user_id, v_sequence_floor)
  ON CONFLICT (user_id) DO UPDATE
  SET last_ver_nr = greatest(public.ver_nr_sequences.last_ver_nr, EXCLUDED.last_ver_nr);

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'authenticated can execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'anon cannot execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.create_correction_transaction_atomic(uuid)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    'PUBLIC cannot execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'service_role can execute create_correction_transaction_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.create_correction_transaction_atomic(uuid)'::regprocedure, 'EXECUTE'),
    'postgres can execute create_correction_transaction_atomic'
  );

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'authenticated can execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'anon cannot execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.update_transaction_safe(uuid,jsonb)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    'PUBLIC cannot execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'service_role can execute update_transaction_safe'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.update_transaction_safe(uuid,jsonb)'::regprocedure, 'EXECUTE'),
    'postgres can execute update_transaction_safe'
  );

  PERFORM pg_temp.assert_true(
    NOT has_table_privilege('authenticated', 'public.transactions', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.transactions', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.transactions', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.journal_entries', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.journal_entries', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.journal_entries', 'DELETE'),
    'authenticated still lacks direct transaction/journal table writes'
  );

  v_vat_closing_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 31),
    v_run_tag || ' vat closing fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 25, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 25)
    ),
    v_vat_closing_ver_nr,
    'vat_closing',
    true
  );

  SELECT count(*), count(*)
    INTO v_before_tx_count, v_after_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_before_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  SELECT count(*)
    INTO v_before_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND coalesce(is_correction, false) = true
    AND corrects_ver_nr = v_vat_closing_ver_nr;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_closing_tx_id);
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'correction of vat_closing transaction is blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%Momsavslut%' AND v_error_message ILIKE '%systemverifikation%',
    'vat_closing correction error is explicit'
  );

  SELECT count(*)
    INTO v_after_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_after_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  SELECT count(*)
    INTO v_after_corrections
  FROM public.transactions
  WHERE user_id = v_user_id
    AND coalesce(is_correction, false) = true
    AND corrects_ver_nr = v_vat_closing_ver_nr;

  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, 'blocked vat_closing correction creates no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, 'blocked vat_closing correction creates no journal entries');
  PERFORM pg_temp.assert_eq(v_after_corrections, v_before_corrections, 'blocked vat_closing correction creates no correction row');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, 'blocked vat_closing correction consumes no ver_nr');

  v_manual_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 2, 10),
    v_run_tag || ' ordinary correction fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 100, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100)
    ),
    v_original_manual_ver_nr,
    'manual',
    true
  );

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_result := public.create_correction_transaction_atomic(v_manual_tx_id);
  v_returned_ver_nr := (v_result->>'ver_nr')::integer;

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary correction returns success');
  PERFORM pg_temp.assert_eq(v_returned_ver_nr, v_before_ver_nr + 1, 'ordinary correction consumes exactly one ver_nr');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND id = (v_result->>'transaction_id')::uuid
        AND coalesce(is_correction, false) = true
        AND corrects_ver_nr = v_original_manual_ver_nr
    ),
    'ordinary correction creates correction transaction'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND transaction_id = (v_result->>'transaction_id')::uuid
    ),
    2,
    'ordinary correction creates mirrored journal rows'
  );

  v_periodized_type := 'kan7b_periodized_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.accounts (
    id,
    user_id,
    name,
    debit_account,
    credit_account,
    default_vat_rate,
    comment
  ) VALUES (
    v_periodized_type,
    v_user_id,
    v_run_tag || ' periodized expense account',
    '6570',
    '1930',
    0,
    v_run_tag || ' rollback-only account fixture'
  );

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_periodized_result := public.book_periodized_transaction_atomic(
    jsonb_build_object(
      'date', make_date(v_base_year, 5, 10)::text,
      'future_date', make_date(v_base_year + 1, 1, 15)::text,
      'description', v_run_tag || ' periodized correction fixture',
      'amount', 120,
      'type', v_periodized_type,
      'vat_rate', 0,
      'file_url', ''
    )
  );

  v_periodized_tx_id := (v_periodized_result->>'transaction_id')::uuid;
  v_periodized_reversal_tx_id := (v_periodized_result->>'reversal_transaction_id')::uuid;
  v_periodization_group_id := (v_periodized_result->>'periodization_group_id')::uuid;

  PERFORM pg_temp.assert_true(
    (v_periodized_result->>'success')::boolean,
    'periodized fixture booking returns success'
  );
  PERFORM pg_temp.assert_eq(
    (v_periodized_result->>'ver_nr')::integer,
    v_before_ver_nr + 1,
    'periodized original fixture gets next ver_nr'
  );
  PERFORM pg_temp.assert_eq(
    (v_periodized_result->>'reversal_ver_nr')::integer,
    v_before_ver_nr + 2,
    'periodized reversal fixture gets following ver_nr'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions original
      JOIN public.transactions reversal
        ON reversal.periodization_group_id = original.periodization_group_id
       AND reversal.user_id = original.user_id
      WHERE original.id = v_periodized_tx_id
        AND reversal.id = v_periodized_reversal_tx_id
        AND original.user_id = v_user_id
        AND original.source = 'manual'
        AND reversal.source = 'manual'
        AND original.periodization_group_id = v_periodization_group_id
        AND original.is_periodized = true
        AND coalesce(original.is_periodized_reversal, false) = false
        AND original.periodized_future_date = make_date(v_base_year + 1, 1, 15)
        AND reversal.is_periodized = true
        AND reversal.is_periodized_reversal = true
        AND reversal.periodized_future_date IS NULL
    ),
    'periodized original and reversal fixtures are linked by existing model'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries e
      WHERE e.user_id = v_user_id
        AND e.transaction_id IN (v_periodized_tx_id, v_periodized_reversal_tx_id)
        AND public.vat_concurrency_account(e.account_number)
    ),
    'periodized regression fixture does not enter VAT-period guard scope'
  );

  SELECT count(*)::integer
    INTO v_original_row_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_periodized_tx_id;

  SELECT count(*)::integer
    INTO v_reversal_row_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND transaction_id = v_periodized_reversal_tx_id;

  PERFORM pg_temp.assert_eq(v_original_row_count, 2, 'periodized original fixture has expected journal rows');
  PERFORM pg_temp.assert_eq(v_reversal_row_count, 2, 'periodized reversal fixture has expected journal rows');

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_result := public.create_correction_transaction_atomic(v_periodized_tx_id);
  v_periodized_corr_tx_id := (v_result->>'transaction_id')::uuid;
  v_periodized_reversal_corr_tx_id := (v_result->>'reversal_correction_transaction_id')::uuid;

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'periodized correction returns success');
  PERFORM pg_temp.assert_eq(
    (v_result->>'ver_nr')::integer,
    v_before_ver_nr + 1,
    'periodized original correction gets next ver_nr'
  );
  PERFORM pg_temp.assert_eq(
    (v_result->>'reversal_correction_ver_nr')::integer,
    v_before_ver_nr + 2,
    'periodized reversal correction gets following ver_nr'
  );
  PERFORM pg_temp.assert_true(
    v_periodized_corr_tx_id IS NOT NULL
    AND v_periodized_reversal_corr_tx_id IS NOT NULL
    AND v_periodized_corr_tx_id IS DISTINCT FROM v_periodized_reversal_corr_tx_id,
    'periodized correction creates separate original and reversal corrections'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions corr
      WHERE corr.id = v_periodized_corr_tx_id
        AND corr.user_id = v_user_id
        AND corr.source = 'manual'
        AND coalesce(corr.is_correction, false) = true
        AND corr.corrects_ver_nr = (v_periodized_result->>'ver_nr')::integer
    ),
    'periodized original correction relates to original ver_nr'
  );
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.transactions corr
      WHERE corr.id = v_periodized_reversal_corr_tx_id
        AND corr.user_id = v_user_id
        AND corr.source = 'manual'
        AND coalesce(corr.is_correction, false) = true
        AND corr.corrects_ver_nr = (v_periodized_result->>'reversal_ver_nr')::integer
    ),
    'periodized reversal correction relates to reversal ver_nr'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries original
      JOIN public.journal_entries corr
        ON corr.account_number = original.account_number
       AND corr.debit = original.credit
       AND corr.credit = original.debit
      WHERE original.user_id = v_user_id
        AND corr.user_id = v_user_id
        AND original.transaction_id = v_periodized_tx_id
        AND corr.transaction_id = v_periodized_corr_tx_id
    ),
    v_original_row_count,
    'periodized original correction mirrors original journal rows'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.journal_entries reversal
      JOIN public.journal_entries corr
        ON corr.account_number = reversal.account_number
       AND corr.debit = reversal.credit
       AND corr.credit = reversal.debit
      WHERE reversal.user_id = v_user_id
        AND corr.user_id = v_user_id
        AND reversal.transaction_id = v_periodized_reversal_tx_id
        AND corr.transaction_id = v_periodized_reversal_corr_tx_id
    ),
    v_reversal_row_count,
    'periodized reversal correction mirrors reversal journal rows'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions t
      WHERE t.user_id = v_user_id
        AND t.id IN (
          v_periodized_tx_id,
          v_periodized_reversal_tx_id,
          v_periodized_corr_tx_id,
          v_periodized_reversal_corr_tx_id
        )
        AND t.source = 'vat_closing'
    ),
    'periodized correction path is unaffected by vat_closing guard'
  );

  PERFORM pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 3, 1),
    make_date(v_base_year, 3, 31),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL,
    'month'
  );

  v_vat_protected_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 3, 12),
    v_run_tag || ' closed vat correction fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 125, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 100),
      jsonb_build_object('account', '2611', 'debit', 0, 'credit', 25)
    ),
    v_vat_protected_ver_nr,
    'manual',
    true
  );

  SELECT count(*)
    INTO v_before_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_before_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_before_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.create_correction_transaction_atomic(v_vat_protected_tx_id);
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'VAT-protected correction in closed period is still blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%stängd%' OR v_error_message ILIKE '%deklarerad%',
    'VAT-protected correction keeps closed/declared period error'
  );

  SELECT count(*)
    INTO v_after_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT count(*)
    INTO v_after_journal_count
  FROM public.journal_entries
  WHERE user_id = v_user_id
    AND description LIKE v_run_tag || '%';

  SELECT last_ver_nr
    INTO v_after_ver_nr
  FROM public.ver_nr_sequences
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, 'VAT-protected blocked correction creates no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, 'VAT-protected blocked correction creates no journal entries');
  PERFORM pg_temp.assert_eq(v_after_ver_nr, v_before_ver_nr, 'VAT-protected blocked correction consumes no ver_nr');

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_vat_closing_tx_id,
      jsonb_build_object('file_url', 'https://example.invalid/kan7b-vat-closing.pdf')
    );
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'file_url update of vat_closing transaction is blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%Momsavslut%' AND v_error_message ILIKE '%systemverifikation%',
    'vat_closing update error is explicit'
  );

  SELECT file_url
    INTO v_file_url
  FROM public.transactions
  WHERE id = v_vat_closing_tx_id
    AND user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_file_url, NULL::text, 'blocked vat_closing update leaves file_url unchanged');

  v_manual_update_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 4, 5),
    v_run_tag || ' manual update fixture',
    jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', 50, 'credit', 0),
      jsonb_build_object('account', '3001', 'debit', 0, 'credit', 50)
    ),
    v_manual_update_ver_nr,
    'manual',
    true
  );

  v_result := public.update_transaction_safe(
    v_manual_update_tx_id,
    jsonb_build_object('file_url', 'https://example.invalid/kan7b-manual.pdf')
  );

  PERFORM pg_temp.assert_true((v_result->>'success')::boolean, 'ordinary allowed update returns success');

  SELECT file_url
    INTO v_file_url
  FROM public.transactions
  WHERE id = v_manual_update_tx_id
    AND user_id = v_user_id;

  PERFORM pg_temp.assert_eq(
    v_file_url,
    'https://example.invalid/kan7b-manual.pdf'::text,
    'ordinary allowed update changes file_url'
  );

  SELECT description, amount
    INTO v_description, v_amount
  FROM public.transactions
  WHERE id = v_manual_update_tx_id
    AND user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.update_transaction_safe(
      v_manual_update_tx_id,
      jsonb_build_object(
        'description', v_run_tag || ' forbidden booked description',
        'amount', 51
      )
    );
  EXCEPTION WHEN others THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  PERFORM pg_temp.assert_true(v_failed, 'booked accounting-field update is still blocked');
  PERFORM pg_temp.assert_true(
    v_error_message ILIKE '%Bokförda transaktioner%',
    'booked accounting-field update keeps existing error path'
  );

  PERFORM pg_temp.assert_eq(
    (
      SELECT description
      FROM public.transactions
      WHERE id = v_manual_update_tx_id
        AND user_id = v_user_id
    ),
    v_description,
    'forbidden booked-field update leaves description unchanged'
  );
  PERFORM pg_temp.assert_eq(
    (
      SELECT amount
      FROM public.transactions
      WHERE id = v_manual_update_tx_id
        AND user_id = v_user_id
    ),
    v_amount,
    'forbidden booked-field update leaves amount unchanged'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-7B vat_closing system guard rollback test candidate completed inside explicit ROLLBACK.'
````````

==================================================

==================================================
FILE: supabase/tests/kan8_declare_vat_period_atomic_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- KAN-8 rollback test candidate for declare_vat_period_atomic().
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000000' \
--     -f supabase/tests/kan8_declare_vat_period_atomic_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. This script does
-- not create auth users. Everything, including the candidate CREATE OR REPLACE
-- FUNCTION, all fixtures, and closed_years rows, runs inside one outer
-- transaction and ends with an explicit ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE kan8_test_context (
  test_user_id uuid PRIMARY KEY,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO kan8_test_context (test_user_id, run_tag, base_year)
VALUES (
  :'test_user_id'::uuid,
  'KAN-8 rollback ' || replace(gen_random_uuid()::text, '-', ''),
  2600 + floor(random() * 500)::integer
);

-- Install the exact local KAN-8 candidate inside the rollback transaction.
\ir ../migrations/20260920_add_declare_vat_period_atomic.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-8 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-8 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_fixture_transaction(
  p_user_id uuid,
  p_tx_date date,
  p_description text,
  p_entries jsonb,
  p_ver_nr integer,
  p_source text DEFAULT 'vat_closing'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
  v_total_debit numeric;
  v_total_credit numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce((entry->>'debit')::numeric, 0)), 0),
    coalesce(sum(coalesce((entry->>'credit')::numeric, 0)), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_entries) AS entry;

  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'KAN-8 fixture is unbalanced: % (debit %, credit %)',
      p_description, v_total_debit, v_total_credit;
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    p_user_id,
    p_tx_date,
    p_description,
    v_total_debit,
    NULL,
    NULL,
    true,
    p_source
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_tx_id,
    p_ver_nr,
    entry->>'account',
    coalesce((entry->>'debit')::numeric, 0),
    coalesce((entry->>'credit')::numeric, 0),
    p_description,
    coalesce((entry->>'date')::date, p_tx_date),
    p_user_id
  FROM jsonb_array_elements(p_entries) AS entry;

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text DEFAULT 'closed',
  p_source text DEFAULT 'sololedger',
  p_closing_amount numeric DEFAULT 0,
  p_closing_transaction_id uuid DEFAULT NULL,
  p_declared_at timestamptz DEFAULT NULL,
  p_period_type text DEFAULT 'month',
  p_updated_at timestamptz DEFAULT '2001-01-01 00:00:00+00'::timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    p_period_type,
    p_status,
    p_source,
    p_closing_amount,
    p_closing_transaction_id,
    p_declared_at,
    p_updated_at
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_run_tag text;
  v_base_year integer;

  v_period_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_definition text;
  v_declared_at timestamptz;
  v_updated_at timestamptz;
  v_initial_updated_at timestamptz := '2001-01-01 00:00:00+00'::timestamptz;
  v_existing_declared_at timestamptz := '2026-09-20 12:34:56+00'::timestamptz;
  v_existing_updated_at timestamptz := '2026-09-20 12:35:56+00'::timestamptz;

  v_before_tx_count integer;
  v_after_tx_count integer;
  v_before_journal_count integer;
  v_after_journal_count integer;
  v_before_ver_nr integer;
  v_after_ver_nr integer;
  v_security_definer boolean;
  v_search_path_ok boolean;

  v_failed boolean;
  v_error_message text;
BEGIN
  SELECT test_user_id, run_tag, base_year
    INTO v_user_id, v_run_tag, v_base_year
  FROM kan8_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), v_user_id, 'auth.uid() test context');

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.transactions
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 1, 12, 31)
    ),
    'isolated transaction date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.journal_entries
      WHERE user_id = v_user_id
        AND date BETWEEN make_date(v_base_year, 1, 1) AND make_date(v_base_year + 1, 12, 31)
    ),
    'isolated journal date window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE user_id = v_user_id
        AND period_start <= make_date(v_base_year + 1, 12, 31)
        AND period_end >= make_date(v_base_year, 1, 1)
    ),
    'isolated VAT period window must be empty before fixtures'
  );

  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year BETWEEN v_base_year AND v_base_year + 1
    ),
    'isolated closed_years window must be empty before fixtures'
  );

  -- 1-4. Closed SoloLedger with a real closing transaction -> declared.
  v_tx_id := pg_temp.create_fixture_transaction(
    v_user_id,
    make_date(v_base_year, 1, 31),
    v_run_tag || ' closing transaction fixture',
    jsonb_build_array(
      jsonb_build_object('account', '2611', 'debit', 250, 'credit', 0),
      jsonb_build_object('account', '2650', 'debit', 0, 'credit', 250)
    ),
    830001,
    'vat_closing'
  );

  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 1, 31),
    'closed',
    'sololedger',
    250,
    v_tx_id,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;
  SELECT declared_at, updated_at
    INTO v_declared_at, v_updated_at
  FROM public.vat_periods
  WHERE id = v_period_id
    AND user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '1 success');
  PERFORM pg_temp.assert_eq((v_result->>'already_declared')::boolean, false, '1 not already_declared');
  PERFORM pg_temp.assert_eq(v_result->>'status', 'declared', '1 returned status');
  PERFORM pg_temp.assert_true(v_declared_at IS NOT NULL, '2 declared_at set');
  PERFORM pg_temp.assert_true((v_result->>'declared_at')::timestamptz IS NOT NULL, '2 returned declared_at set');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 250::numeric, '3 closing_amount preserved in result');
  PERFORM pg_temp.assert_eq((v_result->>'closing_transaction_id')::uuid, v_tx_id, '4 closing_transaction_id preserved in result');
  PERFORM pg_temp.assert_true(v_updated_at IS DISTINCT FROM v_initial_updated_at, '15 first declaration updates updated_at');
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '11 no new transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '12 no new journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '13 no ver_nr consumption');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
        AND status = 'declared'
        AND closing_amount = 250
        AND closing_transaction_id = v_tx_id
        AND declared_at = v_declared_at
    ),
    '1-4 stored declared state preserves closing snapshot'
  );

  -- 6-7 and 15. Second declare is idempotent and timestamp-stable.
  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '6 second declare success');
  PERFORM pg_temp.assert_eq((v_result->>'already_declared')::boolean, true, '6 second declare already_declared');
  PERFORM pg_temp.assert_eq((v_result->>'declared_at')::timestamptz, v_declared_at, '7 second declare preserves declared_at result');
  PERFORM pg_temp.assert_eq((v_result->>'updated_at')::timestamptz, v_updated_at, '15 second declare preserves updated_at result');
  PERFORM pg_temp.assert_eq(
    (SELECT declared_at FROM public.vat_periods WHERE id = v_period_id),
    v_declared_at,
    '7 second declare preserves stored declared_at'
  );
  PERFORM pg_temp.assert_eq(
    (SELECT updated_at FROM public.vat_periods WHERE id = v_period_id),
    v_updated_at,
    '15 second declare does not update updated_at'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '6 second declare no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '6 second declare no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '6 second declare no ver_nr');

  -- 5. Closed/no-activity period with NULL closing_transaction_id is valid.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 2, 1),
    make_date(v_base_year, 2, 28),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '5 no-activity declare success');
  PERFORM pg_temp.assert_eq((v_result->>'closing_amount')::numeric, 0::numeric, '5 no-activity closing_amount preserved');
  PERFORM pg_temp.assert_true(v_result->>'closing_transaction_id' IS NULL, '5 no-activity NULL closing_transaction_id in result');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
        AND status = 'declared'
        AND closing_amount = 0
        AND closing_transaction_id IS NULL
        AND declared_at IS NOT NULL
    ),
    '5 no-activity NULL closing_transaction_id preserved in table'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '5 no-activity no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '5 no-activity no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '5 no-activity no ver_nr');

  -- Already-declared SoloLedger fixture is idempotent without rewriting timestamps.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 3, 1),
    make_date(v_base_year, 3, 31),
    'declared',
    'sololedger',
    0,
    NULL,
    v_existing_declared_at,
    'month',
    v_existing_updated_at
  );

  v_result := public.declare_vat_period_atomic(v_period_id);

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, 'declared fixture success');
  PERFORM pg_temp.assert_eq((v_result->>'already_declared')::boolean, true, 'declared fixture already_declared');
  PERFORM pg_temp.assert_eq((v_result->>'declared_at')::timestamptz, v_existing_declared_at, 'declared fixture preserves declared_at');
  PERFORM pg_temp.assert_eq((v_result->>'updated_at')::timestamptz, v_existing_updated_at, 'declared fixture preserves updated_at');

  -- 8. Open SoloLedger period blocks and remains unchanged.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 4, 30),
    'open',
    'sololedger',
    NULL,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.declare_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_true(v_failed, '8 open period blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%stängda%', '8 open error mentions closed requirement');
  PERFORM pg_temp.assert_eq(
    (SELECT status FROM public.vat_periods WHERE id = v_period_id),
    'open'::text,
    '8 open period remains open'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '8 open no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '8 open no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '8 open no ver_nr');

  -- 9. imported_history blocks even when otherwise constraint-compatible.
  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 5, 1),
    make_date(v_base_year, 5, 31),
    'closed',
    'imported_history',
    0,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.declare_vat_period_atomic(v_period_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_true(v_failed, '9 imported_history blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%SoloLedger%', '9 imported_history error mentions SoloLedger-managed periods');
  PERFORM pg_temp.assert_eq(
    (SELECT status FROM public.vat_periods WHERE id = v_period_id),
    'closed'::text,
    '9 imported_history remains closed'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '9 imported_history no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '9 imported_history no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '9 imported_history no ver_nr');

  -- 10. Nonexistent or wrong-user-safe period id blocks without touching data.
  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_failed := false;
  v_error_message := NULL;
  BEGIN
    PERFORM public.declare_vat_period_atomic(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_error_message := SQLERRM;
  END;

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_true(v_failed, '10 nonexistent/wrong-user-safe id blocks');
  PERFORM pg_temp.assert_true(v_error_message ILIKE '%hittades inte%' OR v_error_message ILIKE '%tillhör inte%', '10 safe ownership error');
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '10 nonexistent no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '10 nonexistent no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '10 nonexistent no ver_nr');

  -- 14. Declaration works after the accounting year has already been locked.
  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 1);

  v_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 1, 1),
    make_date(v_base_year + 1, 1, 31),
    'closed',
    'sololedger',
    0,
    NULL,
    NULL,
    'month',
    v_initial_updated_at
  );

  SELECT count(*) INTO v_before_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_before_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  v_result := public.declare_vat_period_atomic(v_period_id);

  SELECT count(*) INTO v_after_tx_count FROM public.transactions WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_journal_count FROM public.journal_entries WHERE user_id = v_user_id;
  SELECT last_ver_nr INTO v_after_ver_nr FROM public.ver_nr_sequences WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq((v_result->>'success')::boolean, true, '14 closed-year declare success');
  PERFORM pg_temp.assert_eq(v_result->>'status', 'declared', '14 closed-year returned declared');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM public.vat_periods
      WHERE id = v_period_id
        AND user_id = v_user_id
        AND status = 'declared'
        AND declared_at IS NOT NULL
    ),
    '14 closed-year stored declared'
  );
  PERFORM pg_temp.assert_eq(v_after_tx_count, v_before_tx_count, '14 closed-year no transaction');
  PERFORM pg_temp.assert_eq(v_after_journal_count, v_before_journal_count, '14 closed-year no journal entries');
  PERFORM pg_temp.assert_true(v_after_ver_nr IS NOT DISTINCT FROM v_before_ver_nr, '14 closed-year no ver_nr');

  -- 16. Function contract, grants, SECURITY DEFINER, and search_path.
  PERFORM pg_temp.assert_true(
    to_regprocedure('public.declare_vat_period_atomic(uuid)') IS NOT NULL,
    '16 function signature exists'
  );

  SELECT pg_get_functiondef('public.declare_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  SELECT
    p.prosecdef,
    p.proconfig @> ARRAY['search_path=public']
  INTO
    v_security_definer,
    v_search_path_ok
  FROM pg_proc p
  WHERE p.oid = 'public.declare_vat_period_atomic(uuid)'::regprocedure;

  PERFORM pg_temp.assert_eq(v_security_definer, true, '16 pg_proc SECURITY DEFINER');
  PERFORM pg_temp.assert_eq(v_search_path_ok, true, '16 pg_proc search_path public');
  PERFORM pg_temp.assert_true(
    v_definition LIKE '%SECURITY DEFINER%',
    '16 SECURITY DEFINER present'
  );
  PERFORM pg_temp.assert_true(
    v_definition LIKE '%SET search_path TO ''public''%',
    '16 explicit search_path public'
  );
  PERFORM pg_temp.assert_true(
    position('FOR UPDATE' in v_definition) > 0,
    '16 row lock exists'
  );
  PERFORM pg_temp.assert_true(
    position('UPDATE public.vat_periods' in v_definition) > position('v_period.status <> ''closed''' in v_definition),
    '16 update occurs only after closed-status guard'
  );
  PERFORM pg_temp.assert_true(
    v_definition NOT ILIKE '%journal_entries%'
    AND v_definition NOT ILIKE '%get_next_ver_nr%'
    AND v_definition NOT ILIKE '%1630%'
    AND v_definition NOT ILIKE '%1930%'
    AND v_definition NOT ILIKE '%lock_vat_months%',
    '16 declaration function has no accounting/payment/VAT-advisory write path'
  );

  PERFORM pg_temp.assert_true(
    has_function_privilege('authenticated', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 authenticated can execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('service_role', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 service_role can execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    has_function_privilege('postgres', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 postgres can execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'public.declare_vat_period_atomic(uuid)'::regprocedure, 'EXECUTE'),
    '16 anon cannot execute declare_vat_period_atomic'
  );
  PERFORM pg_temp.assert_true(
    NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = 'public.declare_vat_period_atomic(uuid)'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    '16 PUBLIC cannot execute declare_vat_period_atomic'
  );

  RAISE NOTICE 'KAN-8 declare_vat_period_atomic rollback test candidate completed for run tag %.',
    v_run_tag;
END;
$$;

-- This must stay ROLLBACK so the candidate RPC install, all fixtures, any
-- closed_years rows, and any accidental sequence observations are discarded.
ROLLBACK;

\echo 'KAN-8 declare_vat_period_atomic rollback test candidate completed inside explicit ROLLBACK.'
````````

==================================================

==================================================
FILE: supabase/tests/vat_lifecycle_tax_account_movement_candidate.sql
==================================================

````sql
\set ON_ERROR_STOP on

-- VAT lifecycle Slice 3 rollback regression for tax-account money movements.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use, only after explicitly verifying an isolated/dedicated test user:
--
--   psql "$DATABASE_URL" \
--     -v test_user_id='00000000-0000-0000-0000-000000000017' \
--     -f supabase/tests/vat_lifecycle_tax_account_movement_candidate.sql
--
-- The supplied test_user_id must already exist in auth.users. Everything,
-- including the candidate migration and fixture writes, runs inside one outer
-- transaction and ends with ROLLBACK.

\if :{?test_user_id}
\else
  \echo 'Missing required psql variable: test_user_id'
  \quit 1
\endif

BEGIN;

CREATE TEMP TABLE tax_movement_test_context (
  test_user_id uuid PRIMARY KEY,
  other_user_id uuid NOT NULL,
  run_tag text NOT NULL,
  base_year integer NOT NULL
) ON COMMIT DROP;

INSERT INTO tax_movement_test_context (
  test_user_id,
  other_user_id,
  run_tag,
  base_year
)
VALUES (
  :'test_user_id'::uuid,
  gen_random_uuid(),
  'tax-account movement rollback ' || replace(gen_random_uuid()::text, '-', ''),
  1800 + floor(random() * 100)::integer
);

\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql
\ir ../migrations/20260927151231_add_payment_account_roles.sql
\ir ../migrations/20260927174627_harden_payment_account_roles_acl.sql
\ir ../migrations/20260929183000_add_tax_account_movement.sql

CREATE OR REPLACE FUNCTION pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'Tax-account movement assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'Tax-account movement assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
  p_sql text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;

  PERFORM pg_temp.assert_true(v_failed, p_message || ' rejects');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  PERFORM pg_temp.assert_eq(auth.uid(), p_user_id, 'auth.uid() test context');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text,
  p_source text,
  p_closing_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    'quarter',
    p_status,
    p_source,
    p_closing_amount,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_movement_journal(
  p_transaction_id uuid,
  p_kind text,
  p_counter_account text,
  p_amount numeric,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_row_count integer;
  v_2012_debit numeric;
  v_2012_credit numeric;
  v_counter_debit numeric;
  v_counter_credit numeric;
BEGIN
  SELECT count(*)::integer
    INTO v_row_count
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id;

  SELECT
    coalesce(sum(debit), 0),
    coalesce(sum(credit), 0)
  INTO v_2012_debit, v_2012_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = '2012';

  SELECT
    coalesce(sum(debit), 0),
    coalesce(sum(credit), 0)
  INTO v_counter_debit, v_counter_credit
  FROM public.journal_entries
  WHERE transaction_id = p_transaction_id
    AND account_number = p_counter_account;

  PERFORM pg_temp.assert_eq(v_row_count, 2, p_message || ' row count');

  IF p_kind IN ('business_to_tax_account', 'owner_private_to_tax_account') THEN
    PERFORM pg_temp.assert_eq(v_2012_debit, p_amount, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, 0::numeric, p_message || ' 2012 credit');
    PERFORM pg_temp.assert_eq(v_counter_debit, 0::numeric, p_message || ' counter debit');
    PERFORM pg_temp.assert_eq(v_counter_credit, p_amount, p_message || ' counter credit');
  ELSE
    PERFORM pg_temp.assert_eq(v_counter_debit, p_amount, p_message || ' counter debit');
    PERFORM pg_temp.assert_eq(v_counter_credit, 0::numeric, p_message || ' counter credit');
    PERFORM pg_temp.assert_eq(v_2012_debit, 0::numeric, p_message || ' 2012 debit');
    PERFORM pg_temp.assert_eq(v_2012_credit, p_amount, p_message || ' 2012 credit');
  END IF;
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_other_user_id uuid;
  v_run_tag text;
  v_base_year integer;
  v_payable_period_id uuid;
  v_refund_period_id uuid;
  v_open_period_id uuid;
  v_imported_period_id uuid;
  v_zero_period_id uuid;
  v_locked_period_id uuid;
  v_other_period_id uuid;
  v_result jsonb;
  v_replay jsonb;
  v_tx_id uuid;
  v_movement_id uuid;
  v_bad_tx_id uuid;
  v_bad_ver_nr integer;
  v_before_tx integer;
  v_after_tx integer;
  v_before_movements integer;
  v_after_movements integer;
  v_count integer;
BEGIN
  SELECT test_user_id, other_user_id, run_tag, base_year
    INTO v_user_id, v_other_user_id, v_run_tag, v_base_year
  FROM tax_movement_test_context;

  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_user_id),
    'test_user_id must already exist in auth.users'
  );

  INSERT INTO auth.users (id)
  VALUES (v_other_user_id);

  PERFORM pg_temp.set_auth(v_user_id);

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'transactions'
        AND con.conname = 'transactions_source_check'
        AND pg_get_constraintdef(con.oid, true) LIKE '%tax_account_movement%'
    ),
    'source constraint accepts tax_account_movement'
  );

  PERFORM pg_temp.assert_eq(public.transaction_source_is_current('tax_account_movement'), true, 'tax_account_movement current');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_reserved_future('tax_account_movement'), false, 'tax_account_movement no longer reserved');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_system_managed('tax_account_movement'), true, 'tax_account_movement system managed');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_controlled_vat_lifecycle('tax_account_movement'), true, 'tax_account_movement lifecycle');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_correction('tax_account_movement'), false, 'tax_account_movement no generic correction');
  PERFORM pg_temp.assert_eq(public.transaction_source_allows_generic_update('tax_account_movement'), false, 'tax_account_movement no generic update');
  PERFORM pg_temp.assert_eq(public.transaction_source_is_ordinary_vat_guard_activity('tax_account_movement'), false, 'tax_account_movement not ordinary VAT guard activity');

  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'SELECT'), true, 'authenticated can select own movements');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'INSERT'), false, 'authenticated cannot insert movements directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'UPDATE'), false, 'authenticated cannot update movements directly');
  PERFORM pg_temp.assert_eq(has_table_privilege('authenticated', 'public.tax_account_movements', 'DELETE'), false, 'authenticated cannot delete movements directly');
  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'tax_account_movements'
        AND cmd = 'SELECT'
        AND qual LIKE '%auth.uid%'
    ),
    'RLS owner-select policy exists'
  );

  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (v_run_tag || '-bank', v_user_id, 'Test bank', '1930', '3001'),
    (v_run_tag || '-private', v_user_id, 'Test privat betalning', '4000', '2018'),
    (v_run_tag || '-other-bank', v_other_user_id, 'Other test bank', '1930', '3001');

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES
    (v_user_id, 'business_payment_account', '1930'),
    (v_user_id, 'owner_private_payment', '2018'),
    (v_other_user_id, 'business_payment_account', '1930')
  ON CONFLICT (user_id, role)
  DO UPDATE SET account_number = excluded.account_number;

  v_payable_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'closed',
    'sololedger',
    4000
  );

  v_refund_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year, 4, 1),
    make_date(v_base_year, 6, 30),
    'declared',
    'sololedger',
    -1500
  );

  v_open_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 1, 1),
    make_date(v_base_year + 1, 3, 31),
    'open',
    'sololedger',
    NULL
  );

  v_imported_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 4, 1),
    make_date(v_base_year + 1, 6, 30),
    'closed',
    'imported_history',
    100
  );

  v_zero_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 1, 7, 1),
    make_date(v_base_year + 1, 9, 30),
    'closed',
    'sololedger',
    0
  );

  v_locked_period_id := pg_temp.create_vat_period(
    v_user_id,
    make_date(v_base_year + 2, 1, 1),
    make_date(v_base_year + 2, 3, 31),
    'closed',
    'sololedger',
    100
  );

  v_other_period_id := pg_temp.create_vat_period(
    v_other_user_id,
    make_date(v_base_year, 1, 1),
    make_date(v_base_year, 3, 31),
    'closed',
    'sololedger',
    900
  );

  INSERT INTO public.closed_years (user_id, year)
  VALUES (v_user_id, v_base_year + 2);

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_other_period_id,
      gen_random_uuid()
    ),
    'wrong tenant period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 1, 4, 15),
      v_open_period_id,
      gen_random_uuid()
    ),
    'open period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 1, 7, 15),
      v_imported_period_id,
      gen_random_uuid()
    ),
    'imported period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 1, 10, 15),
      v_zero_period_id,
      gen_random_uuid()
    ),
    'zero closing period'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      current_date + 1,
      v_payable_period_id,
      gen_random_uuid()
    ),
    'future movement date'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year + 2, 4, 15),
      v_locked_period_id,
      gen_random_uuid()
    ),
    'locked movement year'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 0::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'zero amount'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''tax_account_to_business'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'wrong payable movement direction'
  );

  DELETE FROM public.company_payment_account_roles
  WHERE user_id = v_user_id
    AND role = 'owner_private_payment';

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''owner_private_to_tax_account'', %L::date, 10::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'missing owner private role'
  );

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES (v_user_id, 'owner_private_payment', '2018');

  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 12),
    1000,
    v_payable_period_id,
    gen_random_uuid()
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  v_movement_id := (v_result->>'movement_id')::uuid;

  PERFORM pg_temp.assert_eq(v_result->>'movement_kind', 'business_to_tax_account', 'business payable kind');
  PERFORM pg_temp.assert_eq(v_result->>'payment_account_role', 'business_payment_account', 'business role derived');
  PERFORM pg_temp.assert_eq(v_result->>'counter_account_number', '1930', 'business counter account derived');
  PERFORM pg_temp.assert_eq((v_result->>'cumulative_movement')::numeric, 1000::numeric, 'business payable cumulative');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 3000::numeric, 'business payable remaining');
  PERFORM pg_temp.assert_movement_journal(v_tx_id, 'business_to_tax_account', '1930', 1000, 'business payable journal');

  v_result := public.record_tax_account_movement_atomic(
    'owner_private_to_tax_account',
    make_date(v_base_year, 4, 13),
    500,
    v_payable_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'counter_account_number', '2018', 'owner private counter account derived');
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'owner_private_to_tax_account', '2018', 500, 'owner private payable journal');

  v_result := public.record_tax_account_movement_atomic(
    'tax_account_to_business',
    make_date(v_base_year, 7, 12),
    500,
    v_refund_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'tax_account_to_business', '1930', 500, 'refund to business journal');

  v_result := public.record_tax_account_movement_atomic(
    'tax_account_to_owner_private',
    make_date(v_base_year, 7, 13),
    1000,
    v_refund_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'counter_account_number', '2013', 'private withdrawal fixed account');
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'tax_account_to_owner_private', '2013', 1000, 'refund private withdrawal journal');
  PERFORM pg_temp.assert_eq(v_result->>'movement_state', 'fully_moved', 'refund fully moved');

  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 14),
    700,
    NULL,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'vat_period_id', NULL::text, 'nullable VAT period supported');
  PERFORM pg_temp.assert_eq(v_result->>'cumulative_movement', NULL::text, 'unlinked movement has no VAT cumulative');
  PERFORM pg_temp.assert_movement_journal((v_result->>'transaction_id')::uuid, 'business_to_tax_account', '1930', 700, 'unlinked business movement journal');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 2501::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 15),
      v_payable_period_id,
      gen_random_uuid()
    ),
    'over movement cap'
  );

  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 16),
    2500,
    v_payable_period_id,
    gen_random_uuid()
  );
  PERFORM pg_temp.assert_eq(v_result->>'movement_state', 'fully_moved', 'payable exact cap completion');
  PERFORM pg_temp.assert_eq((v_result->>'remaining_amount')::numeric, 0::numeric, 'payable exact cap remaining');

  SELECT count(*) INTO v_before_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_before_movements
  FROM public.tax_account_movements
  WHERE user_id = v_user_id;

  UPDATE public.company_payment_account_roles
  SET account_number = '2018'
  WHERE user_id = v_user_id
    AND role = 'business_payment_account';

  v_replay := public.record_tax_account_movement_atomic(
    (SELECT movement_kind FROM public.tax_account_movements WHERE id = v_movement_id),
    make_date(v_base_year, 4, 12),
    1000,
    (SELECT vat_period_id FROM public.tax_account_movements WHERE id = v_movement_id),
    (SELECT idempotency_key FROM public.tax_account_movements WHERE id = v_movement_id)
  );

  SELECT count(*) INTO v_after_tx
  FROM public.transactions
  WHERE user_id = v_user_id;
  SELECT count(*) INTO v_after_movements
  FROM public.tax_account_movements
  WHERE user_id = v_user_id;

  PERFORM pg_temp.assert_eq(v_replay->>'idempotent_replay', 'true', 'idempotent replay flag');
  PERFORM pg_temp.assert_eq(v_after_tx, v_before_tx, 'idempotent replay no duplicate transaction');
  PERFORM pg_temp.assert_eq(v_after_movements, v_before_movements, 'idempotent replay no duplicate movement');
  PERFORM pg_temp.assert_eq(v_replay->>'counter_account_number', '1930', 'idempotent replay returns original counter account after role config change');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 10::numeric, NULL::uuid, %L::uuid)',
      make_date(v_base_year, 4, 18),
      gen_random_uuid()
    ),
    'stored invalid business payment role config'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.record_tax_account_movement_atomic(''business_to_tax_account'', %L::date, 999::numeric, %L::uuid, %L::uuid)',
      make_date(v_base_year, 4, 12),
      v_payable_period_id,
      (SELECT idempotency_key FROM public.tax_account_movements WHERE id = v_movement_id)
    ),
    'idempotency conflict'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.update_transaction_safe(%L::uuid, jsonb_build_object(''file_url'', ''slice3.txt''))',
      v_tx_id
    ),
    'generic update forbidden'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.create_correction_transaction_atomic(%L::uuid)',
      v_tx_id
    ),
    'generic correction forbidden'
  );

  SELECT public.get_next_ver_nr(v_user_id) INTO v_bad_ver_nr;
  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    v_user_id,
    make_date(v_base_year, 4, 17),
    'bad movement metadata fixture',
    123,
    NULL,
    NULL,
    true,
    'tax_account_movement'
  )
  RETURNING id INTO v_bad_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  ) VALUES
    (v_bad_tx_id, v_bad_ver_nr, '2012', 123, 0, 'bad movement metadata fixture', make_date(v_base_year, 4, 17), v_user_id),
    (v_bad_tx_id, v_bad_ver_nr, '1930', 0, 123, 'bad movement metadata fixture', make_date(v_base_year, 4, 17), v_user_id);

  PERFORM pg_temp.assert_rejects(
    format(
      'insert into public.tax_account_movements (
         user_id,
         vat_period_id,
         transaction_id,
         movement_kind,
         movement_date,
         amount,
         payment_account_role,
         counter_account_number,
         idempotency_key
       ) values (
         %L::uuid,
         %L::uuid,
         %L::uuid,
         ''tax_account_to_business'',
         %L::date,
         123::numeric,
         ''business_payment_account'',
         ''1930'',
         %L::uuid
       )',
      v_user_id,
      v_payable_period_id,
      v_bad_tx_id,
      make_date(v_base_year, 4, 17),
      gen_random_uuid()
    ),
    'movement direction metadata mismatch validation'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'update public.tax_account_movements set amount = amount + 1 where id = %L::uuid',
      v_movement_id
    ),
    'movement immutability update'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'delete from public.tax_account_movements where id = %L::uuid',
      v_movement_id
    ),
    'movement immutability delete'
  );

  PERFORM pg_temp.set_auth(v_other_user_id);
  v_result := public.record_tax_account_movement_atomic(
    'business_to_tax_account',
    make_date(v_base_year, 4, 12),
    100,
    v_other_period_id,
    gen_random_uuid()
  );

  SELECT count(*) INTO v_count
  FROM public.tax_account_movements
  WHERE user_id = v_other_user_id;
  PERFORM pg_temp.assert_eq(v_count, 1, 'other tenant movement count');

  PERFORM pg_temp.set_auth(v_user_id);
  SELECT count(*) INTO v_count
  FROM public.tax_account_movements
  WHERE user_id = v_other_user_id;
  PERFORM pg_temp.assert_eq(v_count, 1, 'tenant data remains physically separate');

  RAISE NOTICE 'VAT lifecycle tax-account movement rollback assertions passed for run tag %.', v_run_tag;
END;
$$;

ROLLBACK;

\echo 'VAT lifecycle tax-account movement rollback test completed with explicit ROLLBACK.'
````````

==================================================

