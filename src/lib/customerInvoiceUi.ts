import type { CustomerInvoice } from '@/lib/accountingService'
import type {
  DomesticSalesVatTreatment,
  VatRegistrationStatus,
} from '@/lib/vatDomain'
import { formatIsoDateSv } from './dateUi.ts'

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

export type CustomerInvoiceVatPolicy = {
  taxableAllowed: boolean
  safeDefault: CustomerInvoice['vatTreatment']
  notice: string | null
  taxableBlocker: string | null
}

export function getCustomerInvoiceVatPolicy(input: {
  vatStatus: VatRegistrationStatus
  domesticSalesVatTreatment: DomesticSalesVatTreatment
}): CustomerInvoiceVatPolicy {
  if (
    input.vatStatus === 'registered' &&
    input.domesticSalesVatTreatment === 'taxable'
  ) {
    return {
      taxableAllowed: true,
      safeDefault: 'unknown',
      notice: null,
      taxableBlocker: null,
    }
  }

  if (input.vatStatus === 'not_registered') {
    return {
      taxableAllowed: false,
      safeDefault: 'exempt',
      notice:
        'Företagsprofilen säger att företaget inte är momsregistrerat. Vanlig svensk kundfaktura registreras därför utan moms.',
      taxableBlocker:
        'Företagsprofilen säger att företaget inte är momsregistrerat. Vanlig svensk kundfaktura kan inte vara momspliktig.',
    }
  }

  if (input.domesticSalesVatTreatment === 'small_business_exempt') {
    return {
      taxableAllowed: false,
      safeDefault: 'exempt',
      notice:
        'Företagsprofilen säger att svensk försäljning är momsbefriad enligt småföretagarregeln. Vanlig svensk kundfaktura registreras därför utan moms.',
      taxableBlocker:
        'Företagsprofilen säger att svensk försäljning är momsbefriad enligt småföretagarregeln. Uppdatera Profil om förhållandena har ändrats.',
    }
  }

  if (input.domesticSalesVatTreatment === 'exempt_other') {
    return {
      taxableAllowed: false,
      safeDefault: 'exempt',
      notice:
        'Företagsprofilen säger att svensk försäljning är momsfri. Vanlig svensk kundfaktura registreras därför utan moms.',
      taxableBlocker:
        'Företagsprofilen säger att svensk försäljning är momsfri. Uppdatera Profil om förhållandena har ändrats.',
    }
  }

  return {
    taxableAllowed: false,
    safeDefault: 'unknown',
    notice:
      input.domesticSalesVatTreatment === 'mixed'
        ? 'Företagsprofilen säger blandad svensk försäljning. SoloLedger tillåter inte fri momspliktig override för vanlig kundfaktura.'
        : 'Företagsprofilen saknar säker momsregel för vanlig svensk kundfaktura. SoloLedger gissar inte moms.',
    taxableBlocker:
      input.domesticSalesVatTreatment === 'mixed'
        ? 'Företagsprofilen säger blandad svensk försäljning. Välj Moms oklar eller uppdatera Profil innan svensk moms debiteras.'
        : 'Företagsprofilen saknar säker momsregel för vanlig svensk kundfaktura. SoloLedger gissar inte moms.',
  }
}

export function defaultCustomerInvoiceVatTreatment(input: {
  vatStatus: VatRegistrationStatus
  domesticSalesVatTreatment: DomesticSalesVatTreatment
}): CustomerInvoice['vatTreatment'] {
  return getCustomerInvoiceVatPolicy(input).safeDefault
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
    return `Kundfordran vid bokslut ${targetFiscalYear}`
  }
  if (targetFiscalYear !== fiscalYear) {
    return `Avser bokslut ${targetFiscalYear}`
  }
  if (customerInvoiceHasUnsafeVatBlocker(invoice, fiscalYear)) {
    return `Moms oklar för bokslut ${fiscalYear}`
  }
  if (customerInvoiceNeedsYearEndBooking(invoice, fiscalYear)) {
    return `Behöver kundfordran vid bokslut ${fiscalYear}`
  }
  return 'Ingen kundfordran vid bokslut'
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
    return `Faktura ${invoice.invoiceNumber} är obetald och behöver bokföras som kundfordran vid bokslut ${fiscalYear}.`
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
