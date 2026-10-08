import type { PaymentAccountRole } from './paymentAccountRoles'

export type FixedAssetVatDeductionEntitlement = 'full' | 'none'
export type FixedAssetUsefulLifeAnswer =
  | 'max_three_years'
  | 'more_than_three_years_or_unknown'

export type FixedAssetDecisionType =
  | 'immediate_expense_small_value'
  | 'immediate_expense_short_life'
  | 'capitalized'

export type FixedAssetStatus = 'expensed' | 'active' | 'retired'
export type FixedAssetConnectionAssessment =
  | 'standalone'
  | 'connected'
  | 'uncertain'

export interface FixedAssetTaxRuleParameters {
  taxYear: number
  priceBaseAmount: number
  halfPriceBaseAmount: number
  ruleVersion: string
  rules: {
    fixedAssetsK1?: {
      smallValueComparison?: 'lt'
      collectiveFullWriteoffComparison?: 'lte'
      ordinaryDecliningBalancePercent?: number
    }
  }
}

export interface FixedAssetDecisionInput {
  taxableBaseAmount: number
  supplierVatAmount: number
  vatDeductionEntitlement: FixedAssetVatDeductionEntitlement
  thresholdBasisAmount?: number | null
  usefulLifeAnswer?: FixedAssetUsefulLifeAnswer | null
}

export type FixedAssetDecision =
  | {
      status: 'ready'
      decisionType: FixedAssetDecisionType
      assetStatus: Exclude<FixedAssetStatus, 'retired'>
      requiresUsefulLifeAnswer: false
      thresholdBasisAmount: number
      deductibleVatAmount: number
      nonDeductibleVatAmount: number
      expensedAmount: number
      capitalizedAmount: number
      totalPaidAmount: number
    }
  | {
      status: 'needs_useful_life'
      requiresUsefulLifeAnswer: true
      thresholdBasisAmount: number
      deductibleVatAmount: number
      nonDeductibleVatAmount: number
      totalPaidAmount: number
    }

export interface FixedAssetAcquisitionInput extends FixedAssetDecisionInput {
  idempotencyKey: string
  date: string
  description: string
  supplierCountry: 'SE'
  paymentAccountRole: PaymentAccountRole
  connectionAssessment: FixedAssetConnectionAssessment
  acquisitionGroupId?: string | null
  acquisitionGroupName?: string | null
  connectedAssetIds?: string[]
  plannedGroupBasisAmount?: number | null
}

export interface FixedAssetAcquisitionResult {
  success: true
  assetId: string
  transactionId: string
  verNr: number
  idempotentReplay: boolean
  acquisitionGroupId: string | null
  reclassificationTransactionId: string | null
  reclassificationAmount: number
  decisionType: FixedAssetDecisionType
  assetStatus: FixedAssetStatus
  ruleYear: number
  ruleVersion: string
  halfPriceBaseAmount: number
  expensedAmount: number
  capitalizedAmount: number
  deductibleVatAmount: number
  nonDeductibleVatAmount: number
  thresholdBasisAmount: number
}

export interface FixedAsset {
  id: string
  transactionId: string
  acquisitionDate: string
  fiscalYear: number
  description: string
  supplierCountry: string
  connectionAssessment: Exclude<FixedAssetConnectionAssessment, 'uncertain'>
  acquisitionGroupId: string | null
  paymentAccountRole: PaymentAccountRole
  paymentAccountNumber: string
  vatDeductionEntitlement: FixedAssetVatDeductionEntitlement
  taxableBaseAmount: number
  supplierVatAmount: number
  deductibleVatAmount: number
  nonDeductibleVatAmount: number
  thresholdBasisAmount: number
  naturallyConnected: boolean
  connectedAcquisitionKey: string | null
  usefulLifeAnswer: FixedAssetUsefulLifeAnswer | null
  decisionType: FixedAssetDecisionType
  assetStatus: FixedAssetStatus
  expensedAmount: number
  capitalizedAmount: number
  ruleYear: number
  ruleVersion: string
  priceBaseAmount: number
  halfPriceBaseAmount: number
  retiredAt: string | null
  createdAt: string
}

export interface FixedAssetDepreciationRun {
  id: string
  fiscalYear: number
  transactionId: string
  depreciationDate: string
  openingCollectiveBasis: number
  acquisitionBasis: number
  disposalReductionBasis: number
  depreciationBasis: number
  depreciationAmount: number
  method: 'k1_main_rule_30_percent' | 'k1_half_pbb_full_writeoff'
  fullWriteoffApplied: boolean
  ruleYear: number
  ruleVersion: string
  priceBaseAmount: number
  halfPriceBaseAmount: number
  createdAt: string
}

