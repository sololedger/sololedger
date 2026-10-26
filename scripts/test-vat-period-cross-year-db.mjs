// Mandatory KAN-117 regression. Exact guarded LOCAL database; all fixture writes roll back.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { LocalSession, validateManifest, literal } from './kan62-local-db-guard.mjs'

assert.equal(process.env.SOLOLEDGER_KAN117_LOCAL, 'implementation-and-tests')
const m = validateManifest(JSON.parse(fs.readFileSync('coverage/kan110111-local/result.json')).manifest)
const s = await new LocalSession(m, { ...process.env, SOLOLEDGER_KAN62_TEST_DB: m.database,
  SOLOLEDGER_KAN62_APPROVED_OPERATION: 'rollback', PGPASSFILE: 'C:/SoloLedger/LocalTest/pgpass.conf' }, 'kan117-cross-year-regression').open()
const one = async q => (await s.run(q))[0]
const owner = randomUUID()
const plan = y => one(`SELECT public.get_vat_period_creation_plan(${y});`)
const create = p => one(`SELECT pg_temp.attempt(${literal(`SELECT public.create_missing_vat_periods(${p.year},${literal(p.basis)})`)});`)
let passed = false
try {
  await s.run(`CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $a$ DECLARE r jsonb; BEGIN EXECUTE q INTO r; RETURN jsonb_build_object('ok',true,'value',r); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $a$;`)
  await s.run(`BEGIN; INSERT INTO auth.users(id) VALUES(${literal(owner)});
    INSERT INTO profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from)
    VALUES(${literal(owner)},${literal('kan117-rollback-' + owner + '@example.invalid')},'KAN117 rollback synthetic','registered','year','2026-06-02')
    ON CONFLICT(id) DO UPDATE SET vat_status='registered',vat_period_type='year',vat_management_from='2026-06-02';
    INSERT INTO vat_periods(user_id,period_start,period_end,period_type,status,source)
    VALUES(${literal(owner)},'2026-06-02','2026-12-31','year','open','sololedger');`)
  await s.asUser(owner)
  const initial = await one('SELECT to_jsonb(v) FROM vat_periods v;')
  assert.equal((await plan(2026)).state, 'complete')
  await s.run(`RESET ROLE; UPDATE profiles SET vat_management_from='2025-01-01' WHERE id=${literal(owner)};`)
  await s.asUser(owner)
  for (const year of [2026, 2025, 2024]) {
    const p = await plan(year)
    assert.equal(p.state, 'blocked', `Known cross-year contradiction must block selected year ${year}`)
    const r = await create(p)
    assert.equal(r.ok, false); assert.equal(r.code, '23514')
  }
  assert.deepEqual(await one('SELECT to_jsonb(v) FROM vat_periods v;'), initial)
  await s.run(`RESET ROLE; UPDATE profiles SET vat_management_from='2026-06-02' WHERE id=${literal(owner)};`)
  await s.asUser(owner)
  assert.equal((await plan(2026)).state, 'complete')
  assert.equal((await plan(2025)).state, 'not_applicable')
  assert.deepEqual(await one('SELECT to_jsonb(v) FROM vat_periods v;'), initial)
  assert.equal((await one('SELECT jsonb_build_object(\'count\',count(*)) FROM vat_periods;')).count, 1)
  passed = true
  console.log('PASS mandatory cross-year regression: 2026/2025/2024 preview and direct creation blocked; restoring profile preserves exact original period')
} finally {
  await s.run('ROLLBACK; RESET ROLE;')
  const residual = await one(`SELECT jsonb_build_object('auth',(SELECT count(*) FROM auth.users WHERE id=${literal(owner)}),'profile',(SELECT count(*) FROM profiles WHERE id=${literal(owner)}),'period',(SELECT count(*) FROM vat_periods WHERE user_id=${literal(owner)}));`)
  assert(Object.values(residual).every(n => n === 0))
  fs.mkdirSync('coverage/kan117-cross-year-local', { recursive: true })
  fs.writeFileSync('coverage/kan117-cross-year-local/mandatory-result.json', JSON.stringify({ status: passed ? 'PASS' : 'FAIL', allFixtureWritesRolledBack: true, database: m.database }, null, 2) + '\n')
  await s.close()
}
