import type { CustomerInvoice } from '@/lib/accountingService'

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

export function customerInvoicePaymentLabel(invoice: CustomerInvoice) {
  if (invoice.paymentStatus === 'paid') return 'Betald'
  if (invoice.paymentStatus === 'cancelled') return 'Makulerad'
  return 'Obetald'
}

export function customerInvoiceYearEndLabel(invoice: CustomerInvoice, fiscalYear: number) {
  if (hasCustomerInvoiceYearEndBooking(invoice, fiscalYear)) {
    return 'Med i bokslutet'
  }
  return 'Inte med i bokslutet'
}

export function customerInvoiceYearCloseBlockerFor(
  invoice: CustomerInvoice,
  fiscalYear: number
) {
  const yearEnd = `${fiscalYear}-12-31`
  if (
    invoice.paymentStatus !== 'unpaid' ||
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
  const yearEnd = `${fiscalYear}-12-31`
  return (
    invoice.paymentStatus === 'unpaid' &&
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
  const yearEnd = `${fiscalYear}-12-31`
  return (
    invoice.paymentStatus === 'unpaid' &&
    invoice.invoiceDate <= yearEnd &&
    invoice.serviceDate <= yearEnd &&
    invoice.vatTreatment === 'unknown'
  )
}
