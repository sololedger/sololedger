-- KAN-27 VAT settlement / tax-account event foundation.
--
-- Scope:
--   * Activate transactions.source = 'vat_settlement'.
--   * Add immutable semantic settlement event metadata.
--   * Add a narrow settlement RPC that derives the accounting journal.
--   * Keep ordinary VAT guards unchanged.

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
        'vat_settlement'::text
      ]
    )
  );

COMMENT ON COLUMN public.transactions.source IS
  'Origin of the transaction. vat_closing and vat_settlement are reserved for controlled SoloLedger VAT lifecycle RPCs. vat_v2 is reserved for controlled VAT V2 booking RPCs.';

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
      'vat_settlement'
    ]::text[]), false) AS is_current_source,
    false AS is_reserved_future_source,
    coalesce(p_source = ANY (ARRAY[
      'sie_import',
      'sie_opening_balance',
      'sie_import_undo',
      'vat_closing',
      'vat_v2',
      'vat_settlement'
    ]::text[]), false) AS is_system_managed,
    coalesce(p_source = ANY (ARRAY[
      'vat_closing',
      'vat_settlement'
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
      ELSE false
    END AS is_ordinary_vat_guard_activity;
$function$;

COMMENT ON FUNCTION public.transaction_source_classification(text)
  IS 'Central SoloLedger transaction source taxonomy for DB-side VAT lifecycle/source guards. vat_settlement is an active controlled VAT lifecycle source and is not generically editable/correctable.';

CREATE TABLE public.tax_account_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vat_period_id uuid NOT NULL REFERENCES public.vat_periods(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  event_kind text NOT NULL,
  event_date date NOT NULL,
  amount numeric(15,2) NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_account_events_event_kind_check
    CHECK (event_kind IN ('vat_debit', 'vat_credit')),
  CONSTRAINT tax_account_events_amount_check
    CHECK (amount > 0 AND amount = round(amount, 2)),
  CONSTRAINT tax_account_events_transaction_unique
    UNIQUE (transaction_id),
  CONSTRAINT tax_account_events_idempotency_unique
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX tax_account_events_user_period_idx
  ON public.tax_account_events (user_id, vat_period_id);

COMMENT ON TABLE public.tax_account_events IS
  'Immutable semantic tax-account lifecycle events linked to accounting truth in transactions and journal_entries.';
COMMENT ON COLUMN public.tax_account_events.event_kind IS
  'vat_debit = Skatteverket debited VAT on the tax account; vat_credit = Skatteverket credited VAT/refund on the tax account.';
COMMENT ON COLUMN public.tax_account_events.amount IS
  'Semantic event metadata created atomically by the settlement RPC. The accounting source of truth remains the linked transaction journal.';
COMMENT ON COLUMN public.tax_account_events.idempotency_key IS
  'Caller-provided retry key. Reuse with identical canonical facts returns the existing event; conflicting reuse is rejected.';

ALTER TABLE public.tax_account_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tax account events"
ON public.tax_account_events
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL PRIVILEGES ON TABLE public.tax_account_events FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.tax_account_events FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.tax_account_events FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.tax_account_events FROM service_role;

GRANT SELECT ON TABLE public.tax_account_events TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.tax_account_events TO service_role;

CREATE OR REPLACE FUNCTION public.validate_tax_account_event_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period public.vat_periods%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_row_count integer;
  v_2012_count integer;
  v_2650_count integer;
  v_bad_date_count integer;
  v_total_debit numeric;
  v_total_credit numeric;
  v_2012_debit numeric;
  v_2012_credit numeric;
  v_2650_debit numeric;
  v_2650_credit numeric;
BEGIN
  SELECT *
    INTO v_period
  FROM public.vat_periods
  WHERE id = NEW.vat_period_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tax-account event refers to a missing VAT period.'
      USING ERRCODE = '23503';
  END IF;

  SELECT *
    INTO v_tx
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tax-account event refers to a missing transaction.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_period.user_id
     OR NEW.user_id IS DISTINCT FROM v_tx.user_id THEN
    RAISE EXCEPTION 'Tax-account event tenant linkage is inconsistent.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.source <> 'sololedger'
     OR v_period.status <> 'declared'
     OR v_period.closing_amount IS NULL
     OR v_period.closing_amount = 0 THEN
    RAISE EXCEPTION 'Tax-account event is linked to an ineligible VAT period.'
      USING ERRCODE = '23514';
  END IF;

  IF (v_period.closing_amount > 0 AND NEW.event_kind <> 'vat_debit')
     OR (v_period.closing_amount < 0 AND NEW.event_kind <> 'vat_credit') THEN
    RAISE EXCEPTION 'Tax-account event kind does not match VAT period direction.'
      USING ERRCODE = '23514';
  END IF;

  IF v_tx.source <> 'vat_settlement'
     OR coalesce(v_tx.booked, false) IS NOT TRUE
     OR v_tx.date IS DISTINCT FROM NEW.event_date
     OR v_tx.amount IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'Tax-account event transaction metadata is inconsistent.'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE account_number = '2012')::integer,
    count(*) FILTER (WHERE account_number = '2650')::integer,
    count(*) FILTER (WHERE date IS DISTINCT FROM NEW.event_date)::integer,
    coalesce(sum(coalesce(debit, 0)), 0)::numeric,
    coalesce(sum(coalesce(credit, 0)), 0)::numeric,
    coalesce(sum(coalesce(debit, 0)) FILTER (WHERE account_number = '2012'), 0)::numeric,
    coalesce(sum(coalesce(credit, 0)) FILTER (WHERE account_number = '2012'), 0)::numeric,
    coalesce(sum(coalesce(debit, 0)) FILTER (WHERE account_number = '2650'), 0)::numeric,
    coalesce(sum(coalesce(credit, 0)) FILTER (WHERE account_number = '2650'), 0)::numeric
  INTO
    v_row_count,
    v_2012_count,
    v_2650_count,
    v_bad_date_count,
    v_total_debit,
    v_total_credit,
    v_2012_debit,
    v_2012_credit,
    v_2650_debit,
    v_2650_credit
  FROM public.journal_entries
  WHERE transaction_id = NEW.transaction_id
    AND user_id = NEW.user_id;

  IF v_row_count <> 2
     OR v_2012_count <> 1
     OR v_2650_count <> 1
     OR v_bad_date_count <> 0
     OR v_total_debit IS DISTINCT FROM NEW.amount
     OR v_total_credit IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'Tax-account event journal shape is inconsistent.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.event_kind = 'vat_debit' THEN
    IF v_2650_debit IS DISTINCT FROM NEW.amount
       OR v_2650_credit IS DISTINCT FROM 0::numeric
       OR v_2012_debit IS DISTINCT FROM 0::numeric
       OR v_2012_credit IS DISTINCT FROM NEW.amount THEN
      RAISE EXCEPTION 'VAT debit settlement journal is inconsistent.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_2012_debit IS DISTINCT FROM NEW.amount
       OR v_2012_credit IS DISTINCT FROM 0::numeric
       OR v_2650_debit IS DISTINCT FROM 0::numeric
       OR v_2650_credit IS DISTINCT FROM NEW.amount THEN
      RAISE EXCEPTION 'VAT credit settlement journal is inconsistent.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_tax_account_event_consistency
BEFORE INSERT OR UPDATE ON public.tax_account_events
FOR EACH ROW
EXECUTE FUNCTION public.validate_tax_account_event_consistency();

COMMENT ON FUNCTION public.validate_tax_account_event_consistency()
  IS 'Validates that tax_account_events are tenant-consistent and exactly match the linked vat_settlement transaction journal.';

REVOKE ALL ON FUNCTION public.validate_tax_account_event_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tax_account_event_consistency() FROM anon;
REVOKE ALL ON FUNCTION public.validate_tax_account_event_consistency() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_tax_account_event_consistency() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_tax_account_event_consistency() TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_tax_account_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Tax-account events are immutable. Create a new settlement event instead.'
    USING ERRCODE = '25006';
END;
$function$;

CREATE TRIGGER prevent_tax_account_event_mutation
BEFORE UPDATE OR DELETE ON public.tax_account_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tax_account_event_mutation();

COMMENT ON FUNCTION public.prevent_tax_account_event_mutation()
  IS 'Prevents in-place mutation of tax_account_events. Settlement history is append-only; corrections require explicit future lifecycle behavior.';

REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_tax_account_event_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_event_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_event_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.record_vat_settlement_atomic(
  p_vat_period_id uuid,
  p_event_date date,
  p_amount numeric,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.tax_account_events%ROWTYPE;
  v_period public.vat_periods%ROWTYPE;
  v_closing_tx public.transactions%ROWTYPE;
  v_event_kind text;
  v_ver_nr integer;
  v_tx_id uuid;
  v_event_id uuid;
  v_cumulative_settled numeric;
  v_remaining_amount numeric;
  v_settlement_state text;
  v_replay_ver_nr integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_vat_period_id IS NULL THEN
    RAISE EXCEPTION 'Momsperiod saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_event_date IS NULL THEN
    RAISE EXCEPTION 'Datum på skattekontot saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_event_date > current_date THEN
    RAISE EXCEPTION 'Datum på skattekontot kan inte vara i framtiden.'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount IS DISTINCT FROM round(p_amount, 2) THEN
    RAISE EXCEPTION 'Avräkningsbeloppet måste vara positivt och avrundat till två decimaler.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from p_event_date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_event_date)::integer
      USING ERRCODE = '23514';
  END IF;

  -- The settlement writes 2650, so use the same VAT-month lock domain before
  -- any row locks or protected accounting reads/writes.
  PERFORM public.lock_vat_months(v_user_id, ARRAY[p_event_date]::date[]);

  -- Serialize same-key attempts after the VAT lock and before row locks.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'sololedger:vat_settlement_idem:'
      || v_user_id::text
      || ':'
      || p_idempotency_key::text,
      0
    )
  );

  SELECT *
    INTO v_existing
  FROM public.tax_account_events e
  WHERE e.user_id = v_user_id
    AND e.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.vat_period_id IS DISTINCT FROM p_vat_period_id
       OR v_existing.event_date IS DISTINCT FROM p_event_date
       OR v_existing.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'Idempotency-nyckeln har redan använts med andra avräkningsuppgifter.'
        USING ERRCODE = '23505';
    END IF;

    SELECT min(je.ver_nr)
      INTO v_replay_ver_nr
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.transaction_id = v_existing.transaction_id;

    SELECT *
      INTO v_period
    FROM public.vat_periods vp
    WHERE vp.id = v_existing.vat_period_id
      AND vp.user_id = v_user_id;

    SELECT coalesce(sum(e.amount), 0)::numeric
      INTO v_cumulative_settled
    FROM public.tax_account_events e
    WHERE e.user_id = v_user_id
      AND e.vat_period_id = v_existing.vat_period_id;

    v_remaining_amount := greatest(abs(v_period.closing_amount) - v_cumulative_settled, 0);
    v_settlement_state :=
      CASE
        WHEN v_cumulative_settled = 0 THEN 'unsettled'
        WHEN v_cumulative_settled = abs(v_period.closing_amount) THEN 'fully_settled'
        ELSE 'partially_settled'
      END;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'event_id', v_existing.id,
      'transaction_id', v_existing.transaction_id,
      'ver_nr', v_replay_ver_nr,
      'event_kind', v_existing.event_kind,
      'event_date', v_existing.event_date,
      'amount', v_existing.amount,
      'cumulative_settled', v_cumulative_settled,
      'remaining_amount', v_remaining_amount,
      'settlement_state', v_settlement_state
    );
  END IF;

  SELECT *
    INTO v_period
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  IF v_period.source <> 'sololedger' THEN
    RAISE EXCEPTION 'Endast SoloLedger-hanterade momsperioder kan avräknas.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status <> 'declared' THEN
    RAISE EXCEPTION 'Endast deklarerade momsperioder kan avräknas (nuvarande status: %).',
      v_period.status
      USING ERRCODE = '23514';
  END IF;

  IF v_period.closing_amount IS NULL OR v_period.closing_amount = 0 THEN
    RAISE EXCEPTION 'Momsperioden har inget momsbelopp att avräkna.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.closing_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Momsperiodens momsavslut saknas eller är inkonsekvent.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_closing_tx
  FROM public.transactions t
  WHERE t.id = v_period.closing_transaction_id;

  IF NOT FOUND
     OR v_closing_tx.user_id IS DISTINCT FROM v_user_id
     OR v_closing_tx.source <> 'vat_closing'
     OR coalesce(v_closing_tx.booked, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Momsperiodens momsavslut saknas eller är inkonsekvent.'
      USING ERRCODE = '23514';
  END IF;

  v_event_kind :=
    CASE
      WHEN v_period.closing_amount > 0 THEN 'vat_debit'
      ELSE 'vat_credit'
    END;

  SELECT coalesce(sum(e.amount), 0)::numeric
    INTO v_cumulative_settled
  FROM public.tax_account_events e
  WHERE e.user_id = v_user_id
    AND e.vat_period_id = v_period.id;

  IF v_cumulative_settled + p_amount > abs(v_period.closing_amount) THEN
    RAISE EXCEPTION 'Avräkningen skulle överstiga momsperiodens kvarvarande belopp.'
      USING ERRCODE = '23514';
  END IF;

  SELECT public.get_next_ver_nr(v_user_id)
    INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för momsavräkningen.';
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
    p_event_date,
    'Momsavräkning skattekonto ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
    p_amount,
    NULL,
    NULL,
    true,
    'vat_settlement'
  )
  RETURNING id INTO v_tx_id;

  IF v_event_kind = 'vat_debit' THEN
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
      (
        v_tx_id,
        v_ver_nr,
        '2650',
        p_amount,
        0,
        'Skatteverket debiterade moms på skattekontot',
        p_event_date,
        v_user_id
      ),
      (
        v_tx_id,
        v_ver_nr,
        '2012',
        0,
        p_amount,
        'Skatteverket debiterade moms på skattekontot',
        p_event_date,
        v_user_id
      );
  ELSE
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
      (
        v_tx_id,
        v_ver_nr,
        '2012',
        p_amount,
        0,
        'Skatteverket krediterade moms på skattekontot',
        p_event_date,
        v_user_id
      ),
      (
        v_tx_id,
        v_ver_nr,
        '2650',
        0,
        p_amount,
        'Skatteverket krediterade moms på skattekontot',
        p_event_date,
        v_user_id
      );
  END IF;

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
    v_period.id,
    v_tx_id,
    v_event_kind,
    p_event_date,
    p_amount,
    p_idempotency_key
  )
  RETURNING id INTO v_event_id;

  v_cumulative_settled := v_cumulative_settled + p_amount;
  v_remaining_amount := greatest(abs(v_period.closing_amount) - v_cumulative_settled, 0);
  v_settlement_state :=
    CASE
      WHEN v_cumulative_settled = 0 THEN 'unsettled'
      WHEN v_cumulative_settled = abs(v_period.closing_amount) THEN 'fully_settled'
      ELSE 'partially_settled'
    END;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'event_id', v_event_id,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr,
    'event_kind', v_event_kind,
    'event_date', p_event_date,
    'amount', p_amount,
    'cumulative_settled', v_cumulative_settled,
    'remaining_amount', v_remaining_amount,
    'settlement_state', v_settlement_state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_vat_settlement_atomic(uuid, date, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_vat_settlement_atomic(uuid, date, numeric, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_vat_settlement_atomic(uuid, date, numeric, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.record_vat_settlement_atomic(uuid, date, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_vat_settlement_atomic(uuid, date, numeric, uuid) TO service_role;

COMMENT ON FUNCTION public.record_vat_settlement_atomic(uuid, date, numeric, uuid) IS
  'Records an evidenced Skatteverket VAT tax-account debit/credit for a declared SoloLedger VAT period. Derives fixed 2012/2650 journal rows and immutable event metadata atomically.';
