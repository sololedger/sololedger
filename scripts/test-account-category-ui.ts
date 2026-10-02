import assert from 'node:assert/strict'
import {
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

console.log('✓ Canonical och legacy category IDs grupperas rätt i UI.')
console.log('✓ Egen insättning känns igen med både nytt och gammalt ID.')
