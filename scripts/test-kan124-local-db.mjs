// KAN-124: fixed, identified local PostgreSQL only. Ordinary cases roll back.
// Concurrency uses fresh committed synthetic cohorts, retained as evidence.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {query,guard,auth,literal as q,json,Session,database,marker} from './kan122-local-db.mjs'
assert.equal(process.env.SOLOLEDGER_KAN124_LOCAL_GO,'implementation-and-verification')
const migration='20261031204304_kan124_generic_vat_correction_guard.sql'
const run=path.resolve('coverage/kan124-local-20261031',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID())
fs.mkdirSync(run,{recursive:true})
const save=(name,value)=>fs.writeFileSync(path.join(run,name+'.json'),JSON.stringify(value,null,2)+'\n')
const checks=[],cohort=[]
const attempt=`CREATE FUNCTION pg_temp.attempt(command text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $try$
 DECLARE r jsonb;details text;BEGIN EXECUTE command INTO r;RETURN jsonb_build_object('ok',true,'value',r);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS details=PG_EXCEPTION_DETAIL;RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM,'details',details);END $try$;`
const call=expression=>`SELECT pg_temp.attempt(${q('SELECT '+expression)});`
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));assert.notEqual(r.value?.success,false);return r.value}
const denied=(r,detail)=>{assert.equal(r.ok,false,JSON.stringify(r));if(detail)assert.match(r.details||r.message||'',detail);return r}
const tables=query("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';")[0]
const columns=query("SELECT jsonb_object_agg(table_name,cols) FROM (SELECT table_name,jsonb_agg(column_name) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name)c;")[0]
const digest=(exclude=[])=>"SELECT jsonb_build_object("+tables.map(t=>{
 const col=columns[t].includes('user_id')?'user_id':t==='profiles'?'id':null
 return q(t)+",(SELECT jsonb_build_object('n',count(*),'hash',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,''))) FROM public.\""+t+'\" x'+(col&&exclude.length?' WHERE '+col+' NOT IN ('+exclude.map(q).join(',')+')':'')+')'
}).join(',')+",'auth_identity',(SELECT md5(coalesce(jsonb_agg(jsonb_build_array(id,email,raw_user_meta_data) ORDER BY id)::text,'')) FROM auth.users"+(exclude.length?' WHERE id NOT IN ('+exclude.map(q).join(',')+')':'')+'));'
const functions="SELECT jsonb_agg(jsonb_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'hash',md5(replace(pg_get_functiondef(p.oid),chr(13),'')),'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f';"
const contracts="SELECT jsonb_build_object('policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY indexname) FROM pg_indexes i WHERE schemaname='public'));"
const before=query(digest()+functions+contracts);save('before',before)
const now=query("SELECT jsonb_build_object('today',current_date,'monthStart',date_trunc('month',current_date)::date,'monthEnd',(date_trunc('month',current_date)+interval '1 month -1 day')::date,'overlapStart',(date_trunc('month',current_date)-interval '1 day')::date,'quarterStart',date_trunc('quarter',current_date)::date,'quarterEnd',(date_trunc('quarter',current_date)+interval '3 months -1 day')::date,'helper',to_regprocedure('public.assert_generic_correction_vat_open(uuid,uuid[],date[])') IS NOT NULL);")[0]
assert(now.today>='2026-07-15','Historical April/Q2 fixtures must be in the past; never change server clock');assert(now.helper)
save('calendar',{...now,currentStatusFixtures:now.today<now.monthEnd?'unfinished current periods: real early-close rejection plus rollback-only state fixture':'normal close/declaration RPCs'})
const candidate=fs.readFileSync('supabase/migrations/'+migration,'utf8').replaceAll('\r','')
const installedBodies=query("SELECT jsonb_object_agg(proname,prosrc) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('create_correction_transaction_atomic','assert_generic_correction_vat_open');")[0]
for(const [name,tag] of [['create_correction_transaction_atomic','function'],['assert_generic_correction_vat_open','guard']]){
 const part=candidate.slice(candidate.indexOf('CREATE OR REPLACE FUNCTION public.'+name+'('))
 const delimiter='$'+tag+'$',start=part.indexOf(delimiter)+delimiter.length,end=part.indexOf(delimiter,start)
 assert.equal(installedBodies[name].replaceAll('\r',''),part.slice(start,end),'Installed function must match candidate: '+name)
}
const old='2026-04-15',current=now.today,currentStart=now.monthStart,currentEnd=now.monthEnd,currentYear=Number(current.slice(0,4)),oldStart='2026-04-01',oldEnd='2026-04-30'
const seed=u=>`RESET ROLE;${guard}DO $fresh$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id=${q(u)}) THEN RAISE EXCEPTION 'Synthetic collision';END IF;END $fresh$;
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${q(u)},${q('kan124-'+u+'@example.invalid')},'{"purpose":"KAN124 synthetic only"}');
 INSERT INTO profiles(id,email,company_name,vat_status,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement,vat_management_from,vat_period_type)
 VALUES(${q(u)},${q('kan124-'+u+'@example.invalid')},'KAN124 synthetic only','registered','taxable','not_required','full','2025-01-01','month') ON CONFLICT(id) DO UPDATE SET company_name=EXCLUDED.company_name,vat_status=EXCLUDED.vat_status,domestic_sales_vat_treatment=EXCLUDED.domestic_sales_vat_treatment,default_deduction_entitlement=EXCLUDED.default_deduction_entitlement,vat_management_from=EXCLUDED.vat_management_from,vat_period_type=EXCLUDED.vat_period_type;
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan124-capital',${q(u)},'KAN124 capital','1930','2018',0),('kan124-cost',${q(u)},'KAN124 expense','6110','1930',25),('kan124-sale',${q(u)},'KAN124 sale','1930','3010',25);
 INSERT INTO company_payment_account_roles(user_id,role,account_number) VALUES(${q(u)},'business_payment_account','1930');${auth(u)}`
