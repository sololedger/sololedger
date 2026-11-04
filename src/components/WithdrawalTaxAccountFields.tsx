import type { WithdrawalSnapshot } from '@/lib/withdrawalAssessment'
import { withdrawalControlMoney } from './WithdrawalBufferFields'

export type TaxAccountInput = { available: string; sign: string; amount: string; confirmed: boolean }

export function withdrawalTaxAccountValue(input: TaxAccountInput, date: string, basis: string) {
  if (input.available !== 'yes' || !['surplus', 'deficit'].includes(input.sign)) {
    throw new Error('Läs först saldot och välj över- eller underskott. Du kan pausa utan att ange något belopp.')
  }
  if (!input.confirmed) throw new Error('Kontrollera först att registrerade skattehändelser finns med i saldot.')
  const amount = withdrawalControlMoney(input.amount)
  return { date, saldoOre: amount === 0 || input.sign === 'surplus' ? amount : -amount, basis }
}

const fieldClass = 'mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-slate-400 bg-white px-3 py-2 text-base'

export default function WithdrawalTaxAccountFields({ input, update, snapshot }: {
  input: TaxAccountInput
  update: (patch: Partial<TaxAccountInput>) => void
  snapshot?: Pick<WithdrawalSnapshot, 'events' | 'movements'>
}) {
  return <div className="space-y-3 text-sm">
    <label className="block font-semibold">Har du det faktiska saldot för kontrolldatumet?
      <select aria-label="Har du det faktiska saldot för kontrolldatumet?" className={fieldClass} value={input.available}
        onChange={event => update({ available: event.target.value, confirmed: false })}>
        <option value="">Välj vad du vet</option>
        <option value="yes">Ja</option>
        <option value="later">Nej, inte ännu</option>
      </select>
    </label>
    {input.available === 'later' && <p role="status">Pausa och återvänd när du har uppgiften. Ingen nolla registreras och kontrollen blir inte klar.</p>}
    {input.available === 'yes' && <>
      <label className="block font-semibold">Saldot är
        <select aria-label="Saldot är" className={fieldClass} value={input.sign} onChange={event => update({ sign: event.target.value })}>
          <option value="">Välj efter skattekontot</option>
          <option value="surplus">Plus eller 0 kr</option>
          <option value="deficit">Minus</option>
        </select>
      </label>
      <label className="block font-semibold">Skattekontots saldo i kronor
        <input className={fieldClass} inputMode="decimal" value={input.amount} onChange={event => update({ amount: event.target.value })} />
      </label>
      {snapshot && <p className="text-slate-700">Registrerade avräkningar: {snapshot.events.length}. Registrerade överföringar: {snapshot.movements.length}. Jämför de registrerade händelserna med listan i Skattekonto.</p>}
      <label className="flex gap-3">
        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-emerald-700" checked={input.confirmed}
          onChange={event => update({ confirmed: event.target.checked })} />
        <span>Registrerade händelser fram till datumet ingår i saldot och inget behöver utredas.</span>
      </label>
      <p className="text-slate-600">Kryssrutan ersätter inte saldot. Ange bara 0 när det kontrollerade saldot faktiskt är 0.</p>
    </>}
  </div>
}
