BEGIN;

-- KAN-36: K1 fixed assets and collective depreciation V1.
--
-- Scope:
--   * K1-only Swedish sole proprietorship / simplified annual accounts.
--   * Swedish equipment purchases only.
--   * Full VAT deduction or no VAT deduction only.
--   * Central year-dependent tax parameters; no fallback to previous years.
--   * Journal entries remain the economic source of truth.

-- ---------------------------------------------------------------------------
-- Year-dependent tax parameters
-- ---------------------------------------------------------------------------

CREATE TABLE public.tax_rule_parameters (
  tax_year integer PRIMARY KEY,
  price_base_amount numeric(15,2) NOT NULL CHECK (price_base_amount > 0),
  rule_version text NOT NULL CHECK (btrim(rule_version) <> ''),
  source_name text NOT NULL CHECK (btrim(source_name) <> ''),
  source_url text NOT NULL CHECK (btrim(source_url) <> ''),
  source_verified_on date NOT NULL,
  rules jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_rule_parameters_year_check
    CHECK (tax_year BETWEEN 1900 AND 9999),
  CONSTRAINT tax_rule_parameters_k1_shape
    CHECK (
      rules ? 'k1_fixed_assets'
      AND rules->'k1_fixed_assets'->>'small_value_comparison' = 'lt'
      AND rules->'k1_fixed_assets'->>'collective_full_writeoff_comparison' = 'lte'
      AND (rules->'k1_fixed_assets'->>'ordinary_declining_balance_percent')::numeric = 30
    )
);

COMMENT ON TABLE public.tax_rule_parameters IS
  'Internal year-keyed SoloLedger tax-rule parameters. Ordinary bookkeeping must never scrape external sources at runtime.';

INSERT INTO public.tax_rule_parameters (
  tax_year,
  price_base_amount,
  rule_version,
  source_name,
  source_url,
  source_verified_on,
  rules
) VALUES
  (
    2025,
    58800,
    'k1-fixed-assets-pbb-v1-2025',
    'SCB prisbasbeloppet för år 2025 / BFN K1 2025',
    'https://www.scb.se/hitta-statistik/statistik-efter-amne/priser-och-ekonomiska-tendenser/priser/konsumentprisindex-kpi/pong/statistiknyhet/prisbasbeloppet-for-ar-2025/',
    DATE '2026-10-07',
    jsonb_build_object(
      'k1_fixed_assets',
      jsonb_build_object(
        'small_value_threshold_basis', 'half_price_base_amount',
        'small_value_comparison', 'lt',
        'collective_full_writeoff_threshold_basis', 'half_price_base_amount',
        'collective_full_writeoff_comparison', 'lte',
        'ordinary_declining_balance_percent', 30
      )
    )
  ),
  (
    2026,
    59200,
    'k1-fixed-assets-pbb-v1-2026',
    'Skatteverket belopp och procent 2026 / BFN K1 2025',
    'https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.4.1522bf3f19aea8075ba21.html',
    DATE '2026-10-07',
    jsonb_build_object(
      'k1_fixed_assets',
      jsonb_build_object(
        'small_value_threshold_basis', 'half_price_base_amount',
        'small_value_comparison', 'lt',
        'collective_full_writeoff_threshold_basis', 'half_price_base_amount',
        'collective_full_writeoff_comparison', 'lte',
        'ordinary_declining_balance_percent', 30
      )
    )
  );

REVOKE ALL ON TABLE public.tax_rule_parameters FROM PUBLIC;
REVOKE ALL ON TABLE public.tax_rule_parameters FROM anon;
REVOKE ALL ON TABLE public.tax_rule_parameters FROM authenticated;
GRANT SELECT ON TABLE public.tax_rule_parameters TO authenticated;
GRANT ALL ON TABLE public.tax_rule_parameters TO service_role;

