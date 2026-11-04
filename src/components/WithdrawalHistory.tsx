'use client'

import { useEffect, useState } from 'react'
import { loadWithdrawalHistory, loadWithdrawalHistoryRevision, type HistoryFact, type HistoryRevision } from '@/lib/withdrawalHistory'
import { withdrawalMoney } from './WithdrawalSummary'

const savedTime = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm' })
const action = 'min-h-11 text-sm font-semibold text-emerald-800 underline underline-offset-4'
const sources: Record<string, string> = {
  user_checked: 'Kontrollerad uppgift',
  user_statement: 'Lämnad uppgift',
  user_estimate: 'Uppskattad uppgift',
}

function RevisionDates({ revision }: { revision: HistoryRevision }) {
  return <span className="block text-sm text-slate-600">
    Avser <time dateTime={revision.as_of_date}>{revision.as_of_date}</time>
    {' · Sparad '}<time dateTime={revision.recorded_at}>{savedTime.format(new Date(revision.recorded_at))}</time>
  </span>
}

function SavedFact({ fact }: { fact: HistoryFact }) {
  const { fact_key: key, payload } = fact
  const money = (field: string) => typeof payload[field] === 'number' ? withdrawalMoney(payload[field]) : 'Ingen uppgift sparad'
  const date = (field: string) => typeof payload[field] === 'string' ? payload[field] : 'Ingen uppgift sparad'
  const rate = typeof payload.rate === 'number' ? `${payload.rate} %` : 'Ingen uppgift sparad'
  const annual = /^(income|rate):([0-9]{4})$/.exec(key)
  let title: string
  let rows: [string, string][]
  if (key === 'coverage') {
    title = 'Tidigare åtaganden'
    rows = [['Bokföringens startdatum', date('from')], ['Inga äldre obetalda åtaganden', payload.noEarlierObligations === true ? 'Bekräftat' : 'Ingen bekräftelse sparad']]
  } else if (key === 'bank') {
    title = 'Bankens saldo'
    rows = [['Saldodatum', date('date')], ['Faktiskt saldo', money('amountOre')], ['Bokfört saldo', money('bookOre')]]
  } else if (key === 'tax_account') {
    title = 'Skattekontots saldo'
    rows = [['Saldodatum', date('date')], ['Kontrollerat saldo', money('saldoOre')]]
  } else if (key === 'other' || key === 'buffer') {
    title = key === 'other' ? 'Andra återstående betalningar' : 'Extra buffert'
    rows = [['Sparat belopp', money('amountOre')]]
  } else if (annual?.[1] === 'income') {
    title = `Skattebeslut ${annual[2]}`
    rows = [
      ['Underlag', payload.finalOre === null ? 'Preliminärt underlag' : typeof payload.finalOre === 'number' ? 'Slutskattebesked' : 'Ingen uppgift sparad'],
      ['Uppskattad skatt och egenavgifter', rate],
      ['Redan debiterad skatt', money('debitedOre')],
      ['Beslutad skatt som ännu inte debiterats', money('pendingOre')],
      ['Ytterligare slutligt nettobelopp', payload.finalOre === null ? 'Slutligt belopp saknas' : money('finalOre')],
    ]
  } else if (annual) {
    title = `Uppskattad skatteprocent ${annual[2]}`
    rows = [['Sparad skatteprocent', rate]]
  } else {
    return <p className="text-sm text-slate-700">En sparad kontroll av en typ som inte kan visas här.</p>
  }
  return <div className="rounded-xl border border-slate-200 bg-white p-3">
    <h5 className="font-semibold text-slate-950">{title}</h5>
    <p className="mt-1 text-xs text-slate-600">{sources[fact.source_kind] ?? 'Sparad uppgift'} · Noterad {fact.observed_on}</p>
    <dl className="mt-2 space-y-1 text-sm">
      {rows.map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-x-3">
        <dt className="text-slate-600">{label}</dt><dd className="font-medium text-slate-950">{value}</dd>
      </div>)}
    </dl>
  </div>
}

type Session = { owner: string; sequence: number }

