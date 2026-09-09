-- supabase/migrations/20260909_atomic_undo_sie_import.sql
--
-- Säker, atomisk "Ångra SIE-import".
--
-- Princip:
--   * importerad bokföring DELETE:as aldrig
--   * varje importerad verifikation får en spegelvänd rättelseverifikation
--   * alla rättelser skapas i EN PostgreSQL-transaktion
--   * importbatchen markeras därefter som 'undone'
--   * om någon kontroll eller INSERT misslyckas rullas ALLT tillbaka,
--     inklusive genererade verifikationsnummer
--
-- Automatisk ångring tillåts bara när importen är orörd:
--   * batchen måste tillhöra auth.uid()
--   * status måste vara 'completed'
--   * alla vanliga importerade verifikationer måste fortfarande finnas
--   * varje importerad transaktion måste ha ett komplett, entydigt verifikat
--   * ingen importerad verifikation får redan ha korrigerats
--   * korrigeringsåret måste vara öppet
--
-- Rättelsedatum följer samma regel som create_correction_transaction_atomic():
-- greatest(current_date, originalets datum).

-- ─────────────────────────────────────────────────────────────
-- 1. Metadata för ångrad import
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS undone_at timestamptz;

ALTER TABLE public.import_batches
  DROP CONSTRAINT IF EXISTS import_batches_status_check;

ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'undone'));

-- Egen source gör att UI:t senare kan gruppera de automatiska rättelserna
-- utan att blanda ihop dem med manuella KORRVER.
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_source_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_check
  CHECK (source IN ('manual', 'sie_import', 'sie_opening_balance', 'sie_import_undo'));


