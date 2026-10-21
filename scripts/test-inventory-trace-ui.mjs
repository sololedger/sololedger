import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,expect} from '@playwright/test'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
const fixture=`import React from 'react';import {createRoot} from 'react-dom/client';import Table from './src/components/TransactionTable';
 const link={assetName:'Kameradel',amount:10000,eventDate:'2026-03-01',originalVerNr:1,reclassificationVerNr:2};
 const transactions=[{id:'a',user_id:'u',date:'2026-01-01',description:'Ursprungligt inköp',amount:12500,booked:true,source:'fixed_asset',fixed_asset_trace:{reclassifiedBy:[link]}},
 {id:'b',user_id:'u',date:'2026-03-01',description:'Separat omklassning',amount:10000,booked:true,source:'fixed_asset_reclassification',fixed_asset_trace:{reclassifies:[link]}}];
 const journalMap={a:[{ver_nr:1,account_number:'5410',debit:10000,credit:0},{ver_nr:1,account_number:'2641',debit:2500,credit:0},{ver_nr:1,account_number:'1930',debit:0,credit:12500}],
 b:[{ver_nr:2,account_number:'1220',debit:10000,credit:0},{ver_nr:2,account_number:'5410',debit:0,credit:10000}]};
 const original=JSON.stringify({transactions,journalMap});window.noMutation=()=>JSON.stringify({transactions,journalMap})===original;
 createRoot(document.getElementById('root')).render(<Table transactions={transactions} journalMap={journalMap} selectedYear={2026} kontoplan={[]} isYearLocked={false} editingId={null} onEdit={()=>{throw Error('Unsupported edit')}} onDelete={()=>{throw Error('Unsupported correction')}} onFavorite={()=>{}}/>);`
const bundle=await build({stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',
 plugins:[{name:'offline-only',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'offline',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={}' }))}}]})
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";',
 '@import "tailwindcss" source(none);\n@source "./src/components/TransactionTable.tsx";')
const css=await postcss([tailwindcss()]).process(styles,{from:path.resolve('inventory-trace-ui.css')})
const browser=await chromium.launch({headless:true})
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort())
  await page.setContent('<html><head></head><body><div id="root"></div></body></html>');await page.addStyleTag({content:css.css})
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  await expect(page.getByText(/Ursprunglig kontering är oförändrad/).filter({visible:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Visa VER-1',exact:true}).filter({visible:true})).toBeVisible()
  await page.getByRole('button',{name:'Visa VER-1',exact:true}).filter({visible:true}).click()
  await expect(page.getByRole('button',{name:'Visa VER-2',exact:true}).filter({visible:true})).toBeVisible()
  await page.getByRole('button',{name:'Visa VER-2',exact:true}).filter({visible:true}).click()
  await expect(page.getByRole('button',{name:/Korrigera|Redigera/}).filter({visible:true})).toHaveCount(0)
  assert.equal(await page.evaluate(()=>window.noMutation()),true);assert.deepEqual(errors,[])
  await page.close()
 }
 console.log('PASS actual KAN-65 desktop/mobile: two-way verification links, immutable originals, no generic correction')
} finally {await browser.close()}
