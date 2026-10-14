-- KAN-72: positive whole-cent standard input and stored journal integrity.
-- Existing live definitions verified against Production on 2026-10-14.
-- Only ordinary and periodized booking RPCs change; existing ACLs are preserved.

CREATE OR REPLACE FUNCTION public.book_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
