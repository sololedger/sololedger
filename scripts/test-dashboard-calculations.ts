import { calculateDashboard } from '../src/lib/calculations.ts'
import { isLegacyVatInferenceTransaction } from '../src/lib/legacyVatInference.ts'

let passed = 0
let failed = 0

function assertEqual(
  actual: unknown,
  expected: unknown,
  description: string
) {
  if (actual === expected) {
    console.log(`PASS ${description}`)
    passed++
    return
  }

  console.error(`FAIL ${description}`)
  console.error(`  Expected: ${expected}`)
  console.error(`  Actual:   ${actual}`)
  failed++
}

console.log('\n=== SoloLedger Dashboard Calculation Tests ===\n')

const ordinaryDashboard = calculateDashboard(
  { '1930': 1000, '3010': -1000 },
  30,
  {
    utgaendeMoms: 25,
    ingaendeMoms: 10,
    momsNetto: 15,
  }
)

assertEqual(
  ordinaryDashboard.momsManualReviewRequired,
  false,
  'ordinary dashboard VAT breakdown does not require manual review'
)
assertEqual(ordinaryDashboard.momsNetto, 15, 'ordinary dashboard VAT net preserved')
assertEqual(ordinaryDashboard.sakertUttag, 685, 'ordinary dashboard safe withdrawal still uses VAT payable')

const flaggedDashboard = calculateDashboard(
  { '1930': 1000, '3010': -1000 },
  30,
  {
    utgaendeMoms: 0,
    ingaendeMoms: 0,
    momsNetto: 0,
    manualReviewRequired: true,
    manualReviewMessage: 'Manuell kontroll krävs.',
  }
)

assertEqual(
  flaggedDashboard.momsManualReviewRequired,
  true,
  'ambiguous dashboard VAT breakdown carries manual review flag'
)
assertEqual(
  flaggedDashboard.momsManualReviewMessage,
  'Manuell kontroll krävs.',
  'ambiguous dashboard VAT breakdown carries manual review message'
)
assertEqual(flaggedDashboard.momsNetto, 0, 'ambiguous dashboard VAT net does not invent a payable amount')

assertEqual(
  isLegacyVatInferenceTransaction({
    source: 'sie_import',
    importBatchStatus: 'undone',
  }),
  false,
  'dashboard VAT source filter ignores original transaction from undone SIE batch'
)
assertEqual(
  isLegacyVatInferenceTransaction({
    source: 'sie_import_undo',
    importBatchStatus: 'undone',
  }),
  false,
  'dashboard VAT source filter ignores SIE undo transaction from undone batch'
)
assertEqual(
  isLegacyVatInferenceTransaction({
    source: 'sie_import',
    importBatchStatus: 'completed',
  }),
  true,
  'dashboard VAT source filter still includes completed SIE batch'
)

console.log('\n-----------------------------------')
console.log(`Passed tests: ${passed}`)
console.log(`Failed tests: ${failed}`)
console.log('-----------------------------------\n')

if (failed > 0) {
  process.exitCode = 1
} else {
  console.log('Dashboard calculation tests passed.\n')
}
