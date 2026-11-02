// Isolated Playwright component checks: synthetic data, real React component and
// real Tailwind styles; the Supabase module is replaced at bundle time. No env/Auth/DB.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwindcss from '@tailwindcss/postcss'
import { chromium, expect } from '@playwright/test'

const fixture = `
import { createRoot } from 'react-dom/client'
import TransactionTable from './src/components/TransactionTable'
const common = { user_id: 'fixture-owner', booked: true, type: 'programvaror', vat_rate: 0, source: 'manual' }
const defaultTransactions = [
  { ...common, id: 'a', date: '2026-10-16', description: 'FULL ORIGINAL A — teknisk text uid-X\\nAndra raden', amount: 228, file_url: 'fixture-owner/private.pdf' },
  { ...common, id: 'b', date: '2026-10-03', description: 'FULL ORIGINAL B', amount: 57, file_url: 'fixture-owner/private.pdf' },
  ...['u1', 'u2'].map((id, i) => ({ ...common, id, date: '2026-10-02', description: 'Ångrad SIE-import: test.se — korrigering av VER-' + (10 + i), amount: 100, is_correction: true, corrects_ver_nr: 10 + i, source: 'sie_import_undo', import_batch_id: 'fixture-batch', file_url: 'fixture-owner/private.pdf' })),
  ...Array.from({ length: 53 }, (_, i) => ({ ...common, id: 'single-' + i, date: '2026-09-01', description: 'Vanlig bokning ' + i, amount: 100 + i, file_url: i === 0 ? 'fixture-owner/single.pdf' : null })),
]
const multipleGroups = [
  ...Array.from({ length: 102 }, (_, i) => ({ ...common, id: 'before-' + i, date: '2026-12-31', description: 'BEFORE ' + i, amount: 100 })),
  ...Array.from({ length: 20 }, (_, i) => ({ ...common, id: 'undo-' + i, date: '2026-12-30', description: 'Ångrad SIE-import: pagination.se — korrigering av VER-' + i, amount: 100, is_correction: true, source: 'sie_import_undo', import_batch_id: 'pagination-batch' })),
  ...['A', 'B'].map(id => ({ ...common, id: 'first-' + id, date: '2026-10-12', description: 'FIRST GROUP ' + id, amount: 100, file_url: 'fixture-owner/first.pdf' })),
  ...Array.from({ length: 55 }, (_, i) => ({ ...common, id: 'between-' + i, date: '2026-09-01', description: 'BETWEEN ' + i, amount: 100 })),
  ...['A', 'B', 'C'].map(id => ({ ...common, id: 'last-' + id, date: '2026-08-01', description: 'LAST GROUP ' + id, amount: 100, file_url: 'fixture-owner/last.pdf' })),
]
const correctedTransactions = [
  { ...common, id: 'unique', date: '2026-10-16', description: 'Rättat unikt underlag', amount: 100, file_url: 'fixture-owner/unique.pdf' },
  { ...common, id: 'unique-correction', date: '2026-10-17', description: 'Rättelse av unikt underlag', amount: 100, is_correction: true, corrects_ver_nr: 201 },
  { ...common, id: 'shared', date: '2026-10-16', description: 'Rättat gemensamt underlag', amount: 100, file_url: 'fixture-owner/shared.pdf' },
  { ...common, id: 'shared-correction', date: '2026-10-17', description: 'Rättelse av gemensamt underlag', amount: 100, is_correction: true, corrects_ver_nr: 203 },
  { ...common, id: 'peer', date: '2026-10-15', description: 'Annan post med samma underlag', amount: 100, file_url: 'fixture-owner/shared.pdf' },
  { ...common, id: 'missing', date: '2026-10-14', description: 'Original utan bilaga', amount: 100 },
  { ...common, id: 'missing-correction', date: '2026-10-17', description: 'Rättelse utan bilaga', amount: 100, is_correction: true, corrects_ver_nr: 206 },
]
const transactions = window.fixtureMode === 'corrections' ? correctedTransactions : window.fixtureMode === 'multiple' ? multipleGroups
  : window.fixtureMode === 'none' ? [{ ...common, id: 'only', date: '2026-10-12', description: 'Ensam verifikation', amount: 100, file_url: 'fixture-owner/only.pdf' }]
  : window.fixtureMode === 'empty' ? [] : defaultTransactions
const journalMap = Object.fromEntries(transactions.map((tx, i) => [tx.id, [
  { id: 'd' + i, transaction_id: tx.id, ver_nr: 201 + i, account_number: '5420', debit: tx.amount, credit: 0 },
  { id: 'c' + i, transaction_id: tx.id, ver_nr: 201 + i, account_number: '1930', debit: 0, credit: tx.amount },
]]))
const original = JSON.stringify({ transactions, journalMap })
for (const tx of transactions) Object.freeze(tx)
for (const rows of Object.values(journalMap)) { rows.forEach(Object.freeze); Object.freeze(rows) }
Object.freeze(transactions); Object.freeze(journalMap)
window.fixtureCalls = []
window.fixtureReads = []
window.fixtureHistory = window.fixtureMode === 'corrections' ? [{ id: 1, user_id: 'fixture-owner', transaction_id: 'unique', path: 'fixture-owner/old.pdf', original_path: 'fixture-owner/old.pdf', action: 'replacement', actor_id: 'fixture-owner', recorded_at: '2026-10-16T12:00:00Z', note: 'Tidigare underlag bevarat.' }] : []
window.open = (...args) => { window.fixtureCalls.push(['open', ...args]); return null }
window.verifyOriginal = () => original === JSON.stringify({ transactions, journalMap })
createRoot(document.getElementById('root')).render(<TransactionTable
  transactions={transactions} journalMap={journalMap} selectedYear={2026}
  kontoplan={[{ id: 'programvaror', name: 'Programvaror' }]} isYearLocked={!!window.fixtureLocked} editingId={null}
  onEdit={tx => window.fixtureCalls.push(['edit', tx.id])}
  onDelete={tx => window.fixtureCalls.push(['correct', tx.id])} onFavorite={() => {}}
  onUploadAttachment={async () => { throw new Error('Unexpected upload in read-only test') }} />)
`

