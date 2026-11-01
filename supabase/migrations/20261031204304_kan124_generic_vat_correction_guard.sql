-- KAN-124: native VAT correction boundary. No historical data changes.
BEGIN;
-- Owner-only read helper. Called after the RPC has acquired VAT/row locks.
CREATE OR REPLACE FUNCTION public.assert_generic_correction_vat_open(
  p_user_id uuid, p_transaction_ids uuid[], p_correction_dates date[]
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO public, pg_temp
AS $guard$
DECLARE
  v_item record;
  v_line record;
  v_tx public.transactions%ROWTYPE;
  v_origin public.vat_periods%ROWTYPE;
  v_target public.vat_periods%ROWTYPE;
  v_contributions jsonb;
  v_period_ids uuid[];
  v_count integer;
  v_period_id uuid;
  v_guidance constant text := ' Öppna momsrapporten för perioden och ta hjälp av en redovisningskunnig för att bedöma bokföringen och deklarationen. SoloLedger har ännu inget komplett flöde för den här rättelsen. Inget har bokförts.';
BEGIN
  IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Rättelsens användare kunde inte verifieras.' USING ERRCODE='42501';
  END IF;
  IF cardinality(p_transaction_ids) IS DISTINCT FROM cardinality(p_correction_dates) THEN
    RAISE EXCEPTION 'Rättelsepaketet kunde inte verifieras.' USING ERRCODE='23514';
  END IF;
  FOR v_item IN SELECT * FROM unnest(p_transaction_ids,p_correction_dates) AS i(tx_id,target_date)
  LOOP
    SELECT * INTO STRICT v_tx FROM public.transactions WHERE id=v_item.tx_id AND user_id=p_user_id;
    -- System sources remain protected by the existing source policy/trigger.
    IF v_tx.source <> 'manual' THEN CONTINUE; END IF;
    v_contributions := '[]'::jsonb;
    FOR v_line IN
      WITH amounts AS (
        SELECT e.account_number,e.date,
          sum(coalesce(e.debit,0)-coalesce(e.credit,0)) AS net
        FROM public.journal_entries e
        WHERE e.user_id=p_user_id AND e.transaction_id=v_tx.id
          AND (e.account_number LIKE '261%' OR e.account_number LIKE '262%'
            OR e.account_number LIKE '263%' OR e.account_number LIKE '264%')
        GROUP BY e.account_number,e.date
        HAVING sum(coalesce(e.debit,0)-coalesce(e.credit,0))<>0
      )
      SELECT a.account_number,a.date,a.net,count(vp.id) AS matches,
        (array_agg(vp.id ORDER BY vp.id))[1] AS period_id
      FROM amounts a LEFT JOIN public.vat_periods vp ON vp.user_id=p_user_id
        AND a.date BETWEEN vp.period_start AND vp.period_end
      GROUP BY a.account_number,a.date,a.net
      ORDER BY a.date,a.account_number
    LOOP
      IF v_line.date IS NULL OR v_line.matches<>1 THEN
        RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Den ursprungliga momsperioden saknas eller är inte entydig. Momsunderlaget behöver kontrolleras separat. Inget har bokförts.'
          USING ERRCODE='23514',DETAIL='KAN124_REVIEW';
      END IF;
      v_contributions := v_contributions || jsonb_build_array(jsonb_build_object(
        'account',v_line.account_number,'period',v_line.period_id,'net',v_line.net));
    END LOOP;
    -- Net by ACCOUNT and PERIOD, never net across different VAT return boxes.
    SELECT coalesce(array_agg(DISTINCT x.period_id),ARRAY[]::uuid[]) INTO v_period_ids
    FROM (
      SELECT (j->>'period')::uuid AS period_id,j->>'account' AS account_number
      FROM jsonb_array_elements(v_contributions) j
      GROUP BY j->>'period',j->>'account'
      HAVING sum((j->>'net')::numeric)<>0
    ) x;
    IF cardinality(v_period_ids)=0 THEN CONTINUE; END IF;
    IF cardinality(v_period_ids)<>1 OR v_item.target_date IS NULL OR EXISTS (
      SELECT 1 FROM public.journal_entries e WHERE e.user_id=p_user_id AND e.transaction_id=v_tx.id
        AND (e.account_number LIKE '265%' OR e.account_number IN ('2614','2624','2634','2645')
          OR coalesce(e.debit,0)<0 OR coalesce(e.credit,0)<0
          OR e.debit::text IN ('NaN','Infinity','-Infinity')
          OR e.credit::text IN ('NaN','Infinity','-Infinity'))
    ) THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Momsunderlaget är inte entydigt och behöver kontrolleras separat. Inget har bokförts.'
        USING ERRCODE='23514',DETAIL='KAN124_REVIEW';
    END IF;
    IF coalesce(v_tx.is_correction,false) THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Bokningen är redan en momsrättelse. Kopplingen till den ursprungliga momsperioden behöver kontrolleras separat. Inget har bokförts.'
        USING ERRCODE='23514',DETAIL='KAN124_CORRECTION_CHAIN';
    END IF;
    SELECT * INTO STRICT v_origin FROM public.vat_periods WHERE id=v_period_ids[1] AND user_id=p_user_id;
    SELECT count(*),(array_agg(vp.id ORDER BY vp.id))[1] INTO v_count,v_period_id
      FROM public.vat_periods vp WHERE vp.user_id=p_user_id AND v_tx.date BETWEEN vp.period_start AND vp.period_end;
    IF v_count<>1 OR v_period_id IS DISTINCT FROM v_origin.id OR v_origin.source<>'sololedger' THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Transaktionsdatum och journalens momsperiod kan inte verifieras tillsammans. Momsunderlaget behöver kontrolleras separat. Inget har bokförts.'
        USING ERRCODE='23514',DETAIL='KAN124_REVIEW';
    END IF;
    IF v_origin.status='declared' THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera eftersom den ursprungliga bokningen påverkar momsperioden %–%, som är markerad som deklarerad. En tidigare momsdeklaration kan behöva rättas.%',v_origin.period_start,v_origin.period_end,v_guidance
        USING ERRCODE='23514',DETAIL='KAN124_ORIGIN_DECLARED';
    ELSIF v_origin.status='closed' THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera eftersom den ursprungliga momsperioden %–% redan är stängd genom ett momsavslut. Momsavslutet behöver bedömas innan bokningen rättas. Om deklarationen har lämnats till Skatteverket kan den också behöva rättas.%',v_origin.period_start,v_origin.period_end,v_guidance
        USING ERRCODE='23514',DETAIL='KAN124_ORIGIN_CLOSED';
    ELSIF v_origin.status<>'open' THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Momsperiodens status behöver kontrolleras separat. Inget har bokförts.'
        USING ERRCODE='23514',DETAIL='KAN124_REVIEW';
    END IF;
    SELECT count(*),(array_agg(vp.id ORDER BY vp.id))[1] INTO v_count,v_period_id
      FROM public.vat_periods vp WHERE vp.user_id=p_user_id AND v_item.target_date BETWEEN vp.period_start AND vp.period_end;
    IF v_count<>1 THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Momsperioden för rättelsedatumet saknas eller är inte entydig. Kontrollera momsperioderna först. Inget har bokförts.'
        USING ERRCODE='23514',DETAIL='KAN124_TARGET_REVIEW';
    END IF;
    SELECT * INTO STRICT v_target FROM public.vat_periods WHERE id=v_period_id AND user_id=p_user_id;
    IF v_target.source<>'sololedger' THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Momsperioden för rättelsedatumet är importerad historik och behöver kontrolleras separat. Inget har bokförts.'
        USING ERRCODE='23514',DETAIL='KAN124_TARGET_REVIEW';
    ELSIF v_target.status<>'open' THEN
      RAISE EXCEPTION 'Rättelsen kan inte göras med Korrigera. Momsperioden för rättelsedatumet %–% är redan stängd eller deklarerad. Kontrollera momsrapporten och momsavslutet. Inget har bokförts.',v_target.period_start,v_target.period_end
        USING ERRCODE='23514',DETAIL='KAN124_TARGET_CLOSED';
    END IF;
  END LOOP;
END;
$guard$;
REVOKE ALL ON FUNCTION public.assert_generic_correction_vat_open(uuid,uuid[],date[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_correction_transaction_atomic(p_original_tx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  v_original public.transactions%ROWTYPE;
  v_reversal public.transactions%ROWTYPE;

  v_original_ver_nr integer;
  v_reversal_ver_nr integer;

  v_correction_date date;
  v_next_ver_nr integer;
  v_next_reversal_ver_nr integer;

  v_corr_tx_id uuid;
  v_corr_reversal_tx_id uuid;

  v_entry_count integer;
  v_distinct_ver_count integer;
  v_reversal_found boolean := false;

  -- 3B.5a: read-only pre-scan + VAT concurrency state
  v_pre_original public.transactions%ROWTYPE;
  v_pre_reversal public.transactions%ROWTYPE;
  v_pre_reversal_found boolean := false;
  v_pre_original_vat_relevant boolean := false;
  v_pre_reversal_vat_relevant boolean := false;
  v_original_vat_relevant boolean := false;
  v_reversal_vat_relevant boolean := false;
  v_guard_date date;
  v_locked_vat_dates date[] := ARRAY[]::date[];
  v_actual_vat_dates date[] := ARRAY[]::date[];
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
  v_sie_dates date[] := ARRAY[]::date[];
  v_pre_sie_ids uuid[] := ARRAY[]::uuid[];
  v_sie_ids uuid[] := ARRAY[]::uuid[];
  v_sie_row record;
  v_sie_period_ok boolean;
  -- KAN-124: native correction package, separate from the SIE lock contract.
  v_pre_a2_ids uuid[] := ARRAY[]::uuid[];
  v_pre_a2_targets date[] := ARRAY[]::date[];
  v_a2_ids uuid[] := ARRAY[]::uuid[];
  v_a2_targets date[] := ARRAY[]::date[];
  v_a2_actual_dates date[] := ARRAY[]::date[];
  v_pre_a2_fingerprint text;
  v_a2_fingerprint text;
BEGIN
  PERFORM public.lock_accounting_year_boundary(auth.uid(), false); -- KAN-75: first lock domain
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_original_tx_id IS NULL THEN
    RAISE EXCEPTION 'Originaltransaktion saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ── READ-ONLY PRE-SCAN ───────────────────────────────────────
  -- We must know every VAT-relevant correction month before taking any
  -- transaction row lock. Global order:
  -- VAT advisory locks -> other advisory locks -> row locks -> writes.
  SELECT *
    INTO v_pre_original
  FROM public.transactions
  WHERE id = p_original_tx_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunde inte hämta originaltransaktionen.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Fast fail before VAT advisory locks. The post-lock guard below remains
  -- authoritative for concurrency, but this keeps impossible system
  -- verification corrections out of the lock path.
  IF v_pre_original.source = 'vat_closing' THEN
    RAISE EXCEPTION 'Momsavslut är systemverifikationer och kan inte korrigeras.'
      USING ERRCODE = '23514';
  END IF;

  v_correction_date := greatest(current_date, v_pre_original.date);

  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_pre_original_vat_relevant;

  IF v_pre_original_vat_relevant THEN
    v_locked_vat_dates := array_append(v_locked_vat_dates, v_correction_date);
  END IF;

  -- KAN-71: SIE original JOURNAL dates also share the VAT close lock domain.
  -- All 26xx rows matter, including accounts not in the older helper.
  v_pre_sie_ids := public.sie_correction_lineage(v_user_id, p_original_tx_id);
  IF cardinality(v_pre_sie_ids) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT e.date), ARRAY[]::date[]) INTO v_sie_dates
    FROM public.journal_entries e
    WHERE e.transaction_id = ANY(v_pre_sie_ids) AND e.user_id = v_user_id
      AND e.account_number LIKE '26%';
    IF cardinality(v_sie_dates) > 0 THEN
      v_locked_vat_dates := v_locked_vat_dates || v_sie_dates || ARRAY[v_correction_date];
    END IF;
  END IF;

  IF v_pre_original.periodization_group_id IS NOT NULL
     AND coalesce(v_pre_original.is_periodized_reversal, false) = false THEN

    SELECT *
      INTO v_pre_reversal
    FROM public.transactions
    WHERE periodization_group_id = v_pre_original.periodization_group_id
      AND is_periodized_reversal = true
      AND user_id = v_user_id
    LIMIT 1;

    v_pre_reversal_found := FOUND;

    IF v_pre_reversal_found THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_pre_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_pre_reversal_vat_relevant;

      IF v_pre_reversal_vat_relevant THEN
        v_locked_vat_dates := array_append(v_locked_vat_dates, v_pre_reversal.date);
      END IF;
    END IF;
  END IF;

  -- KAN-124: lock native original months as well as target months.
  IF cardinality(v_pre_sie_ids)=0 THEN
    v_pre_a2_ids:=ARRAY[v_pre_original.id];
    v_pre_a2_targets:=ARRAY[v_correction_date];
    IF v_pre_reversal_found THEN
      v_pre_a2_ids:=array_append(v_pre_a2_ids,v_pre_reversal.id);
      v_pre_a2_targets:=array_append(v_pre_a2_targets,v_pre_reversal.date);
    END IF;
    SELECT md5(coalesce(jsonb_agg(jsonb_build_array(t.id,t.date,t.source,t.amount,t.type,t.vat_rate,t.is_correction,t.corrects_ver_nr,t.periodization_group_id,t.is_periodized_reversal,e.id,e.date,e.account_number,e.debit,e.credit,e.ver_nr) ORDER BY t.id,e.id)::text,''))
    INTO v_pre_a2_fingerprint
    FROM public.transactions t LEFT JOIN public.journal_entries e ON e.transaction_id=t.id AND e.user_id=t.user_id
    WHERE t.user_id=v_user_id AND t.id=ANY(v_pre_a2_ids);
    SELECT coalesce(array_agg(DISTINCT d),ARRAY[]::date[])
    INTO v_a2_actual_dates
    FROM unnest(v_pre_a2_ids,v_pre_a2_targets) AS package(tx_id,target_date)
    JOIN public.transactions t ON t.id=package.tx_id AND t.user_id=v_user_id
    JOIN public.journal_entries e ON e.transaction_id=t.id AND e.user_id=v_user_id
    CROSS JOIN LATERAL unnest(ARRAY[e.date,t.date,package.target_date]) AS ds(d)
    WHERE (e.account_number LIKE '261%' OR e.account_number LIKE '262%' OR e.account_number LIKE '263%' OR e.account_number LIKE '264%')
      AND coalesce(e.debit,0)-coalesce(e.credit,0)<>0;
    v_locked_vat_dates:=v_locked_vat_dates||v_a2_actual_dates;
  END IF;

  -- Acquire all VAT month locks in one call. lock_vat_months() deduplicates
  -- calendar months and acquires them in chronological order.
  IF coalesce(array_length(v_locked_vat_dates, 1), 0) > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, v_locked_vat_dates);
  END IF;

  -- ── AUTHORITATIVE ROW LOCKS + REVALIDATION ───────────────────
  -- Only after VAT advisory locks are held may we take transaction row locks.
  SELECT *
    INTO v_original
  FROM public.transactions
  WHERE id = p_original_tx_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunde inte hämta originaltransaktionen.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Authoritative guard after the row lock. This is the real integrity check
  -- if source was changed by a privileged concurrent path after the pre-scan.
  IF v_original.source = 'vat_closing' THEN
    RAISE EXCEPTION 'Momsavslut är systemverifikationer och kan inte korrigeras.'
      USING ERRCODE = '23514';
  END IF;

  -- Fields that determine correction date / linked reversal must still match
  -- the pre-scan. If not, fail closed rather than acquiring a new VAT lock
  -- after a row lock.
  IF v_original.source IS DISTINCT FROM v_pre_original.source
     OR v_original.date IS DISTINCT FROM v_pre_original.date
     OR v_original.periodization_group_id IS DISTINCT FROM v_pre_original.periodization_group_id
     OR coalesce(v_original.is_periodized_reversal, false)
        IS DISTINCT FROM coalesce(v_pre_original.is_periodized_reversal, false) THEN
    RAISE EXCEPTION
      'Originaltransaktionen ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  v_correction_date := greatest(current_date, v_original.date);

  -- Server-side year lock for the actual correction date.
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_correction_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_correction_date)::int
      USING ERRCODE = '23514';
  END IF;

  -- Original journal must still be complete and unambiguous.
  SELECT
    count(*),
    count(DISTINCT ver_nr),
    min(ver_nr)
  INTO
    v_entry_count,
    v_distinct_ver_count,
    v_original_ver_nr
  FROM public.journal_entries
  WHERE transaction_id = p_original_tx_id
    AND user_id = v_user_id;

  IF v_entry_count = 0 OR v_original_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte hämta originalbokföringen.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_distinct_ver_count <> 1 THEN
    RAISE EXCEPTION
      'Originaltransaktionen har inkonsekventa verifikationsnummer och kan inte korrigeras.'
      USING ERRCODE = '23514';
  END IF;

  -- Friendly post-lock duplicate guard. The unique partial index
  -- transactions_one_correction_per_original remains the final DB invariant.
  -- This check runs only after the original transaction row is locked, so two
  -- concurrent corrections of the same original serialize before this read.
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.user_id = v_user_id
      AND coalesce(t.is_correction, false) = true
      AND t.corrects_ver_nr = v_original_ver_nr
  ) THEN
    RAISE EXCEPTION
      'VER-% har redan korrigerats och kan inte korrigeras igen.',
      v_original_ver_nr
      USING ERRCODE = '23514';
  END IF;

  -- Recompute VAT relevance after the authoritative row lock.
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_original_vat_relevant;

  IF v_original_vat_relevant THEN
    v_actual_vat_dates := array_append(v_actual_vat_dates, v_correction_date);
  END IF;

  -- If original is the first half of a periodization, lock and correct the
  -- linked reversal in the same DB transaction, preserving existing behavior.
  IF v_original.periodization_group_id IS NOT NULL
     AND coalesce(v_original.is_periodized_reversal, false) = false THEN

    SELECT *
      INTO v_reversal
    FROM public.transactions
    WHERE periodization_group_id = v_original.periodization_group_id
      AND is_periodized_reversal = true
      AND user_id = v_user_id
    LIMIT 1
    FOR UPDATE;

    v_reversal_found := FOUND;

    IF v_reversal_found IS DISTINCT FROM v_pre_reversal_found
       OR (
         v_reversal_found
         AND (
           v_reversal.id IS DISTINCT FROM v_pre_reversal.id
           OR v_reversal.date IS DISTINCT FROM v_pre_reversal.date
         )
       ) THEN
      RAISE EXCEPTION
        'Periodiseringens vändningsverifikation ändrades under korrigeringen. Försök igen.'
        USING ERRCODE = '40001';
    END IF;

    IF v_reversal_found THEN
      IF EXISTS (
        SELECT 1
        FROM public.closed_years
        WHERE user_id = v_user_id
          AND year = extract(year from v_reversal.date)::int
      ) THEN
        RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
          extract(year from v_reversal.date)::int
          USING ERRCODE = '23514';
      END IF;

      SELECT
        count(*),
        count(DISTINCT ver_nr),
        min(ver_nr)
      INTO
        v_entry_count,
        v_distinct_ver_count,
        v_reversal_ver_nr
      FROM public.journal_entries
      WHERE transaction_id = v_reversal.id
        AND user_id = v_user_id;

      IF v_entry_count = 0 OR v_reversal_ver_nr IS NULL THEN
        RAISE EXCEPTION 'Kunde inte hämta vändningsverifikatets journalposter.'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_distinct_ver_count <> 1 THEN
        RAISE EXCEPTION
          'Vändningsverifikationen har inkonsekventa verifikationsnummer och kan inte korrigeras.'
          USING ERRCODE = '23514';
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_reversal_vat_relevant;

      IF v_reversal_vat_relevant THEN
        v_actual_vat_dates := array_append(v_actual_vat_dates, v_reversal.date);
      END IF;
    END IF;
  END IF;

  -- Revalidate SIE ancestry, including legacy corrections recorded as
  -- manual. Source/history is never rewritten.
  IF cardinality(v_pre_sie_ids) > 0 THEN
    PERFORM 1 FROM public.transactions t WHERE t.user_id = v_user_id
      AND t.id = ANY(v_pre_sie_ids) ORDER BY t.id FOR UPDATE;
    PERFORM 1 FROM public.journal_entries e WHERE e.user_id = v_user_id
      AND e.transaction_id = ANY(v_pre_sie_ids) ORDER BY e.transaction_id, e.id FOR UPDATE;
  END IF;
  v_sie_ids := public.sie_correction_lineage(v_user_id, p_original_tx_id);
  IF v_sie_ids IS DISTINCT FROM v_pre_sie_ids THEN
    RAISE EXCEPTION 'SIE-rättelsens originalkedja ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;
  IF cardinality(v_sie_ids) > 0 THEN
    SELECT coalesce(array_agg(DISTINCT e.date), ARRAY[]::date[]) INTO v_sie_dates
    FROM public.journal_entries e
    WHERE e.transaction_id = ANY(v_sie_ids) AND e.user_id = v_user_id
      AND e.account_number LIKE '26%';
    IF cardinality(v_sie_dates) > 0 THEN
      v_actual_vat_dates := v_actual_vat_dates || v_sie_dates || ARRAY[v_correction_date];
    END IF;
  END IF;

  -- KAN-124: stabilize the same package; never take new month locks here.
  IF cardinality(v_sie_ids)=0 THEN
    v_a2_ids:=ARRAY[v_original.id];
    v_a2_targets:=ARRAY[v_correction_date];
    IF v_reversal_found THEN
      v_a2_ids:=array_append(v_a2_ids,v_reversal.id);
      v_a2_targets:=array_append(v_a2_targets,v_reversal.date);
    END IF;
    PERFORM 1 FROM public.journal_entries e WHERE e.user_id=v_user_id
      AND e.transaction_id=ANY(v_a2_ids) ORDER BY e.transaction_id,e.id FOR UPDATE;
    SELECT md5(coalesce(jsonb_agg(jsonb_build_array(t.id,t.date,t.source,t.amount,t.type,t.vat_rate,t.is_correction,t.corrects_ver_nr,t.periodization_group_id,t.is_periodized_reversal,e.id,e.date,e.account_number,e.debit,e.credit,e.ver_nr) ORDER BY t.id,e.id)::text,''))
    INTO v_a2_fingerprint
    FROM public.transactions t LEFT JOIN public.journal_entries e ON e.transaction_id=t.id AND e.user_id=t.user_id
    WHERE t.user_id=v_user_id AND t.id=ANY(v_a2_ids);
    IF v_a2_ids IS DISTINCT FROM v_pre_a2_ids OR v_a2_targets IS DISTINCT FROM v_pre_a2_targets
      OR v_a2_fingerprint IS DISTINCT FROM v_pre_a2_fingerprint THEN
      RAISE EXCEPTION 'Rättelseunderlaget ändrades under korrigeringen. Försök igen.' USING ERRCODE='40001';
    END IF;
    SELECT coalesce(array_agg(DISTINCT d),ARRAY[]::date[])
    INTO v_a2_actual_dates
    FROM unnest(v_a2_ids,v_a2_targets) AS package(tx_id,target_date)
    JOIN public.transactions t ON t.id=package.tx_id AND t.user_id=v_user_id
    JOIN public.journal_entries e ON e.transaction_id=t.id AND e.user_id=v_user_id
    CROSS JOIN LATERAL unnest(ARRAY[e.date,t.date,package.target_date]) AS ds(d)
    WHERE (e.account_number LIKE '261%' OR e.account_number LIKE '262%' OR e.account_number LIKE '263%' OR e.account_number LIKE '264%')
      AND coalesce(e.debit,0)-coalesce(e.credit,0)<>0;
  END IF;

  -- The authoritative scan must not require any VAT month that was absent
  -- from the pre-scan. If it does, fail closed instead of violating lock order.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_actual_vat_dates||v_a2_actual_dates) AS x(d)
      WHERE d IS NOT NULL
      EXCEPT
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_locked_vat_dates) AS x(d)
      WHERE d IS NOT NULL
    ) missing
  ) THEN
    RAISE EXCEPTION
      'Momsrelevant bokföringsdata ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- KAN-71: the generic RPC may not bypass the atomic SIE undo boundary.
  -- Standard manual/periodized corrections keep their existing behavior.
  IF cardinality(v_sie_ids) > 0 THEN
    FOR v_sie_row IN
      SELECT e.date, e.account_number FROM public.journal_entries e
      WHERE e.transaction_id = ANY(v_sie_ids) AND e.user_id = v_user_id
        AND e.account_number LIKE '26%'
      ORDER BY e.date, e.id
    LOOP
      IF v_sie_row.date IS NULL
         OR extract(year FROM v_sie_row.date) <> extract(year FROM v_correction_date)
         OR v_original.periodization_group_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM public.closed_years cy WHERE cy.user_id = v_user_id
           AND cy.year = extract(year FROM v_sie_row.date)::integer) THEN
        RAISE EXCEPTION 'SIE-rättelsen kan inte göras automatiskt över årsskifte, låst år eller osäkert periodiseringsunderlag. Historiska momsperioder kräver separat hantering.'
          USING ERRCODE = '23514';
      END IF;

      PERFORM 1 FROM public.vat_periods vp WHERE vp.user_id = v_user_id
        AND (v_sie_row.date BETWEEN vp.period_start AND vp.period_end
          OR v_correction_date BETWEEN vp.period_start AND vp.period_end)
      ORDER BY vp.id FOR UPDATE;

      SELECT count(*)::integer,
        bool_and(vp.source = 'sololedger' AND vp.status = 'open'
          AND v_sie_row.date BETWEEN vp.period_start AND vp.period_end
          AND v_correction_date BETWEEN vp.period_start AND vp.period_end)
      INTO v_matching_vat_periods, v_sie_period_ok
      FROM public.vat_periods vp WHERE vp.user_id = v_user_id
        AND (v_sie_row.date BETWEEN vp.period_start AND vp.period_end
          OR v_correction_date BETWEEN vp.period_start AND vp.period_end);

      IF v_matching_vat_periods <> 1 OR v_sie_period_ok IS NOT TRUE THEN
        RAISE EXCEPTION 'En momsrelevant SIE-rättelse kräver samma verifierade öppna momsperiod för original och rättelse. Stängda, deklarerade och historiska momsperioder kräver separat hantering.'
          USING ERRCODE = '23514';
      END IF;

      IF v_sie_row.account_number IN ('2614', '2624', '2634', '2645') THEN
        RAISE EXCEPTION 'SIE-underlaget innehåller osäker omvänd moms och kan inte rättas automatiskt. Historiska momsperioder kräver separat hantering.'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  -- KAN-124: declaration confirmation uses period row locks, not month locks.
  -- Lock every candidate period before the owner-only helper reads its status.
  IF cardinality(v_sie_ids)=0 THEN
    PERFORM 1 FROM public.vat_periods vp WHERE vp.user_id=v_user_id AND EXISTS (
      SELECT 1 FROM unnest(v_a2_actual_dates) AS ds(d) WHERE d BETWEEN vp.period_start AND vp.period_end
    ) ORDER BY vp.id FOR UPDATE;
    PERFORM public.assert_generic_correction_vat_open(v_user_id,v_a2_ids,v_a2_targets);
  END IF;

  -- ── VAT PERIOD STATE GUARD ───────────────────────────────────
  -- Only dates whose correction will actually write a VAT concurrency
  -- account are checked. imported_history does not block this guard.
  FOR v_guard_date IN
    SELECT DISTINCT d
    FROM unnest(v_actual_vat_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY d
  LOOP
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
      AND v_guard_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar korrigeringsdatum %. Korrigeringen stoppades för manuell kontroll.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för korrigeringsdatum % är redan stängd eller deklarerad. Korrigeringen kan inte genomföras.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- ── KORRIGERING AV ORIGINALVERIFIKATION ─────────────────────
  SELECT public.get_next_ver_nr(v_user_id) INTO v_next_ver_nr;

  IF v_next_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer.';
  END IF;

  INSERT INTO public.transactions (
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    is_correction,
    corrects_ver_nr,
    user_id
  ) VALUES (
    v_correction_date,
    '↩ Korrigering av VER-' || v_original_ver_nr || ' (' || coalesce(v_original.description, '') || ')',
    v_original.amount,
    v_original.type,
    v_original.vat_rate,
    true,
    true,
    v_original_ver_nr,
    v_user_id
  )
  RETURNING id INTO v_corr_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_corr_tx_id,
    v_next_ver_nr,
    e.account_number,
    e.credit,
    e.debit,
    'Korrigering av VER-' || v_original_ver_nr || ': ' || coalesce(e.description, ''),
    v_correction_date,
    v_user_id
  FROM public.journal_entries e
  WHERE e.transaction_id = p_original_tx_id
    AND e.user_id = v_user_id;

  -- ── PERIODISERINGENS VÄNDNINGSVERIFIKATION ──────────────────
  IF v_reversal_found THEN
    SELECT public.get_next_ver_nr(v_user_id) INTO v_next_reversal_ver_nr;

    IF v_next_reversal_ver_nr IS NULL THEN
      RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för reversalkorrigering.';
    END IF;

    INSERT INTO public.transactions (
      date,
      description,
      amount,
      type,
      vat_rate,
      booked,
      is_correction,
      corrects_ver_nr,
      user_id
    ) VALUES (
      v_reversal.date,
      '↩ Korrigering av VER-' || v_reversal_ver_nr || ' (' || coalesce(v_reversal.description, '') || ')',
      v_reversal.amount,
      v_reversal.type,
      v_reversal.vat_rate,
      true,
      true,
      v_reversal_ver_nr,
      v_user_id
    )
    RETURNING id INTO v_corr_reversal_tx_id;

    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    )
    SELECT
      v_corr_reversal_tx_id,
      v_next_reversal_ver_nr,
      e.account_number,
      e.credit,
      e.debit,
      'Korrigering av VER-' || v_reversal_ver_nr || ': ' || coalesce(e.description, ''),
      v_reversal.date,
      v_user_id
    FROM public.journal_entries e
    WHERE e.transaction_id = v_reversal.id
      AND e.user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_corr_tx_id,
    'ver_nr', v_next_ver_nr,
    'corrects_ver_nr', v_original_ver_nr,
    'reversal_correction_transaction_id', v_corr_reversal_tx_id,
    'reversal_correction_ver_nr', v_next_reversal_ver_nr
  );
END;
$function$;
COMMIT;
