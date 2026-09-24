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
  eventKind: 'purchase',
  goodsOrService: 'service',
  supplierCountry: { kind: 'country', code: 'IE' },
  customerCountry: { kind: 'country', code: 'SE' },
  supplierVatCharged: 'no',
  usedForBusiness: 'yes',
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
