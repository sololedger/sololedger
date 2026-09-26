BEGIN;

-- ============================================================
-- Add vat_closing as a controlled transaction source.
--
-- vat_closing represents a real accounting transaction created
-- by SoloLedger when a VAT period is closed.
--
-- The actual transaction creation will be implemented through
-- the controlled VAT closing RPC in a later migration.
-- ============================================================

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
        'vat_closing'::text
      ]
    )
  );

COMMENT ON COLUMN public.transactions.source IS
  'Origin of the transaction. vat_closing is reserved for SoloLedger-created VAT period closing transactions.';

COMMIT;