-- ─────────────────────────────────────────────────────────────
-- 2. Atomär ångring av en hel SIE-import
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.undo_sie_import_atomic(
  p_import_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch public.import_batches%ROWTYPE;
  v_original public.transactions%ROWTYPE;

  v_original_ver_nr integer;
  v_next_ver_nr integer;
  v_correction_date date;
  v_corr_tx_id uuid;

  v_entry_count integer;
  v_distinct_ver_count integer;
  v_linked_tx_count integer;
  v_normal_import_count integer;
  v_opening_balance_count integer;
  v_correction_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_import_batch_id IS NULL THEN
    RAISE EXCEPTION 'Import-ID saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- Lås batchen så att två samtidiga ångringar inte kan starta.
  SELECT *
    INTO v_batch
  FROM public.import_batches
  WHERE id = p_import_batch_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SIE-importen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  IF v_batch.status = 'undone' THEN
    RAISE EXCEPTION 'SIE-importen är redan ångrad.'
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status <> 'completed' THEN
    RAISE EXCEPTION 'Endast en slutförd SIE-import kan ångras (status: %).', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- En tidigare/halv ångring ska aldrig kunna döljas bakom batchstatus.
  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source = 'sie_import_undo'
  ) THEN
    RAISE EXCEPTION 'Importen har redan automatiska rättelser och kan inte ångras igen.'
      USING ERRCODE = '23514';
  END IF;

  -- Kontrollera att batchens vanliga importerade verifikationer fortfarande
  -- motsvarar imported_count. Legacy-IB kunde ligga som source='sie_import'
  -- med beskrivningen "Öppningsbalans", så den räknas inte som vanlig #VER.
  SELECT count(*)
    INTO v_normal_import_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source = 'sie_import'
    AND NOT (
      description = 'Öppningsbalans'
      AND source_ver_series IS NULL
      AND source_ver_number IS NULL
    );

  IF v_normal_import_count <> v_batch.imported_count THEN
    RAISE EXCEPTION
      'Importen kan inte ångras automatiskt eftersom dess importerade verifikationer inte längre är kompletta (% av % hittades).',
      v_normal_import_count, v_batch.imported_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
    INTO v_opening_balance_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND (
      source = 'sie_opening_balance'
      OR (
        source = 'sie_import'
        AND description = 'Öppningsbalans'
        AND source_ver_series IS NULL
        AND source_ver_number IS NULL
      )
    );

  IF v_opening_balance_count > 1 THEN
    RAISE EXCEPTION 'Importen innehåller fler än en ingående balans och kan inte ångras automatiskt.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
    INTO v_linked_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance');

  IF v_linked_tx_count = 0 THEN
    RAISE EXCEPTION 'Importen saknar bokförda transaktioner och kan inte ångras automatiskt.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Lås alla importerade originaltransaktioner innan vi börjar kontrollera
  -- och skapa rättelser. Ordningen gör låsningen deterministisk.
  PERFORM 1
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance')
  ORDER BY id
  FOR UPDATE;

  -- Förkontrollera HELA batchen innan första rättelsen skapas.
  -- Därmed får användaren ett rent fel utan att vi ens hunnit börja skriva.
  FOR v_original IN
    SELECT *
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source IN ('sie_import', 'sie_opening_balance')
    ORDER BY date, id
  LOOP
    SELECT
      count(*),
      count(DISTINCT ver_nr),
      min(ver_nr)
    INTO
      v_entry_count,
      v_distinct_ver_count,
      v_original_ver_nr
    FROM public.journal_entries
    WHERE transaction_id = v_original.id
      AND user_id = v_user_id;

    IF v_entry_count = 0 OR v_original_ver_nr IS NULL THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom en importerad verifikation saknar journalposter.'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_distinct_ver_count <> 1 THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom en importerad transaktion har inkonsekventa verifikationsnummer.'
        USING ERRCODE = '23514';
    END IF;

    -- Vi använder samma koppling som vanliga KORRVER: corrects_ver_nr.
    -- Om någon redan manuellt har korrigerat ett importerat verifikat ska
    -- hela automatiska batch-ångringen stoppas.
    IF EXISTS (
      SELECT 1
      FROM public.transactions c
      WHERE c.user_id = v_user_id
        AND coalesce(c.is_correction, false) = true
        AND c.corrects_ver_nr = v_original_ver_nr
    ) THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom VER-% redan har korrigerats.',
        v_original_ver_nr
        USING ERRCODE = '23514';
    END IF;

    v_correction_date := greatest(current_date, v_original.date);

    IF EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year = extract(year from v_correction_date)::int
    ) THEN
      RAISE EXCEPTION
        'Importen kan inte ångras eftersom korrigeringsåret % är låst (VER-%).',
        extract(year from v_correction_date)::int,
        v_original_ver_nr
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- ── Skapa rättelser ────────────────────────────────────────
  -- Först när hela batchen är validerad skapar vi en spegelverifikation
  -- per importerad transaktion.
  FOR v_original IN
    SELECT *
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source IN ('sie_import', 'sie_opening_balance')
    ORDER BY date, id
  LOOP
    SELECT min(ver_nr)
      INTO v_original_ver_nr
    FROM public.journal_entries
    WHERE transaction_id = v_original.id
      AND user_id = v_user_id;

    v_correction_date := greatest(current_date, v_original.date);

    SELECT public.get_next_ver_nr(v_user_id)
      INTO v_next_ver_nr;

    IF v_next_ver_nr IS NULL THEN
      RAISE EXCEPTION 'Kunde inte generera verifikationsnummer vid ångring av SIE-import.';
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
      user_id,
      source,
      import_batch_id
    ) VALUES (
      v_correction_date,
      '↩ Ångrad SIE-import: ' || v_batch.filename || ' – korrigering av VER-' || v_original_ver_nr,
      v_original.amount,
      v_original.type,
      v_original.vat_rate,
      true,
      true,
      v_original_ver_nr,
      v_user_id,
      'sie_import_undo',
      p_import_batch_id
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
      'Ångrad SIE-import ' || v_batch.filename || ' – korrigering av VER-' || v_original_ver_nr || ': ' || coalesce(e.description, ''),
      v_correction_date,
      v_user_id
    FROM public.journal_entries e
    WHERE e.transaction_id = v_original.id
      AND e.user_id = v_user_id;

    v_correction_count := v_correction_count + 1;
  END LOOP;

  UPDATE public.import_batches
  SET status = 'undone',
      undone_at = now()
  WHERE id = p_import_batch_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'import_batch_id', p_import_batch_id,
    'filename', v_batch.filename,
    'status', 'undone',
    'correction_count', v_correction_count,
    'undone_at', now()
  );
END;
$function$;

-- Endast inloggade användare får anropa funktionen.
REVOKE ALL ON FUNCTION public.undo_sie_import_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_sie_import_atomic(uuid) TO authenticated;
