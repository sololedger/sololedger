-- KAN-113: calendar-year closure uses the server clock in Sweden.
-- Preserve the existing RPC signature, grants and accounting lock order.
DO $guard$
BEGIN
  IF md5(replace(pg_get_functiondef('public.close_year_atomic(integer)'::regprocedure), chr(13), ''))
     <> '9a93f74704913fc47ed5fff93223e236' THEN
    RAISE EXCEPTION 'KAN-113: close_year_atomic differs from the reviewed definition. Inspect before applying.';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.close_year_atomic(p_year integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public
AS $function$
DECLARE s jsonb;
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(),true);
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.' USING ERRCODE='22023';
  END IF;
  -- Evaluate AFTER the accounting gate, including a possible lock wait.
  -- No client clock, session timezone or caller-supplied date can bypass this.
  IF p_year >= extract(year FROM clock_timestamp() AT TIME ZONE 'Europe/Stockholm')::integer THEN
    RAISE EXCEPTION 'År % är inte avslutat. Du kan låsa året tidigast den 1 januari % (svensk tid).', p_year, p_year + 1
      USING ERRCODE='23514';
  END IF;
  PERFORM public.assert_vat_year_coverage(p_year);
  PERFORM public.lock_inventory_boundary();
  IF EXISTS(SELECT 1 FROM public.fixed_assets WHERE user_id=auth.uid() AND decision_type='capitalized' AND fiscal_year<=p_year)
    OR EXISTS(SELECT 1 FROM public.journal_entries WHERE user_id=auth.uid() AND date<=make_date(p_year,12,31) AND account_number BETWEEN '1220' AND '1249') THEN
    s:=public.inventory_depreciation_state(p_year);
    IF s->>'status'='ready' THEN RAISE EXCEPTION 'Inventarier behöver årsavskrivning innan årslås.' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN public.close_year_unchecked_inventory(p_year);
END $function$;
