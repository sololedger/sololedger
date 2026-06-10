'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { bookTransaction, getAccountBalances, deleteTransaction, getNEData, createCorrectionTransaction, bookPeriodizedTransaction, isYearClosed, closeYear, updateTransaction } from '@/lib/accountingService'
import { exportSIE } from '@/lib/sieExport'
import { calculateDashboard } from '@/lib/calculations'
import Layout from '@/components/Layout'
import NEBilaga from '@/components/NEBilaga'
import Kontoplan from '@/components/Kontoplan'
import FAQ from '@/components/FAQ'
import Momsrapport from '@/components/Momsrapport'
import ProfileSettings from '@/components/ProfileSettings'
import TransactionTable from '@/components/TransactionTable'
import OverviewCards from '@/components/OverviewCards'
import TransactionForm from '@/components/TransactionForm'

import SubscriptionGuard from '@/components/SubscriptionGuard'
import Paywall from '@/components/Paywall'

import { canCreateTransaction, FREE_TRANSACTION_LIMIT } from '@/lib/subscriptionLimits'
import { useAuth } from '@/hooks/useAuth'

export default function Home() {
  const { user, profile, authLoading, handleAuth, handleLogout, setProfile } = useAuth()
  const [dataLoading, setDataLoading] = useState(false)

  const [isRegistering, setIsRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [activeTab, setActiveTab] = useState('dashboard')
  // SSR-säkert: statiskt värde vid server-render
  const [selectedYear, setSelectedYear] = useState(2025)
  const [isYearLocked, setIsYearLocked] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any>({})
  const [neData, setNeData] = useState<any>(null)
  const [journalMap, setJournalMap] = useState<any>({})
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBooked, setEditingBooked] = useState(false)
  const [showLimitPaywall, setShowLimitPaywall] = useState(false)

  // SSR-säkert: alltid 45 vid server-render, synkas med localStorage i useEffect nedan
  const [taxRate, setTaxRate] = useState(45)

  const [uploading, setUploading] = useState(false)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)

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

  useEffect(() => {
    console.log('PAGE MOUNTED')
  }, [])

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

  // Ladda data när user eller år ändras
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setDataLoading(true)

    async function load() {
      if (!user?.id) return
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)

        if (error) throw error

        if (!data || data.length === 0) {
          await setupDefaultAccounts(user.id)
        }

        if (cancelled) return

        const startDate = `${selectedYear}-01-01`
        const endDate   = `${selectedYear}-12-31`

        const [txData, balanceData, neRes] = await Promise.all([
          supabase.from('transactions').select('*')
            .eq('user_id', user.id)
            .gte('date', startDate).lte('date', endDate)
            .order('date', { ascending: false }),
          getAccountBalances(selectedYear),
          getNEData(selectedYear)
        ])

        if (cancelled) return

        if (txData.error) throw txData.error

        const txIds = txData.data?.map((t: any) => t.id) || []
        let jMap: any = {}

        if (txIds.length > 0) {
          const { data: yearJournal, error: jError } = await supabase
            .from('journal_entries').select('*').in('transaction_id', txIds).eq('user_id', user.id)
          if (jError) throw jError
          yearJournal?.forEach((row: any) => {
            if (!jMap[row.transaction_id]) jMap[row.transaction_id] = []
            jMap[row.transaction_id].push(row)
          })
        }

        if (cancelled) return

        setTransactions(txData.data || [])
        setBalances(balanceData || {})
        setJournalMap(jMap)
        setNeData(neRes)
        loadKontoplanOptions()
      } catch (err) {
        if (!cancelled) console.error('Fel vid laddning av data:', err)
      } finally {
        // Alltid av loading – annars fryser sidan
        setDataLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user, selectedYear, profile]) // 🌟 LÄGG TILL profile HÄR!

  // Kontrollera om räkenskapsåret är låst
  useEffect(() => {
    async function checkYearLock() {
      if (!user) return
      try {
        const locked = await isYearClosed(selectedYear)
        setIsYearLocked(locked)
      } catch (err) {
        console.error(err)
        setIsYearLocked(false)
      }
    }
    checkYearLock()
  }, [selectedYear, user])

  async function setupDefaultAccounts(userId: string) {
    const defaultAccounts = [
      { id: 'avskrivning_inventarier', name: 'Avskrivning på inventarier', debit_account: '7830', credit_account: '1220', default_vat_rate: 0, comment: 'För inköp av dyr utrustning >28 650 kr', user_id: userId },
      { id: 'bankavgift', name: 'Bankavgift', debit_account: '6570', credit_account: '1930', default_vat_rate: 0, comment: 'Bankkostnad', user_id: userId },
      { id: 'egen_insättning', name: 'Egen insättning (Kapital)', debit_account: '1930', credit_account: '2018', default_vat_rate: 0, comment: 'När du sätter in privata pengar', user_id: userId },
      { id: 'eget_uttag', name: 'Privat uttag (Lön)', debit_account: '2013', credit_account: '1930', default_vat_rate: 0, comment: 'När du tar ut pengar till dig själv', user_id: userId },
      { id: 'ej_avdragsgillt', name: 'Ej avdragsgilla kostnader', debit_account: '6992', credit_account: '1930', default_vat_rate: 0, comment: 'Böter, förseningsavgift etc (Ej skatteavdrag)', user_id: userId },
      { id: 'försäljning', name: 'Försäljning', debit_account: '1930', credit_account: '3010', default_vat_rate: 25, comment: 'Kundbetalning', user_id: userId },
      { id: 'ingående_balans', name: 'Eget kapital, ingående balans (IB)', debit_account: '1930', credit_account: '2010', default_vat_rate: 0, comment: 'Används endast vid årets början', user_id: userId },
      { id: 'kurser', name: 'Kurser', debit_account: '7610', credit_account: '1930', default_vat_rate: 25, comment: 'Fortbildning', user_id: userId },
      { id: 'prenumerationer', name: 'Prenumerationer', debit_account: '5420', credit_account: '1930', default_vat_rate: 25, comment: 'Adobe, SaaS', user_id: userId },
      { id: 'privat_utlägg', name: 'Privat utlägg för firman', debit_account: '5410', credit_account: '2018', default_vat_rate: 25, comment: 'Du har betalat firman grejer med privata pengar', user_id: userId },
      { id: 'resor', name: 'Resor', debit_account: '5800', credit_account: '1930', default_vat_rate: 6, comment: 'Spårvagn, taxi', user_id: userId },
      { id: 'periodisering', name: 'Förutbetalda kostnader', debit_account: '1790', credit_account: '1930', default_vat_rate: 0, comment: 'Används automatiskt vid periodisering av utgifter över nyår', user_id: userId },
      { id: 'skattekonto_default', name: 'Skattekonto (Moms & Skattereglering)', debit_account: '2012', credit_account: '1930', default_vat_rate: 0, comment: 'Används för insättningar och uttag på Skatteverkets skattekonto (t.ex. momsreglering och skatteåterbäring)', user_id: userId }
    ]
    const { error } = await supabase.from('accounts').insert(defaultAccounts)
    if (error) console.error('Kunde inte skapa standardkonton:', error)
  }

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

  async function loadKontoplanOptions() {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, default_vat_rate, credit_account')
        .eq('user_id', user.id)
        .order('name')
      if (error) throw error
      if (data) {
        const sorted = [...data].sort((a, b) => {
          const aIsZ = a.id === 'ingående_balans' || a.id.toLowerCase().startsWith('z')
          const bIsZ = b.id === 'ingående_balans' || b.id.toLowerCase().startsWith('z')
          if (aIsZ && !bIsZ) return 1
          if (!aIsZ && bIsZ) return -1
          return a.name.localeCompare(b.name, 'sv')
        })
        setKontoplan(sorted)
        if (!formData.type && sorted[0]) {
          setFormData(prev => ({ ...prev, type: sorted[0].id, vatRate: Number(sorted[0].default_vat_rate) || 0 }))
        }
      }
    } catch (err) {
      console.error('Fel vid laddning av kontoplan:', err)
    }
  }

  async function refreshData() {
    try {
      const startDate = `${selectedYear}-01-01`
      const endDate = `${selectedYear}-12-31`
      const [txData, balanceData, neRes] = await Promise.all([
        supabase.from('transactions').select('*')
          .eq('user_id', user.id)
          .gte('date', startDate).lte('date', endDate)
          .order('date', { ascending: false }),
        getAccountBalances(selectedYear),
        getNEData(selectedYear)
      ])
      if (txData.error) throw txData.error
      const txIds = txData.data?.map((t: any) => t.id) || []
      let jMap: any = {}
      if (txIds.length > 0) {
        const { data: yearJournal, error: jError } = await supabase
          .from('journal_entries').select('*').in('transaction_id', txIds).eq('user_id', user.id)
        if (jError) throw jError
        yearJournal?.forEach((row: any) => {
          if (!jMap[row.transaction_id]) jMap[row.transaction_id] = []
          jMap[row.transaction_id].push(row)
        })
      }
      setTransactions(txData.data || [])
      setBalances(balanceData || {})
      setJournalMap(jMap)
      setNeData(neRes)
    } catch (err) {
      console.error('Fel vid laddning av data:', err)
    }
  }

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
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

  const data = calculateDashboard(balances, taxRate)

  console.log('RENDER:', { authLoading, user: !!user })

  if (authLoading || (user && !profile)) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">Laddar...</div>
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <form
          onSubmit={(e) => handleAuth(e, { email, password, isRegistering })}
          className="bg-white p-10 rounded-[2.5rem] shadow-xl border-2 border-emerald-500 w-full max-w-sm text-center"
        >
          <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl italic mx-auto mb-6">S</div>
          <h1 className="text-lg font-black uppercase tracking-tighter italic text-gray-800 mb-2">SoloLedger</h1>
          <p className="text-[10px] font-black uppercase text-emerald-600 mb-8 tracking-wider">
            {isRegistering ? 'Skapa nytt konto' : 'Fleranvändarsystem'}
          </p>
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
            className="w-full bg-gray-50 rounded-2xl p-4 mb-6 text-center font-bold outline-none text-sm border border-transparent focus:border-emerald-300"
            required
          />
          <button type="submit" className="w-full bg-emerald-600 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-emerald-700 transition-all shadow-md mb-4">
            {isRegistering ? 'Registrera dig' : 'Logga in'}
          </button>
          <button
            type="button"
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-[10px] text-gray-400 hover:text-emerald-600 font-black uppercase tracking-wider transition-colors"
          >
            {isRegistering ? 'Har du redan ett konto? Logga in' : 'Inget konto? Skapa ett här'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      onLogout={handleLogout} // 🔥 DENNA RAD SKA IN HÄR!
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

<div className="flex justify-between items-center mb-8 px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-gray-800">
            {activeTab === 'dashboard' ? 'Ekonomiöversikt' : activeTab === 'kontoplan' ? 'Kontoplan' : activeTab === 'faq' ? 'Hjälp & FAQ' : activeTab === 'moms' ? 'Momsrapport' : activeTab === 'profil' ? 'Profilinställningar' : 'NE-Bilaga'}
          </h1>
          
          {/* Vi ändrar till flex-col här för att stapla raderna vertikalt */}
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-[10px] text-gray-400 font-bold">Inloggad som: {user?.email}</p>
            
            {(profile?.subscription_type ?? 'free') === 'free' && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-amber-600 font-black uppercase tracking-wider">
                  (Gratisplan — Uppgradera för obegränsat)
                </span>
                <span className="text-[10px] bg-amber-50 text-amber-700 font-black px-2 py-0.5 rounded-full border border-amber-200 shadow-sm">
                  📊 {transactions.length} / {FREE_TRANSACTION_LIMIT} transaktioner använda
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 w-[480px] justify-end">
          {/* Årsväljaren visas INTE på profil, faq, kontoplan och moms */}
          {!['profil', 'faq', 'kontoplan', 'moms'].includes(activeTab) ? (
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border shadow-sm shrink-0">
              <span className="text-[10px] font-black uppercase text-gray-400 italic">År:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-emerald-50 border-none rounded-lg px-3 py-1 font-black text-sm text-emerald-600 outline-none cursor-pointer hover:bg-emerald-100 transition-colors"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : <div className="w-[104px] h-[38px] shrink-0" />}

          {/* SIE-exporten ligger alltid kvar i strukturen men göms elegant */}
          <button
            onClick={handleExportSIE}
            className={`bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all shrink-0 ${
              activeTab === 'dashboard' ? 'opacity-100 pointer-events-auto' : 'invisible pointer-events-none'
            }`}
          >
            Export SIE
          </button>

          {/* Skattereglaget visas BARA på dashboard och ne-bilaga */}
          {['dashboard', 'ne-bilaga', 'NE-Bilaga', 'ne'].includes(activeTab) ? (
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border shadow-sm shrink-0">
              <span className="text-[10px] font-black uppercase text-gray-400 italic">Skatt:</span>
              <input
                type="range"
                min={25}
                max={55}
                step={1}
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-20 accent-emerald-500 cursor-pointer"
              />
              <span className="text-sm font-black text-emerald-600 w-8 tabular-nums">{taxRate}%</span>
            </div>
          ) : <div className="w-[185px] h-[38px] shrink-0" />}
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
            balances={balances}
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

          <TransactionForm
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
          />

          <TransactionTable
            transactions={transactions}
            journalMap={journalMap}
            kontoplan={kontoplan}
            isYearLocked={isYearLocked}
            editingId={editingId}
            selectedYear={selectedYear}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </>
      ) : activeTab === 'kontoplan' ? (
        <Kontoplan />
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
        />
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