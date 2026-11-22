import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import ts from 'typescript'
import { defaultCustomerInvoiceVatTreatment } from '../src/lib/customerInvoiceUi.ts'
import { categoryUsesDomesticSalesVatPolicy, isOwnerDepositCategoryId } from '../src/lib/accountCategoryUi.ts'
import { getOrdinarySalesVatPolicy } from '../src/lib/domesticSalesVatPolicy.ts'
import { parseStandardBookingAmount } from '../src/lib/standardBookingAmount.ts'
import { analyzePurchaseDescription, findGuideCategory, findPurchaseGuideReferral, getGuideCategoryAvailability } from '../src/lib/purchaseCategoryGuide.ts'

function readSource(file: string, encoding: 'utf8') {
  return readFileSync(file, encoding).replace(/\r\n/g, '\n')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const transactionFormSource = readSource(
  'src/components/TransactionForm.tsx',
  'utf8'
)
const appPageSource = readSource('src/app/page.tsx', 'utf8')

for (const [query, ids, partial = false, equipmentCheck = undefined] of [
  ['Jag köpte kamerahuset med ett objektiv och SD‑kort', 'inventarier', true],
  ['Kameran behöver ett minneskort', 'inventarier', true],
  ['Köpte ett kamerahus med objektiv', 'inventarier', false, 'together'],
  ['Jag köpte ett nytt kamerahus med ett objektiv', 'inventarier', false, 'together'],
  ['Minneskort till kameran', 'inventarier', false, 'reuse'],
  ['Batteri till kameran', 'inventarier', false, 'reuse'],
  ['Nytt batteri till borrmaskinen', 'inventarier', false, 'reuse'],
  ['Ny bildskärm till datorn', 'inventarier', false, 'reuse'],
  ['Monitorn', 'inventarier'],
  ['Fotobakgrund', 'inventarier', false, 'reuse'],
  ['Fotobakgrunden och logi', 'inventarier', true],
  ['Fotobakgrund som förbrukas', 'inventarier', true],
  ['Minneskort till kameran och montering', 'inventarier', true],
  ['Batteri och servicekostnad till kameran', 'inventarier', true],
  ['Bildskärm eller dator', 'inventarier', true],
  ['Köpte ett stativ och en blixt', 'inventarier', false, 'together'],
  ['Stativ och blixt och montering', 'inventarier', true],
  ['Stativ och frakt', 'inventarier,frakt'],
  ['Köpte en kurs i fotografering', 'kurser'],
  ['Köpte en kurs i digital fotografering', 'kurser'],
  ['Adobe Creative Cloud', 'programvaror'],
  ['Adobe Lightroom', 'programvaror'],
  ['Adobe Lightroom abonnemang', 'programvaror'],
  ['Abonnemang på Adobe Lightroom', 'programvaror'],
  ['Capture One prenumeration', 'programvaror'],
  ['Prenumeration på Capture One', 'programvaror'],
  ['Adobe Lightroom abonnemang med IT-support', 'programvaror', true],
  ['Adobe Lightroom abonnemang och montering', 'programvaror', true],
  ['Internet abonnemang och Lightroom', 'programvaror,internet'],
  ['Jag förnyade Lightroom', 'programvaror'],
  ['Program för bokföring', 'programvaror'],
  ['Papper för fotoutskrift', 'varor_material'],
  ['Betalade hyran för studion', 'lokalhyra'],
  ['Bokföringsbyrån hjälpte mig', 'redovisningstjanster', true],
  ['Kurs och frakt till kund', 'kurser,frakt'],
  ['kurs och virke', 'kurser,varor_material'],
  ['Lightroom, monteringsarbete', 'programvaror', true],
  ['frakt Lightroom', 'programvaror,frakt'],
  ['kurs i fotografering och montering', 'kurser', true],
  ['kurs i fotografering frakt', 'kurser,frakt'],
  ['kurs i fotografering frakt till kund', 'kurser,frakt'],
  ['kurs. Montering separat', 'kurser', true],
  ['kamerahus med okänt tillbehör', 'inventarier', true],
  ['Fotokursen och Lightroom', 'kurser,programvaror'],
  ['Program för bokföring och hjälp med bokslutet', 'programvaror,redovisningstjanster'],
  ['Skrivarpapper och fotopappret', 'varor_material,kontorsmaterial'],
  ['Hyra kamera', 'lokalhyra,inventarier'],
  ['Apparat, frakt och Google Ads', 'reklam,frakt'],
  ['Köpte annonser på Meta', 'reklam'],
  ['Meta-annonser', 'reklam'],
  ['Annonser på Google', 'reklam'],
  ['Betalade för extern retusch i ett kunduppdrag', 'kopta_tjanster_kunduppdrag'],
  ['Tåg till ett kunduppdrag', 'resor'],
  ['Kunduppdrag', ''],
  ['Frakt av fotoböcker till kund', 'frakt'],
  ['Porto för brev', 'porto'],
  ['frakt eller porto', 'frakt,porto'],
  ['Fotoböcker med frakt', 'frakt', true],
  ['Försäkring för kamerautrustning', 'foretagsforsakring'],
  ['Mobilabonnemang', 'mobiltelefoni'],
  ['Mobilabonnemang för företaget', 'mobiltelefoni'],
  ['Telefonabonnemang', 'mobiltelefoni'],
  ['Abonnemang för mobil', 'mobiltelefoni'],
  ['Jag betalade ett abonnemang för telefon', 'mobiltelefoni'],
  ['Abonnemang för mobiltelefon', 'mobiltelefoni'],
  ['Abonnemang för bredband', 'internet'],
  ['Abonnemang för internet', 'internet'],
  ['Abonnemang på internet', 'internet'],
  ['Programvaruabonnemang', 'programvaror'],
  ['Abonnemang för programvara', 'programvaror'],
  ['Abonnemang på Lightroom', 'programvaror'],
  ['Prenumeration på Lightroom', 'programvaror'],
  ['Abonnemang', 'programvaror', true],
  ['Prenumeration', 'programvaror', true],
  ['Prenumeration på tidning', 'programvaror', true],
  ['Abonnemang för streaming', 'programvaror', true],
  ['Abonnemang för telefon och tidning', 'mobiltelefoni', true],
  ['Abonnemang för telefon och Lightroom', 'programvaror,mobiltelefoni'],
  ['Abonnemang för mobil eller bredband', 'mobiltelefoni,internet'],
  ['Abonnemang på internet, programvaruabonnemang', 'programvaror,internet'],
  ['Abonnemang på Lightroom med IT-support', 'programvaror', true],
  ['Köpte en mobiltelefon', ''],
  ['Betalade bredbandsabonnemanget', 'internet'],
  ['Webbuppkoppling för studion', 'internet'],
  ['Mobilabonnemang och bredband', 'mobiltelefoni,internet'],
  ['Bankens kontoavgift', 'bankavgift'],
  ['Överföring från bank', ''],
  ['Bankavgift plus ränta', 'bankavgift', true],
  ['Tågbiljett och logi', 'resor', true],
  ['Företagsförsäkring och logi', 'foretagsforsakring', true],
  ['Porto och logi', 'porto', true],
  ['Meta-annonser och logi', 'reklam', true],
  ['Extern retusch och monteringsarbete', 'kopta_tjanster_kunduppdrag', true],
  ['Mobilabonnemang med telefon', 'mobiltelefoni', true],
  ['Webbuppkoppling med router', 'internet', true],
  ['IT-support för Lightroom', 'programvaror', true],
  ['Programvara för drift', 'programvaror', true],
  ['IT-support för företaget', ''],
  ['…', ''],
] as const) {
  const result = analyzePurchaseDescription(query)
  assert(result.matches.map(topic => topic.id).join(',') === ids, `Unexpected guide search result for "${query}"`)
  assert(result.partial === partial, `Unexpected partial-match result for "${query}"`)
  assert(result.equipmentCheck === equipmentCheck, `Unexpected equipment question for "${query}"`)
}

for (const [query, expected] of [
  ['kontorsmatrial', 'kontorsmaterial'], ['mineskort', 'minneskort'],
  ['kontorsmatrial och logi', null], ['mineskort till kameran', null], ['mneskrt', null],
] as const) {
  const result = analyzePurchaseDescription(query)
  assert((result.spellingSuggestion ?? null) === expected, `Unexpected spelling suggestion for "${query}"`)
  if (expected) assert(result.matches.length === 0, 'A spelling suggestion cannot create a category match')
}

for (const [query, expected] of [
  ['Momsbetalning', 'skattekonto'],
  ['Moms har debiterats på skattekontot', 'skattekonto'],
  ['Överfört från företagskontot till skattekontot', 'skattekonto'],
  ['Förde över pengar till skattekontot', 'skattekonto'],
  ['F-skatt', 'skatt-forsta-aret'],
  ['Eget uttag', 'intakt-insattning'],
  ['Egen insättning', 'intakt-insattning'],
  ['Inköp för firman betalt privat', 'privat-betalning'],
] as const) {
  const referral = findPurchaseGuideReferral(query)
  assert(referral?.articleId === expected, `Unexpected help referral for "${query}"`)
}
for (const query of ['Kurs om moms', 'Eget uttag och kurs', 'Batteri till kameran', 'Skatteverket har inte dragit moms']) {
  assert(!findPurchaseGuideReferral(query), `Uncertain or mixed search must not redirect: "${query}"`)
}

const office = { id: 'kontorsmaterial', name: 'Kontorsmaterial', debit_account: '6110', credit_account: '1930', default_vat_rate: 25, hidden_from_new_booking: false }
assert(getGuideCategoryAvailability(office.id, [], true).status === 'missing', 'Missing office supplies')
assert(getGuideCategoryAvailability(office.id, [office], false).status === 'loading', 'Unavailable chart')
assert(getGuideCategoryAvailability(office.id, [{ ...office, hidden_from_new_booking: true }], true).status === 'hidden', 'Hidden office supplies')
assert(getGuideCategoryAvailability(office.id, [{ ...office, hidden_from_new_booking: null }], true).status === 'visibility-unknown', 'Unknown visibility')
assert(getGuideCategoryAvailability(office.id, [{ ...office, default_vat_rate: 12 }], true).status === 'modified', 'Modified office supplies')
assert(getGuideCategoryAvailability(office.id, [office], true).status === 'available', 'Visible standard office supplies')

const standardRows = [
  ['reklam', 'Reklam & annonsering', '5910', 25],
  ['kopta_tjanster_kunduppdrag', 'Köpta tjänster för kunduppdrag', '4600', 25],
  ['frakt', 'Frakt & varutransporter', '5710', 25],
  ['porto', 'Porto', '6250', 25],
  ['resor', 'Resor i verksamheten', '5800', 6],
  ['foretagsforsakring', 'Företagsförsäkring', '6310', 0],
  ['mobiltelefoni', 'Mobiltelefoni', '6212', 25],
  ['internet', 'Internet & datakommunikation', '6230', 25],
  ['bankavgift', 'Bankavgifter', '6570', 0],
] as const
for (const [id, name, debit_account, default_vat_rate] of standardRows) {
  const row = { id, name, debit_account, default_vat_rate, credit_account: '1930', hidden_from_new_booking: false }
  assert(findGuideCategory(id, [row], true)?.account === debit_account, `${id} must resolve to its catalog account`)
  assert(!findGuideCategory(id, [row], false), `${id} must wait for the chart of accounts`)
  assert(!findGuideCategory(id, [], true), `${id} must not be offered when missing`)
  for (const changes of [
    { hidden_from_new_booking: true }, { name: 'Eget namn' },
    { debit_account: '6990' }, { credit_account: '1920' }, { default_vat_rate: 12 },
  ]) {
    assert(!findGuideCategory(id, [{ ...row, ...changes }], true), `${id} must not be offered after ${JSON.stringify(changes)}`)
  }
}
const legacyAdvertising = {
  id: 'reklam', name: 'Reklam & Annonsering', debit_account: '5900', credit_account: '1930',
  default_vat_rate: 25, hidden_from_new_booking: false,
}
assert(!findGuideCategory('reklam', [legacyAdvertising], true), 'The old advertising preset on 5900 must not substitute for 5910')
assert(findGuideCategory('foretagsforsakring', [{
  id: 'forsakring', name: 'Företagsförsäkring', debit_account: '6310', credit_account: '1930',
  default_vat_rate: 0, hidden_from_new_booking: false,
}], true)?.category.id === 'forsakring', 'The unchanged legacy insurance preset on 6310 remains usable')

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

const customerInvoiceUiSource = readSource(
  'src/lib/customerInvoiceUi.ts',
  'utf8'
)

for (const treatment of ['small_business_exempt', 'exempt_other'] as const) {
  assert(
    defaultCustomerInvoiceVatTreatment({
      vatStatus: 'registered', domesticSalesVatTreatment: treatment,
    }) === 'exempt',
    'Registered domestic exempt profile defaults customer invoice VAT to exempt'
  )
}
assert(
  defaultCustomerInvoiceVatTreatment({
    vatStatus: 'not_registered', domesticSalesVatTreatment: 'unknown',
  }) === 'exempt',
  'Not VAT registered defaults customer invoice VAT to exempt'
)
for (const treatment of ['taxable', 'mixed', 'unknown'] as const) {
  assert(
    defaultCustomerInvoiceVatTreatment({
      vatStatus: 'registered', domesticSalesVatTreatment: treatment,
    }) === 'unknown',
    'Taxable or unresolved profile does not silently default to exempt'
  )
}

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

const customerInvoicesPanelSource = readSource(
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

const kan14MigrationSource = readSource(
  'supabase/migrations/20261006120000_kan14_vat_v2_no_deduction.sql',
  'utf8'
)
const kan22MigrationSource = readSource(
  'supabase/migrations/20261007130000_kan22_vat_v2_business_facts.sql',
  'utf8'
)
const kan36RedirectMigrationSource = readSource(
  'supabase/migrations/20261008110000_kan36_redirect_manual_equipment_purchases.sql',
  'utf8'
)
const accountingServiceSource = readSource(
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

// KAN-24: execute the actual effect/dependency array and category/VAT handlers.
// Only synthetic state is provided; no React application, network or DB is started.
const reproduceBefore = process.argv.includes('--reproduce-before')
const normalizationSource = reproduceBefore
  ? execFileSync('git', ['show', '739cb52:src/app/page.tsx'], { encoding: 'utf8' })
  : appPageSource
const pageTree = ts.createSourceFile('page.tsx', normalizationSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const formTree = ts.createSourceFile('TransactionForm.tsx', transactionFormSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let normalization: ts.CallExpression | undefined
let categoryChange: ts.Expression | undefined
let selectCategory: ts.FunctionDeclaration | undefined
let vatChange: ts.Expression | undefined
let categoryVatRate: ts.FunctionDeclaration | undefined
let editableAmounts: ts.IfStatement | undefined
function findNormalization(node: ts.Node) {
  if (ts.isCallExpression(node) && node.expression.getText(pageTree) === 'useEffect' &&
    node.arguments[0]?.getText(pageTree).includes('const selectedCategory = kontoplan.find')) normalization = node
  if (ts.isIfStatement(node) && node.expression.getText(pageTree) === '!editingBooked' &&
    node.thenStatement.getText(pageTree).includes('updatePayload.vat_rate')) editableAmounts = node
  ts.forEachChild(node, findNormalization)
}
function findFormHandlers(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'selectCategory') selectCategory = node
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'categoryVatRate') categoryVatRate = node
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(formTree) === 'select') {
    const attrs = node.attributes.properties.filter(ts.isJsxAttribute)
    const label = attrs.find(attr => attr.name.getText(formTree) === 'aria-label')?.initializer
    const value = attrs.find(attr => attr.name.getText(formTree) === 'value')?.initializer
    const change = attrs.find(attr => attr.name.getText(formTree) === 'onChange')?.initializer
    if (change && ts.isJsxExpression(change)) {
      if (label && ts.isStringLiteral(label) && label.text === 'Kategori') categoryChange = change.expression
      if (value && ts.isJsxExpression(value) && value.expression?.getText(formTree) === 'formData.vatRate') vatChange = change.expression
    }
  }
  ts.forEachChild(node, findFormHandlers)
}
findNormalization(pageTree); findFormHandlers(formTree)
assert(normalization && categoryChange && selectCategory && vatChange && editableAmounts, 'Actual form effect, handlers and saved-amount guard exist')
const accounts = [
  { id: 'cost25', debit_account: '6110', credit_account: '1930', default_vat_rate: 25 },
  { id: 'cost12', debit_account: '6212', credit_account: '1930', default_vat_rate: 12 },
  { id: 'sale', debit_account: '1930', credit_account: '3010', default_vat_rate: 25 },
]
type SyntheticForm = { type: string; vatRate: number; amount: string; description: string; inputVatDeduction: string }
let form: SyntheticForm
const currentForm = (): SyntheticForm => form
const context: Record<string, unknown> = {
  kontoplan: accounts, categoryUsesDomesticSalesVatPolicy, isOwnerDepositCategoryId,
  setFormData(next: SyntheticForm | ((previous: SyntheticForm) => SyntheticForm)) {
    form = typeof next === 'function' ? next(form) : next
    context.formData = form
  },
}
vm.createContext(context)
const operations = vm.runInContext(ts.transpileModule(`
  const normalize = ${normalization.arguments[0].getText(pageTree)};
  const dependencies = () => ${normalization.arguments[1].getText(pageTree)};
  ${categoryVatRate?.getText(formTree) ?? ''}
  ${selectCategory.getText(formTree)}
  const category = ${categoryChange.getText(formTree)};
  const vat = ${vatChange.getText(formTree)};
  ({normalize, dependencies, category, vat})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context) as {
    normalize: () => void; dependencies: () => unknown[]
    category: (event: { target: { value: string } }) => void
    vat: (event: { target: { value: string } }) => void
  }
let previousDependencies: unknown[] | null = null
function render() {
  const dependencies = Array.from(operations.dependencies())
  if (!previousDependencies || dependencies.some((value, i) => !Object.is(value, previousDependencies![i]))) {
    previousDependencies = dependencies
    operations.normalize()
  }
}
function start(type: string, vatRate: number, booked: boolean, treatment: 'taxable' | 'exempt_other' = 'exempt_other') {
  form = { type, vatRate, amount: '1250', description: 'synthetic', inputVatDeduction: 'none' }
  Object.assign(context, { formData: form, editingBooked: booked, kontoplan: accounts,
    profile: { vat_status: 'registered', domestic_sales_vat_treatment: treatment },
    isNotVatRegistered: false, ordinarySalesVatPolicy: getOrdinarySalesVatPolicy(treatment) })
  previousDependencies = null
  render()
}
function choose(type: string) { operations.category({ target: { value: type } }); render() }
start('sale', 25, true)
if (reproduceBefore) {
  assert(currentForm().vatRate === 0, 'Before fix: current exempt profile overwrites historical booked VAT')
  console.log('PASS reproduced KAN-24 before fix: historical booked 25% displayed as 0%')
} else {
  assert(currentForm().vatRate === 25 && currentForm().type === 'sale', 'Booked historical category and 25% VAT are preserved under current exempt profile')
  context.kontoplan = [...accounts]; render()
  assert(currentForm().vatRate === 25, 'Account refresh cannot overwrite booked historical VAT')
  // Only the edit mode changes; missing editingBooked dependency would fail this.
  context.editingBooked = false; render()
  assert(currentForm().vatRate === 0, 'Leaving booked edit with same category/profile resumes normalization for a new entry')
  start('sale', 25, true)
  assert(currentForm().vatRate === 25, 'Returning to a historical booked row restores its saved VAT')
  context.profile = { vat_status: 'not_registered', domestic_sales_vat_treatment: 'exempt_other' }; render()
  assert(currentForm().vatRate === 25 && currentForm().type === 'sale', 'Current profile changes do not rewrite booked category/VAT')
  start('cost25', 25, false, 'taxable'); choose('cost12')
  assert(currentForm().type === 'cost12' && currentForm().vatRate === 12 && currentForm().inputVatDeduction === 'profile_default', 'Category change uses its default rate and resets deduction choice')
  operations.vat({ target: { value: '6' } }); render()
  context.kontoplan = [...accounts]; render()
  assert(currentForm().vatRate === 6 && currentForm().type === 'cost12', 'Valid chosen purchase VAT/category survive account refresh')
  choose('sale'); operations.vat({ target: { value: '12' } }); render()
  context.kontoplan = [...accounts]; render()
  assert(currentForm().vatRate === 12, 'Valid chosen taxable sales VAT survives account refresh')
  choose('')
  assert(currentForm().type === '' && currentForm().vatRate === 0 && currentForm().inputVatDeduction === 'profile_default', 'Clearing category clears rate and deduction selection')
  start('cost25', 25, false); choose('sale')
  assert(currentForm().vatRate === 0 && currentForm().type === 'sale', 'New exempt sale still uses existing zero-VAT policy')
  assert(currentForm().amount === '1250' && currentForm().description === 'synthetic', 'Normalization/category selection do not alter amount or description')
  console.log('PASS KAN-24 actual effect/dependencies/handlers: booked history, mode switches, categories, empty selection, custom VAT and refresh')
}
// Exercise the actual saved-field conditional, never the transport or database.
for (const booked of [true, false]) {
  const saved = vm.runInNewContext(`${editableAmounts.getText(pageTree)}; updatePayload`, {
    editingBooked: booked, formData: { type: 'sale', vatRate: 25, amount: '1250' }, parseStandardBookingAmount,
    updatePayload: { date: '2025-06-01', description: 'synthetic historical edit' },
  })
  assert(booked ? !('type' in saved) && !('vat_rate' in saved) && !('amount' in saved)
    : saved.type === 'sale' && saved.vat_rate === 25 && saved.amount === 1250,
  'Saved fields remain unchanged: booked edits omit category, VAT and amount; unbooked edits include them')
}
console.log('Transaction form UI regression tests passed.')
