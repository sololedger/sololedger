import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const url = process.env.SOLOLEDGER_LOCAL_TEST_DATABASE_URL
if (!url) throw new Error('Set SOLOLEDGER_LOCAL_TEST_DATABASE_URL for a dedicated local KAN-74 database.')
const target = new URL(url)
if (!['localhost','127.0.0.1','[::1]'].includes(target.hostname) || !/^\/sololedger_kan74_[a-z0-9_]+$/.test(target.pathname) || target.search || /supabase|wbaxmuvudpnkvuliicuy|fzxqiqenqjzhlyxxpvhg/.test(url)) {
  throw new Error('KAN-74 write tests refuse hosted or non-dedicated destinations.')
}
const repo = fileURLToPath(new URL('..', import.meta.url))
const evidence = mkdtempSync(path.join(tmpdir(),'sololedger-kan74-receipts-'))
const fallback='C:/Program Files/PostgreSQL/17/bin/psql.exe'
const psql=process.env.PSQL_PATH ?? (existsSync(fallback)?fallback:'psql')
const env={...process.env,PGCLIENTENCODING:'UTF8',PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'10'}
for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD'])delete env[key]
const args=[url,'-X','-w','-qAt','-v','ON_ERROR_STOP=1']
const literal=value=>"'"+value.replaceAll("'","''")+"'"
function query(sql) {
  const r=spawnSync(psql,args,{cwd:repo,env,input:sql,encoding:'utf8',windowsHide:true,timeout:50000,maxBuffer:16*1024*1024})
  assert.equal(r.status,0,r.stderr)
  return r.stdout.trim()
}
const identity=JSON.parse(query("SELECT jsonb_build_object('db',current_database(),'server',host(inet_server_addr()),'role',current_user)"))
assert.equal(identity.db,target.pathname.slice(1));assert(['127.0.0.1','::1'].includes(identity.server));assert.equal(identity.role,'postgres')
const tables=['profiles','transactions','journal_entries','import_batches','ver_nr_sequences','vat_periods','closed_years','sie_import_inputs']
const stateSQL="SELECT jsonb_build_object('auth_count',(SELECT count(*) FROM auth.users),"+tables.map(t=>"'"+t+"',(SELECT jsonb_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(x)::text,',' ORDER BY to_jsonb(x)::text),''))) FROM public."+t+' x)').join(',')+')'
const originalState=query(stateSQL)
const sequential=spawnSync(psql,[...args,'-f',path.join(repo,'supabase/tests/kan74_sie_opening_guard.sql')],{cwd:repo,env,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:16*1024*1024})
writeFileSync(path.join(evidence,'sequential.log'),sequential.stdout+sequential.stderr)
assert.equal(sequential.status,0,sequential.stderr)
for(const [marker,count] of [['PASS KAN74 ',22],['PASS KAN74_P1 ',1],['PASS KAN74_POLICY ',16],['PASS KAN74_VARIANT ',8],['PASS KAN74_RECEIPT ',18],['PASS KAN74_DELETION ',1]]) {
  assert.equal(sequential.stderr.split(marker).length-1,count,marker)
}
console.log('PASS 66 rollback scenarios: opening/history/P1/receipts/ACL/period/company/expiry/atomicity/deletion')
const helper=readFileSync(path.join(repo,'supabase/tests/helpers/kan74_receipt_fixture.sql'),'utf8')
for(const name of ['kan71_sie_vat_period_guard.sql','kan71_generic_sie_correction_guard.sql','kan71_legacy_sie_history_guard.sql','kan72_standard_booking_integrity_candidate.sql','kan63_customer_invoice_vat_guard_candidate.sql']) {
  let fixture=readFileSync(path.join(repo,'supabase/tests',name),'utf8').replaceAll("current_database() NOT LIKE 'sololedger_kan71_%'","current_database() NOT LIKE 'sololedger_kan74_%'")
  // Only synthetic fixture import uses the new server-only receipt registry.
  fixture=fixture.replaceAll('r:=public.import_sie_batch(','r:=pg_temp.import_sie_payload(')
  if(name==='kan71_sie_vat_period_guard.sql') {
    const old="b:=pg_temp.fixture_import(u,d,s='ambiguous_reverse',CASE WHEN s='row_year_cross' THEN make_date(extract(year FROM current_date)::int-1,5,15) ELSE NULL END,s='non_vat');"
    assert(fixture.includes(old))
    fixture=fixture.replace(old,old.replace("CASE WHEN s='row_year_cross' THEN make_date(extract(year FROM current_date)::int-1,5,15) ELSE NULL END",'NULL')+"\n IF s='row_year_cross' THEN UPDATE journal_entries j SET date=make_date(extract(year FROM current_date)::int-1,5,15) WHERE j.user_id=u AND public.vat_concurrency_account(j.account_number) AND EXISTS(SELECT 1 FROM transactions fixture_tx WHERE fixture_tx.id=j.transaction_id AND fixture_tx.import_batch_id=b); END IF;")
  }
  fixture=fixture.replace('BEGIN;',()=>'BEGIN;\n'+helper+'\n')
  const r=spawnSync(psql,[...args,'-v','skip_migration=1','-v','apply_kan72_migration=false'],{cwd:repo,env,input:fixture,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:16*1024*1024})
  writeFileSync(path.join(evidence,name+'.log'),r.stdout+r.stderr);assert.equal(r.status,0,name+': '+r.stderr)
  const json=r.stdout.split(/\r?\n/).find(l=>l.startsWith('[{'))
  if(json && name.startsWith('kan71_')) {
    const filename=path.join(evidence,name+'.json');writeFileSync(filename,json)
    const report=spawnSync(process.execPath,[path.join(repo,'scripts/test-sie-vat-periods.ts'),filename],{env,encoding:'utf8',windowsHide:true,timeout:30000})
    assert.equal(report.status,0,report.stderr)
  }
  console.log('PASS '+name+' (security assertions preserved; receipt fixtures)')
}

