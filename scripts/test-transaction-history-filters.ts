import { readFileSync } from 'node:fs'
import {
  DEFAULT_TRANSACTION_HISTORY_FILTERS,
  filterAndSortTransactionHistoryItems,
  hasActiveTransactionHistoryFilters,
  type TransactionHistoryFilterItem,
  type TransactionHistoryFilterState,
} from '../src/lib/transactionHistoryFilters.ts'

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

function filters(partial: Partial<TransactionHistoryFilterState>): TransactionHistoryFilterState {
  return {
    ...DEFAULT_TRANSACTION_HISTORY_FILTERS,
    ...partial,
  }
}

function ids(items: TransactionHistoryFilterItem[]) {
  return items.map(item => String(item.tx.id))
}

const accounts = [
  { id: 'programvaror', name: 'Programvaror', debit_account: '5420', credit_account: '1930' },
  { id: 'forsaljning', name: 'Försäljning', debit_account: '1930', credit_account: '3010' },
  { id: 'skatter_avgifter', name: 'Skatter och avgifter', debit_account: '2012', credit_account: '1930' },
]

const items: TransactionHistoryFilterItem[] = [
  {
    tx: {
      id: 'tx-adobe',
      date: '2026-06-01',
      description: 'Adobe Creative Cloud',
      amount: 1250,
      type: 'programvaror',
      source: 'manual',
    },
    journal: [
      { id: 'je-adobe-1', account_number: '5420', debit: 1000, credit: 0, ver_nr: 12 },
      { id: 'je-adobe-2', account_number: '2641', debit: 250, credit: 0, ver_nr: 12 },
      { id: 'je-adobe-3', account_number: '1930', debit: 0, credit: 1250, ver_nr: 12 },
    ],
    verNr: 12,
    accountDef: accounts[0],
    originalIndex: 0,
  },
  {
    tx: {
      id: 'tx-income',
      date: '2026-06-01',
      description: 'Kundprojekt betalning',
      amount: 10000,
      type: 'forsaljning',
      source: 'customer_invoice',
      customer_invoice_id: 'invoice-123',
    },
    journal: [
      { id: 'je-income-1', account_number: '1930', debit: 10000, credit: 0, ver_nr: 13 },
      { id: 'je-income-2', account_number: '3010', debit: 0, credit: 8000, ver_nr: 13 },
      { id: 'je-income-3', account_number: '2611', debit: 0, credit: 2000, ver_nr: 13 },
    ],
    verNr: 13,
    accountDef: accounts[1],
    originalIndex: 1,
  },
  {
    tx: {
      id: 'tx-tax',
      date: '2026-05-30',
      description: 'F-skatt januari',
      amount: 5000,
      type: 'skatter_avgifter',
      source: 'tax_account_movement',
    },
    journal: [
      { id: 'je-tax-1', account_number: '2012', debit: 5000, credit: 0, ver_nr: 14 },
      { id: 'je-tax-2', account_number: '1930', debit: 0, credit: 5000, ver_nr: 14 },
    ],
    verNr: 14,
    accountDef: accounts[2],
    isTaxAccountMovement: true,
    originalIndex: 2,
  },
  {
    tx: {
      id: 'tx-vat-closing',
      date: '2026-05-30',
      description: 'Momsavslut Q1',
      amount: 0,
      type: 'vat_closing',
      source: 'vat_closing',
    },
    journal: [
      { id: 'je-vat-1', account_number: '2611', debit: 2000, credit: 0, ver_nr: 15 },
      { id: 'je-vat-2', account_number: '2641', debit: 0, credit: 250, ver_nr: 15 },
      { id: 'je-vat-3', account_number: '2650', debit: 0, credit: 1750, ver_nr: 15 },
    ],
    verNr: 15,
    isSystemManaged: true,
    isVatClosing: true,
    originalIndex: 3,
  },
  {
    tx: {
      id: 'tx-sie-undo-a',
      date: '2026-05-29',
      description: 'Ångrad SIE-import: bank.se -- korrigering av VER-90',
      amount: 100,
      source: 'sie_import_undo',
      import_batch_id: 'batch-1',
    },
    journal: [
      { id: 'je-undo-a-1', account_number: '1930', debit: 100, credit: 0, ver_nr: 20 },
      { id: 'je-undo-a-2', account_number: '4010', debit: 0, credit: 100, ver_nr: 20 },
    ],
    verNr: 20,
    isSystemManaged: true,
    isSieUndo: true,
    originalIndex: 4,
  },
  {
    tx: {
      id: 'tx-sie-undo-b',
      date: '2026-05-29',
      description: 'Ångrad SIE-import: andra raden',
      amount: 200,
      source: 'sie_import_undo',
      import_batch_id: 'batch-1',
    },
    journal: [
      { id: 'je-undo-b-1', account_number: '1930', debit: 200, credit: 0, ver_nr: 21 },
      { id: 'je-undo-b-2', account_number: '3010', debit: 0, credit: 200, ver_nr: 21 },
    ],
    verNr: 21,
    isSystemManaged: true,
    isSieUndo: true,
    originalIndex: 5,
  },
  {
    tx: {
      id: 'tx-correction',
      date: '2026-05-28',
      description: '↩ Korrigering av Adobe Creative Cloud',
      amount: 1250,
      type: 'programvaror',
      source: 'manual',
      is_correction: true,
      corrects_ver_nr: 12,
    },
    journal: [
      { id: 'je-correction-1', account_number: '1930', debit: 1250, credit: 0, ver_nr: 22 },
      { id: 'je-correction-2', account_number: '5420', debit: 0, credit: 1000, ver_nr: 22 },
      { id: 'je-correction-3', account_number: '2641', debit: 0, credit: 250, ver_nr: 22 },
    ],
    verNr: 22,
    accountDef: accounts[0],
    originalIndex: 6,
  },
]

