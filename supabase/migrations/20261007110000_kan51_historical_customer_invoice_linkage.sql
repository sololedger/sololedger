-- KAN-51: allow a tightly-scoped historical customer-invoice payment link.
--
-- This supports invoices that were validly paid and booked before KAN-46
-- existed, without rewriting their existing manual verification history or
-- creating duplicate accounting.

ALTER TABLE public.customer_invoice_bookings
DROP CONSTRAINT IF EXISTS customer_invoice_bookings_kind_check;

ALTER TABLE public.customer_invoice_bookings
ADD CONSTRAINT customer_invoice_bookings_kind_check
  CHECK (booking_kind = ANY (ARRAY[
    'payment_same_year'::text,
    'year_end_receivable'::text,
    'receivable_settlement'::text,
    'payment_same_year_reversal'::text,
    'receivable_settlement_reversal'::text,
    'historical_payment_same_year'::text
  ]));

COMMENT ON TABLE public.customer_invoice_bookings IS
  'Immutable links between external customer invoices and SoloLedger bookkeeping transactions. historical_payment_same_year links a paid invoice to a pre-KAN-46 manual payment verification without creating new bookkeeping.';

CREATE OR REPLACE FUNCTION public.validate_customer_invoice_booking_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_invoice public.customer_invoices%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_reversed public.customer_invoice_bookings%ROWTYPE;
  v_historical_1930_net numeric := 0;
  v_historical_3010_net numeric := 0;
  v_historical_other_count integer := 0;