function createUser() {
  const u=randomUUID();query('BEGIN; INSERT INTO auth.users(id) VALUES('+literal(u)+'); INSERT INTO profiles(id) VALUES('+literal(u)+'); COMMIT;');return u
}
function cleanup(u) {
  query('BEGIN; SET LOCAL ROLE service_role; SELECT public.delete_user_data_atomic('+literal(u)+'); RESET ROLE; DELETE FROM auth.users WHERE id='+literal(u)+'; COMMIT;')
}
const claims=(u,role)=>"DO $$ BEGIN PERFORM set_config('request.jwt.claim.sub',"+literal(u)+",true); PERFORM set_config('request.jwt.claim.role',"+literal(role)+",true); END $$; SET LOCAL ROLE "+role+";"
function register(u,p) {
  const y=p.fiscal_year
  return query('BEGIN;'+claims(u,'service_role')+'SELECT public.register_sie_import_input('+literal(u)+','+literal(JSON.stringify(p))+"::jsonb,"+literal(y+'-01-01')+'::date,'+literal(y+'-12-31')+'::date,'+literal('a'.repeat(64))+'); COMMIT;')
}
const call=id=>'SELECT public.import_sie_batch('+literal(JSON.stringify({receipt_id:id}))+'::jsonb);'
function payload(year,ib=true,vat=false) {
  return {filename:'KAN74-receipt-race-synthetic.se',file_hash:randomUUID(),fiscal_year:year,opening_balances:ib?[{account_number:'1930',amount:10000},{account_number:'2010',amount:-10000}]:[],previous_year_result_balances:[],
    verifications:[{series:'A',ver_number:1,date:year+'-06-15',description:'Synthetic race',rows:vat?[{account_number:'1930',amount:125},{account_number:'3010',amount:-100},{account_number:'2611',amount:-25}]:[{account_number:'1930',amount:100},{account_number:'2018',amount:-100}]}]}
}
function session(label) {
  const c=spawn(psql,args,{cwd:repo,env:{...env,PGAPPNAME:label},windowsHide:true,stdio:['pipe','pipe','pipe']})
  let stdout='',stderr=''
  c.stdout.on('data',b=>stdout+=b);c.stderr.on('data',b=>stderr+=b)
  return {c,output:()=>stdout,done:new Promise(resolve=>c.on('exit',code=>resolve({code,stdout,stderr})))}
}
async function until(fn,label) {
  const end=Date.now()+10000
  while(Date.now()<end){if(fn())return;await delay(40)}
  throw new Error('Timed out: '+label)
}
// Company identity is checked AFTER advisory waits and pinned until COMMIT.
// Two real sessions: the lock holder changes org_nr while the importer waits.
for (const phase of ['changed_while_waiting', 'pinned_through_commit', 'profile_writer_no_wait']) {
  const u=createUser()
  let first,second
  try {
    query("UPDATE profiles SET org_nr='111111-1111' WHERE id="+literal(u))
    const input=payload(2024,false);input.org_nr='111111-1111'
    const id=register(u,input)
    const label='kan74-company-'+randomUUID().slice(0,8)
    first=session(label+'-a');second=session(label+'-b')
    const begin="BEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='15s';"
    if(phase==='changed_while_waiting') {
      first.c.stdin.write(begin+claims(u,'authenticated')+"SELECT pg_advisory_xact_lock(hashtextextended('sie-import:' || "+literal(u)+"::text,0));\n\\echo READY\n")
      await until(()=>first.output().includes('READY'),phase+' blocker ready')
      second.c.stdin.end("\\set VERBOSITY verbose\n"+begin+claims(u,'authenticated')+call(id)+'COMMIT;\n')
    } else if(phase==='pinned_through_commit') {
      first.c.stdin.write(begin+claims(u,'authenticated')+call(id)+'\n\\echo READY\n')
      await until(()=>first.output().includes('READY'),phase+' booked but uncommitted')
      second.c.stdin.end(begin+claims(u,'authenticated')+"UPDATE profiles SET org_nr='222222-2222' WHERE id="+literal(u)+'; COMMIT;\n')
    } else {
      first.c.stdin.write(begin+claims(u,'authenticated')+"UPDATE profiles SET org_nr='222222-2222' WHERE id="+literal(u)+';\n\\echo READY\n')
      await until(()=>first.output().includes('READY'),phase+' profile writer holds row')
      second.c.stdin.end("\\set VERBOSITY verbose\n"+begin+claims(u,'authenticated')+call(id)+'COMMIT;\n')
      // Import must finish before the profile writer releases its lock.
      let finished=false;second.done.then(()=>{finished=true})
      await until(()=>finished,phase+' rejects without waiting on profile')
    }
    const waitEvent=phase==='changed_while_waiting'?" AND wait_event='advisory'":''
    if(phase!=='profile_writer_no_wait')await until(()=>query('SELECT count(*) FROM pg_stat_activity s WHERE application_name='+literal(label+'-b')+" AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(s.pid))>0"+waitEvent)==='1',phase+' observed wait')
    first.c.stdin.end((phase==='changed_while_waiting'?"UPDATE profiles SET org_nr='222222-2222' WHERE id="+literal(u)+';':'')+'COMMIT;\n')
    const [a,b]=await Promise.all([first.done,second.done])
    writeFileSync(path.join(evidence,'race-company-'+phase+'.log'),a.stdout+a.stderr+b.stdout+b.stderr)
    assert.equal(a.code,0,a.stderr)
    if(phase!=='pinned_through_commit') {
      assert.notEqual(b.code,0,'Import must reject a company identity changed while waiting')
      assert(b.stderr.includes('P2075'),b.stderr)
    } else assert.equal(b.code,0,b.stderr)
    const empty=phase!=='pinned_through_commit'
    for(const table of ['transactions','journal_entries','import_batches','ver_nr_sequences']) {
      const count=Number(query('SELECT count(*) FROM '+table+' WHERE user_id='+literal(u)))
      assert.equal(count,empty?0:table==='journal_entries'?2:1,phase+' '+table)
    }
    assert.equal(query('SELECT count(*) FROM sie_import_inputs WHERE id='+literal(id)),empty?'1':'0')
    assert.equal(query('SELECT org_nr FROM profiles WHERE id='+literal(u)),'222222-2222')
    console.log('PASS observed two-session company identity '+phase)
  } finally {
    first?.c.kill();second?.c.kill();cleanup(u)
  }
}

