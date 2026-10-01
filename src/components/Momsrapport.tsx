'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchAllRows,
  type FetchAllRangeQuery,
} from '@/lib/supabaseFetchAll'
import {
  closeVatPeriod,
  declareVatPeriod,
  ensureVatPeriods,
  getTaxAccountEventsForPeriod,
  getTaxAccountMovementsForPeriod,
  getVatPeriods,
  recordTaxAccountMovement,
  recordVatSettlement,
  type CloseVatPeriodResult,
  type DeclareVatPeriodResult,
  type TaxAccountEvent,
  type TaxAccountMovement,
  type VatPeriod,
  type VatPeriodSource,
  type VatPeriodStatus,
  type VatPeriodType,
} from '@/lib/accountingService'
import { getVatReportForPeriod } from '@/lib/vatReportService'
import {
  buildVatReportPresentation,
  vatReportBlockedMessage,
  type VatReportPresentation,
} from '@/lib/vatReportPresentation'
import {
  CONFIRM_DECLARATION_BUTTON_LABEL,
  DECLARATION_ALREADY_SUBMITTED_COPY,
  DECLARATION_DOES_NOT_SUBMIT_COPY,
  DECLARATION_SUBMITTED_ON_LABEL,
  VAT_RECLASSIFIED_NOT_SETTLED_COPY,
  formatLocalDateOnly,
  isValidSkvSubmittedOnDate,
  isVatReportRequestCurrent,
  skvSubmittedOnValidationMessage,
  shouldAutoLoadVatReport,
  vatClosingObligationText,
  vatDeclarationStatusText,
} from '@/lib/vatLifecycleUi'
import {
  EMPTY_SETTLEMENT_IDEMPOTENCY_STATE,
  canStartVatSettlementSubmit,
  clearSettlementIdempotency,
  clearSettlementIdempotencyStorage,
  deriveVatSettlementReadModel,
  isVatSettlementSubmitContextCurrent,
  payableOrRefundHeading,
  prepareSettlementIdempotencyKey,
  readSettlementIdempotencyFromStorage,
  settlementActionLabel,
  settlementAmountLabel,
  settlementEventText,
  settlementQuestion,
  settlementStateText,
  validateVatSettlementInput,
  writeSettlementIdempotencyToStorage,
  type VatSettlementIdempotencyState,
} from '@/lib/vatSettlementUi'
import {
  vatSettlementSubmissionErrorMessage,
  vatSettlementSubmissionFailureKind,
} from '@/lib/vatSettlementErrors'
import {
  EMPTY_TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STATE,
  TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY,
  TAX_ACCOUNT_MOVEMENT_UNSURE_COPY,
  canStartTaxAccountMovementSubmit,
  clearTaxAccountMovementIdempotency,
  clearTaxAccountMovementIdempotencyStorage,
  deriveTaxAccountMovementReadModel,
  isTaxAccountMovementSubmitContextCurrent,
  nextTaxAccountMovementChoiceForContext,
  prepareTaxAccountMovementIdempotencyKey,
  readTaxAccountMovementIdempotencyFromStorage,
  taxAccountMovementActionLabel,
  taxAccountMovementAmountLabel,
  taxAccountMovementHistoryText,
  taxAccountMovementKindForChoice,
  taxAccountMovementQuestion,
  taxAccountMovementStateText,
  validateTaxAccountMovementInput,
  writeTaxAccountMovementIdempotencyToStorage,
  type TaxAccountMovementChoice,
  type TaxAccountMovementDirection,
  type TaxAccountMovementIdempotencyState,
} from '@/lib/taxAccountMovementUi'
import {
  taxAccountMovementSubmissionErrorMessage,
  taxAccountMovementSubmissionFailureKind,
} from '@/lib/taxAccountMovementErrors'
import type { AccountingRefreshResult } from '@/hooks/useAccountingData'
import type { AuthProfile } from '@/hooks/useAuth'

type AvailableYearFilterQuery<T> = FetchAllRangeQuery<T> & {
  eq(column: string, value: unknown): AvailableYearFilterQuery<T>
  not(column: string, operator: string, value: unknown): AvailableYearFilterQuery<T>
}

type AvailableYearQuery = {
  select(
    columns: string,
    options?: { count?: 'exact' }
  ): AvailableYearFilterQuery<unknown>
}

type AvailableYearClient = {
  from(table: string): AvailableYearQuery
}

interface JournalDateRow {
  date: string | null
}

interface VatPeriodYearRow {
  period_start: string
  period_end: string
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
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
  return vatClosingObligationText(period, fmt)
}

function declaredAtText(period: VatPeriod) {
  return vatDeclarationStatusText(period, fmtDate)
}

function soloLedgerDeclarationAuditText(period: VatPeriod) {
  if (period.status !== 'declared' || !period.declared_at) return null
  return `Bekräftad i SoloLedger ${new Date(period.declared_at).toLocaleString('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })}`
}

type MomsrapportProps = {
  profile: AuthProfile
  onBookkeepingRefresh?: () => Promise<AccountingRefreshResult>
}

