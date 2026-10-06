-- KAN-49: Add company VAT number as profile identification data.
--
-- This field is intentionally separate from VAT treatment facts. It must not
-- drive vat_status, domestic_sales_vat_treatment, foreign_purchase_reporting,
-- or default_deduction_entitlement.

ALTER TABLE public.profiles
  ADD COLUMN vat_number text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vat_number_swedish_format_check
  CHECK (
    vat_number IS NULL
    OR vat_number ~ '^SE[0-9]{12}$'
  );

COMMENT ON COLUMN public.profiles.vat_number IS
  'Company international VAT identification number. Identification/reference data only; VAT treatment is controlled by separate VAT profile facts.';

GRANT UPDATE (vat_number) ON TABLE public.profiles TO authenticated;
