import { readFileSync } from 'node:fs'
import {
  defaultCustomerInvoiceVatTreatment,
  getCustomerInvoiceVatPolicy,
} from '../src/lib/customerInvoiceUi.ts'

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
  console.log(`PASS: ${message}`)
}

function assertIncludes(actual: string | null, expected: string, message: string) {
  if (!actual?.includes(expected)) {
    throw new Error(`${message}: expected "${actual}" to include "${expected}"`)
  }
  console.log(`PASS: ${message}`)
}

function assertMatches(actual: string, expected: RegExp, message: string) {
  if (!expected.test(actual)) {
    throw new Error(`${message}: expected source to match ${expected}`)
  }
  console.log(`PASS: ${message}`)
}

function policy(input: Parameters<typeof getCustomerInvoiceVatPolicy>[0]) {
  return getCustomerInvoiceVatPolicy(input)
}

console.log('\n=== SoloLedger Customer Invoice VAT Policy Tests ===\n')

const taxableProfile = policy({
  vatStatus: 'registered',
  domesticSalesVatTreatment: 'taxable',
})
assertEqual(taxableProfile.taxableAllowed, true, 'registered taxable profile allows taxable customer invoices')
assertEqual(taxableProfile.safeDefault, 'unknown', 'registered taxable profile keeps manual VAT decision default')

const smallBusinessExemptProfile = policy({
  vatStatus: 'registered',
  domesticSalesVatTreatment: 'small_business_exempt',
})
assertEqual(
  smallBusinessExemptProfile.taxableAllowed,
  false,
  'small business exemption blocks taxable customer invoices'
)
assertEqual(
  defaultCustomerInvoiceVatTreatment({
    vatStatus: 'registered',
    domesticSalesVatTreatment: 'small_business_exempt',
  }),
  'exempt',
  'small business exemption defaults ordinary customer invoices to exempt'
)
assertIncludes(
  smallBusinessExemptProfile.taxableBlocker,
  'småföretagarregeln',
  'small business blocker names the profile exemption'
)

const exemptOtherProfile = policy({
  vatStatus: 'registered',
  domesticSalesVatTreatment: 'exempt_other',
})
assertEqual(exemptOtherProfile.taxableAllowed, false, 'other exemption blocks taxable customer invoices')
assertEqual(exemptOtherProfile.safeDefault, 'exempt', 'other exemption defaults ordinary customer invoices to exempt')

const notRegisteredProfile = policy({
  vatStatus: 'not_registered',
  domesticSalesVatTreatment: 'taxable',
})
assertEqual(notRegisteredProfile.taxableAllowed, false, 'not registered profile blocks taxable customer invoices')
assertEqual(notRegisteredProfile.safeDefault, 'exempt', 'not registered profile defaults ordinary customer invoices to exempt')

const unknownProfile = policy({
  vatStatus: 'registered',
  domesticSalesVatTreatment: 'unknown',
})
assertEqual(unknownProfile.taxableAllowed, false, 'unknown domestic treatment blocks taxable customer invoices')
assertEqual(unknownProfile.safeDefault, 'unknown', 'unknown domestic treatment keeps invoice VAT unknown')
assertIncludes(unknownProfile.taxableBlocker, 'gissar inte moms', 'unknown blocker follows no-guessing rule')

const mixedProfile = policy({
  vatStatus: 'registered',
  domesticSalesVatTreatment: 'mixed',
})
assertEqual(mixedProfile.taxableAllowed, false, 'mixed domestic treatment blocks free taxable override')
assertEqual(mixedProfile.safeDefault, 'unknown', 'mixed domestic treatment keeps invoice VAT unknown')
assertIncludes(mixedProfile.notice, 'blandad svensk försäljning', 'mixed notice explains mixed domestic sales')

const customerInvoicesPanelSource = readFileSync('src/components/CustomerInvoicesPanel.tsx', 'utf8')
assertIncludes(
  customerInvoicesPanelSource,
  "vatRelevantChanged && editForm.vatTreatment === 'taxable' && !vatPolicy.taxableAllowed",
  'edit form only blocks taxable VAT when VAT-relevant facts changed'
)
assertIncludes(
  customerInvoicesPanelSource,
  "disabled={!vatPolicy.taxableAllowed && editForm.vatTreatment !== 'taxable'}",
  'existing taxable invoice choice remains visible for harmless edits after profile changes'
)
assertMatches(
  customerInvoicesPanelSource,
  /async function handleEditInvoice[\s\S]*vatRelevantChanged && editForm\.vatTreatment === 'taxable' && !vatPolicy\.taxableAllowed[\s\S]*catch \(error\) \{[\s\S]*type: 'error'[\s\S]*Fakturan kunde inte uppdateras\./,
  'denied VAT-relevant customer invoice edit shows an edit error'
)
assertMatches(
  customerInvoicesPanelSource,
  /function cancelEdit\(\) \{[\s\S]*setEditingInvoiceId\(null\)[\s\S]*setEditAttachmentUrl\(null\)[\s\S]*setEditForm\(initialForm\(\{ vatStatus, domesticSalesVatTreatment \}\)\)[\s\S]*setNotice\(null\)[\s\S]*\}/,
  'canceling customer invoice edit clears stale edit errors'
)
assertIncludes(
  customerInvoicesPanelSource,
  "onClick={() => void loadInvoices({ clearNoticeOnSuccess: true })}",
  'manual customer invoice refresh clears stale errors after successful reload'
)
assertMatches(
  customerInvoicesPanelSource,
  /const loadInvoices = useCallback\(async \(options\?: \{ clearNoticeOnSuccess\?: boolean \}\)[\s\S]*options\?\.clearNoticeOnSuccess[\s\S]*\? null[\s\S]*current\?\.type === 'error'[\s\S]*catch \(error\) \{[\s\S]*type: 'error'[\s\S]*Kunde inte hämta fakturor\./,
  'customer invoice reload still shows a fresh error when loading fails'
)
if (customerInvoicesPanelSource.includes('coerceCustomerInvoiceVatTreatmentForPolicy')) {
  throw new Error('customer invoice edit must not silently rewrite existing VAT treatment')
}
console.log('PASS: existing invoice VAT treatment is not silently coerced')

console.log('\nAll customer invoice VAT policy tests passed.\n')
