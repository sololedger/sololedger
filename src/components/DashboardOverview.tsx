'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import OverviewCards, { type OverviewCardsProps } from './OverviewCards'
import { WithdrawalCardContent, useWithdrawalDate } from './WithdrawalCard'
import { useWithdrawal } from '@/hooks/useWithdrawal'
import { withdrawalAnnualRate } from '@/lib/withdrawalAssessment'
import { calculateDashboard, type DashboardBalances } from '@/lib/calculations'
import type { MomsBreakdown } from '@/lib/accountingService'
import type { ResultClosingReview } from '@/lib/resultClosingReview'
import ResultClosingNotice from './ResultClosingNotice'

type Props = Omit<OverviewCardsProps, 'data' | 'taxRate' | 'withdrawal'> & {
  taxControlTarget: HTMLElement | null
  resultClosingReview?: ResultClosingReview
  owner: string; refreshKey: unknown; balances: DashboardBalances; bankSaldo: number; momsBreakdown: MomsBreakdown
  onOpenVat?: () => void; onOpenNe?: () => void
}

export default function DashboardOverview(props: Props) {
  const asOf = useWithdrawalDate()
  return <DashboardSession key={`${props.owner}:${asOf}`} {...props} asOf={asOf} />
}

function DashboardSession({ owner, refreshKey, balances, bankSaldo, momsBreakdown, onOpenVat, onOpenNe, taxControlTarget, resultClosingReview, asOf, ...cards }: Props & { asOf: string }) {
  // One read/save lifecycle for both cards: conflicts and failed reads mask both.
  const model = useWithdrawal(owner, asOf, refreshKey)
  const loaded = model.data
  const [notice, setNotice] = useState<{ year: number; text: string } | null>(null)
  const rate = loaded ? withdrawalAnnualRate(loaded.assessment.facts, cards.selectedYear) : null
  const data = calculateDashboard(balances, rate ?? 0, momsBreakdown, resultClosingReview)
  data.bankSaldo = bankSaldo
  const income = loaded?.assessment.facts.find(f => f.key === `income:${cards.selectedYear}`)?.value
  const persisted = loaded?.assessment.facts.some(f => (f.key === `rate:${cards.selectedYear}` || f.key === `income:${cards.selectedYear}`) && typeof f.value.rate === 'number') ?? false
  const final = income?.finalOre !== null && income?.finalOre !== undefined
  return <>
    <ResultClosingNotice review={resultClosingReview} />
    {taxControlTarget && createPortal(loaded && rate !== null ? <AnnualRateEditor key={`${cards.selectedYear}:${loaded.snapshot.revision?.id ?? 'default'}:${loaded.snapshot.signature}`}
      model={model} year={cards.selectedYear} asOf={asOf} rate={rate} final={final} persisted={persisted}
      notice={notice?.year === cards.selectedYear ? notice.text : ''} onNotice={text => setNotice({ year: cards.selectedYear, text })} /> : <p className="text-xs text-slate-600">Årsprocenten visas när uttagsunderlaget har laddats.</p>, taxControlTarget)}
    <OverviewCards {...cards} data={data} taxRate={rate}
    withdrawal={<WithdrawalCardContent model={model} asOf={asOf} annualRateInCard onOpenVat={onOpenVat} onOpenNe={onOpenNe} />} />
  </>
}

function AnnualRateEditor({ model, year, asOf, rate, final, persisted, notice, onNotice }: {
  model: ReturnType<typeof useWithdrawal>; year: number; asOf: string; rate: number; final: boolean; persisted: boolean; notice: string; onNotice: (text: string) => void
}) {
  const [draft, setDraft] = useState(rate)
  const dirty = draft !== rate
  const supportedYear = Number.isInteger(year) && year >= 1900 && year <= Number(asOf.slice(0, 4))
  async function save() {
    const loaded = model.data
    if (!loaded || (!dirty && persisted) || !supportedYear) return
    onNotice('')
    try {
      const key = `rate:${year}`
      await model.save([...loaded.assessment.facts.filter(f => f.key !== key), { key, value: { rate: draft } }])
    } catch (e) { onNotice(e instanceof Error ? e.message : 'Årsprocenten kunde inte sparas.') }
  }
  return <div className="max-w-full">
    <div className="h-10 flex items-center gap-3 bg-white px-3 rounded-xl border border-gray-200 shadow-sm">
      <label className="flex items-center gap-3">
        <span className="text-[10px] font-black uppercase text-gray-400 italic">Skatt</span>
        <input aria-label={`Uppskattad skatt och egenavgifter för ${year}`} className="w-20 accent-emerald-500 cursor-pointer" type="range" min={25} max={55} step={1} value={draft}
          disabled={model.saving || !supportedYear} onChange={e => { setDraft(Number(e.target.value)); onNotice('') }} />
        <span className="text-sm font-black text-emerald-600 tabular-nums whitespace-nowrap" title={`Årsprocent för ${year}`}>{persisted ? `Sparad: ${rate} %` : `Ej sparad: ${rate} %`}</span>
      </label>
      {(dirty || !persisted || model.saving) && <button type="button" className="rounded-lg bg-emerald-700 text-white px-3 h-8 text-xs font-bold disabled:opacity-50"
        disabled={(!dirty && persisted) || model.saving || !supportedYear} onClick={() => void save()} aria-label={`Spara årsprocent för ${year}`}>
        {model.saving ? 'Sparar…' : 'Spara'}
      </button>}
    </div>
    {!persisted && <p className="text-xs text-slate-600 mt-1 max-w-sm">Standardprocent: {rate} % (inte sparad)</p>}
    {dirty && <p className="text-xs text-amber-800 mt-1 max-w-sm" role="status">Osparad ändring: {draft} %. Beloppen använder fortfarande {rate} %.</p>}
    {final && <p className="text-xs mt-1 max-w-sm">Slutlig skatt finns för {year}. Procenten gäller bara skatteexemplet; Säkert uttag använder det sparade slutliga nettobeskedet.</p>}
    {!supportedYear && <p className="text-xs mt-1 max-w-sm">Årsprocent kan sparas till och med innevarande inkomstår.</p>}
    {notice && <p className="text-xs text-red-800 mt-1 max-w-sm" role="alert">{notice}</p>}
  </div>
}