const period=(u,start=oldStart,end=oldEnd,source='sololedger',type='month')=>`RESET ROLE;INSERT INTO vat_periods(user_id,period_start,period_end,period_type,source) VALUES(${q(u)},${q(start)},${q(end)},${q(type)},${q(source)});${auth(u)}`
const periods=u=>period(u)+period(u,currentStart,currentEnd)
const pid=(start=oldStart)=>`(SELECT id FROM vat_periods WHERE user_id=auth.uid() AND period_start=${q(start)})`
// Completed periods use real lifecycle RPCs. An unfinished current period cannot
// legitimately be closed/declared yet. First prove real early close rejects with
// no accounting/sequence/state changes, then use a rollback-only synthetic STATE
// fixture to test the correction guard. No fake filing date or clock override.
const setStatus=(status,start=oldStart,date='2026-05-15')=>status==='open'?'':`DO $status$ DECLARE p public.vat_periods%ROWTYPE;prior jsonb;after_attempt jsonb;BEGIN
 SELECT * INTO STRICT p FROM public.vat_periods WHERE id=${pid(start)};
 IF p.period_end>current_date THEN
  SELECT jsonb_build_array(to_jsonb(p),(SELECT count(*) FROM transactions WHERE user_id=auth.uid()),(SELECT count(*) FROM journal_entries WHERE user_id=auth.uid()),(SELECT last_ver_nr FROM ver_nr_sequences WHERE user_id=auth.uid())) INTO prior;
  BEGIN PERFORM public.close_vat_period_atomic(p.id);RAISE EXCEPTION 'Premature close unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN IF SQLERRM<>'Framtida momsperioder kan inte stängas.' THEN RAISE;END IF;END;
  SELECT jsonb_build_array(to_jsonb(vp),(SELECT count(*) FROM transactions WHERE user_id=auth.uid()),(SELECT count(*) FROM journal_entries WHERE user_id=auth.uid()),(SELECT last_ver_nr FROM ver_nr_sequences WHERE user_id=auth.uid())) INTO after_attempt FROM public.vat_periods vp WHERE vp.id=p.id;
  IF prior IS DISTINCT FROM after_attempt THEN RAISE EXCEPTION 'Premature close mutated accounting or period state';END IF;
  EXECUTE 'RESET ROLE';
  UPDATE public.vat_periods SET status=${q(status)},closing_amount=0,declared_at=${status==='declared'?'clock_timestamp()':'NULL'},skv_submitted_on=NULL WHERE id=p.id AND user_id=auth.uid();
  EXECUTE 'SET LOCAL ROLE authenticated';
 ELSE
  PERFORM public.close_vat_period_atomic(p.id);
  ${status==='declared'?`PERFORM public.declare_vat_period_atomic(p.id,${q(date)});`:''}
 END IF;END $status$;`
