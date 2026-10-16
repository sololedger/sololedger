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
const transactions = [
  { ...common, id: 'a', date: '2026-10-16', description: 'FULL ORIGINAL A — teknisk text uid-X\\nAndra raden', amount: 228, file_url: 'fixture-owner/private.pdf' },
  { ...common, id: 'b', date: '2026-10-03', description: 'FULL ORIGINAL B', amount: 57, file_url: 'fixture-owner/private.pdf' },
  ...['u1', 'u2'].map((id, i) => ({ ...common, id, date: '2026-10-02', description: 'Ångrad SIE-import: test.se — korrigering av VER-' + (10 + i), amount: 100, is_correction: true, corrects_ver_nr: 10 + i, source: 'sie_import_undo', import_batch_id: 'fixture-batch', file_url: 'fixture-owner/private.pdf' })),
  ...Array.from({ length: 53 }, (_, i) => ({ ...common, id: 'single-' + i, date: '2026-09-01', description: 'Vanlig bokning ' + i, amount: 100 + i, file_url: i === 0 ? 'fixture-owner/single.pdf' : null })),
]
const journalMap = Object.fromEntries(transactions.map((tx, i) => [tx.id, [
  { id: 'd' + i, transaction_id: tx.id, ver_nr: 201 + i, account_number: '5420', debit: tx.amount, credit: 0 },
  { id: 'c' + i, transaction_id: tx.id, ver_nr: 201 + i, account_number: '1930', debit: 0, credit: tx.amount },
]]))
const original = JSON.stringify({ transactions, journalMap })
for (const tx of transactions) Object.freeze(tx)
for (const rows of Object.values(journalMap)) { rows.forEach(Object.freeze); Object.freeze(rows) }
Object.freeze(transactions); Object.freeze(journalMap)
window.fixtureCalls = []
window.open = (...args) => { window.fixtureCalls.push(['open', ...args]); return null }
window.verifyOriginal = () => original === JSON.stringify({ transactions, journalMap })
createRoot(document.getElementById('root')).render(<TransactionTable
  transactions={transactions} journalMap={journalMap} selectedYear={2026}
  kontoplan={[{ id: 'programvaror', name: 'Programvaror' }]} isYearLocked={false} editingId={null}
  onEdit={tx => window.fixtureCalls.push(['edit', tx.id])}
  onDelete={tx => window.fixtureCalls.push(['correct', tx.id])} onFavorite={() => {}} />)
`

const bundle = await build({
  stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' },
  tsconfig: path.resolve('tsconfig.json'), bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'offline-storage', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'offline-storage', namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export const supabase = { storage: { from: bucket => ({ createSignedUrl: async (file, ttl) => {
        window.fixtureCalls.push(['signed', bucket, file, ttl]);
        return { data: { signedUrl: 'https://attachment.invalid/view' } };
      } }) } }` }))
  } }],
})
const styles = (await readFile('src/app/globals.css', 'utf8'))
  .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);\n@source "./src/components/TransactionTable.tsx";\n@source "./src/components/AttachmentTransactionGroup.tsx";')
const css = await postcss([tailwindcss()]).process(styles, { from: path.resolve('history-ui.css') })
await mkdir('test-results/attachment-groups', { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    // Unexpected HTTP traffic fails closed; all UI and attachment behavior is local.
    await page.route('**/*', route => route.abort())
    await page.setContent('<html lang="sv"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>')
    await page.addStyleTag({ content: css.css })
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const checkbox = page.getByRole('checkbox', { name: 'Gruppera gemensamma underlag' })
    const group = page.getByRole('region', { name: 'Gemensamt underlag' }).filter({ visible: true })
    await expect(checkbox).not.toBeChecked()
    await expect(group).toHaveCount(0)
    await expect(page.getByText('FULL ORIGINAL B', { exact: true }).filter({ visible: true })).toBeVisible()
    await expect(page.getByText('Ångrad SIE-import', { exact: false }).filter({ visible: true }).first()).toBeVisible()

    await checkbox.check()
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
    }
    await sort.selectOption('date_asc')
    // Oldest-first places the group on the next visual page.
    await expect(group).toHaveCount(0)
    await page.getByRole('button', { name: /Visa fler/ }).click()
    await expect(group).toHaveCount(1)
    await expect(group.getByRole('article').first()).toHaveAttribute('aria-label', 'VER-202')
    await group.getByRole('button', { name: 'Dölj verifikationer' }).click()
    await expect(group.getByRole('article')).toHaveCount(0)
    await checkbox.uncheck()
    await expect(group).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Visa fler (6 kvar)' })).toBeVisible()
    assert.equal(await page.evaluate(() => window.verifyOriginal()), true)
    assert.deepEqual(errors, [])
    console.log(`PASS: real TransactionTable at ${viewport.width}px — opt-in, details, original journal, signed attachment, actions, search/category, sorting, SIE undo and pagination`)
    await page.close()
  }
} finally {
  await browser.close()
}
