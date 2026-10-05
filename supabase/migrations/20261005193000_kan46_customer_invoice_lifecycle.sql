BEGIN;

-- KAN-46: external customer invoice lifecycle foundation for cash accounting.
--
-- Scope:
--   * Store invoice facts without ordinary bookkeeping.
--   * Book same-year full payment as ordinary sale on payment date.
--   * Book unpaid year-end receivable on 31/12.
--   * Settle later payment against 1510 without duplicate income/VAT.

ALTER TABLE public.transactions
  DROP CONSTRAINT transactions_source_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_check
  CHECK (
    source = ANY (
      ARRAY[
        'manual'::text,
        'sie_import'::text,
        'sie_opening_balance'::text,
        'sie_import_undo'::text,
        'vat_closing'::text,
        'vat_v2'::text,
        'vat_settlement'::text,
        'tax_account_movement'::text,
        'customer_invoice'::text
      ]
    )
  );

COMMENT ON COLUMN public.transactions.source IS
  'Origin of the transaction. customer_invoice, vat_closing, vat_settlement, and tax_account_movement are reserved for controlled SoloLedger lifecycle RPCs. vat_v2 is reserved for controlled VAT V2 booking RPCs.';

CREATE OR REPLACE FUNCTION public.transaction_source_classification(p_source text)
RETURNS TABLE (
  source text,
  is_current_source boolean,
  is_reserved_future_source boolean,
  is_system_managed boolean,
  is_controlled_vat_lifecycle_source boolean,
  allows_generic_correction boolean,
  allows_generic_update boolean,
  is_ordinary_vat_guard_activity boolean
)
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT
    p_source AS source,
    coalesce(p_source = ANY (ARRAY[
      'manual',
      'sie_import',
      'sie_opening_balance',
      'sie_import_undo',
      'vat_closing',
      'vat_v2',
      'vat_settlement',
      'tax_account_movement',
      'customer_invoice'
    ]::text[]), false) AS is_current_source,
    false AS is_reserved_future_source,
    coalesce(p_source = ANY (ARRAY[
      'sie_import',
      'sie_opening_balance',
      'sie_import_undo',
      'vat_closing',
      'vat_v2',
      'vat_settlement',
      'tax_account_movement',
      'customer_invoice'
    ]::text[]), false) AS is_system_managed,
    coalesce(p_source = ANY (ARRAY[
      'vat_closing',
      'vat_settlement',
      'tax_account_movement'
    ]::text[]), false) AS is_controlled_vat_lifecycle_source,
    CASE p_source
      WHEN 'manual' THEN true
      WHEN 'sie_import' THEN true
      WHEN 'sie_opening_balance' THEN true
      WHEN 'sie_import_undo' THEN true
      ELSE false
    END AS allows_generic_correction,
    CASE p_source
      WHEN 'manual' THEN true
      WHEN 'sie_import' THEN true
      WHEN 'sie_opening_balance' THEN true
      WHEN 'sie_import_undo' THEN true
      WHEN 'vat_v2' THEN true
      ELSE false
    END AS allows_generic_update,
    CASE p_source
      WHEN 'manual' THEN true
      WHEN 'sie_import' THEN true
      WHEN 'sie_opening_balance' THEN true
      WHEN 'sie_import_undo' THEN true
      WHEN 'vat_v2' THEN true
      WHEN 'customer_invoice' THEN true
      ELSE false
    END AS is_ordinary_vat_guard_activity;
$function$;

COMMENT ON FUNCTION public.transaction_source_classification(text)
  IS 'Central SoloLedger transaction source taxonomy for DB-side guards. customer_invoice is a controlled invoice lifecycle source and is not generically editable/correctable.';