const payload=(date=old,type='kan124-cost',vat=25)=>({idempotency_key:randomUUID(),date,type,vat_rate:vat,amount:type==='kan124-capital'?5000:1250,description:'KAN124 synthetic only'})
const book=p=>'public.book_transaction_atomic('+json(p)+')'
const cost=(u,date=old,vat=25,extra={})=>`DO $book$ BEGIN PERFORM ${book(payload(date,'kan124-capital',0))};PERFORM ${book({...payload(date,'kan124-cost',vat),...extra})};END $book$;`
const original="(SELECT t.id FROM transactions t WHERE t.user_id=auth.uid() AND t.type='kan124-cost' AND NOT coalesce(t.is_correction,false) ORDER BY id LIMIT 1)"
const correct=id=>'public.create_correction_transaction_atomic('+id+')'
const raw=(u,date,entries,{id=randomUUID(),parentDate=date,isCorrection=false,corrects=null}={})=>`RESET ROLE;DO $fixture$ DECLARE n integer;BEGIN n:=public.get_next_ver_nr(${q(u)});
 INSERT INTO transactions(id,user_id,date,description,amount,type,vat_rate,booked,is_correction,corrects_ver_nr) VALUES(${q(id)},${q(u)},${q(parentDate)},'KAN124 synthetic journal fixture',1250,'kan124-cost',0,true,${isCorrection},${corrects??'NULL'});
 INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES ${entries.map(([a,d,c,day=date])=>'('+[q(id),q(u),'n',day===null?'NULL':q(day),q(a),d,c].join(',')+')').join(',')};END $fixture$;${auth(u)}`
