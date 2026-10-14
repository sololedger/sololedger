import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

const root = process.cwd()
const directiveOnly = process.argv.includes('--directive-contract-only')
const out = path.join(process.env.KAN72_INDEX_EVIDENCE_DIR || 'C:/SoloLedger/LocalTest/kan72-index-evidence', 'run-' + Date.now())
const bin = 'C:/Program Files/PostgreSQL/17/bin'
const template = 'sololedger_kan72_staging_test'
const uid = '72aa0000-0000-4000-8000-000000000001'
const other = '72aa0000-0000-4000-8000-000000000002'
const suffix = Date.now().toString(36)
mkdirSync(out, { recursive: true })
if (!process.env.PGPASSFILE) throw new Error('Use the established local PGPASSFILE; never expose its contents')
const connection = ['-h', 'localhost', '-p', '5432', '-U', 'postgres']
const localEnv = { ...process.env, PGSSLMODE: 'disable' }
delete localEnv.PGHOSTADDR
delete localEnv.PGSERVICE
delete localEnv.PGSERVICEFILE
function run(exe, args, input, env = localEnv) {
  const r = spawnSync(path.join(bin, exe), args, { input, encoding: 'utf8', env, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(exe + ': ' + (r.stderr || r.stdout))
  return r.stdout
}
function sql(db, text) {
  if (!/^s72idx_[a-z0-9_]+$/.test(db) && ![template,'sololedger_kan17c_test'].includes(db)) throw new Error('Not an allowlisted local database')
  return run('psql.exe', [...connection, '-X', '-w', '-qAt', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], text).trim()
}
function verify(db) {
  const r = JSON.parse(sql(db, "SELECT jsonb_build_object('db',current_database(),'host',host(inet_server_addr()),'port',inet_server_port());"))
  if (r.db !== db || !['::1', '127.0.0.1'].includes(r.host) || r.port !== 5432) throw new Error('Local database identity mismatch')
}
verify(template)
const counts = JSON.parse(sql(template, "SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'transactions',(SELECT count(*) FROM public.transactions),'journals',(SELECT count(*) FROM public.journal_entries),'accounts',(SELECT count(*) FROM public.accounts),'numbers',(SELECT count(*) FROM public.ver_nr_sequences));"))
if (Object.values(counts).some(n => n !== 0)) throw new Error('Template must contain no user/accounting data')
const auth = "SET LOCAL request.jwt.claim.sub='" + uid + "'; SET LOCAL request.jwt.claims='{\"sub\":\"" + uid + "\",\"role\":\"authenticated\"}'; SET LOCAL ROLE authenticated;"
function payload(kind, vat = 25) {
  return JSON.stringify({date:'2026-02-01', future_date:'2027-01-01', description:'KAN72 synthetic performance booking',
    amount:1250, type:'s72perf-'+kind, vat_rate:vat})
}
function call(period = false, kind = period ? 'purchase' : 'sale', vat = 25) {
  return 'SELECT public.' + (period ? 'book_periodized_transaction_atomic' : 'book_transaction_atomic') + "('" + payload(kind,vat) + "'::jsonb)"
}
function script(period = false, kind, vat = 25) {
  return 'BEGIN;\n' + auth + '\n' + call(period,kind,vat) + ';\nCOMMIT;\n'
}
function seed(db, rows) {
  sql(db, "BEGIN; INSERT INTO auth.users(id) VALUES('" + uid + "'),('" + other + "'); INSERT INTO public.profiles(id,email,vat_status,vat_period_type,vat_management_from,domestic_sales_vat_treatment,foreign_purchase_reporting,default_deduction_entitlement) VALUES('" + uid + "','kan72-perf@example.test','registered','month','2026-01-01','taxable','required','full'),('" + other + "','kan72-other@example.test','registered','month','2026-01-01','taxable','required','full'); INSERT INTO public.accounts(id,user_id,name,debit_account,credit_account) VALUES('s72perf-sale','" + uid + "','Synthetic sale','1930','3001'),('s72perf-purchase','" + uid + "','Synthetic expense','5420','1930'),('s72perf-deposit','" + uid + "','Synthetic deposit','1930','2018'),('s72perf-other','" + other + "','Synthetic other user','1930','3001'); COMMIT;")
  for (const [user, n, type] of [[uid, rows, 's72perf-sale'],[other,1000,'s72perf-other']]) {
    sql(db, "BEGIN; WITH inserted AS (INSERT INTO public.transactions(user_id,date,description,amount,type,vat_rate,booked,source_ver_number,source) SELECT '" + user + "'::uuid,'2026-02-01'::date,'KAN72 synthetic history',1,'" + type + "',0,true,n::text,'manual' FROM generate_series(1," + n/2 + ") n RETURNING id,source_ver_number::integer AS ver_nr) INSERT INTO public.journal_entries(transaction_id,ver_nr,account_number,debit,credit,description,date,user_id) SELECT id,ver_nr,account,debit,credit,'KAN72 synthetic history','2026-02-01'::date,'" + user + "'::uuid FROM inserted CROSS JOIN (VALUES('1930',1::numeric,0::numeric),('3001',0::numeric,1::numeric)) v(account,debit,credit); INSERT INTO public.ver_nr_sequences(user_id,last_ver_nr) VALUES('" + user + "'," + n/2 + "); COMMIT;")
  }
  sql(db,'ANALYZE public.journal_entries; ANALYZE public.transactions; ANALYZE public.accounts; ANALYZE public.profiles;')
}
function explainRpc(db, period) {
  const plans = []
  for (let i=0;i<5;i++) plans.push(JSON.parse(sql(db,'BEGIN; '+auth+' EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+call(period)+'; ROLLBACK;'))[0])
  return plans
}
const migration = readFileSync(path.join(root,'supabase/migrations/20261014100000_kan72_standard_booking_integrity.sql'),'utf8')
const guard = migration.match(/SELECT count\(\*\), count\(\*\) FILTER \([\s\S]+?FROM public\.journal_entries[\s\S]+?;/)?.[0]
if (!guard) throw new Error('Actual integrity query not found')
function integrityExplain(db, rows) {
  const tx = sql(db,"SELECT transaction_id FROM public.journal_entries WHERE user_id='"+uid+"' AND ver_nr="+rows/2+" LIMIT 1;")
  const query = guard.replace(/INTO v_journal_count,[\s\S]+?FROM/,'FROM')
    .replace(/\bv_tx_id\b/g,"'"+tx+"'::uuid").replace(/\bv_user_id\b/g,"'"+uid+"'::uuid").replace(/\bv_ver_nr\b/g,String(rows/2))
  return JSON.parse(sql(db,'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+query))[0]
}
function percentile(values, q) {
  const sorted=[...values].sort((a,b)=>a-b)
  return sorted[Math.max(0,Math.ceil(sorted.length*q)-1)]
}
function logStats(prefix) {
  const values=readdirSync(out).filter(f=>f.startsWith(path.basename(prefix)+'.') && /^\d+(\.\d+)?$/.test(f.slice(path.basename(prefix).length+1))).flatMap(f=>readFileSync(path.join(out,f),'utf8').trim().split(/\r?\n/).filter(Boolean).map(line=>Number(line.trim().split(/\s+/)[2])/1000))
  if (!values.length || values.some(x=>!Number.isFinite(x))) throw new Error('Missing/invalid latency logs')
  return {count:values.length,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),maxMs:Math.max(...values)}
}
async function bench(db, mode, files, clients, transactions) {
  const prefix=path.join(out,db+'-'+mode)
  const args=[...connection,'-d',db,'-n','-c',String(clients),'-j',String(clients),'-t',String(transactions),'-l','--log-prefix='+prefix,'--random-seed=72','--exit-on-abort']
  for (const f of files) args.push('-f',f)
  const app='kan72-perf-'+mode
  const child=spawn(path.join(bin,'pgbench.exe'),args,{env:{...localEnv,PGAPPNAME:app},windowsHide:true})
  let output='',error='',done=false,code
  child.stdout.on('data',d=>{output+=d}); child.stderr.on('data',d=>{error+=d})
  const completion=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',c=>{code=c;done=true;resolve()})})
  const waits=[]
  while (!done) {
    await new Promise(r=>setTimeout(r,50))
    if (!done && clients>1) waits.push(JSON.parse(sql(db,"SELECT jsonb_build_object('active',count(*) FILTER(WHERE state='active'),'lockWait',count(*) FILTER(WHERE wait_event_type='Lock'),'transactionIdWait',count(*) FILTER(WHERE wait_event='transactionid'),'tupleWait',count(*) FILTER(WHERE wait_event='tuple'),'blocked',count(*) FILTER(WHERE cardinality(pg_blocking_pids(pid))>0)) FROM pg_stat_activity WHERE datname=current_database() AND application_name='"+app+"';")))
  }
  await completion
  writeFileSync(prefix+'.txt',output+error)
  if (code!==0 || !/number of failed transactions:\s+0/.test(output)) throw new Error('Benchmark failed: '+output+error)
  return {...logStats(prefix),averageMs:Number(output.match(/latency average = ([\d.]+) ms/)?.[1]),waitSamples:waits}
}
function checkIntegrity(db, initial) {
  const r=JSON.parse(sql(db,"SELECT jsonb_build_object('badJournals',(SELECT count(*) FROM (SELECT user_id,ver_nr FROM public.journal_entries GROUP BY user_id,ver_nr HAVING sum(debit)<>sum(credit) OR count(DISTINCT transaction_id)<>1) q),'count',(SELECT count(*) FROM public.transactions WHERE user_id='"+uid+"'),'last',(SELECT last_ver_nr FROM public.ver_nr_sequences WHERE user_id='"+uid+"'),'max',(SELECT max(ver_nr) FROM public.journal_entries WHERE user_id='"+uid+"'),'min',(SELECT min(ver_nr) FROM public.journal_entries WHERE user_id='"+uid+"'),'otherLast',(SELECT last_ver_nr FROM public.ver_nr_sequences WHERE user_id='"+other+"'));"))
  if(r.badJournals!==0 || r.last!==r.count || r.last!==r.max || r.min!==1 || r.otherLast!==500 || r.count<=initial) throw new Error('Integrity/number sequence/isolation failure: '+JSON.stringify(r))
  return r
}

const indexFile = path.join(root,'supabase/migrations/20261014123000_kan72_journal_user_ver_index.sql')
const indexName = 'idx_journal_entries_user_id_ver_nr'
const create = 'CREATE INDEX CONCURRENTLY IF NOT EXISTS ' + indexName + ' ON public.journal_entries USING btree(user_id,ver_nr);'
function apply(db, text) {
  verify(db)
  const r = spawnSync(path.join(bin,'psql.exe'),[...connection,'-X','-w','-qAt','-d',db,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{input:text,encoding:'utf8',env:localEnv,windowsHide:true})
  return r
}
function applyMigration(db) {
  const r=apply(db,readFileSync(indexFile,'utf8'))
  if(r.status!==0) throw new Error(r.stderr)
}
function clone(label) {
  const db='s72idx_'+label+'_'+suffix
  run('createdb.exe',[...connection,'-T',template,db]);verify(db)
  return db
}
const invariantsSql = "SELECT jsonb_build_object('indexes',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'oid',c.oid,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) ORDER BY c.relname) FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname<>'idx_journal_entries_user_id_ver_nr'),'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'body',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'owner',p.proowner) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'));"
const definitionSql = "SELECT jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive,'unique',i.indisunique,'bytes',pg_relation_size(i.indexrelid)) FROM pg_index i WHERE indexrelid=to_regclass('public."+indexName+"');"
const tests=[]
function passed(label,details={}) { tests.push({label,...details});console.log(JSON.stringify({pass:label,...details})) }

// CREATE INDEX CONCURRENTLY is special-cased by the CLI even without the
// directive. Two ordinary DO statements must therefore prove autocommit by
// recording distinct real PostgreSQL transaction IDs. Never alter release SQL.
const directive = '-- pg-delta: transaction=false'
const candidateSql = readFileSync(indexFile, 'utf8')
const probeSql = [1, 2].map(step => `DO $kan72_probe$ BEGIN
  INSERT INTO public.kan72_directive_probe(step, xid) VALUES (${step}, txid_current());
END; $kan72_probe$;`).join('\n')
function assertAutocommit(rows, label) {
  if (rows.length !== 2 || rows[0].step !== 1 || rows[1].step !== 2 || rows[0].xid === rows[1].xid) {
    throw new Error('Directive autocommit contract failed (' + label + '): ' + JSON.stringify(rows))
  }
}
const directiveResults = []
for (const [method, command] of [
  ['up', ['migration', 'up']],
  ['push', ['db', 'push', '--skip-vault', '--yes']],
]) {
  for (const [variant, text] of [
    ['actual', candidateSql],
    ['missing', candidateSql.split(/\r?\n/).filter(line => line !== directive).join('\n')],
    ['line3', '-- test-only heading\n-- test-only second line\n' + candidateSql],
  ]) {
    const label = method + '_' + variant
    const db = clone('directive_' + label)
    sql(db, 'CREATE TABLE public.kan72_directive_probe(step integer PRIMARY KEY, xid bigint NOT NULL);')
    const dir = path.join(out, 'directive-' + label)
    mkdirSync(path.join(dir, 'supabase', 'migrations'), { recursive: true })
    writeFileSync(path.join(dir, 'supabase', 'migrations', path.basename(indexFile)), text + '\n' + probeSql)
    const applied = cli(db, dir, command)
    writeFileSync(path.join(out, 'directive-' + label + '.log'), applied.stdout + applied.stderr)
    if (applied.status !== 0) throw new Error('Directive fixture did not apply: ' + applied.stderr)
    const rows = JSON.parse(sql(db, 'SELECT jsonb_agg(to_jsonb(p) ORDER BY step) FROM public.kan72_directive_probe p;'))
    const info = JSON.parse(sql(db, definitionSql))
    if (!info.valid || !info.ready || !info.live) throw new Error('Directive fixture index failed')
    if (sql(db, "SELECT version FROM supabase_migrations.schema_migrations;") !== '20261014123000') throw new Error('Directive fixture ledger mismatch')
    let rejection = null
    try { assertAutocommit(rows, label) } catch (error) { rejection = error.message }
    directiveResults.push({ method, variant, database: db, rows, rejection, index: info })
    writeFileSync(path.join(out, 'directive-contract.json'), JSON.stringify(directiveResults, null, 2))
    if (variant === 'actual') {
      if (rejection) throw new Error(rejection)
      passed('CLI ' + method + ': actual first-line directive creates separate transactions', { rows })
    } else {
      // The same assertion must fail specifically because both probes shared a
      // transaction; a CLI/network/index failure is never a passing mutation.
      if (rows.length !== 2 || rows[0].step !== 1 || rows[1].step !== 2 || rows[0].xid !== rows[1].xid || !rejection) {
        throw new Error('Directive mutation was not detected: ' + label)
      }
      passed('CLI ' + method + ': ' + variant + ' directive mutation rejected by autocommit assertion', { rows, rejection })
    }
  }
}
if (candidateSql.split(/\r?\n/)[0] !== directive) throw new Error('Directive must be on the absolute first line (no BOM/heading)')
if (directiveOnly) {
  console.log('Directive contract and negative controls passed. Evidence: ' + out)
  process.exit(0)
}

const contracts=clone('contracts')
const before=sql(contracts,invariantsSql)
applyMigration(contracts)
const oid=sql(contracts,"SELECT '"+indexName+"'::regclass::oid;")
const info=JSON.parse(sql(contracts,definitionSql))
if(info.unique||!info.valid||!info.ready||!info.live)throw new Error('Invalid/nonunique index contract')
applyMigration(contracts)
if(oid!==sql(contracts,"SELECT '"+indexName+"'::regclass::oid;"))throw new Error('Idempotency rebuilt index')
if(before!==sql(contracts,invariantsSql))throw new Error('Schema/security/RPC invariant changed')
passed('create, exact definition, idempotency, unchanged RPC/RLS/grants/constraints')
sql(contracts,'DROP INDEX CONCURRENTLY public.'+indexName+';')
const tx=apply(contracts,'BEGIN;\n'+readFileSync(indexFile,'utf8')+'\nROLLBACK;')
if(tx.status===0||!tx.stderr.includes('25001')||sql(contracts,"SELECT to_regclass('public."+indexName+"') IS NULL;")!=='t')throw new Error('Concurrent DDL should fail atomically inside transaction')
passed('transactional runner rejected with SQLSTATE 25001; no index persisted')
sql(contracts,'BEGIN; CREATE INDEX '+indexName+' ON public.journal_entries USING btree(user_id,ver_nr); ROLLBACK;')
if(sql(contracts,"SELECT to_regclass('public."+indexName+"') IS NULL;")!=='t')throw new Error('Regular create rollback failed')
applyMigration(contracts);sql(contracts,'DROP INDEX CONCURRENTLY public.'+indexName+';')
if(before!==sql(contracts,invariantsSql))throw new Error('Explicit removal changed bookkeeping/security')
passed('regular CREATE INDEX rollback; concurrent create/drop restores original schema')

const collisions={
 reversed:'CREATE INDEX '+indexName+' ON public.journal_entries(ver_nr,user_id);',
 unique:'CREATE UNIQUE INDEX '+indexName+' ON public.journal_entries(user_id,ver_nr);',
 partial:'CREATE INDEX '+indexName+' ON public.journal_entries(user_id,ver_nr) WHERE ver_nr>0;',
 included:'CREATE INDEX '+indexName+' ON public.journal_entries(user_id,ver_nr) INCLUDE(debit);',
 descending:'CREATE INDEX '+indexName+' ON public.journal_entries(user_id DESC,ver_nr);',
 wrong_table:'CREATE INDEX '+indexName+' ON public.accounts(user_id);',
 wrong_method:'CREATE INDEX '+indexName+' ON public.journal_entries USING hash(user_id);',
 relation:'CREATE TABLE public.'+indexName+'(id integer);'
}
for(const [label,ddl]of Object.entries(collisions)){
 const db=clone('collision_'+label);sql(db,ddl)
 const old=sql(db,"SELECT oid FROM pg_class WHERE oid=to_regclass('public."+indexName+"');")
 const r=apply(db,readFileSync(indexFile,'utf8'))
 if(r.status===0||!r.stderr.includes('55000')||old!==sql(db,"SELECT oid FROM pg_class WHERE oid=to_regclass('public."+indexName+"');"))throw new Error('Collision silently accepted/modified: '+label)
 passed('name collision rejected and preserved: '+label)
}
// Hold a writer lock across the initial concurrent-build phase, then timeout.
// This creates a real invalid nonunique index; never edit system catalogs.
const invalid=clone('invalid')
let lockOutput=''
const holder=spawn(path.join(bin,'psql.exe'),[...connection,'-X','-w','-qAt','-d',invalid,'-v','ON_ERROR_STOP=1'],{env:localEnv,windowsHide:true})
const held=new Promise((resolve,reject)=>{holder.stdout.on('data',d=>{lockOutput+=d;if(lockOutput.includes('writer-held'))resolve()});holder.on('error',reject);holder.on('close',()=>{if(!lockOutput.includes('writer-held'))reject(new Error('Writer lock not acquired'))})})
const released=new Promise(r=>holder.on('close',r))
holder.stdin.end("BEGIN; LOCK TABLE public.journal_entries IN ROW EXCLUSIVE MODE; SELECT 'writer-held'; SELECT pg_sleep(2); ROLLBACK;")
await held
const timeout=apply(invalid,"SET lock_timeout='200ms';\n"+create)
await released
if(timeout.status===0||!timeout.stderr.includes('55P03'))throw new Error('Expected concurrent-build lock timeout')
const invalidFlags=JSON.parse(sql(invalid,definitionSql))
if(invalidFlags.valid||invalidFlags.unique)throw new Error('Expected real invalid nonunique index')
const retry=apply(invalid,readFileSync(indexFile,'utf8'))
if(retry.status===0||!retry.stderr.includes('55000'))throw new Error('Invalid index retry should fail closed')
sql(invalid,'DROP INDEX CONCURRENTLY public.'+indexName+';')
applyMigration(invalid)
passed('failed concurrent build leaves invalid index; fail-closed retry and explicit cleanup/rebuild',invalidFlags)

function cli(db,dir,command){
 verify(db)
 const npxCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js')
  const r=spawnSync(process.execPath,[npxCli,'--yes','supabase@2.120.0',...command,'--db-url','postgresql://postgres@localhost:5432/'+db+'?sslmode=disable','--workdir',dir],{encoding:'utf8',env:localEnv,windowsHide:true})
 // All arguments are fixed controlled strings/allowlisted DB names, never credentials.
 return r
}
const cliDir=path.join(out,'cli')
mkdirSync(path.join(cliDir,'supabase','migrations'),{recursive:true})
writeFileSync(path.join(cliDir,'supabase','migrations',path.basename(indexFile)),readFileSync(indexFile))
const tool=clone('cli')
const up=cli(tool,cliDir,['migration','up'])
writeFileSync(path.join(out,'cli-migration-up.log'),up.stdout+up.stderr)
if(up.status!==0)throw new Error(up.stderr)
const ledger=JSON.parse(sql(tool,"SELECT jsonb_build_object('version',version,'name',name,'statements',statements) FROM supabase_migrations.schema_migrations;"))
if(ledger.version!=='20261014123000'||ledger.name!=='kan72_journal_user_ver_index'||ledger.statements.length!==2)throw new Error('CLI migration identity mismatch')
const repeat=cli(tool,cliDir,['db','push','--skip-vault','--yes'])
writeFileSync(path.join(out,'cli-db-push-repeat.log'),repeat.stdout+repeat.stderr)
if(repeat.status!==0)throw new Error(repeat.stderr)
const badTool=clone('cli_collision')
sql(badTool,collisions.reversed)
const failed=cli(badTool,cliDir,['db','push','--skip-vault','--yes'])
writeFileSync(path.join(out,'cli-db-push-collision.log'),failed.stdout+failed.stderr)
if(failed.status===0||sql(badTool,'SELECT count(*) FROM supabase_migrations.schema_migrations;')!=='0')throw new Error('Failed migration recorded despite invalid index')
passed('CLI 2.120.0 actual uninstrumented up/push, exact ledger identity, failed collision not recorded')

function writerProbe(db,rows){
 const anchor=sql(db,"SELECT transaction_id FROM public.journal_entries WHERE user_id='"+uid+"' AND ver_nr="+rows/2+" LIMIT 1;")
 const countSql="SELECT jsonb_build_object('rows',(SELECT count(*) FROM public.journal_entries),'counter',(SELECT last_ver_nr FROM public.ver_nr_sequences WHERE user_id='"+uid+"'));"
 const before=sql(db,countSql)
 let text='BEGIN;'
 for(let i=0;i<35;i++)text+=" SAVEPOINT writer; EXPLAIN (ANALYZE,BUFFERS,WAL,FORMAT JSON) INSERT INTO public.journal_entries(transaction_id,ver_nr,user_id,date,description,account_number,debit,credit) VALUES('"+anchor+"',"+rows/2+",'"+uid+"','2026-02-01','Synthetic isolated writer','1930',1,0),('"+anchor+"',"+rows/2+",'"+uid+"','2026-02-01','Synthetic isolated writer','3001',0,1); ROLLBACK TO SAVEPOINT writer; RELEASE SAVEPOINT writer;"
 text+=' ROLLBACK;'
 const raw=sql(db,text).replace(/\r/g,'')
 const plans=raw.match(/\[\n[\s\S]*?\n\]/g)?.map(s=>JSON.parse(s)[0])
 if(plans?.length!==35||before!==sql(db,countSql))throw new Error('Isolated writer probe rollback failure')
 return {plans,medianMs:percentile(plans.slice(5).map(p=>p['Execution Time']),.5),medianWalBytes:percentile(plans.slice(5).map(p=>p.Plan['WAL Bytes']),.5)}
}
const files={}
for(const [label,text]of Object.entries({sale:script(false,'sale'),period:script(true,'purchase'),deposit:script(false,'deposit',0),periodNoVat:script(true,'purchase',0)})){files[label]=path.join(out,label+'.sql');writeFileSync(files[label],text)}
const results={started:new Date().toISOString(),method:'KAN-72 RPCs identical in both modes; 1k/10k/100k owner rows + 1k other-user rows; ABBA fresh DB order without/with/with/without; per trial 300 ordinary + 150 periodized + 4x150 mixed no-VAT number-contention transactions; 35 rollback-only pure journal insert probes with first 5 discarded.',tests,rows:[]}
for(const size of [1000,10000,100000]){
 for(const [round,indexed]of [[1,false],[2,true],[3,true],[4,false]]){
  const db=clone((indexed?'with':'without')+'_'+size+'_'+round);seed(db,size)
  const before=sql(db,invariantsSql)
  const started=performance.now();if(indexed)applyMigration(db);const createMs=indexed?performance.now()-started:null
  if(before!==sql(db,invariantsSql))throw new Error('Index changed security/bookkeeping definitions')
  const row={size,round,indexed,database:db,createMs,index:indexed?JSON.parse(sql(db,definitionSql)):null,integrityPlan:integrityExplain(db,size),ordinaryRpcPlans:explainRpc(db,false),periodizedRpcPlans:explainRpc(db,true)}
  row.ordinary=await bench(db,'ordinary',[files.sale],1,300)
  row.periodized=await bench(db,'periodized',[files.period],1,150)
  row.concurrent=await bench(db,'counter-contention',[files.deposit,files.periodNoVat],4,150)
  row.postcheck=checkIntegrity(db,size/2)
  row.writer=writerProbe(db,size)
  results.rows.push(row);writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2))
  console.log(JSON.stringify({size,round,indexed,database:db,queryMs:row.integrityPlan['Execution Time'],createMs,indexBytes:row.index?.bytes,ordinary:row.ordinary,periodized:row.periodized,concurrent:{...row.concurrent,waitSamples:row.concurrent.waitSamples.length,maxWaiting:Math.max(0,...row.concurrent.waitSamples.map(x=>x.lockWait))},writer:{medianMs:row.writer.medianMs,medianWalBytes:row.writer.medianWalBytes},postcheck:row.postcheck}))
 }
}
results.finished=new Date().toISOString();writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2))
console.log('All index contracts, CLI checks, ABBA load tests and rollback/security/numbering checks passed. Evidence: '+out)
