import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {identities,preflight,checked,admin,chromium,expect,assert,origin,url,anonKey,attachRoutes,login,nav} from './profile-context-staging-support.mjs'
const require=createRequire(new URL('../package.json',import.meta.url)),{build}=require('esbuild')
const users=await identities(),[a,b]=users
const evidence={base:'67d314a',app:origin,staging:'fzxqiqenqjzhlyxxpvhg',tests:[],errors:[],before:[]}
for(const u of users){await preflight(u.client,u.id,'read existing synthetic evidence');evidence.before.push({id:u.id,profile:checked(await u.client.from('profiles').select('company_name,vat_period_type,default_deduction_entitlement').eq('id',u.id).single()),transactions:checked(await u.client.from('transactions').select('id').eq('user_id',u.id)).length})}
assert.equal(evidence.before[1].profile.default_deduction_entitlement,'none')
const bundle=await build({stdin:{contents:`import{createClient}from'@supabase/supabase-js';window.testAuth=createClient(${JSON.stringify(url)},${JSON.stringify(anonKey)});`,resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'iife',platform:'browser'})
async function financialSnapshot(){
 const balances=checked(await b.client.rpc('get_period_account_balances',{p_start_date:'2026-01-01',p_end_date:'2026-12-31'}))
 const ne=checked(await b.client.rpc('get_ne_sales_summary',{p_year:2026}))
 return{balances,ne}
}
function balance(rows,account){return Number(rows.find(r=>r.account_number===account)?.balance??0)}
fs.mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true})
const browser=await chromium.launch({headless:true})
let releaseA,releaseB,restoreNeeded=false
const savedB=checked(await admin.from('profiles').select('company_name,vat_period_type,vat_management_from,default_deduction_entitlement,domestic_sales_vat_treatment,foreign_purchase_reporting,vat_status,org_nr,vat_number').eq('id',b.id).single())
try{
 for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'})
 const state={calls:[],errors:[]};await attachRoutes(context,users,state)
 const page=await context.newPage();page.setDefaultTimeout(20000)
 const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()})
 await page.goto(origin,{waitUntil:'domcontentloaded',timeout:120000});await login(page,a);await nav(page,'Profil',width)
 await expect(page.locator('#company-name')).toHaveValue('KAN78 Company A')
 const sidecar=await context.newPage();await sidecar.goto(origin,{waitUntil:'domcontentloaded',timeout:120000});await sidecar.addScriptTag({content:bundle.outputFiles[0].text})
 let heldA=false,heldB=false
 const gateA=new Promise(r=>{releaseA=r}),gateB=new Promise(r=>{releaseB=r})
 state.profileRoute=async route=>{
 const req=route.request(),target=new URL(req.url())
 if(req.frame().page()===page){
 if(target.searchParams.get('id')==='eq.'+a.id){const response=await route.fetch();heldA=true;await gateA;return route.fulfill({response})}
 if(target.searchParams.get('id')==='eq.'+b.id){const response=await route.fetch();heldB=true;await gateB;return route.fulfill({response})}
 }
 return route.continue()
 }
 const signIn=async u=>sidecar.evaluate(async creds=>{const{error}=await window.testAuth.auth.signInWithPassword(creds);if(error)throw Error('Synthetic sign in failed')},{email:u.email,password:u.password})
 await signIn(a);await expect.poll(()=>heldA).toBe(true)
 await signIn(b);await expect.poll(()=>heldB).toBe(true)
 await expect(page.locator('#company-name')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Spara ändringar',exact:true})).toHaveCount(0)
 releaseB();state.profileRoute=null
 await expect(page.getByText('Översikt',{exact:true})).toBeVisible({timeout:45000});await nav(page,'Profil',width)
 await expect(page.locator('#company-name')).toHaveValue('KAN78 Company B')
 releaseA();await page.waitForTimeout(400)
 await expect(page.locator('#company-name')).toHaveValue('KAN78 Company B')
 await expect(page.locator('#vat-period-type')).toHaveValue('month')
 await expect(page.locator('#default-deduction-entitlement')).toHaveValue('none')
 evidence.tests.push({name:'real cross-tab A→B delayed response '+width,result:'PASS'})
 state.allowProfileSave=true;restoreNeeded=true
 await preflight(b.client,b.id,'B name-only profile save '+width)
 await page.locator('#company-name').fill('KAN104 B verified '+width)
 await page.getByRole('button',{name:'Spara ändringar',exact:true}).click()
 await expect(page.locator('#company-name')).toHaveValue('KAN104 B verified '+width)
 await expect.poll(async()=>checked(await admin.from('profiles').select('company_name').eq('id',b.id).single()).company_name).toBe('KAN104 B verified '+width)
 const persisted=checked(await admin.from('profiles').select('company_name,vat_period_type,default_deduction_entitlement').eq('id',b.id).single())
 assert.equal(persisted.vat_period_type,'month');assert.equal(persisted.default_deduction_entitlement,'none')
 evidence.tests.push({name:'B name-only save '+width,result:'PASS',persisted})
 await nav(page,'Bokföring',width)
 const year=page.locator('select').filter({has:page.locator('option[value="2026"]')}).first();await year.selectOption('2026')
 await expect(page.getByText('Översikt',{exact:true})).toBeVisible()
 await page.locator('input[type="date"]').first().fill('2026-01-22')
 await page.locator('form input[type="text"][required]:not([aria-label])').fill('KAN104 verified B no deduction '+width+' '+Date.now())
 await page.locator('input[type="number"][step="0.01"]').first().fill('1250')
 await page.locator('select').filter({has:page.locator('option[value="programvaror"]')}).selectOption('programvaror')
 const financialBefore=await financialSnapshot()
 await page.getByRole('button',{name:'Bokför',exact:true}).filter({visible:true}).click()
 await expect.poll(()=>state.calls.length,{timeout:45000}).toBe(1)
 assert.equal(state.calls[0].receipt.success,true,state.calls[0].receipt.message)
 const id=state.calls[0].receipt.transaction_id
 const journal=checked(await b.client.from('journal_entries').select('account_number,debit,credit').eq('transaction_id',id))
 assert.equal(journal.reduce((s,r)=>s+Number(r.debit)-Number(r.credit),0),0)
 assert.equal(journal.find(r=>r.account_number==='5420').debit,1250)
 assert.equal(journal.filter(r=>r.account_number==='2641').length,0)
 const financialAfter=await financialSnapshot()
 for(const rows of ['balances','ne']){const before=rows==='ne'?financialBefore.ne.balances:financialBefore.balances,after=rows==='ne'?financialAfter.ne.balances:financialAfter.balances;assert.equal(balance(after,'5420')-balance(before,'5420'),1250);assert.equal(balance(after,'1930')-balance(before,'1930'),-1250);assert.equal(balance(after,'2641')-balance(before,'2641'),0)}
 await page.screenshot({path:fileURLToPath(new URL('../test-results/KAN-104-'+width+'.png',import.meta.url)),fullPage:true})
 evidence.tests.push({name:'real B purchase '+width,result:'PASS',transactionId:id,journal,financialBefore,financialAfter})
 await preflight(admin,null,'restore synthetic B name after verification');checked(await admin.from('profiles').update(savedB).eq('id',b.id));restoreNeeded=false
 assert.deepEqual(state.errors,[])
 await context.close();console.log('PASS real Staging profile race, B save and B zero-VAT journal '+width)
 }
}catch(e){evidence.errors.push(e.message);console.error(e.message);process.exitCode=1}
finally{releaseA?.();releaseB?.();await browser.close();if(restoreNeeded){await preflight(admin,null,'restore synthetic B profile');checked(await admin.from('profiles').update(savedB).eq('id',b.id))}fs.mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../test-results/KAN-104-staging-result.json',import.meta.url),JSON.stringify(evidence,null,2))}
