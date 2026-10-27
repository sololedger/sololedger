// Actual NE + accepted Production UI; frozen synthetic data and no network/DB.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'

const before = execFileSync('git', ['show', 'f7469a0:src/components/NEBilaga.tsx'], { encoding: 'utf8' })
const entry = `import {useState} from 'react';import{createRoot}from'react-dom/client';import NE from './src/components/NEBilaga';import Before from 'before';import{calculateNeBalanceRows}from'./src/lib/neBalance';
window.writes=[];window.visits=[];
const zero=Object.fromEntries(Array.from({length:17},(_,i)=>['R'+(i+1),0]));
function App(){const[s,set]=useState({owner:'a',name:'Syntetiska A',year:2026,scenario:'normal',locked:false,empty:false});window.configure=change=>set(old=>({...old,...change}));
const deviation=s.scenario==='deviation',result=s.scenario==='import-zero'?0:deviation?-5000:1000;
const data=Object.freeze({...zero,IB_kapital:0,insattningar:0,uttag:0,B13_forutbetalda:0,...calculateNeBalanceRows(deviation?{'1930':-3750,'2611':-1250}:s.scenario==='import-zero'?{}:{'1930':1000},result),R1:result,R11:result,R12:result,R17:result,neSalesClassification:{available:true,reviewRequired:false},equityReviewRequired:false});
const props={userId:s.owner,companyName:s.name,selectedYear:s.year,isYearLocked:s.locked,neData:s.empty?null:data,onLockYear:async()=>window.writes.push('lock'),onOpenYearEnd:()=>window.visits.push('yearend')};
return <><main id="current"><NE {...props}/></main><div id="before" hidden><Before {...props}/></div></>};createRoot(document.getElementById('root')).render(<App/>);`
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', plugins: [{ name: 'offline-declaration', setup(b) {
  b.onResolve({ filter: /^before$/ }, () => ({ path: 'before', namespace: 'before' }))
  b.onLoad({ filter: /.*/, namespace: 'before' }, () => ({ contents: before, loader: 'tsx', resolveDir: path.resolve('src/components') }))
  b.onResolve({ filter: /neReviewService$/ }, () => ({ path: 'deny', namespace: 'deny' }))
  b.onLoad({ filter: /.*/, namespace: 'deny' }, () => ({ contents: 'export const getNeReviewData=async()=>{throw Error("synthetic read failure")};export const getNeReviewEntries=async()=>{throw Error("synthetic journal failure")}' }))
} }] })
const css = (await postcss([tailwind({ base: process.cwd() })]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css
const out = 'coverage/kan101-guide'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } }), errors = [], requests = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort() })
    await page.setContent('<html lang="sv"><meta charset="utf-8"><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css }); await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const current = page.locator('#current'), toggle = current.getByText('Från NE-underlag till deklaration · fem steg', { exact: true })
    const guide = () => current.getByRole('region', { name: /Deklarationsvägledning/ })
    const amounts = scope => page.locator(scope+' .grid.grid-cols-1 > div span').evaluateAll(nodes => nodes.filter(n => !n.children.length && /kr$/.test(n.textContent.trim())).map(n => n.textContent))
    for (const scenario of ['normal', 'deviation', 'import-zero']) for (const locked of [false, true]) {
      await page.evaluate(change => window.configure(change), { scenario, locked })
      if (locked) await expect(current.getByText('Räkenskapsår 2026 är låst', { exact: true })).toBeVisible()
      else { await expect(current.getByRole('button', { name: 'Lås räkenskapsår 2026' })).toBeVisible();assert.equal(await current.getByRole('button', { name: 'Lås räkenskapsår 2026' }).isDisabled(),await page.locator('#before button').filter({hasText:'Lås räkenskapsår 2026'}).isDisabled()) }
      await toggle.click()
      const region = guide()
      await expect(region).toContainText('Syntetiska A · Inkomstår 2026')
      await expect(region).toContainText('Här sparas inga svar eller klarmarkeringar och inget skickas in')
      const steps = region.locator(':scope > details')
      await expect(steps).toHaveCount(5)
      for (const step of await steps.all()) { await step.locator(':scope > summary').click();await expect(step).toContainText('Varför?') }
      await expect(region).toContainText('även om ingen varning visas')
      await expect(region).toContainText('I NE-Bilaga kan du spara versioner i deklarationshistoriken.')
      await expect(region).toContainText('Ett bokföringsunderlag kräver låst år och godkända kontroller.')
      await expect(region).toContainText('Egna och faktiskt deklarerade uppgifter kan dokumenteras även utan låst år.')
      await expect(region).not.toContainText('sparar ännu ingen deklarationshistorik')
      await expect(region).toContainText('Ta fram extern resultatrapport och bokslutsverifikationer')
      for (const card of await steps.nth(2).locator('details').all()) await card.locator('summary').click()
      for (const text of ['inte bedömda nollor', 'inte automatiskt samma belopp som förra årets bokföringsförlust', 'F-skatteinbetalningar är inte egenavgiftsavstämning', 'SoloLedger väljer ingen procentsats', 'omprövningsbeslut', 'R40', 'R41', 'R43', 'R24', 'R48', 'Skicka in', 'PDF', 'Ett sparat utkast bevisar inte inlämning']) await expect(region).toContainText(text)
      for (const link of await region.getByRole('link').all()) { assert.equal(new URL(await link.getAttribute('href')).hostname,'www.skatteverket.se');assert.equal(await link.getAttribute('target'),'_blank');assert((await link.getAttribute('rel')).includes('noopener')) }
      await expect(region.locator('input,form,progress,[role=progressbar]')).toHaveCount(0)
      await region.getByRole('button', { name: 'Öppna Årsavslut', exact: true }).click()
      assert.equal((await page.evaluate(() => window.visits)).at(-1),'yearend')
      assert.deepEqual(await amounts('#current'), await amounts('#before'))
      assert((await amounts('#current')).length>10)
      assert(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth))
      if (scenario==='normal'&&!locked) { await steps.nth(2).scrollIntoViewIfNeeded(); await page.screenshot({ path: out+`/tax-details-${width}.png` }) }
      // Collapse before changing a scenario, as native details intentionally retain state within one context.
      for (const detail of (await region.locator('details[open]').all()).reverse()) await detail.locator(':scope > summary').click()
      await toggle.click()
      results.push({ width, scenario, locked, status: 'PASS' })
    }
    await toggle.press('Enter');await expect(guide()).toBeVisible()
    await guide().locator(':scope > details').nth(1).locator(':scope > summary').click()
    await page.screenshot({ path: out+`/import-instruction-${width}.png` })
    for (const change of [{year:2027},{owner:'b',name:'Syntetiska B'},{name:'Nytt namn'}]) {
      await page.evaluate(change => window.configure(change), change)
      await expect(guide()).toHaveCount(0);await toggle.click();await expect(guide().locator('details[open]')).toHaveCount(0)
      if(change.name) await expect(guide()).toContainText(change.name)
    }
    await expect(guide()).toContainText('Deklarationen för 2027 lämnas normalt 2028')
    await page.evaluate(() => window.configure({empty:true}));await expect(toggle).toHaveCount(0)
    await page.evaluate(() => window.configure({empty:false}));await toggle.click();await expect(guide().locator('details[open]')).toHaveCount(0)
    await current.getByText('Kontrollera NE-underlaget · 2027',{exact:true}).click()
    await expect(current.getByRole('alert').filter({hasText:'Underlaget kunde inte kontrolleras'})).toBeVisible()
    assert.deepEqual(await page.evaluate(() => window.writes),[]);assert.deepEqual(requests,[]);assert.deepEqual(errors,[])
    await page.close()
  }
  await writeFile(out+'/result.json',JSON.stringify({status:'PASS',results,scope:'Actual NE with accepted Production comparison; context/keyboard/read-error; no network or writes'},null,2))
  console.log('PASS KAN-101 guide: 18 normal/deviation/import-zero/lock/width cases; identical R/B values and locks, five actionable steps, context reset, keyboard, read failure, zero network/writes/errors')
} finally { await browser.close() }
