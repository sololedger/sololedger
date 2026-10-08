import {
  calculateFixedAssetDecision,
  calculateK1CollectiveDepreciation,
  type FixedAssetTaxRuleParameters,
} from '../src/lib/fixedAssets.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`)
  }
}

const taxRules2026: FixedAssetTaxRuleParameters = {
  taxYear: 2026,
  priceBaseAmount: 59200,
  halfPriceBaseAmount: 29600,
  ruleVersion: 'k1-fixed-assets-pbb-v1-2026',
  rules: {
    fixedAssetsK1: {
      smallValueComparison: 'lt',
      collectiveFullWriteoffComparison: 'lte',
      ordinaryDecliningBalancePercent: 30,
    },
  },
}

const smallValueBoundary = calculateFixedAssetDecision(
  {
    taxableBaseAmount: 29600,
    supplierVatAmount: 7400,
    vatDeductionEntitlement: 'full',
  },
  taxRules2026
)

assertEqual(
  smallValueBoundary.status,
  'needs_useful_life',
  'Immediate-expense small-value rule uses strict less-than, not <=.'
)

const smallValueBelowBoundary = calculateFixedAssetDecision(
  {
    taxableBaseAmount: 29599.99,
    supplierVatAmount: 7400,
    vatDeductionEntitlement: 'full',
  },
  taxRules2026
)

assertEqual(
  smallValueBelowBoundary.status,
  'ready',
  'Amount below half PBB can be decided without useful-life question.'
)
assert(
  smallValueBelowBoundary.status === 'ready' &&
    smallValueBelowBoundary.decisionType === 'immediate_expense_small_value',
  'Below-threshold acquisition is immediately expensed as small value.'
)
assert(
  smallValueBelowBoundary.status === 'ready' &&
    smallValueBelowBoundary.expensedAmount === 29599.99 &&
    smallValueBelowBoundary.deductibleVatAmount === 7400,
  'Fully deductible VAT is not added to the expense amount.'
)

const noDeductionBelowBoundary = calculateFixedAssetDecision(
  {
    taxableBaseAmount: 29599.99,
    supplierVatAmount: 7400,
    vatDeductionEntitlement: 'none',
  },
  taxRules2026
)

assert(
  noDeductionBelowBoundary.status === 'ready' &&
    noDeductionBelowBoundary.decisionType === 'immediate_expense_small_value' &&
    noDeductionBelowBoundary.expensedAmount === 36999.99 &&
    noDeductionBelowBoundary.nonDeductibleVatAmount === 7400,
  'Non-deductible VAT is expensed/capitalized but does not make the threshold basis include VAT by default.'
)

const connectedPurchase = calculateFixedAssetDecision(
  {
    taxableBaseAmount: 25000,
    supplierVatAmount: 6250,
    vatDeductionEntitlement: 'full',
    thresholdBasisAmount: 40000,
  },
  taxRules2026
)

assertEqual(
  connectedPurchase.status,
  'needs_useful_life',
  'Naturally connected purchases are tested on the combined acquisition basis.'
)

const shortLife = calculateFixedAssetDecision(
  {
    taxableBaseAmount: 40000,
    supplierVatAmount: 10000,
    vatDeductionEntitlement: 'full',
    usefulLifeAnswer: 'max_three_years',
  },
  taxRules2026
)

assert(
  shortLife.status === 'ready' &&
    shortLife.decisionType === 'immediate_expense_short_life',
  'Short-life assets can be immediately expensed after useful-life answer.'
)

const capitalizedNoDeduction = calculateFixedAssetDecision(
  {
    taxableBaseAmount: 40000,
    supplierVatAmount: 10000,
    vatDeductionEntitlement: 'none',
    usefulLifeAnswer: 'more_than_three_years_or_unknown',
  },
  taxRules2026
)

assert(
  capitalizedNoDeduction.status === 'ready' &&
    capitalizedNoDeduction.decisionType === 'capitalized' &&
    capitalizedNoDeduction.capitalizedAmount === 50000,
  'Capitalized no-deduction asset includes non-deductible VAT in acquisition value.'
)

const fullWriteoffBoundary = calculateK1CollectiveDepreciation({
  depreciationBasis: 29600,
  taxRules: taxRules2026,
})

assert(
  fullWriteoffBoundary.method === 'k1_half_pbb_full_writeoff' &&
    fullWriteoffBoundary.depreciationAmount === 29600,
  'Collective depreciation full-writeoff rule uses <= half PBB.'
)

const mainRule = calculateK1CollectiveDepreciation({
  depreciationBasis: 100000,
  taxRules: taxRules2026,
})

assert(
  mainRule.method === 'k1_main_rule_30_percent' &&
    mainRule.depreciationAmount === 30000,
  'K1 ordinary collective depreciation uses 30 percent of the basis.'
)

console.log('fixed asset domain tests passed')
