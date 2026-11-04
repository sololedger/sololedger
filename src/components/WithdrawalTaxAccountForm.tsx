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
      <p>Logga in i Skatteverkets tjänst Skattekonto. Läs saldot för <strong>{asOf}</strong>, alltså hur mycket som finns kvar eller saknas på skattekontot den dagen. SoloLedger behöver saldot för att se om mer pengar behöver finnas kvar för skatt och moms.</p>
      <a href="https://www.skatteverket.se/foretag/etjansterochblanketter/allaetjanster/tjanster/skattekonto.106.76a43be412206334b89800031508.html"
        target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline underline-offset-4">Öppna Skattekonto hos Skatteverket ↗</a>
    </div>
    <div className="space-y-2 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
      <p><strong>Inbetalning:</strong> Du flyttar pengar från banken till skattekontot. <strong>Debitering:</strong> Skatteverket drar en skatt eller avgift från skattekontot. En inbetalning visar därför inte vilken skatt som har dragits.</p>
      <p>Öppna kontohistoriken hos Skatteverket och listan <strong>Händelser i SoloLedger</strong> nedan. Jämför datum och belopp för de poster SoloLedger visar. Om en post saknas eller du är osäker på om den ingår i saldot, vänta med att bekräfta.</p>
    </div>
    <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">Så påverkar saldot uttagsbeloppet</summary>
      <dl className="space-y-2 pb-4 leading-relaxed">
      <div><dt className="inline font-bold">Överskott (+). </dt><dd className="inline">Pengarna kan behövas till andra skatter eller betalas ut. Överskottet minskar därför inte reserven för moms och skatt.</dd></div>
      <div><dt className="inline font-bold">Underskott (−). </dt><dd className="inline">Det finns pengar att betala in. Underskottet ökar reserven.</dd></div>
      <div><dt className="inline font-bold">Saldo 0 kr. </dt><dd className="inline">Ange 0 när det är det faktiska saldot för datumet.</dd></div>
      </dl>
    </details>
    {typeof savedAmount === 'number' && typeof savedDate === 'string' && <p className="text-sm text-slate-700">Senast sparade saldo: <strong>{withdrawalMoney(savedAmount)}</strong> den {savedDate}.{!current && ' Kontrollera saldot igen för aktuellt datum och underlag.'}</p>}
    {snapshot && <details className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">Händelser i SoloLedger</summary>
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
