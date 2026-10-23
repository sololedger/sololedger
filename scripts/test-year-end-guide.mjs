// Real Home, Layout, boundary and guide. Existing accounting panels are sentinels;
// all Auth/data/write boundaries are synthetic and every external request is denied.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const fixture = { owner: 'owner-a', name: 'Syntetiska A', ready: true, error: null, locked: false, revision: 1 }
const authMock = `import {useSyncExternalStore} from 'react';
export function useAuth(){const f=useSyncExternalStore(cb=>{window.listeners.add(cb);return()=>window.listeners.delete(cb)},()=>window.fixture);
return {user:{id:f.owner,email:f.owner+'@example.test'},profile:f.noProfile?null:{id:f.owner,company_name:f.name,subscription_type:'paid',role:'user',vat_status:'registered',domestic_sales_vat_treatment:'taxable',foreign_purchase_reporting:'required',default_deduction_entitlement:'full',vat_period_type:'year',vat_management_from:'2025-01-01'},profileContextKey:f.revision,profileError:f.noProfile?'Profil saknas':null,authLoading:false,verifyProfile:async()=>{throw Error('No writes allowed')},retryProfile:()=>{}}}`
const forbidden = `const deny=(...a)=>{window.writes.push(a);throw Error('Forbidden synthetic write')};`
const mock = {
  useAuth: authMock,
  useAccountingData: `export const useAccountingData=(u,year)=>({accountingDataReady:window.fixture.ready,accountingDataError:window.fixture.error,isYearLocked:window.fixture.locked,transactions:[],balances:{},balanceSheetBalances:{},journalMap:{},neData:{},momsBreakdown:{},transactionHistoryComplete:true,kontoplan:[],kontoplanLoaded:true,kontoplanLoading:false,retryAccountingData:()=>{},refreshData:()=>{throw Error('Guide must not refresh')},refreshDataWithStatus:()=>{throw Error('Guide must not refresh')}});`,
  usePaymentAccountRoleConfiguration: `export const usePaymentAccountRoleConfiguration=()=>({configuredRoles:[],loaded:true,loading:false,error:null});`,
  subscriptionLimits: `export const FREE_TRANSACTION_LIMIT=15;export const getFreeTransactionUsage=async()=>0;export const canCreateTransactions=()=>true;`,
  accountingService: forbidden + `export const getCustomerInvoices=async()=>[];export const isYearClosed=async()=>false;export const closeYear=deny,bookStandardBookingAttempt=deny,bookVatV2EuServiceReverseChargeTransaction=deny,createCorrectionTransaction=deny,updateTransaction=deny;`,
  supabaseClient: forbidden + `export const supabase={from:()=>({insert:deny,update:deny,upsert:deny,delete:deny}),rpc:deny,storage:{from:()=>({upload:deny})}};`,
}
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import Home from './src/app/page';
window.fixture=${JSON.stringify(fixture)};window.listeners=new Set();window.writes=[];
window.harness={set(change){flushSync(()=>{window.fixture={...window.fixture,...change};for(const cb of window.listeners)cb()})}};
createRoot(document.getElementById('root')).render(<Home/>);`
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', plugins: [{ name: 'offline-year-end', setup(b) {
  b.onResolve({ filter: /.*/ }, args => {
    const leaf = args.path.split('/').at(-1)
    if (mock[leaf]) return { path: leaf, namespace: 'offline' }
    if (args.importer.replaceAll('\\', '/').endsWith('/src/app/page.tsx') && args.path.startsWith('@/components/') && !['Layout', 'YearEndGuide', 'AccountingDataBoundary'].includes(leaf)) return { path: 'panel-' + leaf, namespace: 'offline' }
  })
  b.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: mock[args.path] || (args.path === 'panel-NEBilaga'
    ? `import Guide from './src/components/NEDeclarationGuide';export default function Panel(p){return <section data-panel="NEBilaga">NEBilaga<span>{p.selectedYear}</span><Guide key={p.userId+':'+p.selectedYear+':'+p.companyName} year={p.selectedYear} companyName={p.companyName} onOpenYearEnd={p.onOpenYearEnd} initialOpenDetails={p.initialGuideOpenDetails}/></section>}`
    : `export default function Panel(p){if('isOpen' in p&&!p.isOpen)return null;return <section data-panel="${args.path.slice(6)}">${args.path.slice(6)}<span>{p.selectedYear??'egen period'}</span>{p.children}</section>}`), loader: 'tsx', resolveDir: process.cwd() }))
} }] })
const css = (await postcss([tailwind({ base: process.cwd() })]).process(await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css
const out = 'coverage/kan99-evidence/browser'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage(), errors = [], external = []
    page.on('pageerror', e => errors.push(e.message))
    await context.route('**/*', route => {
      if (route.request().url() === 'https://kan99.test/') return route.fulfill({ contentType: 'text/html', body: '<html lang="sv"><meta charset="utf-8"><style>' + css + '</style><body><div id="root"></div></body></html>' })
      external.push(route.request().url()); return route.abort()
    })
    await page.clock.install({ time: new Date('2026-10-22T12:00:00+02:00') })
    await page.goto('https://kan99.test/')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    async function navigate(label) {
      let button = page.getByRole('button', { name: label, exact: true }).filter({ visible: true })
      if (!await button.count()) {
        const mobile = page.getByRole('button', { name: 'Öppna meny', exact: true })
        if (await mobile.isVisible()) await mobile.click()
        else await page.getByRole('button', { name: /^Mer/ }).click()
        button = page.getByRole('button', { name: label, exact: true }).filter({ visible: true })
        if (!await button.count()) button = page.getByRole('menuitem', { name: label, exact: true })
      }
      await button.click()
    }
    await navigate('Årsavslut')
    const guide = page.getByRole('region', { name: 'Årsavslut för 2026', exact: true })
    const opened = () => guide.locator('details').evaluateAll(items => items.flatMap((item, index) => item.open ? [index] : []))
    const openControl = async index => {
      const details = guide.locator('details').nth(index)
      if (await details.getAttribute('open') === null) await details.locator('summary').click()
      return details
    }
    await expect(guide).toBeVisible()
    await expect(guide).toContainText('Företag: Syntetiska A')
    await expect(guide.getByRole('status')).toContainText('2026 är inte slut')
    await expect(guide.locator('details')).toHaveCount(8)
    await expect(guide.locator('details[open]')).toHaveCount(0)
    await expect(guide.locator('input,progress,[role=progressbar]')).toHaveCount(0)
    assert.equal(await guide.getByRole('button', { name: /Lås räkenskapsår/ }).count(), 0)
    await page.screenshot({ path: out + `/overview-${width}.png`, fullPage: true })
    for (const details of await guide.locator('details').all()) {
      await details.locator('summary').click()
      for (const heading of ['Varför behövs kontrollen?', 'Så gör du och jämför', 'Vad kan SoloLedger kontrollera?', 'Om något inte stämmer', 'När har du utfört kontrollen?']) await expect(details.getByText(heading, { exact: true })).toBeVisible()
      assert(await details.getByRole('button', { name: /^Öppna / }).count() > 0)
      await details.locator('summary').click()
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.deepEqual(await page.evaluate(() => window.writes), [])
    results.push({ width, test: 'Eight actionable controls; no completion/lock/progress/write/network', status: 'PASS' })

    // Every destination uses real Home navigation. Panels are deliberate sentinels.
    for (const [index, label, sentinel, hasYear] of [[0, 'Bokföring', 'DashboardOverview', false], [0, 'Profil', 'ProfileSettings', false], [1, 'Fakturor', 'CustomerInvoicesPanel', true], [2, 'Bokslutsskulder', 'SupplierYearEndPanel', true], [3, 'Inventarier', 'FixedAssetsPanel', true], [4, 'Moms', 'Momsrapport', false], [5, 'NE-Bilaga', 'NEBilaga', true]]) {
      const details = guide.locator('details').nth(index)
      await openControl(index)
      if (label === 'Moms') {
        await expect(details).toContainText('momsperioden följer inte automatiskt guidens årsväljare')
        const example = details.locator('li').filter({ hasText: 'Fiktivt exempel' })
        await expect(example).toHaveCount(1)
        for (const text of ['EU-tjänsteinköp på 200 kr exklusive moms', 'utan fakturamoms', '25 % omvänd svensk moms (50 kr)', 'ingen avdragsrätt och inga andra momsposter', 'ruta 21 är 200 kr', 'ruta 30 är 50 kr', 'ruta 48 är 0 kr', 'bara om underlaget styrker', 'fakturan, säljarlandet, tjänsten, avdragsrätten och de faktiska omständigheterna']) await expect(example).toContainText(text)
        await expect(example).not.toContainText(/228|57 kr/)
        await expect(details).toContainText('exempelvis Adobe')
        await expect(details).toContainText('Namnet Adobe avgör inte land eller momsbehandling')
      }
      const beforeVisit = await opened()
      await details.getByRole('button', { name: 'Öppna ' + label, exact: true }).click()
      await expect(page.locator(`[data-panel="${sentinel}"]`)).toBeVisible()
      if (hasYear) await expect(page.locator(`[data-panel="${sentinel}"]`)).toContainText('2026')
      await page.getByRole('button', { name: 'Tillbaka till årsavslutet 2026', exact: true }).click()
      await expect(guide).toBeVisible()
      assert.deepEqual(await opened(), beforeVisit, label + ' return must restore open controls')
    }
    results.push({ width, test: 'Seven real Home destinations and return; correct year and explicit independent VAT period', status: 'PASS' })

    // New declaration entry and real Home return callback; preserve the original guide's open controls.
    await openControl(7)
    await expect(guide.locator('details').nth(7)).toContainText('Från NE-underlag till deklaration')
    const beforeDeclaration = await opened()
    await guide.locator('details').nth(7).getByRole('button', { name: 'Öppna NE-Bilaga', exact: true }).click()
    await page.getByText('Från NE-underlag till deklaration · fem steg', { exact: true }).click()
    const declaration = page.getByRole('region', { name: 'Deklarationsvägledning för 2026', exact: true })
    await expect(declaration).toContainText('Syntetiska A · Inkomstår 2026')
    await declaration.getByText('1. Gör bokslutsunderlaget klart', { exact: true }).click()
    await declaration.getByRole('button', { name: 'Öppna Årsavslut', exact: true }).click()
    await expect(guide).toBeVisible();assert.deepEqual(await opened(),beforeDeclaration)
    await navigate('NE-Bilaga')
    await page.getByText('Från NE-underlag till deklaration · fem steg', { exact: true }).click()
    await declaration.getByText('1. Gör bokslutsunderlaget klart', { exact: true }).click()
    await declaration.getByRole('button', { name: 'Öppna Årsavslut', exact: true }).click()
    await expect(guide).toBeVisible();assert.deepEqual(await opened(),[],'Ordinary NE visit must not restore an earlier guide ticket')
    results.push({ width, test: 'KAN-101 declaration entry, company/year and nested return restore real Home guide context', status: 'PASS' })

    // NE-origin visit offers a scoped, one-visit return with native disclosures restored.
    const neReturn = page.getByRole('button', { name: 'Tillbaka till NE-guiden', exact: true })
    await expect(neReturn).toBeVisible()
    await neReturn.click()
    await expect(declaration).toBeVisible()
    await declaration.getByText('3. Ta fram uppgifter som bokföringen inte räcker till för', { exact: true }).click()
    await declaration.getByText('Behöver du komplettera R15 eller R16?', { exact: true }).click()
    const disclosureState = () => declaration.locator('details').evaluateAll(items => items.map(item => item.open))
    const beforeNE = await disclosureState()
    await declaration.getByRole('button', { name: 'Öppna Årsavslut', exact: true }).click()
    await openControl(3)
    await neReturn.click()
    await expect(declaration).toBeVisible()
    assert.deepEqual(await disclosureState(), beforeNE)
    await expect(page.getByText('Från NE-underlag till deklaration · fem steg', { exact: true })).toBeFocused()
    await declaration.getByRole('button', { name: 'Öppna Årsavslut', exact: true }).click()
    assert.deepEqual(await opened(), [3], 'NE return keeps the current YearEnd controls')
    await page.screenshot({ path: out + `/ne-return-${width}.png`, fullPage: true })
    await navigate('Årsavslut')
    await expect(neReturn).toHaveCount(0)
    await navigate('NE-Bilaga')
    await expect(declaration).toHaveCount(0)
    results.push({ width, test: 'NE return restores expanded steps/cards and keyboard focus; repeated visits retain YearEnd controls; ordinary menu consumes ticket', status: 'PASS' })

    for (const invalidate of ['year', 'owner', 'profile']) {
      await navigate('NE-Bilaga')
      await page.getByText('Från NE-underlag till deklaration · fem steg', { exact: true }).click()
      await declaration.getByText('1. Gör bokslutsunderlaget klart', { exact: true }).click()
      await declaration.getByRole('button', { name: 'Öppna Årsavslut', exact: true }).click()
      await expect(neReturn).toBeVisible()
      if (invalidate === 'year') {
        const years = page.getByRole('group', { name: 'Ekonomikontroller' }).getByRole('combobox')
        await years.selectOption('2027'); await expect(neReturn).toHaveCount(0); await years.selectOption('2026')
      } else if (invalidate === 'owner') {
        await page.evaluate(() => window.harness.set({ owner: 'owner-b', name: 'Syntetiska B' }))
        await expect(neReturn).toHaveCount(0)
        await page.evaluate(() => window.harness.set({ owner: 'owner-a', name: 'Syntetiska A' }))
      } else {
        await page.evaluate(() => window.harness.set({ revision: 2 }))
        await expect(neReturn).toHaveCount(0)
        await page.evaluate(() => window.harness.set({ revision: 1 }))
      }
      await expect(neReturn).toHaveCount(0)
    }
    results.push({ width, test: 'NE return cannot revive after year, owner or profile A-B-A', status: 'PASS' })

    await navigate('Profil'); await navigate('Årsavslut')
    for (const index of [0, 3, 5]) await openControl(index)
    await guide.locator('details').nth(3).getByRole('button', { name: 'Öppna Inventarier', exact: true }).click()
    await page.getByRole('button', { name: 'Tillbaka till årsavslutet 2026' }).click()
    assert.deepEqual(await opened(), [0, 3, 5])
    await guide.locator('details').first().locator('summary').click(); await openControl(7)
    await guide.locator('details').nth(5).getByRole('button', { name: 'Öppna NE-Bilaga', exact: true }).click()
    await page.getByRole('button', { name: 'Tillbaka till årsavslutet 2026' }).click()
    assert.deepEqual(await opened(), [3, 5, 7], 'Capture current DOM, including a closed restored control')
    await page.evaluate(() => window.harness.set({ ready: false }))
    await page.evaluate(() => window.harness.set({ ready: true }))
    assert.deepEqual(await opened(), [3, 5, 7], 'An unrelated render must not reset native details')
    await navigate('Profil'); await navigate('Årsavslut'); assert.deepEqual(await opened(), [])
    for (const change of ['year', 'profile', 'owner']) {
      for (const index of [0, 3]) await openControl(index)
      await guide.locator('details').nth(3).getByRole('button', { name: 'Öppna Inventarier', exact: true }).click()
      await page.getByRole('button', { name: 'Tillbaka till årsavslutet 2026' }).click()
      assert.deepEqual(await opened(), [0, 3])
      if (change === 'year') {
        const select = page.getByRole('group', { name: 'Ekonomikontroller' }).getByRole('combobox')
        await select.selectOption('2027'); await select.selectOption('2026')
      } else if (change === 'profile') {
        await page.evaluate(() => window.harness.set({ name: 'Profilprov', revision: 100 }))
        await page.evaluate(() => window.harness.set({ name: 'Syntetiska A', revision: 101 }))
      } else {
        await page.evaluate(() => window.harness.set({ owner: 'owner-b', name: 'Syntetiska B', revision: 102 }))
        await page.evaluate(() => window.harness.set({ owner: 'owner-a', name: 'Syntetiska A', revision: 103 }))
        await navigate('Årsavslut')
      }
      assert.deepEqual(await opened(), [], change + ' A-B-A must discard restored expansion')
    }
    results.push({ width, test: 'Multiple open controls restored; close/reopen snapshot; menu and year/profile/owner A-B-A discard expansion', status: 'PASS' })

    // A guide return applies only to the visit started by the guide, not later menu visits.
    const back = page.getByRole('button', { name: 'Tillbaka till årsavslutet 2026', exact: true })
    for (const [destination, menu] of [['Profil', 'Fakturor'], ['Profil', 'Profil'], ['NE-Bilaga', 'Fakturor'], ['NE-Bilaga', 'NE-Bilaga']]) {
      const details = guide.locator('details').nth(destination === 'Profil' ? 0 : 5)
      await details.locator('summary').click()
      await details.getByRole('button', { name: 'Öppna ' + destination, exact: true }).click()
      await expect(back).toBeVisible()
      await navigate(menu) // Even selecting the current page is an independent menu action.
      await expect(back).toHaveCount(0)
      await navigate('Fakturor'); await expect(back).toHaveCount(0)
      await navigate('Årsavslut')
      await guide.locator('details').first().locator('summary').click()
      await guide.getByRole('button', { name: 'Öppna Profil', exact: true }).click()
      await expect(back).toBeVisible(); await back.click(); await expect(back).toHaveCount(0)
      await navigate('Profil'); await expect(back).toHaveCount(0)
      await navigate('Årsavslut')
    }
    // An accepted profile replacement must invalidate an outstanding ticket, including A -> B -> A.
    await guide.locator('details').first().locator('summary').click()
    await guide.getByRole('button', { name: 'Öppna Profil', exact: true }).click()
    await expect(back).toBeVisible()
    await page.evaluate(() => window.harness.set({ name: 'Nytt profilnamn', revision: 20 }))
    await expect(back).toHaveCount(0)
    await page.evaluate(() => window.harness.set({ name: 'Syntetiska A', revision: 21 }))
    await expect(back).toHaveCount(0)
    await navigate('Årsavslut')
    await guide.locator('details').first().locator('summary').click()
    await guide.getByRole('button', { name: 'Öppna Profil', exact: true }).click()
    await expect(back).toBeVisible()
    await page.evaluate(() => window.harness.set({ owner: 'owner-b', name: 'Syntetiska B', revision: 22 }))
    await expect(back).toHaveCount(0)
    await page.evaluate(() => window.harness.set({ owner: 'owner-a', name: 'Syntetiska A', revision: 23 }))
    await expect(back).toHaveCount(0)
    await navigate('Årsavslut')
    results.push({ width, test: 'Guide return consumed on menu/current-page menu/return; no revival after profile or owner A-B-A', status: 'PASS' })

    const year = page.getByRole('group', { name: 'Ekonomikontroller' }).getByRole('combobox')
    await guide.locator('details').first().locator('summary').click()
    await year.selectOption('2027')
    const next = page.getByRole('region', { name: 'Årsavslut för 2027', exact: true })
    await expect(next.locator('details[open]')).toHaveCount(0)
    await expect(next.getByRole('status')).toContainText('2027 har inte börjat')
    await year.selectOption('2026'); await year.selectOption('2025')
    await expect(page.getByRole('region', { name: 'Årsavslut för 2025', exact: true }).getByRole('status')).toContainText('2025 har passerat')
    await year.selectOption('2026')
    // A navigation return ticket is transient and must not survive year A -> B -> A.
    await guide.locator('details').nth(1).locator('summary').click()
    await guide.locator('details').nth(1).getByRole('button', { name: 'Öppna Fakturor', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Tillbaka till årsavslutet 2026' })).toBeVisible()
    await year.selectOption('2027'); await year.selectOption('2026')
    await expect(page.getByRole('button', { name: 'Tillbaka till årsavslutet 2026' })).toHaveCount(0)
    await navigate('Årsavslut')
    await page.evaluate(() => window.harness.set({ locked: true }))
    await expect(guide).toContainText('låst enligt SoloLedger')
    await page.evaluate(() => window.harness.set({ ready: false }))
    await expect(guide).not.toContainText('låst enligt SoloLedger')
    await expect(guide).toContainText('Inget besked visas ännu')
    await page.evaluate(() => window.harness.set({ error: 'synthetic load failure' }))
    await expect(guide.getByRole('alert')).toContainText('Ingen tidigare status visas')
    await expect(guide.locator('details')).toHaveCount(8)
    await page.evaluate(() => window.harness.set({ ready: true, error: null, locked: false }))
    await guide.locator('details').nth(4).locator('summary').click()
    await page.screenshot({ path: out + `/vat-expanded-${width}.png`, fullPage: true })
    results.push({ width, test: 'Year A-B-A reset; past/current/future guidance; loading/error hides stale lock', status: 'PASS' })

    await page.evaluate(() => window.harness.set({ owner: 'owner-b', name: 'Syntetiska B', revision: 2 }))
    await expect(page.getByText('Företag: Syntetiska A', { exact: true })).toHaveCount(0)
    await navigate('Årsavslut')
    await expect(guide).toContainText('Företag: Syntetiska B')
    await expect(guide.locator('details[open]')).toHaveCount(0)
    await page.evaluate(() => window.harness.set({ owner: 'owner-a', name: 'Syntetiska A', revision: 3 }))
    await navigate('Årsavslut'); await expect(guide.locator('details[open]')).toHaveCount(0)
    await page.evaluate(() => window.harness.set({ name: null, revision: 4 }))
    await expect(guide).toContainText('Företagsnamn saknas')
    await expect(guide).not.toContainText('Syntetiska A')
    await page.evaluate(() => window.harness.set({ noProfile: true, revision: 5 }))
    await expect(guide).toHaveCount(0)
    assert.deepEqual(await page.evaluate(() => window.writes), [])
    assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), [])
    assert.deepEqual(external, []); assert.deepEqual(errors, [])
    results.push({ width, test: 'Owner A-B-A, profile rename/missing/error; no saved progress or external requests', status: 'PASS' })
    await context.close()
  }
  await writeFile(out + '/result.json', JSON.stringify({ status: 'PASS', results, scope: 'actual Home/Layout/guide; mocked existing data/panels; network denied' }, null, 2) + '\n')
  console.log(`PASS KAN-99: ${results.length} browser groups, desktop/mobile, actual navigation/owner/year/loading/error and zero writes. Evidence ${out}`)
} finally { await browser.close() }
