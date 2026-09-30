-- VAT lifecycle Slice 3: tax-account money movements.
--
-- Scope:
--   * Activate transactions.source = 'tax_account_movement'.
--   * Add immutable semantic metadata for tax-account money movements.
--   * Add a narrow RPC that derives journal rows from payment-account roles.
--   * Keep ordinary VAT guards unchanged; this flow writes no 26xx rows.

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
        'tax_account_movement'::text
      ]
    )
  );

COMMENT ON COLUMN public.transactions.source IS
  'Origin of the transaction. vat_closing, vat_settlement, and tax_account_movement are reserved for controlled SoloLedger VAT lifecycle RPCs. vat_v2 is reserved for controlled VAT V2 booking RPCs.';

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
      'tax_account_movement'
    ]::text[]), false) AS is_current_source,
    false AS is_reserved_future_source,
    coalesce(p_source = ANY (ARRAY[
      'sie_import',
      'sie_opening_balance',
      'sie_import_undo',
      'vat_closing',
      'vat_v2',
      'vat_settlement',
      'tax_account_movement'
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
      ELSE false
    END AS is_ordinary_vat_guard_activity;
$function$;

COMMENT ON FUNCTION public.transaction_source_classification(text)
  IS 'Central SoloLedger transaction source taxonomy for DB-side VAT lifecycle/source guards. vat_settlement and tax_account_movement are active controlled VAT lifecycle sources and are not generically editable/correctable.';

CREATE TABLE public.tax_account_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vat_period_id uuid REFERENCES public.vat_periods(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  movement_kind text NOT NULL,
  movement_date date NOT NULL,
  amount numeric(15,2) NOT NULL,
  payment_account_role text,
  counter_account_number text NOT NULL,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tax_account_movements_movement_kind_check
    CHECK (
      movement_kind IN (
        'business_to_tax_account',
        'owner_private_to_tax_account',
        'tax_account_to_business',
        'tax_account_to_owner_private'
      )
    ),
  CONSTRAINT tax_account_movements_amount_check
    CHECK (amount > 0 AND amount = round(amount, 2)),
  CONSTRAINT tax_account_movements_counter_account_check
    CHECK (counter_account_number ~ '^[1-9]\d{3}$'),
  CONSTRAINT tax_account_movements_kind_role_check
    CHECK (
      (
        movement_kind IN ('business_to_tax_account', 'tax_account_to_business')
        AND payment_account_role = 'business_payment_account'
      )
      OR (
        movement_kind = 'owner_private_to_tax_account'
        AND payment_account_role = 'owner_private_payment'
      )
      OR (
        movement_kind = 'tax_account_to_owner_private'
        AND payment_account_role IS NULL
        AND counter_account_number = '2013'
      )
    ),
  CONSTRAINT tax_account_movements_transaction_unique
    UNIQUE (transaction_id),
  CONSTRAINT tax_account_movements_idempotency_unique
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX tax_account_movements_user_period_idx
  ON public.tax_account_movements (user_id, vat_period_id);

CREATE INDEX tax_account_movements_user_date_idx
  ON public.tax_account_movements (user_id, movement_date);

COMMENT ON TABLE public.tax_account_movements IS
  'Immutable semantic metadata for SoloLedger-controlled tax-account money movements linked to accounting truth in transactions and journal_entries.';
COMMENT ON COLUMN public.tax_account_movements.vat_period_id IS
  'Optional VAT period allocation. When present, the movement is explicitly linked to that VAT obligation; NULL supports future unlinked tax-account movements.';
COMMENT ON COLUMN public.tax_account_movements.movement_kind IS
  'business_to_tax_account, owner_private_to_tax_account, tax_account_to_business, or tax_account_to_owner_private.';
COMMENT ON COLUMN public.tax_account_movements.payment_account_role IS
  'Configured semantic payment role used to derive counter_account_number, except tax_account_to_owner_private which always uses 2013.';
COMMENT ON COLUMN public.tax_account_movements.idempotency_key IS
  'Caller-provided retry key. Reuse with identical canonical facts returns the existing movement; conflicting reuse is rejected.';

ALTER TABLE public.tax_account_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tax account movements"
ON public.tax_account_movements
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

REVOKE ALL PRIVILEGES ON TABLE public.tax_account_movements FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.tax_account_movements FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.tax_account_movements FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.tax_account_movements FROM service_role;

GRANT SELECT ON TABLE public.tax_account_movements TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.tax_account_movements TO service_role;

CREATE OR REPLACE FUNCTION public.validate_tax_account_movement_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period public.vat_periods%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_row_count integer;
  v_tax_account_count integer;
  v_counter_count integer;
  v_bad_date_count integer;
  v_total_debit numeric;
  v_total_credit numeric;
  v_2012_debit numeric;
  v_2012_credit numeric;
  v_counter_debit numeric;
  v_counter_credit numeric;
BEGIN
  IF NEW.vat_period_id IS NOT NULL THEN
    SELECT *
      INTO v_period
    FROM public.vat_periods
    WHERE id = NEW.vat_period_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tax-account movement refers to a missing VAT period.'
        USING ERRCODE = '23503';
    END IF;

    IF NEW.user_id IS DISTINCT FROM v_period.user_id THEN
      RAISE EXCEPTION 'Tax-account movement VAT-period tenant linkage is inconsistent.'
        USING ERRCODE = '23514';
    END IF;

    IF v_period.source <> 'sololedger'
       OR v_period.status NOT IN ('closed', 'declared')
       OR v_period.closing_amount IS NULL
       OR v_period.closing_amount = 0 THEN
      RAISE EXCEPTION 'Tax-account movement is linked to an ineligible VAT period.'
        USING ERRCODE = '23514';
    END IF;

    IF (
      v_period.closing_amount > 0
      AND NEW.movement_kind NOT IN ('business_to_tax_account', 'owner_private_to_tax_account')
    )
    OR (
      v_period.closing_amount < 0
      AND NEW.movement_kind NOT IN ('tax_account_to_business', 'tax_account_to_owner_private')
    ) THEN
      RAISE EXCEPTION 'Tax-account movement kind does not match VAT period direction.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT *
    INTO v_tx
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tax-account movement refers to a missing transaction.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_tx.user_id THEN
    RAISE EXCEPTION 'Tax-account movement transaction tenant linkage is inconsistent.'
      USING ERRCODE = '23514';
  END IF;

  IF v_tx.source <> 'tax_account_movement'
     OR coalesce(v_tx.booked, false) IS NOT TRUE
     OR v_tx.date IS DISTINCT FROM NEW.movement_date
     OR v_tx.amount IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'Tax-account movement transaction metadata is inconsistent.'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE account_number = '2012')::integer,
    count(*) FILTER (WHERE account_number = NEW.counter_account_number)::integer,
    count(*) FILTER (WHERE date IS DISTINCT FROM NEW.movement_date)::integer,
    coalesce(sum(coalesce(debit, 0)), 0)::numeric,
    coalesce(sum(coalesce(credit, 0)), 0)::numeric,
    coalesce(sum(coalesce(debit, 0)) FILTER (WHERE account_number = '2012'), 0)::numeric,
    coalesce(sum(coalesce(credit, 0)) FILTER (WHERE account_number = '2012'), 0)::numeric,
    coalesce(sum(coalesce(debit, 0)) FILTER (WHERE account_number = NEW.counter_account_number), 0)::numeric,
    coalesce(sum(coalesce(credit, 0)) FILTER (WHERE account_number = NEW.counter_account_number), 0)::numeric
  INTO
    v_row_count,
    v_tax_account_count,
    v_counter_count,
    v_bad_date_count,
    v_total_debit,
    v_total_credit,
    v_2012_debit,
    v_2012_credit,
    v_counter_debit,
    v_counter_credit
  FROM public.journal_entries
  WHERE transaction_id = NEW.transaction_id
    AND user_id = NEW.user_id;

  IF v_row_count <> 2
     OR v_tax_account_count <> 1
     OR v_counter_count <> 1
     OR v_bad_date_count <> 0
     OR v_total_debit IS DISTINCT FROM NEW.amount
     OR v_total_credit IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION 'Tax-account movement journal shape is inconsistent.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.movement_kind IN ('business_to_tax_account', 'owner_private_to_tax_account') THEN
    IF v_2012_debit IS DISTINCT FROM NEW.amount
       OR v_2012_credit IS DISTINCT FROM 0::numeric
       OR v_counter_debit IS DISTINCT FROM 0::numeric
       OR v_counter_credit IS DISTINCT FROM NEW.amount THEN
      RAISE EXCEPTION 'Tax-account incoming movement journal is inconsistent.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF v_counter_debit IS DISTINCT FROM NEW.amount
       OR v_counter_credit IS DISTINCT FROM 0::numeric
       OR v_2012_debit IS DISTINCT FROM 0::numeric
       OR v_2012_credit IS DISTINCT FROM NEW.amount THEN
      RAISE EXCEPTION 'Tax-account outgoing movement journal is inconsistent.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_tax_account_movement_consistency
BEFORE INSERT OR UPDATE ON public.tax_account_movements
FOR EACH ROW
EXECUTE FUNCTION public.validate_tax_account_movement_consistency();

COMMENT ON FUNCTION public.validate_tax_account_movement_consistency()
  IS 'Validates that tax_account_movements are tenant-consistent and exactly match the linked tax_account_movement transaction journal.';

REVOKE ALL ON FUNCTION public.validate_tax_account_movement_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_tax_account_movement_consistency() FROM anon;
REVOKE ALL ON FUNCTION public.validate_tax_account_movement_consistency() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.validate_tax_account_movement_consistency() TO postgres;
GRANT EXECUTE ON FUNCTION public.validate_tax_account_movement_consistency() TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_tax_account_movement_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Tax-account movements are immutable. Create a future semantic reversal instead.'
    USING ERRCODE = '25006';
END;
$function$;

CREATE TRIGGER prevent_tax_account_movement_mutation
BEFORE UPDATE OR DELETE ON public.tax_account_movements
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tax_account_movement_mutation();

COMMENT ON FUNCTION public.prevent_tax_account_movement_mutation()
  IS 'Prevents in-place mutation of tax_account_movements. Movement history is append-only; reversal/undo requires explicit future lifecycle behavior.';

REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_tax_account_movement_mutation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_movement_mutation() TO postgres;
GRANT EXECUTE ON FUNCTION public.prevent_tax_account_movement_mutation() TO service_role;

CREATE OR REPLACE FUNCTION public.record_tax_account_movement_atomic(
  p_movement_kind text,
  p_movement_date date,
  p_amount numeric,
  p_vat_period_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing public.tax_account_movements%ROWTYPE;
  v_period public.vat_periods%ROWTYPE;
  v_payment_account_role text;
  v_counter_account_number text;
  v_description text;
  v_journal_description text;
  v_ver_nr integer;
  v_replay_ver_nr integer;
  v_tx_id uuid;
  v_movement_id uuid;
  v_cumulative_movement numeric := NULL;
  v_remaining_amount numeric := NULL;
  v_movement_state text := NULL;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Idempotency-nyckel saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_movement_date IS NULL THEN
    RAISE EXCEPTION 'Datum för överföringen saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_movement_date > current_date THEN
    RAISE EXCEPTION 'Datum för överföringen kan inte vara i framtiden.'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount IS DISTINCT FROM round(p_amount, 2) THEN
    RAISE EXCEPTION 'Beloppet måste vara positivt och avrundat till två decimaler.'
      USING ERRCODE = '22023';
  END IF;

  IF p_movement_kind NOT IN (
    'business_to_tax_account',
    'owner_private_to_tax_account',
    'tax_account_to_business',
    'tax_account_to_owner_private'
  ) THEN
    RAISE EXCEPTION 'Okänd skattekontorörelse.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from p_movement_date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from p_movement_date)::integer
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'sololedger:tax_account_movement_idem:'
      || v_user_id::text
      || ':'
      || p_idempotency_key::text,
      0
    )
  );

  SELECT *
    INTO v_existing
  FROM public.tax_account_movements m
  WHERE m.user_id = v_user_id
    AND m.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.movement_kind IS DISTINCT FROM p_movement_kind
       OR v_existing.movement_date IS DISTINCT FROM p_movement_date
       OR v_existing.amount IS DISTINCT FROM p_amount
       OR v_existing.vat_period_id IS DISTINCT FROM p_vat_period_id THEN
      RAISE EXCEPTION 'Idempotency-nyckeln har redan använts med andra överföringsuppgifter.'
        USING ERRCODE = '23505';
    END IF;

    SELECT min(je.ver_nr)
      INTO v_replay_ver_nr
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.transaction_id = v_existing.transaction_id;

    IF v_existing.vat_period_id IS NOT NULL THEN
      SELECT *
        INTO v_period
      FROM public.vat_periods vp
      WHERE vp.id = v_existing.vat_period_id
        AND vp.user_id = v_user_id;

      SELECT coalesce(sum(m.amount), 0)::numeric
        INTO v_cumulative_movement
      FROM public.tax_account_movements m
      WHERE m.user_id = v_user_id
        AND m.vat_period_id = v_existing.vat_period_id;

      v_remaining_amount := greatest(abs(v_period.closing_amount) - v_cumulative_movement, 0);
      v_movement_state :=
        CASE
          WHEN v_cumulative_movement = 0 THEN 'unmoved'
          WHEN v_cumulative_movement = abs(v_period.closing_amount) THEN 'fully_moved'
          ELSE 'partially_moved'
        END;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'movement_id', v_existing.id,
      'transaction_id', v_existing.transaction_id,
      'ver_nr', v_replay_ver_nr,
      'vat_period_id', v_existing.vat_period_id,
      'movement_kind', v_existing.movement_kind,
      'movement_date', v_existing.movement_date,
      'amount', v_existing.amount,
      'payment_account_role', v_existing.payment_account_role,
      'counter_account_number', v_existing.counter_account_number,
      'cumulative_movement', v_cumulative_movement,
      'remaining_amount', v_remaining_amount,
      'movement_state', v_movement_state
    );
  END IF;

  IF p_movement_kind IN ('business_to_tax_account', 'tax_account_to_business') THEN
    v_payment_account_role := 'business_payment_account';
  ELSIF p_movement_kind = 'owner_private_to_tax_account' THEN
    v_payment_account_role := 'owner_private_payment';
  ELSE
    v_payment_account_role := NULL;
    v_counter_account_number := '2013';
  END IF;

  IF v_payment_account_role IS NOT NULL THEN
    SELECT account_number
      INTO v_counter_account_number
    FROM public.company_payment_account_roles r
    WHERE r.user_id = v_user_id
      AND r.role = v_payment_account_role;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Betalningskonto för % är inte inställt.', v_payment_account_role
        USING ERRCODE = '23514';
    END IF;

    IF v_counter_account_number !~ '^[1-9]\d{3}$'
       OR v_counter_account_number = '2012'
       OR (
         v_payment_account_role = 'business_payment_account'
         AND left(v_counter_account_number, 1) <> '1'
       )
       OR (
         v_payment_account_role = 'owner_private_payment'
         AND left(v_counter_account_number, 1) <> '2'
       ) THEN
      RAISE EXCEPTION 'Det konfigurerade betalningskontot är inte giltigt för skattekontorörelsen: %.', v_counter_account_number
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.accounts a
      WHERE a.user_id = v_user_id
        AND (
          a.debit_account = v_counter_account_number
          OR a.credit_account = v_counter_account_number
        )
    ) THEN
      RAISE EXCEPTION 'Det konfigurerade betalningskontot finns inte i användarens kontoplan: %.', v_counter_account_number
        USING ERRCODE = '23503';
    END IF;
  END IF;

  IF p_vat_period_id IS NOT NULL THEN
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
      RAISE EXCEPTION 'Endast SoloLedger-hanterade momsperioder kan kopplas till skattekontorörelser.'
        USING ERRCODE = '23514';
    END IF;

    IF v_period.status NOT IN ('closed', 'declared') THEN
      RAISE EXCEPTION 'Endast stängda eller deklarerade momsperioder kan kopplas till skattekontorörelser (nuvarande status: %).',
        v_period.status
        USING ERRCODE = '23514';
    END IF;

    IF v_period.closing_amount IS NULL OR v_period.closing_amount = 0 THEN
      RAISE EXCEPTION 'Momsperioden har inget momsbelopp att koppla överföringen till.'
        USING ERRCODE = '23514';
    END IF;

    IF (
      v_period.closing_amount > 0
      AND p_movement_kind NOT IN ('business_to_tax_account', 'owner_private_to_tax_account')
    )
    OR (
      v_period.closing_amount < 0
      AND p_movement_kind NOT IN ('tax_account_to_business', 'tax_account_to_owner_private')
    ) THEN
      RAISE EXCEPTION 'Överföringen stämmer inte med momsperiodens riktning.'
        USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(sum(m.amount), 0)::numeric
      INTO v_cumulative_movement
    FROM public.tax_account_movements m
    WHERE m.user_id = v_user_id
      AND m.vat_period_id = v_period.id;

    IF v_cumulative_movement + p_amount > abs(v_period.closing_amount) THEN
      RAISE EXCEPTION 'Överföringen skulle överstiga momsperiodens kvarvarande belopp.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT public.get_next_ver_nr(v_user_id)
    INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för skattekontorörelsen.';
  END IF;

  v_description :=
    CASE p_movement_kind
      WHEN 'business_to_tax_account' THEN 'Överföring till skattekonto för moms'
      WHEN 'owner_private_to_tax_account' THEN 'Privat betalning till skattekonto för moms'
      WHEN 'tax_account_to_business' THEN 'Överföring från skattekonto till företagets konto'
      ELSE 'Privat uttag från skattekonto'
    END ||
    CASE
      WHEN v_period.id IS NULL THEN ''
      ELSE ' ' || v_period.period_start::text || ' - ' || v_period.period_end::text
    END;

  v_journal_description := v_description;

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
    p_movement_date,
    v_description,
    p_amount,
    NULL,
    NULL,
    true,
    'tax_account_movement'
  )
  RETURNING id INTO v_tx_id;

  IF p_movement_kind IN ('business_to_tax_account', 'owner_private_to_tax_account') THEN
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
        v_journal_description,
        p_movement_date,
        v_user_id
      ),
      (
        v_tx_id,
        v_ver_nr,
        v_counter_account_number,
        0,
        p_amount,
        v_journal_description,
        p_movement_date,
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
        v_counter_account_number,
        p_amount,
        0,
        v_journal_description,
        p_movement_date,
        v_user_id
      ),
      (
        v_tx_id,
        v_ver_nr,
        '2012',
        0,
        p_amount,
        v_journal_description,
        p_movement_date,
        v_user_id
      );
  END IF;

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
    p_vat_period_id,
    v_tx_id,
    p_movement_kind,
    p_movement_date,
    p_amount,
    v_payment_account_role,
    v_counter_account_number,
    p_idempotency_key
  )
  RETURNING id INTO v_movement_id;

  IF p_vat_period_id IS NOT NULL THEN
    v_cumulative_movement := v_cumulative_movement + p_amount;
    v_remaining_amount := greatest(abs(v_period.closing_amount) - v_cumulative_movement, 0);
    v_movement_state :=
      CASE
        WHEN v_cumulative_movement = 0 THEN 'unmoved'
        WHEN v_cumulative_movement = abs(v_period.closing_amount) THEN 'fully_moved'
        ELSE 'partially_moved'
      END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'movement_id', v_movement_id,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr,
    'vat_period_id', p_vat_period_id,
    'movement_kind', p_movement_kind,
    'movement_date', p_movement_date,
    'amount', p_amount,
    'payment_account_role', v_payment_account_role,
    'counter_account_number', v_counter_account_number,
    'cumulative_movement', v_cumulative_movement,
    'remaining_amount', v_remaining_amount,
    'movement_state', v_movement_state
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_tax_account_movement_atomic(text, date, numeric, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tax_account_movement_atomic(text, date, numeric, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_tax_account_movement_atomic(text, date, numeric, uuid, uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.record_tax_account_movement_atomic(text, date, numeric, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_tax_account_movement_atomic(text, date, numeric, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.record_tax_account_movement_atomic(text, date, numeric, uuid, uuid) IS
  'Records a SoloLedger-controlled tax-account money movement. Derives 2012/2013/payment-role journal rows and immutable metadata atomically; optional VAT period allocation is capped by the period closing amount.';
