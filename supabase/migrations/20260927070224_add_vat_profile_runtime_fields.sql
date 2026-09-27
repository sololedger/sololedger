-- KAN-19 VAT profile runtime fields.
--
-- This is an additive profile extension for company-level VAT facts used by
-- the VAT V2 runtime foundation. Existing users stay in explicit unknown
-- states; no accounting facts are inferred by this migration.

ALTER TABLE public.profiles
  ADD COLUMN domestic_sales_vat_treatment text NOT NULL DEFAULT 'unknown',
  ADD COLUMN foreign_purchase_reporting text NOT NULL DEFAULT 'unknown',
  ADD COLUMN default_deduction_entitlement text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_domestic_sales_vat_treatment_check
  CHECK (
    domestic_sales_vat_treatment IN (
      'taxable',
      'small_business_exempt',
      'mixed',
      'exempt_other',
      'unknown'
    )
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_foreign_purchase_reporting_check
  CHECK (
    foreign_purchase_reporting IN (
      'required',
      'not_required',
      'unknown'
    )
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_default_deduction_entitlement_check
  CHECK (
    default_deduction_entitlement IN (
      'full',
      'none',
      'unknown'
    )
  );

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_foreign_purchase_reporting_requires_registration_check
  CHECK (
    foreign_purchase_reporting <> 'required'
    OR vat_status = 'registered'
  );

COMMENT ON COLUMN public.profiles.domestic_sales_vat_treatment IS
  'Company-level domestic sales VAT treatment fact for VAT V2 decisions. Unknown is explicit and does not imply runtime support.';

COMMENT ON COLUMN public.profiles.foreign_purchase_reporting IS
  'Whether the company must report supported foreign purchases. Required is only valid for VAT-registered profiles.';

COMMENT ON COLUMN public.profiles.default_deduction_entitlement IS
  'Company-level default deduction context for VAT V2 fact collection. Partial deduction is intentionally not persisted in this slice.';

GRANT UPDATE (
  domestic_sales_vat_treatment,
  foreign_purchase_reporting,
  default_deduction_entitlement
) ON TABLE public.profiles TO authenticated;
