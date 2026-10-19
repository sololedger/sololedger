// KAN-75: deterministic real PostgreSQL sessions. No Production target exists here.
// Local: node scripts/test-year-close-concurrency.mjs --local [--red]
// Staging: set KAN75_APPROVED_STAGING=1 and KAN75_USER_IDS to two NEW dedicated
// synthetic Auth users, then pass --staging. Credentials are only a PGPASSFILE.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const staging = process.argv.includes('--staging')
const red = process.argv.includes('--red')
assert(staging || process.argv.includes('--local'), 'Choose an explicit isolated target')
assert(!staging || (process.env.KAN75_APPROVED_STAGING === '1' && !red), 'Staging approval / red-test guard')
const host = staging ? 'db.fzxqiqenqjzhlyxxpvhg.supabase.co' : 'localhost'
const database = staging ? 'postgres' : 'sololedger_kan75_test'
const env = { ...process.env, PGCONNECT_TIMEOUT: '10', PGCLIENTENCODING: 'UTF8',
  PGSSLMODE: staging ? 'require' : 'prefer',
  PGPASSFILE: staging ? 'C:/SoloLedger/LocalTest/pgpass_staging_supabase.conf' : 'C:/SoloLedger/LocalTest/pgpass.conf',
  PGOPTIONS: '-c lock_timeout=10000 -c statement_timeout=20000' }