CREATE OR REPLACE FUNCTION public.get_tax_rule_parameters_for_year(p_tax_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_params public.tax_rule_parameters%ROWTYPE;
  v_half_price_base_amount numeric;
BEGIN
  IF p_tax_year IS NULL OR p_tax_year < 1900 OR p_tax_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt beskattningsår.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_params
  FROM public.tax_rule_parameters
  WHERE tax_year = p_tax_year;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SoloLedger saknar verifierade skatteregler för år %. Bokningen stoppades.', p_tax_year
      USING ERRCODE = '23514';
  END IF;

  v_half_price_base_amount := round((v_params.price_base_amount / 2)::numeric, 2);

  RETURN jsonb_build_object(
    'taxYear', v_params.tax_year,
    'priceBaseAmount', v_params.price_base_amount,
    'halfPriceBaseAmount', v_half_price_base_amount,
    'ruleVersion', v_params.rule_version,
    'sourceName', v_params.source_name,
    'sourceUrl', v_params.source_url,
    'sourceVerifiedOn', v_params.source_verified_on,
    'rules', v_params.rules
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_tax_rule_parameters_for_year(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tax_rule_parameters_for_year(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_tax_rule_parameters_for_year(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tax_rule_parameters_for_year(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Source taxonomy
-- ---------------------------------------------------------------------------

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
        'customer_invoice'::text,
        'fixed_asset'::text,
        'fixed_asset_reclassification'::text,
        'fixed_asset_depreciation'::text
      ]
    )
  );

COMMENT ON COLUMN public.transactions.source IS
  'Origin of the transaction. fixed_asset and fixed_asset_depreciation are controlled SoloLedger lifecycle sources for K1 inventory support.';

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
      'customer_invoice',
      'fixed_asset',
      'fixed_asset_reclassification',
      'fixed_asset_depreciation'
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
      'customer_invoice',
      'fixed_asset',
      'fixed_asset_reclassification',
      'fixed_asset_depreciation'
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
      WHEN 'fixed_asset' THEN true
      ELSE false
    END AS is_ordinary_vat_guard_activity;
$function$;

COMMENT ON FUNCTION public.transaction_source_classification(text)
  IS 'Central SoloLedger transaction source taxonomy for DB-side guards. fixed_asset sources are controlled and not generically editable/correctable.';

-- ---------------------------------------------------------------------------
-- Registry tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.fixed_asset_acquisition_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  name text NOT NULL,
  rule_year integer NOT NULL,
  rule_version text NOT NULL,
  price_base_amount numeric(15,2) NOT NULL,
  half_price_base_amount numeric(15,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_asset_acquisition_groups_year_check
    CHECK (fiscal_year BETWEEN 1900 AND 9999 AND rule_year BETWEEN 1900 AND 9999),
  CONSTRAINT fixed_asset_acquisition_groups_name_check
    CHECK (btrim(name) <> '')
);

CREATE INDEX fixed_asset_acquisition_groups_user_year_idx
  ON public.fixed_asset_acquisition_groups (user_id, fiscal_year, created_at);

CREATE TABLE public.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  acquisition_date date NOT NULL,
  fiscal_year integer NOT NULL,
  supplier_country text NOT NULL DEFAULT 'SE',
  connection_assessment text NOT NULL DEFAULT 'standalone',
  acquisition_group_id uuid REFERENCES public.fixed_asset_acquisition_groups(id) ON DELETE RESTRICT,
  naturally_connected boolean NOT NULL DEFAULT false,
  connected_acquisition_key text,
  threshold_basis_amount numeric(15,2) NOT NULL,
  taxable_base_amount numeric(15,2) NOT NULL,
  supplier_vat_amount numeric(15,2) NOT NULL DEFAULT 0,
  deductible_vat_amount numeric(15,2) NOT NULL DEFAULT 0,
  non_deductible_vat_amount numeric(15,2) NOT NULL DEFAULT 0,
  expensed_amount numeric(15,2) NOT NULL DEFAULT 0,
  capitalized_amount numeric(15,2) NOT NULL DEFAULT 0,
  payment_account_role text NOT NULL,
  payment_account_number text NOT NULL,
  vat_deduction_entitlement text NOT NULL,
  useful_life_answer text,
  decision_type text NOT NULL,
  status text NOT NULL,
  acquisition_transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  rule_year integer NOT NULL,
  rule_version text NOT NULL,
  price_base_amount numeric(15,2) NOT NULL,
  half_price_base_amount numeric(15,2) NOT NULL,
  audit_snapshot jsonb NOT NULL,
  retired_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_assets_year_check
    CHECK (fiscal_year BETWEEN 1900 AND 9999 AND rule_year BETWEEN 1900 AND 9999),
  CONSTRAINT fixed_assets_country_check
    CHECK (supplier_country = 'SE'),
  CONSTRAINT fixed_assets_connection_assessment_check
    CHECK (connection_assessment IN ('standalone', 'connected')),
  CONSTRAINT fixed_assets_connection_group_check
    CHECK (
      (connection_assessment = 'standalone' AND acquisition_group_id IS NULL AND naturally_connected = false)
      OR (connection_assessment = 'connected' AND acquisition_group_id IS NOT NULL AND naturally_connected = true)
    ),
  CONSTRAINT fixed_assets_amounts_check
    CHECK (
      threshold_basis_amount >= 0
      AND taxable_base_amount >= 0
      AND supplier_vat_amount >= 0
      AND deductible_vat_amount >= 0
      AND non_deductible_vat_amount >= 0
      AND expensed_amount >= 0
      AND capitalized_amount >= 0
    ),
  CONSTRAINT fixed_assets_payment_role_check
    CHECK (payment_account_role IN ('business_payment_account', 'owner_private_payment')),
  CONSTRAINT fixed_assets_vat_deduction_check
    CHECK (vat_deduction_entitlement IN ('full', 'none')),
  CONSTRAINT fixed_assets_useful_life_check
    CHECK (useful_life_answer IS NULL OR useful_life_answer IN ('max_three_years', 'more_than_three_years_or_unknown')),
  CONSTRAINT fixed_assets_decision_type_check
    CHECK (decision_type IN ('immediate_expense_small_value', 'immediate_expense_short_life', 'capitalized')),
  CONSTRAINT fixed_assets_status_check
    CHECK (status IN ('expensed', 'active', 'retired')),
  CONSTRAINT fixed_assets_decision_amount_consistency
    CHECK (
      (
        decision_type IN ('immediate_expense_small_value', 'immediate_expense_short_life')
        AND status IN ('expensed', 'retired')
        AND expensed_amount > 0
        AND capitalized_amount = 0
      )
      OR (
        decision_type = 'capitalized'
        AND status IN ('active', 'retired')
        AND capitalized_amount > 0
        AND expensed_amount = 0
      )
    )
);

CREATE INDEX fixed_assets_user_year_idx
  ON public.fixed_assets (user_id, fiscal_year, acquisition_date);

CREATE INDEX fixed_assets_user_status_idx
  ON public.fixed_assets (user_id, status);

CREATE INDEX fixed_assets_group_idx
  ON public.fixed_assets (acquisition_group_id);

COMMENT ON TABLE public.fixed_assets IS
  'K1 equipment purchase decision and fixed-asset registry. Journal entries remain the economic source of truth.';

CREATE TABLE public.fixed_asset_acquisition_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  result jsonb NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_asset_acquisition_idempotency_user_key_unique
    UNIQUE (user_id, idempotency_key),
  CONSTRAINT fixed_asset_acquisition_idempotency_transaction_unique
    UNIQUE (transaction_id),
  CONSTRAINT fixed_asset_acquisition_idempotency_asset_unique
    UNIQUE (asset_id),
  CONSTRAINT fixed_asset_acquisition_idempotency_request_object
    CHECK (jsonb_typeof(request_payload) = 'object'),
  CONSTRAINT fixed_asset_acquisition_idempotency_result_object
    CHECK (jsonb_typeof(result) = 'object')
);

COMMENT ON TABLE public.fixed_asset_acquisition_idempotency IS
  'Durable replay ledger for fixed-asset acquisition idempotency. Application clients do not mutate this table directly.';

CREATE TABLE public.fixed_asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_date date NOT NULL,
  fiscal_year integer NOT NULL,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  audit_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_asset_events_type_check
    CHECK (event_type IN ('acquisition', 'depreciation', 'retirement', 'reclassification')),
  CONSTRAINT fixed_asset_events_amount_check
    CHECK (amount >= 0),
  CONSTRAINT fixed_asset_events_year_check
    CHECK (fiscal_year BETWEEN 1900 AND 9999)
);

