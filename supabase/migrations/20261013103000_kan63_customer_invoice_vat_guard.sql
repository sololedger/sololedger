-- KAN-63: prevent ordinary Swedish customer invoices from using taxable VAT
-- when the company profile says domestic Swedish sales are exempt or unclear,
-- while preserving the policy snapshot that was valid when invoice VAT facts
-- were last explicitly validated.
-- Built from verified matching Staging/Production live definitions on 2026-10-13.

ALTER TABLE public.customer_invoices
  ADD COLUMN vat_policy_snapshot_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN vat_policy_vat_status text,
  ADD COLUMN vat_policy_domestic_sales_vat_treatment text,
  ADD COLUMN vat_policy_captured_at timestamptz,
  ADD COLUMN vat_policy_source text NOT NULL DEFAULT 'legacy';

ALTER TABLE public.customer_invoices
  ADD CONSTRAINT customer_invoices_vat_policy_snapshot_status_check
  CHECK (
    vat_policy_snapshot_status IN (
      'captured',
      'missing',
      'manually_verified'
    )
  ),
  ADD CONSTRAINT customer_invoices_vat_policy_vat_status_check
  CHECK (
    vat_policy_vat_status IS NULL
    OR vat_policy_vat_status IN ('registered', 'not_registered', 'unknown')
  ),
  ADD CONSTRAINT customer_invoices_vat_policy_domestic_treatment_check
  CHECK (
    vat_policy_domestic_sales_vat_treatment IS NULL
    OR vat_policy_domestic_sales_vat_treatment IN (
      'taxable',
      'small_business_exempt',
      'mixed',
      'exempt_other',
      'unknown'
    )
  ),
  ADD CONSTRAINT customer_invoices_vat_policy_source_check
  CHECK (
    vat_policy_source IN (
      'create',
      'vat_edit',
      'manual_legacy_verification',
      'legacy'
    )
  ),
  ADD CONSTRAINT customer_invoices_vat_policy_snapshot_consistency_check
  CHECK (
    (
      vat_policy_snapshot_status = 'missing'
      AND vat_policy_vat_status IS NULL
      AND vat_policy_domestic_sales_vat_treatment IS NULL
      AND vat_policy_captured_at IS NULL
      AND vat_policy_source = 'legacy'
    )
    OR (
      vat_policy_snapshot_status = 'captured'
      AND vat_policy_vat_status IS NOT NULL
      AND vat_policy_domestic_sales_vat_treatment IS NOT NULL
      AND vat_policy_captured_at IS NOT NULL
      AND vat_policy_source IN ('create', 'vat_edit')
      AND (
        vat_treatment <> 'taxable'
        OR (
          vat_policy_vat_status = 'registered'
          AND vat_policy_domestic_sales_vat_treatment = 'taxable'
        )
      )
    )
    OR (
      vat_policy_snapshot_status = 'manually_verified'
      AND vat_policy_vat_status IS NULL
      AND vat_policy_domestic_sales_vat_treatment IS NULL
      AND vat_policy_captured_at IS NOT NULL
      AND vat_policy_source = 'manual_legacy_verification'
    )
  );

COMMENT ON COLUMN public.customer_invoices.vat_policy_snapshot_status IS
  'KAN-63 VAT policy snapshot state. Existing rows default to missing; no historical profile is inferred.';
COMMENT ON COLUMN public.customer_invoices.vat_policy_vat_status IS
  'VAT registration status captured from profiles when invoice VAT facts were last validated by SoloLedger.';
COMMENT ON COLUMN public.customer_invoices.vat_policy_domestic_sales_vat_treatment IS
  'Domestic sales VAT treatment captured from profiles when invoice VAT facts were last validated by SoloLedger.';
COMMENT ON COLUMN public.customer_invoices.vat_policy_captured_at IS
  'Timestamp when invoice VAT facts were validated against profile policy. Manual legacy verification is reserved for a later policy decision.';
