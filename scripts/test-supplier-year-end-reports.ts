import assert from 'node:assert/strict'
import {aggregateVatReport, type VatReportJournalRowInput} from '../src/lib/vatReportAggregation.ts'
import {calculateVatReportFromLoadedRows} from '../src/lib/vatReportService.ts'
import {calculateBusinessResult} from '../src/lib/resultEngine.ts'
import {calculateNeBalanceRows} from '../src/lib/neBalance.ts'
import {getTransactionSourceUiPolicy} from '../src/lib/transactionSourceUi.ts'
import {dashboardVatBreakdownFromReportResult} from '../src/lib/dashboardVat.ts'

let checks=0
for(const rate of [0,6,12,25])for(const deduction of ['none','full'])for(const sign of [1,-1]) {
  const vat=deduction==='full'?rate*10:0, gross=1000+rate*10, cost=gross-vat
  const row=(accountNumber:string,net:number):VatReportJournalRowInput=>({transactionId:'a',accountNumber,
    debit:Math.max(0,net*sign),credit:Math.max(0,-net*sign),inReportPeriod:true})
  const rows=[row('6110',cost),row('2440',-gross),...(vat?[row('2641',vat)]:[])]
  const input={transactions:[{id:'a',source:'supplier_invoice'}],journalRows:rows,vatV2Snapshots:[]}
  const report=aggregateVatReport(input);assert.equal(report.status,'ready');if(report.status!=='ready')throw Error('blocked')
  assert.equal(report.report.fields['48'],sign*vat || 0);assert.equal(report.report.fields['49'],-sign*vat || 0)
  const balances=Object.fromEntries(rows.map(r=>[r.accountNumber,r.debit-r.credit]))
  assert.equal(calculateBusinessResult(balances).bokfortResultat,-sign*cost)
  if(sign===1)assert.equal(calculateNeBalanceRows(balances,-cost).B15,gross)
  if(vat)for(const bad of [rows.slice(1),rows.slice(0,2),[...rows,rows[2]],rows.map(r=>({...r,inReportPeriod:r.accountNumber!=='2440'}))]) {
    assert.equal(aggregateVatReport({...input,journalRows:bad}).status,'blocked');checks++
  }
  // Real read/report adapter, including dashboard and closing reconciliation.
  const service=calculateVatReportFromLoadedRows({userId:'owner',startDate:'2026-01-01',endDate:'2026-12-31',rows:{
    transactions:[{id:'a',user_id:'owner',date:'2026-12-31',source:'supplier_invoice'}],
    journalRows:rows.map(r=>({user_id:'owner',transaction_id:'a',account_number:r.accountNumber,debit:r.debit,credit:r.credit,date:'2026-12-31'})),
    vatV2Snapshots:[],vatPeriods:[],
  }})
  assert.equal(service.status,'ready')
  if(service.status==='ready')assert.equal(dashboardVatBreakdownFromReportResult(service).ingaendeMoms,sign*vat || 0)
  checks++
}
for(const sign of [1,-1]) {
  const rows=[{transactionId:'p',accountNumber:'2440',debit:sign===1?1250:0,credit:sign===-1?1250:0,inReportPeriod:true},
    {transactionId:'p',accountNumber:'1930',debit:sign===-1?1250:0,credit:sign===1?1250:0,inReportPeriod:true}]
  const input={transactions:[{id:'p',source:'supplier_invoice'}],journalRows:rows,vatV2Snapshots:[]}
  const r=aggregateVatReport(input);assert.equal(r.status,'ready');if(r.status==='ready')assert.equal(r.report.fields['48'],0)
  assert.equal(calculateBusinessResult({'2440':1250*sign,'1930':-1250*sign}).bokfortResultat,0)
  assert.equal(aggregateVatReport({...input,journalRows:[...rows,{transactionId:'p',accountNumber:'2641',debit:1,credit:0,inReportPeriod:true}]}).status,'blocked')
  checks++
}
const policy=getTransactionSourceUiPolicy('supplier_invoice')
assert.equal(policy.systemManaged,true);assert.equal(policy.genericCorrectionOffered,false);assert.equal(policy.genericEditOffered,false)
console.log(`PASS supplier reports: ${checks} combinations; real report/dashboard adapters, signed corrections, payment, B15, protected history`)
