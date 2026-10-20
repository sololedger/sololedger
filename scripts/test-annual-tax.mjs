import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const before = process.argv.includes('--before')
const bundle = await build({ entryPoints: ['tests/fixtures/annualTaxHarness.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', plugins: [{ name: 'synthetic-profile-only', setup(b) {
  b.onResolve({ filter: /profileWriteGuard$/ }, () => ({ path: 'guard', namespace: 'test' }))
  b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export async function verifiedProfileRpc(){return window.annualTransport}' }))
  // Explicit before mode composes the existing candidate's actual cards and
  // browser-global 45% state; the production components/services run unchanged.
  if (before) {
    b.onResolve({ filter: /components\/DashboardOverview$/ }, () => ({ path: 'baseline', namespace: 'before' }))
    b.onLoad({ filter: /.*/, namespace: 'before' }, () => ({ loader: 'tsx', resolveDir: resolve('.'), contents: `import OverviewCards from './src/components/OverviewCards';import WithdrawalCard from './src/components/WithdrawalCard';import {calculateDashboard} from './src/lib/calculations';export default function Baseline(p){return <OverviewCards {...p} taxRate={45} data={calculateDashboard(p.balances,45,p.momsBreakdown)} withdrawal={<WithdrawalCard owner={p.owner} refreshKey={p.refreshKey}/>}/>}` }))
  }
} }] })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', r => r.request().url()==='http://kan97.invalid/' ? r.fulfill({contentType:'text/html',body:'<html lang="sv"><div id="root"></div></html>'}) : r.abort())
  await page.goto('http://kan97.invalid/')
  await page.evaluate(() => {
    localStorage.setItem('taxRate','55')
    window.annualCalls = []; window.annualReads = []; window.annualMode = 'success'
    window.annualTransport = { userId: 'synthetic-a', rpc: async (name, args) => {
      window.annualCalls.push({name,args})
      if (name === 'get_withdrawal_context') {
        if (window.annualHold) return new Promise(resolve => window.annualReads.push(resolve))
        return {data: structuredClone(window.annualSeed), error:null}
      }
      if (window.annualMode !== 'success') return {data:null,error:{code:window.annualMode}}
      window.annualSeed.revision = {...window.annualSeed.revision, id:'next-'+window.annualCalls.length, facts:args.p_facts}
      return {data:'revision',error:null}
    } }
  })
  const artifacts=resolve('coverage/kan97-five-cards-'+Date.now());mkdirSync(artifacts,{recursive:true})
  const css=(await postcss([tailwind({base:process.cwd()})]).process(readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
  await page.addStyleTag({content:css})
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await page.getByText('Uppskattat uttagsutrymme',{exact:true}).first().waitFor()
  const year = await page.evaluate(() => window.annualYear)
  const slider = () => page.getByRole('slider', {name:`Uppskattad skatt och egenavgifter för ${year}`})
  const amount = () => page.locator('section[aria-label="Uttagsutrymme"] > div .text-2xl')
  const writes = () => page.evaluate(() => window.annualCalls.filter(c=>c.name==='save_withdrawal_assessment'))
  // First assertion reproduces the current mismatch before any product edit.
  await expect(page.getByText('Sparad: 30 %', {exact:true})).toBeVisible({timeout:1500})
  await expect(slider()).toHaveValue('30')
  if (process.env.KAN97_UX_ARTIFACTS) {
    const css=(await postcss([tailwind({base:process.cwd()})]).process(readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
    await page.addStyleTag({content:css})
    for (const width of [390,1280]) {
      await page.setViewportSize({width,height:1000})
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow')
      const path=resolve(process.env.KAN97_UX_ARTIFACTS,`annual-tax-${width}.png`)
      assert(!existsSync(path),'never overwrite evidence')
      await page.screenshot({path,fullPage:true})
    }
    await page.setViewportSize({width:390,height:1000})
  }
  await expect(amount()).toHaveText(/70\s*000\s*kr/)
  assert.equal((await writes()).length,0)
  await slider().fill('55')
  await expect(page.getByText(/Osparad ändring/)).toBeVisible()
  await expect(page.getByText('Sparad: 30 %', {exact:true})).toBeVisible()
  await expect(amount()).toHaveText(/70\s*000\s*kr/)
  assert.equal((await writes()).length,0,'dragging never writes')
  await page.getByRole('button',{name:`Spara årsprocent för ${year}`,exact:true}).click()
  await expect(page.getByText('Sparad: 55 %', {exact:true})).toBeVisible()
  await expect(amount()).toHaveText(/45\s*000\s*kr/)
  const saved = await writes()
  assert.equal(saved.length,1)
  assert.equal(saved[0].args.p_facts.find(f=>f.key===`rate:${year-1}`).value.rate,25,'other year preserved')
  await page.evaluate(y=>window.annualControls.setYear(y-1),year)
  await expect(page.getByRole('slider')).toHaveValue('25')
  await page.getByRole('slider').fill('40')
  await page.evaluate(y=>window.annualControls.setYear(y),year)
  await expect(slider()).toHaveValue('55')
  assert.equal((await writes()).length,1,'year changes discard draft without writing')
  // Remount is a fresh client read. Old browser-global values cannot participate.
  await page.evaluate(()=>window.annualControls.setMounted(false))
  await expect(page.getByRole('slider')).toHaveCount(0)
  await page.evaluate(()=>window.annualControls.setMounted(true))
  await expect(slider()).toHaveValue('55')
  // Another client wins; failed reload must mask both cards immediately.
  await slider().fill('35')
  await page.evaluate(()=>{window.annualMode='40001';window.annualHold=true})
  await page.getByRole('button',{name:`Spara årsprocent för ${year}`,exact:true}).click()
  await page.waitForFunction(()=>window.annualReads.length===1)
  await expect(amount()).toHaveCount(0)
  await expect(page.getByRole('slider')).toHaveCount(0)
  await page.evaluate(()=>window.annualReads[0]({data:null,error:{code:'503'}}))
  await page.getByText('Uttagsunderlaget kunde inte hämtas',{exact:true}).waitFor()
  await expect(amount()).toHaveCount(0)
  await page.getByRole('button',{name:'Försök igen',exact:true}).click()
  await page.waitForFunction(()=>window.annualReads.length===2)
  await page.evaluate(()=>{
    window.annualSeed.revision.facts.find(f=>f.key===`rate:${window.annualYear}`).value.rate=45
    window.annualReads[1]({data:structuredClone(window.annualSeed),error:null});window.annualHold=false;window.annualMode='success'
  })
  await expect(slider()).toHaveValue('45')
  await expect(amount()).toHaveText(/55\s*000\s*kr/)
  await page.getByText('Underlaget har ändrats. Aktuella uppgifter laddas om;', {exact:false}).waitFor()
  // A normal save failure keeps the confirmed rate and an explicitly unsaved draft.
  await page.evaluate(()=>{window.annualMode='503'})
  await slider().fill('50')
  await page.getByRole('button',{name:`Spara årsprocent för ${year}`,exact:true}).click()
  await page.getByText('Uppgifterna kunde inte sparas. Försök igen.',{exact:true}).waitFor()
  await expect(slider()).toHaveValue('50')
  await expect(page.getByText('Sparad: 45 %',{exact:true})).toBeVisible()
  await expect(amount()).toHaveText(/55\s*000\s*kr/)
  assert.equal(await page.evaluate(()=>window.annualReads.length),2,'temporary failure never starts a conflict reload')
  // Decisions are preserved byte-for-byte when only the annual model rate changes.
  for (const kind of ['preliminary','final']) {
    await page.evaluate(kind=>{window.annualMode='success';window.annualScenario(kind);window.annualControls.refresh()},kind)
    await expect(amount()).toHaveText(kind==='final'?/85\s*000\s*kr/:/65\s*000\s*kr/)
    await expect(slider()).toHaveValue('45')
    const factsBefore = await page.evaluate(()=>structuredClone(window.annualSeed.revision.facts))
    if (kind==='final') await page.getByText(`Slutlig skatt finns för ${year}.`,{exact:false}).waitFor()
    await slider().fill('25')
    await page.getByRole('button',{name:`Spara årsprocent för ${year}`,exact:true}).click()
    await expect(slider()).toHaveValue('25')
    await expect(amount()).toHaveText(/85\s*000\s*kr/)
    assert.deepEqual(await page.evaluate(()=>window.annualSeed.revision.facts.filter(f=>f.key!==`rate:${window.annualYear}`)),factsBefore.filter(f=>f.key!==`rate:${year}`))
    // Reopen the income panel: the shared product UI has no second editable rate.
    await page.getByRole('button',{name:'Visa beräkning och underlag'}).click()
    await page.getByLabel('Vad vill du kontrollera?').selectOption('income')
    await page.getByLabel('Inkomstår',{exact:true}).fill(String(year))
    await expect(page.getByLabel('Uppskattad sammanlagd procent')).toHaveCount(0)
    assert.equal(await page.locator('option[value="rate"]').count(),0)
    await page.getByRole('button',{name:'Stäng underlaget'}).click()
    // Reset only synthetic server rate for the next case, simulating another client.
    await page.evaluate(()=>{window.annualSeed.revision.facts.find(f=>f.key===`rate:${window.annualYear}`).value.rate=45;window.annualControls.refresh()})
    await expect(slider()).toHaveValue('45')
  }
  await page.evaluate(y=>window.annualControls.setYear(y+2),year)
  await expect(page.getByRole('slider')).toBeDisabled()
  await page.evaluate(y=>window.annualControls.setYear(y),year)
  await expect(slider()).toHaveValue('45')
  await page.evaluate(()=>{
    window.annualSeed.revision.facts=window.annualSeed.revision.facts.filter(f=>![`rate:${window.annualYear}`,`income:${window.annualYear}`].includes(f.key))
    window.annualControls.refresh()
  })
  await page.getByText('Standardprocent: 45 % (inte sparad)',{exact:true}).waitFor({timeout:1500})
  await expect(page.getByRole('button',{name:`Spara årsprocent för ${year}`,exact:true})).toBeEnabled()
  await page.getByRole('button',{name:`Spara årsprocent för ${year}`,exact:true}).click()
  await expect(page.getByText('Sparad: 45 %',{exact:true})).toBeVisible()
  // The selector filters report year; withdrawal remains valued as of today.
  const asOf=await page.evaluate(()=>window.annualSeed.as_of)
  await expect(page.locator('section[aria-label="Uttagsutrymme"]')).toContainText(`Per ${asOf}`)
  assert.equal(year,Number(asOf.slice(0,4))-1,'fixture deliberately starts in prior report year')
  await page.evaluate(y=>window.annualControls.setYear(y-1),year)
  await expect(page.locator('section[aria-label="Uttagsutrymme"]')).toContainText(`Per ${asOf}`)
  // Production five-card composition, normal current-year screenshot scenario.
  const layoutYear=await page.evaluate(()=>window.annualLayoutYear)
  const layoutSlider=()=>page.getByRole('slider',{name:`Uppskattad skatt och egenavgifter för ${layoutYear}`})
  await page.evaluate(()=>{window.annualLayoutScenario('positive');window.annualControls.setYear(window.annualLayoutYear);window.annualControls.refresh()})
  await expect(amount()).toHaveText(/6\s*500\s*kr/)
  await expect(layoutSlider()).toHaveValue('35')
  await expect(page.getByRole('combobox',{name:'År',exact:true})).toHaveValue(String(layoutYear))
  await expect(page.locator('section[aria-label="Uttagsutrymme"]')).toContainText(`Per ${asOf} · ${layoutYear}`)
  await expect(page.getByRole('button',{name:`Spara årsprocent för ${layoutYear}`,exact:true})).toHaveCount(0)
  await expect(page.getByRole('group',{name:'Ekonomikontroller'}).getByRole('slider')).toHaveCount(1)
  const grid=page.locator('.grid.grid-cols-2')
  await expect(grid.locator(':scope > *')).toHaveCount(5)
  await expect(grid.locator(':scope > button')).toHaveCount(4)
  await expect(grid.getByRole('slider')).toHaveCount(0)
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:1000})
    const boxes=await grid.locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,width:r.width,height:r.height}}))
    if(width===1280) {
      const controlBoxes=await page.getByRole('group',{name:'Ekonomikontroller'}).locator(':scope > *').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,height:r.height}}))
      assert(controlBoxes.every(b=>Math.abs(b.top-controlBoxes[0].top)<2&&Math.abs(b.height-40)<2),'Production control height/alignment')
    }
    if(width===1280)assert(boxes.every(b=>Math.abs(b.top-boxes[0].top)<2),'all five cards on one desktop row')
    assert(boxes.every(b=>b.height<250),'no oversized standalone card')
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'full dashboard fits viewport')
    await expect(page.locator('section.from-emerald-500')).toHaveCount(1)
    await page.screenshot({path:resolve(artifacts,`overview-positive-${width}.png`),fullPage:true})
    await page.getByRole('button',{name:'Visa beräkning och underlag'}).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').locator('.text-2xl')).toHaveText(/6\s*500\s*kr/)
    await page.getByLabel('Vad vill du kontrollera?').selectOption('buffer')
    await page.getByRole('textbox').fill('0')
    await expect(page.getByRole('button',{name:'Spara kontrollen'})).toBeVisible()
    await page.getByRole('dialog').evaluate(el=>el.scrollTop=0)
    await page.screenshot({path:resolve(artifacts,`overview-modal-${width}.png`),fullPage:true})
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button',{name:'Visa beräkning och underlag'})).toBeFocused()
  }
  // Explicit save and remount use the persisted rate, including at the new location.
  await layoutSlider().fill('40')
  await expect(amount()).toHaveText(/6\s*500\s*kr/)
  await expect(page.getByText(/Osparad ändring/)).toBeVisible()
  await page.screenshot({path:resolve(artifacts,'overview-unsaved-390.png'),fullPage:true})
  await page.evaluate(()=>{window.annualMode='503'})
  await page.getByRole('button',{name:`Spara årsprocent för ${layoutYear}`,exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Uppgifterna kunde inte sparas')
  await expect(page.getByText(/Osparad ändring/)).toBeVisible()
  await expect(page.getByText('Sparad: 35 %',{exact:true})).toBeVisible()
  await expect(amount()).toHaveText(/6\s*500\s*kr/)
  await page.screenshot({path:resolve(artifacts,'overview-save-error-390.png'),fullPage:true})
  await page.evaluate(()=>{window.annualMode='success'})
  await page.getByRole('button',{name:`Spara årsprocent för ${layoutYear}`,exact:true}).click()
  await expect(amount()).toHaveText(/6\s*000\s*kr/)
  await page.evaluate(()=>window.annualControls.setMounted(false))
  await page.evaluate(()=>window.annualControls.setMounted(true))
  await expect(layoutSlider()).toHaveValue('40')
  await expect(amount()).toHaveText(/6\s*000\s*kr/)
  await page.evaluate(()=>{window.annualLayoutScenario('blocked');window.annualControls.refresh()})
  await expect(page.getByText('Kan inte beräknas – kontroll krävs',{exact:true})).toBeVisible()
  await expect(amount()).toHaveCount(0)
  await expect(page.locator('section.from-emerald-500')).toHaveCount(0)
  for(const width of [1280,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:resolve(artifacts,`overview-blocked-${width}.png`),fullPage:true})}
  console.log('PASS five-card layout, top controls, 6500 at saved 35%, blocked neutral, explicit save/remount; screenshots:',artifacts)
  // A delayed response for A must not appear under B.
  await page.evaluate(()=>{window.annualHold=true;window.annualControls.refresh()})
  await page.waitForFunction(()=>window.annualReads.length===3)
  await page.evaluate(()=>{window.annualTransport.userId='synthetic-b';window.annualControls.setOwner('synthetic-b')})
  await page.waitForFunction(()=>window.annualReads.length===4)
  await page.evaluate(()=>window.annualReads[2]({data:structuredClone(window.annualSeed),error:null}))
  await expect(amount()).toHaveCount(0)
  await expect(page.getByRole('slider')).toHaveCount(0)
  await page.evaluate(()=>window.annualReads[3]({data:null,error:{code:'503'}}))
  await expect(amount()).toHaveCount(0)
  assert.deepEqual(errors,[])
  if (!before) {
    const source=readFileSync('src/app/page.tsx','utf8'),auth=readFileSync('src/hooks/useAuth.ts','utf8')
    assert.doesNotMatch(source,/localStorage\.(?:getItem|setItem)\(['"]taxRate/)
    assert.doesNotMatch(auth,/localStorage\..*['"]taxRate/)
    assert.match(source,/ref={setTaxControlTarget}/,'toolbar hosts the existing editor')
    assert.doesNotMatch(source,/type="range"/,'Home contains no independent slider/model')
    const ne=readFileSync('src/components/NEBilaga.tsx','utf8')
    assert.doesNotMatch(ne,/taxRate|DashboardOverview/)
    assert.equal(await page.evaluate(()=>localStorage.getItem('taxRate')),'55','legacy browser rate is neither imported nor written')
    const manifestPath='coverage/kan97-ux-20261020/before-manifest.json'
    if (existsSync(manifestPath)) {
      const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
      for (const file of ['src/components/NEBilaga.tsx','src/hooks/useAccountingData.ts','src/lib/accountingService.ts','src/lib/resultEngine.ts','src/hooks/useWithdrawal.ts','supabase/migrations/20261019200000_kan97_withdrawal_assessments.sql']) {
        assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'),manifest[file],`${file} unchanged: NE, P1 core and DB boundaries preserved`)
      }
    }
  }
  console.log('PASS annual tax: persisted shared rate, explicit save, no read/drag/year writes, history, remount, conflict/failure, other client, owner/late response, NE isolation')
} finally { await browser.close() }