COMMENT ON COLUMN public.customer_invoices.vat_policy_source IS
  'How the invoice VAT policy snapshot was created. KAN-63 implements create/vat_edit only; manual legacy verification is reserved.';

CREATE OR REPLACE FUNCTION public.validate_customer_invoice_vat_policy_snapshot(
  p_user_id uuid,
  p_vat_treatment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vat_status text;
  v_domestic_sales_vat_treatment text;
BEGIN
  SELECT
    p.vat_status,
    p.domestic_sales_vat_treatment
  INTO
    v_vat_status,
    v_domestic_sales_vat_treatment
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Företagsprofil saknas. Kundfakturans moms kan inte bedömas säkert.'
      USING ERRCODE = '23514';
  END IF;

  IF p_vat_treatment = 'taxable' THEN
    IF v_vat_status IS DISTINCT FROM 'registered' THEN
      RAISE EXCEPTION 'Företagsprofilen tillåter inte svensk momspliktig kundfaktura. Uppdatera Profil om förhållandena har ändrats.'
        USING ERRCODE = '23514';
    END IF;

    IF v_domestic_sales_vat_treatment = 'taxable' THEN
      RETURN jsonb_build_object(
        'snapshot_status', 'captured',
        'vat_status', v_vat_status,
        'domestic_sales_vat_treatment', v_domestic_sales_vat_treatment,
        'captured_at', now()
      );
    END IF;

    IF v_domestic_sales_vat_treatment = 'small_business_exempt' THEN
      RAISE EXCEPTION 'Företagsprofilen säger att svensk försäljning är momsbefriad enligt småföretagarregeln. Vanlig svensk kundfaktura måste vara momsfri.'
        USING ERRCODE = '23514';
    END IF;

    IF v_domestic_sales_vat_treatment = 'exempt_other' THEN
      RAISE EXCEPTION 'Företagsprofilen säger att svensk försäljning är momsfri. Vanlig svensk kundfaktura måste vara momsfri.'
        USING ERRCODE = '23514';
    END IF;

    IF v_domestic_sales_vat_treatment IS NULL
       OR v_domestic_sales_vat_treatment IN ('unknown', 'mixed') THEN
      RAISE EXCEPTION 'Företagsprofilen saknar säker momsregel för vanlig svensk kundfaktura. SoloLedger gissar inte moms.'
        USING ERRCODE = '23514';
    END IF;

    RAISE EXCEPTION 'Företagsprofilen har en okänd momsstatus för vanlig svensk kundfaktura.'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'snapshot_status', 'captured',
    'vat_status', v_vat_status,
    'domestic_sales_vat_treatment', v_domestic_sales_vat_treatment,
    'captured_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_customer_invoice_vat_policy_snapshot(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_customer_invoice_vat_policy_snapshot(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.validate_customer_invoice_vat_policy_snapshot(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_customer_invoice_vat_policy_snapshot(uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_customer_invoice_vat_policy_snapshot(uuid, text) TO service_role;

COMMENT ON FUNCTION public.validate_customer_invoice_vat_policy_snapshot(uuid, text) IS
  'KAN-63 internal guard/snapshot builder: invoice VAT facts are validated against current profile policy before create or VAT-relevant edit.';

CREATE OR REPLACE FUNCTION public.assert_customer_invoice_booking_vat_policy_snapshot(
  p_invoice public.customer_invoices,
  p_booking_kind text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_booking_kind NOT IN ('payment_same_year', 'year_end_receivable') THEN
    RETURN;
  END IF;

  IF p_invoice.vat_treatment <> 'taxable' THEN
    RETURN;
  END IF;

  IF p_invoice.vat_policy_snapshot_status = 'captured'
     AND p_invoice.vat_policy_vat_status = 'registered'
     AND p_invoice.vat_policy_domestic_sales_vat_treatment = 'taxable'
     AND p_invoice.vat_policy_captured_at IS NOT NULL
     AND p_invoice.vat_policy_source IN ('create', 'vat_edit') THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Fakturan saknar sparat momsbeslut för svensk moms. Kontrollera fakturans momsfakta innan bokning.'
    USING ERRCODE = '23514';
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_customer_invoice_booking_vat_policy_snapshot(public.customer_invoices, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_customer_invoice_booking_vat_policy_snapshot(public.customer_invoices, text) FROM anon;
REVOKE ALL ON FUNCTION public.assert_customer_invoice_booking_vat_policy_snapshot(public.customer_invoices, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_customer_invoice_booking_vat_policy_snapshot(public.customer_invoices, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.assert_customer_invoice_booking_vat_policy_snapshot(public.customer_invoices, text) TO service_role;

COMMENT ON FUNCTION public.assert_customer_invoice_booking_vat_policy_snapshot(public.customer_invoices, text) IS
  'KAN-63 internal booking guard: taxable customer invoices must carry a valid saved VAT policy snapshot before income/VAT booking. Manual legacy verification is not enabled in KAN-63.';

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
  v_vat_policy jsonb;
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

  v_vat_policy := public.validate_customer_invoice_vat_policy_snapshot(
    v_user_id,
    v_vat_treatment
  );

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
    attachment_url,
    vat_policy_snapshot_status,
    vat_policy_vat_status,
    vat_policy_domestic_sales_vat_treatment,
    vat_policy_captured_at,
    vat_policy_source
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
    v_attachment_url,
    v_vat_policy->>'snapshot_status',
    v_vat_policy->>'vat_status',
    v_vat_policy->>'domestic_sales_vat_treatment',
    (v_vat_policy->>'captured_at')::timestamptz,
    'create'
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'payment_status', 'unpaid'
  );
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
  IF p_booking_kind IN ('payment_same_year', 'year_end_receivable') THEN
    PERFORM public.assert_customer_invoice_booking_vat_policy_snapshot(
      p_invoice,
      p_booking_kind
    );
  END IF;

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

CREATE OR REPLACE FUNCTION public.update_customer_invoice_unbooked_atomic(
  p_invoice_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_invoice public.customer_invoices%ROWTYPE;
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
  v_target_year integer;
  v_vat_policy jsonb;
  v_vat_relevant_changed boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.' USING ERRCODE = '28000';
  END IF;

  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Kundfaktura saknas.' USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Ogiltig fakturadata.' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Endast obetalda fakturor kan redigeras direkt.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_invoice_bookings cib
    WHERE cib.user_id = v_user_id
      AND cib.invoice_id = v_invoice.id
  ) THEN
    RAISE EXCEPTION 'Fakturan är redan bokförd. Uppgifter som påverkar bokföringen kan inte ändras direkt.'
      USING ERRCODE = '23514';
  END IF;

  v_invoice_number := btrim(coalesce(p_payload->>'invoice_number', v_invoice.invoice_number));
  v_customer_name := btrim(coalesce(p_payload->>'customer_name', v_invoice.customer_name));
  v_vat_treatment := coalesce(nullif(p_payload->>'vat_treatment', ''), v_invoice.vat_treatment);
  v_attachment_url := nullif(coalesce(p_payload->>'attachment_url', v_invoice.attachment_url), '');

  IF v_invoice_number = '' THEN
    RAISE EXCEPTION 'Fakturanummer saknas.' USING ERRCODE = '22023';
  END IF;

  IF v_customer_name = '' THEN
    RAISE EXCEPTION 'Kundnamn saknas.' USING ERRCODE = '22023';
  END IF;

  IF v_attachment_url IS NULL THEN
    RAISE EXCEPTION 'Fakturaunderlag krävs för kundfaktura.'
      USING ERRCODE = '22023';
  END IF;

  IF v_vat_treatment NOT IN ('taxable', 'exempt', 'unknown') THEN
    RAISE EXCEPTION 'Ogiltig momsstatus för kundfaktura.'
      USING ERRCODE = '22023';
  END IF;

  v_invoice_date := coalesce((p_payload->>'invoice_date')::date, v_invoice.invoice_date);
  v_service_date := coalesce((p_payload->>'service_date')::date, v_invoice.service_date);
  v_due_date := coalesce((p_payload->>'due_date')::date, v_invoice.due_date);
  v_gross_amount := round(coalesce((p_payload->>'gross_amount')::numeric, v_invoice.gross_amount), 2);

  IF v_gross_amount <= 0 THEN
    RAISE EXCEPTION 'Fakturabeloppet måste vara större än 0.'
      USING ERRCODE = '22023';
  END IF;

  v_target_year := public.customer_invoice_year_end_fiscal_year(v_invoice_date, v_service_date);
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = v_target_year
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      v_target_year
      USING ERRCODE = '23514';
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
    v_vat_rate := coalesce((p_payload->>'vat_rate')::numeric, v_invoice.vat_rate);
    IF v_vat_rate NOT IN (6, 12, 25) THEN
      RAISE EXCEPTION 'Momspliktig kundfaktura kräver momssats 6, 12 eller 25 procent.'
        USING ERRCODE = '22023';
    END IF;
    v_vat_amount := round((v_gross_amount - (v_gross_amount / (1 + v_vat_rate / 100)))::numeric, 2);
    v_net_amount := round((v_gross_amount - v_vat_amount)::numeric, 2);
  END IF;

  v_vat_relevant_changed :=
    v_vat_treatment IS DISTINCT FROM v_invoice.vat_treatment
    OR v_vat_rate IS DISTINCT FROM v_invoice.vat_rate
    OR v_gross_amount IS DISTINCT FROM v_invoice.gross_amount
    OR v_invoice_date IS DISTINCT FROM v_invoice.invoice_date
    OR v_service_date IS DISTINCT FROM v_invoice.service_date
    OR v_attachment_url IS DISTINCT FROM v_invoice.attachment_url;

  IF v_vat_relevant_changed THEN
    v_vat_policy := public.validate_customer_invoice_vat_policy_snapshot(
      v_user_id,
      v_vat_treatment
    );
  END IF;

  UPDATE public.customer_invoices
  SET invoice_number = v_invoice_number,
      customer_name = v_customer_name,
      invoice_date = v_invoice_date,
      service_date = v_service_date,
      due_date = v_due_date,
      gross_amount = v_gross_amount,
      net_amount = v_net_amount,
      vat_amount = v_vat_amount,
      vat_rate = v_vat_rate,
      vat_treatment = v_vat_treatment,
      attachment_url = v_attachment_url,
      vat_policy_snapshot_status = CASE
        WHEN v_vat_relevant_changed THEN v_vat_policy->>'snapshot_status'
        ELSE vat_policy_snapshot_status
      END,
      vat_policy_vat_status = CASE
        WHEN v_vat_relevant_changed THEN v_vat_policy->>'vat_status'
        ELSE vat_policy_vat_status
      END,
      vat_policy_domestic_sales_vat_treatment = CASE
        WHEN v_vat_relevant_changed THEN v_vat_policy->>'domestic_sales_vat_treatment'
        ELSE vat_policy_domestic_sales_vat_treatment
      END,
      vat_policy_captured_at = CASE
        WHEN v_vat_relevant_changed THEN (v_vat_policy->>'captured_at')::timestamptz
        ELSE vat_policy_captured_at
      END,
      vat_policy_source = CASE
        WHEN v_vat_relevant_changed THEN 'vat_edit'
        ELSE vat_policy_source
      END,
      updated_at = now()
  WHERE id = v_invoice.id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice.id,
    'payment_status', 'unpaid'
  );
END;
$function$;
