-- supabase/migrations/20260908_atomic_correction_transaction.sql
--
-- Gör korrigeringsverifikationer atomiska.
--
-- Hela flödet sker i EN PostgreSQL-transaktion:
--   - verifiera originaltransaktionen
--   - kontrollera berörda räkenskapsår server-side
--   - hämta originalets journalrader
--   - generera nytt verifikationsnummer
--   - skapa korrigeringstransaktion
--   - skapa spegelvända journalrader
--   - om originalet är periodiseringens första del:
--       korrigera även tillhörande vändningsverifikation
--
-- Om något steg misslyckas rullas allt tillbaka, inklusive verifikationsnummer.

CREATE OR REPLACE FUNCTION public.create_correction_transaction_atomic(
  p_original_tx_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
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
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_original_tx_id IS NULL THEN
    RAISE EXCEPTION 'Originaltransaktion saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- Lås originalraden under hela korrigeringen så att den inte kan ändras
  -- samtidigt som korrigeringsverifikationen byggs.
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

  -- Samma datumregel som tidigare klientkod:
  -- korrigeringen får aldrig ligga före originalverifikationen.
  v_correction_date := greatest(current_date, v_original.date);

  -- Server-side årslåsning för den faktiska korrigeringsdagen.
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

  -- Kontrollera att originalet har ett komplett och entydigt verifikat.
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

  -- Om originalet är första delen i en periodisering ska även dess
  -- vändningsverifikation korrigeras i SAMMA databastransaktion.
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

    IF v_reversal_found THEN
      -- Precis som tidigare beteende ska vändningskorrigeringen ligga på
      -- vändningens eget datum.
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
    END IF;
  END IF;

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

REVOKE ALL ON FUNCTION public.create_correction_transaction_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_correction_transaction_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_correction_transaction_atomic(uuid) TO authenticated;
