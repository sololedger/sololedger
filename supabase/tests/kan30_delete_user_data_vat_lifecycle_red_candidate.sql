\set ON_ERROR_STOP on

-- KAN-30 GREEN rollback regression for delete_user_data_atomic VAT lifecycle coverage.
--
-- DO NOT RUN AGAINST ORDINARY/LIVE USER DATA.
--
-- Intended use against the production-derived local PostgreSQL regression DB:
--
--   psql "$DATABASE_URL" \
--     -f supabase/tests/kan30_delete_user_data_vat_lifecycle_red_candidate.sql
--
-- The relevant active migrations are replayed inside one outer transaction for
-- older local regression DBs. Everything ends with ROLLBACK.

BEGIN;

\if :{?skip_migration}
\else
\ir ../migrations/20260925050113_20260925_add_vat_account_classification.sql
\ir ../migrations/20260925070346_20260925_delegate_vat_concurrency_account.sql
\ir ../migrations/20260925124023_delegate_vat_close_account_classification.sql
\ir ../migrations/20260926132107_add_2645_vat_account_classification.sql
\ir ../migrations/20260926174535_add_vat_v2_reverse_charge_booking.sql
\ir ../migrations/20260927151231_add_payment_account_roles.sql
\ir ../migrations/20260927174627_harden_payment_account_roles_acl.sql
\ir ../migrations/20260929101500_add_vat_lifecycle_source_taxonomy.sql
\ir ../migrations/20260929143000_add_vat_settlement_foundation.sql
\ir ../migrations/20260929183000_add_tax_account_movement.sql
\ir ../migrations/20260930120000_audit1_p0_vat_lifecycle_semantics.sql
\ir ../migrations/20260930163000_kan30_delete_user_data_vat_lifecycle.sql
\ir ../migrations/20260930190000_kan31_idempotency_replay.sql
\endif

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_condition, false) THEN
    RAISE EXCEPTION 'KAN-30 assertion failed: %', p_message;
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
    RAISE EXCEPTION 'KAN-30 assertion failed: % (actual %, expected %)',
      p_message, p_actual, p_expected;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_rejects(
  p_sql text,
  p_sqlstate text,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rejected boolean := false;
  v_sqlstate text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_rejected := true;
    v_sqlstate := SQLSTATE;
  END;

  PERFORM pg_temp.assert_true(v_rejected, p_message || ' rejects');
  PERFORM pg_temp.assert_eq(v_sqlstate, p_sqlstate, p_message || ' SQLSTATE');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_delete_user_fixture(p_email_suffix text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id)
  VALUES (v_user_id);

  INSERT INTO public.profiles (
    id,
    email,
    company_name,
    role,
    vat_status,
    vat_period_type,
    vat_management_from
  ) VALUES (
    v_user_id,
    'kan30-' || p_email_suffix || '@example.invalid',
    'KAN-30 GREEN ' || p_email_suffix,
    'user',
    'registered',
    'quarter',
    date '1800-01-01'
  );

  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.add_legacy_rows(p_user_id uuid, p_tag text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.accounts (id, user_id, name, debit_account, credit_account)
  VALUES
    (p_tag || '-sales', p_user_id, 'KAN-30 sales', '1930', '3001'),
    (p_tag || '-costs', p_user_id, 'KAN-30 costs', '4535', '1930');

  INSERT INTO public.favorites (user_id, name, type, amount, vat_rate)
  VALUES (p_user_id, 'KAN-30 favorite', 'manual', 123, 25);

  INSERT INTO public.import_batches (user_id, filename, file_hash, status)
  VALUES (p_user_id, p_tag || '.se', p_tag || '-hash', 'completed');

  INSERT INTO public.closed_years (user_id, year)
  VALUES (p_user_id, 1799);

  INSERT INTO public.ver_nr_sequences (user_id, last_ver_nr)
  VALUES (p_user_id, 41);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_tx(
  p_user_id uuid,
  p_date date,
  p_source text,
  p_amount numeric,
  p_description text,
  p_ver_nr integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
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
    p_user_id,
    p_date,
    p_description,
    p_amount,
    NULL,
    NULL,
    true,
    p_source
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  ) VALUES
    (v_tx_id, p_ver_nr, '1930', p_amount, 0, p_description, p_date, p_user_id),
    (v_tx_id, p_ver_nr, '3001', 0, p_amount, p_description, p_date, p_user_id);

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.replace_journal(
  p_user_id uuid,
  p_tx_id uuid,
  p_date date,
  p_ver_nr integer,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE user_id = p_user_id
    AND transaction_id = p_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  ) VALUES
    (p_tx_id, p_ver_nr, p_debit_account, p_amount, 0, p_description, p_date, p_user_id),
    (p_tx_id, p_ver_nr, p_credit_account, 0, p_amount, p_description, p_date, p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.create_vat_period(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_status text,
  p_closing_amount numeric,
  p_closing_transaction_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  INSERT INTO public.vat_periods (
    user_id,
    period_start,
    period_end,
    period_type,
    status,
    source,
    closing_amount,
    closing_transaction_id,
    declared_at
  ) VALUES (
    p_user_id,
    p_period_start,
    p_period_end,
    'quarter',
    p_status,
    'sololedger',
    p_closing_amount,
    p_closing_transaction_id,
    CASE WHEN p_status = 'declared' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_period_id;

  RETURN v_period_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_known_app_rows(
  p_user_id uuid,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT
    (SELECT count(*) FROM public.accounts WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.closed_years WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.company_payment_account_roles WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.favorites WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.import_batches WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.journal_entries WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.profiles WHERE id = p_user_id)
    + (SELECT count(*) FROM public.tax_account_events WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.tax_account_movements WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.transactions WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.vat_v2_booking_idempotency WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.vat_audit_snapshots WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.vat_periods WHERE user_id = p_user_id)
    + (SELECT count(*) FROM public.ver_nr_sequences WHERE user_id = p_user_id)
  INTO v_count;

  PERFORM pg_temp.assert_eq(v_count, 0, p_message);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_delete_result_count(
  p_result jsonb,
  p_key text,
  p_expected integer,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.assert_eq(
    (p_result->'deleted'->>p_key)::integer,
    p_expected,
    p_message
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_no_delete_context(
  p_user_id uuid,
  p_message text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.delete_user_data_atomic_lifecycle_context
      WHERE backend_pid = pg_backend_pid()
        AND user_id = p_user_id
    ),
    0,
    p_message
  );
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_tx_id uuid;
  v_reuse_user_id uuid;
  v_reuse_tx_id uuid;
  v_reuse_period_id uuid;
  v_reuse_event_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := pg_temp.create_delete_user_fixture('closing');
  PERFORM pg_temp.add_legacy_rows(v_user_id, 'kan30-closing');

  v_tx_id := pg_temp.create_tx(v_user_id, date '1800-03-31', 'vat_closing', 100, 'KAN-30 VAT closing');
  PERFORM pg_temp.replace_journal(v_user_id, v_tx_id, date '1800-03-31', 42, '2611', '2650', 100, 'KAN-30 VAT closing');
  PERFORM pg_temp.create_vat_period(v_user_id, date '1800-01-01', date '1800-03-31', 'closed', 100, v_tx_id);

  v_result := public.delete_user_data_atomic(v_user_id);

  PERFORM pg_temp.assert_delete_result_count(v_result, 'vat_periods', 1, 'closing user VAT period deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'transactions', 1, 'closing user transaction deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'journal_entries', 2, 'closing user journal entries deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'accounts', 2, 'closing user accounts deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'favorites', 1, 'closing user favorites deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'import_batches', 1, 'closing user import batches deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'closed_years', 1, 'closing user closed years deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'ver_nr_sequences', 1, 'closing user ver nr sequence deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'profiles', 1, 'closing user profile deleted');
  PERFORM pg_temp.assert_no_delete_context(v_user_id, 'successful delete leaves no current-backend context');
  PERFORM pg_temp.assert_no_known_app_rows(v_user_id, 'closing user leaves no known app rows');

  v_reuse_user_id := pg_temp.create_delete_user_fixture('same-backend-after-success');
  v_reuse_tx_id := pg_temp.create_tx(
    v_reuse_user_id,
    date '1800-06-01',
    'vat_settlement',
    25,
    'KAN-30 same backend after success event'
  );
  PERFORM pg_temp.replace_journal(
    v_reuse_user_id,
    v_reuse_tx_id,
    date '1800-06-01',
    2,
    '2650',
    '2012',
    25,
    'KAN-30 same backend after success event'
  );
  v_reuse_period_id := pg_temp.create_vat_period(
    v_reuse_user_id,
    date '1800-04-01',
    date '1800-06-30',
    'declared',
    25,
    NULL
  );

  INSERT INTO public.tax_account_events (
    user_id,
    vat_period_id,
    transaction_id,
    event_kind,
    event_date,
    amount,
    idempotency_key
  ) VALUES (
    v_reuse_user_id,
    v_reuse_period_id,
    v_reuse_tx_id,
    'vat_debit',
    date '1800-06-01',
    25,
    gen_random_uuid()
  )
  RETURNING id INTO v_reuse_event_id;

  PERFORM pg_temp.assert_rejects(
    format('delete from public.tax_account_events where id = %L::uuid', v_reuse_event_id),
    '25006',
    'same backend after successful RPC has no inherited tax_account_events delete context'
  );
  PERFORM pg_temp.assert_eq(
    (SELECT count(*)::integer FROM public.tax_account_events WHERE id = v_reuse_event_id),
    1,
    'same backend after successful RPC direct event delete leaves row intact'
  );
  PERFORM pg_temp.assert_no_delete_context(
    v_reuse_user_id,
    'same backend after successful RPC direct event delete creates no context'
  );
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_tx_id uuid;
  v_period_id uuid;
  v_event_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := pg_temp.create_delete_user_fixture('event');
  v_tx_id := pg_temp.create_tx(v_user_id, date '1800-05-12', 'vat_settlement', 50, 'KAN-30 tax account event');
  PERFORM pg_temp.replace_journal(v_user_id, v_tx_id, date '1800-05-12', 1, '2650', '2012', 50, 'KAN-30 tax account event');
  v_period_id := pg_temp.create_vat_period(v_user_id, date '1800-01-01', date '1800-03-31', 'declared', 50, NULL);

  INSERT INTO public.tax_account_events (
    user_id,
    vat_period_id,
    transaction_id,
    event_kind,
    event_date,
    amount,
    idempotency_key
  ) VALUES (
    v_user_id,
    v_period_id,
    v_tx_id,
    'vat_debit',
    date '1800-05-12',
    50,
    gen_random_uuid()
  )
  RETURNING id INTO v_event_id;

  PERFORM pg_temp.assert_eq(
    has_table_privilege('authenticated', 'public.tax_account_events', 'DELETE'),
    false,
    'authenticated cannot directly delete tax_account_events'
  );
  PERFORM pg_temp.assert_rejects(
    format('delete from public.tax_account_events where id = %L::uuid', v_event_id),
    '25006',
    'direct tax_account_events delete outside user-deletion context'
  );

  v_result := public.delete_user_data_atomic(v_user_id);

  PERFORM pg_temp.assert_delete_result_count(v_result, 'tax_account_events', 1, 'event user event deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'vat_periods', 1, 'event user VAT period deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'transactions', 1, 'event user transaction deleted');
  PERFORM pg_temp.assert_no_delete_context(v_user_id, 'event user successful delete leaves no current-backend context');
  PERFORM pg_temp.assert_no_known_app_rows(v_user_id, 'event user leaves no known app rows');
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_tx_id uuid;
  v_period_id uuid;
  v_movement_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := pg_temp.create_delete_user_fixture('movement');
  v_tx_id := pg_temp.create_tx(v_user_id, date '1800-04-15', 'tax_account_movement', 75, 'KAN-30 tax account movement');
  PERFORM pg_temp.replace_journal(v_user_id, v_tx_id, date '1800-04-15', 1, '2012', '1930', 75, 'KAN-30 tax account movement');
  v_period_id := pg_temp.create_vat_period(v_user_id, date '1800-01-01', date '1800-03-31', 'closed', 75, NULL);

  INSERT INTO public.tax_account_movements (
    user_id,
    vat_period_id,
    transaction_id,
    movement_kind,
    movement_date,
    amount,
    payment_account_role,
    counter_account_number,
    idempotency_key
  ) VALUES (
    v_user_id,
    v_period_id,
    v_tx_id,
    'business_to_tax_account',
    date '1800-04-15',
    75,
    'business_payment_account',
    '1930',
    gen_random_uuid()
  )
  RETURNING id INTO v_movement_id;

  PERFORM pg_temp.assert_eq(
    has_table_privilege('authenticated', 'public.tax_account_movements', 'DELETE'),
    false,
    'authenticated cannot directly delete tax_account_movements'
  );
  PERFORM pg_temp.assert_rejects(
    format('delete from public.tax_account_movements where id = %L::uuid', v_movement_id),
    '25006',
    'direct tax_account_movements delete outside user-deletion context'
  );

  v_result := public.delete_user_data_atomic(v_user_id);

  PERFORM pg_temp.assert_delete_result_count(v_result, 'tax_account_movements', 1, 'movement user movement deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'vat_periods', 1, 'movement user VAT period deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'transactions', 1, 'movement user transaction deleted');
  PERFORM pg_temp.assert_no_delete_context(v_user_id, 'movement user successful delete leaves no current-backend context');
  PERFORM pg_temp.assert_no_known_app_rows(v_user_id, 'movement user leaves no known app rows');
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_period_id uuid;
  v_tx_id uuid;
  v_snapshot_id uuid;
  v_idempotency_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := pg_temp.create_delete_user_fixture('residual');
  PERFORM pg_temp.add_legacy_rows(v_user_id, 'kan30-residual');

  INSERT INTO public.company_payment_account_roles (user_id, role, account_number)
  VALUES (v_user_id, 'business_payment_account', '1930');

  v_period_id := pg_temp.create_vat_period(v_user_id, date '1801-01-01', date '1801-03-31', 'open', NULL, NULL);
  v_tx_id := pg_temp.create_tx(v_user_id, date '1801-02-01', 'vat_v2', 228, 'KAN-30 VAT audit snapshot');

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
    'kan30-green',
    'kan30-green',
    jsonb_build_object(
      'schemaVersion', 'vat-audit-snapshot-v1',
      'journalPlanVersion', 'vat-journal-plan-v1',
      'treatmentCode', 'EU_SERVICE_REVERSE_CHARGE',
      'ruleVersion', 'kan30-green',
      'factsVersion', 'kan30-green'
    )
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO public.vat_v2_booking_idempotency (
    user_id,
    idempotency_key,
    request_canonical,
    transaction_id,
    vat_audit_snapshot_id,
    result
  ) VALUES (
    v_user_id,
    gen_random_uuid(),
    jsonb_build_object(
      'date', date '1801-02-01',
      'description', 'KAN-30 VAT audit snapshot',
      'treatment_code', 'EU_SERVICE_REVERSE_CHARGE',
      'payment_account_number', '1930'
    ),
    v_tx_id,
    v_snapshot_id,
    jsonb_build_object(
      'success', true,
      'idempotent_replay', false,
      'transaction_id', v_tx_id,
      'ver_nr', 1,
      'vat_audit_snapshot_id', v_snapshot_id
    )
  )
  RETURNING id INTO v_idempotency_id;

  v_result := public.delete_user_data_atomic(v_user_id);

  PERFORM pg_temp.assert_delete_result_count(v_result, 'vat_v2_booking_idempotency', 1, 'residual user VAT V2 idempotency row deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'vat_audit_snapshots', 1, 'residual user audit snapshot deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'vat_periods', 1, 'residual user VAT period deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'company_payment_account_roles', 1, 'residual user payment role deleted');
  PERFORM pg_temp.assert_delete_result_count(v_result, 'profiles', 1, 'residual user profile deleted');
  PERFORM pg_temp.assert_no_delete_context(v_user_id, 'residual user successful delete leaves no current-backend context');
  PERFORM pg_temp.assert_no_known_app_rows(v_user_id, 'residual user leaves no known app rows');
  PERFORM pg_temp.assert_eq((SELECT count(*)::integer FROM public.vat_v2_booking_idempotency WHERE id = v_idempotency_id), 0, 'VAT V2 idempotency row is gone');
  PERFORM pg_temp.assert_eq((SELECT count(*)::integer FROM public.vat_audit_snapshots WHERE id = v_snapshot_id), 0, 'audit snapshot row is gone');
  PERFORM pg_temp.assert_eq((SELECT count(*)::integer FROM public.vat_periods WHERE id = v_period_id), 0, 'open VAT period row is gone');
END;
$$;

DO $$
DECLARE
  v_context_user_id uuid;
  v_other_user_id uuid;
  v_other_tx_id uuid;
  v_other_period_id uuid;
  v_other_event_id uuid;
BEGIN
  v_context_user_id := pg_temp.create_delete_user_fixture('context-user-a');
  v_other_user_id := pg_temp.create_delete_user_fixture('context-user-b');
  v_other_tx_id := pg_temp.create_tx(
    v_other_user_id,
    date '1800-07-01',
    'vat_settlement',
    35,
    'KAN-30 cross-user event'
  );
  PERFORM pg_temp.replace_journal(
    v_other_user_id,
    v_other_tx_id,
    date '1800-07-01',
    3,
    '2650',
    '2012',
    35,
    'KAN-30 cross-user event'
  );
  v_other_period_id := pg_temp.create_vat_period(
    v_other_user_id,
    date '1800-07-01',
    date '1800-09-30',
    'declared',
    35,
    NULL
  );

  INSERT INTO public.tax_account_events (
    user_id,
    vat_period_id,
    transaction_id,
    event_kind,
    event_date,
    amount,
    idempotency_key
  ) VALUES (
    v_other_user_id,
    v_other_period_id,
    v_other_tx_id,
    'vat_debit',
    date '1800-07-01',
    35,
    gen_random_uuid()
  )
  RETURNING id INTO v_other_event_id;

  INSERT INTO public.delete_user_data_atomic_lifecycle_context (backend_pid, user_id)
  VALUES (pg_backend_pid(), v_context_user_id);

  PERFORM pg_temp.assert_eq(
    (
      SELECT count(*)::integer
      FROM public.delete_user_data_atomic_lifecycle_context
      WHERE backend_pid = pg_backend_pid()
        AND user_id = v_context_user_id
    ),
    1,
    'privileged regression can create a narrow context row for user A'
  );
  PERFORM pg_temp.assert_rejects(
    format('delete from public.tax_account_events where id = %L::uuid', v_other_event_id),
    '25006',
    'context for user A cannot authorize tax_account_events delete for user B'
  );
  PERFORM pg_temp.assert_eq(
    (SELECT count(*)::integer FROM public.tax_account_events WHERE id = v_other_event_id),
    1,
    'cross-user rejected event delete leaves row intact'
  );

  DELETE FROM public.delete_user_data_atomic_lifecycle_context
  WHERE backend_pid = pg_backend_pid()
    AND user_id = v_context_user_id;

  PERFORM pg_temp.assert_no_delete_context(v_context_user_id, 'cross-user context row removed by test');
END;
$$;

CREATE TABLE public.kan30_profile_delete_blocker (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT
);

DO $$
DECLARE
  v_user_id uuid;
  v_tx_id uuid;
  v_period_id uuid;
  v_movement_id uuid;
BEGIN
  v_user_id := pg_temp.create_delete_user_fixture('atomicity');
  v_tx_id := pg_temp.create_tx(v_user_id, date '1800-04-15', 'tax_account_movement', 75, 'KAN-30 atomicity movement');
  PERFORM pg_temp.replace_journal(v_user_id, v_tx_id, date '1800-04-15', 1, '2012', '1930', 75, 'KAN-30 atomicity movement');
  v_period_id := pg_temp.create_vat_period(v_user_id, date '1800-01-01', date '1800-03-31', 'closed', 75, NULL);

  INSERT INTO public.tax_account_movements (
    user_id,
    vat_period_id,
    transaction_id,
    movement_kind,
    movement_date,
    amount,
    payment_account_role,
    counter_account_number,
    idempotency_key
  ) VALUES (
    v_user_id,
    v_period_id,
    v_tx_id,
    'business_to_tax_account',
    date '1800-04-15',
    75,
    'business_payment_account',
    '1930',
    gen_random_uuid()
  )
  RETURNING id INTO v_movement_id;

  INSERT INTO public.kan30_profile_delete_blocker (user_id)
  VALUES (v_user_id);

  BEGIN
    PERFORM public.delete_user_data_atomic(v_user_id);
    RAISE EXCEPTION 'KAN-30 assertion failed: artificial profile blocker did not reject deletion';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  PERFORM pg_temp.assert_eq((SELECT count(*)::integer FROM public.profiles WHERE id = v_user_id), 1, 'atomicity profile remains after blocked delete');
  PERFORM pg_temp.assert_eq((SELECT count(*)::integer FROM public.tax_account_movements WHERE id = v_movement_id), 1, 'atomicity movement remains after blocked delete');
  PERFORM pg_temp.assert_eq((SELECT count(*)::integer FROM public.vat_periods WHERE id = v_period_id), 1, 'atomicity VAT period remains after blocked delete');
  PERFORM pg_temp.assert_eq((SELECT count(*)::integer FROM public.transactions WHERE id = v_tx_id), 1, 'atomicity transaction remains after blocked delete');
  PERFORM pg_temp.assert_no_delete_context(v_user_id, 'failed delete leaves no current-backend context');
  PERFORM pg_temp.assert_rejects(
    format('delete from public.tax_account_movements where id = %L::uuid', v_movement_id),
    '25006',
    'same backend after failed RPC has no inherited tax_account_movements delete context'
  );
  PERFORM pg_temp.assert_eq(
    (SELECT count(*)::integer FROM public.tax_account_movements WHERE id = v_movement_id),
    1,
    'same backend after failed RPC direct movement delete leaves row intact'
  );
  PERFORM pg_temp.assert_no_delete_context(
    v_user_id,
    'same backend after failed RPC direct movement delete creates no context'
  );
END;
$$;

ROLLBACK;

\echo 'KAN-30 delete_user_data_atomic VAT lifecycle GREEN rollback test completed with explicit ROLLBACK.'
