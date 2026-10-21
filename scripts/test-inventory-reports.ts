import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {aggregateVatReport, type VatReportJournalRowInput} from '../src/lib/vatReportAggregation.ts'
import {calculateVatReportFromLoadedRows, type LoadedVatReportRows} from '../src/lib/vatReportService.ts'
import {dashboardVatBreakdownFromReportResult} from '../src/lib/dashboardVat.ts'
import {calculateBusinessResult} from '../src/lib/resultEngine.ts'
import {calculateNeBalanceRows,calculateNeBalanceDiff} from '../src/lib/neBalance.ts'
import {calculateDashboard} from '../src/lib/calculations.ts'

for(const rate of [0,6,12,25]) for(const deductible of [false,true]) for(const account of ['5410','1220']) {
  const vat=deductible?rate*100:0, cost=10000+(deductible?0:rate*100)
  const rows:VatReportJournalRowInput[]=[{transactionId:'a',accountNumber:account,debit:cost,credit:0,inReportPeriod:true},
    {transactionId:'a',accountNumber:'1930',debit:0,credit:cost+vat,inReportPeriod:true}]
  if(vat) rows.push({transactionId:'a',accountNumber:'2641',debit:vat,credit:0,inReportPeriod:true})
  const input={transactions:[{id:'a',source:'fixed_asset'}],journalRows:rows,vatV2Snapshots:[]}
  const r=aggregateVatReport(input);assert.equal(r.status,'ready');if(r.status!=='ready')throw Error('blocked')
  assert.equal(r.report.fields['48'],vat);assert.equal(r.report.fields['49'],0-vat)
  if(vat) for(const bad of [rows.slice(1),rows.slice(0,2),[...rows,rows[2]],rows.map(row=>({...row,inReportPeriod:row.accountNumber!=='1930'}))]) {
    const mutated=aggregateVatReport({...input,journalRows:bad});assert.equal(mutated.status,'blocked')
  }
  for(const status of ['open','closed','declared']) {
    const result=calculateVatReportFromLoadedRows({userId:'owner',startDate:'2026-01-01',endDate:'2026-01-31',rows:{
      transactions:[{id:'a',user_id:'owner',date:'2026-01-01',source:'fixed_asset'}],
      journalRows:rows.map(row=>({user_id:'owner',transaction_id:row.transactionId,account_number:row.accountNumber,
        debit:row.debit,credit:row.credit,date:'2026-01-01'})),vatV2Snapshots:[],
      vatPeriods:[{id:'p',user_id:'owner',period_start:'2026-01-01',period_end:'2026-01-31',source:'sololedger',status,closing_amount:-vat}],
    }})
    assert.equal(result.status,'ready');if(result.status!=='ready')throw Error('service blocked')
    assert.equal(result.report.closingReconciliationRequired,false)
    const dashboard=dashboardVatBreakdownFromReportResult(result)
    assert.equal(dashboard.ingaendeMoms,vat);assert.equal(dashboard.momsNetto,0-vat);assert.equal(dashboard.manualReviewRequired,false)
  }
}
// A source carrying a single stray 2641 row is still rejected, not legitimized.
assert.equal(aggregateVatReport({transactions:[{id:'a',source:'fixed_asset'}],journalRows:[
  {transactionId:'a',accountNumber:'2641',debit:2500,credit:0,inReportPeriod:true}],vatV2Snapshots:[]}).status,'blocked')
const mismatch=calculateVatReportFromLoadedRows({userId:'u',startDate:'2026-01-01',endDate:'2026-01-31',rows:{
 transactions:[],journalRows:[],vatV2Snapshots:[],vatPeriods:[{id:'p',user_id:'u',period_start:'2026-01-01',period_end:'2026-01-31',
 source:'sololedger',status:'declared',closing_amount:-2500}]}})
assert.equal(mismatch.status,'ready');assert.equal(dashboardVatBreakdownFromReportResult(mismatch).manualReviewRequired,true)

if(process.argv[2]) {
  const e=JSON.parse(readFileSync(process.argv[2],'utf8')) as {
    users:string[]; transactions:LoadedVatReportRows['transactions'];
    journal:LoadedVatReportRows['journalRows'];periods:LoadedVatReportRows['vatPeriods']
  }
  for(const user of e.users) {
    const owned=e.journal.filter(j=>j.user_id===user)
    for(const id of new Set(owned.map(j=>j.transaction_id))) {
      const rows=owned.filter(j=>j.transaction_id===id)
      assert.equal(rows.reduce((s,j)=>s+Number(j.debit)-Number(j.credit),0),0,'actual transaction balanced')
    }
    for(const year of [2025,2026]) {
      const start=year+'-01-01',end=year+'-12-31'
      const report=calculateVatReportFromLoadedRows({userId:user,startDate:start,endDate:end,rows:{
        transactions:e.transactions.filter(t=>t.user_id===user),journalRows:owned,vatV2Snapshots:[],vatPeriods:e.periods?.filter(p=>p.user_id===user)}})
      assert.equal(report.status,'ready');if(report.status!=='ready')throw Error('actual report blocked')
      const inputVat=owned.filter(j=>j.account_number==='2641' && j.date!>=start && j.date!<=end &&
        e.transactions.find(t=>t.id===j.transaction_id)?.source==='fixed_asset').reduce((s,j)=>s+Number(j.debit),0)
      assert.equal(report.report.fields['48'],inputVat)
      assert.equal(report.report.closingReconciliationRequired,false,'actual closing/declared amount reconciles')
      const totals=(rows:typeof owned)=>rows.reduce<Record<string,number>>((r,j)=>{
        r[j.account_number]=(r[j.account_number]??0)+Number(j.debit)-Number(j.credit);return r},{})
      const cumulative=totals(owned.filter(j=>j.date!<=end)),annual=totals(owned.filter(j=>j.date!>=start&&j.date!<=end))
      const result=calculateBusinessResult(annual),cumResult=calculateBusinessResult(cumulative)
      assert.equal(result.neRows.R10,annual['7830']??0,'actual 7830 reaches NE R10')
      const ne=calculateNeBalanceRows(cumulative,-(cumulative['2018']??0)+cumResult.bokfortResultat)
      assert.equal(ne.B4,cumulative['1220']??0,'actual residual reaches NE B4')
      assert.equal(calculateNeBalanceDiff(ne),0,'actual cumulative year balance')
      const dashboard=calculateDashboard(annual,30,dashboardVatBreakdownFromReportResult(report))
      assert.equal(dashboard.bokfortResultat,result.bokfortResultat)
      assert.equal(dashboard.ingaendeMoms,inputVat)
    }
  }
  console.log('PASS actual local journals → VAT/declared periods/dashboard/NE R10+B4/balance, users='+e.users.length)
}
console.log('PASS inventory report matrix: rates, deduction, activation/expense, closing/declared, unsafe vouchers and reconciliation')
