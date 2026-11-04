import { useState } from 'react'
import type { useWithdrawal } from '@/hooks/useWithdrawal'
import { withdrawalAnnualRate } from '@/lib/withdrawalAssessment'
import { withdrawalIssueTask } from '@/lib/withdrawalPresentation'
import WithdrawalControlForm from './WithdrawalControlForm'
import WithdrawalIncomeFields, { incomeTaxAccountReady, withdrawalIncomeValue, type IncomeInput } from './WithdrawalIncomeFields'

const moneyText = (ore: unknown) => typeof ore === 'number' ? String(ore / 100) : ''

export default function WithdrawalIncomeForm({ model, asOf, firstIssue, onStart, onOpenTax }: {
  model: ReturnType<typeof useWithdrawal>
  asOf: string
  firstIssue?: string
  onStart: () => void
  onOpenTax: () => void
}) {
  const [yearText, setYearText] = useState(() => firstIssue?.match(/\b(19|20)\d{2}\b/)?.[0] ?? asOf.slice(0, 4))
  const year = Number(yearText)
  const currentYear = Number(asOf.slice(0, 4))
  const validYear = Number.isInteger(year) && year >= 1900 && year <= currentYear
  const assessment = model.data?.assessment
  const saved = assessment?.facts.find(fact => fact.key === `income:${year}`)
  const savedValue = saved?.value
  const isFinal = savedValue?.finalOre != null
  const rate = validYear && assessment ? withdrawalAnnualRate(assessment.facts, year) : null
  const taxReady = !!assessment && incomeTaxAccountReady(assessment)
  const yearIssue = assessment?.result.issues.find(issue => issue.includes(String(year)) &&
    (withdrawalIssueTask(issue) === 'income' || issue.startsWith('Skatteunderlaget för')))
  const initial: IncomeInput = {
    incomeMode: saved ? isFinal ? 'final' : 'estimate' : '',
    debited: moneyText(savedValue?.debitedOre),
    pending: moneyText(savedValue?.pendingOre),
    amount: moneyText(savedValue?.finalOre),
  }
  const savedTitle = isFinal ? `Slutskattebesked ${year} sparat` : `Preliminärbeslut ${year} sparat – slutlig skatt uppskattas.`
  const reviewText = saved ? savedTitle : `Det finns inget sparat beslut för ${year}.`

  return <>
    <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
      <p><strong>Preliminärskattebeslutet</strong> visar vad Skatteverket beslutat att du ska betala i förväg. SoloLedger kan använda beslutet och ändå behöva uppskatta den slutliga skatten.</p>
      <p><strong>Slutskattebeskedet</strong> visar den slutliga skatten efter deklarationen. För ett avslutat år behöver SoloLedger veta hur mycket som återstår utanför det saldo du har kontrollerat.</p>
      <p>Hitta preliminärbeslutet på Mina sidor eller i e-tjänsten Preliminär inkomstdeklaration. Använd Skattekonto för att se vad som redan har debiterats.</p>
      <a href="https://www.skatteverket.se/foretag/skatterochavdrag/skattekontobetalaochfatillbaka/debiteradpreliminarskatt.4.233f91f71260075abe8800010616.html"
        target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Hitta beslutet hos Skatteverket ↗</a>
    </div>
    <label className="block text-sm font-semibold">Inkomstår
      <input type="number" min="1900" max={currentYear} value={yearText} disabled={model.saving} onChange={event => setYearText(event.target.value)}
        className="mt-2 block min-h-12 w-full max-w-40 rounded-xl border border-slate-400 px-3 py-2 text-base" />
    </label>
    <p className="text-xs text-slate-600">Varje år sparas separat. Osparade ändringar försvinner när du byter år.</p>
    {!validYear && <p role="alert" className="text-sm text-amber-900">Ange ett inkomstår mellan 1900 och {currentYear}.</p>}
    {validYear && <>
      {rate !== null && <p className="text-xs text-slate-600">Årsuppskattning: {rate} %. Procentsatsen ändras i ekonomöversiktens skattekort.</p>}
      {saved && <div className={'rounded-xl p-3 text-sm ' + (yearIssue || !taxReady ? 'bg-amber-50 text-amber-950' : 'bg-emerald-50 text-emerald-950')}>
        <p className="font-semibold">{savedTitle}</p>
        {yearIssue && <p className="mt-1">{yearIssue}</p>}
        {!taxReady && <p className="mt-1">Skattekontoavstämningen behöver ses över innan du sparar igen.</p>}
      </div>}
      <WithdrawalControlForm key={year} model={model} factKey={`income:${year}`} subject="Skatteuppgiften" initial={initial} onStart={onStart}
        canSubmit={input => taxReady && ['estimate', 'final'].includes(input.incomeMode) && (input.incomeMode !== 'final' || year < currentYear)}
        value={input => {
          if (!assessment || rate === null) throw new Error('Ladda aktuellt årsunderlag innan du sparar.')
          return withdrawalIncomeValue(input, year, currentYear, rate, assessment)
        }}
        fields={(input, edit) => <WithdrawalIncomeFields input={input} update={patch => edit({ ...input, ...patch })} finalAllowed={year < currentYear} taxReady={taxReady} onOpenTax={onOpenTax} />}
        reviewText={reviewText}
      />
    </>}
  </>
}
