'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  bookCustomerInvoiceYearEndReceivable,
  createCustomerInvoice,
  getCustomerInvoices,
  recordCustomerInvoicePayment,
  settleCustomerInvoiceReceivable,
  type CustomerInvoice,
  type CustomerInvoiceVatTreatment,
} from '@/lib/accountingService'

interface CustomerInvoicesPanelProps {
  selectedYear: number
  isYearLocked: boolean
  vatStatus: 'registered' | 'not_registered' | 'unknown'
  onBookkeepingChanged: () => Promise<void>
  onYearCloseBlockerChange: (reason: string | null) => void
}

interface InvoiceFormState {
  invoiceNumber: string
  customerName: string
  invoiceDate: string
  serviceDate: string
  dueDate: string
  grossAmount: string
  vatTreatment: CustomerInvoiceVatTreatment
  vatRate: string
}

const initialForm = (selectedYear: number, vatStatus: CustomerInvoicesPanelProps['vatStatus']): InvoiceFormState => ({
  invoiceNumber: '',
  customerName: '',
  invoiceDate: `${selectedYear}-12-20`,
  serviceDate: `${selectedYear}-12-20`,
  dueDate: `${selectedYear + 1}-01-20`,
  grossAmount: '',
  vatTreatment: vatStatus === 'not_registered' ? 'exempt' : 'unknown',
  vatRate: '25',
})

function fmtCurrency(value: number | null | undefined) {
  if (value == null) return 'Saknas'
  return `${value.toLocaleString('sv-SE', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} kr`
}

function vatLabel(invoice: CustomerInvoice) {
  if (invoice.vatTreatment === 'unknown') return 'Moms oklar'
  if (invoice.vatTreatment === 'exempt') return 'Momsfri / ej moms'
  return `${invoice.vatRate ?? '?'}% moms`
}

function hasYearEndReceivable(invoice: CustomerInvoice, fiscalYear: number) {
  return invoice.bookings.some(booking =>
    booking.bookingKind === 'year_end_receivable' &&
    booking.fiscalYear === fiscalYear
  )
}

function hasAnyYearEndReceivable(invoice: CustomerInvoice) {
  return invoice.bookings.some(booking => booking.bookingKind === 'year_end_receivable')
}

function yearCloseBlockerFor(invoice: CustomerInvoice, fiscalYear: number) {
  const yearEnd = `${fiscalYear}-12-31`
  if (
    invoice.paymentStatus !== 'unpaid' ||
    invoice.invoiceDate > yearEnd ||
    invoice.serviceDate > yearEnd
  ) {
    return null
  }

  if (invoice.vatTreatment === 'unknown') {
    return `Kundfaktura ${invoice.invoiceNumber} har osäker momsstatus. Slutför momsfakta innan år ${fiscalYear} låses.`
  }

  if (!hasYearEndReceivable(invoice, fiscalYear)) {
    return `Kundfaktura ${invoice.invoiceNumber} är obetald och behöver bokföras som kundfordran per 31/12 innan år ${fiscalYear} låses.`
  }

  return null
}

