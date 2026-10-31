// Real PostgreSQL regression. Fixed isolated target; rollback-only fixture cases.
// Concurrency cohorts are fresh synthetic UUIDs and retained, never cleaned up.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {randomUUID,createHash} from 'node:crypto'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {query,guard,auth,literal as q,json,Session,database,marker} from './kan122-local-db.mjs'
assert.equal(process.env.SOLOLEDGER_KAN122_LOCAL_GO,'implementation-and-verification','Explicit local test GO required')
const migration='20261031133758_kan122_closed_year_boundary.sql'
const candidate=fs.readFileSync('supabase/migrations/'+migration,'utf8')
const run=path.resolve('coverage/kan122-local-20261031',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID())
fs.mkdirSync(run,{recursive:true})
const save=(name,value)=>fs.writeFileSync(path.join(run,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'})
const functionSQL="SELECT jsonb_agg(jsonb_build_object('name',proname,'signature',oid::regprocedure::text,'hash',md5(replace(pg_get_functiondef(oid),chr(13),'')),'acl',proacl::text) ORDER BY proname) FROM pg_proc WHERE pronamespace='public'::regnamespace;"
const tables=query("SELECT jsonb_agg(tablename ORDER BY tablename) FROM pg_tables WHERE schemaname='public';")[0]
const digestSQL="SELECT jsonb_build_object("+[...tables.map(t=>[t,'public.'+t]),['auth','auth.users']].map(([k,t])=>q(k)+",(SELECT jsonb_build_object('count',count(*),'digest',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,''))) FROM "+t+" x)").join(',')+");"
const catalogSQL="SELECT jsonb_build_object('tables',(SELECT jsonb_agg(jsonb_build_array(relname,relrowsecurity,relacl::text) ORDER BY relname) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE connamespace='public'::regnamespace),'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY indexname) FROM pg_indexes i WHERE schemaname='public'),'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal));"
const before=query(digestSQL+functionSQL+catalogSQL)
save('before.json',before)
if(process.argv.includes('--prepare')) {
 const live=JSON.parse(fs.readFileSync('coverage/kan122-local-20261031/live-functions.json','utf8'))
 assert.equal(before[0].auth.count,0,'Preparation allowed only on the verified empty synthetic database')
 assert.equal(before[0].journal_entries.count,0)
 assert(!before[1].some(f=>f.name==='assert_accounting_dates_open'),'Candidate already installed; never overwrite silently')
 if(!before[1].some(f=>f.name==='get_result_closing_review'))query(guard+fs.readFileSync('supabase/migrations/20261028125031_kan96_result_closing_safety.sql','utf8'))
 const prepared=query(functionSQL)[0]
 const excluded=new Set(['create_missing_vat_periods','get_vat_period_creation_plan','kan117_vat_period_plan'])
 for(const f of live.filter(f=>!excluded.has(f.name)))assert.equal(prepared.find(x=>x.signature===f.signature)?.hash,f.hash,'Production definition mismatch: '+f.name)
 assert.deepEqual(query(digestSQL)[0],before[0],'Prerequisite must not change data')
 query(guard+candidate)
 const after=query(digestSQL+functionSQL+catalogSQL)
 assert.deepEqual(after[0],before[0],'Candidate must not change data')
 for(const f of live.filter(f=>f.name!=='close_year_atomic'&&!excluded.has(f.name)))assert.equal(after[1].find(x=>x.signature===f.signature)?.hash,f.hash,'Unrelated function changed: '+f.name)
 for(const key of ['tables','policies','constraints','indexes'])assert.deepEqual(after[2][key],before[2][key],key+' preserved')
 assert.equal(after[2].triggers.length,before[2].triggers.length+2)
 save('after-install.json',after);save('installation.json',{database,host:'127.0.0.1',port:5432,oid:69031,marker,migration,sha256:createHash('sha256').update(candidate).digest('hex'),dataUnchanged:true,productionDefinitionsMatched:live.length-excluded.size,uninstalledVatCreationPlanFunctions:[...excluded]})
 console.log('PASS local prerequisite and KAN122 installed; no data changes. Evidence: '+run)
 process.exit(0)
}
const attempt=`CREATE FUNCTION pg_temp.attempt(command text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $try$
 DECLARE r jsonb; BEGIN EXECUTE command INTO r; RETURN jsonb_build_object('ok',true,'value',r);
 EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'code',SQLSTATE,'message',SQLERRM); END $try$;`
// Production RPCs use separate transactions. Preserve the existing prohibition
// on upgrading a writer's shared owner gate to an exclusive year close.
const call=expression=>(expression.startsWith('public.close_year_atomic(')?`RESET ROLE;COMMIT;BEGIN;${guard}${auth(u)}`:'')+`SELECT pg_temp.attempt(${q('SELECT '+expression)});`
const command=sql=>`SELECT pg_temp.attempt(${q(sql+" RETURNING '{}'::jsonb")});`
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));assert.notEqual(r.value?.success,false,JSON.stringify(r));return r.value}
const denied=(r,pattern=/årslås|låst|skyddas/)=>{const e=r.ok?r.value:r;assert(r.ok?e?.confirmed_rejection:!r.ok,JSON.stringify(r));assert.match(e.message??e.error??'',pattern,JSON.stringify(r));return e}
const receipt=(date,amount=500,type='kan122-deposit')=>({idempotency_key:randomUUID(),date,amount,type,vat_rate:0,description:'KAN122 synthetic only'})
const book=p=>'public.book_transaction_atomic('+json(p)+')'
const seed=(u,registered=false)=>`RESET ROLE;${guard}DO $fresh$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id=${q(u)}) OR EXISTS(SELECT 1 FROM profiles WHERE id=${q(u)}) THEN RAISE EXCEPTION 'Synthetic collision'; END IF; END $fresh$;
 INSERT INTO auth.users(id,email) VALUES(${q(u)},${q('kan122-'+u+'@example.invalid')});
 INSERT INTO profiles(id,email,company_name,vat_status,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement,vat_management_from,vat_period_type)
 VALUES(${q(u)},${q('kan122-'+u+'@example.invalid')},'KAN122 synthetic only',${q(registered?'registered':'not_registered')},${q(registered?'taxable':'small_business_exempt')},'not_required',${q(registered?'full':'none')},${registered?"'2025-01-01'":"NULL"},${registered?"'year'":"NULL"})
 ON CONFLICT(id) DO UPDATE SET company_name=EXCLUDED.company_name,vat_status=EXCLUDED.vat_status,domestic_sales_vat_treatment=EXCLUDED.domestic_sales_vat_treatment,default_deduction_entitlement=EXCLUDED.default_deduction_entitlement,vat_management_from=EXCLUDED.vat_management_from,vat_period_type=EXCLUDED.vat_period_type;
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate) VALUES('kan122-deposit',${q(u)},'KAN122 deposit','1930','2018',0),('kan122-cost',${q(u)},'KAN122 expense','5420','1930',0),('kan122-sale',${q(u)},'KAN122 sale','1930','3010',25);
 INSERT INTO company_payment_account_roles(user_id,role,account_number) VALUES(${q(u)},'business_payment_account','1930');
 `
