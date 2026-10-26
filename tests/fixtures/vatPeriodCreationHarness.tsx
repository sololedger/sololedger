import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import VatPeriodCreationPanel from '../../src/components/VatPeriodCreationPanel'
import { transport } from './vatPeriodCreationTransport'

let reset: (mode: Parameters<typeof transport.setup>[0], owner?: string) => void
let changeYear: (year: number) => void
function Harness() {
  const [revision, setRevision] = useState(0)
  const [year, setYear] = useState(2026)
  useEffect(() => {
    changeYear = year => flushSync(() => setYear(year))
    reset = (mode, owner) => flushSync(() => { transport.setup(mode, owner); setRevision(v => v + 1) })
  }, [])
  return <main className="mx-auto max-w-4xl p-4 sm:p-8"><div className="rounded-[2rem] border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
    <h1 className="text-xl font-bold">Momsrapport · 2026</h1>
    <VatPeriodCreationPanel key={`${revision}/${year}`} year={year} busy={false} onCreated={async () => {}} />
  </div></main>
}
Object.assign(window, { vatTest: { ...transport, ready: () => typeof reset === 'function', setYear: (year: number) => changeYear(year), reset: (mode: Parameters<typeof transport.setup>[0], owner?: string) => reset(mode, owner) } })
createRoot(document.getElementById('root')!).render(<Harness />)