const bundle = await build({
  stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  tsconfig: path.resolve('tsconfig.json'), bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'offline-storage', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'offline-storage', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const supabase = { from: table => { const eqs={},ins={}; const b={select:()=>b,eq:(k,v)=>{eqs[k]=v;return b},in:(k,v)=>{ins[k]=v;return b},order:()=>b,range:async()=>{
        window.fixtureReads.push({table,eqs,ins}); const rows=window.fixtureHistory.filter(r=>Object.entries(eqs).every(([k,v])=>r[k]===v)&&Object.entries(ins).every(([k,v])=>v.includes(r[k]))); return {data:rows,count:rows.length,error:null}; }}; return b; }, storage: { from: bucket => ({ createSignedUrl: async (file, ttl) => {
        window.fixtureCalls.push(['signed', bucket, file, ttl]);
        if(window.denyAttachment) return {data:null,error:{message:'synthetic denied'}};
        return { data: { signedUrl: 'https://attachment.invalid/view' } };
      } }) } }` }))
  } }],
})
const styles = (await readFile('src/app/globals.css', 'utf8'))
  .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./src/components/TransactionTable.tsx";\n@source "./src/components/AttachmentTransactionGroup.tsx";\n@source "./src/components/AccountingAttachmentHistory.tsx";')
const css = await postcss([tailwindcss()]).process(styles, { from: path.resolve('history-ui.css') })
await mkdir('test-results/attachment-groups', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  // KAN-129: reuse the same actual-component/offline harness for corrected originals.
  for (const width of [1440, 390]) for (const locked of [false, true]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', r => r.abort())
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css.css })
    await page.evaluate(locked => { window.fixtureMode = 'corrections'; window.fixtureLocked = locked }, locked)
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const row = name => width >= 768 ? page.getByRole('row').filter({ hasText: name })
      : page.getByText(name, { exact: true }).filter({ visible: true }).locator('..')
    for (const [description, file] of [['Rättat unikt underlag', 'unique.pdf'], ['Rättat gemensamt underlag', 'shared.pdf']]) {
      const original = row(description)
      await expect(original).toContainText('Rättat original')
      const open = original.getByRole('button', { name: '📎 Visa originalbilaga', exact: true })
      await open.focus(); await open.press('Enter')
      await expect.poll(() => page.evaluate(() => window.fixtureCalls.slice(-2))).toEqual([
        ['signed', 'attachments', 'fixture-owner/' + file, 60], ['open', 'https://attachment.invalid/view', '_blank'],
      ])
      await expect(original.getByRole('button', { name: '✎', exact: true })).toHaveCount(0)
      await expect(original.getByRole('button', { name: '✕', exact: true })).toHaveCount(0)
    }
    await expect(row('Rättelse av unikt underlag')).toContainText('Korrigering')
    await expect(row('Rättelse av unikt underlag')).toContainText('Rättar VER-201')
    await expect(row('Original utan bilaga').getByRole('button', { name: /Visa.*bilaga/ })).toHaveCount(0)
    // A denied signed-URL response must never open a file.
    await page.evaluate(() => { window.denyAttachment = true })
    const denied = page.waitForEvent('dialog').then(async alert => { assert.match(alert.message(), /behörighet/); await alert.dismiss() })
    await row('Rättat unikt underlag').getByRole('button', { name: '📎 Visa originalbilaga' }).click(); await denied
    assert.equal((await page.evaluate(() => window.fixtureCalls.at(-1)))[0], 'signed')
    await page.evaluate(() => { window.denyAttachment = false })
    // Original history is readable, including preserved references, but offers no writes.
    await row('Rättat unikt underlag').getByRole('button', { name: 'Historik', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Hantera bilagor' })
    await expect(dialog.getByRole('button', { name: 'Öppna bilaga' })).toBeVisible()
    await expect(dialog.getByLabel('Kompletterande bilaga')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Spara bilagetillägg' })).toHaveCount(0)
    if (locked) await expect(dialog).toContainText('Året är låst')
    await expect.poll(() => page.evaluate(() => window.fixtureReads.some(r => r.eqs.user_id === 'fixture-owner' && r.eqs.transaction_id === 'unique'))).toBe(true)
    await page.keyboard.press('Escape')
    await page.getByRole('switch', { name: 'Gruppera gemensamma underlag' }).click()
    const group = page.getByRole('region', { name: 'Gemensamt underlag' }).filter({ visible: true })
    await group.getByRole('button', { name: 'Visa verifikationer', exact: true }).click()
    await expect(group.getByRole('article', { name: 'VER-203', exact: true })).toContainText('Rättad med korrigeringsverifikation')
    await expect(group.getByRole('article', { name: 'VER-203', exact: true }).getByRole('button')).toHaveCount(0)
    await group.getByRole('button', { name: 'Visa gemensam bilaga' }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureCalls.slice(-2))).toEqual([
      ['signed', 'attachments', 'fixture-owner/shared.pdf', 60], ['open', 'https://attachment.invalid/view', '_blank'],
    ])
    assert.equal(await page.evaluate(() => window.verifyOriginal()), true)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `test-results/attachment-groups/kan129-${width}-${locked ? 'locked' : 'open'}.png`, fullPage: true })
    await page.close()
    console.log('PASS KAN-129: ' + width + 'px, locked=' + locked + ', unique/shared originals, labels, history, permission denial, frozen accounting input')
  }
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    // Unexpected HTTP traffic fails closed; all UI and attachment behavior is local.
    await page.route('**/*', route => route.abort())
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css.css })
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const groupingSwitch = page.getByRole('switch', { name: 'Gruppera gemensamma underlag' })
    const group = page.getByRole('region', { name: 'Gemensamt underlag' }).filter({ visible: true })
    await expect(groupingSwitch).not.toBeChecked()
    await expect(group).toHaveCount(0)
    await expect(page.getByText('FULL ORIGINAL B', { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(page.getByText('Ångrad SIE-import', { exact: false }).filter({ visible: true }).first()).toBeVisible()

    await expect(groupingSwitch).toContainText('Av')
    await expect(groupingSwitch).toHaveAccessibleDescription('Visa verifikationer med samma bilaga tillsammans i hopfällbara grupper.')
    await expect(page.getByRole('button', { name: 'Hoppa till första gruppen' })).toHaveCount(0)
    assert.ok((await groupingSwitch.boundingBox()).height >= 44, 'Switch has a usable touch target')
    await groupingSwitch.focus()
    await groupingSwitch.press('Space')
    await expect(groupingSwitch).toBeChecked()
    await expect(groupingSwitch).toContainText('På')
    await groupingSwitch.press('Enter')
    await expect(groupingSwitch).not.toBeChecked()
    await groupingSwitch.press('Enter')
    await expect(page.getByRole('status')).toHaveText('1 grupp hittad · 2 verifikationer')
    await page.screenshot({ path: 'test-results/attachment-groups/' + viewport.width + '-controls.png' })
    await expect(group).toHaveCount(1)
    await expect(group.getByText('2 verifikationer', { exact: true })).toBeVisible()
    await expect(group.getByText('2026-10-03 – 2026-10-16', { exact: true })).toBeVisible()
    await expect(page.getByText('57 verifikationer · Grupper inom 2026')).toBeVisible()
    await expect(group.getByRole('article')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Visa fler (5 kvar)' })).toBeVisible()
    const undoToggle = page.getByRole('button', { name: 'Visa detaljer ↓', exact: true }).filter({ visible: true })
    await undoToggle.click()
    await expect(page.getByText(/^VER-203(?: ·|$)/).filter({ visible: true })).toBeVisible()
    await expect(page.getByText(/^VER-204(?: ·|$)/).filter({ visible: true })).toBeVisible()
    await page.getByRole('button', { name: 'Dölj detaljer ↑', exact: true }).filter({ visible: true }).click()
    await group.getByRole('button', { name: 'Visa verifikationer', exact: true }).click()
    await expect(group.getByRole('article')).toHaveCount(2)
    await expect(group.getByRole('article', { name: 'VER-201', exact: true })).toContainText('2026-10-16')
    await expect(group.getByRole('article', { name: 'VER-202', exact: true })).toContainText('2026-10-03')
    await expect(group).toContainText('FULL ORIGINAL A — teknisk text uid-X\nAndra raden')
    await expect(group).toContainText('Belopp: 228,00 kr')
    await expect(group).toContainText('Konto 5420')
    await expect(group).toContainText('Konto 1930')
    await expect(group).toContainText('Debet: 228,00 kr · Kredit: 0,00 kr')
    await expect(group.getByRole('button', { name: 'Visa gemensam bilaga', exact: true })).toHaveCount(1)
    await group.getByRole('button', { name: 'Visa gemensam bilaga', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureCalls)).toEqual([
      ['signed', 'attachments', 'fixture-owner/private.pdf', 60],
      ['open', 'https://attachment.invalid/view', '_blank'],
    ])
    await group.getByRole('article', { name: 'VER-201', exact: true }).getByRole('button', { name: 'Hantera bilaga' }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureCalls.at(-1))).toEqual(['edit', 'a'])
    await page.screenshot({ path: `test-results/attachment-groups/${viewport.width}.png` })
    if (viewport.width < 768) {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No mobile horizontal overflow')
    }

    const search = page.getByRole('searchbox', { name: 'Sök transaktionshistorik' })
    await search.fill('FULL ORIGINAL B')
    await expect(group).toHaveCount(0)
    await expect(page.getByText('FULL ORIGINAL B', { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(page.getByText('Visar 1 inkluderade av 57 transaktioner')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('sökning och filtrering')
    await expect(page.getByRole('button', { name: 'Hoppa till första gruppen' })).toHaveCount(0)
    await search.fill('')
    await page.getByRole('button', { name: 'Kostnader', exact: true }).click()
    await expect(group).toHaveCount(0)
    await expect(page.getByText('FULL ORIGINAL B', { exact: true }).filter({ visible: true })).toBeVisible()
    await page.getByRole('button', { name: 'Alla', exact: true }).click()

    const sort = page.getByRole('combobox', { name: /Sortering/ })
    for (const mode of ['amount_desc', 'amount_asc', 'ver_desc']) {
      await sort.selectOption(mode)
      await expect(group).toHaveCount(0)
      await expect(page.getByRole('status')).toContainText('belopp eller verifikationsnummer')
      await expect(page.getByRole('button', { name: 'Hoppa till första gruppen' })).toHaveCount(0)
    }
    await sort.selectOption('date_asc')
    // Oldest-first places the group on the next visual page.
    await expect(group).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('1 grupp hittad · 2 verifikationer')
    await page.getByRole('button', { name: 'Hoppa till första gruppen' }).click()
    await expect(group).toBeFocused()
    await expect(group).toBeInViewport()
    await expect(page.getByRole('button', { name: /Visa fler/ })).toHaveCount(0)
    await expect(group).toHaveCount(1)
    await expect(group.getByRole('article').first()).toHaveAttribute('aria-label', 'VER-202')
    await group.getByRole('button', { name: 'Dölj verifikationer' }).click()
    await expect(group.getByRole('article')).toHaveCount(0)
    await groupingSwitch.click()
    await expect(group).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Visa fler (6 kvar)' })).toBeVisible()
    assert.equal(await page.evaluate(() => window.verifyOriginal()), true)
    assert.deepEqual(errors, [])
    console.log(`PASS: real TransactionTable at ${viewport.width}px — opt-in, details, original journal, signed attachment, actions, search/category, sorting, SIE undo and pagination`)
    await page.close()

    for (const mode of ['multiple', 'none', 'empty']) {
      const scenario = await browser.newPage({ viewport })
      const scenarioErrors = []
      scenario.on('pageerror', error => scenarioErrors.push(error.message))
      await scenario.route('**/*', route => route.abort())
      await scenario.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
      await scenario.addStyleTag({ content: css.css })
      await scenario.addScriptTag({ content: 'window.fixtureMode = ' + JSON.stringify(mode) })
      await scenario.addScriptTag({ content: bundle.outputFiles[0].text })
      const control = scenario.getByRole('switch', { name: 'Gruppera gemensamma underlag' })
      const groups = scenario.getByRole('region', { name: 'Gemensamt underlag' }).filter({ visible: true })
      const jump = scenario.getByRole('button', { name: 'Hoppa till första gruppen' })
      if (mode === 'empty') {
        await expect(scenario.getByText('Inga transaktioner bokförda för 2026')).toBeVisible()
        await expect(control).toHaveCount(0)
      } else {
        await expect(control).not.toBeChecked()
        await expect(jump).toHaveCount(0)
        await control.click()
        if (mode === 'none') {
          await expect(scenario.getByRole('status')).toHaveText('Inga grupper hittades inom 2026.')
          await expect(groups).toHaveCount(0)
          await expect(jump).toHaveCount(0)
          await expect(scenario.getByText('Ensam verifikation', { exact: true }).filter({ visible: true })).toBeVisible()
        } else {
          await expect(scenario.getByRole('status')).toHaveText('2 grupper hittade · 5 verifikationer')
          await expect(groups).toHaveCount(0)
          await expect(scenario.getByRole('button', { name: 'Visa fler (110 kvar)' })).toBeVisible()
          await jump.focus()
          await jump.press('Enter')
          await expect(groups).toHaveCount(1)
          await expect(groups.first()).toBeFocused()
          await expect(groups.first()).toBeInViewport()
          await expect(groups.first()).toContainText('2 verifikationer')
          await expect(scenario.getByRole('button', { name: 'Visa fler (10 kvar)' })).toBeVisible()
          assert.equal(await groups.first().evaluate(element => {
            const row = element.closest('tr') || element.parentElement
            return Array.from(row.parentElement.children).indexOf(row)
          }), 103, 'All 102 ordinary rows and one SIE undo group retain their position before the first group')
          const renderedOrder = () => groups.first().evaluate(element => {
            const row = element.closest('tr') || element.parentElement
            return Array.from(row.parentElement.children).map(child => child.textContent)
          })
          const orderAfterJump = await renderedOrder()
          await scenario.getByRole('button', { name: /Visa fler/ }).click()
          await expect(groups).toHaveCount(2)
          await expect(groups.last()).toContainText('3 verifikationer')
          assert.deepEqual((await renderedOrder()).slice(0, 150), orderAfterJump, 'Show more preserves all previously revealed rows')
          const completeOrder = await renderedOrder()
          await jump.click()
          await expect(groups.first()).toBeFocused()
          await expect(groups.first()).toBeInViewport()
          assert.deepEqual(await renderedOrder(), completeOrder, 'Repeated jump keeps pagination and chronology unchanged')
          await groups.first().getByRole('button', { name: 'Visa verifikationer', exact: true }).click()
          await expect(groups.first().getByRole('article')).toHaveCount(2)
          await expect(groups.first()).toContainText('FIRST GROUP A')
          await expect(groups.first()).toContainText('FIRST GROUP B')
          await scenario.screenshot({ path: 'test-results/attachment-groups/' + viewport.width + '-jump.png' })
          await scenario.getByRole('combobox', { name: /Sortering/ }).selectOption('date_asc')
          await expect(scenario.getByRole('status')).toHaveText('2 grupper hittade · 5 verifikationer')
          await jump.click()
          await expect(groups.first()).toBeFocused()
          await expect(groups.first()).toContainText('3 verifikationer')
          await control.click()
          await expect(scenario.getByRole('status')).toHaveCount(0)
          await expect(jump).toHaveCount(0)
        }
      }
      if (viewport.width < 768) {
        assert.ok(await scenario.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Summary/jump do not overflow on mobile')
      }
      assert.equal(await scenario.evaluate(() => window.verifyOriginal()), true)
      assert.deepEqual(scenarioErrors, [])
      console.log('PASS: ' + mode + ' groups at ' + viewport.width + 'px — counts, pagination, chronology, focus and unchanged data')
      await scenario.close()
    }
  }
} finally {
  await browser.close()
}
