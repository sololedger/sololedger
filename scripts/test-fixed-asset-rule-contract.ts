import assert from 'node:assert/strict'
import { assessFixedAssetGroup, calculateFixedAssetDecision, calculateFixedAssetInvoiceAmounts, readFixedAssetGroupPlan,
  type FixedAsset, type FixedAssetTaxRuleParameters } from '../src/lib/fixedAssets.ts'

const rules: FixedAssetTaxRuleParameters = {
  taxYear: 2026, priceBaseAmount: 59200, halfPriceBaseAmount: 29600, ruleVersion: 'test',
  rules: { fixedAssetsK1: { smallValueComparison: 'lt', collectiveFullWriteoffComparison: 'lte', ordinaryDecliningBalancePercent: 30 } },
}
const decide = (grossAmount: number, deduction: 'full' | 'none', thresholdBasisAmount?: number,
  usefulLifeAnswer?: 'max_three_years' | 'more_than_three_years_or_unknown') => calculateFixedAssetDecision({
  grossAmount, vatRate: 25, vatDeductionEntitlement: deduction, thresholdBasisAmount, usefulLifeAnswer,
}, rules)

for (const deduction of ['full', 'none'] as const) {
  const below = decide(36999.99, deduction)
  assert.equal(below.status, 'ready')
  assert.equal(below.thresholdBasisAmount, 29599.99)
  assert.equal(decide(37000, deduction).status, 'needs_useful_life')
  assert.equal(decide(37000.01, deduction).status, 'needs_useful_life')
  const small = decide(35000, deduction)
  assert.equal(small.status, 'ready')
  if (small.status !== 'ready') throw Error('Expected direct expense')
  assert.equal(small.decisionType, 'immediate_expense_small_value')
  assert.equal(small.thresholdBasisAmount, 28000)
  assert.equal(small.expensedAmount, deduction === 'full' ? 28000 : 35000)
  assert.equal(small.deductibleVatAmount, deduction === 'full' ? 7000 : 0)
  const capitalized = decide(37000, deduction, undefined, 'more_than_three_years_or_unknown')
  assert.equal(capitalized.status, 'ready')
  if (capitalized.status === 'ready') assert.equal(capitalized.capitalizedAmount, deduction === 'full' ? 29600 : 37000)
}
for (const vatRate of [0, 6, 12, 25] as const) {
  for (const deduction of ['full', 'none'] as const) {
    const invoice = calculateFixedAssetInvoiceAmounts({ grossAmount: 12345.67, vatRate })
    const decision = calculateFixedAssetDecision({ grossAmount: 12345.67, vatRate, vatDeductionEntitlement: deduction }, rules)
    assert.equal(Math.round((invoice.taxableBaseAmount + invoice.supplierVatAmount) * 100), 1234567)
    assert.equal(decision.thresholdBasisAmount, invoice.taxableBaseAmount)
    assert.equal(decision.status, 'ready')
    if (decision.status === 'ready') assert.equal(Math.round((decision.expensedAmount + decision.deductibleVatAmount) * 100), 1234567)
  }
}
assert.throws(() => decide(12500, 'none', 9999), /exklusive fakturamoms/)
assert.throws(() => calculateFixedAssetInvoiceAmounts({ grossAmount: 0, vatRate: 25 }))
assert.throws(() => calculateFixedAssetInvoiceAmounts({ grossAmount: 100, vatRate: 99 }))
assert.throws(() => calculateFixedAssetInvoiceAmounts({ grossAmount: 100.005, vatRate: 25 }), /två decimaler/)

type Member = Pick<FixedAsset, 'id' | 'fiscalYear' | 'acquisitionDate' | 'acquisitionGroupId' |
  'assetStatus' | 'decisionType' | 'taxableBaseAmount' | 'expensedAmount'>
const first: Member = { id: 'A', fiscalYear: 2026, acquisitionDate: '2026-01-01', acquisitionGroupId: null,
  assetStatus: 'expensed', decisionType: 'immediate_expense_small_value', taxableBaseAmount: 10000, expensedAmount: 12500 }
