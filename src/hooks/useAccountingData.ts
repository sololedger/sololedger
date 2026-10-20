import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getAccountBalances, getBalanceSheetBalances, getNEData, getUserId, isYearClosed } from '@/lib/accountingService'
import { setupDefaultAccounts } from '@/lib/setupDefaultAccounts'
import { getDashboardVatBreakdown } from '@/lib/dashboardVat'
import {
  loadCompleteTransactionHistory,
  type TransactionHistorySupabaseClient,
} from '@/lib/transactionHistoryLoader'

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
  const userId = user?.id ?? null
  // A fresh scope object also distinguishes A -> B -> A. Rendering masks old data
  // immediately; the layout effect invalidates replies before the browser paints.
  const scope = useMemo(() => ({ userId, year: selectedYear }), [userId, selectedYear])
  const scopeRef = useRef(scope)
  useLayoutEffect(() => { scopeRef.current = scope }, [scope])
  const loadSequence = useRef(0)
  const kontoplanLoadSeqRef = useRef(0)
  type Snapshot = {
    scope: typeof scope
    status: 'loading' | 'ready' | 'error'
    error: string | null
    data: {
      transactions: any[]
      journalMap: any
      balances: Awaited<ReturnType<typeof getAccountBalances>>
      balanceSheetBalances: Awaited<ReturnType<typeof getBalanceSheetBalances>>
      neData: Awaited<ReturnType<typeof getNEData>>
      momsBreakdown: Awaited<ReturnType<typeof getDashboardVatBreakdown>>
    } | null
  }
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [isYearLocked, setIsYearLocked] = useState(true)
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [kontoplanScope, setKontoplanScope] = useState<typeof scope | null>(null)
  const [kontoplanLoading, setKontoplanLoading] = useState(false)
  const [kontoplanLoaded, setKontoplanLoaded] = useState(false)
  const [kontoplanError, setKontoplanError] = useState<string | null>(null)
  const currentSnapshot = snapshot?.scope === scope ? snapshot : null
  const accountingDataReady = Boolean(userId && currentSnapshot?.status === 'ready')
  const accountingDataError = currentSnapshot?.status === 'error' ? currentSnapshot.error : null
  const dataLoading = Boolean(userId && !accountingDataReady && !accountingDataError)
  const visible = accountingDataReady ? currentSnapshot!.data : null

  async function loadKontoplanOptionsInternal(): Promise<AccountingRefreshResult> {
    if (scopeRef.current !== scope) return { ok: false, reason: 'stale_load' }
    const userId = scope.userId
    const loadSeq = ++kontoplanLoadSeqRef.current
    if (!userId) {
      setKontoplan([])
      setKontoplanLoading(false)
      setKontoplanLoaded(false)
      setKontoplanError(null)
      return { ok: false, reason: 'stale_load' }
    }

    setKontoplanScope(scope)
    setKontoplan([])
    setKontoplanLoading(true)
    setKontoplanLoaded(false)
    setKontoplanError(null)

    const isCurrentLoad = () => loadSeq === kontoplanLoadSeqRef.current && scopeRef.current === scope

    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, default_vat_rate, debit_account, credit_account, hidden_from_new_booking')
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
      setKontoplanScope(scope)
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

  async function refreshDataInternal(initialize = false): Promise<AccountingRefreshResult> {
    if (!userId || scopeRef.current !== scope) return { ok: false, reason: 'stale_load' }
    const sequence = ++loadSequence.current
    const isCurrent = () => scopeRef.current === scope && loadSequence.current === sequence
    setSnapshot({ scope, status: 'loading', error: null, data: null })
    setIsYearLocked(true)
    try {
      if (await getUserId() !== userId) throw new Error('Inloggningen har ändrats.')
      if (!isCurrent()) return { ok: false, reason: 'stale_load' }
      if (initialize) {
        const { data, error } = await supabase.from('accounts').select('id').eq('user_id', userId).limit(1)
        if (error) throw error
        if (!isCurrent()) return { ok: false, reason: 'stale_load' }
        if (!data?.length) await setupDefaultAccounts(userId)
      }
      if (!isCurrent()) return { ok: false, reason: 'stale_load' }
      const startDate = `${selectedYear}-01-01`
      const endDate = `${selectedYear}-12-31`
      // Publish one complete result; history success must not hide a failed NE/balance read.
      const [history, balances, balanceSheetBalances, neData, momsBreakdown, locked] = await Promise.all([
        loadCompleteTransactionHistory({
          client: supabase as unknown as TransactionHistorySupabaseClient, userId, startDate, endDate,
        }),
        getAccountBalances(selectedYear), getBalanceSheetBalances(selectedYear),
        getNEData(selectedYear), getDashboardVatBreakdown(startDate, endDate), isYearClosed(selectedYear),
      ])
      if (!isCurrent()) return { ok: false, reason: 'stale_load' }
      if (await getUserId() !== userId) throw new Error('Inloggningen har ändrats.')
      if (!isCurrent()) return { ok: false, reason: 'stale_load' }
      if (!balances || !balanceSheetBalances || !neData || !momsBreakdown) {
        throw new Error('Bokföringsunderlaget saknas.')
      }
      setIsYearLocked(locked)
      setSnapshot({ scope, status: 'ready', error: null, data: {
        transactions: sortTransactionsByDateAndVer(history.transactions, history.journalMap),
        journalMap: history.journalMap, balances, balanceSheetBalances, neData, momsBreakdown,
      } })
      const accountsResult = await loadKontoplanOptionsInternal()
      if (!isCurrent()) return { ok: false, reason: 'stale_load' }
      return accountsResult
    } catch (err) {
      if (!isCurrent()) return { ok: false, reason: 'stale_load' }
      console.error('Fel vid laddning av bokföringsdata:', err)
      setSnapshot({ scope, status: 'error', data: null,
        error: `Kunde inte hämta ekonomiska uppgifter för ${selectedYear}. Inga belopp visas. Försök igen.` })
      return { ok: false, reason: 'error', error: err }
    }
  }

  async function refreshData() { await refreshDataInternal() }
  async function refreshDataWithStatus() { return refreshDataInternal() }
  async function retryAccountingData() { await refreshDataInternal(true) }

  useEffect(() => {
    if (userId) void refreshDataInternal(true)
    return () => {
      loadSequence.current += 1
      kontoplanLoadSeqRef.current += 1
    }
    // Reload for identity/year/subscription changes, not every new user object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, selectedYear, subscriptionType])

  return {
    transactions: visible?.transactions ?? [],
    balances: visible?.balances ?? {},
    balanceSheetBalances: visible?.balanceSheetBalances ?? {},
    neData: visible?.neData ?? null,
    journalMap: visible?.journalMap ?? {},
    momsBreakdown: visible?.momsBreakdown ?? null,
    transactionHistoryError: accountingDataError,
    transactionHistoryLoading: dataLoading,
    transactionHistoryComplete: accountingDataReady,
    kontoplan: kontoplanScope === scope ? kontoplan : [],
    kontoplanLoading: kontoplanScope !== scope || kontoplanLoading,
    kontoplanLoaded: kontoplanScope === scope && kontoplanLoaded,
    kontoplanError: kontoplanScope === scope ? kontoplanError : null,
    dataLoading, accountingDataReady, accountingDataError, retryAccountingData,
    isYearLocked: accountingDataReady ? isYearLocked : true, setIsYearLocked,
    refreshData, refreshDataWithStatus, loadKontoplanOptions,
  }
}
