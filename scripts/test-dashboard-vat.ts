import { dashboardVatBreakdownFromReportResult } from '../src/lib/dashboardVat.ts'
import { calculateDashboard } from '../src/lib/calculations.ts'
import {
  calculateVatReportFromLoadedRows,
  type LoadedVatReportRows,
  type VatReportAuditSnapshotRow,
  type VatReportJournalEntryRow,
  type VatReportTransactionRow,
} from '../src/lib/vatReportService.ts'

const USER_ID = 'user-1'
const FULL_YEAR_START = '2026-01-01'
const FULL_YEAR_END = '2026-12-31'

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

function dashboardVat(rows: LoadedVatReportRows) {
  return dashboardVatBreakdownFromReportResult(
    calculateVatReportFromLoadedRows({
      userId: USER_ID,
      startDate: FULL_YEAR_START,
      endDate: FULL_YEAR_END,
      rows,
    })
  )
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
    import_batch_id: null,
    import_batch_status: null,
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

function vatV2Snapshot(input: {
  transactionId: string
  deductionEntitlement: 'full' | 'none'
}): VatReportAuditSnapshotRow {
  const deductibleInputVat = input.deductionEntitlement === 'full' ? 57 : 0
  const deductibleInputVatReportField =
    input.deductionEntitlement === 'full' ? '48' : null

  return {
    user_id: USER_ID,
    transaction_id: input.transactionId,
    created_at: '2026-08-16T10:00:00Z',
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
          amount: deductibleInputVat,
          reportField: deductibleInputVatReportField,
          entitlement: input.deductionEntitlement,
        },
      },
      reconciliation: {
        balanced: true,
        totalDebit: 285,
        totalCredit: 285,
        acquisitionBase: 228,
        outputVat: 57,
        deductibleInputVat,
        paymentPayable: 228,
        acquisitionBaseField: '21',
        outputVatReportField: '30',
        deductibleInputVatReportField,
      },
    },
  }
}

function vatV2Rows(transactionId: string, deductionEntitlement: 'full' | 'none') {
  return deductionEntitlement === 'full'
    ? [
        row({ transactionId, accountNumber: '4535', debit: 228 }),
        row({ transactionId, accountNumber: '2645', debit: 57 }),
        row({ transactionId, accountNumber: '2614', credit: 57 }),
        row({ transactionId, accountNumber: '1930', credit: 228 }),
      ]
    : [
        row({ transactionId, accountNumber: '4535', debit: 228 }),
        row({ transactionId, accountNumber: '4535', debit: 57 }),
        row({ transactionId, accountNumber: '2614', credit: 57 }),
        row({ transactionId, accountNumber: '1930', credit: 228 }),
      ]
}

console.log('\n=== SoloLedger Dashboard VAT Tests ===\n')

const v1Only = dashboardVat({
  transactions: [
    tx({ id: 'v1-sale', date: '2026-02-10' }),
    tx({ id: 'v1-purchase', date: '2026-03-02' }),
  ],
  journalRows: [
    row({ transactionId: 'v1-sale', accountNumber: '2611', credit: 50, date: '2026-02-10' }),
    row({ transactionId: 'v1-purchase', accountNumber: '2641', debit: 20, date: '2026-03-02' }),
  ],
  vatV2Snapshots: [],
})

assertEqual(v1Only.utgaendeMoms, 50, 'CASE A V1-only -> outgoing VAT')
assertEqual(v1Only.ingaendeMoms, 20, 'CASE A V1-only -> deductible input VAT')
assertEqual(v1Only.momsNetto, 30, 'CASE A V1-only -> net VAT')

const v2NoDeduction = dashboardVat({
  transactions: [tx({ id: 'v2-none', source: 'vat_v2' })],
  journalRows: vatV2Rows('v2-none', 'none'),
  vatV2Snapshots: [
    vatV2Snapshot({
      transactionId: 'v2-none',
      deductionEntitlement: 'none',
    }),
  ],
})

assertEqual(v2NoDeduction.utgaendeMoms, 57, 'CASE B VAT V2 no deduction -> outgoing VAT')
assertEqual(v2NoDeduction.ingaendeMoms, 0, 'CASE B VAT V2 no deduction -> deductible input VAT')
assertEqual(v2NoDeduction.momsNetto, 57, 'CASE B VAT V2 no deduction -> payable VAT')

const v2FullDeduction = dashboardVat({
  transactions: [tx({ id: 'v2-full', source: 'vat_v2' })],
  journalRows: vatV2Rows('v2-full', 'full'),
  vatV2Snapshots: [
    vatV2Snapshot({
      transactionId: 'v2-full',
      deductionEntitlement: 'full',
    }),
  ],
})

assertEqual(v2FullDeduction.utgaendeMoms, 57, 'CASE C VAT V2 full deduction -> outgoing VAT')
assertEqual(v2FullDeduction.ingaendeMoms, 57, 'CASE C VAT V2 full deduction -> deductible input VAT')
assertEqual(v2FullDeduction.momsNetto, 0, 'CASE C VAT V2 full deduction -> net VAT')

const mixedFullYear = dashboardVat({
  transactions: [
    tx({ id: 'v1-q1-sale', date: '2026-01-20' }),
    tx({ id: 'v1-q1-purchase', date: '2026-03-01' }),
    tx({ id: 'v2-q3-none', source: 'vat_v2', date: '2026-08-15' }),
  ],
  journalRows: [
    row({ transactionId: 'v1-q1-sale', accountNumber: '2611', credit: 50, date: '2026-01-20' }),
    row({ transactionId: 'v1-q1-purchase', accountNumber: '2641', debit: 20, date: '2026-03-01' }),
    ...vatV2Rows('v2-q3-none', 'none'),
  ],
  vatV2Snapshots: [
    vatV2Snapshot({
      transactionId: 'v2-q3-none',
      deductionEntitlement: 'none',
    }),
  ],
})

assertEqual(mixedFullYear.utgaendeMoms, 107, 'CASE D mixed full-year -> outgoing VAT')
assertEqual(mixedFullYear.ingaendeMoms, 20, 'CASE D mixed full-year -> deductible input VAT')
assertEqual(mixedFullYear.momsNetto, 87, 'CASE D mixed full-year -> payable VAT')

const correctedSafeWithdrawal = calculateDashboard(
  { '1930': 1000 },
  0,
  v2NoDeduction
)

assertEqual(
  correctedSafeWithdrawal.sakertUttag,
  943,
  'CASE E corrected VAT payable reduces safe withdrawal'
)

const blockedVat = dashboardVat({
  transactions: [tx({ id: 'legacy-reverse-charge' })],
  journalRows: [
    row({ transactionId: 'legacy-reverse-charge', accountNumber: '4535', debit: 228 }),
    row({ transactionId: 'legacy-reverse-charge', accountNumber: '2645', debit: 57 }),
    row({ transactionId: 'legacy-reverse-charge', accountNumber: '2614', credit: 57 }),
    row({ transactionId: 'legacy-reverse-charge', accountNumber: '1930', credit: 228 }),
  ],
  vatV2Snapshots: [],
})

assertEqual(blockedVat.manualReviewRequired, true, 'CASE F blocked VAT -> manual review')
assertEqual(blockedVat.momsNetto, 0, 'CASE F blocked VAT -> no invented VAT balance')

const blockedSafeWithdrawal = calculateDashboard(
  { '1930': 1000 },
  0,
  blockedVat
)

assertEqual(
  blockedSafeWithdrawal.sakertUttag,
  0,
  'CASE F blocked VAT -> safe withdrawal not presented as spendable'
)

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('Dashboard VAT tests passed.\n')
}
