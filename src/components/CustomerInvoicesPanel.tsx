'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import SwedishDateInput from '@/components/SwedishDateInput'
import {
  bookCustomerInvoiceYearEndReceivable,
  createCustomerInvoice,
  getCustomerInvoices,
  recordCustomerInvoicePayment,
  settleCustomerInvoiceReceivable,
  undoCustomerInvoicePayment,
  updateCustomerInvoiceUnbooked,
  type CustomerInvoice,
  type CustomerInvoiceVatTreatment,
} from '@/lib/accountingService'
import {
  customerInvoiceHasUnsafeVatBlocker,
  customerInvoiceNeedsYearEndBooking,
  customerInvoicePaymentLabel,
  customerInvoiceVatLabel,
  customerInvoiceYearCloseBlockerFor,
  customerInvoiceYearEndLabel,
  defaultCustomerInvoiceVatTreatment,
  formatCustomerInvoiceDate,
  fmtCustomerInvoiceCurrency,
  hasAnyCustomerInvoiceYearEndBooking,
} from '@/lib/customerInvoiceUi'
import type { DomesticSalesVatTreatment } from '@/lib/vatDomain'

interface CustomerInvoicesPanelProps {
  selectedYear: number
  isYearLocked: boolean
  vatStatus: 'registered' | 'not_registered' | 'unknown'
  domesticSalesVatTreatment: DomesticSalesVatTreatment
  onUploadAttachment: (file: File) => Promise<string>
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
  attachment: File | null
}

function initialForm(input: {
  vatStatus: CustomerInvoicesPanelProps['vatStatus']
  domesticSalesVatTreatment: DomesticSalesVatTreatment
}): InvoiceFormState {
  return {
    invoiceNumber: '',
    customerName: '',
    invoiceDate: '',
    serviceDate: '',
    dueDate: '',
    grossAmount: '',
    vatTreatment: defaultCustomerInvoiceVatTreatment(input),
    vatRate: '25',
    attachment: null,
  }
}

function invoiceBookingLabel(booking: CustomerInvoice['bookings'][number]) {
  if (booking.bookingKind === 'year_end_receivable') {
    return `${formatCustomerInvoiceDate(booking.bookingDate)}: togs med i bokslutet`
  }
  if (booking.bookingKind === 'receivable_settlement') {
    return `${formatCustomerInvoiceDate(booking.bookingDate)}: betalning efter bokslut`
  }
  if (booking.bookingKind === 'payment_same_year_reversal') {
    return `${formatCustomerInvoiceDate(booking.bookingDate)}: direktbetalning ångrad`
  }
  if (booking.bookingKind === 'receivable_settlement_reversal') {
    return `${formatCustomerInvoiceDate(booking.bookingDate)}: betalning efter bokslut ångrad`
  }
  return `${formatCustomerInvoiceDate(booking.bookingDate)}: betalning bokförd`
}

