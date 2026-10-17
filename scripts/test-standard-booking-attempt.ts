import assert from 'node:assert/strict'
import {
  bookingStorageKey, readStandardBookingAttempt, saveStandardBookingAttempt,
  clearStandardBookingAttempt, parseStandardBookingReceipt, submitStandardBookingAttempt,
  StandardBookingSubmissionError, type StandardBookingAttempt,
} from '../src/lib/standardBookingAttempt.ts'
const owner='00000000-0080-4000-8000-000000000001'
const attempt: StandardBookingAttempt={version:1,userId:owner,kind:'ordinary',payload:{idempotency_key:'00000000-0080-4000-8000-000000000003',date:'2026-10-01',description:'Synthetic',amount:1250,type:'expense',vat_rate:25,input_vat_deduction_entitlement:'full',file_url:owner+'/synthetic.pdf'}}
const data=new Map<string,string>()
const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}
saveStandardBookingAttempt(storage,attempt)
const reloaded=readStandardBookingAttempt(storage,owner)
assert.deepEqual(reloaded,attempt,'reload restores exact immutable key, payload and uploaded attachment reference')
assert.equal(readStandardBookingAttempt(storage,'another-owner'),null)
assert.throws(()=>saveStandardBookingAttempt(storage,{...attempt,payload:{...attempt.payload,amount:1300}}),/Återuppta/)
const receipt={success:true,transaction_id:'00000000-0080-4000-8000-000000000004',ver_nr:1,idempotent_replay:false}
let calls=0
await assert.rejects(submitStandardBookingAttempt(attempt,async()=>{calls++;throw Error('lost response')}),e=>e instanceof StandardBookingSubmissionError&&!e.confirmedRejection)
await assert.rejects(submitStandardBookingAttempt(attempt,async()=>({data:null,error:{code:'23514',message:'early gateway error'}})),e=>e instanceof StandardBookingSubmissionError&&!e.confirmedRejection,'structured errors never clear an earlier uncertain success')
const replay=await submitStandardBookingAttempt(reloaded!,async(name,args)=>{calls++;assert.equal(name,'book_transaction_atomic');assert.deepEqual(args.p_payload,attempt.payload);return {data:{...receipt,idempotent_replay:true},error:null}})
assert.equal(calls,2);assert.equal(replay.idempotent_replay,true)
for(const malformed of [null,{}, {success:true}, {...receipt,ver_nr:NaN},{...receipt,idempotent_replay:undefined}]) assert.throws(()=>parseStandardBookingReceipt(malformed,'ordinary'),e=>e instanceof StandardBookingSubmissionError&&!e.confirmedRejection)
assert.throws(()=>parseStandardBookingReceipt(receipt,'periodized'),/Återuppta/)
assert.throws(()=>parseStandardBookingReceipt({success:false,confirmed_rejection:true,error_code:'23514',message:'hidden'},'ordinary'),e=>e instanceof StandardBookingSubmissionError&&e.confirmedRejection)
assert.throws(()=>saveStandardBookingAttempt({...storage,setItem(){throw Error('storage disabled')}},{...attempt,userId:'new-owner'}),/storage disabled/)
assert.throws(()=>clearStandardBookingAttempt({...storage,removeItem(){}},attempt),/avslutas/)
clearStandardBookingAttempt(storage,attempt)
assert.equal(readStandardBookingAttempt(storage,owner),null)
data.set(bookingStorageKey(owner),'{corrupt')
assert.throws(()=>readStandardBookingAttempt(storage,owner))
assert.throws(()=>saveStandardBookingAttempt(storage,attempt),'corrupt state never silently replaced')
console.log('PASS KAN-80 durable attempt: reload, owner scope, immutable payload/attachment, exact retry, error semantics, corrupt/blocked storage and safe release')