CREATE INDEX fixed_asset_events_user_year_idx
  ON public.fixed_asset_events (user_id, fiscal_year, event_date);

CREATE INDEX fixed_asset_events_asset_idx
  ON public.fixed_asset_events (asset_id);

CREATE TABLE public.fixed_asset_depreciation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  basis_amount numeric(15,2) NOT NULL,
  depreciation_amount numeric(15,2) NOT NULL,
  method text NOT NULL DEFAULT 'k1_main_rule_30_percent',
  rule_year integer NOT NULL,
  rule_version text NOT NULL,
  price_base_amount numeric(15,2) NOT NULL,
  half_price_base_amount numeric(15,2) NOT NULL,
  full_writeoff_applied boolean NOT NULL,
  audit_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_asset_depreciation_runs_user_year_unique
    UNIQUE (user_id, fiscal_year),
  CONSTRAINT fixed_asset_depreciation_runs_amounts_check
    CHECK (basis_amount > 0 AND depreciation_amount > 0 AND depreciation_amount <= basis_amount),
  CONSTRAINT fixed_asset_depreciation_runs_year_check
    CHECK (fiscal_year BETWEEN 1900 AND 9999 AND rule_year BETWEEN 1900 AND 9999),
  CONSTRAINT fixed_asset_depreciation_runs_method_check
    CHECK (method IN ('k1_main_rule_30_percent', 'k1_half_pbb_full_writeoff'))
);

