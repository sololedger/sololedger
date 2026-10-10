import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getAccountBalances, getBalanceSheetBalances, getNEData, isYearClosed } from '@/lib/accountingService'
import { setupDefaultAccounts } from '@/lib/setupDefaultAccounts'
import { getDashboardVatBreakdown } from '@/lib/dashboardVat'
import {
  loadCompleteTransactionHistory,
  transactionHistoryErrorMessage,
  type TransactionHistorySupabaseClient,
} from '@/lib/transactionHistoryLoader'
import {
  beginTransactionHistoryLoad,
  completeTransactionHistoryLoad,
  createInitialTransactionHistoryState,
  failTransactionHistoryLoad,
  getVisibleTransactionHistory,
  isCurrentTransactionHistoryLoad,
  isTransactionHistoryCompleteForYear,
  isTransactionHistoryLoadingForYear,
  transactionHistoryErrorForYear,
} from '@/lib/transactionHistoryState'

// Sorterar transaktioner: nyaste datum överst, och vid samma datum
// nyaste ver_nr överst (annars saknas sekundärsortering helt och
// Supabase/Postgres returnerar likadana datum i en godtycklig — och
// därför skenbart "slumpad" — ordning).
function sortTransactionsByDateAndVer(transactions: any[], jMap: any) {
  return [...transactions].sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime()
    if (dateDiff !== 0) return dateDiff
    const verA = jMap[a.id]?.[0]?.ver_nr ?? 0
    const verB = jMap[b.id]?.[0]?.ver_nr ?? 0
    return verB - verA
  })
}

export type AccountingRefreshResult =
  | { ok: true }
  | { ok: false; reason: 'error' | 'stale_year' | 'stale_load'; error?: unknown }

