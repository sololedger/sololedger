// Real Home + TransactionForm, local-origin browser persistence/Web Locks.
// Every request intercepted; synthetic RPC/storage boundaries only.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const owner='00000000-0080-4000-8000-000000000001'
const profile={role:'admin',subscription_type:'paid',vat_status:'registered',domestic_sales_vat_treatment:'taxable',vat_period_type:'quarter',vat_management_from:'2026-01-01',foreign_purchase_reporting:'required',default_deduction_entitlement:'full'}
const mock={
 supplierYearEnd:`export const supplierExpenseChoices=[];export class SupplierRejectedError extends Error{};export async function getSupplierYearEndInvoices(){return []};export async function openSupplierAttachment(){};export async function submitSupplierCommand(owner,command){localStorage.setItem('supplierReplay',JSON.stringify(command));return {success:true,invoice_id:'i',transaction_id:'t',ver_nr:10}};`,
 withdrawalService:`export class WithdrawalConflictError extends Error{};export async function loadWithdrawal(){throw Error('Syntetiskt uttagsunderlag saknas i bokningstestet')};export async function saveWithdrawal(){throw Error('Uttagsskrivning är inte tillåten i bokningstestet')};`,
 useAuth:`export const useAuth=()=>({user:{id:localStorage.getItem('testAuthOwner')||'${owner}'},profile:{...${JSON.stringify(profile)},id:localStorage.getItem('testAuthOwner')||'${owner}'},authLoading:false,verifyProfile:async()=> 'synthetic-token'});`,
 useAccountingData:`export const useAccountingData=()=>({accountingDataReady:localStorage.getItem('testAccountingError')!=='yes',accountingDataError:localStorage.getItem('testAccountingError')==='yes'?'Kunde inte hämta ekonomiska uppgifter. Inga belopp visas.':null,retryAccountingData:async()=>{localStorage.removeItem('testAccountingError');window.location.reload()},transactions:[],balances:{'1930':987654321,'3010':-123456789},balanceSheetBalances:{'1930':987654321},journalMap:{},neData:{R11:123456789,R17:123456789,bank:987654321,B9:987654321,B10_total:987654321},momsBreakdown:{utgaendeMoms:0,ingaendeMoms:0,momsNetto:0},transactionHistoryComplete:true,kontoplan:[{id:'expense',name:'Syntetisk programvara',debit_account:'5420',credit_account:'1930',default_vat_rate:25,hidden_from_new_booking:localStorage.getItem('testGate')==='closed'}],kontoplanLoaded:true,kontoplanLoading:false,isYearLocked:localStorage.getItem('testGate')==='closed',refreshData:async()=>{},refreshDataWithStatus:async()=>({ok:localStorage.getItem('testRefresh')!=='fail'})});`,
 usePaymentAccountRoleConfiguration:`export const usePaymentAccountRoleConfiguration=()=>({configuredRoles:[],loaded:true,loading:false,error:null,reload:async()=>{}});`,
 subscriptionLimits:`export const FREE_TRANSACTION_LIMIT=15; export const getFreeTransactionUsage=async()=>0;export const canCreateTransactions=()=>true;`,
 accountingService:`import {submitStandardBookingAttempt} from './src/lib/standardBookingAttempt.ts';
export const getUserId=async()=>localStorage.getItem('testAuthOwner')||'${owner}';export const getNEData=async()=>{throw Error('Unexpected extra NE read')};export const getCustomerInvoices=async()=>[];export const isYearClosed=async()=>false;
export const bookStandardBookingAttempt=async attempt=>submitStandardBookingAttempt(attempt,async(name,args)=>{
 const calls=JSON.parse(localStorage.getItem('testCalls')||'[]');calls.push(args.p_payload);localStorage.setItem('testCalls',JSON.stringify(calls));
 const key='testReceipt.'+args.p_payload.idempotency_key;const saved=localStorage.getItem(key);
 if(saved)return {data:{...JSON.parse(saved),idempotent_replay:true},error:null};
 const result={success:true,transaction_id:crypto.randomUUID(),ver_nr:1,idempotent_replay:false,...(attempt.kind==='periodized'?{reversal_transaction_id:crypto.randomUUID(),reversal_ver_nr:2,periodization_group_id:crypto.randomUUID()}: {})};
 localStorage.setItem(key,JSON.stringify(result));throw Error('synthetic response lost after DB commit');
});
export const bookVatV2EuServiceReverseChargeTransaction=async()=>{};export const createCorrectionTransaction=async()=>{};export const closeYear=async()=>{};export const updateTransaction=async()=>{};`,
 supabaseClient:`export const supabase={from:()=>({select:()=>({eq:()=>({order:()=>Promise.resolve({data:[],error:null})})})}),storage:{from:()=>({upload:async(path,file)=>{localStorage.setItem('testUploads',String(Number(localStorage.getItem('testUploads')||0)+1));return {error:null}}})}};`,
}
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Home from './src/app/page';createRoot(document.getElementById('root')).render(<Home/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',plugins:[{name:'synthetic-boundaries',setup(b){
 b.onResolve({filter:/.*/},args=>{
  const leaf=args.path.split('/').at(-1)
  if(mock[leaf])return {path:leaf,namespace:'kan80'}
  if(args.importer.replaceAll('\\','/').endsWith('/src/app/page.tsx')&&args.path.startsWith('@/components/')&&!['TransactionForm','AccountingDataBoundary','DashboardOverview','NEBilaga','SubscriptionGuard','SupplierYearEndPanel'].includes(leaf))return {path:'component-'+leaf,namespace:'kan80'}
 })
 b.onLoad({filter:/.*/,namespace:'kan80'},args=>({contents:mock[args.path]||(args.path==='component-Layout'?"import React from 'react';export default function Layout(p){return <main><nav><button onClick={()=>p.setActiveTab('dashboard')}>Test Dashboard</button><button onClick={()=>p.setActiveTab('ne')}>Test NE</button><button onClick={()=>p.setActiveTab('leverantorsskulder')}>Test Bokslutsskulder</button></nav>{p.children}</main>}":"export default function Placeholder(){return null}"),resolveDir:process.cwd(),loader:'tsx'}))
}}]})
const css=(await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
const browser=await chromium.launch({headless:true})
await mkdir('test-results/kan80',{recursive:true})
try {
 for(const [label,width,periodized,accountingError] of [['desktop',1280,false,false],['mobile',390,true,false],['desktop-accounting-error',1280,false,true],['mobile-accounting-error',390,true,true]]) {
  const context=await browser.newContext({viewport:{width,height:1000}})
  let external=0
  await context.route('**/*',route=>{
   if(route.request().url()==='http://127.0.0.1:47880/kan80')return route.fulfill({contentType:'text/html',body:'<style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'})
   external++;return route.abort()
  })
  const page=await context.newPage(),errors=[],notices=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{notices.push(d.message());await d.accept()})
  await page.goto('http://127.0.0.1:47880/kan80')
  const category=page.getByRole('combobox',{name:'Kategori',exact:true})
  await expect(category).toBeEnabled()
  await expect(page.getByText('Översikt',{exact:true})).toBeVisible()
  await expect(page.locator('main')).toContainText(/987\s654\s321/)
  await category.selectOption('expense')
  await page.locator('form input[type="text"][required]:not([aria-label])').fill('Syntetiskt återhämtningsprov')
  await page.locator('input[type="number"][step="0.01"]').first().fill('1250')
  if(periodized)await page.getByText('Periodisera till nästa räkenskapsår',{exact:true}).click()
  await page.locator('input[type="file"]').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF synthetic offline fixture')})
  await page.getByRole('button',{name:'Bokför',exact:true}).filter({visible:true}).click()
  const resume=page.getByRole('button',{name:'Återuppta bokningsförsöket',exact:true})
  await expect(resume).toBeEnabled()
  assert.match(notices.at(-1),/kunde inte bekräfta/)
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('testCalls')))
  assert.equal(before.length,1)
  await page.evaluate(()=>{localStorage.setItem('testGate','closed');localStorage.setItem('testRefresh','fail')})
  if(accountingError)await page.evaluate(()=>localStorage.setItem('testAccountingError','yes'))
  await page.reload()
  await expect(resume).toBeEnabled()
  if(accountingError){
   const error=page.getByRole('alert').filter({hasText:'Kunde inte hämta ekonomiska uppgifter'})
   await expect(error).toBeVisible()
   await expect(category).toHaveCount(0)
   await expect(page.getByText('Översikt',{exact:true})).toHaveCount(0)
   await expect(page.locator('main')).not.toContainText(/987\s654\s321|123\s456\s789/)
   const saved=await page.evaluate(owner=>localStorage.getItem('sololedger.standardBooking.v1.'+owner),owner)
   const attempt=JSON.parse(saved)
   await expect(page.getByText(attempt.payload.description+' · '+attempt.payload.date+' · '+attempt.payload.amount+' kr',{exact:true})).toBeVisible()
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('testCalls')).length),1,'no automatic replay during load failure')
   // The other identity must not see or submit the saved attempt, even with the same profile fixture.
   await page.evaluate(()=>localStorage.setItem('testAuthOwner','00000000-0080-4000-8000-000000000002'))
   await page.reload()
   await expect(error).toBeVisible()
   await expect(resume).toHaveCount(0)
   await expect(page.getByText(attempt.payload.description,{exact:false})).toHaveCount(0)
   assert.equal(await page.evaluate(owner=>localStorage.getItem('sololedger.standardBooking.v1.'+owner),owner),saved)
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('testCalls')).length),1)
   await page.evaluate(()=>localStorage.removeItem('testAuthOwner'))
   await page.reload()
   await expect(resume).toBeEnabled()
   await page.getByRole('button',{name:'Test NE',exact:true}).click()
   await expect(error).toBeVisible()
   await expect(page.locator('main')).not.toContainText(/987\s654\s321|123\s456\s789/)
   await page.getByRole('button',{name:'Test Dashboard',exact:true}).click()
   await expect(resume).toBeEnabled()
  }else{
   await expect(category).toBeDisabled()
  }
  await page.screenshot({path:'test-results/kan80/'+label+'-pending.png',fullPage:true})
  // Use the browser's real Web Locks across two pages, not a test mutex.
  await page.evaluate(owner=>new Promise(resolve=>{
    navigator.locks.request('sololedger.standardBooking.'+owner,async()=>{
      const held=new Promise(release=>{window.releaseBookingLock=release})
      resolve();await held
    })
  }),owner)
  const second=await context.newPage()
  await second.goto('http://127.0.0.1:47880/kan80')
  const blockedDialog=second.waitForEvent('dialog')
  const secondClick=second.getByRole('button',{name:'Återuppta bokningsförsöket',exact:true}).click()
  const blocked=await blockedDialog
  assert.match(blocked.message(),/annan flik/)
  await blocked.accept();await secondClick
  assert.equal(await second.evaluate(()=>JSON.parse(localStorage.getItem('testCalls')).length),1)
  await page.evaluate(()=>window.releaseBookingLock())
  await second.close()
  await resume.click()
  await expect(resume).toHaveCount(0)
  assert.match(notices.at(-1),/var redan genomförd/)
  assert.match(notices.at(-1),/Uppdatera sidan/)
  const after=await page.evaluate(()=>({calls:JSON.parse(localStorage.getItem('testCalls')),uploads:Number(localStorage.getItem('testUploads'))}))
  assert.equal(after.calls.length,2);assert.deepEqual(after.calls[0],after.calls[1]);assert.equal(after.uploads,1)
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('testReceipt.')).length),1,'one synthetic booking receipt, never a second booking')
  if(accountingError){
   await expect(page.getByRole('alert').filter({hasText:'Kunde inte hämta ekonomiska uppgifter'})).toBeVisible()
   await expect(page.locator('main')).not.toContainText(/987\s654\s321|123\s456\s789/)
   await page.getByRole('button',{name:'Försök igen',exact:true}).click()
   await expect(page.getByText('Översikt',{exact:true})).toBeVisible()
   await expect(page.locator('main')).toContainText(/987\s654\s321/)
   await expect(resume).toHaveCount(0)
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('testCalls')).length),2,'retrying reports must not submit a booking')
  }
  assert.equal(external,0,'no external browser requests')
  assert.deepEqual(errors,[])
  await page.screenshot({path:'test-results/kan80/'+label+'.png',fullPage:true})
  await context.close()
  console.log('PASS actual Home/TransactionForm '+label+': upload once, lost response, real reload, frozen attempt, recovery through changed gates, confirmed result despite refresh failure'+(accountingError?'; KAN-78 load error, owner isolation, hidden dashboard/NE amounts and retry':''))
 }
 for(const width of [1280,390]) {
  const context=await browser.newContext({viewport:{width,height:1000}})
  await context.addInitScript(({owner})=>{localStorage.setItem('testAccountingError','yes');localStorage.setItem('sololedger.supplierYearEnd.'+owner,JSON.stringify({owner,command:{action:'pay',request_key:'frozen',invoice_id:'i',paid_amount:1250,payment_date:'2027-01-15'}}))},{owner})
  await context.route('**/*',route=>route.request().url()==='http://127.0.0.1:47880/kan98'?route.fulfill({contentType:'text/html',body:'<style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'}):route.abort())
  const page=await context.newPage();await page.goto('http://127.0.0.1:47880/kan98')
  await page.getByRole('button',{name:'Test Bokslutsskulder'}).click()
  const resume=page.getByRole('button',{name:'Återuppta samma försök',exact:true})
  await expect(resume).toBeEnabled()
  await expect(page.getByRole('button',{name:'Registrera och bokför bokslutsskulden',exact:true})).toBeDisabled()
  await resume.click();await expect(page.getByRole('status')).toContainText('VER-10')
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('supplierReplay')).request_key),'frozen')
  await expect(page.locator('main')).not.toContainText(/987\s654\s321|123\s456\s789/)
  await context.close();console.log('PASS KAN98 actual Home '+width+': supplier retry visible despite global accounting read error; new booking blocked; exact saved request')
 }
}finally{await browser.close()}
await writeFile('test-results/kan80/browser-result.json',JSON.stringify({result:'PASS',viewports:[1280,390],accountingLoadError:true,ownerIsolation:true,surface:'actual Home and TransactionForm',transport:'synthetic offline only'},null,2))
