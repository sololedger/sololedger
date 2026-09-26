-- KAN-17B
-- First controlled P1 consumer migration via the existing compatibility helper.
--
-- Runtime consumers continue to call public.vat_concurrency_account(text).
-- This migration changes only that helper's implementation so P1
-- VAT period guard/concurrency relevance delegates to the central
-- KAN-17A semantic wrapper.
--
-- No booking, close, SIE, correction, report, grant, or ownership change is
-- made here.

CREATE OR REPLACE FUNCTION public.vat_concurrency_account(
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT public.vat_account_is_period_guard_relevant(p_account_number);
$function$;
