import assert from 'node:assert/strict'
import { allocateNeSales, parseNeSalesSummary, unavailableNeSalesClassification } from '../src/lib/neSalesClassification.ts'
import { calculateBusinessResult } from '../src/lib/resultEngine.ts'
const base = calculateBusinessResult({ '3010': -3000, '2611': -250, '1930': 3250 })
const original = structuredClone(base)
for (const [amount, expected] of [[1000, [2000,1000]], [0,[3000,0]], [-1000,[4000,-1000]]] as const) {
 const summary = parseNeSalesSummary({ version:1, r2_reallocation:amount, unresolved_count:0, unresolved_amount:0 })
 const allocated=allocateNeSales(base.neRows,summary)
 assert.deepEqual([allocated.R1,allocated.R2],expected)
 assert.equal(allocated.R1+allocated.R2,base.neRows.R1+base.neRows.R2)
 assert.equal(allocated.R3,base.neRows.R3)
}
assert.deepEqual(base,original,'input and all totals unchanged')
assert.equal(parseNeSalesSummary({version:1,r2_reallocation:0,unresolved_count:2,unresolved_amount:2000}).reviewRequired,true)
assert.equal(unavailableNeSalesClassification.reviewRequired,true)
for(const value of [null,{}, {version:1,r2_reallocation:NaN,unresolved_count:0,unresolved_amount:0}, {version:1,r2_reallocation:0,unresolved_count:-1,unresolved_amount:0}]) assert.throws(()=>parseNeSalesSummary(value))
console.log('PASS KAN-88 NE-only allocation, signed corrections, unchanged totals and incomplete-underlay rejection')
