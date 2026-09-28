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
    'Momsrapporten kan inte beräknas säkert eftersom en VAT V2-verifikation saknar giltigt revisionsunderlag.',
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
