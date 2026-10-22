// KAN-94: synthetic service/baseline tests and actual React browser UI. No DB/network.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const require = createRequire(import.meta.url)
const baseline = execFileSync('git', ['show', '6591879:src/lib/accountingService.ts'], { encoding: 'utf8' })
const baselineUI = execFileSync('git', ['show', '6591879:src/components/NEBilaga.tsx'], { encoding: 'utf8' })
const bundle = await build({ stdin: { contents: "export {getNEData} from './src/lib/accountingService';export {getNeReviewData,getNeReviewEntries} from './src/lib/neReviewService';export {buildNeReview} from './src/lib/neReview';export {default as NE} from './src/components/NEBilaga';export {getNEData as beforeNE} from 'before';export {default as beforeUI} from 'beforeUI'", resolveDir: process.cwd(), loader: 'ts' },
  tsconfig: 'tsconfig.json', bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'read-only-fixture', setup(b) {
    b.onResolve({ filter: /^beforeUI$/ }, () => ({ path: 'beforeUI', namespace: 'baseline-ui' }))
    b.onLoad({ filter: /.*/, namespace: 'baseline-ui' }, () => ({ contents: baselineUI, loader: 'tsx', resolveDir: path.resolve('src/components') }))
    b.onResolve({ filter: /^before$/ }, () => ({ path: 'before', namespace: 'baseline' }))
    b.onLoad({ filter: /.*/, namespace: 'baseline' }, () => ({ contents: baseline, loader: 'ts', resolveDir: path.resolve('src/lib') }))
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'mock', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase={auth:{getUser:async()=>({data:{user:{id:globalThis.__owner}},error:null})},rpc:(name,args)=>globalThis.__rpc(name,args),from:table=>globalThis.__from(table)}' }))
  } }] })
