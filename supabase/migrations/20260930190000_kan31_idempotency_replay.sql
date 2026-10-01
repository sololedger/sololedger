-- KAN-31: durable idempotency and replay semantics for VAT V2,
-- VAT settlement, and tax-account movement flows.

CREATE TABLE IF NOT EXISTS public.vat_v2_booking_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  request_canonical jsonb NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  vat_audit_snapshot_id uuid NOT NULL REFERENCES public.vat_audit_snapshots(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vat_v2_booking_idempotency_user_key_unique
    UNIQUE (user_id, idempotency_key),
  CONSTRAINT vat_v2_booking_idempotency_transaction_unique
    UNIQUE (transaction_id),
  CONSTRAINT vat_v2_booking_idempotency_snapshot_unique
    UNIQUE (vat_audit_snapshot_id),
  CONSTRAINT vat_v2_booking_idempotency_request_object
    CHECK (jsonb_typeof(request_canonical) = 'object'),
  CONSTRAINT vat_v2_booking_idempotency_result_object
    CHECK (jsonb_typeof(result) = 'object'),
  CONSTRAINT vat_v2_booking_idempotency_success_result
    CHECK (coalesce((result->>'success')::boolean, false) IS TRUE)
);

COMMENT ON TABLE public.vat_v2_booking_idempotency IS
  'Durable replay ledger for VAT V2 booking idempotency. Application clients do not mutate this table directly.';

ALTER TABLE public.vat_v2_booking_idempotency ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.vat_v2_booking_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.vat_v2_booking_idempotency FROM anon;
REVOKE ALL ON TABLE public.vat_v2_booking_idempotency FROM authenticated;
GRANT ALL ON TABLE public.vat_v2_booking_idempotency TO postgres;
GRANT SELECT ON TABLE public.vat_v2_booking_idempotency TO service_role;