function apply(partial: Partial<TransactionHistoryFilterState>) {
  return filterAndSortTransactionHistoryItems({
    items,
    filters: filters(partial),
    accounts,
  })
}

function applyTo(
  sourceItems: TransactionHistoryFilterItem[],
  partial: Partial<TransactionHistoryFilterState>
) {
  return filterAndSortTransactionHistoryItems({
    items: sourceItems,
    filters: filters(partial),
    accounts,
  })
}

console.log('\n=== SoloLedger Transaction History Filter Tests ===\n')

assertEqual(hasActiveTransactionHistoryFilters(DEFAULT_TRANSACTION_HISTORY_FILTERS), false, 'default filters are inactive')
assertEqual(hasActiveTransactionHistoryFilters(filters({ search: 'adobe' })), true, 'search activates filter controls')
assertEqual(hasActiveTransactionHistoryFilters(filters({ category: 'costs' })), true, 'category activates filter controls')
assertEqual(hasActiveTransactionHistoryFilters(filters({ sort: 'amount_desc' })), true, 'non-default sort activates result count')

assertDeepEqual(
  ids(apply({ search: 'Adobe', category: 'costs' })),
  ['tx-adobe', 'tx-correction'],
  'Adobe search combines with cost category and keeps the correction row'
)
assertDeepEqual(ids(apply({ search: 'VER-12' })), ['tx-adobe', 'tx-correction'], 'VER search finds original and correction reference')
assertDeepEqual(ids(apply({ search: 'Programvaror' })), ['tx-adobe', 'tx-correction'], 'account name search uses existing account metadata')
assertDeepEqual(ids(apply({ search: '1930' })).length, 6, 'account number search finds rows with matching journal account')
assertDeepEqual(ids(apply({ search: 'invoice-123' })), ['tx-income'], 'existing invoice id text is searchable without extra database data')

assertDeepEqual(ids(apply({ category: 'income' })), ['tx-income', 'tx-sie-undo-b', 'tx-sie-undo-a'], 'income category uses booked 3xxx accounts and preserves matched SIE undo batch')
assertDeepEqual(ids(apply({ category: 'costs' })), ['tx-adobe', 'tx-sie-undo-b', 'tx-sie-undo-a', 'tx-correction'], 'cost category uses booked 4xxx-8xxx accounts and preserves matched SIE undo batch')
assertDeepEqual(ids(apply({ category: 'customer_invoices' })), ['tx-income'], 'customer invoice category uses the customer_invoice source')
assertDeepEqual(ids(apply({ category: 'vat_tax' })), ['tx-vat-closing', 'tx-tax'], 'VAT/tax category uses verified VAT and tax source values only')
assertDeepEqual(ids(apply({ category: 'imports' })), ['tx-sie-undo-b', 'tx-sie-undo-a'], 'import category includes SIE undo rows')

