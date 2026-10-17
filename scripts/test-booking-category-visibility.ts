import assert from 'node:assert/strict'
import { newBookingCategoryError, visibleNewBookingCategories } from '../src/lib/bookingCategoryVisibility.ts'
const categories = Object.freeze([
  Object.freeze({id:'egen_insättning',hidden_from_new_booking:false}),
  Object.freeze({id:'egen_insattning',hidden_from_new_booking:true}),
  Object.freeze({id:'custom',hidden_from_new_booking:false}),
  Object.freeze({id:'unknown-flag'}),
])
assert.equal(newBookingCategoryError(categories,'egen_insättning',true),null)
assert.equal(newBookingCategoryError(categories,'custom',true),null)
assert.match(newBookingCategoryError(categories,'egen_insattning',true)!,/dold/)
assert.match(newBookingCategoryError(categories,'missing',true)!,/finns inte/)
assert.match(newBookingCategoryError(categories,'custom',false)!,/inte färdigladdad/)
assert.match(newBookingCategoryError(categories,'unknown-flag',true)!,/kunde inte kontrolleras/)
assert.match(newBookingCategoryError(categories,'',true)!,/Välj kategori/)
assert.deepEqual(visibleNewBookingCategories(categories,true).map(x=>x.id),['egen_insättning','custom'])
assert.deepEqual(visibleNewBookingCategories(categories,false),[])
assert.equal(categories.length,4,'complete history list is untouched')
console.log('PASS KAN-89 visibility: legacy/custom IDs, hidden, missing, loading, unknown flag, no mutation')
