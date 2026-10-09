import {
  shouldShowOrdinaryPurchaseInputVatPanel,
  type OrdinaryPurchaseDefaultDeductionEntitlement,
} from '../src/lib/ordinaryPurchaseVatUi.ts'

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`)
  }
}

function visible(
  defaultDeductionEntitlement: OrdinaryPurchaseDefaultDeductionEntitlement,
  vatRate: number,
  baseEligible = true
) {
  return shouldShowOrdinaryPurchaseInputVatPanel({
    baseEligible,
    defaultDeductionEntitlement,
    vatRate,
  })
}

assertEqual(
  visible('none', 0),
  true,
  'No-deduction profiles show the input VAT explanation even at 0 percent invoice VAT'
)
assertEqual(
  visible('none', 25),
  true,
  'No-deduction profiles show the input VAT explanation at positive invoice VAT'
)

assertEqual(
  visible('unknown', 0),
  true,
  'Unknown-deduction profiles show the profile update explanation even at 0 percent invoice VAT'
)
assertEqual(
  visible('unknown', 25),
  true,
  'Unknown-deduction profiles show the profile update explanation at positive invoice VAT'
)

assertEqual(
  visible('partial', 0),
  true,
  'Partial-deduction profiles keep the same review-required explanation path at 0 percent invoice VAT'
)
assertEqual(
  visible('partial', 25),
  true,
  'Partial-deduction profiles keep the same review-required explanation path at positive invoice VAT'
)

assertEqual(
  visible('full', 0),
  false,
  'Full-deduction profiles do not need a deduction choice when the invoice has no VAT'
)
assertEqual(
  visible('full', 25),
  true,
  'Full-deduction profiles keep the deduction choice when the invoice has positive VAT'
)

for (const entitlement of ['none', 'unknown', 'partial', 'full'] as const) {
  assertEqual(
    visible(entitlement, 25, false),
    false,
    `Special flows or non-cost categories stay outside ordinary purchase VAT UI for ${entitlement}`
  )
}

console.log('Ordinary purchase VAT UI tests passed.')
