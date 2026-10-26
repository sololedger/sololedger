// Real useAuth + profile context + checklist client/store/guide; installed Auth
// SDK visibility recovery with synthetic sessions. No network or accounting writes.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import {resolve} from 'node:path'
import {mkdir,writeFile} from 'node:fs/promises'
const reproduce=process.argv.includes('--reproduce-before')
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
import{useAuth}from'./src/hooks/useAuth';import Guide from'./src/components/YearEndGuide';import{focusControl}from'./tests/fixtures/authFocusMocks';
window.test={...focusControl,event:(owner,event)=>flushSync(()=>focusControl.event(owner,event))};
window.rpcTest={reads:0,saves:[],fail:false,db:{},pause:false,release:null};
function App(){const a=useAuth();return a.profile?<Guide key={${reproduce?"a.user.id+':'+a.profileContextKey":"a.user.id"}} owner={a.user.id} year={2025} companyName={a.profile.company_name} ready={true} error={null} locked={false} contextKey={a.profileContextKey} contextReady={a.profileContextReady} initialOpenControls={[100,1]} initialControl={null} onNavigate={()=>{}}/>:<p>Profil inväntas</p>}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`
const transport=`import{focusControl,supabase as base}from'./tests/fixtures/authFocusMocks';
const keys=['documents','bank','customers','suppliers','inventory','vat','statements','tax','submission','payments','next_year'];
export const supabase={...base,auth:{...base.auth,onAuthStateChange:cb=>{const s=base.auth.onAuthStateChange(cb);window.authMounted=true;return s},getSession:async()=>{const r=await base.auth.getUser();return{data:{session:{user:r.data.user}},error:null}}},
rpc:(name,args)=>({abortSignal:async()=>{const t=window.rpcTest,owner=(await base.auth.getUser()).data.user.id;
const d=t.db[owner]??={owner,year:2025,basis_version:1,basis:Object.fromEntries(keys.map(k=>[k,'a'.repeat(32)])),checks:[],system:{locked:false,periods:[{start:'2025-01-01',end:'2025-12-31',status:'declared'}],declaration_versions:2}};
if(name==='get_year_end_checklist'){t.reads++;if(t.fail)throw Error('Network down')}else{
t.saves.push(args);if(t.pause)await new Promise(r=>t.release=r);const previous=d.checks.find(r=>r.check_key===args.p_key);if(previous?.requestId!==args.p_request_id){if((previous?.revision??0)!==args.p_expected_revision)return{data:null,error:{code:'PT409'}};d.checks=d.checks.filter(r=>r.check_key!==args.p_key).concat({check_key:args.p_key,confirmed:args.p_confirmed,confirmed_at:args.p_confirmed?'2026-10-26T10:00:00Z':null,revision:args.p_expected_revision+1,basis_fingerprint:args.p_expected_basis,confirmation_version:1,basis_version:1,requestId:args.p_request_id})}}
return{data:structuredClone(d),error:null}}})};`
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'year-end-auth',setup(b){
 if(reproduce)b.onLoad({filter:/YearEndChecklistControls\.tsx$/},async()=>({contents:(await import('node:child_process')).execFileSync('git',['show','bf845c2:src/components/YearEndChecklistControls.tsx'],{encoding:'utf8'})+'\nexport const ChecklistStatus=()=>null',loader:'tsx',resolveDir:resolve('src/components')}))
 b.onResolve({filter:/supabaseClient$/},()=>({path:'transport',namespace:'synthetic'}))
 b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:transport,loader:'tsx',resolveDir:process.cwd()}))
}}]})
const out='coverage/kan112-auth';await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true}),results=[]
try{
 for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url()==='https://kan112.test/'?r.fulfill({contentType:'text/html',body:'<html lang="sv"><meta charset="utf-8"><div id="root"></div></html>'}):r.abort())
 await page.goto('https://kan112.test/');await page.addScriptTag({content:bundle.outputFiles[0].text})
 const call=(name,...args)=>page.evaluate(([n,a])=>window.test[n](...a),[name,args])
 const guide=page.getByRole('region',{name:'Årsavslut för 2025'}),bank=guide.locator('[data-check-key="bank"]'),check=bank.getByRole('checkbox')
 await page.waitForFunction(()=>window.authMounted);await call('event','A');await expect.poll(()=>call('pending').then(p=>p.length)).toBe(1);await call('finish',0)
 await expect(check).toBeEnabled();await check.click();await expect(check).toBeChecked();await expect(guide.getByText('Sparat',{exact:true})).toBeVisible()
 await call('installVisibilityRecovery','A')
 const visibility=()=>page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});window.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});window.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))})
 for(let i=0;i<5;i++){
 const reads=await page.evaluate(()=>window.rpcTest.reads)
 await visibility();await expect.poll(()=>call('pending').then(p=>p.length)).toBe(1)
 if(reproduce){await expect(guide.getByRole('alert')).toContainText('Checklistan kunde inte hämtas');await call('finish',0);results.push({width,reproduced:true});break}
 await expect(check).toBeChecked();await expect(check).toBeDisabled();assert.equal(await page.evaluate(()=>window.rpcTest.reads),reads)
 await call('finish',0);await expect(check).toBeEnabled();await expect(check).toBeChecked();await expect(guide.getByRole('alert')).toHaveCount(0)
 assert.equal(await page.evaluate(()=>window.rpcTest.reads),reads+1)
 }
 if(reproduce){await page.close();continue}
 await page.clock.install();await page.clock.fastForward(35*60*1000);await call('event','A','TOKEN_REFRESHED');await call('finish',0);await expect(check).toBeEnabled()
 // Pending save is not dropped by renewed Auth, even if its response arrives late.
 await page.evaluate(()=>window.rpcTest.pause=true);await check.click();await expect.poll(()=>page.evaluate(()=>!!window.rpcTest.release)).toBe(true)
 await call('event','A');await call('finish',0);await expect(guide.getByRole('alert')).toContainText('Sparandet kunde inte bekräftas')
 await page.evaluate(()=>{window.rpcTest.pause=false;window.rpcTest.release()});await page.waitForTimeout(50)
 await guide.getByRole('button',{name:'Försök spara igen'}).click();await expect(check).not.toBeChecked()
 const saves=await page.evaluate(()=>window.rpcTest.saves);assert.deepEqual(saves.at(-1),saves.at(-2))
 await check.click();await expect(check).toBeChecked()
 await page.evaluate(()=>window.rpcTest.fail=true);await call('event','A');await call('finish',0);await expect(guide.getByRole('alert')).toContainText('Checklistan kunde inte hämtas')
 await page.evaluate(()=>window.rpcTest.fail=false);await guide.getByRole('button',{name:'Läs om checklistan'}).click();await expect(check).toBeChecked()
 const status=guide.getByLabel('Systemstatus');await status.locator('summary').click();await expect(status).toContainText('inlämning registrerad av användaren – inte verifierad av Skatteverket');await expect(status).toContainText('Sparade deklarationsversioner: 2')
 await call('event','B');await expect(guide).toHaveCount(0);await call('finish',0);await expect(check).not.toBeChecked()
 await call('event','A');await call('finish',0);await expect(check).toBeChecked()
 await call('event','A');await call('finish',0,true);await expect(guide).toHaveCount(0)
 await call('event',null);await expect(guide).toHaveCount(0);assert.deepEqual(errors,[])
 results.push({width,status:'PASS',visibilityRefreshes:5,inactivityMinutes:35,pendingSaveReplay:true,networkErrorAndRecovery:true,ownerIsolation:true,profileFailureClosed:true,strictMode:true})
 await page.close()
 }
 await writeFile(out+(reproduce?'/before.json':'/result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results))
}finally{await browser.close()}