const state=u=>`RESET ROLE;SELECT jsonb_build_object(`+tables.filter(t=>columns[t].includes('user_id')||t==='profiles').map(t=>q(t)+",(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM public.\""+t+'\" x WHERE '+(t==='profiles'?'id':'user_id')+'='+q(u)+')').join(',')+`);${auth(u)}`
const rows=u=>`RESET ROLE;SELECT jsonb_build_object('userId',${q(u)},'transactions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'date',date,'source',source)),'[]') FROM transactions WHERE user_id=${q(u)}),'journalRows',(SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'transaction_id',transaction_id,'date',date,'account_number',account_number,'debit',debit,'credit',credit)),'[]') FROM journal_entries WHERE user_id=${q(u)}),'vatPeriods',(SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]') FROM vat_periods v WHERE user_id=${q(u)}),'vatV2Snapshots','[]'::jsonb);${auth(u)}`
function test(id,name,body,verify){const r=query('BEGIN;'+attempt+body+'ROLLBACK;');verify(r);checks.push({id,name,status:'PASS'});save(id+'-'+checks.length,{id,name,status:'PASS',results:r});console.log('PASS '+id+' '+name);return r}
const atomic=(id,name,setup,u,detail,idSql=original)=>test(id,name,setup+state(u)+call(correct(idSql))+state(u),r=>{denied(r[1],detail);assert.deepEqual(r[2],r[0])})
const u=randomUUID(),v=randomUUID();
test('A01','same open period',seed(u)+period(u,currentStart,currentEnd)+cost(u,current)+call(correct(original)),r=>ok(r[0]))
test('A02','later open period retains current date',seed(u)+periods(u)+cost(u)+call(correct(original))+`SELECT jsonb_build_object('date',(SELECT date FROM transactions WHERE user_id=auth.uid() AND is_correction));`,r=>{ok(r[0]);assert.equal(r[1].date,current)})
for(const status of ['closed','declared'])for(const same of [false,true]){const d=same?current:old,start=same?currentStart:oldStart;atomic(status==='closed'?'A03':'A04',status+(same?' same':' later'),seed(u)+(same?period(u,start,currentEnd):periods(u))+cost(u,d)+setStatus(status,start,same?current:'2026-05-15'),u,new RegExp(status==='closed'?'KAN124_ORIGIN_CLOSED':'KAN124_ORIGIN_DECLARED'))}
for(const rate of [6,12])atomic('A03','input VAT rate '+rate,seed(u)+periods(u)+cost(u,old,rate)+setStatus('closed'),u,/KAN124_ORIGIN_CLOSED/)
for(const rate of [6,12,25])atomic('A04','output VAT rate '+rate,seed(u)+periods(u)+`DO $sale$ BEGIN PERFORM ${book(payload(old,'kan124-sale',rate))};END $sale$;`+setStatus('declared'),u,/KAN124_ORIGIN_DECLARED/,"(SELECT id FROM transactions WHERE user_id=auth.uid() AND type='kan124-sale' AND NOT coalesce(is_correction,false))")
for(const status of ['open','closed','declared'])test('A05','non-VAT '+status,seed(u)+periods(u)+cost(u,old,0)+setStatus(status)+call(correct(original)),r=>ok(r[0]))
for(const status of ['closed','declared'])for(const a of ['2641','2642'])atomic('A06','target '+status+' '+a,seed(u)+periods(u)+raw(u,old,[['6110',1000,0],[a,250,0],['1930',0,1250]])+setStatus(status,currentStart,current),u,/KAN124_TARGET_CLOSED/)
atomic('A07','journal over changed profile/rate',seed(u)+periods(u)+cost(u)+setStatus('declared')+`RESET ROLE;UPDATE profiles SET vat_status='not_registered',vat_period_type=NULL,vat_management_from=NULL,domestic_sales_vat_treatment='small_business_exempt',foreign_purchase_reporting='not_required',default_deduction_entitlement='none' WHERE id=${q(u)};UPDATE transactions SET vat_rate=0 WHERE user_id=${q(u)};${auth(u)}`,u,/KAN124_ORIGIN_DECLARED/)
test('A08','25 percent metadata without deduction',seed(u)+periods(u)+cost(u,old,25,{input_vat_deduction_entitlement:'none'})+setStatus('declared')+call(correct(original)),r=>ok(r[0]))
// Existing VAT-close intentionally requires manual review for activity whose
// participating account balances are all zero. Do not change/bypass that rule.
test('A08','zero VAT contribution across days in one open period',seed(u)+periods(u)+raw(u,old,[['6110',1250,0],['1930',0,1250],['2641',250,0,'2026-04-15'],['2641',0,250,'2026-04-16']])+call(correct(original)),r=>ok(r[0]))
atomic('A09','net VAT zero but different return fields',seed(u)+periods(u)+raw(u,old,[['2641',250,0],['2611',0,250]])+setStatus('declared'),u,/KAN124_ORIGIN_DECLARED/)
atomic('A10','mixed VAT and settlement underlay is not guessed',seed(u)+periods(u)+raw(u,old,[['6110',1000,0],['2641',250,0],['1930',0,1250],['2650',100,0],['1630',0,100]]),u,/KAN124_REVIEW/)
test('A05','settlement-only is not classified as VAT return amount',seed(u)+periods(u)+raw(u,old,[['2650',250,0],['1930',0,250]])+call(correct(original)),r=>ok(r[0]))
for(const kind of ['missing','overlap','imported','target_missing','target_overlap','target_imported']){
 let setup=seed(u)+cost(u);if(!kind.startsWith('target_'))setup+=period(u,currentStart,currentEnd);else setup+=period(u);
 if(kind==='overlap')setup+=period(u)+period(u,'2026-04-02',oldEnd);if(kind==='imported')setup+=period(u,oldStart,oldEnd,'imported_history');
 if(kind==='target_overlap')setup+=period(u,currentStart,currentEnd)+period(u,now.overlapStart,currentEnd);if(kind==='target_imported')setup+=period(u,currentStart,currentEnd,'imported_history');
 atomic('A10',kind,setup,u,/KAN124_.*REVIEW/)
}
test('A11','different journal/parent days in same period',seed(u)+periods(u)+raw(u,old,[['6110',1000,0],['2641',250,0],['1930',0,1250]],{parentDate:'2026-04-16'})+call(correct(original)),r=>ok(r[0]))
atomic('A12','different parent/journal periods',seed(u)+periods(u)+raw(u,old,[['6110',1000,0],['2641',250,0],['1930',0,1250]],{parentDate:'2026-03-15'}),u,/KAN124_REVIEW/)
// Historical NULL fixture: hold table DDL lock, disable only KAN122 INSERT guard,
// insert the dedicated synthetic row, re-enable BEFORE calling the RPC. Rollback
// restores the entire fixture/DDL. Never change deployed accounting rules.
atomic('A12','historical NULL VAT date fixture',seed(u)+periods(u)+`RESET ROLE;ALTER TABLE journal_entries DISABLE TRIGGER accounting_closed_year_journal;`+raw(u,old,[['6110',1000,0],['2641',250,0,null],['1930',0,1250]])+`RESET ROLE;ALTER TABLE journal_entries ENABLE TRIGGER accounting_closed_year_journal;${auth(u)}`,u,/KAN124_REVIEW/)
const periodized=(vat=25)=>'public.book_periodized_transaction_atomic('+json({...payload('2025-12-20'),vat_rate:vat,future_date:'2026-01-01'})+')'
for(const vat of [25,0])test('A13','periodization package '+vat,seed(u)+period(u,'2025-12-01','2025-12-31')+period(u,'2026-01-01','2026-01-31')+period(u,currentStart,currentEnd)+`DO $p$ BEGIN PERFORM ${periodized(vat)};END $p$;`+setStatus('declared','2025-12-01','2026-01-15')+state(u)+call(correct("(SELECT id FROM transactions WHERE user_id=auth.uid() AND is_periodized AND NOT is_periodized_reversal)"))+state(u),r=>{if(vat){denied(r[1],/KAN124_ORIGIN_DECLARED/);assert.deepEqual(r[2],r[0])}else{ok(r[1]);assert.equal(r[2].transactions.length,r[0].transactions.length+2)}})
for(const vat of [0,25])test('A14','old locked year '+vat,seed(u)+period(u,'2025-04-01','2025-04-30')+period(u,currentStart,currentEnd)+cost(u,'2025-04-15',vat)+setStatus('declared','2025-04-01','2025-05-15')+`RESET ROLE;INSERT INTO closed_years(user_id,year) VALUES(${q(u)},2025);${auth(u)}`+state(u)+call(correct(original))+state(u),r=>{if(vat){denied(r[1],/KAN124_ORIGIN_DECLARED/);assert.deepEqual(r[2],r[0])}else ok(r[1])})
atomic('A15','KAN122 later locked boundary',seed(u)+cost(u,old,0)+`RESET ROLE;INSERT INTO closed_years(user_id,year) VALUES(${q(u)},${currentYear});${auth(u)}`,u,/årslås|låst|skyddas/)
const invoice=(year,vat)=>({invoice_number:'KAN124-'+randomUUID(),customer_name:'KAN124 synthetic customer',invoice_date:year+'-04-01',service_date:year+'-04-01',due_date:year+'-04-30',gross_amount:1250,vat_treatment:vat?'taxable':'exempt',vat_rate:vat,attachment_url:u+'/kan124-synthetic.pdf'})
const invoiceId='(SELECT id FROM customer_invoices WHERE user_id=auth.uid())'
const settleKey=randomUUID()
test('A16','older receivable paid in open year without new VAT; exact replay',seed(u)+period(u,'2025-12-01','2025-12-31')+period(u,currentStart,currentEnd)+`DO $invoice$ BEGIN PERFORM public.create_customer_invoice_atomic(${json({...invoice(2025,25),invoice_date:'2025-12-01',service_date:'2025-12-01',due_date:'2025-12-31'})});PERFORM public.book_customer_invoice_year_end_receivable_atomic(${invoiceId},2025,${q(randomUUID())});END $invoice$;`+setStatus('declared','2025-12-01','2026-01-15')+`RESET ROLE;INSERT INTO closed_years(user_id,year) VALUES(${q(u)},2025);${auth(u)}`+rows(u)+call(`public.settle_customer_invoice_receivable_atomic(${invoiceId},'2026-01-20',${q(settleKey)})`)+rows(u)+call(`public.settle_customer_invoice_receivable_atomic(${invoiceId},'2026-01-20',${q(settleKey)})`),r=>{const paid=ok(r[1]),replay=ok(r[3]);assert.equal(replay.idempotent_replay,true);assert.equal(replay.transaction_id,paid.transaction_id);assert.deepEqual(r[2].journalRows.filter(j=>j.date<'2026-01-01'),r[0].journalRows.filter(j=>j.date<'2026-01-01'));assert.deepEqual(r[2].vatPeriods,r[0].vatPeriods);assert.deepEqual([...new Set(r[2].journalRows.filter(j=>j.date==='2026-01-20').map(j=>j.account_number))].sort(),['1510','1930'])})
for(const vat of [0,25])for(const status of ['open','declared']){
 const undoKey=randomUUID()
 const setup=seed(u)+periods(u)+`DO $invoice$ BEGIN PERFORM public.create_customer_invoice_atomic(${json(invoice(2026,vat))});PERFORM public.record_customer_invoice_payment_atomic(${invoiceId},'2026-04-15',${q(randomUUID())});END $invoice$;`+setStatus(status)
 test('A19','invoice payment undo VAT '+vat+' origin '+status,setup+state(u)+call(`public.undo_customer_invoice_payment_atomic(${invoiceId},${q(undoKey)})`)+state(u)+(vat&&status==='declared'?'':call(`public.undo_customer_invoice_payment_atomic(${invoiceId},${q(undoKey)})`)),r=>{if(vat&&status==='declared'){denied(r[1],/Momsperioden för betalningen/);assert.deepEqual(r[2],r[0])}else{ok(r[1]);assert.equal(ok(r[3]).idempotent_replay,true)}})
}
// Supplier debt/payment is additionally covered by unchanged KAN122 regression.
checks.push({id:'A17',name:'general credit-note/refund self-service',status:'BLOCKED',reason:'No complete supported general credit-note workflow exists. KAN103/alternative B are out of scope; do not invent a booking path.'})
console.log('BLOCKED A17 general credit-note workflow absent; no accounting expansion')
test('A18','no source/credit exception parameters or direct writes',seed(u)+periods(u)+cost(u)+setStatus('declared')+state(u)+call(correct(original))+'SELECT pg_temp.attempt('+q("SELECT public.create_correction_transaction_atomic("+original+",true)")+');'+`SELECT pg_temp.attempt(${q("INSERT INTO transactions(user_id,date,amount,description,source,is_correction) VALUES(auth.uid(),current_date,1250,'synthetic forbidden','manual',true) RETURNING '{}'::jsonb")});`+state(u),r=>{denied(r[1],/KAN124_ORIGIN_DECLARED/);assert.equal(denied(r[2]).code,'42883');assert.equal(denied(r[3]).code,'42501');assert.deepEqual(r[4],r[0])})
// Reuse the KAN71 assertions, not its obsolete direct-import fixture API or
// installer. This approved local target has a stricter identity guard above.
// Source-tagged raw journals isolate correction/lineage tests; the real current
// receipt-based import/undo path is separately covered by KAN122 regression.
const legacySeed=`CREATE FUNCTION pg_temp.seed(u uuid,d date,vat_d date,kind text) RETURNS uuid LANGUAGE plpgsql AS $$
 DECLARE t uuid:=gen_random_uuid();n integer;BEGIN PERFORM pg_temp.set_auth(u);n:=public.get_next_ver_nr(u);
 INSERT INTO transactions(id,user_id,date,description,amount,source,booked) VALUES(t,u,d,'KAN124 synthetic SIE guard fixture',1250,'sie_import',true);
 IF kind IN ('reverse','2645') THEN
 INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES(t,u,n,d,'1930',0,CASE WHEN kind='reverse' THEN 1000 ELSE 1250 END),(t,u,n,d,'5410',1000,0),(t,u,n,vat_d,'2645',250,0);
 IF kind='reverse' THEN INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES(t,u,n,vat_d,'2614',0,250);END IF;
 ELSE
 INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES(t,u,n,d,'1930',CASE WHEN kind='no_vat' THEN 1000 ELSE 1250 END,0),(t,u,n,d,'3010',0,1000);
 IF kind<>'no_vat' THEN INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES(t,u,n,vat_d,'2611',0,250);END IF;
 END IF;RETURN t;END $$;`
