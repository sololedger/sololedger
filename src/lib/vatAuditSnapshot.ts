import type {
  AcquisitionBaseField,
  DeductibleInputVatReportField,
  DeductionEntitlement,
  OutputVatReportField,
  ValidationError,
  ValidationResult,
  VatCalculationRate,
  VatTreatment,
} from './vatDomain'
import type {
  VatJournalPlan,
  VatJournalPlanRow,
  VatJournalPlanRowRole,
} from './vatJournalPlan'
import type { VatV2BusinessFacts } from './vatBusinessFacts'

export const VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION = 'vat-audit-snapshot-v1'
export const VAT_AUDIT_JOURNAL_PLAN_VERSION = 'vat-journal-plan-v1'

export type VatAuditSnapshotBlockCode =
  | 'unsupported_vat_treatment'
  | 'unsupported_calculation_rate'
  | 'unsupported_deduction_entitlement'
  | 'unsupported_report_field'
  | 'invalid_treatment_amount'
  | 'invalid_journal_row'
  | 'inconsistent_evidence'
  | 'inconsistent_journal_plan'
  | 'unbalanced_journal_plan'

export type VatAuditSnapshotPath =
  | 'treatment.code'
  | 'treatment.ruleVersion'
  | 'treatment.factsVersion'
  | 'treatment.calculationRate'
  | 'treatment.taxableBase'
  | 'treatment.acquisitionBaseField'
  | 'treatment.outputVat.amount'
  | 'treatment.outputVat.reportField'
  | 'treatment.deductibleInputVat.amount'
  | 'treatment.deductibleInputVat.reportField'
  | 'treatment.deductibleInputVat.entitlement'
  | 'businessFacts'
  | 'journalPlan.treatmentCode'
  | 'journalPlan.ruleVersion'
  | 'journalPlan.factsVersion'
  | 'journalPlan.journalRows'
  | 'journalPlan.reconciliation'

export type VatAuditSnapshotError = ValidationError<
  VatAuditSnapshotBlockCode,
  VatAuditSnapshotPath
>

export interface VatAuditSnapshotJournalRow {
  readonly role: VatJournalPlanRowRole
  readonly accountNumber: string
  readonly debit: number
  readonly credit: number
}

export interface VatAuditSnapshotVatSemantics {
  readonly taxableBase: number
  readonly calculationRate: VatCalculationRate
  readonly acquisitionBaseField: AcquisitionBaseField
  readonly outputVat: {
    readonly amount: number
    readonly reportField: OutputVatReportField
  }
  readonly deductibleInputVat: {
    readonly amount: number
    readonly reportField: DeductibleInputVatReportField | null
    readonly entitlement: DeductionEntitlement
  }
}

export interface VatAuditSnapshotReconciliation {
  readonly balanced: true
  readonly totalDebit: number
  readonly totalCredit: number
  readonly acquisitionBase: number
  readonly outputVat: number
  readonly deductibleInputVat: number
  readonly paymentPayable: number
  readonly acquisitionBaseField: AcquisitionBaseField
  readonly outputVatReportField: OutputVatReportField
  readonly deductibleInputVatReportField: DeductibleInputVatReportField | null
}

export interface VatAuditSnapshot {
  readonly schemaVersion: typeof VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION
  readonly journalPlanVersion: typeof VAT_AUDIT_JOURNAL_PLAN_VERSION
  readonly treatmentCode: VatTreatment['code']
  readonly ruleVersion: string
  readonly factsVersion: string
  readonly businessFacts?: VatV2BusinessFacts
  readonly vat: VatAuditSnapshotVatSemantics
  readonly journal: {
    readonly rows: readonly VatAuditSnapshotJournalRow[]
  }
  readonly reconciliation: VatAuditSnapshotReconciliation
}

export interface BuildVatAuditSnapshotInput {
  readonly treatment: VatTreatment
  readonly journalPlan: VatJournalPlan
  readonly businessFacts?: VatV2BusinessFacts
}

export type VatAuditSnapshotBuildResult =
  | {
      readonly status: 'ready'
      readonly snapshot: VatAuditSnapshot
      readonly validation: ValidationResult<VatAuditSnapshotError> & {
        readonly valid: true
        readonly errors: []
      }
    }
  | {
      readonly status: 'blocked'
      readonly snapshot: null
      readonly validation: ValidationResult<VatAuditSnapshotError> & {
        readonly valid: false
        readonly errors: VatAuditSnapshotError[]
      }
    }

const FULL_DEDUCTION_REQUIRED_ROLES: readonly VatJournalPlanRowRole[] = [
  'acquisition_base',
  'deductible_calculated_input_vat',
  'calculated_output_vat',
  'payment_payable',
]