assertDeepEqual(
  ids(apply({ search: 'bank.se' })),
  ['tx-sie-undo-b', 'tx-sie-undo-a'],
  'matching one SIE undo row keeps the whole undo batch together'
)
assertDeepEqual(
  ids(apply({ sort: 'amount_desc' })).slice(0, 3),
  ['tx-income', 'tx-tax', 'tx-adobe'],
  'amount descending sort is deterministic'
)
assertDeepEqual(
  ids(apply({ sort: 'amount_asc' })).slice(0, 3),
  ['tx-vat-closing', 'tx-sie-undo-a', 'tx-sie-undo-b'],
  'amount ascending sort is deterministic'
)
assertDeepEqual(
  ids(apply({ sort: 'date_asc' })).slice(0, 2),
  ['tx-correction', 'tx-sie-undo-a'],
  'oldest-first sort uses date ascending with stable fallback'
)
assertDeepEqual(
  ids(apply({ sort: 'ver_desc' })).slice(0, 3),
  ['tx-correction', 'tx-sie-undo-b', 'tx-sie-undo-a'],
  'verification-number sort uses highest verification first'
)

const resultAccountItems: TransactionHistoryFilterItem[] = [
  {
    tx: { id: 'tx-sale-3xxx', date: '2026-07-01', description: 'Vanlig försäljning', amount: 1000 },
    journal: [
      { id: 'je-sale-1', account_number: '1930', debit: 1000, credit: 0, ver_nr: 30 },
      { id: 'je-sale-2', account_number: '3010', debit: 0, credit: 1000, ver_nr: 30 },
    ],
    verNr: 30,
  },
  {
    tx: { id: 'tx-interest-8310', date: '2026-07-02', description: 'Ränteintäkt 8310', amount: 10 },
    journal: [
      { id: 'je-8310-1', account_number: '1930', debit: 10, credit: 0, ver_nr: 31 },
      { id: 'je-8310-2', account_number: '8310', debit: 0, credit: 10, ver_nr: 31 },
    ],
    verNr: 31,
  },
  {
    tx: { id: 'tx-interest-8330', date: '2026-07-03', description: 'Ränteintäkt 8330', amount: 20 },
    journal: [
      { id: 'je-8330-1', account_number: '1930', debit: 20, credit: 0, ver_nr: 32 },
      { id: 'je-8330-2', account_number: '8330', debit: 0, credit: 20, ver_nr: 32 },
    ],
    verNr: 32,
  },
  {
    tx: { id: 'tx-material-4xxx', date: '2026-07-04', description: 'Materialkostnad', amount: 400 },
    journal: [
      { id: 'je-4xxx-1', account_number: '4010', debit: 400, credit: 0, ver_nr: 33 },
      { id: 'je-4xxx-2', account_number: '1930', debit: 0, credit: 400, ver_nr: 33 },
    ],
    verNr: 33,
  },
  {
    tx: { id: 'tx-interest-8410', date: '2026-07-05', description: 'Räntekostnad 8410', amount: 30 },
    journal: [
      { id: 'je-8410-1', account_number: '8410', debit: 30, credit: 0, ver_nr: 34 },
      { id: 'je-8410-2', account_number: '1930', debit: 0, credit: 30, ver_nr: 34 },
    ],
    verNr: 34,
  },
  {
    tx: { id: 'tx-interest-8430', date: '2026-07-06', description: 'Räntekostnad 8430', amount: 40 },
    journal: [
      { id: 'je-8430-1', account_number: '8430', debit: 40, credit: 0, ver_nr: 35 },
      { id: 'je-8430-2', account_number: '1930', debit: 0, credit: 40, ver_nr: 35 },
    ],
    verNr: 35,
  },
  {
    tx: { id: 'tx-vat-only', date: '2026-07-07', description: 'Momsbalans', amount: 250 },
    journal: [
      { id: 'je-vat-only-1', account_number: '2641', debit: 250, credit: 0, ver_nr: 36 },
      { id: 'je-vat-only-2', account_number: '1930', debit: 0, credit: 250, ver_nr: 36 },
    ],
    verNr: 36,
  },
  {
    tx: { id: 'tx-tax-balance', date: '2026-07-08', description: 'Skattekonto balans', amount: 500 },
    journal: [
      { id: 'je-tax-balance-1', account_number: '1630', debit: 500, credit: 0, ver_nr: 37 },
      { id: 'je-tax-balance-2', account_number: '1930', debit: 0, credit: 500, ver_nr: 37 },
    ],
    verNr: 37,
  },
  {
    tx: { id: 'tx-multi-balance-result', date: '2026-07-09', description: 'Resultat och balans', amount: 600 },
    journal: [
      { id: 'je-multi-1', account_number: '1930', debit: 600, credit: 0, ver_nr: 38 },
      { id: 'je-multi-2', account_number: '3010', debit: 0, credit: 500, ver_nr: 38 },
      { id: 'je-multi-3', account_number: '2611', debit: 0, credit: 100, ver_nr: 38 },
    ],
    verNr: 38,
  },
]