// Äger laddning av: transactions, balances, neData, journalMap, kontoplan, isYearLocked.
export function useAccountingData(user: any, selectedYear: number, subscriptionType: string | undefined) {
  const [dataLoading, setDataLoading] = useState(false)
  const [isYearLocked, setIsYearLocked] = useState(false)
  const [storedTransactions, setStoredTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any>({})
  const [balanceSheetBalances, setBalanceSheetBalances] = useState<any>({})
  const [neData, setNeData] = useState<any>(null)
  const [storedJournalMap, setStoredJournalMap] = useState<any>({})
  const [transactionHistoryState, setTransactionHistoryState] = useState(createInitialTransactionHistoryState)
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [kontoplanLoading, setKontoplanLoading] = useState(false)
  const [kontoplanLoaded, setKontoplanLoaded] = useState(false)
  const [kontoplanError, setKontoplanError] = useState<string | null>(null)
  const [momsBreakdown, setMomsBreakdown] = useState({ utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

  // Håller alltid det SENAST valda året, oavsett hur gammal closure ett
  // pågående async-anrop (load() eller refreshData()) bär med sig. Sätts
  // vid varje render - en vanlig variabel/closure hade istället frusit
  // vid det ögonblick funktionen skapades, vilket är precis det som
  // orsakade stale-data-buggen (år 2028:s svar skrev över 2027:s state).
  const latestYearRef = useRef(selectedYear)
  latestYearRef.current = selectedYear
  const kontoplanLoadSeqRef = useRef(0)
  const transactionHistoryLoadSeqRef = useRef(0)

  const transactionHistoryComplete = isTransactionHistoryCompleteForYear(transactionHistoryState, selectedYear)
  const transactionHistoryLoading = isTransactionHistoryLoadingForYear(transactionHistoryState, selectedYear)
  const transactionHistoryError = transactionHistoryErrorForYear(transactionHistoryState, selectedYear)
  const {
    transactions,
    journalMap,
  } = getVisibleTransactionHistory({
    state: transactionHistoryState,
    selectedYear,
    transactions: storedTransactions,
    journalMap: storedJournalMap,
    emptyJournalMap: {},
  })

  function transactionHistoryLoadIsCurrent(marker: { year: number; sequence: number }) {
    return isCurrentTransactionHistoryLoad({
      marker,
      latestYear: latestYearRef.current,
      latestSequence: transactionHistoryLoadSeqRef.current,
    })
  }

  function startTransactionHistoryLoad(year: number) {
    const { marker, state } = beginTransactionHistoryLoad(transactionHistoryLoadSeqRef.current, year)
    transactionHistoryLoadSeqRef.current = marker.sequence
    setTransactionHistoryState(state)
    return marker
  }

  async function loadTransactionHistoryForYear(
    year: number,
    startDate: string,
    endDate: string,
    marker = startTransactionHistoryLoad(year)
  ): Promise<AccountingRefreshResult> {
    try {
      const historyData = await loadCompleteTransactionHistory({
        client: supabase as unknown as TransactionHistorySupabaseClient,
        userId: user.id,
        startDate,
        endDate,
      })

      if (!transactionHistoryLoadIsCurrent(marker)) {
        return { ok: false, reason: 'stale_year' }
      }

      setStoredTransactions(sortTransactionsByDateAndVer(historyData.transactions, historyData.journalMap))
      setStoredJournalMap(historyData.journalMap)
      setTransactionHistoryState(completeTransactionHistoryLoad(marker))
      return { ok: true }
    } catch (err) {
      if (!transactionHistoryLoadIsCurrent(marker)) {
        return { ok: false, reason: 'stale_year' }
      }

      setStoredTransactions([])
      setStoredJournalMap({})
      setTransactionHistoryState(failTransactionHistoryLoad(marker, transactionHistoryErrorMessage(err)))
      return { ok: false, reason: 'error', error: err }
    }
  }

  async function loadSupportingAccountingData(year: number, startDate: string, endDate: string) {
    const [balanceData, balanceSheetData, neRes, momsRes] = await Promise.all([
      getAccountBalances(year),
      getBalanceSheetBalances(year),
      getNEData(year),
      getDashboardVatBreakdown(startDate, endDate)
    ])

    return { balanceData, balanceSheetData, neRes, momsRes }
  }

  async function loadKontoplanOptionsInternal(): Promise<AccountingRefreshResult> {
    const userId = user?.id
    const loadSeq = ++kontoplanLoadSeqRef.current
    if (!userId) {
      setKontoplan([])
      setKontoplanLoading(false)
      setKontoplanLoaded(false)
      setKontoplanError(null)
      return { ok: false, reason: 'stale_load' }
    }

    setKontoplanLoading(true)
    setKontoplanLoaded(false)
    setKontoplanError(null)

    const isCurrentLoad = () => loadSeq === kontoplanLoadSeqRef.current

    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, default_vat_rate, debit_account, credit_account')
        .eq('user_id', userId)
        .order('name')
      if (error) throw error
      if (!isCurrentLoad()) return { ok: false, reason: 'stale_load' }
      const sorted = [...(data ?? [])].sort((a, b) => {
        // Intäktskonton (kredit på 3xxx) alltid överst
        const aIsIncome = a.credit_account?.startsWith('3')
        const bIsIncome = b.credit_account?.startsWith('3')
        if (aIsIncome && !bIsIncome) return -1
        if (!aIsIncome && bIsIncome) return 1
        // Ingående balans och z-konton alltid nederst
        const aIsZ = a.id === 'ingående_balans' || a.id.toLowerCase().startsWith('z')
        const bIsZ = b.id === 'ingående_balans' || b.id.toLowerCase().startsWith('z')
        if (aIsZ && !bIsZ) return 1
        if (!aIsZ && bIsZ) return -1
        return a.name.localeCompare(b.name, 'sv')
      })
      setKontoplan(sorted)
      setKontoplanLoaded(true)
      return { ok: true }
    } catch (err) {
      console.error('Fel vid laddning av kontoplan:', err)
      if (isCurrentLoad()) {
        setKontoplanLoaded(false)
        setKontoplanError('Kunde inte ladda kontoplanen.')
      }
      return { ok: false, reason: 'error', error: err }
    } finally {
      if (isCurrentLoad()) {
        setKontoplanLoading(false)
      }
    }
  }

  async function loadKontoplanOptions() {
    await loadKontoplanOptionsInternal()
  }

  async function refreshDataInternal(): Promise<AccountingRefreshResult> {
    // Vilket år detta anrop startades för - jämförs mot latestYearRef.current
    // strax innan vi skriver till state, så ett gammalt anrop (t.ex. för
    // 2028) aldrig kan skriva över nyare state efter att användaren redan
    // bytt till ett annat år (t.ex. 2027).
    const startedYear = selectedYear
    try {
      const startDate = `${selectedYear}-01-01`
      const endDate = `${selectedYear}-12-31`
      const supportingDataPromise = loadSupportingAccountingData(selectedYear, startDate, endDate)
        .then(data => ({ ok: true as const, data }))
        .catch(error => ({ ok: false as const, error }))

      const historyResult = await loadTransactionHistoryForYear(startedYear, startDate, endDate)
      if (!historyResult.ok) return historyResult

      // Skriv bara till state om det året vi hämtade för fortfarande är
      // det aktuella valda året.
      if (startedYear !== latestYearRef.current) {
        return { ok: false, reason: 'stale_year' }
      }

      const supportingDataResult = await supportingDataPromise
      if (startedYear !== latestYearRef.current) {
        return { ok: false, reason: 'stale_year' }
      }
      if (!supportingDataResult.ok) {
        console.error('Fel vid laddning av övrig bokföringsdata:', supportingDataResult.error)
        return { ok: false, reason: 'error', error: supportingDataResult.error }
      }

      const { balanceData, balanceSheetData, neRes, momsRes } = supportingDataResult.data
      setBalances(balanceData || {})
      setBalanceSheetBalances(balanceSheetData || {})
      setNeData(neRes)
      setMomsBreakdown(momsRes || { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

      // Uppdaterar även kontoplanen globalt vid refresh
      const kontoplanResult = await loadKontoplanOptionsInternal()
      if (!kontoplanResult.ok) return kontoplanResult

      return { ok: true }
    } catch (err) {
      console.error('Fel vid laddning av data:', err)
      if (startedYear !== latestYearRef.current) {
        return { ok: false, reason: 'stale_year' }
      }
      return { ok: false, reason: 'error', error: err }
    }
  }

  async function refreshData() {
    await refreshDataInternal()
  }

  async function refreshDataWithStatus() {
    return refreshDataInternal()
  }

  // Ladda data när user eller år ändras
  useEffect(() => {
    if (!user) {
      kontoplanLoadSeqRef.current += 1
      transactionHistoryLoadSeqRef.current += 1
      setStoredTransactions([])
      setStoredJournalMap({})
      setTransactionHistoryState(createInitialTransactionHistoryState())
      setKontoplan([])
      setKontoplanLoaded(false)
      setKontoplanLoading(false)
      setKontoplanError(null)
      return
    }
    let cancelled = false
    setDataLoading(true)
    setKontoplanLoaded(false)
    setKontoplanError(null)

    async function load() {
      if (!user?.id) return
      // Samma princip som i refreshData(): vilket år detta load()-anrop
      // startades för. Läggs till utöver det befintliga cancelled-skyddet
      // nedan, inte istället för det.
      const startedYear = selectedYear
      const historyMarker = startTransactionHistoryLoad(startedYear)
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
        const supportingDataPromise = loadSupportingAccountingData(selectedYear, startDate, endDate)
          .then(data => ({ ok: true as const, data }))
          .catch(error => ({ ok: false as const, error }))

        const historyResult = await loadTransactionHistoryForYear(startedYear, startDate, endDate, historyMarker)
        if (!historyResult.ok) return

        if (cancelled) return

        // Extra lager utöver cancelled: skriv bara om det här fortfarande
        // är det senast valda året.
        if (startedYear !== latestYearRef.current) return

        const supportingDataResult = await supportingDataPromise
        if (cancelled || startedYear !== latestYearRef.current) return
        if (!supportingDataResult.ok) {
          console.error('Fel vid laddning av övrig bokföringsdata:', supportingDataResult.error)
        } else {
          const { balanceData, balanceSheetData, neRes, momsRes } = supportingDataResult.data
          setBalances(balanceData || {})
          setBalanceSheetBalances(balanceSheetData || {})
          setNeData(neRes)
          setMomsBreakdown(momsRes || { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })
        }
        const kontoplanResult = await loadKontoplanOptionsInternal()
        if (!kontoplanResult.ok) return
      } catch (err) {
        if (!cancelled) {
          console.error('Fel vid laddning av data:', err)
          if (transactionHistoryLoadIsCurrent(historyMarker)) {
            setStoredTransactions([])
            setStoredJournalMap({})
            setTransactionHistoryState(failTransactionHistoryLoad(historyMarker, transactionHistoryErrorMessage(err)))
          }
        }
      } finally {
        // Endast den aktuella laddningen får släcka loading-state.
        if (!cancelled && startedYear === latestYearRef.current) {
          setDataLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
      kontoplanLoadSeqRef.current += 1
      transactionHistoryLoadSeqRef.current += 1
    }
  }, [user, selectedYear, subscriptionType])

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

  return {
    transactions,
    balances,
    balanceSheetBalances,
    neData,
    journalMap,
    transactionHistoryError,
    transactionHistoryLoading,
    transactionHistoryComplete,
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
  }
}
