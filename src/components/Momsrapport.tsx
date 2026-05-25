'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Period = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'HELA'

const PERIODS: { value: Period; label: string; start: string; end: string }[] = [
  { value: 'Q1',   label: 'Q1 — Jan–Mar',  start: '01-01', end: '03-31' },
  { value: 'Q2',   label: 'Q2 — Apr–Jun',  start: '04-01', end: '06-30' },
  { value: 'Q3',   label: 'Q3 — Jul–Sep',  start: '07-01', end: '09-30' },
  { value: 'Q4',   label: 'Q4 — Okt–Dec',  start: '10-01', end: '12-31' },
  { value: 'HELA', label: 'Hela året',      start: '01-01', end: '12-31' },
]

function fmt(n: number) {
  return Math.abs(n).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Momsrapport() {
  const currentYear = new Date().getFullYear()
  const [year, setYear]       = useState(currentYear)
  const [period, setPeriod]   = useState<Period>('Q1')
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [utgående, setUtgående] = useState(0)   // konto 2611: sum(credit - debit)
  const [ingående, setIngående] = useState(0)   // konto 2641: sum(debit - credit)

  const years = [currentYear - 2, currentYear - 1, currentYear]
  const netto = Math.round((utgående - ingående) * 100) / 100
  const skaBetalas = netto > 0

  async function fetchMoms() {
    setLoading(true)
    setFetched(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Inte inloggad')

      const p = PERIODS.find(p => p.value === period)!
      const startDate = `${year}-${p.start}`
      const endDate   = `${year}-${p.end}`

      const { data, error } = await supabase
        .from('journal_entries')
        .select('account_number, debit, credit')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .in('account_number', ['2611', '2641'])

      if (error) throw error

      let ut = 0
      let ing = 0
      for (const row of data || []) {
        const d = Number(row.debit)
        const c = Number(row.credit)
        if (row.account_number === '2611') ut  += (c - d)
        if (row.account_number === '2641') ing += (d - c)
      }

      setUtgående(Math.round(ut  * 100) / 100)
      setIngående(Math.round(ing * 100) / 100)
      setFetched(true)
    } catch (err: any) {
      alert('Fel vid hämtning: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch when year/period changes if already fetched once
  useEffect(() => {
    if (fetched) fetchMoms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, period])

  const periodLabel = PERIODS.find(p => p.value === period)?.label ?? ''

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">SKV 4700</p>
        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-gray-800">Momsrapport</h2>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">År</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-emerald-300"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Period</label>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as Period)}
              className="bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-emerald-300"
            >
              {PERIODS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchMoms}
            disabled={loading}
            className="h-[42px] px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300"
          >
            {loading ? '...' : 'Beräkna'}
          </button>
        </div>
      </div>

      {/* Results */}
      {fetched && !loading && (
        <div className="space-y-4 animate-in fade-in duration-300">

          {/* Period label */}
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-1">
            {year} / {periodLabel}
          </p>

          {/* Ruta 05 — Utgående moms */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 05</p>
                <p className="text-xs font-black uppercase text-gray-600">Utgående moms</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">Konto 2611 — moms på din försäljning</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-red-500 tabular-nums">
                  {fmt(utgående)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Ska betalas in</p>
              </div>
            </div>
          </div>

          {/* Ruta 49 — Ingående moms */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 49</p>
                <p className="text-xs font-black uppercase text-gray-600">Ingående moms att dra av</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">Konto 2641 — moms på dina kostnader</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-emerald-600 tabular-nums">
                  {fmt(ingående)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Avdrag</p>
              </div>
            </div>
          </div>

          {/* Divider with calculation hint */}
          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 border-t border-dashed border-gray-200" />
            <p className="text-[9px] font-black uppercase text-gray-300 tracking-widest whitespace-nowrap">
              {fmt(utgående)} − {fmt(ingående)}
            </p>
            <div className="flex-1 border-t border-dashed border-gray-200" />
          </div>

          {/* Ruta 499 — Netto */}
          <div className={`rounded-[2rem] border-2 shadow-sm p-7 ${
            skaBetalas
              ? 'bg-red-50 border-red-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  Ruta 49 (netto)
                </p>
                <p className={`text-xs font-black uppercase ${skaBetalas ? 'text-red-700' : 'text-emerald-700'}`}>
                  Moms att {skaBetalas ? 'betala' : 'få tillbaka'}
                </p>
                <p className={`text-[9px] font-medium mt-1 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  {skaBetalas
                    ? 'Ska betalas till Skatteverket'
                    : 'Återbetalas från Skatteverket'}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-black italic tabular-nums ${skaBetalas ? 'text-red-500' : 'text-emerald-600'}`}>
                  {skaBetalas ? '' : '+'}{netto >= 0 ? '' : ''}{fmt(netto)} kr
                </p>
                <p className={`text-[10px] font-black uppercase mt-1 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  {skaBetalas ? '▲ Skuld' : '▼ Fordran'}
                </p>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-[9px] text-gray-300 font-bold text-center px-4 pb-2">
            Beloppen är beräknade ur bokförda verifikationer. Kontrollera alltid mot Skatteverkets e-tjänst innan inlämning.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!fetched && !loading && (
        <div className="text-center py-16 text-gray-300">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-black uppercase text-xs tracking-widest">Välj period och klicka Beräkna</p>
        </div>
      )}
    </div>
  )
}
