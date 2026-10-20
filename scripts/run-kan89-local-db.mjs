// Creates and removes only this explicitly allowlisted disposable LOCAL test database.
// Never connects to Supabase; never changes the source local database or reads credentials.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const db='sololedger_kan89_disposable_20261017',source='sololedger_kan84_operator_20261015'
if(process.env.SOLOLEDGER_KAN89_TEST_DB!==db||!process.env.PGPASSFILE)throw Error('Explicit disposable local DB and local PGPASSFILE required')
const bin='C:/Program Files/PostgreSQL/17/bin/'
const env={...process.env,PGSSLMODE:'disable',PGCLIENTENCODING:'UTF8',PGCONNECT_TIMEOUT:'5'}
for(const k of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','DATABASE_URL'])delete env[k]
const local=['-w','-h','localhost','-p','5432','-U','postgres']
function run(tool,args,input){const r=spawnSync(bin+tool+'.exe',args,{env,input,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:20*1024*1024});if(r.status!==0)throw Error(tool+': '+r.stderr);return r.stdout}
const psql=(database,input)=>run('psql',[...local,'-X','-Atq','-v','ON_ERROR_STOP=1','-d',database],input).trim()
const identity=JSON.parse(psql(source,"select json_build_object('database',current_database(),'address',host(inet_server_addr()))"))
assert.equal(identity.database,source);assert(['127.0.0.1','::1'].includes(identity.address))
assert.equal(psql('postgres',"select count(*) from pg_database where datname='"+db+"'"),'0','existing DB must never be overwritten')
const schema=run('pg_dump',[...local,'-d',source,'--schema-only','--no-owner'])
let created=false
try{
 run('createdb',[...local,db]);created=true
 psql(db,schema)
 run('psql',[...local,'-X','-v','ON_ERROR_STOP=1','-d',db,'-f','supabase/migrations/20261017122027_kan88_ne_sales_classification.sql'])
 const r=spawnSync(process.execPath,['scripts/test-kan89-local.mjs'],{env,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024})
 process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'')
 if(r.status!==0)throw Error('KAN-89 SQL regression failed')
}finally{
 if(created){run('dropdb',[...local,'--force',db]);console.log('PASS disposable local test database removed; source unchanged')}
}
