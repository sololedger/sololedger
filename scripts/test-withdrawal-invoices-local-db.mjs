// Explicitly approved local disposable DB only. All synthetic scenarios ROLLBACK.
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { buildWithdrawalAssessment } from '../src/lib/withdrawalAssessment.ts'
const db = 'sololedger_kan97_disposable_20261019'
const evidence = 'coverage/kan97-p2-20261020/'
assert.equal(process.env.SOLOLEDGER_KAN97_TEST_DB, db)
assert.equal(process.env.PGPASSFILE, 'C:/SoloLedger/LocalTest/pgpass.conf')
const manifest = JSON.parse(readFileSync('coverage/kan97-db-20261019/database-manifest.json', 'utf8'))
assert.equal(manifest.database, db); assert.equal(String(manifest.oid), '56112')
const env = { ...process.env, PGHOSTADDR: '127.0.0.1', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' }
for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSWORD', 'DATABASE_URL']) delete env[key]
const guard = `DO $g$ BEGIN IF current_database()<>'${db}' OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>5432 OR (SELECT oid FROM pg_database WHERE datname=current_database())<>56112 OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM '${manifest.marker}' THEN RAISE EXCEPTION 'Refuse non-disposable target'; END IF; END $g$; SET statement_timeout='20s'; SET lock_timeout='5s';`
function run(sql, fail = false) {
  const r = spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe', ['-X', '-w', '-h', 'localhost', '-p', '5432', '-U', 'postgres', '-d', db, '-Atq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { input: guard + sql, env, encoding: 'utf8', windowsHide: true, timeout: 45000, maxBuffer: 15e6 })
  if (!fail) assert.equal(r.status, 0, r.stderr)
  return r
}
function save(name, data) { const path = evidence + name; assert(!existsSync(path), 'Never overwrite evidence: ' + name); writeFileSync(path, JSON.stringify(data, null, 2)) }
const fingerprintSQL = `SELECT json_build_object('functions',(SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname<>'get_withdrawal_context'),'acl',(SELECT proacl FROM pg_proc WHERE oid='public.get_withdrawal_context(date)'::regprocedure),'rls',(SELECT jsonb_object_agg(relname,relrowsecurity) FROM pg_class WHERE oid IN ('public.customer_invoices'::regclass,'public.customer_invoice_bookings'::regclass)),'rows',(SELECT jsonb_object_agg(name,n) FROM (SELECT 'users' name,count(*) n FROM auth.users UNION ALL SELECT 'invoices',count(*) FROM customer_invoices UNION ALL SELECT 'bookings',count(*) FROM customer_invoice_bookings UNION ALL SELECT 'journal',count(*) FROM journal_entries UNION ALL SELECT 'facts',count(*) FROM withdrawal_assessment_facts) x));`
const before = JSON.parse(run(fingerprintSQL).stdout.trim())
if (process.argv.includes('--replace-local-draft')) {
  // This exact, isolated DB already contains the previously tested UNRELEASED
  // protocol-2 draft. Restore the published preimage only inside this atomic
  // test transaction, then execute the revised migration with its real guard.
  // The repo migration guard is never relaxed to accept the unreleased draft.
  const currentHash = run("SELECT md5(pg_get_functiondef('public.get_withdrawal_context(date)'::regprocedure));").stdout.trim()
  assert.equal(currentHash, '05660c3b49df7253b74652467f9a1964')
  const base = execFileSync('git', ['show', 'fde7359:supabase/migrations/20261019200000_kan97_withdrawal_assessments.sql'], { encoding: 'utf8' })
  const getter = base.slice(base.indexOf('CREATE FUNCTION public.get_withdrawal_context'), base.indexOf('REVOKE ALL ON FUNCTION public.get_withdrawal_context')).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')
  const migration = readFileSync('supabase/migrations/20261020130000_kan97_withdrawal_invoice_context.sql', 'utf8')
  run(`BEGIN; DO $pre$ BEGIN IF md5(pg_get_functiondef('public.get_withdrawal_context(date)'::regprocedure)) <> '${currentHash}' THEN RAISE EXCEPTION 'Unexpected local draft'; END IF; END $pre$;` + getter + migration.replace(/^BEGIN;\r?\n/m, ''))
  save('local-draft-replacement.json', { target: db, previousLocalDraft: currentHash, publishedPreimageGuardUnchanged: true, replacementAtomic: true, contextHash: run("SELECT md5(pg_get_functiondef('public.get_withdrawal_context(date)'::regprocedure));").stdout.trim() })
}
if (process.argv.includes('--apply-local')) {
  save('local-before.json', before)
  run(readFileSync('supabase/migrations/20261020130000_kan97_withdrawal_invoice_context.sql', 'utf8'))
  save('local-migration-applied.json', { target: db, contextHash: run("SELECT md5(pg_get_functiondef('public.get_withdrawal_context(date)'::regprocedure));").stdout.trim() })
}
const date = run("SELECT (now() AT TIME ZONE 'Europe/Stockholm')::date;").stdout.trim()
const A = randomUUID(), B = randomUUID()
const auth = uid => `SET LOCAL request.jwt.claim.sub='${uid}'; SET LOCAL ROLE authenticated;`
const setup = `BEGIN; INSERT INTO auth.users(id) VALUES('${A}'),('${B}'); INSERT INTO profiles(id,email,vat_status,domestic_sales_vat_treatment,vat_period_type,vat_management_from,foreign_purchase_reporting,default_deduction_entitlement) VALUES('${A}','withdrawal-a@example.invalid','registered','taxable','year','2025-01-01','required','full'),('${B}','withdrawal-b@example.invalid','registered','taxable','year','2025-01-01','required','full');${auth(A)}`
const payload = (rate, year) => JSON.stringify({ invoice_number: 'synthetic', customer_name: 'Synthetic fixture', invoice_date: `${year}-06-01`, service_date: `${year}-06-01`, due_date: `${year}-06-30`, gross_amount: 1000 + rate * 10, vat_treatment: rate ? 'taxable' : 'exempt', vat_rate: rate, attachment_url: 'fixtures/synthetic.pdf' })
const invoiceId = `(SELECT id FROM customer_invoices WHERE user_id='${A}' AND invoice_number='synthetic')`
const create = (rate, year) => `SELECT create_customer_invoice_atomic('${payload(rate, year)}'::jsonb);`
const pay = day => `SELECT record_customer_invoice_payment_atomic(${invoiceId},'${day}','${randomUUID()}');`
const settle = day => `SELECT settle_customer_invoice_receivable_atomic(${invoiceId},'${day}','${randomUUID()}');`
const ye = `SELECT book_customer_invoice_year_end_receivable_atomic(${invoiceId},2025,'${randomUUID()}');`
function contextSQL(day = date) { return `SELECT get_withdrawal_context('${day}');` }
const snapshots = []
function scenario(name, sql, expected, asOf = date) {
  const out = run(setup + sql + `SELECT ensure_vat_periods('${asOf}');` + contextSQL(asOf) + 'ROLLBACK;').stdout.trim().split(/\r?\n/)
  const s = JSON.parse(out.at(-1))
  assert.equal(s.protocol, 3)
  assert(s.journal.every(j => j.date <= asOf))
  assert(s.invoice_bookings.every(b => b.booking_date <= asOf))
  s.revision = { id: 'synthetic-revision', user_id: A, as_of_date: asOf, recorded_at: asOf, facts: [{ key: 'coverage', value: { from: '2025-01-01', noEarlierObligations: true } }, { key: 'rate:2025', value: { rate: 30 } }, { key: 'rate:2026', value: { rate: 30 } }] }
  const r = buildWithdrawalAssessment(s).result
  for (const [key, value] of Object.entries(expected)) assert.equal(r[key], value, `${name} ${key}: ${JSON.stringify(r.issues)}`)
  snapshots.push({ name, snapshot: s, result: r })
  console.log('PASS local RPC:', name)
  return s
}
for (const rate of [0, 6, 12, 25]) scenario(`same-year ${rate}%`, create(rate, 2026) + pay('2026-06-10'), { recommendedOre: 70000, incomeTaxOre: 30000, vatOre: rate * 1000 })
scenario('unpaid current year', create(25, 2026), { bankOre: 0, recommendedOre: 0 })
scenario('year-end receivable', create(25, 2025) + ye, { bankOre: 0, incomeTaxOre: 30000, vatOre: 25000, recommendedOre: 0 })
scenario('receivable settled next year', create(25, 2025) + ye + settle('2026-01-10'), { bankOre: 125000, incomeTaxOre: 30000, vatOre: 25000, recommendedOre: 70000 })
scenario('undo/rebook actual RPC on current date', create(25, 2026) + pay('2026-06-10') + `SELECT undo_customer_invoice_payment_atomic(${invoiceId},'${randomUUID()}');` + pay(date), { recommendedOre: 70000 })
scenario('settlement undo/rebook actual RPC', create(25, 2025) + ye + settle('2026-01-10') + `SELECT undo_customer_invoice_payment_atomic(${invoiceId},'${randomUUID()}');` + settle(date), { bankOre: 125000, incomeTaxOre: 30000, vatOre: 25000, recommendedOre: 70000 })
// Historical valuation must not use today's invoice status or later reversal.
scenario('as-of before later settlement', create(25, 2025) + ye + settle('2026-01-10'), { bankOre: 0, incomeTaxOre: 30000, vatOre: 25000, recommendedOre: 0 }, '2025-12-31')
scenario('as-of before later reversal', create(25, 2026) + pay('2026-06-10') + `SELECT undo_customer_invoice_payment_atomic(${invoiceId},'${randomUUID()}');`, { bankOre: 125000, incomeTaxOre: 30000, vatOre: 25000, recommendedOre: 70000 }, '2026-06-30')
const historicalTx = randomUUID()
scenario('historical manual exempt linkage', `RESET ROLE; UPDATE profiles SET domestic_sales_vat_treatment='exempt_other' WHERE id='${A}';${auth(A)}` + create(0, 2026) + `RESET ROLE;
UPDATE customer_invoices SET payment_status='paid',paid_at='2026-06-10' WHERE user_id='${A}';
INSERT INTO transactions(id,user_id,date,description,amount,type,vat_rate,booked,source) VALUES('${historicalTx}','${A}','2026-06-10','Synthetic historical fixture',1000,'försäljning',0,true,'manual');
INSERT INTO journal_entries(transaction_id,user_id,date,ver_nr,account_number,debit,credit) VALUES('${historicalTx}','${A}','2026-06-10',1,'1930',1000,0),('${historicalTx}','${A}','2026-06-10',1,'3010',0,1000);
INSERT INTO customer_invoice_bookings(user_id,invoice_id,transaction_id,booking_kind,booking_date,fiscal_year,gross_amount,net_amount,vat_amount,idempotency_key) VALUES('${A}',${invoiceId},'${historicalTx}','historical_payment_same_year','2026-06-10',2026,1000,1000,0,'${randomUUID()}');${auth(A)}`, { bankOre: 100000, incomeTaxOre: 30000, vatOre: 0, recommendedOre: 70000 })
// JSONB keys have canonical ordering, not insertion order.
const signatureSnapshots = run(setup + create(25, 2026) + contextSQL() + `RESET ROLE; UPDATE customer_invoices SET service_date='2026-06-02' WHERE user_id='${A}';${auth(A)}` + contextSQL() + 'ROLLBACK;').stdout.trim().split(/\r?\n/).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(x => x?.protocol === 3)
assert.equal(signatureSnapshots.length, 2); assert.notEqual(signatureSnapshots[0].signature, signatureSnapshots[1].signature)
assert.equal(signatureSnapshots[0].financial_signature, signatureSnapshots[1].financial_signature, 'invoice proof must not redefine tax account anchor')
const stale = run(setup + create(25, 2026) + `SELECT set_config('test.old_signature',get_withdrawal_context('${date}')->>'signature',true); RESET ROLE; UPDATE customer_invoices SET service_date='2026-06-02' WHERE user_id='${A}';${auth(A)} SELECT save_withdrawal_assessment('${date}',NULL,current_setting('test.old_signature'),'[]'::jsonb);ROLLBACK;`, true)
assert.notEqual(stale.status, 0); assert.match(stale.stderr, /40001/, 'changed invoice evidence invalidates the existing save RPC signature')
const isolation = run(setup + create(25, 2026) + pay('2026-06-10') + `RESET ROLE;${auth(B)}` + contextSQL() + 'ROLLBACK;').stdout.trim().split(/\r?\n/)
const isolated = JSON.parse(isolation.at(-1)); assert.deepEqual(isolated.invoices, []); assert.deepEqual(isolated.invoice_bookings, []); assert.deepEqual(isolated.journal, []); assert.deepEqual(isolated.invoice_journal, [])
const futureRows = `RESET ROLE; INSERT INTO journal_entries(transaction_id,user_id,date,ver_nr,account_number,debit,credit)
SELECT b.transaction_id,'${A}','2027-01-01',(SELECT min(ver_nr) FROM journal_entries j WHERE j.transaction_id=b.transaction_id),x.account,x.debit,x.credit
FROM customer_invoice_bookings b CROSS JOIN (VALUES ('5410',500::numeric,0::numeric),('1930',0::numeric,500::numeric)) x(account,debit,credit)
WHERE b.user_id='${A}' AND b.booking_kind='payment_same_year';${auth(A)}`
const malformed = scenario('P2 five-row journal with hidden future extras', create(25, 2026) + pay('2026-06-10') + futureRows, { bankOre: 125000, recommendedOre: null })
assert.equal(malformed.journal.length, 3); assert.equal(malformed.invoice_journal.length, 5)
const extraTx = randomUUID()
const extraPair = `RESET ROLE;
INSERT INTO transactions(id,user_id,date,description,amount,type,vat_rate,booked,source) VALUES('${extraTx}','${A}','${date}','Synthetic invalid duplicate',1250,'customer_invoice',25,true,'customer_invoice');
INSERT INTO journal_entries(transaction_id,user_id,date,ver_nr,account_number,debit,credit)
SELECT '${extraTx}','${A}','${date}',2,j.account_number,j.debit,j.credit FROM journal_entries j JOIN customer_invoice_bookings b ON b.transaction_id=j.transaction_id WHERE b.user_id='${A}' AND b.booking_kind='payment_same_year';
INSERT INTO customer_invoice_bookings(user_id,invoice_id,transaction_id,booking_kind,booking_date,fiscal_year,gross_amount,net_amount,vat_amount,idempotency_key)
VALUES('${A}',${invoiceId},'${extraTx}','payment_same_year','${date}',${date.slice(0,4)},1250,1000,250,'${randomUUID()}');${auth(A)}SELECT undo_customer_invoice_payment_atomic(${invoiceId},'${randomUUID()}');`
scenario('P2 overlapping same-day extra payment pair', create(25, 2026) + pay('2026-06-10') + extraPair, { recommendedOre: null })
const futureSignatures = run(setup + create(25, 2026) + pay('2026-06-10') + contextSQL() + futureRows + contextSQL() + 'ROLLBACK;').stdout.trim().split(/\r?\n/).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(x=>x?.protocol===3)
assert.equal(futureSignatures.length,2); assert.notEqual(futureSignatures[0].signature,futureSignatures[1].signature)
assert.deepEqual(futureSignatures[0].journal,futureSignatures[1].journal,'future proof must not enter dated economics')
const anonymous = run('BEGIN; SET LOCAL ROLE anon;' + contextSQL() + 'ROLLBACK;', true); assert.notEqual(anonymous.status, 0); assert.match(anonymous.stderr, /42501/)
const after = JSON.parse(run(fingerprintSQL).stdout.trim())
assert.deepEqual(after, before, 'all other function definitions, ACL, RLS and persistent row counts unchanged')
save(`local-invoice-results-${Date.now()}.json`, { target: db, scenarios: snapshots, unchangedBoundaries: true, ownerIsolation: true, anonDenied: true, invoiceProofSignature: true, staleProofSaveRejected: true, futureProofChangesSignatureWithoutChangingDatedJournal: true })
console.log('PASS local preservation, invoice-proof signature, RLS owner isolation, anon denial; every scenario rolled back')
