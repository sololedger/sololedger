'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { bookTransaction, getAccountBalances, deleteTransaction, getNEData } from '@/lib/accountingService'
import Layout from '@/components/Layout'
import NEBilaga from '@/components/NEBilaga'
import Kontoplan from '@/components/Kontoplan'

export default function Home() {
  const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')

  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
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

  const years = [selectedYear - 1, selectedYear, selectedYear + 1]

  useEffect(() => {
    if (!APP_PASSWORD || sessionStorage.getItem('auth') === 'true') {
      setIsAuthenticated(true)
    }
  }, [APP_PASSWORD])

  useEffect(() => {
    if (isAuthenticated) {
      refreshData()
      loadKontoplanOptions()
    }
  }, [selectedYear, isAuthenticated])

  async function loadKontoplanOptions() {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, default_vat_rate')
        .order('name')
      if (error) throw error

      if (data) {
        // Alfabetisk ordning på svenska, ingående_balans alltid sist
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
    setUploading(true)

    try {
      let fileUrl = ''
      if (formData.file) {
        fileUrl = await handleFileUpload(formData.file)
      }

      if (editingId) {
        if (editingBooked) {
          // Bokförd: uppdatera BARA beskrivning, datum och eventuell ny fil
          const updatePayload: any = {
            date: formData.date,
            description: formData.description,
          }
          if (fileUrl) updatePayload.file_url = fileUrl

          const { error } = await supabase
            .from('transactions')
            .update(updatePayload)
            .eq('id', editingId)
          if (error) throw error
        } else {
          // Ej bokförd: uppdatera allt
          const { error } = await supabase
            .from('transactions')
            .update({
              date: formData.date,
              description: formData.description,
              amount: Number(formData.amount),
              type: formData.type,
              vat_rate: formData.vatRate,
              ...(fileUrl ? { file_url: fileUrl } : {})
            })
            .eq('id', editingId)
          if (error) throw error
        }
        setEditingId(null)
        setEditingBooked(false)
      } else {
        // Ny transaktion: skapa och bokför direkt
        const { data: newTx, error: insertError } = await supabase
          .from('transactions')
          .insert([{
            date: formData.date,
            description: formData.description,
            amount: Number(formData.amount),
            type: formData.type,
            vat_rate: formData.vatRate,
            file_url: fileUrl || null
          }])
          .select()
          .single()
        if (insertError) throw insertError
        await bookTransaction(newTx)
      }

      setFormData(prev => ({
        ...prev,
        date: new Date().toISOString().split('T')[0],
        description: '',
        amount: '',
        file: null
      }))
      await refreshData()
    } catch (err: any) {
      console.error('Fel vid bokföring:', err)
      alert("Fel: " + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Radera transaktion och alla bokföringsposter?")) return
    try {
      await deleteTransaction(id)
      await refreshData()
    } catch (err: any) {
      console.error('Fel vid radering:', err)
      alert("Kunde inte radera: " + err.message)
    }
  }

  const handleEdit = (tx: any) => {
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

  // Dashboard-beräkningar
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

  // Skattemässigt resultat = bokfört resultat + ej avdragsgilla kostnader (6992)
  const ejAvdragsgillt = Math.abs(balances['6992'] || 0)
  const skattemassigVinst = Math.round((bokfortResultat + ejAvdragsgillt) * 100) / 100

  // Moms: positivt = du är skyldig Skatteverket, negativt = du får tillbaka
  const utgMoms = Math.abs(balances['2611'] || 0)
  const ingMoms = Math.abs(balances['2641'] || 0)
  const momsNetto = Math.round((utgMoms - ingMoms) * 100) / 100

  // Skattereservat baseras på skattemässig vinst (korrekt för NE-bilagan)
  const skattReserv = skattemassigVinst > 0
    ? Math.round(skattemassigVinst * (taxRate / 100) * 100) / 100
    : 0

  const sakertUttag = Math.round(
    (bankSaldo - skattReserv - (momsNetto > 0 ? momsNetto : 0)) * 100
  ) / 100

  if (!isAuthenticated && APP_PASSWORD) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <form
          onSubmit={e => {
            e.preventDefault()
            if (passwordInput === APP_PASSWORD) {
              sessionStorage.setItem('auth', 'true')
              setIsAuthenticated(true)
            } else {
              alert('Fel lösenord')
            }
          }}
          className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-gray-100 w-full max-w-sm text-center"
        >
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-2xl italic mx-auto mb-6">S</div>
          <h1 className="text-lg font-black uppercase tracking-tighter italic text-gray-800 mb-8">SoloLedger</h1>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            placeholder="Lösenord"
            className="w-full bg-gray-50 rounded-2xl p-4 mb-4 text-center font-bold outline-none text-sm"
            autoFocus
          />
          <button type="submit" className="w-full bg-gray-900 text-white p-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-black transition-all">
            Lås upp
          </button>
        </form>
      </div>
    )
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {/* Rubrik och årsväljare */}
      <div className="flex justify-between items-center mb-8 px-4">
        <h1 className="text-2xl font-black uppercase italic tracking-tighter text-gray-800">
          {activeTab === 'dashboard' ? 'Ekonomiöversikt' : activeTab === 'kontoplan' ? 'Kontoplan' : 'NE-Bilaga'}
        </h1>
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border shadow-sm">
          <span className="text-[10px] font-black uppercase text-gray-400 italic">År:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-blue-50 border-none rounded-lg px-3 py-1 font-black text-sm text-blue-600 outline-none cursor-pointer hover:bg-blue-100 transition-colors"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          {/* Sifferkort */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 text-center uppercase tracking-tighter font-black">
            <button
              onClick={() => setActiveModal('bank')}
              className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-blue-300 hover:shadow-md transition-all cursor-pointer text-left"
            >
              <p className="text-[9px] text-gray-400 mb-1">Bank (1930) <span className="text-blue-300">↗</span></p>
              <p className={`text-xl font-black ${bankSaldo >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
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
            <div className="bg-blue-600 p-6 rounded-[2rem] text-white shadow-lg">
              <p className="text-[9px] opacity-80 mb-1 uppercase">Säkert uttag</p>
              <p className="text-2xl italic font-black">{sakertUttag.toLocaleString()} kr</p>
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
                    <h2 className="text-xl font-black uppercase italic tracking-tighter text-blue-600 mb-1">Bank (1930)</h2>
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
                      <span className={`text-2xl font-black ${bankSaldo >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
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
                        <span className="font-black text-red-500">+{utgMoms.toLocaleString('sv-SE')} kr</span>
                      </div>
                      <div className="flex justify-between items-center bg-green-50 rounded-2xl px-5 py-3">
                        <div>
                          <p className="text-xs font-black text-green-600 uppercase">Ingående moms (2641)</p>
                          <p className="text-[10px] text-gray-400 font-bold mt-0.5">Moms på dina kostnader — du får tillbaka</p>
                        </div>
                        <span className="font-black text-green-600">−{ingMoms.toLocaleString('sv-SE')} kr</span>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-gray-400">
                        {momsNetto > 0 ? 'Att betala till Skatteverket' : 'Att få tillbaka från Skatteverket'}
                      </span>
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
                      <div className="flex justify-between items-center bg-green-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-green-600 uppercase">Intäkter (3xxx)</span>
                        <span className="font-black text-green-600">+{intakter.toLocaleString('sv-SE')} kr</span>
                      </div>
                      <div className="flex justify-between items-center bg-red-50 rounded-2xl px-5 py-3">
                        <span className="text-xs font-black text-red-500 uppercase">Kostnader (4–7xxx)</span>
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

          {/* Skattereglage */}
          <div className="bg-white px-8 py-4 rounded-[2rem] border border-gray-100 shadow-sm mb-8 flex items-center gap-6">
            <span className="text-[9px] font-black uppercase text-gray-400 whitespace-nowrap">Skattsats:</span>
            <input
              type="range"
              min={20}
              max={70}
              value={taxRate}
              onChange={e => setTaxRate(Number(e.target.value))}
              className="flex-1 accent-blue-600 cursor-pointer"
            />
            <span className="text-sm font-black text-blue-600 w-12 text-right">{taxRate}%</span>
            <span className="text-[9px] text-gray-300 font-medium hidden md:block">
              Reserverar skatt på skattemässigt resultat + drar av eventuell momsskuld
            </span>
          </div>

          {/* Formulär */}
          <div className={`bg-white p-8 rounded-[2.5rem] border mb-8 shadow-sm transition-all ${editingId ? 'border-amber-300 bg-amber-50' : 'border-gray-100'}`}>

            {editingId && editingBooked && (
              <div className="mb-4 px-4 py-2 bg-amber-100 border border-amber-200 rounded-xl text-[10px] font-bold text-amber-700">
                Bokförd post — du kan ändra datum, beskrivning och lägga till bilaga. Belopp och kategori är låsta.
              </div>
            )}

            <form onSubmit={handleAddTransaction}>
              <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-3 items-end mb-4">
                <div className="lg:col-span-2 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-300 uppercase ml-1">Datum</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs"
                    required
                  />
                </div>
                <div className="lg:col-span-3 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-300 uppercase ml-1">Kategori</label>
                  <select
                    value={formData.type}
                    onChange={e => {
                      const acc = kontoplan.find(k => k.id === e.target.value)
                      setFormData({ ...formData, type: e.target.value, vatRate: Number(acc?.default_vat_rate) || 0 })
                    }}
                    disabled={editingBooked}
                    className={`p-3 rounded-xl outline-none font-bold text-xs ${editingBooked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 cursor-pointer'}`}
                  >
                    {kontoplan.map(item => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-3 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-300 uppercase ml-1">Beskrivning</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs"
                    required
                  />
                </div>
                <div className="lg:col-span-1 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-300 uppercase ml-1">Moms %</label>
                  <select
                    value={formData.vatRate}
                    onChange={e => setFormData({ ...formData, vatRate: Number(e.target.value) })}
                    disabled={editingBooked}
                    className={`p-3 rounded-xl outline-none font-bold text-xs ${editingBooked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50 cursor-pointer'}`}
                  >
                    <option value={25}>25%</option>
                    <option value={12}>12%</option>
                    <option value={6}>6%</option>
                    <option value={0}>0%</option>
                  </select>
                </div>
                <div className="lg:col-span-2 flex flex-col gap-1">
                  <label className="text-[9px] font-black text-gray-300 uppercase ml-1">Belopp inkl. moms</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    disabled={editingBooked}
                    className={`p-3 rounded-xl outline-none font-black text-sm ${editingBooked ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-50'}`}
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
                      disabled={uploading}
                      className={`flex-1 h-[42px] rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${uploading ? 'bg-gray-400' : editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
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

              {/* Filuppladdning */}
              <div className="flex items-center gap-4 pt-3 border-t border-gray-50">
                <label className="text-[9px] font-black text-gray-300 uppercase whitespace-nowrap">📎 Bilaga:</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setFormData({ ...formData, file: e.target.files?.[0] || null })}
                  className="text-xs text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[9px] file:font-black file:uppercase file:bg-gray-100 file:text-gray-500 hover:file:bg-gray-200 cursor-pointer"
                />
                {formData.file && (
                  <span className="text-[9px] text-blue-500 font-bold">{formData.file.name}</span>
                )}
              </div>
            </form>
          </div>

          {/* Transaktionslista */}
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
                    <td colSpan={4} className="p-12 text-center text-gray-300 italic font-medium">
                      Inga transaktioner bokförda för {selectedYear}
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const journal = journalMap[tx.id] || []
                    return (
                      <tr
                        key={tx.id}
                        className={`hover:bg-gray-50/50 transition-colors ${editingId === tx.id ? 'bg-amber-50/50' : ''}`}
                      >
                        <td className="p-8 font-bold text-gray-400 text-sm">
                          {tx.date}
                          {journal[0]?.ver_nr && (
                            <p className="text-[10px] font-black text-blue-600 italic">VER-{journal[0].ver_nr}</p>
                          )}
                        </td>
                        <td className="p-8">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] font-black text-blue-500 uppercase">
                              {kontoplan.find(k => k.id === tx.type)?.name || tx.type}
                            </p>
                            {tx.booked && (
                              <span className="text-[8px] font-black uppercase text-gray-300 border border-gray-200 px-1.5 py-0.5 rounded-md">
                                Låst
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-gray-700">{tx.description}</p>
                          {tx.file_url && (
                            <a
                              href={tx.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 text-xs mt-1 inline-block hover:text-blue-600"
                            >
                              📎 Visa bilaga
                            </a>
                          )}
                        </td>
                        <td className="p-8 text-right font-black text-lg text-gray-700">
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
                                    className="inline-flex items-center gap-0.5 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 font-mono text-[10px] font-bold text-gray-500"
                                  >
                                    {e.account_number}
                                    <span className={isDebit ? 'text-blue-500' : 'text-orange-400'}>
                                      {isDebit ? ' D' : ' K'}
                                    </span>
                                  </span>
                                )
                              })}
                          </div>
                        </td>
                        <td className="p-8 text-right pr-12">
                          <div className="flex items-center justify-end gap-4">
                            <button
                              onClick={() => handleEdit(tx)}
                              className="text-gray-200 hover:text-blue-600 transition-colors"
                              title={tx.booked ? "Redigera beskrivning/datum/bilaga" : "Redigera"}
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDelete(tx.id)}
                              className="text-red-100 hover:text-red-500 font-bold transition-colors"
                              title="Radera"
                            >
                              ✕
                            </button>
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
      ) : (
        <NEBilaga neData={neData} />
      )}
    </Layout>
  )
}
