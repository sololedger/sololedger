import type { CustomerInvoice } from './accountingService.ts'
import {
  customerInvoiceHasUnsafeVatBlocker,
  customerInvoiceNeedsYearEndBooking,
  hasCustomerInvoiceYearEndBooking,
  customerInvoiceYearEndFiscalYear,
} from './customerInvoiceUi.ts'

export type CustomerInvoicePaymentFilter = 'all' | 'unpaid' | 'paid'

export type CustomerInvoiceYearEndFilter =
  | 'all'
  | 'no_year_end_receivable'
  | 'needs_year_end'
  | 'booked_year_end'
  | 'unsafe_vat'
  | 'other_year'

export type CustomerInvoiceSortMode =
  | 'invoice_date_desc'
  | 'invoice_date_asc'
  | 'due_date_asc'
  | 'due_date_desc'
  | 'amount_desc'
  | 'amount_asc'

export interface CustomerInvoiceFilterState {
  search: string
  payment: CustomerInvoicePaymentFilter
  yearEnd: CustomerInvoiceYearEndFilter
  sort: CustomerInvoiceSortMode
}

export const DEFAULT_CUSTOMER_INVOICE_FILTERS: CustomerInvoiceFilterState = {
  search: '',
  payment: 'all',
  yearEnd: 'all',
  sort: 'invoice_date_desc',
}

export const CUSTOMER_INVOICE_PAYMENT_FILTER_OPTIONS: Array<{
  value: CustomerInvoicePaymentFilter
  label: string
}> = [
  { value: 'all', label: 'Alla' },
  { value: 'paid', label: 'Betalda' },
  { value: 'unpaid', label: 'Obetalda' },
]

export const CUSTOMER_INVOICE_YEAR_END_FILTER_OPTIONS: Array<{
  value: CustomerInvoiceYearEndFilter
  label: string
}> = [
  { value: 'all', label: 'Alla' },
  { value: 'no_year_end_receivable', label: 'Ingen kundfordran' },
  { value: 'booked_year_end', label: 'Kundfordran bokad' },
  { value: 'needs_year_end', label: 'Behöver kundfordran' },
  { value: 'unsafe_vat', label: 'Moms oklar' },
  { value: 'other_year', label: 'Annat bokslutsår' },
]

export const CUSTOMER_INVOICE_SORT_OPTIONS: Array<{
  value: CustomerInvoiceSortMode
  label: string
}> = [
  { value: 'invoice_date_desc', label: 'Nyast fakturadatum' },
  { value: 'invoice_date_asc', label: 'Äldst fakturadatum' },
  { value: 'due_date_asc', label: 'Förfaller först' },
  { value: 'due_date_desc', label: 'Förfaller sist' },
  { value: 'amount_desc', label: 'Belopp högst' },
  { value: 'amount_asc', label: 'Belopp lägst' },
]

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase('sv-SE')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchAmountOre(search: string) {
  const raw = String(search ?? '').trim()
  if (searchDatePrefix(raw)) return null

  const compact = raw
    .toLocaleLowerCase('sv-SE')
    .replace(/\s*(?:kr|kronor)\s*$/u, '')
    .replace(/[\s\u00a0]/g, '')
  if (!compact || !/^\d+(?:[,.]\d{1,2})?$/.test(compact)) return null

  const match = compact.match(/^(\d+)(?:[,.](\d{1,2}))?$/)
  if (!match) return null

  const kronor = Number(match[1])
  const oren = Number((match[2] ?? '').padEnd(2, '0'))
  if (!Number.isFinite(kronor) || !Number.isFinite(oren)) return null

  return kronor * 100 + oren
}

function amountOre(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : null
}

function searchDatePrefix(search: string) {
  const raw = String(search ?? '').trim()
  if (/^(?:19|20)\d{2}$/.test(raw)) return raw
  if (/^(?:19|20)\d{2}-\d{2}$/.test(raw)) return raw
  if (/^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(raw)) return raw
  return null
}