CREATE TABLE public.customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  customer_name text NOT NULL,
  customer_country text NOT NULL DEFAULT 'SE',
  currency text NOT NULL DEFAULT 'SEK',
  invoice_date date NOT NULL,
  service_date date NOT NULL,
  due_date date NOT NULL,
  gross_amount numeric NOT NULL,
  net_amount numeric,
  vat_amount numeric,
  vat_rate numeric,
  vat_treatment text NOT NULL DEFAULT 'unknown',
  payment_status text NOT NULL DEFAULT 'unpaid',
  paid_at date,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_invoices_invoice_number_not_blank
    CHECK (btrim(invoice_number) <> ''),
  CONSTRAINT customer_invoices_customer_name_not_blank
    CHECK (btrim(customer_name) <> ''),
  CONSTRAINT customer_invoices_country_supported
    CHECK (customer_country = 'SE'),
  CONSTRAINT customer_invoices_currency_supported
    CHECK (currency = 'SEK'),
  CONSTRAINT customer_invoices_gross_positive
    CHECK (gross_amount > 0),
  CONSTRAINT customer_invoices_vat_treatment_check
    CHECK (vat_treatment = ANY (ARRAY['taxable'::text, 'exempt'::text, 'unknown'::text])),
  CONSTRAINT customer_invoices_payment_status_check
    CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'cancelled'::text])),
  CONSTRAINT customer_invoices_known_vat_consistency
    CHECK (
      (
        vat_treatment = 'unknown'
        AND net_amount IS NULL
        AND vat_amount IS NULL
        AND vat_rate IS NULL
      )
      OR (
        vat_treatment = 'exempt'
        AND vat_rate = 0
        AND vat_amount = 0
        AND net_amount = gross_amount
      )
      OR (
        vat_treatment = 'taxable'
        AND vat_rate = ANY (ARRAY[6::numeric, 12::numeric, 25::numeric])
        AND vat_amount > 0
        AND net_amount > 0
        AND gross_amount = round(net_amount + vat_amount, 2)
      )
    ),
  CONSTRAINT customer_invoices_paid_at_status_consistency
    CHECK (
      (payment_status = 'paid' AND paid_at IS NOT NULL)
      OR (payment_status <> 'paid' AND paid_at IS NULL)
    ),
  CONSTRAINT customer_invoices_user_invoice_unique
    UNIQUE (user_id, invoice_number)
);

CREATE INDEX customer_invoices_user_status_due_idx
  ON public.customer_invoices (user_id, payment_status, due_date);

CREATE INDEX customer_invoices_user_invoice_date_idx
  ON public.customer_invoices (user_id, invoice_date);

CREATE TABLE public.customer_invoice_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id),
  booking_kind text NOT NULL,
  booking_date date NOT NULL,
  fiscal_year integer NOT NULL,
  gross_amount numeric NOT NULL,
  net_amount numeric NOT NULL,
  vat_amount numeric NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_invoice_bookings_kind_check
    CHECK (booking_kind = ANY (ARRAY[
      'payment_same_year'::text,
      'year_end_receivable'::text,
      'receivable_settlement'::text
    ])),
  CONSTRAINT customer_invoice_bookings_amounts_check
    CHECK (
      gross_amount > 0
      AND net_amount > 0
      AND vat_amount >= 0
      AND gross_amount = round(net_amount + vat_amount, 2)
    ),
  CONSTRAINT customer_invoice_bookings_user_key_unique
    UNIQUE (user_id, idempotency_key),
  CONSTRAINT customer_invoice_bookings_invoice_kind_year_unique
    UNIQUE (invoice_id, booking_kind, fiscal_year),
  CONSTRAINT customer_invoice_bookings_transaction_unique
    UNIQUE (transaction_id)
);

CREATE INDEX customer_invoice_bookings_user_invoice_idx
  ON public.customer_invoice_bookings (user_id, invoice_id);

COMMENT ON TABLE public.customer_invoices IS
  'External customer invoice facts. Creating a row does not by itself create bookkeeping journal entries.';

COMMENT ON TABLE public.customer_invoice_bookings IS
  'Immutable links between external customer invoices and controlled SoloLedger bookkeeping transactions.';

ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_invoice_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own customer invoices"
ON public.customer_invoices
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can read their own customer invoice bookings"
ON public.customer_invoice_bookings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.customer_invoices FROM PUBLIC;
REVOKE ALL ON TABLE public.customer_invoices FROM anon;
REVOKE ALL ON TABLE public.customer_invoices FROM authenticated;
GRANT SELECT ON TABLE public.customer_invoices TO authenticated;
GRANT ALL ON TABLE public.customer_invoices TO service_role;

REVOKE ALL ON TABLE public.customer_invoice_bookings FROM PUBLIC;
REVOKE ALL ON TABLE public.customer_invoice_bookings FROM anon;
REVOKE ALL ON TABLE public.customer_invoice_bookings FROM authenticated;
GRANT SELECT ON TABLE public.customer_invoice_bookings TO authenticated;
GRANT ALL ON TABLE public.customer_invoice_bookings TO service_role;

