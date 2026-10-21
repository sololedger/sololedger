import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EventEmitter } from 'node:events'
import { DATABASE, PASSFILE, LocalSession, validateManifest, verifyIdentity, requireApproval, localEnvironment, guardSQL } from './kan62-local-db-guard.mjs'
import { readSQL, catalogSQL } from './run-kan62-local-db.mjs'
import { waitBlocked } from './test-kan62-db-concurrency.mjs'
import { createTestRun, retainedOwnerSQL } from './kan62-local-test-run.mjs'

const m = { database: DATABASE, address:'127.0.0.1', port:5432, postgresMajor:17, oid:'12345',
  marker:'KAN62 disposable synthetic only 12345678-1234-4123-8123-123456789abc', syntheticOnly:true }
validateManifest(m)
for (const [key, value] of Object.entries({ database:'postgres', address:'::1', port:6543, postgresMajor:16,
  oid:'0', marker:'KAN62 test', syntheticOnly:false })) assert.throws(() => validateManifest({ ...m,[key]:value }))
for (const host of ['db.wbaxmuvudpnkvuliicuy.supabase.co','db.fzxqiqenqjzhlyxxpvhg.supabase.co','localhost','127.0.0.2'])
  assert.throws(() => validateManifest({ ...m,address:host }))
const actual = { ...m, sessionUser:'postgres',currentUser:'postgres' }
verifyIdentity(actual,m)
for (const key of ['database','address','port','oid','marker','postgresMajor','sessionUser','currentUser'])
  assert.throws(() => verifyIdentity({ ...actual,[key]:'wrong' },m))
const env={SOLOLEDGER_KAN62_TEST_DB:DATABASE,SOLOLEDGER_KAN62_APPROVED_OPERATION:'rollback',PGPASSFILE:PASSFILE}
const directories=new Set(),savedFiles=new Map()
const io={
  mkdirSync(url,options){if(options?.recursive)return;if(directories.has(url.href))throw Error('EEXIST');directories.add(url.href)},
  readFileSync:()=>Buffer.from('synthetic test input'),
  writeFileSync(url,body,options){assert.equal(options.flag,'wx');if(savedFiles.has(url.href))throw Error('EEXIST');savedFiles.set(url.href,body)},
}
for(const id of ['', '../old', 'overwrite.json', 'space id', 'a/b'])assert.throws(()=>createTestRun('rollback',{SOLOLEDGER_KAN62_RUN_ID:id},io))
const run=createTestRun('rollback',{SOLOLEDGER_KAN62_RUN_ID:'offline-run'},io)
run.save('result.json',{status:'PASS'})
const frozen=[...savedFiles.entries()]
assert.throws(()=>createTestRun('rollback',{SOLOLEDGER_KAN62_RUN_ID:'offline-run'},io),/EEXIST/)
assert.throws(()=>run.save('result.json',{}),/EEXIST/)
assert.throws(()=>run.save('../old.json',{}))
assert.deepEqual([...savedFiles.entries()],frozen,'evidence is append-only')
const ownerSQL=retainedOwnerSQL(['12345678-1234-4123-8123-123456789abc'])
assert(ownerSQL.includes('WHERE user_id IN'));assert(ownerSQL.includes('public.accounts'))
assert.throws(()=>retainedOwnerSQL([]));assert.throws(()=>retainedOwnerSQL(["'; DELETE"]))
requireApproval(env,'rollback')
for(const op of ['create','install','reset','drop','concurrency','legacy-fixture']) assert.throws(()=>requireApproval(env,op))
for(const key of Object.keys(env)) assert.throws(()=>requireApproval({...env,[key]:undefined},'rollback'))
const isolated=localEnvironment({ ...env,PGHOST:'remote',PGPORT:'6543',PGDATABASE:'postgres',PGHOSTADDR:'remote',
  PGSERVICE:'remote',PGOPTIONS:'-c row_security=off',PGPASSWORD:'DO_NOT_FORWARD',DATABASE_URL:'DO_NOT_FORWARD',SUPABASE_URL:'DO_NOT_FORWARD' })