const sieSql=fs.readFileSync('supabase/tests/kan71_generic_sie_correction_guard.sql','utf8')
 .replace("current_database() NOT LIKE 'sololedger_kan71_%'",'current_database() <> '+q(database))
 .replace(/CREATE FUNCTION pg_temp\.seed\(u uuid,d date,vat_d date,kind text\)[\s\S]*?END \$\$;/,()=>legacySeed)
 .replace("'open_sie','manual_open','manual_old','manual_no_vat','descendant_open'","'open_sie','manual_open','manual_no_vat','descendant_open'")
 .replace("IF msg NOT LIKE '%separat hantering%'", "IF s<>'manual_old' AND msg NOT LIKE '%separat hantering%'")
test('A20','KAN71 complete generic/SIE scenarios; native manual_old now blocked',sieSql,r=>assert(r.length>=0))
atomic('A21','correction of a VAT correction',seed(u)+periods(u)+cost(u)+`DO $c$ BEGIN PERFORM ${correct(original)};END $c$;`,u,/KAN124_CORRECTION_CHAIN/,"(SELECT id FROM transactions WHERE user_id=auth.uid() AND is_correction)")
test('A22','foreign owner and anon/helper permissions',seed(u)+periods(u)+cost(u)+`DO $owner$ BEGIN PERFORM set_config('kan124.foreign',(${original})::text,true);END $owner$;`+seed(v)+call(correct("current_setting('kan124.foreign')::uuid"))+`RESET ROLE;SELECT jsonb_build_object('anon_rpc',has_function_privilege('anon','public.create_correction_transaction_atomic(uuid)','EXECUTE'),'private_auth',has_function_privilege('authenticated','public.assert_generic_correction_vat_open(uuid,uuid[],date[])','EXECUTE'),'private_service',has_function_privilege('service_role','public.assert_generic_correction_vat_open(uuid,uuid[],date[])','EXECUTE'));`,r=>{denied(r[0]);assert.equal(r[0].code,'P0002');assert.deepEqual(r[1],{anon_rpc:false,private_auth:false,private_service:false})})
const forceFailure=`RESET ROLE;CREATE FUNCTION pg_temp.fail_kan124() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RAISE EXCEPTION 'KAN124 injected late failure';END $f$;CREATE TRIGGER kan124_injected_failure AFTER INSERT ON journal_entries FOR EACH ROW WHEN (NEW.user_id=${q(u)}::uuid) EXECUTE FUNCTION pg_temp.fail_kan124();${auth(u)}`
atomic('A26','late failure rolls back allocated number and writes',seed(u)+periods(u)+cost(u)+forceFailure,u,/KAN124 injected late failure/)
// Bundle real pure reporting code, with no Supabase/network client.
const bundled=await build({stdin:{contents:"export {calculateVatReportFromLoadedRows} from './src/lib/vatReportService.ts'; export {calculateNeReport} from './src/lib/neCalculation';export {parseNeSalesSummary} from './src/lib/neSalesClassification';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,packages:'external'})
const mod={exports:{}};new Function('require','module','exports',bundled.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports)
const report=(r,start,end)=>{const v=mod.exports.calculateVatReportFromLoadedRows({userId:r.userId,startDate:start,endDate:end,rows:r});assert.equal(v.status,'ready');return v.report}
test('A27','exact Q2/Q4 reproduction now denied, reports and closing unchanged',seed(u)+period(u,'2026-04-01','2026-06-30','sololedger','quarter')+period(u,now.quarterStart,now.quarterEnd,'sololedger','quarter')+cost(u)+`DO $d$ BEGIN PERFORM ${book(payload())};END $d$;`+setStatus('declared','2026-04-01','2026-07-15')+rows(u)+state(u)+call(correct(original))+rows(u)+state(u),r=>{denied(r[2],/KAN124_ORIGIN_DECLARED/);assert.deepEqual(r[4],r[1]);assert.deepEqual(r[3],r[0]);assert.equal(report(r[0],'2026-04-01','2026-06-30').fields['48'],500);assert.equal(report(r[3],now.quarterStart,now.quarterEnd).fields['48'],0)})
test('A28','ordinary journal, VAT report, bank and NE after allowed correction',seed(u)+period(u,currentStart,currentEnd)+cost(u,current)+call(correct(original))+rows(u)+`SELECT jsonb_build_object('annual',(SELECT jsonb_object_agg(account_number,balance) FROM get_period_account_balances(${q(currentYear+'-01-01')},${q(currentYear+'-12-31')})),'balances',(SELECT jsonb_object_agg(account_number,balance) FROM get_cumulative_account_balances(${q(currentYear+'-12-31')})),'ne',get_ne_sales_summary(${currentYear}));`,r=>{ok(r[0]);const rep=report(r[1],currentStart,currentEnd);assert.equal(rep.fields['48'],0);const s=r[2];assert.equal(s.balances['1930'],5000);const ne=mod.exports.calculateNeReport({annualBalances:s.annual,cumulativeBalances:s.balances,balanceSheetBalances:Object.fromEntries(Object.entries(s.balances).filter(([a])=>/^[12]/.test(a))),neSalesClassification:mod.exports.parseNeSalesSummary(s.ne)});assert.equal(ne.R11,0);assert.equal(ne.B9,5000);save('A28-report',{rep,ne})})
// Concurrency cases below use actual observed backend blocking, not timing guesses.
const sessions=[]
async function open(owner){const s=await new Session().open();sessions.push(s);await s.run(attempt);if(owner)await s.run(auth(owner).replaceAll('SET LOCAL','SET'));return s}
const one=async(s,sql)=>(await s.run(sql))[0]
const rpc=(s,expression)=>one(s,call(expression))
const observer=await open()
async function blocked(waiter,blocker){const end=Date.now()+6500;while(Date.now()<end){const r=await one(observer,`SELECT jsonb_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})),'event',(SELECT wait_event FROM pg_stat_activity WHERE pid=${waiter.pid}));`);if(r.blocked)return r;await new Promise(resolve=>setTimeout(resolve,30))}throw Error('Expected backend blocking not observed')}
async function pair(){const owner=randomUUID();cohort.push(owner);query('BEGIN;'+seed(owner)+periods(owner)+cost(owner)+'RESET ROLE;COMMIT;');save('retained-cohort',{cohort});return{owner,a:await open(owner),b:await open(owner)}}
async function concurrent(id,name,fn){await fn();checks.push({id,name,status:'PASS'});save(id+'-'+checks.length,{id,name,status:'PASS',cohort});console.log('PASS '+id+' '+name)}
try{
 await concurrent('A23','close wins: correction waits and rejects committed status',async()=>{const f=await pair();await f.b.run('BEGIN;');ok(await rpc(f.b,`public.close_vat_period_atomic(${pid()})`));const p=rpc(f.a,correct(original));p.catch(()=>{});await blocked(f.a,f.b);await f.b.run('COMMIT;');denied(await p,/KAN124_ORIGIN_CLOSED/)})
 await concurrent('A23','correction wins: close waits then sees complete journal',async()=>{const f=await pair();await f.a.run('BEGIN;');ok(await rpc(f.a,correct(original)));const p=rpc(f.b,`public.close_vat_period_atomic(${pid()})`);p.catch(()=>{});await blocked(f.b,f.a);await f.a.run('COMMIT;');const close=ok(await p);assert.equal(Number(close.closing_amount),-250)})
 await concurrent('A23','declaration row lock wins; correction observes declared',async()=>{const f=await pair();ok(await rpc(f.b,`public.close_vat_period_atomic(${pid()})`));await f.b.run('BEGIN;');ok(await rpc(f.b,`public.declare_vat_period_atomic(${pid()},'2026-05-15')`));const p=rpc(f.a,correct(original));p.catch(()=>{});const wait=await blocked(f.a,f.b);assert.notEqual(wait.event,'advisory');await f.b.run('COMMIT;');denied(await p,/KAN124_ORIGIN_DECLARED/)})
 await concurrent('A23','correction period row lock first; declaration waits; other owner proceeds',async()=>{const f=await pair();ok(await rpc(f.b,`public.close_vat_period_atomic(${pid()})`));await f.a.run('BEGIN;');await f.a.run(`RESET ROLE;SELECT id FROM vat_periods WHERE id=${pid()} FOR UPDATE;SET ROLE authenticated;`);denied(await rpc(f.a,correct(original)),/KAN124_ORIGIN_CLOSED/);const p=rpc(f.b,`public.declare_vat_period_atomic(${pid()},'2026-05-15')`);p.catch(()=>{});await blocked(f.b,f.a);const other=await pair();ok(await rpc(other.a,correct(original)));await f.a.run('COMMIT;');ok(await p)})
 await concurrent('A24','concurrent retry/two callers creates at most one correction',async()=>{const f=await pair();await f.a.run('BEGIN;');const first=ok(await rpc(f.a,correct(original)));const p=rpc(f.b,correct(original));p.catch(()=>{});await blocked(f.b,f.a);await f.a.run('COMMIT;');denied(await p,/redan korrigerats/);denied(await rpc(f.b,correct(original)),/redan korrigerats/);const s=await one(f.a,`SELECT jsonb_build_object('n',(SELECT count(*) FROM transactions WHERE user_id=auth.uid() AND is_correction),'id',(SELECT id FROM transactions WHERE user_id=auth.uid() AND is_correction));`);assert.equal(s.n,1);assert.equal(s.id,first.transaction_id)})
 await concurrent('A25','changed journal while waiting gives retryable rollback',async()=>{const f=await pair();await f.b.run('BEGIN;');await f.b.run("RESET ROLE;SELECT public.lock_vat_months(auth.uid(),ARRAY['2026-04-15'::date]);SET ROLE authenticated;");const p=rpc(f.a,correct(original));p.catch(()=>{});await blocked(f.a,f.b);await f.b.run(`RESET ROLE;UPDATE journal_entries SET date='2026-06-15' WHERE user_id=${q(f.owner)} AND account_number='2641';`);await f.b.run('COMMIT;');assert.equal(denied(await p).code,'40001')})
}finally{for(const s of sessions)await s.close()}
assert.deepEqual(query(digest(cohort)+functions+contracts),before,'Every preexisting row, function and table contract must remain unchanged')
save('result',{status:checks.some(c=>c.status==='BLOCKED')?'PASS_WITH_LIMITATION':'PASS',database,host:'127.0.0.1',port:5432,oid:69031,marker,migration,sha256:createHash('sha256').update(fs.readFileSync('supabase/migrations/'+migration)).digest('hex'),checks,retainedSyntheticCohort:cohort,allPriorDataUnchanged:true,pendingIntegration:['unchanged KAN122 supplier/other flows regression','UI error/browser checks']})
console.log('KAN124 '+checks.filter(c=>c.status==='PASS').length+' checks PASS; A17 BLOCKED (missing existing flow). Evidence '+run)
