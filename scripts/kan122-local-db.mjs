// Explicit, fail-closed local target. Never reads app env or credential contents.
import assert from 'node:assert/strict'
import { spawnSync, spawn } from 'node:child_process'
export const database = 'sololedger_kan117_recovery_20261027'
export const marker = 'KAN117 recovery synthetic only 168702b9-8608-4e93-b30d-4fbc93490ff2'
export const literal = x => "'" + String(x).replaceAll("'", "''") + "'"
export const json = x => literal(JSON.stringify(x)) + '::jsonb'
const env = Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','COMSPEC'].filter(k => process.env[k]).map(k => [k,process.env[k]]))
Object.assign(env,{PGPASSFILE:'C:/SoloLedger/LocalTest/pgpass.conf',PGHOSTADDR:'127.0.0.1',PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'5',PGCLIENTENCODING:'UTF8',PGOPTIONS:'-c statement_timeout=20000 -c lock_timeout=10000 -c default_transaction_isolation=read\\ committed'})
const exe = 'C:/Program Files/PostgreSQL/17/bin/psql.exe'
const args = ['-X','-w','-h','localhost','-p','5432','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1']
export const guard = `DO $identity$ BEGIN
 IF current_database()<>${literal(database)} OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
 OR inet_server_port() IS DISTINCT FROM 5432 OR session_user<>'postgres'
 OR current_user NOT IN ('postgres','authenticated','anon','service_role')
 OR current_setting('server_version_num')::integer/10000<>17
 OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM '69031'
 OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM ${literal(marker)}
 OR current_setting('transaction_isolation')<>'read committed'
 OR EXISTS(SELECT 1 FROM pg_foreign_server) OR EXISTS(SELECT 1 FROM pg_subscription)
 THEN RAISE EXCEPTION 'KAN122 local identity/isolation mismatch'; END IF; END $identity$;`
export function query(sql) {
 const r=spawnSync(exe,args,{env,input:guard+'\n'+sql,encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:30e6})
 assert.equal(r.status,0,r.stderr || r.error?.message)
 return parse(r.stdout)
}
const parse = text => text.split(/\r?\n/).filter(l=>l.startsWith('{')||l.startsWith('[')).map(l=>JSON.parse(l))
export const auth = u => `SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub=${literal(u)};SET LOCAL request.jwt.claims=${literal(JSON.stringify({sub:u,role:'authenticated'}))};`
// Each command rechecks the server identity in the same pinned connection.
export class Session {
 async open() {
  this.child=spawn(exe,args,{env,windowsHide:true,stdio:['pipe','pipe','pipe']});this.serial=0;this.err='';this.output=''
  this.child.stdout.on('data',b=>{this.output+=b.toString();if(this.pending&&this.output.split(/\r?\n/).includes(this.pending.token)){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.resolve(parse(this.output))}})
  this.child.stderr.on('data',b=>{this.err+=b.toString()})
  this.child.on('error',e=>this.fail(e));this.child.on('exit',c=>this.fail(Error('psql exit '+c+': '+this.err)))
  this.child.stdin.on('error',()=>{})
  await this.run("SELECT jsonb_build_object('pid',pg_backend_pid());").then(r=>{this.pid=r[0].pid})
  return this
 }
 fail(e){if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(e);this.pending=null}}
 run(sql){assert(!this.pending);this.output='';const token='KAN122_DONE_'+(++this.serial);return new Promise((resolve,reject)=>{this.pending={resolve,reject,token,timer:setTimeout(()=>{this.fail(Error('KAN122 session timeout'));this.child.kill()},25000)};this.child.stdin.write(guard+'\n'+sql+'\n\\echo '+token+'\n')})}
 async close(){if(this.pending){this.child.kill();return}try{await this.run('ROLLBACK;');this.child.stdin.end('\\q\n')}catch{this.child.kill()}}
}
