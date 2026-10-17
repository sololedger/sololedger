import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import OverviewCards from '../src/components/OverviewCards'
import { calculateDashboard } from '../src/lib/calculations'

const base = calculateDashboard({}, 30, { utgaendeMoms: 0, ingaendeMoms: 0, momsNetto: 0 })

function card(amount: number, blocked = false) {
  const data = { ...base, sakertUttag: amount, momsManualReviewRequired: blocked }
  const original = { ...data }
  const html = renderToStaticMarkup(
    <OverviewCards data={data} taxRate={30} selectedYear={2026} transactions={[]}
      journalMap={{}} setActiveModal={() => {}} activeModal={null} />
  )
  assert.deepEqual(data, original, 'Rendering must not change dashboard data')
  const content = html.split('Säkert uttag</p>')[1]?.split('</div></div></div>')[0]
  assert.ok(content, 'Safe withdrawal card must exist')
  return content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

const negative = card(-250)
assert.equal(negative, '0 krBeräknat utrymme: −250 kr')
assert.equal(card(1250.5), '1 250,5 kr')
assert.equal(card(0), '0 kr')
assert.equal(card(-0), '0 kr')
for (const amount of [-250, 0, 1250, NaN]) {
  assert.equal(card(amount, true), 'Kontroll krävsMoms behöver kontrolleras',
    'Existing VAT/history block must take priority over any amount')
}
for (const amount of [NaN, Infinity, -Infinity, null, undefined]) {
  assert.equal(card(amount as number), 'Kontroll krävs', 'Unknown amount must never become safe zero')
}
console.log('PASS KAN-82 rendered presentation: negative, positive, zero, blocked and unknown; data unchanged')
