-- 3B.5a-1
-- Shared VAT concurrency primitives.
--
-- IMPORTANT LOCK ORDER:
--   1. Acquire ALL required VAT month advisory locks, chronologically.
--   2. Acquire any other advisory locks (for example SIE/IB).
--   3. Acquire vat_periods row locks (FOR UPDATE), if needed.
--   4. Read protected bookkeeping state/data.
--   5. Write.
--
-- VAT concurrency scope is intentionally:
--   261x, 262x, 263x, exact 2641, 265x.
--
-- This is NOT the same thing as the VAT closing balance scope.
-- Closing balance scope remains:
--   261x, 262x, 263x, exact 2641.


CREATE OR REPLACE FUNCTION public.vat_concurrency_account(
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT
       p_account_number LIKE '261%'
    OR p_account_number LIKE '262%'
    OR p_account_number LIKE '263%'
    OR p_account_number = '2641'
    OR p_account_number LIKE '265%';
$function$;


CREATE OR REPLACE FUNCTION public.vat_month_lock_key(
  p_user_id uuid,
  p_date date
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT hashtextextended(
    'sololedger:vat:'
    || p_user_id::text
    || ':'
    || to_char(p_date, 'YYYY-MM'),
    0
  );
$function$;


CREATE OR REPLACE FUNCTION public.lock_vat_months(
  p_user_id uuid,
  p_dates date[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_month date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte autentiserad.'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION
      'Otillåtet: p_user_id matchar inte inloggad användare.'
      USING ERRCODE = '42501';
  END IF;

  IF p_dates IS NULL
     OR cardinality(p_dates) = 0 THEN
    RETURN;
  END IF;

  /*
   * GLOBAL VAT LOCK ORDER:
   * Distinct calendar months are always acquired chronologically.
   *
   * Never acquire vat_periods FOR UPDATE or another advisory-lock
   * domain before these VAT month locks in a transaction that needs both.
   */
  FOR v_month IN
    SELECT DISTINCT date_trunc('month', d)::date
    FROM unnest(p_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(
      public.vat_month_lock_key(p_user_id, v_month)
    );
  END LOOP;
END;
$function$;


-- These helpers are internal database primitives.
-- Application clients must not call them directly.
REVOKE ALL ON FUNCTION public.vat_concurrency_account(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vat_month_lock_key(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_vat_months(uuid, date[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.vat_concurrency_account(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.vat_month_lock_key(uuid, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.lock_vat_months(uuid, date[]) FROM authenticated;

REVOKE ALL ON FUNCTION public.vat_concurrency_account(text) FROM anon;
REVOKE ALL ON FUNCTION public.vat_month_lock_key(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.lock_vat_months(uuid, date[]) FROM anon;