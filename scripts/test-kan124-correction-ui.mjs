import assert from 'node:assert/strict'
import fs from 'node:fs'
import {transform} from 'esbuild'
import {chromium} from '@playwright/test'
const serviceSource=fs.readFileSync('src/lib/accountingService.ts','utf8')
const start=serviceSource.indexOf('export async function createCorrectionTransaction(')
const end=serviceSource.indexOf('\n/**',start)
const service=(await transform(serviceSource.slice(start,end).replace('export async','async'),{loader:'ts',target:'es2022'})).code
const makeService=new Function('getUserId','supabase',service+';return createCorrectionTransaction')
const message='Rättelsen kan inte göras med Korrigera eftersom den ursprungliga bokningen påverkar momsperioden 2026-04-01–2026-06-30, som är markerad som deklarerad. En tidigare momsdeklaration kan behöva rättas. Öppna momsrapporten för perioden och ta hjälp av en redovisningskunnig för att bedöma bokföringen och deklarationen. SoloLedger har ännu inget komplett flöde för den här rättelsen. Inget har bokförts.'
const failure={data:null,error:{message,details:'KAN124_ORIGIN_DECLARED',code:'23514'}}
let identityChecks=0
const blocked=makeService(async()=>{identityChecks++},{rpc:async(name,args)=>{assert.equal(name,'create_correction_transaction_atomic');assert.deepEqual(args,{p_original_tx_id:'synthetic'});return failure}})
await assert.rejects(blocked('synthetic'),e=>e.name==='CorrectionBlockedError'&&e.message===message)
assert.equal(identityChecks,1)
const unknown=makeService(async()=>{},{rpc:async()=>({data:null,error:{message:'Other rejection'}})})
await assert.rejects(unknown('synthetic'),/Korrigeringen misslyckades och rullades tillbaka: Other rejection/)
const pageSource=fs.readFileSync('src/app/page.tsx','utf8')
const handler=(await transform(pageSource.slice(pageSource.indexOf('  async function handleDelete('),pageSource.indexOf('\n  const handleEdit =',pageSource.indexOf('  async function handleDelete('))),{loader:'ts',target:'es2022'})).code
const browser=await chromium.launch({headless:true})
try{
 const context=await browser.newContext({offline:true})
 const page=await context.newPage()
 await page.setContent('<button id="correct">Korrigera syntetisk verifikation</button>')
 const dialogs=[]
 page.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});if(d.type()==='confirm')await d.accept();else await d.dismiss()})
 for(const result of [failure,{data:{success:true,ver_nr:44},error:null}]){
  dialogs.length=0
  await page.evaluate(({service,handler,result})=>{
   const createCorrectionTransaction=new Function('getUserId','supabase',service+';return createCorrectionTransaction')(async()=>{}, {rpc:async()=>result})
   window.kan124RefreshCount=0;window.kan124Finished=false
   const handleDelete=new Function('isYearLocked','isSystemManagedTransaction','describeSystemManagedTransaction','journalMap','confirm','createCorrectionTransaction','alert','refreshData','console',handler+';return handleDelete')(false,()=>false,()=>'',{'synthetic':[{ver_nr:3}]},window.confirm.bind(window),createCorrectionTransaction,window.alert.bind(window),async()=>{window.kan124RefreshCount++},{error:()=>{}})
   document.querySelector('#correct').onclick=()=>handleDelete({id:'synthetic',description:'Synthetic only'}).then(()=>{window.kan124Finished=true})
  },{service,handler,result})
  await page.click('#correct')
  await page.waitForFunction(()=>window.kan124Finished)
  assert.equal(dialogs[0].type,'confirm')
  assert.equal(dialogs[1].type,'alert')
  if(result.error){assert.equal(dialogs[1].message,message);assert.equal(await page.evaluate(()=>window.kan124RefreshCount),0)}
  else{assert.equal(dialogs[1].message,'✅ Korrigeringsverifikation VER-44 skapad.');assert.equal(await page.evaluate(()=>window.kan124RefreshCount),1)}
 }
 console.log('PASS KAN124: actual service and page handler show intact Swedish rejection in Chromium; no false success/refresh; normal success preserved')
}finally{await browser.close()}
