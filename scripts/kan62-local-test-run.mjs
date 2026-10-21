// Append-only test evidence. No connection or filesystem write on import.
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {literal} from './kan62-local-db-guard.mjs'

export function createTestRun(operation,env=process.env,io={mkdirSync,writeFileSync,readFileSync}) {
  const id=env.SOLOLEDGER_KAN62_RUN_ID
  assert.match(id||'',/^[a-z0-9][a-z0-9-]{3,70}$/,'Explicit unique local run ID required')
  assert(['rollback','concurrency'].includes(operation))
  const parent=new URL('../coverage/kan62-local-db/runs/',import.meta.url)
  io.mkdirSync(parent,{recursive:true})
  const directory=new URL(id+'/',parent)
  io.mkdirSync(directory) // Existing ID fails; no overwrite or retry in the same directory.
  const save=(file,value)=>{
    assert.match(file,/^[a-z0-9-]+\.(json|log)$/)
    io.writeFileSync(new URL(file,directory),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'})
  }
  const inputs=['scripts/kan62-local-db-guard.mjs','scripts/kan62-local-test-run.mjs','scripts/run-kan62-local-db.mjs',
    'scripts/test-kan62-db-concurrency.mjs','supabase/tests/kan62_identity_guard.sql',
    'supabase/tests/kan62_test_helpers.sql','supabase/tests/kan62_rule_contract_expanded.sql','supabase/tests/kan62_rule_contract_candidate.sql']
  save('inputs.json',{id,operation,files:inputs.map(file=>({file,sha256:createHash('sha256')
    .update(io.readFileSync(new URL('../'+file,import.meta.url))).digest('hex')}))})
  return {id,directory,save}
}

const tables=['profiles','accounts','company_payment_account_roles','transactions','journal_entries',
  'fixed_asset_acquisition_groups','fixed_assets','fixed_asset_events','fixed_asset_acquisition_idempotency',
  'fixed_asset_depreciation_runs','ver_nr_sequences','vat_periods','closed_years']
export function retainedOwnerSQL(owners) {
  assert(Array.isArray(owners)&&owners.length>0)
  for(const id of owners)assert.match(id,/^[0-9a-f-]{36}$/)
  const list=owners.map(id=>literal(id)+'::uuid').join(',')
  return `SELECT jsonb_build_object('auth',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM auth.users a WHERE id IN (${list})),
    ${tables.map(t=>`${literal(t)},(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.${t} t WHERE ${t==='profiles'?'id':'user_id'} IN (${list}))`).join(',')});`
}
