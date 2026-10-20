'use client'
import { useEffect, useState } from 'react'
import type { NeReviewAccount, NeReviewData, NeReviewEntry } from '@/lib/neReview'

// Do not initialize extra transports for the normal, closed NE view.
async function getNeReviewData(owner: string, year: number) {
  return (await import('@/lib/neReviewService')).getNeReviewData(owner, year)
}
async function getNeReviewEntries(owner: string, year: number, account: string, period: 'annual' | 'cumulative', balance: number) {
  return (await import('@/lib/neReviewService')).getNeReviewEntries(owner, year, account, period, balance)
}

const money = (value: number) => `${value.toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`
const decisionBasis: Record<string, string> = { small_business_exempt: 'bekräftat småföretagarundantag vid bokningen', taxable: 'momspliktigt försäljningsunderlag vid bokningen', reviewed_legacy: 'granskat historiskt underlag', inherited_correction: 'ärvt beslut från den rättade bokningen' }
type Load<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: T }
function message(error: unknown) { return error instanceof Error ? error.message : 'Underlaget kunde inte läsas fullständigt.' }
function EntryList({ owner, year, account }: { owner: string; year: number; account: NeReviewAccount }) {
  const [state, setState] = useState<Load<NeReviewEntry[]>>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    getNeReviewEntries(owner, year, account.accountNumber, account.period, account.balance).then(data => {
      if (!cancelled) setState({ status: 'ready', data })
    }).catch(error => { if (!cancelled) setState({ status: 'error', message: message(error) }) })
    return () => { cancelled = true }
  }, [owner, year, account.accountNumber, account.period, account.balance])
  if (state.status === 'loading') return <p role="status">Läser bokföringsposter…</p>
  if (state.status === 'error') return <p role="alert" className="text-amber-950">Ofullständigt underlag: {state.message}</p>
  return <div className="mt-3 space-y-3">
    <p>Alla {state.data.length} journalrader för kontot i angiven period. Original, rättelser och ingående balans behålls. Beloppen är journalens debet/kredit.</p>
    {state.data.length === 0 && <p>Inga bokföringsposter i perioden.</p>}
    {state.data.map(row => <article key={row.id} className="rounded-xl border bg-white p-3 break-words">
      <p className="font-bold">{row.date} · {row.verNr == null ? 'Verifikationsnummer saknas' : `VER-${row.verNr}`}</p>
      {row.journalDate !== row.date && <p>Journalradens datum: {row.journalDate}</p>}
      <p>{row.description}</p>
      {row.rowDescription && row.rowDescription !== row.description && <p>Journalrad: {row.rowDescription}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-2"><div><dt>Debet</dt><dd>{money(row.debit)}</dd></div><div><dt>Kredit</dt><dd>{money(row.credit)}</dd></div></dl>
      {account.accountNumber === '3010' && <p className="mt-2">{row.decision
        ? `Sparat historiskt beslut: ${row.decision.row}. Beslutsgrund: ${decisionBasis[row.decision.basis] ?? 'okänd beslutsgrund; behöver granskas'}.`
        : Number(row.vatRate ?? 0) === 0 && (row.debit !== 0 || row.credit !== 0)
          ? 'Sparat R1/R2-beslut saknas. Preliminär kontokoppling; underlaget behöver granskas.'
          : 'Inget sparat särskilt beslut. Befintlig R1-koppling enligt bokföringsunderlaget; dagens momsprofil används inte.'}</p>}
    </article>)}
  </div>
}
function Account({ row, owner, year }: { row: NeReviewAccount; owner: string; year: number }) {
  const [open, setOpen] = useState(false)
  return <li className="min-w-0 rounded-xl border p-3 break-words">
    <p className="font-bold">Konto {row.accountNumber} · {row.name}</p>
    <p className="text-xs">Namnkälla: {row.nameSource}</p>
    <p>{row.period === 'annual' ? 'Årets rörelse' : 'Saldo till årets slut'}: {money(row.balance)} (debet − kredit)</p>
    {row.balance === 0 && <p>Använt konto med nettosaldo 0.</p>}
    {row.contribution !== undefined && <p>Bidrag till denna R-ruta enligt befintlig beräkning: {money(row.contribution)}</p>}
    <p className="mt-1">{row.handling} · {row.status === 'review' ? 'Behöver granskas' : row.status === 'excluded' ? 'Uttryckligt undantag' : 'Befintlig koppling'}</p>
    <p>{row.reason}</p>
    <details className="mt-2" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-2 font-bold text-emerald-800">Visa bokföringsposter för {row.accountNumber}</summary>
      {open && <EntryList key={`${owner}:${year}:${row.accountNumber}:${row.period}:${row.balance}`} owner={owner} year={year} account={row} />}
    </details>
  </li>
}
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
    <section aria-label="Granskningsbehov" className="rounded-xl border border-amber-300 bg-amber-50 p-4 break-words">
      <h3 className="font-bold">Granskningsbehov för {year}</h3>
      {state.data.reviews.length === 0 ? <p>Inga granskningsbesked från de befintliga kontrollerna. Detta betyder inte att deklarationen är fullständigt kontrollerad.</p>
        : <ul className="mt-2 space-y-3">{state.data.reviews.map((review, index) => <li key={`${review.account}:${index}`}><p className="font-bold">{review.account}</p><p>{review.reason}</p><p className="mt-1">Nästa steg: {review.next}</p></li>)}</ul>}
    </section>
    <p className="text-sm">Regelkälla: SoloLedgers befintliga resultatmotor, kontotäckning, skattejusteringar och B10-beräkning. Sparade NE-beslut läses per journalrad. Ingen ny skattemässig bedömning görs här.</p>
    <button type="button" className="min-h-11 rounded-xl border px-3 py-2 font-bold text-emerald-800" aria-pressed={showEmpty} onClick={() => setShowEmpty(value => !value)}>{showEmpty ? 'Dölj rutor utan kontounderlag' : 'Visa även rutor utan kontounderlag'}</button>
    {state.data.groups.filter(group => showEmpty || group.accounts.length > 0 || group.amount !== 0 || ['R12','R15','R16','R17','B10'].includes(group.id)).map(group => <details key={group.id} className="min-w-0 rounded-xl border p-4 break-words">
      <summary className="min-h-11 cursor-pointer font-bold text-emerald-800">{group.id} · {group.title}{group.amount == null ? '' : ` · ${money(group.amount)}`}</summary>
      <p className="my-3">{group.explanation}</p>
      {group.accounts.length === 0 ? <p>Inga direkta kontounderlag att visa. Se förklaringen ovan.</p> : <ul className="space-y-3">{group.accounts.map(row => <Account key={`${owner}:${year}:${row.period}:${row.accountNumber}`} owner={owner} year={year} row={row} />)}</ul>}
    </details>)}
    <p>Kontonamn är hjälpinformation och avgör inte NE-ruta. Sidan sparar inga beslut och ändrar ingen bokföring. Fullständigt nollade externa resultatkonton kan fortfarande behöva stämmas av mot det externa bokslutet.</p>
  </div>
}
export default function NEUnderlagReview({ owner, year }: { owner: string; year: number }) {
  const [open, setOpen] = useState(false)
  return <details className="mb-6 min-w-0 rounded-2xl border border-emerald-200 p-4 text-sm text-gray-800 break-words" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-2 text-base font-bold text-emerald-800">Kontrollera NE-underlaget · {year}</summary>
    <p>Skrivskyddat underlag för samma räkenskapsår. Resultatkonton avser årets rörelser; balanskonton och B10 kan omfatta tidigare år. Avsaknad av varningar är ingen fullständig deklarationskontroll.</p>
    {open && <ReviewContent key={`${owner}:${year}`} owner={owner} year={year} />}
  </details>
}
