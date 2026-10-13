import {
  DEFAULT_CUSTOMER_INVOICE_FILTERS,
  filterCustomerInvoices,
  hasActiveCustomerInvoiceFilters,
  type CustomerInvoiceFilterState,
} from '../src/lib/customerInvoiceFilters.ts'
import { customerInvoiceYearEndLabel } from '../src/lib/customerInvoiceUi.ts'
import type { CustomerInvoice } from '../src/lib/accountingService.ts'

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

function filters(partial: Partial<CustomerInvoiceFilterState>): CustomerInvoiceFilterState {
  return {
    ...DEFAULT_CUSTOMER_INVOICE_FILTERS,
    ...partial,
  }
}

function invoice(input: Partial<CustomerInvoice> & Pick<CustomerInvoice, 'id'>): CustomerInvoice {
  return {
    id: input.id,
    invoiceNumber: input.invoiceNumber ?? input.id,
    customerName: input.customerName ?? 'Kund AB',
    invoiceDate: input.invoiceDate ?? '2026-06-01',
    serviceDate: input.serviceDate ?? input.invoiceDate ?? '2026-06-01',
    dueDate: input.dueDate ?? '2026-06-30',
    grossAmount: input.grossAmount ?? 1000,
    netAmount: input.netAmount ?? 800,
    vatAmount: input.vatAmount ?? 200,
    vatRate: input.vatRate ?? 25,
    vatTreatment: input.vatTreatment ?? 'taxable',
    paymentStatus: input.paymentStatus ?? 'unpaid',
    paidAt: input.paidAt ?? null,
    attachmentUrl: input.attachmentUrl ?? 'attachments/invoice.pdf',
    bookings: input.bookings ?? [],
  }
}

function yearEndBooking(invoiceId: string, fiscalYear: number): CustomerInvoice['bookings'][number] {
  return {
    id: `${invoiceId}-year-end`,
    invoiceId,
    transactionId: `${invoiceId}-tx`,
    bookingKind: 'year_end_receivable',
    bookingDate: `${fiscalYear}-12-31`,
    fiscalYear,
    grossAmount: 1000,
    netAmount: 800,
    vatAmount: 200,
    reversesBookingId: null,
  }
}

const selectedYear = 2026
const invoices: CustomerInvoice[] = [
  invoice({
    id: 'invoice-alpha',
    invoiceNumber: 'F-2026-001',
    customerName: 'Alfa Studio',
    invoiceDate: '2026-09-15',
    serviceDate: '2026-09-15',
    dueDate: '2026-10-15',
    grossAmount: 1000,
  }),
  invoice({
    id: 'invoice-beta',
    invoiceNumber: 'F-2026-002',
    customerName: 'Beta Byrå',
    invoiceDate: '2026-09-20',
    serviceDate: '2026-09-20',
    dueDate: '2026-10-20',
    grossAmount: 2500,
    paymentStatus: 'paid',
    paidAt: '2026-07-10',
  }),
  invoice({
    id: 'invoice-gamma',
    invoiceNumber: 'F-2026-003',
    customerName: 'Gamma AB',
    invoiceDate: '2026-12-15',
    serviceDate: '2026-12-15',
    dueDate: '2027-01-15',
    grossAmount: 3000,
    paymentStatus: 'paid',
    paidAt: '2027-01-15',
    bookings: [yearEndBooking('invoice-gamma', selectedYear)],
  }),
  invoice({
    id: 'invoice-delta',
    invoiceNumber: 'F-2026-004',
    customerName: 'Delta Design',
    invoiceDate: '2026-10-01',
    serviceDate: '2026-10-01',
    dueDate: '2026-11-01',
    grossAmount: 4000,
    vatTreatment: 'unknown',
  }),
  invoice({
    id: 'invoice-prior',
    invoiceNumber: 'F-2025-009',
    customerName: 'Fjolårskund',
    invoiceDate: '2025-12-20',
    serviceDate: '2025-12-20',
    dueDate: '2026-01-20',
    grossAmount: 2026,
  }),
]

