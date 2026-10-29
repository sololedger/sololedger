import assert from 'node:assert/strict'
import { loadSieTestApi, book, normalBook, balances, balanceSheet, fakeDb, economicContent } from './sie-export-test-fixtures.mjs'
const api=await loadSieTestApi()
const exportBook=(b,y=2028,load=async year=>balanceSheet(b,year))=>api.exportSIEForUserFromDb(fakeDb(b.tables),b.owner,y,load,new Date('2026-10-29T12:00:00Z'))
let passed=0
const check=(label)=>{passed++;console.log('PASS '+label)}
const normal=normalBook()
for(const y of [2026,2027,2028]) {
  const file=await exportBook(normal,y),p=api.parseSieFile(file,{strictImport:true})
  assert.deepEqual(p.errors,[])
  if(y===2028){assert.equal(p.openingBalances.find(b=>b.accountNumber==='2010').amount,-500);assert.equal(p.closingBalances.find(b=>b.accountNumber==='1930').amount,1930);assert.equal(p.previousYearResultBalances.reduce((s,r)=>s+r.amount,0),300)}
  check('normal export '+y+' accepted by unchanged strict parser')
}
const zeroCurrent=normalBook();zeroCurrent.add(2028,{1930:-500,5420:500});assert.deepEqual(api.parseSieFile(await exportBook(zeroCurrent),{strictImport:true}).errors,[]);check('current year zero result with retained prior capital')
const centsBook=book();centsBook.add(2026,{1930:0.29,3010:-0.29});centsBook.add(2028,{1930:0.01,3010:-0.01});assert.deepEqual(api.parseSieFile(await exportBook(centsBook),{strictImport:true}).errors,[]);check('exact cents preserve small accumulated results')
const original=await exportBook(normal)
const withoutCarry=original.replace(/^#(?:IB|UB) 0 2010 .*\n/gm,'')
assert(api.parseSieFile(withoutCarry).errors.some(e=>e.includes('800.00')))
check('original 800 kr failure reproduced by removing export-only carry')

for(const [name,build] of [
  ['profit',b=>b.add(2026,{1930:800,3010:-800})],
  ['loss',b=>b.add(2026,{1930:-300,5420:300})],
  ['zero',b=>{b.add(2026,{1930:100,3010:-100});b.add(2026,{1930:-100,5420:100})}],
  ['correction',b=>{b.add(2026,{1930:800,3010:-800});b.add(2027,{1930:-800,3010:800},{is_correction:true,corrects_ver_nr:1,description:'Korrigering av VER-1'})}],
  ['imported IB',b=>b.add(2026,{1930:1000,2010:-700,2019:-300},{source:'sie_opening_balance',date:'2026-01-01'})],
  ['full result transfer',b=>{b.add(2026,{1930:800,3010:-800});b.add(2026,{8999:800,2019:-800})}],
  ['partial result transfer',b=>{b.add(2026,{1930:800,3010:-800});b.add(2027,{8999:300,2019:-300})}],
  ['current-year transfer of prior result',b=>{b.add(2026,{1930:800,3010:-800});b.add(2028,{8999:800,2019:-800})}],
  ['zeroed closing',b=>{b.add(2026,{1930:800,3010:-800});b.add(2026,{3010:800,8999:-800});b.add(2026,{8999:800,2019:-800})}],
]) {
  const b=book();build(b);b.add(2028,{1930:500,3010:-500})
  const file=await exportBook(b),p=api.parseSieFile(file,{strictImport:true});assert.deepEqual(p.errors,[])
  const raw=balanceSheet(b,2028),prior=balances(b,2027),carry=Object.entries(prior).filter(([a])=>/^[3-8]/.test(a)).reduce((s,[,n])=>s+n,0)
  assert.equal(p.closingBalances.find(r=>r.accountNumber==='1930')?.amount??0,raw['1930']??0)
  assert.equal(p.closingBalances.find(r=>r.accountNumber==='2010')?.amount??0,(raw['2010']??0)+carry)
  assert.equal(p.closingBalances.find(r=>r.accountNumber==='2019')?.amount??0,raw['2019']??0)
  const copy=book();copy.add(2028,Object.fromEntries(p.openingBalances.map(r=>[r.accountNumber,r.amount])),{source:'sie_opening_balance',date:'2028-01-01'})
  for(const v of p.verifications)copy.add(2028,Object.fromEntries(v.transactions.map(t=>[t.accountNumber,t.amount])),{date:v.date,description:v.description})
  const again=api.parseSieFile(await exportBook(copy),{strictImport:true});assert.deepEqual(again.errors,[]);assert.deepEqual(economicContent(again),economicContent(p))
  check(name+' / empty intermediate year / memory round-trip')
}
const empty=api.parseSieFile(await exportBook(normal,2030))
assert.equal(empty.openingBalances.reduce((s,r)=>s+r.amount,0),0)
assert.deepEqual(empty.openingBalances,empty.closingBalances.map(({accountNumber,amount})=>({accountNumber,amount})))
check('empty export year preserves balances without inventing a verification')
const opening=book();opening.add(2028,{1930:1000,2010:-1000},{source:'sie_opening_balance',date:'2028-01-01'});opening.add(2028,{1930:500,3010:-500})
assert.deepEqual(api.parseSieFile(await exportBook(opening),{strictImport:true}).errors,[])
check('current-year imported IB excluded from VER and included exactly once')
for(const [label,mutate]of [
  ['unbalanced journal',b=>b.tables.journal_entries[0].debit+=1],
  ['invalid amount',b=>b.tables.journal_entries[0].debit=NaN],
  ['unsupported account',b=>b.tables.journal_entries[0].account_number='9999'],
]){const b=normalBook();mutate(b);await assert.rejects(()=>exportBook(b),/balansunderlaget/);check(label+' fails closed')}
await assert.rejects(()=>exportBook(normal,2028,async y=>({...balanceSheet(normal,y),1930:9999})),/balansunderlaget/)
check('conflicting/concurrent balance reads cannot become capital')
const isolated=normalBook();const foreign=book('other');foreign.add(2026,{1930:99999,3010:-99999});isolated.tables.transactions.push(...foreign.tables.transactions.map(t=>({...t,id:'foreign-'+t.id})));isolated.tables.journal_entries.push(...foreign.tables.journal_entries.map(j=>({...j,transaction_id:'foreign-'+j.transaction_id})))
assert.equal(await exportBook(isolated),original)
check('owner filters exclude foreign history')
console.log(`PASS ${passed} KAN108 export balance checks`)
