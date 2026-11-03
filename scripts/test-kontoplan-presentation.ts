import assert from 'node:assert/strict'
import { filterKontoplan, groupKontoplan } from '../src/lib/kontoplanPresentation.ts'
const base={id:'forsaljning',name:'Försäljning',debit_account:'1930',credit_account:'3010',default_vat_rate:25,comment:'Kundintäkter',hidden_from_new_booking:false}
const rows=Object.freeze([Object.freeze(base),Object.freeze({...base,id:'own',name:'Eget',hidden_from_new_booking:true}),Object.freeze({...base,id:'legacy',hidden_from_new_booking:undefined})])
const snapshot=JSON.stringify(rows)
assert.deepEqual(filterKontoplan(rows,'  FÖRSÄLJNING  ','all').map(r=>r.id),['forsaljning','legacy'])
assert.equal(filterKontoplan(rows,'1930','all').length,3)
assert.equal(filterKontoplan(rows,'3010','all').length,3)
assert.equal(filterKontoplan(rows,'kundintäkter','all').length,3)
assert.equal(filterKontoplan(rows,'','visible').length,1)
assert.equal(filterKontoplan(rows,'','hidden').length,1)
assert.equal(filterKontoplan(rows,'missing','all').length,0)
assert.equal(filterKontoplan(rows,'Försäljning','hidden').length,0)
assert.equal(groupKontoplan([base])[0].label,'Försäljning')
for(const changed of [{...base,id:'unknown'},{...base,debit_account:'6991'},{...base,credit_account:'2018'},{...base,default_vat_rate:0}])assert.equal(groupKontoplan([changed])[0].label,'Övriga kategorier')
assert.equal(JSON.stringify(rows),snapshot,'presentation never mutates stored data')
console.log('PASS Kontoplan presentation: name/debit/credit/comment search, combined and unknown-visibility filters, exact preset grouping, modified/unknown fallback, immutable data')