assertDeepEqual(
  ids(applyTo(resultAccountItems, { category: 'income' })),
  ['tx-multi-balance-result', 'tx-interest-8330', 'tx-interest-8310', 'tx-sale-3xxx'],
  'income category follows result engine for 3xxx plus 8310 and 8330'
)
assertDeepEqual(
  ids(applyTo(resultAccountItems, { category: 'costs' })),
  ['tx-interest-8430', 'tx-interest-8410', 'tx-material-4xxx'],
  'cost category follows result engine for 4xxx plus 8410 and 8430'
)
assertDeepEqual(
  ids(applyTo(resultAccountItems, { category: 'vat_tax' })),
  [],
  'VAT/tax category does not match ordinary transactions just because they include VAT or tax accounts'
)
assertDeepEqual(
  ids(applyTo(resultAccountItems, { category: 'costs' })),
  ['tx-interest-8430', 'tx-interest-8410', 'tx-material-4xxx'],
  'VAT and tax balance accounts do not turn ordinary rows into costs'
)

const dateAmountItems: TransactionHistoryFilterItem[] = [
  {
    tx: {
      id: 'tx-sep-cost-15000',
      date: '2026-09-15',
      description: 'Septemberkostnad',
      amount: 15000,
    },
    journal: [
      { id: 'je-sep-cost-1', account_number: '4010', debit: 15000, credit: 0, ver_nr: 60 },
      { id: 'je-sep-cost-2', account_number: '1930', debit: 0, credit: 15000, ver_nr: 60 },
    ],
    verNr: 60,
  },
  {
    tx: {
      id: 'tx-sep-income-25000',
      date: '2026-09-20',
      description: 'Septemberintäkt',
      amount: 25000,
    },
    journal: [
      { id: 'je-sep-income-1', account_number: '1930', debit: 25000, credit: 0, ver_nr: 61 },
      { id: 'je-sep-income-2', account_number: '3010', debit: 0, credit: 25000, ver_nr: 61 },
    ],
    verNr: 61,
  },
  {
    tx: {
      id: 'tx-sep-small-1930',
      date: '2026-09-25',
      description: 'Litet belopp utan bankkonto',
      amount: 1930,
    },
    journal: [
      { id: 'je-small-1', account_number: '4010', debit: 1930, credit: 0, ver_nr: 62 },
      { id: 'je-small-2', account_number: '2440', debit: 0, credit: 1930, ver_nr: 62 },
    ],
    verNr: 62,
  },
  {
    tx: {
      id: 'tx-oct-income-15000',
      date: '2026-10-01',
      description: 'Oktoberintäkt',
      amount: 15000,
    },
    journal: [
      { id: 'je-oct-income-1', account_number: '1930', debit: 15000, credit: 0, ver_nr: 63 },
      { id: 'je-oct-income-2', account_number: '3010', debit: 0, credit: 15000, ver_nr: 63 },
    ],
    verNr: 63,
  },
  {
    tx: {
      id: 'tx-2027-cost-15000',
      date: '2027-01-05',
      description: 'Nästa års kostnad',
      amount: 15000,
    },
    journal: [
      { id: 'je-2027-cost-1', account_number: '4010', debit: 15000, credit: 0, ver_nr: 64 },
      { id: 'je-2027-cost-2', account_number: '2440', debit: 0, credit: 15000, ver_nr: 64 },
    ],
    verNr: 64,
  },
]

assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '2026-09-15' })),
  ['tx-sep-cost-15000'],
  'search finds an exact transaction date'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '2026-09' })),
  ['tx-sep-small-1930', 'tx-sep-income-25000', 'tx-sep-cost-15000'],
  'search finds all transactions in a year-month'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '2026' })),
  ['tx-oct-income-15000', 'tx-sep-small-1930', 'tx-sep-income-25000', 'tx-sep-cost-15000'],
  'search finds all transactions in a year'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '15000' })),
  ['tx-2027-cost-15000', 'tx-oct-income-15000', 'tx-sep-cost-15000'],
  'plain large amount search finds matching transaction amounts'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '15 000' })),
  ['tx-2027-cost-15000', 'tx-oct-income-15000', 'tx-sep-cost-15000'],
  'amount search accepts Swedish thousands spacing'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '15000,00' })),
  ['tx-2027-cost-15000', 'tx-oct-income-15000', 'tx-sep-cost-15000'],
  'amount search accepts comma decimals'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '15000.00' })),
  ['tx-2027-cost-15000', 'tx-oct-income-15000', 'tx-sep-cost-15000'],
  'amount search accepts dot decimals'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '1930' })),
  ['tx-oct-income-15000', 'tx-sep-small-1930', 'tx-sep-income-25000', 'tx-sep-cost-15000'],
  'account 1930 search still uses account numbers and can also match an exact 1930 kr amount'
)
assertDeepEqual(
  ids(applyTo(dateAmountItems, { search: '15000', category: 'costs' })),
  ['tx-2027-cost-15000', 'tx-sep-cost-15000'],
  'amount search combines with category filters'
)

