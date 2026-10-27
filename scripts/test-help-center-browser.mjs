import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

// Real Home, useAuth, help navigation, Layout and FAQ. Synthetic auth transport;
// accounting components are sentinels, every outside request/write is denied.
const forbidden = `const deny=(...a)=>{window.writes.push(a);throw Error('Forbidden accounting write')};`
const mock = {
  useAccountingData: `export const useAccountingData=()=>({accountingDataReady:true,accountingDataError:null,isYearLocked:false,transactions:[],balances:{},balanceSheetBalances:{},journalMap:{},neData:{},momsBreakdown:{},transactionHistoryComplete:true,kontoplan:[],kontoplanLoaded:true,kontoplanLoading:false,retryAccountingData:()=>{},refreshData:()=>{throw Error('No refresh expected')},refreshDataWithStatus:()=>{throw Error('No refresh expected')}});`,
  usePaymentAccountRoleConfiguration: `export const usePaymentAccountRoleConfiguration=()=>({configuredRoles:[],loaded:true,loading:false,error:null});`,
  subscriptionLimits: `export const FREE_TRANSACTION_LIMIT=15;export const getFreeTransactionUsage=async()=>0;export const canCreateTransactions=()=>true;`,
  accountingService: forbidden + `export const getCustomerInvoices=async()=>[];export const isYearClosed=async()=>false;export const closeYear=deny,bookStandardBookingAttempt=deny,bookVatV2EuServiceReverseChargeTransaction=deny,createCorrectionTransaction=deny,updateTransaction=deny;`,
  supabaseClient: `import {supabase as base,control} from './tests/fixtures/profileContextMocks';
  window.authTest=control;
  export const supabase={...base,auth:{...base.auth,signInWithPassword:async()=>{control.event('A');return{error:null}},resetPasswordForEmail:async(email,options)=>{window.resetRedirect=options.redirectTo;return{error:null}},updateUser:async()=>({error:null}),signOut:async()=>{control.event(null);return{error:null}}}};`,
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import Home from './src/app/page';import {HelpArticleMedia} from './src/components/FAQ';import {GoTrueClient} from '@supabase/auth-js';
window.writes=[];
createRoot(document.getElementById('root')).render(<Home/>);
window.runRecoverySDK=async()=>{
 const client=new GoTrueClient({url:'https://synthetic-auth.invalid',storageKey:'kan102-sdk-recovery',persistSession:false,autoRefreshToken:false,detectSessionInUrl:true,
 fetch:async(input)=>{if(new URL(String(input)).pathname==='/user')return new Response(JSON.stringify({id:'A',email:'A@example.invalid',aud:'authenticated',role:'authenticated'}),{status:200,headers:{'content-type':'application/json'}});throw Error('Unexpected Auth SDK request')}});
 client.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')window.authTest.event(session.user.id,event)});
 const result=await client.initialize();if(result.error)throw result.error;
};
window.showMedia=()=>createRoot(document.getElementById('media')).render(<><HelpArticleMedia media={{kind:'image',src:'/help/missing.png',alt:'Syntetisk exempelbild',caption:'Exempel utan kunduppgifter',width:800,height:400}}/><HelpArticleMedia media={{kind:'video',src:'/help/missing.mp4',caption:'Syntetiskt exempel',captions:'/help/missing.vtt',transcript:'Samma instruktion i text.'}}/></>);`
const bundle = await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',plugins:[{name:'offline-help',setup(b){
  b.onResolve({filter:/.*/},args=>{
    const leaf=args.path.split('/').at(-1)
    if(mock[leaf])return{path:leaf,namespace:'offline'}
    if(args.path==='next/image')return{path:'image',namespace:'offline'}
    if(args.importer.replaceAll('\\','/').endsWith('/src/app/page.tsx')&&args.path.startsWith('@/components/')&&!['Layout','FAQ','AccountingDataBoundary'].includes(leaf))return{path:'panel-'+leaf,namespace:'offline'}
  })
  b.onLoad({filter:/.*/,namespace:'offline'},args=>({contents:mock[args.path]||(args.path==='image'?`export default function Image({unoptimized,...props}){return <img {...props}/>}`:`export default function Panel(p){if('isOpen' in p&&!p.isOpen)return null;return <section data-panel="${args.path.slice(6)}">${args.path.slice(6)}{p.children}</section>}`),loader:'tsx',resolveDir:process.cwd()}))
}}]})
const css=(await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
const out=process.env.KAN102_HELP_OUTPUT || 'coverage/kan102-help';await mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true,...process.env.PLAYWRIGHT_CHROMIUM_CHANNEL?{channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL}:{}})
const results=[]
try {
  for(const width of [1440,390,320]){
    const context=await browser.newContext({viewport:{width,height:width<500?844:1000},isMobile:width<500,hasTouch:width<500})
    const page=await context.newPage(),errors=[],external=[]
    page.on('pageerror',e=>errors.push(e.message))
    await context.route('**/*',route=>{
      const url=new URL(route.request().url())
      if(url.origin==='https://kan102.test'&&url.pathname==='/')return route.fulfill({contentType:'text/html',body:`<html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><div id="media"></div><script>${bundle.outputFiles[0].text}</script></html>`})
      if(url.origin==='https://kan102.test'&&url.pathname.startsWith('/help/'))return route.fulfill({status:404,body:'Missing synthetic media'})
      external.push(url.origin+url.pathname);return route.abort()
    })
    const call=(name,...args)=>page.evaluate(({name,args})=>window.authTest[name](...args),{name,args})
    async function login(owner='A',event='SIGNED_IN'){
      await expect.poll(()=>page.evaluate(()=>Boolean(window.authTest))).toBe(true)
      await call('event',owner,event)
      if (!owner) return
      await expect.poll(()=>call('pending').then(p=>p.length)).toBe(1)
      await call('finish',0)
    }
    const faq=page.getByRole('region',{name:'Hjälp & FAQ',exact:true})
    const article=id=>faq.locator(`[data-help-id="${id}"]`)
    const search=faq.getByRole('searchbox')
    async function noOverflow(){
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=width,'page overflow '+width)
      assert.equal(await faq.evaluate(element=>element.scrollWidth>element.clientWidth),false,'help overflow '+width)
    }
    async function navigate(label){
      let b=page.getByRole('button',{name:label,exact:true}).filter({visible:true})
      if(!await b.count()){
        const mobile=page.getByRole('button',{name:'Öppna meny',exact:true})
        if(await mobile.isVisible())await mobile.click();else await page.getByRole('button',{name:/^Mer/}).click()
        b=page.getByRole('button',{name:label,exact:true}).filter({visible:true})
        if(!await b.count())b=page.getByRole('menuitem',{name:label,exact:true})
      }
      await b.click()
    }
    await page.goto('https://kan102.test/?help=ne-r14')
    await login(null,'SIGNED_OUT')
    await expect(faq).toHaveCount(0)
    assert.equal(new URL(page.url()).searchParams.get('help'),'ne-r14')
    await page.getByPlaceholder('E-postadress').fill('synthetic@example.test')
    await page.getByRole('button',{name:'Glömt lösenord?',exact:true}).click()
    await page.getByRole('button',{name:'Skicka återställningslänk',exact:true}).click()
    await expect.poll(()=>page.evaluate(()=>window.resetRedirect)).toBe('https://kan102.test/?help=ne-r14')
    await page.getByRole('button',{name:'Tillbaka till inloggning',exact:true}).click()
    await page.getByPlaceholder('Lösenord', {exact:true}).fill('synthetic-password')
    await page.getByRole('button',{name:'Logga in',exact:true}).click()
    await expect.poll(()=>call('pending').then(p=>p.length)).toBe(1);await call('finish',0)
    await expect(article('ne-r14')).toHaveAttribute('open','')
    await expect(article('ne-r14').locator('summary')).toBeFocused()
    await page.reload();await login()
    await expect(article('ne-r14')).toHaveAttribute('open','')
    // Both known alias and unknown link get a meaningful destination.
    await page.goto('https://kan102.test/?help=r14');await login()
    await expect(article('ne-r14')).toHaveAttribute('open','')
    await page.goto('https://kan102.test/?help=unknown');await login()
    await expect(faq).toContainText('Frågelänken kunde inte hittas')
    await search.fill('R14');await expect(article('ne-r14')).toBeVisible()
    await search.fill('ratta');await expect(article('ratta-bokning')).toBeVisible()
    await search.fill('momsfri')
    if(width<1024)await faq.getByLabel('Ämne',{exact:true}).selectOption('start')
    else await faq.getByRole('button',{name:'Kom igång & profil',exact:true}).click()
    await expect(article('momsprofil-eu')).toBeVisible()
    assert.equal(await faq.locator('[data-help-id]').count(),1)
    await search.fill('xyzzzz');await expect(faq).toContainText('Ingen träff')
    await faq.getByRole('button',{name:'Visa alla frågor'}).click();await expect(search).toHaveValue('')
    // Keyboard-native expansion, topics+search, no refocus while typing.
    if(width<1024)await faq.getByLabel('Ämne',{exact:true}).selectOption('vat')
    else await faq.getByRole('button',{name:'Moms & skattekonto',exact:true}).click()
    await search.fill('skattekonto')
    await expect(search).toBeFocused()
    await article('skattekonto').locator('summary').focus();await page.keyboard.press('Enter')
    await expect(article('skattekonto')).toHaveAttribute('open','')
    await expect.poll(()=>new URL(page.url()).searchParams.get('help')).toBe('skattekonto')
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await expect(page.locator('[data-panel="Momsrapport"]')).toBeVisible()
    await page.getByRole('button',{name:'Tillbaka till Hjälp & FAQ',exact:true}).click()
    await expect(search).toHaveValue('skattekonto')
    if(width<1024)await expect(faq.getByLabel('Ämne',{exact:true})).toHaveValue('vat')
    else await expect(faq.getByRole('button',{name:'Moms & skattekonto',exact:true})).toHaveAttribute('aria-pressed','true')
    await expect(article('skattekonto')).toHaveAttribute('open','')
    await expect(article('skattekonto').locator('summary')).toBeFocused()
    await page.goBack();await expect(page.locator('[data-panel="Momsrapport"]')).toBeVisible()
    await expect(page.getByRole('button',{name:'Tillbaka till Hjälp & FAQ',exact:true})).toBeVisible()
    await page.goForward();await expect(article('skattekonto')).toHaveAttribute('open','')
    await expect(search).toHaveValue('skattekonto')
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await page.goBack();await expect(search).toHaveValue('skattekonto')
    await expect(article('skattekonto').locator('summary')).toBeFocused()
    // A normal menu choice ends the visit, including after reload/history.
    const returnLink=page.getByRole('button',{name:'Tillbaka till Hjälp & FAQ',exact:true})
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await expect(returnLink).toBeVisible()
    await navigate('Profil')
    await expect(page.locator('[data-panel="ProfileSettings"]')).toBeVisible()
    const afterMenu=await returnLink.count()
    const menuLocation=await page.evaluate(()=>({url:location.href,destination:history.state?.soloLedgerHelpDestination}))
    await page.goBack();await expect(page.locator('[data-panel="Momsrapport"]')).toBeVisible()
    await expect(returnLink).toHaveCount(0)
    await page.goForward();await expect(page.locator('[data-panel="ProfileSettings"]')).toBeVisible()
    await expect(returnLink).toHaveCount(0)
    // A new visit must not revive a prior menu entry or an ended visit.
    await navigate('Hjälp & FAQ')
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await expect(returnLink).toBeVisible()
    await page.goBack();await expect(faq).toBeVisible()
    await page.goBack();await expect(page.locator('[data-panel="ProfileSettings"]')).toBeVisible()
    await expect(returnLink).toHaveCount(0)
    await page.goBack();await expect(page.locator('[data-panel="Momsrapport"]')).toBeVisible()
    await expect(returnLink).toHaveCount(0)
    await page.goForward();await expect(page.locator('[data-panel="ProfileSettings"]')).toBeVisible()
    await page.reload();await login()
    const afterReload=await returnLink.count()
    await writeFile(`${out}/return-menu-${width}.json`,JSON.stringify({afterMenu,afterReload,menuLocation},null,2))
    assert.equal(afterMenu,0,'ordinary menu must end FAQ return mode')
    assert.equal(afterReload,0,'reload must not restore FAQ return mode')
    await page.goBack();await expect(returnLink).toHaveCount(0)
    await page.goForward();await expect(returnLink).toHaveCount(0)
    await page.goto('https://kan102.test/?help=skattekonto');await login()
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await expect(returnLink).toBeVisible()
    await navigate('Hjälp & FAQ');await page.goBack()
    await expect(page.locator('[data-panel="Momsrapport"]')).toBeVisible()
    await expect(returnLink).toHaveCount(0)
    await page.goForward();await expect(faq).toBeVisible()
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await page.reload();await login()
    await expect(returnLink).toHaveCount(0)
    await page.goto('https://kan102.test/');await login()
    await expect(returnLink).toHaveCount(0)
    await page.goto('https://kan102.test/?help=skattekonto');await login()
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await call('event','A','TOKEN_REFRESHED');await expect.poll(()=>call('pending').then(p=>p.length)).toBe(1);await call('finish',0)
    await expect(returnLink).toBeVisible()
    await login('B');await expect(returnLink).toHaveCount(0)
    await page.goBack();await expect(returnLink).toHaveCount(0)
    await page.goto('https://kan102.test/?help=skattekonto');await login()
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    await login(null,'SIGNED_OUT');await expect(returnLink).toHaveCount(0)
    await login();await expect(returnLink).toHaveCount(0)
    await page.goto('https://kan102.test/?help=skattekonto');await login()
    // Synthetic auth hash/code must survive internal URL changes, never be copied.
    await page.evaluate(()=>history.replaceState(history.state,'','/?help=skattekonto&code=synthetic-code#access_token=synthetic&type=recovery'))
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value}}}))
    await article('skattekonto').getByRole('button',{name:/Kopiera frågelänk/}).click()
    assert.equal(await page.evaluate(()=>window.copied),'https://kan102.test/?help=skattekonto')
    await article('skattekonto').getByRole('button',{name:'Öppna Moms',exact:true}).click()
    assert.equal(new URL(page.url()).searchParams.get('code'),'synthetic-code')
    assert.equal(new URL(page.url()).hash,'#access_token=synthetic&type=recovery')
    await page.getByRole('button',{name:'Tillbaka till Hjälp & FAQ'}).click()
    await search.fill('helt egen sökning')
    await call('event','A','TOKEN_REFRESHED');await expect.poll(()=>call('pending').then(p=>p.length)).toBe(1);await call('finish',0)
    await expect(search).toHaveValue('helt egen sökning')
    await login('B');await expect(faq).toHaveCount(0)
    assert.equal(new URL(page.url()).searchParams.has('help'),false)
    await navigate('Hjälp & FAQ');await expect(search).toHaveValue('')
    assert.equal(await faq.locator('details[open]').count(),0)
    await search.fill('bilagor');await article('bilagor-arkivering').locator('summary').click()
    await noOverflow();await page.screenshot({path:`${out}/help-${width}.png`,fullPage:true})
    await page.evaluate(()=>document.documentElement.style.fontSize='200%');await noOverflow()
    await page.screenshot({path:`${out}/help-200-${width}.png`,fullPage:true})
    await page.evaluate(()=>document.documentElement.style.fontSize='')
    // Recovery renders before FAQ and preserves the pending question until complete.
    await page.goto('https://kan102.test/?help=ne-r14#type=recovery&access_token=synthetic&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer')
    await login(null,'SIGNED_OUT');await page.evaluate(()=>window.runRecoverySDK())
    await expect.poll(()=>call('pending').then(p=>p.length)).toBe(1);await call('finish',0)
    assert.equal(new URL(page.url()).hash,'')
    assert.equal(new URL(page.url()).searchParams.get('help'),'ne-r14')
    await expect(faq).toHaveCount(0)
    await expect(page.getByRole('button',{name:/Spara.*lösenord/i})).toBeVisible()
    const passwords=page.locator('input[type="password"]');await passwords.nth(0).fill('synthetic-new-password');await passwords.nth(1).fill('synthetic-new-password')
    await page.getByRole('button',{name:/Spara.*lösenord/i}).click()
    await expect(article('ne-r14')).toHaveAttribute('open','')
    // Every guide destination is an existing app tab and only opens a view.
    const destinations=[['kom-igang','Profil','ProfileSettings'],['kom-igang','Kontoplan','Kontoplan'],['kom-igang','Bokföring','TransactionForm'],['kundfakturor','Fakturor','CustomerInvoicesPanel'],['bokslutsskulder','Bokslutsskulder','SupplierYearEndPanel'],['inventarier','Inventarier','FixedAssetsPanel'],['moms-redovisa-betala','Moms','Momsrapport'],['arsavslut','Årsavslut','YearEndGuide'],['ne-r14','NE-Bilaga','NEBilaga']]
    for(const [id,label,panel] of destinations){
      const detail=article(id)
      if(await detail.getAttribute('open')===null)await detail.locator('summary').click()
      await detail.getByRole('button',{name:'Öppna '+label,exact:true}).click()
      await expect(page.locator(`[data-panel="${panel}"]`)).toBeVisible()
      await page.getByRole('button',{name:'Tillbaka till Hjälp & FAQ',exact:true}).click()
      await expect(detail).toHaveAttribute('open','')
      await expect(detail.locator('summary')).toBeFocused()
    }
    // Media is optional, fetched only after expansion, and has text/error fallbacks.
    await page.evaluate(()=>window.showMedia())
    assert.equal(await page.locator('#media img').count(),0)
    await page.getByText('Visa bildstöd',{exact:true}).click();await expect(page.getByText('Mediet kunde inte laddas.',{exact:false})).toBeVisible()
    await page.getByText('Visa film och textversion',{exact:true}).click()
    await expect(page.locator('#media video')).toHaveAttribute('preload','none')
    await expect(page.locator('#media video')).toHaveAttribute('controls','')
    assert.equal(await page.locator('#media video').getAttribute('autoplay'),null)
    await expect(page.locator('#media track')).toHaveAttribute('srclang','sv')
    await expect(page.locator('#media')).toContainText('Samma instruktion i text.')
    assert.deepEqual(await page.evaluate(()=>window.writes),[])
    assert.deepEqual(external,[]);assert.deepEqual(errors,[])
    results.push({width,status:'PASS',deepLinkLogin:true,recoveryPriority:true,history:true,menuEndsHelpVisit:true,reloadEndsHelpReturn:true,directLinkNoReturn:true,search:true,ownerIsolation:true,copyPrivacy:true,noOverflow:true,text200:true,optionalMedia:true,accountingWrites:0})
    await context.close();console.log('PASS KAN-102 browser '+width)
  }
  await writeFile(out+'/result.json',JSON.stringify({status:'PASS',results},null,2))
}finally{await browser.close()}
