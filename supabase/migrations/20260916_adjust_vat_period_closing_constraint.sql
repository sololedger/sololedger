BEGIN;

-- ============================================================
-- VAT periods – allow closed periods without a closing journal
-- when there was no VAT activity to reclassify.
--
-- Semantics:
--
-- open
--   No closing snapshot exists.
--
-- closed
--   closing_amount is known.
--   closing_transaction_id may be NULL when the controlled
--   closing operation found no VAT account activity requiring
--   a journal entry.
--
-- declared
--   Same accounting state as closed, but the VAT return has
--   subsequently been confirmed as submitted.
--
-- IMPORTANT:
-- A NULL closing_transaction_id is not decided by the client.
-- The future close_vat_period_atomic RPC will determine whether
-- VAT activity existed and will create a closing transaction
-- whenever 261x/262x/263x/2641 actually require reclassification.
-- ============================================================

ALTER TABLE public.vat_periods
  DROP CONSTRAINT vat_periods_status_consistency;

ALTER TABLE public.vat_periods
  ADD CONSTRAINT vat_periods_status_consistency
  CHECK (
    (
      status = 'open'
      AND closing_amount IS NULL
      AND closing_transaction_id IS NULL
      AND declared_at IS NULL
    )
    OR
    (
      status = 'closed'
      AND closing_amount IS NOT NULL
      AND declared_at IS NULL
    )
    OR
    (
      status = 'declared'
      AND closing_amount IS NOT NULL
      AND declared_at IS NOT NULL
    )
  );

COMMENT ON COLUMN public.vat_periods.closing_transaction_id IS
  'Transaction containing the VAT closing reclassification to account 2650. NULL is allowed for closed/declared periods when the controlled closing operation found no VAT account activity requiring a journal entry.';

COMMIT;