export default function CustomerInvoicesPanel({
  selectedYear,
  isYearLocked,
  vatStatus,
  domesticSalesVatTreatment,
  onUploadAttachment,
  onBookkeepingChanged,
  onYearCloseBlockerChange,
}: CustomerInvoicesPanelProps) {
  const [form, setForm] = useState<InvoiceFormState>(() =>
    initialForm({ vatStatus, domesticSalesVatTreatment })
  )
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([])
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({})
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<InvoiceFormState>(() =>
    initialForm({ vatStatus, domesticSalesVatTreatment })
  )
  const [editAttachmentUrl, setEditAttachmentUrl] = useState<string | null>(null)
  const [pendingUndoInvoice, setPendingUndoInvoice] = useState<CustomerInvoice | null>(null)

  const loadInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getCustomerInvoices(selectedYear)
      setInvoices(rows)
      setNotice(current => current?.type === 'error' ? current : null)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Kunde inte hämta fakturor.',
      })
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    const safeDefault = defaultCustomerInvoiceVatTreatment({
      vatStatus,
      domesticSalesVatTreatment,
    })
    setForm(prev => ({
      ...prev,
      vatTreatment: prev.vatTreatment === 'unknown' ? safeDefault : prev.vatTreatment,
    }))
  }, [domesticSalesVatTreatment, vatStatus])

  useEffect(() => {
    void loadInvoices()
  }, [loadInvoices])

  const yearEndBlockers = useMemo(
    () => invoices
      .map(invoice => customerInvoiceYearCloseBlockerFor(invoice, selectedYear))
      .filter((reason): reason is string => Boolean(reason)),
    [invoices, selectedYear]
  )

  useEffect(() => {
    onYearCloseBlockerChange(yearEndBlockers[0] ?? null)
  }, [onYearCloseBlockerChange, yearEndBlockers])

  const unpaidInvoices = invoices.filter(invoice => invoice.paymentStatus === 'unpaid')
  const yearEndCandidates = invoices.filter(invoice =>
    customerInvoiceNeedsYearEndBooking(invoice, selectedYear)
  )
  const unsafeVatBlockers = invoices.filter(invoice =>
    customerInvoiceHasUnsafeVatBlocker(invoice, selectedYear)
  )
  const yearEndTotal = yearEndCandidates.reduce(
    (sum, invoice) => sum + invoice.grossAmount,
    0
  )

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
      if (!form.attachment) {
        throw new Error('Lägg till fakturaunderlaget innan du registrerar fakturan.')
      }

      const attachmentUrl = await onUploadAttachment(form.attachment)
      await createCustomerInvoice({
        invoiceNumber: form.invoiceNumber,
        customerName: form.customerName,
        invoiceDate: form.invoiceDate,
        serviceDate: form.serviceDate,
        dueDate: form.dueDate,
        grossAmount,
        vatTreatment: form.vatTreatment,
        vatRate: form.vatTreatment === 'taxable' ? Number(form.vatRate) : null,
        attachmentUrl,
      })

      setForm(initialForm({ vatStatus, domesticSalesVatTreatment }))
      await refreshAfterAction('Fakturan är registrerad. Ingen bokföring skapades ännu.')
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Fakturan kunde inte registreras.',
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
      await refreshAfterAction(`Faktura ${invoice.invoiceNumber} är med i bokslutet.`)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Fakturan kunde inte tas med i bokslutet.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function handleBookAllYearEndReceivables() {
    if (yearEndCandidates.length === 0) return
    setNotice(null)
    setBusyKey('year-end-all')

    let completed = 0
    try {
      for (const invoice of yearEndCandidates) {
        await bookCustomerInvoiceYearEndReceivable(
          invoice.id,
          selectedYear,
          crypto.randomUUID()
        )
        completed += 1
      }

      await refreshAfterAction(
        `${completed} obetalda fakturor är med i bokslutet för ${selectedYear}.`
      )
    } catch (error) {
      await loadInvoices()
      await onBookkeepingChanged()
      setNotice({
        type: 'error',
        text: error instanceof Error
          ? `${completed} fakturor hann hanteras. Sedan stoppade SoloLedger: ${error.message}`
          : `${completed} fakturor hann hanteras. Sedan stoppade SoloLedger åtgärden.`,
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function handlePayment(invoice: CustomerInvoice) {
    const paymentDate = paymentDates[invoice.id] || `${selectedYear + 1}-01-15`
    const hasReceivable = hasAnyCustomerInvoiceYearEndBooking(invoice)
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
          ? `Betalningen för faktura ${invoice.invoiceNumber} är registrerad utan ny intäkt eller moms.`
          : `Betalningen för faktura ${invoice.invoiceNumber} är registrerad som direkt betald försäljning.`
      )
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Betalningen kunde inte registreras.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  function beginEdit(invoice: CustomerInvoice) {
    setNotice(null)
    setEditingInvoiceId(invoice.id)
    setEditAttachmentUrl(invoice.attachmentUrl)
    setEditForm({
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
      invoiceDate: invoice.invoiceDate,
      serviceDate: invoice.serviceDate,
      dueDate: invoice.dueDate,
      grossAmount: String(invoice.grossAmount),
      vatTreatment: invoice.vatTreatment,
      vatRate: String(invoice.vatRate ?? 25),
      attachment: null,
    })
  }

  function cancelEdit() {
    setEditingInvoiceId(null)
    setEditAttachmentUrl(null)
    setEditForm(initialForm({ vatStatus, domesticSalesVatTreatment }))
  }

  async function handleEditInvoice(invoice: CustomerInvoice, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setBusyKey(`edit-${invoice.id}`)

    try {
      const grossAmount = Number(editForm.grossAmount)
      if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
        throw new Error('Fakturabeloppet måste vara större än 0.')
      }

      const attachmentUrl = editForm.attachment
        ? await onUploadAttachment(editForm.attachment)
        : editAttachmentUrl

      if (!attachmentUrl) {
        throw new Error('Fakturaunderlag krävs för kundfaktura.')
      }

      await updateCustomerInvoiceUnbooked({
        invoiceId: invoice.id,
        invoiceNumber: editForm.invoiceNumber,
        customerName: editForm.customerName,
        invoiceDate: editForm.invoiceDate,
        serviceDate: editForm.serviceDate,
        dueDate: editForm.dueDate,
        grossAmount,
        vatTreatment: editForm.vatTreatment,
        vatRate: editForm.vatTreatment === 'taxable' ? Number(editForm.vatRate) : null,
        attachmentUrl,
      })

      cancelEdit()
      await refreshAfterAction(`Faktura ${editForm.invoiceNumber} är uppdaterad.`)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Fakturan kunde inte uppdateras.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  async function confirmUndoPayment() {
    const invoice = pendingUndoInvoice
    if (!invoice) return
    setNotice(null)
    setBusyKey(`undo-payment-${invoice.id}`)

    try {
      await undoCustomerInvoicePayment(invoice.id, crypto.randomUUID())
      setPendingUndoInvoice(null)
      await refreshAfterAction(`Betalningen för faktura ${invoice.invoiceNumber} är ångrad. Fakturan är obetald igen.`)
    } catch (error) {
      setNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Betalningen kunde inte ångras.',
      })
    } finally {
      setBusyKey(null)
    }
  }

  function requestUndoPayment(invoice: CustomerInvoice) {
    setNotice(null)
    setPendingUndoInvoice(invoice)
  }

  async function openAttachment(invoice: CustomerInvoice) {
    if (!invoice.attachmentUrl) return
    const { data, error } = await supabase
      .storage
      .from('attachments')
      .createSignedUrl(invoice.attachmentUrl, 60)
    if (error || !data?.signedUrl) {
      setNotice({
        type: 'error',
        text: error?.message ?? 'Kunde inte öppna fakturaunderlaget.',
      })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section
      data-testid="customer-invoices-panel"
      className="mb-6 rounded-[2rem] border border-gray-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
            Fakturor
          </p>
          <h2 className="mt-1 text-lg font-black tracking-tight text-gray-900">
            Kundfakturor som ska följas upp
          </h2>
          <p className="mt-2 text-xs font-bold leading-relaxed text-gray-500">
            Direktbetalningar bokförs i Bokföring. Här registreras kundfakturor som skickats ut men inte nödvändigtvis är betalda.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase text-gray-400">Obetalda</p>
            <p className="mt-1 text-lg font-black text-gray-900">{unpaidInvoices.length}</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-[9px] font-black uppercase text-blue-500">Kvar inför bokslut</p>
            <p className="mt-1 text-lg font-black text-blue-700">{yearEndCandidates.length}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 sm:col-span-1">
            <p className="text-[9px] font-black uppercase text-emerald-600">Summa</p>
            <p className="mt-1 text-sm font-black text-emerald-700">
              {fmtCustomerInvoiceCurrency(yearEndTotal)}
            </p>
          </div>
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

      {(yearEndCandidates.length > 0 || unsafeVatBlockers.length > 0) && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                Obetalda fakturor vid årets slut
              </p>
              <p className="mt-1 text-[10px] font-bold leading-relaxed text-amber-800">
                En faktura som fortfarande är obetald den 31 december måste tas med i rätt års bokföring. Då hamnar intäkt, moms och kundfordran på rätt år.
              </p>
              <p className="mt-1 text-[10px] font-bold leading-relaxed text-amber-800">
                {yearEndCandidates.length} fakturor återstår för bokslut {selectedYear}.
                {unsafeVatBlockers.length > 0
                  ? ` ${unsafeVatBlockers.length} stoppas tills momsfakta är klar.`
                  : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleBookAllYearEndReceivables()}
              disabled={isYearLocked || yearEndCandidates.length === 0 || busyKey === 'year-end-all'}
              className="h-10 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {busyKey === 'year-end-all' ? 'Hanterar...' : 'Ta med fakturorna i bokslutet'}
            </button>
          </div>
          {yearEndBlockers.length > 0 && (
            <ul className="mt-3 space-y-1">
              {yearEndBlockers.map(reason => (
                <li key={reason} className="text-[10px] font-bold leading-relaxed text-amber-800">
                  {reason}
                </li>
              ))}
            </ul>
          )}
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
            <SwedishDateInput
              value={form.invoiceDate}
              ariaLabel="Fakturadatum"
              onChange={value => setForm(prev => ({ ...prev, invoiceDate: value }))}
              className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Tjänstedatum</span>
            <SwedishDateInput
              value={form.serviceDate}
              ariaLabel="Tjänstedatum"
              onChange={value => setForm(prev => ({ ...prev, serviceDate: value }))}
              className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Förfallodatum</span>
            <SwedishDateInput
              value={form.dueDate}
              ariaLabel="Förfallodatum"
              onChange={value => setForm(prev => ({ ...prev, dueDate: value }))}
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

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <span className="text-[9px] font-black uppercase text-gray-500">
            Fakturaunderlag
          </span>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[9px] font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700">
            <span>Välj fil</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={event =>
                setForm(prev => ({
                  ...prev,
                  attachment: event.target.files?.[0] ?? null,
                }))
              }
              className="hidden"
              required
            />
          </label>
          <span
            className={`max-w-[260px] truncate text-[10px] font-bold ${
              form.attachment ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {form.attachment ? form.attachment.name : 'Underlag krävs för kundfaktura'}
          </span>
        </div>

        {form.vatTreatment === 'unknown' && (
          <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[10px] font-bold text-amber-800">
            Fakturan kan sparas, men betalning och bokslut stoppas tills momsfakta är klar.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={busyKey === 'create' || isYearLocked || !form.attachment}
            className="h-10 rounded-xl bg-emerald-600 px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {busyKey === 'create' ? 'Registrerar...' : 'Registrera faktura'}
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
            Hämtar fakturor...
          </p>
        ) : invoices.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-xs font-bold text-gray-400">
            Inga kundfakturor registrerade till och med {selectedYear}.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <div className="hidden grid-cols-7 gap-3 bg-gray-50 px-4 py-3 text-[9px] font-black uppercase text-gray-400 md:grid">
              <span>Faktura</span>
              <span>Kund</span>
              <span>Datum</span>
              <span>Förfaller</span>
              <span>Belopp</span>
              <span>Status</span>
              <span>Detaljer</span>
            </div>
            <div className="divide-y divide-gray-100">
              {invoices.map(invoice => {
                const anyReceivableBooked = hasAnyCustomerInvoiceYearEndBooking(invoice)
                const needsYearEndBooking = customerInvoiceNeedsYearEndBooking(invoice, selectedYear)
                const paymentDate = paymentDates[invoice.id] || `${selectedYear + 1}-01-15`
                const expanded = expandedInvoiceId === invoice.id
                const paymentLabel = customerInvoicePaymentLabel(invoice)
                const yearEndLabel = customerInvoiceYearEndLabel(invoice, selectedYear)
                const blocker = customerInvoiceYearCloseBlockerFor(invoice, selectedYear)
                const canEditInvoice = invoice.paymentStatus === 'unpaid' && invoice.bookings.length === 0
                const isEditing = editingInvoiceId === invoice.id

                return (
                  <div
                    key={invoice.id}
                    data-testid="customer-invoice-card"
                    className={`px-4 py-3 transition-colors ${
                      expanded
                        ? 'bg-emerald-50/60 ring-1 ring-inset ring-emerald-200'
                        : 'bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedInvoiceId(expanded ? null : invoice.id)}
                      className={`grid w-full grid-cols-1 gap-2 rounded-xl text-left md:grid-cols-7 md:items-center md:gap-3 ${
                        expanded ? 'bg-white px-3 py-2 shadow-sm' : ''
                      }`}
                    >
                      <span className="text-xs font-black text-gray-900">{invoice.invoiceNumber}</span>
                      <span className="text-xs font-bold text-gray-600">{invoice.customerName}</span>
                      <span className="text-[10px] font-bold text-gray-500">{formatCustomerInvoiceDate(invoice.invoiceDate)}</span>
                      <span className="text-[10px] font-bold text-gray-500">{formatCustomerInvoiceDate(invoice.dueDate)}</span>
                      <span className="text-xs font-black text-gray-900">
                        {fmtCustomerInvoiceCurrency(invoice.grossAmount)}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                          invoice.paymentStatus === 'paid'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}>
                          {paymentLabel}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${
                          anyReceivableBooked
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-500'
                        }`}>
                          {yearEndLabel}
                        </span>
                      </span>
                      <span className="text-[9px] font-black uppercase text-emerald-600 md:text-right">
                        {expanded ? 'Stäng' : 'Visa detaljer'}
                      </span>
                    </button>

                    {expanded && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
                        <div className="mb-3 flex flex-col gap-1 border-b border-emerald-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-black text-gray-900">
                              {invoice.invoiceNumber} · {invoice.customerName}
                            </p>
                            <p className="mt-0.5 text-[10px] font-bold text-gray-500">
                              {fmtCustomerInvoiceCurrency(invoice.grossAmount)} · {paymentLabel} · {yearEndLabel}
                            </p>
                          </div>
                          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">
                            Detaljer för vald faktura
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-gray-500">
                          <span>Tjänst {formatCustomerInvoiceDate(invoice.serviceDate)}</span>
                          <span>{customerInvoiceVatLabel(invoice)}</span>
                          <span>{invoice.attachmentUrl ? 'Underlag bifogat' : 'Underlag saknas'}</span>
                        </div>

                        {invoice.bookings.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {invoice.bookings.map(booking => (
                              <span
                                key={booking.id}
                                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[9px] font-bold text-gray-500"
                              >
                                {invoiceBookingLabel(booking)}
                              </span>
                            ))}
                          </div>
                        )}

                        {blocker && (
                          <p className="mt-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">
                            {blocker}
                          </p>
                        )}

                        {isEditing ? (
                          <form
                            onSubmit={event => void handleEditInvoice(invoice, event)}
                            className="mt-3 rounded-xl border border-emerald-100 bg-white px-3 py-3"
                          >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <label className="flex flex-col gap-1">
                                <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Fakturanr</span>
                                <input
                                  value={editForm.invoiceNumber}
                                  onChange={event => setEditForm(prev => ({ ...prev, invoiceNumber: event.target.value }))}
                                  className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
                                  required
                                />
                              </label>

                              <label className="flex flex-col gap-1">
                                <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Kund</span>
                                <input
                                  value={editForm.customerName}
                                  onChange={event => setEditForm(prev => ({ ...prev, customerName: event.target.value }))}
                                  className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
                                  required
                                />
                              </label>

                              <label className="flex flex-col gap-1">
                                <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Fakturadatum</span>
                                <SwedishDateInput
                                  value={editForm.invoiceDate}
                                  ariaLabel="Fakturadatum"
                                  onChange={value => setEditForm(prev => ({ ...prev, invoiceDate: value }))}
                                  className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
                                  required
                                />
                              </label>

                              <label className="flex flex-col gap-1">
                                <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Tjänstedatum</span>
                                <SwedishDateInput
                                  value={editForm.serviceDate}
                                  ariaLabel="Tjänstedatum"
                                  onChange={value => setEditForm(prev => ({ ...prev, serviceDate: value }))}
                                  className="rounded-xl border border-gray-200 bg-white p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
                                  required
                                />
                              </label>

                              <label className="flex flex-col gap-1">
                                <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Förfallodatum</span>
                                <SwedishDateInput
                                  value={editForm.dueDate}
                                  ariaLabel="Förfallodatum"
                                  onChange={value => setEditForm(prev => ({ ...prev, dueDate: value }))}
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
                                  value={editForm.grossAmount}
                                  onChange={event => setEditForm(prev => ({ ...prev, grossAmount: event.target.value }))}
                                  className="sl-money-input rounded-xl border p-3 text-sm font-black outline-none focus:border-emerald-300"
                                  required
                                />
                              </label>

                              <label className="flex flex-col gap-1">
                                <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Momsfakta</span>
                                <select
                                  value={editForm.vatTreatment}
                                  onChange={event => setEditForm(prev => ({
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

                              {editForm.vatTreatment === 'taxable' && (
                                <label className="flex flex-col gap-1">
                                  <span className="ml-1 text-[9px] font-black uppercase text-gray-500">Moms %</span>
                                  <select
                                    value={editForm.vatRate}
                                    onChange={event => setEditForm(prev => ({ ...prev, vatRate: event.target.value }))}
                                    className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
                                  >
                                    <option value="25">25%</option>
                                    <option value="12">12%</option>
                                    <option value="6">6%</option>
                                  </select>
                                </label>
                              )}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                              <span className="text-[9px] font-black uppercase text-gray-500">
                                Fakturaunderlag
                              </span>
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-emerald-700">
                                <span>Byt fil</span>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp,application/pdf"
                                  onChange={event =>
                                    setEditForm(prev => ({
                                      ...prev,
                                      attachment: event.target.files?.[0] ?? null,
                                    }))
                                  }
                                  className="hidden"
                                />
                              </label>
                              <span className="max-w-[260px] truncate text-[10px] font-bold text-emerald-700">
                                {editForm.attachment?.name ?? (editAttachmentUrl ? 'Befintligt underlag behålls' : 'Underlag krävs')}
                              </span>
                            </div>

                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-[9px] font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50"
                              >
                                Avbryt
                              </button>
                              <button
                                type="submit"
                                disabled={busyKey === `edit-${invoice.id}`}
                                className="h-9 rounded-xl bg-emerald-600 px-3 text-[9px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                              >
                                {busyKey === `edit-${invoice.id}` ? 'Sparar...' : 'Spara ändringar'}
                              </button>
                            </div>
                          </form>
                        ) : !canEditInvoice && invoice.paymentStatus === 'unpaid' && invoice.bookings.length > 0 ? (
                          <p className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-2 text-[10px] font-bold text-gray-500">
                            Fakturan är redan bokförd. Uppgifter som påverkar bokföringen kan inte ändras direkt.
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex flex-wrap gap-2">
                            {invoice.attachmentUrl && (
                              <button
                                type="button"
                                onClick={() => void openAttachment(invoice)}
                                className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-[9px] font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50"
                              >
                                Öppna underlag
                              </button>
                            )}

                            {canEditInvoice && !isEditing && (
                              <button
                                type="button"
                                onClick={() => beginEdit(invoice)}
                                className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-[9px] font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50"
                              >
                                Redigera faktura
                              </button>
                            )}

                            {needsYearEndBooking && (
                              <button
                                type="button"
                                onClick={() => void handleBookYearEndReceivable(invoice)}
                                disabled={isYearLocked || busyKey === `year-end-${invoice.id}`}
                                className="h-9 rounded-xl bg-blue-600 px-3 text-[9px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                              >
                                {busyKey === `year-end-${invoice.id}` ? 'Hanterar...' : 'Ta med i bokslutet'}
                              </button>
                            )}
                          </div>

                          {invoice.paymentStatus === 'unpaid' && (
                            <div className="flex gap-2">
                              <SwedishDateInput
                                value={paymentDate}
                                ariaLabel="Betalningsdatum"
                                onChange={value => setPaymentDates(prev => ({
                                  ...prev,
                                  [invoice.id]: value,
                                }))}
                                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-emerald-300"
                              />
                              <button
                                type="button"
                                onClick={() => void handlePayment(invoice)}
                                disabled={busyKey === `payment-${invoice.id}`}
                                className="h-9 rounded-xl bg-emerald-600 px-3 text-[9px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                              >
                                {busyKey === `payment-${invoice.id}` ? 'Registrerar...' : 'Registrera betalning'}
                              </button>
                            </div>
                          )}

                          {invoice.paymentStatus === 'paid' && (
                            <button
                              type="button"
                              onClick={() => requestUndoPayment(invoice)}
                              disabled={busyKey === `undo-payment-${invoice.id}`}
                              className="h-9 rounded-xl border border-red-200 bg-white px-3 text-[9px] font-black uppercase tracking-wider text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
                            >
                              {busyKey === `undo-payment-${invoice.id}` ? 'Ångrar...' : 'Ångra registrerad betalning'}
                            </button>
                          )}
                        </div>

                        {invoice.vatTreatment === 'unknown' && invoice.paymentStatus === 'unpaid' && (
                          <p className="mt-2 text-[9px] font-bold leading-relaxed text-amber-700">
                            SoloLedger stoppar betalning och bokslut tills fakturans momsstatus är säker.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {pendingUndoInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 px-4"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="undo-customer-invoice-payment-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl"
          >
            <p
              id="undo-customer-invoice-payment-title"
              className="text-base font-black tracking-tight text-gray-900"
            >
              Ångra registrerad betalning?
            </p>
            <p className="mt-2 text-xs font-bold leading-relaxed text-gray-600">
              SoloLedger skapar en korrigerande bokning för betalningen och gör fakturan obetald igen. Den ursprungliga verifikationen tas inte bort.
            </p>
            <p className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-bold text-gray-500">
              {pendingUndoInvoice.invoiceNumber} · {pendingUndoInvoice.customerName}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingUndoInvoice(null)}
                disabled={busyKey === `undo-payment-${pendingUndoInvoice.id}`}
                className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={() => void confirmUndoPayment()}
                disabled={busyKey === `undo-payment-${pendingUndoInvoice.id}`}
                className="h-10 rounded-xl bg-red-600 px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {busyKey === `undo-payment-${pendingUndoInvoice.id}` ? 'Ångrar...' : 'Ångra betalning'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
