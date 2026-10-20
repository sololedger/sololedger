import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import WithdrawalCard from '../../src/components/WithdrawalCard'
import { withdrawalMock } from './withdrawalMocks'
function Harness() {
  const [owner,setOwner]=useState('synthetic-a')
  const [refresh,setRefresh]=useState(0)
  const [year,setYear]=useState(2026)
  Object.assign(window,{withdrawalHarness:{...withdrawalMock,setOwner,refresh:()=>setRefresh(n=>n+1),setYear}})
  return <main className="p-4 max-w-2xl mx-auto"><label>Rapportår<select aria-label="Rapportår" value={year} onChange={e=>setYear(Number(e.target.value))}><option>2026</option><option>2027</option><option>2028</option></select></label><WithdrawalCard owner={owner} refreshKey={refresh} /></main>
}
createRoot(document.getElementById('root')!).render(<Harness />)
