-- ============================================================================
-- SoloLedger
-- VAT periods – V1 foundation
--
-- Creates metadata/state storage for VAT reporting periods.
--
-- Important:
-- - Journal entries remain the accounting source of truth.
-- - This migration does NOT create VAT closing entries.
-- - This migration does NOT modify historical/imported bookkeeping.
-- - Mutations of vat_periods will later be performed through controlled RPCs.
-- ============================================================================

BEGIN;

CREATE TABLE public.vat_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,

  period_start date NOT NULL,
  period_end date NOT NULL,

  period_type text NOT NULL
    CHECK (period_type IN ('month', 'quarter', 'year')),

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'declared')),

  source text NOT NULL DEFAULT 'sololedger'
    CHECK (source IN ('sololedger', 'imported_history')),

  -- Snapshot of the VAT net amount when the period is closed.
  --
  -- Sign convention:
  --   > 0 = VAT payable to Skatteverket
  --   < 0 = VAT receivable/refund
  --   = 0 = no net VAT payable/receivable
  closing_amount numeric NULL,

  -- Transaction containing the VAT reclassification to account 2650.
  closing_transaction_id uuid NULL
    REFERENCES public.transactions(id) ON DELETE RESTRICT,

  -- Actual time when the user confirms that the VAT return was submitted.
  -- This is NOT the accounting date of the VAT closing transaction.
  declared_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vat_periods_valid_date_range
    CHECK (period_end >= period_start),

  CONSTRAINT vat_periods_unique_period
    UNIQUE (user_id, period_start, period_end),

  CONSTRAINT vat_periods_status_consistency
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
        AND closing_transaction_id IS NOT NULL
        AND declared_at IS NULL
      )
      OR
      (
        status = 'declared'
        AND closing_amount IS NOT NULL
        AND closing_transaction_id IS NOT NULL
        AND declared_at IS NOT NULL
      )
    )
);

COMMENT ON TABLE public.vat_periods IS
  'VAT reporting period metadata and state. Accounting journal entries remain the source of truth.';

COMMENT ON COLUMN public.vat_periods.period_type IS
  'VAT reporting frequency for this period: month, quarter, or year.';

COMMENT ON COLUMN public.vat_periods.status IS
  'open = not VAT-closed, closed = VAT reclassified to 2650, declared = VAT return confirmed as submitted.';

COMMENT ON COLUMN public.vat_periods.source IS
  'sololedger = period managed by SoloLedger; imported_history = historical/imported period not managed as a normal SoloLedger VAT period.';

COMMENT ON COLUMN public.vat_periods.closing_amount IS
  'Snapshot of net VAT when the period is closed. Positive = VAT payable to Skatteverket; negative = VAT receivable/refund; zero = no net VAT.';

COMMENT ON COLUMN public.vat_periods.closing_transaction_id IS
  'Transaction containing the accounting reclassification of VAT accounts to account 2650.';

COMMENT ON COLUMN public.vat_periods.declared_at IS
  'Actual timestamp when the user confirmed that the VAT return was submitted. Not the accounting date of the VAT closing transaction.';

COMMENT ON COLUMN public.vat_periods.updated_at IS
  'Last state update timestamp. Future controlled mutation RPCs must set this explicitly.';


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.vat_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own VAT periods"
ON public.vat_periods
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- ============================================================================
-- Privileges
--
-- authenticated may read its own rows through RLS.
-- It must not INSERT / UPDATE / DELETE vat_periods directly.
-- Future state changes will go through controlled SECURITY DEFINER RPCs.
-- ============================================================================

REVOKE ALL ON TABLE public.vat_periods FROM anon;
REVOKE ALL ON TABLE public.vat_periods FROM authenticated;

GRANT SELECT ON TABLE public.vat_periods TO authenticated;

-- Keep service-role access consistent with backend/system usage.
GRANT ALL ON TABLE public.vat_periods TO service_role;

COMMIT;