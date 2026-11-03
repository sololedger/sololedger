// KAN-123: fixed, identified local PostgreSQL only. No hosted connection path.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { query, guard, auth, literal as q, json, Session, database, marker } from './kan122-local-db.mjs'

assert.equal(process.env.SOLOLEDGER_KAN123_LOCAL_GO, 'permissions-and-synthetic-tests')
const migration = '20261103090840_kan123_restrict_ver_number_execute.sql'
const sql = fs.readFileSync('supabase/migrations/' + migration, 'utf8')
assert.equal(sql.replace(/^--.*$/gm, '').trim(),
  'REVOKE EXECUTE ON FUNCTION public.get_next_ver_nr(uuid) FROM PUBLIC;\n' +
  'REVOKE EXECUTE ON FUNCTION public.get_next_ver_nr(uuid) FROM anon;')
const run = 'coverage/kan123-20261103/local-' + randomUUID() + '/'
fs.mkdirSync(run, { recursive: true })
const save = (name, value) => fs.writeFileSync(run + name + '.json', JSON.stringify(value, null, 2), { flag: 'wx' })
const tables = query("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';")[0]
const columns = query("SELECT jsonb_object_agg(table_name,cols) FROM (SELECT table_name,jsonb_agg(column_name) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name)c;")[0]
function digest(excluded = []) {
  return 'SELECT jsonb_build_object(' + tables.map(t => {
    assert(/^[a-z_][a-z_0-9]*$/.test(t))
    const owner = columns[t].includes('user_id') ? 'user_id' : t === 'profiles' ? 'id' : null
    const where = owner && excluded.length ? ' WHERE ' + owner + ' NOT IN (' + excluded.map(q).join(',') + ')' : ''
    return q(t) + ",(SELECT jsonb_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,''))) FROM public.\"" + t + '\" x' + where + ')'
  }).join(',') + ",'auth',(SELECT jsonb_build_object('count',count(*),'hash',md5(coalesce(jsonb_agg(jsonb_build_array(id,email) ORDER BY id)::text,''))) FROM auth.users" +
    (excluded.length ? ' WHERE id NOT IN (' + excluded.map(q).join(',') + ')' : '') + '));'
}
const functions = "SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',md5(replace(pg_get_functiondef(p.oid),chr(13),'')),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f';"
const permissions = `SELECT jsonb_build_object('acl',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.get_next_ver_nr(uuid)'::regprocedure),'effective',(SELECT jsonb_object_agg(rolname,has_function_privilege(oid,'public.get_next_ver_nr(uuid)','EXECUTE')) FROM pg_roles WHERE rolname IN ('postgres','authenticated','service_role','anon','authenticator','pg_read_all_data')));`
function strict(p) {
  assert.deepEqual(p.acl.map(a => a.role).sort(), ['authenticated', 'postgres', 'service_role'])
  assert(p.acl.every(a => a.privilege === 'EXECUTE' && !a.grantable))
  for (const role of ['postgres', 'authenticated', 'service_role']) assert.equal(p.effective[role], true)
  for (const role of ['anon', 'pg_read_all_data']) assert.equal(p.effective[role], false)
  if ('authenticator' in p.effective) assert.equal(p.effective.authenticator, false)
}
const before = query(digest() + functions + permissions)
strict(before[2])
save('before', before)
// Simulate the exact broad Staging ACL inside a transaction; never change roles.
const aclProof = query('BEGIN;' + guard + 'GRANT EXECUTE ON FUNCTION public.get_next_ver_nr(uuid) TO PUBLIC,anon;' +
  permissions + sql + permissions + digest() + functions + sql + permissions + 'ROLLBACK;')
assert.equal(aclProof[0].effective.anon, true)
assert(aclProof[0].acl.some(a => a.role === 'PUBLIC'))
strict(aclProof[1]); strict(aclProof[4])
assert.deepEqual(aclProof[2], before[0], 'Migration must not change any existing data or counters')
assert.deepEqual(aclProof[3], before[1], 'Only simulated excess grants may be removed; all definitions/other ACLs stay fixed')
query('BEGIN;' + guard + sql + 'COMMIT;')
assert.deepEqual(query(digest() + functions + permissions), before, 'Local application is an idempotent ACL-only change')
save('acl-and-idempotence', { status: 'PASS', results: aclProof })

