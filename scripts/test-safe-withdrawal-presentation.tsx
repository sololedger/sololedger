import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import WithdrawalSummary from '../src/components/WithdrawalSummary'
import OverviewCards from '../src/components/OverviewCards'
import { calculateDashboard } from '../src/lib/calculations'
import { calculateWithdrawal } from '../src/lib/withdrawalModel'
function result(bankOre: number, issues: string[] = []) {
  return calculateWithdrawal({asOf:'2026-10-19',bankOre,taxAccountOre:0,bufferOre:0,bankQuality:'checked',issues,parts:[{key:'tax',kind:'estimate',ore:30000,quality:'estimated'}]})
}
const negative=result(5000), before=structuredClone(negative)
const html=renderToStaticMarkup(<WithdrawalSummary result={negative} checkedAt={null} />)
assert.match(html,/0 kr/);assert.match(html,/Det saknas 250 kr/);assert.deepEqual(negative,before)
const blocked=renderToStaticMarkup(<WithdrawalSummary result={result(100000,['Äldre skatt okänd'])} checkedAt={null} />)
assert.match(blocked,/Viktig uppgift saknas/);assert.match(blocked,/inte en rekommendation/);assert.doesNotMatch(blocked,/class="text-2xl/)
const ordinary=renderToStaticMarkup(<WithdrawalSummary result={result(100000)} checkedAt="2026-10-19" />)
assert.match(ordinary,/Uppskattat uttagsutrymme/);assert.match(ordinary,/700 kr/)
const data=calculateDashboard({'1930':9999999},30,{utgaendeMoms:0,ingaendeMoms:0,momsNetto:0})
const missing=renderToStaticMarkup(<OverviewCards data={data} taxRate={30} selectedYear={2026} transactions={[]} journalMap={{}} setActiveModal={()=>{}} activeModal={null} />)
assert.match(missing,/Ladda uttagsunderlaget/);assert.doesNotMatch(missing,/Säkert uttag/)
console.log('PASS KAN-97 rendered amounts, negative deficit, critical missing facts and no legacy fallback')
