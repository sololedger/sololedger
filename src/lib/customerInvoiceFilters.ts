import type { CustomerInvoice } from './accountingService.ts'
import {
  customerInvoiceHasUnsafeVatBlocker,
  customerInvoiceNeedsYearEndBooking,
  customerInvoiceYearEndFiscalYear,
  hasAnyCustomerInvoiceYearEndBooking,
} from './customerInvoiceUi.ts'

export type CustomerInvoicePaymentFilter = 'all' | 'unpaid' | 'paid'

export type CustomerInvoiceYearEndFilter =
  | 'all'
  | 'needs_year_end'
  | 'booked_year_end'
  | 'unsafe_vat'
  | 'other_year'

export interface CustomerInvoiceFilterState {
  search: string
  payment: CustomerInvoicePaymentFilter
  yearEnd: CustomerInvoiceYearEndFilter
}

export const DEFAULT_CUSTOMER_INVOICE_FILTERS: CustomerInvoiceFilterState = {
  search: '',
  payment: 'all',
  yearEnd: 'all',
}

export const CUSTOMER_INVOICE_PAYMENT_FILTER_OPTIONS: Array<{
  value: CustomerInvoicePaymentFilter
  label: string
}> = [
  { value: 'all', label: 'Alla betalstatusar' },
  { value: 'unpaid', label: 'Obetalda' },
  { value: 'paid', label: 'Betalda' },
]

export const CUSTOMER_INVOICE_YEAR_END_FILTER_OPTIONS: Array<{
  value: CustomerInvoiceYearEndFilter
  label: string
}> = [
  { value: 'all', label: 'Alla bokslutsstatusar' },
  { value: 'needs_year_end', label: 'Behöver bokslut' },
  { value: 'booked_year_end', label: 'Med i bokslut' },
  { value: 'unsafe_vat', label: 'Moms oklar' },
  { value: 'other_year', label: 'Annat bokslutsår' },
]

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase('sv-SE')
    .replace(/\s+/g, ' ')
    .trim()
}

function invoiceMatchesSearch(invoice: CustomerInvoice, search: string) {
  const terms = normalizeSearchText(search).split(' ').filter(Boolean)
  if (terms.length === 0) return true

  const corpus = normalizeSearchText([
    invoice.invoiceNumber,
    invoice.customerName,
  ].join(' '))

  return terms.every(term => corpus.includes(term))
}

function invoiceMatchesPayment(
  invoice: CustomerInvoice,
  payment: CustomerInvoicePaymentFilter
) {
  if (payment === 'all') return true
  return invoice.paymentStatus === payment
}

function invoiceMatchesYearEnd(
  invoice: CustomerInvoice,
  selectedYear: number,
  yearEnd: CustomerInvoiceYearEndFilter
) {
  if (yearEnd === 'all') return true
  if (yearEnd === 'needs_year_end') {
    return customerInvoiceNeedsYearEndBooking(invoice, selectedYear)
  }
  if (yearEnd === 'booked_year_end') {
    return hasAnyCustomerInvoiceYearEndBooking(invoice)
  }
  if (yearEnd === 'unsafe_vat') {
    return customerInvoiceHasUnsafeVatBlocker(invoice, selectedYear)
  }
  if (yearEnd === 'other_year') {
    return customerInvoiceYearEndFiscalYear(invoice) !== selectedYear
  }
  return true
}

export function hasActiveCustomerInvoiceFilters(filters: CustomerInvoiceFilterState) {
  return (
    normalizeSearchText(filters.search).length > 0 ||
    filters.payment !== DEFAULT_CUSTOMER_INVOICE_FILTERS.payment ||
    filters.yearEnd !== DEFAULT_CUSTOMER_INVOICE_FILTERS.yearEnd
  )
}

export function filterCustomerInvoices({
  invoices,
  filters,
  selectedYear,
}: {
  invoices: CustomerInvoice[]
  filters: CustomerInvoiceFilterState
  selectedYear: number
}) {
  return invoices.filter(invoice =>
    invoiceMatchesSearch(invoice, filters.search) &&
    invoiceMatchesPayment(invoice, filters.payment) &&
    invoiceMatchesYearEnd(invoice, selectedYear, filters.yearEnd)
  )
}
