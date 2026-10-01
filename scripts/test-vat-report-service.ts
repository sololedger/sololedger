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

assertBlocked(
  {
    transactions: [tx({ id: 'legacy-reverse-charge-shape', source: 'sie_import' })],
    journalRows: [
      row({ transactionId: 'legacy-reverse-charge-shape', accountNumber: '4535', debit: 228 }),
      row({ transactionId: 'legacy-reverse-charge-shape', accountNumber: '2645', debit: 57 }),
      row({ transactionId: 'legacy-reverse-charge-shape', accountNumber: '2614', credit: 57 }),
      row({ transactionId: 'legacy-reverse-charge-shape', accountNumber: '1930', credit: 228 }),
    ],
    vatV2Snapshots: [],
  },
  'aggregation_blocked',
  'legacy_reverse_charge_ambiguous',
  'KAN-32 legacy/SIE reverse-charge-shaped rows'
)

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
