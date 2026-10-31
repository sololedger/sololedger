import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {yearCloseDateBlockReason} from '../src/lib/yearCloseDate.ts'
// Bind the actual page handler, preserving its error rendering without network.
const page=readFileSync('src/app/page.tsx','utf8')
const body=page.slice(page.indexOf('  async function handleLockYear()'),page.indexOf('  async function handleFavorite(')).replace('catch (err: any)','catch (err)')
assert(body.includes('await closeYear(selectedYear)'))
const message='Du behöver låsa 2024 först. Bokföringsåret 2024 är fortfarande öppet och behöver avslutas innan du kan låsa 2025.'
const alerts=[];let changed=false
const run=new Function('selectedYear','yearCloseDateBlockReason','confirm','closeYear','setIsYearLocked','refreshData','alert',body+'; return handleLockYear;')
await run(2025,yearCloseDateBlockReason,()=>true,async()=>{throw Error(message)},()=>{changed=true},async()=>{changed=true},m=>alerts.push(m))()
assert.deepEqual(alerts,['Fel vid låsning: '+message]);assert.equal(changed,false)
console.log('PASS KAN122: actual year-close handler displays chronological server rejection without marking the year locked')
