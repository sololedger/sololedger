import assert from 'node:assert/strict'
import { buildHistoryPresentations } from '../src/lib/transactionHistoryPresentation.ts'
import { filterAndSortTransactionHistoryItems, DEFAULT_TRANSACTION_HISTORY_FILTERS } from '../src/lib/transactionHistoryFilters.ts'
import { buildBankAccountHistory } from '../src/lib/bankAccountHistory.ts'
import { calculateBusinessResult } from '../src/lib/resultEngine.ts'
import { groupTransactionsByAttachment } from '../src/lib/transactionAttachmentGroups.ts'
import { kan84Fixture } from './fixtures/kan84-presentation.ts'

const fixture = kan84Fixture()
const before = JSON.stringify(fixture)
const economics = () => {
  const balances: Record<string, number> = {}
  for (const rows of Object.values(fixture.journalMap)) for (const row of rows) {
    const key = String(row.account_number)
    balances[key] = (balances[key] ?? 0) + Number(row.debit) - Number(row.credit)
  }
  return { bank: buildBankAccountHistory(fixture), result: calculateBusinessResult(balances), balances }
}
const economicBefore = economics()
for (const tx of fixture.transactions) Object.freeze(tx)
for (const rows of Object.values(fixture.journalMap)) { rows.forEach(Object.freeze); Object.freeze(rows) }
Object.freeze(fixture.transactions); Object.freeze(fixture.journalMap)
const presentations = buildHistoryPresentations(fixture.transactions, fixture.journalMap)
assert.equal(presentations.size, 15)
const presentation = (ver: number) => presentations.get('synthetic-tx-' + ver)!
for (let ver = 18; ver <= 21; ver++) {
  assert.equal(presentation(ver).badge, 'Bokföringsrättelse')
  assert.equal(presentation(ver).amountLabel, 'Omfört 285 kr')
  assert.equal(presentation(ver).amountClass, 'text-gray-700')
  assert.match(presentation(ver).explanation!, /Ingen ny bankbetalning/)
  assert.match(presentation(ver).explanation!, new RegExp('VER-' + [10, 12, 13, 15][ver - 18] + '\\b'))
}
for (let ver = 28; ver <= 32; ver++) {
  assert.equal(presentation(ver).amountLabel, '+57 kr')
  assert.equal(presentation(ver).amountClass, 'text-emerald-600')
  assert.equal(presentation(ver).explanation, 'Inbetalning till bank')
  assert.equal(presentation(ver).badge, undefined)
}
for (const [i, month] of ['juni', 'juli', 'augusti', 'september', 'oktober'].entries()) {
  assert.equal(presentation(23 + i).title, `Adobe – EU-tjänst ${month} 2026`)
  assert.equal(presentation(23 + i).badge, undefined)
}
assert.equal(presentation(22).title, 'Adobe – bankbetalning oktober 2026')
const items = fixture.transactions.map(tx => ({ tx, journal: fixture.journalMap[tx.id],
  verNr: fixture.journalMap[tx.id][0].ver_nr, presentation: presentations.get(tx.id) }))
const search = (value: string) => filterAndSortTransactionHistoryItems({ items,
  filters: { ...DEFAULT_TRANSACTION_HISTORY_FILTERS, search: value }, accounts: [] })
assert.equal(search('Adobe').length, 19)
assert.equal(search('EU-tjänst juni').length, 1)
assert.equal(search('TESTINVOICE6').length, 1, 'Original description remains searchable')
assert.equal(search('VER-27').length, 1)
assert.equal(search('2614').length, 5)
assert.equal(search('Bokföringsrättelse').length, 4)
assert.equal(groupTransactionsByAttachment(items, true).filter(group => group.kind === 'attachmentGroup').length, 1)
assert.deepEqual(economics(), economicBefore)
assert.equal(JSON.stringify(fixture), before)
assert.equal(economicBefore.bank.entries.length, 10)
assert.equal(economicBefore.bank.entries.filter(row => row.direction === 'in').length, 5)
assert.equal(economicBefore.result.kostnader, 1425)
assert.equal(economicBefore.result.intakter, 0)

function rejected(label: string, mutate: (value: ReturnType<typeof kan84Fixture>) => void) {
  const value = kan84Fixture()
  mutate(value)
  assert.equal(buildHistoryPresentations(value.transactions, value.journalMap).size, 0, label)
}
rejected('Missing batch member', f => { f.transactions.pop() })
rejected('Mixed owners', f => { f.transactions[0].user_id = 'another-owner' })
rejected('Unknown category', f => { f.transactions.find(t => t.type === 'kan84_adobe_refund')!.type = 'ordinary' })
rejected('Wrong source', f => { f.transactions.find(t => t.source === 'vat_v2')!.source = 'manual' })
rejected('Wrong journal ownership', f => { f.journalMap['synthetic-tx-28'][0].user_id = 'another-owner' })
rejected('Wrong journal transaction', f => { f.journalMap['synthetic-tx-28'][0].transaction_id = 'elsewhere' })
rejected('Wrong bank direction', f => { Object.assign(f.journalMap['synthetic-tx-28'][0], { debit: 0, credit: 57 }) })
rejected('Wrong journal account', f => { f.journalMap['synthetic-tx-18'][0].account_number = '1930' })
rejected('Wrong stored amount', f => { f.transactions.find(t => t.id === 'synthetic-tx-28')!.amount = -57 })
rejected('Missing debit is not a verified zero', f => { f.journalMap['synthetic-tx-28'][0].credit = null })
rejected('Different evidence', f => { f.transactions.find(t => t.id === 'synthetic-tx-28')!.file_url = 'fixture-owner/other.pdf' })
rejected('Missing evidence', f => { f.transactions.find(t => t.id === 'synthetic-tx-28')!.file_url = null })
rejected('Wrong evidence owner', f => { f.transactions.forEach(t => { t.file_url = 'someone-else/evidence.pdf' }) })
rejected('Contradictory service month', f => { const t = f.transactions.find(t => t.id === 'synthetic-tx-23')!; t.description = t.description!.replace('06/2026', '10/2026') })
rejected('Wrong original reference', f => { const t = f.transactions.find(t => t.id === 'synthetic-tx-18')!; t.description = t.description!.replace('VER-10', 'VER-12') })
rejected('Missing original journal', f => { delete f.journalMap['synthetic-tx-10'] })
rejected('Unexpected correction', f => { f.transactions.push({ ...f.transactions[0], id: 'correction', is_correction: true, corrects_ver_nr: 10 }) })
rejected('Extra unknown batch row', f => { f.transactions.push({ ...f.transactions[1], id: 'extra' }) })
rejected('Ordinary descriptions, amounts and common evidence alone', f => { f.transactions.forEach(t => { t.type = 'ordinary' }) })
rejected('Wrong ver numbers', f => { f.journalMap['synthetic-tx-28'].forEach(j => { j.ver_nr = 999 }) })
const ordinary = { ...fixture.transactions[0], id: 'ordinary', description: 'Adobe rättelse återbetalning', amount: 57 }
assert.equal(buildHistoryPresentations([ordinary], { ordinary: fixture.journalMap['synthetic-tx-28'] }).size, 0)
console.log('PASS: KAN-87 verified titles, positive refunds, neutral reclassifications, search, immutable economics and fail-closed provenance')
