import type { useWithdrawal } from '@/hooks/useWithdrawal'
import WithdrawalBankFields, { withdrawalBankValue } from './WithdrawalBankFields'
import { withdrawalControlMoney } from './WithdrawalBufferFields'
import WithdrawalControlForm from './WithdrawalControlForm'
import { withdrawalMoney } from './WithdrawalSummary'

function bankComparison(amount: string, bookOre: number | undefined) {
  if (bookOre === undefined || !amount.trim()) return null
  try {
    const actualOre = withdrawalControlMoney(amount, true)
    return { actualOre, matches: actualOre === bookOre }
  } catch {
    return null
  }
}

export default function WithdrawalBankForm({ model, onStart }: { model: ReturnType<typeof useWithdrawal>; onStart: () => void }) {
  const loaded = model.data
  const snapshot = loaded?.snapshot
  const bookOre = loaded?.assessment.result.bankOre
  const saved = loaded?.assessment.facts.find(fact => fact.key === 'bank')?.value
  const savedAmount = saved?.amountOre
  const savedDate = saved?.date
  const currentAmount = typeof savedAmount === 'number' && savedDate === snapshot?.as_of && saved?.signature === snapshot?.signature
    ? String(savedAmount / 100) : ''

  return <>
    <p className="text-sm leading-relaxed text-slate-700">Öppna ditt företagskonto i banken och jämför saldot med beloppet som SoloLedger visar. Leta efter <strong>Disponibelt saldo</strong> för samma datum. Skriv minustecken om saldot är negativt.</p>
    <WithdrawalControlForm model={model} factKey="bank" subject="Bankkontrollen" initial={currentAmount} onStart={onStart}
      value={amount => {
        if (!snapshot || bookOre === undefined) throw new Error('Ladda aktuellt bokföringsunderlag innan du sparar.')
        return withdrawalBankValue(amount, snapshot.as_of, bookOre, snapshot.signature)
      }}
      fields={(amount, edit) => {
        const comparison = bankComparison(amount, bookOre)
        return <>
          {snapshot && bookOre !== undefined && <dl className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div className="flex flex-wrap justify-between gap-x-3"><dt>Bokfört saldo på företagskontot</dt><dd className="font-bold tabular-nums">{withdrawalMoney(bookOre)}</dd></div>
            <div className="flex flex-wrap justify-between gap-x-3"><dt>Saldo enligt banken</dt><dd className="font-semibold tabular-nums">{comparison ? withdrawalMoney(comparison.actualOre) : 'Ange belopp nedan'}</dd></div>
            <div className="text-xs text-slate-600"><dt className="inline">Kontrolldatum </dt><dd className="inline">{snapshot.as_of}</dd></div>
          </dl>}
          <WithdrawalBankFields amount={amount} onChange={edit} label="Disponibelt saldo i banken, kr" />
          {comparison && <p className={'rounded-xl p-3 text-sm ' + (comparison.matches ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-950')}>
            {comparison.matches
              ? 'Beloppen stämmer överens.'
              : 'Beloppen skiljer sig. Kontrollera konto, datum och bankhändelser mot bokföringen. Om skillnaden kvarstår behöver bokföringen stämmas av. Ett sparat avvikande saldo spärrar uttagsbeloppet.'}
          </p>}
        </>
      }}
      reviewText={typeof savedAmount === 'number' && typeof savedDate === 'string'
        ? `Senast sparade banksaldo: ${withdrawalMoney(savedAmount)} den ${savedDate}.` : 'Det finns inget sparat banksaldo.'}
    />
  </>
}
