// Existing isolated synthetic DB only. Every fixture/import/undo is rolled back.
// No migrations, installed functions, app env or hosted connections.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadSieTestApi, normalBook, book, balances, balanceSheet, fakeDb, economicContent } from './sie-export-test-fixtures.mjs'
const database='sololedger_kan117_recovery_20261027'
const marker='KAN117 recovery synthetic only 168702b9-8608-4e93-b30d-4fbc93490ff2'
const env=Object.fromEntries(['SystemRoot','WINDIR','PATH'].map(k=>[k,process.env[k]]))
Object.assign(env,{PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf',PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'})
function query(sql) {
  const r=spawnSync('C:/Program Files/PostgreSQL/17/bin/psql.exe',['-X','-w','-h','localhost','-p','5432','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1'],{env,input:sql,encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:25e6})
  assert.equal(r.status,0,r.stderr)
  return r.stdout.trim()
}
const lit=x=>"'"+String(x).replaceAll("'","''")+"'", json=x=>lit(JSON.stringify(x))+'::jsonb'
const identity=JSON.parse(query("BEGIN READ ONLY;SELECT json_build_object('db',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'user',current_user,'version',current_setting('server_version_num')::int/10000,'marker',shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'));ROLLBACK;"))
assert.deepEqual(identity,{db:database,host:'127.0.0.1',port:5432,user:'postgres',version:17,marker})
const guard=`DO $g$ BEGIN IF current_database()<>${lit(database)} OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port()<>5432 OR session_user<>'postgres' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') IS DISTINCT FROM ${lit(marker)} THEN RAISE EXCEPTION 'KAN108 wrong local target'; END IF; END $g$;`
const tables=JSON.parse(query("BEGIN READ ONLY;SELECT json_agg(schemaname||'.'||tablename ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname='public' OR (schemaname='auth' AND tablename='users');ROLLBACK;"))
const digestSQL=`SELECT json_build_object('tables',json_build_object(${tables.flatMap(table=>{assert.match(table,/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/);const row=table==='auth.users'?"jsonb_build_object('id',t.id,'created_at',t.created_at,'updated_at',t.updated_at,'deleted_at',t.deleted_at)":'to_jsonb(t)';return [lit(table),`(SELECT md5(coalesce(string_agg((${row})::text,'' ORDER BY (${row})::text),'')) FROM ${table} t)`]}).join(',')}),'functions',(SELECT md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'' ORDER BY oid)) FROM pg_proc WHERE pronamespace='public'::regnamespace AND prokind='f'));`
const before=query('BEGIN READ ONLY;'+guard+digestSQL+'ROLLBACK;')
const expired=query('BEGIN READ ONLY;SELECT count(*) FROM public.sie_import_inputs WHERE expires_at<=clock_timestamp();ROLLBACK;')
assert.equal(expired,'0','Avoid even temporary cleanup of existing receipts')
const api=await loadSieTestApi(),results=[]
globalThis.fetch=()=>{throw Error('Hosted/network access forbidden in local DB test')}
const exportBook=(b,y)=>api.exportSIEForUserFromDb(fakeDb(b.tables),b.owner,y,async yr=>balanceSheet(b,yr),new Date('2026-10-29T12:00:00Z'))
const reject=(sql,state)=>`DO $negative$ BEGIN BEGIN ${sql}; RAISE EXCEPTION 'Expected rejection missing' USING ERRCODE='ZX108'; EXCEPTION WHEN SQLSTATE '${state}' THEN NULL; END; END $negative$;`
function seed(uid){return `DO $seed$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE id=${lit(uid)}) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=${lit(uid)}) THEN RAISE EXCEPTION 'Synthetic identity collision';END IF;INSERT INTO auth.users(id) VALUES(${lit(uid)});UPDATE public.profiles SET company_name='KAN108 synthetic',org_nr='000000-0000',vat_status='not_registered',domestic_sales_vat_treatment='small_business_exempt',foreign_purchase_reporting='not_required',default_deduction_entitlement='none' WHERE id=${lit(uid)};END $seed$;`}
function registration(uid,payload,hash) {return `RESET ROLE;SET LOCAL request.jwt.claim.role='service_role';SELECT public.register_sie_import_input(${lit(uid)},${json(payload)},'${payload.fiscal_year}-01-01','${payload.fiscal_year}-12-31',${lit(hash)}) AS receipt
\\gset
SELECT set_config('kan108.receipt',:'receipt',true) AS hidden
\\gset
SET LOCAL request.jwt.claim.sub=${lit(uid)};SET LOCAL request.jwt.claim.role='authenticated';SET LOCAL ROLE authenticated;
`}
const fixtureCases=[['normal',()=>normalBook()],['loss',()=>{const b=book();b.add(2026,{1930:1000,2018:-1000});b.add(2027,{1930:-300,5420:300});b.add(2028,{1930:500,3010:-500});return b}],['IB and transferred result',()=>{const b=book();b.add(2026,{1930:1000,2010:-700,2019:-300},{source:'sie_opening_balance',date:'2026-01-01'});b.add(2027,{1930:800,3010:-800});b.add(2027,{8999:800,2019:-800});b.add(2028,{1930:500,3010:-500});return b}]]
fixtureCases.push(
  ['zero current result / empty intermediate year',()=>{const b=book();b.add(2026,{1930:800,3010:-800});b.add(2028,{1930:100,3010:-100});b.add(2028,{1930:-100,5420:100});return b}],
  ['dated correction',()=>{const b=book();b.add(2026,{1930:1000,2018:-1000});b.add(2026,{1930:-100,5420:100});b.add(2028,{1930:100,5420:-100},{is_correction:true,corrects_ver_nr:2,description:'Korrigering av VER-2'});return b}],
  ['partial result transfer',()=>{const b=book();b.add(2026,{1930:800,3010:-800});b.add(2027,{8999:300,2019:-300});b.add(2028,{1930:500,3010:-500});return b}],
  ['current-year transfer',()=>{const b=book();b.add(2026,{1930:800,3010:-800});b.add(2028,{8999:800,2019:-800});b.add(2028,{1930:500,3010:-500});return b}],
)
try {
  for(const [name,make]of fixtureCases) {
    const source=make(),text=await exportBook(source,2028),parsed=api.parseSieFile(text,{strictImport:true})
    assert.deepEqual(parsed.errors,[])
    const payload=await api.buildSieImportPayload(parsed,'KAN108-synthetic.se'),uid=randomUUID(),other=randomUUID(),hash=createHash('sha256').update(text).digest('hex')
    const setup=`BEGIN;${guard}${seed(uid)}${seed(other)}${registration(uid,payload,hash)}SELECT public.import_sie_batch(jsonb_build_object('receipt_id',:'receipt')) AS imported
\\gset
`
    const snapshot=`SELECT json_build_object('transactions',(SELECT coalesce(json_agg(t),'[]') FROM public.transactions t WHERE user_id=${lit(uid)}),'journal_entries',(SELECT coalesce(json_agg(j),'[]') FROM public.journal_entries j WHERE user_id=${lit(uid)}),'accounts','[]'::json,'profiles',(SELECT json_agg(p) FROM public.profiles p WHERE id=${lit(uid)}),'annual',(SELECT json_object_agg(account_number,balance) FROM public.get_period_account_balances('2028-01-01','2028-12-31')),'cumulative',(SELECT json_object_agg(account_number,balance) FROM public.get_cumulative_account_balances('2028-12-31')),'sales',public.get_ne_sales_summary(2028));`
    // Actual import, duplicate receipt/hash and RLS checks; everything rolls back.
    const data=JSON.parse(query(setup+registration(uid,payload,hash)
      +`SET LOCAL request.jwt.claim.sub=${lit(other)};`
      +reject("PERFORM public.import_sie_batch(jsonb_build_object('receipt_id',current_setting('kan108.receipt')))",'P2075')
      +`SET LOCAL request.jwt.claim.sub=${lit(uid)};`
      +reject("PERFORM public.import_sie_batch(jsonb_build_object('receipt_id',current_setting('kan108.receipt')))",'23505')
      +reject("PERFORM public.import_sie_batch(jsonb_build_object('receipt_id','00000000-0000-0000-0000-000000000000'))",'P2075')
      +snapshot+`DO $undo$ BEGIN PERFORM public.undo_sie_import_atomic((SELECT id FROM public.import_batches WHERE user_id=${lit(uid)} LIMIT 1));IF EXISTS(SELECT 1 FROM public.get_cumulative_account_balances('2030-12-31') WHERE balance<>0) THEN RAISE EXCEPTION 'Undo changed economic net';END IF;END $undo$;SET LOCAL request.jwt.claim.sub=${lit(other)};DO $rls$ BEGIN IF EXISTS(SELECT 1 FROM public.transactions WHERE user_id=${lit(uid)}) OR EXISTS(SELECT 1 FROM public.journal_entries WHERE user_id=${lit(uid)}) THEN RAISE EXCEPTION 'RLS leak';END IF;END $rls$;ROLLBACK;`))
    const imported={owner:uid,tables:{transactions:data.transactions,journal_entries:data.journal_entries,accounts:[],profiles:data.profiles}}
    const again=api.parseSieFile(await exportBook(imported,2028),{strictImport:true});assert.deepEqual(again.errors,[]);assert.deepEqual(economicContent(again),economicContent(parsed))
    const report=api.calculateNeReport({annualBalances:data.annual,cumulativeBalances:data.cumulative,balanceSheetBalances:Object.fromEntries(Object.entries(data.cumulative).filter(([a])=>/^[12]/.test(a))),neSalesClassification:api.parseNeSalesSummary(data.sales)})
    const sourceCumulative=balances(source,2028),sourceAnnual=balances(source,2028,true)
    const sourceReport=api.calculateNeReport({annualBalances:sourceAnnual,cumulativeBalances:sourceCumulative,balanceSheetBalances:balanceSheet(source,2028),neSalesClassification:api.parseNeSalesSummary(data.sales)})
    assert.deepEqual({bank:report.bank,capital:report.B10_total,result:report.R11},{bank:sourceReport.bank,capital:sourceReport.B10_total,result:sourceReport.R11})
    if(name==='normal')assert.deepEqual({bank:report.bank,capital:report.B10_total,result:report.R11},{bank:1930,capital:1930,result:500})
    results.push({name,bank:report.bank,capital:report.B10_total,result:report.R11,roundTrip:'PASS',isolation:'PASS',duplicates:'PASS',receiptOwnership:'PASS',undo:'PASS'})
    console.log('PASS actual local import/report/re-export: '+name)
  }
  // Protected import into a closed year or VAT period must stay rejected.
  for(const protection of ['year','vat']) {
    const uid=randomUUID(),b=book();b.add(2024,{1930:1000,2018:-1000});b.add(2024,{1930:-125,5420:100,2641:25});
    const text=await exportBook(b,2024),parsed=api.parseSieFile(text,{strictImport:true});assert.deepEqual(parsed.errors,[])
    const payload=await api.buildSieImportPayload(parsed,'KAN108-protection.se'),hash=createHash('sha256').update(text).digest('hex')
    const protectedState=protection==='year'
      ? `SET LOCAL request.jwt.claim.sub=${lit(uid)};SET LOCAL ROLE authenticated;DO $lock$ BEGIN PERFORM public.close_year_atomic(2024);END $lock$;RESET ROLE;`
      : `INSERT INTO public.vat_periods(user_id,period_start,period_end,period_type,status,source,closing_amount) VALUES(${lit(uid)},'2024-01-01','2024-12-31','year','closed','sololedger',0);`
    query(`BEGIN;${guard}${seed(uid)}${protectedState}${registration(uid,payload,hash)}`
      +reject("PERFORM public.import_sie_batch(jsonb_build_object('receipt_id',current_setting('kan108.receipt')))",'23514')
      +`DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM public.transactions WHERE user_id=${lit(uid)}) OR EXISTS(SELECT 1 FROM public.import_batches WHERE user_id=${lit(uid)}) THEN RAISE EXCEPTION 'Rejected import wrote rows';END IF;END $empty$;ROLLBACK;`)
    results.push({protection,status:'PASS'});console.log('PASS actual local '+protection+' lock rejects import atomically')
  }
} finally {
  const after=query('BEGIN READ ONLY;'+guard+digestSQL+'ROLLBACK;')
  assert.equal(after,before,'Existing public rows, Auth identities/lifecycle and deployed definitions/ACL must remain unchanged')
}
mkdirSync('coverage/kan108-local',{recursive:true});writeFileSync('coverage/kan108-local/database.json',JSON.stringify({identity,results,unchanged:true,limitations:['Local schema predates KAN96; no migration installed. KAN96 is verified by its separate unchanged safety suite.']},null,2))
console.log('PASS local DB rollback / existing data and functions unchanged')
