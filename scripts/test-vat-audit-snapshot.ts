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
