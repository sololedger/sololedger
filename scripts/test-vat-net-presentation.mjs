import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'

const entry = `import React,{useState}from'react';import{createRoot}from'react-dom/client';
import Cards from'./src/components/OverviewCards';import{calculateDashboard}from'./src/lib/calculations';
function App(){const[net,setNet]=useState(-12000),[review,setReview]=useState(false),[modal,setModal]=useState(null);
window.setVat=(n,r=false)=>{setNet(n);setReview(r)};
const data=calculateDashboard({},30,{utgaendeMoms:Math.max(net,0),ingaendeMoms:Math.max(-net,0),momsNetto:net,manualReviewRequired:review});
return <><output id="signed">{data.momsNetto}</output><Cards data={data} taxRate={30} selectedYear={2026} transactions={[]} journalMap={{}} activeModal={modal} setActiveModal={setModal}/></>}
createRoot(document.getElementById('root')).render(<App/>);`
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true,
  write: false, platform: 'browser', format: 'iife', jsx: 'automatic' })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', r => r.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }))
  await page.goto('http://127.0.0.1:31044'); await page.addScriptTag({ content: bundle.outputFiles[0].text })
  for (const [net, label] of [[-12000, 'Moms att få tillbaka'], [12000, 'Moms att betala'], [0, 'Moms i balans']]) {
    await page.evaluate(n => window.setVat(n), net)
    const card = page.getByRole('button').filter({ hasText: label })
    await expect(card).toHaveCount(1)
    await expect(card).toContainText(net === 0 ? '0 kr' : /12\s*000 kr/)
    assert(!(await card.innerText()).includes('−'))
    await expect(page.locator('#signed')).toHaveText(String(net))
    await card.click()
    const heading = page.getByText(label, { exact: true }).last()
    await expect(heading).toBeVisible()
    await expect(heading.locator('..')).toContainText(net === 0 ? '0 kr' : /12\s*000 kr/)
    if (net === 0) await expect(heading.locator('..').locator('span').last()).toHaveClass(/text-gray-600/)
    await page.getByRole('button', { name: 'Stäng' }).click()
  }
  await page.evaluate(() => window.setVat(-12000, true))
  await expect(page.getByRole('button').filter({ hasText: 'Kontroll krävs' }).first()).toBeVisible()
  await expect(page.getByRole('button').filter({ hasText: 'Moms att få tillbaka' })).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log('PASS actual VAT card/modal: receivable, payable, neutral zero, review guard and unchanged signed accounting value')
} finally { await browser.close() }
