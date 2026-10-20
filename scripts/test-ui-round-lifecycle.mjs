// Explicitly local, rollback-only RPC lifecycle + actual report/NE/dashboard consumers.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { calculateVatReportFromLoadedRows } from '../src/lib/vatReportService.ts'
import { dashboardVatBreakdownFromReportResult } from '../src/lib/dashboardVat.ts'
import { calculateDashboard } from '../src/lib/calculations.ts'
import { calculateNeBalanceDiff } from '../src/lib/neBalance.ts'

const db=process.env.SOLOLEDGER_UI_TEST_DB
if(db!=='sololedger_kan84_operator_20261015')throw Error('Use the verified isolated local database allowlist.')
if(!process.env.PGPASSFILE)throw Error('Set local PGPASSFILE without reading its contents.')
const env={...process.env,PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'}
for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD'])delete env[key]
const args=['-X','-w','-h','localhost','-p','5432','-U','postgres','-d',db,'-Atq','-v','ON_ERROR_STOP=1']
function query(sql){const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',args,{input:sql,env,encoding:'utf8',timeout:40000,maxBuffer:8*1024*1024,windowsHide:true});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim()}
const destination=JSON.parse(query("select jsonb_build_object('database',current_database(),'address',host(inet_server_addr()))"))
assert.equal(destination.database,db);assert(['127.0.0.1','::1'].includes(destination.address))
// No persistent schema changes or other users' rows: only a new random owner, inside BEGIN/ROLLBACK.
const before=query("select jsonb_build_object('users',(select count(*) from auth.users),'tx',(select count(*) from transactions),'journal',(select count(*) from journal_entries),'invoices',(select count(*) from customer_invoices),'bookings',(select count(*) from customer_invoice_bookings))")
const sql=`BEGIN;
SET LOCAL statement_timeout='20s';
CREATE TEMP TABLE evidence(label text, data jsonb) ON COMMIT DROP;
CREATE FUNCTION pg_temp.capture(label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE uid uuid:=auth.uid();BEGIN
 INSERT INTO evidence VALUES(label,jsonb_build_object(
 'userId',uid,
 'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM transactions t WHERE user_id=uid),'[]'::jsonb),
 'journalRows',coalesce((SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM journal_entries j WHERE user_id=uid),'[]'::jsonb),
 'invoices',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM customer_invoices i WHERE user_id=uid),'[]'::jsonb),
 'bookings',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM customer_invoice_bookings b WHERE user_id=uid),'[]'::jsonb),
 'vatV2Snapshots','[]'::jsonb,
 'vatPeriods',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY id) FROM vat_periods v WHERE user_id=uid),'[]'::jsonb),
 'balances2026',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM get_period_account_balances('2026-01-01','2026-12-31') x),
 'balances2027',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM get_period_account_balances('2027-01-01','2027-12-31') x),
 'cumulative2026',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM get_cumulative_account_balances('2026-12-31') x),
 'cumulative2027',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM get_cumulative_account_balances('2027-12-31') x)));
END $$;
DO $$ DECLARE uid uuid:=gen_random_uuid(); iid uuid; result jsonb; rate int; treatment text; scenario text;
BEGIN
 INSERT INTO auth.users(id) VALUES(uid);
 INSERT INTO profiles(id,email,vat_status,domestic_sales_vat_treatment,vat_period_type,vat_management_from,foreign_purchase_reporting,default_deduction_entitlement)
 VALUES(uid,'synthetic-ui-round@example.invalid','registered','taxable','quarter','2026-01-01','required','full');
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
 FOR scenario IN SELECT unnest(ARRAY['same','cross','exempt']) LOOP
  treatment:=CASE WHEN scenario='exempt' THEN 'exempt' ELSE 'taxable' END;
  rate:=CASE WHEN treatment='exempt' THEN NULL ELSE 25 END;
  result:=create_customer_invoice_atomic(jsonb_build_object('invoice_number','UI-'||scenario,'customer_name','Synthetic only',
   'invoice_date',CASE WHEN scenario='same' THEN '2026-10-01' ELSE '2026-12-20' END,
   'service_date',CASE WHEN scenario='same' THEN '2026-10-01' ELSE '2026-12-20' END,
   'due_date','2027-01-20','gross_amount',CASE WHEN scenario='exempt' THEN 1000 ELSE 1250 END,
   'vat_treatment',treatment,'vat_rate',rate,'attachment_url',uid::text||'/synthetic.pdf'));
  iid:=(result->>'invoice_id')::uuid;
  PERFORM pg_temp.capture(scenario||'-created');
  IF scenario='same' THEN
   PERFORM record_customer_invoice_payment_atomic(iid,'2026-10-10',gen_random_uuid());
   PERFORM pg_temp.capture('same-paid');
   PERFORM undo_customer_invoice_payment_atomic(iid,gen_random_uuid());
   PERFORM pg_temp.capture('same-undone');
  ELSE
   -- Cross-year payment before a receivable must remain blocked.
   BEGIN
    PERFORM record_customer_invoice_payment_atomic(iid,'2027-01-15',gen_random_uuid());
    RAISE EXCEPTION 'Unexpected cross-year payment without receivable';
   EXCEPTION WHEN check_violation THEN NULL; END;
   PERFORM book_customer_invoice_year_end_receivable_atomic(iid,2026,gen_random_uuid());
   PERFORM pg_temp.capture(scenario||'-receivable');
   PERFORM settle_customer_invoice_receivable_atomic(iid,'2027-01-15',gen_random_uuid());
   PERFORM pg_temp.capture(scenario||'-settled');
   PERFORM undo_customer_invoice_payment_atomic(iid,gen_random_uuid());
   PERFORM pg_temp.capture(scenario||'-undone');
  END IF;
 END LOOP;
 INSERT INTO accounts(id,user_id,name,debit_account,credit_account,default_vat_rate)
 VALUES('egen_insattning',uid,'Synthetic deposit','1930','2018',0);
 PERFORM book_transaction_atomic(jsonb_build_object('date','2026-10-17','description','Synthetic deposit','amount',100,'type','egen_insattning','vat_rate',0,'input_vat_deduction_entitlement','profile_default'));
 PERFORM pg_temp.capture('deposit');
END $$;
SELECT jsonb_object_agg(label,data) FROM evidence;
ROLLBACK;`
const evidence=JSON.parse(query(sql))
assert.equal(query("select jsonb_build_object('users',(select count(*) from auth.users),'tx',(select count(*) from transactions),'journal',(select count(*) from journal_entries),'invoices',(select count(*) from customer_invoices),'bookings',(select count(*) from customer_invoice_bookings))"),before,'All fixture rows rolled back')
mkdirSync('test-results/ui-round',{recursive:true});writeFileSync('test-results/ui-round/lifecycle.json',JSON.stringify(evidence,null,2))

// Run the real getNEData with exactly the local RPC balance results; only transport is mocked.
const neBundle=await build({stdin:{contents:"export {getNEData} from './src/lib/accountingService'",resolveDir:process.cwd(),loader:'ts'},tsconfig:'tsconfig.json',bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'local-rpc-evidence',setup(b){
 b.onResolve({filter:/supabaseClient$/},()=>({path:'rpc-evidence',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={rpc:async(name,args)=>{const data=globalThis.__uiRoundEvidence;const year=(args.p_end_date??args.p_through_date).slice(0,4);if(name==='get_period_account_balances')return {data:data['balances'+year],error:null};if(name==='get_cumulative_account_balances')return {data:data['cumulative'+year],error:null};throw Error('Unexpected RPC '+name)}}`}))
}}]})
const neModule={exports:{}};new Function('module','exports','require',neBundle.outputFiles[0].text)(neModule,neModule.exports,createRequire(import.meta.url))
async function summary(label,year){
 const data=evidence[label];globalThis.__uiRoundEvidence=data
 const report=calculateVatReportFromLoadedRows({userId:data.userId,startDate:year+'-01-01',endDate:year+'-12-31',rows:data})
 assert.equal(report.status,'ready',JSON.stringify(report.errors))
 const balances=Object.fromEntries(data['balances'+year].map(r=>[r.account_number,Number(r.balance)]))
 const dashboard=calculateDashboard(balances,30,dashboardVatBreakdownFromReportResult(report))
 const ne=await neModule.exports.getNEData(year)
 assert.equal(calculateNeBalanceDiff(ne),0,label+' NE balance identity')
 return {report:report.report,ne,dashboard}
}
function invoice(label,scenario){return evidence[label].invoices.find(i=>i.invoice_number==='UI-'+scenario)}
function txRows(label,scenario,kind){const data=evidence[label];const i=invoice(label,scenario);const b=data.bookings.find(b=>b.invoice_id===i.id&&b.booking_kind===kind);assert(b,kind);return data.journalRows.filter(j=>j.transaction_id===b.transaction_id)}
function amounts(rows){return Object.fromEntries(rows.map(j=>[j.account_number,Number(j.debit)-Number(j.credit)]))}
assert.deepEqual(amounts(txRows('same-paid','same','payment_same_year')),{'1930':1250,'3010':-1000,'2611':-250})
assert.deepEqual(amounts(txRows('cross-receivable','cross','year_end_receivable')),{'1510':1250,'3010':-1000,'2611':-250})
assert.deepEqual(amounts(txRows('cross-settled','cross','receivable_settlement')),{'1930':1250,'1510':-1250})
assert.deepEqual(amounts(txRows('cross-undone','cross','receivable_settlement_reversal')),{'1930':-1250,'1510':1250})
assert.deepEqual(amounts(txRows('exempt-receivable','exempt','year_end_receivable')),{'1510':1000,'3010':-1000})
assert.equal(invoice('cross-settled','cross').paid_at,'2027-01-15')
assert.equal(invoice('cross-undone','cross').payment_status,'unpaid')
assert.equal(invoice('same-paid','same').paid_at,'2026-10-10')
const same=await summary('same-paid',2026),sameUndo=await summary('same-undone',2026)
assert.equal(same.report.fields['10'],250);assert.equal(same.ne.R1,1000);assert.equal(same.dashboard.bankSaldo,1250);assert.equal(same.dashboard.sakertUttag,700)
assert.equal(sameUndo.report.fields['10'],0);assert.equal(sameUndo.ne.R1,0);assert.equal(sameUndo.dashboard.bankSaldo,0)
const cross=await summary('cross-receivable',2026),settledOld=await summary('cross-settled',2026),settledNew=await summary('cross-settled',2027),undoneNew=await summary('cross-undone',2027)
assert.equal(cross.ne.B7,1250);assert.equal(cross.ne.R1,1000);assert.equal(cross.report.fields['10'],250)
assert.deepEqual(cross,settledOld,'Later payment must leave invoice-year reports unchanged')
assert.equal(settledNew.ne.B7,0);assert.equal(settledNew.ne.B9,1250);assert.equal(settledNew.ne.R1,0);assert.equal(settledNew.report.fields['10'],0);assert.equal(settledNew.dashboard.bankSaldo,1250)
assert.equal(undoneNew.ne.B7,1250);assert.equal(undoneNew.ne.B9,0);assert.equal(undoneNew.report.fields['10'],0)
const exemptBefore=await summary('exempt-created',2026),exempt=await summary('exempt-receivable',2026),exemptPaid=await summary('exempt-settled',2027)
// Baseline caveat: existing RPC books exempt sales to 3010, which the current
// NE engine maps to R1. Verify no new effect, but do NOT certify R2 correctness.
assert.equal(exempt.ne.bokfortResultat-exemptBefore.ne.bokfortResultat,1000);
assert.equal(exempt.ne.R1-exemptBefore.ne.R1,1000);
assert.equal(exempt.ne.R2-exemptBefore.ne.R2,0);assert.equal(exempt.report.fields['10'],250,'Exempt adds no VAT')
assert.equal(exemptPaid.ne.B7,1250,'Only the earlier undone taxable receivable remains');assert.equal(exemptPaid.ne.R1,0);assert.equal(exemptPaid.report.fields['10'],0)
const deposit=evidence.deposit.transactions.find(t=>t.description==='Synthetic deposit')
assert.deepEqual(amounts(evidence.deposit.journalRows.filter(j=>j.transaction_id===deposit.id)),{'1930':100,'2018':-100})
const beforeDeposit=await summary('exempt-undone',2026),afterDeposit=await summary('deposit',2026)
assert.equal(afterDeposit.ne.R1,beforeDeposit.ne.R1);assert.equal(afterDeposit.ne.R2,beforeDeposit.ne.R2);assert.equal(afterDeposit.report.fields['10'],beforeDeposit.report.fields['10']);assert.equal(afterDeposit.dashboard.bankSaldo-beforeDeposit.dashboard.bankSaldo,100)
for(const data of Object.values(evidence))for(const i of data.invoices){
 const fields=['vat_policy_snapshot_status','vat_policy_vat_status','vat_policy_domestic_sales_vat_treatment','vat_policy_captured_at','vat_policy_source'];
 const original=Object.values(evidence).flatMap(d=>d.invoices).find(original=>original.id===i.id);
 assert.equal(i.vat_policy_snapshot_status,'captured');
 assert.deepEqual(fields.map(k=>i[k]),fields.map(k=>original[k]),'Original invoice VAT snapshot unchanged');
}
console.log('PASS KAN-67 lifecycle: actual local RPCs, same-year/undo, year-end/settlement/undo, taxable/exempt; journal, VAT, real getNEData/balances, dashboard; all synthetic rows rolled back')
console.log('KNOWN BASELINE LIMIT: exempt customer invoice is posted to 3010/R1, not R2; unchanged local/Staging function and main NE engine. Requires separate leader decision, no accounting fix in this UI scope.')
console.log('PASS KAN-85: actual 100 kr deposit journal 1930 D / 2018 K, zero VAT/result effect')