function ids(input: CustomerInvoice[]) {
  return input.map(item => item.id)
}

function apply(partial: Partial<CustomerInvoiceFilterState>) {
  return filterCustomerInvoices({
    invoices,
    filters: filters(partial),
    selectedYear,
  })
}

function applyTo(customInvoices: CustomerInvoice[], partial: Partial<CustomerInvoiceFilterState>) {
  return filterCustomerInvoices({
    invoices: customInvoices,
    filters: filters(partial),
    selectedYear,
  })
}

console.log('\n=== SoloLedger Customer Invoice Filter Tests ===\n')

assertEqual(hasActiveCustomerInvoiceFilters(DEFAULT_CUSTOMER_INVOICE_FILTERS), false, 'default filters are inactive')
assertEqual(hasActiveCustomerInvoiceFilters(filters({ search: 'alfa' })), true, 'search activates invoice filters')
assertEqual(hasActiveCustomerInvoiceFilters(filters({ payment: 'paid' })), true, 'payment filter activates invoice filters')
assertEqual(hasActiveCustomerInvoiceFilters(filters({ yearEnd: 'needs_year_end' })), true, 'year-end filter activates invoice filters')
assertEqual(hasActiveCustomerInvoiceFilters(filters({ sort: 'amount_desc' })), true, 'sort activates invoice filters')

assertDeepEqual(ids(apply({ search: 'F-2026-001' })), ['invoice-alpha'], 'invoice number search finds one invoice')
assertDeepEqual(ids(apply({ search: 'beta byrå' })), ['invoice-beta'], 'customer search supports multi-term Swedish text')
assertDeepEqual(ids(apply({ search: '2026' })), ['invoice-gamma', 'invoice-delta', 'invoice-beta', 'invoice-alpha'], 'year search matches invoice date year, not amount')
assertDeepEqual(ids(apply({ search: '2026-09' })), ['invoice-beta', 'invoice-alpha'], 'month search matches invoice date month')
assertDeepEqual(ids(apply({ search: '2026-09-15' })), ['invoice-alpha'], 'day search matches exact invoice date')
assertDeepEqual(ids(apply({ search: '2500' })), ['invoice-beta'], 'amount search supports compact kronor')
assertDeepEqual(ids(apply({ search: '2 500' })), ['invoice-beta'], 'amount search supports Swedish spacing')
assertDeepEqual(ids(apply({ search: '2500 kr' })), ['invoice-beta'], 'amount search supports currency suffix')
assertDeepEqual(ids(apply({ search: '1000' })), ['invoice-alpha'], 'amount search supports four-digit non-year amounts')
assertDeepEqual(ids(apply({ search: '1 000' })), ['invoice-alpha'], 'amount search supports spaced four-digit amounts')
assertDeepEqual(
  ids(apply({ search: '2026' })),
  ['invoice-gamma', 'invoice-delta', 'invoice-beta', 'invoice-alpha'],
  'pure invoice year search still uses invoice date instead of amount'
)
assertDeepEqual(ids(apply({ payment: 'unpaid' })), ['invoice-delta', 'invoice-alpha', 'invoice-prior'], 'unpaid filter excludes paid invoices')
assertDeepEqual(ids(apply({ payment: 'paid' })), ['invoice-gamma', 'invoice-beta'], 'paid filter includes only paid invoices')
assertDeepEqual(ids(apply({ yearEnd: 'needs_year_end' })), ['invoice-alpha'], 'year-end-needed filter excludes unknown VAT and already-booked invoices')
assertDeepEqual(ids(apply({ yearEnd: 'booked_year_end' })), ['invoice-gamma'], 'booked year-end filter uses existing booking data even when paid later')
assertDeepEqual(ids(apply({ yearEnd: 'no_year_end_receivable' })), ['invoice-beta'], 'no-receivable filter means current year with no booking and no blocker')
assertDeepEqual(ids(apply({ yearEnd: 'unsafe_vat' })), ['invoice-delta'], 'unsafe VAT filter finds invoices blocked by unclear VAT facts')
assertDeepEqual(ids(apply({ yearEnd: 'other_year' })), ['invoice-prior'], 'other-year filter finds invoices belonging to another closing year')
assertDeepEqual(ids(apply({ search: 'studio', payment: 'paid' })), [], 'search and status filters combine without mutation')
assertDeepEqual(ids(apply({ payment: 'paid', yearEnd: 'booked_year_end' })), ['invoice-gamma'], 'paid and booked year-end filters combine')
assertDeepEqual(ids(apply({ payment: 'paid', yearEnd: 'no_year_end_receivable' })), ['invoice-beta'], 'paid and no-receivable filters combine')
assertDeepEqual(ids(apply({ sort: 'invoice_date_asc' })), ['invoice-prior', 'invoice-alpha', 'invoice-beta', 'invoice-delta', 'invoice-gamma'], 'invoice-date ascending sort is stable')
assertDeepEqual(ids(apply({ sort: 'due_date_asc' })), ['invoice-prior', 'invoice-alpha', 'invoice-beta', 'invoice-delta', 'invoice-gamma'], 'due-date ascending sort is stable')
assertDeepEqual(ids(apply({ sort: 'amount_desc' })), ['invoice-delta', 'invoice-gamma', 'invoice-beta', 'invoice-prior', 'invoice-alpha'], 'amount descending sort is stable')
assertEqual(customerInvoiceYearEndLabel(invoices[0], selectedYear), 'Behöver kundfordran vid bokslut 2026', 'year-end label shows unbooked current-year receivable need')
assertEqual(customerInvoiceYearEndLabel(invoices[1], selectedYear), 'Ingen kundfordran vid bokslut', 'year-end label shows current-year paid invoice without receivable')
assertEqual(customerInvoiceYearEndLabel(invoices[2], selectedYear), 'Kundfordran vid bokslut 2026', 'year-end label preserves booked receivable even when invoice is now paid')
assertEqual(customerInvoiceYearEndLabel(invoices[3], selectedYear), 'Moms oklar för bokslut 2026', 'year-end label shows unsafe VAT blocker')
assertEqual(customerInvoiceYearEndLabel(invoices[4], selectedYear), 'Avser bokslut 2025', 'year-end label shows other fiscal year')

