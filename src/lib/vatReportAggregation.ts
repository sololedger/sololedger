import type { VatReturnField } from './vatDomain'
import {
  isInputVatAccount,
  isLegacyReverseChargeVatIndicator,
  isLegacyVatInferenceTransaction,
  isOutputVatAccount,
  isSettlementAccount,
  legacyVatRateForAccount,
} from './legacyVatInference.ts'

export const VAT_REPORT_FIELDS = [
  '05',
  '10',
  '11',
  '12',
  '20',
  '21',
  '22',
  '30',
  '31',
  '32',
  '48',
  '49',
  '50',
  '60',
  '61',
  '62',
] as const satisfies readonly VatReturnField[]

export type VatReportFields = Record<VatReturnField, number>

export interface VatReportTransactionInput {
  id: string
  source?: string | null
  importBatchStatus?: string | null
  /**
   * Data loading scopes native VAT V2 report contribution by transaction.date.
   * A VAT V2 transaction outside the selected period may still be present to
   * prove its journal rows cannot fall back to legacy account inference.
   */
  inReportPeriod?: boolean
}

export interface VatReportJournalRowInput {
  transactionId: string
  accountNumber: string
  debit: number
  credit: number
  /**
   * Period and tenant scoping is owned by the data-loading layer. This flag
   * lets that layer pass all 26xx rows for candidate verifications while still
   * marking which row dates belong to the selected report period.
   */
  inReportPeriod: boolean
}

export interface VatReportSnapshotInput {
  transactionId: string
  snapshot: unknown
}

export type VatReportAggregationErrorCode =
  | 'vat_v2_snapshot_missing'
  | 'vat_v2_snapshot_duplicate'
  | 'vat_v2_snapshot_unexpected'
  | 'vat_v2_snapshot_malformed'
  | 'vat_v2_snapshot_unsupported'
  | 'vat_v2_snapshot_inconsistent'
  | 'customer_invoice_vat_unsupported'
  | 'customer_invoice_voucher_inconsistent'
  | 'legacy_reverse_charge_ambiguous'

export interface VatReportAggregationError {
  code: VatReportAggregationErrorCode
  transactionId: string
  message: string
  path?: string
}

export interface VatReportAggregation {
  fields: VatReportFields
  legacy: {
    outputVat25: number
    outputVat12: number
    outputVat6: number
    inputVat: number
    domesticSalesBase25: number
    domesticSalesBase12: number
    domesticSalesBase6: number
    domesticSalesBase: number
  }
  vatV2: {
    nativeTransactionIds: string[]
  }
}

export type VatReportAggregationResult =
  | {
      status: 'ready'
      report: VatReportAggregation
      errors: []
    }
  | {
      status: 'blocked'
      report: null
      errors: VatReportAggregationError[]
    }

type SnapshotObject = Record<string, unknown>

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function isCurrencyAmount(value: number) {
  return Number.isFinite(value) && roundCurrency(value) === value
}

function createEmptyFields(): VatReportFields {
  return VAT_REPORT_FIELDS.reduce((fields, field) => {
    fields[field] = 0
    return fields
  }, {} as VatReportFields)
}

function addField(fields: VatReportFields, field: VatReturnField, amount: number) {
  fields[field] = roundCurrency(fields[field] + amount)
}

function isObject(value: unknown): value is SnapshotObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function child(
  object: SnapshotObject,
  key: string
): SnapshotObject | null {
  const value = object[key]
  return isObject(value) ? value : null
}

