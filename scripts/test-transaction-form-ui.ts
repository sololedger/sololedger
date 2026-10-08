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
const appPageSource = readFileSync('src/app/page.tsx', 'utf8')

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
  transactionFormSource.includes('Bokför utlandsinköp') &&
    transactionFormSource.includes('Programvara/prenumeration') &&
    transactionFormSource.includes('Avdragsrätt för detta köp') &&
    transactionFormSource.includes('Moms hanteras automatiskt') &&
    !transactionFormSource.includes('Bokför VAT V2') &&
    !transactionFormSource.includes('stödda EU-tjänstvägen') &&
    !transactionFormSource.includes('Beskattningsunderlag'),
  'KAN-22 foreign-purchase UI uses business-language fact capture instead of VAT V2 implementation wording'
)

assert(
  transactionFormSource.includes('xl:grid-cols-12') &&
    transactionFormSource.includes('xl:grid-cols-12 items-start') &&
    !transactionFormSource.includes('xl:grid-cols-12 items-end') &&
    transactionFormSource.includes('xl:col-span-4 flex flex-col gap-1') &&
    transactionFormSource.includes('placeholder="Belopp som momsen ska beräknas på"') &&
    transactionFormSource.includes('w-full min-w-0 p-3 bg-white'),
  'KAN-22 foreign-purchase fact grid top-aligns rows and gives important fields enough responsive width'
)

assert(
  transactionFormSource.includes(
    'className="min-w-0 md:col-span-1 xl:order-4 xl:col-span-4 flex flex-col gap-1"'
  ) &&
    transactionFormSource.includes('xl:order-5 xl:col-span-3 flex flex-col gap-1') &&
    transactionFormSource.includes('xl:order-5 xl:col-span-3 rounded-xl') &&
    transactionFormSource.includes('xl:order-6 xl:col-span-5 flex flex-col gap-1') &&
    !transactionFormSource.includes('showVatV2ManualRate ? \'xl:order-4\' : \'xl:order-5\''),
  'KAN-22 keeps row-two amount, Swedish VAT/rate, and deduction controls in stable positions across purchase types'
)

assert(
  transactionFormSource.includes(
    "vatV2Facts.purchaseClassification ===\n                    'software_subscription_service'"
  ) &&
    transactionFormSource.includes('25 % för stödd programvara/prenumeration.') &&
    transactionFormSource.includes('rounded-xl border border-indigo-100 bg-white px-3 py-2'),
  'KAN-22 derived software VAT field uses an external label plus info-control anatomy'
)

assert(
  transactionFormSource.includes(
    'SoloLedger kan inte avgöra svensk momssats automatiskt för den här tjänsten.'
  ),
  'KAN-22 explains why Annan tjänst asks for Swedish VAT rate'
)

assert(
  transactionFormSource.includes('Varuinköp från utlandet stöds inte ännu') &&
    transactionFormSource.includes(
      'SoloLedger kan därför inte göra en säker momsbedömning för detta köp.'
    ) &&
    transactionFormSource.includes('vatV2GoodsUnsupported') &&
    transactionFormSource.includes(
      'Varuinköp från utlandet stöds inte ännu. SoloLedger kan därför inte göra en säker momsbedömning för detta köp.'
    ),
  'KAN-22 keeps Vara visible but clearly fails closed as unsupported goods flow'
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
  transactionFormSource.includes('categoryRedirectsToFixedAssets') &&
    transactionFormSource.includes('selectedCategoryRedirectsToFixedAssets') &&
    transactionFormSource.includes('Utrustning bokförs under Inventarier') &&
    transactionFormSource.includes('Gå till Inventarier') &&
    transactionFormSource.includes('onOpenFixedAssets') &&
    transactionFormSource.includes('ordinarySalesVatBlocked ||') &&
    transactionFormSource.includes('selectedCategoryRedirectsToFixedAssets'),
  'KAN-36 redirects ordinary 5410 equipment purchases to Inventarier and disables ordinary submit'
)

assert(
  appPageSource.includes('categoryRedirectsToFixedAssets') &&
    appPageSource.includes("setActiveTab('inventarier')") &&
    appPageSource.includes('Utrustning bokförs under Inventarier. Gå till Inventarier') &&
    appPageSource.indexOf('categoryRedirectsToFixedAssets') <
      appPageSource.indexOf('submitInFlightRef.current = true'),
  'KAN-36 submit handler blocks ordinary 5410 before upload/RPC even if the form is submitted by keyboard'
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

assert(
  customerInvoiceUiSource.includes('Kundfordran vid bokslut') &&
    customerInvoiceUiSource.includes('Ingen kundfordran vid bokslut') &&
    !customerInvoiceUiSource.includes('Med i bokslutet') &&
    !customerInvoiceUiSource.includes('Inte med i bokslutet'),
  'Customer invoice year-end badge describes receivable-at-year-end semantics instead of general fiscal-year inclusion'
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

assert(
  customerInvoicesPanelSource.includes('Bokför kundfordran') &&
    customerInvoicesPanelSource.includes('kundfordran vid bokslut') &&
    !customerInvoicesPanelSource.includes('Ta med i bokslutet') &&
    !customerInvoicesPanelSource.includes('Ta med fakturorna i bokslutet') &&
    !customerInvoicesPanelSource.includes('togs med i bokslutet'),
  'Customer invoice panel wording keeps year-end receivable actions explicit'
)

const kan14MigrationSource = readFileSync(
  'supabase/migrations/20261006120000_kan14_vat_v2_no_deduction.sql',
  'utf8'
)
const kan22MigrationSource = readFileSync(
  'supabase/migrations/20261007130000_kan22_vat_v2_business_facts.sql',
  'utf8'
)
const kan36RedirectMigrationSource = readFileSync(
  'supabase/migrations/20261008110000_kan36_redirect_manual_equipment_purchases.sql',
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

assert(
  kan22MigrationSource.includes("p_payload->'business_facts'") &&
    kan22MigrationSource.includes("'businessFacts', v_business_facts") &&
    kan22MigrationSource.includes('Affärsfakta matchar inte stödd EU-tjänst') &&
    !kan22MigrationSource.includes('CREATE TRIGGER'),
  'KAN-22 migration persists validated VAT decision business facts without replaying unrelated triggers'
)

assert(
  kan36RedirectMigrationSource.includes('enforce_manual_equipment_purchase_redirect') &&
    kan36RedirectMigrationSource.includes("coalesce(NEW.source, 'manual') <> 'manual'") &&
    kan36RedirectMigrationSource.includes('coalesce(NEW.is_correction, false)') &&
    kan36RedirectMigrationSource.includes("v_debit_account = '5410'") &&
    kan36RedirectMigrationSource.includes('BEFORE INSERT OR UPDATE OF type, user_id, source, is_correction') &&
    !kan36RedirectMigrationSource.includes('DELETE FROM public.accounts') &&
    !kan36RedirectMigrationSource.includes('DROP TABLE'),
  'KAN-36 database guard redirects only ordinary manual 5410 transactions without banning the account globally'
)

console.log('Transaction form UI regression tests passed.')
