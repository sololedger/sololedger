import type {
  AcquisitionBaseField,
  DeductibleInputVatReportField,
  OutputVatReportField,
  ValidationError,
  ValidationResult,
  VatTreatment,
} from './vatDomain'

export type VatJournalPlanRowRole =
  | 'acquisition_base'
  | 'calculated_output_vat'
  | 'deductible_calculated_input_vat'
  | 'payment_payable'

export interface VatJournalPlanRow {
  accountNumber: string
  debit: number
  credit: number
  role: VatJournalPlanRowRole
}

export type VatJournalPlanBlockCode =
  | 'unsupported_vat_treatment'
  | 'unsupported_calculation_rate'
  | 'unsupported_deduction_entitlement'
  | 'invalid_payment_account'
  | 'invalid_treatment_amount'
  | 'inconsistent_treatment'
  | 'unbalanced_journal_plan'

export type VatJournalPlanPath =
  | 'treatment.code'
  | 'treatment.calculationRate'
  | 'treatment.taxableBase'
  | 'treatment.outputVat.amount'
  | 'treatment.outputVat.reportField'
  | 'treatment.deductibleInputVat.amount'
  | 'treatment.deductibleInputVat.reportField'
  | 'treatment.deductibleInputVat.entitlement'
  | 'treatment.acquisitionBaseField'
  | 'paymentAccountNumber'
  | 'journalRows'

export type VatJournalPlanError = ValidationError<
  VatJournalPlanBlockCode,
  VatJournalPlanPath
>

export interface VatJournalPlanReconciliation {
  balanced: true
  totalDebit: number
  totalCredit: number
  acquisitionBase: number
  outputVat: number
  deductibleInputVat: number
  paymentPayable: number
  acquisitionBaseField: AcquisitionBaseField
  outputVatReportField: OutputVatReportField
  deductibleInputVatReportField: DeductibleInputVatReportField
}

export interface VatJournalPlan {
  treatmentCode: VatTreatment['code']
  ruleVersion: string
  factsVersion: string
  journalRows: VatJournalPlanRow[]
  reconciliation: VatJournalPlanReconciliation
}

export type VatJournalPlanBuildResult =
  | {
      status: 'ready'
      plan: VatJournalPlan
      validation: ValidationResult<VatJournalPlanError> & {
        valid: true
        errors: []
      }
    }
  | {
      status: 'blocked'
      plan: null
      validation: ValidationResult<VatJournalPlanError> & {
        valid: false
        errors: VatJournalPlanError[]
      }
    }

export interface BuildVatJournalPlanInput {
  treatment: VatTreatment
  paymentAccountNumber: string
}

const EU_SERVICE_25_ACCOUNTS = {
  acquisitionBase: '4535',
  outputVat: '2614',
  deductibleInputVat: '2645',
} as const

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function sumRows(
  rows: VatJournalPlanRow[],
  role: VatJournalPlanRowRole,
  side: 'debit' | 'credit'
) {
  return roundCurrency(
    rows
      .filter(row => row.role === role)
      .reduce((sum, row) => sum + row[side], 0)
  )
}

function error(
  code: VatJournalPlanBlockCode,
  path: VatJournalPlanPath,
  message: string
): VatJournalPlanError {
  return { code, path, message }
}

function ready(plan: VatJournalPlan): VatJournalPlanBuildResult {
  return {
    status: 'ready',
    plan,
    validation: {
      valid: true,
      errors: [],
    },
  }
}

function blocked(errors: VatJournalPlanError[]): VatJournalPlanBuildResult {
  return {
    status: 'blocked',
    plan: null,
    validation: {
      valid: false,
      errors,
    },
  }
}

function isCurrencyAmount(value: number) {
  return (
    Number.isFinite(value) &&
    value >= 0 &&
    roundCurrency(value) === value
  )
}

function validateCurrencyAmount(
  value: number,
  path: VatJournalPlanPath,
  label: string
) {
  return isCurrencyAmount(value)
    ? null
    : error(
        'invalid_treatment_amount',
        path,
        `${label} must be a finite non-negative currency amount rounded to two decimals.`
      )
}

function normalizePaymentAccount(
  accountNumber: string
): { accountNumber: string } | { error: VatJournalPlanError } {
  const normalized = accountNumber.trim()

  if (!/^[1-9]\d{3}$/.test(normalized)) {
    return {
      error: error(
        'invalid_payment_account',
        'paymentAccountNumber',
        'Payment/payable account must be a four-digit BAS account number.'
      ),
    }
  }

  return { accountNumber: normalized }
}

function validateSupportedTreatment(
  treatment: VatTreatment
): VatJournalPlanError[] {
  const errors: VatJournalPlanError[] = []

  if (treatment.code !== 'EU_SERVICE_REVERSE_CHARGE') {
    errors.push(
      error(
        'unsupported_vat_treatment',
        'treatment.code',
        'This JournalPlan slice only supports EU service reverse charge.'
      )
    )
  }

  if (treatment.calculationRate !== 25) {
    errors.push(
      error(
        'unsupported_calculation_rate',
        'treatment.calculationRate',
        'This JournalPlan slice only supports 25 percent EU service reverse charge.'
      )
    )
  }

  if (treatment.deductibleInputVat.entitlement !== 'full') {
    errors.push(
      error(
        'unsupported_deduction_entitlement',
        'treatment.deductibleInputVat.entitlement',
        'This JournalPlan slice only supports full deduction.'
      )
    )
  }

  return errors
}

