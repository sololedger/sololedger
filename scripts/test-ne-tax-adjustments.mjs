/** KAN-91: real engine, report service, SIE parser and consumers; offline only. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { calculateBusinessResult } from '../src/lib/resultEngine.ts'
import { calculateDashboard } from '../src/lib/calculations.ts'
import { parseSieFile } from '../src/lib/sieParser.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const before = { exports: {} }
const oldEngine = execFileSync('git', ['show', '688cc57d:src/lib/resultEngine.ts'], { encoding: 'utf8' })
const oldBundle = await build({ stdin: { contents: oldEngine, loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'cjs' })
new Function('module', 'exports', oldBundle.outputFiles[0].text)(before, before.exports)
// Existing numeric classification is unchanged for every other BAS account/sign.
for (let n = 1000; n < 9000; n++) for (const sign of [-1, 1]) {
  if ([6072, 6982, 8314].includes(n)) continue
  const balances = { [n]: sign * 123.45 }
  const { skattefriaIntakter, taxReviews, ...actual } = calculateBusinessResult(balances)
  assert.deepEqual(actual, before.exports.calculateBusinessResult(balances), `Preserve ${n}/${sign}`)
  assert.equal(skattefriaIntakter, 0)
  assert(Array.isArray(taxReviews))
}
const cases = [
  { name: 'representation', annual: { '6072': 1000, '1930': -1000 }, R13: 1000, R14: 0, R17: 0 },
  { name: 'membership', annual: { '6982': 1000, '1930': -1000 }, R13: 1000, R14: 0, R17: 0 },
  { name: 'exempt-interest', annual: { '8314': -1000, '1930': 1000 }, R13: 0, R14: 1000, R17: 0 },
  { name: '6992-preserved', annual: { '6992': 1000, '1930': -1000 }, R13: 1000, R14: 0, R17: 0 },
  { name: 'credit-reversal', annual: { '6072': -400, '6982': -200, '6992': -100, '8314': 50, '1930': 650 }, R13: -700, R14: -50, R17: 0 },
  { name: 'mixed-explicit', annual: { '3010': -5000, '6071': 100, '6072': 200, '6981': 300, '6982': 400, '6992': 50, '8311': -80, '8314': -70, '1930': 4100 }, R13: 650, R14: 70, R17: 4680, r2: 500 },
  { name: 'partial-correction', annual: { '6072': 600, '8314': -40, '1930': -560 }, R13: 600, R14: 40, R17: 0 },
  { name: 'fully-corrected', annual: { '6072': 0, '6982': 0, '8314': 0, '7632': 0 }, R13: 0, R14: 0, R17: 0 },
  { name: 'personnel', annual: { '7632': 1000, '1930': 1000, '2010': -2000 }, R13: 0, R14: 0, R17: -1000, review: ['7632'] },
  { name: 'personnel-opposite', annual: { '7632': -1000, '1930': 1000 }, R13: 0, R14: 0, R17: 1000, review: ['7632'] },
  { name: 'offsetting-personnel', annual: { '7010': 100, '7510': -100 }, R13: 0, R14: 0, R17: 0, review: ['7010','7510'] },
  { name: 'mixed-unknown', annual: { '6070': 200, '6980': 300, '1930': -500 }, R13: 0, R14: 0, R17: -500, review: ['6070','6980'] },
  { name: 'year-crossing', year: 2027, annual: { '6072': -1000, '1930': 1000 }, cumulative: {}, R13: -1000, R14: 0, R17: 0 },
  { name: 'previous-year-only', year: 2027, annual: {}, cumulative: { '6072': 1000, '1930': -1000 }, R13: 0, R14: 0, R17: 0 },
  { name: 'carried-personnel-liability', year: 2027, annual: {}, cumulative: { '1930': 1000, '2710': -1000 }, R13: 0, R14: 0, R17: 0, balanceReview: ['2710'] },
  { name: 'legacy-read-fallback', annual: { '8314': -1000, '1930': 1000 }, missing: true, R13: 0, R14: 1000, R17: 0 },
]
for (const account of ['7000','7100','7200','7300','7400','7500','7600','7631','7699','1382','1610','2710','2731','2790','2821','2910','2920','2930','2940','2950']) {
  const r = calculateBusinessResult({ [account]: 100 })
  assert.equal(r.ejAvdragsgillt, 0)
  assert.equal(r.taxReviews[0].accountNumber, account)
}
assert.equal(calculateBusinessResult({ '6810': 100 }).taxReviews.length, 0, 'Hired external services are not employee payroll')

// Actual SIE parser, original + correction in different years; no import write.
const sie = parseSieFile(`#FLAGGA 0\n#SIETYP 4\n#RAR 0 20260101 20261231\n#KONTO 6072 "Representation"\n#KONTO 1930 "Bank"\n#VER A 1 20261001 "Original"\n{\n#TRANS 6072 {} 1000\n#TRANS 1930 {} -1000\n}\n#VER A 2 20261002 "Rattelse"\n{\n#TRANS 6072 {} -400\n#TRANS 1930 {} 400\n}\n`)
assert.deepEqual(sie.errors, [])
const imported = {}
for (const ver of sie.verifications) for (const row of ver.transactions) imported[row.accountNumber] = (imported[row.accountNumber] ?? 0) + row.amount
cases.push({ name: 'sie-import-correction', annual: imported, R13: 600, R14: 0, R17: 0 })
const mixedSie = parseSieFile(`#FLAGGA 0\n#SIETYP 4\n#RAR 0 20260101 20261231\n#VER A 1 20261001 "Importerade underkonton"\n{\n#TRANS 6982 {} 300\n#TRANS 8314 {} -50\n#TRANS 7632 {} 100\n#TRANS 1930 {} -350\n}\n`)
assert.deepEqual(mixedSie.errors, [])
const mixedImported = Object.fromEntries(mixedSie.verifications[0].transactions.map(row => [row.accountNumber, row.amount]))
cases.push({ name: 'sie-explicit-and-personnel', annual: mixedImported, R13: 300, R14: 50, R17: -100, review: ['7632'] })
const bundle = await build({
  stdin: { contents: "export {getNEData} from './src/lib/accountingService'; export {default as NEBilaga} from './src/components/NEBilaga'; export {default as OverviewCards} from './src/components/OverviewCards'", resolveDir: process.cwd(), loader: 'ts' },
  tsconfig: 'tsconfig.json', bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'offline', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'fixture', namespace: 'offline' }))
    b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: 'export const supabase={rpc:(n,a)=>globalThis.__kan91Rpc(n,a)}' }))
  } }],
})
const mod = { exports: {} }
new Function('module','exports','require',bundle.outputFiles[0].text)(mod,mod.exports,require)
const reports = []
const vat = { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 }
for (const item of cases) {
  const year = item.year ?? 2026
  const annual = Object.entries(item.annual).map(([account_number,balance]) => ({ account_number,balance }))
  const cumulative = Object.entries(item.cumulative ?? item.annual).map(([account_number,balance]) => ({ account_number,balance }))
  const original = JSON.stringify({ annual,cumulative })
  globalThis.__kan91Rpc = async (name,args) => {
    if (name === 'get_ne_sales_summary') {
      assert.deepEqual(args, { p_year: year })
      return item.missing ? { error: { code:'PGRST202' } } : { data: { version:1,balances:annual,r2_reallocation:item.r2??0,unresolved_count:0,unresolved_amount:0 },error:null }
    }
    if (name === 'get_period_account_balances') {
      assert(item.missing)
      assert.deepEqual(args,{p_start_date:`${year}-01-01`,p_end_date:`${year}-12-31`})
      return { data:annual,error:null }
    }
    if (name === 'get_cumulative_account_balances') {
      assert.deepEqual(args, { p_through_date:`${year}-12-31` })
      return { data:cumulative,error:null }
    }
    throw Error('Unexpected read/write: '+name)
  }
  const report = await mod.exports.getNEData(year)
  for (const field of ['R13','R14','R17']) assert.equal(report[field], item[field], item.name+'/'+field)
  assert.equal(report.R17, Math.round((report.R12+report.R13-report.R14+report.R15-report.R16)*100)/100)
  const old = before.exports.calculateBusinessResult(item.annual)
  for (const row of ['R3','R4','R5','R6','R7','R8','R9','R10']) assert.equal(report[row],old.neRows[row])
  assert.equal(report.R1,old.neRows.R1-(item.r2??0))
  assert.equal(report.R2,old.neRows.R2+(item.r2??0))
  assert.equal(report.R11,old.bokfortResultat)
  assert.deepEqual(report.warnings,old.warnings)
  assert.deepEqual(report.taxReviews.map(r=>r.accountNumber),item.review??[])
  for (const account of item.review??[]) assert.equal(report.accountCoverage.find(r=>r.accountNumber===account).status,'review')
  for (const account of item.balanceReview??[]) assert.equal(report.accountCoverage.find(r=>r.accountNumber===account).status,'review','Carried balance requires review even with no annual movement')
  const dashboard = calculateDashboard(item.annual,30,vat)
  assert.equal(dashboard.skattemassigVinst,item.R17)
  assert.equal(dashboard.skattReserv,Math.round(Math.max(0,item.R17)*30)/100)
  assert.equal(dashboard.taxReviewRequired,!!item.review?.length)
  if (item.review?.length) assert.equal(dashboard.sakertUttag,0)
  else assert.equal(dashboard.sakertUttag,Math.round(((item.annual['1930']??0)-dashboard.skattReserv)*100)/100)
  for (const locked of [false,true]) {
    const html=renderToStaticMarkup(React.createElement(mod.exports.NEBilaga,{neData:report,selectedYear:year,isYearLocked:locked,onLockYear:async()=>{throw Error('No writes')}}))
    assert.equal(html.includes('Skattejusteringar behöver granskas'),!!item.review?.length)
    if (item.review?.length) {
      assert(html.includes('Inte automatiskt ditt slutliga deklarationsresultat'))
      assert(html.includes('Använd inte NE-underlaget för deklaration'))
    }
    // Positive bank fixture isolates the new review from existing balance blockers.
    if (item.name==='personnel' && !locked) assert(html.includes('aria-disabled="false"'),'No new year-lock blocker')
  }
  assert.equal(JSON.stringify({annual,cumulative}),original,'No journal or payload mutation')
  reports.push({name:item.name,report,dashboard,year})
}
delete globalThis.__kan91Rpc

const browserBundle = await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import NE from './src/components/NEBilaga';import Overview from './src/components/OverviewCards';const cases=${JSON.stringify(reports)};const root=createRoot(document.getElementById('root'));window.showCase=(name,modal="skatt")=>{const c=cases.find(c=>c.name===name);root.render(<><Overview data={c.dashboard} taxRate={30} selectedYear={c.year} transactions={[]} journalMap={{}} activeModal={modal} setActiveModal={()=>{}}/><NE neData={c.report} selectedYear={c.year} isYearLocked={false} onLockYear={async()=>{throw Error('No writes')}}/></>)};window.showCase('personnel');`,resolveDir:process.cwd(),loader:'tsx' },
  tsconfig:'tsconfig.json',bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},
})
const styles=(await readFile('src/app/globals.css','utf8')).replace('@import "tailwindcss";','@import "tailwindcss" source(none);\n@source "./src/components/NEBilaga.tsx";\n@source "./src/components/OverviewCards.tsx";')
const css=await postcss([tailwindcss()]).process(styles,{from:path.resolve('kan91-test.css')})
await mkdir('test-results/kan91',{recursive:true})
const browser=await chromium.launch({headless:true})
try {
  for (const width of [1440,390]) {
    const page=await browser.newPage({viewport:{width,height:1100}})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/*',r=>r.abort())
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({content:css.css})
    await page.addScriptTag({content:browserBundle.outputFiles[0].text})
    await expect(page.getByText('Skattejusteringar behöver granskas',{exact:true})).toBeVisible()
    await expect(page.getByText('Skatteunderlaget behöver granskas i NE-bilagan',{exact:true})).toBeVisible()
    await expect(page.getByText('Skatteberäkningen är preliminär.',{exact:false})).toBeVisible()
    await page.screenshot({path:`test-results/kan91/personnel-${width}.png`,fullPage:true})
    await page.evaluate(()=>window.showCase('personnel',null))
    await expect(page.getByText('Skattejusteringar behöver granskas',{exact:true})).toBeVisible()
    await page.screenshot({path:`test-results/kan91/ne-review-${width}.png`,fullPage:true})
    await page.evaluate(()=>window.showCase('mixed-explicit'))
    await expect(page.getByText('Skattefria intäkter (R14)',{exact:true})).toBeVisible()
    assert(!await page.getByText('Skattejusteringar behöver granskas',{exact:true}).count())
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow')
    assert.deepEqual(errors,[])
    await page.close()
  }
} finally { await browser.close() }
await writeFile('test-results/kan91/reports.json',JSON.stringify(reports,null,2))
console.log(`PASS KAN-91: ${cases.length} service/sign/year/SIE cases; 15,994 unchanged BAS/sign results; dashboard + desktop/mobile offline consumers`)
