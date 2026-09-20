-- REVIEW DRAFT ONLY - DO NOT RUN AGAINST LIVE SUPABASE WITHOUT EXPLICIT APPROVAL.
--
-- KAN-8 / 3B.6 declared VAT period.
--
-- Source of truth verified against live Supabase during KAN-8 reconnaissance
-- on 2026-09-20:
--   * vat_periods.status allows 'open', 'closed', and 'declared'
--   * vat_periods.source allows 'sololedger' and 'imported_history'
--   * status consistency requires declared rows to have closing_amount IS NOT NULL
--     and declared_at IS NOT NULL
--   * closing_transaction_id may be NULL for closed/declared no-activity periods
--   * authenticated has SELECT only on vat_periods; controlled mutation must be RPC
--
-- Scope:
--   Create the atomic VAT declaration RPC only. No table, constraint, index,
--   trigger, accounting, payment, report, 1630/1930, or application-code changes.

CREATE OR REPLACE FUNCTION public.declare_vat_period_atomic(p_vat_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_period public.vat_periods%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_vat_period_id IS NULL THEN
    RAISE EXCEPTION 'Momsperiod saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- Declaration is a state/audit operation only. It does not read journal
  -- balances or write accounting rows, so the vat_periods row lock is the
  -- concurrency boundary for closed -> declared and declare -> declare races.
  SELECT *
    INTO v_period
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.source <> 'sololedger' THEN
    RAISE EXCEPTION 'Endast SoloLedger-hanterade momsperioder kan markeras som deklarerade.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'declared' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_declared', true,
      'vat_period_id', v_period.id,
      'status', v_period.status,
      'source', v_period.source,
      'declared_at', v_period.declared_at,
      'closing_amount', v_period.closing_amount,
      'closing_transaction_id', v_period.closing_transaction_id,
      'updated_at', v_period.updated_at
    );
  END IF;

  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'Endast stängda momsperioder kan markeras som deklarerade (nuvarande status: %).',
      v_period.status
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.vat_periods
  SET status = 'declared',
      declared_at = now(),
      updated_at = now()
  WHERE id = v_period.id
    AND user_id = v_user_id
  RETURNING *
    INTO v_period;

  RETURN jsonb_build_object(
    'success', true,
    'already_declared', false,
    'vat_period_id', v_period.id,
    'status', v_period.status,
    'source', v_period.source,
    'declared_at', v_period.declared_at,
    'closing_amount', v_period.closing_amount,
    'closing_transaction_id', v_period.closing_transaction_id,
    'updated_at', v_period.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.declare_vat_period_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.declare_vat_period_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid) TO service_role;
