'use client'

import { useEffect, useRef, useState } from 'react'
import type { useWithdrawal } from '@/hooks/useWithdrawal'
import { findHelpArticle } from '@/lib/helpContent'
import { withdrawalControlRows, withdrawalGuidance, withdrawalHelpIds, withdrawalIssueTask, withdrawalTaskLabels, type WithdrawalTask } from '@/lib/withdrawalPresentation'
import { WithdrawalCardContent } from './WithdrawalPanel'
import WithdrawalBufferForm from './WithdrawalBufferForm'
import WithdrawalCoverageForm from './WithdrawalCoverageForm'
import WithdrawalBankForm from './WithdrawalBankForm'
import WithdrawalOtherForm from './WithdrawalOtherForm'
import WithdrawalTaxAccountForm from './WithdrawalTaxAccountForm'
import WithdrawalIncomeForm from './WithdrawalIncomeForm'
import WithdrawalHistory from './WithdrawalHistory'
import { withdrawalDisplayAmount, withdrawalMoney } from './WithdrawalSummary'

type Props = {
  owner: string
  historySession: number | null
  model: ReturnType<typeof useWithdrawal>
  asOf: string
  onBack: () => void
  onOpenVat?: () => void
  onOpenNe?: () => void
}

const card = 'min-w-0 rounded-3xl border border-slate-200 bg-white shadow-sm'
const statuses = {
  required: { label: 'Åtgärd krävs', icon: '!', tone: 'bg-amber-100 text-amber-900' },
  valid: { label: 'Sparad', icon: '✓', tone: 'bg-emerald-100 text-emerald-900' },
  stale: { label: 'Behöver ses över', icon: '↻', tone: 'bg-amber-100 text-amber-900' },
  optional: { label: 'Ej kontrollerad', icon: '○', tone: 'bg-slate-100 text-slate-700' },
}