const mod = { exports: {} };new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,require);const api = mod.exports
const owner = 'synthetic-owner', other = 'different-owner'
let transactions = [], journal = [], decisions = [], calls = [], inject = null
globalThis.__owner = owner
function add(date, rows, classification = null, vat = 0) {
  const id = 'tx-'+transactions.length;transactions.push({ id, user_id: owner, date, description: 'Syntetiskt underlag '+id, vat_rate: vat })
  for (const [account_number, debit, credit] of rows) {
    const j = { id: 'j-'+journal.length, user_id: owner, transaction_id: id, account_number, debit, credit, ver_nr: transactions.length, date };journal.push(j)
    if (account_number === '3010' && classification) decisions.push({ journal_entry_id: j.id, transaction_id: id, user_id: owner, ne_row: classification, basis: 'reviewed_legacy' })
  }
}
add('2025-01-01', [['1930',2000,0],['2010',0,2000]])
add('2026-01-10', [['1930',1000,0],['3010',0,1000]], 'R1')
add('2026-02-10', [['1930',300,0],['3010',0,300]], 'R2')
add('2026-03-10', [['1930',0,100],['3010',100,0]], 'R2')
add('2026-04-10', [['1210',50,0],['1930',0,50]])
add('2026-04-11', [['1210',0,50],['1930',50,0]])
add('2026-05-10', [['2611',0,200],['2641',50,0],['1930',150,0]])
add('2026-06-10', [['6072',40,0],['1930',0,40]])
add('2026-07-10', [['8999',1200,0],['2019',0,1200]])
add('2026-08-10', [['3105',0,20],['1930',20,0]])
add('2026-09-10', [['7970',10,0],['1930',0,10]])
add('2027-01-10', [['1930',0,200],['6991',200,0]])
function balances(rows) { const m={};for(const j of rows)m[j.account_number]=(m[j.account_number]??0)+Number(j.debit)-Number(j.credit);return Object.entries(m).map(([account_number,balance])=>({account_number,balance})) }
globalThis.__rpc = async (name, args) => {
  calls.push({ rpc: name, args });const dateById = new Map(transactions.map(t=>[t.id,t.date]))
  if (name === 'get_cumulative_account_balances') return {data:balances(journal.filter(j=>dateById.get(j.transaction_id)<=args.p_through_date)),error:null}
  assert.equal(name,'get_ne_sales_summary','Only existing read RPCs allowed')
  const rows=journal.filter(j=>dateById.get(j.transaction_id)?.startsWith(String(args.p_year))), byId=new Map(decisions.map(d=>[d.journal_entry_id,d]))
  const candidates=rows.filter(j=>j.account_number==='3010'&&(j.debit||j.credit)), unknown=candidates.filter(j=>!byId.has(j.id)&&Number(transactions.find(t=>t.id===j.transaction_id).vat_rate??0)===0)
  return {data:{version:1,balances:balances(rows),r2_reallocation:candidates.filter(j=>byId.get(j.id)?.ne_row==='R2').reduce((s,j)=>s+j.credit-j.debit,0),unresolved_count:unknown.length,unresolved_amount:unknown.reduce((s,j)=>s+Math.abs(j.credit-j.debit),0)},error:null}
}
globalThis.__from = table => {
  assert(['transactions','journal_entries','ne_sales_classifications'].includes(table));const filters=[],record={table,filters};calls.push(record)
  const query={select:(columns,options)=>{assert.equal(options?.count,'exact');return query},eq:(k,v)=>{filters.push(['eq',k,v]);return query},gte:(k,v)=>{filters.push(['gte',k,v]);return query},lte:(k,v)=>{filters.push(['lte',k,v]);return query},in:(k,v)=>{filters.push(['in',k,v]);return query},order:()=>query,
    range:async(from,to)=>{
      assert(filters.some(([op,k,v])=>op==='eq'&&k==='user_id'&&v===owner),'Owner filter on every table read')
      let rows=({transactions,journal_entries:journal,ne_sales_classifications:decisions})[table].filter(row=>filters.every(([op,k,v])=>op==='eq'?row[k]===v:op==='gte'?row[k]>=v:op==='lte'?row[k]<=v:v.includes(row[k]))).sort((a,b)=>String(a.id??a.journal_entry_id).localeCompare(String(b.id??b.journal_entry_id)))
      if(inject?.table===table){if(inject.error)return {data:null,error:Error('synthetic read failure'),count:null};if(inject.mutate)rows=inject.mutate(rows)}
      return {data:rows.slice(from,to+1),count:inject?.countFailure?null:rows.length,error:null}
    }};return query
}
let checks = 0
async function test(name, fn) {await fn();checks++;console.log('PASS '+name)}
let view, report
await test('unchanged NE amounts/warnings and read RPCs against exact Production service', async()=>{
  for(const year of [2025,2026,2027]){
    calls=[];const before=await api.beforeNE(year),beforeCalls=structuredClone(calls);calls=[];const actual=await api.getNEData(year)
    assert.deepEqual(actual,before);assert.deepEqual(calls,beforeCalls);assert(!Object.hasOwn(actual,'reviewSources'))
  }
})
await test('actual review service, exact account provenance, historical R1/R2 and correction signs', async()=>{
  report=await api.getNEData(2026,true);view=await api.getNeReviewData(owner,2026)
  const r1=view.groups.find(g=>g.id==='R1').accounts.find(a=>a.accountNumber==='3010'),r2=view.groups.find(g=>g.id==='R2').accounts.find(a=>a.accountNumber==='3010')
  assert.equal(r1.contribution,1000);assert.equal(r2.contribution,200);assert.equal(view.sales.length,3);assert(view.sales.every(e=>e.decision));assert(view.sales.some(e=>e.debit===100&&e.decision.row==='R2'))
  const entries=await api.getNeReviewEntries(owner,2026,'3010','annual',-1200);assert(entries.every(e=>!e.date.startsWith('2025')&&!e.date.startsWith('2027')))
})
await test('used zero account retained only in review; originals and reversal both traceable', async()=>{
  assert(!report.accountCoverage.some(a=>a.accountNumber==='1210'))
  assert(view.groups.some(g=>g.accounts.some(a=>a.accountNumber==='1210'&&a.balance===0)))
  const rows=await api.getNeReviewEntries(owner,2026,'1210','cumulative',0);assert.equal(rows.length,2);assert(rows.some(r=>r.debit===50));assert(rows.some(r=>r.credit===50))
})
await test('cumulative balances/IB, shared tax netting, B10 explanatory sources and tax adjustments', async()=>{
  const bank=view.groups.find(g=>g.id==='B9').accounts.find(a=>a.accountNumber==='1930')
  const rows=await api.getNeReviewEntries(owner,2026,'1930','cumulative',bank.balance);assert(rows.some(r=>r.date.startsWith('2025')));assert(!rows.some(r=>r.date.startsWith('2027')))
  for(const id of ['B8','B14']){const g=view.groups.find(g=>g.id===id);assert(g.accounts.some(a=>a.accountNumber==='2611'));assert(g.accounts.some(a=>a.accountNumber==='2641'));assert(g.accounts.every(a=>a.contribution===undefined))}
  const eq=view.groups.find(g=>g.id==='B10');assert.equal(eq.amount,report.B10_total);assert(eq.accounts.some(a=>a.accountNumber==='8999'&&a.period==='cumulative'));assert(eq.accounts.some(a=>a.accountNumber==='2010'&&a.balance===-2000));assert(eq.accounts.every(a=>a.contribution===undefined))
  assert.equal(view.groups.find(g=>g.id==='R13').accounts.find(a=>a.accountNumber==='6072').contribution,40)
})
await test('existing KAN-77/90/91/92/93 warnings and unknown name are visible',async()=>{
  assert(view.reviews.some(r=>r.account==='7970'));assert(view.reviews.some(r=>r.account==='1210'));assert(view.reviews.some(r=>r.account==='3105'));assert(view.reviews.some(r=>r.account==='B10'))
  assert(view.groups.flatMap(g=>g.accounts).some(a=>a.name==='Kontonamn saknas'));assert(view.groups.flatMap(g=>g.accounts).some(a=>a.nameSource.includes('kuraterade')))
})
await test('missing historical decision stays provisional without consulting current profile',async()=>{
  const saved=decisions;decisions=decisions.filter(d=>d.ne_row!=='R1');const v=await api.getNeReviewData(owner,2026);assert(v.reviews.some(r=>r.account==='3010'));assert(v.sales.some(r=>!r.decision));decisions=saved
})
await test('owner mismatch and changed session rejected before exposing data',async()=>{
  calls=[];await assert.rejects(api.getNeReviewData(other,2026),/Användaren/);assert.equal(calls.length,0)
  globalThis.__owner=other;await assert.rejects(api.getNeReviewEntries(owner,2026,'3010','annual',-1200),/Användaren/);globalThis.__owner=owner
})
await test('foreign transaction, foreign journal and foreign decision fail closed',async()=>{
  for(const table of ['transactions','journal_entries','ne_sales_classifications']){
    inject={table,mutate:rows=>rows.map((r,i)=>i===0?{...r,user_id:other}:r)}
    await assert.rejects(api.getNeReviewData(owner,2026),/verifieras/)
  }inject=null
})
await test('read error, missing exact count and changed account balance fail closed',async()=>{
  inject={table:'journal_entries',error:true};await assert.rejects(api.getNeReviewData(owner,2026),/synthetic read failure/)
  inject={countFailure:true};await assert.rejects(api.getNeReviewData(owner,2026),/exact row count/);inject=null
  await assert.rejects(api.getNeReviewEntries(owner,2026,'3010','annual',-1199),/ändrats/)
})
await test('missing/invalid snapshot or decision summary never produces a complete view',async()=>{
  assert.throws(()=>api.buildNeReview({...report,reviewSources:undefined},view.sales),/saknas/)
  assert.throws(()=>api.buildNeReview({...report,reviewSources:{...report.reviewSources,annual:{...report.reviewSources.annual,'9999':0}}},view.sales),/verifieras/)
  assert.throws(()=>api.buildNeReview({...report,neSalesClassification:{...report.neSalesClassification,r2Reallocation:999}},view.sales),/stämmer inte/)
  assert.throws(()=>api.buildNeReview({...report,R1:999},view.sales),/stämmer inte/)
})
await test('more than 1000 journal rows are loaded with exact count, not silently truncated',async()=>{
  const tx=transactions,j=journal,d=decisions;transactions=[];journal=[];decisions=[]
  for(let i=0;i<1001;i++)add('2026-01-01',[['1210',1,0]])
  const rows=await api.getNeReviewEntries(owner,2026,'1210','annual',1001);assert.equal(rows.length,1001)
  transactions=tx;journal=j;decisions=d
})
await test('default view still omits zero accounts, review remains non-mutating',async()=>{
  const after=await api.getNEData(2026);const expected={...report};delete expected.reviewSources;assert.deepEqual(after,expected)
  assert(calls.every(c=>c.table||['get_ne_sales_summary','get_cumulative_account_balances'].includes(c.rpc)))
})
await test('next-year loss keeps annual result separate from cumulative equity explanation',async()=>{
  const v=await api.getNeReviewData(owner,2027),r=await api.getNEData(2027)
  assert.equal(v.groups.find(g=>g.id==='R11').amount,-200)
  assert.equal(v.groups.find(g=>g.id==='B10').amount,r.B10_total)
  assert(v.groups.find(g=>g.id==='B10').accounts.some(a=>a.accountNumber==='3010'&&a.period==='cumulative'))
})
await test('nullable unused debit/credit follows deployed SQL coalesce, invalid values fail closed',async()=>{
  inject={table:'journal_entries',mutate:rows=>rows.map(r=>({...r,debit:r.debit===0?null:r.debit,credit:r.credit===0?null:r.credit}))}
  assert.equal((await api.getNeReviewEntries(owner,2026,'3010','annual',-1200)).length,3)
  inject={table:'journal_entries',mutate:rows=>rows.map((r,i)=>i===0?{...r,debit:'not-a-number'}:r)}
  await assert.rejects(api.getNeReviewEntries(owner,2026,'3010','annual',-1200),/verifieras/);inject=null
})
await test('actual NE integration is available in locked and open years without extra reads while closed',async()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');calls=[]
  for(const locked of [false,true]){
    const html=renderToStaticMarkup(React.createElement(api.NE,{userId:owner,selectedYear:2026,neData:report,isYearLocked:locked,onLockYear:async()=>{throw Error('No writes allowed')}}))
    assert(html.includes('Kontrollera NE-underlaget'));assert(html.includes('Kontrollera bokslutsverifikationerna'))
  }assert.deepEqual(calls,[])
})

