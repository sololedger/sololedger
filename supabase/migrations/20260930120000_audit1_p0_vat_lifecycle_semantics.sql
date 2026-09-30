-- Audit #1 P0 remediation: VAT lifecycle/source semantics and payment-account boundaries.
--
-- Scope:
--   * RC-B/F2+F6: VAT settlement rows are controlled lifecycle events and must
--     not make later VAT close impossible; new settlements may not be dated
--     inside closed/declared SoloLedger VAT periods.
--   * RC-C/F3+F4: semantic non-payment accounts are rejected by server-side
--     payment-role configuration and VAT/tax-account write RPCs.
--   * F5/F10 remain intentionally unchanged in this batch.

CREATE OR REPLACE FUNCTION public.payment_account_semantic_classification(
  p_account_number text
)
RETURNS TABLE (
  account_number text,
  has_valid_format boolean,
  is_vat_account boolean,
  is_tax_account_clearing boolean,
  is_semantic_payment_candidate boolean
)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT
    n.account_number,
    n.account_number ~ '^[1-9]\d{3}$' AS has_valid_format,
    (
      n.account_number LIKE '261%'
      OR n.account_number LIKE '262%'
      OR n.account_number LIKE '263%'
      OR n.account_number LIKE '264%'
      OR n.account_number = '2650'
    ) AS is_vat_account,
    n.account_number = '2012' AS is_tax_account_clearing,
    (
      n.account_number ~ '^[1-9]\d{3}$'
      AND n.account_number NOT LIKE '261%'
      AND n.account_number NOT LIKE '262%'
      AND n.account_number NOT LIKE '263%'
      AND n.account_number NOT LIKE '264%'
      AND n.account_number <> '2650'
      AND n.account_number <> '2012'
    ) AS is_semantic_payment_candidate
  FROM (SELECT btrim(coalesce(p_account_number, '')) AS account_number) n;
$function$;

