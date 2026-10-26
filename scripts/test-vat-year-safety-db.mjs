// Explicit isolated LOCAL database only. No create/reset, remote fallback or fixture deletion.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {randomUUID,createHash} from 'node:crypto'
import {LocalSession,validateManifest,json,literal} from './kan62-local-db-guard.mjs'

assert.equal(process.env.SOLOLEDGER_VAT_YEAR_TEST_APPROVAL,'local-implementation-and-tests')
const manifest=validateManifest(JSON.parse(fs.readFileSync(process.env.SOLOLEDGER_VAT_YEAR_LOCAL_MANIFEST,'utf8')))
const env={...process.env,SOLOLEDGER_KAN62_TEST_DB:manifest.database,SOLOLEDGER_KAN62_APPROVED_OPERATION:'concurrency',PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf'}
const migrations=['20261026090000_kan110_vat_year_coverage.sql','20261026091000_kan111_explicit_vat_period_generation.sql']
const files=migrations.map(name=>({name,sql:fs.readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')}))
const fingerprint=files.map(f=>({name:f.name,sha256:createHash('sha256').update(f.sql).digest('hex')}))
const out=new URL('../coverage/kan110111-local/',import.meta.url);fs.mkdirSync(out,{recursive:true})
const edgesOnly=process.argv.includes('--edge-cases')
const concurrencyOnly=process.argv.includes('--concurrency-only')||edgesOnly
const resume=process.argv.includes('--remaining')||concurrencyOnly
const sessions=[],owners=[],checks=resume?JSON.parse(fs.readFileSync(new URL('result.json',out),'utf8')).checks:[]
const open=async label=>{const s=await new LocalSession(manifest,env,'vat-year-'+label).open();sessions.push(s);await s.run(`CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $attempt$ DECLARE r jsonb; BEGIN EXECUTE q INTO r; RETURN jsonb_build_object('ok',true,'value',r); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $attempt$;`);return s}
const one=async(s,q)=>(await s.run(q))[0]
const attempt=(s,sql)=>one(s,`SELECT pg_temp.attempt(${literal('SELECT '+sql)});`)
const success=async(s,sql)=>{const r=await attempt(s,sql);assert(r.ok&&r.value?.success!==false,JSON.stringify(r));return r.value}
const rejected=async(s,sql,pattern)=>{const r=await attempt(s,sql),error=!r.ok?r:r.value?.confirmed_rejection?r.value:null;assert(error,JSON.stringify(r));assert.match(error.message,pattern);return error}
const pass=(name,data)=>{checks.push({name,data});fs.writeFileSync(new URL('result.json',out),JSON.stringify({checks,owners,manifest,migrations:fingerprint},null,2));console.log('PASS '+name)}
const observer=await open('observer')
const tables=['profiles','accounts','transactions','journal_entries','vat_periods','closed_years','company_payment_account_roles']
const retained=()=>one(observer,`SELECT jsonb_build_object(${tables.map(t=>`${literal(t)},(SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) FROM public.${t} t ${owners.length?`WHERE ${t==='profiles'?'id':'user_id'} NOT IN (${owners.map(literal).join(',')})`:''})`).join(',')},'auth',(SELECT md5(coalesce(jsonb_agg(to_jsonb(u) ORDER BY id)::text,'')) FROM auth.users u ${owners.length?`WHERE id NOT IN (${owners.map(literal).join(',')})`:''}));`)
const catalog=()=>one(observer,`SELECT jsonb_build_object('functions',(SELECT jsonb_object_agg(p.proname,jsonb_build_object('md5',md5(replace(pg_get_functiondef(p.oid),E'\\r','')),'acl',p.proacl::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('assert_vat_year_coverage','close_year_atomic','close_year_unchecked_inventory','ensure_vat_periods')),'api_helper',CASE WHEN to_regprocedure('public.assert_vat_year_coverage(integer)') IS NULL THEN NULL ELSE has_function_privilege('authenticated','public.assert_vat_year_coverage(integer)','EXECUTE') END);`)
const book=(date='2025-06-20',vatRate=25)=>`public.book_transaction_atomic(${json({idempotency_key:randomUUID(),date,description:'KAN110111 local synthetic',type:'forsaljning',amount:1250,vat_rate:vatRate,ne_sales_basis:'taxable',ne_sales_basis_confirmed:true})})`
const state=uid=>one(observer,`SELECT jsonb_build_object('periods',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY period_start),'[]') FROM vat_periods v WHERE user_id=${literal(uid)}),'locks',(SELECT coalesce(jsonb_agg(year),'[]') FROM closed_years WHERE user_id=${literal(uid)}),'journal',(SELECT coalesce(jsonb_agg(to_jsonb(j) ORDER BY id),'[]') FROM journal_entries j WHERE user_id=${literal(uid)}),'tx',(SELECT count(*) FROM transactions WHERE user_id=${literal(uid)}));`)
async function fixture(label,{type='year',start='2025-01-01',status='registered',sale=true}={}){
 const uid=randomUUID();owners.push(uid)
 await observer.run(`INSERT INTO auth.users(id) VALUES(${literal(uid)});
 INSERT INTO profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES(${literal(uid)},${literal('kan110111-'+uid+'@example.invalid')},'KAN110111 local synthetic',${literal(status)},${type?literal(type):'NULL'},${start?literal(start):'NULL'},'taxable','full');
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('forsaljning',${literal(uid)},'Försäljning','1930','3010',25);
 INSERT INTO company_payment_account_roles(user_id,role,account_number) VALUES(${literal(uid)},'business_payment_account','1930');`)
 const s=await open(label);await s.asUser(uid);if(sale)await success(s,book());return{uid,s,label}
}
async function ensure(f,date='2025-12-31'){return success(f.s,`public.ensure_vat_periods(${literal(date)})`)}
async function closePeriods(f){const before=await state(f.uid);for(const p of before.periods)if(p.status==='open')await success(f.s,`public.close_vat_period_atomic(${literal(p.id)})`)}
async function waitBlocked(waiter,blocker){const end=Date.now()+6000;while(Date.now()<end){const r=await one(observer,`SELECT jsonb_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})));`);if(r.blocked)return;await new Promise(r=>setTimeout(r,30))}throw Error('Expected isolated lock wait')}
const before=await retained()
try{
 const installedPath=new URL('installed.json',out),initial=await catalog()
 if(!initial.functions?.assert_vat_year_coverage){
  await observer.run('BEGIN;'+files[0].sql+'COMMIT;')
  pass('KAN110 migration installed only on verified disposable LOCAL database',await catalog())
  // Verify server protection before the later period-generation/UI fix.
  const missing=await fixture('missing-before-kan111')
  await rejected(missing.s,'public.close_year_atomic(2025)',/saknas/)
  pass('KAN110 alone denies first manual year with no generated periods',await state(missing.uid))
  await observer.run('BEGIN;'+files[1].sql+'COMMIT;')
  fs.writeFileSync(installedPath,JSON.stringify({fingerprint,catalog:await catalog()},null,2))
 }else if(!fs.existsSync(installedPath)){
  // Resume only a proven first-migration checkpoint after a fixture-tool failure.
  const partial=JSON.parse(fs.readFileSync(new URL('result.json',out),'utf8'))
  assert.deepEqual(partial.migrations,fingerprint)
  assert.deepEqual(initial,partial.checks[0].data,'Partial installation drifted')
  const missing=await fixture('missing-before-kan111')
  await rejected(missing.s,'public.close_year_atomic(2025)',/saknas/)
  pass('KAN110 alone denies first manual year with no generated periods',await state(missing.uid))
  await observer.run('BEGIN;'+files[1].sql+'COMMIT;')
  fs.writeFileSync(installedPath,JSON.stringify({fingerprint,catalog:await catalog()},null,2))
 }else{
  const installed=JSON.parse(fs.readFileSync(installedPath,'utf8'));assert.deepEqual(installed.fingerprint,fingerprint,'Never replay changed migration');assert.deepEqual(initial,installed.catalog,'Installed functions drifted')
 }
 if(!concurrencyOnly){
 const permissions=await catalog();assert.equal(permissions.api_helper,false)
 for(const role of ['anon','service_role'])assert.equal((await one(observer,`SELECT jsonb_build_object('allowed',has_function_privilege(${literal(role)},'public.assert_vat_year_coverage(integer)','EXECUTE'));`)).allowed,false)
 pass('new helper is private; existing RPC ACLs preserved',permissions)
 let missing
 if(!resume){
 missing=await fixture('missing')
 await rejected(missing.s,'public.close_year_atomic(2025)',/saknas/);assert.equal((await state(missing.uid)).locks.length,0)
 pass('missing full annual coverage denied without creating periods',await state(missing.uid))
 for(const type of ['year','quarter','month']){
  const f=await fixture('partial-'+type,{type,start:'2025-06-15'})
  await rejected(f.s,`public.ensure_vat_periods('2025-12-31')`,/Första momsperioden.*utredas/)
  await rejected(f.s,'public.close_year_atomic(2025)',/Första momsperioden.*utredas/)
  assert.equal((await state(f.uid)).periods.length,0)
  pass('missing first partial '+type+' explicitly denied without silent skip',await state(f.uid))
 }
 for(const type of ['year','quarter','month']){
  const f=await fixture('full-'+type,{type});await ensure(f)
  assert.equal((await state(f.uid)).periods.length,{year:1,quarter:4,month:12}[type])
  await rejected(f.s,'public.close_year_atomic(2025)',/öppen/);await closePeriods(f)
  const locked=await success(f.s,'public.close_year_atomic(2025)');assert.equal(locked.success,true)
  const beforeRead=await state(f.uid),reused=await ensure(f);assert.equal(reused.created_count,0);assert.deepEqual(await state(f.uid),beforeRead)
  const next=await ensure(f,'2026-03-15');assert(next.created_count>0)
  pass('full '+type+' coverage, closed-year reuse and later period creation',await state(f.uid))
 }
 const explicit=await fixture('explicit-first-registration',{start:'2025-06-15'})
 await explicit.s.run('RESET ROLE; SET ROLE service_role;')
 await success(explicit.s,`public.initialize_first_vat_year_period(${literal(explicit.uid)},'2025-06-15','2025-12-31',true)`)
 await explicit.s.asUser(explicit.uid);await ensure(explicit);await closePeriods(explicit);await success(explicit.s,'public.close_year_atomic(2025)')
 await ensure(explicit,'2026-03-15');pass('previously supported explicit first annual partial period preserved',await state(explicit.uid))
 const noVat=await fixture('no-vat',{status:'not_registered',start:null,type:null,sale:false})
 await success(noVat.s,'public.close_year_atomic(2025)');pass('not registered company still closes without VAT periods',await state(noVat.uid))
 const unknown=await fixture('unknown',{status:'unknown',start:null,type:null,sale:false})
 await rejected(unknown.s,'public.close_year_atomic(2025)',/momsregistrering/);pass('unknown VAT profile requires review')
 }else missing=await fixture('remaining-isolation-control')
 const profileConstraint=await one(observer,"SELECT jsonb_build_object('definition',pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='profiles_vat_settings_consistency_check';")
 assert(profileConstraint.definition.includes('vat_management_from'))
 pass('incomplete registered profile already denied by existing database constraint',profileConstraint)
 const gap=await fixture('interior-gap',{type:'month'});await ensure(gap)
 await observer.run(`DELETE FROM vat_periods WHERE user_id=${literal(gap.uid)} AND period_start='2025-07-01' AND status='open';`)
 await closePeriods(gap);await rejected(gap.s,'public.close_year_atomic(2025)',/2025-07-01.*saknas/);pass('interior missing period denied even with all other periods closed')
 const early=await fixture('early-journal',{type:'month',start:'2025-07-01'});await ensure(early);await closePeriods(early)
 await rejected(early.s,'public.close_year_atomic(2025)',/före.*momshanteringsstart/);pass('booked VAT before configured management start requires review')
 const life=await fixture('lifecycle');await ensure(life);await closePeriods(life);const p=(await state(life.uid)).periods[0]
 await success(life.s,'public.close_year_atomic(2025)');const closed=await state(life.uid)
 await success(life.s,`public.declare_vat_period_atomic(${literal(p.id)},'2026-01-10')`)
 assert.deepEqual((await state(life.uid)).journal,closed.journal)
 await rejected(life.s,book('2025-12-20'),/låst/)
 await rejected(life.s,`public.record_vat_settlement_atomic(${literal(p.id)},'2025-12-31',250,${literal(randomUUID())})`,/låst/)
 await rejected(life.s,`public.record_tax_account_movement_atomic('business_to_tax_account','2025-12-31',250,${literal(p.id)},${literal(randomUUID())})`,/låst/)
 const settle=`public.record_vat_settlement_atomic(${literal(p.id)},'2026-01-20',250,${literal(randomUUID())})`
 const move=`public.record_tax_account_movement_atomic('business_to_tax_account','2026-01-21',250,${literal(p.id)},${literal(randomUUID())})`
 await success(life.s,settle);assert.equal((await success(life.s,settle)).idempotent_replay,true)
 await success(life.s,move);assert.equal((await success(life.s,move)).idempotent_replay,true)
 const after=await state(life.uid);assert.equal(after.tx,4);assert.deepEqual(after.journal.filter(j=>j.date<'2026-01-01'),closed.journal)
 await rejected(missing.s,`public.declare_vat_period_atomic(${literal(p.id)},'2026-01-10')`,/tillhör|hittades/)
 pass('declaration, next-year tax events, replay, locked-date protection and isolation',after)
 }
 if(edgesOnly){
  const unregistered=await fixture('non-vat-booked',{status:'not_registered',type:null,start:null,sale:false})
  await success(unregistered.s,book('2025-06-20',0));await success(unregistered.s,'public.close_year_atomic(2025)')
  pass('unregistered company with actual zero-VAT bookkeeping still closes',await state(unregistered.uid))
  const overlap=await fixture('overlap',{sale:false});await ensure(overlap)
  await observer.run(`INSERT INTO vat_periods(user_id,period_start,period_end,period_type,status,source) VALUES(${literal(overlap.uid)},'2025-06-15','2025-12-31','year','open','sololedger');`)
  await rejected(overlap.s,'public.close_year_atomic(2025)',/överlappande/);pass('ambiguous overlapping coverage is refused')
  const historical=await fixture('historical-status',{sale:false});await ensure(historical)
  await observer.run(`UPDATE vat_periods SET source='imported_history',status='closed',closing_amount=0 WHERE user_id=${literal(historical.uid)};`)
  await rejected(historical.s,'public.close_year_atomic(2025)',/osäker.*historik/);pass('historical flag is not guessed to prove managed-period completion')
 }else{
 // Shared writer gate before exclusive close: the waiter must see newly created periods.
 const race=await fixture('ensure-close-race',{sale:false}),closer=await open('closer');await closer.asUser(race.uid)
 await race.s.run('BEGIN;');await ensure(race)
 const waitingClose=attempt(closer,'public.close_year_atomic(2025)');await waitBlocked(closer,race.s);await race.s.run('COMMIT;')
 const denied=await waitingClose;assert.equal(denied.ok,false);assert.match(denied.message,/öppen/)
 pass('concurrency: close waits for generation then rejects newly open period')
 await closePeriods(race);await closer.run('BEGIN;');await success(closer,'public.close_year_atomic(2025)')
 const waitingBook=attempt(race.s,book('2025-12-20'));await waitBlocked(race.s,closer);await closer.run('COMMIT;')
 const rejectedBook=await waitingBook;assert.equal(rejectedBook.value.confirmed_rejection,true);assert.match(rejectedBook.value.message,/låst/)
 pass('concurrency: booking waits for close then rejects locked year')
 const a=await open('ensure-a'),b=await open('ensure-b');await a.asUser(race.uid);await b.asUser(race.uid)
 const replies=await Promise.all([success(a,"public.ensure_vat_periods('2026-03-15')"),success(b,"public.ensure_vat_periods('2026-03-15')")])
 assert.equal(replies.reduce((n,r)=>n+r.created_count,0),1)
 pass('concurrency: parallel explicit generation creates next annual period exactly once',replies)
 }
 assert.deepEqual(await retained(),before,'Preserve every pre-existing synthetic owner and row')
 pass('all pre-existing local fixtures preserved; no reset or role/server changes')
 fs.writeFileSync(new URL('complete.json',out),JSON.stringify({status:'PASS',checks:checks.length,owners,manifest,migrations:fingerprint,catalog:await catalog()},null,2))
}finally{for(const s of sessions)await s.close()}
