// Synthetic LOCAL database only. Never accepts a URL or hosted target.
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { submitStandardBookingAttempt, StandardBookingSubmissionError } from '../src/lib/standardBookingAttempt.ts'
const db='sololedger_kan80_disposable_20261017'
if(process.env.SOLOLEDGER_KAN80_TEST_DB!==db||!process.env.PGPASSFILE)throw Error('Explicit disposable LOCAL database and passfile required')
const env={...process.env,PGSSLMODE:'disable',PGCLIENTENCODING:'UTF8',PGCONNECT_TIMEOUT:'5'}
for(const k of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','DATABASE_URL'])delete env[k]
const bin='C:/Program Files/PostgreSQL/17/bin/psql.exe'
const args=['-X','-w','-h','localhost','-p','5432','-U','postgres','-d',db,'-Atq','-v','ON_ERROR_STOP=1']
function raw(input){return spawnSync(bin,args,{env,input,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:20*1024*1024})}
function q(input){const r=raw(input);if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
const ident=JSON.parse(q("select json_build_object('db',current_database(),'host',host(inet_server_addr()))"))
assert.equal(ident.db,db);assert(['127.0.0.1','::1'].includes(ident.host))
const uid='00000000-0080-4000-8000-000000000001',other='00000000-0080-4000-8000-000000000002'
if(process.argv.includes('--reset-synthetic')) {
 assert.equal(q(`select count(*) from auth.users where id not in ('${uid}','${other}')`),'0','Only known disposable fixtures may be reset')
 q(`select delete_user_data_atomic(id) from profiles where id in ('${uid}','${other}'); DELETE FROM auth.users WHERE id IN ('${uid}','${other}');`)
}
assert.equal(q('select count(*) from auth.users'),'0','Tests require no pre-existing users')
assert.equal(q('BEGIN READ ONLY; SET LOCAL ROLE authenticated; SELECT get_standard_booking_protocol(); ROLLBACK;'),'1')
assert.equal(q("select not has_function_privilege('anon','book_periodized_transaction_atomic(jsonb)','EXECUTE') and not has_function_privilege('anon','get_standard_booking_protocol()','EXECUTE') and not has_table_privilege('service_role','standard_booking_idempotency','INSERT')"),'t')
const lit = value => "'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
const name = kind => kind==='ordinary'?'book_transaction_atomic':'book_periodized_transaction_atomic'
const identity = owner => `SET LOCAL request.jwt.claim.sub='${owner}'; SET LOCAL ROLE authenticated;`
const callSQL = (kind,payload) => `select ${name(kind)}(${lit(payload)});`
function call(kind,payload,owner=uid){return JSON.parse(q('BEGIN; '+identity(owner)+callSQL(kind,payload)+' COMMIT;'))}
const payload = (kind,overrides={}) => ({idempotency_key:randomUUID(),date:'2026-10-01',description:'KAN80 synthetic',amount:1250,type:'expense',vat_rate:25,input_vat_deduction_entitlement:'full',file_url:uid+'/synthetic.pdf',...(kind==='periodized'?{future_date:'2027-01-01'}:{}),...overrides})
const census=owner=>q(`select jsonb_build_object('transactions',(select jsonb_agg(to_jsonb(t) order by id) from transactions t where user_id='${owner}'),'journals',(select jsonb_agg(to_jsonb(j) order by id) from journal_entries j where user_id='${owner}'),'sequence',(select to_jsonb(s) from ver_nr_sequences s where user_id='${owner}'),'receipts',(select jsonb_agg(to_jsonb(r) order by idempotency_key) from standard_booking_idempotency r where user_id='${owner}'))`)
q(`INSERT INTO auth.users(id) VALUES('${uid}'),('${other}');
INSERT INTO profiles(id,email,vat_status,domestic_sales_vat_treatment,vat_period_type,vat_management_from,foreign_purchase_reporting,default_deduction_entitlement)
SELECT id,'kan80-'||id||'@example.invalid','registered','taxable','quarter','2026-01-01','required','full' FROM auth.users;
INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate)
SELECT x.id,u.id,x.id,x.debit,x.credit,25 FROM auth.users u CROSS JOIN (VALUES ('expense','5420','1930'),('sale','1930','3010')) x(id,debit,credit);`)
const checks=[]
function pass(label){checks.push(label);console.log('PASS '+label)}
// Compare all existing bookkeeping outputs with the inspected live pre-change definitions.
const live=JSON.parse(readFileSync(process.env.KAN80_LIVE_SCHEMA_EVIDENCE,'utf8'))
const current=JSON.parse(q("select json_agg(json_build_object('name',proname,'definition',pg_get_functiondef(p.oid))) from pg_proc p where p.pronamespace='public'::regnamespace and proname in ('book_transaction_atomic','book_periodized_transaction_atomic')"))
for(const f of current) {
 const old=live.functions.find(x=>x.name===f.name).definition.replaceAll('\r\n','\n')
 const next=f.definition.replaceAll('\r\n','\n')
 const marker="  IF p_payload->>'date' IS NULL"
 const before=old.slice(old.indexOf(marker),old.lastIndexOf('\nEND;')).trimEnd()
 const after=next.slice(next.indexOf(marker),next.indexOf('  INSERT INTO public.standard_booking_idempotency')).replace('  v_booking_result := jsonb_build_object(', '  RETURN jsonb_build_object(').trimEnd()
 assert.equal(after,before,'every existing bookkeeping validation/calculation/write unchanged: '+f.name)
}
pass('existing accounting function cores match inspected live definitions byte for byte')
function normalizedBooking(kind,p,old) {
 const fn=old?live.functions.find(f=>f.name===name(kind)).definition+';':''
 const sql=`BEGIN; ${fn} ${identity(uid)} ${callSQL(kind,p)} RESET ROLE;
SELECT jsonb_build_object(
 'transactions',(select jsonb_agg(jsonb_build_object('date',date,'description',description,'amount',amount,'type',type,'source',source,'vat_rate',vat_rate,'file_url',file_url,'is_periodized',is_periodized,'is_periodized_reversal',is_periodized_reversal,'periodized_future_date',periodized_future_date) order by date,description) from transactions where user_id='${uid}'),
 'journals',(select jsonb_agg(jsonb_build_object('date',date,'account',account_number,'debit',debit,'credit',credit,'description',description,'ver',ver_nr) order by date,ver_nr,account_number) from journal_entries where user_id='${uid}'));
${identity(uid)} SELECT jsonb_agg(to_jsonb(x) order by account_number) FROM get_period_account_balances('2026-01-01','2026-12-31') x;
SELECT jsonb_agg(to_jsonb(x) order by account_number) FROM get_cumulative_account_balances('2027-12-31') x;
SELECT get_ne_sales_summary(2026); ROLLBACK;`
 return q(sql).split(/\r?\n/).slice(1)
}
for(const kind of ['ordinary','periodized'])for(const rate of [0,6,12,25])for(const deduction of ['full','none']) {
 const p=payload(kind,{vat_rate:rate,input_vat_deduction_entitlement:deduction})
 assert.deepEqual(normalizedBooking(kind,p,false),normalizedBooking(kind,p,true),'old/new journals, balances, NE '+kind+rate+deduction)
}
for(const rate of [0,6,12,25]) {
 const p=payload('ordinary',{type:'sale',vat_rate:rate})
 assert.deepEqual(normalizedBooking('ordinary',p,false),normalizedBooking('ordinary',p,true))
}
pass('unchanged ordinary sale/purchase and periodized journals, VAT/balance/dashboard/SIE inputs and NE summary: 20 scenarios')
for(const kind of ['ordinary','periodized']) {
 const p=payload(kind),attempt={version:1,userId:uid,kind,payload:p}
 // Commit real DB work, then deliberately lose the transport result.
 let first
 await assert.rejects(submitStandardBookingAttempt(attempt,async()=>{first=call(kind,p);throw Error('simulated lost response after COMMIT')}),e=>e instanceof StandardBookingSubmissionError&&!e.confirmedRejection)
 assert.equal(first.success,true)
 const before=census(uid)
 const receipt=await submitStandardBookingAttempt(attempt,async()=>({data:call(kind,p),error:null}))
 assert.equal(receipt.idempotent_replay,true);assert.equal(receipt.transaction_id,first.transaction_id)
 assert.equal(census(uid),before,'replay changes no accounting row/VER/receipt')
 // All submitted fields, including attachment and NE facts, belong to exact underlay.
 for(const change of [{amount:1300},{description:'changed'},{file_url:uid+'/different.pdf'},{vat_rate:0},{date:'2026-10-02'},{type:'sale'},{input_vat_deduction_entitlement:'none'},{ne_sales_basis_confirmed:true},{future_date:'2028-01-01'}]) {
  const r=raw('BEGIN; '+identity(uid)+callSQL(kind,{...p,...change})+' COMMIT;')
  assert.notEqual(r.status,0);assert.match(r.stderr,/annat underlag/)
 }
 assert.equal(census(uid),before)
 const cross=raw('BEGIN; '+identity(uid)+callSQL(kind==='ordinary'?'periodized':'ordinary',p)+' COMMIT;')
 assert.notEqual(cross.status,0,'same key cannot switch RPC kind')
 q(`UPDATE accounts SET hidden_from_new_booking=true WHERE user_id='${uid}'; UPDATE profiles SET vat_status='not_registered',vat_period_type=null,vat_management_from=null,foreign_purchase_reporting='not_required',default_deduction_entitlement='none' WHERE id='${uid}'; INSERT INTO closed_years(user_id,year) VALUES('${uid}',2026),('${uid}',2027);`)
 const saved=call(kind,p);assert.equal(saved.transaction_id,first.transaction_id);assert.equal(saved.idempotent_replay,true)
 assert.equal(call(kind,{...p,idempotency_key:randomUUID()}).confirmed_rejection,true)
 q(`DELETE FROM closed_years WHERE user_id='${uid}'; UPDATE accounts SET hidden_from_new_booking=false WHERE user_id='${uid}'; UPDATE profiles SET vat_status='registered',vat_period_type='quarter',vat_management_from='2026-01-01',foreign_purchase_reporting='required',default_deduction_entitlement='full' WHERE id='${uid}';`)
 const distinct=call(kind,{...p,idempotency_key:randomUUID()});assert.notEqual(distinct.transaction_id,first.transaction_id)
 const otherResult=call(kind,{...p,file_url:other+'/synthetic.pdf'},other)
 assert.notEqual(otherResult.transaction_id,first.transaction_id)
 // Old app tabs lack a key and must not remain an unprotected write route.
 const {idempotency_key,...withoutKey}=p
 const noKey=raw('BEGIN; '+identity(uid)+callSQL(kind,withoutKey)+' COMMIT;');assert.notEqual(noKey.status,0);assert.match(noKey.stderr,/Bokningsnyckel/)
 const invalid=payload(kind,{amount:-1}),beforeFailed=census(uid)
 assert.equal(call(kind,invalid).confirmed_rejection,true);assert.equal(census(uid),beforeFailed)
 assert.equal(call(kind,{...invalid,amount:1250}).success,true,'real rejection may be corrected with same key')
 pass(kind+': commit/lost response/retry, payload conflict, changed gates, distinct intent, two owners, legacy route denied, validation rollback and correction')
}
// Fail inside actual journal writes, including late reversal creation.
q(`CREATE FUNCTION public.kan80_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.description LIKE '%failpoint%' AND NEW.account_number='5420' THEN RAISE EXCEPTION 'synthetic DB failpoint' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER kan80_test_fail BEFORE INSERT ON journal_entries FOR EACH ROW EXECUTE FUNCTION public.kan80_test_fail();`)
for(const kind of ['ordinary','periodized']) {
 const p=payload(kind,{description:'KAN80 failpoint'}),before=census(uid)
 assert.equal(call(kind,p).confirmed_rejection,true);assert.equal(census(uid),before,'all partial writes and VER roll back')
 q('ALTER TABLE journal_entries DISABLE TRIGGER kan80_test_fail;')
 assert.equal(call(kind,p).success,true)
 q('ALTER TABLE journal_entries ENABLE TRIGGER kan80_test_fail;')
}
q('DROP TRIGGER kan80_test_fail ON journal_entries; DROP FUNCTION public.kan80_test_fail();')
pass('real journal DB failures and retry; late periodized reversal failure rolls back original, reversal, VER and receipt')
function start(sql,app) {
 const child=spawn(bin,args,{env:{...env,PGAPPNAME:app},windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err=''
 child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d)
 const done=new Promise(resolve=>child.on('close',code=>resolve({code,out:out.trim(),err})))
 child.stdin.write(sql+'\n');return {child,done}
}
async function waitState(app,condition) {
 for(let n=0;n<100;n++) {if(q(`select count(*) from pg_stat_activity where application_name='${app}' and ${condition}`)==='1')return;await new Promise(r=>setTimeout(r,25))}
 throw Error('Expected concurrent state '+app)
}
for(const kind of ['ordinary','periodized']) {
 const p=payload(kind),holder=start('BEGIN; '+identity(uid)+callSQL(kind,p),'kan80-holder')
 await waitState('kan80-holder',"state='idle in transaction'")
 const waiter=start('BEGIN; '+identity(uid)+callSQL(kind,p)+' COMMIT;','kan80-waiter');waiter.child.stdin.end()
 await waitState('kan80-waiter',"wait_event_type='Lock'")
 holder.child.stdin.end('COMMIT;\n')
 const a=await holder.done,b=await waiter.done
 assert.equal(a.code,0,a.err);assert.equal(b.code,0,b.err)
 const first=JSON.parse(a.out),replay=JSON.parse(b.out)
 assert.equal(replay.transaction_id,first.transaction_id);assert.equal(replay.idempotent_replay,true)
 assert.equal(q(`select count(*) from standard_booking_idempotency where user_id='${uid}' and idempotency_key='${p.idempotency_key}'`),'1')
 pass(kind+': real concurrent identical sessions serialize and return one receipt')
}
for(const kind of ['ordinary','periodized']) {
 const p=payload(kind)
 const stale=start('BEGIN ISOLATION LEVEL REPEATABLE READ; '+identity(uid)+'SELECT count(*) FROM accounts;','kan80-stale-snapshot')
 await waitState('kan80-stale-snapshot',"state='idle in transaction'")
 const booked=call(kind,p),before=census(uid)
 stale.child.stdin.end(callSQL(kind,p)+' COMMIT;\n')
 const denied=await stale.done
 assert.notEqual(denied.code,0,'stale snapshot must never issue a confirmed-rejection envelope for a committed attempt')
 assert.equal(call(kind,p).transaction_id,booked.transaction_id)
 assert.equal(census(uid),before)
 pass(kind+': adversarial stale repeatable-read snapshot cannot misclassify a prior success as confirmed rejection')
}
const denied=q(`select jsonb_build_object('rls',(select relrowsecurity from pg_class where oid='standard_booking_idempotency'::regclass),'read',has_table_privilege('authenticated','standard_booking_idempotency','SELECT'),'write',has_table_privilege('authenticated','standard_booking_idempotency','INSERT'),'anon',has_function_privilege('anon','book_transaction_atomic(jsonb)','EXECUTE'))`)
assert.deepEqual(JSON.parse(denied),{rls:true,read:false,write:false,anon:false})
// Later corrections never turn exact replay into a fresh accounting event.
q(`UPDATE profiles SET vat_management_from='2025-01-01' WHERE id='${uid}';`)
const originalAttempts=['ordinary','periodized'].map(kind=>{const p=payload(kind,{date:'2025-10-01',...(kind==='periodized'?{future_date:'2026-01-01'}:{})});return {kind,p,result:call(kind,p)}})
for(const {kind,p,result} of originalAttempts) {
 const correction=JSON.parse(q('BEGIN; '+identity(uid)+`select create_correction_transaction_atomic('${result.transaction_id}'); COMMIT;`))
 assert.equal(correction.success,true)
 const before=census(uid);assert.equal(call(kind,p).transaction_id,result.transaction_id);assert.equal(census(uid),before)
}
q('BEGIN; '+identity(uid)+"select ensure_vat_periods('2026-12-31'); COMMIT;")
const vatId=q(`select id from vat_periods where user_id='${uid}' and period_start='2025-10-01' and source='sololedger'`)
assert.ok(vatId)
const closed=JSON.parse(q('BEGIN; '+identity(uid)+`select close_vat_period_atomic('${vatId}'); COMMIT;`))
assert.equal(closed.success,true)
for(const {kind,p,result} of originalAttempts) {
 const before=census(uid)
 assert.equal(call(kind,p).transaction_id,result.transaction_id)
 assert.equal(call(kind,{...p,idempotency_key:randomUUID()}).confirmed_rejection,true)
 assert.equal(census(uid),before)
}
pass('exact replay after real ordinary/periodized corrections and VAT close; fresh attempts remain blocked by closed VAT period')
const beforeOther=census(other),receipts=Number(q(`select count(*) from standard_booking_idempotency where user_id='${uid}'`))
const deletion=JSON.parse(q(`select delete_user_data_atomic('${uid}');`))
assert.equal(deletion.deleted.standard_booking_idempotency,receipts)
for(const table of ['standard_booking_idempotency','transactions','journal_entries','ne_sales_classifications','profiles']) assert.equal(q(`select count(*) from ${table} where ${table==='profiles'?'id':'user_id'}='${uid}'`),'0')
assert.equal(census(other),beforeOther,'deleting owner A preserves owner B')
q(`select delete_user_data_atomic('${other}'); DELETE FROM auth.users WHERE id IN ('${uid}','${other}');`)
assert.equal(q('select count(*) from auth.users'),'0')
pass('RLS/ACL, explicit atomic deletion counts/residuals, two-owner deletion isolation; synthetic fixtures removed')
mkdirSync('test-results/kan80',{recursive:true})
writeFileSync('test-results/kan80/db-result.json',JSON.stringify({result:'PASS',identity:ident,checks,fixtures:'synthetic only; removed'},null,2))