const attempt = `CREATE FUNCTION pg_temp.attempt(command text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $try$
 DECLARE value jsonb;BEGIN EXECUTE command INTO value;RETURN jsonb_build_object('ok',true,'value',value);
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM);END $try$;`
const call = expression => 'SELECT pg_temp.attempt(' + q('SELECT ' + expression) + ');'
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); assert.notEqual(r.value?.success, false); return r.value }
const denied = r => { assert.equal(r.ok, false, JSON.stringify(r)); assert.equal(r.code, '42501') }
const seed = u => `RESET ROLE;${guard}DO $fresh$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id=${q(u)}) THEN RAISE EXCEPTION 'Synthetic collision';END IF;END $fresh$;
 INSERT INTO auth.users(id,email) VALUES(${q(u)},${q('kan123-' + u + '@example.invalid')});
 INSERT INTO profiles(id,email,company_name,vat_status,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement)
 VALUES(${q(u)},${q('kan123-' + u + '@example.invalid')},'KAN123 synthetic only','not_registered','small_business_exempt','not_required','none')
 ON CONFLICT(id) DO UPDATE SET company_name=EXCLUDED.company_name,vat_status=EXCLUDED.vat_status,domestic_sales_vat_treatment=EXCLUDED.domestic_sales_vat_treatment,foreign_purchase_reporting=EXCLUDED.foreign_purchase_reporting,default_deduction_entitlement=EXCLUDED.default_deduction_entitlement;
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan123-deposit',${q(u)},'KAN123 deposit','1930','2018',0),('kan123-cost',${q(u)},'KAN123 expense','6110','1930',0);
 INSERT INTO company_payment_account_roles(user_id,role,account_number) VALUES(${q(u)},'business_payment_account','1930');`
const payload = (type = 'kan123-deposit', amount = 10000) => ({ idempotency_key: randomUUID(), date: '2026-01-10', type, amount, vat_rate: 0, description: 'KAN123 synthetic only' })
const book = p => 'public.book_transaction_atomic(' + json(p) + ')'
const state = u => `RESET ROLE;SELECT jsonb_build_object('transactions',(SELECT count(*) FROM transactions WHERE user_id=${q(u)}),'journals',(SELECT count(*) FROM journal_entries WHERE user_id=${q(u)}),'counter',(SELECT last_ver_nr FROM ver_nr_sequences WHERE user_id=${q(u)}));${auth(u)}`
const checks = []
function test(name, make, verify) {
  const u = randomUUID(), v = randomUUID()
  const results = query(attempt + 'BEGIN;' + guard + seed(u) + seed(v) + auth(u) + make(u, v) + 'RESET ROLE;ROLLBACK;')
  save('case-' + (checks.length + 1), { name, owners: [u, v], results }); verify(results)
  checks.push({ name, status: 'PASS' }); console.log('PASS ' + name)
}
test('ordinary booking, exact retry, periodization and correction stay balanced', u => {
  const p = payload(), expense = payload('kan123-cost', 100), period = { ...payload('kan123-cost', 100), future_date: '2027-01-10' }
  return call(book(p)) + call(book(p)) + call(book(expense)) + call('public.book_periodized_transaction_atomic(' + json(period) + ')') +
    call('public.create_correction_transaction_atomic((SELECT id FROM transactions WHERE user_id=auth.uid() AND type=\'kan123-cost\' AND NOT is_periodized ORDER BY id LIMIT 1))') +
    `SELECT jsonb_build_object('unbalanced',count(*)) FROM (SELECT transaction_id FROM journal_entries WHERE user_id=${q(u)} GROUP BY transaction_id HAVING sum(debit-credit)<>0)t;`
}, r => { r.slice(0, 5).forEach(ok); assert.equal(r[0].value.transaction_id, r[1].value.transaction_id); assert.equal(r[1].value.idempotent_replay, true); assert.equal(r[5].unbalanced, 0) })
test('owner isolation, anonymous denial, retained authenticated/service/postgres access', (u, v) =>
  call(book(payload())) + state(u) + call('public.get_next_ver_nr(' + q(v) + ')') + state(u) +
  'SET LOCAL ROLE anon;' + call('public.get_next_ver_nr(' + q(u) + ')') +
  'SET LOCAL ROLE service_role;' + call('public.get_next_ver_nr(' + q(u) + ')') +
  'RESET ROLE;' + call('public.get_next_ver_nr(' + q(u) + ')') + auth(v) +
  `SELECT jsonb_build_object('transactions',(SELECT count(*) FROM transactions WHERE user_id=${q(u)}),'journals',(SELECT count(*) FROM journal_entries WHERE user_id=${q(u)}));` +
  call(book(payload())) + 'SET LOCAL request.jwt.claim.sub=\'\';SET LOCAL request.jwt.claims=\'{}\';' + call('public.get_next_ver_nr(' + q(v) + ')'),
  r => { ok(r[0]); denied(r[2]); assert.deepEqual(r[1], r[3]); denied(r[4]); ok(r[5]); ok(r[6]); assert.deepEqual(r[7], { journals: 0, transactions: 0 }); ok(r[8]); denied(r[9]) })
