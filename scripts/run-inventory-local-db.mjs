// Explicitly approved existing synthetic database only. No create/reset/cleanup.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {LocalSession,loadApprovedManifest,json} from './kan62-local-db-guard.mjs'
import {createTestRun,retainedOwnerSQL} from './kan62-local-test-run.mjs'
import {readSQL,catalogSQL} from './run-kan62-local-db.mjs'
import {saveInventoryInputs} from './inventory-test-inputs.mjs'

assert.equal(process.env.SOLOLEDGER_INVENTORY_LOCAL_APPROVED,'yes','Explicit inventory local operation approval required')
const mode=process.argv[2]
assert(['apply','apply-guard','apply-prior','sql'].includes(mode))
const manifest=loadApprovedManifest('rollback')
const migrations=JSON.parse(readFileSync(new URL('../docs/reviews/INVENTORY-LOCAL-MIGRATIONS.json',import.meta.url)))
for(const f of migrations.files) assert.equal(createHash('sha256').update(readFileSync(new URL('../'+f.file,import.meta.url))).digest('hex'),f.sha256)
const run=createTestRun('rollback'),s=new LocalSession(manifest,process.env,'inventory-'+mode)
saveInventoryInputs(run)
let before,owners,catalog,outcome={status:'FAIL',mode}
try {
  await s.open()
  const [u]=await s.run('SELECT json_build_object(\'ids\',(SELECT jsonb_agg(id ORDER BY id) FROM auth.users));')
  owners=u.ids
  ;[before]=await s.run(retainedOwnerSQL(owners))
  ;[catalog]=await s.run(catalogSQL)
  run.save('before.json',{identity:manifest,catalog,rows:before})
  if(mode.startsWith('apply')) {
    const [existing]=await s.run("SELECT json_build_object('present',to_regprocedure('public.inventory_depreciation_state(integer)') IS NOT NULL);")
    assert.equal(existing.present,mode!=='apply','Never replay an already installed migration')
    if(mode!=='apply') {
      const installed=JSON.parse(readFileSync(new URL('../coverage/kan62-local-db/runs/'+(mode==='apply-prior'?'inventory-apply-guard-r01':'inventory-apply-r01')+'/after.json',import.meta.url)))
      assert.deepEqual(catalog,installed.catalog,'Requires exact preserved first-install catalog')
    }
    for(const m of migrations.files.filter((_,index)=>index===(mode==='apply'?0:mode==='apply-guard'?1:2)))
      await s.run(readFileSync(new URL('../'+m.file,import.meta.url),'utf8'))
  } else {
    const legacy=JSON.parse(readFileSync(new URL('../coverage/kan62-local-db/legacy-fixture.json',import.meta.url))).fixture
    await s.run(`SELECT set_config('sololedger.kan62_legacy_fixture',${json(legacy)}::text,false);`)
    await s.run(readSQL('kan62_rule_contract_candidate.sql'))
    const replies=await s.run(readFileSync(new URL('../supabase/tests/inventory_k1_regression.sql',import.meta.url),'utf8')
      .replace('\\ir kan62_test_helpers.sql',()=>readSQL('kan62_test_helpers.sql')))
    const evidence=replies.find(reply=>Array.isArray(reply.users))
    assert(evidence,'Actual two-year accounting evidence required')
    run.save('accounting-evidence.json',evidence)
  }
  const [after]=await s.run(retainedOwnerSQL(owners))
  assert.deepEqual(after,before,'All prior synthetic data preserved')
  const [post]=await s.run(catalogSQL)
  if(mode==='sql') assert.deepEqual(post,catalog,'Regression may not change permanent catalog')
  for(const field of ['tables','policies','constraints','indexes','schemas','roles','memberships'])
    assert.deepEqual(post[field],catalog[field],'No non-function changes: '+field)
  if(mode==='apply-guard') {
    assert.equal(post.triggers.length,catalog.triggers.length+1)
    assert.deepEqual(post.triggers.filter(t=>!t.definition.includes('inventory_journal_boundary')),catalog.triggers)
  } else assert.deepEqual(post.triggers,catalog.triggers)
  run.save('after.json',{catalog:post,rows:after})
  outcome={status:'PASS',mode,retainedUsers:owners.length,allPriorRowsUnchanged:true,migrations}
  console.log('PASS inventory '+mode+'; prior data and security metadata preserved')
} catch(error){outcome={...outcome,error:error.stack};throw error}
finally {await s.close();run.save('psql.log',(s.stdout||'')+'\n'+(s.stderr||''));run.save('result.json',outcome)}
