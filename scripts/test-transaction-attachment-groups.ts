import assert from 'node:assert/strict'
import { attachmentGroupingPauseReason, groupTransactionsByAttachment } from '../src/lib/transactionAttachmentGroups.ts'
import { DEFAULT_TRANSACTION_HISTORY_FILTERS, filterAndSortTransactionHistoryItems, type TransactionHistoryFilterItem } from '../src/lib/transactionHistoryFilters.ts'

function item(id: string, owner: string | null, path: string | null, date = '2026-10-16') {
  return {
    tx: { id, user_id: owner, file_url: path, date, description: `Original ${id}`, amount: 228, source: 'manual' },
    journal: [{ id: `j-${id}`, account_number: '5420', debit: 228, credit: 0, ver_nr: 18 }],
    verNr: 18,
  }
}

const fixtures = [
  item('a', 'owner-a', 'owner-a/private.pdf'),
  item('b', 'owner-a', 'owner-a/private.pdf', '2026-10-03'),
  item('other-owner', 'owner-b', 'owner-a/private.pdf'),
  item('same-name', 'owner-a', 'another/private.pdf'),
  item('case', 'owner-a', 'owner-a/Private.pdf'),
  item('space', 'owner-a', 'owner-a/private.pdf '),
  item('empty-a', 'owner-a', ''), item('empty-b', 'owner-a', ''),
  item('blank-a', 'owner-a', '  '), item('blank-b', 'owner-a', '  '),
  item('null-a', 'owner-a', null), item('null-b', 'owner-a', null),
  item('unknown-a', null, 'owner-a/private.pdf'), item('unknown-b', null, 'owner-a/private.pdf'),
]
const before = JSON.stringify(fixtures)
for (const fixture of fixtures) {
  Object.freeze(fixture.tx)
  fixture.journal.forEach(Object.freeze)
  Object.freeze(fixture.journal)
  Object.freeze(fixture)
}
const groups = groupTransactionsByAttachment(fixtures, true)
const first = groups[0]
assert.equal(first.kind, 'attachmentGroup')
if (first.kind !== 'attachmentGroup') throw new Error('Expected group')
assert.deepEqual(first.items.map(member => member.tx.id), ['a', 'b'])
assert.equal(first.startDate, '2026-10-03')
assert.equal(first.endDate, '2026-10-16')
assert.equal(first.fileUrl, 'owner-a/private.pdf')
assert.equal(groups.length, fixtures.length - 1)
assert.equal(groups.filter(group => group.kind === 'attachmentGroup').length, 1)
assert.equal(first.items[0], fixtures[0], 'Original object is preserved')
assert.equal(JSON.stringify(fixtures), before, 'Descriptions, amounts, journal and file references are unchanged')
assert.equal(groupTransactionsByAttachment(fixtures, false).length, fixtures.length)
assert.equal(groupTransactionsByAttachment([], true).length, 0)
assert.equal(groupTransactionsByAttachment([fixtures[0]], true)[0].kind, 'transaction')

// Similar business text/batch/category must never create membership.
const unrelated = [item('same-text-a', 'owner-a', 'a.pdf'), item('same-text-b', 'owner-a', 'b.pdf')]
unrelated.forEach(value => { value.tx.description = 'KAN-X batch-123 same filename'; value.tx.source = 'manual' })
assert.equal(groupTransactionsByAttachment(unrelated, true).every(group => group.kind === 'transaction'), true)

const undo = ['u1', 'u2'].map(id => ({ ...item(id, 'owner-a', 'owner-a/private.pdf'),
  tx: { ...item(id, 'owner-a', 'owner-a/private.pdf').tx, source: 'sie_import_undo', import_batch_id: 'batch' },
}))
assert.equal(groupTransactionsByAttachment(undo, true).every(group => group.kind === 'transaction'), true, 'Existing SIE undo handling retains all members')

for (const sort of ['date_desc', 'date_asc'] as const) {
  const filters = { ...DEFAULT_TRANSACTION_HISTORY_FILTERS, sort }
  assert.equal(attachmentGroupingPauseReason(filters), null)
  const ordered = filterAndSortTransactionHistoryItems({ items: fixtures.slice(0, 2), filters, accounts: [] })
  const [group] = groupTransactionsByAttachment(ordered, true)
  assert.equal(group.kind, 'attachmentGroup')
  if (group.kind === 'attachmentGroup') assert.deepEqual(group.items, ordered, 'Date sort retained inside group')
}
for (const sort of ['ver_desc', 'amount_desc', 'amount_asc'] as const) {
  assert.ok(attachmentGroupingPauseReason({ ...DEFAULT_TRANSACTION_HISTORY_FILTERS, sort }))
}
for (const partial of [{ search: 'Original a' }, { category: 'costs' as const }]) {
  const filters = { ...DEFAULT_TRANSACTION_HISTORY_FILTERS, ...partial }
  assert.ok(attachmentGroupingPauseReason(filters), 'Search/category displays individual matches')
  const matched = filterAndSortTransactionHistoryItems({ items: fixtures as TransactionHistoryFilterItem[], filters, accounts: [] })
  const visible = groupTransactionsByAttachment(matched, !attachmentGroupingPauseReason(filters))
  assert.equal(visible.length, matched.length)
  assert.equal(visible.every(value => value.kind === 'transaction'), true)
}

const many = Array.from({ length: 55 }, (_, index) => item(`p${index}`, 'owner-a', `p${index}.pdf`))
many.splice(49, 0, fixtures[0], fixtures[1])
const pages = groupTransactionsByAttachment(many, true)
assert.equal(pages.length, 56)
assert.equal(pages[49].kind, 'attachmentGroup', 'Group at page boundary is indivisible')
const ids = pages.flatMap(group => group.kind === 'attachmentGroup' ? group.items : [group.item]).map(member => member.tx.id)
assert.equal(new Set(ids).size, many.length, 'Every verification appears exactly once across pages')
console.log('PASS: attachment grouping, ownership, exact references, originals, filters, sorting, SIE precedence and pagination')
