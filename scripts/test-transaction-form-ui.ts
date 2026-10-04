import { readFileSync } from 'node:fs'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const transactionFormSource = readFileSync(
  'src/components/TransactionForm.tsx',
  'utf8'
)

assert(
  transactionFormSource.includes(
    'border-gray-200 bg-white text-gray-700 shadow-sm focus:border-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-100'
  ),
  'Date and description fields keep visible input affordance and keyboard focus styling'
)

assert(
  /if \(vatV2RuntimeBooking\.status !== 'ready'\) \{\s*return\s*\}/.test(
    transactionFormSource
  ),
  'Blocked VAT V2 runtime submit does not add a duplicate submit error'
)

assert(
  transactionFormSource.includes("vatV2RuntimeBooking.status === 'blocked'") &&
    transactionFormSource.includes(
      'describeVatV2RuntimeBookingError(runtimeError)'
    ),
  'Blocked VAT V2 runtime errors remain visible in the primary inline status panel'
)

console.log('Transaction form UI regression tests passed.')