const input = { acquisitionDate: '2026-03-01', fiscalYear: 2026, currentTaxableBaseAmount: 10000 }
const secondPreview = assessFixedAssetGroup({ ...input, assets: [first], connectedAssetIds: ['A'] })
assert.equal(secondPreview.thresholdBasisAmount, 20000)
assert.equal(decide(12500, 'none', secondPreview.thresholdBasisAmount).status, 'ready')
// Represent the durable membership returned by the server after purchase B.
const linkedFirst = { ...first, acquisitionGroupId: 'G' }
const second = { ...first, id: 'B', acquisitionDate: '2026-02-01', acquisitionGroupId: 'G' }
const thirdPreview = assessFixedAssetGroup({ ...input, assets: [linkedFirst, second], connectedAssetIds: ['B'] })
assert.deepEqual(thirdPreview.priorAssets.map(a => a.id), ['A', 'B'])
assert.equal(thirdPreview.thresholdBasisAmount, 30000)
assert.equal(thirdPreview.reclassificationAmount, 25000)
assert.equal(decide(12500, 'none', thirdPreview.thresholdBasisAmount).status, 'needs_useful_life')
assert.equal(assessFixedAssetGroup({ ...input, assets: [], connectedAssetIds: [], plannedGroupBasisAmount: 30000 }).thresholdBasisAmount, 30000)
assert.throws(() => assessFixedAssetGroup({ ...input, assets: [], connectedAssetIds: [], plannedGroupBasisAmount: 9999 }))
assert.equal(assessFixedAssetGroup({ ...input, assets: [{ ...linkedFirst, plannedGroupBasisAmount: 40000 }], connectedAssetIds: ['A'] }).thresholdBasisAmount, 40000)
assert.throws(() => assessFixedAssetGroup({ ...input, assets: [{ ...linkedFirst, groupPlanRequiresReview: true }], connectedAssetIds: ['A'] }), /äldre planerat/)
assert.deepEqual(readFixedAssetGroupPlan({ rule: { thresholdBasisDefinition: 'excluding_supplier_vat' }, facts: { plannedGroupBasisAmount: 30000 } }),
  { plannedGroupBasisAmount: 30000, groupPlanRequiresReview: false })
assert.equal(readFixedAssetGroupPlan({ facts: { plannedGroupBasisAmount: 30000 } }).groupPlanRequiresReview, true)
assert.equal(readFixedAssetGroupPlan({}).groupPlanRequiresReview, false)
assert.equal(readFixedAssetGroupPlan({ rule: { thresholdBasisDefinition: 'excluding_supplier_vat' }, facts: { plannedGroupBasisAmount: '30000' } }).groupPlanRequiresReview, true)
assert.throws(() => assessFixedAssetGroup({ ...input, assets: [], connectedAssetIds: ['missing'] }))
assert.throws(() => assessFixedAssetGroup({ ...input, assets: [{ ...first, fiscalYear: 2025 }], connectedAssetIds: ['A'] }))
assert.throws(() => assessFixedAssetGroup({ ...input, fiscalYear: 2025, assets: [], connectedAssetIds: [] }))
assert.throws(() => assessFixedAssetGroup({ ...input, assets: [{ ...first, assetStatus: 'retired' }], connectedAssetIds: ['A'] }))
assert.throws(() => assessFixedAssetGroup({ ...input, assets: [linkedFirst, { ...second, acquisitionDate: '2026-12-01' }], connectedAssetIds: ['A'] }))
assert.throws(() => assessFixedAssetGroup({ ...input, assets: [linkedFirst, { ...second, acquisitionGroupId: 'H' }], connectedAssetIds: ['A', 'B'] }))

const short: Member = { ...linkedFirst, decisionType: 'immediate_expense_short_life', taxableBaseAmount: 40000, expensedAmount: 50000 }
const withShort = assessFixedAssetGroup({ ...input, assets: [short, second], connectedAssetIds: ['B'] })
assert.equal(withShort.thresholdBasisAmount, 20000)
assert.equal(withShort.reclassificationAmount, 12500)
for (const gross of [12500, 50000]) {
  const result = decide(gross, 'none', undefined, 'max_three_years')
  assert.equal(result.status, 'ready')
  if (result.status === 'ready') assert.equal(result.decisionType, 'immediate_expense_short_life')
}
console.log('KAN-62 rule contract: boundaries, VAT, group expansion, years and short life PASS (pure domain; not DB proof)')
