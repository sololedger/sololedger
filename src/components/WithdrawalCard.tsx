'use client'
import { useEffect, useState } from 'react'
import { useWithdrawal } from '@/hooks/useWithdrawal'
import { WithdrawalCardContent } from './WithdrawalPanel'
export { WithdrawalCardContent } from './WithdrawalPanel'

export function withdrawalToday() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date()) }
export function useWithdrawalDate() {
  const [asOf, setAsOf] = useState(withdrawalToday)
  useEffect(() => {
    const tick = () => setAsOf(withdrawalToday())
    const timer = setInterval(tick, 60000)
    window.addEventListener('focus', tick)
    return () => { clearInterval(timer); window.removeEventListener('focus', tick) }
  }, [])
  return asOf
}
interface WithdrawalCardProps { owner: string; refreshKey: unknown; onOpenVat?: () => void; onOpenNe?: () => void }
export default function WithdrawalCard(props: WithdrawalCardProps) {
  const asOf = useWithdrawalDate()
  return <WithdrawalCardSession key={`${props.owner}:${asOf}`} {...props} asOf={asOf} />
}
function WithdrawalCardSession({ owner, refreshKey, onOpenVat, onOpenNe, asOf }: WithdrawalCardProps & { asOf: string }) {
  const model = useWithdrawal(owner, asOf, refreshKey)
  return <WithdrawalCardContent model={model} asOf={asOf} onOpenVat={onOpenVat} onOpenNe={onOpenNe} />
}