const shortAmountItems: TransactionHistoryFilterItem[] = [
  {
    tx: {
      id: 'tx-foreign-vat-v2-228',
      date: '2026-11-18',
      description: 'Utlandsinköp kort belopp',
      amount: 228,
      source: 'vat_v2',
    },
    journal: [
      { id: 'je-foreign-228-1', account_number: '4535', debit: 228, credit: 0, ver_nr: 83 },
      { id: 'je-foreign-228-2', account_number: '2614', debit: 57, credit: 0, ver_nr: 83 },
      { id: 'je-foreign-228-3', account_number: '2645', debit: 0, credit: 57, ver_nr: 83 },
      { id: 'je-foreign-228-4', account_number: '1930', debit: 0, credit: 228, ver_nr: 83 },
    ],
    verNr: 83,
  },
  {
    tx: {
      id: 'tx-vat-228-ver139',
      date: '2026-11-10',
      description: 'Momsavräkning kort belopp',
      amount: 228,
      source: 'vat_settlement',
    },
    journal: [
      { id: 'je-vat-228-139-1', account_number: '2650', debit: 228, credit: 0, ver_nr: 139 },
      { id: 'je-vat-228-139-2', account_number: '2012', debit: 0, credit: 228, ver_nr: 139 },
    ],
    verNr: 139,
  },
  {
    tx: {
      id: 'tx-vat-228-ver140',
      date: '2026-11-11',
      description: 'Skattekontohändelse kort belopp',
      amount: 228,
      source: 'tax_account_movement',
    },
    journal: [
      { id: 'je-vat-228-140-1', account_number: '2012', debit: 228, credit: 0, ver_nr: 140 },
      { id: 'je-vat-228-140-2', account_number: '1630', debit: 0, credit: 228, ver_nr: 140 },
    ],
    verNr: 140,
  },
  {
    tx: {
      id: 'tx-manual-140-amount',
      date: '2026-11-12',
      description: 'Exakt kort kostnadsbelopp',
      amount: 140,
      source: 'manual',
    },
    journal: [
      { id: 'je-140-1', account_number: '4010', debit: 140, credit: 0, ver_nr: 77 },
      { id: 'je-140-2', account_number: '2440', debit: 0, credit: 140, ver_nr: 77 },
    ],
    verNr: 77,
  },
  {
    tx: {
      id: 'tx-1930-amount',
      date: '2026-11-13',
      description: 'Exakt belopp nittonhundratrettio',
      amount: 1930,
      source: 'manual',
    },
    journal: [
      { id: 'je-1930-amount-1', account_number: '4010', debit: 1930, credit: 0, ver_nr: 78 },
      { id: 'je-1930-amount-2', account_number: '2440', debit: 0, credit: 1930, ver_nr: 78 },
    ],
    verNr: 78,
  },
  {
    tx: {
      id: 'tx-1930-account',
      date: '2026-11-14',
      description: 'Bankkonto utan samma belopp',
      amount: 999,
      source: 'manual',
    },
    journal: [
      { id: 'je-1930-account-1', account_number: '1930', debit: 999, credit: 0, ver_nr: 79 },
      { id: 'je-1930-account-2', account_number: '3010', debit: 0, credit: 999, ver_nr: 79 },
    ],
    verNr: 79,
  },
  {
    tx: {
      id: 'tx-zero-amount',
      date: '2026-11-15',
      description: 'Nollbelopp',
      amount: 0,
      source: 'vat_closing',
    },
    journal: [
      { id: 'je-zero-1', account_number: '2650', debit: 0, credit: 0, ver_nr: 80 },
    ],
    verNr: 80,
  },
  {
    tx: {
      id: 'tx-decimal-22850',
      date: '2026-11-16',
      description: 'Decimalbelopp',
      amount: 228.5,
      source: 'manual',
    },
    journal: [
      { id: 'je-decimal-1', account_number: '4010', debit: 228.5, credit: 0, ver_nr: 81 },
      { id: 'je-decimal-2', account_number: '2440', debit: 0, credit: 228.5, ver_nr: 81 },
    ],
    verNr: 81,
  },
  {
    tx: {
      id: 'tx-larger-1228',
      date: '2026-11-17',
      description: 'Större kostnad',
      amount: 1228,
      source: 'manual',
    },
    journal: [
      { id: 'je-larger-1', account_number: '4010', debit: 1228, credit: 0, ver_nr: 82 },
      { id: 'je-larger-2', account_number: '2440', debit: 0, credit: 1228, ver_nr: 82 },
    ],
    verNr: 82,
  },
]

assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '228' })),
  ['tx-foreign-vat-v2-228', 'tx-vat-228-ver140', 'tx-vat-228-ver139'],
  'short amount search finds exact 228 kr amounts without matching larger 1228 kr or decimal amounts'
)
assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '228', category: 'vat_tax' })),
  ['tx-vat-228-ver140', 'tx-vat-228-ver139'],
  'short amount search combines with VAT/tax category without including VAT V2 foreign purchases'
)
assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '228', category: 'foreign_purchases' })),
  ['tx-foreign-vat-v2-228'],
  'short amount search combines with foreign purchase category'
)
assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '140' })),
  ['tx-manual-140-amount', 'tx-vat-228-ver140'],
  'short search 140 finds both exact 140 kr amount and VER-140'
)
assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '1930' })),
  ['tx-foreign-vat-v2-228', 'tx-1930-account', 'tx-1930-amount'],
  '1930 search finds account 1930 rows and exact 1930 kr amount'
)
assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '0,00' })),
  ['tx-zero-amount'],
  'amount search finds zero kronor with explicit decimal notation'
)
assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '228,50' })),
  ['tx-decimal-22850'],
  'amount search accepts comma decimals for short amounts'
)
assertDeepEqual(
  ids(applyTo(shortAmountItems, { search: '228.50' })),
  ['tx-decimal-22850'],
  'amount search accepts dot decimals for short amounts'
)