function invoiceMatchesSearch(invoice: CustomerInvoice, search: string) {
  const datePrefix = searchDatePrefix(search)
  if (datePrefix) return invoice.invoiceDate.startsWith(datePrefix)

  const searchedAmount = searchAmountOre(search)
  if (searchedAmount != null) return amountOre(invoice.grossAmount) === searchedAmount

  const normalizedSearch = normalizeSearchText(search)
  if (!normalizedSearch) return true

  return [
    invoice.invoiceNumber,
    invoice.customerName,
    invoice.invoiceDate,
    invoice.invoiceDate.slice(0, 7),
    invoice.invoiceDate.slice(0, 4),
  ].some(value => normalizeSearchText(value).includes(normalizedSearch))
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
  const targetFiscalYear = customerInvoiceYearEndFiscalYear(invoice)
  if (yearEnd === 'needs_year_end') {
    return customerInvoiceNeedsYearEndBooking(invoice, selectedYear)
  }
  if (yearEnd === 'booked_year_end') {
    return hasCustomerInvoiceYearEndBooking(invoice, selectedYear)
  }
  if (yearEnd === 'no_year_end_receivable') {
    return (
      targetFiscalYear === selectedYear &&
      !hasCustomerInvoiceYearEndBooking(invoice, selectedYear) &&
      !customerInvoiceNeedsYearEndBooking(invoice, selectedYear) &&
      !customerInvoiceHasUnsafeVatBlocker(invoice, selectedYear)
    )
  }
  if (yearEnd === 'unsafe_vat') {
    return customerInvoiceHasUnsafeVatBlocker(invoice, selectedYear)
  }
  if (yearEnd === 'other_year') {
    return targetFiscalYear !== selectedYear
  }
  return true
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function sortNumber(a: number, b: number, direction: 'asc' | 'desc') {
  return direction === 'asc' ? a - b : b - a
}

function compareInvoices(
  a: CustomerInvoice,
  b: CustomerInvoice,
  sort: CustomerInvoiceSortMode
) {
  if (sort === 'invoice_date_asc' || sort === 'invoice_date_desc') {
    const dateResult = a.invoiceDate.localeCompare(b.invoiceDate)
    if (dateResult !== 0) return sort === 'invoice_date_asc' ? dateResult : -dateResult
  }

  if (sort === 'due_date_asc' || sort === 'due_date_desc') {
    const dueResult = a.dueDate.localeCompare(b.dueDate)
    if (dueResult !== 0) return sort === 'due_date_asc' ? dueResult : -dueResult
    const invoiceDateResult = a.invoiceDate.localeCompare(b.invoiceDate)
    if (invoiceDateResult !== 0) return -invoiceDateResult
  }

  if (sort === 'amount_asc' || sort === 'amount_desc') {
    const amountResult = sortNumber(
      numberValue(a.grossAmount),
      numberValue(b.grossAmount),
      sort === 'amount_asc' ? 'asc' : 'desc'
    )
    if (amountResult !== 0) return amountResult
    const invoiceDateResult = a.invoiceDate.localeCompare(b.invoiceDate)
    if (invoiceDateResult !== 0) return -invoiceDateResult
  }

  const invoiceNumberResult = a.invoiceNumber.localeCompare(b.invoiceNumber, 'sv-SE')
  if (invoiceNumberResult !== 0) return -invoiceNumberResult
  return a.id.localeCompare(b.id)
}

export function hasActiveCustomerInvoiceFilters(filters: CustomerInvoiceFilterState) {
  return (
    normalizeSearchText(filters.search).length > 0 ||
    filters.payment !== DEFAULT_CUSTOMER_INVOICE_FILTERS.payment ||
    filters.yearEnd !== DEFAULT_CUSTOMER_INVOICE_FILTERS.yearEnd ||
    filters.sort !== DEFAULT_CUSTOMER_INVOICE_FILTERS.sort
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
  return invoices
    .filter(invoice =>
      invoiceMatchesSearch(invoice, filters.search) &&
      invoiceMatchesPayment(invoice, filters.payment) &&
      invoiceMatchesYearEnd(invoice, selectedYear, filters.yearEnd)
    )
    .sort((a, b) => compareInvoices(a, b, filters.sort))
}
