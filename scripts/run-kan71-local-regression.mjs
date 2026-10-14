import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const repo=fileURLToPath(new URL('..',import.meta.url))
const raw=process.env.SOLOLEDGER_LOCAL_TEST_DATABASE_URL
if(!raw) throw Error('Set SOLOLEDGER_LOCAL_TEST_DATABASE_URL to a dedicated local KAN-71 DB.')
const url=new URL(raw)
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!/^sololedger_kan71_[a-z0-9_]+$/.test(url.pathname.slice(1)))
 throw Error('Refusing non-local/non-KAN-71 target.')
const env={...process.env,PGCONNECT_TIMEOUT:'10',PGCLIENTENCODING:'UTF8'}
for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD'])delete env[key]
if(url.password)env.PGPASSWORD=decodeURIComponent(url.password)
const psql=process.env.PSQL_PATH??'C:/Program Files/PostgreSQL/17/bin/psql.exe'
if(!existsSync(psql))throw Error('PostgreSQL client not found.')
const args=['-X','-w','-h',url.hostname.replace(/^\[|\]$/g,''),'-p',url.port||'5432','-U',decodeURIComponent(url.username)||'postgres','-d',url.pathname.slice(1),'-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
function run(sql,label='query'){
 const r=spawnSync(psql,args,{env,input:sql,encoding:'utf8',maxBuffer:16*1024*1024,timeout:40000})
 if(r.status!==0)throw Error(label+': '+r.stderr)
 return r.stdout.trim()
}
const preflight=JSON.parse(run("select jsonb_build_object('db',current_database(),'server',host(inet_server_addr()),'port',inet_server_port())"))
assert.equal(preflight.db,url.pathname.slice(1))
assert(['127.0.0.1','::1'].includes(preflight.server))
const root=mkdtempSync(join(tmpdir(),'sololedger-kan71-'))
console.log('Verified local KAN-71 target: '+preflight.db+'; evidence '+root)
const historySql="select jsonb_build_object('periods',(select jsonb_agg(to_jsonb(v) order by id) from vat_periods v),'transactions',(select jsonb_agg(to_jsonb(t) order by id) from transactions t),'journal',(select jsonb_agg(to_jsonb(j) order by id) from journal_entries j),'batches',(select jsonb_agg(to_jsonb(b) order by id) from import_batches b))"
const historyBefore=run(historySql)
run(readFileSync(join(repo,'supabase/migrations/20261014162850_kan71_sie_undo_vat_period_guard.sql'),'utf8'),'local KAN-71 migration')
run(readFileSync(join(repo,'supabase/migrations/20261014171038_kan71_sie_correction_period_guard.sql'),'utf8'),'local KAN-71 correction review migration')
run(readFileSync(join(repo,'supabase/migrations/20261014174218_kan71_legacy_sie_correction_history_guard.sql'),'utf8'),'local KAN-71 history review migration')
assert.equal(run(historySql),historyBefore,'Migration must not rewrite existing accounting history/closing state')
console.log('PASS migration preserves existing period, closing, transaction, journal and batch data.')
const fixture=spawnSync(psql,[...args,'-f',join(repo,'supabase/tests/kan71_sie_vat_period_guard.sql')],{env,encoding:'utf8',maxBuffer:16*1024*1024,timeout:40000})
writeFileSync(join(root,'sql-tests.log'),fixture.stdout+fixture.stderr)
if(fixture.status!==0)throw Error('SQL fixtures failed: '+fixture.stderr)
const jsonLine=fixture.stdout.split(/\r?\n/).find(l=>l.startsWith('[{'))
assert(jsonLine,'Missing DB report evidence')
const path=join(root,'rpc-report-evidence.json')
writeFileSync(path,jsonLine)
const reportTest=spawnSync(process.execPath,[join(repo,'scripts/test-sie-vat-periods.ts'),path],{env,encoding:'utf8',timeout:30000})
writeFileSync(join(root,'report-tests.log'),reportTest.stdout+reportTest.stderr)
if(reportTest.status!==0)throw Error('RPC report assertions failed: '+reportTest.stderr)
console.log(reportTest.stdout.trim())
const correctionTest=spawnSync(psql,[...args,'-f',join(repo,'supabase/tests/kan71_generic_sie_correction_guard.sql')],{env,encoding:'utf8',maxBuffer:16*1024*1024,timeout:40000})
writeFileSync(join(root,'generic-correction-tests.log'),correctionTest.stdout+correctionTest.stderr)
if(correctionTest.status!==0)throw Error('Direct correction fixtures failed: '+correctionTest.stderr)
console.log('PASS direct authenticated SIE/manual correction and lineage fixtures (20 cases).')
const historyTest=spawnSync(psql,[...args,'-f',join(repo,'supabase/tests/kan71_legacy_sie_history_guard.sql')],{env,encoding:'utf8',maxBuffer:16*1024*1024,timeout:40000})
writeFileSync(join(root,'legacy-history-tests.log'),historyTest.stdout+historyTest.stderr)
if(historyTest.status!==0)throw Error('Legacy history fixtures failed: '+historyTest.stderr)
const historyJson=historyTest.stdout.split(/\r?\n/).find(l=>l.startsWith('[{'))
assert(historyJson,'Missing legacy history report evidence')
const historyPath=join(root,'legacy-history-report-evidence.json')
writeFileSync(historyPath,historyJson)
const historyReport=spawnSync(process.execPath,[join(repo,'scripts/test-sie-vat-periods.ts'),historyPath],{env,encoding:'utf8',timeout:30000})
writeFileSync(join(root,'legacy-history-report-tests.log'),historyReport.stdout+historyReport.stderr)
if(historyReport.status!==0)throw Error('Legacy report assertions failed: '+historyReport.stderr)
console.log('PASS 16 legacy-chain/direct close scenarios and actual DB history/report/safe-withdrawal assertions.')

function auth(uid){assert.match(uid,/^[0-9a-f-]{36}$/);return "select set_config('request.jwt.claim.sub','"+uid+"',true);"}
async function session(name){
 const child=spawn(psql,args,{env:{...env,PGAPPNAME:name},stdio:['pipe','pipe','pipe'],windowsHide:true})
 let stdout='',stderr=''
 child.stdout.on('data',c=>{stdout+=c});child.stderr.on('data',c=>{stderr+=c})
 const completion=new Promise(resolve=>child.on('exit',code=>resolve({code,stdout,stderr})))
 const marker=async token=>{
  const deadline=Date.now()+10000
  while(!stdout.includes(token)){
   if(child.exitCode!==null)throw Error(name+' exited: '+stderr)
   if(Date.now()>deadline)throw Error(name+' marker timeout')
   await new Promise(r=>setTimeout(r,50))
  }
 }
 return {child,completion,marker,write:s=>child.stdin.write(s)}
}
async function waitForAdvisory(name){
 const deadline=Date.now()+10000
 while(Date.now()<deadline){
  const state=run("select coalesce(wait_event,'') from pg_stat_activity where application_name='"+name+"'")
  if(state==='advisory')return
  await new Promise(r=>setTimeout(r,100))
 }
 throw Error('Did not observe second session waiting for shared VAT advisory lock.')
}
function setup(oldPeriod=false){
 let sql=readFileSync(join(repo,'supabase/tests/kan71_concurrency_fixture.sql'),'utf8')
 if(oldPeriod)sql=sql.replaceAll('current_date',"(date_trunc('year',current_date)::date+14)")
 const result=run(sql)
 const fixture=JSON.parse(result.split(/\r?\n/).find(l=>l.startsWith('{')&&l.includes('"user"')&&l.includes('"batch"')))
 if(oldPeriod)run("insert into vat_periods(user_id,period_start,period_end,period_type) values('"+fixture.user+"',current_date,current_date,'month')")
 return fixture
}
const concurrency=[]
for(const order of ['close_then_undo','undo_then_close','undo_then_undo','close_then_correction','correction_then_close','correction_then_correction','old_close_then_correction']){
 const fixture=setup(order==='old_close_then_correction')
 const isCorrection=order.includes('correction')
 const first=order.startsWith('close_')||order.startsWith('old_close_')?'close_vat_period_atomic':isCorrection?'create_correction_transaction_atomic':'undo_sie_import_atomic'
 const second=order.endsWith('_close')?'close_vat_period_atomic':isCorrection?'create_correction_transaction_atomic':'undo_sie_import_atomic'
 const idFor=fn=>fn.startsWith('close')?fixture.period:fn.startsWith('create')?fixture.tx:fixture.batch
 const token='kan71_'+order+'_'+Date.now().toString(36)
 const a=await session(token+'_a');const b=await session(token+'_b')
 try{
  a.write("BEGIN; SET LOCAL statement_timeout='15s'; "+auth(fixture.user)+"SET LOCAL ROLE authenticated; select public."+first+"('"+idFor(first)+"');\n\\echo KAN71_FIRST_READY\n")
  await a.marker('KAN71_FIRST_READY')
  b.write("BEGIN; SET LOCAL statement_timeout='15s'; "+auth(fixture.user)+"SET LOCAL ROLE authenticated; select public."+second+"('"+idFor(second)+"'); COMMIT;\n\\q\n")
  await waitForAdvisory(token+'_b')
  a.child.stdin.end('COMMIT;\n\\q\n')
  const resultA=await a.completion;const resultB=await b.completion
  assert.equal(resultA.code,0,resultA.stderr)
  if(order.endsWith('_then_close'))assert.equal(resultB.code,0,resultB.stderr)
  else{assert.notEqual(resultB.code,0);assert.match(resultB.stderr,/23514|40001/)}
  const state=JSON.parse(run("select jsonb_build_object('status',vp.status,'closing',vp.closing_amount,'batch',b.status,'corrections',(select count(*) from transactions t where t.user_id=vp.user_id and t.is_correction),'balanced',not exists(select 1 from journal_entries j where j.user_id=vp.user_id group by transaction_id having sum(debit-credit)<>0)) from vat_periods vp,import_batches b where vp.id='"+fixture.period+"' and b.id='"+fixture.batch+"'"))
  assert.equal(state.balanced,true)
  assert.equal(state.corrections,first.startsWith('close')?0:1)
  if(first.startsWith('close')){assert.equal(state.closing,350);assert.equal(state.batch,'completed')}
  if(order==='undo_then_close'){assert.equal(state.closing,100);assert.equal(state.batch,'undone')}
  if(order==='undo_then_undo')assert.equal(state.status,'open')
  if(order==='correction_then_close'){assert.equal(state.closing,100);assert.equal(state.batch,'completed')}
  if(order==='correction_then_correction')assert.equal(state.status,'open')
  concurrency.push({order,observedAdvisoryWait:true,state,secondExit:resultB.code})
  writeFileSync(join(root,order+'.log'),JSON.stringify({resultA,resultB,state},null,2))
  console.log('PASS concurrent '+order+'; observed real lock wait; single atomic outcome.')
 }finally{
  for(const s of [a,b])if(s.child.exitCode===null){s.child.stdin.end('ROLLBACK;\n\\q\n');await s.completion}
 }
}
writeFileSync(join(root,'concurrency.json'),JSON.stringify(concurrency,null,2))
console.log('PASS KAN-71 DB regression. Only newly created synthetic concurrency fixtures remain in this dedicated local DB; no existing fixture/user altered.')
