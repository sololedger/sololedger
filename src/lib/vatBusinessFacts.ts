import type {
  VatCalculationRate,
  VatGoodsOrService,
  VatYesNoUnknown,
} from './vatDomain'

export const VAT_V2_BUSINESS_FACTS_SCHEMA_VERSION =
  'vat-v2-business-facts-v1'

export type VatV2PurchaseClassification =
  | 'software_subscription_service'
  | 'other_service'
  | 'goods'
  | 'unknown'

export type VatV2DeductionEntitlementSelection =
  | 'profile_default'
  | 'full'
  | 'none'

export type VatV2DeductionEntitlementSource =
  | 'company_profile_default'
  | 'transaction_override'

export type VatV2SupportedDeductionEntitlement = 'full' | 'none'

export interface VatV2BusinessFacts {
  readonly schemaVersion: typeof VAT_V2_BUSINESS_FACTS_SCHEMA_VERSION
  readonly supplierCountry: string
  readonly customerCountry: 'SE'
  readonly purchaseClassification: Exclude<
    VatV2PurchaseClassification,
    'unknown'
  >
  readonly goodsOrService: Exclude<VatGoodsOrService, 'unknown'>
  readonly supplierVatCharged: Exclude<VatYesNoUnknown, 'unknown'>
  readonly calculationRate: VatCalculationRate
  readonly taxableBase: number
  readonly currency: 'SEK'
  readonly deductionEntitlement: VatV2SupportedDeductionEntitlement
  readonly deductionEntitlementSource: VatV2DeductionEntitlementSource
}
