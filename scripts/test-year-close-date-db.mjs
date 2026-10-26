// LOCAL ONLY. Reuse the verified disposable DB, preserve fixtures, restore schema/data.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {LocalSession,validateManifest,json,literal} from './kan62-local-db-guard.mjs'
assert.equal(process.env.SOLOLEDGER_KAN113_LOCAL,'implementation-and-tests')
const manifest=validateManifest(JSON.parse(fs.readFileSync(new URL('../'+process.env.SOLOLEDGER_KAN113_MANIFEST,import.meta.url),'utf8')))
const env={...process.env,SOLOLEDGER_KAN62_TEST_DB:manifest.database,SOLOLEDGER_KAN62_APPROVED_OPERATION:'concurrency',PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf'}
const migrationName='20261026162305_kan113_calendar_year_close_guard.sql'
const migration=fs.readFileSync(new URL('../supabase/migrations/'+migrationName,import.meta.url),'utf8')
const out=new URL('../coverage/kan113-local/',import.meta.url);fs.mkdirSync(out,{recursive:true})
const sessions=[],owners=[],checks=[]
const one=async(s,q)=>(await s.run(q))[0]
const open=async label=>{const s=await new LocalSession(manifest,env,'kan113-'+label).open();sessions.push(s);await s.run(`CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $try$ DECLARE r jsonb; BEGIN EXECUTE q INTO r; RETURN jsonb_build_object('ok',true,'value',r); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $try$;`);return s}
const attempt=(s,q)=>one(s,`SELECT pg_temp.attempt(${literal('SELECT '+q)});`)
const success=async(s,q)=>{const r=await attempt(s,q);assert(r.ok&&r.value?.success!==false,JSON.stringify(r));return r.value}
const rejected=async(s,q,pattern)=>{const r=await attempt(s,q);const e=!r.ok?r:r.value?.confirmed_rejection?r.value:null;assert(e,JSON.stringify(r));assert.match(e.message,pattern);return e}
const pass=(name,details)=>{checks.push({name,details});console.log('PASS '+name);fs.writeFileSync(new URL('progress.json',out),JSON.stringify({checks,owners},null,2))}
let observer=await open('observer')
const digestSQL=`CREATE FUNCTION pg_temp.digest_data() RETURNS jsonb LANGUAGE plpgsql AS $digest$ DECLARE r record; d text; v jsonb:='{}'; BEGIN
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
 EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,%L)) FROM public.%I t','',r.tablename) INTO d;
 v:=v||jsonb_build_object(r.tablename,d); END LOOP; RETURN v||jsonb_build_object('auth_count',(SELECT count(*) FROM auth.users)); END $digest$;`
await observer.run(digestSQL)
const data=()=>one(observer,'SELECT pg_temp.digest_data();')
const catalog=()=>one(observer,`SELECT jsonb_build_object('functions',(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('md5',md5(replace(pg_get_functiondef(p.oid),chr(13),'')),'acl',p.proacl::text)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace),'tables',(SELECT md5(string_agg(c.oid::text||c.relrowsecurity::text||coalesce(c.relacl::text,''),',' ORDER BY c.oid)) FROM pg_class c WHERE c.relnamespace='public'::regnamespace),'policies',(SELECT md5(coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname)::text,'')) FROM pg_policies p WHERE schemaname='public'),'constraints',(SELECT md5(string_agg(pg_get_constraintdef(oid),',' ORDER BY oid)) FROM pg_constraint WHERE connamespace='public'::regnamespace));`)
const initialData=await data(),initialCatalog=await catalog()
fs.writeFileSync(new URL('initial.json',out),JSON.stringify({initialData,initialCatalog},null,2))
const original=await one(observer,`SELECT jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text) FROM pg_proc WHERE oid='public.close_year_atomic(integer)'::regprocedure;`)
assert.equal(createHash('md5').update(original.definition.replaceAll('\r','')).digest('hex'),'9a93f74704913fc47ed5fff93223e236')
fs.writeFileSync(new URL('restore-function.sql',out),original.definition+';')
const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Stockholm',year:'numeric'}).format(new Date())),past=year-1
const state=uid=>one(observer,`SELECT jsonb_build_object('locks',(SELECT coalesce(jsonb_agg(year ORDER BY year),'[]') FROM closed_years WHERE user_id=${literal(uid)}),'tx',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM transactions t WHERE user_id=${literal(uid)}),'journal',(SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]') FROM journal_entries j WHERE user_id=${literal(uid)}),'periods',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY id),'[]') FROM vat_periods v WHERE user_id=${literal(uid)}));`)
async function fixture(label,registered=false){
 const uid=randomUUID();owners.push(uid)
 await observer.run(`BEGIN; INSERT INTO auth.users(id) VALUES(${literal(uid)});
 INSERT INTO profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES(${literal(uid)},${literal('kan113-'+uid+'@example.invalid')},'KAN113 LOCAL synthetic',${literal(registered?'registered':'not_registered')},${registered?"'year'":'NULL'},${registered?literal(past+'-01-01'):'NULL'},'taxable','full')
 ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,company_name=EXCLUDED.company_name,vat_status=EXCLUDED.vat_status,vat_period_type=EXCLUDED.vat_period_type,vat_management_from=EXCLUDED.vat_management_from,domestic_sales_vat_treatment=EXCLUDED.domestic_sales_vat_treatment,default_deduction_entitlement=EXCLUDED.default_deduction_entitlement;
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale',${literal(uid)},'KAN113 sale','1930','3010',0),('kan113-cost',${literal(uid)},'KAN113 cost','5420','1930',0);
 INSERT INTO company_payment_account_roles(user_id,role,account_number) VALUES(${literal(uid)},'business_payment_account','1930'); COMMIT;`)
 const s=await open(label);await s.asUser(uid);return {uid,s}
}
const payload=(y,extra={})=>({idempotency_key:randomUUID(),date:y+'-06-15',description:'KAN113 LOCAL synthetic',type:'kan113-sale',amount:100,vat_rate:0,ne_sales_basis:'taxable',ne_sales_basis_confirmed:true,...extra})
const book=p=>`public.book_transaction_atomic(${json(p)})`
async function waitBlocked(waiter,blocker){const until=Date.now()+5000;while(Date.now()<until){if((await one(observer,`SELECT jsonb_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})));`)).blocked)return;await new Promise(r=>setTimeout(r,30))}throw Error('Expected accounting lock wait')}
let installed=false,completed=false
try {
 await observer.run('BEGIN;'+migration+'COMMIT;');installed=true
 const updated=await catalog(),afterFunction=await one(observer,`SELECT jsonb_build_object('definition',pg_get_functiondef(oid),'acl',proacl::text) FROM pg_proc WHERE oid='public.close_year_atomic(integer)'::regprocedure;`)
 assert.equal(afterFunction.acl,original.acl)
 const expected=structuredClone(initialCatalog);expected.functions['close_year_atomic(integer)']=updated.functions['close_year_atomic(integer)'];assert.deepEqual(updated,expected)
 assert.equal(afterFunction.definition.slice(afterFunction.definition.indexOf('  PERFORM public.assert_vat_year_coverage')),original.definition.slice(original.definition.indexOf('  PERFORM public.assert_vat_year_coverage')))
 pass('only wrapper changed; all downstream checks, ACL, other functions and table boundaries preserved')
 const a=await fixture('ordinary'),v=await fixture('vat',true),race=await fixture('race'),bad=await fixture('negative')
 for(const f of [a,v]){
  await success(f.s,book(payload(past,{amount:1250,vat_rate:f===v?25:0})))
  if(f===v){
   await rejected(v.s,`public.close_year_atomic(${past})`,/saknas/)
   await success(v.s,`public.ensure_vat_periods('${past}-12-31')`)
   await rejected(v.s,`public.close_year_atomic(${past})`,/öppen/)
   await success(v.s,`public.close_vat_period_atomic((SELECT id FROM vat_periods WHERE user_id=auth.uid() AND period_start='${past}-01-01'))`)
  }
  const before=await state(f.uid);await success(f.s,`public.close_year_atomic(${past})`)
  const after=await state(f.uid);assert.deepEqual(after,{...before,locks:[past]})
  const balances=await one(f.s,`SELECT jsonb_build_object('period',(SELECT jsonb_object_agg(account_number,balance) FROM get_period_account_balances('${past}-01-01','${past}-12-31')),'cumulative',(SELECT jsonb_object_agg(account_number,balance) FROM get_cumulative_account_balances('${past}-12-31')));`)
  assert.equal(balances.cumulative['1930'],1250);assert.equal(balances.period['3010'],f===v?-1000:-1250)
  if(f===v)assert.equal(balances.cumulative['2650'],-250)
  await rejected(f.s,`public.close_year_atomic(${past})`,/redan låst/)
  await rejected(f.s,book(payload(past)),/låst/)
  pass('past year closes with real balanced journal, preserved VAT/report balances and post-lock rejection '+(f===v?'VAT':'no VAT'),balances)
  // Explicit closed VAT fixtures show the guard does not rely on VAT status.
  if(f===v)await observer.run(`INSERT INTO vat_periods(user_id,period_start,period_end,period_type,status,source,closing_amount) VALUES(${literal(v.uid)},'${year}-01-01','${year}-12-31','year','closed','sololedger',0),(${literal(v.uid)},'${year+1}-01-01','${year+1}-12-31','year','closed','sololedger',0);`)
  for(const y of [year,year+1]){const before=await state(f.uid);const e=await rejected(f.s,`public.close_year_atomic(${y})`,/inte avslutat.*1 januari/);assert.equal(e.code,'23514');assert.deepEqual(await state(f.uid),before)}
  pass('current/future direct RPC denied without data/lock changes '+(f===v?'VAT closed fixture':'no VAT'))
 }
 for(const y of ['NULL','1899','10000'])await rejected(a.s,`public.close_year_atomic(${y})`,/Ogiltigt/)
 const anonymous=await open('anon');await anonymous.run('SET ROLE anon;');await rejected(anonymous,`public.close_year_atomic(${past})`,/permission denied/)
 const unauth=await open('no-identity');await unauth.run('SET ROLE authenticated;');await rejected(unauth,`public.close_year_atomic(${past})`,/användarkontext/)
 assert.deepEqual((await state(race.uid)).locks,[])
 await race.s.run('BEGIN;');const otherLocks=await one(race.s,`SELECT jsonb_build_object('count',(SELECT count(*) FROM closed_years));`);assert.equal(otherLocks.count,0);await race.s.run('ROLLBACK;')
 pass('invalid years, anonymous, missing identity, and lock read isolation preserved')
 await success(bad.s,book(payload(past,{type:'kan113-cost'})))
 await rejected(bad.s,`public.close_year_atomic(${past})`,/negativt saldo/)
 pass('negative bank still blocks a completed year')
 // Run the actual candidate body at fixed instants in a pg_temp clone only.
 // No test clock or extra callable signature is shipped in the migration.
 for(const [instant,allowed] of [[`${year}-12-31 22:59:59.999+00`,false],[`${year}-12-31 23:00:00+00`,true]]){
  const clone=afterFunction.definition.replace('public.close_year_atomic(p_year integer)','pg_temp.boundary_close(p_year integer)').replace('clock_timestamp()',`TIMESTAMPTZ ${literal(instant)}`)
  await observer.run('BEGIN;'+clone+';')
  for(const f of [race,v])for(const zone of ['UTC','Pacific/Honolulu','Asia/Tokyo']){
   await observer.run(`SET LOCAL timezone=${literal(zone)}; SAVEPOINT boundary;`);await observer.asUser(f.uid)
   if(allowed)await success(observer,`pg_temp.boundary_close(${year})`);else await rejected(observer,`pg_temp.boundary_close(${year})`,/inte avslutat/)
   await observer.run('RESET ROLE; ROLLBACK TO SAVEPOINT boundary;')
  }
  await observer.run('ROLLBACK;')
 }
 pass('candidate RPC body at Stockholm midnight ±1ms, independent of three session timezones; temp clone rolled back')
 const writer=race.s,closer=await open('closer');await closer.asUser(race.uid)
 await writer.run('BEGIN;');const p=payload(past),receipt=await success(writer,book(p))
 const closing=success(closer,`public.close_year_atomic(${past})`);await waitBlocked(closer,writer)
 await writer.run('COMMIT;');await closing
 assert.equal((await state(race.uid)).journal.length,2)
 const replay=await success(writer,book(p));assert.equal(replay.idempotent_replay,true);assert.equal(replay.transaction_id,receipt.transaction_id)
 pass('booking first: close waits and includes committed journal; exact replay remains safe')
 await closer.run('BEGIN;');await success(closer,`public.close_year_atomic(${past-1})`)
 const blockedBook=rejected(writer,book(payload(past-1)),/låst/);await waitBlocked(writer,closer);await closer.run('COMMIT;');await blockedBook
 pass('close first: later booking waits, then is rejected without a journal')
 await closer.run('BEGIN;');await success(closer,`public.close_year_atomic(${past-2})`)
 const duplicate=rejected(writer,`public.close_year_atomic(${past-2})`,/redan låst/);await waitBlocked(writer,closer);await closer.run('COMMIT;');await duplicate
 pass('concurrent past-year closure inserts exactly one lock')
 const beforeDenied=await state(race.uid)
 await closer.run('BEGIN;');await success(closer,`public.close_year_atomic(${past-4})`)
 const denied=rejected(writer,`public.close_year_atomic(${year})`,/inte avslutat/);await waitBlocked(writer,closer);await closer.run('ROLLBACK;');await denied
 await Promise.all([rejected(writer,`public.close_year_atomic(${year+1})`,/inte avslutat/),rejected(closer,`public.close_year_atomic(${year+1})`,/inte avslutat/)])
 assert.deepEqual(await state(race.uid),beforeDenied)
 pass('current/future closure after lock wait and concurrent attempts denied with no data changes')
 await writer.run('BEGIN;');await success(writer,book(payload(past-3)));await rejected(writer,`public.close_year_atomic(${past-3})`,/egen transaktion/);await writer.run('ROLLBACK;')
 pass('shared-to-exclusive upgrade protection preserved; rollback restores synthetic write')
 completed=true
} catch(error) {
 fs.writeFileSync(new URL('failure.json',out),JSON.stringify({message:error.message,stderr:observer.stderr,owners},null,2))
 throw error
} finally {
 // First end all client transactions so cleanup/definition restoration cannot hang.
 for(const s of sessions)if(s!==observer)await s.close()
 if(observer.closed){observer=await open('cleanup-observer');await observer.run(digestSQL)}
 await observer.run('RESET ROLE; ROLLBACK;')
 for(const uid of owners){
  const proof=await one(observer,`SELECT jsonb_build_object('count',count(*)) FROM profiles WHERE id=${literal(uid)} AND email=${literal('kan113-'+uid+'@example.invalid')} AND company_name='KAN113 LOCAL synthetic';`)
  assert.equal(proof.count,1,'Only verified new synthetic cohort may be removed')
  await observer.run(`BEGIN; SELECT public.delete_user_data_atomic(${literal(uid)}); DELETE FROM auth.users WHERE id=${literal(uid)}; COMMIT;`)
 }
 if(installed)await observer.run('BEGIN;'+original.definition+';COMMIT;')
 assert.deepEqual(await data(),initialData,'All pre-existing public data and auth count restored')
 assert.deepEqual(await catalog(),initialCatalog,'Original public schema restored')
 const residual=await one(observer,`SELECT jsonb_build_object('count',count(*)) FROM auth.users WHERE id IN (${owners.length?owners.map(literal).join(','):'NULL'});`);assert.equal(residual.count,0)
 pass('synthetic cohort removed via authoritative deletion RPC; all public data, auth count and schema restored')
 fs.writeFileSync(new URL('result.json',out),JSON.stringify({status:completed?'PASS':'FAILED',migration:migrationName,sha256:createHash('sha256').update(migration).digest('hex'),manifest,checks,restored:true},null,2))
 await observer.close()
}
