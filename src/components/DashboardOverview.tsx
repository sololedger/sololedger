'use client'
import { useState } from 'react'
import OverviewCards, { type OverviewCardsProps } from './OverviewCards'
import { WithdrawalCardContent, useWithdrawalDate } from './WithdrawalCard'
import { useWithdrawal } from '@/hooks/useWithdrawal'
import { withdrawalAnnualRate } from '@/lib/withdrawalAssessment'
import { calculateDashboard, type DashboardBalances } from '@/lib/calculations'
import type { MomsBreakdown } from '@/lib/accountingService'

type Props = Omit<OverviewCardsProps, 'data' | 'taxRate' | 'withdrawal' | 'taxControl'> & {
  owner: string; refreshKey: unknown; balances: DashboardBalances; bankSaldo: number; momsBreakdown: MomsBreakdown
  onOpenVat?: () => void; onOpenNe?: () => void
}

export default function DashboardOverview(props: Props) {
  const asOf = useWithdrawalDate()
  return <DashboardSession key={`${props.owner}:${asOf}`} {...props} asOf={asOf} />
}

function DashboardSession({ owner, refreshKey, balances, bankSaldo, momsBreakdown, onOpenVat, onOpenNe, asOf, ...cards }: Props & { asOf: string }) {
  // One read/save lifecycle for both cards: conflicts and failed reads mask both.
  const model = useWithdrawal(owner, asOf, refreshKey)
  const loaded = model.data
  const [notice, setNotice] = useState<{ year: number; text: string } | null>(null)
  const rate = loaded ? withdrawalAnnualRate(loaded.assessment.facts, cards.selectedYear) : null
  const data = calculateDashboard(balances, rate ?? 0, momsBreakdown)
  data.bankSaldo = bankSaldo
  const income = loaded?.assessment.facts.find(f => f.key === `income:${cards.selectedYear}`)?.value
  const persisted = loaded?.assessment.facts.some(f => (f.key === `rate:${cards.selectedYear}` || f.key === `income:${cards.selectedYear}`) && typeof f.value.rate === 'number') ?? false
  const final = income?.finalOre !== null && income?.finalOre !== undefined
  return <OverviewCards {...cards} data={data} taxRate={rate}
    taxControl={loaded && rate !== null ? <AnnualRateEditor key={`${cards.selectedYear}:${loaded.snapshot.revision?.id ?? 'default'}:${loaded.snapshot.signature}`}
      model={model} year={cards.selectedYear} asOf={asOf} rate={rate} final={final} persisted={persisted}
      notice={notice?.year === cards.selectedYear ? notice.text : ''} onNotice={text => setNotice({ year: cards.selectedYear, text })} /> : <p className="text-sm">Årsprocenten visas när uttagsunderlaget har laddats.</p>}
    withdrawal={<WithdrawalCardContent model={model} asOf={asOf} annualRateInCard onOpenVat={onOpenVat} onOpenNe={onOpenNe} />} />
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
  return <div className="mt-3 space-y-2 text-sm">
    <label className="block">Uppskattad skatt och egenavgifter för {year}
      <input className="block w-full accent-orange-600 min-h-11" type="range" min={25} max={55} step={1} value={draft}
        disabled={model.saving || !supportedYear} onChange={e => { setDraft(Number(e.target.value)); onNotice('') }} />
    </label>
    <p>{persisted ? `Sparad årsprocent: ${rate} %` : `Standardprocent: ${rate} % (inte sparad)`}</p>
    {dirty && <p role="status">Osparad ändring: {draft} %. Beloppen använder fortfarande {rate} %.</p>}
    {final && <p>Slutlig skatt finns för {year}. Procenten gäller bara skatteexemplet; Säkert uttag använder det sparade slutliga nettobeskedet.</p>}
    {!supportedYear && <p>Årsprocent kan sparas till och med innevarande inkomstår.</p>}
    <button type="button" className="rounded bg-orange-800 text-white px-3 py-2 min-h-11 disabled:opacity-50"
      disabled={(!dirty && persisted) || model.saving || !supportedYear} onClick={() => void save()} aria-label={`Spara årsprocent för ${year}`}>
      {model.saving ? 'Sparar…' : 'Spara'}
    </button>
    {notice && <p role="alert">{notice}</p>}
  </div>
}