CREATE OR REPLACE FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_idempotency_key uuid;
  v_existing public.vat_v2_booking_idempotency%ROWTYPE;
  v_request_canonical jsonb;
  v_result jsonb;
  v_date date;
  v_description text;
  v_taxable_base numeric;
  v_output_vat_amount numeric;
  v_deductible_input_vat_amount numeric;
  v_expected_vat_amount numeric;
  v_payment_account_number text;
  v_rule_version text;
  v_facts_version text;
  v_file_url text;
  v_ver_nr integer;
  v_tx_id uuid;
  v_audit_snapshot_id uuid;
  v_snapshot jsonb;
  v_written_debit numeric;
  v_written_credit numeric;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Ogiltig VAT V2-payload.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'journal_rows' OR p_payload ? 'journalRows' THEN
    RAISE EXCEPTION 'VAT V2-journalrader ska härledas i databasen, inte skickas från klienten.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'audit_snapshot' OR p_payload ? 'auditSnapshot' THEN
    RAISE EXCEPTION 'VAT V2-audit snapshot ska härledas i databasen, inte skickas från klienten.'
      USING ERRCODE = '22023';
  END IF;

  IF nullif(p_payload->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltig idempotency-nyckel.'
      USING ERRCODE = '22023';
  END;

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

  IF coalesce(p_payload->>'treatment_code', '') <> 'EU_SERVICE_REVERSE_CHARGE' THEN
    RAISE EXCEPTION 'Denna VAT V2-bokning stöder endast EU_SERVICE_REVERSE_CHARGE.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'calculation_rate' IS NULL
     OR p_payload->>'calculation_rate' !~ '^-?\d+(\.\d+)?$'
     OR (p_payload->>'calculation_rate')::numeric <> 25 THEN
    RAISE EXCEPTION 'Denna VAT V2-bokning stöder endast 25 procent.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_payload->>'deduction_entitlement', '') <> 'full' THEN
    RAISE EXCEPTION 'Denna VAT V2-bokning stöder endast full avdragsrätt.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_payload->>'acquisition_base_field', '') <> '21'
     OR coalesce(p_payload->>'output_vat_report_field', '') <> '30'
     OR coalesce(p_payload->>'deductible_input_vat_report_field', '') <> '48' THEN
    RAISE EXCEPTION 'VAT V2-rapportfälten måste vara 21, 30 och 48 för detta flöde.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'taxable_base' IS NULL
     OR p_payload->>'taxable_base' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat beskattningsunderlag.'
      USING ERRCODE = '22023';
  END IF;
  v_taxable_base := (p_payload->>'taxable_base')::numeric;

  IF v_taxable_base <= 0 OR round(v_taxable_base, 2) <> v_taxable_base THEN
    RAISE EXCEPTION 'Beskattningsunderlaget måste vara ett positivt belopp avrundat till två decimaler.'
      USING ERRCODE = '22023';
  END IF;

  v_expected_vat_amount := round((v_taxable_base * 0.25)::numeric, 2);

  IF p_payload->>'output_vat_amount' IS NULL
     OR p_payload->>'output_vat_amount' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltig eller saknad beräknad utgående moms.'
      USING ERRCODE = '22023';
  END IF;
  v_output_vat_amount := (p_payload->>'output_vat_amount')::numeric;

  IF p_payload->>'deductible_input_vat_amount' IS NULL
     OR p_payload->>'deductible_input_vat_amount' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltig eller saknad avdragsgill beräknad ingående moms.'
      USING ERRCODE = '22023';
  END IF;
  v_deductible_input_vat_amount :=
    (p_payload->>'deductible_input_vat_amount')::numeric;

  IF v_output_vat_amount <> v_expected_vat_amount THEN
    RAISE EXCEPTION 'Beräknad utgående moms måste vara 25 procent av beskattningsunderlaget.'
      USING ERRCODE = '22023';
  END IF;

  IF v_deductible_input_vat_amount <> v_expected_vat_amount THEN
    RAISE EXCEPTION 'Full avdragsrätt kräver att avdragsgill ingående moms matchar beräknad utgående moms.'
      USING ERRCODE = '22023';
  END IF;

  v_payment_account_number :=
    btrim(coalesce(p_payload->>'payment_account_number', ''));

  IF v_payment_account_number !~ '^[1-9]\d{3}$' THEN
    RAISE EXCEPTION 'Betalnings-/skuldkonto måste vara ett fyrsiffrigt BAS-konto.'
      USING ERRCODE = '22023';
  END IF;

  v_rule_version := btrim(coalesce(p_payload->>'rule_version', ''));
  IF v_rule_version = '' THEN
    RAISE EXCEPTION 'VAT-regelversion saknas.'
      USING ERRCODE = '22023';
  END IF;

  v_facts_version := btrim(coalesce(p_payload->>'facts_version', ''));
  IF v_facts_version = '' THEN
    RAISE EXCEPTION 'VAT-faktaversion saknas.'
      USING ERRCODE = '22023';
  END IF;

  v_file_url := nullif(p_payload->>'file_url', '');

  v_request_canonical := jsonb_build_object(
    'date', v_date,
    'description', v_description,
    'treatment_code', 'EU_SERVICE_REVERSE_CHARGE',
    'calculation_rate', 25,
    'deduction_entitlement', 'full',
    'taxable_base', v_taxable_base,
    'output_vat_amount', v_output_vat_amount,
    'deductible_input_vat_amount', v_deductible_input_vat_amount,
    'acquisition_base_field', '21',
    'output_vat_report_field', '30',
    'deductible_input_vat_report_field', '48',
    'payment_account_number', v_payment_account_number,
    'rule_version', v_rule_version,
    'facts_version', v_facts_version,
    'file_url', v_file_url
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'sololedger:vat_v2_booking_idem:'
      || v_user_id::text
      || ':'
      || v_idempotency_key::text,
      0
    )
  );

  SELECT *
    INTO v_existing
  FROM public.vat_v2_booking_idempotency i
  WHERE i.user_id = v_user_id
    AND i.idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing.request_canonical IS DISTINCT FROM v_request_canonical THEN
      RAISE EXCEPTION 'Idempotency-nyckeln har redan använts med andra VAT V2-bokningsuppgifter.'
        USING ERRCODE = '23505';
    END IF;

    RETURN v_existing.result || jsonb_build_object('idempotent_replay', true);
  END IF;

  IF left(v_payment_account_number, 1) NOT IN ('1', '2') THEN
    RAISE EXCEPTION 'Betalnings-/skuldkonto måste vara ett balans-, skuld- eller eget kapitalkonto.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.payment_account_is_valid_for_vat_v2_payment(v_payment_account_number) THEN
    RAISE EXCEPTION 'Betalnings-/skuldkontot är inte semantiskt giltigt för VAT V2-bokning: %.', v_payment_account_number
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.user_id = v_user_id
      AND (
        a.debit_account = v_payment_account_number
        OR a.credit_account = v_payment_account_number
      )
  ) THEN
    RAISE EXCEPTION 'Betalnings-/skuldkontot finns inte i användarens kontoplan: %.', v_payment_account_number
      USING ERRCODE = '23503';
  END IF;

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

  SELECT public.get_next_ver_nr(v_user_id)
    INTO v_ver_nr;

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
    v_user_id,
    v_date,
    v_description,
    v_taxable_base,
    NULL,
    25,
    v_file_url,
    true,
    'vat_v2'
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number,
    debit, credit, description, date, user_id
  )
  VALUES
    (
      v_tx_id, v_ver_nr, '4535',
      v_taxable_base, 0, v_description, v_date, v_user_id
    ),
    (
      v_tx_id, v_ver_nr, '2645',
      v_deductible_input_vat_amount, 0,
      'Beräknad ingående moms på ' || v_description,
      v_date, v_user_id
    ),
    (
      v_tx_id, v_ver_nr, '2614',
      0, v_output_vat_amount,
      'Beräknad utgående moms på ' || v_description,
      v_date, v_user_id
    ),
    (
      v_tx_id, v_ver_nr, v_payment_account_number,
      0, v_taxable_base, v_description, v_date, v_user_id
    );

  SELECT
    coalesce(sum(coalesce(debit, 0)), 0)::numeric,
    coalesce(sum(coalesce(credit, 0)), 0)::numeric
  INTO
    v_written_debit,
    v_written_credit
  FROM public.journal_entries
  WHERE transaction_id = v_tx_id
    AND user_id = v_user_id;

  IF v_written_debit IS DISTINCT FROM v_written_credit THEN
    RAISE EXCEPTION 'VAT V2-journalen balanserar inte (debet %, kredit %).',
      v_written_debit, v_written_credit
      USING ERRCODE = '23514';
  END IF;

  IF v_written_debit IS DISTINCT FROM round((v_taxable_base + v_expected_vat_amount)::numeric, 2) THEN
    RAISE EXCEPTION 'VAT V2-journalens totalbelopp stämmer inte med förväntad avstämning.'
      USING ERRCODE = '23514';
  END IF;

  v_snapshot := jsonb_build_object(
    'schemaVersion', 'vat-audit-snapshot-v1',
    'journalPlanVersion', 'vat-journal-plan-v1',
    'treatmentCode', 'EU_SERVICE_REVERSE_CHARGE',
    'ruleVersion', v_rule_version,
    'factsVersion', v_facts_version,
    'vat', jsonb_build_object(
      'taxableBase', v_taxable_base,
      'calculationRate', 25,
      'acquisitionBaseField', '21',
      'outputVat', jsonb_build_object(
        'amount', v_output_vat_amount,
        'reportField', '30'
      ),
      'deductibleInputVat', jsonb_build_object(
        'amount', v_deductible_input_vat_amount,
        'reportField', '48',
        'entitlement', 'full'
      )
    ),
    'journal', jsonb_build_object(
      'rows', jsonb_build_array(
        jsonb_build_object(
          'role', 'acquisition_base',
          'accountNumber', '4535',
          'debit', v_taxable_base,
          'credit', 0
        ),
        jsonb_build_object(
          'role', 'deductible_calculated_input_vat',
          'accountNumber', '2645',
          'debit', v_deductible_input_vat_amount,
          'credit', 0
        ),
        jsonb_build_object(
          'role', 'calculated_output_vat',
          'accountNumber', '2614',
          'debit', 0,
          'credit', v_output_vat_amount
        ),
        jsonb_build_object(
          'role', 'payment_payable',
          'accountNumber', v_payment_account_number,
          'debit', 0,
          'credit', v_taxable_base
        )
      )
    ),
    'reconciliation', jsonb_build_object(
      'balanced', true,
      'totalDebit', v_written_debit,
      'totalCredit', v_written_credit,
      'acquisitionBase', v_taxable_base,
      'outputVat', v_output_vat_amount,
      'deductibleInputVat', v_deductible_input_vat_amount,
      'paymentPayable', v_taxable_base,
      'acquisitionBaseField', '21',
      'outputVatReportField', '30',
      'deductibleInputVatReportField', '48'
    )
  );

  INSERT INTO public.vat_audit_snapshots (
    user_id,
    transaction_id,
    schema_version,
    journal_plan_version,
    treatment_code,
    rule_version,
    facts_version,
    snapshot
  ) VALUES (
    v_user_id,
    v_tx_id,
    'vat-audit-snapshot-v1',
    'vat-journal-plan-v1',
    'EU_SERVICE_REVERSE_CHARGE',
    v_rule_version,
    v_facts_version,
    v_snapshot
  )
  RETURNING id INTO v_audit_snapshot_id;

  v_result := jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr,
    'vat_audit_snapshot_id', v_audit_snapshot_id
  );

  INSERT INTO public.vat_v2_booking_idempotency (
    user_id,
    idempotency_key,
    request_canonical,
    transaction_id,
    vat_audit_snapshot_id,
    result
  ) VALUES (
    v_user_id,
    v_idempotency_key,
    v_request_canonical,
    v_tx_id,
    v_audit_snapshot_id,
    v_result
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO service_role;

COMMENT ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) IS
  'Books supported VAT V2 EU service reverse-charge transactions atomically and replays exact same-key requests from a durable idempotency ledger before mutable booking guards.';

