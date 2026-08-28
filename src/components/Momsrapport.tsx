'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getMomsBreakdown, type MomsBreakdown } from '@/lib/accountingService'

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
  const [year, setYear]                     = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [period, setPeriod]                 = useState<Period>('Q1')
  const [loading, setLoading]               = useState(false)
  const [fetched, setFetched]               = useState(false)
  const [breakdown, setBreakdown] = useState<MomsBreakdown>({ utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

  // Hämtar tillgängliga år en gång vid montering
  const loadAvailableYears = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('journal_entries')
        .select('date')
        .eq('user_id', user.id)
        .not('date', 'is', null)
        .order('date', { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        const yearsSet = new Set<number>()
        yearsSet.add(currentYear)

        data.forEach(row => {
          if (row.date) {
            const y = new Date(row.date).getFullYear()
            if (!isNaN(y)) yearsSet.add(y)
          }
        })

        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a)
        setAvailableYears(sortedYears)
      }
    } catch (err) {
      console.error('Kunde inte hämta tillgängliga år:', err)
    }
  }, [currentYear])

  useEffect(() => {
    loadAvailableYears()
  }, [loadAvailableYears])

  const skaBetalas = breakdown.momsNetto > 0

  // Beräkna moms för valt år & period via den centrala Alternativ E-logiken
  // i accountingService.ts - ingen egen grupperings-/summeringslogik här,
  // så Momsrapport och Dashboard kan aldrig visa olika siffror för samma period.
  async function fetchMoms() {
    setLoading(true)
    setFetched(false)
    try {
      const p = PERIODS.find(p => p.value === period)!
      const startDate = `${year}-${p.start}`
      const endDate   = `${year}-${p.end}`

      const result = await getMomsBreakdown(startDate, endDate)
      setBreakdown(result)
      setFetched(true)
    } catch (err: any) {
      alert('Fel vid hämtning: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (fetched) fetchMoms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, period])

  const periodLabel = PERIODS.find(p => p.value === period)?.label ?? ''

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">SKV 4700</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
          <div className="flex flex-col gap-1 sm:w-auto">
            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">År</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-emerald-300"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 sm:min-w-[160px]">
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
            className="h-[42px] px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
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
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 05</p>
                <p className="text-xs font-black uppercase text-gray-600">Utgående moms</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">Moms på din försäljning (261x/262x/263x)</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-red-500 tabular-nums whitespace-nowrap">
                  {fmt(breakdown.utgaendeMoms)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Ska betalas in</p>
              </div>
            </div>
          </div>

          {/* Ruta 48 — Ingående moms */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 48</p>
                <p className="text-xs font-black uppercase text-gray-600">Ingående moms att dra av</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">Moms på dina kostnader (264x)</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-emerald-600 tabular-nums whitespace-nowrap">
                  {fmt(breakdown.ingaendeMoms)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Avdrag</p>
              </div>
            </div>
          </div>

          {/* Divider with calculation hint */}
          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 border-t border-dashed border-gray-200" />
            <p className="text-[9px] font-black uppercase text-gray-300 tracking-widest whitespace-nowrap">
              {fmt(breakdown.utgaendeMoms)} − {fmt(breakdown.ingaendeMoms)}
            </p>
            <div className="flex-1 border-t border-dashed border-gray-200" />
          </div>

          {/* Ruta 49 — Netto */}
          <div className={`rounded-[2rem] border-2 shadow-sm p-5 sm:p-7 ${
            skaBetalas
              ? 'bg-red-50 border-red-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
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
                <p className={`text-3xl font-black italic tabular-nums whitespace-nowrap ${skaBetalas ? 'text-red-500' : 'text-emerald-600'}`}>
                  {skaBetalas ? '' : '+'}{fmt(Math.abs(breakdown.momsNetto))} kr
                </p>
                <p className={`text-[10px] font-black uppercase mt-1 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  {skaBetalas ? '▲ Skuld' : '▼ Fordran'}
                </p>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-[9px] text-gray-300 font-bold text-center px-4 pb-2">
            Beloppen är beräknade ur bokförda verifikationer, exklusive interna momsombokningar. Kontrollera alltid mot Skatteverkets e-tjänst innan inlämning.
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