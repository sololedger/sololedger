// No I/O or database connection at module import. Local test tools only.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

export const DATABASE = 'sololedger_kan62_disposable_20261021'
export const BIN = 'C:/Program Files/PostgreSQL/17/bin/'
export const PASSFILE = 'C:/SoloLedger/LocalTest/pgpass.conf'
export const OPERATIONS = ['rollback', 'legacy-fixture', 'concurrency']
export const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
export const json = value => literal(JSON.stringify(value)) + '::jsonb'

export function validateManifest(m) {
  assert.equal(m.database, DATABASE, 'Exact disposable database required')
  assert.equal(m.address, '127.0.0.1')
  assert.equal(m.port, 5432)
  assert.equal(m.postgresMajor, 17)
  assert.match(String(m.oid), /^[1-9][0-9]*$/)
  assert.match(m.marker, /^KAN62 disposable synthetic only [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(m.syntheticOnly, true)
  return m
}

export function requireApproval(env, operation) {
  assert(OPERATIONS.includes(operation), 'Unknown operation; no create/install/reset mode exists')
  assert.equal(env.SOLOLEDGER_KAN62_TEST_DB, DATABASE, 'Exact DB approval missing')
  assert.equal(env.SOLOLEDGER_KAN62_APPROVED_OPERATION, operation, 'Separate operation approval missing')
  assert.equal(env.PGPASSFILE, PASSFILE, 'Use established local passfile without reading it')
}

export function localEnvironment(source) {
  // Whitelist, never forward app .env, URL, PGSERVICE, PGOPTIONS or remote PG defaults.
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'COMSPEC']
    .filter(k => source[k] !== undefined).map(k => [k, source[k]]))
  return Object.assign(env, { PGPASSFILE: PASSFILE, PGHOSTADDR: '127.0.0.1', PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' })
}

export function guardSQL(manifest) {
  const m = validateManifest(manifest)
  return `DO $kan62_identity$ BEGIN
    IF current_database() <> ${literal(DATABASE)}
      OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1'
      OR inet_server_port() IS DISTINCT FROM 5432
      OR current_setting('server_version_num')::integer / 10000 <> 17
      OR session_user <> 'postgres'
      OR current_user NOT IN ('postgres','authenticated','anon','service_role')
      OR (SELECT oid::text FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM ${literal(m.oid)}
      OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM ${literal(m.marker)}
      OR current_setting('sololedger.kan62_test_approved',true) IS DISTINCT FROM 'yes'
    THEN RAISE EXCEPTION 'KAN62 isolated database identity mismatch' USING ERRCODE='42501'; END IF;
  END $kan62_identity$;\n`
}

export function verifyIdentity(actual, manifest) {
  const m = validateManifest(manifest)
  assert.equal(actual.database, m.database); assert.equal(actual.address, m.address)
  assert.equal(actual.port, m.port); assert.equal(String(actual.oid), String(m.oid))
  assert.equal(actual.marker, m.marker); assert.equal(actual.postgresMajor, 17)
  assert.equal(actual.sessionUser, 'postgres'); assert.equal(actual.currentUser, 'postgres')
  return actual
}

export class LocalSession {
  constructor(manifest, env, label, spawnProcess = spawn) {
    requireApproval(env, env.SOLOLEDGER_KAN62_APPROVED_OPERATION)
    this.manifest = validateManifest(manifest)
    this.env = localEnvironment(env); this.label = label; this.spawnProcess = spawnProcess
    this.serial = 0; this.pending = null; this.closed = false; this.log = []
  }
  async open() {
    assert(!this.child, 'Session already opened')
    this.child = this.spawnProcess(BIN + 'psql.exe', ['-w','-h','localhost','-p','5432','-U','postgres',
      '-d',DATABASE,'-X','-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],
    { env: this.env, windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    this.stdout = ''; this.stderr = ''
    this.child.stdout.on('data', b => { this.stdout += b.toString(); this.flush() })
    this.child.stderr.on('data', b => { this.stderr += b.toString() })
    this.child.stdin.on('error', () => {})
    this.child.on('error', error => this.fail(error))
    this.child.on('exit', code => {
      this.closed = true
      if (this.pending) this.fail(Error(`KAN62 ${this.label} psql exited ${code}: ${this.stderr}`))
    })
    const [identity] = await this.#raw(`SELECT json_build_object('database',current_database(),
      'address',host(inet_server_addr()),'port',inet_server_port(),'oid',
      (SELECT oid::text FROM pg_database WHERE datname=current_database()),'marker',
      (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()),
      'postgresMajor',current_setting('server_version_num')::integer/10000,
      'sessionUser',session_user,'currentUser',current_user,'pid',pg_backend_pid());`)
    verifyIdentity(identity, this.manifest); this.pid = identity.pid
    // Session-local configuration only, AFTER read-only identity verification.
    await this.#raw(`SET statement_timeout='20s'; SET lock_timeout='10s'; SET idle_in_transaction_session_timeout='30s'; SET lc_messages='C';
      SET default_transaction_isolation='read committed'; SET row_security=on;
      SELECT set_config('sololedger.kan62_test_approved','yes',false);
      SELECT set_config('sololedger.kan62_expected_oid',${literal(this.manifest.oid)},false);
      SELECT set_config('sololedger.kan62_expected_marker',${literal(this.manifest.marker)},false);`)
    await this.run('SELECT json_build_object(\'ready\',true);')
    return this
  }
  #raw(sql) {
    assert(this.child && !this.closed, 'No live session')
    assert(!this.pending, 'One command at a time per session')
    const token = `KAN62_DONE_${++this.serial}`
    this.stdout = ''
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, token, timer: setTimeout(() => {
        this.fail(Error(`KAN62 ${this.label} command timeout`)); this.abort()
      }, 25000) }
      this.child.stdin.write(sql + '\n\\echo ' + token + '\n')
    })
  }
  flush() {
    const p = this.pending
    if (!p || !this.stdout.split(/\r?\n/).includes(p.token)) return
    clearTimeout(p.timer); this.pending = null
    try {
      const values = this.stdout.split(/\r?\n/).filter(s => s.startsWith('{') || s.startsWith('[')).map(s => JSON.parse(s))
      this.log.push({ step: this.serial, values }); p.resolve(values)
    } catch (e) { p.reject(e) }
  }
  fail(error) {
    const p = this.pending
    if (p) { clearTimeout(p.timer); this.pending = null; p.reject(error) }
  }
  run(sql) { return this.#raw(guardSQL(this.manifest) + sql) }
  async asUser(uid) {
    assert.match(uid, /^[0-9a-f-]{36}$/)
    await this.run(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub',${literal(uid)},false);
      SELECT set_config('request.jwt.claims',${json({ sub: uid, role: 'authenticated' })}::text,false);
      DO $role$ BEGIN IF current_user <> 'authenticated' OR auth.uid() IS DISTINCT FROM ${literal(uid)}::uuid
        THEN RAISE EXCEPTION 'KAN62 wrong client role'; END IF; END $role$;`)
  }
  abort() { if (this.child && !this.closed) this.child.kill() }
  async close() {
    if (!this.child || this.closed) return
    if (this.pending) { this.abort(); return }
    try { await this.run('ROLLBACK;'); this.child.stdin.end('\\q\n') } catch { this.abort() }
  }
}

export function loadApprovedManifest(operation, env = process.env) {
  requireApproval(env, operation) // BEFORE even opening the local identity file.
  const migrations=JSON.parse(readFileSync(new URL('../docs/reviews/KAN-62-LOCAL-DB-MIGRATIONS.json',import.meta.url),'utf8'))
  assert.equal(migrations.migrations.length,55)
  for(const [i,migration]of migrations.migrations.entries()) {
    assert.equal(migration.order,i+1)
    assert.match(migration.file,/^[0-9]{14}_[a-z0-9_]+\.sql$/)
    const bytes=readFileSync(new URL('../supabase/migrations/'+migration.file,import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'),migration.sha256,'Migration changed since reviewed plan')
  }
  const url = new URL('../coverage/kan62-local-db/database-identity.json', import.meta.url)
  return validateManifest(JSON.parse(readFileSync(url, 'utf8')))
}
