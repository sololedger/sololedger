// Frozen ordinary test copy. Never resets/removes worktrees or old evidence.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, symlinkSync, createWriteStream } from 'node:fs'
import { resolve, dirname } from 'node:path'
const source = process.cwd()
const evidence = resolve('coverage/kan97-p2-20261020')
const target = `C:/SoloLedger/LocalTest/kan97-invoices-${Date.now()}`
assert(source.replaceAll('\\','/').endsWith('/audit-packages/KAN-104-source'))
assert(!existsSync(target)); mkdirSync(target)
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split(/\r?\n/))].filter(f => !f.startsWith('.env') && !f.startsWith('audit-packages/'))
const manifest = {}
for (const f of files) {
  assert(!f.includes('/.auth/') && !f.startsWith('.vercel/'))
  const dest = resolve(target, f); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(f, dest)
  manifest[f] = createHash('sha256').update(readFileSync(f)).digest('hex')
}
symlinkSync(resolve('../../node_modules'), resolve(target, 'node_modules'), 'junction')
const receipt = resolve(evidence, `checks-${Date.now()}.json`)
const state = { target, source, files: manifest, results: [] }
// One bounded infrastructure retry: Turbopack rejects dependencies linked
// outside this disposable copy. Use the documented --webpack dev flag only
// in the copy's smoke launcher. Assertions and application config stay intact.
const launcher = resolve(target, 'scripts/run-playwright-e2e.mjs')
const launcherText = readFileSync(launcher, 'utf8')
const adaptedLauncher = launcherText.replace("[nextBin, 'dev', '--hostname'", "[nextBin, 'dev', '--webpack', '--hostname'")
assert.notEqual(adaptedLauncher, launcherText)
writeFileSync(launcher, adaptedLauncher)
state.smokeAdapter = { file: 'scripts/run-playwright-e2e.mjs', reason: 'documented webpack dev flag for external dependency junction', original: manifest['scripts/run-playwright-e2e.mjs'], adapted: createHash('sha256').update(adaptedLauncher).digest('hex') }
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-offline-key', NEXT_TELEMETRY_DISABLED: '1', PLAYWRIGHT_BROWSERS_PATH: 'C:/Users/Familjedator/AppData/Local/ms-playwright', PLAYWRIGHT_PORT: '3197' }
for (const key of Object.keys(env)) if ((/SUPABASE|STRIPE|DATABASE_URL|PGPASS/i.test(key) && !['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'].includes(key))) delete env[key]
// Existing regression tests only read historical Git blobs. No Git writes.
env.GIT_DIR = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
env.GIT_WORK_TREE = target
env.GIT_OPTIONAL_LOCKS = '0'
// Webhook construction requires a key at build time; this is synthetic and
// paired with a closed localhost URL, never a hosted Supabase project.
env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-offline-service-key'
writeFileSync(receipt, JSON.stringify(state, null, 2))
async function run(name, args) {
  const logPath = resolve(evidence, `${name}-${Date.now()}.log`)
  const log = createWriteStream(logPath, { flags: 'wx' })
  const child = spawn(process.execPath, args, { cwd: target, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(log); child.stderr.pipe(log)
  const exit = await new Promise((done, reject) => { child.once('error', reject); child.once('exit', done) })
  log.end()
  state.results.push({ name, exit, log: logPath }); writeFileSync(receipt, JSON.stringify(state, null, 2))
  console.log(`${name}: exit ${exit}; ${logPath}`)
  return exit
}
console.log('Frozen verification directory:', target)
await run('regression', ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'run', 'test:regression'])
await run('db-invariants', ['scripts/check-db-regression-invariants.mjs'])
await run('admin-dry-run', ['scripts/test-admin-delete-dry-run.ts'])
await run('build', [resolve('../../node_modules/next/dist/bin/next'), 'build', '--webpack'])
for (const [f, hash] of Object.entries(manifest)) assert.equal(createHash('sha256').update(readFileSync(resolve(source, f))).digest('hex'), hash, 'Source unchanged during checks: '+f)
state.sourceUnchanged = true; writeFileSync(receipt, JSON.stringify(state, null, 2))
console.log('Test copy and its outputs preserved:', target)
process.exitCode = state.results.some(r => r.exit !== 0) ? 1 : 0
