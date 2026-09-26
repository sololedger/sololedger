-- KAN-19
-- Add exact 2645 to central VAT account classification.
--
-- This migration changes only public.vat_account_classification(text):
--   * P1 VAT period guard/concurrency relevance includes exact 2645.
--   * P2 VAT close balance participation includes exact 2645.
--   * P3 close manual-review relevance remains 265x only.
--
-- Do not broaden all 264x accounts here. VAT report semantics and VAT V2
-- booking/audit persistence are outside this prerequisite slice.

CREATE OR REPLACE FUNCTION public.vat_account_classification(
  p_account_number text
)
RETURNS TABLE (
  vat_period_guard_relevant boolean,
  vat_close_balance_participant boolean,
  vat_close_manual_review_relevant boolean
)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT
    (
         p_account_number LIKE '261%'
      OR p_account_number LIKE '262%'
      OR p_account_number LIKE '263%'
      OR p_account_number IN ('2641', '2645')
      OR p_account_number LIKE '265%'
    ) AS vat_period_guard_relevant,
    (
         p_account_number LIKE '261%'
      OR p_account_number LIKE '262%'
      OR p_account_number LIKE '263%'
      OR p_account_number IN ('2641', '2645')
    ) AS vat_close_balance_participant,
    (
      p_account_number LIKE '265%'
    ) AS vat_close_manual_review_relevant;
$function$;

COMMENT ON FUNCTION public.vat_account_classification(text) IS
  'Central VAT account capability classifier for VAT period guard, close balance, and close manual-review semantics. KAN-19 adds exact 2645 to period-guard and close-balance participation only.';

-- Preserve the internal-helper boundary from KAN-17A. Runtime RPCs execute
-- these helpers through SECURITY DEFINER consumers or privileged database roles.
REVOKE ALL ON FUNCTION public.vat_account_classification(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vat_account_classification(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.vat_account_classification(text) FROM anon;
