import {
  normalizeCompanyVatNumber,
  validateCompanyVatNumber,
} from '../src/lib/companyProfile.ts'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`✓ ${description}`)
    passed++
    return
  }

  console.error(`✗ ${description}`)
  console.error(`  Förväntat: ${expected}`)
  console.error(`  Faktiskt:   ${actual}`)
  failed++
}

console.log('\n=== SoloLedger Company Profile Tests ===\n')

assertEqual(
  normalizeCompanyVatNumber(' se860825858101 '),
  'SE860825858101',
  'VAT number is trimmed and uppercased'
)

assertEqual(
  normalizeCompanyVatNumber(''),
  null,
  'Empty VAT number is stored as null'
)

assertEqual(
  validateCompanyVatNumber('SE860825858101').valid,
  true,
  'Jessika Foto & Media VAT number is valid'
)

assertEqual(
  validateCompanyVatNumber(null).valid,
  true,
  'Missing VAT number is allowed for existing companies'
)

assertEqual(
  validateCompanyVatNumber('860825858101').valid,
  false,
  'Swedish VAT number requires SE prefix'
)

assertEqual(
  validateCompanyVatNumber('SE86082585810').valid,
  false,
  'Swedish VAT number requires twelve digits after SE'
)

console.log('\n-----------------------------------')
console.log(`Godkända tester: ${passed}`)
console.log(`Misslyckade tester: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('✓ Alla company profile-tester godkända.\n')
}
