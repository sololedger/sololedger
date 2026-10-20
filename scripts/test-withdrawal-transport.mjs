import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {emptyWithdrawal,sealWithdrawal} from '../tests/fixtures/withdrawalFixtures.ts'
const bundle=await build({entryPoints:['src/lib/withdrawalService.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'synthetic-profile',setup(b){b.onResolve({filter:/profileWriteGuard$/},()=>({path:'guard',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function verifiedProfileRpc(){return globalThis.__withdrawalTransport}'}))}}]})
const service=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const calls=[];let response={data:sealWithdrawal(emptyWithdrawal('2026-10-19')),error:null}
globalThis.__withdrawalTransport={userId:'synthetic-a',rpc:async(name,args)=>{calls.push({name,args});return response}}
await service.loadWithdrawal('synthetic-a','2026-10-19')
assert.equal(calls[0].name,'get_withdrawal_context')
assert.equal(calls[0].args.p_as_of,'2026-10-19')
const good=response.data
response={data:{...good,user_id:'synthetic-b'},error:null}
await assert.rejects(service.loadWithdrawal('synthetic-a','2026-10-19'))
response={data:null,error:{message:'RPC missing'}}
await assert.rejects(service.loadWithdrawal('synthetic-a','2026-10-19'),/Databasstödet/)
const n=calls.length
await assert.rejects(service.saveWithdrawal('synthetic-b',good,[]),/Inloggningen/)
assert.equal(calls.length,n,'wrong owner never sends a request')
response={data:'revision',error:null}
await service.saveWithdrawal('synthetic-a',good,[])
assert.equal(calls.at(-1).name,'save_withdrawal_assessment')
assert.equal(calls.at(-1).args.p_previous,null)
assert.equal(calls.at(-1).args.p_signature,good.signature)
response={data:null,error:{code:'40001'}}
await assert.rejects(service.saveWithdrawal('synthetic-a',good,[]),service.WithdrawalConflictError)
assert.equal(calls.at(-1).name,'save_withdrawal_assessment','conflict never triggers unversioned fallback')
response={data:null,error:{code:'503',message:'Temporary'}}
await assert.rejects(service.saveWithdrawal('synthetic-a',good,[]),e=>e instanceof Error && !(e instanceof service.WithdrawalConflictError))
console.log('PASS KAN-97 actual transport: protocol/owner/date, missing RPC fail closed, owner-checked save and revision/signature')
