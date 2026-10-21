import assert from 'node:assert/strict'
import { changeProfileDraft, clearSavedDraftFields } from '../src/lib/profileSettingsDraft.ts'
import { vatNetPresentation } from '../src/lib/vatNetPresentation.ts'

const first = changeProfileDraft(null, 'A', 'companyName', 'Draft')
const newer = changeProfileDraft(first, 'A', 'companyName', 'New edit during save')
assert.deepEqual(clearSavedDraftFields(newer, 'A', first.fields), newer)
assert.equal(clearSavedDraftFields(first, 'A', first.fields), null)
assert.deepEqual(changeProfileDraft(first, 'B', 'vatNumber', 'B'), { ownerId: 'B', fields: { vatNumber: 'B' } })
assert.deepEqual(clearSavedDraftFields(first, 'B', first.fields), first)
const roles = changeProfileDraft(first, 'A', 'owner_private_payment', '2018')
assert.deepEqual(clearSavedDraftFields(roles, 'A', first.fields)?.fields, { owner_private_payment: '2018' })
for (const [net, label, amount] of [[-12000, 'Moms att få tillbaka', 12000], [12000, 'Moms att betala', 12000], [0, 'Moms i balans', 0], [-0, 'Moms i balans', 0]] as const) {
  const p = vatNetPresentation(net); assert.equal(p.label, label); assert.equal(p.amount, amount)
  assert.equal(Object.is(p.amount, -0), false)
}
console.log('PASS draft races/owner boundaries/independent saves and VAT receivable/payable/zero presentation')
