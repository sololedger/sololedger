BEGIN;

CREATE OR REPLACE FUNCTION public.assert_full_input_vat_deduction_allowed(
  p_user_id uuid,
  p_requested_entitlement text,
  p_context text DEFAULT 'inköp'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_default_deduction_entitlement text;
BEGIN
  IF p_requested_entitlement IS DISTINCT FROM 'full' THEN
    RETURN;
  END IF;

  SELECT p.default_deduction_entitlement
    INTO v_default_deduction_entitlement
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR SHARE;

  IF v_default_deduction_entitlement IS DISTINCT FROM 'full' THEN
    RAISE EXCEPTION 'Företagsprofilen har inte fastställd full avdragsrätt för %. Välj inget momsavdrag eller uppdatera Profil först.', p_context
      USING ERRCODE = '23514';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_full_input_vat_deduction_allowed(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_full_input_vat_deduction_allowed(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.assert_full_input_vat_deduction_allowed(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_full_input_vat_deduction_allowed(uuid, text, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.assert_full_input_vat_deduction_allowed(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.assert_full_input_vat_deduction_allowed(uuid, text, text) IS
  'Shared server-side guard for input VAT deduction. Full deduction is allowed only when the current company profile explicitly has full deduction entitlement.';

CREATE OR REPLACE FUNCTION public.resolve_purchase_input_vat_deduction(
  p_user_id uuid,
  p_requested_entitlement text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_requested_entitlement text := btrim(coalesce(p_requested_entitlement, 'profile_default'));
  v_default_deduction_entitlement text;
BEGIN
  IF v_requested_entitlement = '' THEN
    v_requested_entitlement := 'profile_default';
  END IF;

  IF v_requested_entitlement NOT IN ('profile_default', 'full', 'none') THEN
    RAISE EXCEPTION 'Ogiltigt val för avdragsgill ingående moms.'
      USING ERRCODE = '22023';
  END IF;

  IF v_requested_entitlement = 'none' THEN
    RETURN 'none';
  END IF;

  SELECT p.default_deduction_entitlement
    INTO v_default_deduction_entitlement
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR SHARE;

  IF v_requested_entitlement = 'full' THEN
    PERFORM public.assert_full_input_vat_deduction_allowed(
      p_user_id,
      'full',
      'vanligt inköp'
    );
    RETURN 'full';
  END IF;

  IF v_default_deduction_entitlement = 'full' THEN
    RETURN 'full';
  END IF;

  -- Unknown or missing profile entitlement means no automatic deduction.
  RETURN 'none';
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_purchase_input_vat_deduction(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_purchase_input_vat_deduction(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_purchase_input_vat_deduction(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_purchase_input_vat_deduction(uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.resolve_purchase_input_vat_deduction(uuid, text) TO service_role;

COMMENT ON FUNCTION public.resolve_purchase_input_vat_deduction(uuid, text) IS
  'Resolves ordinary purchase input VAT deduction at booking time. Unknown or missing profile settings do not create automatic deduction.';

CREATE OR REPLACE FUNCTION public.book_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_date date;
  v_description text;
  v_amount numeric;
  v_type text;
  v_vat_rate numeric;
  v_vat_status text;
  v_file_url text;

  v_debit_account text;
  v_credit_account text;
  v_is_income boolean;

  v_vat_amount numeric;
  v_net_amount numeric;
  v_output_vat_account text;
  v_input_vat_deduction text := 'none';
  v_deductible_vat_amount numeric := 0;
  v_expense_amount numeric;

  v_ver_nr integer;
  v_tx_id uuid;

  v_needs_vat_lock boolean := false;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_payload->>'date' IS NULL
     OR p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat bokföringsdatum.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_date := (p_payload->>'date')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltigt bokföringsdatum: %.', p_payload->>'date'
      USING ERRCODE = '22023';
  END;

  v_description := btrim(coalesce(p_payload->>'description', ''));
  IF v_description = '' THEN
    RAISE EXCEPTION 'Beskrivning saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'amount' IS NULL
     OR p_payload->>'amount' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat belopp.'
      USING ERRCODE = '22023';
  END IF;
  v_amount := (p_payload->>'amount')::numeric;

  v_type := p_payload->>'type';
  IF v_type IS NULL OR btrim(v_type) = '' THEN
    RAISE EXCEPTION 'Kategori/kontotyp saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'vat_rate' IS NULL OR p_payload->>'vat_rate' = '' THEN
    v_vat_rate := 0;
  ELSIF p_payload->>'vat_rate' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltig momssats.'
      USING ERRCODE = '22023';
  ELSE
    v_vat_rate := (p_payload->>'vat_rate')::numeric;
  END IF;

  IF v_vat_rate NOT IN (0, 6, 12, 25) THEN
    RAISE EXCEPTION
      'Momssatsen % stöds inte. Tillåtna satser är 0, 6, 12 och 25 procent.',
      v_vat_rate
      USING ERRCODE = '22023';
  END IF;

  SELECT p.vat_status
    INTO v_vat_status
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF coalesce(v_vat_status, 'unknown') = 'not_registered'
     AND v_vat_rate <> 0 THEN
    RAISE EXCEPTION
      'Företaget är markerat som inte momsregistrerat. Momssatsen måste vara 0 procent för nya vanliga bokningar.'
      USING ERRCODE = '23514';
  END IF;

  v_file_url := nullif(p_payload->>'file_url', '');

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_date)::int
      USING ERRCODE = '23514';
  END IF;

  SELECT debit_account, credit_account
    INTO v_debit_account, v_credit_account
  FROM public.accounts
  WHERE id = v_type
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konto saknas eller tillhör inte användaren: %.', v_type
      USING ERRCODE = '23503';
  END IF;

  IF v_debit_account IS NULL OR btrim(v_debit_account) = ''
     OR v_credit_account IS NULL OR btrim(v_credit_account) = '' THEN
    RAISE EXCEPTION 'Kontotyp % saknar debet- eller kreditkonto.', v_type
      USING ERRCODE = '23514';
  END IF;

  v_vat_amount :=
    CASE
      WHEN v_vat_rate > 0
        THEN round((v_amount - (v_amount / (1 + v_vat_rate / 100)))::numeric, 2)
      ELSE 0
    END;

  v_net_amount := round((v_amount - v_vat_amount)::numeric, 2);
  v_is_income := left(v_credit_account, 1) = '3';

  IF v_is_income AND v_vat_amount > 0 THEN
    v_output_vat_account :=
      CASE v_vat_rate
        WHEN 25 THEN '2611'
        WHEN 12 THEN '2621'
        WHEN 6  THEN '2631'
        ELSE NULL
      END;

    IF v_output_vat_account IS NULL THEN
      RAISE EXCEPTION 'Momssatsen % stöds inte för svensk försäljning. Tillåtna satser är 0, 6, 12 och 25 procent.', v_vat_rate
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT v_is_income AND v_vat_amount > 0 THEN
    v_input_vat_deduction := public.resolve_purchase_input_vat_deduction(
      v_user_id,
      p_payload->>'input_vat_deduction_entitlement'
    );
  END IF;

  v_deductible_vat_amount :=
    CASE
      WHEN NOT v_is_income
           AND v_vat_amount > 0
           AND v_input_vat_deduction = 'full'
        THEN v_vat_amount
      ELSE 0
    END;
  v_expense_amount := round((v_amount - v_deductible_vat_amount)::numeric, 2);

  v_needs_vat_lock :=
       public.vat_concurrency_account(v_debit_account)
    OR public.vat_concurrency_account(v_credit_account)
    OR (
         v_vat_amount > 0
         AND v_is_income
         AND public.vat_concurrency_account(v_output_vat_account)
       )
    OR (
         v_deductible_vat_amount > 0
         AND public.vat_concurrency_account('2641')
       );

  IF v_needs_vat_lock THEN
    PERFORM public.lock_vat_months(
      v_user_id,
      ARRAY[v_date]::date[]
    );

    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar bokföringsdatum %. Bokningen stoppades för manuell kontroll.',
        v_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för bokföringsdatum % är redan stängd eller deklarerad. Bokningen kan inte genomföras.',
        v_date
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT public.get_next_ver_nr(v_user_id) INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer.';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    file_url,
    booked
  ) VALUES (
    v_user_id,
    v_date,
    v_description,
    v_amount,
    v_type,
    v_vat_rate,
    v_file_url,
    true
  )
  RETURNING id INTO v_tx_id;

  IF v_is_income THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES
      (
        v_tx_id, v_ver_nr, v_debit_account,
        v_amount, 0, v_description, v_date, v_user_id
      ),
      (
        v_tx_id, v_ver_nr, v_credit_account,
        0, v_net_amount, v_description, v_date, v_user_id
      );

    IF v_vat_amount > 0 THEN
      INSERT INTO public.journal_entries (
        transaction_id, ver_nr, account_number,
        debit, credit, description, date, user_id
      )
      VALUES (
        v_tx_id, v_ver_nr, v_output_vat_account,
        0, v_vat_amount,
        'Utgående moms på ' || v_description,
        v_date, v_user_id
      );
    END IF;

  ELSE
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES
      (
        v_tx_id, v_ver_nr, v_debit_account,
        v_expense_amount, 0, v_description, v_date, v_user_id
      ),
      (
        v_tx_id, v_ver_nr, v_credit_account,
        0, v_amount, v_description, v_date, v_user_id
      );

    IF v_deductible_vat_amount > 0 THEN
      INSERT INTO public.journal_entries (
        transaction_id, ver_nr, account_number,
        debit, credit, description, date, user_id
      )
      VALUES (
        v_tx_id, v_ver_nr, '2641',
        v_deductible_vat_amount, 0,
        'Ingående moms på ' || v_description,
        v_date, v_user_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.book_periodized_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  v_original_date date;
  v_future_date date;
  v_year_end date;

  v_description text;
  v_amount numeric;
  v_type text;
  v_vat_rate numeric;
  v_vat_status text;
  v_file_url text;

  v_debit_account text;
  v_credit_account text;

  v_vat_amount numeric;
  v_input_vat_deduction text := 'none';
  v_deductible_vat_amount numeric := 0;
  v_periodized_amount numeric;

  v_ver_nr integer;
  v_reversal_ver_nr integer;

  v_periodization_group_id uuid := gen_random_uuid();
  v_tx_id uuid;
  v_reversal_tx_id uuid;

  v_needs_vat_lock boolean := false;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_payload->>'date' IS NULL
     OR p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat bokföringsdatum.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'future_date' IS NULL
     OR p_payload->>'future_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat vändningsdatum.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_original_date := (p_payload->>'date')::date;
    v_future_date := (p_payload->>'future_date')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltigt datum i periodiseringen.'
      USING ERRCODE = '22023';
  END;

  v_year_end := make_date(extract(year from v_original_date)::int, 12, 31);

  v_description := btrim(coalesce(p_payload->>'description', ''));
  IF v_description = '' THEN
    RAISE EXCEPTION 'Beskrivning saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'amount' IS NULL
     OR p_payload->>'amount' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat belopp.'
      USING ERRCODE = '22023';
  END IF;
  v_amount := (p_payload->>'amount')::numeric;

  v_type := p_payload->>'type';
  IF v_type IS NULL OR btrim(v_type) = '' THEN
    RAISE EXCEPTION 'Kategori/kontotyp saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'vat_rate' IS NULL OR p_payload->>'vat_rate' = '' THEN
    v_vat_rate := 0;
  ELSIF p_payload->>'vat_rate' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltig momssats.'
      USING ERRCODE = '22023';
  ELSE
    v_vat_rate := (p_payload->>'vat_rate')::numeric;
  END IF;

  IF v_vat_rate NOT IN (0, 6, 12, 25) THEN
    RAISE EXCEPTION
      'Ogiltig momssats. Tillåtna momssatser är 0, 6, 12 eller 25 procent.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.vat_status
    INTO v_vat_status
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF coalesce(v_vat_status, 'unknown') = 'not_registered'
     AND v_vat_rate <> 0 THEN
    RAISE EXCEPTION
      'Företaget är markerat som inte momsregistrerat. Momssatsen måste vara 0 procent för periodiserade bokningar.'
      USING ERRCODE = '23514';
  END IF;

  v_file_url := nullif(p_payload->>'file_url', '');

  IF v_future_date <= v_year_end THEN
    RAISE EXCEPTION
      'Vändningsdatumet (%) måste ligga efter bokslutsdagen (%).',
      v_future_date, v_year_end
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_year_end)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_year_end)::int
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_future_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_future_date)::int
      USING ERRCODE = '23514';
  END IF;

  SELECT debit_account, credit_account
    INTO v_debit_account, v_credit_account
  FROM public.accounts
  WHERE id = v_type
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konto saknas eller tillhör inte användaren: %.', v_type
      USING ERRCODE = '23503';
  END IF;

  IF v_debit_account IS NULL OR btrim(v_debit_account) = ''
     OR v_credit_account IS NULL OR btrim(v_credit_account) = '' THEN
    RAISE EXCEPTION 'Kontotyp % saknar debet- eller kreditkonto.', v_type
      USING ERRCODE = '23514';
  END IF;

  IF left(v_debit_account, 1) NOT IN ('4', '5', '6', '7', '8') THEN
    RAISE EXCEPTION
      'Kontotyp % kan inte periodiseras som kostnad (debetkonto %).',
      v_type, v_debit_account
      USING ERRCODE = '23514';
  END IF;

  v_vat_amount :=
    CASE
      WHEN v_vat_rate > 0
        THEN round((v_amount - (v_amount / (1 + v_vat_rate / 100)))::numeric, 2)
      ELSE 0
    END;

  IF v_vat_amount > 0 THEN
    v_input_vat_deduction := public.resolve_purchase_input_vat_deduction(
      v_user_id,
      p_payload->>'input_vat_deduction_entitlement'
    );
  END IF;

  v_deductible_vat_amount :=
    CASE
      WHEN v_vat_amount > 0
           AND v_input_vat_deduction = 'full'
        THEN v_vat_amount
      ELSE 0
    END;
  v_periodized_amount := round((v_amount - v_deductible_vat_amount)::numeric, 2);

  v_needs_vat_lock :=
       public.vat_concurrency_account(v_credit_account)
    OR (
         v_deductible_vat_amount > 0
         AND public.vat_concurrency_account('2641')
       );

  IF v_needs_vat_lock THEN
    PERFORM public.lock_vat_months(
      v_user_id,
      ARRAY[v_year_end]::date[]
    );

    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_year_end BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar periodiseringens bokföringsdatum %. Bokningen stoppades för manuell kontroll.',
        v_year_end
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för periodiseringens bokföringsdatum % är redan stängd eller deklarerad. Bokningen kan inte genomföras.',
        v_year_end
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT public.get_next_ver_nr(v_user_id) INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för periodiseringen.';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    file_url,
    booked,
    is_periodized,
    is_periodized_reversal,
    periodized_future_date,
    periodization_group_id
  ) VALUES (
    v_user_id,
    v_year_end,
    '[Periodisering 1/2] ' || v_description,
    v_amount,
    v_type,
    v_vat_rate,
    v_file_url,
    true,
    true,
    false,
    v_future_date,
    v_periodization_group_id
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number,
    debit, credit, description, date, user_id
  )
  VALUES
    (
      v_tx_id, v_ver_nr, v_credit_account,
      0, v_amount,
      'Förutbetald kostnad (Bank): ' || v_description,
      v_year_end, v_user_id
    ),
    (
      v_tx_id, v_ver_nr, '1790',
      v_periodized_amount, 0,
      'Förutbetald kostnad: ' || v_description,
      v_year_end, v_user_id
    );

  IF v_deductible_vat_amount > 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES (
      v_tx_id, v_ver_nr, '2641',
      v_deductible_vat_amount, 0,
      'Ingående moms (Periodisering): ' || v_description,
      v_year_end, v_user_id
    );
  END IF;

  SELECT public.get_next_ver_nr(v_user_id) INTO v_reversal_ver_nr;

  IF v_reversal_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för vändningen.';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    file_url,
    booked,
    is_periodized,
    is_periodized_reversal,
    periodized_future_date,
    periodization_group_id
  ) VALUES (
    v_user_id,
    v_future_date,
    '[Periodisering 2/2] ' || v_description,
    v_periodized_amount,
    v_type,
    0,
    v_file_url,
    true,
    true,
    true,
    null,
    v_periodization_group_id
  )
  RETURNING id INTO v_reversal_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number,
    debit, credit, description, date, user_id
  )
  VALUES
    (
      v_reversal_tx_id, v_reversal_ver_nr, '1790',
      0, v_periodized_amount,
      'Förutbetald kostnad upplöst: ' || v_description,
      v_future_date, v_user_id
    ),
    (
      v_reversal_tx_id, v_reversal_ver_nr, v_debit_account,
      v_periodized_amount, 0,
      'Periodiserad kostnad aktiveras: ' || v_description,
      v_future_date, v_user_id
    );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'reversal_transaction_id', v_reversal_tx_id,
    'ver_nr', v_ver_nr,
    'reversal_ver_nr', v_reversal_ver_nr,
    'periodization_group_id', v_periodization_group_id
  );
END;
$function$;

DO $kan55_rename_vat_v2$
BEGIN
  IF to_regprocedure('public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb)') IS NOT NULL
     AND to_regprocedure('public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(jsonb)') IS NULL THEN
    ALTER FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb)
      RENAME TO book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55;
  END IF;
END;
$kan55_rename_vat_v2$;

DO $kan55_permissions$
BEGIN
  IF to_regprocedure('public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(jsonb) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(jsonb) FROM service_role;
    GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(jsonb) TO postgres;
  END IF;
END;
$kan55_permissions$;

CREATE OR REPLACE FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_idempotency_key uuid;
  v_deduction_entitlement text;
  v_existing_idempotency boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Ogiltig VAT V2-payload.'
      USING ERRCODE = '22023';
  END IF;

  IF nullif(p_payload->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltig idempotency-nyckel.'
      USING ERRCODE = '22023';
  END;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'sololedger:vat_v2_booking_idem:'
      || v_user_id::text
      || ':'
      || v_idempotency_key::text,
      0
    )
  );

  SELECT EXISTS (
    SELECT 1
    FROM public.vat_v2_booking_idempotency i
    WHERE i.user_id = v_user_id
      AND i.idempotency_key = v_idempotency_key
  ) INTO v_existing_idempotency;

  IF NOT v_existing_idempotency THEN
    v_deduction_entitlement := coalesce(p_payload->>'deduction_entitlement', '');

    IF v_deduction_entitlement = 'full' THEN
      PERFORM public.assert_full_input_vat_deduction_allowed(
        v_user_id,
        'full',
        'utlandsinköp'
      );
    END IF;
  END IF;

  RETURN public.book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55(
    p_payload
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO service_role;

COMMENT ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) IS
  'Books supported VAT V2 EU service reverse-charge transactions atomically. KAN-55 adds a server-side profile guard for new full-deduction bookings while preserving idempotent replay through the previous implementation.';

COMMIT;
