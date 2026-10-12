import {
  buildBankAccountHistory,
  type BankHistoryJournalEntry,
  type BankHistoryTransaction,
} from '../src/lib/bankAccountHistory.ts'

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
  console.log(`PASS: ${message}`)
}

function assertDeepEqual<T>(actual: T, expected: T, message: string) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`)
  }
  console.log(`PASS: ${message}`)
}

const transactions: BankHistoryTransaction[] = [
  {
    id: 'tx-opening',
    date: '2026-01-01',
    description: 'Ingående balans',
    source: 'sie_opening_balance',
  },
  {
    id: 'tx-sale',
    date: '2026-02-01',
    description: 'Kundbetalning',
    source: 'manual',
  },
  {
    id: 'tx-multi-bank',
    date: '2026-02-02',
    description: 'Två bankrader i samma verifikation',
    source: 'manual',
  },
  {
    id: 'tx-cost',
    date: '2026-03-01',
    description: 'Programvara',
    source: 'manual',
  },
  {
    id: 'tx-cost-correction',
    date: '2026-03-02',
    description: 'Korrigering av programvara',
    source: 'manual',
    is_correction: true,
    corrects_ver_nr: 4,
  },
  {
    id: 'tx-uncertain-correction',
    date: '2026-03-03',
    description: 'Rättelse utan originalkoppling',
    source: 'manual',
    is_correction: true,
  },
  {
    id: 'tx-import',
    date: '2026-04-01',
    description: 'Importerad bankhändelse',
    source: 'sie_import',
  },
  {
    id: 'tx-customer-invoice',
    date: '2026-05-01',
    description: 'Kundfaktura betald F-100',
    source: 'customer_invoice',
  },
]

const journalMap: Record<string, BankHistoryJournalEntry[]> = {
  'tx-opening': [
    { id: 'open-1930', account_number: '1930', debit: 5000, credit: 0, ver_nr: 1 },
  ],
  'tx-sale': [
    { id: 'sale-1930', account_number: '1930', debit: 1250, credit: 0, ver_nr: 2 },
    { id: 'sale-3010', account_number: '3010', debit: 0, credit: 1000, ver_nr: 2 },
    { id: 'sale-2611', account_number: '2611', debit: 0, credit: 250, ver_nr: 2 },
  ],
  'tx-multi-bank': [
    { id: 'multi-1930-a', account_number: '1930', debit: 1000, credit: 0, ver_nr: 3 },
    { id: 'multi-1930-b', account_number: '1930', debit: 250, credit: 0, ver_nr: 3 },
    { id: 'multi-3010', account_number: '3010', debit: 0, credit: 1250, ver_nr: 3 },
  ],
  'tx-cost': [
    { id: 'cost-5420', account_number: '5420', debit: 800, credit: 0, ver_nr: 4 },
    { id: 'cost-1930', account_number: '1930', debit: 0, credit: 800, ver_nr: 4 },
  ],
  'tx-cost-correction': [
    { id: 'corr-5420', account_number: '5420', debit: 0, credit: 800, ver_nr: 5 },
    { id: 'corr-1930', account_number: '1930', debit: 800, credit: 0, ver_nr: 5 },
  ],
  'tx-uncertain-correction': [
    { id: 'uncertain-1930', account_number: '1930', debit: 99, credit: 0, ver_nr: 6 },
    { id: 'uncertain-3010', account_number: '3010', debit: 0, credit: 99, ver_nr: 6 },
  ],
  'tx-import': [
    { id: 'import-1930', account_number: '1930', debit: 0, credit: 300, ver_nr: 7 },
    { id: 'import-4010', account_number: '4010', debit: 300, credit: 0, ver_nr: 7 },
  ],
  'tx-customer-invoice': [
    { id: 'invoice-1930', account_number: '1930', debit: 2500, credit: 0, ver_nr: 8 },
    { id: 'invoice-3010', account_number: '3010', debit: 0, credit: 2000, ver_nr: 8 },
    { id: 'invoice-2611', account_number: '2611', debit: 0, credit: 500, ver_nr: 8 },
  ],
}

console.log('\n=== SoloLedger Bank Account History Tests ===\n')

const history = buildBankAccountHistory({ transactions, journalMap })

assertEqual(history.openingBalanceAmount, 5000, 'opening balance is aggregated separately')
assertEqual(history.openingBalanceCount, 1, 'opening balance is counted separately')
assertEqual(
  history.entries.find(entry => entry.transactionId === 'tx-opening'),
  undefined,
  'opening balance is not a regular bank history entry'
)
assertEqual(
  history.entries.find(entry => entry.transactionId === 'tx-multi-bank')?.amount,
  1250,
  'all 1930 rows in one verification are summed'
)
assertDeepEqual(
  history.defaultEntries.map(entry => entry.transactionId),
  [
    'tx-customer-invoice',
    'tx-import',
    'tx-uncertain-correction',
    'tx-multi-bank',
    'tx-sale',
  ],
  'default bank history hides only structured internal correction pairs'
)
assertDeepEqual(
  history.correctionEntries.map(entry => entry.transactionId),
  ['tx-cost-correction', 'tx-cost'],
  'structured correction and its neutralized original are available for review'
)
assertEqual(
  history.defaultEntries.find(entry => entry.transactionId === 'tx-uncertain-correction')?.kind,
  'uncertain_correction',
  'corrections without original verification link stay visible'
)
assertEqual(
  history.entries.find(entry => entry.transactionId === 'tx-import')?.sourceLabel,
  'Importerad bokföringshistorik',
  'SIE imported bank rows are labelled as imported bookkeeping history'
)
assertEqual(
  history.entries.find(entry => entry.transactionId === 'tx-customer-invoice')?.sourceLabel,
  'Kundfakturabetalning',
  'customer invoice bank rows are labelled clearly'
)

console.log('\nAll bank account history tests passed.\n')
