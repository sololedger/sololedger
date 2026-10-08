import {
  calculateBookedInputVatDeduction,
  transactionVatBadges,
} from '../src/lib/transactionVatPresentation.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`)
  }
}

const ordinaryPurchase = {
  source: 'manual',
  vat_rate: 25,
}

assertEqual(
  calculateBookedInputVatDeduction([
    { account_number: '5420', debit: 125 },
    { account_number: '1930', debit: 0 },
  ]),
  0,
  'A purchase with no 264x debit has zero booked input VAT deduction'
)

assertEqual(
  calculateBookedInputVatDeduction([
    { account_number: '5420', debit: 100 },
    { account_number: '2641', debit: 25 },
    { account_number: '1930', debit: 0 },
  ]),
  25,
  'Booked input VAT deduction is derived from 264x debit journal rows'
)

assertEqual(
  calculateBookedInputVatDeduction([
    { account_number: '2641', debit: 25 },
    { account_number: '2648', debit: '12,5' },
  ]),
  25,
  'Only numeric 264x debit amounts are included'
)

const noDeductionBadges = transactionVatBadges({
  transaction: ordinaryPurchase,
  journalRows: [
    { account_number: '5420', debit: 125 },
    { account_number: '1930', debit: 0 },
  ],
  isSystemManaged: false,
  isIncome: false,
})

assertEqual(noDeductionBadges.length, 2, 'Ordinary purchase gets VAT badges')
assertEqual(noDeductionBadges[0]?.label, 'Fakturamoms', 'Stored positive VAT rate is presented as invoice VAT')
assertEqual(noDeductionBadges[0]?.value, '25 %', 'Invoice VAT rate is formatted clearly')
assertEqual(noDeductionBadges[1]?.label, 'Momsavdrag', 'Purchase shows actual VAT deduction')
assertEqual(noDeductionBadges[1]?.value, '0 kr', 'No 264x debit is shown as zero VAT deduction')

const fullDeductionBadges = transactionVatBadges({
  transaction: ordinaryPurchase,
  journalRows: [
    { account_number: '5420', debit: 100 },
    { account_number: '2641', debit: 25 },
    { account_number: '1930', debit: 0 },
  ],
  isSystemManaged: false,
  isIncome: false,
})

assertEqual(fullDeductionBadges[1]?.value, '25 kr', 'Full deduction displays the booked 2641 amount')

const historicalZeroBadges = transactionVatBadges({
  transaction: { source: 'manual', vat_rate: 0 },
  journalRows: [
    { account_number: '5420', debit: 125 },
    { account_number: '1930', debit: 0 },
  ],
  isSystemManaged: false,
  isIncome: false,
})

assertEqual(
  historicalZeroBadges[0]?.label,
  'Registrerad moms',
  'A zero VAT rate without stronger invoice facts keeps historical wording'
)
assertEqual(historicalZeroBadges[0]?.value, '0 %', 'Historical zero VAT rate remains visible')
assertEqual(historicalZeroBadges[1]?.value, '0 kr', 'Historical zero deduction still comes from journal rows')

assertEqual(
  transactionVatBadges({
    transaction: { source: 'vat_v2', vat_rate: 25 },
    journalRows: [{ account_number: '2641', debit: 25 }],
    isSystemManaged: true,
    isIncome: false,
  }).length,
  0,
  'VAT V2/system-managed rows keep their specialized table presentation'
)

assertEqual(
  transactionVatBadges({
    transaction: { source: 'manual', vat_rate: 25 },
    journalRows: [{ account_number: '2611', debit: 0 }],
    isSystemManaged: false,
    isIncome: true,
  }).length,
  0,
  'Income rows keep the existing generic VAT-rate badge'
)

assertEqual(
  transactionVatBadges({
    transaction: { source: 'manual', vat_rate: 25, is_correction: true },
    journalRows: [{ account_number: '2641', debit: 25 }],
    isSystemManaged: false,
    isIncome: false,
  }).length,
  0,
  'Correction rows are not reinterpreted by the purchase VAT helper'
)

assertEqual(
  transactionVatBadges({
    transaction: { source: 'manual', vat_rate: 25, is_periodized_reversal: true },
    journalRows: [{ account_number: '1790', debit: 125 }],
    isSystemManaged: false,
    isIncome: false,
  }).length,
  0,
  'Periodization reversal rows are not shown as new invoice VAT purchases'
)

const periodizedInitialBadges = transactionVatBadges({
  transaction: { source: 'manual', vat_rate: 25, is_periodized_reversal: false },
  journalRows: [
    { account_number: '1790', debit: 100 },
    { account_number: '2641', debit: 25 },
    { account_number: '1930', debit: 0 },
  ],
  isSystemManaged: false,
  isIncome: false,
})

assertEqual(
  periodizedInitialBadges[1]?.value,
  '25 kr',
  'The initial periodization purchase can show the actually booked VAT deduction'
)

assert(
  transactionVatBadges({
    transaction: { source: 'unknown_future_source', vat_rate: 25 },
    journalRows: [{ account_number: '2641', debit: 25 }],
    isSystemManaged: false,
    isIncome: false,
  }).length === 0,
  'Unknown future sources are not treated as ordinary purchase rows'
)

console.log('Transaction VAT presentation tests passed.')
