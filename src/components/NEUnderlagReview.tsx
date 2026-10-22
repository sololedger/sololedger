'use client'
import { useEffect, useState } from 'react'
import type { NeReviewData } from '@/lib/neReview'
import NEAccountTable from './NEAccountTable'

// Do not initialize extra transports for the normal, closed NE view.
async function getNeReviewData(owner: string, year: number) {
  return (await import('@/lib/neReviewService')).getNeReviewData(owner, year)
}
const money = (value: number) => `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`
type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }
function message(error: unknown) { return error instanceof Error ? error.message : 'Underlaget kunde inte läsas fullständigt.' }
function ReviewContent({ owner, year }: { owner: string; year: number }) {
  const [state, setState] = useState<Load<NeReviewData>>({ status: 'loading' })
  const [showEmpty, setShowEmpty] = useState(false)
  useEffect(() => {
    let cancelled = false
    getNeReviewData(owner, year).then(data => { if (!cancelled) setState({ status: 'ready', data }) })
      .catch(error => { if (!cancelled) setState({ status: 'error', message: message(error) }) })
    return () => { cancelled = true }
  }, [owner, year])
  if (state.status === 'loading') return <p role="status" className="mt-4">Läser NE-underlag för {year}…</p>
  if (state.status === 'error') return <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-bold">Underlaget kunde inte kontrolleras</p><p>{state.message}</p><p>Stäng och öppna sektionen för att försöka igen. Inget besked om fullständighet lämnas.</p></div>
  return <div className="mt-4 space-y-4">
    <section aria-label="Granskningsbehov" className="rounded-xl border border-gray-200 p-4 break-words">
      <h3 className="font-bold">Granskningsbehov för {year}</h3>
      {state.data.reviews.length === 0 ? <p>Inga granskningsbesked från de befintliga kontrollerna. Detta betyder inte att deklarationen är fullständigt kontrollerad.</p>
        : <table className="mt-3 w-full table-fixed text-left text-sm">
          <caption className="sr-only">Upptäckta frågor och nästa steg</caption>
          <thead className="hidden md:table-header-group text-xs text-gray-600"><tr><th className="w-20 py-2">Konto / ruta</th><th className="p-2">SoloLedgers kontroll</th><th className="p-2">Din nästa åtgärd</th></tr></thead>
          <tbody className="block md:table-row-group">{state.data.reviews.map((review, index) => <tr key={review.account+':'+index} className="grid gap-2 border-t border-gray-200 py-3 md:table-row">
            <td className="font-semibold md:py-3 align-top">{review.account}</td><td className="break-words md:p-2 align-top">{review.reason}</td><td className="break-words md:p-2 align-top"><span className="font-medium md:hidden">Nästa steg: </span>{review.next}</td>
          </tr>)}</tbody>
        </table>}
      <p className="mt-3 text-sm text-gray-600">Du behöver också bedöma uppgifter utanför bokföringen, även när inga kontovarningar visas. Här sparas inga granskningsbeslut.</p>
    </section>
    <p className="text-sm text-gray-600">Resultatkonton visar årets rörelser; balanskonton och B10 kan omfatta tidigare år. Kontosaldon summerar inte alltid direkt till rutans belopp, bland annat vid nettning i B8/B14 och beräkning av B10. Bidraget till en R-ruta visas under kontots detaljer.</p>
    <button type="button" className="min-h-11 rounded-xl border px-3 py-2 font-bold text-emerald-800" aria-pressed={showEmpty} onClick={() => setShowEmpty(value => !value)}>{showEmpty ? 'Dölj rutor utan kontounderlag' : 'Visa även rutor utan kontounderlag'}</button>
    {state.data.groups.filter(group => showEmpty || group.accounts.length > 0 || group.amount !== 0 || ['R12','R15','R16','R17','B10'].includes(group.id)).map(group => <details key={group.id} className="min-w-0 rounded-xl border p-4 break-words">
      <summary className="min-h-11 cursor-pointer font-bold text-emerald-800">{group.id} · {group.title}{['R15', 'R16'].includes(group.id) ? ' · Inte bedömt' : group.amount == null ? '' : ` · ${money(group.amount)}`}</summary>
      <p className="my-3 text-sm text-gray-600">{/^R([1-9]|10)$/.test(group.id) ? 'Årets bokförda belopp. Öppna ett konto för att se hur det bidrar till rutan.' : group.explanation}</p>
      {group.accounts.length === 0 ? <p>Inga direkta kontounderlag att visa. Se förklaringen ovan.</p> : <NEAccountTable rows={group.accounts} owner={owner} year={year} />}
    </details>)}
    <p>Kontonamn är hjälpinformation och avgör inte NE-ruta. Sidan sparar inga beslut och ändrar ingen bokföring. Fullständigt nollade externa resultatkonton kan fortfarande behöva stämmas av mot det externa bokslutet.</p>
  </div>
}
export default function NEUnderlagReview({ owner, year }: { owner: string; year: number }) {
  const [open, setOpen] = useState(false)
  return <details className="mb-6 min-w-0 rounded-2xl border border-emerald-200 p-4 text-sm text-gray-800 break-words" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-2 text-base font-bold text-emerald-800">Kontrollera NE-underlaget · {year}</summary>
    <p>Följ ett belopp från NE-ruta till konto och verifikation. Inga uppgifter ändras här.</p>
    {open && <ReviewContent key={`${owner}:${year}`} owner={owner} year={year} />}
  </details>
}