export interface FixedAssetDepreciationResult {
  success: true
  idempotentReplay: boolean
  runId: string
  transactionId: string
  verNr: number
  fiscalYear: number
  depreciationBasis: number
  depreciationAmount: number
  method: FixedAssetDepreciationRun['method']
  fullWriteoffApplied: boolean
  ruleYear: number
  ruleVersion: string
  halfPriceBaseAmount: number
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100
}

function asAmount(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} måste vara ett positivt belopp eller noll.`)
  }

  return roundAmount(value)
}

export function validateFixedAssetTaxRules(
  parameters: FixedAssetTaxRuleParameters
) {
  const rules = parameters.rules.fixedAssetsK1
  if (
    parameters.taxYear < 2000 ||
    parameters.priceBaseAmount <= 0 ||
    parameters.halfPriceBaseAmount <= 0 ||
    rules?.smallValueComparison !== 'lt' ||
    rules?.collectiveFullWriteoffComparison !== 'lte' ||
    rules?.ordinaryDecliningBalancePercent !== 30
  ) {
    throw new Error('Skatteregeln för inventarier är inte komplett.')
  }
}

export function calculateFixedAssetDecision(
  input: FixedAssetDecisionInput,
  taxRules: FixedAssetTaxRuleParameters
): FixedAssetDecision {
  validateFixedAssetTaxRules(taxRules)

  const taxableBaseAmount = asAmount(input.taxableBaseAmount, 'Belopp exklusive moms')
  const supplierVatAmount = asAmount(input.supplierVatAmount, 'Momsbelopp')
  const thresholdBasisAmount = asAmount(
    input.thresholdBasisAmount ?? taxableBaseAmount,
    'Belopp för gränsbedömning'
  )

  if (thresholdBasisAmount < taxableBaseAmount) {
    throw new Error('Gränsbeloppet kan inte vara lägre än inköpsbeloppet exklusive moms.')
  }

  const deductibleVatAmount =
    input.vatDeductionEntitlement === 'full' ? supplierVatAmount : 0
  const nonDeductibleVatAmount =
    input.vatDeductionEntitlement === 'none' ? supplierVatAmount : 0
  const totalPaidAmount = roundAmount(taxableBaseAmount + supplierVatAmount)
  const accountingCostAmount = roundAmount(taxableBaseAmount + nonDeductibleVatAmount)

  if (thresholdBasisAmount < taxRules.halfPriceBaseAmount) {
    return {
      status: 'ready',
      decisionType: 'immediate_expense_small_value',
      assetStatus: 'expensed',
      requiresUsefulLifeAnswer: false,
      thresholdBasisAmount,
      deductibleVatAmount,
      nonDeductibleVatAmount,
      expensedAmount: accountingCostAmount,
      capitalizedAmount: 0,
      totalPaidAmount,
    }
  }

  if (!input.usefulLifeAnswer) {
    return {
      status: 'needs_useful_life',
      requiresUsefulLifeAnswer: true,
      thresholdBasisAmount,
      deductibleVatAmount,
      nonDeductibleVatAmount,
      totalPaidAmount,
    }
  }

  if (input.usefulLifeAnswer === 'max_three_years') {
    return {
      status: 'ready',
      decisionType: 'immediate_expense_short_life',
      assetStatus: 'expensed',
      requiresUsefulLifeAnswer: false,
      thresholdBasisAmount,
      deductibleVatAmount,
      nonDeductibleVatAmount,
      expensedAmount: accountingCostAmount,
      capitalizedAmount: 0,
      totalPaidAmount,
    }
  }

  return {
    status: 'ready',
    decisionType: 'capitalized',
    assetStatus: 'active',
    requiresUsefulLifeAnswer: false,
    thresholdBasisAmount,
    deductibleVatAmount,
    nonDeductibleVatAmount,
    expensedAmount: 0,
    capitalizedAmount: accountingCostAmount,
    totalPaidAmount,
  }
}

export function calculateK1CollectiveDepreciation(input: {
  depreciationBasis: number
  taxRules: FixedAssetTaxRuleParameters
}) {
  validateFixedAssetTaxRules(input.taxRules)
  const depreciationBasis = asAmount(input.depreciationBasis, 'Avskrivningsunderlag')

  if (depreciationBasis <= input.taxRules.halfPriceBaseAmount) {
    return {
      method: 'k1_half_pbb_full_writeoff' as const,
      depreciationAmount: depreciationBasis,
      fullWriteoffApplied: true,
    }
  }

  return {
    method: 'k1_main_rule_30_percent' as const,
    depreciationAmount: Math.round(depreciationBasis * 30) / 100,
    fullWriteoffApplied: false,
  }
}
