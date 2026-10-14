import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
// Execute the real service with a controlled Supabase boundary; no network/data writes.
const calls = []
const supabase = {
 auth: { getUser: async () => ({ data: { user: { id: 'kan72-test' } }, error: null }) },
 rpc: async (name, args) => { calls.push({ name, args }); return { data: { success: true, transaction_id: 'test', ver_nr: 1 }, error: null } },
}
const cache = new Map()
function load(file) {
 file = path.resolve(file)
 if (cache.has(file)) return cache.get(file).exports
 const testModule = { exports: {} }; cache.set(file,testModule)
 const code = ts.transpileModule(readFileSync(file,'utf8'), {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
 }).outputText
 const localRequire = spec => {
   if (spec.includes('supabaseClient')) return { supabase }
   if (spec.endsWith('FavoriteChips') || spec.endsWith('SwedishDateInput')) return { default: () => null }
   if (spec.startsWith('.') || spec.startsWith('@/')) {
     const base = spec.startsWith('@/') ? path.resolve('src',spec.slice(2)) : path.resolve(path.dirname(file),spec)
     const target = [base,base+'.ts',base+'.tsx'].find(p=>existsSync(p))
     assert.ok(target,'test module exists: '+spec)
     return load(target)
   }
   return require(spec)
 }
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{ filename:file })(localRequire,testModule,testModule.exports)
 return testModule.exports
}
const service = load('src/lib/accountingService.ts')
const invalid = [-1250,0,-0.01,0.001,1.001,NaN,Infinity,-Infinity,10000000000000,0.1+0.2]
for (const method of ['bookTransaction','bookPeriodizedTransaction']) {
 for (const amount of invalid) {
   calls.length=0
   await assert.rejects(service[method]({ amount,date:'2026-02-01',future_date:'2027-01-01',description:'test',type:'sale' }),
     undefined,method+' must reject '+amount)
   assert.equal(calls.length,0,'invalid amount never reaches RPC')
 }
 for (const amount of [0.01,0.03,1.01,1250.25,9999999999999.99]) {
   calls.length=0
   await service[method]({ amount,date:'2026-02-01',future_date:'2027-01-01',description:'test',type:'sale' })
   assert.equal(calls.length,1)
   assert.equal(calls[0].args.p_payload.amount,amount)
 }
}
const { parseStandardBookingAmount } = load('src/lib/standardBookingAmount.ts')
// Exercise Chromium's real number-input representation; valueAsNumber can lose precision.
const { chromium } = await import('@playwright/test')
const browser = await chromium.launch()
let htmlSamples
try {
 const page = await browser.newPage()
 await page.route('**/*',route=>route.abort())
 await page.setContent('<input type="number" min="0.01" step="0.01">')
 htmlSamples = await page.evaluate(() => {
   const input=document.querySelector('input')
   return ['.50','.01','1e2','1E-2','1e-3','1E-4','1.00000000000000001','NaN','Infinity'].map(raw=>{
     input.value=raw
     return {raw,value:input.value,valueAsNumber:input.valueAsNumber,valid:input.checkValidity()}
   })
 })
} finally { await browser.close() }
for (const sample of htmlSamples.slice(0,4)) {
 assert.equal(sample.valid,true,'Chromium accepts '+sample.raw)
 assert.equal(parseStandardBookingAmount(sample.value),sample.valueAsNumber,'validate the DOM string before number conversion')
}
for (const sample of htmlSamples.slice(4)) {
 assert.throws(()=>parseStandardBookingAmount(sample.value),undefined,'DOM value remains unsafe: '+sample.raw)
}
assert.equal(htmlSamples[6].valueAsNumber,1,'HTML valueAsNumber loses the invalid extra precision')
assert.notEqual(htmlSamples[6].value,'1','raw DOM string retains the precision evidence')
for (const value of ['',' ','-1','0','0.001','1.001','1.00000000000000001','NaN','Infinity','1e-3','1E-4','.01e-1','101e-4','1.00000000000000001e2','-.50','-1e2','-1E-2','1.00000000000000001e0','1e309','1e999999999999999999','1e-999999999999999999','1e-324','10000000000000']) {
 assert.throws(()=>parseStandardBookingAmount(value),undefined,'raw form amount rejected: '+value)
}
for (const value of ['.50','.01','1e2','1E-2','0.001e1','0.1e-1','100e-4','999999999999999e-2','0.01','0.03','1.000','1250.25','9999999999999.99']) {
 assert.equal(parseStandardBookingAmount(value),Number(value))
}
// Render the actual component: invalid inputs expose a visible accessible error.
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const Form = load('src/components/TransactionForm.tsx').default
const profile = load('src/lib/vatProfileAdapter.ts').profileToCompanyVatProfile({
 vat_status:'registered',domestic_sales_vat_treatment:'taxable',foreign_purchase_reporting:'required',
 vat_period_type:'month',vat_management_from:'2026-01-01',default_deduction_entitlement:'full',
})
const noop = ()=>{}
const props = { formData:{date:'2026-02-01',description:'test',amount:'-1250',type:'sale',vatRate:25,inputVatDeduction:'profile_default',file:null},
 setFormData:noop,kontoplan:[{id:'sale',name:'Sale',debit_account:'1930',credit_account:'3001'}],
 isYearLocked:false,editingId:null,editingBooked:false,uploading:false,periodisera:false,setPeriodisera:noop,
 periodMonth:'2027-01',setPeriodMonth:noop,onSubmit:noop,onVatV2Submit:noop,onCancelEdit:noop,userId:'test',
 vatStatus:'registered',domesticSalesVatTreatment:'taxable',companyVatProfileResult:profile,lastSubmitted:null,
 onSaveFavorite:noop,onDismissFavorite:noop,paymentAccountRoles:[],paymentAccountRolesLoading:false,
 paymentAccountRolesLoaded:true,paymentAccountRolesError:null,onRefreshPaymentAccountRoles:noop,
 onOpenPaymentAccountSettings:noop,onOpenCustomerInvoices:noop,onOpenFixedAssets:noop }
