import type { useWithdrawal } from '@/hooks/useWithdrawal'
import { withdrawalControlMoney } from './WithdrawalBufferFields'
import WithdrawalControlForm from './WithdrawalControlForm'
import WithdrawalOtherFields, { withdrawalOtherValue } from './WithdrawalOtherFields'
import { withdrawalMoney } from './WithdrawalSummary'

function enteredOre(amount: string) {
  try {
    return withdrawalControlMoney(amount)
  } catch {
    return null
  }
}

export default function WithdrawalOtherForm({ model, onStart }: { model: ReturnType<typeof useWithdrawal>; onStart: () => void }) {
  const assessment = model.data?.assessment
  const saved = assessment?.facts.find(fact => fact.key === 'other')?.value
  const savedAmount = saved?.amountOre
  const known = assessment?.knownOther

  return <>
    <p className="text-sm leading-relaxed text-slate-700">Ange vad företaget fortfarande behöver betala utöver reserverna för moms och skatt. Totalsumman behöver täcka de kända skulderna och eventuella andra betalningar. Räkna varje betalning en gång.</p>
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
      <p className="font-semibold text-slate-950">Exempel</p>
      <p className="mt-1">En bokförd leverantörsskuld på 500 kr och en annan obetald utgift på 200 kr ger totalt 700 kr. Belopp som redan ingår i moms- eller skattereserven, och betalningar som redan är gjorda, räknas inte med.</p>
    </div>
    <WithdrawalControlForm model={model} factKey="other" subject="Betalningskontrollen"
      initial={typeof savedAmount === 'number' && saved?.basis === assessment?.otherBasis ? String(savedAmount / 100) : ''}
      onStart={onStart}
      value={amount => {
        if (!assessment) throw new Error('Ladda aktuellt skuldunderlag innan du sparar.')
        return withdrawalOtherValue(amount, assessment.otherBasis)
      }}
      fields={(amount, edit) => {
        const total = enteredOre(amount)
        return <>
          {known !== undefined && <dl className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-x-3"><dt>Kända bokförda skulder i underlaget</dt><dd className="font-bold tabular-nums">{withdrawalMoney(known)}</dd></div>
            <div className="flex flex-wrap justify-between gap-x-3"><dt>Din angivna totalsumma</dt><dd className="font-semibold tabular-nums">{total === null ? 'Ange belopp nedan' : withdrawalMoney(total)}</dd></div>
          </dl>}
          <WithdrawalOtherFields amount={amount} onChange={edit} />
          {known !== undefined && total !== null && total < known && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
            Totalsumman är lägre än de kända skulderna. De behöver rymmas i totalen eftersom de fortfarande ingår i bokföringen. Kontrollera vilka skulder som återstår. Om du sparar beloppet visas inget uttagsbelopp förrän underlaget har stämts av.
          </p>}
        </>
      }}
      reviewText={typeof savedAmount === 'number' ? `Senast sparade totalsumma: ${withdrawalMoney(savedAmount)}.` : 'Det finns ingen sparad totalsumma.'}
    />
  </>
}
