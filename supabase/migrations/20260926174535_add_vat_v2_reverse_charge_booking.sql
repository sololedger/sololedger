-- REVIEW DRAFT ONLY - DO NOT RUN AGAINST LIVE SUPABASE WITHOUT EXPLICIT APPROVAL.
--
-- KAN-19 VAT V2 persistence slice:
--   * add a transaction-bound VAT audit snapshot table
--   * add a narrow EU service reverse-charge booking RPC
--   * keep ordinary VAT V1 booking unchanged
--   * prevent existing generic correction flow from correcting VAT V2 rows
--     before a VAT V2-aware correction path exists

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
        'vat_v2'::text
      ]
    )
  );

COMMENT ON COLUMN public.transactions.source IS
  'Origin of the transaction. vat_closing is reserved for SoloLedger-created VAT period closing transactions. vat_v2 is reserved for controlled VAT V2 booking RPCs.';

CREATE TABLE public.vat_audit_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  schema_version text NOT NULL,
  journal_plan_version text NOT NULL,
  treatment_code text NOT NULL,
  rule_version text NOT NULL,
  facts_version text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vat_audit_snapshots_transaction_unique UNIQUE (transaction_id),
  CONSTRAINT vat_audit_snapshots_schema_version
    CHECK (schema_version = 'vat-audit-snapshot-v1'),
  CONSTRAINT vat_audit_snapshots_journal_plan_version
    CHECK (journal_plan_version = 'vat-journal-plan-v1'),
  CONSTRAINT vat_audit_snapshots_supported_treatment
    CHECK (treatment_code = 'EU_SERVICE_REVERSE_CHARGE'),
  CONSTRAINT vat_audit_snapshots_snapshot_object
    CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT vat_audit_snapshots_snapshot_versions
    CHECK (
      snapshot->>'schemaVersion' = schema_version
      AND snapshot->>'journalPlanVersion' = journal_plan_version
      AND snapshot->>'treatmentCode' = treatment_code
      AND snapshot->>'ruleVersion' = rule_version
      AND snapshot->>'factsVersion' = facts_version
    )
);

CREATE INDEX idx_vat_audit_snapshots_user_id
  ON public.vat_audit_snapshots (user_id);

COMMENT ON TABLE public.vat_audit_snapshots IS
  'Immutable VAT V2 audit evidence tied to the persisted accounting transaction.';

COMMENT ON COLUMN public.vat_audit_snapshots.snapshot IS
  'Server-derived VAT treatment, journal semantics, and reconciliation evidence for the persisted transaction.';

ALTER TABLE public.vat_audit_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own VAT audit snapshots"
ON public.vat_audit_snapshots
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.vat_audit_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.vat_audit_snapshots FROM anon;
REVOKE ALL ON TABLE public.vat_audit_snapshots FROM authenticated;
GRANT SELECT ON TABLE public.vat_audit_snapshots TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.vat_audit_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.validate_vat_audit_snapshot_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.id = NEW.transaction_id
      AND t.user_id = NEW.user_id
      AND t.source = 'vat_v2'
  ) THEN
    RAISE EXCEPTION
      'VAT audit snapshot must reference a VAT V2 transaction owned by the same user.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_vat_audit_snapshot_transaction
BEFORE INSERT OR UPDATE OF user_id, transaction_id
ON public.vat_audit_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.validate_vat_audit_snapshot_transaction();

REVOKE ALL ON FUNCTION public.validate_vat_audit_snapshot_transaction() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_vat_audit_snapshot_transaction() FROM anon;
REVOKE ALL ON FUNCTION public.validate_vat_audit_snapshot_transaction() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_vat_audit_snapshot_transaction() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_vat_audit_snapshot_transaction() TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_vat_v2_correction_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(NEW.is_correction, false)
     AND NEW.corrects_ver_nr IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.transactions original_tx
       JOIN public.journal_entries original_entry
         ON original_entry.transaction_id = original_tx.id
        AND original_entry.user_id = original_tx.user_id
       WHERE original_tx.user_id = NEW.user_id
         AND original_tx.source = 'vat_v2'
         AND original_entry.ver_nr = NEW.corrects_ver_nr
     ) THEN
    RAISE EXCEPTION
      'VAT V2-verifikationer kan inte korrigeras med den generiska korrigeringsfunktionen ännu.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS prevent_vat_v2_correction_insert
  ON public.transactions;

CREATE TRIGGER prevent_vat_v2_correction_insert
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_vat_v2_correction_insert();

REVOKE ALL ON FUNCTION public.prevent_vat_v2_correction_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_vat_v2_correction_insert() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_vat_v2_correction_insert() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_vat_v2_correction_insert() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_vat_v2_correction_insert() TO service_role;

CREATE OR REPLACE FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
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

  IF left(v_payment_account_number, 1) NOT IN ('1', '2') THEN
    RAISE EXCEPTION 'Betalnings-/skuldkonto måste vara ett balans-, skuld- eller eget kapitalkonto.'
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

  -- The supported journal always writes 2614 and 2645, so it is always
  -- VAT-period relevant and must take the VAT month lock before writes.
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

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr,
    'vat_audit_snapshot_id', v_audit_snapshot_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb) TO service_role;