const sameFile=payload(2024,false)
const openingVer=payload(2025,false);openingVer.verifications[0].description='Unmarked';openingVer.verifications[0].rows=[{account_number:'1930',amount:10100},{account_number:'2018',amount:-10100}]
const races=[
 ['IB_forward',payload(2024),payload(2025),'P2074'],
 ['IB_reverse',payload(2025),payload(2024),'P2074'],
 ['no_IB_then_IB',payload(2024,false),payload(2025),'P2074'],
 ['IB_then_older_no_IB',payload(2025),payload(2024,false),'P2074'],
 ['later_no_IB',payload(2024),payload(2025,false),'P2074'],
 ['same_year_IB',payload(2024),payload(2024),'P2001'],
 ['same_year_no_IB',payload(2024),payload(2024,false),null],
 ['no_IB_both_years',payload(2024,false),payload(2025,false),'P2074'],
 ['no_IB_reverse',payload(2025,false),payload(2024,false),'P2074'],
 ['VAT_lock_order',payload(2024,true,true),payload(2025,true,true),'P2074'],
 ['P1_opening_as_VER_2018',payload(2024),openingVer,'P2074'],
 ['winner_rollback',payload(2024),payload(2025),null,'rollback'],
 ['same_receipt',sameFile,sameFile,'P2075','same'],
 ['same_file_two_receipts',sameFile,sameFile,'23505'],
 ['expiry_after_lock_wait',payload(2024),payload(2024,false),'P2075','expiry'],
]
for(const [name,firstPayload,secondPayload,expected,mode] of races) {
  const u=createUser()
  let first,second
  try {
    const aId=register(u,firstPayload),bId=mode==='same'?aId:register(u,secondPayload)
    if(mode==='expiry')query("UPDATE sie_import_inputs SET expires_at=clock_timestamp()+interval '800 milliseconds' WHERE id="+literal(bId))
    const label='kan74-receipt-'+randomUUID().slice(0,8);first=session(label+'-a');second=session(label+'-b')
    first.c.stdin.write("BEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='15s';"+claims(u,'authenticated')+call(aId)+'\n\\echo READY\n')
    await until(()=>first.output().includes('READY'),name+' first')
    second.c.stdin.end("\\set VERBOSITY verbose\nBEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='15s';"+claims(u,'authenticated')+call(bId)+'COMMIT;\n')
    await until(()=>query('SELECT count(*) FROM pg_stat_activity s WHERE application_name='+literal(label+'-b')+" AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(s.pid))>0")==='1',name+' observed wait')
    if(mode==='expiry')await delay(900)
    first.c.stdin.end(mode==='rollback'?'ROLLBACK;\n':'COMMIT;\n')
    const [a,b]=await Promise.all([first.done,second.done]);assert.equal(a.code,0,a.stderr)
    if(expected){assert.notEqual(b.code,0);assert(b.stderr.includes(expected),b.stderr)}else assert.equal(b.code,0,b.stderr)
    const counts=JSON.parse(query("SELECT jsonb_build_object('tx',(SELECT count(*) FROM transactions WHERE user_id="+literal(u)+"),'batches',(SELECT count(*) FROM import_batches WHERE user_id="+literal(u)+"),'sequence',(SELECT last_ver_nr FROM ver_nr_sequences WHERE user_id="+literal(u)+"))"))
    const firstCount=firstPayload.opening_balances.length?2:1,secondCount=secondPayload.opening_balances.length?2:1
    const tx=mode==='rollback'?secondCount:firstCount+(expected?0:secondCount)
    assert.equal(counts.tx,tx,name);assert.equal(counts.batches,mode==='rollback'||expected?1:2,name);assert.equal(counts.sequence,tx,name)
    writeFileSync(path.join(evidence,'race-'+name+'.log'),a.stdout+a.stderr+b.stdout+b.stderr)
    console.log('PASS observed two-session race '+name)
  } finally {
    first?.c.kill();second?.c.kill();cleanup(u)
  }
}
for(const isolation of ['REPEATABLE READ','SERIALIZABLE']) {
  const u=createUser()
  try {
    const id=register(u,payload(2024))
    const r=spawnSync(psql,args,{cwd:repo,env,input:'\\set VERBOSITY verbose\nBEGIN ISOLATION LEVEL '+isolation+';'+claims(u,'authenticated')+call(id)+'COMMIT;',encoding:'utf8',windowsHide:true})
    assert.notEqual(r.status,0);assert(r.stderr.includes('25001'),r.stderr)
    assert.equal(query('SELECT count(*) FROM transactions WHERE user_id='+literal(u)),'0')
    assert.equal(query('SELECT count(*) FROM sie_import_inputs WHERE id='+literal(id)),'1')
  }finally{cleanup(u)}
}
// Compose real server-parser output with actual local registry/import functions.
const fixturePath=path.join(evidence,'server-inputs.json')
const sourceTest=spawnSync(process.execPath,['--experimental-vm-modules',path.join(repo,'scripts/test-sie-import.mjs')],{cwd:repo,env:{...env,KAN74_PAYLOAD_OUTPUT:fixturePath},encoding:'utf8',windowsHide:true,timeout:60000})
assert.equal(sourceTest.status,0,sourceTest.stderr)
const sourceFixtures=JSON.parse(readFileSync(fixturePath,'utf8'))
for(const [name,input] of Object.entries(sourceFixtures)) {
  const u=createUser()
  try {
    const id=query('BEGIN;'+claims(u,'service_role')+'SELECT public.register_sie_import_input('+literal(u)+','+literal(JSON.stringify(input.p_payload))+'::jsonb,'+literal(input.p_period_start)+'::date,'+literal(input.p_period_end)+'::date,'+literal(input.p_raw_sha256)+'); COMMIT;')
    query('BEGIN;'+claims(u,'authenticated')+call(id)+'COMMIT;')
    const bank=Number(query('SELECT sum(debit-credit) FROM journal_entries WHERE user_id='+literal(u)+" AND account_number='1930'"))
    assert.equal(bank,name==='row_boundary'?25000:input.p_payload.opening_balances.length?10100:100,name)
    if(name==='row_boundary')assert.equal(query('SELECT count(*) FROM journal_entries WHERE user_id='+literal(u)),'50000')
    if(name==='bridge')assert.equal(Number(query('SELECT sum(debit-credit) FROM journal_entries WHERE user_id='+literal(u)+" AND account_number='2019'")),-2000)
    assert.equal(query('SELECT count(*) FROM sie_import_inputs WHERE user_id='+literal(u)),'0')
    console.log('PASS actual server-file output -> real atomic receipt RPC '+name)
  }finally{cleanup(u)}
}
assert.equal(query(stateSQL),originalState,'All pre-existing local accounting/Auth fixtures must be preserved')
writeFileSync(path.join(evidence,'status.json'),JSON.stringify({status:'PASS',sequential:66,observedRaces:races.length+3,strongerIsolationDenials:2,sqlRegressions:5,actualServerFixtures:Object.keys(sourceFixtures),persistentFixtureChanges:false},null,2))
console.log('PASS original accounting/Auth state preserved; all new race fixtures removed through authoritative deletion RPC')
console.log('Evidence: '+evidence)