function RevisionDetail({ owner, sequence, id }: Session & { id: string }) {
  const [attempt, setAttempt] = useState(0)
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadWithdrawalHistoryRevision>> | 'error' | null>(null)
  useEffect(() => {
    const request = new AbortController()
    void loadWithdrawalHistoryRevision(owner, sequence, id, request.signal).then(
      value => { if (!request.signal.aborted) setDetail(value) },
      () => { if (!request.signal.aborted) setDetail('error') },
    )
    return () => request.abort()
  }, [owner, sequence, id, attempt])

  if (detail === null) return <p role="status" className="p-3 text-sm">Laddar sparad version…</p>
  if (detail === 'error') return <div className="p-3 text-sm">
    <p role="alert">Den sparade versionen kunde inte visas.</p>
    <button type="button" className={action} onClick={() => { setDetail(null); setAttempt(attempt + 1) }}>Försök igen</button>
  </div>
  return <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-3">
    <h4 className="text-sm font-bold">Sparade uppgifter i version {detail.revision.revision_no}</h4>
    {detail.facts.length === 0 && <p className="text-sm">Versionen innehåller inga sparade kontrolluppgifter.</p>}
    {detail.facts.map(fact => <SavedFact key={fact.fact_key} fact={fact} />)}
  </div>
}

function HistoryList({ owner, sequence }: Session) {
  const [page, setPage] = useState<Awaited<ReturnType<typeof loadWithdrawalHistory>> | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [selected, setSelected] = useState<string | null>(null)
  const [request, setRequest] = useState<{ before?: number }>({})

  useEffect(() => {
    const controller = new AbortController()
    void loadWithdrawalHistory(owner, sequence, request.before, controller.signal).then(value => {
      if (controller.signal.aborted) return
      setPage(previous => ({
        ...value,
        revisions: request.before === undefined ? value.revisions : [...(previous?.revisions ?? []), ...value.revisions],
      }))
      setStatus('ready')
    }, () => { if (!controller.signal.aborted) setStatus('error') })
    return () => controller.abort()
  }, [owner, sequence, request])

  function read(before?: number) {
    setStatus('loading')
    setRequest({ before })
  }

  return <div className="space-y-3 border-t border-slate-200 px-4 py-4 sm:px-6">
    <p className="text-sm text-slate-600">Här kan du läsa sparade kontroller. Uppgifterna är skrivskyddade och påverkar inte dagens uttagsberäkning.</p>
    {page?.revisions.length === 0 && <p className="text-sm">Det finns inga sparade kontrollversioner.</p>}
    {page && page.revisions.length > 0 && <ul className="space-y-2">
      {page.revisions.map(revision => <li key={revision.id} className="overflow-hidden rounded-xl border border-slate-200">
        <button type="button" aria-expanded={selected === revision.id}
          onClick={() => setSelected(previous => previous === revision.id ? null : revision.id)}
          className="min-h-12 w-full px-3 py-2 text-left hover:bg-slate-50">
          <span className="block font-semibold text-emerald-800">Version {revision.revision_no}</span>
          <RevisionDates revision={revision} />
        </button>
        {selected === revision.id && <RevisionDetail owner={owner} sequence={sequence} id={revision.id} />}
      </li>)}
    </ul>}
    {status === 'loading' && <p role="status" className="text-sm">Laddar tidigare kontroller…</p>}
    {status === 'error' && <div className="text-sm">
      <p role="alert">Historiken kunde inte hämtas.</p>
      <button type="button" className={action} onClick={() => read(request.before)}>Försök igen</button>
    </div>}
    {status === 'ready' && page?.hasMore && <button type="button" className={action}
      onClick={() => read(page.revisions.at(-1)?.revision_no)}>Visa fler versioner</button>}
  </div>
}

export default function WithdrawalHistory({ owner, sequence, revisionId }: {
  owner: string
  sequence: number | null
  revisionId?: string
}) {
  const [open, setOpen] = useState(false)
  const [confirmedRevision, setConfirmedRevision] = useState(revisionId)
  // The model temporarily hides its snapshot during reload. Only a confirmed revision resets pagination.
  if (revisionId !== undefined && revisionId !== confirmedRevision) setConfirmedRevision(revisionId)
  // Keep the disclosure open for this owner while discarding reads from the old session.
  return <details hidden={sequence === null} onToggle={event => setOpen(event.currentTarget.open)}
    className="min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm">
    <summary className="min-h-12 cursor-pointer px-4 py-4 text-lg font-bold text-slate-950 sm:px-6">Tidigare kontroller</summary>
    {open && sequence !== null && <HistoryList key={`${sequence}:${confirmedRevision ?? ''}`} owner={owner} sequence={sequence} />}
  </details>
}
