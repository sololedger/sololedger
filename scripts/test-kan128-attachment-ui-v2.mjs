// Actual React/Tailwind UI and Chrome PDF viewer, localhost synthetic bytes only.
// Supabase adapter is simulated; DB/RLS assertions belong to the isolated DB suite.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'
import { validAttachmentPdf, invalidAttachmentPdf } from '../tests/fixtures/kan128-pdf.mjs'

const checks = [], blocked = [], uploads = []
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const assets = new Map(['original', 'replacement', 'extra'].map(name =>
  ['owner-a/' + name + '.pdf', validAttachmentPdf('KAN128 synthetic ' + name)]))
assets.set('owner-a/invalid.pdf', invalidAttachmentPdf)
function pdfInfo(bytes) {
  const r = spawnSync(process.env.KAN128_PDFINFO || 'pdfinfo', ['-'], { input: bytes, windowsHide: true })
  if (r.error) throw r.error
  return { valid: r.status === 0 && /^Pages:\s+1\s*$/m.test(r.stdout.toString()), exit: r.status }
}
for (const [name, bytes] of assets) assert.equal(pdfInfo(bytes).valid, !name.includes('invalid'))
checks.push({ name: 'Independent Poppler parser accepts all three valid PDFs and rejects the header-only fake', status: 'PASS' })
const originalHash = sha(assets.get('owner-a/original.pdf'))
const dir = path.resolve('test-results', 'kan128-ui-v2-' + Date.now())
await fs.mkdir(dir, { recursive: true })

const mock = `export const supabase={
from:table=>{const eqs={},ins={};const b={select:()=>b,eq:(k,v)=>{eqs[k]=v;return b},in:(k,v)=>{ins[k]=v;return b},order:()=>b,range:async(from,to)=>{
 window.fx.reads.push({table,eqs,ins});if(window.fx.delay)await new Promise(r=>window.release=r);
 if(window.fx.readFail)return {data:null,error:{message:'synthetic failure'},count:null};
 const rows=window.fx.rows.filter(row=>row.user_id===window.fx.actor&&Object.entries(eqs).every(([k,v])=>row[k]===v)&&Object.entries(ins).every(([k,v])=>v.includes(row[k])));
 return {data:rows.slice(from,to+1),count:rows.length,error:null};}};return b},
rpc:async(name,args)=>{window.fx.calls.push({name,args});
 if(window.fx.rpcFail||window.fx.locked||!args.p_path.startsWith(window.fx.actor+'/'))return {error:{message:'synthetic denied'}};
 const exists=await fetch('/exists?path='+encodeURIComponent(args.p_path),{headers:{'x-synthetic-owner':window.fx.actor}});if(!exists.ok)return {error:{message:'missing'}};
 const key={transaction:'transaction_id',customer_invoice:'customer_invoice_id',supplier_invoice:'supplier_invoice_id'}[args.p_entity_type];
 if(!window.fx.rows.some(r=>r[key]===args.p_entity_id&&r.path===args.p_path))window.fx.rows.push({id:10+window.fx.rows.length,user_id:window.fx.actor,[key]:args.p_entity_id,path:args.p_path,original_path:window.fx.actor+'/original.pdf',action:'addition',actor_id:window.fx.actor,recorded_at:'2026-11-02T10:00:00Z',note:args.p_note});
 return {data:{success:true}}},
storage:{from:bucket=>({createSignedUrl:async(file,ttl)=>{window.fx.signed.push({bucket,path:file,ttl});
 const r=await fetch('/sign?path='+encodeURIComponent(file),{headers:{'x-synthetic-owner':window.fx.actor}});
 return r.ok?{data:await r.json()}:{error:{message:'not available'}};}})}
};`
const fixture = `import {createRoot} from 'react-dom/client';import History from './src/components/AccountingAttachmentHistory';import Table from './src/components/TransactionTable';
const root=createRoot(document.getElementById('root'));
const upload=async file=>{const p=window.fx.actor+'/'+file.name;const r=await fetch('/upload?path='+encodeURIComponent(p),{method:'POST',headers:{'x-synthetic-owner':window.fx.actor},body:file});if(!r.ok)throw Error('upload denied');return p};
window.mount=(owner='owner-a',locked=false,type='transaction',id='tx-a')=>{window.fx.actor=owner;window.fx.locked=locked;root.render(<History owner={owner} entityType={type} entityId={id} locked={locked} onUpload={upload}/>)};
window.mountTable=(locked=false,corrected=false,file='owner-a/original.pdf')=>{window.fx.locked=locked;const common={user_id:window.fx.actor,booked:true,type:'office',vat_rate:0,source:'manual',amount:100,date:'2026-01-10'};
const txs=[{...common,id:'tx-a',description:'Syntetisk verifikation',file_url:file},{...common,id:'tx-b',description:'Utan bilaga',file_url:null},...(corrected?[{...common,id:'correction',description:'Rättelse',is_correction:true,corrects_ver_nr:1}]:[])];
const journalMap=Object.fromEntries(txs.map((t,i)=>[t.id,[{id:'j'+i,user_id:t.user_id,transaction_id:t.id,ver_nr:i+1,account_number:'6110',debit:100,credit:0}]]));
root.render(<Table transactions={txs} journalMap={journalMap} kontoplan={[{id:'office',name:'Kontor'}]} selectedYear={2026} isYearLocked={locked} editingId={null} onEdit={()=>{}} onDelete={()=>{}} onFavorite={()=>{}} onUploadAttachment={upload}/>)};window.mount();`
const bundled = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  tsconfig: path.resolve('tsconfig.json'), bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-only', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'mock', namespace: 'synthetic' }))
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: mock }))
  } }] })
