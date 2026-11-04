import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DATABASE, PASSFILE, LocalSession, json, literal, validateManifest } from './kan62-local-db-guard.mjs'

const manifestPath = process.env.SOLOLEDGER_KAN133_LOCAL_MANIFEST
assert(manifestPath, 'Provide the verified disposable database manifest')
const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')).manifest)
const session = await new LocalSession(manifest, {
  ...process.env, SOLOLEDGER_KAN62_TEST_DB: DATABASE,
  SOLOLEDGER_KAN62_APPROVED_OPERATION: 'rollback', PGPASSFILE: PASSFILE,
}, 'kan133-conflict').open()

const one = async sql => (await session.run(sql))[0]
const catalog = () => one(`SELECT jsonb_build_object('def',pg_get_functiondef(oid),'owner',proowner,'acl',proacl)
  FROM pg_proc WHERE oid='public.save_withdrawal_assessment(date,uuid,text,jsonb)'::regprocedure;`)
const migration = readFileSync(new URL('../supabase/migrations/20261104190000_kan133_withdrawal_conflict_sqlstate.sql', import.meta.url), 'utf8')
const a = randomUUID()
const b = randomUUID()
const date = "(now() AT TIME ZONE 'Europe/Stockholm')::date"
const signature = `get_withdrawal_context(${date})->>'signature'`
const fact = json([{ key: 'buffer', value: { amountOre: 15000 } }])
const save = (previous, source = signature, facts = fact) =>
  `SELECT to_jsonb(public.save_withdrawal_assessment(${date},${previous ? literal(previous) : 'NULL'},${source},${facts}))`
const attempt = sql => one(`SELECT pg_temp.attempt(${literal(sql)});`)
const saved = async sql => {
  const result = await attempt(sql)
  assert.match(result.value ?? '', /^[0-9a-f-]{36}$/, JSON.stringify(result))
  return result.value
}
const read = () => one(`SELECT jsonb_build_object(
  'revisions',(SELECT coalesce(jsonb_agg(id ORDER BY revision_no),'[]') FROM public.withdrawal_assessment_revisions),
  'facts',(SELECT coalesce(jsonb_agg(payload ORDER BY revision_id),'[]') FROM public.withdrawal_assessment_facts)
  );`)

try {
  const before = await catalog()
  await session.run(`BEGIN;
    CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $test$
    DECLARE value jsonb;
    BEGIN EXECUTE q INTO value; RETURN jsonb_build_object('value',value);
    EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('code',SQLSTATE,'message',SQLERRM);
    END $test$;
    INSERT INTO auth.users(id) VALUES(${literal(a)}),(${literal(b)});
    INSERT INTO public.profiles(id,email,company_name) VALUES
      (${literal(a)},${literal(a + '@example.invalid')},'KAN133 A'),
      (${literal(b)},${literal(b + '@example.invalid')},'KAN133 B');`)
  await session.asUser(a)
  assert.equal((await attempt(save(randomUUID()))).code, '40001')
  await session.run('RESET ROLE;')
  await session.run(migration)
  const after = await catalog()
  assert.equal(before.def.match(/ERRCODE='40001'/g)?.length, 2)
  assert.deepEqual(after, { ...before, def: before.def.replaceAll("ERRCODE='40001'", "ERRCODE='PT409'") })

  await session.asUser(a)
  const a1 = await saved(save(null))
  const oldA = await read()
  assert.deepEqual(oldA.revisions, [a1])
  await session.asUser(b)
  const b1 = await saved(save(null))
  const oldB = await read()
  assert.deepEqual(oldB.revisions, [b1])
  assert.equal((await attempt(save(a1))).code, 'PT409')
  assert.deepEqual(await read(), oldB)

  await session.asUser(a)
  assert.equal((await attempt(save(b1))).code, 'PT409')
  assert.equal((await attempt(save(a1, literal('stale signature')))).code, 'PT409')
  assert.equal((await attempt(save(a1, signature, json([{ key: 'buffer', value: { amountOre: -1 } }])))).code, 'P0001')
  assert.deepEqual(await read(), oldA)
  await session.run(`RESET ROLE; ALTER TABLE public.withdrawal_assessment_facts
    ADD CONSTRAINT kan133_test_force_fact_failure CHECK (payload->>'amountOre' <> '15001') NOT VALID;`)
  await session.asUser(a)
  const failingFact = json([{ key: 'buffer', value: { amountOre: 15001 } }])
  assert.equal((await attempt(save(a1, signature, failingFact))).code, '23514')
  assert.deepEqual(await read(), oldA, 'fact insert failure rolls back the preceding revision insert')
  const a2 = await saved(save(a1))
  assert.equal((await attempt(save(a1))).code, 'PT409')
  assert.deepEqual((await read()).revisions, [a1, a2])
  await session.asUser(b)
  assert.deepEqual(await read(), oldB)

  await session.run('ROLLBACK; RESET ROLE;')
  assert.deepEqual(await catalog(), before)
  assert.deepEqual(await one(`SELECT jsonb_build_object('fixtures',count(*)) FROM auth.users WHERE id IN (${literal(a)},${literal(b)});`), { fixtures: 0 })
  console.log('PASS local withdrawal RPC: original 40001, PT409 on stale revision/signature and foreign IDs both ways, own saves, no partial writes, ACL/definition and fixture rollback')
} finally {
  await session.close()
}
