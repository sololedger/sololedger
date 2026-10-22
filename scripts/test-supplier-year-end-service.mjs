import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222'
globalThis.supplierFixture={owner,rows:{supplier_year_end_invoices:[],supplier_year_end_events:[],journal_entries:[]},reads:[],rpc:[],badCount:false}
const mock=`export const supabase={auth:{getUser:async()=>({data:{user:{id:globalThis.supplierFixture.owner}}})},from(table){
const filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},lte(k,v){filters.push(r=>r[k]<=v);return q},in(k,vs){filters.push(r=>vs.includes(r[k]));return q},order(){return q},
range(a,b){const fx=globalThis.supplierFixture;fx.reads.push(table);const rows=fx.rows[table].filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:rows.slice(a,b+1),count:fx.badCount?null:rows.length,error:null})}};return q}}
export async function verifiedProfileRpc(){return{userId:globalThis.supplierFixture.owner,rpc:async(name,args)=>{globalThis.supplierFixture.rpc.push({name,args});return globalThis.supplierFixture.reply??{data:{success:true,invoice_id:'a',transaction_id:'t',ver_nr:1,idempotent_replay:false},error:null}}}}`
const result=await build({entryPoints:['src/lib/supplierYearEnd.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'local-supplier-mocks',setup(b){
  b.onResolve({filter:/\/(?:supabaseClient|profileWriteGuard)$/},()=>({path:'transport',namespace:'synthetic'}));
  b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:mock}))}}]})
const module={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url))
const {getSupplierYearEndInvoices,submitSupplierCommand,SupplierRejectedError}=module.exports,fx=globalThis.supplierFixture
for(let i=0;i<1001;i++){
  fx.rows.supplier_year_end_invoices.push({id:'i'+i,user_id:owner,fiscal_year:2026,status:'booked'})
  fx.rows.supplier_year_end_events.push({invoice_id:'i'+i,user_id:owner,transaction_id:'t'+i,kind:'year_end',event_date:'2026-12-31'})
  fx.rows.journal_entries.push({user_id:owner,transaction_id:'t'+i,ver_nr:i+1})
}
fx.rows.supplier_year_end_invoices.push({id:'foreign',user_id:other,fiscal_year:2026,status:'booked'})
const rows=await getSupplierYearEndInvoices(2026,owner);assert.equal(rows.length,1001);assert.equal(rows[1000].events[0].ver_nr,1001)
assert(fx.reads.filter(t=>t==='supplier_year_end_invoices').length>=2)
fx.badCount=true;await assert.rejects(()=>getSupplierYearEndInvoices(2026,owner),/exact row count/);fx.badCount=false
fx.owner=other;await assert.rejects(()=>getSupplierYearEndInvoices(2026,owner),/Inloggningen/)
await assert.rejects(()=>submitSupplierCommand(owner,{action:'pay'}),/annat konto/);assert.equal(fx.rpc.length,0)
fx.owner=owner;const command={action:'pay',request_key:'key',invoice_id:'i',payment_date:'2027-01-15',paid_amount:1250}
assert.equal((await submitSupplierCommand(owner,command)).transaction_id,'t');assert.deepEqual(fx.rpc[0].args.p_payload,command)
fx.reply={data:null,error:{code:'23514',message:'Låst år'}};await assert.rejects(()=>submitSupplierCommand(owner,command),SupplierRejectedError)
fx.reply={data:null,error:{message:'network'}};await assert.rejects(()=>submitSupplierCommand(owner,command),e=>!(e instanceof SupplierRejectedError)&&/samma försök/.test(e.message))
fx.reply={data:{success:true},error:null};await assert.rejects(()=>submitSupplierCommand(owner,command),/kvittot/)
fx.rows.supplier_year_end_events[0].kind='payment';await assert.rejects(()=>getSupplierYearEndInvoices(2026,owner),/Underlaget/)
console.log('PASS supplier real read/write service: 1001 invoices and audit links, exact counts, owner pinning, immutable command, rejected vs uncertain receipt, inconsistent snapshot')
