// Focused actual-component test. Synthetic adapter; no Auth, env or network.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'

const fixture = `import {createRoot} from 'react-dom/client';import Table from './src/components/TransactionTable';
const root=createRoot(document.getElementById('root'));
window.mount=(owner='owner-a',mode='cross',locked=true)=>{
 window.mode=mode;window.owner=owner;window.reads=[];window.calls=[];
 const original={id:owner+'-original',user_id:owner,date:'2025-04-15',description:'Syntetiskt original',booked:true,source:'manual',type:'cost',amount:1000,vat_rate:0,file_url:owner+'/original.pdf'};
 const correction={id:owner+'-correction',user_id:owner,date:mode==='same'?'2025-11-02':'2026-11-02',description:'Syntetisk rättelse',is_correction:true,corrects_ver_nr:3,booked:true,source:'manual',amount:1000};
 const txs=mode==='same'?[original,correction]:[original];
 const journalMap=Object.fromEntries(txs.map((t,i)=>[t.id,[{id:t.id+'-journal',user_id:owner,transaction_id:t.id,ver_nr:i===0?3:4,account_number:'1930',debit:1000,credit:0}]]));
 const snapshot=JSON.stringify({txs,journalMap});txs.forEach(Object.freeze);Object.values(journalMap).forEach(rows=>{rows.forEach(Object.freeze);Object.freeze(rows)});Object.freeze(txs);Object.freeze(journalMap);
 window.unchanged=()=>snapshot===JSON.stringify({txs,journalMap});
 root.render(<Table transactions={txs} journalMap={journalMap} selectedYear={2025} kontoplan={[]} isYearLocked={locked} editingId={null} onEdit={()=>window.calls.push('edit')} onDelete={()=>window.calls.push('correct')} onFavorite={()=>{}} onUploadAttachment={async()=>{window.calls.push('upload');return owner+'/new.pdf'}}/>);
};window.open=(...args)=>{window.calls.push(['open',...args]);return null};window.mount();`
const mock = `export const supabase={from:table=>{const eqs={},ins={};const b={select:()=>b,eq:(k,v)=>{eqs[k]=v;return b},in:(k,v)=>{ins[k]=v;return b},order:()=>b,range:async(from,to)=>{
 const mode=window.mode,owner=eqs.user_id;window.reads.push({table,eqs,ins});
 if(table==='transactions'&&mode==='delay')await new Promise(resolve=>window.release=resolve);
 if(table==='transactions'&&mode==='fail')return {data:null,error:{message:'synthetic offline'},count:null};
 if(table==='journal_entries'&&mode==='journal-fail')return {data:null,error:{message:'synthetic offline'},count:null};
 let rows=table==='transactions'&&mode!=='none'?[{id:owner+'-correction',user_id:mode==='foreign'?'foreign-owner':owner,date:mode==='same'?'2025-11-02':'2026-11-02',is_correction:true,corrects_ver_nr:3}]:
 table==='journal_entries'?[{id:'correction-journal',user_id:owner,transaction_id:owner+'-correction',ver_nr:4}]:[];
 return {data:rows.slice(from,to+1),count:rows.length,error:null};}};return b;},storage:{from:bucket=>({createSignedUrl:async(file,ttl)=>{window.calls.push(['signed',bucket,file,ttl]);return {data:{signedUrl:'https://synthetic.invalid/original'}}}})}};`
const bundled = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  tsconfig: path.resolve('tsconfig.json'), bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline', setup(b) {
    b.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'mock', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: mock }))
  } }] })
