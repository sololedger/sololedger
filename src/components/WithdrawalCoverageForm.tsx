import type { useWithdrawal } from '@/hooks/useWithdrawal'
import WithdrawalControlForm from './WithdrawalControlForm'
import WithdrawalCoverageFields, { withdrawalCoverageValue } from './WithdrawalCoverageFields'
import { withdrawalIssueTask } from '@/lib/withdrawalPresentation'

export default function WithdrawalCoverageForm({ model, onStart }: { model: ReturnType<typeof useWithdrawal>; onStart: () => void }) {
  const firstDate = model.data?.assessment.firstDate
  const savedFrom = model.data?.assessment.facts.find(fact => fact.key === 'coverage')?.value.from
  const stillValid = typeof savedFrom === 'string' && model.data?.assessment.result.issues.every(issue => withdrawalIssueTask(issue) !== 'coverage')

  return <>
    {firstDate && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
      <p>Bokföringsunderlagets startdatum <strong className="ml-1 tabular-nums text-slate-950">{firstDate}</strong></p>
      <p className="mt-2">Titta efter sådant från före startdatumet som ännu behöver betalas, till exempel en obetald leverantörsfaktura eller skatt.</p>
      {typeof savedFrom === 'string' && <p className="mt-2">Senast bekräftade startdatum <strong className="ml-1 tabular-nums">{savedFrom}</strong></p>}
      {stillValid && <p className="mt-2">Din tidigare bekräftelse gäller fortfarande. Rutan nedan används när du vill spara en ny bekräftelse.</p>}
    </div>}
    <div className="rounded-2xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-700">
      <p className="font-semibold text-slate-950">Finns äldre betalningar som saknas, eller är du osäker?</p>
      <p className="mt-1">Lämna rutan tom. Gå igenom tidigare bokföring, obetalda fakturor och skattebesked. Komplettera saknade uppgifter i ordinarie bokföring eller ta hjälp med avstämningen innan du återvänder hit.</p>
    </div>
    <WithdrawalControlForm model={model} factKey="coverage" subject="Bekräftelsen" initial={false} onStart={onStart}
      value={confirmed => {
        if (!firstDate) throw new Error('Bokföringsunderlagets startdatum saknas.')
        return withdrawalCoverageValue(confirmed, firstDate)
      }}
      fields={(confirmed, edit) => <WithdrawalCoverageFields confirmed={confirmed} onChange={edit} />}
      reviewText={typeof savedFrom === 'string' ? `Senast bekräftade startdatum: ${savedFrom}.` : 'Det finns ingen sparad bekräftelse för tidigare åtaganden.'}
    />
  </>
}
