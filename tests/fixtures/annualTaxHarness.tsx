import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import DashboardOverview from '../../src/components/DashboardOverview'
import { saleWithdrawal, sealWithdrawal, addWithdrawalFact, checkWithdrawalTax } from './withdrawalFixtures'
import { stableWithdrawalValue } from '../../src/lib/withdrawalAssessment'

const seed = saleWithdrawal()
seed.as_of = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
const year = Number(seed.as_of.slice(0, 4)) - 1
for (const row of [...seed.transactions, ...seed.journal]) row.date = `${year}-12-10`
seed.periods[0].period_start = `${year}-01-01`
seed.periods[0].period_end = `${year}-12-31`
seed.revision!.facts = []
addWithdrawalFact(seed, 'coverage', { from: `${year}-01-01`, noEarlierObligations: true })
addWithdrawalFact(seed, `rate:${year}`, { rate: 30 })
addWithdrawalFact(seed, `rate:${year - 1}`, { rate: 25 })
sealWithdrawal(seed)
const layoutSeed = structuredClone(seed)
const layoutYear = Number(seed.as_of.slice(0, 4))
let layoutCase = false
Object.assign(window, { annualSeed: seed, annualYear: year, annualLayoutYear: layoutYear, annualLayoutScenario: (kind: string) => {
  const next = structuredClone(layoutSeed)
  for (const row of next.journal) { row.debit = Number(row.debit) / 10; row.credit = Number(row.credit) / 10 }
  for (const row of [...next.transactions, ...next.journal]) row.date = next.as_of
  next.periods[0].period_start = `${layoutYear}-01-01`
  next.periods[0].period_end = `${layoutYear}-12-31`
  addWithdrawalFact(next, 'coverage', { from: `${layoutYear}-01-01`, noEarlierObligations: true })
  addWithdrawalFact(next, `rate:${layoutYear}`, { rate: 35 })
  if (kind === 'blocked') next.transactions[0].source = 'sie_import'
  layoutCase = true
  Object.assign(window, { annualSeed: sealWithdrawal(next) })
} })
Object.assign(window, { annualScenario: (kind: 'preliminary' | 'final') => {
  checkWithdrawalTax(seed, 0)
  addWithdrawalFact(seed, `income:${year}`, { rate: 30, debitedOre: 1000000, pendingOre: 1000000,
    finalOre: kind === 'final' ? 1500000 : null, basis: stableWithdrawalValue({'3010':-100000}),
    taxBasis: stableWithdrawalValue(seed.revision!.facts.find(f => f.key === 'tax_account')!.value) })
  sealWithdrawal(seed)
} })
function Harness() {
  const [taxControlTarget, setTaxControlTarget] = useState<HTMLDivElement | null>(null)
  const [owner, setOwner] = useState('synthetic-a')
  const [selectedYear, setYear] = useState(year)
  const [refresh, setRefresh] = useState(0)
  const [mounted, setMounted] = useState(true)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)
  Object.assign(window, { annualControls: { setOwner, setYear, refresh: () => setRefresh(n => n + 1), setMounted } })
  return mounted ? <>
    <div role="group" aria-label="Ekonomikontroller" className="flex flex-wrap items-center gap-2.5 mb-6">
      <label className="h-10 flex items-center gap-2 bg-white px-3 rounded-xl border border-gray-200 shadow-sm text-xs">År
        <select aria-label="År" value={selectedYear} onChange={e => setYear(Number(e.target.value))}><option>{year-1}</option><option>{year}</option><option>{layoutYear}</option><option>{year+2}</option></select>
      </label>
      <button className="h-10 bg-sky-600 text-white px-4 rounded-xl text-[10px] font-black uppercase">Importera SIE</button>
      <button className="h-10 bg-gray-900 text-white px-4 rounded-xl text-[10px] font-black uppercase">Exportera SIE</button>
      <div ref={setTaxControlTarget} className="min-w-0 max-w-full" />
    </div>
    <DashboardOverview taxControlTarget={taxControlTarget} owner={owner} refreshKey={refresh} balances={layoutCase ? {'1930':12500,'3010':-10000,'2611':-2500} : {'1930':125000,'3010':-100000,'2611':-25000}}
    bankSaldo={layoutCase ? 12500 : 125000} momsBreakdown={{utgaendeMoms:layoutCase ? 2500 : 25000,ingaendeMoms:0,momsNetto:layoutCase ? 2500 : 25000}}
    selectedYear={selectedYear} transactions={[]} journalMap={{}} activeModal={activeModal} setActiveModal={setActiveModal} />
  </> : null
}
createRoot(document.getElementById('root')!).render(<Harness />)