export default function Momsrapport({ profile, onBookkeepingRefresh }: MomsrapportProps) {
  const currentYear = new Date().getFullYear()
  const todayIso = formatLocalDateOnly(new Date())
  const ensuredKeysRef = useRef<Set<string>>(new Set())
  const closeInFlightRef = useRef(false)
  const declareInFlightRef = useRef(false)
  const settlementInFlightRef = useRef(false)
  const movementInFlightRef = useRef(false)
  const reportRequestSeqRef = useRef(0)
  const settlementRequestSeqRef = useRef(0)
  const movementRequestSeqRef = useRef(0)
  const selectionContextRef = useRef<{ periodId: string; contextKey: string | null }>({
    periodId: '',
    contextKey: null,
  })
  const movementChoiceContextRef = useRef<{
    contextKey: string | null
    direction: TaxAccountMovementDirection | null
  }>({
    contextKey: null,
    direction: null,
  })
  const [year, setYear]                     = useState(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [vatPeriods, setVatPeriods]         = useState<VatPeriod[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')
  const [periodsLoading, setPeriodsLoading] = useState(false)
  const [periodError, setPeriodError]       = useState<string | null>(null)
  const [loading, setLoading]               = useState(false)
  const [closing, setClosing]               = useState(false)
  const [declaring, setDeclaring]           = useState(false)
  const [fetched, setFetched]               = useState(false)
  const [vatReport, setVatReport] = useState<VatReportPresentation | null>(null)
  const [reportPeriodId, setReportPeriodId] = useState<string | null>(null)
  const [reportContextKey, setReportContextKey] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reportErrorPeriodId, setReportErrorPeriodId] = useState<string | null>(null)
  const [reportErrorContextKey, setReportErrorContextKey] = useState<string | null>(null)
  const [declarationSubmittedOn, setDeclarationSubmittedOn] = useState(todayIso)
  const [settlementEvents, setSettlementEvents] = useState<TaxAccountEvent[]>([])
  const [settlementEventsPeriodId, setSettlementEventsPeriodId] = useState<string | null>(null)
  const [settlementEventsContextKey, setSettlementEventsContextKey] = useState<string | null>(null)
  const [settlementLoading, setSettlementLoading] = useState(false)
  const [settlementSubmitting, setSettlementSubmitting] = useState(false)
  const [settlementLoadError, setSettlementLoadError] = useState<string | null>(null)
  const [settlementSubmitError, setSettlementSubmitError] = useState<string | null>(null)
  const [settlementEventDate, setSettlementEventDate] = useState(todayIso)
  const [settlementAmountText, setSettlementAmountText] = useState('')
  const [settlementIdempotency, setSettlementIdempotency] =
    useState<VatSettlementIdempotencyState>(EMPTY_SETTLEMENT_IDEMPOTENCY_STATE)
  const [taxAccountMovements, setTaxAccountMovements] = useState<TaxAccountMovement[]>([])
  const [taxAccountMovementsPeriodId, setTaxAccountMovementsPeriodId] = useState<string | null>(null)
  const [taxAccountMovementsContextKey, setTaxAccountMovementsContextKey] = useState<string | null>(null)
  const [movementLoading, setMovementLoading] = useState(false)
  const [movementSubmitting, setMovementSubmitting] = useState(false)
  const [movementLoadError, setMovementLoadError] = useState<string | null>(null)
  const [movementSubmitError, setMovementSubmitError] = useState<string | null>(null)
  const [movementDate, setMovementDate] = useState(todayIso)
  const [movementAmountText, setMovementAmountText] = useState('')
  const [movementChoice, setMovementChoice] =
    useState<TaxAccountMovementChoice>('not_yet')
  const [movementIdempotency, setMovementIdempotency] =
    useState<TaxAccountMovementIdempotencyState>(
      EMPTY_TAX_ACCOUNT_MOVEMENT_IDEMPOTENCY_STATE
    )

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
  const hasCurrentReport =
    Boolean(selectedPeriod) &&
    fetched &&
    !loading &&
    vatReport !== null &&
    reportPeriodId === selectedPeriod?.id &&
    reportContextKey === selectedPeriodContextKey
  const hasCurrentReportError =
    Boolean(selectedPeriod) &&
    !loading &&
    reportError !== null &&
    reportErrorPeriodId === selectedPeriod?.id &&
    reportErrorContextKey === selectedPeriodContextKey
  const hasCurrentSettlementEvents =
    Boolean(selectedPeriod) &&
    settlementEventsPeriodId === selectedPeriod?.id &&
    settlementEventsContextKey === selectedPeriodContextKey
  const hasCurrentTaxAccountMovements =
    Boolean(selectedPeriod) &&
    taxAccountMovementsPeriodId === selectedPeriod?.id &&
    taxAccountMovementsContextKey === selectedPeriodContextKey
  const selectedPeriodIsFuture = selectedPeriod ? selectedPeriod.period_end > todayIso : false
  const lifecycleCanCloseSelectedPeriod =
    Boolean(selectedPeriod) &&
    selectedPeriod?.source === 'sololedger' &&
    selectedPeriod?.status === 'open' &&
    !selectedPeriodIsFuture &&
    vatStatus === 'registered'
  const lifecycleCanDeclareSelectedPeriod =
    Boolean(selectedPeriod) &&
    selectedPeriod?.source === 'sololedger' &&
    selectedPeriod?.status === 'closed'
  const declarationSubmittedOnValue = declarationSubmittedOn
  const declarationSubmittedOnValidation = selectedPeriod
    ? skvSubmittedOnValidationMessage({
        submittedOn: declarationSubmittedOnValue,
        periodEnd: selectedPeriod.period_end,
        todayIso,
      })
    : null
  const declarationSubmittedOnIsValid = selectedPeriod
    ? isValidSkvSubmittedOnDate({
        submittedOn: declarationSubmittedOnValue,
        periodEnd: selectedPeriod.period_end,
        todayIso,
      })
    : false
  const canCloseSelectedPeriod = lifecycleCanCloseSelectedPeriod && hasCurrentReport
  const canDeclareSelectedPeriod =
    lifecycleCanDeclareSelectedPeriod &&
    hasCurrentReport &&
    declarationSubmittedOnIsValid
  const autoLoadCurrentReport = shouldAutoLoadVatReport({
    selectedPeriod,
    hasCurrentReport,
    hasCurrentReportError,
    loading,
    periodsLoading,
  })

  useEffect(() => {
    selectionContextRef.current = {
      periodId: selectedPeriodId,
      contextKey: selectedPeriodContextKey,
    }
  }, [selectedPeriodContextKey, selectedPeriodId])

  // Hämtar tillgängliga år en gång vid montering. År som bara finns i
  // vat_periods läggs till av periodladdningen nedan.
  const loadAvailableYears = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const db = supabase as unknown as AvailableYearClient

      const [journalDates, periodData] = await Promise.all([
        fetchAllRows<JournalDateRow>({
          context: 'VAT report available journal years',
          createQuery: () => db
            .from('journal_entries')
            .select('date', { count: 'exact' })
            .eq('user_id', user.id)
            .not('date', 'is', null) as AvailableYearFilterQuery<JournalDateRow>,
        }),
        fetchAllRows<VatPeriodYearRow>({
          context: 'VAT report available VAT period years',
          createQuery: () => db
            .from('vat_periods')
            .select('period_start, period_end', { count: 'exact' })
            .eq('user_id', user.id) as AvailableYearFilterQuery<VatPeriodYearRow>,
        }),
      ])

      const yearsSet = new Set<number>()
      yearsSet.add(currentYear)

      journalDates.forEach(row => {
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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const loadVatPeriods = useCallback(async (
    preferredPeriodId?: string,
    options: { ensure?: boolean; preserveReport?: boolean; preservePeriodsOnError?: boolean } = {}
  ): Promise<VatPeriod[] | null> => {
    const shouldEnsure = options.ensure ?? true
    const preserveReport = options.preserveReport ?? false
    const preservePeriodsOnError = options.preservePeriodsOnError ?? false
    setPeriodsLoading(true)
    setPeriodError(null)
    if (!preserveReport) {
      setFetched(false)
      setVatReport(null)
      setReportPeriodId(null)
      setReportContextKey(null)
      setReportError(null)
      setReportErrorPeriodId(null)
      setReportErrorContextKey(null)
      setSettlementEvents([])
      setSettlementEventsPeriodId(null)
      setSettlementEventsContextKey(null)
      setSettlementLoadError(null)
      setSettlementSubmitError(null)
      setTaxAccountMovements([])
      setTaxAccountMovementsPeriodId(null)
      setTaxAccountMovementsContextKey(null)
      setMovementLoadError(null)
      setMovementSubmitError(null)
    }

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
      if (!preservePeriodsOnError) {
        setVatPeriods([])
        setSelectedPeriodId('')
      }
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

  const reloadDeclaredPeriodMetadata = useCallback(async (
    periodId: string,
    contextAtStart: string | null
  ): Promise<{ periods: VatPeriod[]; refreshedPeriod: VatPeriod } | null> => {
    if (
      selectionContextRef.current.periodId !== periodId ||
      selectionContextRef.current.contextKey !== contextAtStart
    ) {
      return null
    }

    setPeriodsLoading(true)
    setPeriodError(null)

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    try {
      const periods = await getVatPeriods(yearStart, yearEnd)

      if (
        selectionContextRef.current.periodId !== periodId ||
        selectionContextRef.current.contextKey !== contextAtStart
      ) {
        return null
      }

      const refreshedPeriod = periods.find(p => p.id === periodId)
      if (!refreshedPeriod) return null

      setVatPeriods(periods)
      setSelectedPeriodId(current => (
        periods.some(p => p.id === current) ? current : periodId
      ))
      setAvailableYears(current => {
        const periodYears = new Set<number>(current)
        periods.forEach(p => {
          periodYears.add(new Date(p.period_start).getFullYear())
          periodYears.add(new Date(p.period_end).getFullYear())
        })
        return Array.from(periodYears).sort((a, b) => b - a)
      })

      return { periods, refreshedPeriod }
    } catch (err) {
      if (
        selectionContextRef.current.periodId === periodId &&
        selectionContextRef.current.contextKey === contextAtStart
      ) {
        setPeriodError(err instanceof Error ? err.message : String(err))
      }
      return null
    } finally {
      setPeriodsLoading(false)
    }
  }, [year])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAvailableYears()
  }, [loadAvailableYears])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadVatPeriods()
  }, [loadVatPeriods])

  const currentVatReport = hasCurrentReport ? vatReport : null
  const skaBetalas = (currentVatReport?.netVat ?? 0) > 0
  const closingText = selectedPeriod ? closingAmountText(selectedPeriod) : null
  const declarationText = selectedPeriod ? declaredAtText(selectedPeriod) : null
  const declarationAuditText = selectedPeriod ? soloLedgerDeclarationAuditText(selectedPeriod) : null
  const settlementReadModel = deriveVatSettlementReadModel(
    selectedPeriod,
    hasCurrentSettlementEvents ? settlementEvents : []
  )
  const taxAccountMovementReadModel = deriveTaxAccountMovementReadModel(
    selectedPeriod,
    hasCurrentTaxAccountMovements ? taxAccountMovements : []
  )
  const selectedMovementKind = taxAccountMovementKindForChoice(
    taxAccountMovementReadModel.direction,
    movementChoice
  )
  const settlementValidation = validateVatSettlementInput({
    eventDate: settlementEventDate,
    amountText: settlementAmountText,
    todayIso,
    remainingAmount: settlementReadModel.remainingAmount,
  })
  const canSubmitSettlement =
    settlementReadModel.actionable &&
    settlementReadModel.state !== 'fully_settled' &&
    hasCurrentSettlementEvents &&
    !settlementLoading &&
    !settlementSubmitting &&
    !settlementLoadError &&
    settlementValidation.ok
  const movementValidation = validateTaxAccountMovementInput({
    movementDate,
    amountText: movementAmountText,
    todayIso,
    remainingAmount: taxAccountMovementReadModel.remainingAmount,
  })
  const canSubmitTaxAccountMovement =
    taxAccountMovementReadModel.actionable &&
    taxAccountMovementReadModel.state !== 'fully_moved' &&
    selectedMovementKind !== null &&
    hasCurrentTaxAccountMovements &&
    !movementLoading &&
    !movementSubmitting &&
    !movementLoadError &&
    movementValidation.ok

  // Beräkna moms för vald DB-verifierad momsperiod via den auktoritativa
  // rapporttjänsten. Komponenten presenterar bara färdiga SKV-fält.
  async function fetchMomsForPeriod(periodForFetch: VatPeriod, contextForFetch: string) {
    const requestSeq = reportRequestSeqRef.current + 1
    reportRequestSeqRef.current = requestSeq
    setLoading(true)
    setFetched(false)
    setVatReport(null)
    setReportPeriodId(null)
    setReportContextKey(null)
    setReportError(null)
    setReportErrorPeriodId(null)
    setReportErrorContextKey(null)
    try {
      const result = await getVatReportForPeriod(
        periodForFetch.period_start,
        periodForFetch.period_end
      )

      if (
        reportRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return
      }

      if (result.status === 'blocked') {
        console.error('Momsrapporten kunde inte beräknas säkert:', result.errors)
        setVatReport(null)
        setReportError(vatReportBlockedMessage(result.errors))
        setReportErrorPeriodId(periodForFetch.id)
        setReportErrorContextKey(contextForFetch)
        setFetched(false)
        return
      }

      setVatReport(buildVatReportPresentation(result.report))
      setReportPeriodId(periodForFetch.id)
      setReportContextKey(contextForFetch)
      setFetched(true)
    } catch (err) {
      if (
        reportRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return
      }

      console.error('Fel vid hämtning av momsrapport:', err)
      setVatReport(null)
      setReportError('Momsrapporten kunde inte hämtas just nu. Inga belopp visas förrän rapporten kan beräknas säkert.')
      setReportErrorPeriodId(periodForFetch.id)
      setReportErrorContextKey(contextForFetch)
      setFetched(false)
    } finally {
      if (reportRequestSeqRef.current === requestSeq) {
        setLoading(false)
      }
    }
  }

  async function fetchMoms() {
    if (!selectedPeriod || !selectedPeriodContextKey) return
    await fetchMomsForPeriod(selectedPeriod, selectedPeriodContextKey)
  }

  async function loadSettlementEventsForPeriod(
    periodForFetch: VatPeriod,
    contextForFetch: string
  ) {
    const requestSeq = settlementRequestSeqRef.current + 1
    settlementRequestSeqRef.current = requestSeq
    setSettlementLoading(true)
    setSettlementLoadError(null)

    try {
      const events = await getTaxAccountEventsForPeriod(periodForFetch.id)

      if (
        settlementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      setSettlementEvents(events)
      setSettlementEventsPeriodId(periodForFetch.id)
      setSettlementEventsContextKey(contextForFetch)
      return events
    } catch (err) {
      if (
        settlementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      console.error('Kunde inte hämta avräkningar från skattekontot:', err)
      setSettlementEvents([])
      setSettlementEventsPeriodId(periodForFetch.id)
      setSettlementEventsContextKey(contextForFetch)
      setSettlementLoadError('Avräkningar från skattekontot kunde inte hämtas just nu.')
      return null
    } finally {
      if (settlementRequestSeqRef.current === requestSeq) {
        setSettlementLoading(false)
      }
    }
  }

  async function loadTaxAccountMovementsForPeriod(
    periodForFetch: VatPeriod,
    contextForFetch: string
  ) {
    const requestSeq = movementRequestSeqRef.current + 1
    movementRequestSeqRef.current = requestSeq
    setMovementLoading(true)
    setMovementLoadError(null)

    try {
      const movements = await getTaxAccountMovementsForPeriod(periodForFetch.id)

      if (
        movementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      setTaxAccountMovements(movements)
      setTaxAccountMovementsPeriodId(periodForFetch.id)
      setTaxAccountMovementsContextKey(contextForFetch)
      return movements
    } catch (err) {
      if (
        movementRequestSeqRef.current !== requestSeq ||
        !isVatReportRequestCurrent(selectionContextRef.current, {
          periodId: periodForFetch.id,
          contextKey: contextForFetch,
        })
      ) {
        return null
      }

      console.error('Kunde inte hämta överföringar till eller från skattekontot:', err)
      setTaxAccountMovements([])
      setTaxAccountMovementsPeriodId(periodForFetch.id)
      setTaxAccountMovementsContextKey(contextForFetch)
      setMovementLoadError('Överföringar till eller från skattekontot kunde inte hämtas just nu.')
      return null
    } finally {
      if (movementRequestSeqRef.current === requestSeq) {
        setMovementLoading(false)
      }
    }
  }

  function resetSettlementIntent() {
    setSettlementIdempotency(clearSettlementIdempotency())
    clearSettlementIdempotencyStorage(settlementStorage())
  }

  function settlementStorage() {
    return typeof window === 'undefined' ? null : window.sessionStorage
  }

  function movementStorage() {
    return typeof window === 'undefined' ? null : window.sessionStorage
  }

  function resetMovementIntent() {
    setMovementIdempotency(clearTaxAccountMovementIdempotency())
    clearTaxAccountMovementIdempotencyStorage(movementStorage())
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

  function declareErrorMessage(message: string) {
    if (message.includes('Importerad historik') || message.includes('Endast SoloLedger') || message.includes('source')) {
      return 'Importerad momshistorik kan inte markeras som deklarerad i SoloLedgers deklarationsflöde.'
    }
    if (message.includes('måste vara stängd') || message.includes('status') || message.includes('closed')) {
      return 'Endast stängda SoloLedger-momsperioder kan markeras som deklarerade.'
    }
    if (message.includes('hittades inte') || message.includes('tillhör inte dig') || message.includes('not found')) {
      return 'Momsperioden kunde inte hittas för ditt konto.'
    }
    if (message.includes('framtiden') || message.includes('future')) {
      return 'Datumet för inlämning kan inte vara i framtiden.'
    }
    if (message.includes('periodens slut') || message.includes('period_end')) {
      return 'Datumet för inlämning kan inte vara före momsperiodens slut.'
    }
    if (message.includes('annat inlämningsdatum') || message.includes('redan deklarerad')) {
      return 'Momsperioden är redan bekräftad med ett annat inlämningsdatum. Ändring behöver hanteras separat.'
    }
    return 'Momsperioden kunde inte markeras som deklarerad. Kontrollera perioden och försök igen.'
  }

  function declareSuccessMessage(result: DeclareVatPeriodResult) {
    if (result.already_declared) {
      return 'Momsdeklarationen var redan bekräftad i SoloLedger.'
    }
    return 'Inlämnad momsdeklaration bekräftades i SoloLedger.'
  }

  async function handleRecordSettlement() {
    if (!canStartVatSettlementSubmit({
      hasSelectedPeriod: Boolean(selectedPeriod),
      hasSelectedContext: Boolean(selectedPeriodContextKey),
      canSubmitSettlement,
      amount: settlementValidation.amount,
      inFlight: settlementInFlightRef.current,
    })) {
      return
    }

    if (!selectedPeriod || !selectedPeriodContextKey || !settlementValidation.amount) return

    const direction = settlementReadModel.direction
    if (!direction) return

    const amount = settlementValidation.amount
    const confirmed = window.confirm(
      `${settlementActionLabel(direction)}?\n\n` +
      `Datum på skattekontot: ${fmtDate(settlementEventDate)}\n` +
      `Belopp: ${fmt(amount)} kr\n\n` +
      'Detta registrerar händelsen som visas på ditt skattekonto hos Skatteverket. En banköverföring hanteras inte här.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    const contextAtStart = selectedPeriodContextKey
    const intent = {
      periodId,
      eventDate: settlementEventDate,
      amount,
    }
    const storedIdempotency =
      readSettlementIdempotencyFromStorage(settlementStorage())
    const seedIdempotency =
      settlementIdempotency.key ? settlementIdempotency : storedIdempotency
    const prepared = prepareSettlementIdempotencyKey(
      seedIdempotency,
      intent,
      () => crypto.randomUUID()
    )

    setSettlementIdempotency(prepared.state)
    writeSettlementIdempotencyToStorage(settlementStorage(), prepared.state)
    settlementInFlightRef.current = true
    setSettlementSubmitting(true)
    setSettlementSubmitError(null)

    try {
      const result = await recordVatSettlement(
        periodId,
        settlementEventDate,
        amount,
        prepared.key
      )
      const centralRefreshResult = await onBookkeepingRefresh?.()
      const centralRefreshFailed = centralRefreshResult?.ok === false

      if (
        !isVatSettlementSubmitContextCurrent(selectionContextRef.current, {
          periodId,
          contextKey: contextAtStart,
        })
      ) {
        return
      }

      const metadataRefresh = await reloadDeclaredPeriodMetadata(
        periodId,
        contextAtStart
      )
      if (!metadataRefresh) return

      await loadSettlementEventsForPeriod(
        metadataRefresh.refreshedPeriod,
        contextAtStart
      )
      await fetchMomsForPeriod(metadataRefresh.refreshedPeriod, contextAtStart)
      setSettlementAmountText('')
      resetSettlementIntent()

      const refreshWarning = centralRefreshFailed
        ? '\n\nAvräkningen registrerades, men delar av bokföringsvyn kunde inte uppdateras automatiskt. Ladda om sidan om verifikationen inte syns.'
        : ''
      const replayText = result.idempotent_replay
        ? 'Avräkningen var redan registrerad och visades igen.'
        : result.ver_nr
        ? `Avräkningen registrerades som VER-${result.ver_nr}.`
        : 'Avräkningen registrerades.'

      alert(replayText + refreshWarning)
    } catch (err) {
      const kind = vatSettlementSubmissionFailureKind(err)
      if (kind === 'authoritative_rejection') {
        resetSettlementIntent()
      }
      setSettlementSubmitError(vatSettlementSubmissionErrorMessage(kind))
    } finally {
      settlementInFlightRef.current = false
      setSettlementSubmitting(false)
    }
  }

  async function handleRecordTaxAccountMovement() {
    if (!canStartTaxAccountMovementSubmit({
      hasSelectedPeriod: Boolean(selectedPeriod),
      hasSelectedContext: Boolean(selectedPeriodContextKey),
      canSubmitMovement: canSubmitTaxAccountMovement,
      amount: movementValidation.amount,
      movementKind: selectedMovementKind,
      inFlight: movementInFlightRef.current,
    })) {
      return
    }

    if (
      !selectedPeriod ||
      !selectedPeriodContextKey ||
      !movementValidation.amount ||
      !selectedMovementKind
    ) {
      return
    }

    const amount = movementValidation.amount
    const confirmed = window.confirm(
      `${taxAccountMovementActionLabel(selectedMovementKind)}?\n\n` +
      `Datum: ${fmtDate(movementDate)}\n` +
      `Belopp: ${fmt(amount)} kr\n\n` +
      'Detta kopplar pengaflytten till den valda momsperiodens momsbelopp. Om överföringen också gäller andra skatter ska du inte registrera hela beloppet här utan tydligt underlag.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    const contextAtStart = selectedPeriodContextKey
    const intent = {
      periodId,
      movementKind: selectedMovementKind,
      movementDate,
      amount,
    }
    const storedIdempotency =
      readTaxAccountMovementIdempotencyFromStorage(movementStorage())
    const seedIdempotency =
      movementIdempotency.key ? movementIdempotency : storedIdempotency
    const prepared = prepareTaxAccountMovementIdempotencyKey(
      seedIdempotency,
      intent,
      () => crypto.randomUUID()
    )

    setMovementIdempotency(prepared.state)
    writeTaxAccountMovementIdempotencyToStorage(movementStorage(), prepared.state)
    movementInFlightRef.current = true
    setMovementSubmitting(true)
    setMovementSubmitError(null)

    try {
      const result = await recordTaxAccountMovement(
        selectedMovementKind,
        movementDate,
        amount,
        periodId,
        prepared.key
      )
      const centralRefreshResult = await onBookkeepingRefresh?.()
      const centralRefreshFailed = centralRefreshResult?.ok === false

      if (
        !isTaxAccountMovementSubmitContextCurrent(selectionContextRef.current, {
          periodId,
          contextKey: contextAtStart,
        })
      ) {
        return
      }

      const metadataRefresh = await reloadDeclaredPeriodMetadata(
        periodId,
        contextAtStart
      )
      if (!metadataRefresh) return

      await loadTaxAccountMovementsForPeriod(
        metadataRefresh.refreshedPeriod,
        contextAtStart
      )
      await fetchMomsForPeriod(metadataRefresh.refreshedPeriod, contextAtStart)
      setMovementAmountText('')
      resetMovementIntent()

      const refreshWarning = centralRefreshFailed
        ? '\n\nÖverföringen registrerades, men delar av bokföringsvyn kunde inte uppdateras automatiskt. Ladda om sidan om verifikationen inte syns.'
        : ''
      const replayText = result.idempotent_replay
        ? 'Överföringen var redan registrerad och visades igen.'
        : result.ver_nr
        ? `Överföringen registrerades som VER-${result.ver_nr}.`
        : 'Överföringen registrerades.'

      alert(replayText + refreshWarning)
    } catch (err) {
      const kind = taxAccountMovementSubmissionFailureKind(err)
      if (kind === 'authoritative_rejection') {
        resetMovementIntent()
      }
      setMovementSubmitError(taxAccountMovementSubmissionErrorMessage(err))
    } finally {
      movementInFlightRef.current = false
      setMovementSubmitting(false)
    }
  }

  async function handleClosePeriod() {
    if (!selectedPeriod || !canCloseSelectedPeriod || closeInFlightRef.current || declareInFlightRef.current) return

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

  async function handleDeclarePeriod() {
    if (!selectedPeriod || !canDeclareSelectedPeriod || declareInFlightRef.current || closeInFlightRef.current) return

    const confirmed = window.confirm(
      `${CONFIRM_DECLARATION_BUTTON_LABEL}?\n\n` +
      `${DECLARATION_DOES_NOT_SUBMIT_COPY}\n\n` +
      `${DECLARATION_ALREADY_SUBMITTED_COPY}\n\n` +
      `${DECLARATION_SUBMITTED_ON_LABEL}: ${fmtDate(declarationSubmittedOnValue)}\n` +
      `Period: ${periodLabel(selectedPeriod)}\n\n` +
      'Detta registrerar deklarationen i SoloLedger. Ingen ny bokföringsverifikation eller betalning skapas.'
    )
    if (!confirmed) return

    const periodId = selectedPeriod.id
    const contextAtStart = selectedPeriodContextKey
    declareInFlightRef.current = true
    setDeclaring(true)
    setPeriodError(null)

    try {
      const result = await declareVatPeriod(periodId, declarationSubmittedOnValue)
      const refreshResult = await reloadDeclaredPeriodMetadata(periodId, contextAtStart)
      const periodRefreshFailed = !refreshResult
      const contextStillCurrent =
        selectionContextRef.current.periodId === periodId &&
        selectionContextRef.current.contextKey === contextAtStart

      const refreshWarning = periodRefreshFailed
        ? '\n\nMomsperioden markerades som deklarerad, men vyn kunde inte uppdateras automatiskt. Ladda om sidan för att se aktuell status.'
        : ''

      alert(declareSuccessMessage(result) + refreshWarning)

      if (refreshResult && contextStillCurrent && reportPeriodId === periodId) {
        setReportContextKey(contextAtStart)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      alert(declareErrorMessage(message))
    } finally {
      declareInFlightRef.current = false
      setDeclaring(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fetched && selectedPeriod) fetchMoms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriodId])

  useEffect(() => {
    if (!autoLoadCurrentReport || !selectedPeriod || !selectedPeriodContextKey) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMomsForPeriod(selectedPeriod, selectedPeriodContextKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoadCurrentReport, selectedPeriodId, selectedPeriodContextKey])

  useEffect(() => {
    if (!selectedPeriod || !selectedPeriodContextKey) return
    if (!settlementReadModel.actionable) return
    if (hasCurrentSettlementEvents || settlementLoading) return
    if (settlementLoadError) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettlementEventsForPeriod(selectedPeriod, selectedPeriodContextKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasCurrentSettlementEvents,
    selectedPeriodId,
    selectedPeriodContextKey,
    settlementLoading,
    settlementLoadError,
    settlementReadModel.actionable,
  ])

  useEffect(() => {
    if (!selectedPeriod || !selectedPeriodContextKey) return
    if (!taxAccountMovementReadModel.actionable) return
    if (hasCurrentTaxAccountMovements || movementLoading) return
    if (movementLoadError) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTaxAccountMovementsForPeriod(selectedPeriod, selectedPeriodContextKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasCurrentTaxAccountMovements,
    movementLoadError,
    movementLoading,
    selectedPeriodId,
    selectedPeriodContextKey,
    taxAccountMovementReadModel.actionable,
  ])

  useEffect(() => {
    const previous = movementChoiceContextRef.current
    const nextContext = selectedPeriodContextKey
    const nextDirection = taxAccountMovementReadModel.direction
    movementChoiceContextRef.current = {
      contextKey: nextContext,
      direction: nextDirection,
    }
    setMovementChoice(currentChoice =>
      nextTaxAccountMovementChoiceForContext({
        currentChoice,
        previousContextKey: previous.contextKey,
        nextContextKey: nextContext,
        previousDirection: previous.direction,
        nextDirection,
      })
    )
  }, [selectedPeriodContextKey, taxAccountMovementReadModel.direction])

  function handleYearChange(nextYear: number) {
    setFetched(false)
    setVatReport(null)
    setReportPeriodId(null)
    setReportContextKey(null)
    setReportError(null)
    setReportErrorPeriodId(null)
    setReportErrorContextKey(null)
    setSettlementEvents([])
    setSettlementEventsPeriodId(null)
    setSettlementEventsContextKey(null)
    setSettlementLoadError(null)
    setSettlementSubmitError(null)
    setSettlementAmountText('')
    resetSettlementIntent()
    setTaxAccountMovements([])
    setTaxAccountMovementsPeriodId(null)
    setTaxAccountMovementsContextKey(null)
    setMovementLoadError(null)
    setMovementSubmitError(null)
    setMovementAmountText('')
    resetMovementIntent()
    setYear(nextYear)
  }

  function handlePeriodChange(nextPeriodId: string) {
    setFetched(false)
    setVatReport(null)
    setReportPeriodId(null)
    setReportContextKey(null)
    setReportError(null)
    setReportErrorPeriodId(null)
    setReportErrorContextKey(null)
    setSettlementEvents([])
    setSettlementEventsPeriodId(null)
    setSettlementEventsContextKey(null)
    setSettlementLoadError(null)
    setSettlementSubmitError(null)
    setSettlementAmountText('')
    resetSettlementIntent()
    setTaxAccountMovements([])
    setTaxAccountMovementsPeriodId(null)
    setTaxAccountMovementsContextKey(null)
    setMovementLoadError(null)
    setMovementSubmitError(null)
    setMovementAmountText('')
    resetMovementIntent()
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
              disabled={closing || declaring}
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
              disabled={periodsLoading || closing || declaring || vatPeriods.length === 0}
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
            disabled={loading || periodsLoading || closing || declaring || !selectedPeriod}
            className="h-[42px] px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
          >
            {loading ? '...' : 'Beräkna'}
          </button>

          {lifecycleCanCloseSelectedPeriod && (
            <button
              onClick={handleClosePeriod}
              disabled={closing || declaring || periodsLoading || loading || !canCloseSelectedPeriod}
              className="h-[42px] px-6 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
            >
              {closing ? 'Stänger...' : 'Stäng momsperiod'}
            </button>
          )}

          {lifecycleCanDeclareSelectedPeriod && (
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                {DECLARATION_SUBMITTED_ON_LABEL}
              </label>
              <input
                type="date"
                value={declarationSubmittedOnValue}
                min={selectedPeriod?.period_end}
                max={todayIso}
                onChange={e => setDeclarationSubmittedOn(e.target.value)}
                disabled={declaring || closing || periodsLoading || loading}
                className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-sky-300 disabled:text-gray-300 disabled:cursor-not-allowed"
              />
            </div>
          )}

          {lifecycleCanDeclareSelectedPeriod && (
            <button
              onClick={handleDeclarePeriod}
              disabled={declaring || closing || periodsLoading || loading || !canDeclareSelectedPeriod}
              className="h-[42px] px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
            >
              {declaring ? 'Bekräftar...' : CONFIRM_DECLARATION_BUTTON_LABEL}
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
            {declarationText && (
              <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg border border-sky-100 bg-sky-50 text-sky-600">
                {declarationText}
              </span>
            )}
            {declarationAuditText && (
              <span className="text-[9px] font-bold text-gray-400">
                {declarationAuditText}
              </span>
            )}
            {selectedPeriod.status !== 'open' && selectedPeriod.closing_transaction_id === null && (
              <span className="text-[9px] font-bold text-gray-400">
                Ingen avslutsverifikation behövdes för perioden.
              </span>
            )}
          </div>
        )}

        {selectedPeriod && selectedPeriod.status === 'closed' && (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">
              Stängd momsperiod
            </p>
            <p className="text-[11px] font-bold text-amber-700 mt-1">
              {VAT_RECLASSIFIED_NOT_SETTLED_COPY}
            </p>
          </div>
        )}

        {selectedPeriod && selectedPeriod.status === 'declared' && (
          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">
              Inlämnad momsdeklaration bekräftad
            </p>
            <p className="text-[11px] font-bold text-sky-700 mt-1">
              {VAT_RECLASSIFIED_NOT_SETTLED_COPY}
            </p>
          </div>
        )}

        {selectedPeriod &&
          taxAccountMovementReadModel.actionable &&
          taxAccountMovementReadModel.direction && (
            <div className="mt-4 rounded-2xl border border-cyan-100 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-cyan-700">
                    Pengar till/från skattekontot
                  </p>
                  <p className="text-sm font-black text-gray-700 mt-1">
                    {taxAccountMovementQuestion(taxAccountMovementReadModel.direction)}
                  </p>
                  <p className="text-[11px] font-bold text-gray-400 mt-1">
                    Detta gäller bara pengaflytten som hör till den valda momsperioden.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-gray-800 tabular-nums whitespace-nowrap">
                    {fmt(taxAccountMovementReadModel.totalAmount)} kr
                  </p>
                  <p className="text-[10px] font-black uppercase text-cyan-600 mt-1">
                    {taxAccountMovementStateText(taxAccountMovementReadModel.state)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Momsbelopp
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(taxAccountMovementReadModel.totalAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Pengar registrerade
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(taxAccountMovementReadModel.registeredAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Kvar att koppla
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(taxAccountMovementReadModel.remainingAmount)} kr
                  </p>
                </div>
              </div>

              {taxAccountMovementReadModel.state !== 'fully_moved' && (
                <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                  <p className="text-xs font-black text-gray-700">
                    {taxAccountMovementQuestion(taxAccountMovementReadModel.direction)}
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {taxAccountMovementReadModel.direction === 'payable' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('business_account')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'business_account'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Från företagets konto
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('owner_private')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'owner_private'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Med privata pengar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('not_yet')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'not_yet'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Inte än
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('unsure')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'unsure'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Osäker
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('tax_account_only')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'tax_account_only'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Kvar på skattekontot
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('business_account')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'business_account'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Till företagets konto
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('owner_private')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'owner_private'
                              ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Uttaget privat
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovementChoice('unsure')
                            setMovementSubmitError(null)
                          }}
                          className={`min-h-[46px] rounded-xl border px-3 py-2 text-left text-[11px] font-black transition-colors ${
                            movementChoice === 'unsure'
                              ? 'border-gray-300 bg-white text-gray-700'
                              : 'border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          Osäker
                        </button>
                      </>
                    )}
                  </div>

                  {(movementChoice === 'unsure' || movementChoice === 'not_yet' || movementChoice === 'tax_account_only') && (
                    <p className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-bold text-gray-500">
                      {movementChoice === 'unsure'
                        ? `${TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY} ${TAX_ACCOUNT_MOVEMENT_UNSURE_COPY}`
                        : 'Ingen bokföring skapas för det här valet.'}
                    </p>
                  )}
                </div>
              )}

              {taxAccountMovementReadModel.state !== 'fully_moved' && selectedMovementKind && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 sm:items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      Datum för överföringen
                    </label>
                    <input
                      type="date"
                      value={movementDate}
                      max={todayIso}
                      onChange={e => {
                        setMovementDate(e.target.value)
                        setMovementSubmitError(null)
                      }}
                      disabled={movementSubmitting || movementLoading}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-cyan-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      {taxAccountMovementAmountLabel(taxAccountMovementReadModel.direction)}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={movementAmountText}
                      onChange={e => {
                        setMovementAmountText(e.target.value)
                        setMovementSubmitError(null)
                      }}
                      disabled={movementSubmitting || movementLoading}
                      placeholder={fmt(taxAccountMovementReadModel.remainingAmount)}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none hover:bg-gray-100 transition-colors border border-transparent focus:border-cyan-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    onClick={handleRecordTaxAccountMovement}
                    disabled={!canSubmitTaxAccountMovement}
                    className="h-[42px] px-6 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
                  >
                    {movementSubmitting
                      ? 'Registrerar...'
                      : taxAccountMovementActionLabel(selectedMovementKind)}
                  </button>
                </div>
              )}

              {taxAccountMovementReadModel.state !== 'fully_moved' &&
                selectedMovementKind &&
                movementAmountText &&
                !movementValidation.ok && (
                  <p className="mt-3 text-[10px] font-bold text-red-500">
                    {movementValidation.message}
                  </p>
                )}

              {(movementLoadError || movementSubmitError) && (
                <p className="mt-3 text-[10px] font-bold text-red-500">
                  {movementLoadError || movementSubmitError}
                </p>
              )}

              <details className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-bold text-gray-500">
                <summary className="cursor-pointer text-cyan-700">
                  När ska jag använda detta?
                </summary>
                <p className="mt-2">
                  Använd det bara när du tydligt vet vilken del av överföringen som hör till momsen för den valda perioden. {TAX_ACCOUNT_MOVEMENT_MIXED_TRANSFER_COPY} {TAX_ACCOUNT_MOVEMENT_UNSURE_COPY}
                </p>
              </details>

              <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                  Historik
                </p>
                {movementLoading && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Hämtar överföringar...
                  </p>
                )}
                {!movementLoading && taxAccountMovementReadModel.movements.length === 0 && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Ingen pengaflytt registrerad för den här momsperioden.
                  </p>
                )}
                {!movementLoading && taxAccountMovementReadModel.movements.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {taxAccountMovementReadModel.movements.map(movement => (
                      <div
                        key={movement.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-[10px] font-black text-gray-700">
                            {fmtDate(movement.movement_date)}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400">
                            {taxAccountMovementHistoryText(movement.movement_kind)}
                          </p>
                        </div>
                        <p className="text-sm font-black text-gray-700 tabular-nums">
                          {fmt(movement.amount)} kr
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        {selectedPeriod &&
          selectedPeriod.status === 'declared' &&
          settlementReadModel.actionable &&
          settlementReadModel.direction && (
            <div className="mt-4 rounded-2xl border border-sky-100 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">
                    Avräkning på skattekontot
                  </p>
                  <p className="text-sm font-black text-gray-700 mt-1">
                    {payableOrRefundHeading(settlementReadModel.direction)}
                  </p>
                  <p className="text-[11px] font-bold text-gray-400 mt-1">
                    Den här statusen gäller bara momshändelsen på skattekontot.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-gray-800 tabular-nums whitespace-nowrap">
                    {fmt(settlementReadModel.totalAmount)} kr
                  </p>
                  <p className="text-[10px] font-black uppercase text-sky-600 mt-1">
                    {settlementStateText(settlementReadModel.state)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    {payableOrRefundHeading(settlementReadModel.direction)}
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(settlementReadModel.totalAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Registrerat på skattekontot
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(settlementReadModel.registeredAmount)} kr
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl px-3 py-2">
                  <p className="text-[8px] font-black uppercase text-gray-400">
                    Kvar att registrera
                  </p>
                  <p className="text-sm font-black text-gray-700 tabular-nums">
                    {fmt(settlementReadModel.remainingAmount)} kr
                  </p>
                </div>
              </div>

              {settlementReadModel.legacyMissingDeclarationDate && (
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
                  Deklarationsdatum saknas för den här äldre perioden, men avräkning kan registreras om händelsen syns på skattekontot.
                </p>
              )}

              <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-700">
                  {settlementQuestion(settlementReadModel.direction)}
                </p>
                <p className="text-[10px] font-bold text-gray-400 mt-1">
                  Använd datumet och beloppet som visas på ditt skattekonto hos Skatteverket.
                </p>
                <details className="mt-2 text-[10px] font-bold text-gray-400">
                  <summary className="cursor-pointer text-sky-600">
                    Var hittar jag detta?
                  </summary>
                  <p className="mt-1">
                    Logga in hos Skatteverket och titta på händelsen på skattekontot. En banköverföring till Skatteverket är en separat händelse och betyder inte i sig att momsen har dragits eller krediterats på skattekontot.
                  </p>
                </details>
              </div>

              {settlementReadModel.state !== 'fully_settled' && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 sm:items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      Datum på skattekontot
                    </label>
                    <input
                      type="date"
                      value={settlementEventDate}
                      max={todayIso}
                      onChange={e => {
                        setSettlementEventDate(e.target.value)
                        setSettlementSubmitError(null)
                        resetSettlementIntent()
                      }}
                      disabled={settlementSubmitting || settlementLoading}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none cursor-pointer hover:bg-gray-100 transition-colors border border-transparent focus:border-sky-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-1">
                      {settlementAmountLabel(settlementReadModel.direction)}
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={settlementAmountText}
                      onChange={e => {
                        setSettlementAmountText(e.target.value)
                        setSettlementSubmitError(null)
                        resetSettlementIntent()
                      }}
                      disabled={settlementSubmitting || settlementLoading}
                      placeholder={fmt(settlementReadModel.remainingAmount)}
                      className="h-[42px] bg-gray-50 rounded-xl px-4 py-2.5 font-black text-sm text-gray-700 outline-none hover:bg-gray-100 transition-colors border border-transparent focus:border-sky-300 disabled:text-gray-300 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    onClick={handleRecordSettlement}
                    disabled={!canSubmitSettlement}
                    className="h-[42px] px-6 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md disabled:bg-gray-300 w-full sm:w-auto"
                  >
                    {settlementSubmitting
                      ? 'Registrerar...'
                      : settlementActionLabel(settlementReadModel.direction)}
                  </button>
                </div>
              )}

              {settlementReadModel.state !== 'fully_settled' &&
                settlementAmountText &&
                !settlementValidation.ok && (
                  <p className="mt-3 text-[10px] font-bold text-red-500">
                    {settlementValidation.message}
                  </p>
                )}

              {(settlementLoadError || settlementSubmitError) && (
                <p className="mt-3 text-[10px] font-bold text-red-500">
                  {settlementLoadError || settlementSubmitError}
                </p>
              )}

              <div className="mt-4 border-t border-dashed border-gray-100 pt-4">
                <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">
                  Historik
                </p>
                {settlementLoading && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Hämtar avräkningar...
                  </p>
                )}
                {!settlementLoading && settlementReadModel.events.length === 0 && (
                  <p className="mt-2 text-[10px] font-bold text-gray-400">
                    Inget registrerat på skattekontot än.
                  </p>
                )}
                {!settlementLoading && settlementReadModel.events.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {settlementReadModel.events.map(event => (
                      <div
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-[10px] font-black text-gray-700">
                            {fmtDate(event.event_date)}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400">
                            {settlementEventText(event.event_kind)}
                          </p>
                        </div>
                        <p className="text-sm font-black text-gray-700 tabular-nums">
                          {fmt(event.amount)} kr
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

        {periodError && (
          <p className="mt-4 text-[10px] font-bold text-red-500">
            {periodError}
          </p>
        )}

        {!periodError && (lifecycleCanCloseSelectedPeriod || lifecycleCanDeclareSelectedPeriod) && !hasCurrentReport && !loading && (
          <p className="mt-4 text-[10px] font-bold text-gray-400">
            Beräkna aktuell momsrapport innan perioden kan stängas eller deklarationen kan bekräftas.
          </p>
        )}

        {!periodError && lifecycleCanDeclareSelectedPeriod && hasCurrentReport && !declarationSubmittedOnIsValid && (
          <p className="mt-4 text-[10px] font-bold text-red-500">
            {declarationSubmittedOnValidation}
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
      {currentVatReport && selectedPeriod && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest px-1">
            {periodLabel(selectedPeriod)} / {statusLabel(selectedPeriod.status)} / {sourceLabel(selectedPeriod.source)}
          </p>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 05</p>
                <p className="text-xs font-black uppercase text-gray-600">{currentVatReport.domesticSalesRows[0].label}</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">
                  {currentVatReport.domesticSalesRows[0].description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-gray-700 tabular-nums whitespace-nowrap">
                  {fmt(currentVatReport.domesticSalesBase)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Exkl. moms</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5 pt-4 border-t border-dashed border-gray-100">
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">25 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(currentVatReport.domesticSalesBase25)} kr</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">12 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(currentVatReport.domesticSalesBase12)} kr</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-3 py-2">
                <p className="text-[8px] font-black uppercase text-gray-400">6 % underlag</p>
                <p className="text-sm font-black text-gray-600 tabular-nums">{fmt(currentVatReport.domesticSalesBase6)} kr</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="mb-4">
              <p className="text-xs font-black uppercase text-gray-600">Utgående moms på svensk försäljning</p>
              <p className="text-[9px] text-gray-400 font-medium mt-1">
                Fördelad enligt momssats
              </p>
            </div>

            <div className="space-y-3">
              {currentVatReport.ordinaryOutputRows.map((row, index) => (
                <div
                  key={row.field}
                  className={`flex items-center justify-between gap-3 ${index === currentVatReport.ordinaryOutputRows.length - 1 ? '' : 'border-b border-gray-100 pb-3'}`}
                >
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ruta {row.field}</p>
                    <p className="text-xs font-black uppercase text-gray-600">{row.label}</p>
                  </div>
                  <p className="text-xl font-black text-red-500 tabular-nums whitespace-nowrap">
                    {fmt(row.amount)} kr
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="mb-4">
              <p className="text-xs font-black uppercase text-gray-600">Inköp från andra EU-länder</p>
              <p className="text-[9px] text-gray-400 font-medium mt-1">
                Inköp där du själv redovisar svensk moms
              </p>
            </div>
            <div className="space-y-3">
              {currentVatReport.euPurchaseRows.map((row, index) => (
                <div
                  key={row.field}
                  className={`flex items-center justify-between gap-3 ${index === currentVatReport.euPurchaseRows.length - 1 ? '' : 'border-b border-gray-100 pb-3'}`}
                >
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ruta {row.field}</p>
                    <p className="text-xs font-black uppercase text-gray-600">{row.label}</p>
                  </div>
                  <p className={`text-xl font-black tabular-nums whitespace-nowrap ${row.field === '30' ? 'text-red-500' : 'text-gray-700'}`}>
                    {fmt(row.amount)} kr
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Ruta 48</p>
                <p className="text-xs font-black uppercase text-gray-600">{currentVatReport.inputRows[0].label}</p>
                <p className="text-[9px] text-gray-400 font-medium mt-1">Samlad avdragsgill ingående moms</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-emerald-600 tabular-nums whitespace-nowrap">
                  {fmt(currentVatReport.deductibleInputVat)} kr
                </p>
                <p className="text-[9px] font-bold text-gray-300 uppercase mt-0.5">Avdrag</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-2">
            <div className="flex-1 border-t border-dashed border-gray-200" />
            <p className="text-[9px] font-black uppercase text-gray-300 tracking-widest whitespace-nowrap">
              {fmt(currentVatReport.totalOutputVat)} - {fmt(currentVatReport.deductibleInputVat)}
            </p>
            <div className="flex-1 border-t border-dashed border-gray-200" />
          </div>

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
                  {currentVatReport.netRows[0].label}
                </p>
                <p className={`text-[9px] font-medium mt-1 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  {skaBetalas
                    ? 'Ska betalas till Skatteverket'
                    : 'Återbetalas från Skatteverket'}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-black italic tabular-nums whitespace-nowrap ${skaBetalas ? 'text-red-500' : 'text-emerald-600'}`}>
                  {skaBetalas ? '' : '+'}{fmt(Math.abs(currentVatReport.netVat))} kr
                </p>
                <p className={`text-[10px] font-black uppercase mt-1 ${skaBetalas ? 'text-red-400' : 'text-emerald-500'}`}>
                  {skaBetalas ? 'Skuld' : 'Fordran'}
                </p>
              </div>
            </div>
          </div>

          <p className="text-[9px] text-gray-300 font-bold text-center px-4 pb-2">
            Beloppen är beräknade ur bokförda verifikationer, exklusive interna momsombokningar. Kontrollera alltid mot Skatteverkets e-tjänst innan inlämning.
          </p>
        </div>
      )}

      {hasCurrentReportError && (
        <div className="rounded-[2rem] border border-red-100 bg-red-50 p-5 sm:p-7 text-red-700">
          <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-2">Momsrapport stoppad</p>
          <p className="text-sm font-black">
            {reportError}
          </p>
          <p className="text-[10px] font-bold text-red-400 mt-2">
            Inga rapportbelopp visas för den valda perioden förrän underlaget kan kontrolleras säkert.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!currentVatReport && !hasCurrentReportError && !loading && (
        <div className="text-center py-16 text-gray-300">
          <p className="text-4xl mb-3">Moms</p>
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
