// Run only against the pinned synthetic localhost database. All writes roll back.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { auth, guard, json, literal, query } from './kan122-local-db.mjs'
import { getDefaultAccountPresets, getDefaultAccountPresetsV1 } from '../src/lib/accountingKnowledge.ts'
import { buildWithdrawalAssessment } from '../src/lib/withdrawalAssessment.ts'
import { checkWithdrawalTax, saleWithdrawal, sealWithdrawal } from '../tests/fixtures/withdrawalFixtures.ts'

assert.equal(process.env.SOLOLEDGER_KAN134_LOCAL_GO, 'rollback-only')

const current = getDefaultAccountPresetsV1().find(preset => preset.id === 'skatter_avgifter')
const legacy = getDefaultAccountPresets().find(preset => preset.id === 'skattekonto_default')
assert.ok(current)
assert.ok(legacy)

verifyTaxBooking(current)
verifyTaxBooking(legacy)

function verifyTaxBooking(category) {
  const owner = randomUUID()
  const email = literal(`kan134-${owner}@example.invalid`)
  const userId = literal(owner)
  const date = '2026-12-20'

  const payload = {
    idempotency_key: randomUUID(), date, amount: 1500, type: category.id,
    vat_rate: category.default_vat_rate, description: 'KAN134 syntetisk preliminärskatt',
  }
  const book = `public.book_transaction_atomic(${json(payload)})`
  const [receipt, replay, booking, residual] = query(`
    BEGIN;
    ${guard}
    INSERT INTO auth.users(id,email) VALUES (${userId},${email});
    INSERT INTO public.profiles(id,email,company_name,vat_status,domestic_sales_vat_treatment,
      foreign_purchase_reporting,default_deduction_entitlement,vat_management_from,vat_period_type)
    VALUES (${userId},${email},'KAN134 synthetic only','registered','taxable','not_required','full','2026-01-01','year')
    ON CONFLICT(id) DO NOTHING;
    INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate)
    VALUES (${literal(category.id)},${userId},${literal(category.name)},${literal(category.debit_account)},
      ${literal(category.credit_account)},${category.default_vat_rate});
    ${auth(owner)}
    SELECT ${book};
    SELECT ${book};
    SELECT jsonb_build_object(
      'transactions', (SELECT jsonb_agg(to_jsonb(t)) FROM public.transactions t WHERE user_id=auth.uid()),
      'journal', (SELECT jsonb_agg(to_jsonb(j) ORDER BY account_number) FROM public.journal_entries j WHERE user_id=auth.uid()));
    ROLLBACK;
    SELECT jsonb_build_object('users', (SELECT count(*) FROM auth.users WHERE id=${userId}),
      'transactions', (SELECT count(*) FROM public.transactions WHERE user_id=${userId}),
      'journal', (SELECT count(*) FROM public.journal_entries WHERE user_id=${userId}));
  `)

  assert.equal(receipt.success, true, JSON.stringify(receipt))
  assert.equal(replay.idempotent_replay, true, JSON.stringify(replay))
  assert.equal(replay.transaction_id, receipt.transaction_id)
  assert.equal(booking.transactions.length, 1)
  const [transaction] = booking.transactions
  assert.equal(transaction.id, receipt.transaction_id)
  assert.equal(transaction.booked, true)
  assert.equal(transaction.vat_rate, 0)
  assert.equal(transaction.amount, 1500)
  assert.deepEqual(booking.journal.map(row => [row.account_number, row.debit, row.credit]), [
    ['1930', 0, 1500], ['2012', 1500, 0],
  ])
  assert.ok(booking.journal.every(row => row.transaction_id === transaction.id && row.ver_nr === receipt.ver_nr))
  assert.deepEqual(residual, { users: 0, transactions: 0, journal: 0 })

  const snapshot = saleWithdrawal()
  checkWithdrawalTax(snapshot, 0, '2026-12-19')
  const before = buildWithdrawalAssessment(snapshot).result
  snapshot.transactions.push({ ...transaction, user_id: snapshot.user_id })
  snapshot.journal.push(...booking.journal.map(row => ({ ...row, user_id: snapshot.user_id })))
  const stale = buildWithdrawalAssessment(sealWithdrawal(snapshot)).result
  assert.equal(stale.bankOre, before.bankOre - 150000)
  assert.equal(stale.vatOre, before.vatOre)
  assert.equal(stale.recommendedOre, null)
  assert.ok(stale.issues.some(issue => issue.includes('En senare skattebetalning behöver matchas')))
  checkWithdrawalTax(snapshot, 0, date)
  const checked = buildWithdrawalAssessment(snapshot).result
  assert.equal(checked.taxAccountOre, 0)
  assert.ok(checked.issues.some(issue => issue.includes('Kontrollera debiterad skatt för 2026')))

  console.log(`PASS KAN-134 ${category.id}: one 1 500 kr booking, bank credit, no VAT, no duplicate on replay, withdrawal recheck, rollback`)
}
