import assert from 'node:assert/strict'
import { getOrdinarySalesVatPolicy } from '../src/lib/domesticSalesVatPolicy.ts'

const taxable = getOrdinarySalesVatPolicy('taxable')
assert.equal(taxable.status, 'taxable')
assert.equal(taxable.vatRateLocked, false)
assert.equal(taxable.amountLabel, 'Belopp inkl. moms')

const smallBusinessExempt = getOrdinarySalesVatPolicy('small_business_exempt')
assert.equal(smallBusinessExempt.status, 'exempt')
assert.equal(smallBusinessExempt.vatRateLocked, true)
assert.equal(smallBusinessExempt.forcedVatRate, 0)
assert.equal(smallBusinessExempt.amountLabel, 'Belopp')

const exemptOther = getOrdinarySalesVatPolicy('exempt_other')
assert.equal(exemptOther.status, 'exempt')
assert.equal(exemptOther.vatRateLocked, true)
assert.equal(exemptOther.forcedVatRate, 0)

const mixed = getOrdinarySalesVatPolicy('mixed')
assert.equal(mixed.status, 'blocked')
assert.equal(mixed.vatRateLocked, true)
assert.equal(mixed.forcedVatRate, 0)
assert.match(mixed.blocker, /Blandad svensk försäljning|blandad svensk försäljning/i)

const unknown = getOrdinarySalesVatPolicy('unknown')
assert.equal(unknown.status, 'blocked')
assert.equal(unknown.vatRateLocked, true)
assert.equal(unknown.forcedVatRate, 0)
assert.match(unknown.blocker, /SoloLedger gissar inte/)

console.log('Domestic sales VAT policy tests passed.')
