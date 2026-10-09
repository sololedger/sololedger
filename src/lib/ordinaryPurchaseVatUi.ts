export type OrdinaryPurchaseDefaultDeductionEntitlement =
  | 'full'
  | 'none'
  | 'partial'
  | 'unknown'

export interface OrdinaryPurchaseInputVatPanelInput {
  baseEligible: boolean
  defaultDeductionEntitlement: OrdinaryPurchaseDefaultDeductionEntitlement
  vatRate: number
}

export function shouldShowOrdinaryPurchaseInputVatPanel({
  baseEligible,
  defaultDeductionEntitlement,
  vatRate,
}: OrdinaryPurchaseInputVatPanelInput) {
  if (!baseEligible) return false
  if (defaultDeductionEntitlement === 'full') return vatRate > 0
  return true
}