const NO_DEDUCTION_REQUIRED_ROLES: readonly VatJournalPlanRowRole[] = [
  'acquisition_base',
  'non_deductible_calculated_vat_cost',
  'calculated_output_vat',
  'payment_payable',
]

const REQUIRED_ROLE_ACCOUNTS = {
  acquisition_base: '4535',
  deductible_calculated_input_vat: '2645',
  non_deductible_calculated_vat_cost: '4535',
  calculated_output_vat: '2614',
} as const

const ROLE_SET = new Set<string>([
  ...FULL_DEDUCTION_REQUIRED_ROLES,
  ...NO_DEDUCTION_REQUIRED_ROLES,
])

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function isCurrencyAmount(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    roundCurrency(value) === value
  )
}

function error(
  code: VatAuditSnapshotBlockCode,
  path: VatAuditSnapshotPath,
  message: string
): VatAuditSnapshotError {
  return { code, path, message }
}

function ready(snapshot: VatAuditSnapshot): VatAuditSnapshotBuildResult {
  return {
    status: 'ready',
    snapshot,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

function blocked(
  errors: VatAuditSnapshotError[]
): VatAuditSnapshotBuildResult {
  return {
    status: 'blocked',
    snapshot: null,
    validation: {
      valid: false,
      errors,
    },
  }
}

function validateSupportedTreatment(
  treatment: VatTreatment
): VatAuditSnapshotError[] {
  const errors: VatAuditSnapshotError[] = []

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(
      error(
        'unsupported_vat_treatment',
        'treatment.code',
        'This audit snapshot slice only supports EU service reverse charge.'
      )
    )
  }

  if (treatment.calculationRate !== 25) {
    errors.push(
      error(
        'unsupported_calculation_rate',
        'treatment.calculationRate',
        'This audit snapshot slice only supports 25 percent VAT.'
      )
    )
  }

  if (
    treatment.deductibleInputVat.entitlement !== 'full' &&
    treatment.deductibleInputVat.entitlement !== 'none'
  ) {
    errors.push(
      error(
        'unsupported_deduction_entitlement',
        'treatment.deductibleInputVat.entitlement',
        'This audit snapshot slice only supports full or no deduction.'
      )
    )
  }

  if (treatment.acquisitionBaseField !== '21') {
    errors.push(
      error(
        'unsupported_report_field',
        'treatment.acquisitionBaseField',
        'EU service reverse charge must use acquisition base field 21.'
      )
    )
  }

  if (treatment.outputVat.reportField !== '30') {
    errors.push(
      error(
        'unsupported_report_field',
        'treatment.outputVat.reportField',
        '25 percent reverse-charge output VAT must use report field 30.'
      )
    )
  }

  if (
    treatment.deductibleInputVat.entitlement === 'full' &&
    treatment.deductibleInputVat.reportField !== '48'
  ) {
    errors.push(
      error(
        'unsupported_report_field',
        'treatment.deductibleInputVat.reportField',
        'Full deduction must use deductible input VAT report field 48.'
      )
    )
  }

  if (
    treatment.deductibleInputVat.entitlement === 'none' &&
    treatment.deductibleInputVat.reportField !== null
  ) {
    errors.push(
      error(
        'unsupported_report_field',
        'treatment.deductibleInputVat.reportField',
        'No deduction must not use deductible input VAT report field 48.'
      )
    )
  }

  const amountChecks: Array<[
    number,
    VatAuditSnapshotPath,
    string,
  ]> = [
    [treatment.taxableBase, 'treatment.taxableBase', 'Taxable base'],
    [treatment.outputVat.amount, 'treatment.outputVat.amount', 'Output VAT'],
    [
      treatment.deductibleInputVat.amount,
      'treatment.deductibleInputVat.amount',
      'Deductible input VAT',
    ],
  ]

  for (const [value, path, label] of amountChecks) {
    if (!isCurrencyAmount(value)) {
      errors.push(
        error(
          'invalid_treatment_amount',
          path,
          `${label} must be a finite non-negative currency amount.`
        )
      )
    }
  }

  return errors
}

function sumRows(
  rows: readonly VatJournalPlanRow[],
  role: VatJournalPlanRowRole,
  side: 'debit' | 'credit'
) {
  return roundCurrency(
    rows
      .filter(row => row.role === role)
      .reduce((sum, row) => sum + row[side], 0)
  )
}

function validateJournalRows(
  journalRows: readonly VatJournalPlanRow[],
  requiredRoles: readonly VatJournalPlanRowRole[]
): VatAuditSnapshotError[] {
  const errors: VatAuditSnapshotError[] = []

  if (journalRows.length !== requiredRoles.length) {
    errors.push(
      error(
        'invalid_journal_row',
        'journalPlan.journalRows',
        'Journal snapshot evidence must contain exactly one row per supported semantic role.'
      )
    )
  }

  for (const role of requiredRoles) {
    const count = journalRows.filter(row => row.role === role).length
    if (count !== 1) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          `Journal snapshot evidence must contain exactly one ${role} row.`
        )
      )
    }
  }

  for (const row of journalRows) {
    if (!ROLE_SET.has(row.role)) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence contains an unsupported semantic role.'
        )
      )
    }

    if (!/^[1-9]\d{3}$/.test(row.accountNumber)) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence contains an invalid account number.'
        )
      )
    }

    if (
      row.role in REQUIRED_ROLE_ACCOUNTS &&
      row.accountNumber !== REQUIRED_ROLE_ACCOUNTS[
        row.role as keyof typeof REQUIRED_ROLE_ACCOUNTS
      ]
    ) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence uses an unsupported account for its semantic role.'
        )
      )
    }

    if (!isCurrencyAmount(row.debit) || !isCurrencyAmount(row.credit)) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'Journal snapshot evidence must use finite non-negative currency amounts.'
        )
      )
    }

    if (row.debit > 0 && row.credit > 0) {
      errors.push(
        error(
          'invalid_journal_row',
          'journalPlan.journalRows',
          'A single journal snapshot row cannot carry both debit and credit.'
        )
      )
    }
  }

  return errors
}

