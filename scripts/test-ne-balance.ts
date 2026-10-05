import {
  calculateNeBalanceDiff,
  calculateNeBalanceRows,
  type BalanceMap,
} from '../src/lib/neBalance.ts'
import { calculateBusinessResult } from '../src/lib/resultEngine.ts'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`PASS ${description}`)
    passed++
    return
  }

  console.error(`FAIL ${description}`)
  console.error(`  Expected: ${expected}`)
  console.error(`  Actual:   ${actual}`)
  failed++
}

function addBalance(
  balances: BalanceMap,
  accountNumber: string,
  debit: number,
  credit: number
) {
  balances[accountNumber] = (balances[accountNumber] ?? 0) + debit - credit
}

function balanceSheetOnly(balances: BalanceMap): BalanceMap {
  return Object.fromEntries(
    Object.entries(balances).filter(([accountNumber]) => (
      accountNumber.startsWith('1') || accountNumber.startsWith('2')
    ))
  )
}

function calculateB10ForSingleYear(balances: BalanceMap): number {
  const balanceSheet = balanceSheetOnly(balances)
  const result = calculateBusinessResult(balances).bokfortResultat
  const withdrawals =
    (balanceSheet['2011'] ?? 0) +
    (balanceSheet['2012'] ?? 0) +
    (balanceSheet['2013'] ?? 0) +
    (balanceSheet['2014'] ?? 0)
  const deposits = -((balanceSheet['2017'] ?? 0) + (balanceSheet['2018'] ?? 0))

  return Math.round((result + deposits - withdrawals) * 100) / 100
}

console.log('\n=== SoloLedger NE Balance Tests ===\n')

const verBalances: BalanceMap = {}

// VER-1: sale 200 incl. 25% VAT.
addBalance(verBalances, '1930', 200, 0)
addBalance(verBalances, '3010', 0, 160)
addBalance(verBalances, '2611', 0, 40)

// VER-2: owner withdrawal 100.
addBalance(verBalances, '1930', 0, 100)
addBalance(verBalances, '2013', 100, 0)

// VER-3: bank fee 100.
addBalance(verBalances, '1930', 0, 100)
addBalance(verBalances, '6570', 100, 0)

// VER-4: VAT V2 EU service, business payment.
addBalance(verBalances, '2614', 0, 250)
addBalance(verBalances, '1930', 0, 1000)
addBalance(verBalances, '2645', 250, 0)
addBalance(verBalances, '4535', 1000, 0)

// VER-5: VAT V2 EU service, private/equity payment.
addBalance(verBalances, '2614', 0, 250)
addBalance(verBalances, '2018', 0, 1000)
addBalance(verBalances, '2645', 250, 0)
addBalance(verBalances, '4535', 1000, 0)

const verRows = calculateNeBalanceRows(
  balanceSheetOnly(verBalances),
  calculateB10ForSingleYear(verBalances)
)

assertEqual(verRows.B9, 0, 'VER fixture negative 1930 is not reported as B9 asset')
assertEqual(verRows.B13, 0, 'VER fixture does not invent B13 loan debt from 1930')
assertEqual(verRows.B14, 40, 'VER fixture reports VAT payable in B14')
assertEqual(verRows.B10_total, -1040, 'VER fixture keeps B10 equity formula')
assertEqual(
  verRows.unclassifiedNegativeBankBalance,
  1000,
  'VER fixture exposes unclassified negative bank balance'
)
assertEqual(
  calculateNeBalanceDiff(verRows),
  1000,
  'VER fixture balance control still catches the unresolved classification'
)

const positiveBankBalances: BalanceMap = {}
addBalance(positiveBankBalances, '1930', 200, 0)
addBalance(positiveBankBalances, '3010', 0, 160)
addBalance(positiveBankBalances, '2611', 0, 40)

const positiveRows = calculateNeBalanceRows(
  balanceSheetOnly(positiveBankBalances),
  calculateB10ForSingleYear(positiveBankBalances)
)

assertEqual(positiveRows.B9, 200, 'positive bank balance is reported in B9')
assertEqual(
  positiveRows.unclassifiedNegativeBankBalance,
  0,
  'positive bank balance has no negative-bank warning'
)
assertEqual(calculateNeBalanceDiff(positiveRows), 0, 'positive bank regression balances')

const mixedBankRows = calculateNeBalanceRows(
  {
    '1920': 200,
    '1930': -100,
  },
  0
)

assertEqual(mixedBankRows.B9, 200, 'mixed 19xx keeps positive bank amount in B9')
assertEqual(
  mixedBankRows.unclassifiedNegativeBankBalance,
  100,
  'mixed 19xx exposes the negative account separately'
)

const creditAccountBalances: BalanceMap = {}
addBalance(creditAccountBalances, '1930', 1000, 0)
addBalance(creditAccountBalances, '2330', 0, 1000)
addBalance(creditAccountBalances, '1930', 0, 1000)
addBalance(creditAccountBalances, '6570', 1000, 0)

const creditRows = calculateNeBalanceRows(
  balanceSheetOnly(creditAccountBalances),
  calculateB10ForSingleYear(creditAccountBalances)
)

assertEqual(creditRows.B9, 0, 'actual credit-account scenario has no bank asset')
assertEqual(creditRows.B13, 1000, 'actual 2330 credit is reported in B13')
assertEqual(
  creditRows.unclassifiedNegativeBankBalance,
  0,
  'actual 2330 credit has no negative-bank warning'
)
assertEqual(calculateNeBalanceDiff(creditRows), 0, 'actual 2330 credit balances')

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('NE balance tests passed.\n')
}
