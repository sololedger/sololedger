import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const manifest=JSON.parse(readFileSync(new URL('../docs/reviews/INVENTORY-LOCAL-MIGRATIONS.json',import.meta.url)))
assert.equal(manifest.files.length,3)
for(const f of manifest.files) {
  const bytes=readFileSync(new URL('../'+f.file,import.meta.url))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256)
  assert(!/\b(?:ALTER|CREATE|DROP)\s+(?:ROLE|USER|DATABASE)\b|\bALTER\s+SYSTEM\b|\bTRUNCATE\b/i.test(bytes.toString()))
}
for(const script of ['run-inventory-local-db.mjs','test-inventory-concurrency.mjs']) {
  const r=spawnSync(process.execPath,[fileURLToPath(new URL(script,import.meta.url)),'sql'],{windowsHide:true,encoding:'utf8',
    env:{...process.env,SOLOLEDGER_INVENTORY_LOCAL_APPROVED:'',SOLOLEDGER_KAN62_TEST_DB:'',SOLOLEDGER_KAN62_APPROVED_OPERATION:''}})
  assert.notEqual(r.status,0);assert.match(r.stderr,/ERR_ASSERTION/)
}
console.log('PASS inventory local guard: exact forward hashes, no global/reset SQL, no connection without approval')
