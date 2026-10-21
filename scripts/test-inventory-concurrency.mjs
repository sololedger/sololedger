// Real isolated PostgreSQL sessions; append-only cohorts/evidence, no cleanup.
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {LocalSession,loadApprovedManifest,json,literal} from './kan62-local-db-guard.mjs'
import {createTestRun,retainedOwnerSQL} from './kan62-local-test-run.mjs'
import {readSQL,catalogSQL} from './run-kan62-local-db.mjs'
import {waitBlocked,payload} from './test-kan62-db-concurrency.mjs'
import {saveInventoryInputs} from './inventory-test-inputs.mjs'

assert.equal(process.env.SOLOLEDGER_INVENTORY_LOCAL_APPROVED,'yes')
const m=loadApprovedManifest('concurrency'),run=createTestRun('concurrency')
saveInventoryInputs(run)
for(const f of JSON.parse(readFileSync(new URL('../docs/reviews/INVENTORY-LOCAL-MIGRATIONS.json',import.meta.url))).files)
  assert.equal(createHash('sha256').update(readFileSync(new URL('../'+f.file,import.meta.url))).digest('hex'),f.sha256)
const sessions=[],users=[],results=[]
let admin,owners,before,catalog,complete=false
const success=r=>{assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.value.success,true,JSON.stringify(r));return r.value}
const reject=(r,code,pattern)=>{assert.equal(r.ok,false,JSON.stringify(r));assert.equal(r.code,code);assert.match(r.message,pattern)}
const purchase=p=>'public.book_fixed_asset_acquisition_atomic('+json(p)+')'
const checked=p=>'public.book_fixed_asset_depreciation_checked('+json(p)+')'
async function client(u,label) {
 const s=new LocalSession(m,process.env,label);sessions.push(s);await s.open()
 await s.run(`CREATE FUNCTION pg_temp.inv_attempt(command text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $try$
 DECLARE r jsonb; BEGIN IF current_user<>'authenticated' THEN RAISE EXCEPTION 'Actual client role required'; END IF;
 EXECUTE command INTO r; RETURN jsonb_build_object('ok',true,'value',r);
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $try$;
 DO $grant$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated',(SELECT nspname FROM pg_namespace WHERE oid=pg_my_temp_schema())); END $grant$;`)
 await s.asUser(u);s.rpc=expression=>{const pending=s.run(`SELECT pg_temp.inv_attempt(${literal('SELECT '+expression)});`).then(rows=>rows[0]);
  pending.catch(()=>{});return pending};return s
}
async function fixture({full=false,period=false}={}) {
 const u=randomUUID();users.push(u)
 await admin.run(`BEGIN; SELECT pg_temp.kan62_setup(${literal(u)}::uuid,${literal(full?'full':'none')}); COMMIT;`)
 const a=await client(u,'a-'+users.length),b=await client(u,'b-'+users.length)
 success(await a.rpc('public.book_transaction_atomic('+json({idempotency_key:randomUUID(),date:'2025-01-01',description:'Synthetic capital',amount:500000,type:'kan62_deposit',vat_rate:0})+')'))
 success(await a.rpc(purchase(payload(full?'full':'none',{date:'2025-12-01',gross_amount:full?125000:100000,vat_rate:full?25:0,
   expected_threshold_basis_amount:100000,useful_life_answer:'more_than_three_years_or_unknown'}))))
 let pid
 if(period){const [r]=await admin.run(`INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type)
   VALUES(${literal(u)}::uuid,'2025-12-01','2025-12-31','month') RETURNING json_build_object('id',id);`);pid=r.id}
 const preview=async()=>{const r=await a.rpc('public.get_fixed_asset_depreciation_preview(2025)');assert(r.ok);return r.value}
 const request=async()=>{const r=await preview();assert.equal(r.status,'ready');return {fiscal_year:2025,year_start:'2025-01-01',year_end:'2025-12-31',
   normal_calendar_year_confirmed:true,all_purchases_complete:true,expected_signature:r.signature,expected_amount:r.depreciation_amount}}
 return {u,a,b,pid,preview,request}
}
const extra=()=>payload('none',{date:'2025-12-02',gross_amount:40000,vat_rate:0,expected_threshold_basis_amount:40000,useful_life_answer:'more_than_three_years_or_unknown'})
async function heldFirst(s,expression){await s.run('BEGIN;');return s.rpc(expression)}
async function record(name,test){await test();results.push({name,status:'PASS'});
 run.save('case-'+String(results.length).padStart(2,'0')+'.json',{name,status:'PASS',sessions:sessions.map(s=>({label:s.label,pid:s.pid,log:s.log}))});console.log('PASS '+name)}
