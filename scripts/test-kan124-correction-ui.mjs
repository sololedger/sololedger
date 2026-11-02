// Offline UI regression: actual service, page handler and dialog. No database/network.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { transform, build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'
const serviceSource=fs.readFileSync('src/lib/accountingService.ts','utf8')
const start=serviceSource.indexOf('export async function createCorrectionTransaction(')
const end=serviceSource.indexOf('\n/**',start)
const service=(await transform(serviceSource.slice(start,end).replace('export async','async'),{loader:'ts',target:'es2022'})).code
const makeService=new Function('getUserId','supabase',service+';return createCorrectionTransaction')
const sql=fs.readFileSync('supabase/migrations/20261031204304_kan124_generic_vat_correction_guard.sql','utf8')
const guidance=sql.match(/v_guidance constant text := '([^']+)'/)[1]
const reasons=[...sql.matchAll(/RAISE EXCEPTION '([^']+)'[^;]*DETAIL='(KAN124_[^']+)'/g)].map(m=>({message:m[1].replace('%–%','2026-04-01–2026-06-30').replace(/%$/,guidance),details:m[2],code:'23514'}))
assert(reasons.some(r=>r.details==='KAN124_ORIGIN_CLOSED'))
assert(reasons.some(r=>r.details==='KAN124_ORIGIN_DECLARED'))
assert(reasons.some(r=>r.details==='KAN124_TARGET_REVIEW'))
let identityChecks=0
const blocked=makeService(async()=>{identityChecks++},{rpc:async(name,args)=>{assert.equal(name,'create_correction_transaction_atomic');assert.deepEqual(args,{p_original_tx_id:'synthetic'});return {data:null,error:reasons[0]}}})
await assert.rejects(blocked('synthetic'),e=>e.name==='CorrectionBlockedError'&&e.message===reasons[0].message)
assert.equal(identityChecks,1)
const unknown=makeService(async()=>{},{rpc:async()=>({data:null,error:{message:'Other rejection'}})})
await assert.rejects(unknown('synthetic'),/Korrigeringen misslyckades och rullades tillbaka: Other rejection/)
const pageSource=fs.readFileSync('src/app/page.tsx','utf8')
const handler=(await transform(pageSource.slice(pageSource.indexOf('  async function handleDelete('),pageSource.indexOf('\n  const handleEdit =',pageSource.indexOf('  async function handleDelete('))),{loader:'ts',target:'es2022'})).code
// Verify the actual page's only report action remains local navigation.
assert.match(pageSource,/onOpenVatReport=\{\(\) => \{ setCorrectionBlocked\(null\); setActiveTab\('moms'\) \}\}/)
const fixture=`import {useState} from 'react';import {createRoot} from 'react-dom/client';import Dialog from './src/components/CorrectionBlockedDialog';
window.calls=[];window.refreshes=0;window.report=0;function App(){const [notice,setCorrectionBlocked]=useState(null);
const journalMap={'synthetic':[{ver_nr:3}]},isYearLocked=false,isSystemManagedTransaction=()=>false,describeSystemManagedTransaction=()=>'';
const getUserId=async()=>{};const supabase={rpc:async(name,args)=>{window.calls.push({name,args});return window.result}};
const refreshData=async()=>{window.refreshes++};
${service}
${handler}
return <><button id="correct" onClick={()=>handleDelete({id:'synthetic',description:'Syntetisk bokning'})}>Korrigera</button><button>Bakgrund</button>{notice&&<Dialog notice={notice} onClose={()=>setCorrectionBlocked(null)} onOpenVatReport={()=>{setCorrectionBlocked(null);window.report++}}/>}</>}
createRoot(document.getElementById('root')).render(<App/>);`
const bundled=await build({stdin:{contents:fixture,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const css=await postcss([tailwindcss()]).process(fs.readFileSync('src/app/globals.css','utf8').replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/CorrectionBlockedDialog.tsx";'),{from:path.resolve('kan125-ui.css')})
const dir=path.resolve('test-results/kan125-'+Date.now());fs.mkdirSync(dir,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
let checks=0
try{
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:width===320?568:900}}),dialogs=[],errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});if(d.type()==='confirm')await d.accept();else await d.dismiss()})
  await page.route('**/*',r=>r.abort())
  await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>')
  await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundled.outputFiles[0].text})
  for(const [i,error] of reasons.entries()){
   const result={data:null,error};dialogs.length=0;await page.evaluate(()=>{window.calls=[];window.refreshes=0;window.report=0})
   await page.evaluate(r=>window.result=r,result)
   await page.getByRole('button',{name:'Korrigera',exact:true}).click()
   const dialog=page.getByRole('dialog',{name:'Rättelsen har stoppats'})
   await expect(dialog).toBeVisible()
   await expect(dialog).toContainText('Originalverifikation VER-3 · Syntetisk bokning')
   await expect(dialog).toContainText(error.message.split(' Öppna momsrapporten för perioden')[0].replace(/ Inget har bokförts\.$/,''))
   await expect(dialog).toContainText('Ingen ny verifikation har skapats och inget verifikationsnummer har förbrukats.')
   await expect(dialog.getByRole('heading',{name:'Rättelsen har stoppats'})).toBeFocused();assert.equal(await dialog.evaluate(e=>e.scrollTop),0)
   assert.deepEqual(dialogs.map(d=>d.type),['confirm'],'No browser rejection alert')
   assert.equal(await page.evaluate(()=>window.calls.length),1)
   assert.equal(await page.evaluate(()=>window.refreshes),0,'No false success refresh')
   const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=width)
   assert.equal(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth),true,'No horizontal dialog overflow')
   if(error.details==='KAN124_ORIGIN_CLOSED')await page.screenshot({path:path.join(dir,'initial-'+width+'.png')});await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Stäng',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Öppna momsrapporten'})).toBeFocused()
   await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Stäng',exact:true})).toBeFocused();assert.equal(await page.getByRole('button',{name:'Bakgrund',exact:true}).evaluate(e=>e.checkVisibility() && !e.closest('dialog') && document.querySelector('dialog:modal')!==null),true,'Background outside modal')
   if(error.details==='KAN124_ORIGIN_DECLARED'||error.details==='KAN124_ORIGIN_CLOSED')await page.screenshot({path:path.join(dir,`${error.details}-${width}.png`),fullPage:true})
   if(i%3===0)await page.keyboard.press('Escape')
   else if(i%3===1)await dialog.getByRole('button',{name:'Stäng',exact:true}).click()
   else await dialog.getByRole('button',{name:'Öppna momsrapporten'}).click()
   await expect(dialog).toHaveCount(0)
   await expect(page.getByRole('button',{name:'Korrigera',exact:true})).toBeFocused()
   assert.equal(await page.evaluate(()=>window.calls.length),1,'Closing/navigation never resubmits')
   assert.equal(await page.evaluate(()=>window.report),i%3===2?1:0)
   checks++
  }
  // Normal allowed correction retains the exact RPC payload, success and refresh.
  dialogs.length=0
  await page.evaluate(()=>{window.calls=[];window.result={data:{success:true,ver_nr:44},error:null}})
  await page.getByRole('button',{name:'Korrigera',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.refreshes)).toBe(1)
  assert.equal(dialogs[1].message,'✅ Korrigeringsverifikation VER-44 skapad.')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.deepEqual(await page.evaluate(()=>window.calls),[{name:'create_correction_transaction_atomic',args:{p_original_tx_id:'synthetic'}}])
  // Generic errors must not claim known atomic VAT rejection.
  dialogs.length=0;await page.evaluate(()=>window.result={data:null,error:{message:'Other rejection'}})
  await page.getByRole('button',{name:'Korrigera',exact:true}).click()
  await expect.poll(()=>dialogs.length).toBe(2)
  assert.match(dialogs[1].message,/Kunde inte skapa korrigering/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  assert.deepEqual(errors,[])
  checks+=2;await page.close()
 }
 console.log('PASS KAN124/KAN125: '+checks+' offline UI cases; desktop/mobile, server reasons, keyboard/focus, no resubmit, allowed correction and unknown errors. Screenshots: '+dir)
}finally{await browser.close()}
