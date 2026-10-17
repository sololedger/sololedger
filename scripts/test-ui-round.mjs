// Real React components, synthetic inputs, mocked service boundary; no remote access.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'

const fixture = `
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import TransactionForm from './src/components/TransactionForm'
import CustomerInvoicesPanel from './src/components/CustomerInvoicesPanel'
import { profileToCompanyVatProfile } from './src/lib/vatProfileAdapter'
// The about:blank offline harness has no secure-context randomUUID API.
let testKey=0
window.crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(++testKey).padStart(12,'0')
window.fixtureCalls=[]
const accounts=[
 {id:'cost',name:'Testkostnad',debit_account:'5420',credit_account:'1930',default_vat_rate:25},
 {id:'egen_insattning',name:'Egen insättning',debit_account:'1930',credit_account:'2018',default_vat_rate:25},
 {id:'egen_insättning',name:'Äldre insättning',debit_account:'1930',credit_account:'2018',default_vat_rate:25},
 {id:'forsaljning',name:'Testförsäljning',debit_account:'1930',credit_account:'3010',default_vat_rate:25},
 {id:'eget_uttag',name:'Eget uttag',debit_account:'2013',credit_account:'1930',default_vat_rate:0}]
const initial={date:'2026-10-01',description:'Syntetiskt test',amount:'1250',type:'cost',vatRate:25,inputVatDeduction:'profile_default',file:null}
function App(){
 const [form,setForm]=useState(initial)
 const [profile,setProfile]=useState({vat_status:'registered',domestic_sales_vat_treatment:'taxable',default_deduction_entitlement:'full'})
 const [mode,setMode]=useState('booking')
 const [locked,setLocked]=useState(false)
 const [booked,setBooked]=useState(false)
 window.configure=(p={})=>{setForm({...initial,...p.form});setProfile(p.missing?null:{vat_status:'registered',domestic_sales_vat_treatment:'taxable',default_deduction_entitlement:p.deduction??'full'});setLocked(!!p.locked);setBooked(!!p.booked);setMode('booking')}
 window.showInvoices=()=>setMode('invoices')
 window.currentForm=()=>form
 return mode==='booking'?<TransactionForm formData={form} setFormData={setForm} kontoplan={accounts}
 isYearLocked={locked} editingId={booked?'synthetic-booked':null} editingBooked={booked} uploading={false}
 periodisera={false} setPeriodisera={()=>{}} periodMonth="2027-01" setPeriodMonth={()=>{}}
 onSubmit={e=>{e.preventDefault();window.fixtureCalls.push(['book',{...form}])}} onVatV2Submit={async()=>{throw Error('unexpected VAT V2')}}
 onCancelEdit={()=>{}} userId="synthetic-owner" vatStatus="registered" domesticSalesVatTreatment="taxable"
 companyVatProfileResult={profileToCompanyVatProfile(profile)} lastSubmitted={null} onSaveFavorite={async()=>{}} onDismissFavorite={()=>{}}
 paymentAccountRoles={[]} paymentAccountRolesLoading={false} paymentAccountRolesLoaded={true} paymentAccountRolesError={null}
 onRefreshPaymentAccountRoles={async()=>{}} onOpenPaymentAccountSettings={()=>{}} onOpenCustomerInvoices={()=>{}} onOpenFixedAssets={()=>{}} />:
 <CustomerInvoicesPanel selectedYear={2026} isYearLocked={false} vatStatus="registered" domesticSalesVatTreatment="taxable"
 onUploadAttachment={async()=>{throw Error('unexpected upload')}} onBookkeepingChanged={async()=>{}} onYearCloseBlockerChange={()=>{}}/>
}
const invoice=(id,number,extra={})=>({id,invoiceNumber:number,customerName:'Syntetisk kund',invoiceDate:'2026-10-01',serviceDate:'2026-10-01',dueDate:'2026-10-31',grossAmount:1250,netAmount:1000,vatAmount:250,vatRate:25,vatTreatment:'taxable',paymentStatus:'unpaid',paidAt:null,attachmentUrl:null,bookings:[],...extra})
window.testInvoices=[invoice('same','SAME'),invoice('cross','CROSS',{bookings:[{id:'yr',bookingKind:'year_end_receivable',fiscalYear:2026,bookingDate:'2026-12-31',verNr:10,transactionId:'receivable'}]}),invoice('exempt','EXEMPT',{grossAmount:1000,netAmount:1000,vatAmount:0,vatRate:null,vatTreatment:'exempt'}),invoice('unknown','UNKNOWN',{vatTreatment:'unknown',vatRate:null})]
createRoot(document.getElementById('root')).render(<App/> )
`
const serviceMock = `
export const getCustomerInvoices=async()=>structuredClone(window.testInvoices)
function pay(kind,id,date){
 window.fixtureCalls.push([kind,id,date]);const i=window.testInvoices.find(i=>i.id===id)
 if(i.vatTreatment==='unknown')throw Error('Momsstatus är osäker.')
 i.paymentStatus='paid';i.paidAt=date;i.bookings.push({id:'payment',bookingKind:kind==='settle'?'receivable_settlement':'payment_same_year',bookingDate:date,fiscalYear:Number(date.slice(0,4)),verNr:20,transactionId:'payment-tx'})
 return {success:true}
}
export const recordCustomerInvoicePayment=async(id,date)=>pay('record',id,date)
export const settleCustomerInvoiceReceivable=async(id,date)=>pay('settle',id,date)
export const undoCustomerInvoicePayment=async id=>{window.fixtureCalls.push(['undo',id]);const i=window.testInvoices.find(i=>i.id===id);i.paymentStatus='unpaid';i.paidAt=null;i.bookings=i.bookings.filter(b=>b.id!=='payment');return {success:true}}
export const bookCustomerInvoiceYearEndReceivable=async()=>{throw Error('unexpected year-end write')}
export const createCustomerInvoice=async()=>{throw Error('unexpected create')}
export const updateCustomerInvoiceUnbooked=async()=>{throw Error('unexpected edit')}
`
const bundle=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},tsconfig:path.resolve('tsconfig.json'),bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'offline-services',setup(b){
 b.onResolve({filter:/accountingService$/},()=>({path:'service',namespace:'fixture'}))
 b.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='service'?serviceMock:`
 export const supabase={from:table=>{if(table!=='favorites')throw Error('Unexpected read');return {select:()=>({eq:()=>({order:async()=>({data:[{id:'f1',name:'Insättningsfavorit',type:'egen_insattning',amount:100,vat_rate:25},{id:'f2',name:'Äldre favorit',type:'egen_insättning',amount:100,vat_rate:12}]})})})}}}
 `}))
}}]})
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/TransactionForm.tsx";\n@source "./src/components/CustomerInvoicesPanel.tsx";\n@source "./src/components/SwedishDateInput.tsx";\n@source "./src/components/FavoriteChips.tsx";')
const css=await postcss([tailwindcss()]).process(styles,{from:path.resolve('ui-round.css')})
await mkdir('test-results/ui-round',{recursive:true})
const browser=await chromium.launch({headless:true})
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}})
  page.setDefaultTimeout(10000)
  const errors=[],requests=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',r=>{requests.push(r.request().url());return r.abort()})
  await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
  await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundle.outputFiles[0].text})
  const configure=async options=>{await page.evaluate(p=>window.configure(p),options);await expect(page.getByText('Kategori',{exact:true})).toBeVisible()}
  const category=page.locator('select').filter({has:page.locator('option[value="cost"]')})
  const vat=page.locator('select').filter({has:page.locator('option[value="25"]')})
  const submit=()=>page.getByRole('button',{name:'Bokför',exact:true}).filter({visible:true}).click()
  // KAN-64: actual rendered profile matrix, without changing deduction product code.
  for(const deduction of ['full','none','unknown','missing'])for(const vatRate of [25,0]){
   await configure({deduction,missing:deduction==='missing',form:{vatRate}})
   if(deduction==='full'&&vatRate===25){
    await expect(page.getByText('Fullt momsavdrag används enligt Profil om du inte väljer bort det för just detta köp.')).toBeVisible()
    await expect(page.getByText(/Fakturans moms: 250,00 kr. Avdrag: 250,00 kr. Kostnad: 1/)).toBeVisible()
    const choice=page.locator('select').filter({has:page.locator('option[value="profile_default"]')})
    await choice.selectOption('none')
    await expect(page.getByText(/Fakturans moms: 250,00 kr. Avdrag: 0,00 kr. Kostnad: 1/)).toBeVisible()
    await submit();assert.equal((await page.evaluate(()=>window.fixtureCalls.at(-1)))[1].inputVatDeduction,'none')
   }else if(deduction==='full'){
    await expect(page.getByText('Avdragsgill ingående moms',{exact:true})).toHaveCount(0)
   }else{
    await expect(page.getByText(deduction==='none'?'Ingen avdragsgill moms enligt Profil. Hela fakturans belopp bokförs som kostnad.':'Avdragsrätten är inte fastställd i Profil. SoloLedger gör därför inget automatiskt momsavdrag.')).toBeVisible()
    await expect(page.getByText('Fullt momsavdrag enligt Profil',{exact:true})).toHaveCount(0)
    await expect(page.locator('option[value="full"]')).toHaveCount(0)
   }
  }
  console.log('PASS KAN-64 '+width+': full/none/unknown/missing x 25/0%, individual opt-out')
  // KAN-85: category defaults and favorites deliberately contain bad legacy VAT.
  for(const id of ['egen_insattning','egen_insättning']){
   await configure({});await category.selectOption(id)
   await expect(page.getByText('Belopp',{exact:true})).toBeVisible()
   await expect(page.getByText('Belopp inkl. moms',{exact:true})).toHaveCount(0)
   await expect(vat).toHaveCount(0)
   assert.equal(await page.evaluate(()=>window.currentForm().vatRate),0)
   await submit();assert.equal((await page.evaluate(()=>window.fixtureCalls.at(-1)))[1].vatRate,0)
   await category.selectOption('cost');await expect(vat).toHaveValue('25')
  }
  for(const favorite of ['Insättningsfavorit','Äldre favorit']){
   await configure({});await page.getByText(favorite,{exact:true}).click()
   assert.equal(await page.evaluate(()=>window.currentForm().vatRate),0)
   await expect(vat).toHaveCount(0)
   // Favorite intentionally clears description; enter a new description as in real use.
   await page.locator('input[type="text"]:not([aria-label])').fill('Syntetisk insättning')
   await submit();assert.equal((await page.evaluate(()=>window.fixtureCalls.at(-1)))[1].vatRate,0)
  }
  await configure({form:{type:'egen_insattning',vatRate:25}})
  const before=await page.evaluate(()=>window.fixtureCalls.length)
  await submit();assert.equal(await page.evaluate(()=>window.fixtureCalls.length),before)
  await expect(page.getByRole('alert')).toContainText('0 % moms')
  for(const type of ['forsaljning','eget_uttag']){await configure({});await category.selectOption(type);await expect(vat).toHaveCount(1)}
  await configure({form:{type:'egen_insattning',vatRate:0}})
  await page.screenshot({path:'test-results/ui-round/'+width+'-deposit.png',fullPage:true})
  console.log('PASS KAN-85 '+width+': both IDs, favorites, category switching, hidden VAT, fail-closed stale value')
  await page.evaluate(()=>{window.fixtureCalls=[];window.showInvoices()})
  const panel=page.getByTestId('customer-invoices-panel')
  await expect(panel.getByText(/Kundfordran är pengar som kunden är skyldig/)).toBeVisible()
  await expect(panel.getByText(/En momsfri faktura bokförs utan moms även vid bokslut/)).toBeVisible()
  const card=number=>page.getByTestId('customer-invoice-card').filter({hasText:number})
  for(const number of ['SAME','CROSS']){
   const c=card(number);await c.getByRole('button').first().click()
   const payment=c.getByRole('form',{name:'Registrera betalning för faktura '+number})
   const date=payment.getByRole('textbox',{name:'Betalningsdatum',exact:true})
   const pay=payment.getByRole('button',{name:'Registrera betalning',exact:true})
   await expect(date).toHaveValue('');await expect(payment).toContainText('1 250 kr')
   if(number==='CROSS')await expect(payment).toContainText('Ingen ny försäljning eller moms')
   for(const text of ['', '31/02/2027', 'abc']){await date.fill(text);await pay.click();assert.equal(await page.evaluate(()=>window.fixtureCalls.length),0)}
   await date.fill(number==='SAME'?'10/10/2026':'15/01/2027')
   await date.fill('31/02/2027');await pay.click()
   assert.equal(await page.evaluate(()=>window.fixtureCalls.length),0,'valid -> invalid must never use last valid ISO date')
   await date.fill('');await pay.click();assert.equal(await page.evaluate(()=>window.fixtureCalls.length),0)
   await date.fill(number==='SAME'?'10/10/2026':'15/01/2027')
   await pay.click();await expect(c).toContainText('Betald')
   assert.deepEqual(await page.evaluate(()=>window.fixtureCalls[0]),[number==='SAME'?'record':'settle',number.toLowerCase(),number==='SAME'?'2026-10-10':'2027-01-15'])
   await c.getByRole('button',{name:'Ångra registrerad betalning'}).click()
   await page.getByRole('dialog').getByRole('button',{name:'Ångra betalning',exact:true}).click()
   await expect(date).toHaveValue('')
   assert.deepEqual(await page.evaluate(()=>window.fixtureCalls.at(-1)),['undo',number.toLowerCase()])
   await page.evaluate(()=>{window.fixtureCalls=[]})
  }
  await card('EXEMPT').getByRole('button').first().click()
  await expect(card('EXEMPT')).toContainText('Hela fakturabeloppet bokförs vid betalning: 1 000 kr.')
  await page.screenshot({path:'test-results/ui-round/'+width+'-invoices.png',fullPage:true})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[])
  console.log('PASS KAN-67/68 '+width+': empty/invalid/cleared/valid-to-invalid, exact date and RPC choice, amount, undo reset, help and mobile layout; zero remote calls')
  await page.close()
 }
}finally{await browser.close()}
