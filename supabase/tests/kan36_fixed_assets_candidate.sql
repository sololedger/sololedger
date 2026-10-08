\set ON_ERROR_STOP on

-- KAN-36 rollback regression for K1 fixed assets.
--
-- Intended for the isolated local PostgreSQL regression database after the
-- KAN-36 migration has been applied. It creates only synthetic users and ends
-- with ROLLBACK.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-36 assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_eq(
  p_actual anyelement,
  p_expected anyelement,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'KAN-36 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'auth.uid() test context was not established';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
  p_sql text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_rejected := true;
  END;

  PERFORM pg_temp.assert_true(v_rejected, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.setup_user(
  p_user_id uuid,
  p_run_tag text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (id) VALUES (p_user_id);

  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (p_run_tag || '-bank', p_user_id, 'KAN-36 bank', '1930', '3001'),
    (p_run_tag || '-owner', p_user_id, 'KAN-36 privat betalning', '4000', '2018'),
    (p_run_tag || '-expense', p_user_id, 'KAN-36 förbrukningsinventarier', '5410', '1930'),
    (p_run_tag || '-asset', p_user_id, 'KAN-36 inventarier', '1220', '1930'),
    (p_run_tag || '-depr', p_user_id, 'KAN-36 avskrivning', '7830', '1220'),
    (p_run_tag || '-vat', p_user_id, 'KAN-36 ingående moms', '2641', '1930');

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES
    (p_user_id, 'business_payment_account', '1930'),
    (p_user_id, 'owner_private_payment', '2018');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.asset_payload(
  p_date date,
  p_description text,
  p_taxable numeric,
  p_vat numeric,
  p_deduction text,
  p_payment_role text,
  p_group_basis numeric DEFAULT NULL,
  p_useful_life text DEFAULT NULL,
  p_supplier_country text DEFAULT 'SE',
  p_connection_assessment text DEFAULT NULL,
  p_connected_asset_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_acquisition_group_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'idempotency_key', gen_random_uuid(),
    'date', p_date::text,
    'description', p_description,
    'supplier_country', p_supplier_country,
    'taxable_base_amount', p_taxable,
    'supplier_vat_amount', p_vat,
    'vat_deduction_entitlement', p_deduction,
    'payment_account_role', p_payment_role,
    'connection_assessment', coalesce(
      p_connection_assessment,
      CASE WHEN p_group_basis IS NOT NULL OR cardinality(p_connected_asset_ids) > 0 OR p_acquisition_group_id IS NOT NULL THEN 'connected' ELSE 'standalone' END
    ),
    'planned_group_basis_amount', p_group_basis,
    'connected_asset_ids', to_jsonb(p_connected_asset_ids),
    'acquisition_group_id', p_acquisition_group_id,
    'acquisition_group_name', CASE WHEN p_group_basis IS NOT NULL OR cardinality(p_connected_asset_ids) > 0 OR p_acquisition_group_id IS NOT NULL THEN 'KAN-36 package' END,
    'useful_life_answer', p_useful_life
  ));
$$;

CREATE OR REPLACE FUNCTION pg_temp.journal_amount(
  p_user_id uuid,
  p_transaction_id uuid,
  p_account text,
  p_side text
)
RETURNS numeric
LANGUAGE sql
AS $$
  SELECT round(coalesce(sum(
    CASE WHEN p_side = 'debit' THEN debit ELSE credit END
  ), 0), 2)
  FROM public.journal_entries
  WHERE user_id = p_user_id
    AND transaction_id = p_transaction_id
    AND account_number = p_account;
$$;

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_small_user_id uuid := gen_random_uuid();
  v_locked_user_id uuid := gen_random_uuid();
  v_run_tag text := 'kan36-' || replace(gen_random_uuid()::text, '-', '');
  v_result jsonb;
  v_tx_id uuid;
  v_asset_id uuid;
  v_camera_asset_id uuid;
  v_package_group_id uuid;
  v_reclass_tx_id uuid;
  v_replay_payload jsonb;
  v_replay jsonb;
  v_run jsonb;
BEGIN
  PERFORM pg_temp.assert_eq(
    (public.get_tax_rule_parameters_for_year(2026)->>'halfPriceBaseAmount')::numeric,
    29600::numeric,
    '2026 half PBB is served from internal tax parameters'
  );

  PERFORM pg_temp.assert_rejects(
    'select public.get_tax_rule_parameters_for_year(2027)',
    'unsupported future tax year fails closed'
  );

  PERFORM pg_temp.setup_user(v_user_id, v_run_tag || '-main');
  PERFORM pg_temp.set_auth(v_user_id);

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-02-01',
      'KAN-36 no deduction under threshold',
      29599.99,
      7400,
      'none',
      'business_payment_account'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'immediate_expense_small_value', 'below half PBB expenses immediately');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_user_id, v_tx_id, '5410', 'debit'), 36999.99::numeric, 'non-deductible VAT is expensed');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_user_id, v_tx_id, '2641', 'debit'), 0::numeric, 'no-deduction purchase has no input VAT row');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_user_id, v_tx_id, '1930', 'credit'), 36999.99::numeric, 'company payment credits configured account');

  v_replay_payload := pg_temp.asset_payload(
    '2026-02-01',
    'KAN-36 idempotent camera',
    5000,
    1250,
    'full',
    'business_payment_account'
  );
  v_result := public.book_fixed_asset_acquisition_atomic(v_replay_payload);
  v_replay := public.book_fixed_asset_acquisition_atomic(v_replay_payload);
  PERFORM pg_temp.assert_eq((v_result->>'transaction_id')::uuid, (v_replay->>'transaction_id')::uuid, 'acquisition replay returns original transaction');
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'acquisition replay is marked');
  PERFORM pg_temp.assert_eq(
    (SELECT count(*)::integer FROM public.transactions WHERE user_id = v_user_id AND description = 'KAN-36 idempotent camera'),
    1,
    'same acquisition idempotency key creates no duplicate transaction'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('2026-02-02', 'KAN-36 boundary needs life', 29600, 7400, 'full', 'business_payment_account')::text
    ),
    'exact half PBB is not immediate small value'
  );

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-02-03',
      'KAN-36 connected package over threshold short life',
      25000,
      6250,
      'full',
      'business_payment_account',
      40000,
      'max_three_years'
    )
  );
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'immediate_expense_short_life', 'connected package asks useful life and can expense short life');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('2026-02-04', 'KAN-36 uncertain equipment', 5000, 1250, 'full', 'business_payment_account', NULL, NULL, 'SE', 'uncertain')::text
    ),
    'uncertain connection assessment fails closed'
  );

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-02-10',
      'KAN-36 standalone camera',
      25000,
      6250,
      'full',
      'business_payment_account'
    )
  );
  v_camera_asset_id := (v_result->>'asset_id')::uuid;
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'immediate_expense_small_value', 'standalone camera remains immediate expense');

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-02-11',
      'KAN-36 unrelated lens',
      20000,
      5000,
      'full',
      'business_payment_account'
    )
  );
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'immediate_expense_small_value', 'unrelated later lens remains standalone immediate expense');

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-02-12',
      'KAN-36 connected lens',
      20000,
      5000,
      'full',
      'business_payment_account',
      NULL,
      'more_than_three_years_or_unknown',
      'SE',
      'connected',
      ARRAY[v_camera_asset_id],
      NULL
    )
  );
  v_reclass_tx_id := (v_result->>'reclassification_transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'capitalized', 'known connected camera and lens over threshold is capitalized');
  PERFORM pg_temp.assert_eq((v_result->>'threshold_basis_amount')::numeric, 45000::numeric, 'server recomputes group basis from linked recorded purchases');
  PERFORM pg_temp.assert_eq((v_result->>'reclassification_amount')::numeric, 25000::numeric, 'prior direct expense is reclassified into asset basis');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_user_id, v_reclass_tx_id, '1220', 'debit'), 25000::numeric, 'reclassification debits fixed assets');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_user_id, v_reclass_tx_id, '5410', 'credit'), 25000::numeric, 'reclassification credits prior expense account');
  PERFORM pg_temp.assert_eq(
    (SELECT count(*)::integer FROM public.fixed_asset_events WHERE user_id = v_user_id AND event_type = 'reclassification' AND asset_id = v_camera_asset_id),
    1,
    'prior-expense reclassification is auditable'
  );

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-02-13',
      'KAN-36 first package delivery',
      25000,
      6250,
      'full',
      'business_payment_account',
      45000,
      'more_than_three_years_or_unknown'
    )
  );
  v_package_group_id := (v_result->>'acquisition_group_id')::uuid;
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'capitalized', 'first known package delivery uses known group basis');

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-02-14',
      'KAN-36 second package delivery',
      20000,
      5000,
      'full',
      'business_payment_account',
      20000,
      'more_than_three_years_or_unknown',
      'SE',
      'connected',
      ARRAY[]::uuid[],
      v_package_group_id
    )
  );
  PERFORM pg_temp.assert_eq((v_result->>'threshold_basis_amount')::numeric, 45000::numeric, 'client cannot lower group total below recorded linked basis');

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-03-01',
      'KAN-36 private paid no deduction capitalized',
      40000,
      10000,
      'none',
      'owner_private_payment',
      NULL,
      'more_than_three_years_or_unknown'
    )
  );
  v_tx_id := (v_result->>'transaction_id')::uuid;
  PERFORM pg_temp.assert_eq(v_result->>'decision_type', 'capitalized', 'large long-life asset is capitalized');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_user_id, v_tx_id, '1220', 'debit'), 50000::numeric, 'capitalized no-deduction value includes VAT');
  PERFORM pg_temp.assert_eq(pg_temp.journal_amount(v_user_id, v_tx_id, '2018', 'credit'), 50000::numeric, 'private payment credits owner equity role');

  PERFORM pg_temp.setup_user(v_locked_user_id, v_run_tag || '-locked');
  PERFORM pg_temp.set_auth(v_locked_user_id);
  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-10-01',
      'KAN-36 locked-year camera',
      25000,
      6250,
      'full',
      'business_payment_account'
    )
  );
  INSERT INTO public.closed_years (user_id, year, closed_at)
  VALUES (v_locked_user_id, 2026, now());
  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('2026-11-01', 'KAN-36 locked-year lens', 20000, 5000, 'full', 'business_payment_account', NULL, 'more_than_three_years_or_unknown', 'SE', 'connected', ARRAY[(v_result->>'asset_id')::uuid], NULL)::text
    ),
    'locked-year connected reclassification fails closed'
  );
  PERFORM pg_temp.set_auth(v_user_id);

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-04-01',
      'KAN-36 depreciation base',
      100000,
      25000,
      'full',
      'business_payment_account',
      NULL,
      'more_than_three_years_or_unknown'
    )
  );
  v_run := public.book_fixed_asset_depreciation_atomic(2026);
  PERFORM pg_temp.assert_eq(v_run->>'method', 'k1_main_rule_30_percent', 'large collective basis uses 30 percent main rule');
  PERFORM pg_temp.assert_eq((v_run->>'basis_amount')::numeric, 240000::numeric, 'collective basis includes capitalized and reclassified assets');
  PERFORM pg_temp.assert_eq((v_run->>'depreciation_amount')::numeric, 72000::numeric, '30 percent depreciation amount');
  v_replay := public.book_fixed_asset_depreciation_atomic(2026);
  PERFORM pg_temp.assert_eq((v_replay->>'idempotent_replay')::boolean, true, 'depreciation replay is marked');
  PERFORM pg_temp.assert_eq(v_replay->>'method', 'k1_main_rule_30_percent', 'depreciation replay returns method');
  PERFORM pg_temp.assert_eq((v_replay->>'rule_year')::integer, 2026, 'depreciation replay returns rule year');
  PERFORM pg_temp.assert_eq((v_replay->>'half_price_base_amount')::numeric, 29600::numeric, 'depreciation replay returns half PBB');
  PERFORM pg_temp.assert_true((v_replay->>'ver_nr') IS NOT NULL, 'depreciation replay returns ver nr');

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('2026-05-01', 'KAN-36 foreign goods', 5000, 1250, 'full', 'business_payment_account', NULL, NULL, 'DE')::text
    ),
    'foreign goods fail closed'
  );

  PERFORM pg_temp.assert_rejects(
    format(
      'select public.book_fixed_asset_acquisition_atomic(%L::jsonb)',
      pg_temp.asset_payload('2026-05-02', 'KAN-36 partial VAT', 5000, 1250, 'partial', 'business_payment_account')::text
    ),
    'partial VAT deduction fails closed'
  );

  PERFORM pg_temp.setup_user(v_small_user_id, v_run_tag || '-small');
  PERFORM pg_temp.set_auth(v_small_user_id);

  v_result := public.book_fixed_asset_acquisition_atomic(
    pg_temp.asset_payload(
      '2026-06-01',
      'KAN-36 exact half PBB capitalized',
      29600,
      7400,
      'full',
      'business_payment_account',
      NULL,
      'more_than_three_years_or_unknown'
    )
  );

  PERFORM pg_temp.assert_rejects(
    'select public.close_year_atomic(2026)',
    'year close requires depreciation for active capitalized assets'
  );

  v_run := public.book_fixed_asset_depreciation_atomic(2026);
  PERFORM pg_temp.assert_eq(v_run->>'method', 'k1_half_pbb_full_writeoff', 'collective basis at half PBB uses full write-off');
  PERFORM pg_temp.assert_eq((v_run->>'depreciation_amount')::numeric, 29600::numeric, 'full write-off uses <= half PBB');

  SELECT id INTO v_asset_id
  FROM public.fixed_assets
  WHERE user_id = v_small_user_id
  LIMIT 1;

  PERFORM pg_temp.assert_rejects(
    format('select public.retire_fixed_asset_atomic(%L::uuid, %L::date)', v_asset_id, '2026-12-31'),
    'capitalized retirement remains unsupported in KAN-36 V1'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-36 fixed asset rollback test completed.'
