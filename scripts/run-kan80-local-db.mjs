// Schema-only bootstrap; refuses hosted targets and any pre-existing destination.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const db = 'sololedger_kan80_disposable_20261017'
const source = 'sololedger_kan84_operator_20261015'
if (process.env.SOLOLEDGER_KAN80_TEST_DB !== db || !process.env.PGPASSFILE) throw Error('Explicit disposable LOCAL database and passfile configuration required')
const env = { ...process.env, PGSSLMODE: 'disable', PGCLIENTENCODING: 'UTF8', PGCONNECT_TIMEOUT: '5' }
for (const k of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','DATABASE_URL']) delete env[k]
const bin = 'C:/Program Files/PostgreSQL/17/bin/'
const local = ['-w','-h','localhost','-p','5432','-U','postgres']
function run(tool,args,input) {
 const r = spawnSync(bin+tool+'.exe',args,{env,input,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:30*1024*1024})
 if(r.status!==0) throw Error(tool+': '+r.stderr)
 return r.stdout.trim()
}
const query = (database,input) => run('psql',[...local,'-X','-Atq','-v','ON_ERROR_STOP=1','-d',database],input)
const identity = JSON.parse(query(source,"select json_build_object('database',current_database(),'address',host(inet_server_addr()))"))
assert.equal(identity.database,source); assert(['127.0.0.1','::1'].includes(identity.address))
assert.equal(query('postgres',`select count(*) from pg_database where datname='${db}'`),'0','Never overwrite an existing DB')
const schema = run('pg_dump',[...local,'-d',source,'--schema-only','--no-owner'])
run('createdb',[...local,db])
query(db,schema)
for(const file of ['20261017122027_kan88_ne_sales_classification.sql','20261017164431_kan89_category_visibility.sql']) query(db,readFileSync('supabase/migrations/'+file,'utf8'))
assert.equal(query(db,'select count(*) from auth.users'),'0')
const definitions = JSON.parse(query(db,"select json_agg(json_build_object('name',proname,'definition',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('book_transaction_atomic','book_periodized_transaction_atomic','delete_user_data_atomic')"))
if (!process.env.KAN80_LIVE_SCHEMA_EVIDENCE) throw Error('Live schema-only evidence path required')
const live = JSON.parse(readFileSync(process.env.KAN80_LIVE_SCHEMA_EVIDENCE,'utf8'))
for(const f of definitions) assert.equal(f.definition.replaceAll('\r\n','\n'),live.functions.find(x=>x.name===f.name).definition.replaceAll('\r\n','\n'),'local fixture must match live RPC before change: '+f.name)
query(db,readFileSync('supabase/migrations/20261017190000_kan80_standard_booking_idempotency.sql','utf8'))
mkdirSync('test-results/kan80',{recursive:true})
writeFileSync('test-results/kan80/bootstrap.json',JSON.stringify({database:db,address:'localhost',authUsers:0,liveDefinitions:'exactly matched',result:'PASS'},null,2))
console.log('PASS: empty disposable local DB created; all three pre-change RPCs exactly match live; candidate applied locally only. Database retained for focused tests.')