CREATE OR REPLACE FUNCTION public.payment_account_is_valid_for_payment_role(
  p_role text,
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT CASE p_role
    WHEN 'business_payment_account' THEN
      c.is_semantic_payment_candidate AND left(c.account_number, 1) = '1'
    WHEN 'owner_private_payment' THEN
      c.is_semantic_payment_candidate AND left(c.account_number, 1) = '2'
    ELSE false
  END
  FROM public.payment_account_semantic_classification(p_account_number) c;
$function$;

CREATE OR REPLACE FUNCTION public.payment_account_is_valid_for_vat_v2_payment(
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT c.is_semantic_payment_candidate
    AND left(c.account_number, 1) IN ('1', '2')
  FROM public.payment_account_semantic_classification(p_account_number) c;
$function$;

COMMENT ON FUNCTION public.payment_account_semantic_classification(text)
  IS 'Classifies BAS accounts for semantic payment-account use. VAT accounts 261x-2650 and tax clearing account 2012 are not payment candidates.';
COMMENT ON FUNCTION public.payment_account_is_valid_for_payment_role(text, text)
  IS 'Server-side authoritative payment-role account policy. Business payment accounts require valid 1xxx; owner-private payment accounts require valid 2xxx; VAT/tax-clearing accounts are rejected.';
COMMENT ON FUNCTION public.payment_account_is_valid_for_vat_v2_payment(text)
  IS 'Server-side authoritative VAT V2 payment-account policy. Allows semantic 1xxx/2xxx payment candidates while rejecting VAT/tax-clearing accounts.';

REVOKE ALL ON FUNCTION public.payment_account_semantic_classification(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_account_semantic_classification(text) FROM anon;
REVOKE ALL ON FUNCTION public.payment_account_semantic_classification(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.payment_account_semantic_classification(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.payment_account_semantic_classification(text) TO service_role;

REVOKE ALL ON FUNCTION public.payment_account_is_valid_for_payment_role(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_account_is_valid_for_payment_role(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.payment_account_is_valid_for_payment_role(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.payment_account_is_valid_for_payment_role(text, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.payment_account_is_valid_for_payment_role(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.payment_account_is_valid_for_vat_v2_payment(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payment_account_is_valid_for_vat_v2_payment(text) FROM anon;
REVOKE ALL ON FUNCTION public.payment_account_is_valid_for_vat_v2_payment(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.payment_account_is_valid_for_vat_v2_payment(text) TO postgres;
GRANT EXECUTE ON FUNCTION public.payment_account_is_valid_for_vat_v2_payment(text) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_company_payment_account_role_semantics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.payment_account_is_valid_for_payment_role(
    NEW.role,
    NEW.account_number
  ) THEN
    RAISE EXCEPTION 'Betalningskontot är inte semantiskt giltigt för rollen %: %.',
      NEW.role,
      NEW.account_number
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_company_payment_account_role_semantics
  ON public.company_payment_account_roles;

CREATE TRIGGER validate_company_payment_account_role_semantics
BEFORE INSERT OR UPDATE ON public.company_payment_account_roles
FOR EACH ROW
EXECUTE FUNCTION public.validate_company_payment_account_role_semantics();

COMMENT ON FUNCTION public.validate_company_payment_account_role_semantics()
  IS 'Rejects payment-role configuration rows that point at VAT accounts, 2012 tax clearing, wrong account class, or malformed BAS account numbers.';

REVOKE ALL ON FUNCTION public.validate_company_payment_account_role_semantics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_company_payment_account_role_semantics() FROM anon;
REVOKE ALL ON FUNCTION public.validate_company_payment_account_role_semantics() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_company_payment_account_role_semantics() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_company_payment_account_role_semantics() TO service_role;

DO $$
DECLARE
  v_definition text;
  v_old text := $old$
  IF left(v_payment_account_number, 1) NOT IN ('1', '2') THEN
    RAISE EXCEPTION 'Betalnings-/skuldkonto måste vara ett balans-, skuld- eller eget kapitalkonto.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
$old$;
  v_new text := $new$
  IF left(v_payment_account_number, 1) NOT IN ('1', '2') THEN
    RAISE EXCEPTION 'Betalnings-/skuldkonto måste vara ett balans-, skuld- eller eget kapitalkonto.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.payment_account_is_valid_for_vat_v2_payment(v_payment_account_number) THEN
    RAISE EXCEPTION 'Betalnings-/skuldkontot är inte semantiskt giltigt för VAT V2-bokning: %.', v_payment_account_number
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb)'::regprocedure
  )
    INTO v_definition;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected VAT V2 payment-account guard insertion point was not found.';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_old text := $old$
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.vat_account_requires_close_manual_review(je.account_number)
  )
  INTO v_has_265_activity;
$old$;
  v_new text := $new$
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    JOIN public.transactions tx
      ON tx.id = je.transaction_id
     AND tx.user_id = je.user_id
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.transaction_source_is_ordinary_vat_guard_activity(tx.source)
      AND public.vat_account_requires_close_manual_review(je.account_number)
  )
  INTO v_has_265_activity;
$new$;
BEGIN
  SELECT pg_get_functiondef('public.close_vat_period_atomic(uuid)'::regprocedure)
    INTO v_definition;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected VAT close 265x source-filter insertion point was not found.';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_old text := $old$
  END IF;

  SELECT *
    INTO v_period
$old$;
  v_new text := $new$
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND vp.status IN ('closed', 'declared')
      AND p_event_date BETWEEN vp.period_start AND vp.period_end
  ) THEN
    RAISE EXCEPTION 'Avräkningsdatumet ligger i en stängd eller deklarerad momsperiod och kan inte användas.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_period
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_vat_settlement_atomic(uuid,date,numeric,uuid)'::regprocedure
  )
    INTO v_definition;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected VAT settlement date-state insertion point was not found.';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_old text := $old$
    IF v_counter_account_number !~ '^[1-9]\d{3}$'
       OR v_counter_account_number = '2012'
       OR (
         v_payment_account_role = 'business_payment_account'
         AND left(v_counter_account_number, 1) <> '1'
       )
       OR (
         v_payment_account_role = 'owner_private_payment'
         AND left(v_counter_account_number, 1) <> '2'
       ) THEN
      RAISE EXCEPTION 'Det konfigurerade betalningskontot är inte giltigt för skattekontorörelsen: %.', v_counter_account_number
        USING ERRCODE = '23514';
    END IF;
$old$;
  v_new text := $new$
    IF NOT public.payment_account_is_valid_for_payment_role(
      v_payment_account_role,
      v_counter_account_number
    ) THEN
      RAISE EXCEPTION 'Det konfigurerade betalningskontot är inte giltigt för skattekontorörelsen: %.', v_counter_account_number
        USING ERRCODE = '23514';
    END IF;
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_tax_account_movement_atomic(text,date,numeric,uuid,uuid)'::regprocedure
  )
    INTO v_definition;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected tax-account movement payment-role guard insertion point was not found.';
  END IF;

  EXECUTE replace(v_definition, v_old, v_new);
END;
$$;
