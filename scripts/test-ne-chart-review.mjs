/** KAN-92: actual service and views, synthetic read-only boundaries. No DB/auth. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { getNeChartReviewReason, collectSieNeChartReviews } from '../src/lib/neChartReview.ts'
import { parseSieFile } from '../src/lib/sieParser.ts'
import { buildSieImportPayload } from '../src/lib/sieImportPayload.ts'

const conflicts = ['3100','3105','3106','3108','3200','3211','3212','3231']
const controlAccounts = ['3010','3001','3004','3111','3199','3220','3299','3305','3500','3980','4700','7970','6072','6982','6992','8314','toString']
for (const account of conflicts) assert.match(getNeChartReviewReason(account), /preliminär.*granskas/)
for (const account of controlAccounts) assert.equal(getNeChartReviewReason(account), null, account)
function sie(rows, extra = '', year = 2026) {
  return `#FLAGGA 0\n#SIETYP 4\n#FNAMN "Syntetisk KAN92"\n#ORGNR 0000000000\n#RAR 0 ${year}0101 ${year}1231\n${extra}\n#VER A 1 ${year}1001 "Syntetisk"\n{\n${rows.map(([a,n]) => `#TRANS ${a} {} ${n}`).join('\n')}\n}\n`
}
function parsed(source) {
  const p = parseSieFile(source, { strictImport: true })
  assert.deepEqual(p.errors, [])
  return p
}
for (const account of conflicts) {
  const p = parsed(sie([[account,-100],['1930',100]], `#KONTO ${account} "Eget kontonamn"\n#KPTYP BAS2026\n#SRU ${account} 7400`))
  const before = structuredClone(p)
  const payloadBefore = await buildSieImportPayload(p, 'synthetic.se')
  assert.deepEqual(collectSieNeChartReviews(p).map(r=>r.accountNumber), [account])
  assert.deepEqual(p, before, 'No parser mutation')
  assert.deepEqual(await buildSieImportPayload(p, 'synthetic.se'), payloadBefore, 'Payload/hash unchanged')
}
assert.deepEqual(collectSieNeChartReviews(parsed(sie([['3010',-100],['1930',100]], '#KONTO 3105 "Unused"\n#RES -1 3231 -100'))), [], 'Unused declarations and comparison year are irrelevant')
assert.deepEqual(collectSieNeChartReviews(parsed(sie([['3105',0],['1930',0]]))), [], 'Zero rows')
const corrected = parsed(sie([['3105',-100],['3105',40],['1930',60]]))
assert.equal(collectSieNeChartReviews(corrected).length, 1, 'Correction deduplicated')
assert.equal(collectSieNeChartReviews(parsed(sie([['3105',-100],['3105',100]]))).length, 1, 'Preview also explains offsetting movements')
const allSie = sie([...conflicts.map(a=>[a,-100]),['1930',800]])
assert.deepEqual(collectSieNeChartReviews(parsed(allSie)).map(r=>r.accountNumber),conflicts)
const beforeSources = Object.fromEntries(['src/lib/neAccountCoverage.ts','src/components/NEBilaga.tsx'].map(file=>[path.resolve(file),execFileSync('git',['show','376fe512:'+file],{encoding:'utf8'})]))
const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
async function service(baseline) {
  const result = await build({
    stdin:{contents:"export {getNEData} from './src/lib/accountingService'; export {default as NE} from './src/components/NEBilaga'",resolveDir:process.cwd(),loader:'ts'},
    tsconfig:'tsconfig.json',bundle:true,write:false,platform:'node',format:'cjs',packages:'external',
    plugins:[{name:'read-only-fixtures',setup(b){
      b.onResolve({filter:/supabaseClient$/},()=>({path:'rpc',namespace:'fixture'}))
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={rpc:(n,a)=>globalThis.__kan92Rpc(n,a)}'}))
      if(baseline) b.onLoad({filter:/(neAccountCoverage\.ts|NEBilaga\.tsx)$/},args=>({contents:beforeSources[path.resolve(args.path)],loader:'tsx',resolveDir:path.dirname(args.path)}))
    }}],
  })
  const mod={exports:{}}
  new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,require)
  return mod.exports
}
const before = await service(true)
const current = await service(false)
const cases = conflicts.flatMap(a=>[-100,40,0].map(amount=>({name:a+'/'+amount,annual:{[a]:amount,'1930':-amount},review:amount?[a]:[]})))
cases.push(
  {name:'partial-correction',annual:{'3105':-60,'1930':60},review:['3105']},
  {name:'zero-result-net',annual:{'3105':-100,'3231':100},review:['3105','3231']},
  {name:'previous-year-only',year:2027,annual:{},cumulative:{'3105':-100,'1930':100},review:[]},
  {name:'next-year-correction',year:2027,annual:{'3231':100,'1930':-100},cumulative:{},review:['3231']},
  {name:'saved-3010-and-tax',annual:{'3105':-100,'3231':-100,'3010':-1000,'6072':50,'6982':30,'6992':20,'8314':-10,'1930':1110},r2:400,review:['3105','3231']},
  {name:'saved-3010-reversal',annual:{'3010':1000,'1930':-1000},r2:-400,review:[]},
  {name:'unresolved-3010',annual:{'3010':-100,'1930':100},unresolved:1,review:[]},
  {name:'unavailable-summary',annual:{'3105':-100,'1930':100},missing:true,review:['3105']},
  {name:'controls-and-assessment-cases',annual:Object.fromEntries(controlAccounts.filter(a=>/^\d{4}$/.test(a)).map(a=>[a,100])),review:[]},
)
const reports=[]
for(const c of cases) {
  const year=c.year??2026
  const annual=Object.entries(c.annual).map(([account_number,balance])=>({account_number,balance}))
  const cumulative=Object.entries(c.cumulative??c.annual).map(([account_number,balance])=>({account_number,balance}))
  const summary={version:1,balances:annual,r2_reallocation:c.r2??0,unresolved_count:c.unresolved??0,unresolved_amount:c.unresolved?100:0}
  const unchanged=JSON.stringify({annual,cumulative,summary})
  const reads=[]
  globalThis.__kan92Rpc=async(name,args)=>{
    reads.push([name,args])
    if(name==='get_ne_sales_summary') {assert.deepEqual(args,{p_year:year});return c.missing?{error:{code:'PGRST202'}}:{data:summary,error:null}}
    if(name==='get_period_account_balances') {assert(c.missing);assert.deepEqual(args,{p_start_date:`${year}-01-01`,p_end_date:`${year}-12-31`});return {data:annual,error:null}}
    if(name==='get_cumulative_account_balances') {assert.deepEqual(args,{p_through_date:`${year}-12-31`});return {data:cumulative,error:null}}
    throw Error('Unexpected RPC/write '+name)
  }
  const prior=await before.getNEData(year)
  const priorReads=reads.splice(0)
  const actual=await current.getNEData(year)
  assert.deepEqual(reads,priorReads,'Same read-only RPCs')
  const {accountCoverage:oldCoverage,...oldFields}=prior
  const {accountCoverage:newCoverage,...newFields}=actual
  assert.deepEqual(newFields,oldFields,'ALL existing amounts/warnings/3010 decisions unchanged: '+c.name)
  assert.deepEqual(newCoverage.filter(r=>!conflicts.includes(r.accountNumber)),oldCoverage.filter(r=>!conflicts.includes(r.accountNumber)),'KAN-90/91 unrelated coverage unchanged')
  const chartRows=newCoverage.filter(r=>conflicts.includes(r.accountNumber))
  assert.deepEqual(chartRows.map(r=>r.accountNumber),c.review)
  for(const row of chartRows) {assert.equal(row.status,'review');assert.match(row.handling,/preliminär/);assert.match(row.reason,/Ingen automatisk omklassificering/)}
  for(const locked of [false,true]) {
    const props={selectedYear:year,isYearLocked:locked,onLockYear:async()=>{throw Error('No writes')}}
    const html=renderToStaticMarkup(React.createElement(current.NE,{...props,neData:actual}))
    const oldHtml=renderToStaticMarkup(React.createElement(before.NE,{...props,neData:prior}))
    assert.equal(html.includes('Fördelningen mellan NE-rutorna är preliminär eftersom'),c.review.length>0)
    for(const row of chartRows) assert(html.includes(row.reason))
    assert.equal(html.match(/aria-disabled="[^"]+"/)?.[0],oldHtml.match(/aria-disabled="[^"]+"/)?.[0],'No new year-lock blocker')
    if(c.unresolved||c.missing) assert(html.includes('R1/R2 behöver kontrolleras före deklaration'))
  }
  assert.equal(JSON.stringify({annual,cumulative,summary}),unchanged,'No source or evidence mutation')
  reports.push({name:c.name,report:actual,year})
}
delete globalThis.__kan92Rpc

// Real file-selection -> parser -> preview; import/subscription boundaries throw.
const browserBundle=await build({
  stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import NE from './src/components/NEBilaga';import SIE from './src/components/SieImportModal';const root=createRoot(document.getElementById('root'));const reports=${JSON.stringify(reports)};window.showNE=(name)=>{const c=reports.find(r=>r.name===name);root.render(<NE key={name} neData={c.report} selectedYear={c.year} isYearLocked={false} onLockYear={async()=>{throw Error('No year writes')}}/>)};window.showSIE=()=>root.render(<SIE isOpen={true} userId="synthetic" profile={null} onClose={()=>{}} refreshData={()=>{throw Error('No refresh')}} onLimitReached={()=>{throw Error('No quota')}} onUsageChanged={()=>{throw Error('No usage')}}/>);window.showNE('saved-3010-and-tax');`,resolveDir:process.cwd(),loader:'tsx'},
  tsconfig:'tsconfig.json',bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'deny-imports',setup(b){
    b.onResolve({filter:/\/(sieImport|subscriptionLimits)$/},args=>({path:args.path.split('/').at(-1),namespace:'deny'}))
    b.onLoad({filter:/.*/,namespace:'deny'},args=>({contents:args.path==='sieImport'?"export class SieImportError extends Error{};export const importSieBatch=()=>{throw Error('No imports')}":"export const getFreeTransactionUsage=()=>{throw Error('No subscription reads')};export const canCreateTransactions=()=>{throw Error('No quota reads')}"}))
  }}],
})
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/NEBilaga.tsx";\n@source "./src/components/SieImportModal.tsx";')
const css=await postcss([tailwind()]).process(styles,{from:path.resolve('kan92-test.css')})
await mkdir('test-results/kan92',{recursive:true})
const browser=await chromium.launch({headless:true})
try {
  for(const width of [1440,390,320]) {
    const page=await browser.newPage({viewport:{width,height:1000}})
    const errors=[],requests=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/*',r=>{requests.push(r.request().url());return r.abort()})
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({content:css.css})
    await page.addScriptTag({content:browserBundle.outputFiles[0].text})
    const warning=page.getByRole('alert').filter({hasText:'Konton behöver granskas före deklaration'})
    await expect(warning.getByText('Fördelningen mellan NE-rutorna är preliminär eftersom',{exact:false})).toBeVisible()
    await expect(warning.getByText('Konto 3105:',{exact:false})).toBeVisible()
    await expect(warning.getByText('Konto 3231:',{exact:false})).toBeVisible()
    await page.locator('summary').filter({hasText:'Kontotäckning'}).click()
    await expect(page.locator('details').getByText('3105:',{exact:false})).toBeVisible()
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'NE fits viewport')
    await page.screenshot({path:`test-results/kan92/ne-${width}.png`,fullPage:true})
    await page.evaluate(()=>window.showNE('saved-3010-reversal'))
    await expect(page.getByText('Fördelningen mellan NE-rutorna är preliminär eftersom',{exact:false})).toHaveCount(0)
    await page.evaluate(()=>window.showSIE())
    await page.locator('input[type=file]').setInputFiles({name:'synthetic.se',mimeType:'text/plain',buffer:Buffer.from(allSie)})
    const preview=page.getByRole('alert').filter({hasText:'NE-fördelningen behöver granskas efter import'})
    await expect(preview).toBeVisible()
    for(const account of conflicts) await expect(preview.getByText(`Konto ${account}:`,{exact:false})).toBeVisible()
    await expect(page.getByText('Filen ser bra ut',{exact:false})).toHaveCount(0)
    await expect(page.getByRole('button',{name:/Importera 1 verifikationer/})).toBeEnabled()
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'SIE fits viewport')
    await page.screenshot({path:`test-results/kan92/sie-${width}.png`,fullPage:true})
    await page.getByRole('button',{name:'Välj annan fil'}).click()
    await page.locator('input[type=file]').setInputFiles({name:'control.se',mimeType:'text/plain',buffer:Buffer.from(sie([['3010',-100],['1930',100]],'#KONTO 3105 "Unused"'))})
    await expect(page.getByRole('button',{name:/Importera 1 verifikationer/})).toBeVisible()
    await expect(preview).toHaveCount(0)
    assert.deepEqual(errors,[])
    assert.deepEqual(requests,[],'Zero network requests')
    await page.close()
  }
} finally {await browser.close()}
console.log(`PASS KAN-92: ${cases.length} baseline-compared report/sign/year cases; 8 exact conflicts; actual SIE payload/parser/preview; 1440/390/320px; no writes/network`)
