import assert from 'node:assert/strict'
import {
  categoryRedirectsToFixedAssets,
  categoryUsesDomesticSalesVatPolicy,
  getTransactionCategoryUiGroup,
  isOwnerDepositCategoryId,
} from '../src/lib/accountCategoryUi.ts'

const cases = [
  {
    id: 'skatter_avgifter',
    credit_account: '1930',
    expected: 'other',
    description: 'canonical skatter_avgifter visas som Övrigt',
  },
  {
    id: 'skattekonto_default',
    credit_account: '1930',
    expected: 'other',
    description: 'legacy skattekonto_default visas fortsatt som Övrigt',
  },
  {
    id: 'egen_insattning',
    credit_account: '2018',
    expected: 'other',
    description: 'canonical egen_insattning visas som Övrigt',
  },
  {
    id: 'egen_insättning',
    credit_account: '2018',
    expected: 'other',
    description: 'legacy egen_insättning visas fortsatt som Övrigt',
  },
  {
    id: 'forsaljning',
    credit_account: '3010',
    expected: 'income',
    description: 'intäktskonto visas som Intäkter',
  },
  {
    id: 'försäljning',
    credit_account: '3010',
    expected: 'income',
    description: 'legacy försäljningskategori visas som Intäkter',
  },
  {
    id: 'custom_income',
    credit_account: '3041',
    expected: 'income',
    description: 'egen 3xxx-intäktskategori visas som Intäkter',
  },
  {
    id: 'forbrukningsinventarier',
    credit_account: '1930',
    expected: 'cost',
    description: 'vanligt kostnadskonto visas som Kostnader',
  },
] as const

for (const testCase of cases) {
  assert.equal(
    getTransactionCategoryUiGroup(testCase),
    testCase.expected,
    testCase.description
  )
}

assert.equal(isOwnerDepositCategoryId('egen_insattning'), true)
assert.equal(isOwnerDepositCategoryId('egen_insättning'), true)
assert.equal(isOwnerDepositCategoryId('skatter_avgifter'), false)

assert.equal(
  categoryUsesDomesticSalesVatPolicy({
    id: 'custom_income',
    credit_account: '3041',
  }),
  true,
  'vanliga manuella inrikes intäktskategorier med 3xxx-kreditkonto följer svensk försäljningsmomsprofil'
)
assert.equal(
  categoryUsesDomesticSalesVatPolicy({
    id: 'forbrukningsinventarier',
    credit_account: '1930',
  }),
  false,
  'kostnadskategorier följer inte svensk försäljningsmomsprofil'
)
assert.equal(
  categoryUsesDomesticSalesVatPolicy({
    id: 'egen_insattning',
    credit_account: '2018',
  }),
  false,
  'övriga ägar-/balansflöden följer inte svensk försäljningsmomsprofil'
)
assert.equal(
  categoryRedirectsToFixedAssets({
    id: 'forbrukningsinventarier',
    debit_account: '5410',
    credit_account: '1930',
  }),
  true,
  'vanlig 5410-kategori styrs till Inventarier i stället för manuell bokföring'
)
assert.equal(
  categoryRedirectsToFixedAssets({
    id: 'programvara',
    debit_account: '5420',
    credit_account: '1930',
  }),
  false,
  'andra kostnadskategorier styrs inte till Inventarier'
)

console.log('✓ Canonical och legacy category IDs grupperas rätt i UI.')
console.log('✓ Egen insättning känns igen med både nytt och gammalt ID.')
console.log('✓ Svensk försäljningsmomsprofil kopplas till manuella 3xxx-intäktskategorier.')
console.log('✓ Vanlig 5410-kategori styrs till Inventarier utan att andra kostnader påverkas.')
