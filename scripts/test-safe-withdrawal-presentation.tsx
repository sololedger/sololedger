import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import WithdrawalSummary from '../src/components/WithdrawalSummary'
import OverviewCards from '../src/components/OverviewCards'
import { calculateDashboard } from '../src/lib/calculations'
import { calculateWithdrawal } from '../src/lib/withdrawalModel'
import { buildWithdrawalAssessment } from '../src/lib/withdrawalAssessment'
import { saleWithdrawal } from '../tests/fixtures/withdrawalFixtures'
function result(bankOre: number, issues: string[] = []) {
  return calculateWithdrawal({asOf:'2026-10-19',bankOre,taxAccountOre:0,bufferOre:0,bankQuality:'checked',issues,parts:[{key:'tax',kind:'estimate',ore:30000,quality:'estimated'}]})
}
const negative=result(5000), before=structuredClone(negative)
const html=renderToStaticMarkup(<WithdrawalSummary result={negative} checkedAt={null} />)
assert.match(html,/0 kr/);assert.match(html,/Det saknas 250 kr/);assert.deepEqual(negative,before)
const blocked=renderToStaticMarkup(<WithdrawalSummary result={result(100000,['Äldre skatt okänd'])} checkedAt={null} />)
assert.match(blocked,/<h3[^>]*>Säkert uttag<\/h3>/);assert.match(blocked,/Kan inte beräknas – kontroll krävs/);assert.match(blocked,/inte en rekommendation/);assert.doesNotMatch(blocked,/class="text-2xl/)
const inconsistent = renderToStaticMarkup(<WithdrawalSummary result={{...result(100000,['Saknas']),recommendedOre:999999}} checkedAt={null} />)
assert.doesNotMatch(inconsistent,/class="text-2xl/,'even a contradictory blocked result must never render a recommendation')
const ordinary=renderToStaticMarkup(<WithdrawalSummary result={result(100000)} checkedAt="2026-10-19" />)
assert.match(ordinary,/Uppskattat uttagsutrymme/);assert.match(ordinary,/700 kr/)
const data=calculateDashboard({'1930':9999999},30,{utgaendeMoms:0,ingaendeMoms:0,momsNetto:0})
const missing=renderToStaticMarkup(<OverviewCards data={data} taxRate={30} selectedYear={2026} transactions={[]} journalMap={{}} setActiveModal={()=>{}} activeModal={null} />)
assert.match(missing,/Ladda uttagsunderlaget/);assert.doesNotMatch(missing,/Säkert uttag/)
void (async () => {
process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-offline-key'
const { WithdrawalCardContent } = await import('../src/components/WithdrawalCard')
const seed=saleWithdrawal(),assessment=buildWithdrawalAssessment(seed)
for (const state of ['loading','error','incomplete'] as const) {
  const model={data:state==='incomplete'?{snapshot:seed,assessment:{...assessment,result:result(100000,['Kontroll krävs'])}}:null,loading:state==='loading',error:state==='error'?'Syntetiskt läsfel':null,saving:false,reload:async()=>{},save:async()=>{}}
  const card=renderToStaticMarkup(<WithdrawalCardContent model={model} asOf={seed.as_of} />)
  assert.match(card,/<h3[^>]*>Säkert uttag<\/h3>/)
  assert.doesNotMatch(card,/bg-emerald-50|text-emerald-950|class="text-2xl/)
  if(state==='incomplete')assert.match(card,/Visa beräkning och underlag/)
}
console.log('PASS KAN-97 rendered amounts, negative deficit, critical missing facts and no legacy fallback')
})().catch(error=>{console.error(error);process.exitCode=1})
