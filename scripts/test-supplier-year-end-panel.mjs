import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import {readFileSync,mkdirSync} from 'node:fs'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import path from 'node:path'

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Panel from './src/components/SupplierYearEndPanel';
const root=createRoot(document.getElementById('root'));let seq=0;
window.mount=(owner,year=2026,locked=false)=>root.render(<Panel key={++seq} owner={owner} selectedYear={year} isYearLocked={locked}
onUploadAttachment={async()=>owner+'/bill.pdf'} onBookkeepingChanged={async()=>{}}/>);`
const mock=`export const supplierExpenseChoices=[['6110','Kontorsmaterial']];export class SupplierRejectedError extends Error{};export async function openSupplierAttachment(){}
export async function getSupplierYearEndInvoices(year,owner){if(window.fx.readError)throw Error('read');return window.fx.rows.filter(r=>r.user_id===owner&&r.fiscal_year<=year)}
export async function submitSupplierCommand(owner,command){window.fx.calls.push({owner,command});
if(window.fx.reject)throw new SupplierRejectedError('Underlaget är ofullständigt. Ingen journal skapades.');
if(command.action==='book'&&!window.fx.rows.length)window.fx.rows.push({id:'invoice',user_id:owner,supplier_name:command.supplier_name,invoice_number:command.invoice_number,fiscal_year:2026,gross_amount:1250,invoice_vat:250,deductible_vat:0,status:'booked'});
if(window.fx.lose){window.fx.lose=false;throw Error('Svaret tappades. Återuppta samma försök.')}
return{success:true,invoice_id:'invoice',transaction_id:'tx',ver_nr:1,idempotent_replay:window.fx.calls.length>1}}`
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{
  name:'local-supplier-transport',setup(b){b.onResolve({filter:/\/supplierYearEnd$/},()=>({path:'supplier',namespace:'synthetic'}));
    b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:mock}))}}]})
const css=await postcss([tailwindcss()]).process(readFileSync('src/app/globals.css','utf8').replace('@import "tailwindcss";',
  '@import "tailwindcss" source(none);\n@source "./src/components/SupplierYearEndPanel.tsx";\n@source "./src/components/SwedishDateInput.tsx";'),{from:path.resolve('supplier-test.css')})
const dir='test-results/kan98-'+Date.now();mkdirSync(dir,{recursive:true})
const browser=await chromium.launch({headless:true})
let checks=0
try{
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:1000}}),errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/*',r=>r.fulfill({status:200,contentType:'text/html',body:'<html lang="sv"><body><div id="root"></div></body></html>'}))
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
    await page.screenshot({path:dir+`/booked-${width}.png`,fullPage:true})
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.evaluate(o=>window.mount(o),other)
    await expect(page.getByText(/0 registrerade obetalda/)).toBeVisible()
    await expect(page.getByText(/Svensk testleverantör ·/)).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Återuppta samma försök'})).toHaveCount(0)
    await page.evaluate(o=>{window.fx.readError=true;window.mount(o,2027)},owner)
    await expect(page.getByRole('alert')).toContainText('Inga tidigare belopp visas')
    await expect(page.getByText(/Svensk testleverantör ·/)).toHaveCount(0)
    await page.evaluate(o=>{window.fx.readError=false;window.mount(o,2026,true)},owner)
    await expect(page.getByRole('button',{name:'Registrera och bokför bokslutsskulden',exact:true})).toBeDisabled()
    await expect(page.getByRole('button',{name:'Bokför betalning av denna skuld'})).toBeEnabled()
    assert.deepEqual(errors,[]);checks+=8;await page.close()
  }
  console.log(`PASS supplier actual React/Playwright: ${checks} checks, desktop/mobile, persistent exact retry, owner/year isolation, read errors, locked original year; ${dir}`)
}finally{await browser.close()}
