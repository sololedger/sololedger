-- Slice 1: VAT declaration clarity.
--
-- Adds the external Skatteverket submission date while preserving declared_at
-- as SoloLedger's internal audit timestamp. Declaration remains state-only:
-- no transactions or journal rows are created here.

ALTER TABLE public.vat_periods
  ADD COLUMN IF NOT EXISTS skv_submitted_on date;

COMMENT ON COLUMN public.vat_periods.skv_submitted_on IS
  'Date the user says the VAT return was submitted to Skatteverket. NULL is allowed for open/closed periods and older declared periods.';

CREATE OR REPLACE FUNCTION public.declare_vat_period_atomic(
  p_vat_period_id uuid,
  p_skv_submitted_on date
)
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
    IF v_period.skv_submitted_on IS NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_declared', true,
        'vat_period_id', v_period.id,
        'status', v_period.status,
        'source', v_period.source,
        'declared_at', v_period.declared_at,
        'skv_submitted_on', v_period.skv_submitted_on,
        'closing_amount', v_period.closing_amount,
        'closing_transaction_id', v_period.closing_transaction_id,
        'updated_at', v_period.updated_at
      );
    END IF;

    IF p_skv_submitted_on IS DISTINCT FROM v_period.skv_submitted_on THEN
      RAISE EXCEPTION 'Momsperioden är redan deklarerad med ett annat inlämningsdatum.'
        USING ERRCODE = '23514';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'already_declared', true,
      'vat_period_id', v_period.id,
      'status', v_period.status,
      'source', v_period.source,
      'declared_at', v_period.declared_at,
      'skv_submitted_on', v_period.skv_submitted_on,
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

  IF p_skv_submitted_on IS NULL THEN
    RAISE EXCEPTION 'Datum då momsdeklarationen lämnades till Skatteverket saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_skv_submitted_on > current_date THEN
    RAISE EXCEPTION 'Datum då momsdeklarationen lämnades till Skatteverket kan inte vara i framtiden.'
      USING ERRCODE = '22023';
  END IF;

  IF p_skv_submitted_on < v_period.period_end THEN
    RAISE EXCEPTION 'Datum då momsdeklarationen lämnades till Skatteverket kan inte vara före periodens slut.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.vat_periods
  SET status = 'declared',
      skv_submitted_on = p_skv_submitted_on,
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
    'skv_submitted_on', v_period.skv_submitted_on,
    'closing_amount', v_period.closing_amount,
    'closing_transaction_id', v_period.closing_transaction_id,
    'updated_at', v_period.updated_at
  );
END;
$function$;

DROP FUNCTION IF EXISTS public.declare_vat_period_atomic(uuid);

REVOKE ALL ON FUNCTION public.declare_vat_period_atomic(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.declare_vat_period_atomic(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid, date) TO postgres;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid, date) TO service_role;

COMMENT ON FUNCTION public.declare_vat_period_atomic(uuid, date) IS
  'Marks a closed SoloLedger VAT period as externally submitted to Skatteverket. Stores the submitted date and internal audit timestamp. Creates no accounting rows.';
