-- C2-fix: blockera direkt datumändring på redan bokförda verifikationer.
-- Bygger vidare på 20260909_safe_update_transaction.sql.
--
-- Princip:
--   * bokförda transaktioner får INTE ändras i date/amount/type/vat_rate
--   * description och file_url kan fortfarande uppdateras enligt befintligt beteende
--   * om klienten skickar med samma datum som redan finns accepteras anropet
--   * obokförda transaktioner behåller nuvarande möjlighet att ändra datum
--   * rättelse av bokföringsuppgifter ska göras via korrigeringsverifikation

CREATE OR REPLACE FUNCTION public.update_transaction_safe(
  p_tx_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_tx public.transactions%ROWTYPE;
  v_new_date date;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen giltig eller inloggad användare hittades.'
      USING ERRCODE = '42501';
  END IF;

  IF p_tx_id IS NULL THEN
    RAISE EXCEPTION 'Transaktions-ID saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'Ogiltig uppdateringsdata.'
      USING ERRCODE = '22023';
  END IF;

  -- Lås raden så att ägarskap/låsstatus och uppdatering bedöms atomiskt.
  SELECT *
  INTO v_tx
  FROM public.transactions
  WHERE id = p_tx_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaktionen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  -- Det år transaktionen ligger i idag måste vara öppet.
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = EXTRACT(YEAR FROM v_tx.date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      EXTRACT(YEAR FROM v_tx.date)::integer
      USING ERRCODE = '42501';
  END IF;

  -- Om datum skickas in: validera det och kontrollera att eventuellt nytt år är öppet.
  IF p_updates ? 'date' THEN
    BEGIN
      v_new_date := (p_updates->>'date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Ogiltigt datum.'
        USING ERRCODE = '22007';
    END;

    IF v_new_date IS NULL THEN
      RAISE EXCEPTION 'Datum får inte vara tomt.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year = EXTRACT(YEAR FROM v_new_date)::integer
    ) THEN
      RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
        EXTRACT(YEAR FROM v_new_date)::integer
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bokförd verifikation: bokföringspåverkande fält får aldrig ändras direkt.
  -- Datum kontrolleras mot befintligt värde eftersom klienten får skicka med
  -- samma datum utan att detta ska räknas som en ändring.
  IF COALESCE(v_tx.booked, false)
     AND (
       (p_updates ? 'date' AND v_new_date IS DISTINCT FROM v_tx.date)
       OR p_updates ? 'amount'
       OR p_updates ? 'type'
       OR p_updates ? 'vat_rate'
     )
  THEN
    RAISE EXCEPTION
      'Bokförda transaktioner får inte ändras i datum, belopp, kategori eller moms. Använd korrigeringsverifikation.'
      USING ERRCODE = '42501';
  END IF;

  -- Whitelist: okända/skadliga fält (t.ex. user_id, booked, ver_nr) ignoreras.
  UPDATE public.transactions
  SET
    date = CASE
      WHEN p_updates ? 'date' THEN v_new_date
      ELSE date
    END,
    description = CASE
      WHEN p_updates ? 'description' THEN p_updates->>'description'
      ELSE description
    END,
    amount = CASE
      WHEN p_updates ? 'amount' THEN (p_updates->>'amount')::numeric
      ELSE amount
    END,
    type = CASE
      WHEN p_updates ? 'type' THEN p_updates->>'type'
      ELSE type
    END,
    vat_rate = CASE
      WHEN p_updates ? 'vat_rate' THEN (p_updates->>'vat_rate')::numeric
      ELSE vat_rate
    END,
    file_url = CASE
      WHEN p_updates ? 'file_url' THEN p_updates->>'file_url'
      ELSE file_url
    END
  WHERE id = p_tx_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', p_tx_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_transaction_safe(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_transaction_safe(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO authenticated;
