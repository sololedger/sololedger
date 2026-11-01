// Real component, offline synthetic Supabase adapter, no credentials or network.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'
const fixture=`import {createRoot} from 'react-dom/client';import History from './src/components/AccountingAttachmentHistory';
const root=createRoot(document.getElementById('root'));
window.mount=(owner='owner-a',locked=false,type='transaction',id='tx-a')=>root.render(<History owner={owner} entityType={type} entityId={id} locked={locked} onUpload={async file=>{window.fx.uploads++;return owner+'/'+file.name}}/>);
window.open=()=>{const t={location:{},close:()=>window.fx.closed++};return t};window.mount();`
const mock=`export const supabase={
from:table=>{const eqs={};const b={select:()=>b,eq:(k,v)=>{eqs[k]=v;return b},order:()=>b,range:async()=>{
window.fx.reads.push({table,eqs});if(window.fx.delay)await new Promise(r=>window.release=r);
if(window.fx.readFail)return {error:{message:'synthetic error'},count:null,data:null};
const rows=window.fx.rows.filter(r=>r.user_id===eqs.user_id);return {data:rows,count:rows.length,error:null};}};return b},
rpc:async(name,args)=>{window.fx.calls.push({name,args});if(window.fx.rpcFail)return {error:{message:'synthetic denial'}};
window.fx.rows.push({id:3,user_id:args.p_path.split('/')[0],path:args.p_path,original_path:'owner-a/original.pdf',action:'addition',actor_id:'owner-a',recorded_at:'2026-11-01T12:00:00Z',note:args.p_note});return {data:{success:true}}},
storage:{from:bucket=>({createSignedUrl:async(path,ttl)=>{window.fx.signed.push({bucket,path,ttl});return {data:{signedUrl:'https://synthetic.invalid/file'}}}})}
};`
const bundle=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},tsconfig:path.resolve('tsconfig.json'),bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'offline',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'mock',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:mock}))}}]})
const css=await postcss([tailwindcss()]).process((await fs.readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/AccountingAttachmentHistory.tsx";'),{from:path.resolve('kan128-test.css')})
const dir='test-results/kan128-'+Date.now();await fs.mkdir(dir,{recursive:true})
const browser=await chromium.launch({headless:true});let checks=0
try {
for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort())
 await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
 await page.addStyleTag({content:css.css})
 await page.evaluate(()=>{window.fx={reads:[],calls:[],uploads:0,signed:[],closed:0,rows:[
 {id:1,user_id:'owner-a',path:'owner-a/original.pdf',original_path:'owner-a/original.pdf',action:'observed_existing',actor_id:null,recorded_at:'2026-11-01T10:00:00Z',note:'Observerad befintlig referens.'},
 {id:2,user_id:'owner-a',path:'owner-a/replacement.pdf',original_path:'owner-a/original.pdf',action:'replacement',actor_id:'owner-a',recorded_at:'2026-11-01T11:00:00Z',note:'Tidigare underlag bevarat.'}]}})
 await page.addScriptTag({content:bundle.outputFiles[0].text});await expect(page.getByRole('button',{name:'Bilagehistorik och tillägg'})).toBeVisible();assert.equal(await page.evaluate(()=>window.fx.reads.length),0);checks++
 await page.getByRole('button',{name:'Bilagehistorik och tillägg'}).click();await expect(page.getByText('Tidigare registreringstid och användare är okända.')).toBeVisible();await expect(page.getByRole('button',{name:'Öppna bevarat underlag'}).first()).toBeVisible();checks++
 await page.getByRole('button',{name:'Öppna bevarat underlag'}).first().click();await expect.poll(()=>page.evaluate(()=>window.fx.signed.length)).toBe(1);assert.deepEqual(await page.evaluate(()=>window.fx.signed[0]),{bucket:'attachments',path:'owner-a/original.pdf',ttl:60});checks++
 const read=await page.evaluate(()=>window.fx.reads[0]);assert.equal(read.table,'accounting_attachment_history');assert.deepEqual(read.eqs,{user_id:'owner-a',transaction_id:'tx-a'});checks++
 await page.getByLabel('Kompletterande bilaga').setInputFiles({name:'evidence.pdf',mimeType:'application/pdf',buffer:Buffer.from('KAN128 synthetic only')});await page.getByLabel('Beskriv tillägget').fill('Kompletterande syntetiskt underlag')
 await page.evaluate(()=>window.fx.rpcFail=true);await page.getByRole('button',{name:'Spara bilagetillägg'}).click();await expect(page.getByRole('alert')).toContainText('Tidigare underlag finns kvar');assert.equal(await page.evaluate(()=>window.fx.uploads),1);checks++
 await page.evaluate(()=>window.fx.rpcFail=false);await page.getByRole('button',{name:'Spara bilagetillägg'}).click();await expect(page.getByText('Kompletterande syntetiskt underlag',{exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>window.fx.uploads),1);assert.equal(await page.evaluate(()=>window.fx.calls.length),2);assert.equal((await page.evaluate(()=>window.fx.calls[1])).name,'add_accounting_attachment');checks++
 await page.evaluate(()=>window.mount('owner-a',true));await expect(page.getByText(/Året är låst/)).toBeVisible();await expect(page.getByLabel('Kompletterande bilaga')).toHaveCount(0);await expect(page.getByRole('button',{name:'Öppna bevarat underlag'}).first()).toBeEnabled();checks++
 await page.screenshot({path:dir+'/history-locked-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks++
 await page.evaluate(()=>window.mount('owner-b',false,'customer_invoice','invoice-b'));await expect(page.getByText('Tidigare underlag bevarat.')).toHaveCount(0);await page.getByRole('button',{name:'Bilagehistorik och tillägg'}).click();await expect(page.getByText('Ingen bilagehistorik registrerad.')).toBeVisible();assert.deepEqual((await page.evaluate(()=>window.fx.reads.at(-1))).eqs,{user_id:'owner-b',customer_invoice_id:'invoice-b'});checks++
 await page.evaluate(()=>{window.fx.readFail=true;window.mount('owner-a',false,'supplier_invoice','supplier-a')});await page.getByRole('button',{name:'Bilagehistorik och tillägg'}).click();await expect(page.getByRole('alert')).toContainText('kunde inte hämtas');await expect(page.getByLabel('Kompletterande bilaga')).toHaveCount(0);checks++
 await page.evaluate(()=>{window.fx.readFail=false;window.fx.delay=true;window.mount('owner-a',false,'transaction','delayed')});await page.getByRole('button',{name:'Bilagehistorik och tillägg'}).click();await expect.poll(()=>page.evaluate(()=>!!window.release)).toBe(true)
 await page.evaluate(()=>window.mount('owner-b',false,'transaction','new-owner'));await page.evaluate(()=>{window.fx.delay=false;window.release()});await expect(page.getByText('Observerad befintlig referens.')).toHaveCount(0);checks++
 assert.deepEqual(errors,[]);await page.close()
}
console.log(JSON.stringify({status:'PASS',checks,viewports:['desktop','mobile'],network:'blocked',screenshots:dir}))
}finally{await browser.close()}
