import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useAccountingData } from '../../src/hooks/useAccountingData'
import AccountingDataBoundary from '../../src/components/AccountingDataBoundary'
import OverviewCards from '../../src/components/OverviewCards'
import NEBilaga from '../../src/components/NEBilaga'
import { calculateDashboard, getBankSaldo } from '../../src/lib/calculations'
import * as mock from './accountingLoadMocks'

declare const KAN78_BASELINE: boolean
// Test-only imperative browser controls; never included in the application bundle.
/* eslint-disable react-hooks/immutability */
declare global { interface Window { harness: {
  setBootstrapError: typeof mock.setBootstrapError
  select: (owner: string | null, year: number) => boolean
  pending: () => Omit<typeof mock.pending[number], 'resolve' | 'reject'>[]
  finish: typeof mock.finish
  refresh: ReturnType<typeof useAccountingData>['refreshDataWithStatus']
  visible: () => unknown
} } }
function Harness() {
  const [context, setContext] = useState({ owner: mock.owner, year: 2026 })
  const [modal, setModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)
  const user = useMemo(() => context.owner ? { id: context.owner } : null, [context.owner])
  const data = useAccountingData(user, context.year, 'paid')
  window.harness = {
    setBootstrapError: mock.setBootstrapError,
    select(owner: string | null, year: number) {
      mock.setOwner(owner)
      flushSync(() => setContext({ owner, year }))
      return document.querySelector('[data-testid="values"]') === null
    },
    pending: () => mock.pending.map(({ id, group, owner, year, kind }) => ({ id, group, owner, year, kind })),
    finish: mock.finish,
    refresh: data.refreshDataWithStatus,
    visible: () => ({ balances: data.balances, ne: data.neData, vat: data.momsBreakdown, history: data.transactions, ready: data.accountingDataReady }),
  }
  const dashboard = calculateDashboard(data.balances, 30, data.momsBreakdown ?? { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })
  dashboard.bankSaldo = getBankSaldo(data.balanceSheetBalances)
  return <>
    <span data-testid="year">{context.year}</span>
    <AccountingDataBoundary ready={KAN78_BASELINE || data.accountingDataReady} error={data.accountingDataError} year={context.year} onRetry={data.retryAccountingData}>
      <div data-testid="values">
        <output data-testid="amount">{data.neData?.R11}</output>
        <output data-testid="history">{data.transactions.length ? 'Bokföring finns' : 'Tomt år'}</output>
        <OverviewCards data={dashboard} taxRate={30} selectedYear={context.year} transactions={data.transactions} journalMap={data.journalMap} activeModal={modal} setActiveModal={setModal} />
        <NEBilaga neData={data.neData} selectedYear={context.year} isYearLocked={data.isYearLocked} onLockYear={async () => { throw new Error('No writes allowed') }} />
      </div>
    </AccountingDataBoundary>
  </>
}
createRoot(document.getElementById('root')!).render(KAN78_BASELINE ? <Harness /> : <StrictMode><Harness /></StrictMode>)
