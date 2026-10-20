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
Object.assign(window, { annualSeed: seed, annualYear: year })
Object.assign(window, { annualScenario: (kind: 'preliminary' | 'final') => {
  checkWithdrawalTax(seed, 0)
  addWithdrawalFact(seed, `income:${year}`, { rate: 30, debitedOre: 1000000, pendingOre: 1000000,
    finalOre: kind === 'final' ? 1500000 : null, basis: stableWithdrawalValue({'3010':-100000}),
    taxBasis: stableWithdrawalValue(seed.revision!.facts.find(f => f.key === 'tax_account')!.value) })
  sealWithdrawal(seed)
} })
function Harness() {
  const [owner, setOwner] = useState('synthetic-a')
  const [selectedYear, setYear] = useState(year)
  const [refresh, setRefresh] = useState(0)
  const [mounted, setMounted] = useState(true)
  const [activeModal, setActiveModal] = useState<null | 'bank' | 'skatt' | 'moms' | 'resultat'>(null)
  Object.assign(window, { annualControls: { setOwner, setYear, refresh: () => setRefresh(n => n + 1), setMounted } })
  return mounted ? <DashboardOverview owner={owner} refreshKey={refresh} balances={{'1930':125000,'3010':-100000,'2611':-25000}}
    bankSaldo={125000} momsBreakdown={{utgaendeMoms:25000,ingaendeMoms:0,momsNetto:25000}}
    selectedYear={selectedYear} transactions={[]} journalMap={{}} activeModal={activeModal} setActiveModal={setActiveModal} /> : null
}
createRoot(document.getElementById('root')!).render(<Harness />)
