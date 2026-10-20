'use client'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useWithdrawal } from '@/hooks/useWithdrawal'
import { toOre } from '@/lib/withdrawalModel'
import { stableWithdrawalValue, withdrawalAnnualRate, type WithdrawalFact } from '@/lib/withdrawalAssessment'
import WithdrawalSummary from './WithdrawalSummary'

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

export function WithdrawalCardContent({ model, asOf, onOpenVat, onOpenNe, annualRateInCard = false }: {
  model: ReturnType<typeof useWithdrawal>; asOf: string; onOpenVat?: () => void; onOpenNe?: () => void; annualRateInCard?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [task, setTask] = useState('coverage')
  const [amount, setAmount] = useState('')
  const [sign, setSign] = useState('surplus')
  const [year, setYear] = useState(asOf.slice(0, 4))
  const [rate, setRate] = useState('45')
  const [debited, setDebited] = useState('0')
  const [pending, setPending] = useState('0')
  const [incomeMode, setIncomeMode] = useState('estimate')
  const [confirmed, setConfirmed] = useState(false)
  const [notice, setNotice] = useState('')
  const [editSignature, setEditSignature] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLHeadingElement>(null)
  const error = useRef<HTMLParagraphElement>(null)
  const id = useId()
  useEffect(() => { if (open) panel.current?.focus() }, [open, task])
  useEffect(() => { if (notice) error.current?.focus() }, [notice])
  const loaded = model.data
  function choose(next: string, forYear = year) {
    setTask(next); setConfirmed(false); setNotice('')
    setEditSignature(loaded?.snapshot.signature ?? null)
    const facts = loaded?.assessment.facts ?? []
    const f = facts.find(f => f.key === (next === 'income' ? `income:${forYear}` : next === 'rate' ? `rate:${forYear}` : next))?.value
    setAmount(f && typeof (f.saldoOre ?? f.amountOre ?? f.finalOre) === 'number' ? String(Math.abs(Number(f.saldoOre ?? f.amountOre ?? f.finalOre)) / 100) : '')
    if (next === 'tax_account') setSign(Number(f?.saldoOre ?? 0) < 0 ? 'deficit' : 'surplus')
    setRate(String(withdrawalAnnualRate(facts, Number(forYear)))); setDebited(String(Number(f?.debitedOre ?? 0) / 100)); setPending(String(Number(f?.pendingOre ?? 0) / 100))
    setIncomeMode(f?.finalOre !== null && f?.finalOre !== undefined ? 'final' : 'estimate')
  }
  function startReview() {
    if (!loaded) return
    const first = loaded.assessment.result.issues[0] ?? ''
    const matchedYear = first.match(/\b(19|20)\d{2}\b/)?.[0] ?? year
    setYear(matchedYear)
    const task = !loaded.assessment.facts.some(f => f.key === 'coverage') || first.includes('äldre åtaganden') ? 'coverage'
      : /skattebelopp för|debiterad skatt för|Resultatunderlaget för den fasta skatteuppgiften/.test(first) ? 'income'
      : /Andra betalningar|andra återstående/.test(first) ? 'other'
      : first.includes('Bankens') ? 'bank'
      : /Momsunderlaget|NE-underlaget|utanför|konton|balanserar|Journal|journalunderlag|Långfristiga/.test(first) ? 'review' : 'tax_account'
    choose(task, matchedYear)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!loaded) return
    try {
      if (editSignature !== loaded.snapshot.signature) throw new Error('Underlaget har ändrats medan panelen var öppen. Stäng och öppna den igen och kontrollera uppgiften på nytt.')
      const a = loaded.assessment
      let key = task
      let value: Record<string, unknown>
      const money = (text: string) => { if (!(task === 'bank' ? /^-?\d+(?:[.,]\d{1,2})?$/ : /^\d+(?:[.,]\d{1,2})?$/).test(text.trim())) throw new Error('Ange ett belopp, exempelvis 1250,50.'); return toOre(text.trim().replace(',', '.')) }
      if (task === 'coverage') {
        if (!confirmed) throw new Error('Bekräfta bara om underlaget verkligen omfattar tidigare åtaganden. Om du är osäker, kontrollera dem först.')
        value = { from: a.firstDate, noEarlierObligations: true }
      } else if (task === 'tax_account') {
        if (!confirmed) throw new Error('Kontrollera först att registrerade skattehändelser finns med i saldot.')
        value = { date: asOf, saldoOre: money(amount) * (sign === 'deficit' ? -1 : 1), basis: a.financialBasis }
      } else if (task === 'income' || task === 'rate') {
        if (task === 'income' && !a.facts.some(f => f.key === 'tax_account')) throw new Error('Kontrollera först skattekontots saldo. Sedan kan beslutet stämmas av utan dubbelräkning.')
        const n = Number(year)
        if (!Number.isInteger(n) || n < 1900 || n > Number(asOf.slice(0, 4))) throw new Error('Ange ett giltigt inkomstår.')
        const percentage = annualRateInCard ? withdrawalAnnualRate(a.facts, n) : Number(rate)
        if (!Number.isInteger(percentage) || percentage < 25 || percentage > 55) throw new Error('Ange en uppskattning mellan 25 och 55 %.')
        key = `${task}:${n}`
        value = task === 'rate' ? { rate: percentage } : { rate: percentage, debitedOre: money(debited), pendingOre: money(pending), finalOre: incomeMode === 'final' ? money(amount) : null, basis: a.incomeBases[n] ?? '{}', taxBasis: stableWithdrawalValue(a.facts.find(f => f.key === 'tax_account')?.value) }
      } else if (task === 'bank') value = { date: asOf, amountOre: money(amount), bookOre: a.result.bankOre, signature: loaded.snapshot.signature }
      else value = { amountOre: money(amount), ...(task === 'other' ? { basis: a.otherBasis } : {}) }
      // Both annual forms write the same active rate, for this year only.
      const rateKey = `rate:${Number(year)}`
      const facts: WithdrawalFact[] = task === 'income' && !annualRateInCard
        ? [...a.facts.filter(f => f.key !== key && f.key !== rateKey), { key, value }, { key: rateKey, value: { rate: value.rate } }]
        : [...a.facts.filter(f => f.key !== key), { key, value }]
      await model.save(facts)
      setNotice(''); setOpen(false); button.current?.focus()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Uppgiften kunde inte sparas.') }
  }
  const tone = !model.loading && !model.error && loaded?.assessment.result.status === 'calculated'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : model.error || loaded?.assessment.result.status === 'incomplete'
      ? 'border-amber-300 bg-amber-50 text-amber-950'
      : 'border-slate-200 bg-slate-50 text-slate-950'
  return <section className={`rounded-2xl border p-4 min-w-0 ${tone}`} aria-label="Uttagsutrymme">
    {(model.loading || model.error || !loaded) && <h3 className="font-bold">Säkert uttag</h3>}
    {model.loading ? <p role="status">Laddar uttagsunderlag…</p> : model.error ? <div role="alert"><p className="font-semibold">Uttagsunderlaget kunde inte hämtas</p><p>{model.error}</p><button type="button" onClick={() => void model.reload()} className="underline min-h-11">Försök igen</button></div> : loaded && <WithdrawalSummary result={loaded.assessment.result} checkedAt={loaded.assessment.checkedAt} taxRates={loaded.assessment.taxRates} />}
    {loaded && <>
      {loaded.assessment.result.status === 'incomplete' && <div>{onOpenVat && loaded.assessment.result.issues.some(i => i.includes('Momsunderlaget')) && <button type="button" onClick={onOpenVat} className="underline min-h-11">Öppna momsrapporten</button>}{onOpenNe && loaded.assessment.result.issues.some(i => i.includes('NE-underlaget')) && <button type="button" onClick={onOpenNe} className="underline min-h-11">Öppna NE-underlaget</button>}</div>}
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} className="underline font-bold min-h-11 mt-2" onClick={() => { if (!open) startReview(); setOpen(!open) }}> {open ? 'Stäng underlaget' : loaded.assessment.result.status === 'incomplete' ? 'Visa hur jag gör' : 'Visa underlag eller ändra uppgift'}</button>
      {open && <div id={id} className="border-t border-current/20 mt-2 pt-4">
        <h4 ref={panel} tabIndex={-1} className="font-bold">Kontrollera en uppgift</h4>
        <p className="text-sm">Uppgifterna sparas daterat för din firma. Bokföringen ändras inte. Tidigare kontroller återanvänds när underlaget tillåter det.</p>
        {loaded.assessment.facts.length > 0 && <details className="text-sm my-2"><summary>Sparade kontroller och bedömningar</summary><ul>{loaded.assessment.facts.map(f => <li key={f.key}>{f.key.startsWith('income:') ? `Skatteuppgift ${f.key.slice(7)}` : f.key.startsWith('rate:') ? `Skatteuppskattning ${f.key.slice(5)}` : ({coverage:'Tidigare åtaganden',tax_account:'Skattekonto',other:'Andra betalningar',bank:'Bank',buffer:'Buffert'} as Record<string,string>)[f.key]} · {f.observed_on ?? loaded.snapshot.revision?.as_of_date} · {f.source === 'user_estimate' ? 'din uppskattning' : 'din uppgift/kontroll'}</li>)}</ul></details>}
        <label className="block my-3">Vad vill du kontrollera?<select value={task} onChange={e => choose(e.target.value)} className="block w-full border rounded p-2 bg-white">
          <option value="coverage">Tidigare åtaganden</option><option value="tax_account">Skattekontots saldo</option>{!annualRateInCard && <option value="rate">Förbättra årsuppskattningen</option>}<option value="income">Preliminärskatt eller slutskattebesked</option><option value="bank">Jämför bankens saldo</option><option value="other">Andra återstående betalningar</option><option value="buffer">Extra buffert</option>
          <option value="review">Granska befintligt bokföringsunderlag</option>
        </select></label>
        {task === 'review' ? <p>{loaded.assessment.result.issues[0] ?? 'Granska de beräknade delbeloppen och deras underlag.'} En bokföringskonflikt kan inte rättas med ett annat rådgivningsbelopp. Använd ordinarie rapport eller rättelseväg.</p> : <form onSubmit={e => void submit(e)} className="space-y-3">
          {task === 'coverage' && <><p>Kontrollera bokföring och skatteunderlag före {loaded.assessment.firstDate}. En äldre skuld får inte försvinna för att firman börjar använda SoloLedger. Kontrollera också om andra skatter eller obetalda betalningar ska finansieras från företagsbanken. Finns sådana belopp, komplettera dem innan du använder en uttagsrekommendation.</p><label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Underlaget omfattar tidigare åtaganden; inga ytterligare äldre belopp saknas.</label></>}
          {task === 'tax_account' && <><p>Öppna <a className="underline" href="https://www.skatteverket.se/privat/skatter/skattekontobetalaochfatillbaka" target="_blank" rel="noreferrer">Skatteverket → Skattekonto → saldo och kontohistorik</a>. Läs saldot per {asOf}. Vi behöver det eftersom en inbetalning inte är öronmärkt för en viss skatt.</p><label className="block">Saldot är<select className="block w-full p-2 border bg-white" value={sign} onChange={e => setSign(e.target.value)}><option value="surplus">Ett överskott</option><option value="deficit">Ett underskott</option></select></label><p className="text-sm">Registrerade avräkningar: {loaded.snapshot.events.length}. Registrerade överföringar: {loaded.snapshot.movements.length}. Jämför dem med kontohistoriken. Saknas en avräkning i bokföringen, använd befintliga momsflödet; ett annat saldo rättar inte journalen.</p><label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Registrerade händelser fram till datumet ingår i saldot och inget behöver utredas.</label></>}
          {(task === 'rate' || task === 'income') && <><label className="block">Inkomstår<input className="block w-full border p-2" type="number" min="1900" max={asOf.slice(0, 4)} value={year} onChange={e => { setYear(e.target.value); choose(task,e.target.value) }} /></label><p className="text-sm">Tidigare positiva resultatår: {loaded.assessment.taxYears.join(', ') || 'inga registrerade'}. Skatt och egenavgifter uppskattas tillsammans, inte som två påslag.</p>{annualRateInCard ? <p>Årsprocent för {year}: {withdrawalAnnualRate(loaded.assessment.facts, Number(year))} %. Ändra den i Dashboardens skattekort för samma år.</p> : <label className="block">Uppskattad sammanlagd procent<input className="block w-full border p-2" type="number" min="25" max="55" value={rate} onChange={e => setRate(e.target.value)} /></label>}</>}
          {task === 'income' && <><p>Läs beslutet och skattekontohistoriken för valt inkomstår. Debiterad preliminärskatt är inte samma sak som inbetalda pengar. Kontrollera även skattekontosaldot.</p><label className="block">Underlag<select className="block w-full border p-2 bg-white" value={incomeMode} onChange={e => setIncomeMode(e.target.value)}><option value="estimate">Uppskattning och preliminärskattebeslut</option><option value="final">Slutskattebesked finns</option></select></label>{incomeMode === 'estimate' && <><label className="block">Preliminärskatt som redan debiterats och ingår i avstämningen<input className="block w-full border p-2" inputMode="decimal" value={debited} onChange={e => setDebited(e.target.value)} /></label><label className="block">Beslutad preliminärskatt som ännu inte ingår i saldot<input className="block w-full border p-2" inputMode="decimal" value={pending} onChange={e => setPending(e.target.value)} /></label></>}</>}
          {!['coverage', 'rate'].includes(task) && !(task === 'income' && incomeMode === 'estimate') && <label className="block">{task === 'income' ? 'Ytterligare nettobelopp enligt beskedet som ännu inte ingår i skattekontosaldot (0 om allt ingår)' : task === 'bank' ? `Disponibelt saldo på företagskonto 1930 per ${asOf}` : task === 'other' ? 'Total av andra återstående betalningar, inklusive redan bokförda skulder' : 'Belopp i kronor'}<input className="block w-full border rounded p-2" inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} /></label>}
          {task === 'other' && <p>Räkna varje betalning en gång. Summan ersätter denna reserv, den läggs inte ovanpå samma bokförda skuld. Ingen leverantörsfaktura skapas.</p>}
          {notice && <p ref={error} tabIndex={-1} role="alert" className="text-red-800">{notice}</p>}
          <button className="rounded bg-emerald-800 text-white px-4 py-3 disabled:opacity-50" disabled={model.saving}> {model.saving ? 'Sparar…' : 'Spara kontrollen'}</button>
          <p className="text-xs">Sparat ursprung: din kontroll eller bedömning. Ny version skapas när du ändrar en uppgift.</p>
        </form>}
      </div>}
    </>}
  </section>
}