function stringValue(object: SnapshotObject, key: string) {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

function booleanValue(object: SnapshotObject, key: string) {
  const value = object[key]
  return typeof value === 'boolean' ? value : null
}

function numberValue(object: SnapshotObject, key: string) {
  const value = object[key]
  return typeof value === 'number' && isCurrencyAmount(value) ? value : null
}

function error(
  code: VatReportAggregationErrorCode,
  transactionId: string,
  message: string,
  path?: string
): VatReportAggregationError {
  return { code, transactionId, message, path }
}

function validateSupportedVatV2Snapshot(
  transactionId: string,
  snapshot: unknown
):
  | {
      status: 'ready'
      contribution: {
        field21: number
        field30: number
        field48: number
      }
    }
  | {
      status: 'blocked'
      errors: VatReportAggregationError[]
    } {
  const errors: VatReportAggregationError[] = []

  if (!isObject(snapshot)) {
    return {
      status: 'blocked',
      errors: [
        error(
          'vat_v2_snapshot_malformed',
          transactionId,
          'VAT V2 audit snapshot must be an object.'
        ),
      ],
    }
  }

  const vat = child(snapshot, 'vat')
  const outputVat = vat ? child(vat, 'outputVat') : null
  const deductibleInputVat = vat ? child(vat, 'deductibleInputVat') : null
  const reconciliation = child(snapshot, 'reconciliation')

  if (stringValue(snapshot, 'schemaVersion') !== 'vat-audit-snapshot-v1') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Unsupported VAT audit snapshot schema version.',
      'schemaVersion'
    ))
  }

  if (stringValue(snapshot, 'journalPlanVersion') !== 'vat-journal-plan-v1') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Unsupported VAT audit snapshot journal-plan version.',
      'journalPlanVersion'
    ))
  }

  if (stringValue(snapshot, 'treatmentCode') !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Unsupported VAT V2 treatment for report aggregation.',
      'treatmentCode'
    ))
  }

  if (!vat || !outputVat || !deductibleInputVat || !reconciliation) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 audit snapshot is missing required VAT or reconciliation evidence.'
    ))
  }

  const taxableBase = vat ? numberValue(vat, 'taxableBase') : null
  const acquisitionBaseField = vat ? stringValue(vat, 'acquisitionBaseField') : null
  const outputVatAmount = outputVat ? numberValue(outputVat, 'amount') : null
  const outputVatReportField = outputVat ? stringValue(outputVat, 'reportField') : null
  const deductibleInputVatAmount = deductibleInputVat
    ? numberValue(deductibleInputVat, 'amount')
    : null
  const deductibleInputVatReportField = deductibleInputVat
    ? stringValue(deductibleInputVat, 'reportField')
    : null
  const deductionEntitlement = deductibleInputVat
    ? stringValue(deductibleInputVat, 'entitlement')
    : null

  if (taxableBase === null || taxableBase <= 0) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 taxable base must be a positive currency amount.',
      'vat.taxableBase'
    ))
  }

  if (acquisitionBaseField !== '21') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports acquisition field 21.',
      'vat.acquisitionBaseField'
    ))
  }

  if (outputVatAmount === null || outputVatAmount < 0) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 output VAT must be a currency amount.',
      'vat.outputVat.amount'
    ))
  }

  if (outputVatReportField !== '30') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports output VAT field 30.',
      'vat.outputVat.reportField'
    ))
  }

  if (deductibleInputVatAmount === null || deductibleInputVatAmount < 0) {
    errors.push(error(
      'vat_v2_snapshot_malformed',
      transactionId,
      'VAT V2 deductible input VAT must be a currency amount.',
      'vat.deductibleInputVat.amount'
    ))
  }

  if (
    deductionEntitlement === 'full' &&
    deductibleInputVatReportField !== '48'
  ) {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports deductible input VAT field 48.',
      'vat.deductibleInputVat.reportField'
    ))
  }

  if (
    deductionEntitlement === 'none' &&
    deductibleInputVatReportField !== null
  ) {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'No-deduction VAT V2 snapshots must not use deductible input VAT field 48.',
      'vat.deductibleInputVat.reportField'
    ))
  }

  if (deductionEntitlement !== 'full' && deductionEntitlement !== 'none') {
    errors.push(error(
      'vat_v2_snapshot_unsupported',
      transactionId,
      'Current VAT V2 report aggregation only supports full or no deduction.',
      'vat.deductibleInputVat.entitlement'
    ))
  }

  if (
    taxableBase !== null &&
    outputVatAmount !== null &&
    outputVatAmount !== roundCurrency(taxableBase * 0.25)
  ) {
    errors.push(error(
      'vat_v2_snapshot_inconsistent',
      transactionId,
      'VAT V2 output VAT does not reconcile to 25 percent of taxable base.',
      'vat.outputVat.amount'
    ))
  }

  if (
    deductionEntitlement === 'full' &&
    outputVatAmount !== null &&
    deductibleInputVatAmount !== null &&
    deductibleInputVatAmount !== outputVatAmount
  ) {
    errors.push(error(
      'vat_v2_snapshot_inconsistent',
      transactionId,
      'Full deduction requires deductible input VAT to equal output VAT.',
      'vat.deductibleInputVat.amount'
    ))
  }

  if (
    deductionEntitlement === 'none' &&
    deductibleInputVatAmount !== null &&
    deductibleInputVatAmount !== 0
  ) {
    errors.push(error(
      'vat_v2_snapshot_inconsistent',
      transactionId,
      'No deduction requires deductible input VAT to be zero.',
      'vat.deductibleInputVat.amount'
    ))
  }

  if (reconciliation) {
    const balanced = booleanValue(reconciliation, 'balanced')
    const reconciledBase = numberValue(reconciliation, 'acquisitionBase')
    const reconciledOutput = numberValue(reconciliation, 'outputVat')
    const reconciledInput = numberValue(reconciliation, 'deductibleInputVat')
    const totalDebit = numberValue(reconciliation, 'totalDebit')
    const totalCredit = numberValue(reconciliation, 'totalCredit')

    if (balanced !== true) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation must be balanced.',
        'reconciliation.balanced'
      ))
    }

    if (reconciledBase !== taxableBase) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation base does not match VAT semantics.',
        'reconciliation.acquisitionBase'
      ))
    }

    if (reconciledOutput !== outputVatAmount) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation output VAT does not match VAT semantics.',
        'reconciliation.outputVat'
      ))
    }

    if (reconciledInput !== deductibleInputVatAmount) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation deductible input VAT does not match VAT semantics.',
        'reconciliation.deductibleInputVat'
      ))
    }

    if (
      stringValue(reconciliation, 'acquisitionBaseField') !== '21' ||
      stringValue(reconciliation, 'outputVatReportField') !== '30' ||
      (
        deductionEntitlement === 'full' &&
        stringValue(reconciliation, 'deductibleInputVatReportField') !== '48'
      ) ||
      (
        deductionEntitlement === 'none' &&
        stringValue(reconciliation, 'deductibleInputVatReportField') !== null
      )
    ) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation report fields do not match supported report fields.',
        'reconciliation'
      ))
    }

    if (
      totalDebit === null ||
      totalCredit === null ||
      totalDebit !== totalCredit
    ) {
      errors.push(error(
        'vat_v2_snapshot_inconsistent',
        transactionId,
        'VAT V2 reconciliation totals must balance.',
        'reconciliation.totalDebit'
      ))
    }
  }

  if (errors.length > 0) {
    return { status: 'blocked', errors }
  }

  return {
    status: 'ready',
    contribution: {
      field21: taxableBase as number,
      field30: outputVatAmount as number,
      field48: deductibleInputVatAmount as number,
    },
  }
}

