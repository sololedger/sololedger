import { toOre } from '@/lib/withdrawalModel'

export function withdrawalControlMoney(text: string, signed = false) {
  if (!(signed ? /^-?\d+(?:[.,]\d{1,2})?$/ : /^\d+(?:[.,]\d{1,2})?$/).test(text.trim())) {
    throw new Error('Belopp saknas eller är ogiltigt. Tomt är okänt, inte 0. Ange ett kontrollerat belopp eller pausa.')
  }
  return toOre(text.trim().replace(',', '.'))
}

export function withdrawalBufferValue(amount: string) {
  return { amountOre: withdrawalControlMoney(amount) }
}

export default function WithdrawalBufferFields({ amount, onChange }: { amount: string; onChange: (amount: string) => void }) {
  return <div>
    <label className="block text-sm font-semibold">Extra buffert i kronor
      <input className="mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-slate-400 bg-white px-3 py-2 text-base"
        inputMode="decimal" value={amount} onChange={event => onChange(event.target.value)} />
    </label>
    <button type="button" className="min-h-11 py-2 text-left text-xs font-medium text-emerald-800 underline"
      onClick={() => onChange('0')}>Ingen extra buffert (0 kr)</button>
  </div>
}
