// PREPARED ONLY: this entry point has no create/install/reset capability.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { LocalSession, loadApprovedManifest, json, literal } from './kan62-local-db-guard.mjs'
import { createTestRun } from './kan62-local-test-run.mjs'

const files = ['kan62_rule_contract_candidate.sql','kan62_rule_contract_expanded.sql','kan62_test_helpers.sql','kan62_identity_guard.sql']
export function readSQL(name, stack=[]) {
  assert(files.includes(name) && !stack.includes(name), 'Only reviewed SQL includes, no recursion')
  return readFileSync(new URL('../supabase/tests/'+name,import.meta.url),'utf8')
    .replace(/^\\ir ([a-z0-9_]+\.sql)\r?$/gm,(_,include)=>readSQL(include,[...stack,name]))
}
const legacyURL = new URL('../coverage/kan62-local-db/legacy-fixture.json',import.meta.url)
// Excludes ONLY the deliberately replaced private body/comment. All public guards,
// owners, ACLs, configurations, RLS, constraints, triggers and indexes must match.
export const catalogSQL = `SELECT jsonb_build_object(
  'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',p.proowner,
    'acl',p.proacl,'securityDefiner',p.prosecdef,'config',p.proconfig,'definition',CASE
      WHEN p.oid='public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb)'::regprocedure THEN NULL
      ELSE pg_get_functiondef(p.oid) END) ORDER BY p.oid)
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'),
  'tables',(SELECT jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'owner',c.relowner,'acl',c.relacl,
    'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity) ORDER BY c.oid)
    FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','S')),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='public'::regnamespace),
  'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.connamespace='public'::regnamespace),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('oid',t.oid,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) ORDER BY t.oid)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('oid',i.indexrelid,'definition',pg_get_indexdef(i.indexrelid),
    'valid',i.indisvalid,'ready',i.indisready) ORDER BY i.indexrelid)
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace),
  'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',nspowner,'acl',nspacl) ORDER BY oid)
    FROM pg_namespace WHERE nspname IN ('public','auth','storage')),
  'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'login',rolcanlogin,
    'config',rolconfig) ORDER BY oid) FROM pg_roles WHERE rolname IN ('postgres','authenticated','anon','service_role')),
  'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member) FROM pg_auth_members m));`
const retainedTables=['profiles','accounts','company_payment_account_roles','transactions','journal_entries',
  'fixed_asset_acquisition_groups','fixed_assets','fixed_asset_events','fixed_asset_acquisition_idempotency',
  'fixed_asset_depreciation_runs','ver_nr_sequences','vat_periods','closed_years']
const retainedSQL=`SELECT jsonb_build_object('authIDs',(SELECT jsonb_agg(id ORDER BY id) FROM auth.users),
  ${retainedTables.map(t=>`${literal(t)},(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.${t} t)`).join(',')});`

export async function main(operation) {
  const manifest=loadApprovedManifest(operation)
  assert(['rollback','legacy-fixture'].includes(operation),'Use dedicated concurrency runner')
  const run=operation==='rollback'?createTestRun(operation):null
  let outcome={status:'FAIL',identity:manifest}
  const session=new LocalSession(manifest,process.env,'sql')
  try {
    await session.open()
    if(operation==='legacy-fixture') {
      assert(!existsSync(legacyURL),'Never overwrite or recreate legacy fixture')
      const [pre]=await session.run(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users),
        'definition',pg_get_functiondef('public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb)'::regprocedure));`)
      assert.equal(pre.users,0,'Legacy fixture only on freshly installed base 54, not an existing filled DB')
      assert(pre.definition.includes('gross_amount') && !pre.definition.includes('kan62-rule-contract-v1'),'Requires pre-candidate implementation')
      const [catalog]=await session.run(catalogSQL)
      const values=await session.run(`BEGIN;\n${readSQL('kan62_test_helpers.sql')}
        DO $fixture$ DECLARE u uuid:=gen_random_uuid(); p jsonb; r jsonb; BEGIN
          PERFORM pg_temp.kan62_setup(u,'full');
          p:=pg_temp.kan62_payload(12500,25,'full',10000)-ARRAY['booking_contract_version',
            'expected_threshold_basis_amount','expected_prior_asset_ids','expected_reclassification_amount'];
          r:=pg_temp.kan62_book(u,p); PERFORM pg_temp.kan62_purchase(r,u,10000,2500,false);
          PERFORM set_config('sololedger.kan62_created_legacy',jsonb_build_object('user_id',u,'payload',p,'result',r,
            'snapshot',pg_temp.kan62_snapshot(u))::text,true);
        END $fixture$;
        SELECT current_setting('sololedger.kan62_created_legacy')::jsonb;`)
      const fixture=values.at(-1); assert(fixture.user_id && fixture.result.success)
      await session.run('COMMIT;')
      writeFileSync(legacyURL,JSON.stringify({identity:manifest,fixture,catalog,committed:true},null,2)+'\n',{flag:'wx'})
      console.log('PASS synthetic pre-upgrade fixture committed locally; preserve database and evidence')
    } else {
      const evidence=JSON.parse(readFileSync(legacyURL,'utf8'))
      assert.deepEqual(evidence.identity,manifest); assert.equal(evidence.committed,true)
      const fixture=evidence.fixture
      const [catalog]=await session.run(catalogSQL)
      assert.deepEqual(catalog,evidence.catalog,'Only private body/comment may change across migration 55')
      const [stored]=await session.run(`SELECT json_build_object('request',request_payload,'result',result)
        FROM public.fixed_asset_acquisition_idempotency WHERE user_id=${literal(fixture.user_id)}::uuid
        AND idempotency_key=${literal(fixture.payload.idempotency_key)}::uuid;`)
      assert.deepEqual(stored.request,fixture.payload); assert.deepEqual(stored.result,fixture.result)
      const [before]=await session.run(retainedSQL)
      await session.run(`SELECT set_config('sololedger.kan62_legacy_fixture',${json(fixture)}::text,false);`)
      await session.run(readSQL('kan62_rule_contract_candidate.sql'))
      const [after]=await session.run(retainedSQL)
      assert.deepEqual(after,before,'Rollback preserves all retained fixtures, profiles and protected rows')
      const [remaining]=await session.run(`SELECT json_build_object('users',(SELECT count(*) FROM auth.users),
        'inTransaction',current_setting('transaction_read_only'));`)
      assert.equal(remaining.users,before.authIDs.length,'Rollback must preserve all prior users, including earlier runs')
      outcome={status:'PASS',identity:manifest,retainedUsers:remaining.users,allRetainedRowsUnchanged:true,catalogUnchanged:true}
      console.log('PASS KAN62 rollback suite; concurrency not implied')
    }
  } catch(error) { outcome={...outcome,error:error.stack}; throw error }
  finally {
    await session.close()
    if(run){run.save('psql.log',(session.stdout||'')+'\n'+(session.stderr||''));run.save('result.json',{run:run.id,...outcome})}
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  await main(process.argv[2]||'rollback')
