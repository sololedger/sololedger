import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculateWithdrawal, toOre, type WithdrawalPart } from '../src/lib/withdrawalModel.ts'
import { buildWithdrawalAssessment, stableWithdrawalValue, validateWithdrawalSnapshot } from '../src/lib/withdrawalAssessment.ts'
import { addWithdrawalFact as fact, addWithdrawalTx as tx, checkWithdrawalTax as tax, emptyWithdrawal, saleWithdrawal, sealWithdrawal } from '../tests/fixtures/withdrawalFixtures.ts'

let count = 0
function eq(actual: unknown, expected: unknown, label: string) { assert.deepEqual(actual, expected, label); count++ }
const cases = JSON.parse(readFileSync(new URL('../tests/fixtures/withdrawalMath.json', import.meta.url), 'utf8')) as {id:string;L:number;S:number|null;V:number;P:number;E:number|null;N:number;B:number;raw:number|null;recommended:number|null}[]
for (const c of cases) {
  const parts: WithdrawalPart[] = [ ['vat','vat',c.V], ['preliminary','preliminary',c.P], ['estimate','estimate',c.E ?? 0], ['other','other',c.N] ].map(([key,kind,ore]) => ({ key: key as string, kind: kind as WithdrawalPart['kind'], ore: Number(ore)*100, quality:'estimated' }))
  const r = calculateWithdrawal({asOf:'2027-01-20',bankOre:c.L*100,taxAccountOre:c.S===null?null:c.S*100,parts,bufferOre:c.B*100,bankQuality:'checked',issues:c.E===null?['Skatt okänd']:[]})
  eq(r.rawOre,c.raw===null?null:c.raw*100,c.id+' raw')
  eq(r.recommendedOre,c.recommended===null?null:c.recommended*100,c.id+' recommendation')
}
for (const bad of [NaN, Infinity, null, '', undefined]) { assert.throws(()=>toOre(bad)); count++ }
const s = saleWithdrawal()
const evaluate = () => buildWithdrawalAssessment(sealWithdrawal(s))
eq(evaluate().result.recommendedOre,7000000,'manual year 2 without new questions; covered stored baseline')
eq(evaluate().result.status,'estimated','tax remains labelled estimated')
for (const date of ['2026-12-31','2027-01-20','2028-01-20']) { s.as_of=date; eq(evaluate().result.recommendedOre,7000000,'no release on year boundary '+date) }
s.as_of='2027-01-20'
tx(s,'closing','2026-12-31','vat_closing',[['2611',25000],['2650',-25000]])
s.periods[0] = {id:'p',user_id:s.user_id,period_start:'2026-01-01',period_end:'2026-12-31',source:'sololedger',status:'closed',closing_amount:25000}
eq(evaluate().result.recommendedOre,7000000,'closing does not release VAT')
s.periods[0].status='declared'
eq(evaluate().result.recommendedOre,7000000,'declaring does not pay VAT')
tax(s,0,'2027-01-01')
tx(s,'settle','2027-01-10','vat_settlement',[['2650',25000],['2012',-25000]])
s.events.push({id:'e',user_id:s.user_id,transaction_id:'settle',vat_period_id:'p',event_date:'2027-01-10',event_kind:'vat_debit',amount:25000})
eq(evaluate().result.recommendedOre,7000000,'new debit projects old check without question, pure reclassification')
tx(s,'pay','2027-01-12','tax_account_movement',[['2012',25000],['1930',-25000]])
s.movements.push({id:'m',user_id:s.user_id,transaction_id:'pay',vat_period_id:'p',movement_date:'2027-01-12',movement_kind:'business_to_tax_account',amount:25000})
eq(evaluate().result.status,'incomplete','payment inclusion unknown must not produce stale recommendation')
tax(s,0)
eq(evaluate().result.recommendedOre,7000000,'paid VAT not reserved twice after one current check')
eq(evaluate().result.vatOre,0,'VAT represented on tax account is not another payable')
eq(evaluate().result.recommendedOre,7000000,'saved check reused')
const old = s.events[0].amount;s.events[0].amount=24000
eq(evaluate().result.status,'incomplete','edited anchor evidence becomes stale')
s.events[0].amount=old
const ordinary = saleWithdrawal(); ordinary.as_of='2026-12-31'
tx(ordinary,'new','2026-12-20','manual',[['1930',25000],['3010',-20000],['2611',-5000]])
eq(buildWithdrawalAssessment(sealWithdrawal(ordinary)).result.recommendedOre,8400000,'ordinary sale automatic, no recheck')
const cost = saleWithdrawal()
tx(cost,'cost','2026-12-20','manual',[['5420',1000],['2641',250],['1930',-1250]])
eq(buildWithdrawalAssessment(sealWithdrawal(cost)).result.recommendedOre,6930000,'ordinary cost automatic')
const missing = saleWithdrawal(); missing.revision=null
eq(buildWithdrawalAssessment(missing).result.recommendedOre,null,'first app year is not evidence of no earlier debts')
const fresh = emptyWithdrawal('2026-10-19')
fact(fresh,'coverage',{from:'2026-10-19',noEarlierObligations:true})
eq(buildWithdrawalAssessment(sealWithdrawal(fresh)).result.recommendedOre,0,'documented new firm does not need a tax guide')
const salary = saleWithdrawal();tx(salary,'personnel','2026-12-20','manual',[['7632',100],['1930',-100]])
eq(buildWithdrawalAssessment(sealWithdrawal(salary)).result.status,'incomplete','unsupported tax treatment blocks instead of guessing')
const foreign = saleWithdrawal();foreign.journal[0].user_id='synthetic-b'
assert.throws(()=>validateWithdrawalSnapshot(foreign,'synthetic-a',foreign.as_of));count++
const duplicate = saleWithdrawal();duplicate.journal.push(duplicate.journal[0])
assert.throws(()=>buildWithdrawalAssessment(duplicate));count++
const debt= saleWithdrawal();tx(debt,'supplier','2026-12-20','manual',[['5420',10000],['2440',-10000]])
eq(buildWithdrawalAssessment(sealWithdrawal(debt)).result.status,'incomplete','known debts need scope, not a duplicated reserve')
const before=buildWithdrawalAssessment(sealWithdrawal(debt));fact(debt,'other',{amountOre:1000000,basis:before.otherBasis})
eq(buildWithdrawalAssessment(sealWithdrawal(debt)).result.otherOre,1000000,'other total replaces same booked debt')
const final=saleWithdrawal();tax(final,-2000000)
fact(final,'income:2026',{rate:30,debitedOre:2000000,pendingOre:0,finalOre:1500000,basis:stableWithdrawalValue({'3010':-100000}),taxBasis:stableWithdrawalValue(final.revision!.facts.find(f=>f.key==='tax_account')!.value)})
eq(buildWithdrawalAssessment(final).result.incomeTaxOre,1500000,'final net replaces previous estimate, not whole final plus prelim')
tax(final,-3500000)
eq(buildWithdrawalAssessment(final).result.status,'incomplete','new tax-account check cannot silently count previously pending final tax twice')
const snapshot=structuredClone(saleWithdrawal()); snapshot.transactions[0].source='sie_import'
eq(buildWithdrawalAssessment(snapshot).result.status,'incomplete','no silent manual fallback for SIE')
const checked=emptyWithdrawal('2027-01-20'); fact(checked,'coverage',{from:checked.as_of,noEarlierObligations:true});tax(checked,0)
fact(checked,'bank',{date:checked.as_of,amountOre:0,bookOre:0,signature:checked.signature})
eq(buildWithdrawalAssessment(checked).result.status,'calculated','A requires current checked bank/tax and no active estimate')
const standard=saleWithdrawal();standard.revision!.facts=standard.revision!.facts.filter(f=>!f.key.startsWith('rate:'))
eq(buildWithdrawalAssessment(standard).taxRates,['2026: 45 %'],'default is explicit per year')
const late=saleWithdrawal();tax(late,0,'2027-01-01');tx(late,'unclassified','2027-01-12','manual',[['2012',1000],['1930',-1000]])
eq(buildWithdrawalAssessment(sealWithdrawal(late)).result.recommendedOre,null,'unclassified later 2012 cannot reuse old balance')
const retro=saleWithdrawal();tax(retro,0);tx(retro,'retro','2027-01-10','manual',[['2012',1000],['1930',-1000]])
eq(buildWithdrawalAssessment(sealWithdrawal(retro)).result.recommendedOre,null,'late historical entry invalidates financial anchor')
const noJournal=saleWithdrawal();noJournal.journal=[]
eq(buildWithdrawalAssessment(sealWithdrawal(noJournal)).result.recommendedOre,null,'booked transaction with missing journal cannot produce recommendation')
const loan=saleWithdrawal();tx(loan,'loan','2026-12-20','manual',[['1930',10000],['2350',-10000]])
eq(buildWithdrawalAssessment(sealWithdrawal(loan)).result.recommendedOre,null,'loan balance is not a guessed amortization plan')
fact(debt,'other',{amountOre:1,basis:before.otherBasis})
eq(buildWithdrawalAssessment(sealWithdrawal(debt)).result.status,'incomplete','manual total cannot hide known unpaid debt')
for(const estimate of [20000,25000,30000]) {
 const r=calculateWithdrawal({asOf:'2027-01-20',bankOre:10000000,bankQuality:'estimated',taxAccountOre:8000000,parts:[{key:'v',kind:'vat',ore:2500000,quality:'checked'},{key:'e',kind:'estimate',ore:estimate*100,quality:'estimated'}],bufferOre:0,issues:[]})
 eq(r.recommendedOre,10000000,'bounded irrelevant estimate never requires exact tax '+estimate)
}
const unknown=calculateWithdrawal({asOf:'2027-01-20',bankOre:100,bankQuality:'estimated',taxAccountOre:-10000,parts:[],bufferOre:0,issues:['Äldre skatt okänd']})
eq(unknown.recommendedOre,null,'known stop plus unknown additional debt is not positive advice')
eq(unknown.status,'incomplete','no falsely exact deficit for incomplete debts')
console.log(`PASS KAN-97: ${count} product-domain/adapter assertions; no DB writes`)
