export type BalanceMap = Record<string, number>

export interface NegativeBankBalance {
  accountNumber: string
  balance: number
  amount: number
}

export interface NeBalanceRows {
  B1: number
  B2: number
  B3: number
  B4: number
  B5: number
  B6: number
  B7: number
  B8: number
  B9: number
  B10_total: number
  B13: number
  B14: number
  B15: number
  B16: number
  unclassifiedNegativeBankBalance: number
  negativeBankBalances: NegativeBankBalance[]
}

const ROUNDING_PRECISION = 100
const NEGATIVE_BANK_EPSILON = 0.005

function round2(value: number): number {
  return Math.round(value * ROUNDING_PRECISION) / ROUNDING_PRECISION
}

function parseAccountNumber(accountNumber: string): number | null {
  const parsed = Number.parseInt(accountNumber, 10)
  return Number.isInteger(parsed) ? parsed : null
}

function accountEntriesInRange(
  balances: BalanceMap,
  start: number,
  end: number
) {
  return Object.entries(balances).filter(([accountNumber]) => {
    const parsed = parseAccountNumber(accountNumber)
    return parsed !== null && parsed >= start && parsed <= end
  })
}

function sumBalanceRange(
  balances: BalanceMap,
  start: number,
  end: number
): number {
  return accountEntriesInRange(balances, start, end)
    .reduce((sum, [, value]) => sum + Number(value || 0), 0)
}

function sumPositiveBalanceRange(
  balances: BalanceMap,
  start: number,
  end: number
): number {
  return accountEntriesInRange(balances, start, end)
    .reduce((sum, [, value]) => {
      const balance = Number(value || 0)
      return balance > 0 ? sum + balance : sum
    }, 0)
}

function sumBalanceAccounts(
  balances: BalanceMap,
  prefixes: string[]
): number {
  return Object.entries(balances)
    .filter(([accountNumber]) => (
      prefixes.some(prefix => accountNumber.startsWith(prefix))
    ))
    .reduce((sum, [, value]) => sum + Number(value || 0), 0)
}

function collectNegativeBankBalances(
  balances: BalanceMap
): NegativeBankBalance[] {
  return accountEntriesInRange(balances, 1900, 1999)
    .map(([accountNumber, value]) => ({
      accountNumber,
      balance: round2(Number(value || 0)),
      amount: round2(-Number(value || 0)),
    }))
    .filter(row => row.balance < -NEGATIVE_BANK_EPSILON)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
}

function assetValue(value: number): number {
  return round2(Math.max(0, value))
}

function liabilityValue(value: number): number {
  return round2(Math.max(0, -value))
}

export function calculateNeBalanceRows(
  balanceSheetBalances: BalanceMap,
  B10_total: number
): NeBalanceRows {
  const taxRaw = sumBalanceAccounts(
    balanceSheetBalances,
    ['261', '262', '263', '264', '265', '266', '271', '273']
  )
  const taxReceivable = Math.max(0, taxRaw)

  const negativeBankBalances = collectNegativeBankBalances(balanceSheetBalances)
  const unclassifiedNegativeBankBalance = round2(
    negativeBankBalances.reduce((sum, row) => sum + row.amount, 0)
  )

  return {
    B1: assetValue(sumBalanceRange(balanceSheetBalances, 1000, 1099)),
    B2: assetValue(
      sumBalanceRange(balanceSheetBalances, 1110, 1119) +
      sumBalanceRange(balanceSheetBalances, 1150, 1159)
    ),
    B3: assetValue(
      sumBalanceRange(balanceSheetBalances, 1130, 1139) +
      sumBalanceRange(balanceSheetBalances, 1180, 1189)
    ),
    B4: assetValue(sumBalanceRange(balanceSheetBalances, 1220, 1249)),
    B5: assetValue(sumBalanceRange(balanceSheetBalances, 1300, 1399)),
    B6: assetValue(sumBalanceRange(balanceSheetBalances, 1400, 1499)),
    B7: assetValue(sumBalanceRange(balanceSheetBalances, 1500, 1599)),
    B8: assetValue(
      sumBalanceRange(balanceSheetBalances, 1600, 1899) + taxReceivable
    ),
    B9: assetValue(sumPositiveBalanceRange(balanceSheetBalances, 1900, 1999)),
    B10_total: round2(B10_total),
    B13: liabilityValue(sumBalanceRange(balanceSheetBalances, 2300, 2399)),
    B14: liabilityValue(taxRaw),
    B15: liabilityValue(sumBalanceRange(balanceSheetBalances, 2440, 2449)),
    B16: liabilityValue(sumBalanceRange(balanceSheetBalances, 2900, 2999)),
    unclassifiedNegativeBankBalance,
    negativeBankBalances,
  }
}

export function calculateNeBalanceDiff(rows: NeBalanceRows): number {
  const assets =
    rows.B1 + rows.B2 + rows.B3 + rows.B4 + rows.B5 +
    rows.B6 + rows.B7 + rows.B8 + rows.B9

  const equityAndLiabilities =
    rows.B10_total + rows.B13 + rows.B14 + rows.B15 + rows.B16

  return round2(assets - equityAndLiabilities)
}
