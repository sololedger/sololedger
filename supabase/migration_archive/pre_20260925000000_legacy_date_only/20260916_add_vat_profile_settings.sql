-- ============================================================
-- SoloLedger – VAT profile settings
-- 2026-09-16
--
-- Adds the minimum company-level VAT configuration required
-- for the guided VAT flow.
--
-- Existing users are intentionally migrated to:
--   vat_status = 'unknown'
--
-- This migration does NOT:
-- - change existing bookkeeping
-- - modify imported SIE history
-- - create VAT periods
-- - change VAT calculation
-- - change book_transaction_atomic
-- ============================================================


-- ------------------------------------------------------------
-- 1. Add VAT settings to profiles
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN vat_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN vat_period_type text,
  ADD COLUMN vat_management_from date;


-- ------------------------------------------------------------
-- 2. Restrict allowed VAT status values
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vat_status_check
  CHECK (
    vat_status IN (
      'registered',
      'not_registered',
      'unknown'
    )
  );


-- ------------------------------------------------------------
-- 3. Restrict allowed VAT period types
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vat_period_type_check
  CHECK (
    vat_period_type IS NULL
    OR vat_period_type IN (
      'month',
      'quarter',
      'year'
    )
  );


-- ------------------------------------------------------------
-- 4. Keep the three settings internally consistent
--
-- registered:
--   period type + management start date are required
--
-- not_registered / unknown:
--   period type + management start date must be NULL
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vat_settings_consistency_check
  CHECK (
    (
      vat_status = 'registered'
      AND vat_period_type IS NOT NULL
      AND vat_management_from IS NOT NULL
    )
    OR
    (
      vat_status IN ('not_registered', 'unknown')
      AND vat_period_type IS NULL
      AND vat_management_from IS NULL
    )
  );


-- ------------------------------------------------------------
-- 5. Allow authenticated users to update only the VAT profile
--    fields in addition to the already permitted company fields.
--
-- Existing RLS still requires id = auth.uid().
-- ------------------------------------------------------------

GRANT UPDATE (
  vat_status,
  vat_period_type,
  vat_management_from
) ON TABLE public.profiles TO authenticated;