function finalizeNetVat(fields: VatReportFields) {
  fields['49'] = roundCurrency(
    fields['10'] +
      fields['11'] +
      fields['12'] +
      fields['30'] +
      fields['31'] +
      fields['32'] +
      fields['60'] +
      fields['61'] +
      fields['62'] -
      fields['48']
  )
}

function addDomesticOutputVat(input: {
  accountNumber: string
  amount: number
  totals: {
    outputVat25: number
    outputVat12: number
    outputVat6: number
  }
}) {
  const rate = legacyVatRateForAccount(input.accountNumber)

  if (rate === 25) input.totals.outputVat25 = roundCurrency(input.totals.outputVat25 + input.amount)
  if (rate === 12) input.totals.outputVat12 = roundCurrency(input.totals.outputVat12 + input.amount)
  if (rate === 6) input.totals.outputVat6 = roundCurrency(input.totals.outputVat6 + input.amount)
}

function netCredit(row: VatReportJournalRowInput) {
  return roundCurrency(row.credit - row.debit)
}

function netDebit(row: VatReportJournalRowInput) {
  return roundCurrency(row.debit - row.credit)
}

function sumByAccount(input: {
  rows: VatReportJournalRowInput[]
  accountNumber: string
  direction: 'credit' | 'debit'
}) {
  return roundCurrency(
    input.rows
      .filter(row => row.accountNumber === input.accountNumber)
      .reduce((sum, row) => (
        sum + (input.direction === 'credit' ? netCredit(row) : netDebit(row))
      ), 0)
  )
}

