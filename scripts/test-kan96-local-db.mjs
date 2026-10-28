// Explicitly isolated synthetic database; no hosted credentials or app env.
// The candidate schema is restored in finally. Existing rows are never edited.
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
const require=createRequire(import.meta.url)
const database='sololedger_kan117_recovery_20261027'
const marker='KAN117 recovery synthetic only 168702b9-8608-4e93-b30d-4fbc93490ff2'
const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:process.env.PATH,
  PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf',PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8'}
const exe='C:/Program Files/PostgreSQL/17/bin/psql.exe'
const args=['-X','-w','-h','localhost','-p','5432','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1']
function query(sql){const r=spawnSync(exe,args,{env,input:sql,encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:25e6});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
const literal=x=>"'"+String(x).replaceAll("'","''")+"'"
const json=x=>literal(JSON.stringify(x))+'::jsonb'
const identity=JSON.parse(query("SELECT json_build_object('db',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'user',current_user,'marker',shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database'));"))
assert.deepEqual(identity,{db:database,host:'127.0.0.1',port:5432,user:'postgres',marker})
const guard=`DO $g$ BEGIN IF current_database()<>${literal(database)} OR host(inet_server_addr())<>'127.0.0.1' OR inet_server_port()<>5432 OR session_user<>'postgres' OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database')<>${literal(marker)} THEN RAISE EXCEPTION 'KAN96 wrong local target';END IF;END $g$;`
assert.equal(query("SELECT count(*) FROM pg_proc WHERE proname='get_result_closing_review' AND pronamespace='public'::regnamespace;"),'0','Never overwrite an existing candidate')
const names="'close_year_atomic','get_ne_sales_summary','get_withdrawal_context'"
const preserved=query("SELECT md5(coalesce(string_agg(x::text,'' ORDER BY x::text),'')) FROM (SELECT jsonb_build_object('table','journal','row',to_jsonb(j)) x FROM public.journal_entries j UNION ALL SELECT jsonb_build_object('table','transactions','row',to_jsonb(t)) FROM public.transactions t UNION ALL SELECT jsonb_build_object('table','locks','row',to_jsonb(c)) FROM public.closed_years c UNION ALL SELECT jsonb_build_object('table','archive','row',to_jsonb(a)) FROM public.declaration_source_snapshots a UNION ALL SELECT jsonb_build_object('table','versions','row',to_jsonb(r)) FROM public.declaration_revisions r UNION ALL SELECT jsonb_build_object('table','vat','row',to_jsonb(v)) FROM public.vat_periods v) evidence;")
const original=JSON.parse(query(`SELECT json_agg(json_build_object('name',proname,'definition',pg_get_functiondef(oid),'acl',proacl::text,'hash',md5(pg_get_functiondef(oid)))) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (${names});`))
assert.equal(original.length,3)
assert.equal(query("SELECT has_table_privilege('authenticated','public.closed_years','INSERT');"),'f','No direct table bypass of the year-lock RPC')
if(process.argv.includes('--access')) {
  console.log(query("SELECT json_build_object('closed_years_authenticated_insert',has_table_privilege('authenticated','public.closed_years','INSERT'),'policies',(SELECT json_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename='closed_years'));"));process.exit(0)
}
if(process.argv.includes('--inspect')) {
    console.log(query("SELECT json_agg(json_build_object('name',column_name,'type',data_type)) FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles'; SELECT json_agg(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.profiles'::regclass; SELECT json_agg(json_build_object('name',proname,'args',pg_get_function_identity_arguments(oid))) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('create_correction_transaction_atomic','undo_sie_import_atomic');"));process.exit(0)
}
const bundle=await build({stdin:{contents:"export {calculateNeReport} from './src/lib/neCalculation';export {calculateDashboard} from './src/lib/calculations';export {parseSieFile} from './src/lib/sieParser';export {buildSieImportPayload} from './src/lib/sieImportPayload';",loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',packages:'external'})
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports)
const api=mod.exports,ids=[],receipts=[]
const seed=(uid)=>`DO $seed$ BEGIN
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=${literal(uid)}) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=${literal(uid)})
  THEN RAISE EXCEPTION 'Fresh test identity collision; refusing to touch existing user'; END IF;
  INSERT INTO auth.users(id) VALUES(${literal(uid)});
  -- The auth trigger creates this exact fresh profile in this transaction.
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=${literal(uid)}) THEN RAISE EXCEPTION 'Expected new synthetic profile missing'; END IF;
  UPDATE public.profiles SET company_name=${literal('KAN96 synthetic '+uid)},vat_status='not_registered',domestic_sales_vat_treatment='small_business_exempt',
    foreign_purchase_reporting='not_required',default_deduction_entitlement='none' WHERE id=${literal(uid)};
END $seed$;SET LOCAL request.jwt.claim.sub=${literal(uid)};`
function journal(uid,rows,source='manual',date='2024-12-31',extra='',rowDate=date) {
  return `DO $j$ DECLARE tx uuid:=gen_random_uuid();nr integer;BEGIN SELECT public.get_next_ver_nr(${literal(uid)}) INTO nr;
    INSERT INTO public.transactions(id,user_id,date,description,amount,booked,source) VALUES(tx,${literal(uid)},${literal(date)},'KAN96 synthetic only',${Object.values(rows).filter(n=>n>0).reduce((s,n)=>s+n,0)},true,${literal(source)});
    ${Object.entries(rows).map(([a,n])=>`INSERT INTO public.journal_entries(transaction_id,user_id,ver_nr,date,account_number,debit,credit) VALUES(tx,${literal(uid)},nr,${literal(rowDate)},${literal(a)},${Math.max(n,0)},${Math.max(-n,0)});`).join('')}
    ${extra} END $j$;`
}
const auth=uid=>`SET LOCAL request.jwt.claim.sub=${literal(uid)};SET LOCAL ROLE authenticated;`
const sale={1930:1000,3010:-1000},expense={1930:-200,5420:200},closing={3010:1000,5420:-200,8999:-800}
const cases=[
 ['ordinary',[sale,expense],false],
 ['full-profit',[sale,expense,closing,{8999:800,2019:-800}],true],
 ['technical-chain',[sale,expense,{3010:1000,5420:-200,8990:-800},{8990:800,8999:-800},{8999:800,2019:-800}],true],
 ['partial-profit',[sale,expense,{3010:400,8999:-400}],true],
 ['full-loss',[{1930:2000,2018:-2000},{1930:-1000,5420:1000},{5420:-1000,8999:1000},{8999:-1000,2019:1000}],true],
 ['partial-loss',[{1930:2000,2018:-2000},{1930:-1000,5420:1000},{5420:-400,8999:400},{8999:-400,2019:400}],true],
 ['true-zero',[sale,{1930:-1000,5420:1000}],false],
 ['closed-zero',[sale,{1930:-1000,5420:1000},{3010:1000,8999:-1000},{5420:-1000,8999:1000}],true],
 ['tax-adjustment-zero',[sale,{1930:-1000,6992:1000}],false],
 ['closed-tax-adjustment-zero',[sale,{1930:-1000,6992:1000},{3010:1000,8999:-1000},{6992:-1000,8999:1000}],true],
 ['tax-free',[{1930:1000,8314:-1000}],false],
 ['closed-tax-free',[{1930:1000,8314:-1000},{8314:1000,8999:-1000},{8999:1000,2019:-1000}],true],
 ['pure-transfer',[sale,expense,{8999:800,2019:-800}],false],
 ['opening',[{1930:800,2019:-800}],false],
 ['full-reversal',[sale,expense,closing,{3010:-1000,5420:200,8999:800}],false],
 ['partial-reversal',[sale,expense,closing,{3010:-500,5420:100,8999:400}],true],
 ['recognition-correction',[{1930:1000,8999:-1000},{8999:1000,3010:-1000}],false],
 ['recognition-expense',[{1930:2000,2018:-2000},{1930:-1000,8999:1000},{8999:-1000,5420:1000}],false],
]
let installed=false,concurrentId=null
try {
  query(guard+readFileSync('supabase/migrations/20261028125031_kan96_result_closing_safety.sql','utf8'));installed=true
  assert.equal(query("SELECT has_function_privilege('anon','public.get_result_closing_review(integer,date)','EXECUTE');"),'f')
  assert.equal(query("SELECT has_function_privilege('authenticated','public.get_result_closing_review(integer,date)','EXECUTE');"),'t')
  assert.equal(query("SELECT has_function_privilege('authenticated','public.close_year_unchecked_inventory(integer)','EXECUTE');"),'f')
  const noAuth=query("BEGIN;SET LOCAL ROLE authenticated;CREATE FUNCTION pg_temp.no_auth() RETURNS text LANGUAGE plpgsql AS $a$ BEGIN PERFORM public.get_result_closing_review(2024);RETURN 'UNSAFE';EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;END $a$;SELECT pg_temp.no_auth();ROLLBACK;")
  assert.equal(noAuth,'28000')
  for(const [name,entries,blocked] of cases) {
    const uid=randomUUID();ids.push(uid)
    // Each case, including successful year locks, is fully rolled back.
    const result=JSON.parse(query(`BEGIN;${guard}${seed(uid)}${entries.map(r=>journal(uid,r)).join('')}${auth(uid)}
      CREATE FUNCTION pg_temp.try_lock() RETURNS text LANGUAGE plpgsql AS $l$ BEGIN PERFORM public.close_year_atomic(2024);RETURN 'ok';EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||':'||SQLERRM;END $l$;
      ${original.find(x=>x.name==='get_withdrawal_context').definition.replace('public.get_withdrawal_context','pg_temp.before_withdrawal_context')};
      SELECT json_build_object('review',public.get_result_closing_review(2024),'ne',public.get_ne_sales_summary(2024),
        'balances',(SELECT json_object_agg(account_number,balance) FROM public.get_cumulative_account_balances('2024-12-31')),
        'withdrawal',public.get_withdrawal_context('2024-12-31'),'before_withdrawal',pg_temp.before_withdrawal_context('2024-12-31'),'lock',pg_temp.try_lock());
      ROLLBACK;`))
    assert.equal(result.review.blocked,blocked,name)
    assert.deepEqual(result.ne.result_closing_review,result.review)
    assert.deepEqual(result.withdrawal.result_closing_reviews,[result.review])
    const unchangedWithdrawal=structuredClone(result.withdrawal)
    delete unchangedWithdrawal.result_closing_reviews
    assert.deepEqual(unchangedWithdrawal,result.before_withdrawal,name+' unchanged withdrawal facts and signatures')
    assert(blocked?result.lock.startsWith('23514:')&&result.lock.includes('bokslutsposter'):result.lock==='ok',name+': '+result.lock)
    if(blocked){assert(result.review.entries.every(e=>e.ver_nr>0&&e.date==='2024-12-31'&&e.accounts.some(a=>a.startsWith('899'))))}
    const balances=result.balances??{},annual=Object.fromEntries(result.ne.balances.map(r=>[r.account_number,r.balance]))
    const report=api.calculateNeReport({annualBalances:annual,balanceSheetBalances:balances,cumulativeBalances:balances,
      neSalesClassification:{available:true,r2Reallocation:0,unresolvedCount:0,unresolvedAmount:0,reviewRequired:false}})
    assert.equal(report.B10_total,balances['1930']??0,name+' B10')
    const dash=api.calculateDashboard(annual,30,{utgaendeMoms:0,ingaendeMoms:0,momsNetto:0},result.review)
    assert.equal(Boolean(dash.resultReviewRequired),blocked)
    if(blocked)assert.equal(dash.sakertUttag,0)
    for(let i=1;i<=17;i++)assert(Number.isFinite(report['R'+i]),name+' R'+i)
    const expected={
      ordinary:[1000,200,800,0,0,800],'full-profit':[0,0,0,0,0,0],'technical-chain':[0,0,0,0,0,0],'partial-profit':[600,200,400,0,0,400],
      'full-loss':[0,0,0,0,0,0],'partial-loss':[0,600,-600,0,0,-600],
      'true-zero':[1000,1000,0,0,0,0],'closed-zero':[0,0,0,0,0,0],
      'tax-adjustment-zero':[1000,1000,0,1000,0,1000],'closed-tax-adjustment-zero':[0,0,0,0,0,0],
      'tax-free':[0,0,1000,0,1000,0],'closed-tax-free':[0,0,0,0,0,0],
      'pure-transfer':[1000,200,800,0,0,800],opening:[0,0,0,0,0,0],
      'full-reversal':[1000,200,800,0,0,800],'partial-reversal':[500,100,400,0,0,400],
      'recognition-correction':[1000,0,1000,0,0,1000],'recognition-expense':[0,1000,-1000,0,0,-1000],
    }[name]
    assert.deepEqual([report.R1,report.R6,report.R11,report.R13,report.R14,report.R17],expected,name+' pinned NE oracle')
    assert.equal(report.R12,report.R11)
    receipts.push({name,blocked,lock:blocked?'23514':'ok',R11:report.R11,R13:report.R13,R17:report.R17,B10:report.B10_total})
  }
  // Actual SIE/correction/undo RPCs. Existing correction dating is preserved.
  for(const action of ['import','correction','undo','correction-same-year','undo-same-year']) {
    const uid=randomUUID();ids.push(uid)
    const year=action.endsWith('same-year')?2026:2024, date=year===2026?'20260102':'20241231'
    const text=`#FLAGGA 0\n#SIETYP 4\n#RAR 0 ${year}0101 ${year}1231\n`+[sale,expense,closing,{8999:800,2019:-800}].map((rows,i)=>`#VER A ${i+1} ${date} "KAN96"\n{\n${Object.entries(rows).map(([a,n])=>`#TRANS ${a} {} ${n}`).join('\n')}\n}\n`).join('')
    const parsed=api.parseSieFile(text,{strictImport:true});assert.deepEqual(parsed.errors,[])
    const payload=await api.buildSieImportPayload(parsed,'kan96-synthetic.se')
    const receipt=randomUUID()
    const after=action.startsWith('undo')?"PERFORM public.undo_sie_import_atomic(batch);":action.startsWith('correction')?"PERFORM public.create_correction_transaction_atomic((SELECT id FROM public.transactions WHERE user_id=auth.uid() AND source_ver_number='3'));":''
    const result=JSON.parse(query(`BEGIN;${guard}${seed(uid)}
      INSERT INTO public.sie_import_inputs(id,user_id,period_start,period_end,payload,raw_sha256,expires_at) VALUES('${receipt}','${uid}','${year}-01-01','${year}-12-31',${json(payload)},repeat('a',64),clock_timestamp()+interval '5 minutes');
      ${auth(uid)}
      DO $i$ DECLARE batch uuid; BEGIN batch:=(public.import_sie_batch(${json({receipt_id:receipt})})->>'import_batch_id')::uuid;${after}END $i$;
      SELECT public.get_result_closing_review(${year});ROLLBACK;`))
    // Real correction/undo dates follow existing rules; inspect actual years.
    assert.equal(result.blocked,!action.endsWith('same-year'),action+' retains actual correction-year semantics')
    receipts.push({name:action,blocked:result.blocked})
  }
  // Tenant boundary, auth rejection, and immutable prior-year scope.
  const a=randomUUID(),b=randomUUID();ids.push(a,b)
  const isolation=JSON.parse(query(`BEGIN;${guard}${seed(a)}${[sale,expense,closing].map(r=>journal(a,r)).join('')}${seed(b)}${journal(b,{1930:100,2018:-100})}
    ${auth(b)}SELECT json_build_object('other',public.get_result_closing_review(2024),'rows',(SELECT count(*) FROM public.journal_entries WHERE user_id='${a}'));
    ROLLBACK;`))
  assert.equal(isolation.other.blocked,false);assert.equal(isolation.rows,0)
  receipts.push({name:'two-owner-isolation',blocked:false})
  const split=randomUUID();ids.push(split)
  const splitResult=JSON.parse(query(`BEGIN;${guard}${seed(split)}${[sale,expense].map(r=>journal(split,r)).join('')}${journal(split,closing,'manual','2024-12-31','','2025-01-01')}${auth(split)}
    SELECT json_build_object('prior',public.get_result_closing_review(2024),'next',public.get_result_closing_review(2025));ROLLBACK;`))
  assert(splitResult.prior.blocked&&splitResult.next.blocked);receipts.push({name:'split-date-review',blocked:true})
  // Committed writer -> queued direct close: prove the check reads after waiting.
  concurrentId=randomUUID();ids.push(concurrentId)
  query('BEGIN;'+guard+seed(concurrentId)+'COMMIT;')
  const writer=spawn(exe,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']})
  let writerOut='',writerError=''
  writer.stdout.on('data',d=>writerOut+=d);writer.stderr.on('data',d=>writerError+=d)
  const writerDone=new Promise(resolve=>writer.on('close',code=>resolve(code)))
  writer.stdin.write(`BEGIN;${guard}SET LOCAL request.jwt.claim.sub='${concurrentId}';SELECT public.lock_accounting_year_boundary('${concurrentId}',false);${[sale,expense,closing].map(r=>journal(concurrentId,r)).join('')}SELECT 'KAN96_WRITER_READY';\n`)
  const until=async(fn)=>{const deadline=Date.now()+10000;while(!fn()){if(Date.now()>deadline)throw Error('Bounded concurrency wait expired');await new Promise(r=>setTimeout(r,100))}}
  await until(()=>writerOut.includes('KAN96_WRITER_READY')||writerError)
  assert.equal(writerError,'')
  const app='kan96-lock-'+randomUUID()
  const closer=spawn(exe,args,{env:{...env,PGAPPNAME:app},windowsHide:true,stdio:['pipe','pipe','pipe']})
  let closeOut='',closeError=''
  closer.stdout.on('data',d=>closeOut+=d);closer.stderr.on('data',d=>closeError+=d)
  const closeDone=new Promise(resolve=>closer.on('close',code=>resolve(code)))
  closer.stdin.end(`BEGIN;SET LOCAL statement_timeout='12s';${auth(concurrentId)}
    CREATE FUNCTION pg_temp.attempt() RETURNS text LANGUAGE plpgsql AS $c$ BEGIN PERFORM public.close_year_atomic(2024);RETURN 'UNSAFE_SUCCESS';EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||':'||SQLERRM;END $c$;
    SELECT pg_temp.attempt();ROLLBACK;`)
  try {
    await until(()=>query(`SELECT count(*) FROM pg_stat_activity WHERE application_name=${literal(app)} AND wait_event_type='Lock';`)==='1')
    writer.stdin.end('COMMIT;\n')
    assert.equal(await writerDone,0,writerError)
    assert.equal(await closeDone,0,closeError)
    assert(closeOut.includes('23514:')&&closeOut.includes('bokslutsposter')&&!closeOut.includes('UNSAFE_SUCCESS'),closeOut+closeError)
    assert.equal(query(`SELECT count(*) FROM public.closed_years WHERE user_id='${concurrentId}';`),'0')
    receipts.push({name:'writer-commit-before-queued-close',blocked:true})
  } finally {
    if(writer.exitCode===null)writer.stdin.end('ROLLBACK;\n')
    if(closer.exitCode===null)closer.kill()
    await writerDone;await closeDone
  }
  console.log(JSON.stringify({status:'PASS',identity,cases:receipts},null,2))
} finally {
  if(installed) {
    let cleanupError
    try { if(concurrentId) {
      // Only this run's proven-fresh identity, marked before any journal writes.
      // Use the existing atomic deletion boundary, never direct journal DELETE.
      query(`BEGIN;${guard}DO $own$ BEGIN
        IF (SELECT company_name FROM public.profiles WHERE id='${concurrentId}') IS DISTINCT FROM ${literal('KAN96 synthetic '+concurrentId)}
          OR EXISTS(SELECT 1 FROM public.transactions WHERE user_id='${concurrentId}' AND description<>'KAN96 synthetic only')
        THEN RAISE EXCEPTION 'Not the verified new KAN96 cohort; no cleanup'; END IF;
        PERFORM public.delete_user_data_atomic('${concurrentId}');
        DELETE FROM auth.users WHERE id='${concurrentId}';
      END $own$;COMMIT;`)
    } } catch(error) { cleanupError=error }
    query('BEGIN;'+guard+original.map(x=>x.definition+';').join('\n')+'DROP FUNCTION public.get_result_closing_review(integer,date);COMMIT;')
    const hashes=JSON.parse(query(`SELECT json_object_agg(proname,md5(pg_get_functiondef(oid))) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (${names});`))
    for(const x of original)assert.equal(hashes[x.name],x.hash,x.name+' restored exactly')
    const acl=JSON.parse(query(`SELECT json_object_agg(proname,proacl::text) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (${names});`))
    for(const x of original)assert.equal(acl[x.name],x.acl,x.name+' grants restored exactly')
    if(cleanupError)throw cleanupError
    assert.equal(query(`SELECT count(*) FROM auth.users WHERE id IN (${ids.map(literal).join(',')});`),'0','All new test accounts rolled back')
    assert.equal(query("SELECT md5(coalesce(string_agg(x::text,'' ORDER BY x::text),'')) FROM (SELECT jsonb_build_object('table','journal','row',to_jsonb(j)) x FROM public.journal_entries j UNION ALL SELECT jsonb_build_object('table','transactions','row',to_jsonb(t)) FROM public.transactions t UNION ALL SELECT jsonb_build_object('table','locks','row',to_jsonb(c)) FROM public.closed_years c UNION ALL SELECT jsonb_build_object('table','archive','row',to_jsonb(a)) FROM public.declaration_source_snapshots a UNION ALL SELECT jsonb_build_object('table','versions','row',to_jsonb(r)) FROM public.declaration_revisions r UNION ALL SELECT jsonb_build_object('table','vat','row',to_jsonb(v)) FROM public.vat_periods v) evidence;"),preserved,'Existing journal/transactions/locks/VAT/declaration versions byte-equivalent')
    console.log('PASS: candidate schema restored exactly; all test data rolled back')
  }
}
