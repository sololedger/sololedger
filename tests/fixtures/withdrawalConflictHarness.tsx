import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import WithdrawalCard from '../../src/components/WithdrawalCard'
import { addWithdrawalFact, checkWithdrawalTax, saleWithdrawal, sealWithdrawal } from './withdrawalFixtures'
import { stableWithdrawalValue } from '../../src/lib/withdrawalAssessment'

// Only the verified profile/RPC boundary is substituted. Service, hook, adapter
// and card all run unchanged. All data is synthetic; browser network is aborted.
function Harness() {
  const [owner, setOwner] = useState('synthetic-a')
  const [refresh, setRefresh] = useState(0)
  const [mounted, setMounted] = useState(true)
  Object.assign(window, { withdrawalConflictControls: { setOwner, refresh: () => setRefresh(n => n + 1), unmount: () => setMounted(false) } })
  return mounted ? <WithdrawalCard owner={owner} refreshKey={refresh} /> : null
}
const snapshot = saleWithdrawal()
snapshot.as_of = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
// Use a completed previous year independently of the machine's day.
const year = Number(snapshot.as_of.slice(0, 4)) - 1
for (const t of snapshot.transactions) t.date = `${year}-12-10`
for (const j of snapshot.journal) j.date = `${year}-12-10`
snapshot.periods = [{ id: 'annual', user_id: snapshot.user_id, period_start: `${year}-01-01`, period_end: `${year}-12-31`, source: 'sololedger', status: 'open' }]
snapshot.revision!.facts = []
addWithdrawalFact(snapshot, 'coverage', { from: `${year}-01-01`, noEarlierObligations: true })
addWithdrawalFact(snapshot, `rate:${year}`, { rate: 30 })
sealWithdrawal(snapshot)
Object.assign(window, { withdrawalConflictSeed: snapshot })
Object.assign(window, { withdrawalReviewCase: (kind: 'coverage' | 'final') => {
  const s = structuredClone(snapshot)
  if (kind === 'coverage') addWithdrawalFact(s, 'coverage', { from: s.as_of, noEarlierObligations: true })
  else {
    addWithdrawalFact(s, 'coverage', { from: `${year}-01-01`, noEarlierObligations: true })
    checkWithdrawalTax(s, 0)
    addWithdrawalFact(s, `income:${year}`, { rate: 30, debitedOre: 0, pendingOre: 0, finalOre: 1000000, basis: '{}', taxBasis: stableWithdrawalValue(s.revision!.facts.find(f => f.key === 'tax_account')!.value) })
  }
  Object.assign(window, { withdrawalConflictSeed: sealWithdrawal(s) })
} })
createRoot(document.getElementById('root')!).render(<Harness />)
