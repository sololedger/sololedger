import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
const bundle = await build({ entryPoints: ['tests/fixtures/withdrawalConflictHarness.tsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json', plugins: [{ name: 'only-profile-rpc', setup(b) {
  b.onResolve({ filter: /profileWriteGuard$/ }, () => ({ path: 'guard', namespace: 'test' }))
  b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export async function verifiedProfileRpc(){return window.withdrawalConflictTransport}' }))
} }] })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.route('**/*', r => r.abort())
  await page.setContent('<html lang="sv"><div id="root"></div></html>')
  await page.evaluate(() => {
    window.withdrawalConflictCalls = []
    window.withdrawalConflictReads = []
    window.withdrawalConflictCode = '40001'
    window.withdrawalConflictTransport = { userId: 'synthetic-a', rpc: async (name, args) => {
      window.withdrawalConflictCalls.push(name)
      if (name === 'get_withdrawal_context') {
        if (window.withdrawalConflictCalls.length === 1) return { data: structuredClone(window.withdrawalConflictSeed), error: null }
        return new Promise(resolve => window.withdrawalConflictReads.push(resolve))
      }
      window.withdrawalConflictSaved = args.p_facts
      if (window.withdrawalConflictCode === 'success') {
        window.withdrawalConflictSeed.revision.facts = args.p_facts
        return { data: 'revision', error: null }
      }
      return { data: null, error: { code: window.withdrawalConflictCode } }
    } }
  })
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await page.getByText('Uppskattat uttagsutrymme',{exact:true}).first().waitFor()
  await page.getByRole('button', { name: 'Visa beräkning och underlag' }).click()
  await page.getByLabel('Vad vill du kontrollera?').selectOption('buffer')
  await page.getByRole('textbox').fill('100')
  await page.getByRole('button', { name: 'Spara kontrollen' }).click()
  await page.waitForFunction(() => window.withdrawalConflictCalls.includes('save_withdrawal_assessment'))
  await expect(page.locator('section > div .text-2xl'), 'R3: conflict invalidates old 70 000 before the reload resolves').toHaveCount(0)
  assert.deepEqual(await page.evaluate(() => window.withdrawalConflictCalls), ['get_withdrawal_context', 'save_withdrawal_assessment', 'get_withdrawal_context'])
  await page.evaluate(() => {
    const s = structuredClone(window.withdrawalConflictSeed)
    s.revision.facts.find(f => f.key.startsWith('rate:')).value.rate = 55
    window.withdrawalConflictReads[0]({ data: s, error: null })
  })
  await page.getByText('Uppskattat uttagsutrymme',{exact:true}).first().waitFor()
  assert.equal((await page.locator('section > div .text-2xl').innerText()).replace(/\s/g, ''), '45000kr', 'R3: another tab changed the tax estimate')
  await page.getByText('Underlaget har ändrats. Aktuella uppgifter laddas om;', { exact: false }).waitFor()
  await page.evaluate(() => { window.withdrawalConflictCode = '503' })
  const before = await page.evaluate(() => window.withdrawalConflictCalls.length)
  await page.getByRole('button', { name: 'Spara kontrollen' }).click()
  await page.getByText('Uppgifterna kunde inte sparas. Försök igen.', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.withdrawalConflictCalls.length), before + 1, 'temporary error does not reload or misclassify as conflict')
  assert.equal((await page.locator('section > div .text-2xl').innerText()).replace(/\s/g, ''), '45000kr')
  await page.evaluate(() => { window.withdrawalConflictCode = '40001' })
  await page.getByRole('button', { name: 'Spara kontrollen' }).click()
  await page.waitForFunction(() => window.withdrawalConflictReads.length === 2)
  await expect(page.locator('section > div .text-2xl')).toHaveCount(0)
  await page.evaluate(() => window.withdrawalConflictReads[1]({ data: null, error: { code: '503' } }))
  await page.getByText('Uttagsunderlaget kunde inte hämtas',{exact:true}).waitFor()
  await expect(page.locator('section > div .text-2xl')).toHaveCount(0)
  await page.getByRole('button', { name: 'Försök igen' }).click()
  await page.waitForFunction(() => window.withdrawalConflictReads.length === 3)
  await page.evaluate(() => window.withdrawalConflictReads[2]({ data: structuredClone(window.withdrawalConflictSeed), error: null }))
  await page.getByText('Uppskattat uttagsutrymme',{exact:true}).first().waitFor()
  // Both annual forms prefill and persist the same active year rate.
  await page.getByLabel('Vad vill du kontrollera?').selectOption('rate')
  const priorYear = await page.evaluate(() => String(Number(window.withdrawalConflictSeed.as_of.slice(0, 4)) - 1))
  await page.getByLabel('Inkomstår', { exact: true }).fill(priorYear)
  await expect(page.getByLabel('Uppskattad sammanlagd procent')).toHaveValue('30')
  await page.getByLabel('Uppskattad sammanlagd procent').fill('55')
  await page.evaluate(() => { window.withdrawalConflictCode = 'success' })
  await page.getByRole('button', { name: 'Spara kontrollen' }).click()
  await page.waitForFunction(() => window.withdrawalConflictReads.length === 4)
  await page.evaluate(() => window.withdrawalConflictReads[3]({ data: structuredClone(window.withdrawalConflictSeed), error: null }))
  await expect(page.locator('section > div .text-2xl')).toHaveText(/45\s*000\s*kr/)
  await page.getByRole('button', { name: 'Visa beräkning och underlag' }).click()
  await page.getByLabel('Vad vill du kontrollera?').selectOption('income')
  await expect(page.getByLabel('Uppskattad sammanlagd procent')).toHaveValue('55')
  await page.getByLabel('Vad vill du kontrollera?').selectOption('rate')
  await expect(page.getByLabel('Uppskattad sammanlagd procent')).toHaveValue('55')
  await page.getByRole('button', { name: 'Stäng underlaget' }).click()
  for (const [index, kind, next] of [[4, 'coverage', 'coverage'], [5, 'final', 'income']]) {
    await page.evaluate(kind => { window.withdrawalReviewCase(kind); window.withdrawalConflictControls.refresh() }, kind)
    await page.waitForFunction(n => window.withdrawalConflictReads.length === n, index + 1)
    await page.evaluate(index => window.withdrawalConflictReads[index]({ data: structuredClone(window.withdrawalConflictSeed), error: null }), index)
    await page.getByText('Kan inte beräknas – kontroll krävs', {exact:true}).first().waitFor()
    await page.getByRole('button', { name: 'Visa beräkning och underlag' }).click()
    await expect(page.getByLabel('Vad vill du kontrollera?')).toHaveValue(next)
    await page.getByRole('button', { name: 'Stäng underlaget' }).click()
  }
  // A late successful reload must not re-publish A after the owner changes.
  await page.evaluate(() => window.withdrawalConflictControls.refresh())
  await page.waitForFunction(() => window.withdrawalConflictReads.length === 7)
  await page.evaluate(() => { window.withdrawalConflictTransport.userId = 'synthetic-b'; window.withdrawalConflictControls.setOwner('synthetic-b') })
  await page.waitForFunction(() => window.withdrawalConflictReads.length === 8)
  await page.evaluate(() => window.withdrawalConflictReads[6]({ data: structuredClone(window.withdrawalConflictSeed), error: null }))
  await expect(page.locator('section > div .text-2xl')).toHaveCount(0)
  await page.evaluate(() => window.withdrawalConflictControls.unmount())
  await page.evaluate(() => window.withdrawalConflictReads[7]({ data: structuredClone(window.withdrawalConflictSeed), error: null }))
  await expect(page.locator('section')).toHaveCount(0)
  console.log('PASS R3: real service → hook → card; conflict hides old amount and reloads changed annual facts')
  console.log('PASS R3/R4 boundaries: temporary save error, failed reload/retry, canonical rate/prefill, owner change and unmount')
  console.log('PASS R6: existing coverage invalidated and changed final-tax basis route to the relevant form')
} finally { await browser.close() }
