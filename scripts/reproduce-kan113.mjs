// KAN-113 investigation only. Fixed Staging target; synthetic, rollback-only.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
assert.equal(process.env.SOLOLEDGER_KAN113_REPRO,'approved-synthetic-rollback')
const dir='docs/testing/kan113-analysis-20261026'
fs.mkdirSync(dir,{recursive:true})
const lit=s=>"'"+String(s).replaceAll("'","''")+"'"
const j=v=>lit(JSON.stringify(v))+'::jsonb'
const clauses=[],expect=[]
const emit=(label,q)=>clauses.push(`SELECT jsonb_build_object('case',${lit(label)},'result',pg_temp.attempt(${lit(q)}));`)
const call=(label,q,kind)=>{emit(label,'SELECT '+q);expect.push({label,kind})}
const catalog=fs.readFileSync(dir+'/staging-catalog.jsonl','utf8').split(/\r?\n/).filter(l=>l.startsWith('{')).map(JSON.parse)
const hashes=catalog.filter(x=>['close_year_atomic','close_year_unchecked_inventory','assert_vat_year_coverage'].includes(x.function)).map(x=>[x.function,createHash('md5').update(x.definition.replaceAll('\r','')).digest('hex')])
const sql=[`\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='25s'; SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR session_user<>'postgres' OR current_setting('session_authorization')<>'postgres' THEN RAISE EXCEPTION 'Wrong identity'; END IF;
END $guard$;
SELECT jsonb_build_object('identity',jsonb_build_object('database',current_database(),'user',session_user,'pid',pg_backend_pid(),'utc',clock_timestamp(),'stockholm',clock_timestamp() AT TIME ZONE 'Europe/Stockholm'));
SELECT pg_backend_pid() AS verified_pid \\gset
CREATE FUNCTION pg_temp.attempt(q text) RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE r jsonb; BEGIN EXECUTE q INTO r; RETURN jsonb_build_object('ok',true,'value',r); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $fn$;
CREATE FUNCTION pg_temp.digest_public() RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE r record; d text; v jsonb:='{}'; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
 EXECUTE format('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,%L)) FROM public.%I t','',r.tablename) INTO d;
 v:=v||jsonb_build_object(r.tablename,d); END LOOP; RETURN v; END $fn$;
SELECT jsonb_build_object('before',pg_temp.digest_public(),'auth_count',(SELECT count(*) FROM auth.users));
DO $hash$ BEGIN
 ${hashes.map(([n,h])=>`IF (SELECT md5(replace(pg_get_functiondef(oid),E'\\r','')) FROM pg_proc WHERE oid=${lit('public.'+n+'(integer)')}::regprocedure)<>${lit(h)} THEN RAISE EXCEPTION 'Definition changed'; END IF;`).join('\n')}
END $hash$;
SAVEPOINT synthetic;`]
const currentYear=Number(new Intl.DateTimeFormat('en',{timeZone:'Europe/Stockholm',year:'numeric'}).format(new Date()))
const ids=[]
for(const registered of [false,true]) for(const year of [currentYear-1,currentYear,currentYear+1]){
 const uid=randomUUID();ids.push(uid);const label=`${registered?'vat':'no-vat'}-${year}`
 clauses.push(`RESET ROLE; INSERT INTO auth.users(id) VALUES(${lit(uid)});
 INSERT INTO public.profiles(id,email,company_name,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,default_deduction_entitlement)
 VALUES(${lit(uid)},${lit('kan113-'+uid+'@example.invalid')},'KAN113 rollback synthetic',${lit(registered?'registered':'not_registered')},${registered?"'year'":'NULL'},${registered?lit(year+'-01-01'):'NULL'},'taxable','full') ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,company_name=EXCLUDED.company_name,vat_status=EXCLUDED.vat_status,vat_period_type=EXCLUDED.vat_period_type,vat_management_from=EXCLUDED.vat_management_from,domestic_sales_vat_treatment=EXCLUDED.domestic_sales_vat_treatment,default_deduction_entitlement=EXCLUDED.default_deduction_entitlement;
 INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan113-sale',${lit(uid)},'KAN113 synthetic','1930','3010',0);
 INSERT INTO public.company_payment_account_roles(user_id,role,account_number) VALUES(${lit(uid)},'business_payment_account','1930');
 SET LOCAL ROLE authenticated;
 SELECT set_config('request.jwt.claim.sub',${lit(uid)},true),set_config('request.jwt.claims',${j({sub:uid,role:'authenticated'})}::text,true);`)
 const book=()=>`public.book_transaction_atomic(${j({idempotency_key:randomUUID(),date:year+'-01-02',description:'KAN113 rollback synthetic',type:'kan113-sale',amount:100,vat_rate:0,ne_sales_basis:'taxable',ne_sales_basis_confirmed:true})})`
 clauses.push('SAVEPOINT booking_probe;')
 call(label+'-book',book(),'success')
 clauses.push('ROLLBACK TO SAVEPOINT booking_probe;')
 if(registered){
  call(label+'-missing-period',`public.close_year_atomic(${year})`,'missing')
  clauses.push('SAVEPOINT ensure_probe;')
  call(label+'-ensure',`public.ensure_vat_periods('${year}-12-31')`,'success')
  clauses.push(`ROLLBACK TO SAVEPOINT ensure_probe; RESET ROLE;
   INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type,status,source) VALUES(${lit(uid)},'${year}-01-01','${year}-12-31','year','open','sololedger'); SET LOCAL ROLE authenticated;`)
  call(label+'-open-period',`public.close_year_atomic(${year})`,'open')
  clauses.push('SAVEPOINT close_period_probe;')
  call(label+'-close-period',`public.close_vat_period_atomic((SELECT id FROM public.vat_periods WHERE user_id=${lit(uid)} AND period_start='${year}-01-01'))`,year<currentYear?'success':'future-vat')
  clauses.push(`ROLLBACK TO SAVEPOINT close_period_probe; RESET ROLE;
   UPDATE public.vat_periods SET status='closed',closing_amount=0 WHERE user_id=${lit(uid)}; SET LOCAL ROLE authenticated;`)
 }
 call(label+'-lock',`public.close_year_atomic(${year})`,'success')
 call(label+'-relock',`public.close_year_atomic(${year})`,'locked')
 call(label+'-post-lock-book',book(),'locked-receipt')
 call(label+'-state',`jsonb_build_object('locks',(SELECT jsonb_agg(year) FROM public.closed_years WHERE user_id=${lit(uid)}),'transactions',(SELECT count(*) FROM public.transactions WHERE user_id=${lit(uid)}),'debit',(SELECT sum(debit) FROM public.journal_entries WHERE user_id=${lit(uid)}),'credit',(SELECT sum(credit) FROM public.journal_entries WHERE user_id=${lit(uid)}))`,'state')
}
sql.push(...clauses,`RESET ROLE;
SELECT jsonb_build_object('same_session',pg_backend_pid()=:verified_pid);
ROLLBACK TO SAVEPOINT synthetic;
SELECT jsonb_build_object('after',pg_temp.digest_public(),'auth_count',(SELECT count(*) FROM auth.users));
SELECT jsonb_build_object('residual_auth',(SELECT count(*) FROM auth.users WHERE id IN (${ids.map(lit).join(',')})),'residual_profiles',(SELECT count(*) FROM public.profiles WHERE id IN (${ids.map(lit).join(',')})),'same_session_after',pg_backend_pid()=:verified_pid);
ROLLBACK;`)
fs.writeFileSync(dir+'/reproduction.sql',sql.join('\n'))
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','COMSPEC'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]))
Object.assign(env,{PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass_staging_supabase.conf',PGSSLMODE:'require',PGCONNECT_TIMEOUT:'8',PGCLIENTENCODING:'UTF8'})
const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-v','ON_ERROR_STOP=1','-h','aws-1-eu-central-1.pooler.supabase.com','-p','5432','-U','postgres.fzxqiqenqjzhlyxxpvhg','-d','postgres','-At','-f',dir+'/reproduction.sql'],{env,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024})
fs.writeFileSync(dir+'/reproduction.log',r.stdout??'');fs.writeFileSync(dir+'/reproduction-errors.log',r.stderr??'')
assert.equal(r.status,0,r.stderr||r.error?.message)
const rows=r.stdout.split(/\r?\n/).filter(l=>l.startsWith('{')).map(JSON.parse)
const before=rows.find(x=>x.before),after=rows.find(x=>x.after)
assert.deepEqual(after.after,before.before,'Public data changed')
assert.equal(after.auth_count,before.auth_count)
assert(rows.find(x=>x.same_session===true));assert(rows.find(x=>x.residual_auth===0&&x.residual_profiles===0&&x.same_session_after===true))
for(const e of expect){const result=rows.find(x=>x.case===e.label)?.result;assert(result,e.label)
 if(e.kind==='success')assert(result.ok&&result.value?.success!==false,e.label+JSON.stringify(result))
 else if(e.kind==='state'){assert.equal(result.value.locks.length,1);assert.equal(result.value.debit,result.value.credit)}
 else if(e.kind==='locked-receipt')assert(!result.ok?/låst/.test(result.message):result.value.confirmed_rejection&&/låst/.test(result.value.message),e.label+JSON.stringify(result))
 else {assert.equal(result.ok,false,e.label);assert.match(result.message,{missing:/saknas/,open:/öppen/,locked:/redan låst/,'future-vat':/Framtida momsperioder/}[e.kind])}
}
fs.writeFileSync(dir+'/result.json',JSON.stringify({target:'fzxqiqenqjzhlyxxpvhg',currentYear,identity:rows.find(x=>x.identity),hashes,checks:expect.length,publicTablesUnchanged:Object.keys(before.before).length,authCountUnchanged:true,rollbackVerified:true,results:rows.filter(x=>x.case)},null,2))
console.log(JSON.stringify({checks:expect.length,rollbackVerified:true,publicTablesUnchanged:Object.keys(before.before).length,lockedYears:[currentYear-1,currentYear,currentYear+1],registeredAndUnregistered:true}))
