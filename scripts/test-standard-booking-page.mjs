import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { bindPageHandlers, createBookingStorage, createBookingLocks } from './standard-booking-page-harness.mjs'
import { readStandardBookingAttempt, bookingStorageKey, StandardBookingSubmissionError } from '../src/lib/standardBookingAttempt.ts'
const owner='00000000-0080-4000-8000-000000000001'
const receipt={success:true,ver_nr:1,transaction_id:randomUUID(),idempotent_replay:false}
function page(storage=createBookingStorage(),locks=createBookingLocks()) {
 const notices=[],calls=[],file={name:'synthetic.pdf'}
 const c={console,Number,Error,Date,parseInt,crypto:{randomUUID},user:{id:owner},profile:{},
  verifyProfile:async()=>"synthetic-token",bookingOwnerLoaded:owner,bookingStorageError:null,retainedBookingAttachment:null,
  uploadedOrdinaryFile:{current:null},submitInFlightRef:{current:false},editingId:null,editingBooked:false,
  isYearLocked:false,kontoplanLoaded:true,kontoplanLoading:false,kontoplanError:null,
  kontoplan:[{id:'expense',hidden_from_new_booking:false,debit_account:'5420',credit_account:'1930'}],
  formData:{date:'2026-10-01',description:'Synthetic',amount:'1250',type:'expense',vatRate:25,inputVatDeduction:'full',file},
  periodisera:false,periodMonth:'2027-01',window:{localStorage:storage,confirm:()=>true},navigator:{locks},
  alert:message=>notices.push(message),categoryRedirectsToFixedAssets:()=>false,
  refreshFreeUsageCount:async()=>0,canCreateTransactions:()=>true,isYearClosed:async()=>false,
  handleFileUpload:async()=>{calls.push(['upload']);return owner+'/synthetic.pdf'},
  bookStandardBookingAttempt:async attempt=>{calls.push(['rpc',structuredClone(attempt)]);return receipt},
  refreshDataWithStatus:async()=>({ok:true}),
  setFormData:update=>{c.formData=update(c.formData)},setPeriodisera:v=>{c.periodisera=v},setPeriodMonth:v=>{c.periodMonth=v},
  setPendingBooking:v=>{c.pendingBooking=v},setRetainedBookingAttachment:v=>{c.retainedBookingAttachment=v},
  setLastSubmitted(){},setUploading(){},setActiveTab(){},setShowLimitPaywall(){},
 }
 return {c:bindPageHandlers(c),notices,calls,storage,locks,submit:()=>c.handleAddTransaction({preventDefault(){}})}
}
for(const kind of ['ordinary','periodized']) {
 const a=page();a.c.periodisera=kind==='periodized'
 let committed
 a.c.bookStandardBookingAttempt=async attempt=>{committed=structuredClone(attempt);throw new StandardBookingSubmissionError(false)}
 await a.submit()
 assert.equal(a.calls.filter(x=>x[0]==='upload').length,1)
 assert.match(a.notices.at(-1),/kunde inte bekräfta/)
 assert.deepEqual(readStandardBookingAttempt(a.storage,owner),committed)
 // Recreate every in-memory variable: same saved request survives page reload.
 const b=page(a.storage,a.locks)
 b.c.formData={...b.c.formData,amount:'999',description:'different after reload',file:null}
 b.c.isYearLocked=true;b.c.kontoplan=[]
 b.c.refreshFreeUsageCount=async()=>{throw Error('changed subscription/unavailable usage')}
 b.c.isYearClosed=async()=>{throw Error('mutable gate must not run on recovery')}
 b.c.bookStandardBookingAttempt=async attempt=>{assert.deepEqual(attempt,committed);b.calls.push(['rpc']);return {...receipt,idempotent_replay:true,...(kind==='periodized'?{reversal_ver_nr:2}:{})}}
 await b.c.runStandardBooking(true)
 assert.equal(b.calls.filter(x=>x[0]==='upload').length,0,'recovery never uploads')
 assert.match(b.notices.at(-1),/var redan genomförd/)
 assert.match(b.notices.at(-1),/Uppdatera sidan/,'post-booking refresh failure is not a booking failure')
 assert.doesNotMatch(b.notices.at(-1),/misslyckades|avvisades|kunde inte bekräfta/)
 assert.equal(readStandardBookingAttempt(a.storage,owner),null)
}
console.log('PASS actual page ordinary/periodized: lost response, full reload, immutable payload/attachment, bypass changed client gates, post-confirmation refresh failure')
{
 const a=page();a.c.bookStandardBookingAttempt=async()=>{throw new StandardBookingSubmissionError(true,'synthetic check')}
 await a.submit();assert.equal(readStandardBookingAttempt(a.storage,owner),null)
 assert.equal(a.c.retainedBookingAttachment.path,owner+'/synthetic.pdf')
 a.c.formData={...a.c.formData,amount:'1300',file:null};a.c.bookStandardBookingAttempt=async attempt=>{a.calls.push(['retry',attempt]);return receipt}
 await a.submit();assert.equal(a.calls.filter(x=>x[0]==='upload').length,1)
 assert.equal(a.calls.find(x=>x[0]==='retry')[1].payload.file_url,owner+'/synthetic.pdf')
 assert.match(a.notices.at(-1),/bekräftad/)
}
{
 const a=page();a.storage.setItem=()=>{throw Error('storage full')}
 await a.submit();assert.equal(a.calls.filter(x=>x[0]==='rpc').length,0,'persistence failure must stop before RPC')
}
{
 const a=page();a.c.bookStandardBookingAttempt=async()=>{a.storage.removeItem=()=>{throw Error('storage locked')};return receipt}
 await a.submit();assert.match(a.notices.at(-1),/Bokningen är bekräftad/)
 assert.ok(readStandardBookingAttempt(a.storage,owner),'failed clear retains safe replay')
}
{
 const a=page();a.storage.setItem(bookingStorageKey(owner),'{corrupt')
 await a.submit();assert.equal(a.calls.length,0,'corrupt persistence never starts a new attempt')
}
{
 const storage=createBookingStorage(),locks=createBookingLocks(),a=page(storage,locks),b=page(storage,locks)
 let unblock;const pause=new Promise(resolve=>{unblock=resolve})
 a.c.handleFileUpload=async()=>{await pause;return owner+'/synthetic.pdf'}
 const running=a.submit();await new Promise(resolve=>setTimeout(resolve,0))
 await b.submit();assert.equal(b.calls.length,0,'concurrent tab cannot upload or dispatch while first tab prepares')
 unblock();await running;assert.equal(a.calls.filter(x=>x[0]==='rpc').length,1)
}
console.log('PASS actual page: confirmed rejection/corrected retry/attachment reuse, storage failure before RPC, clear failure after success, corrupt storage and concurrent tab lock')
