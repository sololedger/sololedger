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

assert(
  transactionFormSource.includes('domesticSalesVatTreatment') &&
    transactionFormSource.includes('getOrdinarySalesVatPolicy') &&
    transactionFormSource.includes('categoryUsesDomesticSalesVatPolicy') &&
    transactionFormSource.includes('selectedCategoryUsesDomesticSalesVatPolicy') &&
    transactionFormSource.includes('ordinarySalesVatBlocked'),
  'Ordinary Swedish sale VAT UI is driven by domestic sales treatment for every applicable income category, not only VAT registration'
)

assert(
  !transactionFormSource.includes("formData.type === 'forsaljning'") &&
    !transactionFormSource.includes("fav.type === 'forsaljning'") &&
    !transactionFormSource.includes("e.target.value === 'forsaljning'"),
  'Ordinary Swedish sale VAT UI is not scoped to only the canonical forsaljning category ID'
)

const customerInvoiceUiSource = readFileSync(
  'src/lib/customerInvoiceUi.ts',
  'utf8'
)

assert(
  customerInvoiceUiSource.includes('defaultCustomerInvoiceVatTreatment') &&
    customerInvoiceUiSource.includes("domesticSalesVatTreatment === 'small_business_exempt'") &&
    customerInvoiceUiSource.includes("return 'exempt'"),
  'Customer invoice VAT default can safely use domestic exempt profile facts without guessing taxable VAT'
)

assert(
  customerInvoiceUiSource.includes('customerInvoiceCanUndoPayment') &&
    customerInvoiceUiSource.includes("booking.bookingKind === 'historical_payment_same_year'") &&
    customerInvoiceUiSource.includes("booking.bookingKind === 'payment_same_year'") &&
    customerInvoiceUiSource.includes("booking.bookingKind === 'receivable_settlement'"),
  'Customer invoice UI distinguishes historical paid links from normal KAN-46 undoable payments'
)

const customerInvoicesPanelSource = readFileSync(
  'src/components/CustomerInvoicesPanel.tsx',
  'utf8'
)

assert(
  customerInvoicesPanelSource.includes('customerInvoiceCanUndoPayment(invoice)') &&
    customerInvoicesPanelSource.includes('{canUndoPayment && (') &&
    customerInvoicesPanelSource.includes('historisk betalning'),
  'Customer invoice panel hides the normal undo-payment action for historical paid invoice links'
)

const kan14MigrationSource = readFileSync(
  'supabase/migrations/20261006120000_kan14_vat_v2_no_deduction.sql',
  'utf8'
)
const accountingServiceSource = readFileSync(
  'src/lib/accountingService.ts',
  'utf8'
)
const bookTransactionStart = accountingServiceSource.indexOf(
  'export async function bookTransaction'
)
const nextAccountingExport = accountingServiceSource.indexOf(
  '\nexport ',
  bookTransactionStart + 1
)
const bookTransactionSource = accountingServiceSource.slice(
  bookTransactionStart,
  nextAccountingExport === -1
    ? undefined
    : nextAccountingExport
)

assert(
  kan14MigrationSource.includes('enforce_domestic_sales_vat_treatment') &&
    kan14MigrationSource.includes("coalesce(NEW.source, 'manual') <> 'manual'") &&
    kan14MigrationSource.includes('coalesce(NEW.is_correction, false)') &&
    kan14MigrationSource.includes('FROM public.accounts a') &&
    kan14MigrationSource.includes("left(coalesce(v_credit_account, ''), 1) <> '3'") &&
    kan14MigrationSource.includes('profiles p') &&
    kan14MigrationSource.includes("v_vat_status = 'not_registered'") &&
    kan14MigrationSource.includes("'small_business_exempt'") &&
    kan14MigrationSource.includes("'exempt_other'") &&
    kan14MigrationSource.includes("'taxable'") &&
    kan14MigrationSource.includes("v_domestic_sales_vat_treatment IN ('unknown', 'mixed')"),
  'KAN-14 migration server-enforces manual direct-sale income VAT treatment and fails closed for unknown/mixed'
)

assert(
  !kan14MigrationSource.includes("NEW.type IS DISTINCT FROM 'forsaljning'") &&
    kan14MigrationSource.includes('UPDATE OF type, vat_rate, user_id, source, is_correction'),
  'KAN-14 database guard is scoped by provenance and income account taxonomy instead of only one category ID'
)

assert(
  bookTransactionSource.includes('export async function bookTransaction') &&
    bookTransactionSource.includes('book_transaction_atomic') &&
    !bookTransactionSource.includes('source'),
  'Ordinary manual booking path cannot choose a non-manual transaction source to bypass the database guard'
)

console.log('Transaction form UI regression tests passed.')
