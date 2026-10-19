-- KAN-75: one transaction-scoped owner gate, before all existing lock domains.
-- Shared: supported write RPCs. Exclusive: close year and atomic user deletion.
-- No accounting formulas, source classifications, SIE rules, or historical SQL change.
-- Exact reviewed preimages prevent silently editing an unexpected live definition.

CREATE FUNCTION public.lock_accounting_year_boundary(p_user_id uuid, p_exclusive boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $gate$
DECLARE
  v_key bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen giltig användarkontext för årslåset.' USING ERRCODE = '28000';
  END IF;
  -- Following SQL commands must get a fresh snapshot after any lock wait.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Årslåsskyddet kräver read committed. Starta om transaktionen.' USING ERRCODE = '25001';
  END IF;
  v_key := hashtextextended('sololedger:accounting_year_boundary:' || p_user_id::text, 0);
  -- Avoid shared-to-exclusive upgrade deadlocks in multi-RPC SQL transactions.
  -- Normal API calls each have their own transaction. Nested shared calls are safe.
  IF p_exclusive AND EXISTS (
    SELECT 1 FROM pg_locks
    WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted
      AND classid = ((v_key >> 32) & 4294967295)::oid
      AND objid = (v_key & 4294967295)::oid AND objsubid = 1 AND mode = 'ShareLock'
  ) THEN
    RAISE EXCEPTION 'Årslås eller radering måste köras i en egen transaktion efter bokföringsskrivningen.' USING ERRCODE = '25001';
  END IF;
  IF p_exclusive THEN
    PERFORM pg_advisory_xact_lock(v_key);
  ELSE
    PERFORM pg_advisory_xact_lock_shared(v_key);
  END IF;
END;
$gate$;
REVOKE ALL ON FUNCTION public.lock_accounting_year_boundary(uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.lock_accounting_year_boundary(uuid, boolean) IS
  'KAN-75 private gate: owner gate -> existing advisory locks -> row locks -> protected checks/writes. Only SECURITY DEFINER entry points call this helper.';

DO $migration$
DECLARE
  r record;
  v_oid regprocedure;
  v_definition text;
  v_original text;
  v_marker text;
  v_anchor text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.book_transaction_atomic(jsonb)', 'fc9491f29bbd6d334ecd77be2e2bbf22', 'auth.uid()', false),
    ('public.book_periodized_transaction_atomic(jsonb)', '12af2588de7cb9a6831c9556124330c9', 'auth.uid()', false),
    ('public.create_correction_transaction_atomic(uuid)', '45aed6d32127b00fcaa8a64ca76df8de', 'auth.uid()', false),
    ('public.update_transaction_safe(uuid,jsonb)', 'ba0d4032042fb71e37fc692d64cc13a3', 'auth.uid()', false),
    ('public.close_year_atomic(integer)', '22ad704b7acfdf389e4aa89a04088a13', 'auth.uid()', true),
    ('public.ensure_vat_periods(date)', '108f02246ecb548694808b124d809edc', 'auth.uid()', false),
    ('public.close_vat_period_atomic(uuid)', '01eaf545c93b13e0404574ab5502c521', 'auth.uid()', false),
    ('public.declare_vat_period_atomic(uuid,date)', 'caf61d90a331e46db33951c965376a16', 'auth.uid()', false),
    ('public.record_tax_account_movement_atomic(text,date,numeric,uuid,uuid)', 'efbf001d54cbf7f6969d8f56927e50be', 'auth.uid()', false),
    ('public.record_vat_settlement_atomic(uuid,date,numeric,uuid)', '763ec602d02a34e28f23f4f5c8a2eb1d', 'auth.uid()', false),
    ('public.create_customer_invoice_atomic(jsonb)', '3f3201d5ceae7ebafce47ce3dc7038e7', 'auth.uid()', false),
    ('public.update_customer_invoice_unbooked_atomic(uuid,jsonb)', '95636e8d8849abe787dd507d26726acb', 'auth.uid()', false),
    ('public.record_customer_invoice_payment_atomic(uuid,date,uuid)', '52e536470e274ff1a49169ac0ec0bd89', 'auth.uid()', false),
    ('public.settle_customer_invoice_receivable_atomic(uuid,date,uuid)', 'd5672fcce3f2726bd5bb3c0d8eed2be2', 'auth.uid()', false),
    ('public.undo_customer_invoice_payment_atomic(uuid,uuid)', 'f37d9f8e9b955f975b8b85d6230b4290', 'auth.uid()', false),
    ('public.book_customer_invoice_year_end_receivable_atomic(uuid,integer,uuid)', '1d00e76f782c7272e676c81cb118b4e9', 'auth.uid()', false),
    ('public.book_fixed_asset_acquisition_atomic(jsonb)', 'f3f775a43e28110f8f53e55dc475c9df', 'auth.uid()', false),
    ('public.book_fixed_asset_depreciation_atomic(integer)', '76d158f1856ff3ef95bfd220347d3155', 'auth.uid()', false),
    ('public.retire_fixed_asset_atomic(uuid,date,text)', 'ad111541bbf2914ce5bf6b5c7cbcb86d', 'auth.uid()', false),
    ('public.book_vat_v2_eu_service_reverse_charge_atomic(jsonb)', '586083fee225e837d8028276fb15e887', 'auth.uid()', false),
    ('public.import_sie_batch(jsonb)', 'a3d7218f0aab8042b1b75e1f7d625c10', 'auth.uid()', false),
    ('public.undo_sie_import_atomic(uuid)', '140dcb022d58c0effb95a7b12ede5427', 'auth.uid()', false),
    ('public.initialize_first_vat_year_period(uuid,date,date,boolean)', '7e0d9c2a3899eff898ad37300ea70aa0', 'p_user_id', false),
    ('public.review_ne_legacy_sale(uuid,text,text)', 'dd641916ad0e5910e6b0e2dc32560b5c', 'auth.uid()', false),
    ('public.delete_user_data_atomic(uuid)', 'e2d6c14ec80c70c10bbbd4a14ad54a80', 'p_user_id', true)
  ) AS reviewed(signature, preimage_md5, owner_expression, exclusive_gate)
  LOOP
    v_oid := to_regprocedure(r.signature);
    IF v_oid IS NULL THEN RAISE EXCEPTION 'KAN-75 missing RPC: %', r.signature; END IF;
    SELECT pg_get_functiondef(v_oid) INTO v_original;
    -- Ignore Windows transport line endings; no SQL/body whitespace is discarded.
    IF md5(replace(v_original, E'\r', '')) <> r.preimage_md5 THEN
      RAISE EXCEPTION 'KAN-75 unexpected RPC definition: %. Reinspect live before proceeding.', r.signature;
    END IF;
    v_marker := format('  PERFORM public.lock_accounting_year_boundary(%s, %s); -- KAN-75: first lock domain', r.owner_expression, CASE WHEN r.exclusive_gate THEN 'true' ELSE 'false' END);
    -- Preserve signatures, owner, ACL, settings and every existing body statement.
    -- Matching the first outer BEGIN is safe only for the exact reviewed preimages.
    v_anchor := substring(v_original from E'(?i)\nBEGIN\r*\n');
    IF v_anchor IS NULL THEN RAISE EXCEPTION 'KAN-75 outer BEGIN missing: %', r.signature; END IF;
    v_definition := overlay(v_original placing v_marker || E'\n' from strpos(v_original,v_anchor)+length(v_anchor) for 0);
    IF v_definition = v_original OR strpos(v_definition, v_marker) = 0 THEN
      RAISE EXCEPTION 'KAN-75 outer BEGIN not found: %', r.signature;
    END IF;

    -- New invoices are part of close_year_atomic's unpaid-invoice checks.
    -- After waiting for close, creation must not add a blocker to a closed year.
    IF r.signature = 'public.create_customer_invoice_atomic(jsonb)' THEN
      v_anchor := '  INSERT INTO public.customer_invoices (';
      IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'KAN-75 invoice anchor missing'; END IF;
      v_definition := replace(v_definition,v_anchor,$guard$
  IF EXISTS (
    SELECT 1 FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = public.customer_invoice_year_end_fiscal_year(v_invoice_date, v_service_date)
  ) THEN
    RAISE EXCEPTION 'Räkenskapsåret för kundfakturan är låst för ändringar.' USING ERRCODE = '23514';
  END IF;

$guard$ || v_anchor);
    END IF;
    -- Moving an old invoice out of a locked year also changes its close basis.
    -- The existing target-year guard stays unchanged.
    IF r.signature = 'public.update_customer_invoice_unbooked_atomic(uuid,jsonb)' THEN
      v_anchor := '  v_target_year := public.customer_invoice_year_end_fiscal_year(v_invoice_date, v_service_date);';
      IF strpos(v_definition,v_anchor)=0 THEN RAISE EXCEPTION 'KAN-75 invoice update anchor missing'; END IF;
      v_definition := replace(v_definition,v_anchor,$guard$
  IF EXISTS (
    SELECT 1 FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = public.customer_invoice_year_end_fiscal_year(v_invoice.invoice_date, v_invoice.service_date)
  ) THEN
    RAISE EXCEPTION 'Kundfakturans ursprungliga räkenskapsår är låst för ändringar.' USING ERRCODE = '23514';
  END IF;

$guard$ || v_anchor);
    END IF;
    EXECUTE v_definition;
  END LOOP;
END;
$migration$;
