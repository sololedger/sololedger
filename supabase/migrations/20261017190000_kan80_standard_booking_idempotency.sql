-- KAN-80: exact request replay, before mutable booking validation.
-- New forward-only migration. No historical accounting data is changed.
CREATE TABLE public.standard_booking_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  booking_kind text NOT NULL CHECK (booking_kind IN ('ordinary','periodized')),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND coalesce(result->>'success', 'false') = 'true'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key)
);
ALTER TABLE public.standard_booking_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.standard_booking_idempotency FROM PUBLIC, anon, authenticated, service_role;
-- Edge deletion dry-run/residual verification only; writes remain inside owned RPCs.
GRANT SELECT ON TABLE public.standard_booking_idempotency TO service_role;
COMMENT ON TABLE public.standard_booking_idempotency IS 'KAN-80 private atomic booking receipts; delete explicitly through delete_user_data_atomic before accounting data.';

-- New clients must fail closed before dispatch against a pre-migration database.
CREATE FUNCTION public.get_standard_booking_protocol() RETURNS integer
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT 1 $$;
REVOKE ALL ON FUNCTION public.get_standard_booking_protocol() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_standard_booking_protocol() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.book_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_idempotency_key uuid;
  v_saved public.standard_booking_idempotency%ROWTYPE;
  v_request_payload jsonb;
  v_booking_result jsonb;
  v_user_id uuid := auth.uid();
  v_journal_count bigint;
  v_invalid_journal_count bigint;
  v_debit_sum numeric;
  v_credit_sum numeric;
  v_date date;
  v_description text;
  v_amount numeric;
  v_type text;
  v_vat_rate numeric;
  v_vat_status text;
  v_file_url text;

  v_debit_account text;
  v_credit_account text;
  v_hidden_from_new_booking boolean;
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

  -- Identity and request key are the only checks preceding exact replay.
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR coalesce(p_payload->>'idempotency_key', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Bokningsnyckel saknas eller är ogiltig. Ladda om SoloLedger innan du bokför.' USING ERRCODE = '22023';
  END IF;
  v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  v_request_payload := p_payload - 'idempotency_key';
  -- Same owner/key serializes across both RPCs. A failed call rolls back all writes.
  PERFORM pg_advisory_xact_lock(hashtextextended('standard_booking:' || v_user_id::text || ':' || v_idempotency_key::text, 0));
  SELECT * INTO v_saved FROM public.standard_booking_idempotency
  WHERE user_id = v_user_id AND idempotency_key = v_idempotency_key;
  IF FOUND THEN
    IF v_saved.booking_kind <> 'ordinary' OR v_saved.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'Bokningsnyckeln har redan använts med ett annat underlag. Återuppta det ursprungliga försöket.' USING ERRCODE = '22023';
    END IF;
    RETURN v_saved.result || jsonb_build_object('idempotent_replay', true);
  END IF;

  -- Only this protected block may report a confirmed rejection. The receipt
  -- lookup has already proved no earlier success for this owner/key.
  BEGIN
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
  IF v_amount <= 0 OR v_amount <> round(v_amount, 2)
     OR v_amount > 9999999999999.99 THEN
    RAISE EXCEPTION 'Ogiltigt belopp. Ange ett belopp större än 0 kr, i hela ören, inom tillåtet beloppsintervall.'
      USING ERRCODE = '22023';
  END IF;


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

  -- SHARE permits concurrent bookings but serializes visibility UPDATE/DELETE.
  -- The row lock is retained through journal creation and transaction end.
  SELECT debit_account, credit_account, hidden_from_new_booking
    INTO v_debit_account, v_credit_account, v_hidden_from_new_booking
  FROM public.accounts
  WHERE id = v_type
    AND user_id = v_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konto saknas eller tillhör inte användaren: %.', v_type
      USING ERRCODE = '23503';
  END IF;

  IF v_hidden_from_new_booking IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Kategorin är dold för ny bokföring. Visa den igen i Kontoplan eller välj en annan kategori.'
      USING ERRCODE = '23514';
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

  -- Inspect the whole user/verification plus all rows linked to the new transaction.
  -- OR avoids double-counting; DISTINCT FROM rejects NULL and mismatched identities.
  SELECT count(*), count(*) FILTER (
    WHERE transaction_id IS DISTINCT FROM v_tx_id
       OR user_id IS DISTINCT FROM v_user_id OR ver_nr IS DISTINCT FROM v_ver_nr
       OR debit IS NULL OR credit IS NULL OR debit < 0 OR credit < 0
       OR debit = 'NaN'::numeric OR credit = 'NaN'::numeric
       OR (debit > 0 AND credit > 0)
  ), sum(debit), sum(credit)
  INTO v_journal_count, v_invalid_journal_count, v_debit_sum, v_credit_sum
  FROM public.journal_entries
  WHERE transaction_id = v_tx_id
     OR (user_id = v_user_id AND ver_nr = v_ver_nr);

  IF v_journal_count <> (2 + CASE WHEN (v_is_income AND v_vat_amount > 0) OR v_deductible_vat_amount > 0 THEN 1 ELSE 0 END) OR v_invalid_journal_count <> 0
     OR v_debit_sum IS NULL OR v_credit_sum IS NULL
     OR v_debit_sum <= 0 OR v_debit_sum <> v_credit_sum THEN
    RAISE EXCEPTION 'Journalen för VER-% är ofullständig, ogiltig eller obalanserad. Hela bokningen avbröts.', v_ver_nr
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.capture_ne_manual_sale(v_tx_id, p_payload->>'ne_sales_basis', coalesce(p_payload->>'ne_sales_basis_confirmed','false')='true');

  v_booking_result := jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr
  );
  INSERT INTO public.standard_booking_idempotency(user_id, idempotency_key, booking_kind, request_payload, result)
  VALUES (v_user_id, v_idempotency_key, 'ordinary', v_request_payload, v_booking_result);
  RETURN v_booking_result || jsonb_build_object('idempotent_replay', false);
  EXCEPTION WHEN unique_violation OR serialization_failure OR deadlock_detected THEN
    -- A stale transaction snapshot must not report rejection of an earlier success.
    RAISE;
  WHEN OTHERS THEN
    -- PL/pgSQL rolls back this entire subtransaction, including VER allocation.
    RETURN jsonb_build_object('success', false, 'confirmed_rejection', true,
      'error_code', SQLSTATE, 'message', SQLERRM);
  END;
