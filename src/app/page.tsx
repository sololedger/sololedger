'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { bookTransaction, getAccountBalances, deleteTransaction, getNEData, createCorrectionTransaction, bookPeriodizedTransaction, isYearClosed, closeYear, updateTransaction } from '@/lib/accountingService'
import { exportSIE } from '@/lib/sieExport'
import Layout from '@/components/Layout'
import NEBilaga from '@/components/NEBilaga'
import Kontoplan from '@/components/Kontoplan'
import FAQ from '@/components/FAQ'
import Momsrapport from '@/components/Momsrapport'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Auth-state för formuläret
  const [isRegistering, setIsRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [isYearLocked, setIsYearLocked] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any>({})
  const [neData, setNeData] = useState<any>(null)
  const [journalMap, setJournalMap] = useState<any>({})
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBooked, setEditingBooked] = useState(false)
  const [taxRate, setTaxRate] = useState(45)
  const [uploading, setUploading] = useState(false)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    type: '',
    vatRate: 0,
    file: null as File | null
  })

  // Periodiseringsstate
  const [periodisera, setPeriodisera] = useState(false)
  const [periodMonth, setPeriodMonth] = useState(() => {
    const next = new Date()
    next.setFullYear(next.getFullYear() + 1, 0, 1) // 1 jan nästa år
    return next.toISOString().slice(0, 7) // "YYYY-MM"
  })

  const years = [selectedYear - 1, selectedYear, selectedYear + 1]

  // Lyssna på om en användare är inloggad via Supabase Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      refreshData()
      loadKontoplanOptions()
    }
  }, [selectedYear, user])

  // Kontrollera om det valda räkenskapsåret är låst
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

  // Funktion för att skapa EXAKT dina 11 korrekta standardkonton till en NY användare
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
      { id: 'skattekonto_default', name: 'Skattekonto (Moms & Skattereglering)', debit: '2012', credit: '1930', vat: 0, comment: 'Används för insättningar och uttag på Skatteverkets skattekonto (t.ex. momsreglering och skatteåterbäring)', user_id: userId }
    ]

    const { error } = await supabase.from('accounts').insert(defaultAccounts)
    if (error) console.error('Kunde inte skapa standardkonton:', error)
  }

  // Hantera Logga in / Registrera via Supabase Auth
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      if (isRegistering) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error

        if (data.user) {
          await setupDefaultAccounts(data.user.id)
          alert('Konto skapat! Du loggas nu in.')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
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
        .select('id, name, default_vat_rate')
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
        supabase.from('transactions')
          .select('*')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: false }),
        getAccountBalances(selectedYear),
        getNEData(selectedYear)
      ])

      if (txData.error) throw txData.error

      const txIds = txData.data?.map((t: any) => t.id) || []
      let jMap: any = {}
      if (txIds.length > 0) {
        const { data: yearJournal, error: jError } = await supabase
          .from('journal_entries')
          .select('*')
          .in('transaction_id', txIds)
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
    const ext = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(fileName, file)
    if (error) throw new Error("Filuppladdning misslyckades: " + error.message)
    return supabase.storage.from('attachments').getPublicUrl(fileName).data.publicUrl
  }

  async function handleAddTransaction(e: any) {
    e.preventDefault()
    if (isYearLocked) return
    setUploading(true)

    try {
      // ── SÄKERHETSBÄLTE (FRONTEND-DATUMBOKNING) ──────────────────────────────
      const targetYear = parseInt(formData.date.slice(0, 4))
      const isTargetYearClosed = await isYearClosed(targetYear)
      if (isTargetYearClosed) {
        throw new Error(`Räkenskapsår ${targetYear} är låst för ändringar.`)
      }
      // ──────────────────────────────────────────────────────────────────────────

      let fileUrl = ''
      if (formData.file) {
        fileUrl = await handleFileUpload(formData.file)
      }

      if (editingId) {
        // Skickar nu med fälten till den backend-säkrade updateTransaction-funktionen
        const updatePayload: any = {
          date: formData.date,
          description: formData.description,
          amount: Number(formData.amount),
          type: formData.type,
          vat_rate: formData.vatRate
        }
        if (fileUrl) updatePayload.file_url = fileUrl

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
      alert("Fel: " + err.message)
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
      alert("Kunde inte skapa korrigering: " + err.message)
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

  const bankSaldo = balances['1930'] || 0

  const intakter = Math.abs(
    Object.entries(balances)
      .filter(([acc]) => acc.startsWith('3'))
      .reduce((sum, [_, val]: any) => sum + val, 0)
  )
  const kostnader = Object.entries(balances)
    .filter(([acc]) => ['4', '5', '6', '7'].some(p => acc.startsWith(p)))
    .reduce((sum, [_, val]: any) => sum + Math.abs(val), 0)

  const bokfortResultat = Math.round((intakter - kostnader) * 100) / 100

  const ejAvdragsgillt = Math.abs(balances['6992'] || 0)
  const skattemassigVinst = Math.round((bokfortResultat + ejAvdragsgillt) * 100) / 100

  const momsNetto = Math.round((Math.abs(balances['2611'] || 0) - Math.abs(balances['2641'] || 0)) * 100) / 100

  const skattReserv = skattemassigVinst > 0
    ? Math.round(skattemassigVinst * (taxRate / 100) * 100) / 100
    : 0

  const sakertUttag = Math.round(
    (bankSaldo - skattReserv - (momsNetto > 0 ? momsNetto : 0)) * 100
  ) / 100

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center font-bold text-gray-400">Laddar...</div>
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <form
          onSubmit={handleAuth}
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
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      <div className="flex justify-between items-center mb-8 px-4">
        <div>
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-gray-800">
            {activeTab === 'dashboard' ? 'Ekonomiöversikt' : activeTab === 'kontoplan' ? 'Kontoplan' : activeTab === 'faq' ? 'Hjälp & FAQ' : activeTab === 'moms' ? 'Momsrapport' : 'NE-Bilaga'}
          </h1>
          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Inloggad som: {user.email}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border shadow-sm">
            <span className="text-[10px] font-black uppercase text-gray-400 italic">År:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-emerald-50 border-none rounded-lg px-3 py-1 font-black text-sm text-emerald-600 outline-none cursor-pointer hover:bg-emerald-100 transition-colors"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <button
            onClick={handleExportSIE}
            className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all"
          >
            Export SIE
          </button>

          <button
            onClick={handleLogout}
            className="bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-400 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all"
          >
            Logga ut
          </button>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          <div className="border-2 border-emerald-500 rounded-[2.5rem] p-6 bg-white shadow-sm mb-6">
            <h2 className="text-[10px] font-black uppercase text-emerald-600 tracking-wider mb-4 px-2">
              Översikt: SoloLedger / Bokföring / Kontoplan / NE Bilaga
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-center uppercase tracking-tighter font-black">
              <button
                onClick={() => setActiveModal('bank')}
                className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer text-left"
              >
                <p className="text-[9px] text-gray-400 mb-1">Bank (1930) <span className="text-emerald-300">↗</span></p>
                <p className={`text-xl font-black ${bankSaldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {bankSaldo.toLocaleString()} kr
                </p>
              </button>
              <button
                onClick={() => setActiveModal('skatt')}
                className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-orange-200 hover:shadow-md transition-all cursor-pointer text-left"
              >
                <p className="text-[9px] text-gray-400 mb-1">Skatt ({taxRate}%) <span className="text-orange-300">↗</span></p>
                <p className="text-xl text-orange-500">-{skattReserv.toLocaleString()} kr</p>
              </button>
              <button
                onClick={() => setActiveModal('moms')}
                className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-green-200 hover:shadow-md transition-all cursor-pointer text-left"
              >
                <p className="text-[9px] text-gray-400 mb-1">Moms <span className="text-green-300">↗</span></p>
                <p className={`text-xl ${momsNetto <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {momsNetto.toLocaleString()} kr
                </p>
              </button>
              <button
                onClick={() => setActiveModal('resultat')}
                className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-gray-300 hover:shadow-md transition-all cursor-pointer text-left"
              >
                <p className="text-[9px] text-gray-400 mb-1">Resultat <span className="text-gray-300">↗</span></p>
                <p className="text-xl text-gray-700">{bokfortResultat.toLocaleString()} kr</p>
              </button>
              <div className="bg-emerald-600 p-6 rounded-[2rem] text-white shadow-lg">
                <p className="text-[9px] opacity-80 mb-1 uppercase">Säkert uttag</p>
                <p className="text-2xl italic font-black">{sakertUttag.toLocaleString()} kr</p>
              </div>
            </div>
          </div>

          {/* Modaler */}
          {activeModal && (
            <div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setActiveModal(null)}
            >
              <div
                className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 relative"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => setActiveModal(null)}
                  className="absolute top-6 right-8 text-gray-300 hover:text-gray-600 text-2xl font-black transition-colors"
                >
                  ×
                </button>

                {activeModal === 'bank' && (
                  <>
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-emerald-600 mb-1">Bank (1930)</h2>
                    <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur saldot beräknas</p>
                    <div className="space-y-3">
                      {transactions.map(tx => {
                        const journal = journalMap[tx.id] || []
                        const bankEntry = journal.find((e: any) => e.account_number === '1930')
                        if (!bankEntry) return null
                        const amount = Number(bankEntry.debit) - Number(bankEntry.credit)
                        return (
                          <div key={tx.id} className="flex justify-between items-center border-b border-gray-50 pb-2">
                            <div>
                              <p className="font-bold text-sm text-gray-700">{tx.description}</p>
                              <p className="text-[10px] text-gray-400 font-bold">{tx.date}</p>
                            </div>
                            <span className={`font-black text-sm tabular-nums ${amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                              {amount >= 0 ? '+' : ''}{amount.toLocaleString('sv-SE')} kr
                            </span>
                          </div>
                        )
                      }).filter(Boolean)}
                    </div>
                    <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-gray-400">Saldo</span>
                      <span className={`text-2xl font-black ${bankSaldo >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {bankSaldo.toLocaleString('sv-SE')} kr
                      </span>
                    </div>
                  </>
                )}

                {activeModal === 'skatt' && (
                  <>
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-orange-500 mb-1">Skattreservat</h2>
                    <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur skatten beräknas</p>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-gray-500 uppercase">Intäkter (3xxx)</span>
                        <span className="font-black text-green-600">+{intakter.toLocaleString('sv-SE')} kr</span>
                      </div>
                      <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-gray-500 uppercase">Kostnader (4–7xxx)</span>
                        <span className="font-black text-red-500">−{kostnader.toLocaleString('sv-SE')} kr</span>
                      </div>
                      <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-gray-500 uppercase">Bokfört resultat</span>
                        <span className={`font-black ${bokfortResultat >= 0 ? 'text-gray-700' : 'text-red-500'}`}>{bokfortResultat.toLocaleString('sv-SE')} kr</span>
                      </div>
                      {ejAvdragsgillt > 0 && (
                        <div className="flex justify-between items-center bg-orange-50 rounded-2xl px-5 py-3">
                          <span className="text-xs font-black text-orange-500 uppercase">+ Ej avdragsgilla (6992)</span>
                          <span className="font-black text-orange-500">+{ejAvdragsgillt.toLocaleString('sv-SE')} kr</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center bg-orange-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-orange-600 uppercase">Skattemässigt resultat</span>
                        <span className="font-black text-orange-600">{skattemassigVinst.toLocaleString('sv-SE')} kr</span>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-gray-400">{skattemassigVinst.toLocaleString('sv-SE')} kr × {taxRate}%</span>
                      <span className="text-2xl font-black text-orange-500">−{skattReserv.toLocaleString('sv-SE')} kr</span>
                    </div>
                  </>
                )}

                {activeModal === 'moms' && (
                  <>
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-green-600 mb-1">Moms</h2>
                    <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur momsen beräknas</p>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-red-50 rounded-2xl px-5 py-3">
                        <div>
                          <p className="text-xs font-black text-red-600 uppercase">Utgående moms (2611)</p>
                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Moms på din försäljning — ska betalas in</p>
                        </div>
                        <span className="font-black text-red-500">+{Math.abs(balances['2611'] || 0).toLocaleString('sv-SE')} kr</span>
                      </div>
                      <div className="flex justify-between items-center bg-green-50 rounded-2xl px-5 py-3">
                        <div>
                          <p className="text-xs font-black text-green-600 uppercase">Ingående moms (2641)</p>
                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Moms du betalat på kostnader — dras av</p>
                        </div>
                        <span className="font-black text-green-600">−{Math.abs(balances['2641'] || 0).toLocaleString('sv-SE')} kr</span>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-gray-400">Att betala / få tillbaka</span>
                      <span className={`text-2xl font-black ${momsNetto <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {momsNetto.toLocaleString('sv-SE')} kr
                      </span>
                    </div>
                  </>
                )}

                {activeModal === 'resultat' && (
                  <>
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-gray-700 mb-1">Resultat</h2>
                    <p className="text-[10px] text-gray-400 uppercase font-black mb-6">Hur resultatet beräknas</p>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-gray-500 uppercase">Intäkter (3xxx)</span>
                        <span className="font-black text-green-600">+{intakter.toLocaleString('sv-SE')} kr</span>
                      </div>
                      <div className="flex justify-between items-center bg-gray-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-gray-500 uppercase">Kostnader (4–7xxx)</span>
                        <span className="font-black text-red-500">−{kostnader.toLocaleString('sv-SE')} kr</span>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-gray-400">Bokfört resultat</span>
                      <span className={`text-2xl font-black ${bokfortResultat >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                        {bokfortResultat.toLocaleString('sv-SE')} kr
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Låsningsbanner — visas när räkenskapsåret är stängt */}
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

          <div className={`bg-white rounded-[2.5rem] border p-8 mb-6 shadow-sm transition-all ${editingId ? 'border-amber-300 shadow-amber-100' : 'border-gray-100'}`}>
            <form onSubmit={handleAddTransaction}>
              <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 items-end mb-4">
                <div className="lg:col-span-2 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Datum</label>
                  <input
                    type="date"
                    value={formData.date}
                    disabled={isYearLocked}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className={`p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                    required
                  />
                </div>
                <div className="lg:col-span-3 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Kategori</label>
                  <select
                    value={formData.type}
                    onChange={e => {
                      const acc = kontoplan.find(k => k.id === e.target.value)
                      setFormData({ ...formData, type: e.target.value, vatRate: Number(acc?.default_vat_rate) || 0 })
                    }}
                    disabled={editingBooked || isYearLocked}
                    className={`p-3 rounded-xl outline-none font-bold text-xs ${editingBooked || isYearLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 cursor-pointer'} ${isYearLocked ? 'opacity-40' : ''}`}
                  >
                    {kontoplan.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-3 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Beskrivning</label>
                  <input
                    type="text"
                    value={formData.description}
                    disabled={isYearLocked}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className={`p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                    required
                  />
                </div>
                <div className="lg:col-span-1 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Moms %</label>
                  <select
                    value={formData.vatRate}
                    onChange={e => setFormData({ ...formData, vatRate: Number(e.target.value) })}
                    disabled={editingBooked || isYearLocked}
                    className={`p-3 rounded-xl outline-none font-bold text-xs ${editingBooked || isYearLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 cursor-pointer'} ${isYearLocked ? 'opacity-40' : ''}`}
                  >
                    <option value={25}>25%</option>
                    <option value={12}>12%</option>
                    <option value={6}>6%</option>
                    <option value={0}>0%</option>
                  </select>
                </div>
                <div className="lg:col-span-2 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-500 uppercase ml-1">Belopp inkl. moms</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    disabled={editingBooked || isYearLocked}
                    className={`p-3 rounded-xl outline-none font-black text-sm ${editingBooked || isYearLocked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50'} ${isYearLocked ? 'opacity-40' : ''}`}
                    required
                  />
                </div>
                <div className="lg:col-span-1 flex flex-col gap-1">
                  {editingId && (
                    <label className="text-[9px] font-black text-amber-400 uppercase ml-1">Redigerar</label>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={uploading || isYearLocked}
                      className={`flex-1 h-[42px] rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${uploading ? 'bg-gray-400' : isYearLocked ? 'bg-gray-300 opacity-40 cursor-not-allowed' : editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                      {uploading ? '...' : editingId ? 'Spara' : 'OK'}
                    </button>
                    {editingId && (
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="h-[42px] px-3 rounded-xl text-gray-400 hover:text-gray-600 font-bold text-sm transition-colors"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-3 border-t border-gray-50">
                <label className="text-[9px] font-black text-gray-500 uppercase whitespace-nowrap">📎 Bilaga:</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  disabled={isYearLocked}
                  onChange={e => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                  className="text-xs text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[9px] file:font-black file:uppercase file:bg-gray-100 file:text-gray-500 hover:file:bg-gray-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                />
                {formData.file && (
                  <span className="text-[9px] text-emerald-500 font-bold">{formData.file.name}</span>
                )}
              </div>

              {/* ── PERIODISERING ─────────────────────────────────────────── */}
              {!editingId && (
                <div className={`mt-4 rounded-2xl border-2 transition-all duration-200 ${periodisera ? 'border-blue-300 bg-blue-50/60' : 'border-gray-100 bg-gray-50/40'} ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <label className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={periodisera}
                        disabled={isYearLocked}
                        onChange={e => setPeriodisera(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-500 rounded-full transition-colors duration-200" />
                      <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-600 tracking-wide">
                        Periodisera till nästa räkenskapsår
                      </span>
                      <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                        Kostnaden avser ett annat år — parkeras på konto 1790 och aktiveras automatiskt.
                      </p>
                    </div>
                  </label>

                  {periodisera && !isYearLocked && (
                    <div className="px-5 pb-4 flex flex-wrap items-end gap-6 border-t border-blue-100">
                      <div className="flex flex-col gap-1 mt-3">
                        <label className="text-[9px] font-black text-blue-500 uppercase ml-1">
                          Kostnaden avser (år/månad)
                        </label>
                        <input
                          type="month"
                          value={periodMonth}
                          onChange={e => setPeriodMonth(e.target.value)}
                          className="p-2.5 bg-white border border-blue-200 rounded-xl outline-none font-bold text-xs text-blue-700 focus:border-blue-400 transition-colors"
                        />
                      </div>
                      <div className="mt-3 text-[9px] leading-relaxed text-blue-600 font-bold bg-blue-100/60 rounded-xl px-4 py-2.5 border border-blue-200">
                        <p className="font-black uppercase mb-1 text-blue-700">Vad händer?</p>
                        <p>📅 <strong>År 1 (idag):</strong> Bank krediteras. Moms bokas direkt. Netto → konto 1790.</p>
                        <p>🔄 <strong>År 2 ({periodMonth}-01):</strong> 1790 krediteras → kostnadskonto debiteras.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>

          <div className="bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-[9px] font-black uppercase text-gray-400 tracking-widest border-b">
                <tr>
                  <th className="p-8">Datum / Ver</th>
                  <th className="p-8">Händelse</th>
                  <th className="p-8 text-right">Belopp</th>
                  <th className="p-8">Bokföring</th>
                  <th className="p-8 text-right pr-12">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-gray-300 italic font-medium">
                      Inga transaktioner bokförda för {selectedYear}
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const journal = journalMap[tx.id] || []
                    const isCorrection = tx.is_correction === true
                    return (
                      <tr
                        key={tx.id}
                        className={`transition-colors ${isCorrection
                            ? 'bg-amber-50/60 opacity-75'
                            : editingId === tx.id
                              ? 'bg-amber-50/50'
                              : 'hover:bg-gray-50/50'
                          }`}
                      >
                        <td className="p-8 font-bold text-gray-400 text-sm">
                          {isCorrection ? (
                            <span className="text-amber-500">{tx.date}</span>
                          ) : (
                            tx.date
                          )}
                          {journal[0]?.ver_nr && (
                            <p className={`text-[10px] font-black italic ${isCorrection ? 'text-amber-400' : 'text-emerald-600'}`}>
                              VER-{journal[0].ver_nr}
                            </p>
                          )}
                        </td>
                        <td className="p-8">
                          <div className="flex items-center flex-wrap gap-2 mb-1">
                            {isCorrection ? (
                              <p className="text-[10px] font-black text-amber-500 uppercase flex items-center gap-1">
                                ↩ Korrigering
                              </p>
                            ) : (
                              <p className="text-[10px] font-black text-emerald-500 uppercase">
                                {kontoplan.find(k => k.id === tx.type)?.name || tx.type}
                              </p>
                            )}
                            {!isCorrection && (
                              <span className="text-[8px] font-black uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-md border border-gray-200">
                                Moms: {tx.vat_rate}%
                              </span>
                            )}
                            {tx.booked && !isCorrection && (
                              <span className="text-[8px] font-black uppercase text-gray-300 border border-gray-200 px-1.5 py-0.5 rounded-md">
                                Låst
                              </span>
                            )}
                          </div>
                          <p className={`font-bold ${isCorrection ? 'text-amber-600 text-xs pl-4 border-l-2 border-amber-200' : 'text-gray-700'}`}>
                            {isCorrection ? tx.description.replace('↩ ', '') : tx.description}
                          </p>
                          {tx.file_url && (
                            <a
                              href={tx.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-400 text-xs mt-1 inline-block hover:text-emerald-600"
                            >
                              📎 Visa bilaga
                            </a>
                          )}
                        </td>
                        <td className={`p-8 text-right font-black text-lg ${isCorrection
                            ? 'text-amber-400 line-through'
                            : tx.type?.toLowerCase() === 'försäljning'
                              ? 'text-emerald-600'
                              : 'text-rose-600'
                          }`}>
                          {!isCorrection && (tx.type?.toLowerCase() === 'försäljning' ? '+ ' : '- ')}
                          {tx.amount.toLocaleString()} kr
                        </td>
                        <td className="p-8">
                          <div className="flex flex-wrap gap-1.5">
                            {journal
                              .sort((a: any, b: any) => Number(b.debit) > 0 ? -1 : 1)
                              .map((e: any) => {
                                const isDebit = Number(e.debit) > 0
                                return (
                                  <span
                                    key={e.id}
                                    className={`inline-flex items-center gap-0.5 border rounded-lg px-2 py-1 font-mono text-[10px] font-bold ${isCorrection
                                        ? 'bg-amber-50 border-amber-100 text-amber-400'
                                        : 'bg-gray-50 border-gray-100 text-gray-500'
                                      }`}
                                  >
                                    {e.account_number}
                                    <span className={isDebit ? 'text-emerald-500' : 'text-orange-400'}>
                                      {isDebit ? ' D' : ' K'}
                                    </span>
                                  </span>
                                )
                              })}
                          </div>
                        </td>
                        <td className="p-8 text-right pr-12">
                          <div className="flex items-center justify-end gap-4">
                            {!isCorrection && !isYearLocked && (
                              <button
                                onClick={() => handleEdit(tx)}
                                className="text-gray-200 hover:text-emerald-600 transition-colors"
                                title="Redigera beskrivning/datum/bilaga"
                              >
                                ✎
                              </button>
                            )}
                            {!isCorrection && !isYearLocked && (
                              <button
                                onClick={() => handleDelete(tx)}
                                className="text-red-100 hover:text-red-500 font-bold transition-colors"
                                title="Skapa korrigeringsverifikation"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : activeTab === 'kontoplan' ? (
        <Kontoplan />
      ) : activeTab === 'moms' ? (
        <Momsrapport />
      ) : activeTab === 'faq' ? (
        <FAQ />
      ) : (
        <NEBilaga
          neData={neData}
          selectedYear={selectedYear}
          isYearLocked={isYearLocked}
          onLockYear={handleLockYear}
        />
      )}
    </Layout>
  )
}