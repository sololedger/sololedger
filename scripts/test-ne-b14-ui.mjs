/** KAN-69: offline rendering of the real NE component; synthetic data only. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'

const compareHead = process.argv.includes('--compare-head')
const beforeSource = compareHead ? execFileSync('git', ['show', 'HEAD:src/components/NEBilaga.tsx'], { encoding: 'utf8' }) : null
const fixture = `
import {useState} from 'react'
import {createRoot} from 'react-dom/client'
import NEBilaga from './src/components/NEBilaga'
${compareHead ? "import Before from 'kan69-baseline'" : ''}
import {calculateNeBalanceRows} from './src/lib/neBalance'
const zero=Object.fromEntries(Array.from({length:17},(_,i)=>['R'+(i+1),0]))
const cases=[
 {name:'outgoing-vat',balances:{'1930':1250,'2611':-250},result:1000,b14:250,b8:0},
 {name:'net-vat',balances:{'1930':1150,'2611':-250,'2641':100},result:1000,b14:150,b8:0},
 {name:'receivable',balances:{'1930':900,'2641':100},result:1000,b14:0,b8:100},
 {name:'zero',balances:{},result:0,b14:0,b8:0},
]
window.cases=cases
window.writes=[]
function App(){
 const [state,setState]=useState({index:0,locked:false})
 window.configure=(index,locked)=>setState({index,locked})
 const c=cases[state.index]
 const data=Object.freeze({...zero,IB_kapital:0,insattningar:0,uttag:0,bank:c.balances['1930']??0,
   B13_forutbetalda:0,...calculateNeBalanceRows(c.balances,c.result),R1:c.result,R11:c.result,R12:c.result,R17:c.result})
 window.currentData=data
 const props={neData:data,selectedYear:2026,isYearLocked:state.locked,onLockYear:async()=>{window.writes.push('lock');throw Error('Unexpected year lock')}}
 return <><main id="current"><NEBilaga key={c.name+state.locked} {...props}/></main>
 ${compareHead ? '<div id="baseline" hidden><Before key={c.name+state.locked} {...props}/></div>' : ''}</>
}
createRoot(document.getElementById('root')).render(<App/> )
`
const bundle = await build({
 stdin:{contents:fixture,resolveDir:process.cwd(),loader:'tsx'},
 tsconfig:'tsconfig.json',bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
 define:{'process.env.NODE_ENV':'"production"'},
 plugins:compareHead?[{name:'head-before-presentation',setup(b){
  b.onResolve({filter:/^kan69-baseline$/},()=>({path:'before',namespace:'baseline'}))
  b.onLoad({filter:/.*/,namespace:'baseline'},()=>({contents:beforeSource,loader:'tsx',resolveDir:path.resolve('src/components')}))
 }}]:[],
})
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";',
 '@import "tailwindcss" source(none);\n@source "./src/components/NEBilaga.tsx";')
const css=await postcss([tailwindcss()]).process(styles,{from:path.resolve('kan69-test.css')})
await mkdir('test-results/kan69-b14',{recursive:true})
const browser=await chromium.launch({headless:true})
try {
 for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1100}})
  const requests=[],errors=[]
  await page.route('**/*',r=>{requests.push(r.request().url());return r.abort()})
  page.on('pageerror',e=>errors.push(e.message))
  await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
  await page.addStyleTag({content:css.css})
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  const current=page.locator('#current')
  const amounts=scope=>page.locator(scope+' span').evaluateAll(nodes=>nodes.filter(n=>!n.children.length&&/kr$/.test(n.textContent.trim())).map(n=>n.textContent))
  for(let index=0;index<4;index++)for(const locked of [false,true]){
   await page.evaluate(({index,locked})=>window.configure(index,locked),{index,locked})
   // Wait for React's update, including year-lock state.
   if(locked)await expect(current.getByText('Räkenskapsår 2026 är låst',{exact:true})).toBeVisible()
   else await expect(current.getByRole('button',{name:'Lås räkenskapsår 2026'})).toBeVisible()
   const expectedCase=await page.evaluate(i=>window.cases[i],index)
   assert(expectedCase)
   assert.equal(await page.evaluate(()=>window.currentData.B14),expectedCase.b14)
   assert.equal(await page.evaluate(()=>window.currentData.B8),expectedCase.b8)
   if(expectedCase.b14===0){
    await expect(current.getByText(/^B14 visar/)).toHaveCount(0)
    await current.getByRole('button',{name:'+ Visa alla deklarationsrutor',exact:true}).last().click()
    if(compareHead)await page.locator('#baseline button').filter({hasText:'+ Visa alla deklarationsrutor'}).last().evaluate(e=>e.click())
   }
   const help=current.getByText(/^B14 visar/)
   await expect(help).toBeVisible()
   await expect(help).toContainText('Utgående moms är moms på din försäljning som ska redovisas till Skatteverket och kan därför ingå här.')
   await expect(help).toContainText('Momsen är inte en försäljningsintäkt.')
   await expect(help).toContainText('En bokförd momsfordran visas i B8 Övriga fordringar.')
   const row=help.locator('..')
   await expect(row.locator('span.whitespace-nowrap')).toHaveText(expectedCase.b14.toLocaleString('sv-SE')+' kr')
   await expect(current.getByText('✓ Balansräkningen balanserar',{exact:true})).toBeVisible()
   if(compareHead)assert.deepEqual(await amounts('#current'),await amounts('#baseline'),'All displayed NE amounts match HEAD')
   const rect=await help.boundingBox()
   assert(rect&&rect.x>=0&&rect.x+rect.width<=width,`Help fits ${width}px`)
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'No horizontal page overflow')
   if(index===0&&!locked)await page.screenshot({path:'test-results/kan69-b14/'+width+'.png',fullPage:true})
   if(expectedCase.b14===0){
    await current.getByRole('button',{name:'− Dölj tomma deklarationsrutor',exact:true}).last().click()
    await expect(help).toHaveCount(0)
   }
  }
  assert.deepEqual(await page.evaluate(()=>window.writes),[])
  assert.deepEqual(requests,[],'No network/data access')
  assert.deepEqual(errors,[])
  console.log('PASS KAN-69 '+width+'px: VAT 250/net 150/receivable/zero, locked/unlocked, help, amounts, row toggle, no overflow or writes'+(compareHead?', all displayed amounts identical to HEAD':''))
  await page.close()
 }
}finally{await browser.close()}