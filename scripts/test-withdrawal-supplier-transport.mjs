import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { supplierFixture, supplierEvent, sealSupplier, confirmSupplierDebt } from '../tests/fixtures/withdrawalSupplierFixtures.ts'

// Actual service, proof loader and profile/token guard; only Auth/PostgREST are synthetic.
const mock = `
export const requireProfileContext=(ticket)=>{
 const f=globalThis.supplierTransport;
 if(ticket && (ticket.userId!==f.contextOwner || ticket.generation!==f.generation))throw Error('Changed profile context');
 return ticket??{userId:f.contextOwner,generation:f.generation};
};
export const supabase={auth:{
 getSession:async()=>({data:{session:{access_token:globalThis.supplierTransport.sessionOwner}},error:null}),
 getUser:async(token)=>({data:{user:{id:token}},error:null})},
 rpc(name,args){let authorization;const q={setHeader(k,v){authorization=v;return q},then(resolve,reject){
  const f=globalThis.supplierTransport;f.rpc.push({name,args,authorization});
  if(name==='save_withdrawal_assessment')return Promise.resolve({data:'revision',error:null}).then(resolve,reject);
  const n=f.rpc.filter(r=>r.name==='get_withdrawal_context').length;
  return Promise.resolve({data:structuredClone(n===1?f.snapshot:f.after??f.snapshot),error:n>1?f.afterError??null:null}).then(resolve,reject);
 }};return q},
 from(table){let authorization;const filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},
 lte(k,v){filters.push(r=>r[k]<=v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},
 setHeader(k,v){authorization=v;return q},range(a,b){const f=globalThis.supplierTransport;
  f.reads.push({table,authorization});if(f.onRead)f.onRead(table);
  const rows=(f.rows[table]??[]).filter(r=>filters.every(p=>p(r)));
  return Promise.resolve({data:structuredClone(rows.slice(a,b+1)),count:f.badCount?null:rows.length,error:f.readError??null});
 }};return q}
};`
const bundled = await build({ entryPoints: ['src/lib/withdrawalService.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'supplier-read-transport', setup(b) {
    b.onResolve({ filter: /(?:supabaseClient|profileContext)$/ }, () => ({ path: 'transport', namespace: 'synthetic' }))
    b.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: mock }))
  } }] })
const service = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
function setup(s = supplierEvent(supplierFixture(), 'paid', 'payment', '2027-01-15')) {
  const proof = structuredClone(s.supplierProof); const snapshot = structuredClone(s); delete snapshot.supplierProof
  return globalThis.supplierTransport = { contextOwner: s.user_id, sessionOwner: s.user_id, generation: 1, snapshot,
    rows: { supplier_year_end_invoices: proof.invoices, supplier_year_end_events: proof.events, journal_entries: proof.journal }, rpc: [], reads: [] }
}
let checks = 0
const pass = label => { checks++; console.log('PASS supplier withdrawal transport: ' + label) }
let f = setup()
const loaded = await service.loadWithdrawal(f.contextOwner, f.snapshot.as_of)
assert.deepEqual(loaded.assessment.result.issues, [])
assert.equal(loaded.assessment.result.recommendedOre, 6930000)
assert.equal(f.rpc.length, 2)
assert.deepEqual(f.reads.map(r => r.table), ['supplier_year_end_invoices', 'supplier_year_end_events', 'journal_entries'])
assert(f.reads.every(r => r.authorization === 'Bearer synthetic-a'))
pass('actual supplemental read, exact counts and before/after server snapshot')

for (const [label, change] of Object.entries({
  'snapshot changed during read': f => { f.after = { ...f.snapshot, signature: 'new' } },
  'advice changed during read': f => { f.after = { ...f.snapshot, revision: { user_id: f.snapshot.user_id, facts: [] } } },
  'second RPC failed': f => { f.afterError = { message: 'temporary' } },
  'profile changed while reading': f => { f.onRead = () => { f.generation++ } },
  'exact count missing': f => { f.badCount = true },
  'read error': f => { f.readError = { message: 'temporary' } },
  'foreign snapshot': f => { f.snapshot.user_id = 'other' },
})) {
  f = setup(); change(f)
  await assert.rejects(service.loadWithdrawal('synthetic-a', f.snapshot.as_of))
  assert(!f.rpc.some(r => r.name === 'save_withdrawal_assessment'))
  pass(label + ' fails closed without writes')
}
f = setup(); f.rows.supplier_year_end_events.pop()
assert.equal((await service.loadWithdrawal(f.contextOwner, f.snapshot.as_of)).assessment.result.recommendedOre, null)
pass('missing event cannot authorize a supplier transaction')
f = setup(); f.rows.supplier_year_end_invoices[0].user_id = 'other'
assert.equal((await service.loadWithdrawal(f.contextOwner, f.snapshot.as_of)).assessment.result.recommendedOre, null)
pass('owner filters cannot be bypassed by a foreign invoice')

f = setup(); f.onRead = () => { f.sessionOwner = 'other' }
await service.loadWithdrawal('synthetic-a', f.snapshot.as_of)
assert(f.reads.every(r => r.authorization === 'Bearer synthetic-a'))
assert(f.rpc.every(r => r.authorization === 'Bearer synthetic-a'))
pass('silent account switch cannot change the pinned read/RPC bearer')

const historical = supplierEvent(supplierFixture(), 'paid', 'payment', '2027-01-15')
const futureProof = structuredClone(historical.supplierProof)
historical.as_of = '2026-12-31'
historical.transactions = historical.transactions.filter(t => t.date <= historical.as_of)
historical.journal = historical.journal.filter(j => j.date <= historical.as_of)
historical.supplierProof.events = historical.supplierProof.events.filter(e => e.event_date <= historical.as_of)
sealSupplier(historical); confirmSupplierDebt(historical, 125000)
f = setup(historical)
f.rows.supplier_year_end_events = futureProof.events
f.rows.journal_entries = futureProof.journal
f.rows.supplier_year_end_invoices[0].status = 'paid'
const old = await service.loadWithdrawal(f.contextOwner, historical.as_of)
assert.deepEqual(old.assessment.result.issues, []); assert.equal(old.assessment.result.otherOre, 125000)
assert.equal(old.assessment.result.bankOre, 12500000)
assert.equal(old.snapshot.supplierProof.events.length, 1)
pass('historical cutoff ignores future payment and current paid flag')

f = setup(); const current = await service.loadWithdrawal(f.contextOwner, f.snapshot.as_of)
await service.saveWithdrawal(f.contextOwner, current.snapshot, [])
assert.equal(f.rpc.at(-1).name, 'save_withdrawal_assessment')
assert.equal(f.rpc.at(-1).args.p_signature, f.snapshot.signature)
assert.equal(f.rpc.at(-1).authorization, 'Bearer synthetic-a')
pass('save preserves the original server concurrency signature')
console.log('PASS supplier withdrawal transport ' + checks + ' checks')
