import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { addWithdrawalFact, addWithdrawalTx, checkWithdrawalTax, emptyWithdrawal, sealWithdrawal } from '../tests/fixtures/withdrawalFixtures.ts'

const date = '2026-11-04'
const owner = 'synthetic-a'
function seed(userId, asOf) {
  const snapshot = emptyWithdrawal(asOf)
  snapshot.user_id = userId
  addWithdrawalTx(snapshot, 'capital', asOf, 'manual', [['1930', 300], ['2018', -300]])
  addWithdrawalFact(snapshot, 'coverage', { from: asOf, noEarlierObligations: true })
  return checkWithdrawalTax(snapshot, 0)
}

const bundle = await build({
  stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import {useState} from 'react'
    import {createRoot} from 'react-dom/client'
    import DashboardOverview from './src/components/DashboardOverview'
    import Layout from './src/components/Layout'
    import {beginProfileContext, acceptProfileContext} from './src/lib/profileContext'
    function historySession(owner) {
      const ticket = beginProfileContext(owner)
      acceptProfileContext(ticket, owner)
      return ticket.sequence
    }
    function App() {
      const [owner, setOwner] = useState(window.initialWithdrawalOwner ?? 'synthetic-a')
      const [tab, setTab] = useState('dashboard')
      const [refresh, setRefresh] = useState(0)
      const [sequence, setSequence] = useState(() => historySession(owner))
      window.refreshHistorySession = () => setSequence(historySession(owner))
      window.bufferOwner = owner
      window.setBufferOwner = next => { setSequence(historySession(next)); setOwner(next) }
      window.refreshWithdrawal = () => setRefresh(previous => previous + 1)
      return <Layout activeTab={tab} setActiveTab={setTab} onLogout={()=>{}} isAdmin={false}>
        <main className="mx-auto max-w-6xl px-4 pb-8">
          <h1 className="mb-4 text-2xl font-bold">{tab === 'sakert-uttag' ? 'Säkert uttag' : 'Ekonomiöversikt'}</h1>
          <DashboardOverview owner={owner} historySession={sequence} refreshKey={refresh} taxControlTarget={null} balances={{}}
            bankSaldo={300} momsBreakdown={{utgaendeMoms:0,ingaendeMoms:0,momsNetto:0}}
            selectedYear={2026} transactions={[]} journalMap={{}} setActiveModal={()=>{}} activeModal={null}
            onOpenWithdrawal={()=>setTab('sakert-uttag')}
            onBackFromWithdrawal={tab === 'sakert-uttag' ? ()=>setTab('dashboard') : undefined}/>
        </main>
      </Layout>
    }
    createRoot(document.getElementById('root')).render(<App/>)
  ` },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json',
  define: { 'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify('https://synthetic.invalid'), 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify('synthetic-public') },
  plugins: [{ name: 'synthetic-profile-rpc', setup(builder) {
    builder.onResolve({ filter: /profileWriteGuard$|withdrawalSupplierProof$/ }, args => ({ path: args.path, namespace: 'synthetic' }))
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, args => ({
      contents: args.path.endsWith('profileWriteGuard')
        ? 'export async function verifyProfileWrite(){ return "synthetic-history" } export async function verifiedProfileRpc(){ const userId=window.bufferOwner; return {userId,rpc:(name,args)=>window.bufferRpc(userId,name,args)} }'
        : 'export async function loadWithdrawalSupplierProof(){throw Error("No supplier fixtures in this test")}',
    }))
  } }],
})
const css = (await postcss([tailwind({ base: process.cwd() })]).process(
  await readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' },
)).css
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const snapshots = new Map()
let saves = 0
let failRead = false
const failAfterWrite = new WeakSet()
const failedReads = new WeakSet()
let uncertain = false
let rejectWrite = false
let releaseWrite
let writing

await context.exposeBinding('bufferRpc', async ({ page }, userId, name, args) => {
  const snapshot = snapshots.get(userId) ?? seed(userId, args.p_as_of)
  if (name === 'get_withdrawal_context') {
    if (failedReads.delete(page) || failRead) {
      failRead = false
      return { error: { code: '503' }, status: 503 }
    }
    const current = snapshot.as_of === args.p_as_of ? snapshot : seed(userId, args.p_as_of)
    snapshots.set(userId, current)
    return { data: current, error: null }
  }
  assert.equal(name, 'save_withdrawal_assessment')
  saves++
  assert.equal(args.p_as_of, snapshot.as_of)
  if (writing) {
    writing()
    await new Promise(resolve => { releaseWrite = resolve })
    writing = undefined
  }
  const head = snapshots.get(userId)
  if (head.revision?.id !== args.p_previous || head.signature !== args.p_signature) return { error: { code: '40001' }, status: 400 }
  if (rejectWrite) {
    rejectWrite = false
    return { error: { code: 'P0001' }, status: 400 }
  }
  const next = structuredClone(head)
  next.revision = { ...next.revision, id: 'revision-' + saves, facts: args.p_facts }
  snapshots.set(userId, sealWithdrawal(next))
  if (failAfterWrite.delete(page)) failedReads.add(page)
  if (uncertain) {
    uncertain = false
    return { error: { code: '', message: 'Network error' }, status: 0 }
  }
  return { data: next.revision.id, error: null, status: 200 }
})

async function open(width, task = /Extra buffert/, userId = owner) {
  const page = await context.newPage()
  await page.setViewportSize({ width, height: 920 })
  page.on('pageerror', error => { throw error })
  await page.route('**/*', route => route.abort())
  if (userId === 'synthetic-history-owner') {
    await page.route('https://synthetic.invalid/', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }))
    await page.goto('https://synthetic.invalid/')
  }
  await page.clock.setFixedTime(new Date(date + 'T12:00:00Z'))
  await page.setContent('<html lang="sv"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div></html>')
  await page.evaluate(id => { window.initialWithdrawalOwner = id }, userId)
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: bundle.outputFiles[0].text })
  await page.getByRole('button', { name: 'Öppna Säkert uttag' }).click()
  if (task) await page.getByRole('button', { name: task }).click()
  return page
}

const amount = page => page.getByLabel('Extra buffert i kronor', { exact: true })
const save = page => page.getByRole('button', { name: 'Spara kontrollen' })
const reserve = page => page.getByRole('region', { name: 'Ditt uttagsutrymme' }).getByRole('status').filter({ hasText: /Uppskattat|Beräknat|Kan inte beräknas/ })
const retry = page => page.getByRole('button', { name: 'Försök igen' })
const capture = process.argv.includes('--screenshots')

try {
  const desktop = await open(1440, null)
  const mobile = await open(390)
  await expect(desktop.getByText(/Äldre sparade uppgifter finns under Tidigare kontroller/)).toBeVisible()
  await desktop.getByRole('button', { name: 'Öppna kontrollpanelen' }).click()
  await expect(desktop.getByRole('dialog')).toBeVisible()
  await desktop.keyboard.press('Escape')
  await expect(desktop.getByRole('dialog')).toHaveCount(0)
  const bankNext = desktop.getByRole('button', { name: /Kontrollera bankens saldo/ })
  await expect(bankNext).toBeVisible()
  await bankNext.press('Enter')
  await expect(desktop.locator('#withdrawal-guide')).toBeFocused()
  await desktop.getByRole('button', { name: /Till ekonomöversikten/ }).press('Enter')
  const withdrawalEntry = desktop.getByRole('button', { name: 'Öppna Säkert uttag' })
  await expect(withdrawalEntry).toBeFocused()
  await withdrawalEntry.press('Enter')
  await desktop.getByRole('button', { name: /Extra buffert Frivillig/ }).click()
  for (const page of [desktop, mobile]) {
    await expect(amount(page)).toHaveValue('')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }

  await save(desktop).click()
  await expect(desktop.getByRole('alert')).toContainText('Tomt är okänt')
  await amount(desktop).fill('19')
  await desktop.getByRole('button', { name: 'Kasta utkast' }).click()
  await expect(amount(desktop)).toHaveValue('')
  assert.equal(saves, 0)

  await amount(desktop).fill('25,50')
  const started = new Promise(resolve => { writing = resolve })
  await save(desktop).click()
  await started
  await expect(desktop.getByRole('button', { name: 'Sparar…' })).toBeDisabled()
  await desktop.locator('form').evaluate(form => form.requestSubmit())
  assert.equal(saves, 1, 'a second submit must not write')
  releaseWrite()
  await expect(desktop.getByText('Sparat · beräkningen är uppdaterad.')).toBeVisible()
  await expect(reserve(desktop)).toContainText('274 kr')
  assert.equal(snapshots.get(owner).revision.facts.find(fact => fact.key === 'buffer').value.amountOre, 2550)
  assert(snapshots.get(owner).revision.facts.some(fact => fact.key === 'coverage'))

  await amount(mobile).fill('40')
  await save(mobile).click()
  await expect(mobile.getByText(/Underlaget har ändrats sedan/)).toBeVisible()
  await expect(mobile.getByText(/Senast sparade buffert: 25,5 kr/)).toBeVisible()
  await expect(save(mobile)).toBeDisabled()
  await mobile.getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await expect(amount(mobile)).toHaveValue('25.5')

  await mobile.getByRole('button', { name: 'Ingen extra buffert (0 kr)' }).click()
  await save(mobile).click()
  await expect(mobile.getByText('Sparat · beräkningen är uppdaterad.')).toBeVisible()
  await expect(reserve(mobile)).toContainText('300 kr')
  assert.equal(snapshots.get(owner).revision.facts.find(fact => fact.key === 'buffer').value.amountOre, 0)

  await amount(mobile).fill('12')
  failRead = true
  await save(mobile).click()
  await expect(mobile.getByText('Bufferten sparades. Beräkningen kunde inte läsas in.')).toBeVisible()
  await expect(reserve(mobile)).toHaveCount(0)
  const afterFailedRead = saves
  await retry(mobile).click()
  await expect(reserve(mobile)).toContainText('288 kr')
  assert.equal(saves, afterFailedRead)

  await amount(mobile).fill('30')
  uncertain = true
  await save(mobile).click()
  await expect(mobile.getByText('Det gick inte att avgöra om bufferten sparades.')).toBeVisible()
  await expect(reserve(mobile)).toHaveCount(0)
  await retry(mobile).click()
  await expect(mobile.getByText(/Senast sparade buffert: 30 kr/)).toBeVisible()
  await expect(save(mobile)).toBeDisabled()
  await mobile.getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await expect(amount(mobile)).toHaveValue('30')
  if (capture) {
    await mkdir('coverage/kan133', { recursive: true })
    await mobile.screenshot({ path: 'coverage/kan133/buffert-390.png', fullPage: true })
    const freshDesktop = await open(1440)
    await expect(amount(freshDesktop)).toHaveValue('30')
    await freshDesktop.screenshot({ path: 'coverage/kan133/buffert-1440.png', fullPage: true })
    await freshDesktop.close()
  }

  await amount(mobile).fill('74')
  await mobile.evaluate(() => window.setBufferOwner('synthetic-b'))
  await mobile.getByRole('button', { name: /^Extra buffert/ }).click()
  await expect(amount(mobile)).toHaveValue('')
  await amount(mobile).fill('86')
  await mobile.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'))
  await mobile.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(mobile.getByText(/Underlag per 2026-11-05/)).toBeVisible()
  await mobile.getByRole('button', { name: /^Extra buffert/ }).click()
  await expect(amount(mobile)).toHaveValue('')

  await amount(mobile).fill('31')
  const lateWriteStarted = new Promise(resolve => { writing = resolve })
  await save(mobile).click()
  await lateWriteStarted
  await mobile.evaluate(() => window.setBufferOwner('synthetic-c'))
  await mobile.getByRole('button', { name: /^Extra buffert/ }).click()
  await expect(amount(mobile)).toHaveValue('')
  releaseWrite()
  await expect.poll(() => snapshots.get('synthetic-b').revision.facts.find(fact => fact.key === 'buffer')?.value.amountOre).toBe(3100)
  await expect(reserve(mobile)).toContainText('300 kr')
  await expect(mobile.getByText('Sparat · beräkningen är uppdaterad.')).toHaveCount(0)

  console.log('PASS KAN-133 buffer: positive, explicit zero, empty, discard, duplicate submit, shared-version conflict, failed reload, uncertain write, owner and date changes, late write response')

  const coverageOwner = 'synthetic-coverage'
  const unchecked = seed(coverageOwner, date)
  unchecked.revision.facts = unchecked.revision.facts.filter(fact => fact.key !== 'coverage')
  snapshots.set(coverageOwner, unchecked)
  const coverageDesktop = await open(1440, null, coverageOwner)
  const coverageMobile = await open(390, null, coverageOwner)
  const coverage = page => page.getByRole('region', { name: 'Tidigare åtaganden' })
  const confirm = page => coverage(page).getByRole('checkbox')
  const savedMessage = 'Sparat · beräkningen är uppdaterad.'
  for (const [page, width] of [[coverageDesktop, 1440], [coverageMobile, 390]]) {
    await expect(coverage(page)).toContainText('Bokföringsunderlagets startdatum ' + date)
    await expect(coverage(page)).toContainText('Lämna rutan tom')
    await expect(confirm(page)).not.toBeChecked()
    await expect(reserve(page)).toHaveText(/Kan inte beräknas/)
    await expect(page.getByRole('button', { name: /Öppna: Tidigare åtaganden/ })).toBeVisible()
    await expect(reserve(page)).not.toContainText(/\d+ kr/)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    if (capture) await page.screenshot({ path: `coverage/kan133/ataganden-sparrat-${width}.png`, fullPage: true })
  }
  const beforeCoverage = saves
  await save(coverageDesktop).click()
  await expect(coverage(coverageDesktop).getByRole('alert')).toContainText('Bekräfta bara om underlaget')
  assert.equal(saves, beforeCoverage)

  await confirm(coverageDesktop).check()
  const coverageStarted = new Promise(resolve => { writing = resolve })
  await save(coverageDesktop).click()
  await coverageStarted
  await coverage(coverageDesktop).locator('form').evaluate(form => form.requestSubmit())
  assert.equal(saves, beforeCoverage + 1)
  releaseWrite()
  await expect(coverage(coverageDesktop)).toContainText(savedMessage)
  await expect(reserve(coverageDesktop)).toContainText('300 kr')
  assert.deepEqual(snapshots.get(coverageOwner).revision.facts.find(fact => fact.key === 'coverage').value, { from: date, noEarlierObligations: true })
  if (capture) await coverageDesktop.screenshot({ path: 'coverage/kan133/ataganden-sparat-1440.png', fullPage: true })

  await confirm(coverageMobile).check()
  await save(coverageMobile).click()
  await expect(coverage(coverageMobile)).toContainText('Underlaget har ändrats')
  await expect(save(coverageMobile)).toBeDisabled()
  await coverage(coverageMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await expect(confirm(coverageMobile)).not.toBeChecked()
  await confirm(coverageMobile).check()
  await save(coverageMobile).click()
  await expect(coverage(coverageMobile)).toContainText(savedMessage)
  if (capture) await coverageMobile.screenshot({ path: 'coverage/kan133/ataganden-sparat-390.png', fullPage: true })

  const changed = snapshots.get(coverageOwner)
  await confirm(coverageMobile).check()
  addWithdrawalTx(changed, 'new-capital', date, 'manual', [['1930', 1], ['2018', -1]])
  sealWithdrawal(changed)
  await coverageMobile.evaluate(() => window.refreshWithdrawal())
  await expect(coverage(coverageMobile)).toContainText('Underlaget har ändrats')
  await expect(coverage(coverageMobile)).toContainText('Bokföringsunderlagets startdatum ' + date)
  await expect(save(coverageMobile)).toBeDisabled()
  await coverage(coverageMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await confirm(coverageMobile).check()
  addWithdrawalTx(changed, 'earlier', '2026-11-02', 'manual', [['1930', 1], ['2018', -1]])
  addWithdrawalTx(changed, 'unexplained-vat', date, 'manual', [['1930', 1], ['2650', -1]])
  sealWithdrawal(changed)
  await coverageMobile.evaluate(() => window.refreshWithdrawal())
  await expect(coverage(coverageMobile)).toContainText('2026-11-02')
  await expect(coverage(coverageMobile)).toContainText('Underlaget har ändrats')
  await expect(save(coverageMobile)).toBeDisabled()
  await coverage(coverageMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await confirm(coverageMobile).check()
  failRead = true
  await save(coverageMobile).click()
  await expect(coverage(coverageMobile)).toContainText('Bekräftelsen sparades. Beräkningen kunde inte läsas in.')
  await expect(reserve(coverageMobile)).toHaveCount(0)
  const afterCoverageReadError = saves
  await retry(coverageMobile).click()
  await expect(reserve(coverageMobile)).toHaveText(/Kan inte beräknas/)
  await expect(reserve(coverageMobile)).not.toContainText(/\d+ kr/)
  await expect(coverageMobile.getByRole('button', { name: /Tidigare åtaganden/ })).toContainText('Sparad')
  assert.equal(saves, afterCoverageReadError)
  assert.equal(snapshots.get(coverageOwner).revision.facts.find(fact => fact.key === 'coverage').value.from, '2026-11-02')

  await confirm(coverageMobile).check()
  uncertain = true
  await save(coverageMobile).click()
  await expect(coverage(coverageMobile)).toContainText('Det gick inte att avgöra om bekräftelsen sparades.')
  await expect(reserve(coverageMobile)).toHaveCount(0)
  await retry(coverageMobile).click()
  await expect(coverage(coverageMobile)).toContainText('Senast bekräftade startdatum: 2026-11-02.')
  await expect(save(coverageMobile)).toBeDisabled()
  await coverage(coverageMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await confirm(coverageMobile).check()
  await coverageMobile.evaluate(() => window.setBufferOwner('synthetic-coverage-other'))
  await coverageMobile.getByRole('button', { name: /Tidigare åtaganden/ }).click()
  await expect(confirm(coverageMobile)).not.toBeChecked()
  await confirm(coverageMobile).check()
  await coverageMobile.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'))
  await coverageMobile.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(coverageMobile.getByText(/Underlag per 2026-11-05/)).toBeVisible()
  await coverageMobile.getByRole('button', { name: /Tidigare åtaganden/ }).click()
  await expect(confirm(coverageMobile)).not.toBeChecked()
  console.log('PASS KAN-133 coverage: confirmation, duplicate submit, two tabs, changed start and signature, remaining blocker, failed reload, uncertain write, owner and date changes')

  const bankOwner = 'synthetic-bank'
  const bankDesktop = await open(1440, /Bankens saldo/, bankOwner)
  const bankMobile = await open(390, /Bankens saldo/, bankOwner)
  const bank = page => page.getByRole('region', { name: 'Bankens saldo' })
  const bankAmount = page => bank(page).getByLabel('Disponibelt saldo i banken, kr')
  const bankFact = () => snapshots.get(bankOwner).revision.facts.find(fact => fact.key === 'bank')?.value
  await expect(bank(bankMobile)).toContainText('Bokfört saldo på företagskontot')
  await expect(bank(bankMobile)).toContainText('300 kr')
  const beforeBank = saves
  await save(bankDesktop).click()
  await expect(bank(bankDesktop).getByRole('alert')).toContainText('Tomt är okänt')
  assert.equal(saves, beforeBank)

  await bankAmount(bankDesktop).fill('300')
  await expect(bank(bankDesktop)).toContainText('Beloppen stämmer överens.')
  const bankStarted = new Promise(resolve => { writing = resolve })
  await save(bankDesktop).click()
  await bankStarted
  await bank(bankDesktop).locator('form').evaluate(form => form.requestSubmit())
  assert.equal(saves, beforeBank + 1)
  releaseWrite()
  await expect(bank(bankDesktop)).toContainText(savedMessage)
  await expect(reserve(bankDesktop)).toContainText('300 kr')
  await expect(bankDesktop.getByRole('button', { name: /Bankens saldo/ })).toContainText('Sparad')
  assert.deepEqual(bankFact(), { amountOre: 30000, bookOre: 30000, date, signature: snapshots.get(bankOwner).signature })

  await bankAmount(bankMobile).fill('280')
  await save(bankMobile).click()
  await expect(bank(bankMobile)).toContainText('Underlaget har ändrats')
  await expect(save(bankMobile)).toBeDisabled()
  await bank(bankMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await expect(bankAmount(bankMobile)).toHaveValue('300')

  await bankAmount(bankMobile).fill('280')
  await expect(bank(bankMobile)).toContainText('Beloppen skiljer sig.')
  await expect(bank(bankMobile)).toContainText('280 kr')
  assert(await bankMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  if (capture) await bankMobile.screenshot({ path: 'coverage/kan133/bank-jamforelse-390.png', fullPage: true })
  rejectWrite = true
  await save(bankMobile).click()
  await expect(bank(bankMobile).getByRole('alert')).toContainText('Uppgifterna kunde inte sparas')
  await expect(bankAmount(bankMobile)).toHaveValue('280')
  assert.equal(bankFact().amountOre, 30000)
  await save(bankMobile).click()
  await expect(bank(bankMobile)).toContainText(savedMessage)
  await expect(reserve(bankMobile)).toHaveText(/Kan inte beräknas/)
  await expect(reserve(bankMobile)).not.toContainText(/\d+ kr/)
  assert.equal(bankFact().amountOre, 28000)

  await bankAmount(bankMobile).fill('-38,50')
  const changedBank = snapshots.get(bankOwner)
  addWithdrawalTx(changedBank, 'bank-adjustment', date, 'manual', [['1930', -338.5], ['2018', 338.5]])
  sealWithdrawal(changedBank)
  await bankMobile.evaluate(() => window.refreshWithdrawal())
  await expect(bank(bankMobile)).toContainText('Underlaget har ändrats')
  await expect(save(bankMobile)).toBeDisabled()
  await bank(bankMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await expect(bankAmount(bankMobile)).toHaveValue('')
  await bankAmount(bankMobile).fill('-38,50')
  await expect(bank(bankMobile)).toContainText('Beloppen stämmer överens.')
  failRead = true
  await save(bankMobile).click()
  await expect(bank(bankMobile)).toContainText('Bankkontrollen sparades. Beräkningen kunde inte läsas in.')
  await expect(reserve(bankMobile)).toHaveCount(0)
  const afterBankReadError = saves
  await retry(bankMobile).click()
  await expect(reserve(bankMobile)).toContainText('0 kr')
  await expect(reserve(bankMobile)).not.toContainText('Kan inte beräknas')
  await expect(bankAmount(bankMobile)).toHaveValue('-38.5')
  assert.equal(bankFact().amountOre, -3850)
  assert.equal(saves, afterBankReadError)
  if (capture) await bankMobile.screenshot({ path: 'coverage/kan133/bank-sparat-390.png', fullPage: true })

  await bankAmount(bankMobile).fill('62')
  await bankMobile.evaluate(() => window.setBufferOwner('synthetic-bank-other'))
  await bankMobile.getByRole('button', { name: /Bankens saldo/ }).click()
  await expect(bankAmount(bankMobile)).toHaveValue('')
  await bankAmount(bankMobile).fill('74')
  await bankMobile.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'))
  await bankMobile.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(bankMobile.getByText(/Underlag per 2026-11-05/)).toBeVisible()
  await bankMobile.getByRole('button', { name: /Bankens saldo/ }).click()
  await expect(bankAmount(bankMobile)).toHaveValue('')
  console.log('PASS KAN-133 bank: match, mismatch block, negative match, empty, duplicate submit, two tabs, stale signature, write rejection, failed reload, owner and date changes')

  const otherOwner = 'synthetic-other'
  const withDebt = seed(otherOwner, date)
  addWithdrawalTx(withDebt, 'extra-capital', date, 'manual', [['1930', 700], ['2018', -700]])
  addWithdrawalTx(withDebt, 'supplier-debt', date, 'manual', [['4010', 500], ['2440', -500]])
  snapshots.set(otherOwner, sealWithdrawal(withDebt))
  const otherDesktop = await open(1440, null, otherOwner)
  const otherMobile = await open(390, null, otherOwner)
  const other = page => page.getByRole('region', { name: 'Andra återstående betalningar' })
  const total = page => other(page).getByRole('textbox')
  const otherFact = () => snapshots.get(otherOwner).revision.facts.find(fact => fact.key === 'other')?.value
  const zero = page => other(page).getByRole('button', { name: /kontrollerat att just detta belopp är 0 kr/ })
  await expect(reserve(otherMobile)).toHaveText(/Kan inte beräknas/)
  await expect(other(otherMobile)).toContainText('Kända bokförda skulder i underlaget')
  await expect(other(otherMobile)).toContainText('500 kr')
  const beforeOther = saves
  await save(otherDesktop).click()
  await expect(other(otherDesktop).getByRole('alert')).toContainText('Tomt är okänt')
  assert.equal(saves, beforeOther)

  await total(otherDesktop).fill('500')
  await save(otherDesktop).click()
  await expect(other(otherDesktop)).toContainText(savedMessage)
  await expect(reserve(otherDesktop)).toContainText('500 kr')
  assert.equal(otherFact().amountOre, 50000)
  assert.equal(JSON.parse(otherFact().basis)['2440'], -500)

  await total(otherMobile).fill('700')
  await save(otherMobile).click()
  await expect(other(otherMobile)).toContainText('Underlaget har ändrats')
  await expect(save(otherMobile)).toBeDisabled()
  await other(otherMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await expect(total(otherMobile)).toHaveValue('500')
  await total(otherMobile).fill('700')
  await expect(other(otherMobile)).toContainText('700 kr')
  assert(await otherMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  if (capture) await otherMobile.screenshot({ path: 'coverage/kan133/andra-betalningar-390.png', fullPage: true })
  rejectWrite = true
  await save(otherMobile).click()
  await expect(other(otherMobile).getByRole('alert')).toContainText('Uppgifterna kunde inte sparas')
  await expect(total(otherMobile)).toHaveValue('700')
  assert.equal(otherFact().amountOre, 50000)
  await save(otherMobile).click()
  await expect(other(otherMobile)).toContainText(savedMessage)
  await expect(reserve(otherMobile)).toContainText('300 kr')
  assert.equal(otherFact().amountOre, 70000)

  await total(otherMobile).fill('400')
  await expect(other(otherMobile)).toContainText('Totalsumman är lägre än de kända skulderna.')
  await save(otherMobile).click()
  await expect(other(otherMobile)).toContainText(savedMessage)
  await expect(reserve(otherMobile)).toHaveText(/Kan inte beräknas/)
  assert.equal(otherFact().amountOre, 40000)
  await zero(otherMobile).click()
  await expect(total(otherMobile)).toHaveValue('0')
  await save(otherMobile).click()
  await expect(other(otherMobile)).toContainText(savedMessage)
  await expect(reserve(otherMobile)).toHaveText(/Kan inte beräknas/)
  assert.equal(otherFact().amountOre, 0)

  await total(otherMobile).fill('700')
  const changedOther = snapshots.get(otherOwner)
  addWithdrawalTx(changedOther, 'another-debt', date, 'manual', [['4010', 100], ['2440', -100]])
  sealWithdrawal(changedOther)
  await otherMobile.evaluate(() => window.refreshWithdrawal())
  await expect(other(otherMobile)).toContainText('600 kr')
  await expect(other(otherMobile)).toContainText('Underlaget har ändrats')
  await expect(save(otherMobile)).toBeDisabled()
  assert.equal(JSON.parse(otherFact().basis)['2440'], -500)
  await other(otherMobile).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await expect(total(otherMobile)).toHaveValue('')
  await total(otherMobile).fill('700')
  failRead = true
  await save(otherMobile).click()
  await expect(other(otherMobile)).toContainText('Betalningskontrollen sparades. Beräkningen kunde inte läsas in.')
  await expect(reserve(otherMobile)).toHaveCount(0)
  const afterOtherReadError = saves
  await retry(otherMobile).click()
  await expect(reserve(otherMobile)).toContainText('300 kr')
  assert.equal(saves, afterOtherReadError)
  assert.equal(JSON.parse(otherFact().basis)['2440'], -600)

  const noDebtOwner = 'synthetic-other-no-debt'
  const noDebt = await open(390, /Andra återstående betalningar/, noDebtOwner)
  await zero(noDebt).click()
  await save(noDebt).click()
  await expect(other(noDebt)).toContainText(savedMessage)
  await expect(reserve(noDebt)).toContainText('300 kr')
  assert.equal(snapshots.get(noDebtOwner).revision.facts.find(fact => fact.key === 'other').value.amountOre, 0)
  console.log('PASS KAN-133 other payments: equal, above, below, explicit zero with and without debt, empty, stale debt basis, two tabs, write rejection, failed reload')

  const taxOwner = 'synthetic-tax'
  const taxSeed = emptyWithdrawal(date)
  taxSeed.user_id = taxOwner
  addWithdrawalTx(taxSeed, 'sale', date, 'manual', [['1930', 1710], ['3010', -1368], ['2611', -342]])
  addWithdrawalTx(taxSeed, 'expense', date, 'manual', [['4010', 1410], ['1930', -1410]])
  taxSeed.periods.push({ id: 'p', user_id: taxOwner, period_start: '2026-01-01', period_end: date, source: 'sololedger', status: 'open' })
  addWithdrawalFact(taxSeed, 'coverage', { from: date, noEarlierObligations: true })
  snapshots.set(taxOwner, sealWithdrawal(taxSeed))
  const taxDesktop = await open(1440, /Skattekontots saldo/, taxOwner)
  const taxMobile = await open(390, /Skattekontots saldo/, taxOwner)
  const tax = page => page.getByRole('region', { name: 'Skattekontots saldo' })
  const knownTax = page => tax(page).getByLabel('Har du det faktiska saldot för kontrolldatumet?')
  const taxAmount = page => tax(page).getByLabel('Skattekontots saldo i kronor')
  const taxFact = () => snapshots.get(taxOwner).revision.facts.find(fact => fact.key === 'tax_account')?.value
  const taxReserve = page => page.getByText('Kvar att täcka för moms och skatt', { exact: true }).locator('..')
  async function enterTax(page, sign, amount, confirmEvents = true) {
    await knownTax(page).selectOption('yes')
    await tax(page).getByLabel('Saldot är', { exact: true }).selectOption(sign)
    await taxAmount(page).fill(amount)
    if (confirmEvents) await tax(page).getByRole('checkbox').check()
  }

  const beforeTax = saves
  await knownTax(taxMobile).selectOption('later')
  await expect(tax(taxMobile)).toContainText('Ingen nolla registreras')
  await expect(save(taxMobile)).toBeDisabled()
  await tax(taxMobile).locator('form').evaluate(form => form.requestSubmit())
  await taxMobile.getByRole('button', { name: /^Extra buffert/ }).click()
  await taxMobile.getByRole('button', { name: /Skattekontots saldo/ }).click()
  assert.equal(saves, beforeTax)
  assert.equal(taxFact(), undefined)
  await enterTax(taxMobile, 'surplus', '62', false)
  await save(taxMobile).click()
  await expect(tax(taxMobile).getByRole('alert')).toContainText('Kontrollera först att registrerade skattehändelser')
  await tax(taxMobile).getByRole('checkbox').check()
  await taxAmount(taxMobile).fill('')
  await save(taxMobile).click()
  await expect(tax(taxMobile).getByRole('alert')).toContainText('Tomt är okänt')
  assert.equal(saves, beforeTax)

  await taxAmount(taxMobile).fill('62')
  const taxStarted = new Promise(resolve => { writing = resolve })
  await save(taxMobile).click()
  await taxStarted
  await tax(taxMobile).locator('form').evaluate(form => form.requestSubmit())
  assert.equal(saves, beforeTax + 1)
  releaseWrite()
  await expect(tax(taxMobile)).toContainText(savedMessage)
  await expect(taxReserve(taxMobile)).toContainText('342 kr')
  await expect(reserve(taxMobile)).toContainText('0 kr')
  assert.deepEqual(taxFact(), { date, saldoOre: 6200, basis: snapshots.get(taxOwner).financial_signature })
  assert(await taxMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  if (capture) await taxMobile.screenshot({ path: 'coverage/kan133/skattekonto-overskott-390.png', fullPage: true })

  await enterTax(taxDesktop, 'deficit', '38')
  await save(taxDesktop).click()
  await expect(tax(taxDesktop)).toContainText('Underlaget har ändrats')
  await expect(save(taxDesktop)).toBeDisabled()
  await tax(taxDesktop).getByRole('button', { name: 'Börja om med aktuell uppgift' }).click()
  await enterTax(taxDesktop, 'deficit', '38')
  rejectWrite = true
  await save(taxDesktop).click()
  await expect(tax(taxDesktop).getByRole('alert')).toContainText('Uppgifterna kunde inte sparas')
  await expect(taxAmount(taxDesktop)).toHaveValue('38')
  assert.equal(taxFact().saldoOre, 6200)
  await save(taxDesktop).click()
  await expect(tax(taxDesktop)).toContainText(savedMessage)
  await expect(taxReserve(taxDesktop)).toContainText('380 kr')
  assert.equal(taxFact().saldoOre, -3800)
  await taxMobile.close()
  const taxNegativeMobile = await open(390, /Skattekontots saldo/, taxOwner)
  await expect(tax(taxNegativeMobile).getByLabel('Saldot är')).toHaveValue('deficit')
  await expect(taxReserve(taxNegativeMobile)).toContainText('380 kr')
  if (capture) await taxNegativeMobile.screenshot({ path: 'coverage/kan133/skattekonto-underskott-390.png', fullPage: true })

  await enterTax(taxNegativeMobile, 'surplus', '0')
  failRead = true
  await save(taxNegativeMobile).click()
  await expect(tax(taxNegativeMobile)).toContainText('Skattekontokontrollen sparades. Beräkningen kunde inte läsas in.')
  await expect(reserve(taxNegativeMobile)).toHaveCount(0)
  const afterTaxReadError = saves
  await retry(taxNegativeMobile).click()
  await expect(taxReserve(taxNegativeMobile)).toContainText('342 kr')
  assert.equal(taxFact().saldoOre, 0)
  assert.equal(saves, afterTaxReadError)

  const debit = snapshots.get(taxOwner)
  Object.assign(debit.periods[0], { status: 'declared', closing_amount: 342 })
  addWithdrawalTx(debit, 'closing', date, 'vat_closing', [['2611', 342], ['2650', -342]])
  addWithdrawalTx(debit, 'debit', date, 'vat_settlement', [['2650', 342], ['2012', -342]])
  debit.events.push({ id: 'debit-event', user_id: taxOwner, transaction_id: 'debit', vat_period_id: 'p', event_date: date, event_kind: 'vat_debit', amount: 342 })
  sealWithdrawal(debit)
  await taxNegativeMobile.evaluate(() => window.refreshWithdrawal())
  await expect(tax(taxNegativeMobile)).toContainText('Skattehändelser i den tidigare avstämningen har ändrats')
  await expect(reserve(taxNegativeMobile)).toHaveText(/Kan inte beräknas/)
  await tax(taxNegativeMobile).locator('summary').filter({ hasText: 'Händelser i SoloLedger' }).click()
  await expect(tax(taxNegativeMobile).getByText(/Moms dragen · 342 kr/)).toBeVisible()
  await enterTax(taxNegativeMobile, 'deficit', '280')
  await save(taxNegativeMobile).click()
  await expect(tax(taxNegativeMobile)).toContainText(savedMessage)
  await expect(taxReserve(taxNegativeMobile)).toContainText('280 kr')
  await expect(reserve(taxNegativeMobile)).toContainText('20 kr')

  const movement = snapshots.get(taxOwner)
  checkWithdrawalTax(movement, 6200, '2026-11-03')
  addWithdrawalTx(movement, 'transfer', date, 'tax_account_movement', [['2012', 20], ['1930', -20]])
  movement.movements.push({ id: 'transfer-event', user_id: taxOwner, transaction_id: 'transfer', vat_period_id: 'p', movement_date: date, movement_kind: 'business_to_tax_account', amount: 20 })
  sealWithdrawal(movement)
  await taxNegativeMobile.evaluate(() => window.refreshWithdrawal())
  await expect(tax(taxNegativeMobile)).toContainText('En senare skattebetalning behöver matchas')
  await expect(reserve(taxNegativeMobile)).toHaveText(/Kan inte beräknas/)
  await expect(knownTax(taxNegativeMobile)).toHaveValue('')
  await enterTax(taxNegativeMobile, 'deficit', '260')
  await taxNegativeMobile.evaluate(() => window.setBufferOwner('synthetic-tax-other'))
  await taxNegativeMobile.getByRole('button', { name: /Skattekontots saldo/ }).click()
  await expect(taxAmount(taxNegativeMobile)).toHaveValue('0')
  await expect(tax(taxNegativeMobile).getByRole('checkbox')).not.toBeChecked()
  await enterTax(taxNegativeMobile, 'surplus', '74')
  await taxNegativeMobile.clock.setFixedTime(new Date('2026-11-05T12:00:00Z'))
  await taxNegativeMobile.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(taxNegativeMobile.getByText(/Underlag per 2026-11-05/)).toBeVisible()
  await taxNegativeMobile.getByRole('button', { name: /Skattekontots saldo/ }).click()
  await expect(taxAmount(taxNegativeMobile)).toHaveValue('0')
  await expect(tax(taxNegativeMobile).getByRole('checkbox')).not.toBeChecked()
  console.log('PASS KAN-133 tax account: +62, −38, explicit zero, unknown, missing confirmation, empty, two tabs, duplicate submit, write rejection, failed reload, history, pending transfer, VAT debit once, owner and date changes')

  const incomeOwner = 'synthetic-income'
  const incomeSeed = seed(incomeOwner, date)
  incomeSeed.revision.facts = incomeSeed.revision.facts.filter(fact => fact.key !== 'tax_account')
  snapshots.set(incomeOwner, sealWithdrawal(incomeSeed))
  const incomeMobile = await open(390, /Skattebeslut per år/, incomeOwner)
  const incomeDesktop = await open(1440, /Skattebeslut per år/, incomeOwner)
  const income = page => page.getByRole('region', { name: 'Skattebeslut per år' })
  const incomeMode = page => income(page).getByLabel('Vilket underlag har du för året?')
  const incomeYear = page => income(page).getByLabel('Inkomstår')
  const incomeFact = year => snapshots.get(incomeOwner).revision.facts.find(fact => fact.key === 'income:' + year)?.value
  const zeroIncome = (page, label) => income(page).getByRole('button', { name: label }).click()
  await incomeMode(incomeMobile).selectOption('estimate')
  await expect(income(incomeMobile)).toContainText('Kontrollera först skattekontots saldo')
  await expect(save(incomeMobile)).toBeDisabled()
  await income(incomeMobile).getByRole('button', { name: 'Öppna skattekontokontrollen' }).click()
  await enterTax(incomeMobile, 'surplus', '0')
  await save(incomeMobile).click()
  await expect(tax(incomeMobile)).toContainText(savedMessage)
  await incomeMobile.getByRole('button', { name: /Skattebeslut per år/ }).click()
  await expect(incomeYear(incomeMobile)).toHaveValue('2026')
  assert(await incomeMode(incomeMobile).locator('option[value="final"]').evaluate(option => option.disabled))
  await incomeMode(incomeMobile).evaluate(select => {
    select.value = 'final'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(save(incomeMobile)).toBeDisabled()
  await incomeMode(incomeMobile).selectOption('unknown')
  await expect(save(incomeMobile)).toBeDisabled()
  await incomeMode(incomeMobile).selectOption('estimate')
  const beforeIncome = saves
  await save(incomeMobile).click()
  await expect(income(incomeMobile).getByRole('alert')).toContainText('Tomt är okänt')
  assert.equal(saves, beforeIncome)
  await zeroIncome(incomeMobile, /0 kr · Preliminärskatt som redan ingår/)
  await save(incomeMobile).click()
  await expect(income(incomeMobile).getByRole('alert')).toContainText('Tomt är okänt')
  assert.equal(saves, beforeIncome)
  await zeroIncome(incomeMobile, /0 kr · Beslutad preliminärskatt/)
  if (capture) await incomeMobile.screenshot({ path: 'coverage/kan133/skattebeslut-nytt-390.png', fullPage: true })
  rejectWrite = true
  await save(incomeMobile).click()
  await expect(income(incomeMobile).getByRole('alert')).toContainText('Uppgifterna kunde inte sparas')
  assert.equal(incomeFact(2026), undefined)
  await save(incomeMobile).click()
  await expect(income(incomeMobile)).toContainText('Preliminärbeslut 2026 sparat – slutlig skatt uppskattas.')
  await expect(incomeMobile.getByRole('button', { name: /Öppna: Skattebeslut per år/ })).toHaveCount(0)
  await expect(income(incomeMobile)).toContainText(savedMessage)
  await expect(incomeMobile.getByRole('button', { name: /Skattebeslut per år/ })).toContainText('Sparad')
  assert.deepEqual([incomeFact(2026).debitedOre, incomeFact(2026).pendingOre, incomeFact(2026).finalOre], [0, 0, null])
  assert(await incomeMobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  if (capture) await incomeMobile.screenshot({ path: 'coverage/kan133/skattebeslut-sparat-390.png', fullPage: true })

  await incomeDesktop.evaluate(() => window.refreshWithdrawal())
  await expect(income(incomeDesktop)).toContainText('Preliminärbeslut 2026 sparat')
  await incomeYear(incomeDesktop).fill('2025')
  await incomeMode(incomeDesktop).selectOption('estimate')
  await zeroIncome(incomeDesktop, /0 kr · Preliminärskatt som redan ingår/)
  await zeroIncome(incomeDesktop, /0 kr · Beslutad preliminärskatt/)
  await incomeYear(incomeMobile).fill('2025')
  await incomeMode(incomeMobile).selectOption('final')
  await zeroIncome(incomeMobile, /0 kr · Preliminärskatt som redan ingår/)
  await zeroIncome(incomeMobile, /0 kr · Beslutad preliminärskatt/)
  const beforeFinal = saves
  await save(incomeMobile).click()
  await expect(income(incomeMobile).getByRole('alert')).toContainText('Tomt är okänt')
  assert.equal(saves, beforeFinal)
  await zeroIncome(incomeMobile, /0 kr · Kvar att betala enligt slutskattebeskedet/)
  await expect(income(incomeMobile).getByLabel(/Kvar att betala enligt slutskattebeskedet/)).toHaveValue('0')
  await income(incomeMobile).getByLabel(/Kvar att betala enligt slutskattebeskedet/).fill('20')
  failAfterWrite.add(incomeMobile)
  await save(incomeMobile).click()
  await expect(income(incomeMobile)).toContainText('Skatteuppgiften sparades. Beräkningen kunde inte läsas in.')
  await expect(reserve(incomeMobile)).toHaveCount(0)
  await retry(incomeMobile).click()
  await expect(income(incomeMobile)).toContainText('Slutskattebesked 2025 sparat')
  assert.equal(incomeFact(2025).finalOre, 2000)
  assert.equal(incomeFact(2026).pendingOre, 0)
  await save(incomeDesktop).click()
  await expect(income(incomeDesktop)).toContainText('Underlaget har ändrats')
  await expect(save(incomeDesktop)).toBeDisabled()

  const changedIncome = snapshots.get(incomeOwner)
  addWithdrawalTx(changedIncome, 'older-result', '2025-12-01', 'manual', [['1930', 100], ['3010', -100]])
  addWithdrawalFact(changedIncome, 'coverage', { from: '2025-12-01', noEarlierObligations: true })
  sealWithdrawal(changedIncome)
  await incomeMobile.evaluate(() => window.refreshWithdrawal())
  await expect(income(incomeMobile)).toContainText('Resultatunderlaget för den fasta skatteuppgiften 2025 har ändrats.')
  await expect(reserve(incomeMobile)).toHaveText(/Kan inte beräknas/)
  addWithdrawalTx(changedIncome, 'tax-payment', date, 'manual', [['2012', 10], ['1930', -10]])
  sealWithdrawal(changedIncome)
  await incomeMobile.evaluate(() => window.refreshWithdrawal())
  await expect(income(incomeMobile)).toContainText('Skattekontoavstämningen behöver ses över')
  await expect(save(incomeMobile)).toBeDisabled()
  console.log('PASS KAN-133 annual decisions: explicit zero, distinct years, final decision and current-year guard, missing and stale tax checks, changed final basis, empty, conflict, rejected save and failed reload')


  await verifyHistory()
} finally {
  await browser.close()
}

async function verifyHistory() {
  const historyPage = await open(390, null, 'synthetic-history-owner')
  const history = historyPage.locator('details').filter({ has: historyPage.getByText('Tidigare kontroller', { exact: true }) })
  const openHistory = () => history.getByText('Tidigare kontroller', { exact: true }).click()
  const rows = Array.from({ length: 12 }, (_, i) => ({
    id: 'revision-' + (i + 1), revision_no: i + 1, as_of_date: '2026-11-02',
    recorded_at: '2026-11-03T12:00:00Z', schema_version: 1,
  })).reverse()
  let historyReads = 0
  let mode = 'failure'
  let delayed
  let release
  await historyPage.route('https://synthetic.invalid/rest/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const query = url.searchParams
    assert.equal(request.method(), 'GET')
    assert.equal(request.headers().authorization, 'Bearer synthetic-history')
    historyReads++
    const id = query.get('id') ?? query.get('revision_id')
    const facts = url.pathname.endsWith('_facts')
    const before = query.get('revision_no')
    const queryOwner = query.get('user_id')
    if ((mode === 'delay' && id === 'eq.revision-11') || (mode === 'delay-list' && !id)) {
      delayed()
      await new Promise(resolve => { release = resolve })
    }
    if (mode === 'failure' || (mode === 'forbidden' && id)) {
      return route.fulfill({ status: mode === 'failure' ? 400 : 403, json: { message: 'synthetic error' } })
    }
    if (!id) {
      assert.equal(query.get('order'), 'revision_no.desc')
      assert.equal(query.get('limit'), '11')
    }
    const data = mode === 'empty' || queryOwner !== 'eq.synthetic-history-owner' ? [] : facts
      ? [{ fact_key: 'buffer', payload: { amountOre: id === 'eq.revision-1' ? 12300 : 500 }, observed_on: '2026-11-02', source_kind: 'user_statement' }]
      : rows.filter(row => id ? 'eq.' + row.id === id && mode !== 'missing' : !before || row.revision_no < Number(before.slice(3))).slice(0, 11)
    await route.fulfill({ json: data }).catch(() => {})
  })
  const originalAmount = await reserve(historyPage).textContent()
  assert.equal(historyReads, 0)
  await openHistory()
  await expect(history.getByRole('alert')).toHaveText('Historiken kunde inte hämtas.')
  await expect(history.getByText('Det finns inga sparade kontrollversioner.')).toHaveCount(0)
  mode = 'normal'
  await history.getByRole('button', { name: 'Försök igen' }).click()
  const versions = () => history.getByRole('button', { name: /^Version / })
  await expect(versions()).toHaveCount(10)
  rows.unshift({ ...rows[0], id: 'revision-13', revision_no: 13 })
  await history.getByRole('button', { name: 'Visa fler versioner' }).click()
  await expect(versions()).toHaveCount(12)
  assert.deepEqual(await versions().evaluateAll(items => items.map(item => item.firstElementChild.textContent)),
    Array.from({ length: 12 }, (_, i) => 'Version ' + (12 - i)))
  const older = history.getByRole('button', { name: /^Version 1 ·|^Version 1 Avser/ })
  const other = history.getByRole('button', { name: /^Version 11 Avser/ })
  await older.click()
  await expect(history.getByText('123 kr', { exact: true })).toBeVisible()
  assert.equal(await reserve(historyPage).textContent(), originalAmount)
  assert(await historyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  if (capture) {
    await mkdir('coverage/kan133', { recursive: true })
    await history.getByText('Sparade uppgifter i version 1').scrollIntoViewIfNeeded()
    await historyPage.screenshot({ path: 'coverage/kan133/tidigare-kontroller-390.png' })
  }
  for (const unavailable of ['missing', 'forbidden']) {
    await older.click()
    mode = unavailable
    await older.click()
    await expect(history.getByRole('alert')).toHaveText('Den sparade versionen kunde inte visas.')
  }
  mode = 'delay'
  let started = new Promise(resolve => { delayed = resolve })
  await other.click()
  await started
  await older.click()
  await expect(history.getByText('123 kr', { exact: true })).toBeVisible()
  release()
  await expect(history.getByText('Sparade uppgifter i version 11')).toHaveCount(0)
  started = new Promise(resolve => { delayed = resolve })
  await other.click()
  await started
  await historyPage.evaluate(() => window.refreshHistorySession())
  await expect(versions()).toHaveCount(0)
  release()
  await expect(history.getByText('Sparade uppgifter i version 11')).toHaveCount(0)
  mode = 'empty'
  await openHistory()
  await expect(history.getByText('Det finns inga sparade kontrollversioner.')).toBeVisible()
  await openHistory()
  mode = 'delay-list'
  started = new Promise(resolve => { delayed = resolve })
  await openHistory()
  await started
  await historyPage.evaluate(() => window.setBufferOwner('synthetic-b'))
  await expect(versions()).toHaveCount(0)
  release()
  mode = 'normal'
  await expect(history.getByText('Det finns inga sparade kontrollversioner.')).toHaveCount(0)
  await openHistory()
  await expect(history.getByText('Det finns inga sparade kontrollversioner.')).toBeVisible()
  await historyPage.evaluate(() => window.setBufferOwner('synthetic-history-owner'))
  mode = 'normal'
  await openHistory()
  await expect(versions()).toHaveCount(10)
  await historyPage.getByRole('button', { name: /^Extra buffert/ }).click()
  await amount(historyPage).fill('10')
  rows.unshift({ ...rows[0], id: 'revision-14', revision_no: 14 })
  await save(historyPage).click()
  await expect(historyPage.getByText('Sparat · beräkningen är uppdaterad.')).toBeVisible()
  await expect(versions().first()).toHaveText(/Version 14/)
  await expect(history.getByRole('button', { name: /^Version 14 Avser/ })).toHaveCount(1)
  await expect(history).toHaveAttribute('open', '')
  console.log('PASS KAN-133 history: refresh after save, lazy GET, ordering, cursor, older facts, unchanged calculation, empty, errors, neutral detail, overlapping requests, session and owner resets, 390px')
}
