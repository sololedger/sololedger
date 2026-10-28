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
 image: `export default function Image({unoptimized,...props}){return <img {...props}/>}`,
 yearEndChecklistClient: `const keys=['documents','bank','customers','suppliers','inventory','vat','statements','tax','submission','payments','next_year'];
 export const checklistPort=(owner,year)=>{
 const identity=owner+':'+year;window.checklistDB??={};const get=()=>window.checklistDB[identity]??={owner,year,basis_version:1,basis:Object.fromEntries(keys.map(k=>[k,'a'.repeat(32)])),checks:[],system:{locked:false,periods:[],declaration_versions:0}};
 return {load:async()=>{window.checklistLoads=(window.checklistLoads??0)+1;if(window.fixture.contextReady===false)throw Error('Premature profile read');if(window.failLoad)throw Error('load failure');return structuredClone(get())},save:async c=>{window.checklistWrites??=[];window.checklistWrites.push(c);if(window.failSave)throw Error('Sparandet kunde inte bekräftas.');if(window.pauseSave)await new Promise(r=>window.releaseSave=r);const d=get(),r=d.checks.find(r=>r.check_key===c.key);if((r?.revision??0)!==c.revision)throw Error('Checklistan har ändrats. Läs om.');d.checks=d.checks.filter(r=>r.check_key!==c.key).concat({check_key:c.key,confirmed:c.confirmed,confirmed_at:c.confirmed?'2026-10-26T09:00:00Z':null,revision:c.revision+1,basis_fingerprint:c.confirmed?d.basis[c.key]:null,confirmation_version:1,basis_version:1});return structuredClone(d)}}}`,

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
    if(args.path==='next/image')return {path:'image',namespace:'offline'}
    const leaf = args.path.split('/').at(-1)
    if (mock[leaf]) return { path: leaf, namespace: 'offline' }
    if (args.importer.replaceAll('\\', '/').endsWith('/src/app/page.tsx') && args.path.startsWith('@/components/') && !['Layout', 'YearEndGuide', 'AccountingDataBoundary', 'NESectionNavigation', 'FAQ'].includes(leaf)) return { path: 'panel-' + leaf, namespace: 'offline' }
  })
  b.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: mock[args.path] || (args.path === 'panel-NEBilaga'
    ? `import Guide from './src/components/NEDeclarationGuide';export default function Panel(p){return <section data-panel="NEBilaga">NEBilaga<span>{p.selectedYear}</span><Guide key={p.userId+':'+p.selectedYear+':'+p.companyName} year={p.selectedYear} companyName={p.companyName} onOpenYearEnd={p.onOpenYearEnd} initialOpenDetails={p.initialGuideOpenDetails}/></section>}`
    : `export default function Panel(p){if('isOpen' in p&&!p.isOpen)return null;return <section data-panel="${args.path.slice(6)}">${args.path.slice(6)}<span>{p.selectedYear??'egen period'}</span>{p.onOpenPaymentAccountSettings&&<button onClick={p.onOpenPaymentAccountSettings}>Öppna betalningskonton i Profil</button>}{p.children}</section>}`), loader: 'tsx', resolveDir: process.cwd() }))
} }] })
const css = (await postcss([tailwind({ base: process.cwd() })]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css

const out='coverage/kan112-modern';await mkdir(out,{recursive:true});await mkdir('docs/testing/kan112-modern-layout',{recursive:true})
const browser=await chromium.launch({headless:true});const results=[]
try {
 for(const width of process.env.KAN112_MOBILE_ONLY==='1'?[390,320]:[1440,1024,768,390,320]){
  const context=await browser.newContext({viewport:{width,height:width===320?568:width===390?844:1000},isMobile:width<1024,hasTouch:width<1024}),page=await context.newPage(),errors=[],external=[]
  page.on('pageerror',e=>{errors.push(e.message);console.error('UI error:',e.message)})
  await context.route('**/*',route=>{
   if(route.request().url()==='https://kan99.test/')return route.fulfill({contentType:'text/html',body:'<html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><body><div id="root"></div></body></html>'})
   external.push(route.request().url());return route.abort()
  })
  await page.goto('https://kan99.test/');await page.addScriptTag({content:bundle.outputFiles[0].text})
  await page.evaluate(()=>{window.scrollCalls=[];window.scrollEvents=[];window.focusEvents=[];addEventListener('scroll',()=>window.scrollEvents.push(scrollY));addEventListener('focusin',event=>window.focusEvents.push(event.target.tagName));const original=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){window.scrollCalls.push({text:this.textContent,options});return original.call(this,options)}})
  async function navigate(label){
   await expect(page.getByRole('heading',{name:/^SoloLedger$/i})).toBeVisible()
   let b=page.getByRole('button',{name:label,exact:true}).filter({visible:true})
   if(!await b.count()){const mobile=page.getByRole('button',{name:'Öppna meny',exact:true});if(await mobile.isVisible())await mobile.click();else await page.getByRole('button',{name:/^Mer/}).click();b=page.getByRole('button',{name:label,exact:true}).filter({visible:true});if(!await b.count())b=page.getByRole('menuitem',{name:label,exact:true})}
   await b.click()
  }
  await navigate('Årsavslut');const guide=page.getByRole('region',{name:'Årsavslut för 2026',exact:true}),cards=guide.locator('[data-group-index]'),notice=guide.getByTestId('checklist-save-status')
  const year=page.getByRole('group',{name:'Ekonomikontroller'}).getByRole('combobox')
  async function motionFinished(){
   await page.evaluate(()=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Scroll did not settle')),5000);let previous=scrollY,stable=0
    function frame(){const current=scrollY;stable=Math.abs(current-previous)<0.5?stable+1:0;previous=current;if(stable===4){clearTimeout(timeout);resolve()}else requestAnimationFrame(frame)}
    requestAnimationFrame(frame)
   }))
  }
  async function aligned(target){await expect.poll(()=>target.evaluate(el=>Math.abs(el.getBoundingClientRect().top-(parseFloat(getComputedStyle(el).scrollMarginTop)||0)))).toBeLessThan(3);await motionFinished()}
  async function group(index){
   if(width<1024)await cards.nth(index).tap();else await cards.nth(index).click()
   const list=guide.locator('aside h3');await expect(list).toBeFocused()
   if(width<1024)await aligned(list)
  }
  async function open(key,index=0){
   await group(index);await guide.locator('[data-check-nav="'+key+'"]').click()
   const item=guide.locator('article[data-check-key="'+key+'"]')
   // Selection focuses on the next animation frame. Wait before further keyboard actions.
   await expect.poll(()=>item.locator('h3').evaluate(el=>document.activeElement===el||document.activeElement===document.querySelector('[data-testid="checklist-save-status"]'))).toBe(true)
   if(width<1024)await motionFinished()
   return item
  }
  // Real Home navigation: a return consumes its visit; menu/history starts fresh.
  const yearEndBack=page.getByRole('button',{name:'Tillbaka till årsavslutet 2026',exact:true})
  const neBack=page.getByRole('button',{name:'Tillbaka till NE-guiden',exact:true})
  async function visitYearEndFromNE(){
   await navigate('NE-Bilaga')
   const neGuide=page.locator('#ne-guide')
   if(await neGuide.getAttribute('open')===null)await neGuide.locator(':scope > summary').click()
   await neGuide.getByRole('button',{name:'1 Gör bokslutet klart',exact:true}).click()
   if(await neGuide.locator('.ne-step-detail').first().getAttribute('open')===null)await neGuide.locator('.ne-step-detail').first().locator(':scope > summary').click()
   await neGuide.getByRole('button',{name:'Öppna Årsavslut',exact:true}).click()
   await expect(neBack).toBeVisible()
  }
  await visitYearEndFromNE();await neBack.click()
  await expect(page.locator('#ne-guide')).toHaveAttribute('open','')
  await expect(page.locator('#ne-guide .ne-step-detail').first()).toHaveAttribute('open','')
  await expect(yearEndBack).toHaveCount(0)
  await visitYearEndFromNE();await navigate('Inventarier')
  await expect(yearEndBack).toHaveCount(0);await expect(neBack).toHaveCount(0)
  // Ordinary YearEnd -> NE is a work visit and still offers its legitimate return.
  await navigate('Årsavslut');await open('inventory')
  await guide.getByRole('button',{name:'Öppna NE-Bilaga',exact:true}).click()
  await expect(yearEndBack).toBeVisible()
  await page.locator('#ne-guide > summary').click()
  await page.locator('#ne-guide .ne-step-detail').first().locator(':scope > summary').click()
  await page.getByRole('button',{name:'Öppna Årsavslut',exact:true}).click()
  await expect(guide.locator('article[data-check-key="inventory"] h3')).toBeVisible()
  await neBack.click();await expect(yearEndBack).toHaveCount(0)
  await navigate('Årsavslut');await open('inventory')
  await guide.getByRole('button',{name:'Öppna Inventarier',exact:true}).click()
  await page.getByRole('button',{name:'Öppna betalningskonton i Profil',exact:true}).click()
  await expect(yearEndBack).toBeVisible();await yearEndBack.click()
  await expect(guide.locator('article[data-check-key="inventory"] h3')).toBeVisible()
  for(const destination of ['Inventarier','Bokföring','NE-Bilaga','Hjälp & FAQ','Årsavslut']){
   await navigate('Årsavslut');await open('inventory')
   await guide.getByRole('button',{name:'Öppna Inventarier',exact:true}).click()
   await expect(yearEndBack).toBeVisible()
   await navigate(destination);await expect(yearEndBack).toHaveCount(0);await expect(neBack).toHaveCount(0)
  }
  // Help owns browser history. Back/forward must keep its own return, but clear
  // temporary YearEnd/NE visits even when the resulting tab bypasses the menu.
  await navigate('Hjälp & FAQ')
  await page.getByText('Hur gör jag klart året?',{exact:true}).click()
  await page.getByRole('button',{name:'Öppna Årsavslut',exact:true}).click()
  const helpBack=page.getByRole('button',{name:'Tillbaka till Hjälp & FAQ',exact:true})
  await expect(helpBack).toBeVisible();await open('inventory')
  await guide.getByRole('button',{name:'Öppna Inventarier',exact:true}).click()
  await expect(yearEndBack).toBeVisible()
  await page.goBack();await expect(page.getByRole('heading',{name:'Vad vill du ha hjälp med?',exact:true})).toBeVisible()
  await expect(yearEndBack).toHaveCount(0);await expect(neBack).toHaveCount(0)
  await page.goForward();await expect(guide).toBeVisible();await expect(helpBack).toBeVisible()
  await expect(yearEndBack).toHaveCount(0);await expect(neBack).toHaveCount(0)
  await helpBack.click();await expect(page.getByText('Hur gör jag klart året?',{exact:true})).toBeVisible()
  await navigate('Årsavslut');await expect(helpBack).toHaveCount(0)
  assert.deepEqual(await page.evaluate(()=>window.checklistWrites??[]),[],'navigation does not save checklist answers')
  const bank=guide.locator('article[data-check-key="bank"]'),checkbox=bank.getByRole('checkbox')
  async function noOverflow(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'horizontal overflow at '+width)}
  await expect(guide).toContainText('0 av 11 bekräftade av dig');await expect(cards).toHaveCount(4);await expect(guide.locator('article')).toHaveCount(0)
  for(const card of await cards.all())await expect(card).not.toContainText('✓')
  const dimensions=await guide.evaluate(el=>{const main=el.closest('main'),r=main.getBoundingClientRect(),s=getComputedStyle(main),own=el.getBoundingClientRect();return{actual:own.width,expected:r.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)}})
  assert(Math.abs(dimensions.actual-dimensions.expected)<2,'guide fills invoice/layout content width')
  await noOverflow();await page.screenshot({path:out+'/overview-'+width+'.png',fullPage:true})
  // Ordinary selection must not hide the overview on desktop. Test actual short/long
  // instructions in both directions, at different existing scroll positions.
  if(width>=1024){
   await page.evaluate(()=>{scrollTo(0,0);window.scrollCalls=[]})
   await group(1);await expect(guide.getByRole('heading',{name:'2. Färdigställ bokslutet',exact:true})).toBeFocused()
   assert.equal(await page.evaluate(()=>scrollY),0,'desktop group selection keeps overview')
   for(const [key,offset] of [['statements',0],['vat',650],['statements',650],['vat',0]]){
    const nav=guide.locator('[data-check-nav="'+key+'"]')
    await nav.evaluate((el,offset)=>window.scrollTo(0,offset?Math.max(0,el.getBoundingClientRect().top+scrollY-offset):0),offset)
    await nav.scrollIntoViewIfNeeded() // Test a visible button, not Playwright's preparatory scroll.
    const before=await page.evaluate(()=>scrollY)
    await nav.click();await expect(guide.locator('article h3')).toBeFocused()
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(before)
   }
   // Space must also move focus to the new instruction without scrolling.
   const nav=guide.locator('[data-check-nav="statements"]')
   await nav.focus();const before=await page.evaluate(()=>scrollY)
   await page.keyboard.press('Space');await expect(guide.locator('article h3')).toBeFocused()
   await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(before)
   assert.deepEqual(await page.evaluate(()=>window.scrollCalls),[],'no automatic desktop scroll calls')
  }else{
   const listHeading=guide.locator('aside h3'),heading=guide.locator('article h3')
   for(const index of [3,0,1,2]){
    await page.evaluate(()=>window.scrollCalls=[]);await group(index)
    const calls=await page.evaluate(()=>window.scrollCalls);assert.equal(calls.length,1);assert.equal(calls[0].options.block,'start');assert.equal(calls[0].options.behavior,'smooth')
   }
   await group(1)
   const nav=guide.locator('[data-check-nav="statements"]')
   await page.evaluate(()=>{window.scrollCalls=[];window.scrollEvents=[]});await nav.tap();await expect(heading).toBeFocused();await aligned(heading)
   await expect(guide.locator('article').getByText('Varför behövs kontrollen?',{exact:true})).toBeInViewport()
   assert(await heading.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+10,r.y+5))}),'heading is not covered by navigation')
   let calls=await page.evaluate(()=>window.scrollCalls);assert.equal(calls.length,1);assert.equal(calls[0].options.behavior,'smooth');assert.equal(calls[0].options.block,'start')
   assert(await page.evaluate(()=>new Set(window.scrollEvents).size>2),'native smooth scroll emits intermediate positions')
   // Assistive activation of the same point at its final position is a no-op scroll.
   const before=await page.evaluate(()=>scrollY);await page.evaluate(()=>window.scrollCalls=[]);await nav.evaluate(el=>el.click());await motionFinished()
   assert.deepEqual(await page.evaluate(()=>window.scrollCalls),[]);assert.equal(await page.evaluate(()=>scrollY),before)
   // Both the ordinary back button and a short group must reach their beginnings.
   await guide.getByRole('button',{name:'Till kontrollpunkterna',exact:true}).tap();await expect(listHeading).toBeFocused();await aligned(listHeading)
   const vatNav=guide.locator('[data-check-nav="vat"]');await vatNav.focus();await page.evaluate(()=>window.scrollCalls=[])
   await page.keyboard.press('Enter');await expect(heading).toBeFocused();await aligned(heading);assert.equal((await page.evaluate(()=>window.scrollCalls)).length,1)
   // Rapid selections replace the queued target, not two competing animations.
   await page.evaluate(()=>{scrollTo(0,scrollY-200);window.scrollCalls=[]})
   await guide.locator('[data-check-nav="vat"]').evaluate(el=>{el.click();el.parentElement.querySelector('[data-check-nav="statements"]').click()})
   await expect(nav).toHaveAttribute('aria-current','step');await expect(heading).toHaveText('Resultat, balans och bokslutsunderlag');await aligned(heading)
   assert.equal((await page.evaluate(()=>window.scrollCalls)).length,1,'rapid selections schedule one final scroll')
   await page.emulateMedia({reducedMotion:'reduce'});await group(3)
   await page.evaluate(()=>window.scrollCalls=[]);await guide.locator('[data-check-nav="payments"]').tap();await expect(heading).toBeFocused();await aligned(heading)
   calls=await page.evaluate(()=>window.scrollCalls);assert.equal(calls.length,1);assert.equal(calls[0].options.behavior,'auto')
   await page.emulateMedia({reducedMotion:'no-preference'})
   await page.screenshot({path:out+'/mobile-start-'+width+'.png'})
  }
  await open('documents');await open('bank');assert.equal(await page.evaluate(()=>window.checklistWrites?.length??0),0,'navigation does not write confirmations');await expect(guide.locator('article')).toHaveCount(1)
  for(const [index,keys]of [['documents','bank','customers','suppliers','inventory'],['vat','statements'],['tax','submission'],['payments','next_year']].entries())for(const key of keys){
   const item=await open(key,index);await expect(item.getByText('Varför behövs kontrollen?',{exact:true})).toBeVisible();await expect(item.getByText('Om något inte stämmer',{exact:true})).toBeVisible();assert(await item.getByRole('button',{name:/^Öppna /}).count()>0);await expect(guide.locator('article')).toHaveCount(1)
  }
  assert.equal(await page.evaluate(()=>window.checklistWrites?.length??0),0);await open('bank')
  await checkbox.click();await expect(checkbox).toBeChecked();await expect(guide).toContainText('1 av 11 bekräftade av dig')
  await expect(guide.locator('[data-check-nav="bank"]')).toContainText('✓ Bekräftat av dig');await expect(cards.nth(0)).not.toContainText('✓')
  for(let i=0;i<5;i++){
   const reads=await page.evaluate(()=>window.checklistLoads)
   await page.evaluate(i=>window.harness.set({revision:10+i,contextReady:false}),i)
   await expect(checkbox).toBeChecked();await expect(checkbox).toBeDisabled()
   await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('visibilitychange'))});assert.equal(await page.evaluate(()=>window.checklistLoads),reads)
   await page.evaluate(()=>window.harness.set({contextReady:true}));await expect(checkbox).toBeEnabled();await expect(checkbox).toBeChecked();assert.equal(await page.evaluate(()=>window.checklistLoads),reads+1)
  }
  await page.evaluate(()=>{window.checklistDB['owner-a:2026'].basis.bank='b'.repeat(32)})
  await notice.getByRole('button',{name:'Läs om checklistan'}).click();await expect(bank).toContainText('Kontrollera igen');await expect(checkbox).toBeChecked();await expect(cards.nth(0)).toContainText('1 behöver ses över')
  await page.screenshot({path:out+'/selected-'+width+'.png',fullPage:true})
  if(process.env.KAN112_UPDATE_VISUALS==='1'&&[1440,390].includes(width)){await page.screenshot({path:'docs/testing/kan112-modern-layout/after-'+width+'.png',fullPage:true});await bank.screenshot({path:'docs/testing/kan112-modern-layout/instruction-'+width+'.png'})}
  await bank.getByRole('button',{name:'Jag har kontrollerat igen'}).click();await expect(bank.getByRole('button',{name:'Jag har kontrollerat igen'})).toHaveCount(0)
  // A failed bank save remains visible when navigating elsewhere. Retry still targets bank.
  await page.evaluate(()=>window.failSave=true);await checkbox.click();await expect(notice.getByRole('alert')).toContainText('Sparandet kunde inte bekräftas');await expect(checkbox).toBeChecked()
  const failedCount=await page.evaluate(()=>window.checklistWrites.length);await open('tax',2);await expect(notice.getByRole('alert')).toBeInViewport();assert.equal(await page.evaluate(()=>window.checklistWrites.length),failedCount)
  await page.evaluate(()=>window.failSave=false);await notice.getByRole('button',{name:'Försök spara igen'}).click();await expect(notice.getByRole('alert')).toHaveCount(0)
  await open('bank');await expect(checkbox).not.toBeChecked();await checkbox.click();await expect(checkbox).toBeChecked()
  // Pending saves also survive local group/point changes without a second write.
  await page.evaluate(()=>window.pauseSave=true);await checkbox.click();await expect(notice).toContainText('Sparar…');const pendingCount=await page.evaluate(()=>window.checklistWrites.length)
  await open('payments',3);await expect(notice).toBeInViewport();assert.equal(await page.evaluate(()=>window.checklistWrites.length),pendingCount)
  await page.evaluate(()=>{window.pauseSave=false;window.releaseSave()});await expect(notice).toContainText('Sparat');await expect(guide.locator('article').getByRole('checkbox')).not.toBeChecked()
  await open('bank');await expect(checkbox).not.toBeChecked();await checkbox.click();await expect(checkbox).toBeChecked()
  // Keyboard operation uses native buttons, visible selection and explicit checkbox action.
  await cards.nth(0).focus();await page.keyboard.press('Tab');await expect(cards.nth(1)).toBeFocused();await page.keyboard.press('Enter');await expect(cards.nth(1)).toHaveAttribute('aria-pressed','true')
  await expect(guide.getByRole('heading',{name:'2. Färdigställ bokslutet',exact:true})).toBeFocused()
  await guide.locator('[data-check-nav="vat"]').focus();await page.keyboard.press('Enter');await expect(guide.getByRole('heading',{name:'Granska årets momsunderlag',exact:true})).toBeFocused()
  const countBeforeNavigation=await page.evaluate(()=>window.checklistWrites.length)
  for(const [key,label,index] of [['documents','Profil',0],['bank','Bokföring',0],['customers','Fakturor',0],['suppliers','Bokslutsskulder',0],['inventory','Inventarier',0],['vat','Moms',1],['statements','NE-Bilaga',1]]){
   const item=await open(key,index);await item.getByRole('button',{name:'Öppna '+label,exact:true}).click();if(await year.isVisible())await year.selectOption('2025');await page.evaluate(()=>window.harness.set({revision:50}))
   await page.getByRole('button',{name:'Tillbaka till årsavslutet 2026',exact:true}).click();await expect(year).toHaveValue('2026');await expect(item.getByRole('heading',{level:3})).toBeFocused();await expect(guide.locator('article')).toHaveCount(1)
   const box=await item.getByRole('heading',{level:3}).boundingBox();assert(box.y>=0&&box.y<150,'return scrolls to instruction heading '+JSON.stringify({width,key,box}))
  }
  assert.equal(await page.evaluate(()=>window.checklistWrites.length),countBeforeNavigation)
  await group(1);await guide.getByRole('button',{name:'Förbered årslåset – separat systemåtgärd'}).click();await expect(guide.locator('article').getByRole('checkbox')).toHaveCount(0)
  await open('bank');await expect(checkbox).toBeChecked();await checkbox.focus();await page.keyboard.press('Space');await expect(checkbox).not.toBeChecked();await page.keyboard.press('Space');await expect(checkbox).toBeChecked()
  await year.selectOption('2025');await expect(page.getByRole('region',{name:'Årsavslut för 2025'})).toContainText('0 av 11 bekräftade av dig');await year.selectOption('2026');await open('bank');await expect(checkbox).toBeChecked()
  await page.evaluate(()=>window.harness.set({owner:'owner-b',name:'Syntetiska B',revision:60}));await navigate('Årsavslut');await expect(guide).toContainText('0 av 11 bekräftade av dig');await expect(guide).not.toContainText('Syntetiska A')
  await page.evaluate(()=>window.harness.set({owner:'owner-a',name:'Syntetiska A',revision:61}));await navigate('Årsavslut');await open('bank');await expect(checkbox).toBeChecked()
  await page.evaluate(()=>window.harness.set({locked:true}));await expect(guide.getByLabel('Systemstatus').locator('summary')).toContainText('Bokföringsår 2026: låst')
  await page.evaluate(()=>window.failLoad=true);await notice.getByRole('button',{name:'Läs om checklistan'}).click();await expect(notice.getByRole('alert')).toContainText('Dina sparade svar har inte raderats');await expect(checkbox).toHaveCount(0)
  await page.evaluate(()=>window.failLoad=false);await notice.getByRole('button',{name:'Läs om checklistan'}).click();await expect(checkbox).toBeChecked()
  await page.evaluate(()=>window.harness.set({name:'LångtFöretagsnamnUtanMellanslag'.repeat(8)}));await noOverflow()
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');await noOverflow();await expect(checkbox).toBeVisible();await expect(guide.locator('[data-check-nav="bank"]')).toBeVisible()
  await page.screenshot({path:out+'/text-200-'+width+'.png',fullPage:true});await page.evaluate(()=>document.documentElement.style.fontSize='');await noOverflow()
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);assert.deepEqual(await page.evaluate(()=>window.writes),[]);assert.deepEqual(external,[]);assert.deepEqual(errors,[])
  results.push({width,height:page.viewportSize().height,status:'PASS',singleInstruction:true,invoiceWidth:true,navigationNeverWrites:true,desktopScrollStable:width>=1024,mobileStartAlignedSmooth:width<1024,mobileTouch:width<1024,nativeScrollEvents:await page.evaluate(()=>window.scrollEvents.length),nativeFocusEvents:await page.evaluate(()=>window.focusEvents.length),reducedMotionAndRepeatedSelection:true,saveErrorAndPendingVisibleAcrossNavigation:true,keyboard:true,text200Percent:true,longCompanyName:true,ownerYearIsolation:true,restoredYearAndFocus:true,profileFocusCycles:5,noOverflow:true})
  await context.close();console.log('PASS modern guide '+width)
 }
 await writeFile(out+'/result.json',JSON.stringify({status:'PASS',results},null,2));console.log('PASS KAN112 modern desktop/mobile browser; screenshots '+out)
} finally{await browser.close()}
