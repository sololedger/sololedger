// Forward-upgrade regression, rollback only in the previously approved LOCAL DB.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {LocalSession,validateManifest,literal,json} from './kan62-local-db-guard.mjs'
assert.equal(process.env.SOLOLEDGER_KAN112_LOCAL_APPROVAL,'local-implementation-and-tests')
const manifest=validateManifest(JSON.parse(fs.readFileSync('coverage/kan110111-local/result.json','utf8')).manifest)
const env={...process.env,SOLOLEDGER_KAN62_TEST_DB:manifest.database,SOLOLEDGER_KAN62_APPROVED_OPERATION:'rollback',PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf'}
const s=await new LocalSession(manifest,env,'kan112-fixes-rollback').open()
const one=async sql=>(await s.run(sql))[0],a=randomUUID(),b=randomUUID(),checks=[]
const pass=name=>{checks.push(name);console.log('PASS '+name)}
const fix='20261026110015_kan112_conflict_and_profile_scope.sql',sql=fs.readFileSync('supabase/migrations/'+fix,'utf8')
const load=()=>one('SELECT public.get_year_end_checklist(2025);')
async function mark(key){const d=await load();return one(`SELECT public.save_year_end_checklist(2025,${literal(key)},true,${d.checks.find(r=>r.check_key===key)?.revision??0},${literal(d.basis[key])},${literal(randomUUID())});`)}
const rows=()=>one("SELECT jsonb_build_object('rows',(SELECT jsonb_agg(to_jsonb(c) ORDER BY user_id,check_key) FROM public.year_end_checklist c));")
const catalog=()=>one(`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'def',pg_get_functiondef(p.oid),'acl',p.proacl::text) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'acl',c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'));`)
const before=await catalog()
try{
 await s.run('BEGIN;')
 const dep=await one("SELECT jsonb_build_object('present',to_regclass('public.declaration_revisions') IS NOT NULL);")
 if(!dep.present)for(const file of ['20261023205734_kan100_declaration_archive.sql','20261025093000_kan100_archive_conflict_sqlstate.sql'])await s.run(fs.readFileSync('supabase/migrations/'+file,'utf8'))
 await s.run(fs.readFileSync('supabase/migrations/20261026092741_kan112_year_end_checklist.sql','utf8'))
 await s.run(`CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN EXECUTE q;RETURN jsonb_build_object('code','success');EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('code',SQLSTATE);END $$;
 INSERT INTO auth.users(id) VALUES(${literal(a)}),(${literal(b)});
 INSERT INTO profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement)
 VALUES(${literal(a)},'kan112-fix-a@example.invalid','KAN112 fix A','registered','year','2025-01-01','taxable','not_required','full'),(${literal(b)},'kan112-fix-b@example.invalid','KAN112 fix B','registered','year','2025-01-01','taxable','not_required','full');`)
 await s.asUser(a)
 for(const key of ['documents','vat','statements','tax','bank'])await mark(key)
 const old=await load()
 const conflict=`SELECT public.save_year_end_checklist(2025,'bank',false,0,${literal(old.basis.bank)},${literal(randomUUID())})`
 assert.equal((await one(`SELECT pg_temp.attempt(${literal(conflict)});`)).code,'40001')
 await s.run(`RESET ROLE;UPDATE profiles SET company_name='KAN112 actual changed name' WHERE id=${literal(a)};`);await s.asUser(a)
 const oldRenamed=await load();assert.deepEqual(Object.keys(old.basis).filter(k=>old.basis[k]!==oldRenamed.basis[k]).sort(),['documents','statements','tax','vat'])
 pass('reproduced old intentional 40001 and actual-name broad fingerprints before fix')
 await s.run(`RESET ROLE;UPDATE profiles SET company_name='KAN112 fix A' WHERE id=${literal(a)};`)
 await s.asUser(b);await mark('tax');await s.run(`RESET ROLE;UPDATE profiles SET default_deduction_entitlement='none' WHERE id=${literal(b)};`)
 const oldRows=(await rows()).rows,oldCatalog=await catalog()
 await s.run(sql)
 assert.equal((await one("SELECT jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true));")).sub,b)
 const newRows=(await rows()).rows,newCatalog=await catalog()
 for(const row of oldRows){const next=newRows.find(r=>r.user_id===row.user_id&&r.check_key===row.check_key);const translate=row.user_id===a&&['vat','statements','tax'].includes(row.check_key)
  if(translate){assert.notEqual(next.basis_fingerprint,row.basis_fingerprint);assert.equal(next.revision,row.revision+1);for(const k of Object.keys(row).filter(k=>!['basis_fingerprint','revision','updated_at'].includes(k)))assert.deepEqual(next[k],row[k])}
  else assert.deepEqual(next,row)
 }
 for(const f of oldCatalog.functions){const next=newCatalog.functions.find(n=>n.name===f.name);if(/^(kan112_checklist_basis|save_year_end_checklist)\(/.test(f.name))assert.equal(next.acl,f.acl);else assert.deepEqual(next,f)}
 assert.deepEqual(newCatalog.tables,oldCatalog.tables)
 pass('upgrade translates only current economic bases; stale answers, timestamps, request IDs, ACL and unrelated definitions preserved')
 await s.asUser(a);const fresh=await load();for(const key of ['vat','statements','tax'])assert.equal(fresh.checks.find(r=>r.check_key===key).basis_fingerprint,fresh.basis[key])
 // A response lost before upgrade can still be replayed without a new write.
 const prior=oldRows.find(r=>r.user_id===a&&r.check_key==='vat')
 const replay=await one(`SELECT public.save_year_end_checklist(2025,'vat',${prior.last_request[0]},${prior.last_request[1]},${literal(prior.last_request[2])},${literal(prior.last_request_id)});`)
 assert.deepEqual(replay.checks,fresh.checks)
 assert.equal((await one(`SELECT pg_temp.attempt(${literal(conflict)});`)).code,'PT409')
 const staleBasis=`SELECT public.save_year_end_checklist(2025,'bank',true,1,${literal('f'.repeat(32))},${literal(randomUUID())})`
 assert.equal((await one(`SELECT pg_temp.attempt(${literal(staleBasis)});`)).code,'PT409')
 pass('stale revision and stale economic basis both return PT409 without overwriting')
 await s.run(`RESET ROLE;UPDATE profiles SET company_name='KAN112 actual changed name' WHERE id=${literal(a)};`);await s.asUser(a)
 let changed=await load();assert.deepEqual(Object.keys(fresh.basis).filter(k=>fresh.basis[k]!==changed.basis[k]),['documents']);for(const key of ['vat','statements','tax'])assert.equal(changed.checks.find(r=>r.check_key===key).basis_fingerprint,changed.basis[key])
 pass('actual name change affects company-details only, no VAT/result/tax warnings')
 // Test each retained financial/profile fact independently, restoring it after.
 const statusBefore=await load();await s.run(`RESET ROLE;UPDATE profiles SET vat_status='not_registered',vat_period_type=NULL,vat_management_from=NULL WHERE id=${literal(a)};`);await s.asUser(a)
 const unregistered=await load();for(const key of ['vat','statements','tax'])assert.notEqual(unregistered.basis[key],statusBefore.basis[key]);await s.run(`RESET ROLE;UPDATE profiles SET vat_status='registered',vat_period_type='year',vat_management_from='2025-01-01' WHERE id=${literal(a)};`);await s.asUser(a)
 const fields={vat_period_type:['year','quarter'],vat_management_from:['2025-01-01','2024-01-01'],domestic_sales_vat_treatment:['taxable','exempt_other'],foreign_purchase_reporting:['not_required','required'],default_deduction_entitlement:['full','none']}
 for(const [field,[original,value]]of Object.entries(fields)){
  const start=await load();await s.run(`RESET ROLE;UPDATE profiles SET ${field}=${literal(value)} WHERE id=${literal(a)};`);await s.asUser(a)
  changed=await load();for(const key of ['vat','statements','tax'])assert.notEqual(changed.basis[key],start.basis[key],field+':'+key)
  assert.equal(changed.basis.bank,start.basis.bank)
  await s.run(`RESET ROLE;UPDATE profiles SET ${field}=${literal(original)} WHERE id=${literal(a)};`);await s.asUser(a)
 }
 pass('all six relevant VAT/tax profile facts retain warnings; bank unaffected')
 await s.run(`RESET ROLE;INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('forsaljning',${literal(a)},'KAN112 fix native sale','1930','3010',25);`);await s.asUser(a)
 const bookingBefore=await load();const booked=await one(`SELECT public.book_transaction_atomic(${json({idempotency_key:randomUUID(),date:'2025-06-20',description:'KAN112 fix local synthetic sale',type:'forsaljning',amount:1250,vat_rate:25,ne_sales_basis:'taxable',ne_sales_basis_confirmed:true})});`);assert(booked.success)
 changed=await load();for(const key of ['bank','vat','statements','tax'])assert.notEqual(changed.basis[key],bookingBefore.basis[key]);assert.deepEqual(changed.checks,bookingBefore.checks)
 const invoiceBefore=changed
 const created=await one(`SELECT public.create_customer_invoice_atomic(${json({invoice_number:'KAN112-fix-1',customer_name:'KAN112 synthetic',customer_country:'SE',currency:'SEK',invoice_date:'2025-12-01',service_date:'2025-12-01',due_date:'2026-01-01',gross_amount:100,vat_rate:null,vat_treatment:'unknown',attachment_url:null})});`);assert(created.success)
 changed=await load();assert.deepEqual(Object.keys(changed.basis).filter(k=>changed.basis[k]!==invoiceBefore.basis[k]).sort(),['customers','next_year']);assert.deepEqual(changed.checks,invoiceBefore.checks)
 pass('native booking and VAT still invalidate relevant checks; unbooked invoice remains scoped, answers retained')
 await s.run('RESET ROLE;ROLLBACK;');assert.deepEqual(await catalog(),before)
 pass('all local schema/function/permission changes rolled back')
 const functionMd5=Object.fromEntries(newCatalog.functions.filter(f=>/^(kan112_checklist_basis|save_year_end_checklist)\(/.test(f.name)).map(f=>[f.name,createHash('md5').update(f.def).digest('hex')]))
 fs.mkdirSync('coverage/kan112-fixes',{recursive:true});fs.writeFileSync('coverage/kan112-fixes/db-result.json',JSON.stringify({status:'PASS',manifest,fix,sha256:createHash('sha256').update(sql).digest('hex'),functionMd5,checks,rollback:true},null,2))
}finally{await s.close()}
