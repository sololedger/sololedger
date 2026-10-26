// Actual client/session guard, synthetic Supabase transport only.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const bundle=await build({stdin:{contents:"export {checklistPort} from './src/lib/yearEndChecklistClient';export * from './src/lib/profileContext'",loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'synthetic-rpc',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'mock',namespace:'rpc'}));b.onLoad({filter:/.*/,namespace:'rpc'},()=>({contents:"export const supabase={auth:{getSession:()=>globalThis.kan112Session()},rpc:(name,args)=>({abortSignal:()=>globalThis.kan112Rpc(name,args)})}",loader:'js'}))}}]})
const m={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url),m,m.exports)
const {checklistPort,beginProfileContext,acceptProfileContext}=m.exports
const keys=['documents','bank','customers','suppliers','inventory','vat','statements','tax','submission','payments','next_year']
const data={owner:'A',year:2025,basis_version:1,basis:Object.fromEntries(keys.map(k=>[k,'a'.repeat(32)])),checks:[],system:{locked:false,periods:[],declaration_versions:0}}
const ticket=()=>{const t=beginProfileContext('A');acceptProfileContext(t,'A')};ticket()
let calls=[],mode='valid',conflictCode='PT409';globalThis.kan112Session=async()=>({data:{session:{user:{id:'A'}}},error:null})
globalThis.kan112Rpc=async(name,args)=>{calls.push({name,args});if(mode==='switch')beginProfileContext('B');if(mode==='network')throw Error('synthetic network');if(mode==='conflict')return{error:{code:conflictCode,message:'raw database text must not escape'},data:null};return{error:null,data:mode==='wrong-owner'?{...data,owner:'B'}:structuredClone(data)}}
const port=checklistPort('A',2025)
assert.equal((await port.load()).owner,'A')
const command={key:'bank',confirmed:true,revision:0,basis:data.basis.bank,requestId:'11111111-1111-4111-8111-111111111111'}
await port.save(command);await port.save(command);assert.deepEqual(calls.at(-1),calls.at(-2));assert.equal(calls.at(-1).args.p_confirmed,true)
mode='conflict';for(const code of ['PT409','40001']){conflictCode=code;const before=calls.length;await assert.rejects(port.save(command),e=>/Läs om checklistan/.test(e.message)&&!e.message.includes('raw database'));assert.equal(calls.length,before+1)}
mode='network';await assert.rejects(port.save(command),/Sparandet kunde inte bekräftas/)
mode='wrong-owner';await assert.rejects(port.load(),/kunde inte verifieras/)
mode='switch';await assert.rejects(port.load(),/profilen|Inloggningen/)
ticket();const before=calls.length;globalThis.kan112Session=async()=>({error:null,data:{session:{user:{id:'B'}}}});await assert.rejects(port.save(command),/Inloggningen/);assert.equal(calls.length,before)
delete globalThis.kan112Session;delete globalThis.kan112Rpc
console.log('PASS actual checklist client: authenticated owner/generation, bounded errors, replay arguments, network failure and wrong response owner')