test('customer invoice booking keeps internal number allocation', u => {
  const invoice = { invoice_number: 'KAN123-' + randomUUID(), customer_name: 'KAN123 synthetic customer', invoice_date: '2026-01-10', service_date: '2026-01-10', due_date: '2026-01-31', gross_amount: 1250, vat_treatment: 'exempt', attachment_url: u + '/synthetic.pdf' }
  return call('public.create_customer_invoice_atomic(' + json(invoice) + ')') + call('public.record_customer_invoice_payment_atomic((SELECT id FROM customer_invoices WHERE user_id=auth.uid()),\'2026-01-20\',' + q(randomUUID()) + ')')
}, r => r.forEach(ok))
test('late exception rolls back booking, journals and counter', u =>
  state(u) + `DO $rollback$ BEGIN BEGIN PERFORM ${book(payload())};RAISE EXCEPTION 'KAN123 injected after booking';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'KAN123 injected after booking' THEN RAISE;END IF;END;END $rollback$;` + state(u),
  r => assert.deepEqual(r[0], r[1]))
assert.deepEqual(query(digest() + functions + permissions), before, 'All rollback-only fixtures must disappear; prior data and catalog stay unchanged')

// Two committed synthetic bookings exercise real cross-session counter locking.
// Retain only this new, explicitly marked local cohort; never delete old fixtures.
const concurrentOwner = randomUUID()
save('concurrency-intent', { syntheticOwner: concurrentOwner, purpose: 'KAN123 synthetic only' })
query('BEGIN;' + guard + seed(concurrentOwner) + 'COMMIT;')
const a = await new Session().open(), b = await new Session().open()
try {
  const first = await a.run(attempt + 'BEGIN;' + auth(concurrentOwner) + call(book(payload())))
  ok(first[0])
  const second = b.run(attempt + 'BEGIN;' + auth(concurrentOwner) + call(book(payload())))
  const lock = query("SELECT jsonb_build_object('blocked'," + a.pid + '=ANY(pg_blocking_pids(' + b.pid + ')));')[0]
  // Server scheduling may not have reached the counter yet; inspect a bounded wait.
  if (!lock.blocked) {
    await new Promise(resolve => setTimeout(resolve, 150))
    assert.equal(query("SELECT jsonb_build_object('blocked'," + a.pid + '=ANY(pg_blocking_pids(' + b.pid + ')));')[0].blocked, true)
  }
  await a.run('COMMIT;')
  const next = await second; ok(next[0]); await b.run('COMMIT;')
  const result = query(`SELECT jsonb_build_object('counter',(SELECT last_ver_nr FROM ver_nr_sequences WHERE user_id=${q(concurrentOwner)}),'numbers',(SELECT jsonb_agg(n ORDER BY n) FROM (SELECT DISTINCT ver_nr n FROM journal_entries WHERE user_id=${q(concurrentOwner)})x),'transactions',(SELECT count(*) FROM transactions WHERE user_id=${q(concurrentOwner)}));`)[0]
  assert.deepEqual(result, { counter: 2, numbers: [1, 2], transactions: 2 })
  checks.push({ name: 'two sessions serialize same-owner booking and allocate distinct numbers', status: 'PASS' })
  save('concurrency', { status: 'PASS', syntheticOwner: concurrentOwner, result })
} finally { await a.close(); await b.close() }
assert.deepEqual(query(digest([concurrentOwner]))[0], before[0], 'All pre-existing data, including counters, must remain unchanged')
assert.deepEqual(query(functions + permissions), before.slice(1))
const result = { status: 'PASS', database, host: '127.0.0.1', port: 5432, oid: 69031, marker, migration, sha256: createHash('sha256').update(sql).digest('hex'), checks, exactAcl: before[2], migrationDataUnchanged: true, priorDataUnchangedAfterTests: true, allFunctionDefinitionsAndOtherAclsUnchanged: true, retainedSyntheticOwner: concurrentOwner, evidence: run }
save('result', result)
fs.writeFileSync('coverage/kan123-20261103/local-pass.json', JSON.stringify(result, null, 2), { flag: 'wx' })
console.log(JSON.stringify(result))