const css = await postcss([tailwindcss()]).process((await readFile('src/app/globals.css', 'utf8'))
  .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./src/components/TransactionTable.tsx";\n@source "./src/components/AttachmentTransactionGroup.tsx";\n@source "./src/components/TransactionCorrectionHistory.tsx";\n@source "./src/components/AccountingAttachmentHistory.tsx";'), { from: path.resolve('kan129-corrections.css') })
const dir = path.resolve('test-results/kan129-corrections-' + Date.now())
await mkdir(dir, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
let checks = 0
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', r => r.abort())
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css.css }); await page.addScriptTag({ content: bundled.outputFiles[0].text })
    const visible = text => page.getByText(text, { exact: true }).filter({ visible: true })
    const originalRow = () => width >= 768 ? page.getByRole('row').filter({ hasText: 'Syntetiskt original' }) : visible('Syntetiskt original').locator('..')
    const link = 'Rättad genom VER-4, 2026-11-02'
    for (const mode of ['cross', 'same', 'none', 'fail', 'journal-fail', 'foreign']) {
      await page.evaluate(mode => window.mount('owner-a', mode, true), mode)
      await expect.poll(() => page.evaluate(() => window.reads.filter(r => r.table === 'transactions').length)).toBeGreaterThan(0)
      if (['fail', 'journal-fail', 'foreign'].includes(mode)) {
        await expect(originalRow().getByRole('alert')).toContainText('Rättelsehistoriken kunde inte verifieras')
        await expect(visible(link)).toHaveCount(0)
      } else if (mode === 'none') {
        await expect(originalRow().getByRole('status')).toHaveCount(0)
        await expect(originalRow().getByTestId('correction-history')).toHaveCount(0)
        await expect(originalRow().getByRole('alert')).toHaveCount(0)
      } else {
        await expect(originalRow()).toContainText('Rättat original')
        await expect(visible('Rättad genom VER-4, ' + (mode === 'same' ? '2025' : '2026') + '-11-02')).toBeVisible()
        await expect(originalRow()).toContainText('Rättelsens räkenskapsår: ' + (mode === 'same' ? '2025' : '2026'))
        await expect(visible('Syntetiskt original')).toHaveClass(/text-gray-500 line-through/)
        await expect(originalRow()).toHaveClass(/bg-gray-50/)
        await expect(originalRow().getByTestId('correction-history')).toHaveClass(/text-amber-800/)
        const fileButton = originalRow().getByRole('button', { name: '📎 Visa originalbilaga', exact: true })
        await expect(fileButton).toHaveClass(/text-emerald-700/)
        await expect(fileButton).toHaveClass(/underline/)
        assert.equal(await fileButton.evaluate(el => {
          for (let node = el; node; node = node.parentElement) if (Number(getComputedStyle(node).opacity) !== 1) return false
          return getComputedStyle(el).textDecorationLine.includes('line-through') === false
        }), true, 'Original link must stay fully readable')
        if (mode === 'cross') {
          await expect(page.getByText('Syntetisk rättelse', { exact: true })).toHaveCount(0)
          await expect(originalRow().getByText(/^- 1\s000 kr$/)).toBeVisible()
        } else {
          await expect(visible('Syntetisk rättelse')).toHaveClass(/text-amber-700/)
          await expect(visible('Syntetisk rättelse')).not.toHaveClass(/line-through/)
          await expect(originalRow().getByText(/^1\s000 kr$/)).toBeVisible()
        }
        await page.screenshot({ path: path.join(dir, `${mode}-${width}-locked.png`), fullPage: true })
      }
      const reads = await page.evaluate(() => window.reads)
      assert(reads.length > 0); assert(reads.every(r => r.eqs.user_id === 'owner-a'))
      assert(reads.filter(r => r.table === 'transactions').every(r => r.eqs.is_correction === true && r.ins.corrects_ver_nr.includes(3)))
      assert.equal(await page.evaluate(() => window.unchanged()), true)
      await expect(originalRow().getByRole('button', { name: /^✎/ })).toHaveCount(0)
      await expect(originalRow().getByRole('button', { name: /^✕/ })).toHaveCount(0)
      // File availability and the locked-year read-only history do not depend on the sidecar read.
      await originalRow().getByRole('button', { name: /📎 Visa (original)?bilaga/ }).click()
      await expect.poll(() => page.evaluate(() => window.calls.slice(-2))).toEqual([
        ['signed', 'attachments', 'owner-a/original.pdf', 60], ['open', 'https://synthetic.invalid/original', '_blank'],
      ])
      await originalRow().getByLabel('Bilagealternativ').click()
      await originalRow().getByRole('button', { name: 'Hantera bilagor' }).click()
      const dialog = page.getByRole('dialog', { name: 'Hantera bilagor' })
      await expect(dialog).toContainText('Året är låst')
      await expect(dialog.getByLabel('Kompletterande bilaga')).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: 'Spara bilagetillägg' })).toHaveCount(0)
      await page.keyboard.press('Escape')
      checks++; console.log('PASS ' + width + ': ' + mode)
    }
    // Owner/year-scope change hides stale metadata immediately and ignores late replies.
    await page.evaluate(() => window.mount('owner-a', 'delay', true))
    await expect.poll(() => page.evaluate(() => !!window.release)).toBe(true)
    await expect(originalRow().getByRole('status')).toContainText('Kontrollerar rättelsehistorik')
    await page.evaluate(() => window.mount('owner-b', 'none', true))
    await expect(originalRow().getByRole('status')).toHaveCount(0)
    await page.evaluate(() => window.release())
    await expect(visible(link)).toHaveCount(0)
    await expect(originalRow().getByRole('alert')).toHaveCount(0)
    checks++
    // Metadata must not alter the existing action policy even for an unlocked original.
    await page.evaluate(() => window.mount('owner-a', 'cross', false))
    await expect(visible(link)).toBeVisible()
    await expect(originalRow().getByRole('button', { name: /^✎/ })).toBeVisible()
    await expect(visible('Syntetiskt original')).toHaveClass(/line-through/)
    assert.equal(await page.evaluate(() => window.unchanged()), true)
    await page.screenshot({ path: path.join(dir, `cross-year-${width}.png`), fullPage: true })
    assert.deepEqual(errors, []); checks++; await page.close()
  }
  console.log(JSON.stringify({ status: 'PASS', checks, network: 'blocked', evidence: dir }))
} finally { await browser.close() }
