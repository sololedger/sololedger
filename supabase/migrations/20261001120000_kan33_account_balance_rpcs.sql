-- KAN-33 Phase 2: complete-safe account balance reads for reports/dashboard.
-- Read-only RPCs. They derive the tenant from auth.uid() and keep RLS in force
-- by using SECURITY INVOKER plus explicit user filters on both source tables.

CREATE OR REPLACE FUNCTION public.get_period_account_balances(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  account_number text,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required for account balance aggregation.'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    je.account_number,
    round(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)), 2)::numeric AS balance
  FROM public.transactions AS t
  JOIN public.journal_entries AS je
    ON je.transaction_id = t.id
   AND je.user_id = t.user_id
  WHERE t.user_id = v_user_id
    AND je.user_id = v_user_id
    AND t.date >= p_start_date
    AND t.date <= p_end_date
  GROUP BY je.account_number
  ORDER BY je.account_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cumulative_account_balances(
  p_through_date date
)
RETURNS TABLE (
  account_number text,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required for account balance aggregation.'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    je.account_number,
    round(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)), 2)::numeric AS balance
  FROM public.transactions AS t
  JOIN public.journal_entries AS je
    ON je.transaction_id = t.id
   AND je.user_id = t.user_id
  WHERE t.user_id = v_user_id
    AND je.user_id = v_user_id
    AND t.date <= p_through_date
  GROUP BY je.account_number
  ORDER BY je.account_number;
END;
$$;

REVOKE ALL ON FUNCTION public.get_period_account_balances(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_period_account_balances(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_period_account_balances(date, date) TO authenticated;

REVOKE ALL ON FUNCTION public.get_cumulative_account_balances(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cumulative_account_balances(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cumulative_account_balances(date) TO authenticated;

COMMENT ON FUNCTION public.get_period_account_balances(date, date) IS
  'Read-only account balance aggregation for the authenticated user over a transaction-date period. KAN-33 complete-safe replacement for client-side journal row loading.';

COMMENT ON FUNCTION public.get_cumulative_account_balances(date) IS
  'Read-only cumulative account balance aggregation for the authenticated user through a transaction date. KAN-33 complete-safe replacement for client-side journal row loading.';
