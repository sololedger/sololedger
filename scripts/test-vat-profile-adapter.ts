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
