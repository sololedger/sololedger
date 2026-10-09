\set ON_ERROR_STOP on

-- Local-only regression schema prerequisite.
--
-- The production-derived local regression DB can lack Supabase migration
-- ledger rows even when most later objects exist. This file makes the local
-- test schema match the current migration-chain transaction source taxonomy
-- before write-capable rollback fixtures are executed.

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
    INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.transactions'::regclass
    AND conname = 'transactions_source_check';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'transactions_source_check saknas i lokal regressionstestdatabas.';
  END IF;

  IF v_definition NOT LIKE '%customer_invoice%'
     OR v_definition NOT LIKE '%fixed_asset%'
     OR v_definition NOT LIKE '%fixed_asset_reclassification%'
     OR v_definition NOT LIKE '%fixed_asset_depreciation%' THEN
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
  END IF;

  PERFORM 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'transaction_source_classification'
    AND pg_get_functiondef(p.oid) LIKE '%customer_invoice%'
    AND pg_get_functiondef(p.oid) LIKE '%fixed_asset%';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_source_classification saknar aktuell customer_invoice/fixed_asset-taxonomi.';
  END IF;

  IF to_regclass('public.customer_invoices') IS NULL
     OR to_regclass('public.fixed_assets') IS NULL
     OR to_regclass('public.fixed_asset_depreciation_runs') IS NULL
     OR to_regprocedure('public.create_customer_invoice_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.book_fixed_asset_acquisition_atomic(jsonb)') IS NULL
     OR to_regprocedure('public.customer_invoice_year_end_fiscal_year(date,date)') IS NULL
     OR to_regprocedure('public.resolve_purchase_input_vat_deduction(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Lokal regressionstestdatabas saknar nödvändiga aktuella KAN-36/KAN-46/KAN-52/KAN-55-objekt.';
  END IF;
END;
$$;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.transactions'::regclass
  AND conname = 'transactions_source_check';