BEGIN
  SELECT *
    INTO v_invoice
  FROM public.customer_invoices
  WHERE id = NEW.invoice_id
    AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kundfakturan saknas eller tillhör inte användaren.'
      USING ERRCODE = '23503';
  END IF;

  SELECT *
    INTO v_tx
  FROM public.transactions
  WHERE id = NEW.transaction_id
    AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bokföringstransaktionen saknas eller tillhör inte användaren.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.booking_kind = 'historical_payment_same_year' THEN
    IF v_tx.source <> 'manual' THEN
      RAISE EXCEPTION 'Historisk kundfakturalänk måste peka på en befintlig manuell betalningsverifikation.'
        USING ERRCODE = '23514';
    END IF;

    IF coalesce(v_tx.is_correction, false)
       OR coalesce(v_tx.is_periodized, false)
       OR coalesce(v_tx.is_periodized_reversal, false)
       OR v_tx.corrects_ver_nr IS NOT NULL
       OR v_tx.import_batch_id IS NOT NULL
       OR v_tx.periodization_group_id IS NOT NULL THEN
      RAISE EXCEPTION 'Historisk kundfakturalänk får bara peka på en enkel okorrigerad manuell verifikation.'
        USING ERRCODE = '23514';
    END IF;

    IF v_invoice.payment_status <> 'paid'
       OR v_invoice.paid_at IS NULL
       OR v_invoice.paid_at <> NEW.booking_date THEN
      RAISE EXCEPTION 'Historisk kundfakturalänk kräver att fakturan redan är markerad betald på samma datum.'
        USING ERRCODE = '23514';
    END IF;

    IF v_invoice.vat_treatment <> 'exempt'
       OR round(v_invoice.vat_amount, 2) <> 0
       OR round(v_invoice.vat_rate, 2) <> 0 THEN
      RAISE EXCEPTION 'Historisk kundfakturalänk stöder bara verifierad ej momspliktig försäljning i detta steg.'
        USING ERRCODE = '23514';
    END IF;

    IF v_tx.date <> NEW.booking_date
       OR round(v_tx.amount, 2) <> round(NEW.gross_amount, 2)
       OR coalesce(v_tx.vat_rate, 0) <> 0
       OR v_tx.type <> 'försäljning' THEN
      RAISE EXCEPTION 'Historisk kundfakturalänk matchar inte transaktionens datum, belopp, typ eller moms.'
        USING ERRCODE = '23514';
    END IF;

    SELECT
      coalesce(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)) FILTER (WHERE je.account_number = '1930'), 0),
      coalesce(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)) FILTER (WHERE je.account_number = '3010'), 0),
      count(*) FILTER (WHERE je.account_number NOT IN ('1930', '3010'))
      INTO v_historical_1930_net, v_historical_3010_net, v_historical_other_count
    FROM public.journal_entries je
    WHERE je.user_id = NEW.user_id
      AND je.transaction_id = NEW.transaction_id;

    IF round(v_historical_1930_net, 2) <> round(NEW.gross_amount, 2)
       OR round(v_historical_3010_net, 2) <> -round(NEW.net_amount, 2)
       OR v_historical_other_count <> 0 THEN
      RAISE EXCEPTION 'Historisk kundfakturalänk kräver journalen 1930 debet och 3010 kredit utan extra rader.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_tx.source <> 'customer_invoice' THEN
    RAISE EXCEPTION 'Kundfakturabokningar måste länka till source=customer_invoice.'
      USING ERRCODE = '23514';
  END IF;

  IF round(NEW.gross_amount, 2) <> round(v_invoice.gross_amount, 2)
     OR round(NEW.net_amount, 2) <> round(v_invoice.net_amount, 2)
     OR round(NEW.vat_amount, 2) <> round(v_invoice.vat_amount, 2) THEN
    RAISE EXCEPTION 'Kundfakturabokningens belopp matchar inte fakturan.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.booking_kind IN ('payment_same_year_reversal', 'receivable_settlement_reversal') THEN
    IF NEW.reverses_booking_id IS NULL THEN
      RAISE EXCEPTION 'Ångerbokning måste peka ut betalningen som ångras.'
        USING ERRCODE = '23514';
    END IF;

    SELECT *
      INTO v_reversed
    FROM public.customer_invoice_bookings
    WHERE id = NEW.reverses_booking_id
      AND user_id = NEW.user_id
      AND invoice_id = NEW.invoice_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Betalningsbokningen som ska ångras saknas eller tillhör inte fakturan.'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.booking_kind = 'payment_same_year_reversal'
       AND v_reversed.booking_kind <> 'payment_same_year' THEN
      RAISE EXCEPTION 'Ångerbokningen matchar inte den ursprungliga betalningstypen.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.booking_kind = 'receivable_settlement_reversal'
       AND v_reversed.booking_kind <> 'receivable_settlement' THEN
      RAISE EXCEPTION 'Ångerbokningen matchar inte den ursprungliga betalningstypen.'
        USING ERRCODE = '23514';
    END IF;

    IF coalesce(v_tx.is_correction, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Ångerbokningen måste länka till en korrigeringsverifikation.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.reverses_booking_id IS NOT NULL THEN
    RAISE EXCEPTION 'Endast ångerbokningar får peka ut en tidigare betalning.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_customer_invoice_booking_consistency() IS
  'Validates customer invoice booking links, including tightly scoped historical_payment_same_year links to pre-KAN-46 manual exempt sale verifications.';

CREATE OR REPLACE FUNCTION public.undo_customer_invoice_payment_atomic(
  p_invoice_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_invoice public.customer_invoices%ROWTYPE;
  v_existing jsonb;
  v_historical_payment public.customer_invoice_bookings%ROWTYPE;
  v_payment public.customer_invoice_bookings%ROWTYPE;
  v_original_tx public.transactions%ROWTYPE;
  v_reversal_kind text;
  v_reversal_date date;
  v_original_ver_nr integer;
  v_reversal_ver_nr integer;
  v_reversal_tx_id uuid;
  v_reversal_booking_id uuid;
  v_entry_count integer;
  v_distinct_ver_count integer;
  v_vat_relevant boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.' USING ERRCODE = '28000';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas.' USING ERRCODE = '22023';
  END IF;

  v_existing := public.customer_invoice_booking_replay(v_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT *
    INTO v_invoice
  FROM public.customer_invoices
  WHERE id = p_invoice_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kundfakturan saknas eller tillhör inte användaren.'
      USING ERRCODE = '23503';
  END IF;

  IF v_invoice.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Endast en betald kundfaktura kan ångra betalning.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_historical_payment
  FROM public.customer_invoice_bookings cib
  WHERE cib.user_id = v_user_id
    AND cib.invoice_id = v_invoice.id
    AND cib.booking_kind = 'historical_payment_same_year'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Historiskt inlyft kundfakturabetalning kan inte ångras med den vanliga KAN-46-åtgärden.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_payment
  FROM public.customer_invoice_bookings cib
  WHERE cib.user_id = v_user_id
    AND cib.invoice_id = v_invoice.id
    AND cib.booking_kind IN ('payment_same_year', 'receivable_settlement')
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_invoice_bookings reversal
      WHERE reversal.user_id = cib.user_id
        AND reversal.invoice_id = cib.invoice_id
        AND reversal.reverses_booking_id = cib.id
    )
  ORDER BY cib.booking_date DESC, cib.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Det finns ingen registrerad betalning att ångra, eller betalningen är redan ångrad.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_original_tx
  FROM public.transactions
  WHERE id = v_payment.transaction_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Betalningens verifikation saknas.'
      USING ERRCODE = '23503';
  END IF;

  v_reversal_date := greatest(current_date, v_payment.booking_date);

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year IN (
        extract(year from v_payment.booking_date)::int,
        extract(year from v_reversal_date)::int
      )
  ) THEN
    RAISE EXCEPTION 'Betalningen ligger i ett låst räkenskapsår och kan inte ångras automatiskt.'
      USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.transaction_id = v_payment.transaction_id
      AND public.vat_concurrency_account(je.account_number)
  )
  INTO v_vat_relevant;

  IF v_vat_relevant THEN
    PERFORM public.lock_vat_months(
      v_user_id,
      ARRAY[v_payment.booking_date, v_reversal_date]::date[]
    );

    IF EXISTS (
      SELECT 1
      FROM public.vat_periods vp
      WHERE vp.user_id = v_user_id
        AND vp.source = 'sololedger'
        AND vp.status IN ('closed', 'declared')
        AND (
          v_payment.booking_date BETWEEN vp.period_start AND vp.period_end
          OR v_reversal_date BETWEEN vp.period_start AND vp.period_end
        )
    ) THEN
      RAISE EXCEPTION 'Momsperioden för betalningen eller korrigeringen är redan stängd eller deklarerad. Betalningen kan inte ångras automatiskt.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT
    count(*),
    count(DISTINCT ver_nr),
    min(ver_nr)
    INTO v_entry_count, v_distinct_ver_count, v_original_ver_nr
  FROM public.journal_entries
  WHERE transaction_id = v_payment.transaction_id
    AND user_id = v_user_id;

  IF v_entry_count = 0 OR v_original_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte hämta betalningens journalposter.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_distinct_ver_count <> 1 THEN
    RAISE EXCEPTION 'Betalningen har inkonsekventa verifikationsnummer och kan inte ångras.'
      USING ERRCODE = '23514';
  END IF;

  SELECT public.get_next_ver_nr(v_user_id) INTO v_reversal_ver_nr;
  IF v_reversal_ver_nr IS NULL THEN
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
    booked,
    source,
    is_correction,
    corrects_ver_nr
  ) VALUES (
    v_user_id,
    v_reversal_date,
    'Ångrad betalning kundfaktura ' || v_invoice.invoice_number,
    v_invoice.gross_amount,
    'customer_invoice',
    coalesce(v_invoice.vat_rate, 0),
    v_invoice.attachment_url,
    true,
    'customer_invoice',
    true,
    v_original_ver_nr
  )
  RETURNING id INTO v_reversal_tx_id;

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
    v_reversal_tx_id,
    v_reversal_ver_nr,
    je.account_number,
    je.credit,
    je.debit,
    'Ångrad betalning kundfaktura ' || v_invoice.invoice_number || ': ' || coalesce(je.description, ''),
    v_reversal_date,
    v_user_id
  FROM public.journal_entries je
  WHERE je.transaction_id = v_payment.transaction_id
    AND je.user_id = v_user_id;

  v_reversal_kind := CASE v_payment.booking_kind
    WHEN 'payment_same_year' THEN 'payment_same_year_reversal'
    ELSE 'receivable_settlement_reversal'
  END;

  INSERT INTO public.customer_invoice_bookings (
    user_id,
    invoice_id,
    transaction_id,
    booking_kind,
    booking_date,
    fiscal_year,
    gross_amount,
    net_amount,
    vat_amount,
    idempotency_key,
    reverses_booking_id
  ) VALUES (
    v_user_id,
    v_invoice.id,
    v_reversal_tx_id,
    v_reversal_kind,
    v_reversal_date,
    extract(year from v_reversal_date)::int,
    v_invoice.gross_amount,
    v_invoice.net_amount,
    v_invoice.vat_amount,
    p_idempotency_key,
    v_payment.id
  )
  RETURNING id INTO v_reversal_booking_id;

  UPDATE public.customer_invoices
  SET payment_status = 'unpaid',
      paid_at = NULL,
      updated_at = now()
  WHERE id = v_invoice.id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'invoice_id', v_invoice.id,
    'booking_id', v_reversal_booking_id,
    'transaction_id', v_reversal_tx_id,
    'ver_nr', v_reversal_ver_nr,
    'booking_kind', v_reversal_kind,
    'payment_status', 'unpaid'
  );
END;
$function$;

COMMENT ON FUNCTION public.undo_customer_invoice_payment_atomic(uuid, uuid) IS
  'Creates controlled reversals for KAN-46-created customer invoice payments and rejects historical_payment_same_year links to pre-KAN-46 manual verifications.';
