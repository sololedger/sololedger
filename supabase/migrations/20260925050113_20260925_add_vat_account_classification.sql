-- KAN-17A
-- Central VAT account classification foundation.
--
-- This migration is additive only. It does not switch any runtime
-- consumer and does not modify existing VAT V1 helpers or RPC bodies.
--
-- Current V1 capabilities represented here:
--   * VAT period guard/concurrency relevance:
--       261x, 262x, 263x, exact 2641, 265x
--   * VAT close balance participation:
--       261x, 262x, 263x, exact 2641
--   * VAT close manual-review relevance:
--       265x
--
-- Report semantics and system/non-selectable account semantics are
-- intentionally outside this KAN-17A foundation.

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
      OR p_account_number = '2641'
      OR p_account_number LIKE '265%'
    ) AS vat_period_guard_relevant,
    (
         p_account_number LIKE '261%'
      OR p_account_number LIKE '262%'
      OR p_account_number LIKE '263%'
      OR p_account_number = '2641'
    ) AS vat_close_balance_participant,
    (
      p_account_number LIKE '265%'
    ) AS vat_close_manual_review_relevant;
$function$;


CREATE OR REPLACE FUNCTION public.vat_account_is_period_guard_relevant(
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT c.vat_period_guard_relevant
  FROM public.vat_account_classification(p_account_number) AS c;
$function$;


CREATE OR REPLACE FUNCTION public.vat_account_is_close_balance_participant(
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT c.vat_close_balance_participant
  FROM public.vat_account_classification(p_account_number) AS c;
$function$;


CREATE OR REPLACE FUNCTION public.vat_account_requires_close_manual_review(
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT c.vat_close_manual_review_relevant
  FROM public.vat_account_classification(p_account_number) AS c;
$function$;


COMMENT ON FUNCTION public.vat_account_classification(text) IS
  'Central VAT account capability classifier for V1-equivalent VAT period guard, close balance, and close manual-review semantics. Additive KAN-17A foundation only; no runtime consumer is switched by this migration.';

COMMENT ON FUNCTION public.vat_account_is_period_guard_relevant(text) IS
  'Semantic wrapper over vat_account_classification(text): V1 VAT period guard/concurrency relevance.';

COMMENT ON FUNCTION public.vat_account_is_close_balance_participant(text) IS
  'Semantic wrapper over vat_account_classification(text): V1 VAT close balance participation.';

COMMENT ON FUNCTION public.vat_account_requires_close_manual_review(text) IS
  'Semantic wrapper over vat_account_classification(text): V1 VAT close manual-review relevance.';


-- These helpers are internal database primitives. Application clients
-- must not call them directly.
REVOKE ALL ON FUNCTION public.vat_account_classification(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vat_account_is_period_guard_relevant(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vat_account_is_close_balance_participant(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vat_account_requires_close_manual_review(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.vat_account_classification(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.vat_account_is_period_guard_relevant(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.vat_account_is_close_balance_participant(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.vat_account_requires_close_manual_review(text) FROM authenticated;

REVOKE ALL ON FUNCTION public.vat_account_classification(text) FROM anon;
REVOKE ALL ON FUNCTION public.vat_account_is_period_guard_relevant(text) FROM anon;
REVOKE ALL ON FUNCTION public.vat_account_is_close_balance_participant(text) FROM anon;
REVOKE ALL ON FUNCTION public.vat_account_requires_close_manual_review(text) FROM anon;
