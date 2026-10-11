import {
  DEFAULT_CUSTOMER_INVOICE_FILTERS,
  filterCustomerInvoices,
  hasActiveCustomerInvoiceFilters,
  type CustomerInvoiceFilterState,
} from '../src/lib/customerInvoiceFilters.ts'
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
  }),
  invoice({
    id: 'invoice-beta',
    invoiceNumber: 'F-2026-002',
    customerName: 'Beta Byrå',
    paymentStatus: 'paid',
    paidAt: '2026-07-10',
  }),
  invoice({
    id: 'invoice-gamma',
    invoiceNumber: 'F-2026-003',
    customerName: 'Gamma AB',
    bookings: [yearEndBooking('invoice-gamma', selectedYear)],
  }),
  invoice({
    id: 'invoice-delta',
    invoiceNumber: 'F-2026-004',
    customerName: 'Delta Design',
    vatTreatment: 'unknown',
  }),
  invoice({
    id: 'invoice-prior',
    invoiceNumber: 'F-2025-009',
    customerName: 'Fjolårskund',
    invoiceDate: '2025-12-20',
    serviceDate: '2025-12-20',
    dueDate: '2026-01-20',
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

console.log('\n=== SoloLedger Customer Invoice Filter Tests ===\n')

assertEqual(hasActiveCustomerInvoiceFilters(DEFAULT_CUSTOMER_INVOICE_FILTERS), false, 'default filters are inactive')
assertEqual(hasActiveCustomerInvoiceFilters(filters({ search: 'alfa' })), true, 'search activates invoice filters')
assertEqual(hasActiveCustomerInvoiceFilters(filters({ payment: 'paid' })), true, 'payment filter activates invoice filters')
assertEqual(hasActiveCustomerInvoiceFilters(filters({ yearEnd: 'needs_year_end' })), true, 'year-end filter activates invoice filters')

assertDeepEqual(ids(apply({ search: 'F-2026-001' })), ['invoice-alpha'], 'invoice number search finds one invoice')
assertDeepEqual(ids(apply({ search: 'beta byrå' })), ['invoice-beta'], 'customer search supports multi-term Swedish text')
assertDeepEqual(ids(apply({ payment: 'unpaid' })), ['invoice-alpha', 'invoice-gamma', 'invoice-delta', 'invoice-prior'], 'unpaid filter excludes paid invoices')
assertDeepEqual(ids(apply({ payment: 'paid' })), ['invoice-beta'], 'paid filter includes only paid invoices')
assertDeepEqual(ids(apply({ yearEnd: 'needs_year_end' })), ['invoice-alpha'], 'year-end-needed filter excludes unknown VAT and already-booked invoices')
assertDeepEqual(ids(apply({ yearEnd: 'booked_year_end' })), ['invoice-gamma'], 'booked year-end filter uses existing booking data')
assertDeepEqual(ids(apply({ yearEnd: 'unsafe_vat' })), ['invoice-delta'], 'unsafe VAT filter finds invoices blocked by unclear VAT facts')
assertDeepEqual(ids(apply({ yearEnd: 'other_year' })), ['invoice-prior'], 'other-year filter finds invoices belonging to another closing year')
assertDeepEqual(ids(apply({ search: 'studio', payment: 'paid' })), [], 'search and status filters combine without mutation')

console.log('\nAll customer invoice filter tests passed.\n')
