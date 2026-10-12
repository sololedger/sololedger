BEGIN;

CREATE OR REPLACE FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_idempotency_key uuid;
  v_existing_idempotency public.fixed_asset_acquisition_idempotency%ROWTYPE;
  v_date date;
  v_fiscal_year integer;
  v_description text;
  v_supplier_country text;
  v_payment_account_role text;
  v_payment_account_number text;
  v_vat_deduction_entitlement text;
  v_vat_rate numeric;
  v_useful_life_answer text;
  v_connection_assessment text;
  v_acquisition_group_id uuid;
  v_group_name text;
  v_connected_asset_ids uuid[] := ARRAY[]::uuid[];
  v_prior_asset_ids uuid[] := ARRAY[]::uuid[];
  v_prior_asset_count integer := 0;
  v_distinct_group_count integer := 0;
  v_planned_group_basis_amount numeric;
  v_prior_recorded_basis_amount numeric := 0;
  v_taxable_base_amount numeric;
  v_threshold_basis_amount numeric;
  v_supplier_vat_amount numeric;
  v_deductible_vat_amount numeric;
  v_non_deductible_vat_amount numeric;
  v_current_acquisition_basis_amount numeric;
  v_paid_amount numeric;
  v_expensed_amount numeric := 0;
  v_capitalized_amount numeric := 0;
  v_decision_type text;
  v_status text;
  v_tax_params jsonb;
  v_price_base_amount numeric;
  v_half_price_base_amount numeric;
  v_rule_version text;
  v_source_verified_on text;
  v_ver_nr integer;
  v_tx_id uuid;
  v_asset_id uuid;
  v_written_debit numeric;
  v_written_credit numeric;
  v_matching_vat_periods integer;
  v_blocking_vat_periods integer;
  v_reclassification_tx_id uuid;
  v_reclassification_ver_nr integer;
  v_reclassification_amount numeric := 0;
  v_prior_asset record;
  v_audit_snapshot jsonb;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Inventarieunderlaget är ogiltigt.'
      USING ERRCODE = '22023';
  END IF;

  IF nullif(p_payload->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas för inventarieköpet.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_idempotency_key := (p_payload->>'idempotency_key')::uuid;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltig idempotency-nyckel för inventarieköpet.'
      USING ERRCODE = '22023';
  END;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text), hashtext(v_idempotency_key::text));

  SELECT *
    INTO v_existing_idempotency
  FROM public.fixed_asset_acquisition_idempotency
  WHERE user_id = v_user_id
    AND idempotency_key = v_idempotency_key;

  IF FOUND THEN
    IF v_existing_idempotency.request_payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Idempotency-nyckeln har redan använts för ett annat inventarieköp.'
        USING ERRCODE = '23505';
    END IF;

    RETURN v_existing_idempotency.result || jsonb_build_object('idempotent_replay', true);
  END IF;

  IF p_payload->>'date' IS NULL
     OR p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat inköpsdatum.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_date := (p_payload->>'date')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltigt inköpsdatum: %.', p_payload->>'date'
      USING ERRCODE = '22023';
  END;

  v_fiscal_year := extract(year from v_date)::integer;
  v_tax_params := public.get_tax_rule_parameters_for_year(v_fiscal_year);
  v_price_base_amount := (v_tax_params->>'priceBaseAmount')::numeric;
  v_half_price_base_amount := (v_tax_params->>'halfPriceBaseAmount')::numeric;
  v_rule_version := v_tax_params->>'ruleVersion';
  v_source_verified_on := v_tax_params->>'sourceVerifiedOn';

  v_description := btrim(coalesce(p_payload->>'description', ''));
  IF v_description = '' THEN
    RAISE EXCEPTION 'Beskrivning saknas.'
      USING ERRCODE = '22023';
  END IF;

  v_supplier_country := upper(btrim(coalesce(p_payload->>'supplier_country', '')));
  IF v_supplier_country <> 'SE' THEN
    RAISE EXCEPTION 'Inventarieinköp av varor från utlandet stöds inte i KAN-36 V1. Bokningen stoppades.'
      USING ERRCODE = '23514';
  END IF;

  v_payment_account_role := btrim(coalesce(p_payload->>'payment_account_role', ''));
  v_payment_account_number := public.fixed_asset_payment_account(v_user_id, v_payment_account_role);

  v_vat_deduction_entitlement := btrim(coalesce(p_payload->>'vat_deduction_entitlement', ''));
  IF v_vat_deduction_entitlement = 'partial' THEN
    RAISE EXCEPTION 'Delvis momsavdragsrätt stöds inte i KAN-36 V1.'
      USING ERRCODE = '23514';
  END IF;

  IF v_vat_deduction_entitlement NOT IN ('full', 'none') THEN
    RAISE EXCEPTION 'Inventarieinköp stöder bara full eller ingen momsavdragsrätt i KAN-36 V1.'
      USING ERRCODE = '23514';
  END IF;

  IF p_payload->>'gross_amount' IS NULL
     OR p_payload->>'gross_amount' !~ '^\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Belopp inklusive moms saknas eller är ogiltigt.'
      USING ERRCODE = '22023';
  END IF;

  v_paid_amount := round((p_payload->>'gross_amount')::numeric, 2);
  IF v_paid_amount <= 0 THEN
    RAISE EXCEPTION 'Belopp inklusive moms måste vara större än 0.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'vat_rate' IS NULL
     OR p_payload->>'vat_rate' !~ '^\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Momssats för inventarieinköpet saknas eller är ogiltig.'
      USING ERRCODE = '22023';
  END IF;

  v_vat_rate := (p_payload->>'vat_rate')::numeric;
  IF v_vat_rate NOT IN (0, 6, 12, 25) THEN
    RAISE EXCEPTION 'Inventarieinköp stöder bara momssatserna 0, 6, 12 och 25 procent.'
      USING ERRCODE = '23514';
  END IF;

  IF v_vat_rate = 0 THEN
    v_taxable_base_amount := v_paid_amount;
  ELSE
    v_taxable_base_amount := round(v_paid_amount / (1 + v_vat_rate / 100), 2);
  END IF;
  v_supplier_vat_amount := round(v_paid_amount - v_taxable_base_amount, 2);

  IF p_payload ? 'taxable_base_amount' THEN
    IF p_payload->>'taxable_base_amount' !~ '^\d+(\.\d+)?$'
       OR round((p_payload->>'taxable_base_amount')::numeric, 2) IS DISTINCT FROM v_taxable_base_amount THEN
      RAISE EXCEPTION 'Belopp exklusive moms stämmer inte med belopp inklusive moms och vald momssats.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_payload ? 'supplier_vat_amount' THEN
    IF p_payload->>'supplier_vat_amount' !~ '^\d+(\.\d+)?$'
       OR round((p_payload->>'supplier_vat_amount')::numeric, 2) IS DISTINCT FROM v_supplier_vat_amount THEN
      RAISE EXCEPTION 'Momsbeloppet stämmer inte med belopp inklusive moms och vald momssats.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_connection_assessment := btrim(coalesce(p_payload->>'connection_assessment', ''));
  IF v_connection_assessment = 'uncertain' THEN
    RAISE EXCEPTION 'SoloLedger kan inte avgöra om köpet hör ihop med andra inventarier. Välj fristående eller koppla det till en anskaffningsgrupp.'
      USING ERRCODE = '23514';
  END IF;

  IF v_connection_assessment NOT IN ('standalone', 'connected') THEN
    RAISE EXCEPTION 'Ange om utrustningsköpet är fristående eller hör ihop med en anskaffningsgrupp.'
      USING ERRCODE = '23514';
  END IF;

  v_group_name := nullif(btrim(coalesce(p_payload->>'acquisition_group_name', '')), '');

  IF nullif(p_payload->>'acquisition_group_id', '') IS NOT NULL THEN
    BEGIN
      v_acquisition_group_id := (p_payload->>'acquisition_group_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Ogiltig anskaffningsgrupp.'
        USING ERRCODE = '22023';
    END;
  END IF;

  IF p_payload ? 'connected_asset_ids'
     AND jsonb_typeof(p_payload->'connected_asset_ids') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Kopplade inventarier är ogiltiga.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    SELECT coalesce(array_agg(DISTINCT value::uuid), ARRAY[]::uuid[])
      INTO v_connected_asset_ids
    FROM jsonb_array_elements_text(coalesce(p_payload->'connected_asset_ids', '[]'::jsonb)) AS ids(value);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Kopplade inventarier innehåller ogiltigt id.'
      USING ERRCODE = '22023';
  END;

  IF v_vat_deduction_entitlement = 'full' THEN
    v_deductible_vat_amount := v_supplier_vat_amount;
    v_non_deductible_vat_amount := 0;
  ELSE
    v_deductible_vat_amount := 0;
    v_non_deductible_vat_amount := v_supplier_vat_amount;
  END IF;

  v_current_acquisition_basis_amount := round(v_taxable_base_amount + v_non_deductible_vat_amount, 2);

  IF p_payload->>'planned_group_basis_amount' IS NOT NULL THEN
    IF p_payload->>'planned_group_basis_amount' !~ '^\d+(\.\d+)?$' THEN
      RAISE EXCEPTION 'Känt samlat anskaffningsvärde är ogiltigt.'
        USING ERRCODE = '22023';
    END IF;
    v_planned_group_basis_amount := round((p_payload->>'planned_group_basis_amount')::numeric, 2);
    IF v_planned_group_basis_amount < v_current_acquisition_basis_amount THEN
      RAISE EXCEPTION 'Känt samlat anskaffningsvärde kan inte vara lägre än aktuellt inköps anskaffningsvärde.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_connection_assessment = 'standalone' THEN
    IF v_acquisition_group_id IS NOT NULL
       OR cardinality(v_connected_asset_ids) > 0
       OR v_planned_group_basis_amount IS NOT NULL THEN
      RAISE EXCEPTION 'Ett fristående inventarieköp får inte kopplas till en anskaffningsgrupp.'
        USING ERRCODE = '23514';
    END IF;
    v_threshold_basis_amount := v_current_acquisition_basis_amount;
  ELSE
    IF v_group_name IS NULL THEN
      v_group_name := v_description;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = v_fiscal_year
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.', v_fiscal_year
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.lock_vat_months(v_user_id, ARRAY[v_date]::date[]);

  IF v_connection_assessment = 'connected' THEN
    PERFORM 1
    FROM public.fixed_assets fa
    WHERE fa.user_id = v_user_id
      AND fa.id = ANY (v_connected_asset_ids)
      AND fa.fiscal_year = v_fiscal_year
      AND fa.status <> 'retired'
      AND fa.acquisition_date <= v_date
    FOR UPDATE;

    SELECT count(*)::integer
      INTO v_prior_asset_count
    FROM public.fixed_assets fa
    WHERE fa.user_id = v_user_id
      AND fa.id = ANY (v_connected_asset_ids)
      AND fa.fiscal_year = v_fiscal_year
      AND fa.status <> 'retired'
      AND fa.acquisition_date <= v_date;

    IF v_prior_asset_count <> cardinality(v_connected_asset_ids) THEN
      RAISE EXCEPTION 'Ett eller flera kopplade inventarier saknas, är avslutade eller hör till ett annat år.'
        USING ERRCODE = '23514';
    END IF;

    SELECT count(DISTINCT fa.acquisition_group_id)::integer
      INTO v_distinct_group_count
    FROM public.fixed_assets fa
    WHERE fa.user_id = v_user_id
      AND fa.id = ANY (v_connected_asset_ids)
      AND fa.acquisition_group_id IS NOT NULL;

    IF v_distinct_group_count > 1 THEN
      RAISE EXCEPTION 'De valda inventarierna hör redan till olika anskaffningsgrupper.'
        USING ERRCODE = '23514';
    END IF;

    IF v_acquisition_group_id IS NULL THEN
      SELECT fa.acquisition_group_id
        INTO v_acquisition_group_id
      FROM public.fixed_assets fa
      WHERE fa.user_id = v_user_id
        AND fa.id = ANY (v_connected_asset_ids)
        AND fa.acquisition_group_id IS NOT NULL
      LIMIT 1;
    END IF;

    IF v_acquisition_group_id IS NOT NULL THEN
      PERFORM 1
      FROM public.fixed_asset_acquisition_groups g
      WHERE g.id = v_acquisition_group_id
        AND g.user_id = v_user_id
        AND g.fiscal_year = v_fiscal_year
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Anskaffningsgruppen saknas eller hör till ett annat år.'
          USING ERRCODE = '23514';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.fixed_assets fa
        WHERE fa.user_id = v_user_id
          AND fa.id = ANY (v_connected_asset_ids)
          AND fa.acquisition_group_id IS NOT NULL
          AND fa.acquisition_group_id <> v_acquisition_group_id
      ) THEN
        RAISE EXCEPTION 'Valda inventarier kan inte kopplas till en annan anskaffningsgrupp.'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      INSERT INTO public.fixed_asset_acquisition_groups (
        user_id,
        fiscal_year,
        name,
        rule_year,
        rule_version,
        price_base_amount,
        half_price_base_amount
      ) VALUES (
        v_user_id,
        v_fiscal_year,
        v_group_name,
        v_fiscal_year,
        v_rule_version,
        v_price_base_amount,
        v_half_price_base_amount
      )
      RETURNING id INTO v_acquisition_group_id;
    END IF;

    WITH locked_prior_assets AS (
      SELECT
        fa.id,
        fa.taxable_base_amount,
        fa.non_deductible_vat_amount
      FROM public.fixed_assets fa
      WHERE fa.user_id = v_user_id
        AND fa.fiscal_year = v_fiscal_year
        AND fa.status <> 'retired'
        AND (
          fa.acquisition_group_id = v_acquisition_group_id
          OR fa.id = ANY (v_connected_asset_ids)
        )
      FOR UPDATE
    )
    SELECT
      coalesce(array_agg(DISTINCT locked_prior_assets.id), ARRAY[]::uuid[]),
      round(coalesce(sum(locked_prior_assets.taxable_base_amount + locked_prior_assets.non_deductible_vat_amount), 0), 2)
    INTO
      v_prior_asset_ids,
      v_prior_recorded_basis_amount
    FROM locked_prior_assets;

    v_threshold_basis_amount := round(v_current_acquisition_basis_amount + v_prior_recorded_basis_amount, 2);
    IF v_planned_group_basis_amount IS NOT NULL THEN
      v_threshold_basis_amount := greatest(v_threshold_basis_amount, v_planned_group_basis_amount);
    END IF;
  END IF;

  IF v_threshold_basis_amount < v_half_price_base_amount THEN
    v_decision_type := 'immediate_expense_small_value';
    v_status := 'expensed';
    v_expensed_amount := v_current_acquisition_basis_amount;
  ELSE
    v_useful_life_answer := btrim(coalesce(p_payload->>'useful_life_answer', ''));
    IF v_useful_life_answer NOT IN ('max_three_years', 'more_than_three_years_or_unknown') THEN
      RAISE EXCEPTION 'Ange om utrustningen väntas användas högst tre år.'
        USING ERRCODE = '23514';
    END IF;

    IF v_useful_life_answer = 'max_three_years' THEN
      v_decision_type := 'immediate_expense_short_life';
      v_status := 'expensed';
      v_expensed_amount := v_current_acquisition_basis_amount;
    ELSE
      v_decision_type := 'capitalized';
      v_status := 'active';
      v_capitalized_amount := v_current_acquisition_basis_amount;
    END IF;
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE vp.status IN ('closed', 'declared'))::integer
  INTO
    v_matching_vat_periods,
    v_blocking_vat_periods
  FROM public.vat_periods vp
  WHERE vp.user_id = v_user_id
    AND vp.source = 'sololedger'
    AND v_date BETWEEN vp.period_start AND vp.period_end;

  IF v_matching_vat_periods > 1 THEN
    RAISE EXCEPTION
      'Flera överlappande SoloLedger-momsperioder matchar inköpsdatum %. Bokningen stoppades för manuell kontroll.',
      v_date
      USING ERRCODE = '23514';
  END IF;

  IF v_blocking_vat_periods > 0 THEN
    RAISE EXCEPTION
      'Momsperioden för inköpsdatum % är redan stängd eller deklarerad. Bokningen kan inte genomföras.',
      v_date
      USING ERRCODE = '23514';
  END IF;

  SELECT public.get_next_ver_nr(v_user_id) INTO v_ver_nr;
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
    v_paid_amount,
    NULL,
    v_vat_rate,
    nullif(p_payload->>'file_url', ''),
    true,
    'fixed_asset'
  )
  RETURNING id INTO v_tx_id;

  IF v_decision_type = 'capitalized' THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
    ) VALUES (
      v_tx_id, v_ver_nr, '1220', v_capitalized_amount, 0, v_description, v_date, v_user_id
    );
  ELSE
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
    ) VALUES (
      v_tx_id, v_ver_nr, '5410', v_expensed_amount, 0, v_description, v_date, v_user_id
    );
  END IF;

  IF v_deductible_vat_amount > 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
    ) VALUES (
      v_tx_id, v_ver_nr, '2641', v_deductible_vat_amount, 0,
      'Ingående moms på ' || v_description, v_date, v_user_id
    );
  END IF;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
  ) VALUES (
    v_tx_id, v_ver_nr, v_payment_account_number, 0, v_paid_amount, v_description, v_date, v_user_id
  );

  SELECT
    round(coalesce(sum(coalesce(debit, 0)), 0), 2),
    round(coalesce(sum(coalesce(credit, 0)), 0), 2)
  INTO v_written_debit, v_written_credit
  FROM public.journal_entries
  WHERE transaction_id = v_tx_id
    AND user_id = v_user_id;

  IF v_written_debit IS DISTINCT FROM v_written_credit THEN
    RAISE EXCEPTION 'Inventariejournalen balanserar inte (debet %, kredit %).',
      v_written_debit, v_written_credit
      USING ERRCODE = '23514';
  END IF;

  v_audit_snapshot := jsonb_build_object(
    'schemaVersion', 'fixed-asset-audit-v2',
    'rule', jsonb_build_object(
      'taxYear', v_fiscal_year,
      'ruleVersion', v_rule_version,
      'priceBaseAmount', v_price_base_amount,
      'halfPriceBaseAmount', v_half_price_base_amount,
      'sourceVerifiedOn', v_source_verified_on,
      'smallValueComparison', 'lt'
    ),
    'facts', jsonb_build_object(
      'supplierCountry', v_supplier_country,
      'grossAmount', v_paid_amount,
      'vatRate', v_vat_rate,
      'taxableBaseAmount', v_taxable_base_amount,
      'supplierVatAmount', v_supplier_vat_amount,
      'vatDeductionEntitlement', v_vat_deduction_entitlement,
      'deductibleVatAmount', v_deductible_vat_amount,
      'nonDeductibleVatAmount', v_non_deductible_vat_amount,
      'acquisitionBasisAmount', v_current_acquisition_basis_amount,
      'thresholdBasisAmount', v_threshold_basis_amount,
      'connectionAssessment', v_connection_assessment,
      'acquisitionGroupId', v_acquisition_group_id,
      'linkedAssetIds', to_jsonb(v_prior_asset_ids),
      'plannedGroupBasisAmount', v_planned_group_basis_amount,
      'usefulLifeAnswer', v_useful_life_answer,
      'paymentAccountRole', v_payment_account_role,
      'paymentAccountNumber', v_payment_account_number
    ),
    'decision', jsonb_build_object(
      'type', v_decision_type,
      'expensedAmount', v_expensed_amount,
      'capitalizedAmount', v_capitalized_amount
    ),
    'journal', jsonb_build_object(
      'transactionId', v_tx_id,
      'verNr', v_ver_nr,
      'debitTotal', v_written_debit,
      'creditTotal', v_written_credit
    )
  );

  INSERT INTO public.fixed_assets (
    user_id,
    name,
    acquisition_date,
    fiscal_year,
    supplier_country,
    connection_assessment,
    acquisition_group_id,
    naturally_connected,
    connected_acquisition_key,
    threshold_basis_amount,
    taxable_base_amount,
    supplier_vat_amount,
    deductible_vat_amount,
    non_deductible_vat_amount,
    expensed_amount,
    capitalized_amount,
    payment_account_role,
    payment_account_number,
    vat_deduction_entitlement,
    useful_life_answer,
    decision_type,
    status,
    acquisition_transaction_id,
    rule_year,
    rule_version,
    price_base_amount,
    half_price_base_amount,
    audit_snapshot
  ) VALUES (
    v_user_id,
    v_description,
    v_date,
    v_fiscal_year,
    v_supplier_country,
    v_connection_assessment,
    v_acquisition_group_id,
    v_connection_assessment = 'connected',
    CASE WHEN v_connection_assessment = 'connected' THEN v_acquisition_group_id::text ELSE NULL END,
    v_threshold_basis_amount,
    v_taxable_base_amount,
    v_supplier_vat_amount,
    v_deductible_vat_amount,
    v_non_deductible_vat_amount,
    v_expensed_amount,
    v_capitalized_amount,
    v_payment_account_role,
    v_payment_account_number,
    v_vat_deduction_entitlement,
    v_useful_life_answer,
    v_decision_type,
    v_status,
    v_tx_id,
    v_fiscal_year,
    v_rule_version,
    v_price_base_amount,
    v_half_price_base_amount,
    v_audit_snapshot
  )
  RETURNING id INTO v_asset_id;

  INSERT INTO public.fixed_asset_events (
    user_id, asset_id, transaction_id, event_type, event_date, fiscal_year, amount, audit_snapshot
  ) VALUES (
    v_user_id,
    v_asset_id,
    v_tx_id,
    'acquisition',
    v_date,
    v_fiscal_year,
    CASE WHEN v_decision_type = 'capitalized' THEN v_capitalized_amount ELSE v_expensed_amount END,
    v_audit_snapshot
  );

  IF v_decision_type = 'capitalized' THEN
    SELECT round(coalesce(sum(fa.expensed_amount), 0), 2)
      INTO v_reclassification_amount
    FROM public.fixed_assets fa
    WHERE fa.user_id = v_user_id
      AND fa.id = ANY (v_prior_asset_ids)
      AND fa.decision_type IN ('immediate_expense_small_value', 'immediate_expense_short_life')
      AND fa.status = 'expensed';

    IF v_reclassification_amount > 0 THEN
      SELECT public.get_next_ver_nr(v_user_id) INTO v_reclassification_ver_nr;
      IF v_reclassification_ver_nr IS NULL THEN
        RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för omklassning.';
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
        v_date,
        'Omklassning till inventarium: ' || v_group_name,
        v_reclassification_amount,
        NULL,
        0,
        true,
        'fixed_asset_reclassification'
      )
      RETURNING id INTO v_reclassification_tx_id;

      INSERT INTO public.journal_entries (
        transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
      ) VALUES
        (
          v_reclassification_tx_id, v_reclassification_ver_nr, '1220',
          v_reclassification_amount, 0,
          'Omklassning till inventarium: ' || v_group_name,
          v_date, v_user_id
        ),
        (
          v_reclassification_tx_id, v_reclassification_ver_nr, '5410',
          0, v_reclassification_amount,
          'Omklassning till inventarium: ' || v_group_name,
          v_date, v_user_id
        );

      FOR v_prior_asset IN
        SELECT *
        FROM public.fixed_assets fa
        WHERE fa.user_id = v_user_id
          AND fa.id = ANY (v_prior_asset_ids)
          AND fa.decision_type IN ('immediate_expense_small_value', 'immediate_expense_short_life')
          AND fa.status = 'expensed'
        FOR UPDATE
      LOOP
        UPDATE public.fixed_assets
        SET connection_assessment = 'connected',
            acquisition_group_id = v_acquisition_group_id,
            naturally_connected = true,
            connected_acquisition_key = v_acquisition_group_id::text,
            threshold_basis_amount = v_threshold_basis_amount,
            useful_life_answer = v_useful_life_answer,
            decision_type = 'capitalized',
            status = 'active',
            capitalized_amount = v_prior_asset.expensed_amount,
            expensed_amount = 0,
            audit_snapshot = audit_snapshot || jsonb_build_object(
              'reclassifiedBy', jsonb_build_object(
                'transactionId', v_reclassification_tx_id,
                'verNr', v_reclassification_ver_nr,
                'date', v_date,
                'reason', 'connected_acquisition_threshold_exceeded',
                'groupId', v_acquisition_group_id,
                'thresholdBasisAmount', v_threshold_basis_amount
              )
            )
        WHERE id = v_prior_asset.id;

        INSERT INTO public.fixed_asset_events (
          user_id, asset_id, transaction_id, event_type, event_date, fiscal_year, amount, audit_snapshot
        ) VALUES (
          v_user_id,
          v_prior_asset.id,
          v_reclassification_tx_id,
          'reclassification',
          v_date,
          v_fiscal_year,
          v_prior_asset.expensed_amount,
          jsonb_build_object(
            'schemaVersion', 'fixed-asset-reclassification-v1',
            'reason', 'connected_acquisition_threshold_exceeded',
            'assetId', v_prior_asset.id,
            'groupId', v_acquisition_group_id,
            'thresholdBasisAmount', v_threshold_basis_amount,
            'transactionId', v_reclassification_tx_id,
            'verNr', v_reclassification_ver_nr
          )
        );
      END LOOP;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'asset_id', v_asset_id,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr,
    'acquisition_group_id', v_acquisition_group_id,
    'reclassification_transaction_id', v_reclassification_tx_id,
    'reclassification_amount', v_reclassification_amount,
    'decision_type', v_decision_type,
    'status', v_status,
    'rule_year', v_fiscal_year,
    'rule_version', v_rule_version,
    'half_price_base_amount', v_half_price_base_amount,
    'gross_amount', v_paid_amount,
    'vat_rate', v_vat_rate,
    'taxable_base_amount', v_taxable_base_amount,
    'supplier_vat_amount', v_supplier_vat_amount,
    'expensed_amount', v_expensed_amount,
    'capitalized_amount', v_capitalized_amount,
    'deductible_vat_amount', v_deductible_vat_amount,
    'non_deductible_vat_amount', v_non_deductible_vat_amount,
    'threshold_basis_amount', v_threshold_basis_amount
  );

  INSERT INTO public.fixed_asset_acquisition_idempotency (
    user_id,
    idempotency_key,
    request_payload,
    result,
    transaction_id,
    asset_id
  ) VALUES (
    v_user_id,
    v_idempotency_key,
    p_payload,
    v_result,
    v_tx_id,
    v_asset_id
  );

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) IS
  'Internal fixed-asset acquisition implementation. KAN-62 derives taxable base and supplier VAT from gross invoice amount plus selected VAT rate, tests K1 thresholds on acquisition value including non-deductible VAT, and locks connected group rows before threshold and reclassification calculations.';

REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic_unchecked_kan54(jsonb) TO postgres;

COMMIT;
