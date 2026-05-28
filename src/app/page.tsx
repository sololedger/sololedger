'use client'
import { useState, useEffect, useMemo } from 'react' // 1. Importerat useMemo här!
import { supabase } from '@/lib/supabaseClient'
import { bookTransaction, getAccountBalances, deleteTransaction, getNEData, createCorrectionTransaction, bookPeriodizedTransaction, isYearClosed, closeYear, updateTransaction } from '@/lib/accountingService'
import { exportSIE } from '@/lib/sieExport'
import Layout from '@/components/Layout'
import NEBilaga from '@/components/NEBilaga'
import Kontoplan from '@/components/Kontoplan'
import FAQ from '@/components/FAQ'
import Momsrapport from '@/components/Momsrapport'
import TransactionTable from '@/components/TransactionTable'
import TransactionForm, { FormData } from '@/components/TransactionForm'
import OverviewCards from '@/components/OverviewCards'
import { calculateDashboard } from '@/lib/calculations'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Auth-state för formuläret
  const [isRegistering, setIsRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [activeTab, setActiveTab] = useState('dashboard')
  
  // 2. Fixat radbrytningen här (borttaget \n)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [isYearLocked, setIsYearLocked] = useState(false)
  
  const [transactions, setTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any>({})
  const [neData, setNeData] = useState<any>(null)
  const [journalMap, setJournalMap] = useState<any>({})
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [taxRate, setTaxRate] = useState(30)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)

  // Formulär-state
  const [formData, setFormData] = useState<FormData>({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    type: '',
    vatRate: 25,
    file: null,
  })
  const [periodisera, setPeriodisera] = useState(false)
  const [periodMonth, setPeriodMonth] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBooked, setEditingBooked] = useState(false)
  const [uploading, setUploading] = useState(false)

  // 3. Optimerat med useMemo så att det inte görs onödiga omräkningar!
  const dashboardData = useMemo(
    () => calculateDashboard(balances, taxRate),
    [balances, taxRate]
  )

  useEffect(() => {
    async function getSession() {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }
    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) {
      loadAllData()
    } else {
      setTransactions([])
      setBalances({})
      setNeData(null)
      setJournalMap({})
      setKontoplan([])
    }
  }, [user, selectedYear])

  async function loadAllData() {
    try {
      const locked = await isYearClosed(selectedYear)
      setIsYearLocked(locked)

      // Skapa rätt start- och slutdatum för valt år
      const startDate = `${selectedYear}-01-01`
      const endDate = `${selectedYear}-12-31`

      // 1. Hämta transationer med rätt datumfiltrering
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false })

      if (txError) throw txError

      // 2. Hämta alla journalrader för de transaktioner vi just hittade
      const txIds = txData?.map((t: any) => t.id) || []
      const map: any = {}
      
      if (txIds.length > 0) {
        const { data: jData, error: jError } = await supabase
          .from('journal_entries')
          .select('*')
          .in('transaction_id', txIds)

        if (jError) throw jError

        jData?.forEach(entry => {
          if (!map[entry.transaction_id]) {
            map[entry.transaction_id] = []
          }
          map[entry.transaction_id].push(entry)
        })
      }
      setJournalMap(map)

      // 3. Hämta saldon och NE-data
      const fetchedBalances = await getAccountBalances(selectedYear)
      setBalances(fetchedBalances)

      const fetchedNEData = await getNEData(selectedYear)
      setNeData(fetchedNEData)

      if (txData) {
        setTransactions(txData)
      }

      await loadKontoplanOptions()
    } catch (err) {
      console.error('Fel vid laddning av data:', JSON.stringify(err, null, 2) || err)
    }
  }

  async function loadKontoplanOptions() {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, default_vat_rate, credit_account')
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
      console.error('Fel vid laddning av kontoplan:', JSON.stringify(err, null, 2) || err)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err: any) {
      alert(err.message || 'Inloggning misslyckades')
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
      alert('Registrering lyckades! Du kan nu logga in.')
      setIsRegistering(false)
    } catch (err: any) {
      alert(err.message || 'Registrering misslyckades')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isYearLocked) {
      alert('Detta bokföringsår är låst och kan inte ändras.')
      return
    }

    if (!formData.description || !formData.amount || !formData.type) {
      alert('Fyll i alla obligatoriska fält')
      return
    }

    setUploading(true)
    try {
      let fileUrl = ''
      if (formData.file) {
        const fileExt = formData.file.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const filePath = `${user.id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(filePath, formData.file)

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(filePath)

        fileUrl = publicUrl
      }

      if (editingId) {
        if (editingBooked) {
          await updateTransaction(editingId, {
            date: formData.date,
            description: formData.description,
            file_url: fileUrl || undefined
          })
        } else {
          await updateTransaction(editingId, {
            date: formData.date,
            description: formData.description,
            amount: parseFloat(formData.amount),
            type: formData.type,
            vat_rate: formData.vatRate,
            file_url: fileUrl || undefined
          })
        }
        cancelEdit()
      } else {
        if (periodisera && periodMonth) {
          await bookPeriodizedTransaction({
            date: formData.date,
            description: formData.description,
            amount: parseFloat(formData.amount),
            type: formData.type,
            vatRate: formData.vatRate,
            fileUrl,
            year: selectedYear,
            periodMonth
          })
        } else {
          await bookTransaction({
            date: formData.date,
            description: formData.description,
            amount: parseFloat(formData.amount),
            type: formData.type,
            vatRate: formData.vatRate,
            fileUrl,
            year: selectedYear
          })
        }
      }

      setFormData({
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        type: kontoplan[0]?.id || '',
        vatRate: kontoplan[0]?.default_vat_rate || 25,
        file: null,
      })
      setPeriodisera(false)
      setPeriodMonth('')
      await loadAllData()
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Ett fel uppstod vid bokföring')
    } finally {
      setUploading(false)
    }
  }

  const handleEdit = (tx: any) => {
    if (isYearLocked) return
    setEditingId(tx.id)
    setEditingBooked(tx.booked || false)
    setFormData({
      date: tx.date,
      description: tx.description,
      amount: tx.amount.toString(),
      type: tx.type,
      vatRate: tx.vat_rate,
      file: null
    })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingBooked(false)
    setFormData({
      date: new Date().toISOString().split('T')[0],
      description: '',
      amount: '',
      type: kontoplan[0]?.id || '',
      vatRate: kontoplan[0]?.default_vat_rate || 25,
      file: null
    })
  }

  const handleDelete = async (tx: any) => {
    if (isYearLocked) return
    if (tx.booked) {
      const confirmKorr = window.confirm(
        `Denna transaktion är låst i deklarerad NE-bilaga eller SIE-export.\n\nVill du skapa en automatisk korrigeringsverifikation (omvänd bokföring) för VER-${journalMap[tx.id]?.[0]?.ver_nr}?`
      )
      if (!confirmKorr) return

      try {
        await createCorrectionTransaction(tx.id)
        await loadAllData()
      } catch (err: any) {
        alert(err.message || 'Kunde inte skapa korrigering')
      }
    } else {
      if (window.confirm('Är du säker på att du vill radera denna transaktion permanent?')) {
        try {
          await deleteTransaction(tx.id)
          await loadAllData()
        } catch (err: any) {
          alert(err.message || 'Kunde inte radera transaktion')
        }
      }
    }
  }

  const handleLockYear = async () => {
    if (window.confirm(`Varning! Är du säker på att du vill låsa bokföringsåret ${selectedYear}?\n\nDetta stänger året permanent och inga fler ändringar kan göras.`)) {
      try {
        await closeYear(selectedYear)
        await loadAllData()
      } catch (err: any) {
        alert(err.message || 'Kunde inte låsa året')
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center font-black uppercase tracking-widest text-[10px] text-gray-400">
        Laddar SoloLedger...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-10 rounded-[2.5rem] border border-gray-100 shadow-xl w-full max-w-md">
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-emerald-600 mb-2 text-center">
            SoloLedger
          </h1>
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest text-center mb-8">
            Enkelt bokföringssystem för enskild firma
          </p>

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-400 uppercase ml-1">E-postadress</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="p-3 bg-gray-50 rounded-xl outline-none font-bold text-sm text-gray-700 focus:bg-gray-100 transition-colors border border-transparent focus:border-gray-200"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Lösenord</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="p-3 bg-gray-50 rounded-xl outline-none font-bold text-sm text-gray-700 focus:bg-gray-100 transition-colors border border-transparent focus:border-gray-200"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 text-white font-black uppercase tracking-wider text-xs py-4 rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors mt-6"
            >
              {isRegistering ? 'Skapa konto' : 'Logga in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs font-bold text-gray-400 hover:text-emerald-600 transition-colors"
            >
              {isRegistering ? 'Har du redan ett konto? Logga in' : 'Inget konto? Registrera dig här'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
<Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {/* HÄR LÄGGER VI TILLBAKA DEN UTRENSADE MENYRADEN! 🚀 */}
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
              {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => exportSIE(selectedYear)}
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

      {/* HÄR FORTSÄTTER DASHBOARDEN PRECIS SOM VANLIGT */}
      {activeTab === 'dashboard' ? (
        <>
          <OverviewCards
            data={dashboardData}
            taxRate={taxRate}
            transactions={transactions}
            journalMap={journalMap}
            setActiveModal={setActiveModal}
            activeModal={activeModal}
            balances={balances}
          />

          {/* Skatteinställning */}
          <div className="bg-gray-50 rounded-[1.5rem] p-4 mb-6 flex flex-wrap items-center justify-between gap-4 border">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚙️</span>
              <div>
                <p className="text-xs font-black uppercase text-gray-700">Simulerad skattesats</p>
                <p className="text-[10px] text-gray-400 font-medium">Justera för att matcha din förväntade marginalskatt</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="10"
                max="60"
                value={taxRate}
                onChange={e => setTaxRate(Number(e.target.value))}
                className="w-32 accent-orange-500"
              />
              <span className="bg-white px-3 py-1.5 rounded-xl border font-black text-sm text-gray-700 min-w-[50px] text-center">
                {taxRate}%
              </span>
            </div>
          </div>

          {/* ── BOKFÖRINGSFORMULÄR ──────────────────────────────────────── */}
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

          {/* ── TRANSAKTIONSTABELL ──────────────────────────────────────── */}
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