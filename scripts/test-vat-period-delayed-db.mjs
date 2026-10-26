// Real guarded local RPCs; bounded HTTP model of PostgREST 14's documented 40001 retries.
// No hosted calls. This is not a replacement PostgREST binary or a hosted acceptance test.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import {randomUUID} from 'node:crypto'
import {LocalSession,validateManifest,literal} from './kan62-local-db-guard.mjs'
assert.equal(process.env.SOLOLEDGER_KAN117_LOCAL,'implementation-and-tests')
const manifest=validateManifest(JSON.parse(fs.readFileSync('coverage/kan110111-local/result.json')).manifest)
const env={...process.env,SOLOLEDGER_KAN62_TEST_DB:manifest.database,SOLOLEDGER_KAN62_APPROVED_OPERATION:'concurrency',PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf'}
const out='coverage/kan117-delayed-local';fs.mkdirSync(out,{recursive:true})
const sessions=[],owners=[],checks=[]
const open=async name=>{const s=await new LocalSession(manifest,env,'kan117-p1-'+name).open();sessions.push(s);await s.run(`CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $a$ DECLARE r jsonb;BEGIN EXECUTE q INTO r;RETURN jsonb_build_object('ok',true,'value',r);EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM);END $a$;`);return s}
const one=async(s,q)=>(await s.run(q))[0],attempt=(s,q)=>one(s,`SELECT pg_temp.attempt(${literal('SELECT '+q)});`)
const observer=await open('observer')
const snapshot=async()=>{const tables=(await one(observer,`SELECT jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_object('schema',schemaname,'name',tablename,'owner',CASE WHEN tablename='profiles' OR (schemaname='auth' AND tablename='users') THEN 'id' WHEN EXISTS(SELECT 1 FROM information_schema.columns c WHERE c.table_schema=t.schemaname AND c.table_name=t.tablename AND c.column_name='user_id') THEN 'user_id' END)) FROM pg_tables t WHERE schemaname IN ('public','auth','storage')));`)).tables;const q=tables.map(t=>`SELECT ${literal(t.schema+'.'+t.name)} n,md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) h FROM ${t.schema}."${t.name}" x ${owners.length&&t.owner?`WHERE "${t.owner}" NOT IN (${owners.map(literal).join(',')})`:''}`);return one(observer,`SELECT jsonb_object_agg(n,h) FROM (${q.join(' UNION ALL ')}) a;`)}
const before=await snapshot()
let server
try{
 if(process.argv.includes('--install-fix'))await observer.run('BEGIN;'+fs.readFileSync('supabase/migrations/20261026230000_kan117_final_rejection_and_plan_revision.sql','utf8')+'COMMIT;')
 const uid=randomUUID();owners.push(uid);await observer.run(`INSERT INTO auth.users(id) VALUES(${literal(uid)});INSERT INTO profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from) VALUES(${literal(uid)},${literal('kan117-p1-'+uid+'@example.invalid')},'KAN117 P1 LOCAL synthetic','registered','quarter','2024-06-02') ON CONFLICT(id) DO UPDATE SET vat_status='registered',vat_period_type='quarter',vat_management_from='2024-06-02';INSERT INTO vat_periods(user_id,period_start,period_end,period_type,status,source) VALUES(${literal(uid)},'2024-06-02','2024-06-30','quarter','open','sololedger');INSERT INTO vat_periods(user_id,period_start,period_end,period_type,status,source) SELECT ${literal(uid)},d::date,(d+interval '3 months'-interval '1 day')::date,'quarter','open','sololedger' FROM generate_series(DATE '2025-01-01',DATE '2025-10-01',interval '3 months') d;`)
 const worker=await open('accepted-http');await worker.asUser(uid)
 const p=(await attempt(worker,'public.get_vat_period_creation_plan(2026)')).value;assert.equal(p.missing.length,4)
 const rows=()=>one(observer,`SELECT jsonb_build_object('periods',(SELECT jsonb_agg(to_jsonb(v) ORDER BY period_start) FROM vat_periods v WHERE user_id=${literal(uid)}),'journal',(SELECT count(*) FROM journal_entries WHERE user_id=${literal(uid)}),'transactions',(SELECT count(*) FROM transactions WHERE user_id=${literal(uid)}));`)
 const initial=await rows();assert.equal(initial.periods.length,5)
 await observer.run(`UPDATE profiles SET vat_period_type='year' WHERE id=${literal(uid)};`)
 let calls=0,retries=0,firstResolve,doneResolve;const first=new Promise(r=>firstResolve=r),done=new Promise(r=>doneResolve=r)
 server=http.createServer(async(req,res)=>{calls++;try{let r;for(let i=0;i<40;i++){r=await attempt(worker,`public.create_missing_vat_periods(2026,${literal(p.basis)})`);firstResolve(r);if(r.code!=='40001')break;retries++;await new Promise(resolve=>setTimeout(resolve,30))}if(!res.destroyed){res.writeHead(r.ok?200:409,{'Content-Type':'application/json'});res.end(JSON.stringify(r))}doneResolve(r)}catch(e){doneResolve({exception:e.message});res.destroy()}})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const controller=new AbortController(),request=fetch(`http://127.0.0.1:${server.address().port}`,{method:'POST',signal:controller.signal}).then(r=>r.json()).catch(()=>null)
 const rejection=await first;controller.abort();await request;assert.deepEqual(await rows(),initial)
 await observer.run(`UPDATE profiles SET vat_period_type='quarter' WHERE id=${literal(uid)};`)
 const outcome=await done,after=await rows();const evidence={httpRequests:calls,retries,first:rejection,outcome,before:initial.periods.length,after:after.periods.length,model:'bounded documented PostgREST14 retry; real local RPC and client disconnect',syntheticOnly:true};fs.writeFileSync(out+'/reproduction.json',JSON.stringify(evidence,null,2))
 assert.equal(after.periods.length,5,'Old HTTP invocation must terminate, not create four periods after profile restoration');assert.equal(retries,0);assert.equal(rejection.code,'23514');assert.deepEqual(after,initial);checks.push('one HTTP request, final business rejection, disconnect and restored profile cannot revive it')
 const replay=await attempt(worker,`public.create_missing_vat_periods(2026,${literal(p.basis)})`);assert.equal(replay.code,'23514');assert.deepEqual(await rows(),initial);checks.push('committed profile A->B->A invalidates original preview even when its values are restored')
 const fresh=(await attempt(worker,'public.get_vat_period_creation_plan(2026)')).value;assert.notEqual(fresh.basis,p.basis);assert.equal((await attempt(worker,`public.create_missing_vat_periods(2026,${literal(fresh.basis)})`)).value.created_count,4)
 const saved=await rows();assert.deepEqual(saved.periods.filter(v=>!v.period_start.startsWith('2026')),initial.periods);assert.equal((await attempt(worker,`public.create_missing_vat_periods(2026,${literal(fresh.basis)})`)).code,'23514');assert.deepEqual(await rows(),saved);checks.push('only fresh confirmed plan creates exact four dates; replay has no effect and old periods/journals unchanged')
 const oldEvidence=(await attempt(worker,'public.get_vat_period_creation_plan(2024)')).value
 const firstPeriod=saved.periods[0]
 await observer.run(`UPDATE vat_periods SET updated_at=clock_timestamp() WHERE id=${literal(firstPeriod.id)};UPDATE vat_periods SET updated_at=${literal(firstPeriod.updated_at)} WHERE id=${literal(firstPeriod.id)};`)
 assert.notEqual((await attempt(worker,'public.get_vat_period_creation_plan(2024)')).value.basis,oldEvidence.basis)
 assert.equal((await attempt(worker,`public.create_missing_vat_periods(2024,${literal(oldEvidence.basis)})`)).code,'23514');assert.deepEqual(await rows(),saved);checks.push('period evidence A->B->A also invalidates preview even with identical restored row values')
 const accepted=(await attempt(worker,'public.get_vat_period_creation_plan(2024)')).value
 await worker.run('BEGIN;');assert.equal((await attempt(worker,`public.create_missing_vat_periods(2024,${literal(accepted.basis)})`)).value.created_count,2)
 const probe=await open('lock-probe'),profileUpdate=observer.run(`UPDATE profiles SET vat_period_type='year' WHERE id=${literal(uid)};`)
 let blocked=false;for(let i=0;i<80;i++){blocked=(await one(probe,`SELECT jsonb_build_object('blocked',${worker.pid}=ANY(pg_blocking_pids(${observer.pid})));`)).blocked;if(blocked)break;await new Promise(r=>setTimeout(r,25))}
 assert(blocked,'An accepted valid confirmation must hold the profile lock until its commit');await worker.run('COMMIT;');await profileUpdate
 await observer.run(`UPDATE profiles SET vat_period_type='quarter' WHERE id=${literal(uid)};`)
 const committed=await rows();assert.equal(committed.periods.length,saved.periods.length+2);assert.deepEqual(committed.periods.filter(v=>saved.periods.some(p=>p.id===v.id)),saved.periods);assert.equal(committed.journal,0);assert.equal(committed.transactions,0);checks.push('accepted valid write holds profile lock; later profile change waits; exact committed result differs from a fresh unconfirmed call')
 assert.deepEqual(await snapshot(),before);checks.push('all pre-existing public/Auth/Storage fixtures preserved')
 fs.writeFileSync(out+'/result.json',JSON.stringify({status:'PASS',checks,syntheticOwners:owners.length,noHostedCalls:true},null,2));checks.forEach(c=>console.log('PASS '+c))
}finally{if(server)await new Promise(resolve=>server.close(resolve));for(const s of sessions)s.close()}
