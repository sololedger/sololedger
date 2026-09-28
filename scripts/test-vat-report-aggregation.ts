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
