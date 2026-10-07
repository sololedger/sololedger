import type { CustomerInvoice } from '@/lib/accountingService'
import type {
  DomesticSalesVatTreatment,
  VatRegistrationStatus,
} from '@/lib/vatDomain'
import { formatIsoDateSv } from '@/lib/dateUi'

export function fmtCustomerInvoiceCurrency(value: number | null | undefined) {
  if (value == null) return 'Saknas'
  return `${value.toLocaleString('sv-SE', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} kr`
}

export function customerInvoiceVatLabel(invoice: CustomerInvoice) {
  if (invoice.vatTreatment === 'unknown') return 'Moms oklar'
  if (invoice.vatTreatment === 'exempt') return 'Momsfri / ej moms'
  return `${invoice.vatRate ?? '?'}% moms`
}

export function defaultCustomerInvoiceVatTreatment(input: {
  vatStatus: VatRegistrationStatus
  domesticSalesVatTreatment: DomesticSalesVatTreatment
}): CustomerInvoice['vatTreatment'] {
  if (
    input.vatStatus === 'not_registered' ||
    input.domesticSalesVatTreatment === 'small_business_exempt' ||
    input.domesticSalesVatTreatment === 'exempt_other'
  ) {
    return 'exempt'
  }

  return 'unknown'
}

function isoYear(isoDate: string) {
  return Number(isoDate.slice(0, 4))
}

export function customerInvoiceYearEndFiscalYear(invoice: CustomerInvoice) {
  return Math.max(isoYear(invoice.invoiceDate), isoYear(invoice.serviceDate))
}

export function hasCustomerInvoiceYearEndBooking(
  invoice: CustomerInvoice,
  fiscalYear: number
) {
  return invoice.bookings.some(booking =>
    booking.bookingKind === 'year_end_receivable' &&
    booking.fiscalYear === fiscalYear
  )
}

export function hasAnyCustomerInvoiceYearEndBooking(invoice: CustomerInvoice) {
  return invoice.bookings.some(booking => booking.bookingKind === 'year_end_receivable')
}

export function hasHistoricalCustomerInvoicePayment(invoice: CustomerInvoice) {
  return invoice.bookings.some(booking => booking.bookingKind === 'historical_payment_same_year')
}

export function customerInvoiceCanUndoPayment(invoice: CustomerInvoice) {
  return (
    invoice.paymentStatus === 'paid' &&
    !hasHistoricalCustomerInvoicePayment(invoice) &&
    invoice.bookings.some(booking =>
      booking.bookingKind === 'payment_same_year' ||
      booking.bookingKind === 'receivable_settlement'
    )
  )
}

export function customerInvoicePaymentLabel(invoice: CustomerInvoice) {
  if (invoice.paymentStatus === 'paid') return 'Betald'
  if (invoice.paymentStatus === 'cancelled') return 'Makulerad'
  return 'Obetald'
}

export function customerInvoiceYearEndLabel(invoice: CustomerInvoice, fiscalYear: number) {
  const targetFiscalYear = customerInvoiceYearEndFiscalYear(invoice)
  if (hasCustomerInvoiceYearEndBooking(invoice, targetFiscalYear)) {
    return `Med i bokslutet ${targetFiscalYear}`
  }
  if (targetFiscalYear !== fiscalYear) {
    return `Avser bokslut ${targetFiscalYear}`
  }
  return 'Inte med i bokslutet'
}

export function customerInvoiceYearCloseBlockerFor(
  invoice: CustomerInvoice,
  fiscalYear: number
) {
  const targetFiscalYear = customerInvoiceYearEndFiscalYear(invoice)
  const yearEnd = `${fiscalYear}-12-31`
  if (
    invoice.paymentStatus !== 'unpaid' ||
    targetFiscalYear !== fiscalYear ||
    invoice.invoiceDate > yearEnd ||
    invoice.serviceDate > yearEnd
  ) {
    return null
  }

  if (invoice.vatTreatment === 'unknown') {
    return `Faktura ${invoice.invoiceNumber} har oklar moms. Slutför momsfakta innan år ${fiscalYear} låses.`
  }

  if (!hasCustomerInvoiceYearEndBooking(invoice, fiscalYear)) {
    return `Faktura ${invoice.invoiceNumber} är obetald och behöver tas med i bokslutet för ${fiscalYear}.`
  }

  return null
}

export function customerInvoiceNeedsYearEndBooking(
  invoice: CustomerInvoice,
  fiscalYear: number
) {
  const targetFiscalYear = customerInvoiceYearEndFiscalYear(invoice)
  const yearEnd = `${fiscalYear}-12-31`
  return (
    invoice.paymentStatus === 'unpaid' &&
    targetFiscalYear === fiscalYear &&
    invoice.invoiceDate <= yearEnd &&
    invoice.serviceDate <= yearEnd &&
    invoice.vatTreatment !== 'unknown' &&
    !hasCustomerInvoiceYearEndBooking(invoice, fiscalYear)
  )
}

export function customerInvoiceHasUnsafeVatBlocker(
  invoice: CustomerInvoice,
  fiscalYear: number
) {
  const targetFiscalYear = customerInvoiceYearEndFiscalYear(invoice)
  const yearEnd = `${fiscalYear}-12-31`
  return (
    invoice.paymentStatus === 'unpaid' &&
    targetFiscalYear === fiscalYear &&
    invoice.invoiceDate <= yearEnd &&
    invoice.serviceDate <= yearEnd &&
    invoice.vatTreatment === 'unknown'
  )
}

export function formatCustomerInvoiceDate(isoDate: string) {
  return formatIsoDateSv(isoDate)
}