const sourceCategoryItems: TransactionHistoryFilterItem[] = [
  {
    tx: { id: 'tx-manual-vat-purchase', date: '2026-08-01', description: 'Vanligt inköp med moms', source: 'manual' },
    journal: [
      { id: 'je-manual-vat-1', account_number: '4010', debit: 100, credit: 0, ver_nr: 40 },
      { id: 'je-manual-vat-2', account_number: '2641', debit: 25, credit: 0, ver_nr: 40 },
      { id: 'je-manual-vat-3', account_number: '1930', debit: 0, credit: 125, ver_nr: 40 },
    ],
    verNr: 40,
  },
  {
    tx: { id: 'tx-vat-close-source', date: '2026-08-02', description: 'Momsavslut', source: 'vat_closing' },
    journal: [{ id: 'je-vat-close-source', account_number: '2650', debit: 1, credit: 0, ver_nr: 41 }],
    verNr: 41,
  },
  {
    tx: { id: 'tx-vat-settlement-source', date: '2026-08-03', description: 'Momsavräkning', source: 'vat_settlement' },
    journal: [{ id: 'je-vat-settlement-source', account_number: '2650', debit: 1, credit: 0, ver_nr: 42 }],
    verNr: 42,
  },
  {
    tx: { id: 'tx-tax-movement-source', date: '2026-08-04', description: 'Skattekontorörelse', source: 'tax_account_movement' },
    journal: [{ id: 'je-tax-movement-source', account_number: '2012', debit: 1, credit: 0, ver_nr: 43 }],
    verNr: 43,
  },
  {
    tx: { id: 'tx-vat-v2-source', date: '2026-08-05', description: 'VAT V2 utlandsinköp', source: 'vat_v2' },
    journal: [{ id: 'je-vat-v2-source', account_number: '2614', debit: 1, credit: 0, ver_nr: 44 }],
    verNr: 44,
  },
  {
    tx: { id: 'tx-sie-import', date: '2026-08-02', description: 'Importerad SIE', source: 'sie_import' },
    journal: [{ id: 'je-sie', account_number: '3010', debit: 0, credit: 1, ver_nr: 45 }],
    verNr: 45,
    isImported: true,
    isSystemManaged: true,
  },
  {
    tx: { id: 'tx-opening-balance', date: '2026-08-03', description: 'Ingående balans', source: 'sie_opening_balance' },
    journal: [{ id: 'je-opening-balance', account_number: '1930', debit: 1, credit: 0, ver_nr: 46 }],
    verNr: 46,
    isOpeningBalance: true,
    isSystemManaged: true,
  },
  {
    tx: {
      id: 'tx-sie-undo-source',
      date: '2026-08-04',
      description: 'Ångrad SIE-import',
      source: 'sie_import_undo',
      import_batch_id: 'source-batch',
    },
    journal: [{ id: 'je-sie-undo-source', account_number: '4010', debit: 0, credit: 1, ver_nr: 47 }],
    verNr: 47,
    isSieUndo: true,
    isSystemManaged: true,
  },
  {
    tx: { id: 'tx-customer-invoice', date: '2026-08-03', description: 'Kundfaktura', source: 'customer_invoice' },
    journal: [{ id: 'je-invoice', account_number: '3010', debit: 0, credit: 1, ver_nr: 48 }],
    verNr: 48,
    isSystemManaged: true,
  },
  {
    tx: { id: 'tx-fixed-asset-source', date: '2026-08-06', description: 'Inventarie', source: 'fixed_asset' },
    journal: [{ id: 'je-fixed-asset-source', account_number: '1220', debit: 1, credit: 0, ver_nr: 49 }],
    verNr: 49,
  },
  {
    tx: { id: 'tx-fixed-asset-reclass-source', date: '2026-08-07', description: 'Inventarieomklassning', source: 'fixed_asset_reclassification' },
    journal: [{ id: 'je-fixed-asset-reclass-source', account_number: '1220', debit: 1, credit: 0, ver_nr: 50 }],
    verNr: 50,
  },
  {
    tx: { id: 'tx-fixed-asset-depreciation-source', date: '2026-08-08', description: 'Inventarieavskrivning', source: 'fixed_asset_depreciation' },
    journal: [{ id: 'je-fixed-asset-depreciation-source', account_number: '7830', debit: 1, credit: 0, ver_nr: 51 }],
    verNr: 51,
  },
]