function reconcileJournalPlan(
  journalPlan: VatJournalPlan
): VatAuditSnapshotReconciliation | VatAuditSnapshotError {
  const { journalRows, reconciliation } = journalPlan
  const totalDebit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.debit, 0)
  )
  const totalCredit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.credit, 0)
  )
  const acquisitionBase = sumRows(journalRows, 'acquisition_base', 'debit')
  const outputVat = sumRows(
    journalRows,
    'calculated_output_vat',
    'credit'
  )
  const deductibleInputVat = sumRows(
    journalRows,
    'deductible_calculated_input_vat',
    'debit'
  )
  const paymentPayable = sumRows(journalRows, 'payment_payable', 'credit')

  if (totalDebit !== totalCredit || reconciliation.balanced !== true) {
    return error(
      'unbalanced_journal_plan',
      'journalPlan.journalRows',
      'JournalPlan rows must balance independently before snapshot creation.'
    )
  }

  const amountChecks: Array<[
    number,
    number,
    string,
  ]> = [
    [totalDebit, reconciliation.totalDebit, 'total debit'],
    [totalCredit, reconciliation.totalCredit, 'total credit'],
    [acquisitionBase, reconciliation.acquisitionBase, 'acquisition base'],
    [outputVat, reconciliation.outputVat, 'output VAT'],
    [
      deductibleInputVat,
      reconciliation.deductibleInputVat,
      'deductible input VAT',
    ],
    [paymentPayable, reconciliation.paymentPayable, 'payment/payable amount'],
  ]

  for (const [actual, declared, label] of amountChecks) {
    if (actual !== declared) {
      return error(
        'inconsistent_journal_plan',
        'journalPlan.reconciliation',
        `JournalPlan declared ${label} does not match semantic rows.`
      )
    }
  }

  if (
    reconciliation.acquisitionBaseField !== '21' ||
    reconciliation.outputVatReportField !== '30'
  ) {
    return error(
      'unsupported_report_field',
      'journalPlan.reconciliation',
      'JournalPlan reconciliation uses unsupported VAT report fields.'
    )
  }

  return {
    balanced: true,
    totalDebit,
    totalCredit,
    acquisitionBase,
    outputVat,
    deductibleInputVat,
    paymentPayable,
    acquisitionBaseField: reconciliation.acquisitionBaseField,
    outputVatReportField: reconciliation.outputVatReportField,
    deductibleInputVatReportField:
      reconciliation.deductibleInputVatReportField,
  }
}