function validateEuService25FullDeduction(
  treatment: VatTreatment
): VatJournalPlanError[] {
  const errors: VatJournalPlanError[] = []

  const amountErrors = [
    validateCurrencyAmount(
      treatment.taxableBase,
      'treatment.taxableBase',
      'Acquisition base'
    ),
    validateCurrencyAmount(
      treatment.outputVat.amount,
      'treatment.outputVat.amount',
      'Output VAT'
    ),
    validateCurrencyAmount(
      treatment.deductibleInputVat.amount,
      'treatment.deductibleInputVat.amount',
      'Deductible input VAT'
    ),
  ].filter((amountError): amountError is VatJournalPlanError => (
    amountError !== null
  ))

  errors.push(...amountErrors)

  if (amountErrors.length > 0) {
    return errors
  }

  const expectedVat = roundCurrency(treatment.taxableBase * 0.25)

  if (treatment.outputVat.amount !== expectedVat) {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.outputVat.amount',
        'Output VAT must equal 25 percent of the acquisition base.'
      )
    )
  }

  if (treatment.deductibleInputVat.amount !== treatment.outputVat.amount) {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.deductibleInputVat.amount',
        'Full deduction requires deductible input VAT to equal calculated output VAT.'
      )
    )
  }

  if (treatment.acquisitionBaseField !== '21') {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.acquisitionBaseField',
        'EU service reverse charge must use acquisition base field 21 in this slice.'
      )
    )
  }

  if (treatment.outputVat.reportField !== '30') {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.outputVat.reportField',
        '25 percent reverse-charge output VAT must use report field 30.'
      )
    )
  }

  if (treatment.deductibleInputVat.reportField !== '48') {
    errors.push(
      error(
        'inconsistent_treatment',
        'treatment.deductibleInputVat.reportField',
        'Full deduction must use deductible input VAT report field 48.'
      )
    )
  }

  return errors
}

function reconcilePlan(
  treatment: VatTreatment,
  journalRows: VatJournalPlanRow[]
): VatJournalPlanReconciliation | VatJournalPlanError {
  const totalDebit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.debit, 0)
  )
  const totalCredit = roundCurrency(
    journalRows.reduce((sum, row) => sum + row.credit, 0)
  )

  if (totalDebit !== totalCredit) {
    return error(
      'unbalanced_journal_plan',
      'journalRows',
      'JournalPlan rows must balance before booking.'
    )
  }

  const acquisitionBase = sumRows(journalRows, 'acquisition_base', 'debit')
  const outputVat = sumRows(journalRows, 'calculated_output_vat', 'credit')
  const deductibleInputVat = sumRows(
    journalRows,
    'deductible_calculated_input_vat',
    'debit'
  )
  const paymentPayable = sumRows(journalRows, 'payment_payable', 'credit')

  if (acquisitionBase !== treatment.taxableBase) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Journal acquisition base must equal treatment taxable base.'
    )
  }

  if (outputVat !== treatment.outputVat.amount) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Journal output VAT must equal treatment output VAT.'
    )
  }

  if (deductibleInputVat !== treatment.deductibleInputVat.amount) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Journal deductible input VAT must equal treatment deductible input VAT.'
    )
  }

  if (paymentPayable !== treatment.taxableBase) {
    return error(
      'inconsistent_treatment',
      'journalRows',
      'Payment/payable leg must equal the acquisition base for this verified case.'
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
    acquisitionBaseField: '21',
    outputVatReportField: '30',
    deductibleInputVatReportField: '48',
  }
}

export function buildVatJournalPlan(
  input: BuildVatJournalPlanInput
): VatJournalPlanBuildResult {
  const paymentAccountResult =
    normalizePaymentAccount(input.paymentAccountNumber)
  const supportErrors = validateSupportedTreatment(input.treatment)

  if ('error' in paymentAccountResult || supportErrors.length > 0) {
    return blocked([
      ...supportErrors,
      ...('error' in paymentAccountResult ? [paymentAccountResult.error] : []),
    ])
  }

  const treatmentErrors =
    validateEuService25FullDeduction(input.treatment)

  if (treatmentErrors.length > 0) {
    return blocked(treatmentErrors)
  }

  const acquisitionBase = input.treatment.taxableBase
  const outputVat = input.treatment.outputVat.amount
  const deductibleInputVat = input.treatment.deductibleInputVat.amount

  const journalRows: VatJournalPlanRow[] = [
    {
      accountNumber: EU_SERVICE_25_ACCOUNTS.acquisitionBase,
      debit: acquisitionBase,
      credit: 0,
      role: 'acquisition_base',
    },
    {
      accountNumber: EU_SERVICE_25_ACCOUNTS.deductibleInputVat,
      debit: deductibleInputVat,
      credit: 0,
      role: 'deductible_calculated_input_vat',
    },
    {
      accountNumber: EU_SERVICE_25_ACCOUNTS.outputVat,
      debit: 0,
      credit: outputVat,
      role: 'calculated_output_vat',
    },
    {
      accountNumber: paymentAccountResult.accountNumber,
      debit: 0,
      credit: acquisitionBase,
      role: 'payment_payable',
    },
  ]

  const reconciliation = reconcilePlan(input.treatment, journalRows)

  if ('code' in reconciliation) {
    return blocked([reconciliation])
  }

  return ready({
    treatmentCode: input.treatment.code,
    ruleVersion: input.treatment.ruleVersion,
    factsVersion: input.treatment.evidence.factsVersion,
    journalRows,
    reconciliation,
  })
}
