import assert from 'node:assert/strict'
import { yearCloseDateBlockReason } from '../src/lib/yearCloseDate.ts'

for (const timeZone of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo', 'Europe/Stockholm']) {
  process.env.TZ = timeZone
  assert.equal(yearCloseDateBlockReason(2025, new Date('2026-10-26T12:00:00Z')), null)
  assert.match(yearCloseDateBlockReason(2026, new Date('2026-10-26T12:00:00Z'))!, /1 januari 2027/)
  assert.match(yearCloseDateBlockReason(2027, new Date('2026-10-26T12:00:00Z'))!, /1 januari 2028/)
  assert.match(yearCloseDateBlockReason(2026, new Date('2026-12-31T22:59:59.999Z'))!, /inte avslutat/)
  assert.equal(yearCloseDateBlockReason(2026, new Date('2026-12-31T23:00:00Z')), null)
  assert.equal(yearCloseDateBlockReason(2026, new Date('2027-01-01T00:00:00Z')), null)
  assert.match(yearCloseDateBlockReason(2027, new Date('2026-12-31T23:00:00Z'))!, /inte avslutat/)
  for (const year of [NaN, 1899, 10000, 2025.5]) assert.match(yearCloseDateBlockReason(year)!, /Ogiltigt/)
}
console.log('PASS KAN-113: past/current/future year, Stockholm midnight ±1 ms, four browser timezones, invalid year')
