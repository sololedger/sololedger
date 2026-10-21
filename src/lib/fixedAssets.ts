import type { PaymentAccountRole } from './paymentAccountRoles'

export type FixedAssetVatDeductionEntitlement = 'full' | 'none'
export type FixedAssetVatRate = 0 | 6 | 12 | 25
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
  grossAmount: number
  vatRate: FixedAssetVatRate
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
      grossAmount: number
      vatRate: FixedAssetVatRate
      taxableBaseAmount: number
      supplierVatAmount: number
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
      grossAmount: number
      vatRate: FixedAssetVatRate
      taxableBaseAmount: number
      supplierVatAmount: number
      thresholdBasisAmount: number
      deductibleVatAmount: number
      nonDeductibleVatAmount: number
      totalPaidAmount: number
    }

export interface FixedAssetAcquisitionInput extends FixedAssetDecisionInput {
  thresholdBasisAmount: number
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
  expectedPriorAssetIds: string[]
  expectedReclassificationAmount: number
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
  plannedGroupBasisAmount?: number | null
  groupPlanRequiresReview?: boolean
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

export function isFixedAssetVatRate(value: number): value is FixedAssetVatRate {
  return value === 0 || value === 6 || value === 12 || value === 25
}

export function calculateFixedAssetInvoiceAmounts(input: {
  grossAmount: number
  vatRate: number
}) {
  const grossAmount = asAmount(input.grossAmount, 'Belopp inklusive moms')
  if (grossAmount !== input.grossAmount) {
    throw new Error('Ange fakturabelopp med högst två decimaler.')
  }

  if (grossAmount <= 0) {
    throw new Error('Belopp inklusive moms måste vara större än 0.')
  }

  if (!isFixedAssetVatRate(input.vatRate)) {
    throw new Error('Momssatsen måste vara 0, 6, 12 eller 25 procent.')
  }

  const taxableBaseAmount =
    input.vatRate === 0
      ? grossAmount
      : roundAmount(grossAmount / (1 + input.vatRate / 100))
  const supplierVatAmount = roundAmount(grossAmount - taxableBaseAmount)

  return {
    grossAmount,
    vatRate: input.vatRate,
    taxableBaseAmount,
    supplierVatAmount,
  }
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

  if (input.vatDeductionEntitlement !== 'full' && input.vatDeductionEntitlement !== 'none') {
    throw new Error('Avdragsrätten måste vara full eller ingen. Osäkra fall stoppas.')
  }

  const {
    grossAmount,
    vatRate,
    taxableBaseAmount,
    supplierVatAmount,
  } = calculateFixedAssetInvoiceAmounts(input)
  const deductibleVatAmount =
    input.vatDeductionEntitlement === 'full' ? supplierVatAmount : 0
  const nonDeductibleVatAmount =
    input.vatDeductionEntitlement === 'none' ? supplierVatAmount : 0
  const accountingCostAmount = roundAmount(taxableBaseAmount + nonDeductibleVatAmount)
  const thresholdBasisAmount = asAmount(
    input.thresholdBasisAmount ?? taxableBaseAmount,
    'Belopp för gränsbedömning'
  )

  if (thresholdBasisAmount < taxableBaseAmount) {
    throw new Error('Gränsbeloppet kan inte vara lägre än inköpsbeloppet exklusive fakturamoms.')
  }

  const totalPaidAmount = grossAmount

  if (thresholdBasisAmount < taxRules.halfPriceBaseAmount && input.usefulLifeAnswer !== 'max_three_years') {
    return {
      status: 'ready',
      decisionType: 'immediate_expense_small_value',
      assetStatus: 'expensed',
      requiresUsefulLifeAnswer: false,
      grossAmount,
      vatRate,
      taxableBaseAmount,
      supplierVatAmount,
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
      grossAmount,
      vatRate,
      taxableBaseAmount,
      supplierVatAmount,
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
      grossAmount,
      vatRate,
      taxableBaseAmount,
      supplierVatAmount,
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
    grossAmount,
    vatRate,
    taxableBaseAmount,
    supplierVatAmount,
    thresholdBasisAmount,
    deductibleVatAmount,
    nonDeductibleVatAmount,
    expensedAmount: 0,
    capitalizedAmount: accountingCostAmount,
    totalPaidAmount,
  }
}

type FixedAssetGroupMember = Pick<FixedAsset,
  'id' | 'fiscalYear' | 'acquisitionDate' | 'acquisitionGroupId' |
  'assetStatus' | 'decisionType' | 'taxableBaseAmount' | 'expensedAmount' |
  'plannedGroupBasisAmount' | 'groupPlanRequiresReview'>

export function readFixedAssetGroupPlan(snapshot: unknown): {
  plannedGroupBasisAmount: number | null; groupPlanRequiresReview: boolean
} {
  const value = snapshot as { facts?: { plannedGroupBasisAmount?: unknown }; rule?: { thresholdBasisDefinition?: unknown } } | null
  const planned = value?.facts?.plannedGroupBasisAmount
  if (planned == null) return { plannedGroupBasisAmount: null, groupPlanRequiresReview: false }
  if (value?.rule?.thresholdBasisDefinition !== 'excluding_supplier_vat' ||
      typeof planned !== 'number' || !Number.isFinite(planned) || planned < 0) {
    return { plannedGroupBasisAmount: null, groupPlanRequiresReview: true }
  }
  return { plannedGroupBasisAmount: roundAmount(planned), groupPlanRequiresReview: false }
}

/** Requires a complete owner-scoped register. No cross-year inference. */
export function assessFixedAssetGroup<T extends FixedAssetGroupMember>(input: {
  assets: readonly T[]
  connectedAssetIds: readonly string[]
  acquisitionDate: string
  fiscalYear: number
  currentTaxableBaseAmount: number
  plannedGroupBasisAmount?: number | null
}) {
  const fiscalYear = Number(input.acquisitionDate.slice(0, 4))
  if (fiscalYear !== input.fiscalYear) throw new Error('Inköpsdatumet måste tillhöra valt bokföringsår.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.acquisitionDate) ||
      new Date(input.acquisitionDate + 'T00:00:00Z').toISOString().slice(0, 10) !== input.acquisitionDate) {
    throw new Error('Ogiltigt inköpsdatum.')
  }
  const currentBasis = asAmount(input.currentTaxableBaseAmount, 'Belopp exklusive fakturamoms')
  const selectedIds = new Set(input.connectedAssetIds)
  const selected = input.assets.filter(asset => selectedIds.has(asset.id))
  if (selected.length !== selectedIds.size || selected.some(asset =>
    asset.fiscalYear !== fiscalYear || asset.assetStatus === 'retired' ||
    asset.acquisitionDate > input.acquisitionDate)) {
    throw new Error('Kopplade inventarier saknas, är avslutade eller hör till ett annat år eller senare datum.')
  }
  const groupIds = new Set(selected.flatMap(asset => asset.acquisitionGroupId ? [asset.acquisitionGroupId] : []))
  if (groupIds.size > 1) throw new Error('De valda inventarierna hör till olika anskaffningsgrupper.')
  const priorAssets = input.assets.filter(asset => selectedIds.has(asset.id) ||
    (asset.acquisitionGroupId !== null && groupIds.has(asset.acquisitionGroupId) && asset.assetStatus !== 'retired'))
  if (priorAssets.some(asset => asset.fiscalYear !== fiscalYear || asset.acquisitionDate > input.acquisitionDate)) {
    throw new Error('Anskaffningsgruppen innehåller ett annat år eller senare köp. Kontroll krävs.')
  }
  if (priorAssets.some(asset => asset.groupPlanRequiresReview)) {
    throw new Error('Ett äldre planerat paketbelopp behöver kontrolleras innan bokning.')
  }
  // Confirmed short-life assets keep their independent immediate deduction.
  const assessedAssets = priorAssets.filter(asset => asset.decisionType !== 'immediate_expense_short_life')
  const recordedBasis = roundAmount(currentBasis + assessedAssets.reduce(
    (sum, asset) => sum + asAmount(asset.taxableBaseAmount, 'Tidigare belopp exklusive fakturamoms'), 0))
  const plannedBasis = input.plannedGroupBasisAmount == null ? 0 : asAmount(input.plannedGroupBasisAmount, 'Planerat paketbelopp exklusive fakturamoms')
  if (input.plannedGroupBasisAmount != null && plannedBasis < currentBasis) {
    throw new Error('Planerat paketbelopp exklusive fakturamoms kan inte vara lägre än aktuellt inköp.')
  }
  return {
    priorAssets,
    thresholdBasisAmount: Math.max(recordedBasis, plannedBasis,
      ...priorAssets.map(asset => asAmount(asset.plannedGroupBasisAmount ?? 0, 'Tidigare planerat paketbelopp'))),
    reclassificationAmount: roundAmount(assessedAssets.filter(asset =>
      asset.assetStatus === 'expensed' && asset.decisionType === 'immediate_expense_small_value'
    ).reduce((sum, asset) => sum + asAmount(asset.expensedAmount, 'Tidigare kostnad'), 0)),
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