const fixtureLock=(u,year=2025)=>`RESET ROLE;${guard}INSERT INTO closed_years(user_id,year) VALUES(${q(u)},${year});`
const state=u=>`RESET ROLE;SELECT jsonb_build_object('balances',(SELECT jsonb_object_agg(account_number,balance) FROM get_cumulative_account_balances('2025-12-31')),'annual',(SELECT jsonb_object_agg(account_number,balance) FROM get_period_account_balances('2025-01-01','2025-12-31')),'ne',get_ne_sales_summary(2025),'tx',(SELECT count(*) FROM transactions WHERE user_id=${q(u)}),'je',(SELECT count(*) FROM journal_entries WHERE user_id=${q(u)}),'sequence',(SELECT last_ver_nr FROM ver_nr_sequences WHERE user_id=${q(u)}),'receipts',(SELECT count(*) FROM standard_booking_idempotency WHERE user_id=${q(u)}));${auth(u)}`
const checks=[],cohort=[]
function test(name,sql,verify){const a=randomUUID(),b=randomUUID();cohort.push(a,b);sql=sql.replaceAll(u,a).replaceAll(v,b);const r=query(attempt+'BEGIN;'+guard+sql+'RESET ROLE;ROLLBACK;'+guard);save('case-'+(checks.length+1)+'.json',{name,owners:[a,b],results:r});verify(r);checks.push({name,status:'PASS'});console.log('PASS '+name)}
const u=randomUUID(),v=randomUUID()
test('A1 2024 open / 2025 locked; atomic 500kr rejection, 1000kr bank preserved',seed(u)+auth(u)+call(book(receipt('2024-01-10',1000)))+fixtureLock(u)+auth(u)+state(u)+call(book(receipt('2024-12-30')))+state(u),r=>{ok(r[0]);denied(r[2]);assert.equal(r[1].balances['1930'],1000);assert.deepEqual(r[1],r[3])})
test('Boundary 2025-12-31 rejected / 2026-01-01 accepted; retry and conflict',seed(u)+fixtureLock(u)+auth(u)+call(book(receipt('2025-12-31')))+call(book(receipt('2026-01-01'))),r=>{denied(r[0]);ok(r[1])})
// Journal fixtures explicitly exercise date interpretations and privileged updates.
const tx=randomUUID()
const raw=(td,jd)=>`RESET ROLE;${guard}INSERT INTO transactions(id,user_id,date,description,amount,booked,source) VALUES(${q(tx)},${q(u)},${q(td)},'KAN122 split date synthetic',500,false,'manual');`+command(`INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES(${q(tx)},${q(u)},1,${q(jd)},'1930',500,0)`)
for(const [td,jd]of[['2024-12-30','2026-01-01'],['2026-01-01','2024-12-30']])test('Split dates blocked '+td+'/'+jd,seed(u)+fixtureLock(u)+raw(td,jd),r=>denied(r[0]))
for(const target of ['transaction','journal'])for(const direction of ['in','out']){
 const old=direction==='in'?'2026-01-01':'2024-12-30',next=direction==='in'?'2024-12-30':'2026-01-01'
 test(target+' date move '+direction+' protected',seed(u)+raw(old,old)+fixtureLock(u)+command(`UPDATE ${target==='journal'?'journal_entries':'transactions'} SET date=${q(next)} WHERE ${target==='journal'?'transaction_id':'id'}=${q(tx)}`),r=>{ok(r[0]);denied(r[1])})
}
test('Open date move and locked metadata no-op retained',seed(u)+raw('2026-01-01','2026-01-01')+fixtureLock(u)+command(`UPDATE transactions SET date='2026-01-02' WHERE id=${q(tx)}`)+command(`UPDATE journal_entries SET date='2026-01-02' WHERE transaction_id=${q(tx)}`)+command(`UPDATE transactions SET file_url='synthetic-metadata',date=date WHERE id=${q(tx)}`),r=>r.forEach(ok))
test('First relevant 2025 needs no pre-start locks',seed(u)+auth(u)+call(book(receipt('2025-01-10',1000)))+'RESET ROLE;'+auth(u)+call('public.close_year_atomic(2025)'),r=>r.forEach(ok))
test('Chronology: 2024 must precede 2025; locks do not create journals',seed(u)+auth(u)+call(book(receipt('2024-01-10',1000)))+'RESET ROLE;'+auth(u)+call('public.close_year_atomic(2025)'),r=>{ok(r[0]);denied(r[1],/Du behöver låsa 2024 först/)})
test('Empty intervening 2024 closes explicitly after 2023, then 2025 succeeds',seed(u)+auth(u)+call(book(receipt('2023-01-10',1000)))+fixtureLock(u,2023)+auth(u)+call('public.close_year_atomic(2025)')+'RESET ROLE;'+auth(u)+call('public.close_year_atomic(2024)')+call('public.close_year_atomic(2025)'),r=>{ok(r[0]);denied(r[1],/låsa 2024 först/);ok(r[2]);ok(r[3])})
test('No bookkeeping: no invented start year; 2025 can close',seed(u)+auth(u)+call('public.close_year_atomic(2025)'),r=>ok(r[0]))
const period={...receipt('2024-06-01',100,'kan122-cost'),future_date:'2026-02-01'}
test('Periodization both legs atomically blocked by later lock',seed(u)+auth(u)+call(book(receipt('2024-01-10',1000)))+fixtureLock(u)+auth(u)+state(u)+call('public.book_periodized_transaction_atomic('+json(period)+')')+state(u),r=>{ok(r[0]);denied(r[2]);assert.deepEqual(r[1],r[3])})
test('Ordinary correction of old transaction in later open year allowed',seed(u)+auth(u)+call(book(receipt('2024-01-10',1000)))+fixtureLock(u)+auth(u)+call('public.create_correction_transaction_atomic((SELECT id FROM transactions WHERE user_id=auth.uid() LIMIT 1))'),r=>r.forEach(ok))
const invoice=(year=2025)=>({invoice_number:'KAN122-'+randomUUID(),customer_name:'Synthetic customer',invoice_date:year+'-12-01',service_date:year+'-12-01',due_date:year+'-12-31',gross_amount:1250,vat_treatment:'exempt',attachment_url:u+'/kan122.pdf'})
test('Invoice-only start year blocks skipping 2024',seed(u)+auth(u)+call('public.create_customer_invoice_atomic('+json(invoice(2024))+')')+'RESET ROLE;'+auth(u)+call('public.close_year_atomic(2025)'),r=>{ok(r[0]);denied(r[1],/låsa 2024 först/)})
test('2025 receivable settled 2026; locked report unchanged, no new revenue',seed(u)+auth(u)+call('public.create_customer_invoice_atomic('+json(invoice())+')')+call('public.book_customer_invoice_year_end_receivable_atomic((SELECT id FROM customer_invoices WHERE user_id=auth.uid()),2025,'+q(randomUUID())+')')+'RESET ROLE;'+auth(u)+call('public.close_year_atomic(2025)')+state(u)+call('public.settle_customer_invoice_receivable_atomic((SELECT id FROM customer_invoices WHERE user_id=auth.uid()),\'2026-01-20\','+q(randomUUID())+')')+state(u)+"SELECT jsonb_object_agg(account_number,balance) FROM get_period_account_balances('2026-01-01','2026-12-31');",r=>{r.slice(0,3).forEach(ok);ok(r[4]);assert.deepEqual(r[3].balances,r[5].balances);assert.deepEqual(r[3].ne,r[5].ne);assert.equal(r[3].balances['1510'],1250);assert.equal(r[6]['1510'],-1250);assert.equal(r[6]['1930'],1250);assert(!r[6]['3010'])})
test('Owner isolation: A lock does not block B; foreign data invisible',seed(u)+fixtureLock(u)+seed(v)+auth(v)+call(book(receipt('2024-01-10')))+`SELECT jsonb_build_object('rows',count(*)) FROM closed_years WHERE user_id=${q(u)};`,r=>{ok(r[0]);assert.equal(r[1].rows,0)})
const replay=receipt('2024-01-10',1000)
test('Exact replay after later lock; changed payload rejected, no new rows',seed(u)+auth(u)+call(book(replay))+fixtureLock(u)+auth(u)+state(u)+call(book(replay))+call(book({...replay,amount:1001}))+state(u),r=>{const first=ok(r[0]),again=ok(r[2]);assert.equal(again.transaction_id,first.transaction_id);assert.equal(again.idempotent_replay,true);assert.equal(r[3].ok,false);assert.equal(r[3].code,'22023');assert.deepEqual(r[1],r[4])})
const openPeriod={...receipt('2026-03-01',100,'kan122-cost'),future_date:'2027-01-01'}
test('Open periodization and its correction remain atomic and balanced',seed(u)+auth(u)+call(book(receipt('2025-01-10',1000)))+fixtureLock(u)+auth(u)+call('public.book_periodized_transaction_atomic('+json(openPeriod)+')')+call('public.create_correction_transaction_atomic((SELECT id FROM transactions WHERE user_id=auth.uid() AND is_periodized=true LIMIT 1))')+"SELECT jsonb_build_object('unbalanced',count(*)) FROM (SELECT transaction_id FROM journal_entries WHERE user_id=auth.uid() GROUP BY transaction_id HAVING sum(debit-credit)<>0) t;",r=>{r.slice(0,3).forEach(ok);assert.equal(r[3].unbalanced,0)})
const lockedPeriod={...receipt('2023-03-01',100,'kan122-cost'),future_date:'2024-01-01'}
test('Correction of periodization with protected old leg rejects all reversals',seed(u)+auth(u)+call('public.book_periodized_transaction_atomic('+json(lockedPeriod)+')')+fixtureLock(u)+auth(u)+state(u)+call('public.create_correction_transaction_atomic((SELECT id FROM transactions WHERE user_id=auth.uid() AND is_periodized=true LIMIT 1))')+state(u),r=>{ok(r[0]);denied(r[2]);assert.deepEqual(r[1],r[3])})
const paymentInvoice=invoice(2024)
test('Customer payment reversal uses current open year; locked balance unchanged',seed(u)+auth(u)+call('public.create_customer_invoice_atomic('+json(paymentInvoice)+')')+call('public.record_customer_invoice_payment_atomic((SELECT id FROM customer_invoices WHERE user_id=auth.uid()),\'2024-12-20\','+q(randomUUID())+')')+fixtureLock(u)+auth(u)+state(u)+call('public.undo_customer_invoice_payment_atomic((SELECT id FROM customer_invoices WHERE user_id=auth.uid()),'+q(randomUUID())+')')+state(u),r=>{r.slice(0,2).forEach(ok);ok(r[3]);assert.deepEqual(r[2].balances,r[4].balances);assert.deepEqual(r[2].ne,r[4].ne)})
test('Unpaid customer payment into earlier open year blocked',seed(u)+auth(u)+call('public.create_customer_invoice_atomic('+json(invoice(2024))+')')+fixtureLock(u)+auth(u)+call('public.record_customer_invoice_payment_atomic((SELECT id FROM customer_invoices WHERE user_id=auth.uid()),\'2024-12-20\','+q(randomUUID())+')'),r=>{ok(r[0]);denied(r[1])})
// The production-derived local DB has no Supabase Storage schema. A minimal
// metadata-only attachment fixture exists solely inside these rolled-back cases.
// This tests accounting RPCs, not Storage upload, RLS or object availability.
const attachmentFixture=`RESET ROLE;${guard}DO $s$ BEGIN IF to_regnamespace('storage') IS NOT NULL THEN RAISE EXCEPTION 'Expected absent synthetic Storage fixture schema';END IF;END $s$;CREATE SCHEMA storage;CREATE TABLE storage.objects(bucket_id text,name text);INSERT INTO storage.objects VALUES('attachments',${q(u+'/kan122.pdf')});`
const supplier={action:'book',request_key:randomUUID(),supplier_name:'KAN122 synthetic supplier',supplier_identity:'5560000000',invoice_number:'KAN122-synthetic',invoice_date:'2025-12-20',received_date:'2025-12-21',fiscal_year:2025,country:'SE',currency:'SEK',invoice_kind:'ordinary_expense',gross_amount:1250,vat_rate:0,invoice_vat:0,deduction:'none',expense_account:'6110',wholly_unpaid:true,delivered_in_year:true,not_previously_booked:true,not_credit_or_partial:true,attachment_path:u+'/kan122.pdf'}
const supplierCall=p=>'public.manage_supplier_year_end_invoice('+json(p)+')'
test('Supplier year-end booking cannot bypass later 2026 lock',seed(u)+attachmentFixture+fixtureLock(u,2026)+auth(u)+call(supplierCall(supplier)),r=>denied(r[0]))
test('Supplier 2025 debt paid 2026; old report unchanged and exact replay',seed(u)+attachmentFixture+auth(u)+call(book(receipt('2025-01-10',5000)))+call(supplierCall(supplier))+fixtureLock(u)+auth(u)+state(u)+call(supplierCall(supplier))+call('public.manage_supplier_year_end_invoice('+json({action:'pay',request_key:randomUUID(),payment_date:'2026-01-20',paid_amount:1250})+" || jsonb_build_object('invoice_id',(SELECT id FROM supplier_year_end_invoices WHERE user_id=auth.uid())))")+state(u)+"SELECT jsonb_object_agg(account_number,balance) FROM get_period_account_balances('2026-01-01','2026-12-31');",r=>{ok(r[0]);ok(r[1]);assert.equal(ok(r[3]).idempotent_replay,true);ok(r[4]);assert.deepEqual(r[2].balances,r[5].balances);assert.deepEqual(r[2].ne,r[5].ne);assert.equal(r[2].balances['2440'],-1250);assert.equal(r[6]['2440'],1250);assert.equal(r[6]['1930'],-1250);assert(!r[6]['6110'])})
const asset=date=>({idempotency_key:randomUUID(),date,description:'KAN122 synthetic asset',supplier_country:'SE',gross_amount:40000,vat_rate:0,vat_deduction_entitlement:'none',payment_account_role:'business_payment_account',booking_contract_version:'kan62-rule-contract-v1',connection_assessment:'standalone',connected_asset_ids:[],expected_prior_asset_ids:[],expected_threshold_basis_amount:40000,expected_reclassification_amount:0,useful_life_answer:'more_than_three_years_or_unknown'})
test('Inventory acquisition 2025 blocked by later lock 2026',seed(u)+fixtureLock(u,2026)+auth(u)+call('public.book_fixed_asset_acquisition_atomic('+json(asset('2025-01-10'))+')'),r=>denied(r[0]))
test('Inventory acquisition in 2026 open year remains supported',seed(u)+fixtureLock(u)+auth(u)+call('public.book_fixed_asset_acquisition_atomic('+json(asset('2026-01-10'))+')'),r=>ok(r[0]))
test('Tax account movement backdated 2024 blocked; 2026 accepted',seed(u)+fixtureLock(u)+auth(u)+call('public.record_tax_account_movement_atomic(\'business_to_tax_account\',\'2024-01-10\',100,NULL,'+q(randomUUID())+')')+call('public.record_tax_account_movement_atomic(\'business_to_tax_account\',\'2026-01-10\',100,NULL,'+q(randomUUID())+')'),r=>{denied(r[0]);ok(r[1])})
const vatSetup=seed(u,true)+auth(u)+call("public.ensure_vat_periods('2025-12-31')")+call(book({...receipt('2025-02-01',1250,'kan122-sale'),vat_rate:25}))
const periodId='(SELECT id FROM vat_periods WHERE user_id=auth.uid() AND period_start=\'2025-01-01\')'
test('VAT close cannot write 2025 under later 2026 lock; rollback is complete',vatSetup+fixtureLock(u,2026)+auth(u)+state(u)+call('public.close_vat_period_atomic('+periodId+')')+state(u),r=>{r.slice(0,2).forEach(ok);denied(r[3]);assert.deepEqual(r[2],r[4])})
test('VAT lifecycle and 2026 settlement/movement preserve locked 2025 report',vatSetup+call('public.close_vat_period_atomic('+periodId+')')+call('public.declare_vat_period_atomic('+periodId+",'2026-01-10')")+call('public.close_year_atomic(2025)')+state(u)+call('public.record_vat_settlement_atomic('+periodId+",'2026-01-20',250,"+q(randomUUID())+')')+call('public.record_tax_account_movement_atomic(\'business_to_tax_account\',\'2026-01-21\',250,'+periodId+','+q(randomUUID())+')')+state(u),r=>{r.slice(0,5).forEach(ok);ok(r[6]);ok(r[7]);assert.deepEqual(r[5].balances,r[8].balances);assert.deepEqual(r[5].ne,r[8].ne)})
const depRequest="jsonb_build_object('fiscal_year',2025,'year_start','2025-01-01','year_end','2025-12-31','normal_calendar_year_confirmed',true,'all_purchases_complete',true,'expected_signature',public.get_fixed_asset_depreciation_preview(2025)->'signature','expected_amount',public.get_fixed_asset_depreciation_preview(2025)->'depreciation_amount')"
test('Inventory depreciation 2025 blocked by later lock 2026',seed(u)+auth(u)+call('public.book_fixed_asset_acquisition_atomic('+json(asset('2025-01-10'))+')')+fixtureLock(u,2026)+auth(u)+state(u)+call('public.book_fixed_asset_depreciation_checked('+depRequest+')')+state(u),r=>{ok(r[0]);denied(r[2]);assert.deepEqual(r[1],r[3])})
test('Inventory depreciation in open 2025 is balanced and supported',seed(u)+auth(u)+call('public.book_fixed_asset_acquisition_atomic('+json(asset('2025-01-10'))+')')+call('public.book_fixed_asset_depreciation_checked('+depRequest+')'),r=>r.forEach(ok))
test('Public date edit protects legacy unbooked flag with journal rows',seed(u)+raw('2026-01-10','2026-01-10')+fixtureLock(u)+auth(u)+call('public.update_transaction_safe('+q(tx)+','+json({date:'2024-12-30'})+')'),r=>{ok(r[0]);denied(r[1])})
test('Public attachment update on old history does not change its dates',seed(u)+auth(u)+call(book(receipt('2024-01-10',1000)))+fixtureLock(u)+auth(u)+state(u)+call('public.update_transaction_safe((SELECT id FROM transactions WHERE user_id=auth.uid()),'+json({file_url:'synthetic-metadata'})+')')+state(u),r=>{ok(r[0]);ok(r[2]);assert.deepEqual(r[1],r[3])})
test('Chronology includes explicit VAT management start before first journal',seed(u,true)+`RESET ROLE;UPDATE profiles SET vat_management_from='2024-01-01' WHERE id=${q(u)};`+auth(u)+call('public.close_year_atomic(2025)'),r=>denied(r[0],/låsa 2024 först/))
test('Server current year cannot close even when client date checks bypassed',seed(u)+auth(u)+call('public.close_year_atomic(2026)'),r=>denied(r[0],/inte avslutat/))
test('Journal NULL dates and cross-owner associations rejected',seed(u)+seed(v)+raw('2026-01-10','2026-01-10')+command(`UPDATE journal_entries SET date=NULL WHERE transaction_id=${q(tx)}`)+command(`UPDATE journal_entries SET user_id=${q(v)} WHERE transaction_id=${q(tx)}`),r=>{ok(r[0]);denied(r[1],/datum saknas/);denied(r[2],/byta ägare/)})
const euPayload=date=>({idempotency_key:randomUUID(),date,description:'KAN122 synthetic EU service',treatment_code:'EU_SERVICE_REVERSE_CHARGE',calculation_rate:25,deduction_entitlement:'full',acquisition_base_field:'21',output_vat_report_field:'30',deductible_input_vat_report_field:'48',taxable_base:100,output_vat_amount:25,deductible_input_vat_amount:25,payment_account_role:'business_payment_account',rule_version:'kan122-synthetic-rule',facts_version:'vat-v2-business-facts-v1',business_facts:{schemaVersion:'vat-v2-business-facts-v1',customerCountry:'SE',currency:'SEK',supplierCountry:'DE',purchaseClassification:'software_subscription_service',goodsOrService:'service',supplierVatCharged:'no',calculationRate:25,taxableBase:100,deductionEntitlement:'full',deductionEntitlementSource:'company_profile_default'}})
test('VAT V2 EU service cannot bypass later lock',seed(u,true)+fixtureLock(u)+auth(u)+call('public.book_vat_v2_eu_service_reverse_charge_atomic('+json(euPayload('2024-01-10'))+')'),r=>denied(r[0]))
test('VAT V2 EU service works in later open year',seed(u,true)+fixtureLock(u)+auth(u)+call('public.book_vat_v2_eu_service_reverse_charge_atomic('+json(euPayload('2026-01-10'))+')'),r=>ok(r[0]))
// Only existing SIE write paths; no advanced import/export functionality changed.
const bundle=await build({stdin:{contents:"export {parseSieFile} from './src/lib/sieParser';export {buildSieImportPayload} from './src/lib/sieImportPayload';export {calculateNeReport} from './src/lib/neCalculation';export {parseNeSalesSummary} from './src/lib/neSalesClassification';export {calculateNeBalanceDiff} from './src/lib/neBalance';",loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external'})
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports)
const a1=JSON.parse(fs.readFileSync(path.join(run,'case-1.json'),'utf8')).results
const neReport=s=>mod.exports.calculateNeReport({annualBalances:s.annual??{},cumulativeBalances:s.balances,balanceSheetBalances:Object.fromEntries(Object.entries(s.balances).filter(([a])=>/^[12]/.test(a))),neSalesClassification:mod.exports.parseNeSalesSummary(s.ne)})
const beforeReport=neReport(a1[1]),afterReport=neReport(a1[3]);assert.deepEqual(afterReport,beforeReport);assert.equal(afterReport.B9,1000);assert.equal(afterReport.B10_total,1000);assert.equal(afterReport.R11,0);assert.equal(mod.exports.calculateNeBalanceDiff(afterReport),0)
save('a1-report.json',{before:beforeReport,after:afterReport,unchanged:true,attemptedAmount:500})
const parsed=mod.exports.parseSieFile('#FLAGGA 0\n#SIETYP 4\n#RAR 0 20240101 20241231\n#VER A 1 20240110 "KAN122"\n{\n#TRANS 1930 {} 500\n#TRANS 2018 {} -500\n}\n',{strictImport:true});assert.deepEqual(parsed.errors,[])
const siePayload=await mod.exports.buildSieImportPayload(parsed,'kan122-synthetic.se'),sieReceipt=randomUUID()
const sieSetup=`RESET ROLE;INSERT INTO sie_import_inputs(id,user_id,period_start,period_end,payload,raw_sha256,expires_at) VALUES(${q(sieReceipt)},${q(u)},'2024-01-01','2024-12-31',${json(siePayload)},repeat('a',64),clock_timestamp()+interval '5 minutes');${auth(u)}`
const sieExpression='public.import_sie_batch('+json({receipt_id:sieReceipt})+')'
test('Existing SIE import cannot bypass later year lock',seed(u)+sieSetup+fixtureLock(u)+auth(u)+call(sieExpression),r=>denied(r[0],/SIE-importen avvisades/))
test('Existing SIE undo in current open year preserves locked history',seed(u)+sieSetup+call(sieExpression)+fixtureLock(u)+auth(u)+state(u)+call('public.undo_sie_import_atomic((SELECT id FROM import_batches WHERE user_id=auth.uid()))')+state(u),r=>{ok(r[0]);ok(r[2]);assert.deepEqual(r[1].balances,r[3].balances);assert.deepEqual(r[1].ne,r[3].ne)})
test('Private helpers and write grants remain denied',"SELECT jsonb_build_object('unsafe_helpers',(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('assert_accounting_dates_open','guard_journal_closed_year_boundary','guard_transaction_closed_year_boundary') AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE') OR has_function_privilege('service_role',oid,'EXECUTE'))),'unsafe_tables',(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('transactions','journal_entries','closed_years') AND (has_table_privilege('authenticated',oid,'INSERT') OR has_table_privilege('authenticated',oid,'UPDATE') OR has_table_privilege('anon',oid,'INSERT'))));",r=>assert.deepEqual(r[0],{unsafe_helpers:0,unsafe_tables:0}))
// Observe actual blocking backend IDs, never infer concurrency from sleeps.
const sessions=[]
async function open(owner){const s=await new Session().open();sessions.push(s);await s.run(attempt);if(owner)await s.run(auth(owner).replaceAll('SET LOCAL','SET'));return s}
const one=async(s,sql)=>(await s.run(sql))[0]
const rpc=(s,expression)=>one(s,`SELECT pg_temp.attempt(${q('SELECT '+expression)});`)
const observer=await open()
async function waitBlocked(waiter,blocker,event='advisory'){
 const until=Date.now()+6000
 while(Date.now()<until){const r=await one(observer,`SELECT jsonb_build_object('blocked',${blocker.pid}=ANY(pg_blocking_pids(${waiter.pid})),'event',(SELECT wait_event FROM pg_stat_activity WHERE pid=${waiter.pid}));`)
  if(r.blocked){if(event)assert.equal(r.event,event);return r}await new Promise(resolve=>setTimeout(resolve,30))}
 throw Error('No observed PostgreSQL wait: '+waiter.pid+' -> '+blocker.pid)
}
async function concurrency(name,fn){await fn();checks.push({name,status:'PASS'});save('concurrency-'+checks.length+'.json',{name,status:'PASS',cohort});console.log('PASS '+name)}
async function pair(){const owner=randomUUID();cohort.push(owner);query('BEGIN;'+seed(owner)+auth(owner)+`SELECT ${book(receipt('2025-01-10',1000))};RESET ROLE;COMMIT;`);return {owner,a:await open(owner),b:await open(owner)}}
try {
 await concurrency('Close first: older posting waits, then rejects fresh committed boundary; other owner proceeds',async()=>{
  const f=await pair(),other=randomUUID();cohort.push(other);query('BEGIN;'+seed(other)+'COMMIT;');const c=await open(other)
  await f.b.run('BEGIN;');ok(await rpc(f.b,'public.close_year_atomic(2025)'))
  const pending=rpc(f.a,book(receipt('2024-12-30')));pending.catch(()=>{});await waitBlocked(f.a,f.b)
  ok(await rpc(c,book(receipt('2024-01-10'))));await f.b.run('COMMIT;');denied(await pending)
  const r=await one(f.a,state(f.owner));assert.equal(r.balances['1930'],1000)
 })
 await concurrency('Older booking first: close waits, then requires newly committed 2024 before 2025',async()=>{
  const f=await pair();await f.a.run('BEGIN;');ok(await rpc(f.a,book(receipt('2024-12-30'))))
  const pending=rpc(f.b,'public.close_year_atomic(2025)');pending.catch(()=>{});await waitBlocked(f.b,f.a);await f.a.run('COMMIT;');denied(await pending,/låsa 2024 först/)
 })
 await concurrency('Current booking first: close waits and includes complete 1500kr journal',async()=>{
  const f=await pair();await f.a.run('BEGIN;');ok(await rpc(f.a,book(receipt('2025-12-30'))))
  const pending=rpc(f.b,'public.close_year_atomic(2025)');pending.catch(()=>{});await waitBlocked(f.b,f.a);await f.a.run('COMMIT;');ok(await pending)
  const r=await one(f.a,state(f.owner));assert.equal(r.balances['1930'],1500)
 })
 await concurrency('Aborted year close: waiting older posting proceeds without stale rejection',async()=>{
  const f=await pair();await f.b.run('BEGIN;');ok(await rpc(f.b,'public.close_year_atomic(2025)'))
  const pending=rpc(f.a,book(receipt('2024-12-30')));pending.catch(()=>{});await waitBlocked(f.a,f.b);await f.b.run('ROLLBACK;');ok(await pending)
 })
 await concurrency('Aborted older posting: close sees no ghost year and succeeds',async()=>{
  const f=await pair();await f.a.run('BEGIN;');ok(await rpc(f.a,book(receipt('2024-12-30'))))
  const pending=rpc(f.b,'public.close_year_atomic(2025)');pending.catch(()=>{});await waitBlocked(f.b,f.a);await f.a.run('ROLLBACK;');ok(await pending)
 })
 await concurrency('Concurrent same-key retry preserves one journal and exact receipt',async()=>{
  const f=await pair(),payload=receipt('2025-12-30');await f.a.run('BEGIN;');const first=ok(await rpc(f.a,book(payload)))
  const pending=rpc(f.b,book(payload));pending.catch(()=>{});await waitBlocked(f.b,f.a);await f.a.run('COMMIT;');const replay=ok(await pending)
  assert.equal(replay.idempotent_replay,true);assert.equal(replay.transaction_id,first.transaction_id)
 })
 await concurrency('Parent date move vs journal insertion: committed parent date rechecked under row lock',async()=>{
  const owner=randomUUID(),parent=randomUUID();cohort.push(owner)
  query('BEGIN;'+seed(owner)+fixtureLock(owner)+`INSERT INTO transactions(id,user_id,date,description,amount,booked) VALUES(${q(parent)},${q(owner)},'2026-01-10','KAN122 concurrent date fixture',500,false);COMMIT;`)
  const a=await open(),b=await open();await a.run('BEGIN;');await a.run(`UPDATE transactions SET date='2024-12-30' WHERE id=${q(parent)};`)
  const pending=one(b,command(`INSERT INTO journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES(${q(parent)},${q(owner)},1,'2026-01-10','1930',500,0)`));pending.catch(()=>{});await waitBlocked(b,a,null);await a.run('COMMIT;');denied(await pending)
 })
} finally {for(const s of sessions)await s.close()}
const columns=query("SELECT jsonb_object_agg(table_name,cols) FROM (SELECT table_name,jsonb_agg(column_name) cols FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) c;")[0]
const retainedSQL="SELECT jsonb_build_object("+[...tables.map(t=>[t,'public.'+t,columns[t].includes('user_id')?'user_id':columns[t].includes('id')&&t==='profiles'?'id':null]),['auth','auth.users','id']].map(([k,t,col])=>q(k)+",(SELECT jsonb_build_object('count',count(*),'digest',md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,''))) FROM "+t+" x"+(col?' WHERE '+col+' NOT IN ('+cohort.map(q).join(',')+')':'')+")").join(',')+");"
assert.deepEqual(query(retainedSQL+functionSQL+catalogSQL),before,'ALL preexisting data, functions and table contracts must remain unchanged')
save('result.json',{status:'PASS',database,host:'127.0.0.1',port:5432,oid:69031,marker,migration,checks,cohort,allPriorDataUnchanged:true})
console.log('KAN122 '+checks.length+' checks PASS. Evidence: '+run)
