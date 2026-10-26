'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createMissingVatPeriods, getVatPeriodCreationPlan, type PlannedVatPeriod, type VatPeriodCreationPlan } from '@/lib/vatPeriodCreation'

function Dates({ periods }: { periods: PlannedVatPeriod[] }) {
  return <ul className="mt-2 space-y-1 text-sm tabular-nums">
    {periods.map(p => <li key={`${p.start}/${p.end}`}>{p.start} – {p.end}</li>)}
  </ul>
}

// Parent keys this panel by owner, year and saved VAT profile. No old preview survives a change.
export default function VatPeriodCreationPanel({ year, busy, onCreated }: {
  year: number; busy: boolean; onCreated: () => Promise<void>
}) {
  const [plan, setPlan] = useState<VatPeriodCreationPlan | null>(null)
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState<VatPeriodCreationPlan | null>(null)
  const request = useRef(0)
  const active = useRef(true)
  const inFlight = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const reviewButton = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    const seq = ++request.current
    setChecking(true)
    setPlan(null)
    setPreview(null)
    try {
      const next = await getVatPeriodCreationPlan(year)
      if (active.current && request.current === seq) setPlan(next)
    } catch (e) {
      if (active.current && request.current === seq) setError(e instanceof Error ? e.message : 'Periodstatus kunde inte kontrolleras.')
    } finally {
      if (active.current && request.current === seq) setChecking(false)
    }
  }, [year])

  useEffect(() => {
    const requestState = request
    active.current = true
    // Start the external read on mount, just like the other accounting panel loaders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    return () => { active.current = false; requestState.current++ }
  }, [load])

  useEffect(() => {
    if (preview) dialog.current?.showModal()
    else dialog.current?.close()
  }, [preview])

  function cancel() {
    if (inFlight.current) return
    setPreview(null)
    reviewButton.current?.focus()
  }

  async function confirm() {
    if (!preview || busy || inFlight.current || !active.current) return
    inFlight.current = true
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const count = await createMissingVatPeriods(preview)
      if (!active.current) return
      setNotice(`${count} momsperiod${count === 1 ? '' : 'er'} skapad${count === 1 ? '' : 'e'}. Ingen bokföring eller deklaration har skapats.`)
      await onCreated()
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : 'Skapandet kunde inte bekräftas.')
    } finally {
      // Discard the preview even on an uncertain network result; re-read before another attempt.
      if (active.current) {
        await load()
        if (active.current) setSaving(false)
      }
      inFlight.current = false
    }
  }

  const allYear = plan?.expected.at(-1)?.end === `${year}-12-31`
  return <section aria-label="Momsperiodernas täckning" className="mt-5 border-t border-gray-100 pt-4">
    {checking && <p role="status" className="text-sm text-gray-500">Kontrollerar momsperioderna…</p>}
    {error && <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p>{error}</p>
      <button type="button" disabled={checking || saving} onClick={() => { setError(null); void load() }} className="mt-2 font-bold underline">Kontrollera igen</button>
    </div>}
    {notice && <p role="status" className="mb-3 text-sm text-emerald-800">{notice}</p>}
    {!checking && plan?.state === 'complete' && <div role="status" className="text-sm text-emerald-800">
      <p className="font-semibold">Alla {allYear ? '' : 'påbörjade '}momsperioder för {year} finns</p>
      <p className="mt-1 text-xs text-gray-500">Täcker {plan.expected[0].start} – {plan.expected.at(-1)!.end}.
        {!allYear && ' Kommande perioder kan skapas när de börjar.'} Öppna perioder är redan skapade.</p>
    </div>}
    {!checking && plan?.state === 'missing' && <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-bold text-gray-900">Saknade momsperioder för {year}</p>
      <p className="mt-1 text-sm text-gray-600">Perioderna behövs för att samla momsrapporten och kunna avsluta året. Granska datumen innan du skapar dem.</p>
      <Dates periods={plan.missing} />
      <button ref={reviewButton} type="button" disabled={busy || saving} onClick={() => { setError(null); setPreview(plan) }}
        className="mt-4 min-h-11 w-full rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 sm:w-auto">
        Granska saknade momsperioder
      </button>
    </div>}
    {!checking && plan?.state === 'blocked' && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p>{plan.message}</p>
      {plan.missing.length > 0 && <><p className="mt-2 font-semibold">Saknade intervall som behöver granskas:</p><Dates periods={plan.missing} /></>}
    </div>}
    {!checking && plan?.state === 'not_applicable' && <p className="text-sm text-gray-600">{plan.message}</p>}
    <details className="mt-3 text-xs text-gray-600">
      <summary className="cursor-pointer font-semibold">Vad betyder de olika momsstegen?</summary>
      <dl className="mt-2 space-y-2 leading-relaxed">
        <div><dt className="font-bold">Skapa momsperiod</dt><dd>Lägger upp ett datumintervall. Ingen bokföring, betalning eller deklaration skapas.</dd></div>
        <div><dt className="font-bold">Beräkna momsrapport</dt><dd>Visar momsunderlaget från bokföringen för vald period.</dd></div>
        <div><dt className="font-bold">Stäng momsperiod</dt><dd>Avslutar perioden och kan skapa en momsavslutsverifikation. Perioden spärras för vanlig momsrelaterad bokföring.</dd></div>
        <div><dt className="font-bold">Deklarera hos Skatteverket</dt><dd>Du lämnar själv deklarationen hos Skatteverket. Bekräftelsen i SoloLedger dokumenterar att den redan är lämnad och skickar ingen deklaration eller betalning.</dd></div>
      </dl>
    </details>
    <dialog ref={dialog} onCancel={e => { e.preventDefault(); cancel() }} onClose={() => { if (!inFlight.current) setPreview(null) }}
      aria-labelledby="vat-period-preview-title" className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-gray-200 p-5 shadow-xl backdrop:bg-gray-950/40 sm:p-7">
      <h2 id="vat-period-preview-title" className="text-lg font-bold text-gray-900">Skapa dessa momsperioder?</h2>
      <p className="mt-2 text-sm text-gray-600">Endast de här datumen för {year} registreras som öppna perioder. Befintliga perioder och bokföringen ändras inte.</p>
      <Dates periods={preview?.missing ?? []} />
      <p className="mt-3 text-sm text-gray-600">Kontrollera att datumen stämmer med företagets uppgifter hos Skatteverket. Inget sparas förrän du bekräftar.</p>
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" disabled={saving} onClick={cancel} className="min-h-11 rounded-xl border border-gray-300 px-5 py-3 text-sm font-bold text-gray-700 disabled:opacity-50">Avbryt</button>
        <button type="button" disabled={saving || busy || !preview} onClick={() => void confirm()} className="min-h-11 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving ? 'Skapar…' : 'Bekräfta och skapa'}</button>
      </div>
    </dialog>
  </section>
}