function validateCustomerInvoiceVatRows(
  transactionId: string,
  rows: VatReportJournalRowInput[]
):
  | {
      status: 'ready'
      contribution: {
        accountNumber: string
        outputVat: number
        salesBase: number
      } | null
    }
  | {
      status: 'blocked'
      errors: VatReportAggregationError[]
    } {
  const inPeriodRows = rows.filter(row => row.inReportPeriod)
  const unsupportedRow = inPeriodRows.find(row => (
    isInputVatAccount(row.accountNumber) ||
    isLegacyReverseChargeVatIndicator(row.accountNumber)
  ))

  if (unsupportedRow) {
    return {
      status: 'blocked',
      errors: [
        error(
          'customer_invoice_vat_unsupported',
          transactionId,
          'Customer invoice VAT report aggregation only supports ordinary domestic output VAT rows.',
          unsupportedRow.accountNumber
        ),
      ],
    }
  }

  const outputRows = inPeriodRows.filter(row => isOutputVatAccount(row.accountNumber))
  if (outputRows.length === 0) {
    return { status: 'ready', contribution: null }
  }

  const settlementRow = inPeriodRows.find(row => isSettlementAccount(row.accountNumber))
  if (settlementRow) {
    return {
      status: 'blocked',
      errors: [
        error(
          'customer_invoice_voucher_inconsistent',
          transactionId,
          'Customer invoice VAT rows must not be mixed with VAT settlement account rows.',
          settlementRow.accountNumber
        ),
      ],
    }
  }

  const outputAccounts = Array.from(new Set(outputRows.map(row => row.accountNumber)))
  const outputRates = Array.from(new Set(
    outputAccounts.map(accountNumber => legacyVatRateForAccount(accountNumber))
  ))

  if (
    outputAccounts.length !== 1 ||
    outputRates.length !== 1 ||
    outputRates[0] === null
  ) {
    return {
      status: 'blocked',
      errors: [
        error(
          'customer_invoice_voucher_inconsistent',
          transactionId,
          'Customer invoice VAT rows must use exactly one supported ordinary output VAT account.'
        ),
      ],
    }
  }

  const outputVat = roundCurrency(outputRows.reduce((sum, row) => sum + netCredit(row), 0))
  const rate = outputRates[0]

  if (outputVat === 0 || rate === null) {
    return {
      status: 'blocked',
      errors: [
        error(
          'customer_invoice_voucher_inconsistent',
          transactionId,
          'Customer invoice VAT rows must have a non-zero output VAT amount.'
        ),
      ],
    }
  }

  const salesBase = sumByAccount({
    rows: inPeriodRows,
    accountNumber: '3010',
    direction: 'credit',
  })
  const expectedOutputVat = roundCurrency(salesBase * (rate / 100))
  const expectedGross = roundCurrency(salesBase + outputVat)
  const bankGross = sumByAccount({
    rows: inPeriodRows,
    accountNumber: '1930',
    direction: 'debit',
  })
  const receivableGross = sumByAccount({
    rows: inPeriodRows,
    accountNumber: '1510',
    direction: 'debit',
  })
  const matchingCounterAccounts = [bankGross, receivableGross]
    .filter(amount => amount === expectedGross)
    .length

  if (
    outputVat !== expectedOutputVat ||
    matchingCounterAccounts !== 1 ||
    roundCurrency(bankGross + receivableGross) !== expectedGross
  ) {
    return {
      status: 'blocked',
      errors: [
        error(
          'customer_invoice_voucher_inconsistent',
          transactionId,
          'Customer invoice VAT rows do not reconcile to 3010 and exactly one of 1930 or 1510.'
        ),
      ],
    }
  }

  return {
    status: 'ready',
    contribution: {
      accountNumber: outputAccounts[0],
      outputVat,
      salesBase,
    },
  }
}

