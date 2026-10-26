// Real Home, Layout, boundary and guide. Existing accounting panels are sentinels;
// all Auth/data/write boundaries are synthetic and every external request is denied.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const fixture = { owner: 'owner-a', name: 'Syntetiska A', ready: true, error: null, locked: false, revision: 1 }
const authMock = `import {useSyncExternalStore} from 'react';
export function useAuth(){const f=useSyncExternalStore(cb=>{window.listeners.add(cb);return()=>window.listeners.delete(cb)},()=>window.fixture);
return {user:{id:f.owner,email:f.owner+'@example.test'},profile:f.noProfile?null:{id:f.owner,company_name:f.name,subscription_type:'paid',role:'user',vat_status:'registered',domestic_sales_vat_treatment:'taxable',foreign_purchase_reporting:'required',default_deduction_entitlement:'full',vat_period_type:'year',vat_management_from:'2025-01-01'},profileContextKey:f.revision,profileContextReady:f.contextReady??true,profileError:f.noProfile?'Profil saknas':null,authLoading:false,verifyProfile:async()=>{throw Error('No writes allowed')},retryProfile:()=>{}}}`
const forbidden = `const deny=(...a)=>{window.writes.push(a);throw Error('Forbidden synthetic write')};`
const mock = {
 yearEndChecklistClient: `const keys=['documents','bank','customers','suppliers','inventory','vat','statements','tax','submission','payments','next_year'];
 export const checklistPort=(owner,year)=>{
 const identity=owner+':'+year;window.checklistDB??={};const get=()=>window.checklistDB[identity]??={owner,year,basis_version:1,basis:Object.fromEntries(keys.map(k=>[k,'a'.repeat(32)])),checks:[],system:{locked:false,periods:[],declaration_versions:0}};
 return {load:async()=>{window.checklistLoads=(window.checklistLoads??0)+1;if(window.fixture.contextReady===false)throw Error('Premature profile read');if(window.failLoad)throw Error('load failure');return structuredClone(get())},save:async c=>{window.checklistWrites??=[];window.checklistWrites.push(c);if(window.failSave)throw Error('Sparandet kunde inte bekräftas.');const d=get(),r=d.checks.find(r=>r.check_key===c.key);if((r?.revision??0)!==c.revision)throw Error('Checklistan har ändrats. Läs om.');d.checks=d.checks.filter(r=>r.check_key!==c.key).concat({check_key:c.key,confirmed:c.confirmed,confirmed_at:c.confirmed?'2026-10-26T09:00:00Z':null,revision:c.revision+1,basis_fingerprint:c.confirmed?d.basis[c.key]:null,confirmation_version:1,basis_version:1});return structuredClone(d)}}}`,

  useAuth: authMock,
  useAccountingData: `export const useAccountingData=(u,year)=>({accountingDataReady:window.fixture.ready,accountingDataError:window.fixture.error,isYearLocked:window.fixture.locked,transactions:[],balances:{},balanceSheetBalances:{},journalMap:{},neData:{},momsBreakdown:{},transactionHistoryComplete:true,kontoplan:[],kontoplanLoaded:true,kontoplanLoading:false,retryAccountingData:()=>{},refreshData:()=>{throw Error('Guide must not refresh')},refreshDataWithStatus:()=>{throw Error('Guide must not refresh')}});`,
  usePaymentAccountRoleConfiguration: `export const usePaymentAccountRoleConfiguration=()=>({configuredRoles:[],loaded:true,loading:false,error:null});`,
  subscriptionLimits: `export const FREE_TRANSACTION_LIMIT=15;export const getFreeTransactionUsage=async()=>0;export const canCreateTransactions=()=>true;`,
  accountingService: forbidden + `export const getCustomerInvoices=async()=>[];export const isYearClosed=async()=>false;export const closeYear=deny,bookStandardBookingAttempt=deny,bookVatV2EuServiceReverseChargeTransaction=deny,createCorrectionTransaction=deny,updateTransaction=deny;`,
  supabaseClient: forbidden + `export const supabase={from:()=>({insert:deny,update:deny,upsert:deny,delete:deny}),rpc:deny,storage:{from:()=>({upload:deny})}};`,
}
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import Home from './src/app/page';
window.fixture=${JSON.stringify(fixture)};window.listeners=new Set();window.writes=[];
window.harness={set(change){flushSync(()=>{window.fixture={...window.fixture,...change};for(const cb of window.listeners)cb()})}};
createRoot(document.getElementById('root')).render(<Home/>);`
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', plugins: [{ name: 'offline-year-end', setup(b) {
  b.onResolve({ filter: /.*/ }, args => {
    const leaf = args.path.split('/').at(-1)
    if (mock[leaf]) return { path: leaf, namespace: 'offline' }
    if (args.importer.replaceAll('\\', '/').endsWith('/src/app/page.tsx') && args.path.startsWith('@/components/') && !['Layout', 'YearEndGuide', 'AccountingDataBoundary'].includes(leaf)) return { path: 'panel-' + leaf, namespace: 'offline' }
  })
  b.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: mock[args.path] || (args.path === 'panel-NEBilaga'
    ? `import Guide from './src/components/NEDeclarationGuide';export default function Panel(p){return <section data-panel="NEBilaga">NEBilaga<span>{p.selectedYear}</span><Guide key={p.userId+':'+p.selectedYear+':'+p.companyName} year={p.selectedYear} companyName={p.companyName} onOpenYearEnd={p.onOpenYearEnd} initialOpenDetails={p.initialGuideOpenDetails}/></section>}`
    : `export default function Panel(p){if('isOpen' in p&&!p.isOpen)return null;return <section data-panel="${args.path.slice(6)}">${args.path.slice(6)}<span>{p.selectedYear??'egen period'}</span>{p.children}</section>}`), loader: 'tsx', resolveDir: process.cwd() }))
} }] })
const css = (await postcss([tailwind({ base: process.cwd() })]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css

const out='coverage/kan112-browser';await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true});const results=[]
try {
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[],external=[]
  page.on('pageerror',e=>errors.push(e.message))
  await context.route('**/*',route=>{
   if(route.request().url()==='https://kan99.test/')return route.fulfill({contentType:'text/html',body:'<html lang="sv"><meta charset="utf-8"><style>'+css+'</style><body><div id="root"></div></body></html>'})
   external.push(route.request().url());return route.abort()
  })
  await page.goto('https://kan99.test/');await page.addScriptTag({content:bundle.outputFiles[0].text})
  async function navigate(label){
   let b=page.getByRole('button',{name:label,exact:true}).filter({visible:true})
   if(!await b.count()){const mobile=page.getByRole('button',{name:'Öppna meny',exact:true});if(await mobile.isVisible())await mobile.click();else await page.getByRole('button',{name:/^Mer/}).click();b=page.getByRole('button',{name:label,exact:true}).filter({visible:true});if(!await b.count())b=page.getByRole('menuitem',{name:label,exact:true})}
   await b.click()
  }
  await navigate('Årsavslut');const guide=page.getByRole('region',{name:'Årsavslut för 2026',exact:true})
  await expect(guide).toContainText('0 av 11 bekräftade av dig')
  await expect(guide.locator('details[data-control-index="100"],details[data-control-index="101"],details[data-control-index="102"],details[data-control-index="103"]')).toHaveCount(4)
  await expect(guide.locator('details[data-check-key]')).toHaveCount(11)
  await expect(guide).toContainText('Moms har egna tidsfrister')
  await page.screenshot({path:out+'/overview-'+width+'.png',fullPage:true})
  const bank=guide.locator('[data-check-key="bank"]');await bank.locator('summary').click()
  const checkbox=bank.getByRole('checkbox');await checkbox.click();await expect(checkbox).toBeChecked();await expect(guide).toContainText('1 av 11 bekräftade av dig')
  await expect(bank.locator('summary')).toContainText('✓ Bekräftat av dig')
  await bank.screenshot({path:out+'/confirmed-'+width+'.png'})
  for(let i=0;i<5;i++){
   const reads=await page.evaluate(()=>window.checklistLoads)
   await page.evaluate(i=>window.harness.set({revision:10+i,contextReady:false}),i)
   await expect(checkbox).toBeChecked();await expect(checkbox).toBeDisabled()
   await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('visibilitychange'))})
   assert.equal(await page.evaluate(()=>window.checklistLoads),reads)
   await expect(guide.getByRole('alert')).toHaveCount(0)
   await page.evaluate(()=>window.harness.set({contextReady:true}))
   await expect(checkbox).toBeEnabled();await expect(checkbox).toBeChecked()
   assert.equal(await page.evaluate(()=>window.checklistLoads),reads+1)
  }
  await bank.getByRole('button',{name:'Öppna Bokföring',exact:true}).click()
  await page.getByRole('button',{name:'Tillbaka till årsavslutet 2026',exact:true}).click()
  await expect(checkbox).toBeVisible();await expect(checkbox).toBeChecked()
  await expect(bank.locator('summary')).toBeFocused()
  await page.evaluate(()=>{window.checklistDB['owner-a:2026'].basis.bank='b'.repeat(32)})
  await guide.getByRole('button',{name:'Läs om checklistan'}).click();await expect(bank).toContainText('Kontrollera igen');await expect(checkbox).toBeChecked()
  await expect(bank.locator('summary')).toContainText('⚠ Kontrollera igen – underlaget har ändrats')
  await bank.screenshot({path:out+'/review-'+width+'.png'})
  await bank.getByRole('button',{name:'Jag har kontrollerat igen'}).click();await expect(bank.getByRole('button',{name:'Jag har kontrollerat igen'})).toHaveCount(0)
  await page.evaluate(()=>window.failSave=true);await checkbox.click();await expect(guide.getByRole('alert')).toContainText('Sparandet kunde inte bekräftas');await expect(checkbox).toBeChecked();await expect(checkbox).toBeDisabled()
  await page.evaluate(()=>window.failSave=false);await guide.getByRole('button',{name:'Försök spara igen'}).click();await expect(checkbox).not.toBeChecked();await expect(checkbox).toBeEnabled()
  await checkbox.click();await expect(checkbox).toBeChecked()
  await page.evaluate(()=>window.harness.set({owner:'owner-b',name:'Syntetiska B',revision:2}));await navigate('Årsavslut')
  await expect(guide).toContainText('0 av 11 bekräftade av dig');await expect(guide).not.toContainText('Syntetiska A')
  await page.evaluate(()=>window.harness.set({owner:'owner-a',name:'Syntetiska A',revision:3}));await navigate('Årsavslut');await expect(guide).toContainText('1 av 11 bekräftade av dig')
  await bank.locator('summary').click();await expect(checkbox).toBeChecked()
  const year=page.getByRole('group',{name:'Ekonomikontroller'}).getByRole('combobox')
  await year.selectOption('2025');const prior=page.getByRole('region',{name:'Årsavslut för 2025',exact:true});await expect(prior).toContainText('0 av 11 bekräftade av dig')
  await year.selectOption('2026');await expect(guide).toContainText('1 av 11 bekräftade av dig')
  await page.evaluate(()=>window.harness.set({locked:true}));await expect(guide).toContainText('låst enligt SoloLedger');await bank.locator('summary').click();await checkbox.click();await expect(checkbox).not.toBeChecked()
  await page.evaluate(()=>window.failLoad=true);await guide.getByRole('button',{name:'Läs om checklistan'}).click();await expect(guide.getByRole('alert')).toContainText('Dina sparade svar har inte raderats');await expect(checkbox).toHaveCount(0);await expect(guide).not.toContainText('0 av 11 bekräftade av dig')
  await page.evaluate(()=>window.failLoad=false);await guide.getByRole('button',{name:'Läs om checklistan'}).click();await expect(checkbox).toBeEnabled()
  // All eleven controls must have an explanation and a real navigation action.
  for(const group of await guide.locator('details[data-control-index="100"],details[data-control-index="101"],details[data-control-index="102"],details[data-control-index="103"]').all())if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click()
  for(const detail of await guide.locator('[data-check-key]').all()){
   if(await detail.getAttribute('open')===null)await detail.locator(':scope > summary').click()
   await expect(detail.getByText('Varför behövs kontrollen?',{exact:true})).toBeVisible();await expect(detail.getByText('Om något inte stämmer',{exact:true})).toBeVisible();assert(await detail.getByRole('button',{name:/^Öppna /}).count()>0)
  }
  for(const [key,label] of [['documents','Profil'],['customers','Fakturor'],['suppliers','Bokslutsskulder'],['inventory','Inventarier'],['vat','Moms'],['statements','NE-Bilaga']]){
   const detail=guide.locator('[data-check-key="'+key+'"]');await detail.getByRole('button',{name:'Öppna '+label,exact:true}).click()
   // Destination may change the year and renew the same-owner profile.
   if(await year.isVisible())await year.selectOption('2025');await page.evaluate(()=>window.harness.set({revision:50}))
   await page.getByRole('button',{name:'Tillbaka till årsavslutet 2026',exact:true}).click();await expect(detail).toBeVisible();await expect(year).toHaveValue('2026');await expect(detail.locator('summary')).toBeFocused()
   const box=await detail.locator('summary').boundingBox();assert(box.y>=0&&box.y<150,'return scrolls to the originating control')
  }
  const vat=guide.locator('[data-check-key="vat"]');await expect(vat).not.toContainText('Adobe');await expect(vat).not.toContainText('Fiktivt exempel')
  await expect(guide.getByLabel('Systemstatus').locator('summary')).toContainText('Bokföringsår 2026: låst')
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[])
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:out+'/expanded-'+width+'.png',fullPage:true})
  assert.deepEqual(await page.evaluate(()=>window.writes),[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[])
  results.push({width,status:'PASS',scope:'actual Home/Layout/guide/store, synthetic checklist RPC, all external requests denied; mark/unmark/revisit, owner/year, changed basis, retry, locked year, load failure, responsive layout and navigation'})
  await context.close()
 }
 await writeFile(out+'/result.json',JSON.stringify({status:'PASS',results},null,2));console.log('PASS KAN112 desktop/mobile browser; screenshots '+out)
} finally{await browser.close()}
