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
 image:`export default function Image(){return null}`,
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
export const bookVatV2EuServiceReverseChargeTransaction=async()=>{};export const createCorrectionTransaction=async()=>{};
export const closeYear=async year=>{const calls=JSON.parse(localStorage.getItem('yearCloseCalls')||'[]');calls.push(year);localStorage.setItem('yearCloseCalls',JSON.stringify(calls));if(localStorage.getItem('yearCloseReject'))throw Error(localStorage.getItem('yearCloseReject'))};export const updateTransaction=async()=>{};`,
 supabaseClient:`export const supabase={from:()=>({select:()=>({eq:()=>({order:()=>Promise.resolve({data:[],error:null})})})}),storage:{from:()=>({upload:async(path,file)=>{localStorage.setItem('testUploads',String(Number(localStorage.getItem('testUploads')||0)+1));return {error:null}}})}};`,
}
// Preserve the existing accounting fixture; add the state setter exercised by year closure.
mock.useAccountingData=mock.useAccountingData.replace('refreshData:async()=>{},',"setIsYearLocked:locked=>localStorage.setItem('yearCloseUiLocked',String(locked)),refreshData:async()=>{},")
// Optional fixture for KAN-9. Other booking tests keep their existing data.
mock.useAccountingData = mock.useAccountingData.replace(
  "kontoplan:[{id:'expense'",
  "kontoplan:JSON.parse(localStorage.getItem('testGuideCategories')) ?? [{id:'expense'",
)
mock.useAccountingData = mock.useAccountingData.replace('kontoplanLoaded:true', "kontoplanLoaded:localStorage.getItem('testGuideChartLoading')!=='yes'")
mock.useAuth = mock.useAuth.replace(
  ",id:localStorage.getItem('testAuthOwner')",
  ",vat_status:localStorage.getItem('testGuideVatStatus') ?? 'registered',id:localStorage.getItem('testAuthOwner')",
)
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Home from './src/app/page';createRoot(document.getElementById('root')).render(<Home/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',plugins:[{name:'synthetic-boundaries',setup(b){
 b.onResolve({filter:/.*/},args=>{
  if(args.path==='next/image')return {path:'image',namespace:'kan80'}
  const leaf=args.path.split('/').at(-1)
  if(mock[leaf])return {path:leaf,namespace:'kan80'}
  if(args.importer.replaceAll('\\','/').endsWith('/src/app/page.tsx')&&args.path.startsWith('@/components/')&&!['TransactionForm','AccountingDataBoundary','DashboardOverview','NEBilaga','NESectionNavigation','SubscriptionGuard','SupplierYearEndPanel','FAQ'].includes(leaf))return {path:'component-'+leaf,namespace:'kan80'}
 })
 b.onLoad({filter:/.*/,namespace:'kan80'},args=>({contents:mock[args.path]||(args.path==='component-Layout'?"import React from 'react';export default function Layout(p){return <main data-active-tab={p.activeTab}><nav><button onClick={()=>p.setActiveTab('dashboard')}>Test Dashboard</button><button onClick={()=>p.setActiveTab('ne')}>Test NE</button><button onClick={()=>p.setActiveTab('leverantorsskulder')}>Test Bokslutsskulder</button></nav>{p.children}</main>}":"export default function Placeholder(){return null}"),resolveDir:process.cwd(),loader:'tsx'}))
}}]})
const css=(await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH})
await mkdir('test-results/kan80',{recursive:true})
await mkdir('coverage/kan113-local/ui',{recursive:true})
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
  await resume.click();await expect(page.getByRole('status').filter({ hasText: 'VER-10' })).toBeVisible()
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('supplierReplay')).request_key),'frozen')
  await expect(page.locator('main')).not.toContainText(/987\s654\s321|123\s456\s789/)
  await context.close();console.log('PASS KAN98 actual Home '+width+': supplier retry visible despite global accounting read error; new booking blocked; exact saved request')
 }
 // KAN-113: the actual Home -> NE button -> handleLockYear flow, offline RPC boundary.
 for(const width of [1280,390])for(const time of ['2026-12-31T22:59:59.999Z','2026-12-31T23:00:00Z']){
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Pacific/Honolulu'})
  await context.route('**/*',r=>r.request().url()==='http://127.0.0.1:47880/kan113'?r.fulfill({contentType:'text/html',body:'<html lang="sv"><meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script></html>'}):r.abort())
  const page=await context.newPage(),errors=[],notices=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{notices.push(d.message());await d.accept()})
  await page.clock.setFixedTime(new Date(time))
  await page.goto('http://127.0.0.1:47880/kan113');await page.getByRole('button',{name:'Test NE',exact:true}).click()
  const select=page.getByRole('group',{name:'Ekonomikontroller'}).locator('select'),midnight=time.includes('23:00:00')
  await select.selectOption('2026')
  const button=()=>page.getByRole('button',{name:/Lås räkenskapsår/})
  if(!midnight){
   await expect(button()).toBeDisabled();await expect(page.getByText('År 2026 är inte avslutat. Du kan låsa året tidigast den 1 januari 2027 (svensk tid).',{exact:true})).toBeVisible()
   await page.screenshot({path:'coverage/kan113-local/ui/'+width+'-blocked.png',fullPage:true})
   await select.selectOption('2027');await expect(button()).toBeDisabled();await expect(page.getByText(/År 2027 är inte avslutat/)).toBeVisible()
   assert.equal(await page.evaluate(()=>localStorage.getItem('yearCloseCalls')),null)
   await select.selectOption('2026');await select.selectOption('2025');await expect(button()).toBeEnabled();await button().click()
   assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('yearCloseCalls'))),[2025])
   assert.equal(await page.evaluate(()=>localStorage.getItem('yearCloseUiLocked')),'true');assert(!notices.some(msg=>msg.includes('Fel vid låsning')))
  }else{
   await expect(button()).toBeEnabled()
   // Client clock can be ahead: the real service forwards the server's readable rejection.
   const rejection='År 2026 är inte avslutat. Du kan låsa året tidigast den 1 januari 2027 (svensk tid).'
   await page.evaluate(msg=>localStorage.setItem('yearCloseReject',msg),rejection);await button().click()
   assert(notices.at(-1).includes(rejection));await expect(button()).toBeEnabled()
   await page.evaluate(()=>localStorage.removeItem('yearCloseReject'));await button().click()
   assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('yearCloseCalls'))),[2026,2026])
   assert.equal(await page.evaluate(()=>localStorage.getItem('yearCloseUiLocked')),'true')
  }
  await page.screenshot({path:'coverage/kan113-local/ui/'+width+'-'+(midnight?'after':'before')+'.png',fullPage:true})
  assert.deepEqual(errors,[]);await context.close()
  console.log('PASS KAN113 actual Home/NE '+width+' Stockholm midnight '+(midnight?'after: previous year enabled, readable server rejection':'before: current/future disabled, previous year locks')+'; browser timezone Honolulu')
 }
 // KAN-9 uses the real form, but intercepted local-origin data and transport only.
 for (const width of [1280, 390]) {
  const context = await browser.newContext({ viewport: { width, height: 920 }, hasTouch: width < 500 })
  const url = 'http://127.0.0.1:47880/kan9'
  await context.route('**/*', route => route.request().url().split('?')[0] === url
   ? route.fulfill({ contentType: 'text/html', body: '<meta charset="utf-8"><style>' + css + '</style><div id="root"></div><script>' + bundle.outputFiles[0].text + '</script>' })
   : route.abort())
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const makeCategory = (id, name, account, rate) => ({
   id, name, debit_account: account, credit_account: '1930', default_vat_rate: rate, hidden_from_new_booking: false,
  })
  const courses = makeCategory('kurser', 'Kurser & fortbildning', '6991', 0)
  const expandedTopics = [
   ['Köpte annonser på Meta', makeCategory('reklam', 'Reklam & annonsering', '5910', 25), /marknadsföra den egna verksamheten/],
   ['Extern retusch i ett kunduppdrag', makeCategory('kopta_tjanster_kunduppdrag', 'Köpta tjänster för kunduppdrag', '4600', 25), /direkt del av det du levererar/],
   ['Frakt av fotoböcker till kund', makeCategory('frakt', 'Frakt & varutransporter', '5710', 25), /skild från varans pris och från brevporto/],
   ['Porto för brev', makeCategory('porto', 'Porto', '6250', 25), /porto eller en posttjänst/],
   ['Tågbiljett till kunden', makeCategory('resor', 'Resor i verksamheten', '5800', 6), /utan att det är pendling/],
   ['Försäkring för kamerautrustning', makeCategory('foretagsforsakring', 'Företagsförsäkring', '6310', 0), /försäkringen tecknad för verksamheten/],
   ['Abonnemang för telefon', makeCategory('mobiltelefoni', 'Mobiltelefoni', '6212', 25), /själva telefonitjänsten eller mobilabonnemanget/],
   ['Abonnemang för internet', makeCategory('internet', 'Internet & datakommunikation', '6230', 25), /internetanslutning eller datakommunikation/],
   ['Bankens kontoavgift', makeCategory('bankavgift', 'Bankavgifter', '6570', 0), /banken eller en betaltjänst/],
  ]
  const categories = [
   courses,
   makeCategory('prenumerationer', 'Prenumerationer & programvaror', '5420', '25'),
   makeCategory('varor_material', 'Varor & material för försäljning', '4010', 25),
   makeCategory('eget_uttag', 'Eget uttag', '2013', 0),
   ...expandedTopics.map(([, row]) => row),
  ]
  await context.addInitScript(rows => {
   if (!localStorage.getItem('testGuideCategories')) localStorage.setItem('testGuideCategories', JSON.stringify(rows))
  }, categories)
  await page.goto(url)
  const category = page.getByRole('combobox', { name: 'Kategori', exact: true })
  const summary = page.getByText('Hjälp mig välja kategori', { exact: true })
  const guide = page.locator('details').filter({ has: summary })
  const query = guide.getByRole('textbox', { name: 'Vad har du köpt eller betalat?' })
  const answer = name => guide.getByRole('button', { name, exact: true })
  const heading = guide.getByRole('heading', { level: 3 })
  const back = () => answer('Tillbaka').click()
  const cancel = () => answer('Avbryt guiden').click()
  const lookUp = async description => {
   if (!(await query.isVisible())) await summary.click()
   await query.fill(description)
   await query.press('Enter')
   await expect(query).toBeHidden()
   await expect(heading).toBeFocused()
  }
  const start = async (description, use = 'Enbart i verksamheten') => {
   await lookUp(description)
   await answer('Fortsätt till frågorna').click()
   await expect(heading).toHaveText('Vad ska köpet användas till?')
   await expect(heading).toBeFocused()
   await answer(use).click()
  }
  const domestic = async description => {
   await start(description)
   await expect(heading).toHaveText(/säljaren finns i Sverige/)
   await answer('Ja, i Sverige').click()
  }
  const answerPurpose = choice => answer(choice).click()
  const answerPayment = async choice => {
   await expect(heading).toHaveText(/Drogs pengarna direkt/)
   await answer(choice).click()
  }
  const choose = name => answer('Välj ' + name)
  const confirmVat = name => answer('Bekräfta momsändring och välj ' + name)
  await expect(query).toBeHidden()

  const form = page.locator('form').filter({ has: category })
  const vatRate = form.locator('select').filter({ has: page.getByRole('option', { name: '12%', exact: true }) })
  await category.selectOption('prenumerationer')
  await vatRate.selectOption('12')
  await form.locator('input[type="text"][required]:not([aria-label])').fill('Min påbörjade bokning')
  await form.locator('input[type="number"][step="0.01"]').first().fill('864')
  const readFormFields = () => form.locator('input, select, textarea').evaluateAll(fields => fields.map(field => [
   field.value, field instanceof HTMLInputElement ? field.checked : null,
  ]))
  const beforeGuide = await readFormFields()
  await summary.press('Enter')
  await query.fill('Minneskort till kameran')
  const [helpSearchPage] = await Promise.all([
   context.waitForEvent('page'),
   guide.getByRole('link', {name:/^Sök bokföringshjälp/}).click(),
  ])
  const helpSearch = helpSearchPage.getByRole('searchbox', {name:'Sök bokföringshjälp'})
  await helpSearch.fill('sätta in pengar')
  const ownDeposit = helpSearchPage.locator('details[data-help-id="intakt-insattning"]')
  await ownDeposit.locator('summary').click()
  await expect(ownDeposit).toHaveAttribute('open', '')
  await helpSearch.fill('moms betalning')
  await expect(helpSearchPage.locator('details[data-help-id="skattekonto"]')).toBeVisible()
  await expect(helpSearchPage.locator('details[data-help-id="privat-betalning"]')).toHaveCount(0)
  await helpSearchPage.getByRole('region', {name:'Arbetsflöden'}).getByRole('button', {name:'Öppna Moms',exact:true}).click()
  await expect(helpSearchPage.locator('main')).toHaveAttribute('data-active-tab', 'moms')
  assert.deepEqual(await readFormFields(), beforeGuide, 'Opening the VAT workflow from help preserves the original draft')
  await helpSearchPage.close()
  await expect(query).toHaveValue('Minneskort till kameran')
  await cancel()
  assert.deepEqual(await readFormFields(), beforeGuide, 'Searching help preserves the booking draft')
  const referralCases = [
   ['Betalat moms till Skatteverket', /fördes över från banken/, ['skattekonto', 'moms-redovisa-betala']],
   ['Förde över pengar till skattekontot', /Pengar till\/från skattekontot/, ['skattekonto']],
   ['Skatteverket har dragit momsen från skattekontot', /Avräkning på skattekontot/, ['skattekonto']],
   ['Betalat preliminärskatt', /skattebeslutet/, ['skatt-forsta-aret']],
   ['Eget uttag', /överföringar mellan dig och firman/, ['intakt-insattning']],
   ['Egen insättning', /överföringar mellan dig och firman/, ['intakt-insattning']],
   ['Privat betalt företagsinköp', /stöder privat betalning/, ['privat-betalning']],
  ]
  for (const [description, message, articleIds] of referralCases) {
   await lookUp(description)
   await expect(heading).toHaveText('Annat bokföringsärende')
   await expect(guide.getByRole('status')).toHaveText(message)
   await expect(answer('Fortsätt till frågorna')).toHaveCount(0)
   await expect(guide.getByRole('link')).toHaveCount(articleIds.length)
   for (const id of articleIds) {
    const [helpPage] = await Promise.all([
     context.waitForEvent('page'),
     guide.locator(`a[href="?help=${id}"]`).click(),
    ])
    await expect(helpPage.getByRole('region', { name: 'Hjälp & FAQ' }).locator(`details[data-help-id="${id}"]`)).toHaveAttribute('open', '')
    await helpPage.close()
    assert.deepEqual(await readFormFields(), beforeGuide, 'Opening FAQ preserves the booking draft')
   }
   await back()
   await expect(query).toHaveValue(description)
   assert.deepEqual(await readFormFields(), beforeGuide)
   await cancel()
   assert.deepEqual(await readFormFields(), beforeGuide)
  }
  await lookUp('Kontorsmaterial')
  await expect(heading).toHaveText('Kontorsmaterial')
  await expect(guide.getByRole('status')).toContainText('saknas i din kontoplan')
  await answer('Gå till Kontoplan').click()
  await expect(page.locator('main')).toHaveAttribute('data-active-tab', 'kontoplan')
  await page.getByRole('button', { name: 'Test Dashboard' }).click()
  assert.deepEqual(await readFormFields(), beforeGuide)
  await summary.press('Enter')
  await expect(query).toBeFocused()
  await domestic('kurs')
  await expect(guide.getByLabel('Dina svar')).toHaveText('kurs · Verksamheten · Svensk säljare')
  await answerPurpose('Ja')
  await answerPayment('Ja')
  await expect(confirmVat(courses.name)).toBeVisible()
  await expect(guide).toContainText('Moms på fakturan ändras från 12 % till 0 %.')
  assert.deepEqual(await readFormFields(), beforeGuide, 'Preview does not apply the proposed VAT change')
  await back()
  await expect(heading).toHaveText(/Drogs pengarna direkt/)
  await expect(confirmVat(courses.name)).toHaveCount(0)
  assert.deepEqual(await readFormFields(), beforeGuide, 'Back from VAT confirmation preserves every form field')
  await answerPayment('Ja')
  await expect(confirmVat(courses.name)).toBeVisible()
  assert(await guide.evaluate(element => element.scrollWidth <= element.clientWidth))
  if (width < 500) await answer('Avbryt guiden').tap()
  else await heading.press('Escape')
  await expect(query).toBeHidden()
  await expect(summary).toBeFocused()
  assert.deepEqual(await readFormFields(), beforeGuide, 'Closing the guide preserves the booking form')

  await domestic('programvarulicens')
  await answerPurpose('Ja')
  await answerPayment('Jag vet inte')
  await expect(choose('Prenumerationer & programvaror')).toHaveCount(0)
  await back()
  await expect(heading).toBeFocused()
  await answerPayment('Nej')
  await expect(guide.getByRole('status')).toContainText('privat utlägg')
  await expect(choose('Prenumerationer & programvaror')).toHaveCount(0)
  await back()
  await answerPayment('Ja')
  await choose('Prenumerationer & programvaror').click()
  assert.deepEqual(await readFormFields(), beforeGuide, 'Confirming the current category preserves manually selected VAT')

  await form.getByLabel('Detta köp').selectOption('none')
  const manualDeductionFields = await readFormFields()
  await domestic('kurs')
  await answerPurpose('Ja')
  await answerPayment('Ja')
  await expect(guide).toContainText('Det manuella valet av momsavdrag återställs')
  assert.deepEqual(await readFormFields(), manualDeductionFields)
  await confirmVat(courses.name).click()
  await expect(category).toHaveValue('kurser')
  await expect(vatRate).toHaveValue('0')

  await category.selectOption('prenumerationer')
  await expect(vatRate).toHaveValue('25')
  const deduction = form.getByLabel('Detta köp')
  await deduction.selectOption('none')
  const beforeDeductionOnly = await readFormFields()
  await domestic('virke till ett kundjobb')
  await answerPurpose('Ja')
  await answerPayment('Ja')
  await expect(guide).toContainText('Det manuella valet av momsavdrag återställs')
  await expect(guide).not.toContainText('Moms på fakturan ändras från')
  await expect(choose('Varor & material för försäljning')).toHaveCount(0)
  const confirmDeduction = confirmVat('Varor & material för försäljning')
  await expect(confirmDeduction).toBeVisible()
  assert.deepEqual(await readFormFields(), beforeDeductionOnly)
  await confirmDeduction.click()
  await expect(category).toHaveValue('varor_material')
  await expect(vatRate).toHaveValue('25')
  await expect(deduction).toHaveValue('profile_default')

  for (const [description, id, name, account] of [
   ['Adobe Lightroom abonnemang', 'prenumerationer', 'Prenumerationer & programvaror', '5420'],
   ['virke till ett kundjobb', 'varor_material', 'Varor & material för försäljning', '4010'],
   ['hårfärg till salongen', 'varor_material', 'Varor & material för försäljning', '4010'],
   ['köpte en kurs i fotografering', 'kurser', 'Kurser & fortbildning', '6991'],
  ]) {
   await category.selectOption('eget_uttag')
   await domestic(description)
   await expect(choose(name)).toHaveCount(0)
   await answerPurpose('Ja')
   await expect(choose(name)).toHaveCount(0)
   await answerPayment('Ja')
   await expect(guide).toContainText('konto ' + account)
   await expect(category).toHaveValue('eget_uttag')
   await (account === '6991' ? choose(name) : confirmVat(name)).click()
   await expect(category).toHaveValue(id)
   await expect(category).toBeFocused()
   await expect(query).toBeHidden()
  }
  await lookUp('okänt xyz')
  await expect(heading).toHaveText('Förtydliga vad du köpte')
  await expect(guide.getByRole('status')).toContainText('Guiden hittade ingen inköpstyp')
  await expect(answer('Fortsätt till frågorna')).toHaveCount(0)
  await cancel()
  const beforePartial = await readFormFields()
  for (const [description, message] of [
   ['Lightroom abonnemang på Photoshop', 'Bara en del av beskrivningen matchar'],
   ['Lightroom abonnemang för bredband', 'Flera typer av köp matchar'],
  ]) {
   await lookUp(description)
   await expect(guide.getByRole('status')).toContainText(message)
   await expect(answer('Fortsätt till frågorna')).toHaveCount(0)
   await expect(guide.getByRole('button', { name: /^(Välj |Bekräfta momsändring)/ })).toHaveCount(0)
   await back()
   await expect(query).toHaveValue(description)
   assert.deepEqual(await readFormFields(), beforePartial, 'Back from ambiguous search preserves the form')
   await cancel()
   assert.deepEqual(await readFormFields(), beforePartial, 'Cancelling an ambiguous search preserves the form')
  }
  for (const description of ['Lightroom, monteringsarbete', 'Adobe Lightroom abonnemang och montering', 'IT-support för Lightroom', 'Extern retusch och logi', 'Webbuppkoppling med router', 'Prenumeration på tidning', 'Abonnemang för telefon och tidning', 'Minneskort till kameran och frkat', 'Stativ och blixt och montering']) {
   await lookUp(description)
   await expect(guide.getByRole('status')).toContainText('Bara en del av beskrivningen matchar')
   await expect(answer('Fortsätt till frågorna')).toHaveCount(0)
   await expect(guide.getByRole('button', { name: /^(Välj |Bekräfta momsändring)/ })).toHaveCount(0)
   assert.deepEqual(await readFormFields(), beforePartial, 'Partial match leaves the booking form untouched')
   await cancel()
  }
  for (const description of ['kurs och frakt till kund', 'mobilabonnemang och bredband', 'Meta Ads och extern retusch', 'Abonnemang för mobil och Lightroom']) {
   await lookUp(description)
   await expect(guide.getByRole('status')).toContainText('Flera typer av köp matchar')
   await expect(answer('Fortsätt till frågorna')).toHaveCount(0)
   await expect(guide.getByRole('button', { name: /^(Välj |Bekräfta momsändring)/ })).toHaveCount(0)
   await cancel()
  }
  await lookUp('frakt eller porto')
  await expect(guide.getByRole('status')).toContainText('varufrakt eller brevporto')
  await expect(guide.getByRole('button', { name: /^(Välj |Bekräfta momsändring)/ })).toHaveCount(0)
  await cancel()

  const beforeSpelling = await readFormFields()
  for (const [misspelling, corrected, title] of [
   ['kontorsmatrial', 'kontorsmaterial', 'Kontorsmaterial'],
   ['mineskort', 'minneskort', 'Inventarier'],
  ]) {
   await lookUp(misspelling)
   await expect(answer('Fortsätt till frågorna')).toHaveCount(0)
   await answer(`Menade du ${corrected}?`).click()
   await expect(query).toHaveValue(corrected)
   await expect(query).toBeFocused()
   assert.deepEqual(await readFormFields(), beforeSpelling)
   await query.press('Enter')
   await expect(heading).toHaveText(title)
   if (corrected === 'kontorsmaterial') await expect(guide.getByRole('status')).toContainText('saknas i din kontoplan')
   await cancel()
  }

  for (const description of ['Minneskort till kameran', 'Batteri till kameran', 'Ny bildskärm till datorn', 'Fotobakgrund']) {
   await domestic(description)
   await answerPurpose('Ja')
   await expect(heading).toHaveText('Ska föremålet användas flera gånger utan att förbrukas eller lämnas till kunden?')
   await expect(answer('Gå till Inventarier')).toHaveCount(0)
   await answer('Nej').click()
   await expect(guide.getByRole('status')).toContainText('går åt, ingår i en kundleverans')
   await expect(answer('Gå till Inventarier')).toHaveCount(0)
   await back()
   await answer('Ja').click()
   await expect(answer('Gå till Inventarier')).toBeVisible()
   await cancel()
   assert.deepEqual(await readFormFields(), beforeSpelling, 'Equipment guidance preserves the form')
  }
  await domestic('Köpte ett stativ och en blixt')
  await answerPurpose('Ja')
  await expect(heading).toHaveText('Köptes delarna tillsammans för att användas som en utrustning?')
  await answer('Jag vet inte').click()
  await expect(guide.getByRole('status')).toContainText('beskriv ett i taget')
  await expect(answer('Gå till Inventarier')).toHaveCount(0)
  await back()
  await answer('Ja').click()
  await expect(answer('Gå till Inventarier')).toBeVisible()
  await cancel()

  await domestic('Abonnemang för mobil')
  await expect(heading).toHaveText(/själva telefonitjänsten eller mobilabonnemanget/)
  await cancel()

  for (const [description, row, purpose] of expandedTopics) {
   await category.selectOption('eget_uttag')
   const initialRate = row.id === 'reklam' ? 12 : 0
   await vatRate.selectOption(String(initialRate))
   const beforeNewTopic = await readFormFields()
   await domestic(description)
   await expect(heading).toHaveText(purpose)
   await answerPurpose('Nej')
   await expect(guide.getByRole('status')).toBeVisible()
   await expect(guide.getByRole('button', { name: /^(Välj |Bekräfta momsändring)/ })).toHaveCount(0)
   await back()
   await answerPurpose('Ja')
   if (row.id === 'kopta_tjanster_kunduppdrag') {
    await answerPayment('Nej')
    await expect(guide.getByRole('status')).toContainText('privat utlägg')
    await expect(confirmVat(row.name)).toHaveCount(0)
    await back()
   }
   await answerPayment('Ja')
   await expect(guide).toContainText('konto ' + row.debit_account)
   assert.deepEqual(await readFormFields(), beforeNewTopic)
   if (row.id === 'reklam') await expect(guide).toContainText('Moms på fakturan ändras från 12 % till 25 %.')
   await (row.default_vat_rate === initialRate ? choose(row.name) : confirmVat(row.name)).click()
   await expect(category).toHaveValue(row.id)
   await expect(vatRate).toHaveValue(String(row.default_vat_rate))
  }
  await lookUp('kurs och virke')
  await expect(guide.getByRole('status')).toContainText('Flera typer av köp matchar')
  await expect(choose(courses.name)).toHaveCount(0)
  await answer('Ändra beskrivningen').click()
  await expect(query).toHaveValue('kurs och virke')
  await expect(query).toBeFocused()
  await start('kamera', 'Både privat och i verksamheten')
  await expect(guide.getByRole('status')).toContainText('hur köpet ska användas privat och i verksamheten')
  await back()
  await expect(heading).toHaveText('Vad ska köpet användas till?')
  await back()
  await expect(heading).toHaveText('Inventarier')
  await back()
  await expect(query).toHaveValue('kamera')
  await expect(query).toBeFocused()
  await domestic('frisörkurs')
  await expect(heading).toHaveText(/utan att du startar eller utökar/)
  await answerPurpose('Nej')
  await expect(choose(courses.name)).toHaveCount(0)
  await back()
  await answerPurpose('Jag vet inte')
  await expect(guide.getByRole('status')).toContainText('vad kursen ska användas till')
  await expect(choose(courses.name)).toHaveCount(0)
  await cancel()
  await lookUp('privat lunch')
  await answer('Det gäller ett helt privat köp').click()
  await answerPayment('Jag vet inte')
  await expect(choose('Eget uttag')).toHaveCount(0)
  await back()
  await answerPayment('Ja')
  await expect(guide).toContainText('konto 2013')
  await choose('Eget uttag').click()
  await expect(category).toHaveValue('eget_uttag')
  await vatRate.selectOption('12')
  await lookUp('privat lunch')
  await answer('Det gäller ett helt privat köp').click()
  await answerPayment('Ja')
  await expect(vatRate).toHaveValue('12')
  await confirmVat('Eget uttag').click()
  await expect(vatRate).toHaveValue('0')

  await page.evaluate(() => localStorage.setItem('testGuideVatStatus', 'not_registered'))
  await page.reload()
  await expect(page.getByText(/I det vanliga bokföringsformuläret används då 0 % moms/)).toContainText('Utlandsinköp')
  await start('Adobe Creative Cloud')
  await answer('Jag vet inte').click()
  await expect(guide.getByRole('status')).toContainText('vem som faktiskt sålde')
  await expect(answer('Öppna Utlandsinköp')).toHaveCount(0)
  await back()
  await answer('Nej, utomlands').click()
  await guide.getByRole('button', { name: 'Öppna Utlandsinköp' }).click()
  const country = page.locator('select').filter({ has: page.locator('option[value="IE"]') })
  await expect(country).toBeFocused()
  await expect(country).toHaveValue('unknown')
  await expect(category).toHaveCount(0)
  await page.getByText('Utlandsinköp', { exact: true }).click()
  await start('Annonser på Google')
  await answer('Nej, utomlands').click()
  await expect(guide.getByRole('button', { name: /^(Välj |Bekräfta momsändring)/ })).toHaveCount(0)
  await answer('Öppna Utlandsinköp').click()
  await expect(country).toBeFocused()
  await page.getByText('Utlandsinköp', { exact: true }).click()

  const ads = expandedTopics[0][1]
  for (const [unavailable, message] of [
   [{ ...courses, hidden_from_new_booking: true }, /dold för ny bokföring/],
   [{ ...courses, debit_account: '6992' }, /avviker från standardinställningarna/],
   [{ ...courses, name: 'Egen ändrad kategori' }, /avviker från standardinställningarna/],
   [{ ...ads, default_vat_rate: 12 }, /avviker från standardinställningarna/],
   [null, /saknas i din kontoplan/],
  ]) {
   await page.evaluate(rows => localStorage.setItem('testGuideCategories', JSON.stringify(rows)), [
    ...categories.filter(row => row.id !== (unavailable?.id ?? 'reklam')), ...(unavailable ? [unavailable] : []),
   ])
   await page.reload()
   await lookUp(unavailable?.id === 'kurser' ? 'kurs' : 'Meta-annonser')
   await expect(guide.getByRole('status')).toHaveText(message)
   await expect(answer('Gå till Kontoplan')).toBeVisible()
   await answer('Fortsätt till frågorna').click()
   await answer('Enbart i verksamheten').click()
   await answer('Ja, i Sverige').click()
   await answerPurpose('Ja')
   await expect(guide.getByRole('status')).toHaveText(message)
   await expect(guide.getByRole('button', { name: /^(Välj |Bekräfta momsändring)/ })).toHaveCount(0)
  }
  await page.evaluate(() => localStorage.setItem('testGuideChartLoading', 'yes'))
  await page.reload()
  await lookUp('Kontorsmaterial')
  await expect(guide.getByRole('status')).toContainText('Kontoplanen är inte färdigladdad')
  await expect(answer('Gå till Kontoplan')).toHaveCount(0)
  await page.evaluate(() => localStorage.removeItem('testGuideChartLoading'))
  await page.reload()
  await domestic('hyrde en kamera')
  await answerPurpose('Nej')
  await expect(answer('Gå till Inventarier')).toHaveCount(0)
  await cancel()
  await domestic('köpte ett kamerahus med objektiv')
  await answerPurpose('Ja')
  await expect(heading).toHaveText('Köptes delarna tillsammans för att användas som en utrustning?')
  await answer('Ja').click()
  await guide.getByRole('button', { name: 'Gå till Inventarier' }).click()
  await expect(page.locator('main')).toHaveAttribute('data-active-tab', 'inventarier')
  assert.equal(await page.evaluate(() => localStorage.getItem('testCalls')), null)
  assert.deepEqual(errors, [])
  await context.close()
  console.log('PASS KAN-9 actual booking form ' + width + ': categories, uncertainty, visibility, foreign purchase and equipment handoff')
 }
}finally{await browser.close()}
await writeFile('test-results/kan80/browser-result.json',JSON.stringify({result:'PASS',viewports:[1280,390],accountingLoadError:true,ownerIsolation:true,surface:'actual Home and TransactionForm',transport:'synthetic offline only'},null,2))
