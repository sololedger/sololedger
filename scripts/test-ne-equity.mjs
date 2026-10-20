/** KAN-93: actual service, pre-fix comparison, SIE and UI. No DB/network. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { equityCases, sumEntries } from './fixtures/ne-equity-cases.mjs'
import { parseSieFile } from '../src/lib/sieParser.ts'
import { buildSieImportPayload } from '../src/lib/sieImportPayload.ts'
import { calculateNeBalanceDiff } from '../src/lib/neBalance.ts'
import { chromium, expect } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const require = createRequire(import.meta.url)
const React = require('react')
const {renderToStaticMarkup} = require('react-dom/server')
const baseline = execFileSync('git',['show','7d2256f:src/lib/accountingService.ts'],{encoding:'utf8'})
const bundle = await build({
  stdin:{contents:"export {getNEData,getCumulativeResultat} from './src/lib/accountingService'; export {getNEData as beforeNE} from 'before'; export {default as NE} from './src/components/NEBilaga'",loader:'ts',resolveDir:process.cwd()},
  tsconfig:'tsconfig.json',bundle:true,write:false,platform:'node',format:'cjs',packages:'external',
  plugins:[{name:'offline',setup(b){
    b.onResolve({filter:/^before$/},()=>({path:'before',namespace:'baseline'}))
    b.onLoad({filter:/.*/,namespace:'baseline'},()=>({contents:baseline,loader:'ts',resolveDir:path.resolve('src/lib')}))
    b.onResolve({filter:/supabaseClient$/},()=>({path:'mock',namespace:'offline'}))
    b.onLoad({filter:/.*/,namespace:'offline'},()=>({contents:'export const supabase={rpc:(n,a)=>globalThis.__kan93Rpc(n,a)}'}))
  }}],
})
const mod={exports:{}}
new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,require)
const api=mod.exports
export async function checkReport(c, annual, cumulative) {
  const year=c.year??2026
  const rows=m=>Object.entries(m).map(([account_number,balance])=>({account_number,balance}))
  const reads=[]
  globalThis.__kan93Rpc=async(n,a)=>{
    reads.push([n,a])
    if(n==='get_ne_sales_summary') {assert.deepEqual(a,{p_year:year});return {data:{version:1,balances:rows(annual),r2_reallocation:c.r2??0,unresolved_count:c.unresolved??0,unresolved_amount:c.unresolved?100:0},error:null}}
    if(n==='get_cumulative_account_balances') {assert.deepEqual(a,{p_through_date:`${year}-12-31`});return {data:rows(cumulative),error:null}}
    throw Error('Unexpected read/write '+n)
  }
  const unchanged=JSON.stringify({annual,cumulative})
  const before=await api.beforeNE(year), previousReads=reads.splice(0)
  const actual=await api.getNEData(year)
  assert.deepEqual(reads,previousReads,'Same read-only RPCs')
  assert.equal(actual.B10_total,c.equity,c.name)
  assert.equal(before.B10_total,c.old??c.equity,c.name+' pre-fix')
  const {B10_total:oldB10,...oldRest}=before
  const {B10_total:newB10,equityReviewRequired,...newRest}=actual
  assert.equal(newB10,Math.round((oldB10-Object.entries(cumulative).filter(([a])=>/^899\d$/.test(a)).reduce((s,[,n])=>s+n,0))*100)/100)
  assert.deepEqual(newRest,oldRest,c.name+': all other amounts, KAN-88 decisions, KAN-90/91/92 warnings unchanged')
  const technical=Object.entries(cumulative).filter(([a])=>/^899\d$/.test(a)).reduce((sum,[,n])=>sum+n,0)
  assert.equal(Boolean(equityReviewRequired),technical!==0,c.name+' closing review')
  if(!c.blocked) assert.equal(calculateNeBalanceDiff(actual),0,c.name+' balance identity')
  if(c.zeroResult) {assert.equal(actual.R11,0);assert.equal(actual.R17,0)}
  for(const locked of [false,true]) {
    const html=renderToStaticMarkup(React.createElement(api.NE,{neData:actual,selectedYear:year,isYearLocked:locked,onLockYear:async()=>{throw Error('No writes')}}))
    assert.equal(html.includes('Kontrollera bokslutsverifikationerna'),technical!==0)
    if(technical!==0) assert(html.includes('SoloLedger återskapar inte saknade resultatbelopp automatiskt.'))
    if(c.blocked && !locked) assert(html.includes('Balansräkningen måste balansera'))
  }
  assert.equal(JSON.stringify({annual,cumulative}),unchanged,'No fixture mutation')
  return actual
}
async function runOfflineTests() {
const browserReports=[]
for(const c of equityCases) {
  for(const e of c.entries) assert.equal(Object.values(e.rows).reduce((s,n)=>s+n,0),0,c.name+' balanced journal')
  const report=await checkReport(c,sumEntries(c.entries,c.year??2026,true),sumEntries(c.entries,c.year??2026))
  if(['profit-transfer','unclassified-closing-offset'].includes(c.name)) browserReports.push({name:c.name,report})
}
// Exercise saved/missing sales decisions, tax adjustments and chart conflicts WITH transfer.
const mixed={1930:1110,3010:-1000,3105:-100,3231:-100,6072:50,6982:30,6992:20,8314:-10,8999:1110,2019:-1110}
await checkReport({name:'KAN-88-90-91-92-with-transfer',equity:1110,old:2220,r2:400},mixed,mixed)
await checkReport({name:'unresolved-3010-with-transfer',equity:1110,old:2220,unresolved:1},mixed,mixed)

// Real parser and canonical payload: no additional transfer/opening journal is generated.
const sie='#FLAGGA 0\n#SIETYP 4\n#RAR 0 20260101 20261231\n#VER A 1 20261001 "Sale"\n{\n#TRANS 1930 {} 1000\n#TRANS 3010 {} -1000\n}\n#VER A 2 20261002 "Transfer"\n{\n#TRANS 8999 {} 1000\n#TRANS 2019 {} -1000\n}\n'
const parsed=parseSieFile(sie,{strictImport:true})
assert.deepEqual(parsed.errors,[])
const payload=await buildSieImportPayload(parsed,'synthetic-kan93.se')
assert.equal(payload.verifications.length,2)
assert.deepEqual(payload.opening_balances,[])
const imported={}
for(const v of payload.verifications)for(const r of v.rows)imported[r.account_number]=(imported[r.account_number]??0)+r.amount
await checkReport({name:'actual-SIE-parser-payload',equity:1000,old:2000},imported,imported)
assert.deepEqual(await buildSieImportPayload(parsed,'synthetic-kan93.se'),payload)
const ib=parseSieFile('#FLAGGA 0\n#SIETYP 4\n#RAR 0 20260101 20261231\n#IB 0 1930 1000\n#RES -1 3010 -1000\n#VER A 1 20261001 "Deposit"\n{\n#TRANS 1930 {} 100\n#TRANS 2018 {} -100\n}\n',{strictImport:true})
assert.deepEqual(ib.errors,[])
const ibPayload=await buildSieImportPayload(ib,'synthetic-ib.se')
assert.equal(ibPayload.previous_year_result_balances[0].amount,-1000)
assert.equal(ibPayload.opening_balances.length,1,'Bridge is server-side, not a duplicate client transfer')
const cumulative={1930:1100,2019:-1000,2018:-100}
await checkReport({name:'server-IB-bridge-representation',equity:1100},cumulative,cumulative)
// The migration must differ from the reviewed Production function only in B10's 899 filter.
const sql=await readFile('supabase/migrations/20261018190000_kan93_ne_equity_transfers.sql','utf8')
assert(sql.includes('unexpected close_year_atomic definition'))
assert(!sql.includes("AND account_number !~ '^899[0-9]$'"))
delete globalThis.__kan93Rpc
const browserBundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import NE from './src/components/NEBilaga';const cases=${JSON.stringify(browserReports)};const root=createRoot(document.getElementById('root'));window.showCase=(index,locked)=>root.render(<NE neData={cases[index].report} selectedYear={2026} isYearLocked={locked} onLockYear={async()=>{throw Error('No writes')}}/>);window.showCase(0,false);`,resolveDir:process.cwd(),loader:'tsx'},tsconfig:'tsconfig.json',bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'}})
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/NEBilaga.tsx";')
const css=await postcss([tailwind()]).process(styles,{from:path.resolve('kan93-test.css')})
await mkdir('test-results/kan93',{recursive:true})
const browser=await chromium.launch({headless:true})
try {
  for(const width of [1440,390,320]) {
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[]
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()))
    await page.route('**/*',r=>r.abort())
    await page.setContent(`<style>${css.css}</style><div id="root"></div><script>${browserBundle.outputFiles[0].text}</script>`)
    await expect(page.getByText('Kontrollera bokslutsverifikationerna',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Lås räkenskapsår 2026'})).toBeEnabled()
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow')
    await page.screenshot({path:`test-results/kan93/transfer-${width}.png`,fullPage:true})
    await page.evaluate(()=>window.showCase(1,false))
    await expect(page.getByRole('button',{name:'Lås räkenskapsår 2026'})).toBeDisabled()
    await expect(page.getByText('Konton behöver granskas före deklaration',{exact:true})).toBeVisible()
    await page.evaluate(()=>window.showCase(0,true))
    await expect(page.getByText('Kontrollera bokslutsverifikationerna',{exact:true})).toBeVisible()
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[])
    await page.close()
  }
} finally {await browser.close()}
console.log(`PASS KAN-93: ${equityCases.length+4} balanced/service/SIE/IB/baseline cases; R rows and KAN-88/90/91/92 preserved; locked/unlocked rendered warnings; no DB/network`)
console.log('PASS KAN-93 actual NE browser: 1440/390/320px, review message, valid close enabled, unresolved balance close disabled, locked view, no overflow/network')
}
if (path.resolve(process.argv[1] ?? '') === path.resolve('scripts/test-ne-equity.mjs')) await runOfflineTests()