function validateTreatmentAndPlanMatch(
  treatment: VatTreatment,
  journalPlan: VatJournalPlan,
  reconciliation: VatAuditSnapshotReconciliation
): VatAuditSnapshotError[] {
  const errors: VatAuditSnapshotError[] = []

  if (journalPlan.treatmentCode !== treatment.code) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.treatmentCode',
        'JournalPlan treatment code must match the VatTreatment.'
      )
    )
  }

  if (journalPlan.ruleVersion !== treatment.ruleVersion) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.ruleVersion',
        'JournalPlan rule version must match the VatTreatment.'
      )
    )
  }

  if (journalPlan.factsVersion !== treatment.evidence.factsVersion) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.factsVersion',
        'JournalPlan facts version must match the VatTreatment evidence.'
      )
    )
  }

  if (reconciliation.acquisitionBase !== treatment.taxableBase) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan acquisition base must match the VatTreatment taxable base.'
      )
    )
  }

  if (reconciliation.outputVat !== treatment.outputVat.amount) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan output VAT must match the VatTreatment output VAT.'
      )
    )
  }

  if (
    reconciliation.deductibleInputVat !==
    treatment.deductibleInputVat.amount
  ) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan deductible input VAT must match the VatTreatment deductible input VAT.'
      )
    )
  }

  if (reconciliation.paymentPayable !== treatment.taxableBase) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'Payment/payable evidence must match the VatTreatment taxable base.'
      )
    )
  }

  if (reconciliation.acquisitionBaseField !== treatment.acquisitionBaseField) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan acquisition base field must match the VatTreatment.'
      )
    )
  }

  if (reconciliation.outputVatReportField !== treatment.outputVat.reportField) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan output VAT report field must match the VatTreatment.'
      )
    )
  }

  if (
    reconciliation.deductibleInputVatReportField !==
    treatment.deductibleInputVat.reportField
  ) {
    errors.push(
      error(
        'inconsistent_evidence',
        'journalPlan.reconciliation',
        'JournalPlan deductible input VAT report field must match the VatTreatment.'
      )
    )
  }

  return errors
}

function validateBusinessFactsMatchTreatment(
  treatment: VatTreatment,
  businessFacts: VatV2BusinessFacts | undefined
): VatAuditSnapshotError[] {
  if (!businessFacts) return []

  const errors: VatAuditSnapshotError[] = []

  if (
    businessFacts.calculationRate !== treatment.calculationRate ||
    businessFacts.taxableBase !== treatment.taxableBase ||
    businessFacts.deductionEntitlement !==
      treatment.deductibleInputVat.entitlement ||
    businessFacts.goodsOrService !== 'service' ||
    businessFacts.supplierVatCharged !== 'no'
  ) {
    errors.push(
      error(
        'inconsistent_evidence',
        'businessFacts',
        'VAT business facts must match the resulting VatTreatment.'
      )
    )
  }

  return errors
}

export function buildVatAuditSnapshot(
  input: BuildVatAuditSnapshotInput
): VatAuditSnapshotBuildResult {
  const treatmentErrors = validateSupportedTreatment(input.treatment)
  const requiredRoles =
    input.treatment.deductibleInputVat.entitlement === 'none'
      ? NO_DEDUCTION_REQUIRED_ROLES
      : FULL_DEDUCTION_REQUIRED_ROLES
  const journalRowErrors = validateJournalRows(
    input.journalPlan.journalRows,
    requiredRoles
  )

  if (treatmentErrors.length > 0 || journalRowErrors.length > 0) {
    return blocked([...treatmentErrors, ...journalRowErrors])
  }

  const reconciliation = reconcileJournalPlan(input.journalPlan)
  if ('code' in reconciliation) {
    return blocked([reconciliation])
  }

  const evidenceErrors = validateTreatmentAndPlanMatch(
    input.treatment,
    input.journalPlan,
    reconciliation
  )
  const businessFactErrors = validateBusinessFactsMatchTreatment(
    input.treatment,
    input.businessFacts
  )

  if (evidenceErrors.length > 0 || businessFactErrors.length > 0) {
    return blocked([...evidenceErrors, ...businessFactErrors])
  }

  return ready({
    schemaVersion: VAT_AUDIT_SNAPSHOT_SCHEMA_VERSION,
    journalPlanVersion: VAT_AUDIT_JOURNAL_PLAN_VERSION,
    treatmentCode: input.treatment.code,
    ruleVersion: input.treatment.ruleVersion,
    factsVersion: input.treatment.evidence.factsVersion,
    ...(input.businessFacts ? { businessFacts: input.businessFacts } : {}),
    vat: {
      taxableBase: input.treatment.taxableBase,
      calculationRate: input.treatment.calculationRate,
      acquisitionBaseField: '21',
      outputVat: {
        amount: input.treatment.outputVat.amount,
        reportField: '30',
      },
      deductibleInputVat: {
        amount: input.treatment.deductibleInputVat.amount,
        reportField: input.treatment.deductibleInputVat.reportField,
        entitlement: input.treatment.deductibleInputVat.entitlement,
      },
    },
    journal: {
      rows: input.journalPlan.journalRows.map(row => ({
        role: row.role,
        accountNumber: row.accountNumber,
        debit: row.debit,
        credit: row.credit,
      })),
    },
    reconciliation,
  })
}
