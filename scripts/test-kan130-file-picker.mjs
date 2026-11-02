// Actual component and styles; synthetic adapter, all network blocked.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'

const fixture = `import {createRoot} from 'react-dom/client';
import History from './src/components/AccountingAttachmentHistory';
createRoot(document.getElementById('root')).render(<History owner="synthetic" entityType="transaction" entityId="synthetic" locked={false} onUpload={async()=>{window.uploads++;return 'synthetic/file.pdf'}}/>);`
const mock = `export const supabase={from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,range:async()=>({data:[],count:0,error:null})};return b},
rpc:async()=>{await new Promise(resolve=>window.finishSave=resolve);return {data:{success:true}}}};`
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  tsconfig: path.resolve('tsconfig.json'), bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'mock', namespace: 'synthetic' }))
    b.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: mock }))
  } }] })
const css = await postcss([tailwindcss()]).process((await fs.readFile('src/app/globals.css', 'utf8'))
  .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./src/components/AccountingAttachmentHistory.tsx";'),
  { from: path.resolve('kan130-test.css') })
const dir = path.resolve('test-results/kan130-' + Date.now())
await fs.mkdir(dir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [width, height] of [[1280, 900], [390, 844], [320, 568]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', r => r.abort())
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.evaluate(() => { window.uploads = 0 })
    await page.addStyleTag({ content: css.css })
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    await page.getByRole('button', { name: 'Hantera bilagor', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Hantera bilagor' })
    const button = dialog.getByRole('button', { name: 'Välj fil', exact: true })
    const input = dialog.getByLabel('Kompletterande bilaga', { exact: true })
    const status = dialog.getByRole('status')
    await expect(button).toBeEnabled()
    await expect(status).toHaveText('Ingen fil vald')
    await expect(button).toHaveAccessibleDescription('Ingen fil vald')
    await expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,application/pdf')
    await expect(dialog.getByRole('button', { name: 'Spara bilagetillägg' })).toBeDisabled()
    // Reach the new button through the dialog's normal keyboard sequence.
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).focus()
    await page.keyboard.press('Tab'); await expect(button).toBeFocused()
    for (const key of ['Enter', 'Space']) {
      const chooserEvent = page.waitForEvent('filechooser')
      await page.keyboard.press(key)
      const chooser = await chooserEvent
      assert.equal(await chooser.element().getAttribute('id'), await input.getAttribute('id'))
      const name = key === 'Enter' ? 'kvitto.pdf' : 'mycket-långt-svenskt-filnamn-åäö-'.repeat(8) + '.pdf'
      await chooser.setFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from('synthetic UI fixture only') })
      await expect(status).toHaveText(name)
      await expect(button).toHaveAccessibleDescription(name)
      await button.focus()
    }
    assert.equal(await page.evaluate(() => window.uploads), 0, 'Selecting a file must not upload it')
    await page.screenshot({ path: path.join(dir, `picker-${width}.png`) })
    const bounds = await dialog.evaluate(el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, overflow: el.scrollWidth > el.clientWidth }
    })
    assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height)
    assert.equal(bounds.overflow, false, 'Long filenames must not cause horizontal clipping')
    await dialog.getByLabel('Beskriv tillägget').fill('Syntetiskt UI-prov')
    await dialog.getByRole('button', { name: 'Spara bilagetillägg' }).click()
    await expect(button).toBeDisabled(); await expect(input).toBeDisabled()
    await expect.poll(() => page.evaluate(() => !!window.finishSave)).toBe(true)
    await page.evaluate(() => window.finishSave())
    await expect(button).toBeEnabled(); await expect(status).toHaveText('Ingen fil vald')
    assert.equal(await page.evaluate(() => window.uploads), 1)
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`PASS ${width}x${height}: Swedish text, filenames, keyboard file chooser, accessible description, wrapping, busy state and reset`)
  }
  console.log('PASS: offline file-picker UI checks. Screenshots: ' + dir)
} finally { await browser.close() }
