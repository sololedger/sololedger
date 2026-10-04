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
  transactionFormSource.includes(
    "const vatV2BlockedSubmitActive =\r\n    vatV2BlockedSubmitAttempted && vatV2RuntimeBooking.status === 'blocked'"
  ) ||
    transactionFormSource.includes(
      "const vatV2BlockedSubmitActive =\n    vatV2BlockedSubmitAttempted && vatV2RuntimeBooking.status === 'blocked'"
    ),
  'Blocked VAT V2 submit has an explicit attempted-but-blocked UI state'
)

assert(
  transactionFormSource.includes('Kan inte bokföra ännu') &&
    transactionFormSource.includes(
      'Bokföringen stoppades. Åtgärda punkterna nedan och försök igen.'
    ),
  'Blocked VAT V2 submit gets a visible single status-panel response'
)

assert(
  transactionFormSource.includes('vatV2BlockedSubmitMessages') &&
    transactionFormSource.includes('new Set([') &&
    transactionFormSource.includes('...vatV2PreflightBlockerMessages') &&
    transactionFormSource.includes('...vatV2RuntimeBlockerMessages'),
  'Blocked VAT V2 submit shows one deduplicated combined blocker list'
)

assert(
  transactionFormSource.includes(
    "runtimeError.code === 'vat_treatment_not_ready'"
  ),
  'Blocked VAT V2 submit omits the generic treatment-not-ready runtime blocker when detailed preflight blockers exist'
)

assert(
  transactionFormSource.includes(
    'requestAnimationFrame(() => vatV2StatusRef.current?.focus())'
  ) &&
    transactionFormSource.includes(
      "role={vatV2BlockedSubmitActive ? 'alert' : 'status'}"
    ),
  'Blocked VAT V2 submit focuses the existing status panel instead of creating a second error surface'
)

assert(
  !transactionFormSource.includes(
    'setVatV2SubmitError(\n        vatV2RuntimeBooking.errors'
  ),
  'Blocked VAT V2 runtime submit does not add a duplicate submit error'
)

console.log('Transaction form UI regression tests passed.')