await test('KAN-101: every rendered currency amount equals Production, for profit/loss/zero and locked/open views', async()=>{
  const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
  const amounts=html=>(html.match(/[−-]?\d[\d\s,.]* kr/g)??[]).map(v=>v.replaceAll('−','-').replace(/\s/g,'')).sort()
  for(const year of [2025,2026,2027,2028]) for(const locked of [false,true]) {
    const data=await api.getNEData(year), saved=structuredClone(data), props={userId:owner,selectedYear:year,neData:data,isYearLocked:locked,onLockYear:async()=>{throw Error('No writes')}}
    const before=renderToStaticMarkup(React.createElement(api.beforeUI,props)), after=renderToStaticMarkup(React.createElement(api.NE,props))
    assert.deepEqual(amounts(after),amounts(before));assert.deepEqual(data,saved)
    assert(after.includes('Inte bedömt'));assert(after.includes('Inte automatiskt ditt slutliga deklarationsresultat'));assert(!after.includes('✓'))
  }
})

const fixture=JSON.stringify(view)
const browserBundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import Review from './src/components/NEUnderlagReview';import NE from './src/components/NEBilaga';const root=createRoot(document.getElementById('root'));window.showReview=(owner,year)=>root.render(<Review key={owner+':'+year} owner={owner} year={year}/>);window.showReview('synthetic-owner',2026);window.showNE=(owner='synthetic-owner',year=2026)=>root.render(<NE userId={owner} selectedYear={year} neData={window.report} isYearLocked={false} onLockYear={async()=>{throw Error('No writes')}}/>);`,resolveDir:process.cwd(),loader:'tsx'},tsconfig:'tsconfig.json',bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'synthetic-browser-reads',setup(b){b.onResolve({filter:/neReviewService$/},()=>({path:'mock',namespace:'browser-fixture'}));b.onLoad({filter:/.*/,namespace:'browser-fixture'},()=>({contents:'export const getNeReviewData=(owner,year)=>window.readReview(owner,year);export const getNeReviewEntries=(...args)=>window.readEntries(...args);'}))}}]})
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/NEUnderlagReview.tsx";\n@source "./src/components/NEAccountTable.tsx";\n@source "./src/components/NEBilaga.tsx";')
const css=await postcss([tailwind()]).process(styles,{from:path.resolve('kan94-test.css')})
await mkdir('test-results/kan94',{recursive:true})
const browser=await chromium.launch({headless:true})
try{
  for(const width of [1440,390,320]){
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[]
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));await page.route('**/*',r=>r.abort())
    await page.setContent(`<style>${css.css}</style><div id="root"></div><script>window.fixture=${fixture};window.report=${JSON.stringify(report)};window.reads=[];window.readReview=async(owner,year)=>{window.reads.push([owner,year]);if(window.fail)throw Error('Syntetiskt läsfel');if(window.delay)return new Promise(resolve=>window.release=()=>resolve(window.fixture));return window.fixture};window.readEntries=async()=>{if(window.entryDelay)return new Promise(resolve=>window.entryRelease=()=>resolve(window.fixture.sales));return window.fixture.sales};</script><script>${browserBundle.outputFiles[0].text}</script>`)
    assert.equal(await page.evaluate(()=>window.reads.length),0,'Closed section performs no new reads')
    await page.getByText('Kontrollera NE-underlaget · 2026',{exact:true}).click()
    await expect(page.getByRole('heading',{name:'Granskningsbehov för 2026'})).toBeVisible()
    await page.locator('summary').filter({hasText:/^R1 ·/}).click()
    await page.locator('summary').filter({hasText:/^R1 ·/}).locator('..').getByLabel('Visa bokföringsposter för 3010',{exact:true}).click()
    await expect(page.getByText('Syntetiskt underlag tx-1',{exact:true})).toBeVisible()
    await expect(page.getByText(/Sparat historiskt beslut: R2/).first()).toBeVisible()
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow')
    await page.screenshot({path:`test-results/kan94/review-${width}.png`,fullPage:true})
    await page.locator('summary').filter({hasText:/^R1 ·/}).scrollIntoViewIfNeeded()
    await page.screenshot({path:`test-results/kan94/detail-${width}.png`})
    const entryToggle=page.locator('summary').filter({hasText:/^R1 ·/}).locator('..').getByLabel('Visa bokföringsposter för 3010',{exact:true})
    await entryToggle.click();await page.evaluate(()=>window.entryDelay=true);await entryToggle.click()
    await expect(page.getByRole('status')).toHaveText('Läser bokföringsposter…')
    await page.waitForFunction(()=>typeof window.entryRelease==='function')
    await page.evaluate(()=>{window.delay=true;window.showReview('synthetic-owner',2027)})
    await page.getByText('Kontrollera NE-underlaget · 2027',{exact:true}).click()
    await expect(page.getByRole('status')).toHaveText('Läser NE-underlag för 2027…')
    await expect(page.getByText('Syntetiskt underlag tx-1',{exact:true})).toHaveCount(0)
    await page.evaluate(()=>window.entryRelease())
    await expect(page.getByText('Syntetiskt underlag tx-1',{exact:true})).toHaveCount(0)
    await page.evaluate(()=>{window.delay=false;window.fail=true;window.showReview('different-owner',2026)})
    await page.getByText('Kontrollera NE-underlaget · 2026',{exact:true}).click()
    await expect(page.getByRole('alert')).toContainText('Syntetiskt läsfel')
    await page.evaluate(()=>window.release())
    await expect(page.getByRole('heading',{name:'Granskningsbehov för 2027'})).toHaveCount(0)
    await expect(page.getByText(/Inga granskningsbesked från/)).toHaveCount(0)
    await page.evaluate(()=>{window.fail=false;window.fixture={...window.fixture,reviews:[]};window.showReview('synthetic-owner',2028)})
    await page.getByText('Kontrollera NE-underlaget · 2028',{exact:true}).click()
    await expect(page.getByText('Inga granskningsbesked från de befintliga kontrollerna. Detta betyder inte att deklarationen är fullständigt kontrollerad.',{exact:true})).toBeVisible()
    await page.evaluate(()=>{window.entryDelay=false;window.showNE()})
    await expect(page.getByText('R15 Intäkter som inte bokförts men ska tas upp',{exact:true})).toBeVisible()
    await expect(page.getByText('R16 Kostnader som inte bokförts men ska dras av',{exact:true})).toBeVisible()
    await expect(page.getByText('Inte bedömt',{exact:true})).toHaveCount(2)
    await expect(page.getByText(/Inte automatiskt ditt slutliga deklarationsresultat/)).toBeVisible()
    await page.getByText(/^Kontotäckning \(/).click()
    const coverage=page.getByText(/^Kontotäckning \(/).locator('..')
    await coverage.getByLabel('Visa bokföringsposter för 3010',{exact:true}).click()
    await expect(coverage.getByText('Syntetiskt underlag tx-1',{exact:true})).toBeVisible()
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Full NE has no horizontal overflow')
    await page.screenshot({path:'test-results/kan94/ne-presentation-'+width+'.png',fullPage:true})
    await coverage.scrollIntoViewIfNeeded()
    await page.screenshot({path:'test-results/kan94/ne-coverage-'+width+'.png'})
    await coverage.getByLabel('Visa bokföringsposter för 3010',{exact:true}).click()
    await page.evaluate(()=>window.readEntries=async()=>{throw Error('Syntetiskt journalfel')})
    await coverage.getByLabel('Visa bokföringsposter för 6072',{exact:true}).click()
    await expect(coverage.getByRole('alert')).toContainText('Syntetiskt journalfel')
    await expect(coverage.getByText('Syntetiskt underlag tx-1',{exact:true})).toHaveCount(0)
    await coverage.getByLabel('Visa bokföringsposter för 6072',{exact:true}).click()
    await page.evaluate(()=>window.readEntries=()=>new Promise(resolve=>window.lateEntry=()=>resolve(window.fixture.sales)))
    await coverage.getByLabel('Visa bokföringsposter för 3010',{exact:true}).click()
    await expect(coverage.getByRole('status')).toHaveText('Läser bokföringsposter…')
    await page.waitForFunction(()=>typeof window.lateEntry==='function')
    await page.evaluate(()=>window.showNE('different-owner',2027))
    await expect(page.getByText('Kontrollera NE-underlaget · 2027',{exact:true})).toBeVisible()
    await page.evaluate(()=>window.lateEntry())
    await expect(coverage.getByText('Syntetiskt underlag tx-1',{exact:true})).toHaveCount(0)
    await expect(coverage.getByRole('status')).toHaveCount(0)
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await page.close()
  }
  console.log('PASS browser: desktop 1440, mobile 390/320, actual React drilldown, zero network, no writes/errors/overflow, year/owner stale response and read error')
}finally{await browser.close()}
console.log(`PASS KAN-94: ${checks} focused service/model control groups + 3 browser widths`)
