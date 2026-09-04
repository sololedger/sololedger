'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { bookTransaction, deleteTransaction, createCorrectionTransaction, bookPeriodizedTransaction, isYearClosed, closeYear, updateTransaction } from '@/lib/accountingService'
import { exportSIE } from '@/lib/sieExport'
import { calculateDashboard, getBankSaldo } from '@/lib/calculations'
import Layout from '@/components/Layout'
import NEBilaga from '@/components/NEBilaga'
import Kontoplan from '@/components/Kontoplan'
import FAQ from '@/components/FAQ'
import Momsrapport from '@/components/Momsrapport'
import ProfileSettings from '@/components/ProfileSettings'
import TransactionTable from '@/components/TransactionTable'
import OverviewCards from '@/components/OverviewCards'
import TransactionForm from '@/components/TransactionForm'
import SieImportModal from '@/components/SieImportModal'

import SubscriptionGuard from '@/components/SubscriptionGuard'
import Paywall from '@/components/Paywall'
import AdminPanel from '@/components/AdminPanel'

import { canCreateTransaction, FREE_TRANSACTION_LIMIT } from '@/lib/subscriptionLimits'
import { useAuth } from '@/hooks/useAuth'
import { useAccountingData } from '@/hooks/useAccountingData'

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
    dataLoading,
    isYearLocked, setIsYearLocked,
    refreshData,
    momsBreakdown,
  } = useAccountingData(user, selectedYear, profile?.subscription_type)

  const isAdmin = profile?.role === 'admin'

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBooked, setEditingBooked] = useState(false)
  const [showLimitPaywall, setShowLimitPaywall] = useState(false)

  // SSR-säkert: alltid 45 vid server-render, synkas med localStorage i useEffect nedan
  const [taxRate, setTaxRate] = useState(45)

  const [uploading, setUploading] = useState(false)
  const [showSieImport, setShowSieImport] = useState(false)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)
  const [lastSubmitted, setLastSubmitted] = useState<{ type: string; amount: string; vatRate: number } | null>(null)

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
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
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

  // Sätter default-typ/momssats på formuläret första gången kontoplanen laddas,
  // motsvarar det som tidigare gjordes inuti loadKontoplanOptions.
  useEffect(() => {
    if (!formData.type && kontoplan[0]) {
      setFormData(prev => ({ ...prev, type: kontoplan[0].id, vatRate: Number(kontoplan[0].default_vat_rate) || 0 }))
    }
  }, [kontoplan])

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

  async function handleAddTransaction(e: any) {
    e.preventDefault()
    if (isYearLocked) return

    if (!editingId) {
      const allowed = canCreateTransaction(profile ?? { subscription_type: 'free', subscription_end: null }, transactions.length)
      if (!allowed) {
        setShowLimitPaywall(true)
        return
      }
    }

    setUploading(true)
    try {
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
          const { data: newTx, error: insertError } = await supabase
            .from('transactions')
            .insert([{
              date: formData.date,
              description: formData.description,
              amount: Number(formData.amount),
              type: formData.type,
              vat_rate: formData.vatRate,
              file_url: fileUrl || null,
              user_id: user.id
            }])
            .select()
            .single()
          if (insertError) throw insertError
          await bookTransaction(newTx)
        }
      }

      setLastSubmitted({ type: formData.type, amount: formData.amount, vatRate: formData.vatRate })
      setFormData(prev => ({
        ...prev,
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        file: null
      }))
      setPeriodisera(false)
      await refreshData()
    } catch (err: any) {
      console.error('Fel vid bokföring:', err)
      alert('Fel: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(tx: any) {
    if (isYearLocked) return
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
  data.sakertUttag = Math.round(
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

  // Om användaren kom hit  via en klickad återställningslänk: visa en
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
      />

<div className="flex flex-col gap-4 mb-8 px-4 sm:px-6 lg:px-8 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter text-gray-800">
            {activeTab === 'dashboard' ? 'Ekonomiöversikt' : activeTab === 'kontoplan' ? 'Kontoplan' : activeTab === 'faq' ? 'Hjälp & FAQ' : activeTab === 'moms' ? 'Momsrapport' : activeTab === 'profil' ? 'Profilinställningar' : activeTab === 'admin' ? 'Admin' : 'NE-Bilaga'}
          </h1>
          
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-[10px] text-gray-400 font-bold">Inloggad som: {user?.email}</p>
            
            {showFreeBanner && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mt-0.5">
                <span className="text-[10px] text-amber-600 font-black uppercase tracking-wider">
                  (Gratisplan — Uppgradera för obegränsat)
                </span>
                <span className="text-[10px] bg-amber-50 text-amber-700 font-black px-2 py-0.5 rounded-full border border-amber-200 shadow-sm w-fit">
                  📊 {transactions.length} / {FREE_TRANSACTION_LIMIT} transaktioner använda
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full md:flex-row md:items-center md:justify-end md:gap-4 md:w-[480px]">
          {/* Årsväljaren visas INTE på profil, faq, kontoplan och moms */}
          {!['profil', 'faq', 'kontoplan', 'moms'].includes(activeTab) ? (
            <div className="flex items-center justify-between md:justify-start gap-3 bg-white px-4 py-2 rounded-2xl border shadow-sm w-full md:w-auto md:shrink-0">
              <span className="text-[10px] font-black uppercase text-gray-400 italic">År:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-emerald-50 border-none rounded-lg px-3 py-1 font-black text-sm text-emerald-600 outline-none cursor-pointer hover:bg-emerald-100 transition-colors"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : <div className="hidden md:block w-[104px] h-[38px] shrink-0" />}

          {/* SIE-importen */}
          <button
            onClick={() => setShowSieImport(true)}
            className={`bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all w-full md:w-auto md:shrink-0 ${
              activeTab === 'dashboard'
                ? 'opacity-100 pointer-events-auto'
                : 'hidden md:block md:invisible md:pointer-events-none'
            }`}
          >
            Importera SIE
          </button>

          {/* SIE-exporten */}
          <button
            onClick={handleExportSIE}
            className={`bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all w-full md:w-auto md:shrink-0 ${
              activeTab === 'dashboard'
                ? 'opacity-100 pointer-events-auto'
                : 'hidden md:block md:invisible md:pointer-events-none'
            }`}
          >
            Export SIE
          </button>

          {/* Skattereglaget */}
          {['dashboard', 'ne-bilaga', 'NE-Bilaga', 'ne'].includes(activeTab) ? (
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border shadow-sm w-full md:w-auto md:shrink-0">
              <span className="text-[10px] font-black uppercase text-gray-400 italic">Skatt:</span>
              <input
                type="range"
                min={25}
                max={55}
                step={1}
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="flex-1 md:flex-none md:w-20 accent-emerald-500 cursor-pointer"
              />
              <span className="text-sm font-black text-emerald-600 w-8 tabular-nums text-right">{taxRate}%</span>
            </div>
          ) : <div className="hidden md:block w-[185px] h-[38px] shrink-0" />}
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

          <div id="transaction-form-section">
            <TransactionForm
              userId={user.id}
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
              onCancelEdit={cancelEdit}
              lastSubmitted={lastSubmitted}
              onSaveFavorite={handleFavorite}
              onDismissFavorite={() => setLastSubmitted(null)}
            />
          </div>

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
        </>
      ) : activeTab === 'kontoplan' ? (
        <Kontoplan onAccountCreated={refreshData} />
      ) : activeTab === 'moms' ? (
        <SubscriptionGuard
          user={user}
          profile={profile}
          requiredLevel="paid"
          fallback={<Paywall feature="Momsrapport" user={user} />}
        >
<Momsrapport />
        </SubscriptionGuard>
      ) : activeTab === 'faq' ? (
        <FAQ />
      ) : activeTab === 'profil' ? (
        <ProfileSettings 
          user={user} 
          profile={profile} 
          onProfileUpdate={(updated) => setProfile(updated)} 
          onUpdatePassword={updatePassword}
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
            onLockYear={handleLockYear}
          />
        </SubscriptionGuard>
      )}
    </Layout>
  )
}