import {
  calculateFixedAssetDecision,
  calculateFixedAssetInvoiceAmounts,
  calculateK1CollectiveDepreciation,
  type FixedAssetTaxRuleParameters,
} from '../src/lib/fixedAssets.ts'
import { readFileSync } from 'node:fs'

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

const invoice25 = calculateFixedAssetInvoiceAmounts({
  grossAmount: 12500,
  vatRate: 25,
})

assertEqual(
  invoice25.taxableBaseAmount,
  10000,
  '12 500 kr inklusive 25 % moms gives 10 000 kr taxable base.'
)
assertEqual(
  invoice25.supplierVatAmount,
  2500,
  '12 500 kr inklusive 25 % moms gives 2 500 kr invoice VAT.'
)

const invoice12 = calculateFixedAssetInvoiceAmounts({
  grossAmount: 112,
  vatRate: 12,
})

assertEqual(
  invoice12.taxableBaseAmount,
  100,
  '12 % fixed-asset invoice VAT is derived from gross amount with currency rounding.'
)
assertEqual(
  invoice12.supplierVatAmount,
  12,
  '12 % fixed-asset invoice VAT amount is derived, not typed freely.'
)

const invoice0 = calculateFixedAssetInvoiceAmounts({
  grossAmount: 10000,
  vatRate: 0,
})

assertEqual(
  invoice0.supplierVatAmount,
  0,
  '0 % fixed-asset invoice has no supplier VAT.'
)

const smallValueBoundary = calculateFixedAssetDecision(
  {
    grossAmount: 37000,
    vatRate: 25,
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
    grossAmount: 36999.99,
    vatRate: 25,
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

const noDeductionAtBoundary = calculateFixedAssetDecision(
  {
    grossAmount: 29599.99,
    vatRate: 25,
    vatDeductionEntitlement: 'none',
  },
  taxRules2026
)

assert(
  noDeductionAtBoundary.status === 'ready' &&
    noDeductionAtBoundary.decisionType === 'immediate_expense_small_value' &&
    noDeductionAtBoundary.expensedAmount === 29599.99 &&
    noDeductionAtBoundary.thresholdBasisAmount === 23679.99,
  'Non-deductible VAT stays in expense, but threshold excludes invoice VAT.'
)

const noDeductionOverBoundary = calculateFixedAssetDecision(
  {
    grossAmount: 29600,
    vatRate: 25,
    vatDeductionEntitlement: 'none',
  },
  taxRules2026
)

assertEqual(
  noDeductionOverBoundary.status,
  'ready',
  '29600 gross at 25 percent VAT is below the net threshold even without deduction.'
)

const connectedPurchase = calculateFixedAssetDecision(
  {
    grossAmount: 25000,
    vatRate: 25,
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
    grossAmount: 50000,
    vatRate: 25,
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
    grossAmount: 50000,
    vatRate: 25,
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

const fixedAssetsPanelSource = readFileSync(
  'src/components/FixedAssetsPanel.tsx',
  'utf8'
)

assert(
  fixedAssetsPanelSource.includes('hasValidPurchaseAmount') &&
    fixedAssetsPanelSource.includes('Ange inköpsbelopp inklusive moms så visar SoloLedger') &&
    !fixedAssetsPanelSource.includes('Direkt kostnad: mindre värde – 0 kr'),
  'Fixed asset panel shows neutral guidance before a valid purchase amount instead of a zero-kronor assessment.'
)

assert(
  fixedAssetsPanelSource.includes('Belopp inkl. moms') &&
    fixedAssetsPanelSource.includes('fixedAssetVatRates') &&
    !fixedAssetsPanelSource.includes('value={supplierVatAmount}'),
  'Fixed asset panel uses gross invoice amount and selected invoice VAT rate instead of free supplier VAT amount.'
)

assert(
  fixedAssetsPanelSource.includes('showUsefulLifeQuestion') &&
    fixedAssetsPanelSource.includes("usefulLifeAnswer !== ''"),
  'Fixed asset panel keeps the useful-life selector visible after the user has selected an answer.'
)

assert(
  fixedAssetsPanelSource.includes('Kopplingen ändrar inte den gamla verifikationen') &&
    fixedAssetsPanelSource.includes('Bedömningsvärde exklusive fakturamoms') &&
    fixedAssetsPanelSource.includes('Kostnad direkt:') &&
    fixedAssetsPanelSource.includes('Tidigare kostnadsförda delar omklassades'),
  'Fixed asset panel explains connected acquisitions and separates package assessment value from the current booking amount.'
)

assert(
  fixedAssetsPanelSource.includes('Anskaffningsvärde') &&
    fixedAssetsPanelSource.includes('Bokförda avskrivningar') &&
    fixedAssetsPanelSource.includes('Bokfört värde kollektivt') &&
    fixedAssetsPanelSource.includes('totalBookedDepreciation'),
  'Fixed asset register distinguishes acquisition value from collective current book value after depreciation.'
)

const kan62MigrationSource = readFileSync(
  'supabase/migrations/20261012123000_kan62_fixed_asset_gross_vat_rate.sql',
  'utf8'
)

assert(
  kan62MigrationSource.includes("p_payload->>'gross_amount'") &&
    kan62MigrationSource.includes("p_payload->>'vat_rate'") &&
    kan62MigrationSource.includes("v_vat_rate := (p_payload->>'vat_rate')::numeric;") &&
    kan62MigrationSource.includes('v_supplier_vat_amount := round(v_paid_amount - v_taxable_base_amount, 2);') &&
    kan62MigrationSource.includes('v_current_acquisition_basis_amount := round(v_taxable_base_amount + v_non_deductible_vat_amount') &&
    kan62MigrationSource.includes('v_vat_rate,') &&
    kan62MigrationSource.includes('REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM authenticated;') &&
    kan62MigrationSource.includes('GRANT EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) TO postgres;'),
  'KAN-62 migration derives fixed-asset invoice amounts from gross amount and VAT rate and stores the selected VAT metadata.'
)

const kan62GroupLockingMigrationSource = readFileSync(
  'supabase/migrations/20261012153000_kan62_fixed_asset_group_locking.sql',
  'utf8'
)

assert(
  kan62GroupLockingMigrationSource.includes('WITH locked_prior_assets AS') &&
    kan62GroupLockingMigrationSource.includes('FOR UPDATE') &&
    kan62GroupLockingMigrationSource.indexOf('WITH locked_prior_assets AS') <
      kan62GroupLockingMigrationSource.indexOf('v_threshold_basis_amount := round') &&
    kan62GroupLockingMigrationSource.indexOf('v_threshold_basis_amount := round') <
      kan62GroupLockingMigrationSource.indexOf('SELECT round(coalesce(sum(fa.expensed_amount), 0), 2)'),
  'KAN-62 group locking migration locks connected fixed-asset rows before threshold and reclassification calculations.'
)

console.log('fixed asset domain tests passed')