CREATE OR REPLACE FUNCTION public.customer_invoice_output_vat_account(p_vat_rate numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT CASE p_vat_rate
    WHEN 25 THEN '2611'
    WHEN 12 THEN '2621'
    WHEN 6 THEN '2631'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_customer_invoice_booking_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'Kundfakturabokningar är låsta historikposter och kan inte ändras eller raderas.'
    USING ERRCODE = '23514';
END;
$function$;

CREATE TRIGGER prevent_customer_invoice_booking_mutation
BEFORE UPDATE OR DELETE ON public.customer_invoice_bookings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_customer_invoice_booking_mutation();

REVOKE ALL ON FUNCTION public.prevent_customer_invoice_booking_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_customer_invoice_booking_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_customer_invoice_booking_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_customer_invoice_booking_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_customer_invoice_booking_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.validate_customer_invoice_booking_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_invoice public.customer_invoices%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
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

  IF v_tx.source <> 'customer_invoice' THEN
    RAISE EXCEPTION 'Kundfakturabokningar måste länka till source=customer_invoice.'
      USING ERRCODE = '23514';
  END IF;

  IF round(NEW.gross_amount, 2) <> round(v_invoice.gross_amount, 2)
     OR round(NEW.net_amount, 2) <> round(v_invoice.net_amount, 2)
     OR round(NEW.vat_amount, 2) <> round(v_invoice.vat_amount, 2) THEN
    RAISE EXCEPTION 'Kundfakturabokningens belopp matchar inte fakturan.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_customer_invoice_booking_consistency
BEFORE INSERT OR UPDATE ON public.customer_invoice_bookings
FOR EACH ROW
EXECUTE FUNCTION public.validate_customer_invoice_booking_consistency();

REVOKE ALL ON FUNCTION public.validate_customer_invoice_booking_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_customer_invoice_booking_consistency() FROM anon;
REVOKE ALL ON FUNCTION public.validate_customer_invoice_booking_consistency() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customer_invoice_booking_consistency() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_customer_invoice_booking_consistency() TO service_role;

CREATE OR REPLACE FUNCTION public.create_customer_invoice_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_invoice_number text;
  v_customer_name text;
  v_invoice_date date;
  v_service_date date;
  v_due_date date;
  v_gross_amount numeric;
  v_vat_treatment text;
  v_vat_rate numeric;
  v_net_amount numeric;
  v_vat_amount numeric;
  v_attachment_url text;
  v_invoice_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.' USING ERRCODE = '28000';
  END IF;

  v_invoice_number := btrim(coalesce(p_payload->>'invoice_number', ''));
  v_customer_name := btrim(coalesce(p_payload->>'customer_name', ''));
  v_vat_treatment := coalesce(nullif(p_payload->>'vat_treatment', ''), 'unknown');
  v_attachment_url := nullif(p_payload->>'attachment_url', '');

  IF v_invoice_number = '' THEN
    RAISE EXCEPTION 'Fakturanummer saknas.' USING ERRCODE = '22023';
  END IF;

  IF v_customer_name = '' THEN
    RAISE EXCEPTION 'Kundnamn saknas.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_payload->>'customer_country', 'SE') <> 'SE' THEN
    RAISE EXCEPTION 'KAN-46 stöder bara svensk kund i första versionen.'
      USING ERRCODE = '23514';
  END IF;

  IF coalesce(p_payload->>'currency', 'SEK') <> 'SEK' THEN
    RAISE EXCEPTION 'KAN-46 stöder bara SEK i första versionen.'
      USING ERRCODE = '23514';
  END IF;

  IF v_vat_treatment NOT IN ('taxable', 'exempt', 'unknown') THEN
    RAISE EXCEPTION 'Ogiltig momsstatus för kundfaktura.'
      USING ERRCODE = '22023';
  END IF;

  v_invoice_date := (p_payload->>'invoice_date')::date;
  v_service_date := (p_payload->>'service_date')::date;
  v_due_date := (p_payload->>'due_date')::date;
  v_gross_amount := round((p_payload->>'gross_amount')::numeric, 2);

  IF v_gross_amount <= 0 THEN
    RAISE EXCEPTION 'Fakturabeloppet måste vara större än 0.'
      USING ERRCODE = '22023';
  END IF;

  IF v_vat_treatment = 'unknown' THEN
    v_vat_rate := NULL;
    v_net_amount := NULL;
    v_vat_amount := NULL;
  ELSIF v_vat_treatment = 'exempt' THEN
    v_vat_rate := 0;
    v_net_amount := v_gross_amount;
    v_vat_amount := 0;
  ELSE
    v_vat_rate := (p_payload->>'vat_rate')::numeric;
    IF v_vat_rate NOT IN (6, 12, 25) THEN
      RAISE EXCEPTION 'Momspliktig kundfaktura kräver momssats 6, 12 eller 25 procent.'
        USING ERRCODE = '22023';
    END IF;
    v_vat_amount := round((v_gross_amount - (v_gross_amount / (1 + v_vat_rate / 100)))::numeric, 2);
    v_net_amount := round((v_gross_amount - v_vat_amount)::numeric, 2);
  END IF;

  INSERT INTO public.customer_invoices (
    user_id,
    invoice_number,
    customer_name,
    customer_country,
    currency,
    invoice_date,
    service_date,
    due_date,
    gross_amount,
    net_amount,
    vat_amount,
    vat_rate,
    vat_treatment,
    attachment_url
  ) VALUES (
    v_user_id,
    v_invoice_number,
    v_customer_name,
    'SE',
    'SEK',
    v_invoice_date,
    v_service_date,
    v_due_date,
    v_gross_amount,
    v_net_amount,
    v_vat_amount,
    v_vat_rate,
    v_vat_treatment,
    v_attachment_url
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'payment_status', 'unpaid'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.customer_invoice_booking_replay(
  p_user_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_existing public.customer_invoice_bookings%ROWTYPE;
BEGIN
  SELECT *
    INTO v_existing
  FROM public.customer_invoice_bookings
  WHERE user_id = p_user_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'invoice_id', v_existing.invoice_id,
      'booking_id', v_existing.id,
      'transaction_id', v_existing.transaction_id,
      'booking_kind', v_existing.booking_kind
    );
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_customer_invoice_transaction(
  p_user_id uuid,
  p_invoice public.customer_invoices,
  p_booking_kind text,
  p_booking_date date,
  p_fiscal_year integer,
  p_idempotency_key uuid,
  p_description text,
  p_journal_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ver_nr integer;
  v_tx_id uuid;
  v_booking_id uuid;
  v_row jsonb;
BEGIN
  SELECT public.get_next_ver_nr(p_user_id) INTO v_ver_nr;

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
    booked,
    source
  ) VALUES (
    p_user_id,
    p_booking_date,
    p_description,
    p_invoice.gross_amount,
    'customer_invoice',
    coalesce(p_invoice.vat_rate, 0),
    p_invoice.attachment_url,
    true,
    'customer_invoice'
  )
  RETURNING id INTO v_tx_id;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_journal_rows)
  LOOP
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
      v_row->>'account_number',
      coalesce((v_row->>'debit')::numeric, 0),
      coalesce((v_row->>'credit')::numeric, 0),
      v_row->>'description',
      p_booking_date,
      p_user_id
    );
  END LOOP;

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
    idempotency_key
  ) VALUES (
    p_user_id,
    p_invoice.id,
    v_tx_id,
    p_booking_kind,
    p_booking_date,
    p_fiscal_year,
    p_invoice.gross_amount,
    p_invoice.net_amount,
    p_invoice.vat_amount,
    p_idempotency_key
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'invoice_id', p_invoice.id,
    'booking_id', v_booking_id,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr,
    'booking_kind', p_booking_kind
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_customer_invoice_payment_atomic(
  p_invoice_id uuid,
  p_payment_date date,
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
  v_year_end_receivable_count integer := 0;
  v_output_vat_account text;
  v_result jsonb;
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

  IF v_invoice.payment_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Kundfakturan är inte obetald.'
      USING ERRCODE = '23514';
  END IF;

  IF v_invoice.vat_treatment = 'unknown' THEN
    RAISE EXCEPTION 'Momsstatus är osäker. SoloLedger kan inte bokföra betalningen förrän momsfakta är klara.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from p_payment_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_payment_date)::int
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer
    INTO v_year_end_receivable_count
  FROM public.customer_invoice_bookings
  WHERE invoice_id = v_invoice.id
    AND user_id = v_user_id
    AND booking_kind = 'year_end_receivable';

  IF v_year_end_receivable_count > 0 THEN
    RAISE EXCEPTION 'Kundfakturan är redan bokförd som kundfordran. Använd reglering mot 1510 när betalningen kommer.'
      USING ERRCODE = '23514';
  END IF;

  IF extract(year from p_payment_date)::int <> extract(year from v_invoice.invoice_date)::int THEN
    RAISE EXCEPTION 'Betalning utanför fakturaåret kräver årsskiftesbokning av kundfordran först.'
      USING ERRCODE = '23514';
  END IF;

  IF v_invoice.vat_amount > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, ARRAY[p_payment_date]::date[]);
    IF EXISTS (
      SELECT 1
      FROM public.vat_periods vp
      WHERE vp.user_id = v_user_id
        AND vp.source = 'sololedger'
        AND p_payment_date BETWEEN vp.period_start AND vp.period_end
        AND vp.status IN ('closed', 'declared')
    ) THEN
      RAISE EXCEPTION 'Momsperioden för betalningsdatum % är redan stängd eller deklarerad. Bokningen kan inte genomföras.',
        p_payment_date
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_output_vat_account := public.customer_invoice_output_vat_account(v_invoice.vat_rate);
  IF v_invoice.vat_treatment = 'taxable' AND v_output_vat_account IS NULL THEN
    RAISE EXCEPTION 'Kundfakturans momssats stöds inte för svensk försäljning.'
      USING ERRCODE = '23514';
  END IF;

  v_result := public.insert_customer_invoice_transaction(
    v_user_id,
    v_invoice,
    'payment_same_year',
    p_payment_date,
    extract(year from p_payment_date)::int,
    p_idempotency_key,
    'Kundfaktura betald: ' || v_invoice.invoice_number || ' - ' || v_invoice.customer_name,
    jsonb_build_array(
      jsonb_build_object(
        'account_number', '1930',
        'debit', v_invoice.gross_amount,
        'credit', 0,
        'description', 'Betalning kundfaktura ' || v_invoice.invoice_number
      ),
      jsonb_build_object(
        'account_number', '3010',
        'debit', 0,
        'credit', v_invoice.net_amount,
        'description', 'Försäljning kundfaktura ' || v_invoice.invoice_number
      )
    )
    ||
    CASE
      WHEN v_invoice.vat_amount > 0 THEN jsonb_build_array(
        jsonb_build_object(
          'account_number', v_output_vat_account,
          'debit', 0,
          'credit', v_invoice.vat_amount,
          'description', 'Utgående moms kundfaktura ' || v_invoice.invoice_number
        )
      )
      ELSE '[]'::jsonb
    END
  );

  UPDATE public.customer_invoices
  SET payment_status = 'paid',
      paid_at = p_payment_date,
      updated_at = now()
  WHERE id = v_invoice.id
    AND user_id = v_user_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.book_customer_invoice_year_end_receivable_atomic(
  p_invoice_id uuid,
  p_fiscal_year integer,
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
  v_year_end date;
  v_output_vat_account text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.' USING ERRCODE = '28000';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas.' USING ERRCODE = '22023';
  END IF;
  IF p_fiscal_year IS NULL OR p_fiscal_year < 1900 OR p_fiscal_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.' USING ERRCODE = '22023';
  END IF;

  v_existing := public.customer_invoice_booking_replay(v_user_id, p_idempotency_key);
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_year_end := make_date(p_fiscal_year, 12, 31);

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

  IF v_invoice.payment_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Endast obetalda fakturor kan bokföras som kundfordran.'
      USING ERRCODE = '23514';
  END IF;

  IF v_invoice.vat_treatment = 'unknown' THEN
    RAISE EXCEPTION 'Momsstatus är osäker. SoloLedger kan inte bokföra kundfordran vid årsskifte förrän momsfakta är klara.'
      USING ERRCODE = '23514';
  END IF;

  IF v_invoice.invoice_date > v_year_end OR v_invoice.service_date > v_year_end THEN
    RAISE EXCEPTION 'Fakturan hör inte till räkenskapsår %.',
      p_fiscal_year
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = p_fiscal_year
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      p_fiscal_year
      USING ERRCODE = '23514';
  END IF;

  IF v_invoice.vat_amount > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, ARRAY[v_year_end]::date[]);
    IF EXISTS (
      SELECT 1
      FROM public.vat_periods vp
      WHERE vp.user_id = v_user_id
        AND vp.source = 'sololedger'
        AND v_year_end BETWEEN vp.period_start AND vp.period_end
        AND vp.status IN ('closed', 'declared')
    ) THEN
      RAISE EXCEPTION 'Årets sista momsperiod är redan stängd eller deklarerad. Kundfordran kan inte bokföras automatiskt.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_output_vat_account := public.customer_invoice_output_vat_account(v_invoice.vat_rate);
  IF v_invoice.vat_treatment = 'taxable' AND v_output_vat_account IS NULL THEN
    RAISE EXCEPTION 'Kundfakturans momssats stöds inte för svensk försäljning.'
      USING ERRCODE = '23514';
  END IF;

  RETURN public.insert_customer_invoice_transaction(
    v_user_id,
    v_invoice,
    'year_end_receivable',
    v_year_end,
    p_fiscal_year,
    p_idempotency_key,
    'Kundfordran vid bokslut: ' || v_invoice.invoice_number || ' - ' || v_invoice.customer_name,
    jsonb_build_array(
      jsonb_build_object(
        'account_number', '1510',
        'debit', v_invoice.gross_amount,
        'credit', 0,
        'description', 'Kundfordran ' || v_invoice.invoice_number
      ),
      jsonb_build_object(
        'account_number', '3010',
        'debit', 0,
        'credit', v_invoice.net_amount,
        'description', 'Försäljning kundfaktura ' || v_invoice.invoice_number
      )
    )
    ||
    CASE
      WHEN v_invoice.vat_amount > 0 THEN jsonb_build_array(
        jsonb_build_object(
          'account_number', v_output_vat_account,
          'debit', 0,
          'credit', v_invoice.vat_amount,
          'description', 'Utgående moms kundfaktura ' || v_invoice.invoice_number
        )
      )
      ELSE '[]'::jsonb
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_customer_invoice_receivable_atomic(
  p_invoice_id uuid,
  p_payment_date date,
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
  v_receivable public.customer_invoice_bookings%ROWTYPE;
  v_result jsonb;
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

  IF v_invoice.payment_status <> 'unpaid' THEN
    RAISE EXCEPTION 'Kundfakturan är inte obetald.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_receivable
  FROM public.customer_invoice_bookings
  WHERE invoice_id = v_invoice.id
    AND user_id = v_user_id
    AND booking_kind = 'year_end_receivable'
  ORDER BY booking_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kundfakturan är inte bokförd som kundfordran. Använd vanlig betalningsbokning om betalningen sker samma år.'
      USING ERRCODE = '23514';
  END IF;

  IF p_payment_date <= v_receivable.booking_date THEN
    RAISE EXCEPTION 'Betalningsdatumet måste ligga efter bokslutsbokningen.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from p_payment_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_payment_date)::int
      USING ERRCODE = '23514';
  END IF;

  v_result := public.insert_customer_invoice_transaction(
    v_user_id,
    v_invoice,
    'receivable_settlement',
    p_payment_date,
    extract(year from p_payment_date)::int,
    p_idempotency_key,
    'Betalning av bokslutsförd kundfordran: ' || v_invoice.invoice_number || ' - ' || v_invoice.customer_name,
    jsonb_build_array(
      jsonb_build_object(
        'account_number', '1930',
        'debit', v_invoice.gross_amount,
        'credit', 0,
        'description', 'Betalning kundfordran ' || v_invoice.invoice_number
      ),
      jsonb_build_object(
        'account_number', '1510',
        'debit', 0,
        'credit', v_invoice.gross_amount,
        'description', 'Reglerad kundfordran ' || v_invoice.invoice_number
      )
    )
  );

  UPDATE public.customer_invoices
  SET payment_status = 'paid',
      paid_at = p_payment_date,
      updated_at = now()
  WHERE id = v_invoice.id
    AND user_id = v_user_id;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_year_atomic(
  p_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_closed_at timestamptz;
  v_open_vat_period record;
  v_unhandled_invoice record;
  v_year_end date;
  v_unclassified_negative_bank numeric := 0;
  v_balance_diff numeric := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du måste vara inloggad för att låsa ett räkenskapsår.';
  END IF;

  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.';
  END IF;

  v_year_end := make_date(p_year, 12, 31);

  SELECT cy.closed_at
    INTO v_existing_closed_at
  FROM public.closed_years cy
  WHERE cy.user_id = v_user_id
    AND cy.year = p_year
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'År % är redan låst.', p_year;
  END IF;

  SELECT
    vp.id,
    vp.period_start,
    vp.period_end,
    vp.period_type
    INTO v_open_vat_period
  FROM public.vat_periods vp
  WHERE vp.user_id = v_user_id
    AND vp.source = 'sololedger'
    AND vp.status = 'open'
    AND vp.period_end >= make_date(p_year, 1, 1)
    AND vp.period_end < make_date(p_year + 1, 1, 1)
  ORDER BY vp.period_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom momsperioden % – % fortfarande är öppen.',
      p_year,
      v_open_vat_period.period_start,
      v_open_vat_period.period_end;
  END IF;

  SELECT
    ci.id,
    ci.invoice_number,
    ci.vat_treatment
    INTO v_unhandled_invoice
  FROM public.customer_invoices ci
  WHERE ci.user_id = v_user_id
    AND ci.payment_status = 'unpaid'
    AND ci.invoice_date <= v_year_end
    AND ci.service_date <= v_year_end
    AND ci.vat_treatment = 'unknown'
  ORDER BY ci.invoice_date, ci.invoice_number
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom kundfaktura % har osäker momsstatus. Slutför momsfakta eller hantera fakturan innan årslås.',
      p_year,
      v_unhandled_invoice.invoice_number;
  END IF;

  SELECT
    ci.id,
    ci.invoice_number,
    ci.vat_treatment
    INTO v_unhandled_invoice
  FROM public.customer_invoices ci
  WHERE ci.user_id = v_user_id
    AND ci.payment_status = 'unpaid'
    AND ci.invoice_date <= v_year_end
    AND ci.service_date <= v_year_end
    AND ci.vat_treatment <> 'unknown'
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_invoice_bookings cib
      WHERE cib.user_id = ci.user_id
        AND cib.invoice_id = ci.id
        AND cib.booking_kind = 'year_end_receivable'
        AND cib.fiscal_year = p_year
    )
  ORDER BY ci.invoice_date, ci.invoice_number
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom kundfaktura % är obetald och ännu inte bokförd som kundfordran per 31/12.',
      p_year,
      v_unhandled_invoice.invoice_number;
  END IF;

  WITH account_balances AS (
    SELECT
      je.account_number,
      round(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)), 2)::numeric AS balance,
      substring(je.account_number from 1 for 1) AS account_class,
      CASE
        WHEN je.account_number ~ '^[0-9]{4}$' THEN je.account_number::integer
        ELSE NULL
      END AS account_number_int
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date <= v_year_end
    GROUP BY je.account_number
  ),
  sums AS (
    SELECT
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1000 AND 1099), 0) AS raw_b1,
      coalesce(sum(balance) FILTER (
        WHERE account_number_int BETWEEN 1110 AND 1119
           OR account_number_int BETWEEN 1150 AND 1159
      ), 0) AS raw_b2,
      coalesce(sum(balance) FILTER (
        WHERE account_number_int BETWEEN 1130 AND 1139
           OR account_number_int BETWEEN 1180 AND 1189
      ), 0) AS raw_b3,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1220 AND 1249), 0) AS raw_b4,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1300 AND 1399), 0) AS raw_b5,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1400 AND 1499), 0) AS raw_b6,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1500 AND 1599), 0) AS raw_b7,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 1600 AND 1899), 0) AS raw_b8,
      coalesce(sum(greatest(balance, 0)) FILTER (WHERE account_number_int BETWEEN 1900 AND 1999), 0) AS b9,
      coalesce(sum(-balance) FILTER (
        WHERE account_number_int BETWEEN 1900 AND 1999
          AND balance < -0.005
      ), 0) AS unclassified_negative_bank,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 2300 AND 2399), 0) AS raw_b13,
      coalesce(sum(balance) FILTER (
        WHERE account_number LIKE '261%'
           OR account_number LIKE '262%'
           OR account_number LIKE '263%'
           OR account_number LIKE '264%'
           OR account_number LIKE '265%'
           OR account_number LIKE '266%'
           OR account_number LIKE '271%'
           OR account_number LIKE '273%'
      ), 0) AS tax_raw,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 2440 AND 2449), 0) AS raw_b15,
      coalesce(sum(balance) FILTER (WHERE account_number_int BETWEEN 2900 AND 2999), 0) AS raw_b16,
      coalesce(sum(balance) FILTER (WHERE account_number = '2010'), 0) AS balance_2010,
      coalesce(sum(balance) FILTER (WHERE account_number = '2019'), 0) AS balance_2019,
      coalesce(sum(balance) FILTER (WHERE account_number IN ('2011', '2012', '2013', '2014')), 0) AS withdrawals,
      coalesce(sum(balance) FILTER (WHERE account_number IN ('2017', '2018')), 0) AS owner_deposits_raw,
      coalesce(sum(-balance) FILTER (
        WHERE account_class IN ('3', '4', '5', '6', '7', '8')
          AND account_number !~ '^899[0-9]$'
      ), 0) AS cumulative_result
    FROM account_balances
  ),
  ne_rows AS (
    SELECT
      round(greatest(raw_b1, 0), 2) AS b1,
      round(greatest(raw_b2, 0), 2) AS b2,
      round(greatest(raw_b3, 0), 2) AS b3,
      round(greatest(raw_b4, 0), 2) AS b4,
      round(greatest(raw_b5, 0), 2) AS b5,
      round(greatest(raw_b6, 0), 2) AS b6,
      round(greatest(raw_b7, 0), 2) AS b7,
      round(greatest(raw_b8 + greatest(tax_raw, 0), 0), 2) AS b8,
      round(greatest(b9, 0), 2) AS b9,
      round(
        (-balance_2010 - balance_2019)
        + cumulative_result
        + (-owner_deposits_raw)
        - withdrawals,
        2
      ) AS b10_total,
      round(greatest(-raw_b13, 0), 2) AS b13,
      round(greatest(-tax_raw, 0), 2) AS b14,
      round(greatest(-raw_b15, 0), 2) AS b15,
      round(greatest(-raw_b16, 0), 2) AS b16,
      round(unclassified_negative_bank, 2) AS unclassified_negative_bank
    FROM sums
  )
  SELECT
    coalesce(unclassified_negative_bank, 0),
    round(
      coalesce(b1, 0) + coalesce(b2, 0) + coalesce(b3, 0) + coalesce(b4, 0)
      + coalesce(b5, 0) + coalesce(b6, 0) + coalesce(b7, 0)
      + coalesce(b8, 0) + coalesce(b9, 0)
      - (
        coalesce(b10_total, 0) + coalesce(b13, 0) + coalesce(b14, 0)
        + coalesce(b15, 0) + coalesce(b16, 0)
      ),
      2
    )
    INTO v_unclassified_negative_bank, v_balance_diff
  FROM ne_rows;

  IF coalesce(v_unclassified_negative_bank, 0) > 1 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom kassa/bank har negativt oklassat saldo (% kr). Stäm av 19xx och bokför/klassificera eventuell kredit eller skuld först.',
      p_year,
      to_char(v_unclassified_negative_bank, 'FM999G999G999G990D00');
  END IF;

  IF abs(coalesce(v_balance_diff, 0)) > 1 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom balansräkningen inte balanserar (differens % kr).',
      p_year,
      to_char(v_balance_diff, 'FM999G999G999G990D00');
  END IF;

  BEGIN
    INSERT INTO public.closed_years (
      user_id,
      year
    )
    VALUES (
      v_user_id,
      p_year
    )
    RETURNING closed_at
      INTO v_existing_closed_at;

  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'År % är redan låst.', p_year;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'year', p_year,
    'closed_at', v_existing_closed_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
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

  DELETE FROM public.tax_account_movements WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_movements = ROW_COUNT;

  DELETE FROM public.tax_account_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_events = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = p_user_id;

  DELETE FROM public.vat_v2_booking_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_v2_booking_idempotency = ROW_COUNT;

  DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoice_bookings = ROW_COUNT;

  DELETE FROM public.customer_invoices WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoices = ROW_COUNT;

  DELETE FROM public.vat_audit_snapshots WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_audit_snapshots = ROW_COUNT;

  DELETE FROM public.vat_periods WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_vat_periods = ROW_COUNT;

  DELETE FROM public.company_payment_account_roles WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_company_payment_account_roles = ROW_COUNT;

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
      'customer_invoice_bookings', v_customer_invoice_bookings,
      'customer_invoices', v_customer_invoices,
      'tax_account_movements', v_tax_account_movements,
      'tax_account_events', v_tax_account_events,
      'vat_v2_booking_idempotency', v_vat_v2_booking_idempotency,
      'vat_audit_snapshots', v_vat_audit_snapshots,
      'vat_periods', v_vat_periods,
      'company_payment_account_roles', v_company_payment_account_roles,
      'journal_entries', v_journal_entries,
      'transactions', v_transactions,
      'favorites', v_favorites,
      'import_batches', v_import_batches,
      'accounts', v_accounts,
      'closed_years', v_closed_years,
      'ver_nr_sequences', v_ver_nr_sequences,
      'profiles', v_profiles
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_invoice_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_invoice_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_invoice_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_invoice_atomic(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.record_customer_invoice_payment_atomic(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_customer_invoice_payment_atomic(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_customer_invoice_payment_atomic(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_customer_invoice_payment_atomic(uuid, date, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.book_customer_invoice_year_end_receivable_atomic(uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_customer_invoice_year_end_receivable_atomic(uuid, integer, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_customer_invoice_year_end_receivable_atomic(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_customer_invoice_year_end_receivable_atomic(uuid, integer, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.settle_customer_invoice_receivable_atomic(uuid, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_customer_invoice_receivable_atomic(uuid, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.settle_customer_invoice_receivable_atomic(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_customer_invoice_receivable_atomic(uuid, date, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.customer_invoice_booking_replay(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_invoice_booking_replay(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.customer_invoice_booking_replay(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.customer_invoice_booking_replay(uuid, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.customer_invoice_booking_replay(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.insert_customer_invoice_transaction(uuid, public.customer_invoices, text, date, integer, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_customer_invoice_transaction(uuid, public.customer_invoices, text, date, integer, uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.insert_customer_invoice_transaction(uuid, public.customer_invoices, text, date, integer, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.insert_customer_invoice_transaction(uuid, public.customer_invoices, text, date, integer, uuid, text, jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.insert_customer_invoice_transaction(uuid, public.customer_invoices, text, date, integer, uuid, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.customer_invoice_output_vat_account(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_invoice_output_vat_account(numeric) FROM anon;
REVOKE ALL ON FUNCTION public.customer_invoice_output_vat_account(numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.customer_invoice_output_vat_account(numeric) TO postgres;
GRANT EXECUTE ON FUNCTION public.customer_invoice_output_vat_account(numeric) TO service_role;

REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer) TO service_role;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role;

COMMENT ON FUNCTION public.create_customer_invoice_atomic(jsonb) IS
  'Registers external Swedish SEK customer invoice facts without creating bookkeeping journal entries.';

COMMENT ON FUNCTION public.record_customer_invoice_payment_atomic(uuid, date, uuid) IS
  'Books full same-year customer invoice payment as ordinary cash-method sale and marks the invoice paid.';

COMMENT ON FUNCTION public.book_customer_invoice_year_end_receivable_atomic(uuid, integer, uuid) IS
  'Books an unpaid external customer invoice as a 31/12 year-end receivable with 1510, income, and output VAT when applicable.';

COMMENT ON FUNCTION public.settle_customer_invoice_receivable_atomic(uuid, date, uuid) IS
  'Settles a year-end booked customer receivable with 1930/1510 and no duplicate income or output VAT.';

COMMENT ON FUNCTION public.close_year_atomic(integer) IS
  'Atomically locks a bookkeeping year for the authenticated user. Blocks open SoloLedger VAT periods, unhandled unpaid customer invoices, NE imbalance, or unresolved negative 19xx balances.';

COMMIT;
