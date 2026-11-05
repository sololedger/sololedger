import type { WithdrawalResult } from '@/lib/withdrawalModel'

export const withdrawalMoney = (ore: number) => (ore / 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' kr'
export const withdrawalDisplayAmount = (ore: number) => withdrawalMoney(Math.floor(ore / 100) * 100)

export default function WithdrawalSummary({ result, checkedAt, taxRates = [], compact = false }: { result: WithdrawalResult; checkedAt: string | null; taxRates?: string[]; compact?: boolean }) {
  const recommendedOre = result.status === 'incomplete' ? null : result.recommendedOre
  if (compact) return <div className="space-y-1">
    <h3 className="text-xs font-black uppercase tracking-widest opacity-70">Säkert uttag</h3>
    <div role="status">
      {recommendedOre !== null && <p className="break-words text-2xl leading-tight font-black">{withdrawalDisplayAmount(recommendedOre)}</p>}
      <p className="text-xs font-bold">{recommendedOre === null ? 'Kan inte beräknas' : result.status === 'estimated' ? 'Uppskattat' : 'Beräknat'}</p>
    </div>
    <p className="text-xs opacity-90">{recommendedOre === null ? 'En kontroll krävs.' : 'Utifrån bokföring och reserver.'}</p>
  </div>

  return <div>
    <h3 className="font-bold">Säkert uttag</h3>
    <p role="status" className="mt-1 font-semibold">{result.status === 'incomplete' ? 'Kan inte beräknas – kontroll krävs' : result.status === 'estimated' ? 'Uppskattat uttagsutrymme' : 'Beräknat uttagsutrymme'}</p>
    {recommendedOre !== null && <p className="my-2 break-words text-xl font-black">{withdrawalDisplayAmount(recommendedOre)}</p>}
    <p className="text-xs my-2">Beräknat per {result.asOf}. {checkedAt ? `Skattekontot kontrollerades av dig ${checkedAt}.` : 'Skattekontokredit används inte utan avstämning.'}</p>
    <dl className="text-sm space-y-1">
      <div><dt className="inline">Bokförd företagsbank: </dt><dd className="inline">{withdrawalMoney(result.bankOre)}</dd></div>
      <div><dt className="inline">Moms före gemensam avräkning: </dt><dd className="inline">{withdrawalMoney(result.vatOre)}</dd></div>
      <div><dt className="inline">Skatt och egenavgifter före avräkning: </dt><dd className="inline">{withdrawalMoney(result.incomeTaxOre)}</dd></div>
      <div><dt className="inline">{checkedAt ? checkedAt === result.asOf ? 'Skattekontosaldo: ' : 'Framskrivet skattekontosaldo: ' : 'Skattekontoavräkning: '}</dt><dd className="inline">{result.taxAccountOre === null ? 'behöver kontrolleras' : checkedAt ? withdrawalMoney(result.taxAccountOre) : 'ingen kredit eller finansiering tillgodoräknas'}</dd></div>
      <div><dt className="inline">Andra betalningar: </dt><dd className="inline">{withdrawalMoney(result.otherOre)}</dd></div>
      <div><dt className="inline">Extra buffert: </dt><dd className="inline">{withdrawalMoney(result.bufferOre)}</dd></div>
    </dl>
    {result.taxAccountOre !== null && result.taxAccountOre > 0 && <p className="text-xs mt-3">Beräkningen behåller hela reserven för moms och skatt eftersom överskottet på skattekontot kan behövas till andra skatter eller betalas ut.</p>}
    {result.status !== 'incomplete' && result.recommendedOre !== null && result.reserveOre !== null && <p className="text-xs mt-3">Bank {withdrawalMoney(result.bankOre)} − kvar att finansiera för moms/skatt {withdrawalMoney(result.reserveOre)} − andra betalningar {withdrawalMoney(result.otherOre)} − buffert {withdrawalMoney(result.bufferOre)}.</p>}
    {result.rawOre !== null && result.rawOre < 0 && result.status !== 'incomplete' && <p className="mt-2">Det saknas {withdrawalMoney(-result.rawOre)} för de betalningar och reserver som visas.</p>}
    {result.status === 'incomplete' && <div className="mt-2 text-sm" role="status"><p>{result.issues[0]}</p><p>Delbeloppen är underlag, inte en rekommendation att ta ut pengar.</p></div>}
    {result.status === 'estimated' && <div className="text-xs mt-3">{result.estimationNotes.map(note => <p key={note}>{note}</p>)}{taxRates.length > 0 && <p>Årsprocenter: {taxRates.join('; ')}.</p>}<p>Framskrivna uppgifter förutsätter att andra relevanta händelser inte saknas.</p></div>}
    {result.status === 'calculated' && <p className="text-xs mt-3">Utifrån kontrollerade uppgifter.</p>}
    <p className="text-xs mt-3">Framtida utgifter utöver visade reserver ingår inte. Beloppet är ingen garanti för faktisk skatt eller bankbehållning.</p>
  </div>
}
