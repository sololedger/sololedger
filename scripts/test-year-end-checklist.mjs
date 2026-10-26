import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const bundle=await build({stdin:{contents:"export * from './src/lib/yearEndChecklist'",loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'})
const m={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports)
const {ChecklistStore,parseChecklist,needsReview,CHECK_KEYS}=m.exports
const fixture=(owner='A',year=2025)=>({owner,year,basis_version:1,basis:Object.fromEntries(CHECK_KEYS.map(k=>[k,'a'.repeat(32)])),checks:[],system:{locked:false,periods:[],declaration_versions:0}})
let data=fixture(),commands=[],fail=false,dropResponse=false,release
const port={load:async()=>structuredClone(data),save:async c=>{
 commands.push(c);if(fail)throw Error('Nätverksfel: sparandet kunde inte bekräftas.')
 if(release)await new Promise(r=>release=r)
 const row=data.checks.find(r=>r.check_key===c.key)
 if(row?.requestId===c.requestId)return structuredClone(data)
 if((row?.revision??0)!==c.revision)throw Error('Konflikt: läs om')
 data.checks=data.checks.filter(r=>r.check_key!==c.key).concat({check_key:c.key,confirmed:c.confirmed,confirmed_at:c.confirmed?'2026-10-26T09:00:00Z':null,revision:c.revision+1,basis_fingerprint:c.confirmed?data.basis[c.key]:null,basis_version:1,confirmation_version:1,requestId:c.requestId})
 if(dropResponse){dropResponse=false;throw Error('Svaret försvann')}
 return structuredClone(data)
}}
const store=new ChecklistStore(port,()=>`id-${commands.length}`)
await store.start();assert.equal(store.state.data.checks.length,0)
await store.set('bank',true);assert.equal(store.state.notice,'Sparat');assert(store.state.data.checks[0].confirmed)
const returning=new ChecklistStore(port);await returning.start();assert(returning.state.data.checks[0].confirmed)
fail=true;await store.set('bank',false);assert(store.state.error);assert.equal(store.state.notice,'');assert(store.state.data.checks[0].confirmed)
const retry=store.state.pending;fail=false;await store.retry();assert.equal(commands.at(-1).requestId,retry.requestId);assert(!store.state.data.checks[0].confirmed)
dropResponse=true;await store.set('bank',true);assert(store.state.pending);assert.equal(store.state.notice,'');await store.retry();assert.equal(store.state.data.checks[0].revision,3)
data.basis.bank='b'.repeat(32);await store.load();assert(needsReview(store.state.data,'bank'));assert(store.state.data.checks[0].confirmed)
await store.set('bank',true);assert(!needsReview(store.state.data,'bank'))
const second=new ChecklistStore(port);await second.start();await store.set('bank',false);await second.set('bank',true);assert.match(second.state.error,/Konflikt/);assert.equal(second.state.notice,'');await second.load();assert(!second.state.data.checks[0].confirmed)
release=true;const saving=store.set('bank',true);const count=commands.length;await store.set('tax',true);assert.equal(commands.length,count);release();release=null;await saving
const checks=store.state.data.checks;store.dispose();await store.set('tax',true);assert.deepEqual(store.state.data.checks,checks)
const late=new ChecklistStore({load:()=>new Promise(r=>release=r),save:port.save});const loading=late.start();late.dispose();release(fixture('B'));await loading;assert.equal(late.state.data,null)
assert.throws(()=>parseChecklist(fixture('B'),'A',2025));assert.throws(()=>parseChecklist(fixture('A',2026),'A',2025));assert.throws(()=>parseChecklist({...fixture(),basis:{}},'A',2025))
console.log('PASS checklist store: persistence, failure, uncertain retry, recheck, stale tab, rapid clicks, dispose and response identity')
