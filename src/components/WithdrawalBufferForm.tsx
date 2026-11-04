import type { useWithdrawal } from '@/hooks/useWithdrawal'
import WithdrawalBufferFields, { withdrawalBufferValue } from './WithdrawalBufferFields'
import WithdrawalControlForm from './WithdrawalControlForm'
import { withdrawalMoney } from './WithdrawalSummary'

export default function WithdrawalBufferForm({ model }: { model: ReturnType<typeof useWithdrawal> }) {
  const savedAmount = model.data?.assessment.facts.find(fact => fact.key === 'buffer')?.value.amountOre
  return <WithdrawalControlForm model={model} factKey="buffer" subject="Bufferten"
    initial={typeof savedAmount === 'number' ? String(savedAmount / 100) : ''}
    value={withdrawalBufferValue}
    fields={(amount, edit) => <WithdrawalBufferFields amount={amount} onChange={edit} />}
    reviewText={typeof savedAmount === 'number' ? `Senast sparade buffert: ${withdrawalMoney(savedAmount)}.` : 'Det finns ingen sparad buffert.'}
  />
}
