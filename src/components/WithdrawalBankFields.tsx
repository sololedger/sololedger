import { withdrawalControlMoney } from './WithdrawalBufferFields'

export function withdrawalBankValue(amount: string, date: string, bookOre: number, signature: string) {
  return { date, amountOre: withdrawalControlMoney(amount, true), bookOre, signature }
}

export default function WithdrawalBankFields({ amount, onChange, label }: {
  amount: string
  onChange: (amount: string) => void
  label: string
}) {
  return <label className="block text-sm font-semibold">{label}
    <input className="mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-slate-400 bg-white px-3 py-2 text-base"
      inputMode="decimal" value={amount} onChange={event => onChange(event.target.value)} />
  </label>
}