const customerPhraseInvoices = [
  invoice({
    id: 'customer-x',
    invoiceNumber: 'F-2026-X',
    customerName: 'Kund X AB',
    invoiceDate: '2026-11-01',
  }),
  invoice({
    id: 'e2e-momsfri',
    invoiceNumber: 'F-2026-E2E',
    customerName: 'E2E KAN-14 momsfri kund',
    invoiceDate: '2026-10-01',
  }),
]

assertDeepEqual(
  ids(applyTo(customerPhraseInvoices, { search: 'kund x' })),
  ['customer-x'],
  'multi-word customer search matches a contiguous phrase in one field'
)
assertDeepEqual(
  ids(applyTo(customerPhraseInvoices, { search: 'momsfri kund' })),
  ['e2e-momsfri'],
  'multi-word customer search still finds contiguous customer phrases'
)
assertDeepEqual(
  ids(applyTo(customerPhraseInvoices, { search: 'kund' })),
  ['customer-x', 'e2e-momsfri'],
  'single-word customer search remains broad'
)

const numericInvoiceNumberInvoices = [
  invoice({
    id: 'numeric-1001',
    invoiceNumber: '1001',
    customerName: 'Historisk kund',
    invoiceDate: '2026-08-01',
    grossAmount: 3000,
  }),
  invoice({
    id: 'numeric-1002',
    invoiceNumber: '1002',
    customerName: 'Annan historisk kund',
    invoiceDate: '2026-08-02',
    grossAmount: 4000,
  }),
]

assertDeepEqual(
  ids(applyTo(numericInvoiceNumberInvoices, { search: '1001' })),
  ['numeric-1001'],
  'numeric invoice number search finds the invoice even when amount differs'
)

console.log('\nAll customer invoice filter tests passed.\n')
