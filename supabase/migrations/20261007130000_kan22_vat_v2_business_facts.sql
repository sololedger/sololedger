-- KAN-22: preserve the business facts behind supported VAT V2 EU-service
-- reverse-charge bookings.
--
-- This is intentionally limited to the existing booking RPC. It preserves the
-- current accounting semantics and adds validation/persistence for the facts
-- that explain why the VAT treatment was selected.

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
  v_request_intent_canonical jsonb;
  v_request_canonical jsonb;
  v_legacy_request_canonical jsonb;
  v_result jsonb;
  v_date date;
  v_description text;
  v_taxable_base numeric;
  v_output_vat_amount numeric;
  v_deductible_input_vat_amount numeric;
  v_expected_vat_amount numeric;
  v_deduction_entitlement text;
  v_deductible_input_vat_report_field text;
  v_payment_account_role text;
  v_payment_account_number text;
  v_legacy_payment_account_number text;
  v_rule_version text;
  v_facts_version text;
  v_business_facts jsonb;
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

  v_deduction_entitlement :=
    coalesce(p_payload->>'deduction_entitlement', '');
  IF v_deduction_entitlement NOT IN ('full', 'none') THEN
    RAISE EXCEPTION 'Denna VAT V2-bokning stöder endast full eller ingen avdragsrätt.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_payload->>'acquisition_base_field', '') <> '21'
     OR coalesce(p_payload->>'output_vat_report_field', '') <> '30' THEN
    RAISE EXCEPTION 'VAT V2-rapportfälten måste använda 21 och 30 för detta flöde.'
      USING ERRCODE = '22023';
  END IF;

  v_deductible_input_vat_report_field :=
    nullif(p_payload->>'deductible_input_vat_report_field', '');
  IF v_deduction_entitlement = 'full'
     AND coalesce(v_deductible_input_vat_report_field, '') <> '48' THEN
    RAISE EXCEPTION 'Full avdragsrätt kräver momsrapportfält 48 för avdragsgill ingående moms.'
      USING ERRCODE = '22023';
  END IF;

  IF v_deduction_entitlement = 'none'
     AND v_deductible_input_vat_report_field IS NOT NULL THEN
    RAISE EXCEPTION 'Ingen avdragsrätt får inte använda momsrapportfält 48.'
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

  IF v_deduction_entitlement = 'full'
     AND v_deductible_input_vat_amount <> v_expected_vat_amount THEN
    RAISE EXCEPTION 'Full avdragsrätt kräver att avdragsgill ingående moms matchar beräknad utgående moms.'
      USING ERRCODE = '22023';
  END IF;

  IF v_deduction_entitlement = 'none'
     AND v_deductible_input_vat_amount <> 0 THEN
    RAISE EXCEPTION 'Ingen avdragsrätt kräver att avdragsgill ingående moms är 0.'
      USING ERRCODE = '22023';
  END IF;

  v_payment_account_role :=
    btrim(coalesce(p_payload->>'payment_account_role', ''));

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

  v_business_facts := p_payload->'business_facts';
  IF v_business_facts IS NULL OR jsonb_typeof(v_business_facts) <> 'object' THEN
    RAISE EXCEPTION 'Affärsfakta för momsbedömningen saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_business_facts->>'schemaVersion', '') <> 'vat-v2-business-facts-v1' THEN
    RAISE EXCEPTION 'Affärsfakta har en version som inte stöds.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_business_facts->>'customerCountry', '') <> 'SE'
     OR coalesce(v_business_facts->>'currency', '') <> 'SEK' THEN
    RAISE EXCEPTION 'Affärsfakta måste avse svenskt företag och SEK.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_business_facts->>'supplierCountry', '') NOT IN (
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
    'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
    'NL', 'PL', 'PT', 'RO', 'SI', 'SK'
  ) THEN
    RAISE EXCEPTION 'Leverantörsland i affärsfakta är ogiltigt för detta utlandsinköp.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_business_facts->>'purchaseClassification', '') NOT IN (
    'software_subscription_service',
    'other_service'
  )
     OR coalesce(v_business_facts->>'goodsOrService', '') <> 'service'
     OR coalesce(v_business_facts->>'supplierVatCharged', '') <> 'no' THEN
    RAISE EXCEPTION 'Affärsfakta matchar inte stödd EU-tjänst utan leverantörsmoms.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_business_facts->>'calculationRate', '') !~ '^-?\d+(\.\d+)?$'
     OR (v_business_facts->>'calculationRate')::numeric <> 25 THEN
    RAISE EXCEPTION 'Affärsfakta måste använda stödd svensk momssats 25 procent.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_business_facts->>'taxableBase', '') !~ '^-?\d+(\.\d+)?$'
     OR (v_business_facts->>'taxableBase')::numeric <> v_taxable_base THEN
    RAISE EXCEPTION 'Affärsfaktas inköpsbelopp matchar inte bokningsunderlaget.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce(v_business_facts->>'deductionEntitlement', '') <> v_deduction_entitlement
     OR coalesce(v_business_facts->>'deductionEntitlementSource', '') NOT IN (
       'company_profile_default',
       'transaction_override'
     ) THEN
    RAISE EXCEPTION 'Affärsfaktas avdragsrätt matchar inte bokningen.'
      USING ERRCODE = '22023';
  END IF;

  v_file_url := nullif(p_payload->>'file_url', '');

  IF v_payment_account_role IN (
    'business_payment_account',
    'owner_private_payment'
  ) THEN
    v_request_intent_canonical := jsonb_build_object(
      'date', v_date,
      'description', v_description,
      'treatment_code', 'EU_SERVICE_REVERSE_CHARGE',
      'calculation_rate', 25,
      'deduction_entitlement', v_deduction_entitlement,
      'taxable_base', v_taxable_base,
      'output_vat_amount', v_output_vat_amount,
      'deductible_input_vat_amount', v_deductible_input_vat_amount,
      'acquisition_base_field', '21',
      'output_vat_report_field', '30',
      'deductible_input_vat_report_field',
        v_deductible_input_vat_report_field,
      'payment_account_role', v_payment_account_role,
      'rule_version', v_rule_version,
      'facts_version', v_facts_version,
      'file_url', v_file_url
    );
  END IF;

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
    IF v_existing.request_canonical ? 'payment_account_role' THEN
      IF v_request_intent_canonical IS NULL
         OR (v_existing.request_canonical - 'payment_account_number')
            IS DISTINCT FROM v_request_intent_canonical THEN
        RAISE EXCEPTION 'Idempotency-nyckeln har redan använts med andra VAT V2-bokningsuppgifter.'
          USING ERRCODE = '23505';
      END IF;
    ELSE
      v_legacy_payment_account_number :=
        btrim(coalesce(p_payload->>'payment_account_number', ''));

      IF v_legacy_payment_account_number ~ '^[1-9]\d{3}$' THEN
        v_legacy_request_canonical := jsonb_build_object(
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
          'payment_account_number', v_legacy_payment_account_number,
          'rule_version', v_rule_version,
          'facts_version', v_facts_version,
          'file_url', v_file_url
        );

        IF v_existing.request_canonical IS DISTINCT FROM v_legacy_request_canonical THEN
          RAISE EXCEPTION 'Idempotency-nyckeln har redan använts med andra VAT V2-bokningsuppgifter.'
            USING ERRCODE = '23505';
        END IF;
      ELSIF v_request_intent_canonical IS NOT NULL THEN
        v_legacy_payment_account_number :=
          v_existing.request_canonical->>'payment_account_number';

        IF (
          v_payment_account_role = 'business_payment_account'
          AND left(v_legacy_payment_account_number, 1) <> '1'
        )
        OR (
          v_payment_account_role = 'owner_private_payment'
          AND left(v_legacy_payment_account_number, 1) <> '2'
        )
        OR (
          (v_existing.request_canonical - 'payment_account_number')
          IS DISTINCT FROM
          (v_request_intent_canonical - 'payment_account_role')
        ) THEN
          RAISE EXCEPTION 'Idempotency-nyckeln har redan använts med andra VAT V2-bokningsuppgifter.'
            USING ERRCODE = '23505';
        END IF;
      ELSE
        RAISE EXCEPTION 'Idempotency-nyckeln har redan använts med andra VAT V2-bokningsuppgifter.'
          USING ERRCODE = '23505';
      END IF;
    END IF;

    RETURN v_existing.result || jsonb_build_object('idempotent_replay', true);
  END IF;

  IF v_request_intent_canonical IS NULL THEN
    RAISE EXCEPTION 'Betalningsroll saknas eller är ogiltig för VAT V2-bokning.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload ? 'payment_account_number' THEN
    RAISE EXCEPTION 'VAT V2-betalningskonto ska härledas i databasen från sparad betalningsroll, inte skickas från klienten.'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.account_number
    INTO v_payment_account_number
  FROM public.company_payment_account_roles r
  WHERE r.user_id = v_user_id
    AND r.role = v_payment_account_role;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Betalningskonto för % är inte inställt.', v_payment_account_role
      USING ERRCODE = '23514';
  END IF;

  IF NOT public.payment_account_is_valid_for_payment_role(
    v_payment_account_role,
    v_payment_account_number
  ) THEN
    RAISE EXCEPTION 'Det konfigurerade betalningskontot är inte giltigt för VAT V2-bokning: %.', v_payment_account_number
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
    RAISE EXCEPTION 'Det konfigurerade betalningskontot finns inte i användarens kontoplan: %.', v_payment_account_number
      USING ERRCODE = '23503';
  END IF;

  v_request_canonical := v_request_intent_canonical
    || jsonb_build_object('payment_account_number', v_payment_account_number);

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
  VALUES (
    v_tx_id, v_ver_nr, '4535',
    v_taxable_base, 0, v_description, v_date, v_user_id
  );

  IF v_deduction_entitlement = 'full' THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES (
      v_tx_id, v_ver_nr, '2645',
      v_deductible_input_vat_amount, 0,
      'Beräknad ingående moms på ' || v_description,
      v_date, v_user_id
    );
  ELSE
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES (
      v_tx_id, v_ver_nr, '4535',
      v_output_vat_amount, 0,
      'Ej avdragsgill beräknad moms på ' || v_description,
      v_date, v_user_id
    );
  END IF;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number,
    debit, credit, description, date, user_id
  )
  VALUES
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
    'businessFacts', v_business_facts,
    'paymentAccountRole', v_payment_account_role,
    'paymentAccountNumber', v_payment_account_number,
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
        'reportField', v_deductible_input_vat_report_field,
        'entitlement', v_deduction_entitlement
      )
    ),
    'journal', jsonb_build_object(
      'rows', jsonb_build_array(
        jsonb_build_object(
          'role', 'acquisition_base',
          'accountNumber', '4535',
          'debit', v_taxable_base,
          'credit', 0
        )
      )
      || CASE
        WHEN v_deduction_entitlement = 'full' THEN jsonb_build_array(
          jsonb_build_object(
            'role', 'deductible_calculated_input_vat',
            'accountNumber', '2645',
            'debit', v_deductible_input_vat_amount,
            'credit', 0
          )
        )
        ELSE jsonb_build_array(
          jsonb_build_object(
            'role', 'non_deductible_calculated_vat_cost',
            'accountNumber', '4535',
            'debit', v_output_vat_amount,
            'credit', 0
          )
        )
      END
      || jsonb_build_array(
        jsonb_build_object(
          'role', 'calculated_output_vat',
          'accountNumber', '2614',
          'debit', 0,
          'credit', v_output_vat_amount
        ),
        jsonb_build_object(
          'role', 'payment_payable',
          'paymentAccountRole', v_payment_account_role,
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
      'deductibleInputVatReportField', v_deductible_input_vat_report_field
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
    'vat_audit_snapshot_id', v_audit_snapshot_id,
    'payment_account_role', v_payment_account_role,
    'payment_account_number', v_payment_account_number
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
  'Books supported VAT V2 EU service reverse-charge transactions atomically, including full-deduction and no-deduction profiles. New bookings resolve the payment account from the authenticated user''s central payment role and preserve the authoritative business facts behind the VAT decision; existing idempotency rows replay before mutable guards.';

