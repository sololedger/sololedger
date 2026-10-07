'use client'

export const dynamic = 'force-dynamic'

import { useCallback, useState, useEffect, useRef, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { bookTransaction, bookVatV2EuServiceReverseChargeTransaction, createCorrectionTransaction, bookPeriodizedTransaction, isYearClosed, closeYear, updateTransaction, getCustomerInvoices } from '@/lib/accountingService'
import { exportSIE } from '@/lib/sieExport'
import { encodeCP437 } from '@/lib/cp437'
import { calculateDashboard, getBankSaldo } from '@/lib/calculations'
import Layout from '@/components/Layout'
import NEBilaga from '@/components/NEBilaga'
import Kontoplan from '@/components/Kontoplan'
import FAQ from '@/components/FAQ'
import Momsrapport from '@/components/Momsrapport'
import ProfileSettings from '@/components/ProfileSettings'
import TransactionTable from '@/components/TransactionTable'
import EmptyBookkeepingState from '@/components/EmptyBookkeepingState'
import OverviewCards from '@/components/OverviewCards'
import TransactionForm from '@/components/TransactionForm'
import CustomerInvoicesPanel from '@/components/CustomerInvoicesPanel'
import SieImportModal from '@/components/SieImportModal'

import SubscriptionGuard from '@/components/SubscriptionGuard'
import Paywall from '@/components/Paywall'
import AdminPanel from '@/components/AdminPanel'

import { canCreateTransactions, FREE_TRANSACTION_LIMIT, getFreeTransactionUsage } from '@/lib/subscriptionLimits'
import { useAuth } from '@/hooks/useAuth'
import { useAccountingData } from '@/hooks/useAccountingData'
import { profileToCompanyVatProfile } from '@/lib/vatProfileAdapter'
import { usePaymentAccountRoleConfiguration } from '@/hooks/usePaymentAccountRoleConfiguration'
import {
  buildPaymentAccountRoleSetups,
  paymentAccountRoleConfigurationNeedsAction,
} from '@/lib/paymentAccountRoleStatus'
import {
  buildVatV2RuntimeBookingFileSignature,
  buildVatV2RuntimeBookingIntent,
  buildVatV2RuntimeBookingIntentDraft,
  clearVatV2RuntimeBookingIdempotency,
  clearVatV2RuntimeBookingIdempotencyStorage,
  prepareVatV2RuntimeBookingIdempotencyKey,
  readVatV2RuntimeBookingIdempotencyFromStorage,
  reusableVatV2RuntimeBookingUploadedFileUrl,
  VatV2RuntimeBookingSubmissionError,
  vatV2RuntimeBookingSubmissionErrorMessage,
  vatV2RuntimeBookingSubmissionFailureKind,
  writeVatV2RuntimeBookingIdempotencyToStorage,
  type VatV2RuntimeBookingIdempotencyState,
  type VatV2RuntimeBookingRequest,
} from '@/lib/vatRuntimeBooking'
import {
  isTransactionSystemManagedInUi,
  transactionSourceUiLabel,
} from '@/lib/transactionSourceUi'
import { customerInvoiceYearCloseBlockerFor } from '@/lib/customerInvoiceUi'
import { categoryUsesDomesticSalesVatPolicy } from '@/lib/accountCategoryUi'

export default function Home() {
  const {
    user, profile, authLoading, profileError, retryProfile,
    authNotice, dismissAuthNotice, resetPassword, updatePassword,
    passwordRecoveryMode, exitPasswordRecoveryMode,
    handleAuth, handleLogout, setProfile,
  } = useAuth()

  const [isRegistering, setIsRegistering] = useState(false)
  const [showResetForm, setShowResetForm] = useState(false)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('')
  const [recoverySaving, setRecoverySaving] = useState(false)
  const [recoveryNotice, setRecoveryNotice] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [activeTab, setActiveTab] = useState('dashboard')
  // SSR-säkert: statiskt värde vid server-render
  const [selectedYear, setSelectedYear] = useState(2025)

  const {
    transactions,
    balances,
    balanceSheetBalances,
    neData,
    journalMap,
    kontoplan,
    kontoplanLoading,
    kontoplanLoaded,
    kontoplanError,
    dataLoading,
    isYearLocked, setIsYearLocked,
    refreshData,
    refreshDataWithStatus,
    loadKontoplanOptions,
    momsBreakdown,
  } = useAccountingData(user, selectedYear, profile?.subscription_type)
  const paymentAccountRoles = usePaymentAccountRoleConfiguration(user?.id)

  const isAdmin = profile?.role === 'admin'
  const companyVatProfileResult = profileToCompanyVatProfile(profile)
  const paymentAccountRoleSetups = buildPaymentAccountRoleSetups({
    configuredRoles: paymentAccountRoles.configuredRoles,
    accounts: kontoplan,
    accountsState: {
      loaded: kontoplanLoaded,
      loading: kontoplanLoading,
      error: kontoplanError,
    },
  })
  const paymentAccountRolesNeedAction = paymentAccountRoleConfigurationNeedsAction({
    state: {
      paymentRoles: {
        loaded: paymentAccountRoles.loaded,
        loading: paymentAccountRoles.loading,
        error: paymentAccountRoles.error,
      },
      accounts: {
        loaded: kontoplanLoaded,
        loading: kontoplanLoading,
        error: kontoplanError,
      },
    },
    setups: paymentAccountRoleSetups,
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBooked, setEditingBooked] = useState(false)
  const [showLimitPaywall, setShowLimitPaywall] = useState(false)
  const [freeUsageCount, setFreeUsageCount] = useState(0)

  // SSR-säkert: alltid 45 vid server-render, synkas med localStorage i useEffect nedan
  const [taxRate, setTaxRate] = useState(45)

  const [uploading, setUploading] = useState(false)
  // Synchronous guard: React-state hinner inte alltid disable:a knappen mellan
  // två extremt snabba submit-events. Ref:en sätts direkt och stoppar ett andra
  // anrop innan något async-arbete eller databasanrop startas.
  const submitInFlightRef = useRef(false)
  const vatV2RuntimeBookingIdempotencyRef =
    useRef<VatV2RuntimeBookingIdempotencyState>(
      clearVatV2RuntimeBookingIdempotency()
    )
  const [showSieImport, setShowSieImport] = useState(false)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)
  const [lastSubmitted, setLastSubmitted] = useState<{ type: string; amount: string; vatRate: number } | null>(null)
  const [customerInvoiceYearCloseBlocker, setCustomerInvoiceYearCloseBlocker] =
    useState<string | null>(null)

  // SSR-säkert: tomma strängar vid server-render, fylls i av useEffect nedan
  const [formData, setFormData] = useState({
    date: '2025-01-01', // ✅ VIKTIGT
    description: '',
    amount: '',
    type: '',
    vatRate: 0,
    file: null as File | null
  })

  const [periodisera, setPeriodisera] = useState(false)
  // SSR-säkert: tom sträng vid server-render
  const [periodMonth, setPeriodMonth] = useState('2026-01')

  // Sätter datum-defaultvärden efter hydration
  useEffect(() => {
    const today = new Date()
    setSelectedYear(today.getFullYear())
    setFormData(prev => ({
      ...prev,
      date: today.toISOString().split('T')[0]
    }))
    const next = new Date()
    next.setFullYear(next.getFullYear() + 1, 0, 1)
    setPeriodMonth(next.toISOString().slice(0, 7))
  }, [])

  const years = [selectedYear - 1, selectedYear, selectedYear + 1]

  async function refreshFreeUsageCount(): Promise<number> {
    if (!user?.id) {
      setFreeUsageCount(0)
      return 0
    }

    const count = await getFreeTransactionUsage(user.id)
    setFreeUsageCount(count)
    return count
  }

  const refreshBookkeepingAfterCustomerInvoice = useCallback(async () => {
    await refreshData()
    await refreshFreeUsageCount()
  }, [refreshData, user?.id])

  useEffect(() => {
    let cancelled = false

    if (!user?.id) {
      setCustomerInvoiceYearCloseBlocker(null)
      return
    }

    getCustomerInvoices(selectedYear)
      .then(invoices => {
        if (cancelled) return
        const blocker = invoices
          .map(invoice => customerInvoiceYearCloseBlockerFor(invoice, selectedYear))
          .find((reason): reason is string => Boolean(reason)) ?? null
        setCustomerInvoiceYearCloseBlocker(blocker)
      })
      .catch(error => {
        console.error('Kunde inte läsa fakturor inför årslåsning:', error)
        if (!cancelled) {
          setCustomerInvoiceYearCloseBlocker('Kunde inte kontrollera obetalda kundfakturor inför årslåsning.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedYear, user?.id])

  // Gratisgränsen gäller TOTALT över alla år, inte bara valt räkenskapsår.
  useEffect(() => {
    let cancelled = false

    if (!user?.id) {
      setFreeUsageCount(0)
      return
    }

    getFreeTransactionUsage(user.id)
      .then(count => {
        if (!cancelled) setFreeUsageCount(count)
      })
      .catch(err => console.error('Kunde inte läsa gratisanvändning:', err))

    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Lås bakgrundsscrollen när betalväggen visas
  useEffect(() => {
    if (showLimitPaywall) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [showLimitPaywall])

  // Läser sparad skattesats från localStorage EFTER hydration (aldrig under SSR)
  useEffect(() => {
    const saved = Number(localStorage.getItem('taxRate'))
    if (!isNaN(saved) && saved >= 25 && saved <= 55) {
      setTaxRate(saved)
    }
  }, [])

  // Skriver tillbaka till localStorage när användaren justerar reglaget
  useEffect(() => {
    localStorage.setItem('taxRate', taxRate.toString())
  }, [taxRate])

  async function handleExportSIE() {
    try {
      const content = await exportSIE(selectedYear)
      // #FORMAT PC8 i filens header kräver enligt SIE-specifikationen att
      // filens faktiska bytes är kodade som IBM Extended 8-bit ASCII
      // (codepage 437) - inte UTF-8, som new Blob([content]) annars skulle
      // ge implicit. Konverteringen sker HELT separat i src/lib/cp437.ts.
      const bytes = encodeCP437(content)
      const blob = new Blob( [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/octet-stream' } )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `SIE-${selectedYear}.se`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('SIE-export misslyckades: ' + err.message)
    }
  }

  // UI-skyddet speglar momsprofilens separata försäljningsfakta: en
  // momsregistrerad firma kan fortfarande ha svensk försäljning utan moms.
  // Databasen är fortfarande den riktiga säkerhetsgränsen.
  useEffect(() => {
    const selectedCategory = kontoplan.find(k => k.id === formData.type)
    if (
      !selectedCategory ||
      !categoryUsesDomesticSalesVatPolicy(selectedCategory)
    ) {
      return
    }
    if (
      profile?.vat_status === 'registered' &&
      profile.domestic_sales_vat_treatment === 'taxable'
    ) {
      return
    }
    setFormData(prev => prev.vatRate === 0 ? prev : { ...prev, vatRate: 0 })
  }, [
    formData.type,
    kontoplan,
    profile?.vat_status,
    profile?.domestic_sales_vat_treatment,
  ])

  async function handleFileUpload(file: File): Promise<string> {
    const ALLOWED_TYPES: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png':  'png',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
    }
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      throw new Error(`Filtypen "${file.type}" är inte tillåten. Endast JPG, PNG, WebP och PDF accepteras.`)
    }
    const safeName = `${user.id}/${Date.now()}-${crypto?.randomUUID?.() || Date.now().toString()}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(safeName, file)
    if (error) throw new Error('Filuppladdning misslyckades: ' + error.message)
    return safeName
  }

  function isSystemManagedTransaction(tx: { source?: string } | null | undefined) {
    return isTransactionSystemManagedInUi(tx)
  }

  function describeSystemManagedTransaction(tx: { source?: string } | null | undefined) {
    return transactionSourceUiLabel(tx) ?? 'Systemverifikationer'
  }

  function vatV2RuntimeBookingStorage() {
    try {
      return typeof window === 'undefined' ? null : window.sessionStorage
    } catch {
      return null
    }
  }

  function resetVatV2RuntimeBookingIdempotency() {
    vatV2RuntimeBookingIdempotencyRef.current =
      clearVatV2RuntimeBookingIdempotency()
    clearVatV2RuntimeBookingIdempotencyStorage(vatV2RuntimeBookingStorage())
  }

  async function handleVatV2RuntimeBooking(
    request: VatV2RuntimeBookingRequest,
    file: File | null
  ) {
    if (isYearLocked) {
      throw new Error('Räkenskapsåret är låst för ändringar.')
    }
    if (submitInFlightRef.current) {
      throw new Error('Bokningen behandlas redan.')
    }

    submitInFlightRef.current = true
    setUploading(true)

    try {
      const currentUsage = await refreshFreeUsageCount()
      const allowed = canCreateTransactions(
        profile ?? { subscription_type: 'free', subscription_end: null },
        currentUsage,
        1
      )

      if (!allowed) {
        setShowLimitPaywall(true)
        throw new Error('Gratisgränsen är nådd för nya verifikationer.')
      }

      const targetYear = parseInt(request.date.slice(0, 4))
      const isTargetYearClosed = await isYearClosed(targetYear)
      if (isTargetYearClosed) {
        throw new Error(`Räkenskapsår ${targetYear} är låst för ändringar.`)
      }

      const intentDraft = buildVatV2RuntimeBookingIntentDraft(request)
      const fileSignature = buildVatV2RuntimeBookingFileSignature(file)
      const storedIdempotency =
        readVatV2RuntimeBookingIdempotencyFromStorage(
          vatV2RuntimeBookingStorage()
        )
      const reusableUploadedFileUrl =
        reusableVatV2RuntimeBookingUploadedFileUrl(
          storedIdempotency,
          intentDraft,
          fileSignature
        )

      let fileUrl: string | null = reusableUploadedFileUrl
      if (!fileUrl && file) {
        fileUrl = await handleFileUpload(file)
      }

      const intent = buildVatV2RuntimeBookingIntent(request, fileUrl)
      const idempotencyFileSignature =
        fileUrl && fileUrl === storedIdempotency.intent?.fileUrl
          ? storedIdempotency.fileSignature
          : fileSignature
      const seedState = vatV2RuntimeBookingIdempotencyRef.current.key
        ? vatV2RuntimeBookingIdempotencyRef.current
        : storedIdempotency
      const preparedIdempotency = prepareVatV2RuntimeBookingIdempotencyKey(
        seedState,
        intent,
        () => crypto.randomUUID(),
        idempotencyFileSignature
      )
      vatV2RuntimeBookingIdempotencyRef.current = preparedIdempotency.state
      writeVatV2RuntimeBookingIdempotencyToStorage(
        vatV2RuntimeBookingStorage(),
        preparedIdempotency.state
      )

      const result = await bookVatV2EuServiceReverseChargeTransaction({
        date: request.date,
        description: request.description,
        treatment: request.treatment,
        paymentAccountNumber: request.paymentAccountNumber,
        paymentRole: request.paymentRole,
        idempotencyKey: preparedIdempotency.key,
        fileUrl,
      })

      setLastSubmitted(null)
      setFormData(prev => ({
        ...prev,
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        type: '',
        vatRate: 0,
        file: null,
      }))
      setPeriodisera(false)

      try {
        await refreshData()
        await refreshFreeUsageCount()
      } catch (refreshError) {
        console.error('VAT V2-bokning skapad men uppdatering misslyckades:', refreshError)
        resetVatV2RuntimeBookingIdempotency()
        alert(`${result.idempotentReplay ? 'VAT V2-bokningen var redan skapad' : '✅ VAT V2-bokning skapad'} som VER-${result.verNr}. Uppdatera sidan om den inte syns direkt.`)
        return
      }

      resetVatV2RuntimeBookingIdempotency()
      alert(result.idempotentReplay
        ? `VAT V2-bokningen var redan skapad som VER-${result.verNr}.`
        : `✅ VAT V2-bokning skapad som VER-${result.verNr}.`)
    } catch (err: unknown) {
      console.error('Fel vid VAT V2-bokning:', err)
      if (!(err instanceof VatV2RuntimeBookingSubmissionError)) {
        throw new Error(
          err instanceof Error
            ? err.message
            : 'VAT V2-bokningen misslyckades.'
        )
      }
      if (
        vatV2RuntimeBookingSubmissionFailureKind(err) ===
        'authoritative_rejection'
      ) {
        resetVatV2RuntimeBookingIdempotency()
      }
      throw new Error(vatV2RuntimeBookingSubmissionErrorMessage(err))
    } finally {
      submitInFlightRef.current = false
      setUploading(false)
    }
  }

  async function handleAddTransaction(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isYearLocked) return

    if (submitInFlightRef.current) return
    if (editingId) {
      const editingTx = transactions.find(tx => tx.id === editingId)
      if (isSystemManagedTransaction(editingTx)) {
        alert(`${describeSystemManagedTransaction(editingTx)} är systemverifikationer och kan inte ändras.`)
        return
      }
    } else if (!formData.type) {
      alert('Välj kategori innan du bokför.')
      return
    }

    submitInFlightRef.current = true
    setUploading(true)

    try {
      if (!editingId) {
        const currentUsage = await refreshFreeUsageCount()
        // En vanlig bokning skapar 1 VER. En periodisering skapar 2 riktiga VER
        // (ursprungsverifikation + framtida vändningsverifikation).
        const verificationsToCreate = periodisera ? 2 : 1
        const allowed = canCreateTransactions(
          profile ?? { subscription_type: 'free', subscription_end: null },
          currentUsage,
          verificationsToCreate
        )

        if (!allowed) {
          setShowLimitPaywall(true)
          return
        }
      }
      const targetYear = parseInt(formData.date.slice(0, 4))
      const isTargetYearClosed = await isYearClosed(targetYear)
      if (isTargetYearClosed) {
        throw new Error(`Räkenskapsår ${targetYear} är låst för ändringar.`)
      }

      let fileUrl = ''
      if (formData.file) {
        fileUrl = await handleFileUpload(formData.file)
      }

      if (editingId) {
        const updatePayload: any = {
          date: formData.date,
          description: formData.description
        }
        if (!editingBooked) {
          updatePayload.amount = Number(formData.amount)
          updatePayload.type = formData.type
          updatePayload.vat_rate = formData.vatRate
        }
        if (fileUrl) {
          updatePayload.file_url = fileUrl
        }
        await updateTransaction(editingId, updatePayload)
        setEditingId(null)
        setEditingBooked(false)
      } else {
        if (periodisera) {
          const futureDate = `${periodMonth}-01`
          await bookPeriodizedTransaction({
            date: formData.date,
            future_date: futureDate,
            description: formData.description,
            amount: Number(formData.amount),
            type: formData.type,
            vat_rate: formData.vatRate,
            file_url: fileUrl || null,
          })
        } else {
          // Vanlig bokföring sker i ett enda atomärt RPC-anrop.
          // Frontend skapar inte längre först en "halv" transaction.
          await bookTransaction({
            date: formData.date,
            description: formData.description,
            amount: Number(formData.amount),
            type: formData.type,
            vat_rate: formData.vatRate,
            file_url: fileUrl || null,
          })
        }
      }

      setLastSubmitted({ type: formData.type, amount: formData.amount, vatRate: formData.vatRate })
      setFormData(prev => ({
        ...prev,
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        type: '',
        vatRate: 0,
        file: null
      }))
      setPeriodisera(false)
      await refreshData()
      await refreshFreeUsageCount()
    } catch (err: any) {
      console.error('Fel vid bokföring:', err)
      alert('Fel: ' + err.message)
    } finally {
      submitInFlightRef.current = false
      setUploading(false)
    }
  }

  async function handleDelete(tx: any) {
    if (isYearLocked) return
    if (isSystemManagedTransaction(tx)) {
      alert(`${describeSystemManagedTransaction(tx)} är systemverifikationer och kan inte korrigeras här.`)
      return
    }

    const journal = journalMap[tx.id] || []
    const verNr = journal[0]?.ver_nr
    const confirmed = confirm(
      verNr
        ? `Skapa korrigeringsverifikation VER-? för VER-${verNr}?\n\nDetta nollar ut bokföringen och kan inte ångras.`
        : `Skapa korrigeringsverifikation för "${tx.description}"?\n\nDetta kan inte ångras.`
    )
    if (!confirmed) return
    try {
      const newVerNr = await createCorrectionTransaction(tx.id)
      alert(`✅ Korrigeringsverifikation VER-${newVerNr} skapad.`)
      await refreshData()
    } catch (err: any) {
      console.error('Fel vid korrigering:', err)
      alert('Kunde inte skapa korrigering: ' + err.message)
    }
  }

  const handleEdit = (tx: any) => {
    if (isYearLocked) return
    if (isSystemManagedTransaction(tx)) {
      alert(`${describeSystemManagedTransaction(tx)} är systemverifikationer och kan inte ändras.`)
      return
    }

    setEditingId(tx.id)
    setEditingBooked(tx.booked === true)
    setFormData({
      date: tx.date,
      description: tx.description,
      amount: tx.amount.toString(),
      type: tx.type,
      vatRate: tx.vat_rate,
      file: null
    })
    // Scrolla till formuläret (inte sidans topp) — viktigt på mobil där
    // Ekonomiöversikt-korten annars hamnar mellan användaren och formuläret.
    requestAnimationFrame(() => {
      const formSection = document.getElementById('transaction-form-section')
      if (formSection) {
        const top = formSection.getBoundingClientRect().top + window.scrollY - 16
        window.scrollTo({ top, behavior: 'smooth' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingBooked(false)
    setFormData(prev => ({ ...prev, description: '', amount: '', file: null }))
  }

  async function handleLockYear() {
    const confirmed = confirm(
      `Är du säker på att du vill låsa ${selectedYear}?\n\nDetta låser alla verifikationer permanent och kan inte ångras enligt god redovisningssed.`
    )
    if (!confirmed) return
    try {
      await closeYear(selectedYear)
      setIsYearLocked(true)
      await refreshData()
    } catch (err: any) {
      alert('Fel vid låsning: ' + err.message)
    }
  }

  async function handleFavorite(name: string) {
    if (!lastSubmitted) return
    await supabase.from('favorites').insert({
      user_id: user.id,
      name,
      type: lastSubmitted.type,
      amount: Number(lastSubmitted.amount),
      vat_rate: lastSubmitted.vatRate,
    })
    setLastSubmitted(null)
  }

  const data = calculateDashboard(balances, taxRate, momsBreakdown)
  // Steg 2 av carry-forward-arbetet: ENDAST Bank-kortet ska visa kumulativt
  // saldo (balanceSheetBalances, se getBalanceSheetBalances()) istället för
  // årets egna rörelse. Allt annat i "data" (bl.a. sakertUttag) kommer
  // fortsatt från calculateDashboard() ovan och är medvetet oförändrat i
  // detta steg - se separat beslut om när/hur sakertUttag ska följa med.
  data.bankSaldo = getBankSaldo(balanceSheetBalances)
  // Steg 2b: Säkert uttag räknas om med samma formel som calculateDashboard()
  // redan använder (calculations.ts), men med det nu kumulativa
  // data.bankSaldo istället för årets egna bankrörelse. skattReserv och
  // momsNetto kommer fortfarande oförändrade från calculateDashboard().
  data.sakertUttag = data.momsManualReviewRequired
    ? 0
    : Math.round(
        (data.bankSaldo - data.skattReserv - (data.momsNetto > 0 ? data.momsNetto : 0)) * 100
      ) / 100


  const hasActiveSubscription =
    (profile?.subscription_type === 'paid' || profile?.subscription_type === 'trial') &&
    (!profile?.subscription_end || new Date(profile.subscription_end).getTime() > Date.now())
  const showFreeBanner = !hasActiveSubscription

  if (authLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">Laddar...</div>
  }

  if (user && !profile) {
    if (profileError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2.5rem] border border-red-100 shadow-sm p-8 max-w-sm w-full text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <p className="text-sm font-black uppercase text-gray-700 mb-2">Kunde inte ladda din profil</p>
            <p className="text-xs text-gray-400 font-bold mb-6">
              Det tar ovanligt lång tid att hämta dina kontouppgifter. Kontrollera din uppkoppling och försök igen.
            </p>
            <button
              onClick={retryProfile}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-xs font-black uppercase tracking-widest transition-all"
            >
              Försök igen
            </button>
          </div>
        </div>
      )
    }
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">Laddar...</div>
  }

  // Om användaren kom hit via en klickad återställningslänk: visa en
  // dedikerad "sätt nytt lösenord"-skärm direkt, istället för att tyst
  // släppa in dem i vanliga appen där det inte är uppenbart varför de
  // egentligen är inloggade.
  if (passwordRecoveryMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            setRecoveryNotice(null)
            if (recoveryPassword.length < 6) {
              setRecoveryNotice({ type: 'error', text: 'Lösenordet måste vara minst 6 tecken.' })
              return
            }
            if (recoveryPassword !== recoveryPasswordConfirm) {
              setRecoveryNotice({ type: 'error', text: 'Lösenorden matchar inte.' })
              return
            }
            setRecoverySaving(true)
            const result = await updatePassword(recoveryPassword)
            setRecoverySaving(false)
            if (result.success) {
              setRecoveryNotice({ type: 'success', text: '✓ Lösenordet är uppdaterat! Du kan nu använda appen som vanligt.' })
              setRecoveryPassword('')
              setRecoveryPasswordConfirm('')
              setTimeout(() => exitPasswordRecoveryMode(), 1500)
            } else {
              setRecoveryNotice({ type: 'error', text: result.error })
            }
          }}
          className="bg-white p-10 rounded-[2.5rem] shadow-xl border-2 border-emerald-500 w-full max-w-sm text-center"
        >
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl italic mx-auto mb-6">S</div>
          <h1 className="text-lg font-black uppercase tracking-tighter italic text-gray-800 mb-2">SoloLedger</h1>
          <p className="text-[10px] font-black uppercase text-emerald-600 mb-6 tracking-wider">Sätt nytt lösenord</p>

          {recoveryNotice && (
            <div className={`mb-4 rounded-2xl px-4 py-3 text-[11px] font-bold text-left ${
              recoveryNotice.type === 'error'
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              {recoveryNotice.text}
            </div>
          )}

          <input
            type="password"
            value={recoveryPassword}
            onChange={e => setRecoveryPassword(e.target.value)}
            placeholder="Nytt lösenord (minst 6 tecken)"
            className="w-full bg-gray-50 rounded-2xl p-4 mb-3 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
            required
          />
          <input
            type="password"
            value={recoveryPasswordConfirm}
            onChange={e => setRecoveryPasswordConfirm(e.target.value)}
            placeholder="Bekräfta nytt lösenord"
            className="w-full bg-gray-50 rounded-2xl p-4 mb-6 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
            required
          />
          <button
            type="submit"
            disabled={recoverySaving}
            className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-md disabled:opacity-50"
          >
            {recoverySaving ? 'Uppdaterar...' : 'Spara nytt lösenord'}
          </button>
        </form>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border-2 border-emerald-500 w-full max-w-sm text-center">
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl italic mx-auto mb-6">
            S
          </div>
  
          <h1 className="text-lg font-black uppercase tracking-tighter italic text-gray-800 mb-2">
            SoloLedger
          </h1>
  
          <p className="text-[10px] font-black uppercase text-emerald-600 mb-6 tracking-wider">
            {showResetForm
              ? 'Återställ lösenord'
              : isRegistering
                ? 'Skapa nytt konto'
                : 'Fleranvändarsystem'}
          </p>
  
          {authNotice && (
            <div
              className={`mb-4 rounded-2xl px-4 py-3 text-[11px] font-bold text-left ${
                authNotice.type === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {authNotice.text}
            </div>
          )}
  
  {showResetForm ? (
            <form>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="E-postadress"
                className="w-full bg-gray-50 rounded-2xl p-4 mb-3 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
                required
              />

              <p className="text-[10px] text-gray-400 font-bold mb-6 leading-relaxed">
                Vi skickar en länk till din e-post där du kan sätta ett nytt lösenord.
              </p>

              <button
                type="button"
                onClick={() => resetPassword(email)}
                className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-md mb-4"
              >
                Skicka återställningslänk
              </button>

              <button
                type="button"
                onClick={() => { setShowResetForm(false); dismissAuthNotice() }}
                className="text-[10px] text-gray-400 hover:text-emerald-600 font-black uppercase tracking-wider transition-colors"
              >
                Tillbaka till inloggning
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) =>
                handleAuth(e, {
                  email,
                  password,
                  isRegistering,
                })
              }
            >
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="E-postadress"
                className="w-full bg-gray-50 rounded-2xl p-4 mb-3 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
                required
              />
  
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Lösenord"
                className="w-full bg-gray-50 rounded-2xl p-4 mb-2 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
                required
              />
  
              {!isRegistering && (
                <button
                  type="button"
                  onClick={() => {
                    setShowResetForm(true)
                    dismissAuthNotice()
                  }}
                  className="block ml-auto mb-4 text-[9px] text-gray-400 hover:text-emerald-600 font-bold uppercase tracking-wider transition-colors"
                >
                  Glömt lösenord?
                </button>
              )}
  
              <button
                type="submit"
                className={`w-full bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-md mb-4 ${
                  isRegistering ? '' : 'mt-2'
                }`}
              >
                {isRegistering ? 'Registrera dig' : 'Logga in'}
              </button>
  
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering)
                  dismissAuthNotice()
                }}
                className="text-[10px] text-gray-400 hover:text-emerald-600 font-black uppercase tracking-wider transition-colors"
              >
                {isRegistering
                  ? 'Har du redan ett konto? Logga in'
                  : 'Inget konto? Skapa ett här'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      onLogout={handleLogout}
      isAdmin={isAdmin}
    >
      {showLimitPaywall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border-2 border-amber-400 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowLimitPaywall(false)}
              className="absolute top-6 right-6 w-8 h-8 bg-gray-100 hover:bg-gray-200 text-gray-500 font-black rounded-full flex items-center justify-center transition-all"
            >
              ✕
            </button>
            <Paywall feature="Obegränsat antal transaktioner" user={user} />
          </div>
        </div>
      )}

      <SieImportModal
        isOpen={showSieImport}
        onClose={() => setShowSieImport(false)}
        refreshData={refreshData}
        userId={user.id}
        profile={profile}
        onLimitReached={() => {
          setShowSieImport(false)
          setShowLimitPaywall(true)
        }}
        onUsageChanged={async () => { await refreshFreeUsageCount() }}
      />

<div className="mb-8 px-4 sm:px-6 lg:px-8">
  <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
        {activeTab === 'dashboard'
          ? 'Ekonomiöversikt'
          : activeTab === 'kontoplan'
            ? 'Kontoplan'
            : activeTab === 'fakturor'
              ? 'Fakturor'
            : activeTab === 'faq'
              ? 'Hjälp & FAQ'
              : activeTab === 'moms'
                ? 'Momsrapport'
                : activeTab === 'profil'
                  ? 'Profilinställningar'
                  : activeTab === 'admin'
                    ? 'Admin'
                    : 'NE-Bilaga'}
      </h1>

      <div className="flex flex-col gap-1 mt-1">
        <p className="text-[10px] text-gray-500 font-bold">
          Inloggad som:{' '}
          <span className="text-xs text-gray-700 font-black">
            {user?.email}
          </span>
        </p>

        {showFreeBanner && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mt-0.5">
            <span className="text-[10px] text-amber-600 font-black uppercase tracking-wider">
              Gratisplan — uppgradera för obegränsat
            </span>

            <span className="text-[10px] bg-amber-50 text-amber-700 font-black px-2 py-0.5 rounded-full border border-amber-200 shadow-sm w-fit">
              📊 {freeUsageCount} / {FREE_TRANSACTION_LIMIT} verifikationer använda
            </span>
          </div>
        )}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
      {!['profil', 'faq', 'kontoplan', 'moms'].includes(activeTab) && (
        <div className="h-10 flex items-center gap-2 bg-white px-3 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[10px] font-black uppercase text-gray-400 italic">
            År
          </span>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-emerald-50 border-none rounded-lg px-3 py-1 font-black text-sm text-emerald-600 outline-none cursor-pointer hover:bg-emerald-100 transition-colors"
          >
            {years.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <>
          <button
            onClick={() => setShowSieImport(true)}
            className="h-10 bg-sky-600 hover:bg-sky-700 text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
          >
            Importera SIE
          </button>

          <button
            onClick={handleExportSIE}
            className="h-10 bg-gray-900 hover:bg-black text-white px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-sm"
          >
            Exportera SIE
          </button>
        </>
      )}

      {['dashboard', 'ne-bilaga', 'NE-Bilaga', 'ne'].includes(activeTab) && (
        <div className="h-10 flex items-center gap-3 bg-white px-3 rounded-xl border border-gray-200 shadow-sm">
          <span className="text-[10px] font-black uppercase text-gray-400 italic">
            Skatt
          </span>

          <input
            type="range"
            min={25}
            max={55}
            step={1}
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="w-20 accent-emerald-500 cursor-pointer"
          />

          <span className="text-sm font-black text-emerald-600 w-8 tabular-nums text-right">
            {taxRate}%
          </span>
        </div>
      )}
    </div>
  </div>
</div>

      {activeTab === 'dashboard' ? (
        <>
          <OverviewCards
            data={data}
            taxRate={taxRate}
            transactions={transactions}
            journalMap={journalMap}
            setActiveModal={setActiveModal}
            activeModal={activeModal}
          />

          {isYearLocked && (
            <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-[2rem] px-6 py-4 mb-4 shadow-sm animate-in fade-in duration-200">
              <span className="text-xl">🔒</span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">
                  Räkenskapsår {selectedYear} är låst
                </p>
                <p className="text-[10px] font-bold text-amber-600 mt-0.5">
                  Detta räkenskapsår är låst och kan inte ändras enligt god redovisningssed.
                </p>
              </div>
            </div>
          )}

          {paymentAccountRolesNeedAction && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-blue-50 border-2 border-blue-100 rounded-[2rem] px-6 py-4 mb-4 shadow-sm">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-blue-700">
                  Slutför betalningskonton
                </p>
                <p className="text-[10px] font-bold text-blue-600 mt-0.5">
                  Vanlig bokföring fungerar ändå. Utlandsinköp och vissa skattekontoflöden behöver däremot veta vilka konton du har valt.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profil')}
                className="h-10 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                Öppna Profil
              </button>
            </div>
          )}

          <div id="transaction-form-section">
            <TransactionForm
              userId={user.id}
              vatStatus={profile?.vat_status ?? 'unknown'}
              domesticSalesVatTreatment={
                profile?.domestic_sales_vat_treatment ?? 'unknown'
              }
              companyVatProfileResult={companyVatProfileResult}
              formData={formData}
              setFormData={setFormData}
              kontoplan={kontoplan}
              isYearLocked={isYearLocked}
              editingId={editingId}
              editingBooked={editingBooked}
              uploading={uploading}
              periodisera={periodisera}
              setPeriodisera={setPeriodisera}
              periodMonth={periodMonth}
              setPeriodMonth={setPeriodMonth}
              onSubmit={handleAddTransaction}
              onVatV2Submit={handleVatV2RuntimeBooking}
              onCancelEdit={cancelEdit}
              lastSubmitted={lastSubmitted}
              onSaveFavorite={handleFavorite}
              onDismissFavorite={() => setLastSubmitted(null)}
              paymentAccountRoles={paymentAccountRoles.configuredRoles}
              paymentAccountRolesLoading={paymentAccountRoles.loading}
              paymentAccountRolesLoaded={paymentAccountRoles.loaded}
              paymentAccountRolesError={paymentAccountRoles.error}
              onRefreshPaymentAccountRoles={paymentAccountRoles.reload}
              onOpenPaymentAccountSettings={() => setActiveTab('profil')}
              onOpenCustomerInvoices={() => setActiveTab('fakturor')}
            />
          </div>

          {!dataLoading && transactions.length === 0 ? (
  <EmptyBookkeepingState
    selectedYear={selectedYear}
    onImportSIE={() => setShowSieImport(true)}
  />
) : (
  <TransactionTable
    transactions={transactions}
    journalMap={journalMap}
    kontoplan={kontoplan}
    isYearLocked={isYearLocked}
    editingId={editingId}
    selectedYear={selectedYear}
    onEdit={handleEdit}
    onDelete={handleDelete}
    onFavorite={handleFavorite}
  />
)}        </>
      ) : activeTab === 'kontoplan' ? (
        <Kontoplan onAccountCreated={loadKontoplanOptions} />
      ) : activeTab === 'fakturor' ? (
        <CustomerInvoicesPanel
          selectedYear={selectedYear}
          isYearLocked={isYearLocked}
          vatStatus={profile?.vat_status ?? 'unknown'}
          domesticSalesVatTreatment={
            profile?.domestic_sales_vat_treatment ?? 'unknown'
          }
          onUploadAttachment={handleFileUpload}
          onBookkeepingChanged={refreshBookkeepingAfterCustomerInvoice}
          onYearCloseBlockerChange={setCustomerInvoiceYearCloseBlocker}
        />
      ) : activeTab === 'moms' ? (
        <SubscriptionGuard
          user={user}
          profile={profile}
          requiredLevel="paid"
          fallback={<Paywall feature="Momsrapport" user={user} />}
        >
          <Momsrapport
            profile={profile}
            onBookkeepingRefresh={refreshDataWithStatus}
            paymentAccountRolesLoading={paymentAccountRoles.loading}
            paymentAccountRolesLoaded={paymentAccountRoles.loaded}
            paymentAccountRolesError={paymentAccountRoles.error}
            kontoplanLoading={kontoplanLoading}
            kontoplanLoaded={kontoplanLoaded}
            kontoplanError={kontoplanError}
            paymentAccountRoleSetups={paymentAccountRoleSetups}
            onRefreshPaymentAccountRoles={paymentAccountRoles.reload}
            onOpenPaymentAccountSettings={() => setActiveTab('profil')}
          />
        </SubscriptionGuard>
      ) : activeTab === 'faq' ? (
        <FAQ />
      ) : activeTab === 'profil' ? (
        <ProfileSettings 
          user={user} 
          profile={profile} 
          onProfileUpdate={(updated) => setProfile(updated)} 
          onUpdatePassword={updatePassword}
          onBookkeepingChanged={refreshData}
          kontoplan={kontoplan}
          kontoplanLoading={kontoplanLoading}
          kontoplanLoaded={kontoplanLoaded}
          kontoplanError={kontoplanError}
          paymentAccountRoles={paymentAccountRoles.configuredRoles}
          paymentAccountRolesLoading={paymentAccountRoles.loading}
          paymentAccountRolesLoaded={paymentAccountRoles.loaded}
          paymentAccountRolesError={paymentAccountRoles.error}
          onRefreshPaymentAccountRoles={paymentAccountRoles.reload}
          onSavePaymentAccountRole={paymentAccountRoles.saveRole}
          onClearPaymentAccountRole={paymentAccountRoles.clearRole}
        />
      ) : activeTab === 'admin' && isAdmin ? (
        <AdminPanel />
      ) : (
        <SubscriptionGuard
          user={user}
          profile={profile}
          requiredLevel="paid"
          fallback={<Paywall feature="NE-Bilaga" user={user} />}
        >
          <NEBilaga
            neData={neData}
            selectedYear={selectedYear}
            isYearLocked={isYearLocked}
            externalYearCloseBlockReason={customerInvoiceYearCloseBlocker}
            onLockYear={handleLockYear}
          />
        </SubscriptionGuard>
      )}
    </Layout>
  )
}