ALTER TABLE public.fixed_asset_acquisition_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_asset_acquisition_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_asset_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_asset_depreciation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY fixed_asset_acquisition_groups_owner_select
ON public.fixed_asset_acquisition_groups
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY fixed_assets_owner_select
ON public.fixed_assets
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY fixed_asset_events_owner_select
ON public.fixed_asset_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY fixed_asset_depreciation_runs_owner_select
ON public.fixed_asset_depreciation_runs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.fixed_asset_acquisition_groups FROM PUBLIC;
REVOKE ALL ON TABLE public.fixed_asset_acquisition_groups FROM anon;
REVOKE ALL ON TABLE public.fixed_asset_acquisition_groups FROM authenticated;
GRANT SELECT ON TABLE public.fixed_asset_acquisition_groups TO authenticated;
GRANT ALL ON TABLE public.fixed_asset_acquisition_groups TO service_role;

REVOKE ALL ON TABLE public.fixed_assets FROM PUBLIC;
REVOKE ALL ON TABLE public.fixed_assets FROM anon;
REVOKE ALL ON TABLE public.fixed_assets FROM authenticated;
GRANT SELECT ON TABLE public.fixed_assets TO authenticated;
GRANT ALL ON TABLE public.fixed_assets TO service_role;

REVOKE ALL ON TABLE public.fixed_asset_acquisition_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.fixed_asset_acquisition_idempotency FROM anon;
REVOKE ALL ON TABLE public.fixed_asset_acquisition_idempotency FROM authenticated;
GRANT ALL ON TABLE public.fixed_asset_acquisition_idempotency TO postgres;
GRANT ALL ON TABLE public.fixed_asset_acquisition_idempotency TO service_role;

REVOKE ALL ON TABLE public.fixed_asset_events FROM PUBLIC;
REVOKE ALL ON TABLE public.fixed_asset_events FROM anon;
REVOKE ALL ON TABLE public.fixed_asset_events FROM authenticated;
GRANT SELECT ON TABLE public.fixed_asset_events TO authenticated;
GRANT ALL ON TABLE public.fixed_asset_events TO service_role;

REVOKE ALL ON TABLE public.fixed_asset_depreciation_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.fixed_asset_depreciation_runs FROM anon;
REVOKE ALL ON TABLE public.fixed_asset_depreciation_runs FROM authenticated;
GRANT SELECT ON TABLE public.fixed_asset_depreciation_runs TO authenticated;
GRANT ALL ON TABLE public.fixed_asset_depreciation_runs TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_fixed_asset_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.delete_user_data_atomic_lifecycle_context ctx
    WHERE ctx.pid = pg_backend_pid()
      AND ctx.user_id = OLD.user_id
  ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Inventariehändelser är låsta och kan bara ändras genom kontrollerade SoloLedger-flöden.'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER prevent_fixed_asset_event_mutation
BEFORE UPDATE OR DELETE ON public.fixed_asset_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_fixed_asset_event_mutation();

