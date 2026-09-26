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
