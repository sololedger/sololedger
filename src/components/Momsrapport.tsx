'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  closeVatPeriod,
  ensureVatPeriods,
  getMomsBreakdown,
  getVatPeriods,
  type CloseVatPeriodResult,
  type MomsBreakdown,
  type VatPeriod,
  type VatPeriodSource,
  type VatPeriodStatus,
  type VatPeriodType,
} from '@/lib/accountingService'
import type { AccountingRefreshResult } from '@/hooks/useAccountingData'
import type { AuthProfile } from '@/hooks/useAuth'

function fmt(n: number) {
  return Math.abs(n).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(date: string) {
  return new Date(date).toLocaleDateString('sv-SE')
}

function periodTypeLabel(type: VatPeriodType) {
  const labels: Record<VatPeriodType, string> = {
    month: 'Månad',
    quarter: 'Kvartal',
    year: 'Helår',
  }
  return labels[type]
}

function statusLabel(status: VatPeriodStatus) {
  const labels: Record<VatPeriodStatus, string> = {
    open: 'Öppen',
    closed: 'Stängd',
    declared: 'Deklarerad',
  }
  return labels[status]
}

function statusClass(status: VatPeriodStatus) {
  const classes: Record<VatPeriodStatus, string> = {
    open: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    closed: 'bg-amber-50 text-amber-600 border-amber-100',
    declared: 'bg-sky-50 text-sky-600 border-sky-100',
  }
  return classes[status]
}

function sourceLabel(source: VatPeriodSource) {
  const labels: Record<VatPeriodSource, string> = {
    sololedger: 'SoloLedger',
    imported_history: 'Importerad historik',
  }
  return labels[source]
}

function periodLabel(period: VatPeriod) {
  return `${fmtDate(period.period_start)} – ${fmtDate(period.period_end)}`
}

function closingAmountText(period: VatPeriod) {
  if (period.closing_amount == null || period.status === 'open') return null
  if (period.closing_amount > 0) return `Stängningsbelopp: ${fmt(period.closing_amount)} kr att betala`
  if (period.closing_amount < 0) return `Stängningsbelopp: ${fmt(period.closing_amount)} kr att få tillbaka`
  return 'Stängningsbelopp: 0,00 kr'
}

type MomsrapportProps = {
  profile: AuthProfile
  onBookkeepingRefresh?: () => Promise<AccountingRefreshResult>
}

const emptyBreakdown: MomsBreakdown = {
  utgaendeMoms: 0,
  ingaendeMoms: 0,
  momsNetto: 0,
  utgaendeMoms25: 0,
  utgaendeMoms12: 0,
  utgaendeMoms6: 0,
  momspliktigForsaljning25: 0,
  momspliktigForsaljning12: 0,
  momspliktigForsaljning6: 0,
  momspliktigForsaljning: 0,
}

export default function Momsrapport({ profile, onBookkeepingRefresh }: MomsrapportProps) {
  const currentYear = new Date().getFullYear()
  const todayIso = new Date().toISOString().slice(0, 10)
  const ensuredKeysRef = useRef<Set<string>>(new Set())
  const closeInFlightRef = useRef(false)
  const [year, setYear]                     = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [vatPeriods, setVatPeriods]         = useState<VatPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [periodsLoading, setPeriodsLoading] = useState(false)
  const [periodError, setPeriodError]       = useState<string | null>(null)
  const [loading, setLoading]               = useState(false)
  const [closing, setClosing]               = useState(false)
  const [fetched, setFetched]               = useState(false)
  const [breakdown, setBreakdown] = useState<MomsBreakdown>(emptyBreakdown)
  const [breakdownPeriodId, setBreakdownPeriodId] = useState<string | null>(null)
  const [breakdownContextKey, setBreakdownContextKey] = useState<string | null>(null)

  const selectedPeriod = useMemo(
    () => vatPeriods.find(p => p.id === selectedPeriodId) ?? null,
    [selectedPeriodId, vatPeriods]
  )

  const vatStatus = profile?.vat_status
  const vatPeriodType = profile?.vat_period_type
  const vatManagementFrom = profile?.vat_management_from
  const profileKey = `${vatStatus ?? ''}|${vatPeriodType ?? ''}|${vatManagementFrom ?? ''}`
  const canEnsurePeriods =
    vatStatus === 'registered' &&
    Boolean(vatPeriodType) &&
    Boolean(vatManagementFrom)
  const selectedPeriodContextKey = selectedPeriod
    ? `${year}|${profileKey}|${selectedPeriod.id}`
    : null
  const hasCurrentBreakdown =
    Boolean(selectedPeriod) &&
    fetched &&
    !loading &&
    breakdownPeriodId === selectedPeriod?.id &&
    breakdownContextKey === selectedPeriodContextKey
  const selectedPeriodIsFuture = selectedPeriod ? selectedPeriod.period_end > todayIso : false
  const canCloseSelectedPeriod =
    Boolean(selectedPeriod) &&
    selectedPeriod?.source === 'sololedger' &&
    selectedPeriod?.status === 'open' &&
    !selectedPeriodIsFuture &&
    vatStatus === 'registered'

  // Hämtar tillgängliga år en gång vid montering. År som bara finns i
  // vat_periods läggs till av periodladdningen nedan.
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

      const { data: periodData, error: periodError } = await supabase
        .from('vat_periods')
        .select('period_start, period_end')
        .eq('user_id', user.id)

      if (periodError) throw periodError

      const yearsSet = new Set<number>()
      yearsSet.add(currentYear)

      data?.forEach(row => {
        if (row.date) {
          const y = new Date(row.date).getFullYear()
          if (!isNaN(y)) yearsSet.add(y)
        }
      })

      periodData?.forEach(row => {
        if (row.period_start) {
          const y = new Date(row.period_start).getFullYear()
          if (!isNaN(y)) yearsSet.add(y)
        }
        if (row.period_end) {
          const y = new Date(row.period_end).getFullYear()
          if (!isNaN(y)) yearsSet.add(y)
        }
      })

      const sortedYears = Array.from(yearsSet).sort((a, b) => b - a)
      setAvailableYears(sortedYears)
    } catch (err) {
      console.error('Kunde inte hämta tillgängliga år:', err)
    }
  }, [currentYear])

  const loadVatPeriods = useCallback(async (
    preferredPeriodId?: string,
    options: { ensure?: boolean } = {}
  ): Promise<VatPeriod[] | null> => {
    const shouldEnsure = options.ensure ?? true
    setPeriodsLoading(true)
    setPeriodError(null)
    setFetched(false)
    setBreakdown(emptyBreakdown)
    setBreakdownPeriodId(null)
    setBreakdownContextKey(null)

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const selectedYearStartsInFuture = year > currentYear

    try {
      let ensuredThisRun = false

      if (shouldEnsure && canEnsurePeriods && !selectedYearStartsInFuture) {
        const ensureKey = [
          year,
          vatStatus,
          vatPeriodType,
          vatManagementFrom,
        ].join('|')

        if (!ensuredKeysRef.current.has(ensureKey)) {
          await ensureVatPeriods(yearEnd)
          ensuredKeysRef.current.add(ensureKey)
          ensuredThisRun = true
        }
      }

      const periods = await getVatPeriods(yearStart, yearEnd)
      setVatPeriods(periods)
      setSelectedPeriodId(current => {
        const targetPeriodId = preferredPeriodId ?? current
        return periods.some(p => p.id === targetPeriodId)
          ? targetPeriodId
          : periods.some(p => p.id === current)
          ? current
          : periods[0]?.id ?? ''
      })

      setAvailableYears(current => {
        const periodYears = new Set<number>(current)
        periods.forEach(p => {
          periodYears.add(new Date(p.period_start).getFullYear())
          periodYears.add(new Date(p.period_end).getFullYear())
        })
        return Array.from(periodYears).sort((a, b) => b - a)
      })

      if (ensuredThisRun) {
        void loadAvailableYears()
      }

      return periods
    } catch (err) {
      setVatPeriods([])
      setSelectedPeriodId('')
      setPeriodError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setPeriodsLoading(false)
    }
  }, [
    canEnsurePeriods,
    currentYear,
    loadAvailableYears,
    vatManagementFrom,
    vatPeriodType,
    vatStatus,
    year,
  ])

  useEffect(() => {
    loadAvailableYears()
  }, [loadAvailableYears])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadVatPeriods()
  }, [loadVatPeriods])

  const skaBetalas = breakdown.momsNetto > 0
  const closingText = selectedPeriod ? closingAmountText(selectedPeriod) : null

  // Beräkna moms för vald DB-verifierad momsperiod via den centrala
  // Alternativ E-logiken i accountingService.ts. Ingen egen momsgruppering här.
  async function fetchMomsForPeriod(periodForFetch: VatPeriod, contextForFetch: string) {
    setLoading(true)
    setFetched(false)
    setBreakdownPeriodId(null)
    setBreakdownContextKey(null)
    try {
      const result = await getMomsBreakdown(periodForFetch.period_start, periodForFetch.period_end)
      setBreakdown(result)
      setBreakdownPeriodId(periodForFetch.id)
      setBreakdownContextKey(contextForFetch)
      setFetched(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert('Fel vid hämtning: ' + message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchMoms() {
    if (!selectedPeriod || !selectedPeriodContextKey) return
    await fetchMomsForPeriod(selectedPeriod, selectedPeriodContextKey)
  }

  function closeErrorMessage(message: string) {
    if (message.includes('Importerad historik') || message.includes('Endast SoloLedger')) {
      return 'Importerad momshistorik kan inte stängas som en SoloLedger-period.'
    }
    if (message.includes('redan deklarerad')) {
      return 'Momsperioden är redan deklarerad och kan inte stängas igen.'
    }
    if (message.includes('Framtida momsperioder')) {
      return 'Framtida momsperioder kan inte stängas.'
    }
    if (message.includes('räkenskapsår') && message.includes('är låst')) {
      return 'Momsperioden ligger i ett låst räkenskapsår och kan inte stängas.'
    }
    if (message.includes('aktivitet på 265x')) {
      return 'Perioden innehåller aktivitet på 265x och behöver manuell kontroll före stängning.'
    }
    if (message.includes('alla relevanta momskonton är redan noll')) {
      return 'Perioden har momsaktivitet men relevanta momskonton är redan noll. Kontrollera perioden manuellt.'
    }
    if (message.includes('hittades inte') || message.includes('tillhör inte dig')) {
      return 'Momsperioden kunde inte hittas för ditt konto.'
    }
    return 'Momsperioden kunde inte stängas. Kontrollera perioden och försök igen.'
  }

  function closeSuccessMessage(result: CloseVatPeriodResult) {
    if (result.already_closed) {
      return 'Momsperioden var redan stängd. Statusen har uppdaterats.'
    }
    if (result.transaction_created) {
      return result.ver_nr
        ? `Momsperioden stängdes och systemverifikation VER-${result.ver_nr} skapades.`
        : 'Momsperioden stängdes och en systemverifikation skapades.'
    }
    return 'Momsperioden stängdes. Ingen systemverifikation behövdes eftersom perioden saknade momsaktivitet.'
  }

  async function handleClosePeriod() {
    if (!selectedPeriod || !canCloseSelectedPeriod || closeInFlightRef.current) return

    const confirmed = window.confirm(
      `Stäng momsperioden ${periodLabel(selectedPeriod)}?\n\n` +
      'SoloLedger kommer att stänga momsperioden och, vid behov, skapa en systemverifikation som nollar periodens relevanta momskonton mot 2650.\n\n' +
      'Efter stängning låses perioden för vanlig momsrelaterad bokföring enligt befintlig serverlogik.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    closeInFlightRef.current = true
    setClosing(true)
    setPeriodError(null)

    try {
      const result = await closeVatPeriod(periodId)

      const centralRefreshResult = await onBookkeepingRefresh?.()
      const centralRefreshFailed = centralRefreshResult?.ok === false

      const periods = await loadVatPeriods(periodId, { ensure: false })
      let periodRefreshFailed = false
      if (!periods) {
        periodRefreshFailed = true
      } else {
        const refreshedPeriod = periods.find(p => p.id === periodId)
        if (refreshedPeriod) {
          await fetchMomsForPeriod(refreshedPeriod, `${year}|${profileKey}|${refreshedPeriod.id}`)
        }
      }

      const refreshWarning = centralRefreshFailed && periodRefreshFailed
        ? '\n\nStängningen lyckades, men vyn kunde inte uppdateras korrekt. Ladda om sidan för att se periodstatus och eventuell systemverifikation.'
        : centralRefreshFailed
        ? '\n\nStängningen lyckades, men delar av bokföringsvyn kunde inte uppdateras automatiskt. Ladda om sidan om systemverifikationen inte syns.'
        : periodRefreshFailed
        ? '\n\nStängningen lyckades, men periodstatus kunde inte uppdateras automatiskt. Ladda om sidan.'
        : ''

      alert(closeSuccessMessage(result) + refreshWarning)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert(closeErrorMessage(message))
    } finally {
      closeInFlightRef.current = false
      setClosing(false)
    }
  }

  useEffect(() => {
    if (fetched && selectedPeriod) fetchMoms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriodId])

  function handleYearChange(nextYear: number) {
    setFetched(false)
    setBreakdown(emptyBreakdown)
    setBreakdownPeriodId(null)
    setBreakdownContextKey(null)
    setYear(nextYear)
  }

  function handlePeriodChange(nextPeriodId: string) {
    setBreakdown(emptyBreakdown)
    setBreakdownPeriodId(null)
    setBreakdownContextKey(null)
    setSelectedPeriodId(nextPeriodId)
  }

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
              onChange={e => handleYearChange(Number(e.target.value))}
              disabled={closing}
              className="bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-emerald-300"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 sm:min-w-[220px]">
            <label className="text-[9px] font-black uppercase text-gray-400 ml-1">Period</label>
            <select
              value={selectedPeriodId}
              onChange={e => handlePeriodChange(e.target.value)}
              disabled={periodsLoading || closing || vatPeriods.length === 0}
              className="bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-emerald-300 disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              {vatPeriods.length === 0 ? (
                <option value="">Ingen DB-verifierad period</option>
              ) : (
                vatPeriods.map(p => (
                  <option key={p.id} value={p.id}>
                    {periodLabel(p)} · {periodTypeLabel(p.period_type)}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={fetchMoms}
            disabled={loading || periodsLoading || closing || !selectedPeriod}
            className="h-[42px] px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
          >
            {loading ? '...' : 'Beräkna'}
          </button>

          {canCloseSelectedPeriod && (
            <button
              onClick={handleClosePeriod}
              disabled={closing || periodsLoading || loading}
              className="h-[42px] px-6 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
            >
              {closing ? 'Stänger...' : 'Stäng momsperiod'}
            </button>
          )}
        </div>

        {selectedPeriod && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-gray-100 pt-4">
            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg border ${statusClass(selectedPeriod.status)}`}>
              {statusLabel(selectedPeriod.status)}
            </span>
            <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-gray-100 bg-gray-50 text-gray-500">
              {sourceLabel(selectedPeriod.source)}
            </span>
            <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-gray-100 bg-gray-50 text-gray-500">
              {periodTypeLabel(selectedPeriod.period_type)}
            </span>
            {closingText && (
              <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-violet-100 bg-violet-50 text-violet-600">
                {closingText}
              </span>
            )}
            {selectedPeriod.status !== 'open' && selectedPeriod.closing_transaction_id === null && (
              <span className="text-[9px] font-bold text-gray-400">
                Ingen avslutsverifikation behövdes för perioden.
              </span>
            )}
          </div>
        )}

        {periodError && (
          <p className="mt-4 text-[10px] font-bold text-red-500">
            {periodError}
          </p>
        )}

        {!periodError && !periodsLoading && vatPeriods.length === 0 && (
          <p className="mt-4 text-[10px] font-bold text-gray-400">
            {profile?.vat_status === 'not_registered'
              ? 'Företaget är markerat som inte momsregistrerat. Inga SoloLedger-momsperioder genereras.'
              : profile?.vat_status === 'unknown'
              ? 'Momsstatus är inte inställd. SoloLedger gissar inte momsperioder.'
              : 'Inga DB-verifierade momsperioder finns för valt år.'}
          </p>
        )}
      </div>

      {/* Results */}
      {hasCurrentBreakdown && selectedPeriod && (
        <div className="space-y-4 animate-in fade-in duration-300">

          {/* Period label */}
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-1">
            {periodLabel(selectedPeriod)} / {statusLabel(selectedPeriod.status)} / {sourceLabel(selectedPeriod.source)}
          </p>

          {/* Ruta 05 — momspliktig försäljning exklusive moms */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 05</p>
                <p className="text-xs font-black uppercase text-gray-600">Momspliktig försäljning exkl. moms</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">
                  Försäljningsunderlag för vanlig momspliktig försäljning i Sverige
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-gray-700 tabular-nums whitespace-nowrap">
                  {fmt(breakdown.momspliktigForsaljning ?? 0)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Exkl. moms</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5 pt-4 border-t border-dashed border-gray-100">
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">25 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(breakdown.momspliktigForsaljning25 ?? 0)} kr</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">12 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(breakdown.momspliktigForsaljning12 ?? 0)} kr</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">6 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(breakdown.momspliktigForsaljning6 ?? 0)} kr</p>
              </div>
            </div>
          </div>

          {/* Ruta 10–12 — utgående moms per momssats */}
          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="mb-4">
              <p className="text-xs font-black uppercase text-gray-600">Utgående moms</p>
              <p className="text-[9px] text-gray-400 font-medium mt-1">
                Fördelad enligt momssats
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ruta 10</p>
                  <p className="text-xs font-black uppercase text-gray-600">Utgående moms 25 %</p>
                </div>
                <p className="text-xl font-black text-red-500 tabular-nums whitespace-nowrap">
                  {fmt(breakdown.utgaendeMoms25 ?? 0)} kr
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ruta 11</p>
                  <p className="text-xs font-black uppercase text-gray-600">Utgående moms 12 %</p>
                </div>
                <p className="text-xl font-black text-red-500 tabular-nums whitespace-nowrap">
                  {fmt(breakdown.utgaendeMoms12 ?? 0)} kr
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ruta 12</p>
                  <p className="text-xs font-black uppercase text-gray-600">Utgående moms 6 %</p>
                </div>
                <p className="text-xl font-black text-red-500 tabular-nums whitespace-nowrap">
                  {fmt(breakdown.utgaendeMoms6 ?? 0)} kr
                </p>
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
            Beloppen är beräknade ur bokförda verifikationer, exklusive interna momsombokningar. Rapporten visar vanlig svensk momspliktig försäljning och ingående moms; kontrollera alltid mot Skatteverkets e-tjänst innan inlämning.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!hasCurrentBreakdown && !loading && (
        <div className="text-center py-16 text-gray-300">
          <p className="text-4xl mb-3">🧾</p>
          <p className="font-black uppercase text-xs tracking-widest">
            {periodsLoading
              ? 'Hämtar momsperioder'
              : selectedPeriod
              ? 'Välj period och klicka Beräkna'
              : 'Ingen momsperiod vald'}
          </p>
        </div>
      )}
    </div>
  )
}
