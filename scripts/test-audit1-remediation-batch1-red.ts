import {
  aggregateVatReport,
  type VatReportJournalRowInput,
  type VatReportSnapshotInput,
  type VatReportTransactionInput,
} from '../src/lib/vatReportAggregation.ts'
import {
  isValidPaymentRoleAccountNumberForRole,
} from '../src/lib/accountingKnowledge.ts'
import {
  buildVatV2BookingReadiness,
  resolveVatV2PaymentSourceConfiguration,
} from '../src/lib/vatPaymentSource.ts'
import {
  buildVatV2RuntimeBookingRequest,
} from '../src/lib/vatRuntimeBooking.ts'
import {
  buildVatV2TransactionPreflight,
} from '../src/lib/vatTransactionPreflight.ts'
import type { ConfiguredPaymentAccountRole } from '../src/lib/paymentAccountRoles.ts'
import type { VatReturnField } from '../src/lib/vatDomain.ts'

let passed = 0
let failed = 0

function expectEqual(actual: unknown, expected: unknown, description: string) {
  if (actual === expected) {
    console.log(`PASS ${description}`)
    passed++
    return
  }

  console.error(`FAIL ${description}`)
  console.error(`  Expected future invariant: ${expected}`)
  console.error(`  Current behavior:          ${actual}`)
  failed++
}

function expectBlocked(result: { status: string }, description: string) {
  expectEqual(result.status, 'blocked', description)
}

function expectFalse(actual: boolean, description: string) {
  expectEqual(actual, false, description)
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
  credit: number
): VatReportJournalRowInput {
  return { transactionId, accountNumber, debit, credit, inReportPeriod: true }
}

function supportedVatV2Snapshot(
  transactionId: string
): VatReportSnapshotInput {
  return {
    transactionId,
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
        outputVat: { amount: 57, reportField: '30' },
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

const registeredCompany = {
  domesticSalesVatTreatment: 'taxable',
  vatRegistrationStatus: 'registered',
  foreignPurchaseReporting: 'required',
  vatPeriodType: 'quarter',
  vatReportingFrom: '2026-01-01',
  defaultDeductionEntitlement: 'full',
} as const

function readyPreflight() {
  const result = buildVatV2TransactionPreflight({
    companyProfile: registeredCompany,
    transaction: {
      enabled: true,
      supplierCountry: 'IE',
      goodsOrService: 'service',
      supplierVatCharged: 'no',
      calculationRate: 25,
      acquisitionBaseAmount: '228',
    },
    date: '2026-02-15',
    description: 'EU service purchase',
    accountingCategoryId: 'programvara',
    ordinaryAmount: '228',
  })

  if (result.status !== 'ready') {
    throw new Error('Audit regression fixture expected VAT V2 preflight ready.')
  }

  return result
}

function readyPaymentFrom(
  configuredRoles: readonly ConfiguredPaymentAccountRole[]
) {
  const paymentSource = resolveVatV2PaymentSourceConfiguration(
    'owner_private',
    configuredRoles
  )

  return buildVatV2BookingReadiness({
    treatmentReady: true,
    roleConfigurationState: 'loaded',
    paymentSource,
  })
}

function assertReportField(
  fields: Record<VatReturnField, number>,
  field: VatReturnField,
  expected: number,
  description: string
) {
  expectEqual(fields[field], expected, description)
}

console.log('\n=== Audit #1 Remediation Batch 1 RED Regressions ===\n')

const f1Report = aggregateVatReport({
  transactions: [
    tx('v2-eu-service', 'vat_v2'),
    tx('v2-zero-net-close', 'vat_closing'),
  ],
  journalRows: [
    row('v2-eu-service', '4535', 228, 0),
    row('v2-eu-service', '2645', 57, 0),
    row('v2-eu-service', '2614', 0, 57),
    row('v2-eu-service', '2018', 0, 228),
    row('v2-zero-net-close', '2614', 57, 0),
    row('v2-zero-net-close', '2645', 0, 57),
  ],
  vatV2Snapshots: [supportedVatV2Snapshot('v2-eu-service')],
})

expectEqual(f1Report.status, 'ready', 'F1 fixture produces a report')
if (f1Report.status === 'ready') {
  assertReportField(
    f1Report.report.fields,
    '21',
    228,
    'F1 native VAT V2 field 21 remains authoritative'
  )
  assertReportField(
    f1Report.report.fields,
    '30',
    57,
    'F1 native VAT V2 field 30 remains authoritative'
  )
  assertReportField(
    f1Report.report.fields,
    '48',
    57,
    'F1 controlled vat_closing rows must not change field 48'
  )
  assertReportField(
    f1Report.report.fields,
    '10',
    0,
    'F1 controlled vat_closing rows must not become domestic output VAT'
  )
  assertReportField(
    f1Report.report.fields,
    '05',
    0,
    'F1 controlled vat_closing rows must not invent domestic taxable base'
  )
  assertReportField(
    f1Report.report.fields,
    '49',
    0,
    'F1 zero-net VAT V2 report remains net zero without lifecycle leakage'
  )
}

const invalidVatV2PaymentAccounts = ['2614', '2645', '2650', '2012'] as const
for (const accountNumber of invalidVatV2PaymentAccounts) {
  const readiness = readyPaymentFrom([
    { role: 'owner_private_payment', accountNumber },
  ])
  const runtime = buildVatV2RuntimeBookingRequest({
    assessmentActive: true,
    transactionEvent: 'purchase',
    preflight: readyPreflight(),
    bookingReadiness: readiness,
    date: '2026-02-15',
    description: `EU service paid with ${accountNumber}`,
  })

  expectBlocked(
    runtime,
    `F3 VAT V2 runtime booking rejects semantic non-payment account ${accountNumber}`
  )
}

const legitimatePayment = buildVatV2RuntimeBookingRequest({
  assessmentActive: true,
  transactionEvent: 'purchase',
  preflight: readyPreflight(),
  bookingReadiness: readyPaymentFrom([
    { role: 'owner_private_payment', accountNumber: '2017' },
  ]),
  date: '2026-02-15',
  description: 'EU service paid privately',
})
expectEqual(
  legitimatePayment.status,
  'ready',
  'F3 ordinary owner-private payment account remains usable'
)

for (const accountNumber of ['2650', '2614', '2645', '2012'] as const) {
  expectFalse(
    isValidPaymentRoleAccountNumberForRole(
      'owner_private_payment',
      accountNumber
    ),
    `F4 owner-private payment role rejects semantic non-payment account ${accountNumber}`
  )
}

expectEqual(
  isValidPaymentRoleAccountNumberForRole('owner_private_payment', '2017'),
  true,
  'F4 ordinary owner-private payment role account remains valid'
)

console.log('\n-----------------------------------')
console.log(`Passed checks: ${passed}`)
console.log(`Failed RED checks: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  console.error(
    'Audit #1 Batch 1 RED regressions are intentionally failing until remediation.'
  )
  process.exitCode = 1
} else {
  console.log('Audit #1 Batch 1 RED regressions now pass after remediation.')
}
