// KAN-117. Exact existing isolated LOCAL database only; never hosted, create/reset or old-fixture deletion.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { LocalSession, validateManifest, literal } from './kan62-local-db-guard.mjs'

assert.equal(process.env.SOLOLEDGER_KAN117_LOCAL, 'implementation-and-tests')
const manifest = validateManifest(JSON.parse(fs.readFileSync('coverage/kan110111-local/result.json')).manifest)
const env = { ...process.env, SOLOLEDGER_KAN62_TEST_DB: manifest.database, SOLOLEDGER_KAN62_APPROVED_OPERATION: 'concurrency', PGPASSFILE: 'C:/SoloLedger/LocalTest/pgpass.conf' }
const out = 'coverage/kan117-local'
fs.mkdirSync(out, { recursive: true })
const file = '20261026210000_kan117_vat_period_preview.sql'
const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8')
const hash = createHash('sha256').update(sql).digest('hex')
const fixFile = '20261026220000_kan117_cross_year_profile_guard.sql'
const fixSql = fs.readFileSync('supabase/migrations/' + fixFile, 'utf8')
const fixHash = createHash('sha256').update(fixSql).digest('hex')
const sessions = [], owners = [], checks = []
const open = async label => {
  const s = await new LocalSession(manifest, env, 'kan117-' + label).open(); sessions.push(s)
  await s.run(`CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $a$ DECLARE r jsonb; BEGIN EXECUTE q INTO r; RETURN jsonb_build_object('ok',true,'value',r); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $a$;`)
  return s
}
const one = async (s, q) => (await s.run(q))[0]
const attempt = (s, q) => one(s, `SELECT pg_temp.attempt(${literal('SELECT ' + q)});`)
const good = async (s, q) => { const r = await attempt(s, q); assert(r.ok, JSON.stringify(r)); return r.value }
const reject = async (s, q, pattern) => { const r = await attempt(s, q); assert.equal(r.ok, false, JSON.stringify(r)); assert.match(r.message, pattern); return r }
const pass = name => { checks.push(name); console.log('PASS ' + name); fs.writeFileSync(out + '/progress.json', JSON.stringify({ checks, syntheticOwners: owners, hash }, null, 2)) }
const observer = await open('observer')
const snapshot = async () => {
  const tables = (await one(observer, `SELECT jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'name',tablename,'ownerColumn',CASE WHEN tablename='profiles' THEN 'id' WHEN EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema=t.schemaname AND c.table_name=t.tablename AND c.column_name='user_id') THEN 'user_id' WHEN schemaname='auth' AND tablename='users' THEN 'id' END)) FROM pg_tables t WHERE schemaname IN ('public','auth','storage')));`)).tables
  const parts = tables.map(t => `SELECT ${literal(t.schema + '.' + t.name)} n,md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) h FROM ${t.schema}."${t.name}" x ${t.ownerColumn && owners.length ? `WHERE "${t.ownerColumn}" NOT IN (${owners.map(literal).join(',')})` : ''}`)
  return one(observer, `SELECT jsonb_object_agg(n,h) FROM (${parts.join(' UNION ALL ')}) s;`)
}
const originals = () => one(observer, `SELECT jsonb_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))||coalesce(proacl::text,'')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname NOT IN ('kan117_vat_period_plan','get_vat_period_creation_plan','create_missing_vat_periods');`)
const before = await snapshot(), beforeFunctions = await originals()
const plan = (f, y = 2025) => good(f.s, `public.get_vat_period_creation_plan(${y})`)
const create = (f, p) => good(f.s, `public.create_missing_vat_periods(${p.year},${literal(p.basis)})`)
const periodState = f => one(observer, `SELECT jsonb_build_object('periods',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY id),'[]') FROM vat_periods v WHERE user_id=${literal(f.uid)}),'journal',(SELECT count(*) FROM journal_entries WHERE user_id=${literal(f.uid)}),'transactions',(SELECT count(*) FROM transactions WHERE user_id=${literal(f.uid)}));`)
async function fixture({ status = 'registered', type = 'year', start = '2025-01-01' } = {}) {
  const uid = randomUUID(); owners.push(uid)
  await observer.run(`INSERT INTO auth.users(id) VALUES(${literal(uid)});
    INSERT INTO profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from)
    VALUES(${literal(uid)},${literal('kan117-' + uid + '@example.invalid')},'KAN117 LOCAL synthetic',${literal(status)},${type ? literal(type) : 'NULL'},${start ? literal(start) : 'NULL'})
    ON CONFLICT(id) DO UPDATE SET vat_status=EXCLUDED.vat_status,vat_period_type=EXCLUDED.vat_period_type,vat_management_from=EXCLUDED.vat_management_from;`)
  const s = await open('synthetic'); await s.asUser(uid); return { uid, s }
}
const insert = (f, start, end, type = 'year', source = 'sololedger') => observer.run(`INSERT INTO vat_periods(user_id,period_start,period_end,period_type,status,source) VALUES(${literal(f.uid)},${literal(start)},${literal(end)},${literal(type)},'open',${literal(source)});`)
async function blockedBy(waiter, blocker) {
  const end = Date.now() + 6000
  while (Date.now() < end) {
    if ((await one(observer, `SELECT jsonb_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})));`)).blocked) return
    await new Promise(r => setTimeout(r, 25))
  }
  throw Error('Expected lock wait')
}
try {
  const installed = (await one(observer, `SELECT jsonb_build_object('exists',to_regprocedure('public.get_vat_period_creation_plan(integer)') IS NOT NULL);`)).exists
  if (!installed) {
    await observer.run('BEGIN;' + sql + 'COMMIT;')
    fs.writeFileSync(out + '/installed.json', JSON.stringify({ file, hash, manifest }, null, 2))
  } else assert.equal(JSON.parse(fs.readFileSync(out + '/installed.json')).hash, hash, 'Changed migration must not be replayed')
  pass('candidate installed only in identified local synthetic database')
  const plannerSource = async () => (await one(observer, `SELECT jsonb_build_object('source',prosrc) FROM pg_proc WHERE oid='public.kan117_vat_period_plan(integer)'::regprocedure;`)).source.replaceAll('\r\n', '\n').trim()
  const sourceOf = text => text.replaceAll('\r\n', '\n').split('AS $plan$')[1].split('$plan$')[0].trim()
  const apiContracts = () => one(observer, `SELECT jsonb_object_agg(proname,jsonb_build_object('definition',pg_get_functiondef(oid),'owner',pg_get_userbyid(proowner),'acl',proacl::text)) FROM pg_proc WHERE oid IN ('public.get_vat_period_creation_plan(integer)'::regprocedure,'public.create_missing_vat_periods(integer,text)'::regprocedure);`)
  const priorApis = await apiContracts()
  const helperContract = () => one(observer, `SELECT jsonb_build_object('owner',pg_get_userbyid(proowner),'acl',proacl::text,'definer',prosecdef,'config',proconfig) FROM pg_proc WHERE oid='public.kan117_vat_period_plan(integer)'::regprocedure;`)
  const priorHelperContract = await helperContract()
  if (await plannerSource() !== sourceOf(fixSql)) {
    assert.equal(await plannerSource(), sourceOf(sql), 'Unexpected local planner; do not overwrite')
    await observer.run('BEGIN;' + fixSql + 'COMMIT;')
  }
  assert.equal(await plannerSource(), sourceOf(fixSql))
  assert.deepEqual(await apiContracts(), priorApis)
  assert.deepEqual(await helperContract(), priorHelperContract)
  fs.writeFileSync(out + '/cross-year-installed.json', JSON.stringify({ fixFile, fixHash, manifest }, null, 2))
  pass('cross-year guard installed locally; public RPCs and helper ownership/grants/config unchanged')
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const r = await one(observer, `SELECT jsonb_build_object('helper',has_function_privilege(${literal(role)},'public.kan117_vat_period_plan(integer)','EXECUTE'),'read',has_function_privilege(${literal(role)},'public.get_vat_period_creation_plan(integer)','EXECUTE'),'write',has_function_privilege(${literal(role)},'public.create_missing_vat_periods(integer,text)','EXECUTE'));`)
    assert.equal(r.helper, false); assert.equal(r.read, role === 'authenticated'); assert.equal(r.write, role === 'authenticated')
  }
  pass('effective API grants: private helper, authenticated only, no anon or service-role API access')
  const unauthenticated = await open('no-identity')
  for (const role of ['anon', 'service_role']) {
    await unauthenticated.run(`RESET ROLE; SET ROLE ${role};`)
    assert.equal((await reject(unauthenticated, 'public.get_vat_period_creation_plan(2025)', /permission denied/)).code, '42501')
  }
  await unauthenticated.run('RESET ROLE; SET ROLE authenticated;')
  assert.equal((await reject(unauthenticated, 'public.get_vat_period_creation_plan(2025)', /inloggad/)).code, '28000')
  assert.equal((await reject(unauthenticated, 'public.kan117_vat_period_plan(2025)', /permission denied/)).code, '42501')
  pass('actual anon/service-role/private-helper calls denied; authenticated without identity cannot read a plan')
  const complete = await fixture({ start: '2026-06-02' }); await insert(complete, '2026-06-02', '2026-12-31')
  const stable = await periodState(complete)
  await complete.s.run('BEGIN READ ONLY;')
  const cp = await plan(complete, 2026); assert.equal(cp.state, 'complete'); assert.equal(cp.missing.length, 0)
  await complete.s.run('ROLLBACK;')
  assert.deepEqual(await periodState(complete), stable)
  pass('synthetic first annual partial period matches supplied scenario; plan works READ ONLY without mutation')
  for (const type of ['year', 'quarter', 'month']) {
    const f = await fixture({ type }), p = await plan(f)
    assert.equal(p.state, 'missing'); assert.equal(p.missing.length, { year: 1, quarter: 4, month: 12 }[type])
    const created = await create(f, p); assert.equal(created.created_count, p.missing.length)
    assert.equal((await plan(f)).state, 'complete')
    await reject(f.s, `public.create_missing_vat_periods(2025,${literal(p.basis)})`, /ändrats/)
    const state = await periodState(f); assert.equal(state.journal, 0); assert.equal(state.transactions, 0)
    pass(type + ': exact missing dates created once; replay rejected; no journals or transactions')
  }
  const history = await fixture({ start: '2024-01-01' }); const hp = await plan(history)
  assert(hp.missing.every(p => p.start.startsWith('2025'))); await create(history, hp)
  assert.equal((await periodState(history)).periods.length, 1)
  pass('selected historical year only; no hidden generation in earlier years')
  const gap = await fixture({ type: 'month' })
  await observer.run(`INSERT INTO vat_periods(user_id,period_start,period_end,period_type,status,source,closing_amount)
    SELECT ${literal(gap.uid)},d::date,(d+interval '1 month'-interval '1 day')::date,'month','closed','sololedger',0
    FROM generate_series(DATE '2025-01-01',DATE '2025-12-01',interval '1 month') d WHERE extract(month FROM d)<>7;`)
  const gapBefore = await periodState(gap), gapPlan = await plan(gap)
  assert.deepEqual(gapPlan.missing, [{ start: '2025-07-01', end: '2025-07-31', type: 'month' }])
  await create(gap, gapPlan)
  assert.deepEqual((await periodState(gap)).periods.filter(p => p.period_start !== '2025-07-01'), gapBefore.periods)
  pass('interior month gap only; all existing closed period rows remain byte-equivalent')
  const priorPartial = await fixture({ start: '2025-06-02' })
  await insert(priorPartial, '2025-06-02', '2025-12-31')
  const priorBefore = await periodState(priorPartial), laterPlan = await plan(priorPartial, 2026)
  assert.equal(laterPlan.state, 'missing')
  assert.deepEqual(laterPlan.missing, [{ start: '2026-01-01', end: '2026-12-31', type: 'year' }])
  await create(priorPartial, laterPlan)
  assert.deepEqual((await periodState(priorPartial)).periods.filter(p => p.period_start.startsWith('2025')), priorBefore.periods)
  pass('existing first partial year retained while selected next calendar year can be created')
  for (const type of ['year', 'quarter', 'month']) {
    const f = await fixture({ type, start: '2024-06-02' })
    const end = type === 'year' ? '2024-12-31' : '2024-06-30'
    await insert(f, '2024-06-02', end, type)
    const firstPeriod = (await periodState(f)).periods[0]
    const correct = await plan(f)
    assert.equal(correct.state, 'missing')
    await observer.run(`UPDATE profiles SET vat_management_from='2023-01-01' WHERE id=${literal(f.uid)};`)
    for (const year of [2023, 2024, 2025]) {
      const conflict = await plan(f, year)
      assert.equal(conflict.state, 'blocked')
      await reject(f.s, `public.create_missing_vat_periods(${year},${literal(conflict.basis)})`, /Inga perioder/)
    }
    await observer.run(`UPDATE profiles SET vat_management_from='2024-06-02' WHERE id=${literal(f.uid)};`)
    assert.equal((await plan(f)).state, 'missing')
    await create(f, await plan(f))
    assert.deepEqual((await periodState(f)).periods.find(p => p.period_start === '2024-06-02'), firstPeriod)
  }
  pass('known annual/quarterly/monthly first partial period blocks contradictory profile in every selected year')
  const newEvidence = await fixture({ start: '2024-06-02' }), beforeEvidence = await plan(newEvidence)
  await insert(newEvidence, '2024-06-02', '2024-12-31')
  const afterEvidence = await plan(newEvidence)
  assert.equal(afterEvidence.state, 'missing'); assert.notEqual(afterEvidence.basis, beforeEvidence.basis)
  await reject(newEvidence.s, `public.create_missing_vat_periods(2025,${literal(beforeEvidence.basis)})`, /ändrats/)
  await create(newEvidence, afterEvidence)
  pass('new consistent first-period evidence in another year invalidates old preview before explicit re-confirmation')
  const changedEvidence = await fixture(), beforeChangedEvidence = await plan(changedEvidence)
  await insert(changedEvidence, '2026-06-02', '2026-12-31')
  assert.equal((await plan(changedEvidence)).state, 'blocked')
  await reject(changedEvidence.s, `public.create_missing_vat_periods(2025,${literal(beforeChangedEvidence.basis)})`, /ändrats/)
  assert.equal((await periodState(changedEvidence)).periods.length, 1)
  pass('new contradictory first-period evidence outside selected year blocks fresh plan and rejects stale confirmation')
  const isolated = await fixture(), isolationPlan = await plan(isolated)
  const boundaryBefore = await plan(newEvidence, 2026)
  assert.equal(boundaryBefore.state, 'missing')
  await observer.run(`UPDATE vat_periods SET period_end='2024-12-30' WHERE user_id=${literal(newEvidence.uid)} AND period_start='2024-06-02';`)
  const boundaryAfter = await plan(newEvidence, 2026)
  assert.equal(boundaryAfter.state, 'blocked'); assert.notEqual(boundaryAfter.basis, boundaryBefore.basis)
  await reject(newEvidence.s, `public.create_missing_vat_periods(2026,${literal(boundaryBefore.basis)})`, /ändrats/)
  assert.equal((await plan(isolated)).basis, isolationPlan.basis)
  await create(isolated, isolationPlan)
  pass('changed first-period boundary is reviewed; another owner cannot change plan fingerprint or block creation')
  for (const type of ['year', 'quarter', 'month']) {
    const f = await fixture({ type, start: '2025-06-02' }), p = await plan(f)
    assert.equal(p.state, 'blocked'); assert.match(p.message, /delperiod/)
    await reject(f.s, `public.create_missing_vat_periods(2025,${literal(p.basis)})`, /Inga perioder/)
    assert.equal((await periodState(f)).periods.length, 0)
  }
  pass('unresolved first partial periods blocked for all frequencies')
  for (const status of ['not_registered', 'unknown']) {
    const f = await fixture({ status, type: null, start: null }), p = await plan(f)
    assert.equal(p.state, status === 'not_registered' ? 'not_applicable' : 'blocked')
    await reject(f.s, `public.create_missing_vat_periods(2025,${literal(p.basis)})`, /Inga perioder/)
  }
  const invalid = await fixture()
  const badProfile = await one(observer, `SELECT pg_temp.attempt(${literal(`UPDATE profiles SET vat_period_type=NULL WHERE id=${literal(invalid.uid)} RETURNING to_jsonb(profiles)`)});`)
  assert.equal(badProfile.ok, false); assert.equal(badProfile.code, '23514')
  pass('not registered/unknown cannot create; incomplete profile denied by existing DB constraint')
  const changed = await fixture(), old = await plan(changed)
  await observer.run(`UPDATE profiles SET vat_period_type='quarter' WHERE id=${literal(changed.uid)};`)
  await reject(changed.s, `public.create_missing_vat_periods(2025,${literal(old.basis)})`, /ändrats/)
  const updated = await plan(changed)
  await reject(complete.s, `public.create_missing_vat_periods(2025,${literal(updated.basis)})`, /ändrats/)
  await reject(changed.s, `public.create_missing_vat_periods(2026,${literal(updated.basis)})`, /ändrats/)
  pass('profile changes, owner changes and changed year reject stale preview')
  const overlap = await fixture(); await insert(overlap, '2025-06-01', '2025-12-31')
  assert.equal((await plan(overlap)).state, 'blocked')
  const imported = await fixture(); await insert(imported, '2025-01-01', '2025-12-31', 'year', 'imported_history')
  assert.equal((await plan(imported)).state, 'blocked')
  pass('overlap, incompatible interval and imported-history ambiguity cannot become complete or create')
  const locked = await fixture(), lp = await plan(locked)
  await observer.run(`INSERT INTO closed_years(user_id,year) VALUES(${literal(locked.uid)},2025);`)
  assert.equal((await plan(locked)).state, 'blocked')
  await reject(locked.s, `public.create_missing_vat_periods(2025,${literal(lp.basis)})`, /ändrats/)
  const future = await plan(invalid, 2099); assert.equal(future.state, 'not_applicable')
  pass('historical year lock changes invalidate preview; future years cannot create')
  // Simulated old-day token is rejected; date belongs to authoritative basis.
  await reject(invalid.s, `public.create_missing_vat_periods(2025,'00000000000000000000000000000000')`, /ändrats/)
  await invalid.s.run('BEGIN ISOLATION LEVEL REPEATABLE READ;')
  await reject(invalid.s, `public.create_missing_vat_periods(2025,${literal((await plan(invalid)).basis)})`, /read committed/)
  await invalid.s.run('ROLLBACK;')
  pass('unmatched/old token and non-fresh transaction snapshot fail closed')
  const calendar = await fixture({ type: 'month', start: '2026-01-01' })
  const originalPlanner = (await one(observer, `SELECT jsonb_build_object('body',pg_get_functiondef('public.kan117_vat_period_plan(integer)'::regprocedure));`)).body
  const onDate = date => {
    const body = originalPlanner.replace("(clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::date", `DATE '${date}'`)
    assert.notEqual(body, originalPlanner)
    return observer.run(body + ';')
  }
  await observer.run('BEGIN;')
  await onDate('2026-12-31')
  // Uncommitted clock injection is visible only to this local transaction.
  await observer.asUser(calendar.uid)
  const december = await good(observer, 'public.get_vat_period_creation_plan(2026)')
  assert.equal(december.missing.length, 12)
  assert.equal((await good(observer, 'public.get_vat_period_creation_plan(2027)')).state, 'not_applicable')
  await observer.run('RESET ROLE;'); await onDate('2027-01-01'); await observer.asUser(calendar.uid)
  await reject(observer, `public.create_missing_vat_periods(2026,${literal(december.basis)})`, /ändrats/)
  const january = await good(observer, 'public.get_vat_period_creation_plan(2027)')
  assert.deepEqual(january.missing, [{ start: '2027-01-01', end: '2027-01-31', type: 'month' }])
  await observer.run('ROLLBACK; RESET ROLE;')
  assert.equal((await one(observer, `SELECT jsonb_build_object('body',pg_get_functiondef('public.kan117_vat_period_plan(integer)'::regprocedure));`)).body, originalPlanner)
  pass('rollback-only Stockholm year boundary: old-day preview rejected; only started periods in new year')
  const race = await fixture(), rp = await plan(race), second = await open('competitor'); await second.asUser(race.uid)
  await race.s.run('BEGIN;'); await create(race, rp)
  const waiting = attempt(second, `public.create_missing_vat_periods(2025,${literal(rp.basis)})`)
  await blockedBy(second, race.s); await race.s.run('COMMIT;')
  const duplicate = await waiting; assert.equal(duplicate.ok, false); assert.equal(duplicate.code, '40001')
  assert.equal((await periodState(race)).periods.length, 1)
  pass('concurrent double confirmation serializes; only one exact period is inserted')
  const profileRace = await fixture(), pr = await plan(profileRace)
  await observer.run(`BEGIN; UPDATE profiles SET vat_period_type='quarter' WHERE id=${literal(profileRace.uid)};`)
  const profileWait = attempt(profileRace.s, `public.create_missing_vat_periods(2025,${literal(pr.basis)})`)
  // observer cannot execute a blocking probe in its open transaction; use competitor.
  const end = Date.now() + 6000
  let blocked = false
  while (Date.now() < end) {
    blocked = (await one(second, `SELECT jsonb_build_object('blocked',${observer.pid}=ANY(pg_blocking_pids(${profileRace.s.pid})));`)).blocked
    if (blocked) break
    await new Promise(r => setTimeout(r, 25))
  }
  assert(blocked); await observer.run('COMMIT;')
  assert.equal((await profileWait).code, '40001')
  assert.equal((await periodState(profileRace)).periods.length, 0)
  pass('confirmation waits for concurrent profile save then rechecks fresh state')
  const legacyRace = await fixture(), legacyPlan = await plan(legacyRace)
  const legacySession = await open('legacy-generator'); await legacySession.asUser(legacyRace.uid)
  await legacySession.run('BEGIN;'); await good(legacySession, "public.ensure_vat_periods('2025-12-31')")
  const legacyWait = attempt(legacyRace.s, `public.create_missing_vat_periods(2025,${literal(legacyPlan.basis)})`)
  await blockedBy(legacyRace.s, legacySession); await legacySession.run('COMMIT;')
  assert.equal((await legacyWait).code, '40001')
  assert.equal((await periodState(legacyRace)).periods.length, 1)
  pass('new confirmation waits for legacy generator and rejects stale dates without duplicate')
  const lockRace = await fixture(), lockPlan = await plan(lockRace)
  await observer.run(`BEGIN; SELECT public.lock_accounting_year_boundary(${literal(lockRace.uid)},true); INSERT INTO closed_years(user_id,year) VALUES(${literal(lockRace.uid)},2025);`)
  const lockWait = attempt(lockRace.s, `public.create_missing_vat_periods(2025,${literal(lockPlan.basis)})`)
  await blockedBy(lockRace.s, observer); await observer.run('COMMIT;')
  assert.equal((await lockWait).code, '40001')
  assert.equal((await periodState(lockRace)).periods.length, 0)
  pass('concurrent year-lock boundary waits then prevents insertion in newly locked year')
  const firstPeriodRace = await fixture({ start: '2024-06-02' }), firstPeriodPlan = await plan(firstPeriodRace)
  const initializer = await open('first-period-initializer'); await initializer.asUser(firstPeriodRace.uid)
  await initializer.run('RESET ROLE; SET ROLE service_role; BEGIN;')
  await good(initializer, `public.initialize_first_vat_year_period(${literal(firstPeriodRace.uid)},'2024-06-02','2024-12-31',true)`)
  const firstPeriodWait = attempt(firstPeriodRace.s, `public.create_missing_vat_periods(2025,${literal(firstPeriodPlan.basis)})`)
  await blockedBy(firstPeriodRace.s, initializer); await initializer.run('COMMIT;')
  assert.equal((await firstPeriodWait).code, '40001')
  assert.equal((await periodState(firstPeriodRace)).periods.length, 1)
  await create(firstPeriodRace, await plan(firstPeriodRace))
  pass('concurrent existing first-period initializer serializes; old next-year preview rejected and fresh confirmation succeeds')
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await originals(), beforeFunctions)
  pass('all earlier public/Auth/Storage rows and existing function definitions/ACL unchanged')
  fs.writeFileSync(out + '/result.json', JSON.stringify({ status: 'PASS', file, hash, fixFile, fixHash, manifest, checks, syntheticOwners: owners, noHostedWrites: true }, null, 2))
} finally { for (const s of sessions) await s.close() }
