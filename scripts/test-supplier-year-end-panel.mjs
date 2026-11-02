import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import path from 'node:path'

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Panel from './src/components/SupplierYearEndPanel';
const root=createRoot(document.getElementById('root'));let seq=0;
window.mount=(owner,year=2026,locked=false)=>root.render(<main className="mx-auto w-full max-w-7xl p-4 md:p-8"><Panel key={++seq} owner={owner} selectedYear={year} isYearLocked={locked}
onUploadAttachment={async()=>owner+'/bill.pdf'} onBookkeepingChanged={async()=>{}}/></main>);`
const mock=`export const supplierExpenseChoices=[['6110','Kontorsmaterial']];export class SupplierRejectedError extends Error{};export async function openSupplierAttachment(){}
export async function getSupplierYearEndInvoices(year,owner){if(window.fx.readError)throw Error('read');return window.fx.rows.filter(r=>r.user_id===owner&&r.fiscal_year<=year)}
export async function submitSupplierCommand(owner,command){window.fx.calls.push({owner,command});
if(window.fx.reject)throw new SupplierRejectedError('Underlaget är ofullständigt. Ingen journal skapades.');
if(command.action==='book'&&!window.fx.rows.length)window.fx.rows.push({id:'invoice',user_id:owner,supplier_name:command.supplier_name,invoice_number:command.invoice_number,fiscal_year:2026,gross_amount:1250,invoice_vat:250,deductible_vat:0,status:'booked'});
if(window.fx.lose){window.fx.lose=false;throw Error('Svaret tappades. Återuppta samma försök.')}
return{success:true,invoice_id:'invoice',transaction_id:'tx',ver_nr:1,idempotent_replay:window.fx.calls.length>1}}`
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{
  name:'local-supplier-transport',setup(b){b.onResolve({filter:/\/supplierYearEnd$/},()=>({path:'supplier',namespace:'synthetic'}));
    b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:mock}));
    b.onResolve({filter:/supabaseClient$/},()=>({path:'history',namespace:'offline-history'}));
    b.onLoad({filter:/.*/,namespace:'offline-history'},()=>({contents:`export const supabase={from(){throw Error('History must stay lazy in the supplier lifecycle fixture')}}`}))}}]})
const css=await postcss([tailwindcss()]).process(readFileSync('src/app/globals.css','utf8').replace('@import "tailwindcss";',
  '@import "tailwindcss" source(none);\n@source "./src/components/SupplierYearEndPanel.tsx";\n@source "./src/components/SwedishDateInput.tsx";\n@source "./src/components/Layout.tsx";'),{from:path.resolve('supplier-test.css')})
const dir='test-results/kan116-'+Date.now();mkdirSync(dir,{recursive:true})
const browser=await chromium.launch({headless:true})
let checks=0
const layouts=[]
try{
  for(const width of [1440,1024,768,390,320]){
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],external=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/*',r=>{if(r.request().url()!=='https://supplier.test/'){external.push(r.request().url());return r.abort()}return r.fulfill({status:200,contentType:'text/html',body:'<html lang="sv"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div></body></html>'})})
    await page.goto('https://supplier.test');await page.addStyleTag({content:css.css})
    await page.evaluate(()=>{window.fx={calls:[],rows:[],lose:true,readError:false}})
    await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(o=>window.mount(o),owner)
    await expect(page.getByText(/0 registrerade obetalda/)).toBeVisible()
    await page.getByLabel('Leverantörens namn',{exact:true}).fill('Svensk testleverantör')
    await page.getByLabel(/organisations- eller personnummer/).fill('5560000000')
    await page.getByLabel('Fakturanummer',{exact:true}).fill('DEC-2026')
    await page.getByLabel('Fakturadatum',{exact:true}).fill('2026-12-20')
    await page.getByLabel('Datum du fick fakturan',{exact:true}).fill('2026-12-21')
    await page.getByLabel('Vad gäller inköpet?').selectOption('6110')
    await page.getByLabel(/Hela fakturabeloppet/).fill('1250')
    await page.getByLabel('Fakturans svenska momssats').selectOption('25')
    await page.getByLabel(/Momsbelopp som faktiskt/).fill('250')
    await page.getByLabel('Rätt att dra av denna moms').selectOption('none')
    await page.getByLabel('Fakturabilaga').setInputFiles({name:'bill.pdf',mimeType:'application/pdf',buffer:Buffer.from('synthetic')})
    await page.getByRole('checkbox').check()
    await page.getByRole('button',{name:'Registrera och bokför bokslutsskulden',exact:true}).click()
    await expect(page.getByRole('button',{name:'Återuppta samma försök'})).toBeVisible()
    assert.equal(await page.evaluate(()=>window.fx.calls.length),1)
    const sent=await page.evaluate(()=>window.fx.calls[0].command)
    assert.equal(sent.gross_amount,1250);assert.equal(sent.deduction,'none');assert.equal(sent.expense_account,'6110')
    await page.screenshot({path:dir+`/pending-${width}.png`,fullPage:true})
    await page.evaluate(o=>window.mount(o),owner)
    await page.getByRole('button',{name:'Återuppta samma försök'}).click()
    await expect(page.getByRole('status')).toContainText('VER-1')
    assert.deepEqual(await page.evaluate(()=>window.fx.calls[1].command),sent)
    await expect(page.getByText(/1 registrerade obetalda/)).toBeVisible()
    // Layout cases retain actual components/controls and the existing synthetic transport.
    await page.evaluate(o=>{
      window.fx.rows[0].supplier_name='Syntetisk leverantör '+ 'LångtNamn'.repeat(18)
      window.fx.rows[0].invoice_number='F'.repeat(80)
      const original=window.fx.rows[0]
      window.fx.rows.push({...original,id:'paid',supplier_name:'Syntetisk betald skuld',invoice_number:'PAID',status:'paid'},
        {...original,id:'cancelled',supplier_name:'Syntetisk rättad skuld',invoice_number:'CANCELLED',status:'cancelled'})
      window.mount(o)
    },owner)
    await expect(page.getByText(/1 registrerade obetalda/)).toBeVisible()
    const panel=page.getByRole('region',{name:'Bokslutsskulder',exact:true})
    const list=page.getByRole('region',{name:'Registrerade bokslutsskulder',exact:true})
    await expect(list.locator('article')).toHaveCount(3)
    const first=page.getByLabel('Leverantörens namn',{exact:true}),second=page.getByLabel(/organisations- eller personnummer/)
    await first.focus();await page.keyboard.press('Tab');await expect(second).toBeFocused()
    await expect(second).toHaveCSS('outline-width','2px')
    const nameRect=await first.boundingBox(),identityRect=await second.boundingBox()
    if(width>=768){assert(Math.abs(nameRect.y-identityRect.y)<25);assert(identityRect.x>nameRect.x+nameRect.width)}
    else assert(identityRect.y>nameRect.y+nameRect.height)
    const pageWidth=await panel.evaluate(el=>el.getBoundingClientRect().width)
    const availableWidth=await page.locator('main').evaluate(el=>el.clientWidth-parseFloat(getComputedStyle(el).paddingLeft)-parseFloat(getComputedStyle(el).paddingRight))
    assert(Math.abs(pageWidth-availableWidth)<2,'Panel must use the available main content width')
    if(width>=1024)assert(pageWidth>768,'Desktop must not retain the old max-w-3xl cap')
    for(const summary of await page.getByText('Rätta en felbokning',{exact:true}).all())await summary.click()
    const clipped=await panel.locator('input:not([type="hidden"]),select,button').evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length&&getComputedStyle(el).opacity!=='0').filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(el=>el.getAttribute('name')||el.textContent))
    assert.deepEqual(clipped,[],'Visible controls must fit the viewport')
    const intro=panel.locator(':scope>header')
    const actionInfo=intro.getByRole('region',{name:'Vad ska jag göra?',exact:true}),importantInfo=intro.getByRole('region',{name:'Viktigt att känna till',exact:true})
    await expect(actionInfo.getByRole('heading',{name:'Vad ska jag göra?',exact:true})).toBeVisible()
    await expect(importantInfo.getByRole('heading',{name:'Viktigt att känna till',exact:true})).toBeVisible()
    const actionRect=await actionInfo.boundingBox(),importantRect=await importantInfo.boundingBox()
    if(width>=1024){assert(Math.abs(actionRect.y-importantRect.y)<2);assert(importantRect.x>actionRect.x+actionRect.width);assert(Math.abs(actionRect.width-importantRect.width)<2)}
    else assert(importantRect.y>=actionRect.y+actionRect.height)
    for(const group of [actionInfo,importantInfo])assert(await group.evaluate(el=>el.clientWidth<=parseFloat(getComputedStyle(el).fontSize)*66),'Help text keeps a readable measure')
    assert.deepEqual(await intro.locator('p').allTextContents(),[
      'Öppna fakturorna och jämför med bankens betalningar till och med 31 december. Ta bara med helt obetalda svenska kostnadsfakturor i SEK som hör till året. Du bekräftar själv att alla underlag finns med; SoloLedger kan inte hitta saknade fakturor.',
      'Först bokas kostnad, eventuell avdragsgill moms och skuld den 31 december. När betalningen kommer nästa år öppnar du samma skuld här. Bokför inte betalningen som en ny vanlig kostnad.',
      'Delbetalningar, kreditfakturor, utlandsinköp, inventarier, lager, förskott och osäker eller delvis avdragsgill moms stöds inte här. Stanna och kontrollera underlaget; ingen automatisk alternativ bokning görs.'
    ],'All original instructions and warnings remain verbatim and in order')
    await expect(importantInfo.locator('strong')).toHaveText('Bokför inte betalningen som en ny vanlig kostnad.')
    await intro.screenshot({path:dir+`/intro-${width}.png`})
    const registration=page.locator('details').filter({has:page.getByText('Registrera och bokför en obetald faktura för 2026',{exact:true})})
    const order=await panel.evaluate(el=>[...el.children].map(n=>n.tagName))
    assert.deepEqual(order,['HEADER','SECTION','DETAILS'],'Keep introduction, existing debts and registration in order')
    await expect(registration.getByRole('heading',{name:'Leverantör och faktura'})).toBeVisible()
    await expect(registration.getByRole('heading',{name:'Belopp och moms'})).toBeVisible()
    await expect(registration.getByRole('heading',{name:'Underlag och bekräftelse'})).toBeVisible()
    assert.equal(await page.evaluate(()=>window.fx.calls.length),2,'Layout interactions must not submit commands')
    await page.evaluate(()=>scrollTo(0,0))
    await page.screenshot({path:dir+`/booked-${width}.png`,fullPage:true})
    await registration.screenshot({path:dir+`/form-${width}.png`})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.evaluate(o=>window.mount(o),other)
    await expect(page.getByText(/0 registrerade obetalda/)).toBeVisible()
    await expect(page.getByRole('region',{name:'Registrerade bokslutsskulder',exact:true}).locator('article')).toHaveCount(0)
    await expect(page.getByText(/Svensk testleverantör ·/)).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Återuppta samma försök'})).toHaveCount(0)
    await page.evaluate(o=>{window.fx.readError=true;window.mount(o,2027)},owner)
    await expect(page.getByRole('alert')).toContainText('Inga tidigare belopp visas')
    await expect(page.getByText(/Svensk testleverantör ·/)).toHaveCount(0)
    await page.evaluate(o=>{window.fx.readError=false;window.mount(o,2026,true)},owner)
    await expect(page.getByRole('button',{name:'Registrera och bokför bokslutsskulden',exact:true})).toBeDisabled()
    await expect(page.getByRole('button',{name:'Bokför betalning av denna skuld'})).toBeEnabled()
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks+=8;layouts.push({width,status:'PASS',fullWidth:true,responsiveFields:true,noClippedControls:true,noHorizontalOverflow:true,keyboard:true,bookedPaidCorrected:true,noExtraCommands:true});await page.close()
  }
  writeFileSync(dir+'/result.json',JSON.stringify({status:'PASS',checks,layouts,syntheticOnly:true},null,2))
  console.log(`PASS supplier actual React/Playwright: ${checks} checks, desktop/mobile, persistent exact retry, owner/year isolation, read errors, locked original year; ${dir}`)
}finally{await browser.close()}
