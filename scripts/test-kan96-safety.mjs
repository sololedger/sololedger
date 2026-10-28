import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { parseResultClosingReview, resultClosingMessage } from '../src/lib/resultClosingReview.ts'
import { buildWithdrawalAssessment } from '../src/lib/withdrawalAssessment.ts'
import { emptyWithdrawal, addWithdrawalTx, sealWithdrawal } from '../tests/fixtures/withdrawalFixtures.ts'
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const review={version:1,year:2024,through_date:'2024-12-31',blocked:true,entries:[{
  transaction_id:'00000000-0096-4000-8000-000000000012',date:'2024-12-31',ver_nr:12,
  journal_dates:['2024-12-31'],accounts:['3010','5420','8999'],
}]}
assert.deepEqual(parseResultClosingReview(review,2024),review)
for(const bad of [null,{}, {...review,blocked:false},{...review,year:2025},{...review,entries:[{...review.entries[0],ver_nr:null}]}])
  assert.throws(()=>parseResultClosingReview(bad,2024))
const bundle=await build({stdin:{contents:"export {calculateNeReport} from './src/lib/neCalculation';export {calculateDashboard} from './src/lib/calculations';export {buildNeReview} from './src/lib/neReview';export {neReviewSummary} from './src/lib/nePresentation';export {getNEData} from './src/lib/accountingService';export {default as NE} from './src/components/NEBilaga';export {default as Cards} from './src/components/OverviewCards';",loader:'ts',resolveDir:process.cwd()},
 bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'no-network',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'mock',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={rpc:(n,a)=>globalThis.__kan96Rpc(n,a)}'}))}}]})
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);const api=mod.exports
const balances={1930:800,2019:-800,3010:0,5420:0,8999:0}
const summary={available:true,r2Reallocation:0,unresolvedCount:0,unresolvedAmount:0,reviewRequired:false}
const raw=api.calculateNeReport({annualBalances:balances,balanceSheetBalances:balances,cumulativeBalances:balances,neSalesClassification:summary},true)
const report={...raw,resultClosingReview:review}
assert.equal(report.B10_total,800)
assert.deepEqual(Object.fromEntries(Object.entries(report).filter(([k])=>/^R\d+$/.test(k))),Object.fromEntries(Object.entries(raw).filter(([k])=>/^R\d+$/.test(k))))
const view=api.buildNeReview(report,[])
assert(view.reviews.some(r=>r.reason===resultClosingMessage))
assert(view.groups.filter(g=>/^R\d+$/.test(g.id)).every(g=>g.amount===null))
assert(api.neReviewSummary(report).areas.includes('Bokslutsposter och resultat'))
const data=api.calculateDashboard(balances,30,{utgaendeMoms:0,ingaendeMoms:0,momsNetto:0},review)
assert.equal(data.resultReviewRequired,true);assert.equal(data.sakertUttag,0)
for(const locked of [false,true]){
 const html=renderToStaticMarkup(React.createElement(api.NE,{neData:report,selectedYear:2024,isYearLocked:locked,onLockYear:async()=>assert.fail('No writes')}))
 assert(html.includes('Verifikation 12')&&html.includes('2024-12-31')&&html.includes('8999')&&html.includes('självserviceflöde'))
 assert(html.includes('Osäkert underlag'))
 if(!locked)assert.match(html,/disabled=""[^>]*aria-disabled="true"|aria-disabled="true"[^>]*disabled=""/)
}
const cardsProps={data,taxRate:30,selectedYear:2024,transactions:[],journalMap:{},setActiveModal:()=>{},activeModal:null}
for(const activeModal of [null,'resultat','skatt','moms']){
 const html=renderToStaticMarkup(React.createElement(api.Cards,{...cardsProps,activeModal}))
 assert(html.includes('Osäkert underlag'))
}
const partialTaxHtml=renderToStaticMarkup(React.createElement(api.Cards,{...cardsProps,activeModal:'skatt',
  data:{...data,ejAvdragsgillt:123,skattefriaIntakter:456}}))
assert(!partialTaxHtml.includes('123 kr')&&!partialTaxHtml.includes('456 kr'),'R13 and R14 detail amounts are masked too')
const snapshot=emptyWithdrawal('2024-12-31')
addWithdrawalTx(snapshot,'sale','2024-01-02','manual',[['1930',100000],['3010',-100000]])
snapshot.result_closing_reviews=[review];sealWithdrawal(snapshot)
assert(buildWithdrawalAssessment(snapshot).result.issues.some(i=>i.includes(resultClosingMessage)))
assert.equal(buildWithdrawalAssessment(snapshot).result.recommendedOre,null)
for(const bad of [{...snapshot,result_closing_reviews:undefined},{...snapshot,result_closing_reviews:[]}])
 assert.throws(()=>buildWithdrawalAssessment(bad))
// Same actual read service; old/malformed backend never reports a safe result.
let responseReview=review
globalThis.__kan96Rpc=async name=>name==='get_ne_sales_summary'?{data:{version:1,balances:Object.entries(balances).map(([account_number,balance])=>({account_number,balance})),r2_reallocation:0,unresolved_count:0,unresolved_amount:0,result_closing_review:responseReview},error:null}:{data:Object.entries(balances).map(([account_number,balance])=>({account_number,balance})),error:null}
assert.deepEqual((await api.getNEData(2024)).resultClosingReview,review)
responseReview=undefined;await assert.rejects(api.getNEData(2024),/Kontrollen av bokslutsposter/)
delete globalThis.__kan96Rpc
const normalBalances={1930:800,3010:-1000,5420:200};const normalReport=api.calculateNeReport({annualBalances:normalBalances,balanceSheetBalances:normalBalances,cumulativeBalances:normalBalances,neSalesClassification:summary});
const browserBundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import NE from './src/components/NEBilaga';const root=createRoot(document.getElementById('root'));window.configure=(locked,unsafe=true)=>root.render(<NE neData={unsafe?${JSON.stringify(report)}:${JSON.stringify(normalReport)}} selectedYear={2024} isYearLocked={locked} onLockYear={async()=>{alert('Lokal granskning med syntetiska uppgifter. Inget år låses.')}}/>);window.configure(false);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'preview-no-network',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'preview-no-network',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={auth:{getUser:async()=>({data:{user:null},error:null})},from:()=>{throw Error("Syntetiskt granskningsläge: ingen databasanslutning")},rpc:async()=>{throw Error("Syntetiskt granskningsläge: ingen databasanslutning")}}'}))}}]})
const {default:postcss}=await import('postcss'),{default:tailwind}=await import('@tailwindcss/postcss')
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/NEBilaga.tsx";\n@source "./src/components/ResultClosingNotice.tsx";')
const css=await postcss([tailwind()]).process(styles,{from:process.cwd()+'/kan96.css'})
await mkdir('coverage/kan96-review',{recursive:true})
await writeFile('coverage/kan96-review/index.html',`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'unsafe-inline';connect-src 'none';form-action 'none'"><title>KAN-96 – lokal granskning</title><style>${css.css}</style><body><aside style="padding:16px;background:#eef2ff"><strong>Lokal granskning – syntetiska uppgifter</strong><p>Inga bokningar eller årslås kan genomföras här.</p><button style="padding:8px;border:1px solid" onclick="window.configure(false,true)">Osäkert öppet år</button> <button style="padding:8px;border:1px solid" onclick="window.configure(true,true)">Osäkert låst år</button> <button style="padding:8px;border:1px solid" onclick="window.configure(false,false)">Vanligt öppet år</button></aside><div id="root"></div><script>${browserBundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></body></html>`)
await mkdir('test-results/kan96',{recursive:true})
const browser=await chromium.launch({headless:true})
try {
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],requests=[]
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{requests.push(r.request().url());return r.abort()})
  await page.setContent('<html lang="sv"><div id="root"></div></html>');await page.addStyleTag({content:css.css});await page.addScriptTag({content:browserBundle.outputFiles[0].text})
  for(const locked of [false,true]){
   await page.evaluate(v=>window.configure(v),locked)
   await expect(page.getByRole('alert').filter({hasText:'Resultatunderlaget behöver granskas'})).toBeVisible()
   if(!locked)await expect(page.getByRole('button',{name:'Lås räkenskapsår 2024'})).toBeDisabled()
   else await expect(page.getByText('Räkenskapsår 2024 är låst',{exact:true})).toBeVisible()
   await expect(page.getByText('Verifikation 12',{exact:false})).toBeVisible()
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow')
  }
  await page.screenshot({path:`test-results/kan96/locked-${width}.png`,fullPage:true})
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);await page.close()
 }
}finally{await browser.close()}
console.log('PASS KAN-96: protocol, actual NE service fail closed, R1–R17/B10 unchanged, NE/review/dashboard masking, withdrawal blocked; locked/open NE 1440/390/320px; no network/writes')