const css = await postcss([tailwindcss()]).process((await fs.readFile('src/app/globals.css', 'utf8'))
  .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./src/components/AccountingAttachmentHistory.tsx";\n@source "./src/components/TransactionTable.tsx";'), { from: path.resolve('kan128-ui-v2.css') })
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1'), file = u.searchParams.get('path')
    if (u.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>') }
    if (u.pathname === '/favicon.ico') { res.writeHead(204); return res.end() }
    const owner = req.headers['x-synthetic-owner'] ?? u.searchParams.get('owner')
    if (!['owner-a', 'owner-b'].includes(owner) || !file?.startsWith(owner + '/')) { res.writeHead(403); return res.end() }
    if (u.pathname === '/upload' && req.method === 'POST') {
      if (assets.has(file)) { res.writeHead(409); return res.end() }
      const parts = []; for await (const b of req) parts.push(b)
      const bytes = Buffer.concat(parts); assets.set(file, bytes); uploads.push({ path: file, sha256: sha(bytes), pdf: pdfInfo(bytes) })
      res.writeHead(201); return res.end()
    }
    if (req.method !== 'GET' || !assets.has(file)) { res.writeHead(404); return res.end() }
    if (u.pathname === '/sign') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ signedUrl: origin + '/file?path=' + encodeURIComponent(file) + '&owner=' + owner })) }
    if (u.pathname === '/exists') { res.writeHead(200); return res.end() }
    if (u.pathname === '/file') { res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'no-store' }); return res.end(assets.get(file)) }
    res.writeHead(404); res.end()
  } catch { res.writeHead(500); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = 'http://127.0.0.1:' + server.address().port
let browser
async function check(name, fn) { const details = await fn(); checks.push({ name, status: 'PASS', details }); console.log('PASS ' + name) }
async function pdfView(page, expected, name) {
  await expect.poll(() => page.frames().some(frame => frame.url().startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'))).toBe(true)
  const frame = page.frames().find(frame => frame.url().startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/'))
  const viewer = frame.locator('pdf-viewer')
  try { await expect.poll(() => viewer.evaluate(el => el.loadState_), { timeout: 10000 }).toBe(expected ? 'success' : 'failed') }
  catch (error) { console.error(JSON.stringify({ pdfViewerDiagnostic: { url: page.url(), frames: page.frames().map(f => f.url()), blocked, element: await viewer.evaluate(el => ({ keys: Object.keys(el), html: el.outerHTML.slice(0,300) })) } })); throw error }
  const state = await viewer.evaluate(el => ({ state: el.loadState_, completed: el.initialLoadComplete_, pages: el.documentDimensions?.pageDimensions?.length ?? 0, error: !!el.shadowRoot.querySelector('viewer-error-dialog') }))
  assert.equal(state.completed, true); assert.equal(state.pages, expected ? 1 : 0); assert.equal(state.error, !expected)
  await page.screenshot({ path: path.join(dir, name + '.png') })
  return state
}
try {
  // Full installed Chrome, not Playwright's PDF-incapable headless shell.
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } }), page = await ctx.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await ctx.route('**/*', route => {
      const u = new URL(route.request().url())
      if (u.origin === origin || ['chrome-extension:', 'chrome:', 'chrome-untrusted:'].includes(u.protocol)) return route.continue()
      blocked.push({ origin: u.origin, method: route.request().method() }); return route.abort()
    })
    await page.goto(origin)
    await page.addStyleTag({ content: css.css })
    await page.evaluate(() => { window.fx = { actor: 'owner-a', locked: false, reads: [], calls: [], signed: [], rows: [
      { id: 1, user_id: 'owner-a', transaction_id: 'tx-a', path: 'owner-a/original.pdf', original_path: 'owner-a/original.pdf', action: 'observed_existing', actor_id: null, recorded_at: '2026-11-02T07:00:00Z', note: 'Befintlig referens observerad vid införandet; tidigare bilagehistorik är okänd.' },
    ] } })
    await page.addScriptTag({ content: bundled.outputFiles[0].text })
    const dialog = page.getByRole('dialog', { name: 'Hantera bilagor' })
    const open = async () => { await page.getByRole('button', { name: 'Hantera bilagor', exact: true }).click(); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Öppna bilaga' }).first()).toBeVisible() }
    await check(width + ': discreet management and no unrequested history load', async () => {
      await expect(page.getByRole('button', { name: 'Hantera bilagor', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Bilagehistorik och tillägg' })).toHaveCount(0)
      assert.equal(await page.evaluate(() => window.fx.reads.length), 0)
    })
    await check(width + ': separate dialog, truthful reference text and collapsed technical details', async () => {
      await open(); await expect(dialog.getByText('Registrerad referens. Filens innehåll är inte verifierat.')).toBeVisible()
      await expect(dialog.getByText(/Befintlig referens observerad vid införandet/)).not.toBeVisible()
      await expect(dialog.getByText('Tidigare registreringstid och användare är okända.')).not.toBeVisible()
      await dialog.getByText('Registreringsuppgifter', { exact: true }).click()
      await expect(dialog.getByText('Tidigare registreringstid och användare är okända.')).toBeVisible()
      const read = await page.evaluate(() => window.fx.reads[0]); assert.deepEqual(read.eqs, { user_id: 'owner-a', transaction_id: 'tx-a' })
      assert.equal(await dialog.evaluate(el => el.parentElement === document.body), true)
    })
    await check(width + ': original actually displays in Chrome PDF viewer', async () => {
      const popup = page.waitForEvent('popup'); await dialog.getByRole('button', { name: 'Öppna bilaga' }).first().click()
      const pdf = await popup; const state = await pdfView(pdf, true, 'original-' + width); await pdf.close(); return state
    })
    await check(width + ': real browser upload to localhost, idempotent retry and actual PDF display', async () => {
      const name = 'uploaded-' + width + '.pdf', bytes = validAttachmentPdf('KAN128 uploaded ' + width)
      await dialog.getByLabel('Kompletterande bilaga').setInputFiles({ name, mimeType: 'application/pdf', buffer: bytes })
      await dialog.getByLabel('Beskriv tillägget').fill('Syntetiskt tillägg ' + width)
      await page.evaluate(() => window.fx.rpcFail = true)
      await dialog.getByRole('button', { name: 'Spara bilagetillägg' }).click()
      await expect(dialog.getByRole('alert')).toContainText('kunde inte bekräftas')
      await page.evaluate(() => window.fx.rpcFail = false)
      await dialog.getByRole('button', { name: 'Spara bilagetillägg' }).click()
      const row = dialog.locator('li').filter({ hasText: 'Syntetiskt tillägg ' + width }); await expect(row).toBeVisible()
      assert.equal(uploads.filter(upload => upload.path.endsWith('/' + name)).length, 1)
      assert.equal(sha(assets.get('owner-a/' + name)), sha(bytes)); assert.equal(pdfInfo(assets.get('owner-a/' + name)).valid, true)
      const popup = page.waitForEvent('popup'); await row.getByRole('button', { name: 'Öppna bilaga' }).click()
      const pdf = await popup; await pdfView(pdf, true, 'uploaded-' + width); await pdf.close()
    })
    await check(width + ': original and replacement remain individually readable', async () => {
      await dialog.getByRole('button', { name: 'Stäng', exact: true }).click()
      await page.evaluate(() => window.fx.rows.push({ id: 2, user_id: 'owner-a', transaction_id: 'tx-a', path: 'owner-a/replacement.pdf', original_path: 'owner-a/original.pdf', action: 'replacement', actor_id: 'owner-a', recorded_at: '2026-11-02T10:00:00Z', note: 'Bilagereferens bytt; tidigare underlag bevarat.' }))
      await open(); await expect(dialog.getByText('Byte av bilaga', { exact: true })).toBeVisible()
      for (const name of ['Äldre bilagereferens', 'Byte av bilaga']) {
        const popup = page.waitForEvent('popup'); await dialog.locator('li').filter({ hasText: name }).getByRole('button', { name: 'Öppna bilaga' }).click()
        const pdf = await popup; await pdfView(pdf, true, (name === 'Byte av bilaga' ? 'replacement-' : 'original-after-replacement-') + width); await pdf.close()
      }
      assert.equal(sha(assets.get('owner-a/original.pdf')), originalHash)
    })
    await check(width + ': locked year stays readable without additions', async () => {
      await page.evaluate(() => window.mount('owner-a', true))
      await expect(dialog.getByText(/Året är låst/)).toBeVisible(); await expect(dialog.getByLabel('Kompletterande bilaga')).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Öppna bilaga' }).first()).toBeEnabled()
      await page.screenshot({ path: path.join(dir, 'locked-' + width + '.png') })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert(await dialog.evaluate(el => el.getBoundingClientRect().width <= innerWidth - 30))
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
    })
    await check(width + ': owner change discards original history and denies foreign file access', async () => {
      await page.evaluate(() => window.mount('owner-b', false, 'customer_invoice', 'invoice-b'))
      await page.getByRole('button', { name: 'Hantera bilagor', exact: true }).click(); await expect(dialog.getByText('Ingen bilagehistorik registrerad.')).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Öppna bilaga' })).toHaveCount(0)
      const status = await page.evaluate(async () => (await fetch('/sign?path=owner-a/original.pdf', { headers: { 'x-synthetic-owner': 'owner-b' } })).status)
      assert.equal(status, 403); await page.keyboard.press('Escape')
    })
    await check(width + ': failed history read offers no upload', async () => {
      await page.evaluate(() => { window.fx.readFail = true; window.mount('owner-a', false, 'supplier_invoice', 'supplier-a') })
      await page.getByRole('button', { name: 'Hantera bilagor', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('kunde inte hämtas')
      await expect(dialog.getByLabel('Kompletterande bilaga')).toHaveCount(0); await page.keyboard.press('Escape')
    })
    await check(width + ': delayed old-owner response never appears for new owner', async () => {
      await page.evaluate(() => { window.fx.readFail = false; window.fx.delay = true; window.mount('owner-a', false, 'transaction', 'delayed') })
      await page.getByRole('button', { name: 'Hantera bilagor', exact: true }).click(); await expect.poll(() => page.evaluate(() => !!window.release)).toBe(true)
      await page.evaluate(() => window.mount('owner-b', false, 'transaction', 'new-owner'))
      await page.evaluate(() => { window.fx.delay = false; window.release() })
      await expect(dialog).toHaveCount(0); await expect(page.getByText(/Äldre bilagereferens/)).toHaveCount(0)
    })
    await check(width + ': list keeps primary link, only actual changes get History, dialog outside table', async () => {
      await page.evaluate(() => { window.fx.actor = 'owner-a'; window.mountTable(false, false, 'owner-a/replacement.pdf') })
      await expect(page.getByRole('button', { name: '📎 Visa bilaga', exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Historik', exact: true }).filter({ visible: true })).toHaveCount(1)
      await expect(page.getByText(/Befintlig referens observerad vid införandet/)).toHaveCount(0)
      assert((await page.evaluate(() => window.fx.reads.filter(read => read.ins.action).length)) <= 2)
      const primaryPopup = page.waitForEvent('popup')
      await page.getByRole('button', { name: '📎 Visa bilaga', exact: true }).filter({ visible: true }).click()
      const primaryPdf = await primaryPopup; await pdfView(primaryPdf, true, 'primary-link-' + width); await primaryPdf.close()
      await page.getByRole('button', { name: 'Historik', exact: true }).filter({ visible: true }).click(); await expect(dialog).toBeVisible()
      assert.equal(await dialog.evaluate(el => el.closest('table') === null), true)
      await dialog.getByRole('button', { name: 'Stäng', exact: true }).click()
      await page.screenshot({ path: path.join(dir, 'list-' + width + '.png'), fullPage: true })
      // No-history verification still has the discreet management menu.
      const emptyRow = page.getByText('Utan bilaga', { exact: true }).filter({ visible: true })
        .locator('xpath=ancestor::*[.//*[@data-testid="accounting-attachment-history"]][1]')
      const emptyMenu = emptyRow.getByLabel('Bilagealternativ', { exact: true })
      await emptyMenu.click()
      await emptyRow.getByRole('button', { name: 'Hantera bilagor', exact: true }).click()
      await expect(dialog.getByText('Ingen bilagehistorik registrerad.')).toBeVisible()
      await dialog.getByLabel('Kompletterande bilaga').setInputFiles({ name: 'list-uploaded-' + width + '.pdf', mimeType: 'application/pdf', buffer: validAttachmentPdf('KAN128 list upload ' + width) })
      await dialog.getByLabel('Beskriv tillägget').fill('Tillägg direkt från listans meny')
      await dialog.getByRole('button', { name: 'Spara bilagetillägg' }).click()
      await expect(dialog.getByText('Tillägg direkt från listans meny', { exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(emptyMenu).toBeFocused()
      await expect(page.getByRole('button', { name: 'Historik', exact: true }).filter({ visible: true })).toHaveCount(2)
      await page.setViewportSize({ width: width === 390 ? 1280 : 390, height: 900 })
      await expect(page.getByRole('button', { name: 'Historik', exact: true }).filter({ visible: true })).toHaveCount(2)
      await page.setViewportSize({ width, height: 900 })
    })
    await check(width + ': initial-only history is quiet and correction shortcut condition is unchanged', async () => {
      // New synthetic session for an initial-only fixture; immutable history is not deleted in the product.
      await page.evaluate(() => window.mount('owner-b', false))
      await expect(page.getByRole('button', { name: 'Hantera bilagor', exact: true })).toBeVisible()
      await page.evaluate(() => { window.fx.actor = 'owner-a'; window.fx.rows = window.fx.rows.filter(row => row.action === 'observed_existing'); window.mountTable(false, false, 'owner-a/original.pdf') })
      await expect(page.getByRole('button', { name: 'Historik', exact: true })).toHaveCount(0)
      await page.evaluate(() => window.mountTable(false, true, 'owner-a/original.pdf'))
      await expect(page.getByRole('button', { name: '📎 Visa bilaga', exact: true })).toHaveCount(0)
      // Full domain history still opens the original, without claiming KAN-129 fixed.
      await page.evaluate(() => window.mount('owner-a', true)); await open()
      const popup = page.waitForEvent('popup'); await dialog.getByRole('button', { name: 'Öppna bilaga' }).first().click()
      const pdf = await popup; await pdfView(pdf, true, 'original-after-correction-state-' + width); await pdf.close(); await page.keyboard.press('Escape')
    })
    await check(width + ': invalid PDF fails both parser and actual Chrome viewer despite HTTP 200', async () => {
      const response = await ctx.request.get(origin + '/file?path=owner-a%2Finvalid.pdf&owner=owner-a')
      assert.equal(response.status(), 200); assert.equal(pdfInfo(invalidAttachmentPdf).valid, false)
      await page.evaluate(() => {
        window.fx.rows.push({ id: 99, user_id: 'owner-a', transaction_id: 'invalid', path: 'owner-a/invalid.pdf', original_path: 'owner-a/invalid.pdf', action: 'initial', actor_id: 'owner-a', recorded_at: '2026-11-02T10:00:00Z', note: 'Synthetic invalid file' })
        window.mount('owner-a', false, 'transaction', 'invalid')
      })
      await open(); await expect(dialog.getByText('Registrerad referens. Filens innehåll är inte verifierat.')).toBeVisible()
      const popup = page.waitForEvent('popup'); await dialog.getByRole('button', { name: 'Öppna bilaga' }).click()
      const pdf = await popup; const state = await pdfView(pdf, false, 'invalid-rejected-' + width); await pdf.close()
      await expect(dialog.getByText('Registrerad referens. Filens innehåll är inte verifierat.')).toBeVisible()
      await page.keyboard.press('Escape'); return state
    })
    assert.deepEqual(errors, []); await ctx.close()
  }
  assert.deepEqual(blocked, []); assert.equal(sha(assets.get('owner-a/original.pdf')), originalHash)
  const result = { status: 'PASS', checks, browser: { channel: 'chrome', version: browser.version(), pdfViewer: 'native Chrome PDF viewer, loadState plus page dimensions and error dialog' }, viewports: [1280, 390], uploads, network: '127.0.0.1 only; no env or hosted connection', limitation: 'Synthetic adapter and localhost file service; real Supabase Storage integration needs new Staging GO', screenshots: dir }
  await fs.writeFile(path.join(dir, 'RESULT.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ status: 'PASS', checks: checks.length, browser: result.browser, evidence: dir }))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