for (const amount of ['-1250','0','0.001']) {
 const html=renderToStaticMarkup(React.createElement(Form,{...props,formData:{...props.formData,amount}}))
 assert.match(html,/min="0.01"/)
 assert.match(html,/aria-invalid="true"/)
 assert.match(html,/role="alert"/)
}
for (const raw of ['.50','.01','1e2','1E-2']) {
 const html=renderToStaticMarkup(React.createElement(Form,{...props,formData:{...props.formData,amount:raw}}))
 assert.doesNotMatch(html,/aria-invalid="true"/,'valid HTML number has no amount error: '+raw)
 for (const method of ['bookTransaction','bookPeriodizedTransaction']) {
   calls.length=0
   await service[method]({amount:raw,date:'2026-02-01',future_date:'2027-01-01',description:'test',type:'sale'})
   assert.equal(calls[0].args.p_payload.amount,Number(raw),'service normalizes exactly before RPC')
 }
}
const metadataHtml=renderToStaticMarkup(React.createElement(Form,{...props,editingBooked:true,editingId:'old-booking'}))
assert.doesNotMatch(metadataHtml,/standard-booking-amount-error/,'booked metadata ignores legacy amount')
// Execute the actual page submit handler with controlled dependencies.
const pageSource=readFileSync('src/app/page.tsx','utf8')
const tree=ts.createSourceFile('page.tsx',pageSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let handlerNode
function visit(node) {
 if (ts.isFunctionDeclaration(node) && node.name?.text==='handleAddTransaction') handlerNode=node
 ts.forEachChild(node,visit)
}
visit(tree)
assert.ok(handlerNode,'submit handler found')
const handlerCode=ts.transpileModule(handlerNode.getText(tree),{
 compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},
}).outputText
async function submitPage({ amount,booked=false,periodized=false }) {
 const actions=[]
 const context={console,Number,Error,parseInt,Date,parseStandardBookingAmount,
 isYearLocked:false,submitInFlightRef:{current:false},editingId:booked?'old-booking':null,
 editingBooked:booked,transactions:[{id:'old-booking'}],kontoplan:[{id:'sale'}],
 formData:{date:'2026-02-01',description:'Metadata',amount,type:'sale',vatRate:25,inputVatDeduction:'profile_default',file:booked?null:{}},
 isSystemManagedTransaction:()=>false,categoryRedirectsToFixedAssets:()=>false,
 periodisera:periodized,periodMonth:'2027-01',profile:{},
 refreshFreeUsageCount:async()=>0,canCreateTransactions:()=>true,isYearClosed:async()=>false,
 alert:message=>actions.push(['alert',message]),
 handleFileUpload:async()=>{actions.push(['upload']);return 'fixture-file'},
 bookTransaction:async payload=>actions.push(['book',payload]),
 bookPeriodizedTransaction:async payload=>actions.push(['periodize',payload]),
 updateTransaction:async(id,payload)=>actions.push(['metadata',payload]),refreshData:async()=>{},
 }
 for(const name of ['setUploading','setEditingId','setEditingBooked','setLastSubmitted','setFormData','setPeriodisera','setShowLimitPaywall','setActiveTab']) context[name]=()=>{}
 vm.createContext(context)
 vm.runInContext(handlerCode,context)
 await context.handleAddTransaction({preventDefault(){}})
 return actions
}
for(const amount of ['-1250','0','0.001','1.00000000000000001','1e-3','1E-4','NaN']) {
 for(const periodized of [false,true]) {
   const actions=await submitPage({amount,periodized})
   assert.equal(actions.length,1)
   assert.equal(actions[0][0],'alert','invalid amount blocks before upload or booking')
 }
}
for(const periodized of [false,true]) {
 for(const amount of ['.50','.01','1e2','1E-2','0.03']) {
 const actions=await submitPage({amount,periodized})
 assert.equal(actions[0][0],'upload')
 assert.equal(actions[1][0],periodized?'periodize':'book')
 assert.equal(actions[1][1].amount,Number(amount))
 }
}
const metadataActions=await submitPage({amount:'-1250',booked:true})
assert.equal(metadataActions.length,1)
assert.equal(metadataActions[0][0],'metadata')
assert.equal(metadataActions[0][1].description,'Metadata')
assert.ok(!('amount' in metadataActions[0][1]),'legacy amount preserved during booked metadata edit')
console.log('KAN-72 service, raw amount, rendered UI and actual page submit tests passed.')