for(const k of ['PGHOST','PGPORT','PGDATABASE','PGSERVICE','PGOPTIONS','PGPASSWORD','DATABASE_URL','SUPABASE_URL']) assert.equal(isolated[k],undefined)
assert.equal(isolated.PGHOSTADDR,'127.0.0.1'); assert.equal(isolated.PGSSLMODE,'disable')
const sql=guardSQL(m)
for(const fragment of [DATABASE,'127.0.0.1','5432',m.oid,m.marker,'shobj_description','session_user']) assert(sql.includes(fragment))
assert(!sql.includes('LIKE '))
// Fake psql transport: prove ordering/denial without starting a database process.
function fakeTransport(identity) {
  const writes=[],calls=[]
  const spawn=(bin,args,options)=>{
    calls.push({bin,args,options})
    const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter()
    child.stdin=new EventEmitter()
    child.stdin.write=command=>{
      writes.push(command)
      const token=command.match(/\\echo (KAN62_DONE_\d+)\n$/)[1]
      const response=writes.length===1?JSON.stringify({...identity,pid:101}):''
      queueMicrotask(()=>child.stdout.emit('data',Buffer.from(response+'\n'+token+'\n')))
    }
    child.stdin.end=()=>queueMicrotask(()=>child.emit('exit',0))
    child.kill=()=>queueMicrotask(()=>child.emit('exit',1))
    return child
  }
  return {spawn,writes,calls}
}
const bad=fakeTransport({...actual,marker:'another database'})
const deniedSession=new LocalSession(m,env,'wrong-identity',bad.spawn)
await assert.rejects(()=>deniedSession.open(),/another database/)
assert.equal(bad.writes.length,1,'wrong identity must stop before SET/DDL/DML')
assert(!bad.writes[0].match(/\b(CREATE|INSERT|UPDATE|DELETE|SET)\b/))
deniedSession.abort()
const fake=fakeTransport(actual),session=new LocalSession(m,env,'offline',fake.spawn)
await session.open();await session.run('BEGIN;');await session.asUser('12345678-1234-4123-8123-123456789abc')
await session.run('INSERT INTO synthetic_only VALUES (1);');await session.close()
assert.equal(fake.calls.length,1)
assert(fake.calls[0].args.includes(DATABASE));assert(fake.calls[0].args.includes('-X'));assert(fake.calls[0].args.includes('-w'))
assert.equal(fake.calls[0].options.env.PGHOSTADDR,'127.0.0.1')
for(const command of fake.writes.slice(2))assert(command.startsWith(guardSQL(m)),'every operational command guarded, including COMMIT/ROLLBACK')
let spawned=false
assert.throws(()=>new LocalSession(m,{},'denied',()=>{spawned=true}),/operation|approval/i)
assert.equal(spawned,false)
const rows=[{blocked:false},{blocked:true,waitType:'Lock',waitEvent:'advisory',waiter:2,blocker:1}]
const proof=await waitBlocked({run:async()=>[rows.shift()]},{pid:2},{pid:1})
assert.equal(proof.blocker,1)
await assert.rejects(()=>waitBlocked({run:async()=>[{blocked:true,waitType:'IO',waitEvent:'read'}]},{pid:2},{pid:1}))
await assert.rejects(()=>waitBlocked({run:async()=>{throw Error('must not poll')}},{pid:2},{pid:1},0),/no verified/)

const expanded=readSQL('kan62_rule_contract_candidate.sql')
assert(!expanded.includes('\\ir '),'all SQL includes resolved from explicit allowlist')
assert.throws(()=>readSQL('../migrations/anything.sql'))
const guardAt=expanded.indexOf('DO $identity$'),firstDDL=expanded.indexOf('CREATE FUNCTION')
assert(guardAt>=0 && guardAt<firstDDL,'read-only SQL identity guard before temporary DDL')
assert(expanded.includes('ROLLBACK;'))
const dollarCounts=new Map()
for(const token of expanded.match(/\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$/g)||[])dollarCounts.set(token,(dollarCounts.get(token)||0)+1)
for(const [tag,count]of dollarCounts)assert.equal(count%2,0,'unpaired SQL dollar delimiter '+tag)
assert(!/LANGUAGE\s+\w+\s+SECURITY DEFINER/i.test(expanded),'test helpers cannot impersonate admin')
assert(!expanded.includes('assert_rejects('),'no arbitrary-exception pass helper')
for(const required of ['RETURNED_SQLSTATE','MESSAGE_TEXT','SET LOCAL ROLE','same replay receipt IDs',
  'exactly three persistent group members','short life at and above threshold','old replay no extra rows',
  'real close VAT fixture','real declare VAT fixture','positive own and negative foreign RLS',
  'original journal unchanged']) {
  assert(expanded.includes(required),required)
}
const sourceFiles=['kan62-local-db-guard.mjs','kan62-local-test-run.mjs','run-kan62-local-db.mjs','test-kan62-db-concurrency.mjs']
for(const text of [expanded,...sourceFiles.map(f=>readFileSync(new URL(f,import.meta.url),'utf8'))]) {
  const withoutComments=text.replace(/--[^\n]*/g,'').replace(/\/\/[^\n]*/g,'')
  assert(!/\b(?:ALTER|CREATE|DROP)\s+(?:ROLE|USER|DATABASE)\b|\bALTER\s+SYSTEM\b|\bTRUNCATE\b/i.test(withoutComments),'no cluster changes/reset/cleanup')
}
for(const check of ['policies','constraints','triggers','indexes','memberships','securityDefiner'])assert(catalogSQL.includes(check))
const manifest=JSON.parse(readFileSync(new URL('../docs/reviews/KAN-62-LOCAL-DB-MIGRATIONS.json',import.meta.url)))
const {createHash}=await import('node:crypto')
assert.equal(manifest.migrations.length,55)
for(const [i,file]of manifest.migrations.entries()) {
  assert.equal(file.order,i+1)
  const bytes=readFileSync(new URL('../supabase/migrations/'+file.file,import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.file)
}
// Execute ONLY fail-closed entry points: no approval, no manifest, no DB tool spawned.
for(const script of ['run-kan62-local-db.mjs','test-kan62-db-concurrency.mjs']) {
  const denied=spawnSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url))],
    {env:{...process.env,SOLOLEDGER_KAN62_TEST_DB:'',SOLOLEDGER_KAN62_APPROVED_OPERATION:''},encoding:'utf8',windowsHide:true})
  assert.notEqual(denied.status,0); assert.match(denied.stderr,/approval missing/)
}
console.log('PASS KAN62 offline: identity/host/port/marker/roles, fake transport guards and no-connect denial, lock-observation logic, SQL structure, no cluster changes, 55 immutable hashes; NO SQL execution')