async function anyWait(waiter,blocker){
 const until=Date.now()+6000
 while(Date.now()<until){const [r]=await admin.run(`SELECT json_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})),
 'event',(SELECT wait_event FROM pg_stat_activity WHERE pid=${waiter.pid}),'type',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${waiter.pid}));`)
  if(r.blocked){assert.equal(r.type,'Lock');return r}await new Promise(r=>setTimeout(r,40))}
 throw Error('No actual lock wait')
}
try {
 admin=new LocalSession(m,process.env,'inventory-observer');sessions.push(admin);await admin.open()
 ;[{ids:owners}]=await admin.run("SELECT json_build_object('ids',(SELECT jsonb_agg(id ORDER BY id) FROM auth.users));")
 ;[before]=await admin.run(retainedOwnerSQL(owners));[catalog]=await admin.run(catalogSQL)
 run.save('retained-before.json',{rows:before,catalog})
 await admin.run(readSQL('kan62_test_helpers.sql'))
 await record('buy-first stale preview rejected after actual wait then reload succeeds',async()=>{
  const f=await fixture(),p=await f.request();success(await heldFirst(f.a,purchase(extra())))
  const pending=f.b.rpc(checked(p));await waitBlocked(admin,f.b,f.a);await f.a.run('COMMIT;')
  reject(await pending,'23514',/underlaget har ändrats/);success(await f.b.rpc(checked(await f.request())))
 })
 await record('depreciation-first later capital purchase rejected without extra rows',async()=>{
  const f=await fixture();success(await heldFirst(f.a,checked(await f.request())))
  const pending=f.b.rpc(purchase(extra()));await waitBlocked(admin,f.b,f.a);await f.a.run('COMMIT;')
  reject(await pending,'23514',/fastställt genom årsavskrivning/)
 })
 await record('concurrent annual replay returns one receipt and two journal rows',async()=>{
  const f=await fixture(),p=await f.request(),a=success(await heldFirst(f.a,checked(p)))
  const pending=f.b.rpc(checked(p));await waitBlocked(admin,f.b,f.a);await f.a.run('COMMIT;')
  const b=success(await pending);assert.equal(a.transaction_id,b.transaction_id);assert.equal(b.idempotent_replay,true)
  const [r]=await admin.run(`SELECT json_build_object('rows',(SELECT count(*) FROM public.journal_entries WHERE transaction_id=${literal(a.transaction_id)}::uuid),
   'runs',(SELECT count(*) FROM public.fixed_asset_depreciation_runs WHERE user_id=${literal(f.u)}::uuid));`)
  assert.deepEqual(r,{rows:2,runs:1})
 })
 await record('concurrent changed annual request rejected by exact payload',async()=>{
  const f=await fixture(),p=await f.request();success(await heldFirst(f.a,checked(p)))
  const pending=f.b.rpc(checked({...p,expected_amount:1}));await waitBlocked(admin,f.b,f.a);await f.a.run('COMMIT;')
  reject(await pending,'23505',/annat underlag/)
 })
 await record('year close waits for annual depreciation then closes on fresh journal',async()=>{
  const f=await fixture();success(await heldFirst(f.a,checked(await f.request())))
  const pending=f.b.rpc('public.close_year_atomic(2025)');await waitBlocked(admin,f.b,f.a);await f.a.run('COMMIT;');success(await pending)
  reject(await f.a.rpc(purchase(extra())),'23514',/låst för ändringar/)
 })
 await record('year close without required run rejected then ordinary committed close succeeds',async()=>{
  const f=await fixture();reject(await f.b.rpc('public.close_year_atomic(2025)'),'23514',/årsavskrivning/)
  success(await f.a.rpc(checked(await f.request())));success(await f.b.rpc('public.close_year_atomic(2025)'))
 })
 await record('VAT close first and declared period allow VAT-free annual depreciation',async()=>{
  const f=await fixture({full:true,period:true}),p=await f.request()
  success(await heldFirst(f.a,'public.close_vat_period_atomic('+literal(f.pid)+'::uuid)'))
  const pending=f.b.rpc(checked(p));const wait=await anyWait(f.b,f.a);assert(wait.event)
  await f.a.run('COMMIT;');success(await pending)
  success(await f.a.rpc('public.declare_vat_period_atomic('+literal(f.pid)+"::uuid,'2026-01-10')"))
  const [r]=await admin.run(`SELECT json_build_object('amount',closing_amount,'status',status) FROM public.vat_periods WHERE id=${literal(f.pid)}::uuid;`)
  assert.equal(Number(r.amount),-25000);assert.equal(r.status,'declared')
 })
 await record('annual depreciation first and competing VAT close preserve actual VAT balance',async()=>{
  const f=await fixture({full:true,period:true});success(await heldFirst(f.a,checked(await f.request())))
  const pending=f.b.rpc('public.close_vat_period_atomic('+literal(f.pid)+'::uuid)');await anyWait(f.b,f.a)
  await f.a.run('COMMIT;');success(await pending)
  const [r]=await admin.run(`SELECT json_build_object('amount',closing_amount) FROM public.vat_periods WHERE id=${literal(f.pid)}::uuid;`)
  assert.equal(Number(r.amount),-25000)
 })
 await record('untracked incoming inventory journal serializes and blocks unsafe annual basis',async()=>{
  const f=await fixture(),p=await f.request()
  await admin.run(`BEGIN; INSERT INTO public.transactions(id,user_id,date,description,amount,booked,source)
   VALUES(${literal(randomUUID())}::uuid,${literal(f.u)}::uuid,'2025-12-03','Synthetic unsupported import',1,true,'sie_import');
   INSERT INTO public.journal_entries(user_id,date,transaction_id,ver_nr,account_number,debit,credit)
   SELECT t.user_id,t.date,t.id,999,v.account,v.debit,v.credit FROM public.transactions t
   CROSS JOIN (VALUES('1220',1,0),('2018',0,1)) v(account,debit,credit)
   WHERE t.user_id=${literal(f.u)}::uuid AND t.description='Synthetic unsupported import';`)
  const pending=f.b.rpc(checked(p));await waitBlocked(admin,f.b,admin);await admin.run('COMMIT;')
  reject(await pending,'23514',/ingående värden/)
 })
 await record('different owners remain independent',async()=>{
  const f=await fixture(),g=await fixture();success(await heldFirst(f.a,checked(await f.request())))
  success(await g.a.rpc(checked(await g.request())));await f.a.run('COMMIT;')
 })
 // Persistent new fixtures also feed real report/NE/balance checks outside SQL.
 const list=users.map(u=>literal(u)+'::uuid').join(',')
 const [evidence]=await admin.run(`SELECT json_build_object('users',jsonb_build_array(${list}),
  'transactions',(SELECT jsonb_agg(t) FROM public.transactions t WHERE user_id IN (${list})),
  'journal',(SELECT jsonb_agg(j) FROM public.journal_entries j WHERE user_id IN (${list})),
  'periods',(SELECT jsonb_agg(p) FROM public.vat_periods p WHERE user_id IN (${list})));`)
 run.save('accounting-evidence.json',evidence)
 complete=true
} finally {
 for(const s of sessions)await s.close()
 const verifier=new LocalSession(m,process.env,'inventory-retained-verifier')
 try {await verifier.open();const [after]=await verifier.run(retainedOwnerSQL(owners));const [post]=await verifier.run(catalogSQL)
  assert.deepEqual(after,before);assert.deepEqual(post,catalog);run.save('retained-after.json',{rows:after,catalog:post})
 } finally {await verifier.close();run.save('session-logs.json',sessions.map(s=>({label:s.label,pid:s.pid,log:s.log,stderr:s.stderr})))
  run.save('result.json',{complete,results,users,retainedUsers:owners?.length,identity:m})}
}
assert.equal(results.length,10);assert(complete);console.log('PASS 10 real-session inventory concurrency cases')
