-- KAN-17C
-- Centralize the remaining VAT close account-role predicates.
--
-- This migration changes only public.close_vat_period_atomic(uuid):
--   * P3 close manual-review relevance delegates to
--     public.vat_account_requires_close_manual_review(text).
--   * Both P2 close balance participant predicates delegate to
--     public.vat_account_is_close_balance_participant(text).
--
-- The literal settlement account 2650 remains unchanged and is not a P3
-- predicate.

CREATE OR REPLACE FUNCTION public.close_vat_period_atomic(p_vat_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  -- Read-only lock-domain discovery before any advisory lock.
  v_pre_user_id uuid;
  v_pre_period_start date;
  v_pre_period_end date;
  v_lock_dates date[] := ARRAY[]::date[];

  -- Authoritative row state after VAT advisory locks.
  v_period public.vat_periods%ROWTYPE;

  -- Protected activity/balance state.
  v_has_265_activity boolean := false;
  v_closing_scope_row_count integer := 0;
  v_nonzero_balance_count integer := 0;
  v_closing_amount numeric := 0;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;

  -- Closing write state.
  v_ver_nr integer;
  v_tx_id uuid;
  v_inserted_vat_rows integer := 0;
  v_inserted_total_rows integer := 0;
  v_written_debit numeric := 0;
  v_written_credit numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_vat_period_id IS NULL THEN
    RAISE EXCEPTION 'Momsperiod saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ------------------------------------------------------------
  -- Read-only lock-domain discovery.
  --
  -- We must know the calendar months to lock before taking any
  -- vat_periods row lock. The row is revalidated after locks.
  -- ------------------------------------------------------------
  SELECT
    vp.user_id,
    vp.period_start,
    vp.period_end
  INTO
    v_pre_user_id,
    v_pre_period_start,
    v_pre_period_end
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(month_start::date ORDER BY month_start), ARRAY[]::date[])
    INTO v_lock_dates
  FROM generate_series(
    date_trunc('month', v_pre_period_start)::date,
    date_trunc('month', v_pre_period_end)::date,
    interval '1 month'
  ) AS month_start;

  -- Global lock order:
  -- 1. All VAT month advisory locks, chronologically inside lock_vat_months().
  -- 2. Any other advisory locks.
  -- 3. Row locks.
  -- 4. Protected reads/writes and get_next_ver_nr().
  PERFORM public.lock_vat_months(v_user_id, v_lock_dates);

  -- ------------------------------------------------------------
  -- Authoritative row lock + lock-domain revalidation.
  -- ------------------------------------------------------------
  SELECT *
    INTO v_period
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden ändrades under stängningen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  IF v_period.user_id IS DISTINCT FROM v_pre_user_id
     OR v_period.period_start IS DISTINCT FROM v_pre_period_start
     OR v_period.period_end IS DISTINCT FROM v_pre_period_end THEN
    RAISE EXCEPTION 'Momsperiodens datum ändrades under stängningen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ------------------------------------------------------------
  -- State and scope guards.
  -- ------------------------------------------------------------
  IF v_period.source = 'imported_history' THEN
    RAISE EXCEPTION 'Importerad historik kan inte stängas som en normal SoloLedger-momsperiod.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.source <> 'sololedger' THEN
    RAISE EXCEPTION 'Endast SoloLedger-hanterade momsperioder kan stängas.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'declared' THEN
    RAISE EXCEPTION 'Momsperioden är redan deklarerad och kan inte stängas igen.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'closed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_closed', true,
      'vat_period_id', v_period.id,
      'status', v_period.status,
      'closing_amount', v_period.closing_amount,
      'closing_transaction_id', v_period.closing_transaction_id
    );
  END IF;

  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'Momsperioden har en okänd status: %.', v_period.status
      USING ERRCODE = '23514';
  END IF;

  IF v_period.period_end > current_date THEN
    RAISE EXCEPTION 'Framtida momsperioder kan inte stängas.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from v_period.period_end)::integer
  ) THEN
    RAISE EXCEPTION 'Momsperioden kan inte stängas eftersom räkenskapsår % är låst.',
      extract(year from v_period.period_end)::integer
      USING ERRCODE = '23514';
  END IF;

  -- ------------------------------------------------------------
  -- Protected activity/balance reads.
  --
  -- Period membership is based on journal_entries.date.
  -- 265x blocks normal auto-close/manual review, but never enters
  -- closing_amount.
  -- ------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.vat_account_requires_close_manual_review(je.account_number)
  )
  INTO v_has_265_activity;

  IF v_has_265_activity THEN
    RAISE EXCEPTION 'Momsperioden innehåller aktivitet på 265x och behöver manuell kontroll före stängning.'
      USING ERRCODE = '23514';
  END IF;

  WITH per_account AS (
    SELECT
      je.account_number,
      sum(coalesce(je.debit, 0) - coalesce(je.credit, 0))::numeric AS balance,
      count(*)::integer AS row_count
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.vat_account_is_close_balance_participant(je.account_number)
    GROUP BY je.account_number
  )
  SELECT
    coalesce(sum(row_count), 0)::integer,
    coalesce(count(*) FILTER (WHERE balance <> 0), 0)::integer,
    coalesce(-sum(balance), 0)::numeric,
    coalesce(sum(CASE WHEN balance < 0 THEN -balance ELSE 0 END), 0)::numeric
      + greatest(-coalesce(-sum(balance), 0)::numeric, 0),
    coalesce(sum(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)::numeric
      + greatest(coalesce(-sum(balance), 0)::numeric, 0)
  INTO
    v_closing_scope_row_count,
    v_nonzero_balance_count,
    v_closing_amount,
    v_total_debit,
    v_total_credit
  FROM per_account;

  -- No closing-scope activity: close the state only. No transaction and no
  -- ver_nr consumption.
  IF v_closing_scope_row_count = 0 THEN
    UPDATE public.vat_periods
    SET status = 'closed',
        closing_amount = 0,
        closing_transaction_id = NULL,
        updated_at = now()
    WHERE id = v_period.id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_closed', false,
      'vat_period_id', v_period.id,
      'status', 'closed',
      'closing_amount', 0,
      'closing_transaction_id', NULL,
      'transaction_created', false
    );
  END IF;

  -- Activity exists, but all relevant account balances are already zero.
  -- This is not a normal closing candidate: creating fabricated 0/0 rows
  -- would hide the real history instead of documenting a closing.
  IF v_nonzero_balance_count = 0 THEN
    RAISE EXCEPTION 'Momsperioden har momsaktivitet men alla relevanta momskonton är redan noll. Kontrollera perioden manuellt.'
      USING ERRCODE = '23514';
  END IF;

  -- Internal accounting assertion before any ver_nr/write.
  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'Momsavslutet balanserar inte (debet %, kredit %).',
      v_total_debit, v_total_credit
      USING ERRCODE = '23514';
  END IF;

  -- ------------------------------------------------------------
  -- Real VAT closing transaction.
  --
  -- transactions.amount follows the existing verification-summary
  -- pattern used by SIE import: total debit in the verification.
  -- ------------------------------------------------------------
  SELECT public.get_next_ver_nr(v_user_id)
    INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för momsavslutet.';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    source
  ) VALUES (
    v_user_id,
    v_period.period_end,
    'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
    v_total_debit,
    NULL,
    NULL,
    true,
    'vat_closing'
  )
  RETURNING id INTO v_tx_id;

  WITH per_account AS (
    SELECT
      je.account_number,
      sum(coalesce(je.debit, 0) - coalesce(je.credit, 0))::numeric AS balance
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND public.vat_account_is_close_balance_participant(je.account_number)
    GROUP BY je.account_number
  )
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
    v_tx_id,
    v_ver_nr,
    account_number,
    CASE WHEN balance < 0 THEN -balance ELSE 0 END,
    CASE WHEN balance > 0 THEN balance ELSE 0 END,
    'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
    v_period.period_end,
    v_user_id
  FROM per_account
  WHERE balance <> 0
  ORDER BY account_number;

  GET DIAGNOSTICS v_inserted_vat_rows = ROW_COUNT;

  IF v_inserted_vat_rows <> v_nonzero_balance_count THEN
    RAISE EXCEPTION 'Momsavslutet kunde inte skapa förväntade momsrader.'
      USING ERRCODE = '23514';
  END IF;

  IF v_closing_amount > 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    ) VALUES (
      v_tx_id,
      v_ver_nr,
      '2650',
      0,
      v_closing_amount,
      'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
      v_period.period_end,
      v_user_id
    );
  ELSIF v_closing_amount < 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    ) VALUES (
      v_tx_id,
      v_ver_nr,
      '2650',
      -v_closing_amount,
      0,
      'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
      v_period.period_end,
      v_user_id
    );
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(coalesce(je.debit, 0)), 0)::numeric,
    coalesce(sum(coalesce(je.credit, 0)), 0)::numeric
  INTO
    v_inserted_total_rows,
    v_written_debit,
    v_written_credit
  FROM public.journal_entries je
  WHERE je.transaction_id = v_tx_id
    AND je.user_id = v_user_id;

  IF v_inserted_total_rows = 0 THEN
    RAISE EXCEPTION 'Momsavslutet skapade inga journalrader.'
      USING ERRCODE = '23514';
  END IF;

  IF v_written_debit IS DISTINCT FROM v_written_credit THEN
    RAISE EXCEPTION 'Momsavslutets journalrader balanserar inte (debet %, kredit %).',
      v_written_debit, v_written_credit
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.vat_periods
  SET status = 'closed',
      closing_amount = v_closing_amount,
      closing_transaction_id = v_tx_id,
      updated_at = now()
  WHERE id = v_period.id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_closed', false,
    'vat_period_id', v_period.id,
    'status', 'closed',
    'closing_amount', v_closing_amount,
    'closing_transaction_id', v_tx_id,
    'transaction_created', true,
    'ver_nr', v_ver_nr
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.close_vat_period_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_vat_period_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO service_role;