DO $$
DECLARE
  v_definition text;
  v_closed_year_guard text := $old$
  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from p_event_date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_event_date)::integer
      USING ERRCODE = '23514';
  END IF;

$old$;
  v_period_guard_marker text := $old$
  IF EXISTS (
    SELECT 1
    FROM public.vat_periods vp
$old$;
  v_period_guard_with_year text := $new$
  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from p_event_date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_event_date)::integer
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.vat_periods vp
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_vat_settlement_atomic(uuid,date,numeric,uuid)'::regprocedure
  )
    INTO v_definition;

  IF position(v_closed_year_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected VAT settlement closed-year guard was not found.';
  END IF;

  v_definition := replace(v_definition, v_closed_year_guard, '');

  IF position(v_period_guard_marker IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected VAT settlement replay insertion point was not found.';
  END IF;

  EXECUTE replace(v_definition, v_period_guard_marker, v_period_guard_with_year);
END;
$$;

COMMENT ON FUNCTION public.record_vat_settlement_atomic(uuid, date, numeric, uuid) IS
  'Records an evidenced Skatteverket VAT tax-account debit/credit for a declared SoloLedger VAT period. Exact same-key replays return before mutable closed-year and period-state guards.';

DO $$
DECLARE
  v_definition text;
  v_closed_year_guard text := $old$
  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from p_movement_date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_movement_date)::integer
      USING ERRCODE = '23514';
  END IF;

$old$;
  v_business_guard_marker text := $old$
  IF p_movement_kind IN ('business_to_tax_account', 'tax_account_to_business') THEN
$old$;
  v_business_guard_with_year text := $new$
  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from p_movement_date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_movement_date)::integer
      USING ERRCODE = '23514';
  END IF;

  IF p_movement_kind IN ('business_to_tax_account', 'tax_account_to_business') THEN
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.record_tax_account_movement_atomic(text,date,numeric,uuid,uuid)'::regprocedure
  )
    INTO v_definition;

  IF position(v_closed_year_guard IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected tax-account movement closed-year guard was not found.';
  END IF;

  v_definition := replace(v_definition, v_closed_year_guard, '');

  IF position(v_business_guard_marker IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected tax-account movement replay insertion point was not found.';
  END IF;

  EXECUTE replace(v_definition, v_business_guard_marker, v_business_guard_with_year);
END;
$$;

COMMENT ON FUNCTION public.record_tax_account_movement_atomic(text, date, numeric, uuid, uuid) IS
  'Records a SoloLedger-controlled tax-account money movement. Exact same-key replays return before mutable closed-year guards.';

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
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

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role;
