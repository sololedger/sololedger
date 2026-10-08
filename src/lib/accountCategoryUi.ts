export type TransactionCategoryUiGroup = 'income' | 'cost' | 'other'

export interface TransactionCategoryAccountLike {
  id: string
  debit_account?: string | null
  credit_account?: string | null
}

const OWNER_DEPOSIT_CATEGORY_IDS = new Set([
  'egen_insattning',
  'egen_insättning',
])

const OTHER_CATEGORY_IDS = new Set([
  'skatter_avgifter',
  'skattekonto_default',
  'eget_uttag',
  'ingående_balans',
  'periodisering',
  ...OWNER_DEPOSIT_CATEGORY_IDS,
])

export function isOwnerDepositCategoryId(id: string) {
  return OWNER_DEPOSIT_CATEGORY_IDS.has(id)
}

export function isOtherTransactionCategoryId(id: string) {
  return OTHER_CATEGORY_IDS.has(id)
}

export function getTransactionCategoryUiGroup(
  account: TransactionCategoryAccountLike
): TransactionCategoryUiGroup {
  if (account.credit_account?.startsWith('3')) return 'income'
  if (isOtherTransactionCategoryId(account.id)) return 'other'
  return 'cost'
}

export function categoryUsesDomesticSalesVatPolicy(
  account: TransactionCategoryAccountLike
) {
  return getTransactionCategoryUiGroup(account) === 'income'
}

export function categoryRedirectsToFixedAssets(
  account: TransactionCategoryAccountLike
) {
  return account.debit_account === '5410'
}