export default function CustomerInvoicesPanel({
  selectedYear,
  isYearLocked,
  vatStatus,
  onBookkeepingChanged,
  onYearCloseBlockerChange,
}: CustomerInvoicesPanelProps) {
  const [form, setForm] = useState<InvoiceFormState>(() => initialForm(selectedYear, vatStatus))
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([])
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({})

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getCustomerInvoices(selectedYear)
      setInvoices(rows)
      setNotice(current => current?.type === 'error' ? current : null)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Kunde inte hämta kundfakturor.',
      })
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    setForm(initialForm(selectedYear, vatStatus))
    void loadInvoices()
  }, [loadInvoices, selectedYear, vatStatus])

  const yearEndBlockers = useMemo(
    () => invoices
      .map(invoice => yearCloseBlockerFor(invoice, selectedYear))
      .filter((reason): reason is string => Boolean(reason)),
    [invoices, selectedYear]
  )

  useEffect(() => {
    onYearCloseBlockerChange(yearEndBlockers[0] ?? null)
  }, [onYearCloseBlockerChange, yearEndBlockers])

  const unpaidInvoices = invoices.filter(invoice => invoice.paymentStatus === 'unpaid')

  async function refreshAfterAction(message: string) {
    await loadInvoices()
    await onBookkeepingChanged()
    setNotice({ type: 'success', text: message })
  }

  async function handleCreateInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setBusyKey('create')

    try {
      const grossAmount = Number(form.grossAmount)
      if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
        throw new Error('Fakturabeloppet måste vara större än 0.')
      }

      await createCustomerInvoice({
        invoiceNumber: form.invoiceNumber,
        customerName: form.customerName,
        invoiceDate: form.invoiceDate,
        serviceDate: form.serviceDate,
        dueDate: form.dueDate,
        grossAmount,
        vatTreatment: form.vatTreatment,
        vatRate: form.vatTreatment === 'taxable' ? Number(form.vatRate) : null,
      })

      setForm(initialForm(selectedYear, vatStatus))
      await refreshAfterAction('Kundfakturan är registrerad. Ingen bokföring skapades förrän betalning eller bokslut hanteras.')
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Kundfakturan kunde inte registreras.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function handleBookYearEndReceivable(invoice: CustomerInvoice) {
    setNotice(null)
    setBusyKey(`year-end-${invoice.id}`)

    try {
      await bookCustomerInvoiceYearEndReceivable(
        invoice.id,
        selectedYear,
        crypto.randomUUID()
      )
      await refreshAfterAction(`Kundfordran för faktura ${invoice.invoiceNumber} är bokförd per 31/12.`)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Kundfordran kunde inte bokföras.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function handlePayment(invoice: CustomerInvoice) {
    const paymentDate = paymentDates[invoice.id] || `${selectedYear + 1}-01-15`
    const hasReceivable = hasAnyYearEndReceivable(invoice)
    setNotice(null)
    setBusyKey(`payment-${invoice.id}`)

    try {
      if (hasReceivable) {
        await settleCustomerInvoiceReceivable(invoice.id, paymentDate, crypto.randomUUID())
      } else {
        await recordCustomerInvoicePayment(invoice.id, paymentDate, crypto.randomUUID())
      }

      await refreshAfterAction(
        hasReceivable
          ? `Betalningen för faktura ${invoice.invoiceNumber} är bokförd mot 1510 utan ny intäkt eller moms.`
          : `Betalningen för faktura ${invoice.invoiceNumber} är bokförd som betald försäljning.`
      )
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Betalningen kunde inte bokföras.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section
      data-testid="customer-invoices-panel"
      className="mb-6 rounded-[2rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
            Externa kundfakturor
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-gray-900">
            Fakturor som inte är skapade i SoloLedger
          </h2>
          <p className="mt-2 text-xs font-bold leading-relaxed text-gray-500">
            Vanlig försäljning bokförs direkt när den är betald. Här registrerar du en extern kundfaktura först, och låter SoloLedger bokföra betalning eller kundfordran när det är dags.
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[10px] font-bold leading-relaxed text-emerald-800">
          Konto 1510 väljs aldrig manuellt här. Årsskiftesbokningen styrs av backend.
        </div>
      </div>

      {notice && (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={`mb-4 rounded-xl border px-4 py-3 text-xs font-bold ${
            notice.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {notice.text}
        </div>
      )}

      {yearEndBlockers.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
            Inför bokslut {selectedYear}
          </p>
          <ul className="mt-2 space-y-1">
            {yearEndBlockers.map(reason => (
              <li key={reason} className="text-[10px] font-bold leading-relaxed text-amber-800">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleCreateInvoice} className="border-t border-gray-100 pt-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
          <label className="flex flex-col gap-1 xl:col-span-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Fakturanr</span>
            <input
              value={form.invoiceNumber}
              onChange={event => setForm(prev => ({ ...prev, invoiceNumber: event.target.value }))}
              className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1 xl:col-span-2">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Kund</span>
            <input
              value={form.customerName}
              onChange={event => setForm(prev => ({ ...prev, customerName: event.target.value }))}
              className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Fakturadatum</span>
            <input
              type="date"
              value={form.invoiceDate}
              onChange={event => setForm(prev => ({ ...prev, invoiceDate: event.target.value }))}
              className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Tjänstedatum</span>
            <input
              type="date"
              value={form.serviceDate}
              onChange={event => setForm(prev => ({ ...prev, serviceDate: event.target.value }))}
              className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Förfallodatum</span>
            <input
              type="date"
              value={form.dueDate}
              onChange={event => setForm(prev => ({ ...prev, dueDate: event.target.value }))}
              className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Belopp inkl moms</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.grossAmount}
              onChange={event => setForm(prev => ({ ...prev, grossAmount: event.target.value }))}
              className="sl-money-input rounded-xl border p-3 text-sm font-black outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Momsfakta</span>
            <select
              value={form.vatTreatment}
              onChange={event => setForm(prev => ({
                ...prev,
                vatTreatment: event.target.value as CustomerInvoiceVatTreatment,
              }))}
              className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
            >
              <option value="unknown">Osäker - stoppa bokning</option>
              <option value="taxable">Momspliktig svensk försäljning</option>
              <option value="exempt">Momsfri / ej moms</option>
            </select>
          </label>

          {form.vatTreatment === 'taxable' && (
            <label className="flex flex-col gap-1">
              <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Moms %</span>
              <select
                value={form.vatRate}
                onChange={event => setForm(prev => ({ ...prev, vatRate: event.target.value }))}
                className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              >
                <option value="25">25%</option>
                <option value="12">12%</option>
                <option value="6">6%</option>
              </select>
            </label>
          )}
        </div>

        {form.vatTreatment === 'unknown' && (
          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[10px] font-bold text-amber-800">
            Du kan spara fakturan med osäker momsstatus, men SoloLedger kommer att stoppa betalnings- och bokslutsbokning tills momsfakta är klar.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={busyKey === 'create' || isYearLocked}
            className="h-10 rounded-xl bg-emerald-600 px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {busyKey === 'create' ? 'Registrerar...' : 'Registrera kundfaktura'}
          </button>
        </div>
      </form>

      <div className="mt-6 border-t border-gray-100 pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
            Registrerade fakturor
          </p>
          <button
            type="button"
            onClick={() => void loadInvoices()}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-gray-500 hover:bg-gray-50"
          >
            Uppdatera
          </button>
        </div>

        {loading ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-xs font-bold text-gray-400">
            Hämtar kundfakturor...
          </p>
        ) : invoices.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-xs font-bold text-gray-400">
            Inga externa kundfakturor registrerade till och med {selectedYear}.
          </p>
        ) : (
          <div className="space-y-3">
            {invoices.map(invoice => {
              const receivableBooked = hasYearEndReceivable(invoice, selectedYear)
              const anyReceivableBooked = hasAnyYearEndReceivable(invoice)
              const paymentDate = paymentDates[invoice.id] || `${selectedYear + 1}-01-15`
              const blocker = yearCloseBlockerFor(invoice, selectedYear)

              return (
                <div
                  key={invoice.id}
                  data-testid="customer-invoice-card"
                  className="rounded-xl border border-gray-100 bg-gray-50/60 p-4"
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-black text-gray-900">
                          {invoice.invoiceNumber} - {invoice.customerName}
                        </h3>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                          invoice.paymentStatus === 'paid'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}>
                          {invoice.paymentStatus === 'paid' ? 'Betald' : 'Obetald'}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                          anyReceivableBooked
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-500'
                        }`}>
                          {anyReceivableBooked ? 'Kundfordran bokförd' : 'Ej bokslutsbokad'}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-gray-500">
                        <span>Faktura {invoice.invoiceDate}</span>
                        <span>Tjänst {invoice.serviceDate}</span>
                        <span>Förfaller {invoice.dueDate}</span>
                        <span>{fmtCurrency(invoice.grossAmount)}</span>
                        <span>{vatLabel(invoice)}</span>
                      </div>

                      {invoice.bookings.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {invoice.bookings.map(booking => (
                            <span
                              key={booking.id}
                              className="rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-[9px] font-bold text-gray-500"
                            >
                              {booking.bookingKind === 'year_end_receivable'
                                ? `31/12 ${booking.fiscalYear}: 1510`
                                : booking.bookingKind === 'receivable_settlement'
                                ? `${booking.bookingDate}: 1930/1510`
                                : `${booking.bookingDate}: betald försäljning`}
                            </span>
                          ))}
                        </div>
                      )}

                      {blocker && (
                        <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">
                          {blocker}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 xl:w-80">
                      {invoice.paymentStatus === 'unpaid' && !receivableBooked && (
                        <button
                          type="button"
                          onClick={() => void handleBookYearEndReceivable(invoice)}
                          disabled={isYearLocked || busyKey === `year-end-${invoice.id}`}
                          className="h-10 rounded-xl bg-blue-600 px-3 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                          {busyKey === `year-end-${invoice.id}` ? 'Bokför...' : 'Bokför kundfordran 31/12'}
                        </button>
                      )}

                      {invoice.paymentStatus === 'unpaid' && (
                        <div className="flex gap-2">
                          <input
                            type="date"
                            value={paymentDate}
                            onChange={event => setPaymentDates(prev => ({
                              ...prev,
                              [invoice.id]: event.target.value,
                            }))}
                            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
                          />
                          <button
                            type="button"
                            onClick={() => void handlePayment(invoice)}
                            disabled={busyKey === `payment-${invoice.id}`}
                            className="h-10 rounded-xl bg-emerald-600 px-3 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                          >
                            {busyKey === `payment-${invoice.id}` ? 'Bokför...' : 'Registrera betalning'}
                          </button>
                        </div>
                      )}

                      {invoice.vatTreatment === 'unknown' && invoice.paymentStatus === 'unpaid' && (
                        <p className="text-[9px] font-bold leading-relaxed text-amber-700">
                          Betalning och bokslut stoppas tills fakturans momsstatus är säker.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {unpaidInvoices.length > 0 && (
          <p className="mt-3 text-[10px] font-bold text-gray-500">
            Obetalda fakturor är inte samma sak som bokslutsbokade kundfordringar. Kontrollera båda statusmarkeringarna inför årsskifte.
          </p>
        )}
      </div>
    </section>
  )
}