export function aggregateVatReport(input: {
  transactions: VatReportTransactionInput[]
  journalRows: VatReportJournalRowInput[]
  vatV2Snapshots: VatReportSnapshotInput[]
}): VatReportAggregationResult {
  const fields = createEmptyFields()
  const errors: VatReportAggregationError[] = []
  const transactionById = new Map(input.transactions.map(tx => [tx.id, tx]))
  const nativeVatV2TransactionIds = new Set(
    input.transactions
      .filter(tx => tx.source === 'vat_v2')
      .map(tx => tx.id)
  )
  const reportVatV2TransactionIds = new Set(
    input.transactions
      .filter(tx => tx.source === 'vat_v2' && tx.inReportPeriod !== false)
      .map(tx => tx.id)
  )
  const snapshotsByTransaction = new Map<string, VatReportSnapshotInput[]>()

  for (const snapshot of input.vatV2Snapshots) {
    const existing = snapshotsByTransaction.get(snapshot.transactionId) ?? []
    existing.push(snapshot)
    snapshotsByTransaction.set(snapshot.transactionId, existing)

    if (transactionById.get(snapshot.transactionId)?.source !== 'vat_v2') {
      errors.push(error(
        'vat_v2_snapshot_unexpected',
        snapshot.transactionId,
        'VAT V2 snapshot input must belong to a native VAT V2 transaction.'
      ))
    }
  }

  for (const transactionId of reportVatV2TransactionIds) {
    const snapshots = snapshotsByTransaction.get(transactionId) ?? []

    if (snapshots.length === 0) {
      errors.push(error(
        'vat_v2_snapshot_missing',
        transactionId,
        'Native VAT V2 transaction is missing an authoritative audit snapshot.'
      ))
      continue
    }

    if (snapshots.length > 1) {
      errors.push(error(
        'vat_v2_snapshot_duplicate',
        transactionId,
        'Native VAT V2 transaction has multiple audit snapshots.'
      ))
      continue
    }

    const validated = validateSupportedVatV2Snapshot(
      transactionId,
      snapshots[0].snapshot
    )

    if (validated.status === 'blocked') {
      errors.push(...validated.errors)
      continue
    }

    addField(fields, '21', validated.contribution.field21)
    addField(fields, '30', validated.contribution.field30)
    addField(fields, '48', validated.contribution.field48)
  }

  const legacyVatInferenceTransactionIds = new Set(
    input.transactions
      .filter(tx => isLegacyVatInferenceTransaction({
        source: tx.source,
        importBatchStatus: tx.importBatchStatus,
      }))
      .map(tx => tx.id)
  )
  const legacyRows = input.journalRows.filter(
    row =>
      legacyVatInferenceTransactionIds.has(row.transactionId) &&
      !nativeVatV2TransactionIds.has(row.transactionId)
  )
  const customerInvoiceTransactionIds = new Set(
    input.transactions
      .filter(tx => tx.source === 'customer_invoice')
      .map(tx => tx.id)
  )
  const customerInvoiceRows = input.journalRows.filter(
    row => customerInvoiceTransactionIds.has(row.transactionId)
  )
  const candidateTransactionIds = new Set(
    legacyRows
      .filter(row => (
        row.inReportPeriod &&
        (isOutputVatAccount(row.accountNumber) || isInputVatAccount(row.accountNumber))
      ))
      .map(row => row.transactionId)
  )
  const customerInvoiceCandidateTransactionIds = new Set(
    customerInvoiceRows
      .filter(row => (
        row.inReportPeriod &&
        (isOutputVatAccount(row.accountNumber) || isInputVatAccount(row.accountNumber))
      ))
      .map(row => row.transactionId)
  )
  const rowsByTransaction = new Map<string, VatReportJournalRowInput[]>()
  const customerInvoiceRowsByTransaction = new Map<string, VatReportJournalRowInput[]>()

  for (const row of legacyRows) {
    if (!candidateTransactionIds.has(row.transactionId)) continue

    const rows = rowsByTransaction.get(row.transactionId) ?? []
    rows.push(row)
    rowsByTransaction.set(row.transactionId, rows)
  }

  for (const row of customerInvoiceRows) {
    if (!customerInvoiceCandidateTransactionIds.has(row.transactionId)) continue

    const rows = customerInvoiceRowsByTransaction.get(row.transactionId) ?? []
    rows.push(row)
    customerInvoiceRowsByTransaction.set(row.transactionId, rows)
  }

  for (const [transactionId, rows] of rowsByTransaction) {
    const ambiguousRow = rows.find(row => (
      row.inReportPeriod &&
      isLegacyReverseChargeVatIndicator(row.accountNumber)
    ))

    if (!ambiguousRow) continue

    errors.push(error(
      'legacy_reverse_charge_ambiguous',
      transactionId,
      'Legacy/manual/SIE VAT rows contain reverse-charge indicators but no authoritative VAT treatment or VAT return base field.',
      ambiguousRow.accountNumber
    ))
  }

  const customerInvoiceContributions: Array<{
    accountNumber: string
    outputVat: number
    salesBase: number
  }> = []

  for (const [transactionId, rows] of customerInvoiceRowsByTransaction) {
    const validated = validateCustomerInvoiceVatRows(transactionId, rows)

    if (validated.status === 'blocked') {
      errors.push(...validated.errors)
      continue
    }

    if (validated.contribution) {
      customerInvoiceContributions.push(validated.contribution)
    }
  }

  if (errors.length > 0) {
    return { status: 'blocked', report: null, errors }
  }

  let outputVat25 = 0
  let outputVat12 = 0
  let outputVat6 = 0
  let inputVat = 0
  let customerInvoiceOutputVat25 = 0
  let customerInvoiceOutputVat12 = 0
  let customerInvoiceOutputVat6 = 0
  let customerInvoiceSalesBase25 = 0
  let customerInvoiceSalesBase12 = 0
  let customerInvoiceSalesBase6 = 0

  for (const rows of rowsByTransaction.values()) {
    if (rows.some(row => isSettlementAccount(row.accountNumber))) {
      continue
    }

    for (const row of rows) {
      if (!row.inReportPeriod) continue

      const netCredit = roundCurrency(row.credit - row.debit)

      if (isOutputVatAccount(row.accountNumber)) {
        const totals = { outputVat25, outputVat12, outputVat6 }
        addDomesticOutputVat({
          accountNumber: row.accountNumber,
          amount: netCredit,
          totals,
        })
        outputVat25 = totals.outputVat25
        outputVat12 = totals.outputVat12
        outputVat6 = totals.outputVat6
      } else if (isInputVatAccount(row.accountNumber)) {
        inputVat = roundCurrency(inputVat - netCredit)
      }
    }
  }

  for (const contribution of customerInvoiceContributions) {
    const totals = { outputVat25, outputVat12, outputVat6 }
    addDomesticOutputVat({
      accountNumber: contribution.accountNumber,
      amount: contribution.outputVat,
      totals,
    })
    outputVat25 = totals.outputVat25
    outputVat12 = totals.outputVat12
    outputVat6 = totals.outputVat6

    const customerVatTotals = {
      outputVat25: customerInvoiceOutputVat25,
      outputVat12: customerInvoiceOutputVat12,
      outputVat6: customerInvoiceOutputVat6,
    }
    addDomesticOutputVat({
      accountNumber: contribution.accountNumber,
      amount: contribution.outputVat,
      totals: customerVatTotals,
    })
    customerInvoiceOutputVat25 = customerVatTotals.outputVat25
    customerInvoiceOutputVat12 = customerVatTotals.outputVat12
    customerInvoiceOutputVat6 = customerVatTotals.outputVat6

    const rate = legacyVatRateForAccount(contribution.accountNumber)
    if (rate === 25) {
      customerInvoiceSalesBase25 = roundCurrency(
        customerInvoiceSalesBase25 + contribution.salesBase
      )
    }
    if (rate === 12) {
      customerInvoiceSalesBase12 = roundCurrency(
        customerInvoiceSalesBase12 + contribution.salesBase
      )
    }
    if (rate === 6) {
      customerInvoiceSalesBase6 = roundCurrency(
        customerInvoiceSalesBase6 + contribution.salesBase
      )
    }
  }

  const domesticSalesBase25 = roundCurrency(
    roundCurrency((outputVat25 - customerInvoiceOutputVat25) / 0.25) +
      customerInvoiceSalesBase25
  )
  const domesticSalesBase12 = roundCurrency(
    roundCurrency((outputVat12 - customerInvoiceOutputVat12) / 0.12) +
      customerInvoiceSalesBase12
  )
  const domesticSalesBase6 = roundCurrency(
    roundCurrency((outputVat6 - customerInvoiceOutputVat6) / 0.06) +
      customerInvoiceSalesBase6
  )
  const domesticSalesBase = roundCurrency(
    domesticSalesBase25 + domesticSalesBase12 + domesticSalesBase6
  )

  addField(fields, '10', outputVat25)
  addField(fields, '11', outputVat12)
  addField(fields, '12', outputVat6)
  addField(fields, '48', inputVat)
  addField(fields, '05', domesticSalesBase)
  finalizeNetVat(fields)

  return {
    status: 'ready',
    report: {
      fields,
      legacy: {
        outputVat25,
        outputVat12,
        outputVat6,
        inputVat,
        domesticSalesBase25,
        domesticSalesBase12,
        domesticSalesBase6,
        domesticSalesBase,
      },
      vatV2: {
        nativeTransactionIds: Array.from(reportVatV2TransactionIds),
      },
    },
    errors: [],
  }
}
