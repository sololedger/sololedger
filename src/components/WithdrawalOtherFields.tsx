import { withdrawalControlMoney } from './WithdrawalBufferFields'

const label = 'Total av andra återstående betalningar, inklusive redan bokförda skulder'

export function withdrawalOtherValue(amount: string, basis: string) {
  return { amountOre: withdrawalControlMoney(amount), basis }
}

export default function WithdrawalOtherFields({ amount, onChange }: { amount: string; onChange: (amount: string) => void }) {
  return <div>
    <label className="block text-sm font-semibold">{label}
      <input className="mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-slate-400 bg-white px-3 py-2 text-base"
        inputMode="decimal" value={amount} onChange={event => onChange(event.target.value)} />
    </label>
    <button type="button" className="min-h-11 py-2 text-left text-xs font-medium text-emerald-800 underline"
      onClick={() => onChange('0')}>Jag har kontrollerat att just detta belopp är 0 kr · {label}</button>
  </div>
}
