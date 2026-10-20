import { buildWithdrawalAssessment, type WithdrawalFact } from '../../src/lib/withdrawalAssessment'
import { addWithdrawalFact, addWithdrawalTx, emptyWithdrawal, sealWithdrawal } from './withdrawalFixtures'
import { invoiceFixture, invoiceEvent, sealInvoice } from './withdrawalInvoiceFixtures'

type Snapshot = ReturnType<typeof emptyWithdrawal>
export class WithdrawalConflictError extends Error {}
const snapshots = new Map<string,Snapshot>()
const requests: {owner:string; asOf:string; resolve:(value:ReturnType<typeof ready>)=>void; reject:(reason:Error)=>void}[]=[]
let saves=0
function initial(owner:string,asOf:string) {
  const s=emptyWithdrawal(asOf);s.user_id=owner
  addWithdrawalTx(s,'sale',asOf,'manual',[['1930',125000],['3010',-100000],['2611',-25000]])
  s.periods.push({id:'p',user_id:owner,period_start:asOf.slice(0,4)+'-01-01',period_end:asOf.slice(0,4)+'-12-31',source:'sololedger',status:'open'})
  addWithdrawalFact(s,`rate:${asOf.slice(0,4)}`,{rate:30})
  snapshots.set(owner,sealWithdrawal(s));return s
}
function ready(s:Snapshot) { return {snapshot:structuredClone(s),assessment:buildWithdrawalAssessment(s)} }
export function loadWithdrawal(owner:string,asOf:string) {
  return new Promise<ReturnType<typeof ready>>((resolve,reject)=>requests.push({owner,asOf,resolve,reject}))
}
export async function saveWithdrawal(owner:string,snapshot:Snapshot,facts:WithdrawalFact[]) {
  saves++
  if(snapshot.user_id!==owner)throw Error('Wrong owner')
  const s=structuredClone(snapshot)
  s.revision={id:'saved-'+saves,user_id:owner,as_of_date:s.as_of,recorded_at:s.as_of,facts}
  snapshots.set(owner,sealWithdrawal(s))
}
export const withdrawalMock={
  scenario:(owner:string,kind:string)=>{
    const asOf=snapshots.get(owner)!.as_of
    if(kind==='legacy-invoice') {
      const s=invoiceFixture(25,asOf)
      s.invoices[0].vat_policy_snapshot_status='missing'
      invoiceEvent(s,'payment','payment_same_year','2026-06-01')
      snapshots.set(owner,sealInvoice(s));return
    }
    const s=initial(owner,asOf)
    for(const row of s.journal){row.debit=Number(row.debit)/10;row.credit=Number(row.credit)/10}
    addWithdrawalFact(s,'coverage',{from:asOf,noEarlierObligations:true})
    addWithdrawalFact(s,`rate:${asOf.slice(0,4)}`,{rate:35})
    if(kind==='sie')s.transactions[0].source='sie_import'
    snapshots.set(owner,sealWithdrawal(s))
  },
  addSale:(owner:string)=>{const s=snapshots.get(owner)!;addWithdrawalTx(s,'later-sale',s.as_of,'manual',[['1930',1250],['3010',-1000],['2611',-250]]);sealWithdrawal(s)},
  pending:()=>requests.map((r,i)=>({owner:r.owner,index:i})), saves:()=>saves,
  finish:(i:number)=>{const r=requests[i];if(!r)throw Error('Missing request');const s=snapshots.get(r.owner)??initial(r.owner,r.asOf);r.resolve(ready(s))},
  fail:(i:number)=>requests[i].reject(Error('Syntetiskt läsfel')),
}