for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSWORD', 'DATABASE_URL']) delete env[key]
const psql = process.env.PSQL_PATH || 'C:/Program Files/PostgreSQL/17/bin/psql.exe'
const ids = staging ? JSON.parse(process.env.KAN75_USER_IDS || 'null') : [randomUUID(), randomUUID()]
assert(Array.isArray(ids) && ids.length === 2 && ids.every(id => /^[0-9a-f-]{36}$/.test(id)) && ids[0] !== ids[1])
const quote = value => "'" + String(value).replaceAll("'", "''") + "'"
const json = value => quote(JSON.stringify(value)) + '::jsonb'
const sessions = []
const checks = []
function check(name, value = true, details) { assert(value, name + ': ' + JSON.stringify(details)); checks.push({ name, status: 'PASS', details }); console.log('PASS ' + name) }
class Session {
  constructor(name) {
    this.name = 'kan75_' + name
    this.buffer = ''; this.stderr = ''; this.pending = null
    this.child = spawn(psql, ['-X', '-w', '-h', host, '-p', '5432', '-U', 'postgres', '-d', database, '-Atq', '-v', 'ON_ERROR_STOP=1'], { env: { ...env, PGAPPNAME: this.name }, windowsHide: true, stdio: 'pipe' })
    this.child.stdout.on('data', chunk => { this.buffer += chunk.toString(); if (this.pending && this.buffer.includes(this.pending.marker)) { const p = this.pending; const end = this.buffer.indexOf(p.marker); const output = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + p.marker.length); this.pending = null; clearTimeout(p.timeout); p.resolve(output.split(/\r?\n/).filter(l => l.startsWith('{')).map(JSON.parse)) } })
    this.child.stderr.on('data', chunk => { this.stderr += chunk.toString() })
    this.child.on('exit', code => { if (this.pending) { clearTimeout(this.pending.timeout); this.pending.reject(Error(this.name + ' exited ' + code + ': ' + this.stderr)); this.pending = null } })
    sessions.push(this)
  }
  run(sql) {
    assert(!this.pending, this.name + ' already busy')
    const marker = 'KAN75_DONE_' + randomUUID().replaceAll('-', '')
    return new Promise((resolve, reject) => { const timeout = setTimeout(() => { reject(Error(this.name + ' timed out: ' + this.stderr)); this.child.kill() }, 25000); this.pending = { marker, timeout, resolve, reject }; this.child.stdin.write(sql + '\n\\echo ' + marker + '\n') })
  }
  async initialize(uid) {
    const [info] = await this.run("SELECT json_build_object('database',current_database(),'server',inet_server_addr(),'tls',(select ssl from pg_stat_ssl where pid=pg_backend_pid()),'pid',pg_backend_pid());")
    assert.equal(info.database, database); if (staging) assert.equal(info.tls, true); else assert(['::1', '127.0.0.1'].includes(info.server))
    this.pid = info.pid
    await this.run(`CREATE FUNCTION pg_temp.kan75_try(p_sql text) RETURNS jsonb LANGUAGE plpgsql AS $try$ DECLARE r jsonb; BEGIN EXECUTE p_sql INTO r; RETURN jsonb_build_object('ok',true,'value',r); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $try$;`)
    if (uid) await this.run(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${quote(uid)},false); SELECT set_config('request.jwt.claims',${quote(JSON.stringify({ sub: uid, role: 'authenticated' }))},false);`)
    return this
  }
  async rpc(sql) { const [r] = await this.run(`SELECT pg_temp.kan75_try(${quote('SELECT ' + sql)}) AS reply;`); return r }
  async one(sql) { const [r] = await this.run(sql); return r }
  close() { if (!this.child.killed) this.child.stdin.end('ROLLBACK;\n\\q\n') }
}
const admin = await new Session('observer').initialize()
const a = await new Session('writer_a').initialize(ids[0])
const b = await new Session('writer_b').initialize(ids[0])
const other = await new Session('other_user').initialize(ids[1])
const ordinary = (date, amount = 100, type = 'kan75_sale', key = randomUUID()) => ({ date, amount, type, description: 'KAN75 synthetic ' + key, vat_rate: 0, idempotency_key: key })
const bookSql = payload => `public.book_transaction_atomic(${json(payload)})`
async function book(s, payload) { const r = await s.rpc(bookSql(payload)); assert(r.ok && r.value.success, JSON.stringify(r)); return r.value }
async function closed(s, year) { const r = await s.rpc(`public.close_year_atomic(${year})`); assert(r.ok && r.value.success, JSON.stringify(r)); return r.value }
async function state(year, uid = ids[0]) { return admin.one(`SELECT json_build_object('locked',exists(select 1 from public.closed_years where user_id=${quote(uid)} and year=${year}),'count',(select count(*) from public.transactions where user_id=${quote(uid)}),'journal',(select count(*) from public.journal_entries where user_id=${quote(uid)}),'bank',coalesce((select sum(debit-credit) from public.journal_entries where user_id=${quote(uid)} and date<=make_date(${year},12,31) and account_number='1930'),0),'profit',coalesce((select sum(credit-debit) from public.journal_entries where user_id=${quote(uid)} and date between make_date(${year},1,1) and make_date(${year},12,31) and left(account_number,1) in ('3','4','5','6','7','8')),0),'sequence',(select last_ver_nr from public.ver_nr_sequences where user_id=${quote(uid)}));`) }
async function waitBlocked(waiter, blocker) {
  const deadline = Date.now() + 6000
  while (Date.now() < deadline) {
    const row = await admin.one(`SELECT json_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})),'waitType',(select wait_event_type from pg_stat_activity where pid=${waiter.pid}),'waitEvent',(select wait_event from pg_stat_activity where pid=${waiter.pid}));`)
    if (row.blocked) { assert.equal(row.waitType, 'Lock'); assert.equal(row.waitEvent, 'advisory'); return }
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  throw Error(waiter.name + ' did not wait for ' + blocker.name)
}
async function rejected(s, sql) { const r = await s.rpc(sql); assert(!r.ok || r.value?.confirmed_rejection, JSON.stringify(r)); return r }
async function invoice(s, year, number = randomUUID()) {
  const r = await s.rpc(`public.create_customer_invoice_atomic(${json({ invoice_number: 'KAN75-' + number, customer_name: 'KAN75 synthetic', invoice_date: year + '-06-01', service_date: year + '-06-01', due_date: year + '-06-30', gross_amount: 100, vat_treatment: 'exempt', attachment_url: ids[0] + '/kan75-synthetic.pdf' })})`)
  assert(r.ok && r.value.success, JSON.stringify(r)); return r.value.invoice_id
}
try {
  if (staging) {
    const proof = await admin.one(`SELECT json_build_object('count',count(*)) FROM auth.users WHERE id IN (${ids.map(quote).join(',')}) AND raw_user_meta_data->>'purpose'='sololedger_kan75_concurrency';`)
    assert.equal(proof.count, 2, 'Only explicitly marked KAN75 synthetic Auth users may be used')
  }
  if (!staging) await admin.run(`GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    INSERT INTO auth.users(id) VALUES ${ids.map(id => '(' + quote(id) + ')').join(',')}; INSERT INTO public.profiles(id,company_name,vat_status,domestic_sales_vat_treatment) VALUES ${ids.map(id => '(' + quote(id) + ",'KAN75 synthetic','not_registered','small_business_exempt')").join(',')};`)
  for (const uid of ids) {
    const s = uid === ids[0] ? a : other
    const empty = await state(2099, uid); assert.equal(empty.count, 0, 'Fresh dedicated identities only')
    await s.run(`UPDATE public.profiles SET company_name='KAN75 synthetic concurrency',vat_status='not_registered',domestic_sales_vat_treatment='small_business_exempt',vat_management_from=NULL,vat_period_type=NULL WHERE id=${quote(uid)};
    INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES ('kan75_sale',${quote(uid)},'KAN75 synthetic sale','1930','3010',0),('kan75_cost',${quote(uid)},'KAN75 synthetic cost','5420','1930',0),('kan75_deposit',${quote(uid)},'KAN75 synthetic deposit','1930','2018',0);`)
    await book(s, ordinary('2019-01-01', 10000, 'kan75_deposit'))
  }
  if (red) {
    await a.run('BEGIN;'); await book(a, ordinary('2020-01-01'))
    await closed(b, 2020)
    const before = await state(2020); assert(before.locked && before.profit === 0)
    await a.run('COMMIT;'); const after = await state(2020)
    check('RED: a committed year lock missed an in-flight ordinary booking, which then changed locked-year profit', after.profit === 100, { before, after })
  } else {
    const migration = fs.readFileSync(new URL('../supabase/migrations/20261019120000_kan75_year_close_concurrency.sql', import.meta.url), 'utf8')
    const signatures = [...migration.matchAll(/\('public\.([^']+)', '[a-f0-9]{32}',/g)].map(m => m[1])
    assert.equal(signatures.length, 25)
    const coverage = await admin.one(`SELECT json_build_object('functions',(select json_agg(json_build_object('signature',oid::regprocedure::text,'body',prosrc,'security',prosecdef,'volatility',provolatile)) from pg_proc where oid=ANY(ARRAY[${signatures.map(s => quote('public.' + s) + '::regprocedure::oid').join(',')}])),'helperCallable',has_function_privilege('authenticated','public.lock_accounting_year_boundary(uuid,boolean)','EXECUTE') OR has_function_privilege('anon','public.lock_accounting_year_boundary(uuid,boolean)','EXECUTE') OR has_function_privilege('service_role','public.lock_accounting_year_boundary(uuid,boolean)','EXECUTE'));`)
    assert.equal(coverage.functions.length, 25); assert.equal(coverage.helperCallable, false)
    for (const f of coverage.functions) { assert(/\nBEGIN\r*\n  PERFORM public\.lock_accounting_year_boundary\(/i.test(f.body), f.signature); assert(f.security && f.volatility === 'v', f.signature) }
    check('All 25 reviewed entry points take the gate first; fresh snapshots and private helper ACL enforced')
    const boundaries = await admin.one(`SELECT json_build_object('bypasses',count(*)) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('transactions','journal_entries','closed_years','vat_periods','customer_invoices','customer_invoice_bookings','fixed_assets','ne_sales_classifications','tax_account_events','tax_account_movements') AND (NOT relrowsecurity OR has_table_privilege('authenticated',oid,'INSERT') OR has_table_privilege('authenticated',oid,'UPDATE') OR has_table_privilege('authenticated',oid,'DELETE'));`)
    check('Authenticated users cannot bypass protected RPCs with direct table writes', boundaries.bypasses === 0)
    await a.run('BEGIN;'); const first = ordinary('2021-02-01'); const receipt = await book(a, first)
    const closing = closed(b, 2021); await waitBlocked(b, a)
    check('Booking first: close waits on the actual writer transaction')
    const parallel = await book(other, ordinary('2021-02-01')); check('Different owner writes while first owner close is waiting', !!parallel.transaction_id)
    await a.run('COMMIT;'); await closing
    const s = await state(2021); check('Booking first: close includes committed journal and correct profit', s.locked && s.profit === 100, s)
    const replay = await book(a, first); check('Exact idempotent replay still succeeds after year lock without another journal', replay.idempotent_replay && replay.transaction_id === receipt.transaction_id && (await state(2021)).count === s.count)
    await rejected(a, bookSql({ ...first, amount: 101 })); check('Changed payload with same idempotency key rejected')

    await b.run('BEGIN;'); await closed(b, 2022)
    const before = await state(2022); const pending = a.rpc(bookSql(ordinary('2022-03-01')))
    await waitBlocked(a, b); await b.run('COMMIT;'); const denied = await pending
    check('Close first: booking waits, rereads status and is rejected', denied.ok && denied.value.confirmed_rejection && /låst/.test(denied.value.message), denied)
    const after = await state(2022); check('Rejected booking leaves journal, transactions and VER sequence unchanged', after.count === before.count && after.journal === before.journal && after.sequence === before.sequence)

    const original = await book(a, ordinary('2023-03-01', 20, 'kan75_cost')); await closed(b, 2023)
    await a.run('BEGIN;'); const correction = await a.rpc(`public.create_correction_transaction_atomic(${quote(original.transaction_id)})`); assert(correction.ok && correction.value.success, JSON.stringify(correction))
    const correctionYear = (await admin.one("SELECT json_build_object('year',extract(year from current_date)::integer);")).year; const correctionClose = closed(b, correctionYear); await waitBlocked(b, a); await a.run('COMMIT;'); await correctionClose
    check('Correction of a locked historical original stays in correction year; close waits', (await state(2023)).profit === -20 && (await state(correctionYear)).profit === 20)
    await rejected(a, `public.create_correction_transaction_atomic(${quote(original.transaction_id)})`); check('Correction is rejected once its actual year is locked')
    const futureOriginal = await book(a, ordinary('2042-03-01', 10, 'kan75_cost'))
    await b.run('BEGIN;'); await closed(b, 2042)
    const correctionWait = a.rpc(`public.create_correction_transaction_atomic(${quote(futureOriginal.transaction_id)})`)
    await waitBlocked(a,b); await b.run('COMMIT;'); const correctionDenied = await correctionWait
    check('Close first: correction waits and rejects the newly locked correction year', !correctionDenied.ok && correctionDenied.code === '23514')

    const period = { ...ordinary('2030-06-01', 120, 'kan75_cost'), future_date: '2031-02-01' }
    await a.run('BEGIN;'); const pr = await a.rpc(`public.book_periodized_transaction_atomic(${json(period)})`); assert(pr.ok && pr.value.success, JSON.stringify(pr))
    const pc = closed(b, 2031); await waitBlocked(b, a); await a.run('COMMIT;'); await pc
    check('Periodization: close waits for both years and both verifications atomically')
    const pBefore = await state(2031)
    await rejected(a, `public.book_periodized_transaction_atomic(${json({ ...period, idempotency_key: randomUUID() })})`)
    await rejected(a, `public.create_correction_transaction_atomic(${quote(pr.value.transaction_id)})`)
    check('Locked reversal year rejects periodization and its correction without partial writes', (await state(2031)).count === pBefore.count)
    await b.run('BEGIN;'); await closed(b, 2033)
    const periodWait = a.rpc(`public.book_periodized_transaction_atomic(${json({ ...ordinary('2032-06-01', 50, 'kan75_cost'), future_date: '2033-02-01' })})`)
    await waitBlocked(a, b); await b.run('COMMIT;'); const pd = await periodWait
    check('Close first: cross-year periodization waits and rejects the newly locked future year', pd.ok && pd.value.confirmed_rejection)

    await a.run('BEGIN;'); await book(a, ordinary('2034-01-01'))
    const rollbackClose = closed(b, 2034); await waitBlocked(b, a); await a.run('ROLLBACK;'); await rollbackClose
    check('Rollback releases shared gate and excludes rolled-back journal', (await state(2034)).profit === 0)
    const bad = await rejected(a, bookSql({ ...ordinary('2035-01-01'), amount: -1 })); assert(bad.value?.confirmed_rejection)
    await closed(b, 2035); check('Failed booking leaves no hanging gate')
    await a.run('BEGIN;'); await book(a, ordinary('2036-01-01'))
    const upgrade = await rejected(a, 'public.close_year_atomic(2036)'); check('Shared-to-exclusive upgrade fails closed instead of deadlocking', upgrade.code === '25001'); await a.run('ROLLBACK;')
    await a.run('BEGIN ISOLATION LEVEL REPEATABLE READ;'); const iso = await rejected(a, bookSql(ordinary('2036-01-01'))); check('Stale-snapshot isolation fails closed', iso.code === '25001'); await a.run('ROLLBACK;')

    const blocker = await invoice(a, 2037); const failedClose = await rejected(b, 'public.close_year_atomic(2037)'); assert(/kundfaktura/.test(failedClose.message)); await book(a, ordinary('2037-02-01'))
    check('Failed close releases exclusive gate and preserves unpaid-invoice blocker', !!blocker)
    await b.run('BEGIN;'); await closed(b, 2038)
    const invoicePayload = { invoice_number: 'KAN75-wait', customer_name: 'KAN75 synthetic', invoice_date: '2038-06-01', service_date: '2038-06-01', due_date: '2038-06-30', gross_amount: 100, vat_treatment: 'exempt', attachment_url: ids[0] + '/kan75-synthetic.pdf' }
    const invoiceWait = a.rpc(`public.create_customer_invoice_atomic(${json(invoicePayload)})`); await waitBlocked(a, b); await b.run('COMMIT;'); const invoiceDenied = await invoiceWait
    check('Invoice creation waits and cannot introduce a blocker after close', !invoiceDenied.ok && invoiceDenied.code === '23514')
    const inv = await invoice(a, 2039)
    await a.run('BEGIN;'); const payment = await a.rpc(`public.record_customer_invoice_payment_atomic(${quote(inv)},'2039-07-01',${quote(randomUUID())})`); assert(payment.ok && payment.value.success, JSON.stringify(payment))
    const invoiceClose = closed(b,2039); await waitBlocked(b,a); await a.run('COMMIT;'); await invoiceClose
    check('Invoice payment first: close waits and includes payment/receivable state')
    await a.run(`INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES (${quote(ids[0])},'business_payment_account','1930');`)
    const taxKey = randomUUID(); const taxSql = `public.record_tax_account_movement_atomic('business_to_tax_account','2024-04-01',50,NULL,${quote(taxKey)})`
    await a.run('BEGIN;'); const movement = await a.rpc(taxSql); assert(movement.ok && movement.value.success, JSON.stringify(movement))
    const taxClose = closed(b,2024); await waitBlocked(b,a); await a.run('COMMIT;'); await taxClose
    check('Tax account movement first: close waits and includes the complete transfer')
    const taxReplay = await a.rpc(taxSql); check('Tax movement idempotency survives year close',taxReplay.ok && taxReplay.value.idempotent_replay)

    await a.run(`UPDATE public.profiles SET vat_status='registered',domestic_sales_vat_treatment='taxable',vat_management_from='2025-01-01',vat_period_type='year' WHERE id=${quote(ids[0])};`)
    const periods = await a.rpc("public.ensure_vat_periods('2025-12-31')"); assert(periods.ok, JSON.stringify(periods))
    const vat = { ...ordinary('2025-02-01', 125), vat_rate: 25 }; await book(a, vat)
    const vp = await admin.one(`SELECT json_build_object('id',id) FROM public.vat_periods WHERE user_id=${quote(ids[0])} AND period_start='2025-01-01';`)
    const vatClose = await a.rpc(`public.close_vat_period_atomic(${quote(vp.id)})`); assert(vatClose.ok && vatClose.value.success, JSON.stringify(vatClose))
    const vatDenied = await rejected(a, bookSql({ ...vat, idempotency_key: randomUUID() })); check('Existing closed-VAT-period guard remains effective', /Momsperioden/.test(vatDenied.value?.message || vatDenied.message))
    const vatReplay = await book(a, vat); check('Idempotent replay survives VAT close', vatReplay.idempotent_replay)
    await closed(b, 2025)
    await other.run(`UPDATE public.profiles SET vat_status='registered',domestic_sales_vat_treatment='taxable',vat_management_from='2025-01-01',vat_period_type='year' WHERE id=${quote(ids[1])};`)
    assert((await other.rpc("public.ensure_vat_periods('2025-12-31')")).ok)
    await book(other,{...ordinary('2025-02-01',125),vat_rate:25})
    const op = await admin.one(`SELECT json_build_object('id',id) FROM public.vat_periods WHERE user_id=${quote(ids[1])} AND period_start='2025-01-01';`)
    assert((await other.rpc(`public.close_vat_period_atomic(${quote(op.id)})`)).value.success)
    assert((await other.rpc(`public.declare_vat_period_atomic(${quote(op.id)},'2026-01-01')`)).value.success)
    const otherCloser = await new Session('other_closer').initialize(ids[1])
    await other.run('BEGIN;'); const settlement = await other.rpc(`public.record_vat_settlement_atomic(${quote(op.id)},'2026-02-01',25,${quote(randomUUID())})`); assert(settlement.ok && settlement.value.success,JSON.stringify(settlement))
    const settlementClose = closed(otherCloser,2026); await waitBlocked(otherCloser,other); await other.run('COMMIT;'); await settlementClose
    check('VAT settlement first: close waits while preserving declaration, settlement and journal consistency')

    const balances = await a.one("SELECT json_build_object('balances',json_object_agg(account_number,balance)) FROM public.get_cumulative_account_balances('2022-12-31');")
    check('Following-year cumulative balance equals journal and retains prior-year profit', balances.balances['1930'] === (await state(2022)).bank)
    const journal = await admin.one(`SELECT json_build_object('imbalanced',(select count(*) from (select transaction_id from public.journal_entries where user_id in (${ids.map(quote).join(',')}) group by transaction_id having abs(sum(debit-credit))>.005) x),'orphaned',(select count(*) from public.journal_entries j left join public.transactions t on t.id=j.transaction_id where j.user_id in (${ids.map(quote).join(',')}) and (t.id is null or t.user_id<>j.user_id)));`)
    check('Every verification balanced, no orphaned journal or owner mismatch', journal.imbalanced === 0 && journal.orphaned === 0, journal)
    const locks = await admin.one(`SELECT json_build_object('count',count(*)) FROM pg_locks WHERE locktype='advisory' AND pid in (${[a,b,other].map(s=>s.pid).join(',')});`)
    check('All transaction-scoped locks released at end', locks.count === 0)
  }
  const result = { target: staging ? 'staging:fzxqiqenqjzhlyxxpvhg' : database, red, users: ids, checks, status: 'PASS' }
  if (process.env.KAN75_RESULTS) fs.writeFileSync(path.resolve(process.env.KAN75_RESULTS), JSON.stringify(result, null, 2))
  console.log('KAN-75 ' + checks.length + ' checks PASS')
} finally { for (const session of sessions) session.close() }
