// Actual React panel + actual client service, synthetic RPC transport; no hosted requests.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'

const bundle = await build({ entryPoints: ['tests/fixtures/vatPeriodCreationHarness.tsx'], bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic', plugins: [{ name: 'synthetic-rpc', setup(b) {
    b.onResolve({ filter: /profileWriteGuard$/ }, () => ({ path: resolve('tests/fixtures/vatPeriodCreationTransport.ts') }))
  } }] })
const css = await postcss([tailwind()]).process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: resolve('src/app/globals.css') })
const browser = await chromium.launch({ headless: true })
const out = 'coverage/kan117-browser'; fs.mkdirSync(out, { recursive: true })
const checks = []
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', r => { assert(new URL(r.request().url()).hostname === '127.0.0.1'); return r.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }) })
    await page.goto('http://127.0.0.1:31047')
    await page.addStyleTag({ content: css.css }); await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const call = (name, ...args) => page.evaluate(([n, a]) => window.vatTest[n](...a), [name, args])
    const writes = () => page.evaluate(() => window.vatTest.calls.filter(c => c.name === 'create_missing_vat_periods').length)
    const review = page.getByRole('button', { name: 'Granska saknade momsperioder', exact: true })
    const confirm = page.getByRole('button', { name: 'Bekräfta och skapa', exact: true })
    const modal = page.getByRole('dialog')
    await expect(page.getByText('Alla momsperioder för 2026 finns', { exact: true })).toBeVisible()
    await expect(review).toHaveCount(0); assert.equal(await writes(), 0)
    await page.screenshot({ path: `${out}/${viewport.width}-complete.png`, fullPage: true })
    await call('reset', 'missing'); await expect(review).toBeEnabled()
    await review.click(); await expect(modal).toBeVisible()
    await expect(modal).toContainText('2026-01-01 – 2026-12-31'); assert.equal(await writes(), 0)
    await page.screenshot({ path: `${out}/${viewport.width}-preview.png`, fullPage: true })
    await page.getByRole('button', { name: 'Avbryt', exact: true }).click(); await expect(modal).not.toBeVisible()
    assert.equal(await writes(), 0); await expect(review).toBeFocused()
    await review.click(); await page.keyboard.press('Escape'); await expect(modal).not.toBeVisible(); assert.equal(await writes(), 0)
    await review.click(); await call('writeMode', 'pending')
    await confirm.evaluate(b => { b.click(); b.click() })
    await expect.poll(writes).toBe(1); await expect(page.getByRole('button', { name: 'Skapar…' })).toBeDisabled()
    await call('finish'); await expect(page.getByText('Alla momsperioder för 2026 finns', { exact: true })).toBeVisible()
    await expect(review).toHaveCount(0); assert.equal(await writes(), 1)
    checks.push(`${viewport.width}: complete hidden; preview/cancel/Escape without writes; double click writes once; success refreshed`)
    await call('reset', 'missing'); await review.click(); await call('changeRemotely'); await confirm.click()
    await expect(modal).not.toBeVisible(); await expect(page.getByRole('alert')).toContainText('ändrats')
    await expect(review).toBeEnabled(); assert.equal(await writes(), 1)
    await review.click(); await call('reset', 'missing', 'synthetic-B'); await expect(modal).not.toBeVisible()
    assert.equal(await writes(), 0)
    await review.click(); await call('reset', 'blocked', 'synthetic-B'); await expect(modal).not.toBeVisible()
    await expect(review).toHaveCount(0); assert.equal(await writes(), 0)
    checks.push(`${viewport.width}: stale server state rejected; owner/profile remount discards preview`)
    for (const mode of ['blocked', 'not_applicable', 'read_error', 'malformed']) {
      await call('reset', mode); await expect(page.getByText('Kontrollerar momsperioderna…')).toHaveCount(0)
      await expect(review).toHaveCount(0)
      await expect(page.getByText('Alla momsperioder för 2026 finns', { exact: true })).toHaveCount(0)
      assert.equal(await writes(), 0)
    }
    await call('reset', 'missing'); await review.click(); await call('writeMode', 'uncertain'); await confirm.click()
    await expect(modal).not.toBeVisible(); await expect(page.getByRole('alert')).toContainText('Skapandet kunde inte bekräftas')
    await expect(page.getByText('Alla momsperioder för 2026 finns', { exact: true })).toBeVisible()
    await expect(review).toHaveCount(0); assert.equal(await writes(), 1)
    await page.getByText('Vad betyder de olika momsstegen?', { exact: true }).click()
    await expect(page.getByText(/Du lämnar själv deklarationen/)).toBeVisible()
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    assert.deepEqual(errors, [])
    checks.push(`${viewport.width}: invalid/unknown/not registered/read failure fail closed; uncertain result re-read; help and no horizontal overflow`)
    await page.close()
  }
  fs.writeFileSync(out + '/result.json', JSON.stringify({ status: 'PASS', checks, transport: 'synthetic only', noHostedWrites: true }, null, 2))
  checks.forEach(c => console.log('PASS ' + c))
} finally { await browser.close() }
