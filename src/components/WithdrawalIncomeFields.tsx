import { stableWithdrawalValue } from '@/lib/withdrawalAssessment'
import { withdrawalIssueTask, type WithdrawalAssessment } from '@/lib/withdrawalPresentation'
import { withdrawalControlMoney } from './WithdrawalBufferFields'

export type IncomeInput = { incomeMode: string; debited: string; pending: string; amount: string }

export function incomeTaxAccountReady(assessment: WithdrawalAssessment) {
  return assessment.facts.some(fact => fact.key === 'tax_account') &&
    !assessment.result.issues.some(issue => withdrawalIssueTask(issue) === 'tax_account')
}

export function withdrawalIncomeValue(input: IncomeInput, year: number, currentYear: number, rate: number, assessment: WithdrawalAssessment) {
  if (!incomeTaxAccountReady(assessment)) throw new Error('Kontrollera först skattekontots saldo. Sedan kan beslutet stämmas av utan dubbelräkning.')
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) throw new Error('Ange ett giltigt inkomstår.')
  if (!['estimate', 'final'].includes(input.incomeMode)) throw new Error('Välj ett styrkt underlag eller pausa. Inget beslut får inte bli en nolluppgift.')
  if (input.incomeMode === 'final' && year >= currentYear) throw new Error('Slutskattebeskedet måste avse ett avslutat inkomstår.')
  if (!Number.isInteger(rate) || rate < 25 || rate > 55) throw new Error('Ange en uppskattning mellan 25 och 55 %.')
  return {
    rate,
    debitedOre: withdrawalControlMoney(input.debited),
    pendingOre: withdrawalControlMoney(input.pending),
    finalOre: input.incomeMode === 'final' ? withdrawalControlMoney(input.amount) : null,
    basis: assessment.incomeBases[year] ?? '{}',
    taxBasis: stableWithdrawalValue(assessment.facts.find(fact => fact.key === 'tax_account')?.value),
  }
}

const fieldClass = 'mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-slate-400 bg-white px-3 py-2 text-base'

function IncomeAmountField({ label, amount, onChange }: { label: string; amount: string; onChange: (amount: string) => void }) {
  return <div>
    <label className="block text-sm font-semibold">{label}
      <input className={fieldClass} inputMode="decimal" value={amount} onChange={event => onChange(event.target.value)} />
    </label>
    <button type="button" className="min-h-11 py-2 text-left text-xs font-medium text-emerald-800 underline"
      onClick={() => onChange('0')}>Bekräfta 0 kr<span className="sr-only"> · {label}</span></button>
  </div>
}

export default function WithdrawalIncomeFields({ input, update, finalAllowed, taxReady, onOpenTax }: {
  input: IncomeInput
  update: (patch: Partial<IncomeInput>) => void
  finalAllowed: boolean
  taxReady: boolean
  onOpenTax: () => void
}) {
  return <div className="space-y-4 text-sm">
    <label className="block font-semibold">Vilket underlag har du för året?
      <select aria-label="Vilket underlag har du för året?" className={fieldClass} value={input.incomeMode}
        onChange={event => update({ incomeMode: event.target.value })}>
        <option value="">Välj underlag</option>
        <option value="estimate">Preliminärskatt</option>
        <option value="final" disabled={!finalAllowed}>Slutskattebesked</option>
        <option value="unknown">Vet inte ännu</option>
      </select>
    </label>
    {!finalAllowed && <p className="text-slate-600">I SoloLedger kan du ange slutskattebesked för ett avslutat år. För det pågående året kan du använda beslutet om preliminärskatt.</p>}
    {!taxReady && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p>Kontrollera först skattekontots saldo. Utkastet kan förberedas men skatteuppgiften får inte sparas utan avstämning.</p>
      <button type="button" className="min-h-11 text-left font-semibold text-emerald-800 underline" onClick={onOpenTax}>Öppna skattekontokontrollen</button>
    </div>}
    {input.incomeMode === 'unknown' && <p>Det går inte att spara utan underlaget. Dina tidigare uppgifter finns kvar. Hämta beslutet på Mina sidor hos Skatteverket och öppna kontohistoriken i Skattekonto. Återkom när du vet vilka belopp som redan dragits och vilka som återstår. Ange bara 0 kr om du har kontrollerat att beloppet är noll.</p>}
    {['estimate', 'final'].includes(input.incomeMode) && <>
      <p>Välj samma år i beslutet och när du går igenom kontohistoriken. SoloLedger skiljer på skatt som redan har dragits och skatt som företaget fortfarande behöver täcka. Pausa och ta hjälp om du inte kan skilja beloppen åt.</p>
      <details className="rounded-xl bg-slate-50 px-3">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">Exempel på vad som ingår i saldot</summary>
        <p className="pb-3">Om Skatteverket redan har dragit 10 000 kr och ytterligare 2 000 kr ska dras senare, fyller du i 10 000 kr i första fältet och 2 000 kr i det andra. Använd dina egna belopp.</p>
      </details>
      <p className="text-slate-600">Summera preliminärskatten för året som Skatteverket redan har dragit fram till saldodatumet. Leta efter debiteringar av preliminärskatt i kontohistoriken. Hoppa över insättningar från banken.</p>
      <IncomeAmountField label="Preliminärskatt som redan ingår i saldot" amount={input.debited} onChange={debited => update({ debited })} />
      <p className="text-slate-600">Läs beslutet för samma år. Summera de beslutade belopp som ännu inte har dragits på saldodatumet. Ta bara med det som återstår.</p>
      <IncomeAmountField label="Beslutad preliminärskatt utanför saldot" amount={input.pending} onChange={pending => update({ pending })} />
      {input.incomeMode === 'final' && <>
        <p className="rounded-xl bg-slate-50 p-4">Ange det extra belopp som ska betalas enligt beskedet och ännu inte ingår i skattekontosaldot. Bekräfta 0 kr om allt redan ingår.</p>
        <IncomeAmountField label="Kvar att betala enligt slutskattebeskedet" amount={input.amount} onChange={amount => update({ amount })} />
        <p>Förväntad återbetalning kan inte anges som ett negativt netto. Är sambandet oklart kan du pausa.</p>
      </>}
    </>}
  </div>
}