function AmountRow({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5">
    <dt className="min-w-0 flex-[1_0_9rem] text-slate-600">{label}</dt>
    <dd className="ml-auto text-right font-semibold whitespace-nowrap tabular-nums text-slate-950">{value}</dd>
  </div>
}

export default function WithdrawalPage({ owner, historySession, model, asOf, onBack, onOpenVat, onOpenNe }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  const guide = useRef<HTMLElement>(null)
  const [selected, setSelected] = useState<WithdrawalTask | null>(null)
  const [incomeYearText, setIncomeYearText] = useState<string | null>(null)
  useEffect(() => { heading.current?.focus() }, [])

  const loaded = model.data
  const result = loaded?.assessment.result
  const issue = result?.issues[0]
  const firstRequired = issue ? withdrawalIssueTask(issue) : null
  const rows = loaded ? withdrawalControlRows(loaded.assessment, loaded.snapshot, true) : []
  const savedBank = loaded?.assessment.facts.find(fact => fact.key === 'bank')?.value
  const active = rows.find(row => row.task === selected) ?? rows.find(row => row.task === firstRequired)
  const showBuffer = selected === 'buffer'
  const showCoverage = selected === 'coverage' || active?.task === 'coverage'
  const showBank = selected === 'bank' || active?.task === 'bank'
  const showOther = selected === 'other' || active?.task === 'other'
  const showTaxAccount = selected === 'tax_account' || active?.task === 'tax_account'
  const showIncome = selected === 'income' || active?.task === 'income'
  const showInline = showBuffer || showCoverage || showBank || showOther || showTaxAccount || showIncome
  const activeIssue = active && result?.issues.find(message => withdrawalIssueTask(message) === active.task)
  const help = active ? findHelpArticle(withdrawalHelpIds[active.task]) : null
  const blocked = result?.status === 'incomplete' || result?.recommendedOre === null

  const guidance = loaded ? withdrawalGuidance(loaded.assessment, loaded.snapshot) : null
  const next = guidance && guidance.task !== 'buffer' ? guidance.task : null
  const targetIncomeYear = guidance?.incomeYear ?? rows.find(row => row.task === 'income')?.incomeYear
  const nextLabel = next === 'bank' ? 'Kontrollera bankens saldo'
    : next === 'tax_account' ? 'Kontrollera skattekontots saldo'
    : next === 'income' && guidance?.incomeYear ? `Öppna skattebeslut för ${guidance.incomeYear}`
    : next ? `Öppna: ${withdrawalTaskLabels[next]}` : null

  function selectControl(task: WithdrawalTask, focusGuide = false) {
    setSelected(task)
    if (task === 'income') setIncomeYearText(null)
    if (focusGuide || window.matchMedia('(max-width: 1023px)').matches) guide.current?.focus()
  }

  return <section aria-labelledby="withdrawal-page-title" className="mx-auto min-w-0 max-w-6xl space-y-5 pb-8">
    <header className="space-y-1">
      <button type="button" onClick={onBack} className="min-h-11 text-sm font-semibold text-emerald-800 underline underline-offset-4">← Till ekonomöversikten</button>
      <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Säkert uttag</p>
      <h2 ref={heading} id="withdrawal-page-title" tabIndex={-1} className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Ditt uttagsutrymme</h2>
      <p className="text-sm leading-relaxed text-slate-600">Se vad du kan ta ut privat och vad som behöver finnas kvar.</p>
    </header>
    {model.loading && <p role="status" className={card + ' p-5'}>Laddar uttagsunderlag…</p>}
    {model.error && <div role="alert" className="rounded-3xl border border-amber-300 bg-amber-50 p-5">
      <p className="font-semibold">Uttagsunderlaget kunde inte hämtas</p>
      <p>{model.error}</p>
      <button type="button" onClick={() => void model.reload()} className="min-h-11 underline">Försök igen</button>
    </div>}
    {result && <div className={card + ' grid overflow-hidden md:grid-cols-2'}>
      <div className={'border-b border-slate-200 p-5 sm:p-7 md:border-r md:border-b-0 ' + (blocked ? 'bg-amber-50' : 'bg-gradient-to-br from-emerald-100/80 to-emerald-50/40')}>
        <p className="text-sm font-semibold text-slate-700">Uttag från företagskontot</p>
        <div role="status">
          {blocked ? <>
            <p className="mt-2 text-2xl font-bold leading-tight tracking-tight text-slate-950 sm:text-3xl">Kan inte beräknas</p>
            <span className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Kontroll krävs</span>
          </> : result.recommendedOre !== null && <>
            <p className="mt-1 break-words text-5xl font-black tracking-tighter text-slate-950 sm:text-6xl">{withdrawalDisplayAmount(result.recommendedOre)}</p>
            <span className="mt-3 inline-block rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-emerald-900">{result.status === 'estimated' ? 'Uppskattat' : 'Beräknat'}</span>
          </>}
        </div>
        {guidance?.message && <p className="mt-3 text-sm text-slate-700">{guidance.message}</p>}
        {!blocked && result.rawOre !== null && result.rawOre < 0 && <p className="mt-3 text-sm font-semibold text-slate-800">Det saknas {withdrawalMoney(-result.rawOre)} för de visade betalningarna.</p>}
        {next && <button type="button" onClick={() => selectControl(next, true)}
          className="mt-2 min-h-11 text-left text-sm font-semibold text-emerald-800 underline underline-offset-4">{nextLabel} ↓</button>}
        <p className="mt-3 text-xs leading-relaxed text-slate-600">Underlag per {result.asOf}. Framtida utgifter utöver visade reserver ingår inte.</p>
      </div>
      <div className="p-5 sm:p-7">
        <h3 className="text-lg font-bold tracking-tight">{blocked ? 'Underlag som finns' : 'Så räknas beloppet fram'}</h3>
        <dl className="mt-2 divide-y divide-slate-100 text-sm">
          <AmountRow label="Bokfört saldo på företagskontot" value={withdrawalMoney(result.bankOre)} />
          {blocked ? <AmountRow label="Moms före avräkning" value={withdrawalMoney(result.vatOre)} />
            : result.reserveOre !== null && <AmountRow label="Kvar att täcka för moms och skatt" value={withdrawalMoney(result.reserveOre)} />}
          <AmountRow label="Andra betalningar" value={withdrawalMoney(result.otherOre)} />
          <AmountRow label="Extra buffert" value={withdrawalMoney(result.bufferOre)} />
        </dl>
        {result.taxAccountOre !== null && result.taxAccountOre > 0 && <p className="mt-2 text-xs leading-relaxed text-slate-600">Överskottet på skattekontot, {withdrawalMoney(result.taxAccountOre)}, minskar inte reserven. Pengarna kan behövas till andra skatter eller betalas ut.</p>}
        <details className="mt-3 border-t border-slate-200 pt-2 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-emerald-800">Visa beräkningsdetaljer</summary>
          <dl className="divide-y divide-slate-100">
            <AmountRow label="Moms före avräkning" value={withdrawalMoney(result.vatOre)} />
            <AmountRow label="Skatt och egenavgifter före avräkning" value={withdrawalMoney(result.incomeTaxOre)} />
            <AmountRow label="Skattekonto i underlaget" value={result.taxAccountOre === null ? 'Behöver kontrolleras' : withdrawalMoney(result.taxAccountOre)} />
          </dl>
          {loaded.assessment.checkedAt && <p className="mt-2 text-xs text-slate-600">Skattekontot kontrollerades {loaded.assessment.checkedAt}.</p>}
          {result.estimationNotes.map(note => <p key={note} className="mt-2 text-xs text-slate-600">{note}</p>)}
          {loaded.assessment.taxRates.length > 0 && <p className="mt-2 text-xs text-slate-600">Årsprocenter: {loaded.assessment.taxRates.join(', ')}.</p>}
          <p className="mt-2 text-xs text-slate-600">Beloppet är ingen garanti för faktisk skatt eller bankbehållning.</p>
        </details>
      </div>
    </div>}
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)]">
      {loaded && <section aria-labelledby="withdrawal-controls-title" className={card + ' p-4 sm:p-5'}>
        <h3 id="withdrawal-controls-title" className="text-lg font-bold tracking-tight">Dina kontroller</h3>
        <p className="mt-1 text-sm text-slate-600">Välj en uppgift för att se hur du gör.</p>
        <ul className="mt-3 space-y-1">
          {rows.map(row => {
            const olderTax = row.task === 'tax_account' && row.group === 'optional' && row.saved
            const status = statuses[row.group === 'optional' && row.saved && !olderTax ? 'stale' : row.group]
            const bank = row.task === 'bank' ? savedBank : undefined
            const savedMismatch = bank && bank.amountOre !== bank.bookOre
            const previousMatch = bank && row.group === 'optional' && typeof bank.amountOre === 'number' && typeof bank.date === 'string' && bank.amountOre === bank.bookOre
              ? { amount: bank.amountOre, date: bank.date } : null
            // Across dates the signature also changes when the underlying entries are identical.
            const changedBasis = previousMatch && (previousMatch.date === loaded.snapshot.as_of || previousMatch.amount !== result?.bankOre)
            const statusLabel = savedMismatch ? 'Sparad avvikelse'
              : changedBasis ? 'Ändrat underlag'
              : previousMatch ? 'Tidigare matchning'
              : olderTax ? 'Äldre kontroll'
              : row.task === 'income' && row.group === 'optional' && row.detail ? 'Komplettera per år'
              : row.task === 'other' && row.group === 'optional' && !row.saved ? 'Frivillig'
              : row.task === 'buffer' && row.group === 'optional' ? 'Frivillig' : status.label
            const detail = row.detail || (row.task === 'other' && result && (row.group !== 'required' || row.saved)
              ? `${row.group === 'required' ? 'Sparad totalsumma' : 'Andra betalningar i beräkningen'}: ${withdrawalMoney(result.otherOre)}.`
              : row.task === 'buffer' && result
                ? `Buffert i beräkningen: ${withdrawalMoney(result.bufferOre)}.` : '')
            const isActive = row.task === active?.task
            return <li key={row.task}>
              <button type="button" aria-pressed={isActive} aria-controls="withdrawal-guide" onClick={() => selectControl(row.task)}
                className={'flex min-h-12 w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors ' + (isActive ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200' : 'border-transparent hover:bg-slate-50')}>
                {!previousMatch && <span aria-hidden="true" className={'grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ' + status.tone}>{status.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900">{row.label}</span>
                  {previousMatch && <span className="mt-1 block text-xs text-slate-600">Matchade {previousMatch.date} · {withdrawalMoney(previousMatch.amount)}. Kontrollera bankens disponibla saldo före ett nytt uttag.</span>}
                </span>
                <span className={'max-w-28 rounded-full px-2 py-1 text-center text-[11px] leading-tight font-semibold ' + status.tone}>{statusLabel}</span>
              </button>
              {detail && <p className="px-3 pb-2 text-xs text-slate-600">{detail}</p>}
            </li>
          })}
        </ul>
      </section>}
      <section ref={guide} id="withdrawal-guide" tabIndex={-1} aria-labelledby="withdrawal-guide-title"
        className={card + ' scroll-mt-4 space-y-4 p-5 sm:p-6 lg:col-start-2'} hidden={!loaded && !model.saving && !showInline}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Kontrollguide</p>
          <h3 id="withdrawal-guide-title" className="mt-1 text-xl font-bold tracking-tight text-slate-950">{active?.label ?? (showBuffer ? 'Extra buffert' : showCoverage ? 'Tidigare åtaganden' : showBank ? 'Bankens saldo' : showOther ? 'Andra återstående betalningar' : showTaxAccount ? 'Skattekontots saldo' : showIncome ? 'Skattebeslut per år' : 'Öppna en kontroll')}</h3>
          {!showBank && !showOther && !showTaxAccount && !showIncome && <p className="mt-2 text-sm leading-relaxed text-slate-600">{help?.answer ?? 'Välj en kontroll i listan. Äldre sparade uppgifter finns under Tidigare kontroller längst ned.'}</p>}
        </div>
        {activeIssue && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">{activeIssue}</p>}
        {!showCoverage && !showBank && !showOther && !showTaxAccount && !showIncome && help?.steps?.[0] && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-bold text-slate-900">Var hittar jag uppgiften?</h4>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{help.steps[0]}</p>
          {help.sources?.[0] && <a href={help.sources[0].href} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline underline-offset-4">{help.sources[0].label} ↗</a>}
        </div>}
        {showBuffer && <WithdrawalBufferForm model={model} />}
        {showCoverage && <WithdrawalCoverageForm model={model} onStart={() => setSelected('coverage')} />}
        {showBank && <WithdrawalBankForm model={model} onStart={() => setSelected('bank')} />}
        {showOther && <WithdrawalOtherForm model={model} onStart={() => setSelected('other')} />}
        {showTaxAccount && <WithdrawalTaxAccountForm model={model} asOf={asOf} onStart={() => setSelected('tax_account')} />}
        {showIncome && <WithdrawalIncomeForm model={model} asOf={asOf}
          yearText={incomeYearText ?? String(targetIncomeYear ?? asOf.slice(0, 4))} onYearChange={setIncomeYearText}
          onStart={() => {
            setSelected('income')
            setIncomeYearText(incomeYearText ?? String(targetIncomeYear ?? asOf.slice(0, 4)))
          }} onOpenTax={() => selectControl('tax_account')} />}
        <div hidden={showInline}>
          <WithdrawalCardContent model={model} asOf={asOf} annualRateInCard controlsOnly initialTask={active?.task} onOpenVat={onOpenVat} onOpenNe={onOpenNe} />
        </div>
      </section>
    </div>
    <WithdrawalHistory key={owner} owner={owner} sequence={historySession} revisionId={loaded?.snapshot.revision?.id} />
  </section>
}