END;
$function$
;

REVOKE ALL ON FUNCTION public.book_transaction_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_transaction_atomic(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.book_periodized_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_idempotency_key uuid;
  v_saved public.standard_booking_idempotency%ROWTYPE;
  v_request_payload jsonb;
  v_booking_result jsonb;
  v_user_id uuid := auth.uid();
  v_journal_count bigint;
  v_invalid_journal_count bigint;
  v_debit_sum numeric;
  v_credit_sum numeric;

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
  v_hidden_from_new_booking boolean;

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

  -- Identity and request key are the only checks preceding exact replay.
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR coalesce(p_payload->>'idempotency_key', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Bokningsnyckel saknas eller är ogiltig. Ladda om SoloLedger innan du bokför.' USING ERRCODE = '22023';
  END IF;
  v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  v_request_payload := p_payload - 'idempotency_key';
  -- Same owner/key serializes across both RPCs. A failed call rolls back all writes.
  PERFORM pg_advisory_xact_lock(hashtextextended('standard_booking:' || v_user_id::text || ':' || v_idempotency_key::text, 0));
  SELECT * INTO v_saved FROM public.standard_booking_idempotency
  WHERE user_id = v_user_id AND idempotency_key = v_idempotency_key;
  IF FOUND THEN
    IF v_saved.booking_kind <> 'periodized' OR v_saved.request_payload IS DISTINCT FROM v_request_payload THEN
      RAISE EXCEPTION 'Bokningsnyckeln har redan använts med ett annat underlag. Återuppta det ursprungliga försöket.' USING ERRCODE = '22023';
    END IF;
    RETURN v_saved.result || jsonb_build_object('idempotent_replay', true);
  END IF;

  -- Only this protected block may report a confirmed rejection. The receipt
  -- lookup has already proved no earlier success for this owner/key.
  BEGIN
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
  IF v_amount <= 0 OR v_amount <> round(v_amount, 2)
     OR v_amount > 9999999999999.99 THEN
    RAISE EXCEPTION 'Ogiltigt belopp. Ange ett belopp större än 0 kr, i hela ören, inom tillåtet beloppsintervall.'
      USING ERRCODE = '22023';
  END IF;


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

  -- SHARE permits concurrent bookings but serializes visibility UPDATE/DELETE.
  -- The row lock is retained through journal creation and transaction end.
  SELECT debit_account, credit_account, hidden_from_new_booking
    INTO v_debit_account, v_credit_account, v_hidden_from_new_booking
  FROM public.accounts
  WHERE id = v_type
    AND user_id = v_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konto saknas eller tillhör inte användaren: %.', v_type
      USING ERRCODE = '23503';
  END IF;

  IF v_hidden_from_new_booking IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Kategorin är dold för ny bokföring. Visa den igen i Kontoplan eller välj en annan kategori.'
      USING ERRCODE = '23514';
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

  -- Inspect the whole user/verification plus all rows linked to the new transaction.
  -- OR avoids double-counting; DISTINCT FROM rejects NULL and mismatched identities.
  SELECT count(*), count(*) FILTER (
    WHERE transaction_id IS DISTINCT FROM v_tx_id
       OR user_id IS DISTINCT FROM v_user_id OR ver_nr IS DISTINCT FROM v_ver_nr
       OR debit IS NULL OR credit IS NULL OR debit < 0 OR credit < 0
       OR debit = 'NaN'::numeric OR credit = 'NaN'::numeric
       OR (debit > 0 AND credit > 0)
  ), sum(debit), sum(credit)
  INTO v_journal_count, v_invalid_journal_count, v_debit_sum, v_credit_sum
  FROM public.journal_entries
  WHERE transaction_id = v_tx_id
     OR (user_id = v_user_id AND ver_nr = v_ver_nr);

  IF v_journal_count <> (2 + CASE WHEN v_deductible_vat_amount > 0 THEN 1 ELSE 0 END) OR v_invalid_journal_count <> 0
     OR v_debit_sum IS NULL OR v_credit_sum IS NULL
     OR v_debit_sum <= 0 OR v_debit_sum <> v_credit_sum THEN
    RAISE EXCEPTION 'Journalen för VER-% är ofullständig, ogiltig eller obalanserad. Hela bokningen avbröts.', v_ver_nr
      USING ERRCODE = '23514';
  END IF;

  -- Inspect the whole user/verification plus all rows linked to the new transaction.
  -- OR avoids double-counting; DISTINCT FROM rejects NULL and mismatched identities.
  SELECT count(*), count(*) FILTER (
    WHERE transaction_id IS DISTINCT FROM v_reversal_tx_id
       OR user_id IS DISTINCT FROM v_user_id OR ver_nr IS DISTINCT FROM v_reversal_ver_nr
       OR debit IS NULL OR credit IS NULL OR debit < 0 OR credit < 0
       OR debit = 'NaN'::numeric OR credit = 'NaN'::numeric
       OR (debit > 0 AND credit > 0)
  ), sum(debit), sum(credit)
  INTO v_journal_count, v_invalid_journal_count, v_debit_sum, v_credit_sum
  FROM public.journal_entries
  WHERE transaction_id = v_reversal_tx_id
     OR (user_id = v_user_id AND ver_nr = v_reversal_ver_nr);

  IF v_journal_count <> 2 OR v_invalid_journal_count <> 0
     OR v_debit_sum IS NULL OR v_credit_sum IS NULL
     OR v_debit_sum <= 0 OR v_debit_sum <> v_credit_sum THEN
    RAISE EXCEPTION 'Journalen för VER-% är ofullständig, ogiltig eller obalanserad. Hela bokningen avbröts.', v_reversal_ver_nr
      USING ERRCODE = '23514';
  END IF;

  v_booking_result := jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'reversal_transaction_id', v_reversal_tx_id,
    'ver_nr', v_ver_nr,
    'reversal_ver_nr', v_reversal_ver_nr,
    'periodization_group_id', v_periodization_group_id
  );
  INSERT INTO public.standard_booking_idempotency(user_id, idempotency_key, booking_kind, request_payload, result)
  VALUES (v_user_id, v_idempotency_key, 'periodized', v_request_payload, v_booking_result);
  RETURN v_booking_result || jsonb_build_object('idempotent_replay', false);
  EXCEPTION WHEN unique_violation OR serialization_failure OR deadlock_detected THEN
    -- A stale transaction snapshot must not report rejection of an earlier success.
    RAISE;
  WHEN OTHERS THEN
    -- PL/pgSQL rolls back this entire subtransaction, including VER allocation.
    RETURN jsonb_build_object('success', false, 'confirmed_rejection', true,
      'error_code', SQLSTATE, 'message', SQLERRM);
  END;
END;
$function$
;

REVOKE ALL ON FUNCTION public.book_periodized_transaction_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_periodized_transaction_atomic(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_standard_booking_idempotency integer := 0;
  v_ne_sales_classifications integer := 0;
  v_fixed_asset_depreciation_runs integer := 0;
  v_fixed_asset_events integer := 0;
  v_fixed_asset_acquisition_idempotency integer := 0;
  v_fixed_assets integer := 0;
  v_fixed_asset_acquisition_groups integer := 0;
  v_customer_invoice_bookings integer := 0;
  v_customer_invoices integer := 0;
  v_tax_account_movements integer := 0;
  v_tax_account_events integer := 0;
  v_vat_v2_booking_idempotency integer := 0;
  v_vat_audit_snapshots integer := 0;
  v_vat_periods integer := 0;
  v_company_payment_account_roles integer := 0;
  v_journal_entries integer := 0;
  v_transactions integer := 0;
  v_favorites integer := 0;
  v_import_batches integer := 0;
  v_accounts integer := 0;
  v_closed_years integer := 0;
  v_ver_nr_sequences integer := 0;
  v_profiles integer := 0;
  v_sie_import_inputs integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id krävs.' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Användaren hittades inte.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin-konton kan inte raderas här.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.delete_user_data_atomic_lifecycle_context (
    backend_pid,
    user_id
  ) VALUES (
    pg_backend_pid(),
    p_user_id
  )
  ON CONFLICT (backend_pid, user_id)
  DO UPDATE SET created_at = excluded.created_at;

  DELETE FROM public.sie_import_inputs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_sie_import_inputs = ROW_COUNT;

  DELETE FROM public.ne_sales_classifications WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_ne_sales_classifications = ROW_COUNT;

  DELETE FROM public.fixed_asset_depreciation_runs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_depreciation_runs = ROW_COUNT;

  DELETE FROM public.fixed_asset_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_events = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_idempotency = ROW_COUNT;

  DELETE FROM public.fixed_assets WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_assets = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_groups WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_groups = ROW_COUNT;

  DELETE FROM public.tax_account_movements WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_movements = ROW_COUNT;

  DELETE FROM public.tax_account_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_events = ROW_COUNT;

  DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoice_bookings = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;

  DELETE FROM public.customer_invoices WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoices = ROW_COUNT;

  DELETE FROM public.vat_v2_booking_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_v2_booking_idempotency = ROW_COUNT;

  DELETE FROM public.vat_audit_snapshots WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_audit_snapshots = ROW_COUNT;

  DELETE FROM public.vat_periods WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_periods = ROW_COUNT;

  DELETE FROM public.company_payment_account_roles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_company_payment_account_roles = ROW_COUNT;

  DELETE FROM public.standard_booking_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_standard_booking_idempotency = ROW_COUNT;

  DELETE FROM public.journal_entries WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_journal_entries = ROW_COUNT;

  DELETE FROM public.transactions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_transactions = ROW_COUNT;

  DELETE FROM public.favorites WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_favorites = ROW_COUNT;

  DELETE FROM public.import_batches WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_import_batches = ROW_COUNT;

  DELETE FROM public.accounts WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_accounts = ROW_COUNT;

  DELETE FROM public.closed_years WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_closed_years = ROW_COUNT;

  DELETE FROM public.ver_nr_sequences WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_ver_nr_sequences = ROW_COUNT;

  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  IF v_profiles <> 1 THEN
    RAISE EXCEPTION 'Profilraderingen gav oväntat resultat.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted', jsonb_build_object(
      'ne_sales_classifications', v_ne_sales_classifications,
      'fixed_asset_depreciation_runs', v_fixed_asset_depreciation_runs,
      'fixed_asset_events', v_fixed_asset_events,
      'fixed_asset_acquisition_idempotency', v_fixed_asset_acquisition_idempotency,
      'fixed_assets', v_fixed_assets,
      'fixed_asset_acquisition_groups', v_fixed_asset_acquisition_groups,
      'customer_invoice_bookings', v_customer_invoice_bookings,
      'customer_invoices', v_customer_invoices,
      'tax_account_movements', v_tax_account_movements,
      'tax_account_events', v_tax_account_events,
      'vat_v2_booking_idempotency', v_vat_v2_booking_idempotency,
      'vat_audit_snapshots', v_vat_audit_snapshots,
      'vat_periods', v_vat_periods,
      'company_payment_account_roles', v_company_payment_account_roles,
      'standard_booking_idempotency', v_standard_booking_idempotency,
      'journal_entries', v_journal_entries,
      'transactions', v_transactions,
      'favorites', v_favorites,
      'import_batches', v_import_batches,
      'accounts', v_accounts,
      'closed_years', v_closed_years,
      'ver_nr_sequences', v_ver_nr_sequences,
      'sie_import_inputs', v_sie_import_inputs,
      'profiles', v_profiles
    )
  );
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;
  RAISE;
END;
$function$
;