REVOKE ALL ON FUNCTION public.prevent_fixed_asset_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_fixed_asset_event_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_fixed_asset_event_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_fixed_asset_event_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_fixed_asset_event_mutation() TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fixed_asset_payment_account(
  p_user_id uuid,
  p_payment_account_role text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_number text;
BEGIN
  IF p_payment_account_role NOT IN ('business_payment_account', 'owner_private_payment') THEN
    RAISE EXCEPTION 'Ogiltig betalningskälla för inventarieinköp.'
      USING ERRCODE = '22023';
  END IF;

  SELECT account_number
    INTO v_account_number
  FROM public.company_payment_account_roles
  WHERE user_id = p_user_id
    AND role = p_payment_account_role;

  IF v_account_number IS NULL THEN
    RAISE EXCEPTION 'Betalningskonto saknas i Profil för inventarieinköp.'
      USING ERRCODE = '23514';
  END IF;

  IF p_payment_account_role = 'business_payment_account'
     AND v_account_number !~ '^1[0-9]{3}$' THEN
    RAISE EXCEPTION 'Företagets betalningskonto för inventarieinköp måste vara ett 1xxx-konto.'
      USING ERRCODE = '23514';
  END IF;

  IF p_payment_account_role = 'owner_private_payment'
     AND v_account_number !~ '^2[0-9]{3}$' THEN
    RAISE EXCEPTION 'Privat betalda inventarieinköp måste kopplas till eget kapital (2xxx).'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_account_number;
END;
$$;

REVOKE ALL ON FUNCTION public.fixed_asset_payment_account(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fixed_asset_payment_account(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.fixed_asset_payment_account(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fixed_asset_payment_account(uuid, text) TO postgres;
GRANT EXECUTE ON FUNCTION public.fixed_asset_payment_account(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Acquisition RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.book_fixed_asset_acquisition_atomic(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF p_payload->>'taxable_base_amount' IS NULL
     OR p_payload->>'taxable_base_amount' !~ '^\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Belopp exklusive moms saknas eller är ogiltigt.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'supplier_vat_amount' IS NULL
     OR p_payload->>'supplier_vat_amount' !~ '^\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Momsbelopp saknas eller är ogiltigt.'
      USING ERRCODE = '22023';
  END IF;

  v_taxable_base_amount := round((p_payload->>'taxable_base_amount')::numeric, 2);
  v_supplier_vat_amount := round((p_payload->>'supplier_vat_amount')::numeric, 2);

  IF v_taxable_base_amount <= 0 THEN
    RAISE EXCEPTION 'Belopp exklusive moms måste vara större än 0.'
      USING ERRCODE = '22023';
  END IF;

  IF v_supplier_vat_amount < 0 THEN
    RAISE EXCEPTION 'Momsbelopp kan inte vara negativt.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'planned_group_basis_amount' IS NOT NULL THEN
    IF p_payload->>'planned_group_basis_amount' !~ '^\d+(\.\d+)?$' THEN
      RAISE EXCEPTION 'Känt samlat anskaffningsvärde är ogiltigt.'
        USING ERRCODE = '22023';
    END IF;
    v_planned_group_basis_amount := round((p_payload->>'planned_group_basis_amount')::numeric, 2);
    IF v_planned_group_basis_amount < v_taxable_base_amount THEN
      RAISE EXCEPTION 'Känt samlat anskaffningsvärde kan inte vara lägre än aktuellt inköp.'
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
    v_threshold_basis_amount := v_taxable_base_amount;
  ELSE
    IF v_group_name IS NULL THEN
      v_group_name := v_description;
    END IF;
  END IF;

  IF v_vat_deduction_entitlement = 'full' THEN
    v_deductible_vat_amount := v_supplier_vat_amount;
    v_non_deductible_vat_amount := 0;
  ELSE
    v_deductible_vat_amount := 0;
    v_non_deductible_vat_amount := v_supplier_vat_amount;
  END IF;

  v_paid_amount := round(v_taxable_base_amount + v_supplier_vat_amount, 2);

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

    SELECT
      coalesce(array_agg(DISTINCT fa.id), ARRAY[]::uuid[]),
      round(coalesce(sum(fa.taxable_base_amount), 0), 2)
    INTO
      v_prior_asset_ids,
      v_prior_recorded_basis_amount
    FROM public.fixed_assets fa
    WHERE fa.user_id = v_user_id
      AND fa.fiscal_year = v_fiscal_year
      AND fa.status <> 'retired'
      AND (
        fa.acquisition_group_id = v_acquisition_group_id
        OR fa.id = ANY (v_connected_asset_ids)
      );

    v_threshold_basis_amount := round(v_taxable_base_amount + v_prior_recorded_basis_amount, 2);
    IF v_planned_group_basis_amount IS NOT NULL THEN
      v_threshold_basis_amount := greatest(v_threshold_basis_amount, v_planned_group_basis_amount);
    END IF;
  END IF;

  IF v_threshold_basis_amount < v_half_price_base_amount THEN
    v_decision_type := 'immediate_expense_small_value';
    v_status := 'expensed';
    v_expensed_amount := round(v_taxable_base_amount + v_non_deductible_vat_amount, 2);
  ELSE
    v_useful_life_answer := btrim(coalesce(p_payload->>'useful_life_answer', ''));
    IF v_useful_life_answer NOT IN ('max_three_years', 'more_than_three_years_or_unknown') THEN
      RAISE EXCEPTION 'Ange om utrustningen väntas användas högst tre år.'
        USING ERRCODE = '23514';
    END IF;

    IF v_useful_life_answer = 'max_three_years' THEN
      v_decision_type := 'immediate_expense_short_life';
      v_status := 'expensed';
      v_expensed_amount := round(v_taxable_base_amount + v_non_deductible_vat_amount, 2);
    ELSE
      v_decision_type := 'capitalized';
      v_status := 'active';
      v_capitalized_amount := round(v_taxable_base_amount + v_non_deductible_vat_amount, 2);
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
    CASE WHEN v_supplier_vat_amount > 0 THEN 25 ELSE 0 END,
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
    'schemaVersion', 'fixed-asset-audit-v1',
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
      'taxableBaseAmount', v_taxable_base_amount,
      'supplierVatAmount', v_supplier_vat_amount,
      'vatDeductionEntitlement', v_vat_deduction_entitlement,
      'deductibleVatAmount', v_deductible_vat_amount,
      'nonDeductibleVatAmount', v_non_deductible_vat_amount,
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
$$;

-- ---------------------------------------------------------------------------
-- Collective depreciation RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.book_fixed_asset_depreciation_atomic(p_fiscal_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_year_end date;
  v_tax_params jsonb;
  v_price_base_amount numeric;
  v_half_price_base_amount numeric;
  v_rule_version text;
  v_basis_amount numeric;
  v_depreciation_amount numeric;
  v_full_writeoff boolean;
  v_method text;
  v_ver_nr integer;
  v_tx_id uuid;
  v_run_id uuid;
  v_audit_snapshot jsonb;
  v_existing public.fixed_asset_depreciation_runs%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_fiscal_year IS NULL OR p_fiscal_year < 1900 OR p_fiscal_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_existing
  FROM public.fixed_asset_depreciation_runs
  WHERE user_id = v_user_id
    AND fiscal_year = p_fiscal_year;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'depreciation_run_id', v_existing.id,
      'transaction_id', v_existing.transaction_id,
      'fiscal_year', v_existing.fiscal_year,
      'ver_nr', (
        SELECT min(je.ver_nr)
        FROM public.journal_entries je
        WHERE je.transaction_id = v_existing.transaction_id
          AND je.user_id = v_user_id
      ),
      'depreciation_amount', v_existing.depreciation_amount,
      'basis_amount', v_existing.basis_amount,
      'full_writeoff_applied', v_existing.full_writeoff_applied,
      'method', v_existing.method,
      'rule_year', v_existing.rule_year,
      'rule_version', v_existing.rule_version,
      'half_price_base_amount', v_existing.half_price_base_amount
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = p_fiscal_year
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.', p_fiscal_year
      USING ERRCODE = '23514';
  END IF;

  v_year_end := make_date(p_fiscal_year, 12, 31);
  v_tax_params := public.get_tax_rule_parameters_for_year(p_fiscal_year);
  v_price_base_amount := (v_tax_params->>'priceBaseAmount')::numeric;
  v_half_price_base_amount := (v_tax_params->>'halfPriceBaseAmount')::numeric;
  v_rule_version := v_tax_params->>'ruleVersion';

  IF NOT EXISTS (
    SELECT 1
    FROM public.fixed_assets
    WHERE user_id = v_user_id
      AND decision_type = 'capitalized'
      AND status = 'active'
      AND acquisition_date <= v_year_end
  ) THEN
    RAISE EXCEPTION 'Det finns inga aktiva inventarier att skriva av för år %.', p_fiscal_year
      USING ERRCODE = '23514';
  END IF;

  SELECT round(coalesce(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)), 0), 2)
    INTO v_basis_amount
  FROM public.journal_entries je
  WHERE je.user_id = v_user_id
    AND je.date <= v_year_end
    AND je.account_number BETWEEN '1220' AND '1249';

  IF v_basis_amount IS NULL OR v_basis_amount <= 0 THEN
    RAISE EXCEPTION 'Inventariernas bokförda värde är inte positivt för år %. Kontroll krävs.', p_fiscal_year
      USING ERRCODE = '23514';
  END IF;

  v_full_writeoff := v_basis_amount <= v_half_price_base_amount;

  IF v_full_writeoff THEN
    v_depreciation_amount := v_basis_amount;
    v_method := 'k1_half_pbb_full_writeoff';
  ELSE
    v_depreciation_amount := round((v_basis_amount * 0.30)::numeric, 2);
    v_method := 'k1_main_rule_30_percent';
  END IF;

  IF v_depreciation_amount <= 0 OR v_depreciation_amount > v_basis_amount THEN
    RAISE EXCEPTION 'Beräknad avskrivning är ogiltig.'
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
    booked,
    source
  ) VALUES (
    v_user_id,
    v_year_end,
    'Årets avskrivning inventarier ' || p_fiscal_year,
    v_depreciation_amount,
    NULL,
    0,
    true,
    'fixed_asset_depreciation'
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
  ) VALUES
    (
      v_tx_id, v_ver_nr, '7830',
      v_depreciation_amount, 0,
      'Årets avskrivning inventarier ' || p_fiscal_year,
      v_year_end, v_user_id
    ),
    (
      v_tx_id, v_ver_nr, '1220',
      0, v_depreciation_amount,
      'Årets avskrivning inventarier ' || p_fiscal_year,
      v_year_end, v_user_id
    );

  v_audit_snapshot := jsonb_build_object(
    'schemaVersion', 'fixed-asset-depreciation-v1',
    'rule', jsonb_build_object(
      'taxYear', p_fiscal_year,
      'ruleVersion', v_rule_version,
      'priceBaseAmount', v_price_base_amount,
      'halfPriceBaseAmount', v_half_price_base_amount,
      'collectiveFullWriteoffComparison', 'lte',
      'ordinaryDecliningBalancePercent', 30
    ),
    'calculation', jsonb_build_object(
      'basisAmount', v_basis_amount,
      'depreciationAmount', v_depreciation_amount,
      'fullWriteoffApplied', v_full_writeoff,
      'method', v_method
    ),
    'journal', jsonb_build_object(
      'transactionId', v_tx_id,
      'verNr', v_ver_nr
    )
  );

  INSERT INTO public.fixed_asset_depreciation_runs (
    user_id,
    fiscal_year,
    transaction_id,
    basis_amount,
    depreciation_amount,
    method,
    rule_year,
    rule_version,
    price_base_amount,
    half_price_base_amount,
    full_writeoff_applied,
    audit_snapshot
  ) VALUES (
    v_user_id,
    p_fiscal_year,
    v_tx_id,
    v_basis_amount,
    v_depreciation_amount,
    v_method,
    p_fiscal_year,
    v_rule_version,
    v_price_base_amount,
    v_half_price_base_amount,
    v_full_writeoff,
    v_audit_snapshot
  )
  RETURNING id INTO v_run_id;

  INSERT INTO public.fixed_asset_events (
    user_id, asset_id, transaction_id, event_type, event_date, fiscal_year, amount, audit_snapshot
  ) VALUES (
    v_user_id,
    NULL,
    v_tx_id,
    'depreciation',
    v_year_end,
    p_fiscal_year,
    v_depreciation_amount,
    v_audit_snapshot
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'depreciation_run_id', v_run_id,
    'transaction_id', v_tx_id,
    'fiscal_year', p_fiscal_year,
    'ver_nr', v_ver_nr,
    'basis_amount', v_basis_amount,
    'depreciation_amount', v_depreciation_amount,
    'full_writeoff_applied', v_full_writeoff,
    'method', v_method,
    'rule_year', p_fiscal_year,
    'rule_version', v_rule_version,
    'half_price_base_amount', v_half_price_base_amount
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Narrow retirement RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.retire_fixed_asset_atomic(
  p_asset_id uuid,
  p_retirement_date date,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_asset public.fixed_assets%ROWTYPE;
  v_reason text;
  v_event_snapshot jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_asset_id IS NULL OR p_retirement_date IS NULL THEN
    RAISE EXCEPTION 'Inventarie och datum krävs.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_asset
  FROM public.fixed_assets
  WHERE id = p_asset_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventarien hittades inte eller tillhör inte användaren.'
      USING ERRCODE = '23503';
  END IF;

  IF v_asset.status = 'retired' THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'asset_id', p_asset_id);
  END IF;

  IF v_asset.decision_type = 'capitalized' THEN
    RAISE EXCEPTION 'Avyttring eller utrangering av bokförda inventarier stöds inte säkert i KAN-36 V1. Skapa en separat rättningsuppgift.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from p_retirement_date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_retirement_date)::integer
      USING ERRCODE = '23514';
  END IF;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  v_event_snapshot := jsonb_build_object(
    'schemaVersion', 'fixed-asset-retirement-v1',
    'assetId', p_asset_id,
    'decisionType', v_asset.decision_type,
    'retirementDate', p_retirement_date,
    'reason', v_reason,
    'journalEffect', 'none'
  );

  UPDATE public.fixed_assets
  SET status = 'retired',
      retired_at = p_retirement_date
  WHERE id = p_asset_id
    AND user_id = v_user_id;

  INSERT INTO public.fixed_asset_events (
    user_id, asset_id, transaction_id, event_type, event_date, fiscal_year, amount, audit_snapshot
  ) VALUES (
    v_user_id,
    p_asset_id,
    NULL,
    'retirement',
    p_retirement_date,
    extract(year from p_retirement_date)::integer,
    0,
    v_event_snapshot
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'asset_id', p_asset_id,
    'status', 'retired'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.book_fixed_asset_depreciation_atomic(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_fixed_asset_depreciation_atomic(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_depreciation_atomic(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_fixed_asset_depreciation_atomic(integer) TO service_role;

REVOKE ALL ON FUNCTION public.retire_fixed_asset_atomic(uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retire_fixed_asset_atomic(uuid, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.retire_fixed_asset_atomic(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_fixed_asset_atomic(uuid, date, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Year close guard
-- ---------------------------------------------------------------------------

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
  v_year_end date;
  v_unhandled_fixed_asset_count integer := 0;
  v_fixed_asset_basis numeric := 0;
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

  SELECT count(*)::integer
    INTO v_unhandled_fixed_asset_count
  FROM public.fixed_assets fa
  WHERE fa.user_id = v_user_id
    AND fa.decision_type = 'capitalized'
    AND fa.status = 'active'
    AND fa.acquisition_date <= v_year_end;

  SELECT round(coalesce(sum(coalesce(je.debit, 0) - coalesce(je.credit, 0)), 0), 2)
    INTO v_fixed_asset_basis
  FROM public.journal_entries je
  WHERE je.user_id = v_user_id
    AND je.date <= v_year_end
    AND je.account_number BETWEEN '1220' AND '1249';

  IF v_unhandled_fixed_asset_count > 0
     AND coalesce(v_fixed_asset_basis, 0) > 0
     AND NOT EXISTS (
       SELECT 1
       FROM public.fixed_asset_depreciation_runs r
       WHERE r.user_id = v_user_id
         AND r.fiscal_year = p_year
     ) THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom inventarier behöver årsavskrivning.',
      p_year
      USING ERRCODE = '23514';
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

  IF coalesce(v_unclassified_negative_bank, 0) > 0 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom ett eller flera 19xx-konton har negativt saldo som inte kan placeras säkert i förenklat årsbokslut.',
      p_year
      USING ERRCODE = '23514';
  END IF;

  IF abs(coalesce(v_balance_diff, 0)) > 0.01 THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom förenklat årsbokslut inte balanserar (diff % kr).',
      p_year,
      v_balance_diff
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    INSERT INTO public.closed_years (
      user_id,
      year
    ) VALUES (
      v_user_id,
      p_year
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'År % är redan låst.', p_year;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'year', p_year,
    'closed_at', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- User deletion lifecycle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fixed_asset_depreciation_runs integer := 0;
  v_fixed_asset_events integer := 0;
  v_fixed_asset_acquisition_idempotency integer := 0;
  v_fixed_assets integer := 0;
  v_fixed_asset_acquisition_groups integer := 0;
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
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id krävs.';
  END IF;

  INSERT INTO public.delete_user_data_atomic_lifecycle_context (
    pid,
    user_id
  ) VALUES (
    pg_backend_pid(),
    p_user_id
  )
  ON CONFLICT (pid, user_id) DO NOTHING;

  DELETE FROM public.fixed_asset_depreciation_runs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_depreciation_runs = ROW_COUNT;

  DELETE FROM public.fixed_asset_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_events = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_idempotency WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_idempotency = ROW_COUNT;

  DELETE FROM public.fixed_assets WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_assets = ROW_COUNT;

  DELETE FROM public.fixed_asset_acquisition_groups WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_fixed_asset_acquisition_groups = ROW_COUNT;

  DELETE FROM public.tax_account_movements WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_movements = ROW_COUNT;

  DELETE FROM public.tax_account_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_tax_account_events = ROW_COUNT;

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE pid = pg_backend_pid()
    AND user_id = p_user_id;

  DELETE FROM public.customer_invoice_bookings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoice_bookings = ROW_COUNT;

  DELETE FROM public.customer_invoices WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_customer_invoices = ROW_COUNT;

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

  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'fixed_asset_depreciation_runs', v_fixed_asset_depreciation_runs,
      'fixed_asset_events', v_fixed_asset_events,
      'fixed_asset_acquisition_idempotency', v_fixed_asset_acquisition_idempotency,
      'fixed_assets', v_fixed_assets,
      'fixed_asset_acquisition_groups', v_fixed_asset_acquisition_groups,
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
      'ver_nr_sequences', v_ver_nr_sequences
    )
  );
EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE pid = pg_backend_pid()
    AND user_id = p_user_id;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer) TO service_role;

REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_data_atomic(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_user_data_atomic(uuid) TO service_role;

COMMENT ON FUNCTION public.book_fixed_asset_acquisition_atomic(jsonb) IS
  'Books K1 Swedish equipment purchases atomically with fixed-asset registry/audit state and authoritative year-dependent tax parameters.';

COMMENT ON FUNCTION public.book_fixed_asset_depreciation_atomic(integer) IS
  'Books K1 collective fixed-asset depreciation for a fiscal year using the 30 percent main rule or half-PBB full write-off simplification.';

COMMENT ON FUNCTION public.retire_fixed_asset_atomic(uuid, date, text) IS
  'Marks direct-expensed equipment decisions retired. Capitalized disposals fail closed in KAN-36 V1.';

COMMIT;
