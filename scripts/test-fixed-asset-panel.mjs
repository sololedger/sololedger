import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'

// Render the actual panel. All service calls are intercepted in the bundle;
// all browser requests are fulfilled locally. No live bookkeeping is possible.
const rules = { taxYear: 2026, priceBaseAmount: 59200, halfPriceBaseAmount: 29600, ruleVersion: 'synthetic',
  rules: { fixedAssetsK1: { smallValueComparison: 'lt', collectiveFullWriteoffComparison: 'lte', ordinaryDecliningBalancePercent: 30 } } }
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client';
import Panel from './src/components/FixedAssetsPanel';
const root=createRoot(document.getElementById('root'));let key=0;
window.renderAssetPanel=()=>root.render(<Panel key={++key} verifyProfile={async()=> 'synthetic-owner'} selectedYear={2026} isYearLocked={false}
companyVatProfileResult={{profile:{defaultDeductionEntitlement:'none'}}} paymentAccountRoles={[{role:'business_payment_account',accountNumber:'1930'}]}
paymentAccountRolesLoading={false} paymentAccountRolesLoaded={true} paymentAccountRolesError={null}
onRefreshPaymentAccountRoles={()=>{}} onOpenPaymentAccountSettings={()=>{}} onBookkeepingChanged={()=>{}}/>);
window.renderAssetPanel();`
const service = `export async function getFixedAssets(){return window.assetFixture.assets}
export async function getFixedAssetDepreciationRuns(){return window.assetFixture.runs || []}
export async function getFixedAssetDepreciationPreview(){return window.assetFixture.preview || {status:'empty',book_value:0}}
export async function getTaxRuleParametersForYear(){return window.assetFixture.rules}
export async function bookFixedAssetAcquisition(input){window.assetFixture.sent.push(input);throw Error('Synthetic transport stopped before booking')}
export async function bookFixedAssetDepreciation(...args){window.assetFixture.annual=args;throw Error('Synthetic annual transport stopped')}
export async function retireFixedAsset(){throw Error('Disabled synthetic write')}`
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: process.cwd() }, bundle: true,
  write: false, platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'synthetic-asset-service', setup(b) {
    b.onResolve({ filter: /(?:^|\/)accountingService$/ }, () => ({ path: 'asset-service', namespace: 'synthetic' }))
    b.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: service }))
  } }] })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.route('**/*', route => route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }))
  await page.goto('http://127.0.0.1:31062')
  await page.evaluate(rules => { window.assetFixture = { assets: [], rules, sent: [] } }, rules)
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  const setup = async (gross, connected = false) => {
    await page.getByLabel('Datum', { exact: true }).fill('2026-03-01')
    await page.getByLabel('Beskrivning', { exact: true }).fill('Synthetic equipment')
    await page.getByLabel('Belopp inkl. moms', { exact: true }).fill(String(gross))
    await page.getByRole('radio', { name: connected ? 'Del av paket, delleverans eller ihopkopplat köp' : 'Fristående köp', exact: true }).check()
  }
  await setup(35000)
  await expect(page.getByText('Direkt kostnad: mindre värde', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Bokför', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.assetFixture.sent.length)).toBe(1)
  const sent = await page.evaluate(() => window.assetFixture.sent[0])
  assert.equal(sent.thresholdBasisAmount, 28000); assert.equal(sent.grossAmount, 35000)
  assert.equal(sent.vatDeductionEntitlement, 'none'); assert.deepEqual(sent.expectedPriorAssetIds, [])
  await page.getByLabel('Belopp inkl. moms', { exact: true }).fill('37000')
  await expect(page.getByText('Direkt kostnad: mindre värde', { exact: true })).toHaveCount(0)
  await page.getByLabel(/Beräknad ekonomisk livslängd/).selectOption('max_three_years')
  await expect(page.getByText('Direkt kostnad: kort livslängd', { exact: true })).toBeVisible()
  // Real group-expansion preview, selecting only B must still include A.
  const member = { fiscalYear: 2026, acquisitionDate: '2026-01-01', acquisitionGroupId: 'G', assetStatus: 'expensed',
    decisionType: 'immediate_expense_small_value', taxableBaseAmount: 10000, expensedAmount: 12500, capitalizedAmount: 0,
    paymentAccountRole: 'business_payment_account', ruleYear: 2026 }
  await page.evaluate(member => {
    window.assetFixture.assets = [{ ...member, id: 'A', description: 'Part A' }, { ...member, id: 'B', description: 'Part B' }]
    window.renderAssetPanel()
  }, member)
  await setup(12500, true)
  await page.getByLabel(/Part B/).check()
  await page.getByLabel(/Beräknad ekonomisk livslängd/).selectOption('more_than_three_years_or_unknown')
  await expect(page.getByText(/Bedömningsvärde för paketet exklusive fakturamoms: 30/)).toBeVisible()
  await expect(page.getByText(/Tidigare direktkostnadsförda delar:/)).toContainText(/25\s*000/)
  await page.getByRole('button', { name: 'Bokför', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.assetFixture.sent.length)).toBe(2)
  const grouped = await page.evaluate(() => window.assetFixture.sent[1])
  assert.deepEqual(grouped.expectedPriorAssetIds, ['A', 'B']); assert.equal(grouped.thresholdBasisAmount, 30000)
  assert.equal(grouped.expectedReclassificationAmount, 25000)
  await page.getByLabel('Datum', { exact: true }).fill('2025-03-01')
  await expect(page.getByRole('alert')).toContainText('valt bokföringsår')
  await page.evaluate(() => {
    window.assetFixture.assets = [{id:'CAP',fiscalYear:2025,acquisitionDate:'2025-01-01',assetStatus:'active',
      decisionType:'capitalized',capitalizedAmount:40000,expensedAmount:0,description:'Capital asset',paymentAccountRole:'business_payment_account',ruleYear:2025}]
    window.assetFixture.runs = [{id:'prior',fiscalYear:2025,depreciationAmount:12000}]
    window.assetFixture.preview = {status:'ready',basis_amount:28000,depreciation_amount:28000,book_value:28000,
      signature:'reviewed-snapshot',method:'k1_half_pbb_full_writeoff'}
    window.renderAssetPanel()
  })
  const annualButton=page.getByRole('button',{name:'Bokför årsavskrivning',exact:true})
  await expect(annualButton).toBeDisabled()
  await expect(page.getByText(/Preliminär avskrivning 28\s*000,00/)).toBeVisible()
  await page.getByRole('checkbox',{name:/Jag bekräftar att räkenskapsåret/}).check()
  await annualButton.click()
  await expect.poll(()=>page.evaluate(()=>window.assetFixture.annual?.[1]?.signature)).toBe('reviewed-snapshot')
  assert.equal(await page.evaluate(()=>window.assetFixture.annual[2]),true)
  await page.evaluate(()=>{window.assetFixture.preview={status:'empty',book_value:0};window.renderAssetPanel()})
  await expect(annualButton).toHaveCount(0)
  await expect(page.getByText('Bokfört värde kollektivt').locator('..')).toContainText('0,00 kr')
  await page.evaluate(()=>{window.assetFixture.preview={status:'blocked',reason:'Okänd årslängd kräver kontroll'};window.renderAssetPanel()})
  await expect(page.getByRole('alert')).toContainText('Okänd årslängd')
  await expect(page.getByRole('button',{name:'Bokför',exact:true})).toBeEnabled()
  assert.deepEqual(errors, [])
  console.log('KAN-62 actual panel: gross/net preview, exact boundary, short life, complete group and year guard PASS (synthetic transport)')
} finally { await browser.close() }
