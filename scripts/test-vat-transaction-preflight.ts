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

const noDeduction = assertReady(
  preflight({
    profile: {
      ...fullProfile,
      defaultDeductionEntitlement: 'none',
    },
  }),
  'EU service, no supplier VAT, no deduction, 25 percent'
)
assertEqual(
  noDeduction.treatment.outputVat.amount,
  57,
  'No-deduction path -> calculated output VAT'
)
assertEqual(
  noDeduction.treatment.deductibleInputVat.amount,
  0,
  'No-deduction path -> no deductible input VAT'
)
assertEqual(
  noDeduction.treatment.deductibleInputVat.reportField,
  null,
  'No-deduction path -> no field 48'
)
assertEqual(
  noDeduction.treatment.deductibleInputVat.entitlement,
  'none',
  'No-deduction path -> no deduction entitlement'
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
