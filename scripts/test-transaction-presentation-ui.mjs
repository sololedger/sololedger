// Offline real-component tests with synthetic provenance, real styles and no DB/Auth.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'
import { kan84Fixture } from './fixtures/kan84-presentation.ts'

const fixture = `
import { createRoot } from 'react-dom/client'
import TransactionTable from './src/components/TransactionTable'
import { kan84Fixture } from './scripts/fixtures/kan84-presentation'
const {transactions, journalMap} = kan84Fixture()
const common = {user_id:'fixture-owner',booked:true,vat_rate:0,source:'manual',is_correction:false}
for(const [ver,description,source,correction,corrects] of [
  [70,'Vanlig kostnad','manual',false,null], [71,'Vanlig försäljning','manual',false,null],
  [80,'Befintlig KORRVER','manual',true,79],
  [90,'Ångrad SIE-import: synthetic.se — korrigering av VER-88','sie_import_undo',true,88],
  [91,'Ångrad SIE-import: synthetic.se — korrigering av VER-89','sie_import_undo',true,89]]) {
  const id='other-'+ver
  transactions.push({...common,id,date:'2026-10-01',description,amount:57,type:'ordinary',source,
    is_correction:correction,corrects_ver_nr:corrects,import_batch_id:source==='sie_import_undo'?'synthetic-undo':null})
  journalMap[id]=[{id:id+'d',transaction_id:id,user_id:common.user_id,date:'2026-10-01',ver_nr:ver,account_number:ver===71?'1930':'5420',debit:57,credit:0},
    {id:id+'c',transaction_id:id,user_id:common.user_id,date:'2026-10-01',ver_nr:ver,account_number:ver===71?'3010':'1930',debit:0,credit:57}]
}
const original=JSON.stringify({transactions,journalMap})
transactions.forEach(Object.freeze);Object.values(journalMap).forEach(rows=>{rows.forEach(Object.freeze);Object.freeze(rows)})
Object.freeze(transactions);Object.freeze(journalMap)
window.verifyOriginal=()=>JSON.stringify({transactions,journalMap})===original
window.fixtureCalls=[]
window.open=(...args)=>{window.fixtureCalls.push(['open',...args]);return null}
createRoot(document.getElementById('root')).render(<TransactionTable transactions={transactions} journalMap={journalMap}
 kontoplan={[]} selectedYear={2026} isYearLocked={false} editingId={null}
 onEdit={tx=>window.fixtureCalls.push(['edit',tx.id])} onDelete={tx=>window.fixtureCalls.push(['correct',tx.id])} onFavorite={()=>{}} />)
`
const bundle = await build({
  stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  tsconfig: path.resolve('tsconfig.json'), bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'offline-storage', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'offline-storage', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const supabase={storage:{from:bucket=>({createSignedUrl:async(file,ttl)=>{
        window.fixtureCalls.push(['signed',bucket,file,ttl]);return {data:{signedUrl:'https://attachment.invalid/view'}}
      }})}}` }))
  } }],
})
const styles = (await readFile('src/app/globals.css', 'utf8')).replace('@import "tailwindcss";',
  '@import "tailwindcss" source(none);\n@source "./src/components/TransactionTable.tsx";\n@source "./src/components/AttachmentTransactionGroup.tsx";\n@source "./src/components/TransactionPresentation.tsx";')
const css = await postcss([tailwindcss()]).process(styles, { from: path.resolve('history-presentation-ui.css') })
await mkdir('test-results/history-presentation', { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const requests = []
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort() })
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css.css })
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const visibleText = text => page.getByText(text, { exact: true }).filter({ visible: true })
    const row = ver => viewport.width >= 768
      ? page.locator('tr').filter({ has: page.getByText('VER-' + ver, { exact: true }) })
      : visibleText('VER-' + ver).locator('../../..')
    await expect(visibleText('Bokföringsrättelse')).toHaveCount(4)
    for (let ver = 28; ver <= 32; ver++) {
      await expect(row(ver)).toContainText('Adobe – återbetalning')
      await expect(row(ver)).toContainText('Inbetalning till bank')
      await expect(row(ver).getByText('+57 kr', { exact: true })).toHaveClass(/text-emerald-600/)
      await expect(row(ver).getByText('Bokföringsrättelse', { exact: true })).toHaveCount(0)
    }
    for (let ver = 18; ver <= 21; ver++) {
      await expect(row(ver).getByText('Omfört 285 kr', { exact: true })).toHaveClass(/text-gray-700/)
      await expect(row(ver)).toContainText('Ingen ny bankbetalning')
      await expect(row(ver)).toContainText('VER-' + [10, 12, 13, 15][ver - 18])
      await expect(row(ver).getByText('Bokföringsrättelse', { exact: true })).toHaveClass(/bg-amber-50/)
    }
    await expect(row(70)).toContainText('- 57 kr')
    await expect(row(71)).toContainText('+ 57 kr')
    await expect(row(80)).toContainText('Befintlig KORRVER')
    await expect(row(22)).toContainText('- 285 kr')
    const original = kan84Fixture().transactions.find(t => t.id === 'synthetic-tx-18').description
    await row(18).getByText('Visa originalbeskrivning', { exact: true }).click()
    await expect(row(18).getByText(original, { exact: true })).toBeVisible()
    await row(18).screenshot({ path: `test-results/history-presentation/${viewport.width}-reclass.png` })
    await row(28).screenshot({ path: `test-results/history-presentation/${viewport.width}-refund.png` })
    const search = page.getByRole('searchbox', { name: 'Sök transaktionshistorik' })
    await search.fill('Adobe')
    await expect(page.getByText('Visar 19 inkluderade av 24 transaktioner')).toBeVisible()
    for (const month of ['juni', 'juli', 'augusti', 'september', 'oktober']) {
      await expect(visibleText('Adobe – EU-tjänst ' + month + ' 2026')).toBeVisible()
    }
    await search.fill('TESTINVOICE6')
    await expect(page.getByText('Visar 1 inkluderade av 24 transaktioner')).toBeVisible()
    await search.fill('')
    await page.screenshot({ path: `test-results/history-presentation/${viewport.width}-rows.png`, fullPage: true })
    await page.getByRole('switch', { name: 'Gruppera gemensamma underlag' }).click()
    const group = page.getByRole('region', { name: 'Gemensamt underlag' }).filter({ visible: true })
    await expect(group).toHaveCount(1)
    await group.getByRole('button', { name: 'Visa verifikationer', exact: true }).click()
    await expect(group.getByRole('article')).toHaveCount(15)
    await expect(group.getByText('Bokföringsrättelse', { exact: true })).toHaveCount(4)
    await expect(group.getByText('+57 kr', { exact: true })).toHaveCount(5)
    await expect(group.getByText('Omfört 285 kr', { exact: true })).toHaveCount(4)
    const reclass = group.getByRole('article', { name: 'VER-18', exact: true })
    await reclass.getByText('Visa originalbeskrivning', { exact: true }).click()
    await expect(reclass.getByText(original, { exact: true })).toBeVisible()
    await expect(reclass).toContainText('Konto 1680')
    await expect(reclass).toContainText('Konto 5420')
    await reclass.screenshot({ path: `test-results/history-presentation/${viewport.width}-group-reclass.png` })
    await group.getByRole('button', { name: 'Visa gemensam bilaga', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => window.fixtureCalls), [
      ['signed', 'attachments', 'fixture-owner/synthetic-evidence.pdf', 60], ['open', 'https://attachment.invalid/view', '_blank'],
    ])
    await group.getByRole('article', { name: 'VER-28', exact: true }).getByRole('button', { name: 'Hantera bilaga' }).click()
    assert.deepEqual(await page.evaluate(() => window.fixtureCalls.at(-1)), ['edit', 'synthetic-tx-28'])
    await page.screenshot({ path: `test-results/history-presentation/${viewport.width}-group.png`, fullPage: true })
    await search.fill('Adobe')
    await expect(group).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('sökning och filtrering')
    assert.equal(await page.evaluate(() => window.verifyOriginal()), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
    assert.deepEqual(errors, [])
    assert.deepEqual(requests, [])
    console.log(`PASS: KAN-87 actual desktop/mobile/group UI at ${viewport.width}px; signs, colors, names, original details, search, actions and offline isolation`)
    await page.close()
  }
} finally { await browser.close() }