assertDeepEqual(
  ids(applyTo(sourceCategoryItems, { category: 'vat_tax' })),
  ['tx-tax-movement-source', 'tx-vat-settlement-source', 'tx-vat-close-source'],
  'VAT/tax category uses only VAT closing, VAT settlement, and tax movement source values'
)
assertDeepEqual(
  ids(applyTo(sourceCategoryItems, { category: 'foreign_purchases' })),
  ['tx-vat-v2-source'],
  'foreign purchase category uses the VAT V2 source value'
)
assertDeepEqual(
  ids(applyTo(sourceCategoryItems, { category: 'customer_invoices' })),
  ['tx-customer-invoice'],
  'customer invoice category uses only customer_invoice source rows'
)
assertDeepEqual(
  ids(applyTo(sourceCategoryItems, { category: 'income' })),
  ['tx-customer-invoice', 'tx-sie-import'],
  'customer invoices and imports can still overlap with income when they include income accounts'
)
assertDeepEqual(
  ids(applyTo(sourceCategoryItems, { category: 'imports' })),
  ['tx-sie-undo-source', 'tx-opening-balance', 'tx-sie-import'],
  'import category includes SIE import, opening balance, and SIE undo source rows'
)
assertDeepEqual(
  ids(applyTo(sourceCategoryItems, { category: 'fixed_assets' })),
  ['tx-fixed-asset-depreciation-source', 'tx-fixed-asset-reclass-source', 'tx-fixed-asset-source'],
  'fixed asset category includes acquisition, reclassification, and depreciation source rows'
)
assertDeepEqual(
  ids(applyTo(sourceCategoryItems, { search: 'moms', category: 'vat_tax' })),
  ['tx-vat-settlement-source', 'tx-vat-close-source'],
  'search still combines with the new source-based VAT/tax category'
)

const tableSource = readFileSync('src/components/TransactionTable.tsx', 'utf8')
const filterSource = readFileSync('src/lib/transactionHistoryFilters.ts', 'utf8')
const pageSource = readFileSync('src/app/page.tsx', 'utf8')

assertEqual(
  tableSource.includes('filterAndSortTransactionHistoryItems') &&
    tableSource.indexOf('filterAndSortTransactionHistoryItems') <
      tableSource.indexOf('const visibleItems = displayItems.slice'),
  true,
  'TransactionTable filters and sorts before existing show-more pagination'
)
assertEqual(
  tableSource.includes('setVisibleCount(50)') &&
    tableSource.includes('[filters.search, filters.category, filters.sort, transactions.length]'),
  true,
  'TransactionTable resets visible count when search, filter, sort, or loaded history changes'
)
assertEqual(
  tableSource.includes('type="search"') &&
    tableSource.includes('Kategori') &&
    tableSource.includes('Sortering') &&
    tableSource.includes('Rensa') &&
    tableSource.includes('Visar {filteredEnriched.length} inkluderade av {transactions.length} transaktioner') &&
    tableSource.includes('Inga transaktioner matchar sökning eller filter.'),
  true,
  'TransactionTable exposes compact search, category, sort, hit count, reset, and empty-result UI'
)
assertEqual(
  filterSource.includes("label: 'Kundfakturor'") &&
    filterSource.includes("label: 'Utlandsinköp'") &&
    filterSource.includes("label: 'Moms/skatt'") &&
    filterSource.includes("label: 'Import'") &&
    filterSource.includes("label: 'Inventarier'"),
  true,
  'category labels match the final compact KAN-47 filter set'
)
assertEqual(
  tableSource.includes('hidden md:block') && tableSource.includes('md:hidden flex flex-col gap-3'),
  true,
  'TransactionTable keeps both desktop table and mobile card history views'
)
assertEqual(
  pageSource.includes("transactionHistoryViewState === 'table'") &&
    pageSource.includes('<TransactionTable'),
  true,
  'page.tsx still gates TransactionTable behind the verified KAN-35 table state'
)

console.log('\nAll transaction history filter tests passed.\n')
