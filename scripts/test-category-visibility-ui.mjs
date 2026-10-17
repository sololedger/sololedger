import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const bundle=await build({entryPoints:['tests/fixtures/kan89-category-visibility.tsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',plugins:[{name:'offline-transport',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'offline',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase={auth:{getUser:(...a)=>window.__kan89Db.auth.getUser(...a)},from:(...a)=>window.__kan89Db.from(...a)}'}))}}]})
const css=(await postcss([tailwind({base:process.cwd()})]).process(await readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
const browser=await chromium.launch({headless:true})
await mkdir('test-results/kan89',{recursive:true})
try{for(const [label,width] of [['desktop',1280],['mobile',390]]){
 const page=await browser.newPage({viewport:{width,height:1000}})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 // Prevent every external request: no Supabase/environment credentials or live writes.
 await page.route('**/*',route=>route.abort())
 await page.setContent('<style>'+css+'</style><div id="root"></div>')
 await page.addScriptTag({content:bundle.outputFiles[0].text})
 const visible=(name)=>page.getByRole('button',{name,exact:true}).filter({visible:true})
 await visible('Dölj vid ny bokföring: Programvaror').waitFor()
 const category=page.getByRole('combobox',{name:'Kategori',exact:true})
 await category.selectOption('programvaror')
 await visible('Dölj vid ny bokföring: Programvaror').click()
 await visible('Visa igen: Programvaror').waitFor()
 assert.equal(await category.locator('option[value="programvaror"]:not([disabled])').count(),0)
 assert.equal(await page.getByRole('button',{name:/Sparad favorit/}).isDisabled(),true)
 assert.match(await page.locator('body').innerText(),/Kategorin är dold/)
 await page.evaluate(()=>document.querySelector('form:has(select[aria-label="Kategori"])').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 assert.equal(await page.evaluate(()=>window.kan89.submits),0,'stale/hidden form state cannot submit')
 await visible('Visa igen: Programvaror').click()
 await category.locator('option[value="programvaror"]:not([disabled])').waitFor({state:'attached'})
 await page.getByRole('button',{name:/Sparad favorit/}).click()
 assert.equal(await category.inputValue(),'programvaror')
 await page.evaluate(()=>window.kan89.select('not-my-account'))
 await page.getByRole('alert').filter({hasText:'finns inte'}).waitFor()
 await page.evaluate(()=>window.kan89.setReady(false))
 await page.getByRole('alert').filter({hasText:'inte färdigladdad'}).waitFor()
 assert.equal(await category.isDisabled(),true)
 await page.evaluate(()=>window.kan89.setReady(true))
 for(const name of ['Egen kategori','Äldre insättning']){
  await visible('Dölj vid ny bokföring: '+name).click()
  await visible('Visa igen: '+name).click()
 }
 await visible('Dölj vid ny bokföring: Programvaror').click()
 await page.evaluate(()=>{window.kan89.select('programvaror');window.kan89.edit(true)})
 await page.getByRole('button',{name:'Spara bilaga',exact:true}).click()
 assert.equal(await page.evaluate(()=>window.kan89.submits),1,'historical attachment edit remains possible')
 await visible('Avbryt').click()
 assert.equal(await category.inputValue(),'','cancelled historical category not retained')
 await page.evaluate(()=>window.kan89.failUpdate(true))
 await visible('Visa igen: Programvaror').click()
 await page.getByRole('alert').filter({hasText:'kunde inte sparas'}).waitFor()
 assert.equal(await visible('Visa igen: Programvaror').count(),1,'failed save does not claim success')
 await page.screenshot({path:'test-results/kan89/'+label+'.png',fullPage:true})
 assert.deepEqual(errors,[])
 await page.close();console.log('PASS KAN-89 '+label+': hide/restore, own/legacy, favorites, stale/unknown/loading, history edit, save failure')
}}finally{await browser.close()}
const source=await readFile('src/app/page.tsx','utf8')
assert.match(source,/newBookingCategoryError\(kontoplan, formData.type/)
assert.match(source,/file: null, type: '', vatRate: 0/)
await writeFile('test-results/kan89/ui-result.json',JSON.stringify({result:'PASS',viewports:[1280,390],transport:'synthetic offline; actual components'},null,2))
