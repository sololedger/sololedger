import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getAccountBalances, getBalanceSheetBalances, getNEData, isYearClosed, getMomsBreakdown } from '@/lib/accountingService'
import { setupDefaultAccounts } from '@/lib/setupDefaultAccounts'

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

// Äger laddning av: transactions, balances, neData, journalMap, kontoplan, isYearLocked.
export function useAccountingData(user: any, selectedYear: number, subscriptionType: string | undefined) {
  const [dataLoading, setDataLoading] = useState(false)
  const [isYearLocked, setIsYearLocked] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [balances, setBalances] = useState<any>({})
  const [balanceSheetBalances, setBalanceSheetBalances] = useState<any>({})
  const [neData, setNeData] = useState<any>(null)
  const [journalMap, setJournalMap] = useState<any>({})
  const [kontoplan, setKontoplan] = useState<any[]>([])
  const [momsBreakdown, setMomsBreakdown] = useState({ utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

  // Håller alltid det SENAST valda året, oavsett hur gammal closure ett
  // pågående async-anrop (load() eller refreshData()) bär med sig. Sätts
  // vid varje render - en vanlig variabel/closure hade istället frusit
  // vid det ögonblick funktionen skapades, vilket är precis det som
  // orsakade stale-data-buggen (år 2028:s svar skrev över 2027:s state).
  const latestYearRef = useRef(selectedYear)
  latestYearRef.current = selectedYear

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
      }
    } catch (err) {
      console.error('Fel vid laddning av kontoplan:', err)
    }
  }

  async function refreshData() {
    // Vilket år detta anrop startades för - jämförs mot latestYearRef.current
    // strax innan vi skriver till state, så ett gammalt anrop (t.ex. för
    // 2028) aldrig kan skriva över nyare state efter att användaren redan
    // bytt till ett annat år (t.ex. 2027).
    const startedYear = selectedYear
    try {
      const startDate = `${selectedYear}-01-01`
      const endDate = `${selectedYear}-12-31`
      const [txData, balanceData, balanceSheetData, neRes, momsRes] = await Promise.all([
        supabase.from('transactions').select('*')
          .eq('user_id', user.id)
          .gte('date', startDate).lte('date', endDate)
          .order('date', { ascending: false }),
        getAccountBalances(selectedYear),
        getBalanceSheetBalances(selectedYear),
        getNEData(selectedYear),
        getMomsBreakdown(startDate, endDate)
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

      // Skriv bara till state om det året vi hämtade för fortfarande är
      // det aktuella valda året.
      if (startedYear !== latestYearRef.current) return

      setTransactions(sortTransactionsByDateAndVer(txData.data || [], jMap))
      setBalances(balanceData || {})
      setBalanceSheetBalances(balanceSheetData || {})
      setJournalMap(jMap)
      setNeData(neRes)
      setMomsBreakdown(momsRes || { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

      // Uppdaterar även kontoplanen globalt vid refresh
      await loadKontoplanOptions()
    } catch (err) {
      console.error('Fel vid laddning av data:', err)
    }
  }

  // Ladda data när user eller år ändras
  useEffect(() => {
    if (!user) return
    let cancelled = false
    setDataLoading(true)

    async function load() {
      if (!user?.id) return
      // Samma princip som i refreshData(): vilket år detta load()-anrop
      // startades för. Läggs till utöver det befintliga cancelled-skyddet
      // nedan, inte istället för det.
      const startedYear = selectedYear
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

        const [txData, balanceData, balanceSheetData, neRes, momsRes] = await Promise.all([
          supabase.from('transactions').select('*')
            .eq('user_id', user.id)
            .gte('date', startDate).lte('date', endDate)
            .order('date', { ascending: false }),
          getAccountBalances(selectedYear),
          getBalanceSheetBalances(selectedYear),
          getNEData(selectedYear),
          getMomsBreakdown(startDate, endDate)
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

        // Extra lager utöver cancelled: skriv bara om det här fortfarande
        // är det senast valda året.
        if (startedYear !== latestYearRef.current) return

        setTransactions(sortTransactionsByDateAndVer(txData.data || [], jMap))
        setBalances(balanceData || {})
        setBalanceSheetBalances(balanceSheetData || {})
        setJournalMap(jMap)
        setNeData(neRes)
        setMomsBreakdown(momsRes || { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })
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
    kontoplan,
    dataLoading,
    isYearLocked, setIsYearLocked,
    refreshData,
    momsBreakdown,
  }
}