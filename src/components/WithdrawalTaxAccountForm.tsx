import type { useWithdrawal } from '@/hooks/useWithdrawal'
import { toOre } from '@/lib/withdrawalModel'
import WithdrawalControlForm from './WithdrawalControlForm'
import WithdrawalTaxAccountFields, { withdrawalTaxAccountValue, type TaxAccountInput } from './WithdrawalTaxAccountFields'
import { withdrawalMoney } from './WithdrawalSummary'

export default function WithdrawalTaxAccountForm({ model, asOf, onStart }: {
  model: ReturnType<typeof useWithdrawal>
  asOf: string
  onStart: () => void
}) {
  const loaded = model.data
  const snapshot = loaded?.snapshot
  const saved = loaded?.assessment.facts.find(fact => fact.key === 'tax_account')?.value
  const savedAmount = saved?.saldoOre
  const savedDate = saved?.date
  const current = typeof savedAmount === 'number' && savedDate === asOf && saved?.basis === loaded?.assessment.financialBasis
  const initial: TaxAccountInput = {
    available: current ? 'yes' : '',
    sign: current ? savedAmount < 0 ? 'deficit' : 'surplus' : '',
    amount: current ? String(Math.abs(savedAmount) / 100) : '',
    confirmed: false,
  }

  return <>
    <div className="space-y-2 text-sm leading-relaxed text-slate-700">
      <p>Öppna e-tjänsten Skattekonto. Läs <strong>Aktuellt saldo</strong> och jämför de bokförda transaktionerna med händelserna i SoloLedger till och med <strong>{asOf}</strong>.</p>
      <a href="https://www.skatteverket.se/foretag/etjansterochblanketter/allaetjanster/tjanster/skattekonto.106.76a43be412206334b89800031508.html"
        target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline underline-offset-4">Öppna Skattekonto hos Skatteverket ↗</a>
    </div>
    <figure className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
      <figcaption className="text-xs font-semibold text-emerald-900">Skattekonto · syntetiskt exempel</figcaption>
      <div className="mt-2 flex justify-between gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm font-bold text-emerald-950"><span>Aktuellt saldo</span><span>+62,00 kr</span></div>
    </figure>
    <dl className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
      <div><dt className="inline font-bold">Överskott (+). </dt><dd className="inline">Pengarna kan behövas till andra skatter eller betalas ut. Överskottet minskar därför inte reserven för moms och skatt.</dd></div>
      <div><dt className="inline font-bold">Underskott (−). </dt><dd className="inline">Det finns pengar att betala in. Underskottet ökar reserven.</dd></div>
      <div><dt className="inline font-bold">Saldo 0 kr. </dt><dd className="inline">Ange 0 när det är det faktiska saldot för datumet.</dd></div>
    </dl>
    {typeof savedAmount === 'number' && typeof savedDate === 'string' && <p className="text-sm text-slate-700">Senast sparade saldo: <strong>{withdrawalMoney(savedAmount)}</strong> den {savedDate}.{!current && ' Kontrollera saldot igen för aktuellt datum och underlag.'}</p>}
    {snapshot && <details className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700">
      <summary className="cursor-pointer py-2 font-semibold">Händelser i SoloLedger</summary>
      {snapshot.events.length + snapshot.movements.length === 0 && <p className="pb-2">Inga registrerade avräkningar eller överföringar.</p>}
      {snapshot.events.length + snapshot.movements.length > 0 && <ul className="space-y-1 pb-2">
        {snapshot.events.map(event => <li key={event.id}>{event.event_date} · {event.event_kind === 'vat_debit' ? 'Moms dragen' : 'Moms krediterad'} · {withdrawalMoney(toOre(event.amount))}</li>)}
        {snapshot.movements.map(movement => <li key={movement.id}>{movement.movement_date} · Överföring · {withdrawalMoney(toOre(movement.amount))}</li>)}
      </ul>}
    </details>}
    <WithdrawalControlForm model={model} factKey="tax_account" subject="Skattekontokontrollen" initial={initial} onStart={onStart}
      canSubmit={input => input.available === 'yes'}
      value={input => {
        if (!loaded) throw new Error('Ladda aktuellt skattekontounderlag innan du sparar.')
        return withdrawalTaxAccountValue(input, loaded.snapshot.as_of, loaded.assessment.financialBasis)
      }}
      fields={(input, edit) => <WithdrawalTaxAccountFields input={input} update={patch => edit({ ...input, ...patch })} snapshot={snapshot} />}
      reviewText={typeof savedAmount === 'number' && typeof savedDate === 'string'
        ? `Senast sparade skattekontosaldo: ${withdrawalMoney(savedAmount)} den ${savedDate}.` : 'Det finns inget sparat skattekontosaldo.'}
    />
  </>
}
