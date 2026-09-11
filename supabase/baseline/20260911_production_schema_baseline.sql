-- WARNING: BASELINE SNAPSHOT ONLY.
-- This file documents the verified deployed SoloLedger database snapshot as of 2026-09-11.
-- DO NOT run this file against the existing production database.
-- See README.md in this folder before using it for audit/recovery/reconstruction.

-- =====================================================================
-- 1. TABLES / CONSTRAINTS
-- =====================================================================

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  subscription_type text DEFAULT 'free'::text,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_end timestamp with time zone,
  company_name text,
  org_nr text,
  role text DEFAULT 'user'::text,
  email text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);

CREATE TABLE public.accounts (
  id text NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  debit_account text NOT NULL,
  credit_account text NOT NULL,
  default_vat_rate numeric DEFAULT 0,
  comment text,
  CONSTRAINT accounts_pkey PRIMARY KEY (id, user_id),
  CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.import_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filename text NOT NULL,
  file_hash text NOT NULL,
  company_name text,
  org_nr text,
  fiscal_year integer,
  status text NOT NULL DEFAULT 'pending'::text
    CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'undone'::text])),
  verification_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  undone_at timestamp with time zone,
  CONSTRAINT import_batches_pkey PRIMARY KEY (id),
  CONSTRAINT import_batches_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  description text NOT NULL,
  amount numeric NOT NULL,
  type text,
  vat_rate numeric DEFAULT 0,
  booked boolean DEFAULT false,
  file_url text,
  is_correction boolean DEFAULT false,
  corrects_ver_nr integer,
  is_periodized boolean DEFAULT false,
  is_periodized_reversal boolean DEFAULT false,
  periodized_future_date date,
  periodization_group_id uuid,
  source text NOT NULL DEFAULT 'manual'::text
    CHECK (source = ANY (ARRAY['manual'::text, 'sie_import'::text, 'sie_opening_balance'::text, 'sie_import_undo'::text])),
  import_batch_id uuid,
  source_ver_series text,
  source_ver_number text,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT transactions_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.import_batches(id)
);

CREATE TABLE public.journal_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  ver_nr integer NOT NULL,
  account_number text NOT NULL,
  debit numeric DEFAULT 0,
  credit numeric DEFAULT 0,
  description text,
  date date,
  CONSTRAINT journal_entries_pkey PRIMARY KEY (id),
  CONSTRAINT journal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT journal_entries_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id)
);

CREATE TABLE public.closed_years (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  year integer NOT NULL,
  closed_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT closed_years_pkey PRIMARY KEY (id),
  CONSTRAINT closed_years_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.ver_nr_sequences (
  user_id uuid NOT NULL,
  last_ver_nr integer NOT NULL DEFAULT 0,
  CONSTRAINT ver_nr_sequences_pkey PRIMARY KEY (user_id),
  CONSTRAINT ver_nr_sequences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

CREATE TABLE public.favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  vat_rate integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT favorites_pkey PRIMARY KEY (id),
  CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- =====================================================================
-- 2. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closed_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ver_nr_sequences ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 3. DEPLOYED PUBLIC FUNCTIONS / RPCs
-- =====================================================================

-- book_periodized_transaction_atomic(p_payload jsonb)
CREATE OR REPLACE FUNCTION public.book_periodized_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  v_original_date date;
  v_future_date date;
  v_year_end date;

  v_description text;
  v_amount numeric;
  v_type text;
  v_vat_rate numeric;
  v_file_url text;

  v_debit_account text;
  v_credit_account text;

  v_vat_amount numeric;
  v_net_amount numeric;

  v_ver_nr integer;
  v_reversal_ver_nr integer;

  v_periodization_group_id uuid := gen_random_uuid();
  v_tx_id uuid;
  v_reversal_tx_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  -- Grundvalidering
  IF p_payload->>'date' IS NULL
     OR p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat bokföringsdatum.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'future_date' IS NULL
     OR p_payload->>'future_date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat vändningsdatum.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_original_date := (p_payload->>'date')::date;
    v_future_date := (p_payload->>'future_date')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltigt datum i periodiseringen.'
      USING ERRCODE = '22023';
  END;

  v_year_end := make_date(extract(year from v_original_date)::int, 12, 31);

  v_description := btrim(coalesce(p_payload->>'description', ''));
  IF v_description = '' THEN
    RAISE EXCEPTION 'Beskrivning saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'amount' IS NULL
     OR p_payload->>'amount' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat belopp.'
      USING ERRCODE = '22023';
  END IF;
  v_amount := (p_payload->>'amount')::numeric;

  v_type := p_payload->>'type';
  IF v_type IS NULL OR btrim(v_type) = '' THEN
    RAISE EXCEPTION 'Kategori/kontotyp saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'vat_rate' IS NULL OR p_payload->>'vat_rate' = '' THEN
    v_vat_rate := 0;
  ELSIF p_payload->>'vat_rate' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltig momssats.'
      USING ERRCODE = '22023';
  ELSE
    v_vat_rate := (p_payload->>'vat_rate')::numeric;
  END IF;

  -- Server-side whitelist for supported VAT rates.
  IF v_vat_rate NOT IN (0, 6, 12, 25) THEN
    RAISE EXCEPTION
      'Ogiltig momssats. Tillåtna momssatser är 0, 6, 12 eller 25 procent.'
      USING ERRCODE = '22023';
  END IF;

  v_file_url := nullif(p_payload->>'file_url', '');

  IF v_future_date <= v_year_end THEN
    RAISE EXCEPTION
      'Vändningsdatumet (%) måste ligga efter bokslutsdagen (%).',
      v_future_date, v_year_end
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_year_end)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_year_end)::int
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_future_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_future_date)::int
      USING ERRCODE = '23514';
  END IF;

  SELECT debit_account, credit_account
    INTO v_debit_account, v_credit_account
  FROM public.accounts
  WHERE id = v_type
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konto saknas eller tillhör inte användaren: %.', v_type
      USING ERRCODE = '23503';
  END IF;

  IF v_debit_account IS NULL OR btrim(v_debit_account) = ''
     OR v_credit_account IS NULL OR btrim(v_credit_account) = '' THEN
    RAISE EXCEPTION 'Kontotyp % saknar debet- eller kreditkonto.', v_type
      USING ERRCODE = '23514';
  END IF;

  IF left(v_debit_account, 1) NOT IN ('4', '5', '6', '7', '8') THEN
    RAISE EXCEPTION
      'Kontotyp % kan inte periodiseras som kostnad (debetkonto %).',
      v_type, v_debit_account
      USING ERRCODE = '23514';
  END IF;

  v_vat_amount :=
    CASE
      WHEN v_vat_rate > 0
        THEN round((v_amount - (v_amount / (1 + v_vat_rate / 100)))::numeric, 2)
      ELSE 0
    END;

  v_net_amount := round((v_amount - v_vat_amount)::numeric, 2);

  SELECT public.get_next_ver_nr(v_user_id) INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för periodiseringen.';
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
    is_periodized,
    is_periodized_reversal,
    periodized_future_date,
    periodization_group_id
  ) VALUES (
    v_user_id,
    v_year_end,
    '[Periodisering 1/2] ' || v_description,
    v_amount,
    v_type,
    v_vat_rate,
    v_file_url,
    true,
    true,
    false,
    v_future_date,
    v_periodization_group_id
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number,
    debit, credit, description, date, user_id
  )
  VALUES
    (
      v_tx_id, v_ver_nr, v_credit_account,
      0, v_amount,
      'Förutbetald kostnad (Bank): ' || v_description,
      v_year_end, v_user_id
    ),
    (
      v_tx_id, v_ver_nr, '1790',
      v_net_amount, 0,
      'Förutbetald kostnad (Netto): ' || v_description,
      v_year_end, v_user_id
    );

  IF v_vat_amount > 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES (
      v_tx_id, v_ver_nr, '2641',
      v_vat_amount, 0,
      'Ingående moms (Periodisering): ' || v_description,
      v_year_end, v_user_id
    );
  END IF;

  SELECT public.get_next_ver_nr(v_user_id) INTO v_reversal_ver_nr;

  IF v_reversal_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för vändningen.';
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
    is_periodized,
    is_periodized_reversal,
    periodized_future_date,
    periodization_group_id
  ) VALUES (
    v_user_id,
    v_future_date,
    '[Periodisering 2/2] ' || v_description,
    v_net_amount,
    v_type,
    0,
    v_file_url,
    true,
    true,
    true,
    null,
    v_periodization_group_id
  )
  RETURNING id INTO v_reversal_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id, ver_nr, account_number,
    debit, credit, description, date, user_id
  )
  VALUES
    (
      v_reversal_tx_id, v_reversal_ver_nr, '1790',
      0, v_net_amount,
      'Förutbetald kostnad upplöst: ' || v_description,
      v_future_date, v_user_id
    ),
    (
      v_reversal_tx_id, v_reversal_ver_nr, v_debit_account,
      v_net_amount, 0,
      'Periodiserad kostnad aktiveras: ' || v_description,
      v_future_date, v_user_id
    );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'reversal_transaction_id', v_reversal_tx_id,
    'ver_nr', v_ver_nr,
    'reversal_ver_nr', v_reversal_ver_nr,
    'periodization_group_id', v_periodization_group_id
  );
END;
$function$

-- book_transaction_atomic(p_payload jsonb)
CREATE OR REPLACE FUNCTION public.book_transaction_atomic(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_date date;
  v_description text;
  v_amount numeric;
  v_type text;
  v_vat_rate numeric;
  v_file_url text;

  v_debit_account text;
  v_credit_account text;
  v_is_income boolean;

  v_vat_amount numeric;
  v_net_amount numeric;
  v_output_vat_account text;

  v_ver_nr integer;
  v_tx_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  -- Grundvalidering av payload
  IF p_payload->>'date' IS NULL
     OR p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat bokföringsdatum.'
      USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_date := (p_payload->>'date')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ogiltigt bokföringsdatum: %.', p_payload->>'date'
      USING ERRCODE = '22023';
  END;

  v_description := btrim(coalesce(p_payload->>'description', ''));
  IF v_description = '' THEN
    RAISE EXCEPTION 'Beskrivning saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'amount' IS NULL
     OR p_payload->>'amount' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltigt eller saknat belopp.'
      USING ERRCODE = '22023';
  END IF;
  v_amount := (p_payload->>'amount')::numeric;

  v_type := p_payload->>'type';
  IF v_type IS NULL OR btrim(v_type) = '' THEN
    RAISE EXCEPTION 'Kategori/kontotyp saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'vat_rate' IS NULL OR p_payload->>'vat_rate' = '' THEN
    v_vat_rate := 0;
  ELSIF p_payload->>'vat_rate' !~ '^-?\d+(\.\d+)?$' THEN
    RAISE EXCEPTION 'Ogiltig momssats.'
      USING ERRCODE = '22023';
  ELSE
    v_vat_rate := (p_payload->>'vat_rate')::numeric;
  END IF;

  -- Server-side whitelist: UI supports only 0, 6, 12 and 25 percent VAT.
  -- Enforce the same rule even for direct RPC calls.
  IF v_vat_rate NOT IN (0, 6, 12, 25) THEN
    RAISE EXCEPTION
      'Momssatsen % stöds inte. Tillåtna satser är 0, 6, 12 och 25 procent.',
      v_vat_rate
      USING ERRCODE = '22023';
  END IF;

  v_file_url := nullif(p_payload->>'file_url', '');

  -- Årslåsning, server-side
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_date)::int
      USING ERRCODE = '23514';
  END IF;

  -- Konto måste finnas och tillhöra användaren
  SELECT debit_account, credit_account
    INTO v_debit_account, v_credit_account
  FROM public.accounts
  WHERE id = v_type
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Konto saknas eller tillhör inte användaren: %.', v_type
      USING ERRCODE = '23503';
  END IF;

  IF v_debit_account IS NULL OR btrim(v_debit_account) = ''
     OR v_credit_account IS NULL OR btrim(v_credit_account) = '' THEN
    RAISE EXCEPTION 'Kontotyp % saknar debet- eller kreditkonto.', v_type
      USING ERRCODE = '23514';
  END IF;

  v_vat_amount :=
    CASE
      WHEN v_vat_rate > 0
        THEN round((v_amount - (v_amount / (1 + v_vat_rate / 100)))::numeric, 2)
      ELSE 0
    END;

  v_net_amount := round((v_amount - v_vat_amount)::numeric, 2);
  v_is_income := left(v_credit_account, 1) = '3';

  -- BAS-konton för vanlig svensk utgående moms:
  -- 25 % -> 2611, 12 % -> 2621, 6 % -> 2631.
  -- 0 % skapar ingen momsrad.
  IF v_is_income AND v_vat_amount > 0 THEN
    v_output_vat_account :=
      CASE v_vat_rate
        WHEN 25 THEN '2611'
        WHEN 12 THEN '2621'
        WHEN 6  THEN '2631'
        ELSE NULL
      END;

    IF v_output_vat_account IS NULL THEN
      RAISE EXCEPTION 'Momssatsen % stöds inte för svensk försäljning. Tillåtna satser är 0, 6, 12 och 25 procent.', v_vat_rate
        USING ERRCODE = '22023';
    END IF;
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
    booked
  ) VALUES (
    v_user_id,
    v_date,
    v_description,
    v_amount,
    v_type,
    v_vat_rate,
    v_file_url,
    true
  )
  RETURNING id INTO v_tx_id;

  IF v_is_income THEN
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES
      (
        v_tx_id, v_ver_nr, v_debit_account,
        v_amount, 0, v_description, v_date, v_user_id
      ),
      (
        v_tx_id, v_ver_nr, v_credit_account,
        0, v_net_amount, v_description, v_date, v_user_id
      );

    IF v_vat_amount > 0 THEN
      INSERT INTO public.journal_entries (
        transaction_id, ver_nr, account_number,
        debit, credit, description, date, user_id
      )
      VALUES (
        v_tx_id, v_ver_nr, v_output_vat_account,
        0, v_vat_amount,
        'Utgående moms på ' || v_description,
        v_date, v_user_id
      );
    END IF;

  ELSE
    INSERT INTO public.journal_entries (
      transaction_id, ver_nr, account_number,
      debit, credit, description, date, user_id
    )
    VALUES
      (
        v_tx_id, v_ver_nr, v_debit_account,
        v_net_amount, 0, v_description, v_date, v_user_id
      ),
      (
        v_tx_id, v_ver_nr, v_credit_account,
        0, v_amount, v_description, v_date, v_user_id
      );

    IF v_vat_amount > 0 THEN
      INSERT INTO public.journal_entries (
        transaction_id, ver_nr, account_number,
        debit, credit, description, date, user_id
      )
      VALUES (
        v_tx_id, v_ver_nr, '2641',
        v_vat_amount, 0,
        'Ingående moms på ' || v_description,
        v_date, v_user_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_tx_id,
    'ver_nr', v_ver_nr
  );
END;
$function$

-- create_correction_transaction_atomic(p_original_tx_id uuid)
CREATE OR REPLACE FUNCTION public.create_correction_transaction_atomic(p_original_tx_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  v_original public.transactions%ROWTYPE;
  v_reversal public.transactions%ROWTYPE;

  v_original_ver_nr integer;
  v_reversal_ver_nr integer;

  v_correction_date date;
  v_next_ver_nr integer;
  v_next_reversal_ver_nr integer;

  v_corr_tx_id uuid;
  v_corr_reversal_tx_id uuid;

  v_entry_count integer;
  v_distinct_ver_count integer;
  v_reversal_found boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_original_tx_id IS NULL THEN
    RAISE EXCEPTION 'Originaltransaktion saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- Lås originalraden under hela korrigeringen så att den inte kan ändras
  -- samtidigt som korrigeringsverifikationen byggs.
  SELECT *
    INTO v_original
  FROM public.transactions
  WHERE id = p_original_tx_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunde inte hämta originaltransaktionen.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Samma datumregel som tidigare klientkod:
  -- korrigeringen får aldrig ligga före originalverifikationen.
  v_correction_date := greatest(current_date, v_original.date);

  -- Server-side årslåsning för den faktiska korrigeringsdagen.
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = extract(year from v_correction_date)::int
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      extract(year from v_correction_date)::int
      USING ERRCODE = '23514';
  END IF;

  -- Kontrollera att originalet har ett komplett och entydigt verifikat.
  SELECT
    count(*),
    count(DISTINCT ver_nr),
    min(ver_nr)
  INTO
    v_entry_count,
    v_distinct_ver_count,
    v_original_ver_nr
  FROM public.journal_entries
  WHERE transaction_id = p_original_tx_id
    AND user_id = v_user_id;

  IF v_entry_count = 0 OR v_original_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte hämta originalbokföringen.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_distinct_ver_count <> 1 THEN
    RAISE EXCEPTION
      'Originaltransaktionen har inkonsekventa verifikationsnummer och kan inte korrigeras.'
      USING ERRCODE = '23514';
  END IF;

  -- Om originalet är första delen i en periodisering ska även dess
  -- vändningsverifikation korrigeras i SAMMA databastransaktion.
  IF v_original.periodization_group_id IS NOT NULL
     AND coalesce(v_original.is_periodized_reversal, false) = false THEN

    SELECT *
      INTO v_reversal
    FROM public.transactions
    WHERE periodization_group_id = v_original.periodization_group_id
      AND is_periodized_reversal = true
      AND user_id = v_user_id
    LIMIT 1
    FOR UPDATE;

    v_reversal_found := FOUND;

    IF v_reversal_found THEN
      -- Precis som tidigare beteende ska vändningskorrigeringen ligga på
      -- vändningens eget datum.
      IF EXISTS (
        SELECT 1
        FROM public.closed_years
        WHERE user_id = v_user_id
          AND year = extract(year from v_reversal.date)::int
      ) THEN
        RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
          extract(year from v_reversal.date)::int
          USING ERRCODE = '23514';
      END IF;

      SELECT
        count(*),
        count(DISTINCT ver_nr),
        min(ver_nr)
      INTO
        v_entry_count,
        v_distinct_ver_count,
        v_reversal_ver_nr
      FROM public.journal_entries
      WHERE transaction_id = v_reversal.id
        AND user_id = v_user_id;

      IF v_entry_count = 0 OR v_reversal_ver_nr IS NULL THEN
        RAISE EXCEPTION 'Kunde inte hämta vändningsverifikatets journalposter.'
          USING ERRCODE = 'P0002';
      END IF;

      IF v_distinct_ver_count <> 1 THEN
        RAISE EXCEPTION
          'Vändningsverifikationen har inkonsekventa verifikationsnummer och kan inte korrigeras.'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- ── KORRIGERING AV ORIGINALVERIFIKATION ─────────────────────
  SELECT public.get_next_ver_nr(v_user_id) INTO v_next_ver_nr;

  IF v_next_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer.';
  END IF;

  INSERT INTO public.transactions (
    date,
    description,
    amount,
    type,
    vat_rate,
    booked,
    is_correction,
    corrects_ver_nr,
    user_id
  ) VALUES (
    v_correction_date,
    '↩ Korrigering av VER-' || v_original_ver_nr || ' (' || coalesce(v_original.description, '') || ')',
    v_original.amount,
    v_original.type,
    v_original.vat_rate,
    true,
    true,
    v_original_ver_nr,
    v_user_id
  )
  RETURNING id INTO v_corr_tx_id;

  INSERT INTO public.journal_entries (
    transaction_id,
    ver_nr,
    account_number,
    debit,
    credit,
    description,
    date,
    user_id
  )
  SELECT
    v_corr_tx_id,
    v_next_ver_nr,
    e.account_number,
    e.credit,
    e.debit,
    'Korrigering av VER-' || v_original_ver_nr || ': ' || coalesce(e.description, ''),
    v_correction_date,
    v_user_id
  FROM public.journal_entries e
  WHERE e.transaction_id = p_original_tx_id
    AND e.user_id = v_user_id;

  -- ── PERIODISERINGENS VÄNDNINGSVERIFIKATION ──────────────────
  IF v_reversal_found THEN
    SELECT public.get_next_ver_nr(v_user_id) INTO v_next_reversal_ver_nr;

    IF v_next_reversal_ver_nr IS NULL THEN
      RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för reversalkorrigering.';
    END IF;

    INSERT INTO public.transactions (
      date,
      description,
      amount,
      type,
      vat_rate,
      booked,
      is_correction,
      corrects_ver_nr,
      user_id
    ) VALUES (
      v_reversal.date,
      '↩ Korrigering av VER-' || v_reversal_ver_nr || ' (' || coalesce(v_reversal.description, '') || ')',
      v_reversal.amount,
      v_reversal.type,
      v_reversal.vat_rate,
      true,
      true,
      v_reversal_ver_nr,
      v_user_id
    )
    RETURNING id INTO v_corr_reversal_tx_id;

    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    )
    SELECT
      v_corr_reversal_tx_id,
      v_next_reversal_ver_nr,
      e.account_number,
      e.credit,
      e.debit,
      'Korrigering av VER-' || v_reversal_ver_nr || ': ' || coalesce(e.description, ''),
      v_reversal.date,
      v_user_id
    FROM public.journal_entries e
    WHERE e.transaction_id = v_reversal.id
      AND e.user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_corr_tx_id,
    'ver_nr', v_next_ver_nr,
    'corrects_ver_nr', v_original_ver_nr,
    'reversal_correction_transaction_id', v_corr_reversal_tx_id,
    'reversal_correction_ver_nr', v_next_reversal_ver_nr
  );
END;
$function$

-- delete_user_data_atomic(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.delete_user_data_atomic(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_journal_entries integer := 0;
  v_transactions integer := 0;
  v_favorites integer := 0;
  v_import_batches integer := 0;
  v_accounts integer := 0;
  v_closed_years integer := 0;
  v_ver_nr_sequences integer := 0;
  v_profiles integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id krävs.' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Användaren hittades inte.' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Admin-konton kan inte raderas här.' USING ERRCODE = '42501';
  END IF;

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
  GET DIAGNOSTICS v_profiles = ROW_COUNT;

  IF v_profiles <> 1 THEN
    RAISE EXCEPTION 'Profilraderingen gav oväntat resultat.' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'deleted', jsonb_build_object(
      'journal_entries', v_journal_entries,
      'transactions', v_transactions,
      'favorites', v_favorites,
      'import_batches', v_import_batches,
      'accounts', v_accounts,
      'closed_years', v_closed_years,
      'ver_nr_sequences', v_ver_nr_sequences,
      'profiles', v_profiles
    )
  );
END;
$function$

-- get_next_ver_nr(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.get_next_ver_nr(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Otillåtet: p_user_id matchar inte inloggad användare.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO ver_nr_sequences(user_id, last_ver_nr)
    VALUES (p_user_id, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET last_ver_nr = ver_nr_sequences.last_ver_nr + 1
  RETURNING last_ver_nr INTO v_next;

  RETURN v_next;
END;
$function$

-- handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, subscription_type, role)
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    'user'
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$function$

-- import_sie_batch(p_payload jsonb)
CREATE OR REPLACE FUNCTION public.import_sie_batch(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_batch_id uuid;
  v_ver jsonb;
  v_row jsonb;
  v_tx_id uuid;
  v_ver_nr integer;
  v_verification_count int;
  v_imported_count int := 0;
  v_ver_balance numeric;
  v_ver_debit_sum numeric;
  v_ver_date date;
  v_year int;
  v_ib_date date;
  v_ib_balance numeric;
  v_prev_year_result_balance numeric;
  v_ib_needs_result_bridge boolean := false;
  v_ib_debit_sum numeric;
  v_ib_tx_id uuid;
  v_ib_ver_nr integer;
  v_opening_balance_imported boolean := false;
begin
  if v_user_id is null then
    raise exception 'Ingen inloggad användare.' using errcode = '28000';
  end if;

  if p_payload->'verifications' is null or jsonb_array_length(p_payload->'verifications') = 0 then
    raise exception 'Payload innehåller inga verifikationer.' using errcode = '22023';
  end if;

  -- ── Dubblettkontroll ──────────────────────────────────────
  if exists (
    select 1 from import_batches
    where user_id = v_user_id and file_hash = p_payload->>'file_hash'
  ) then
    raise exception 'Den här filen har redan importerats tidigare (hash: %).',
      left(p_payload->>'file_hash', 12)
      using errcode = '23505';
  end if;

  v_verification_count := jsonb_array_length(p_payload->'verifications');

  insert into import_batches (
    user_id, filename, file_hash, company_name, org_nr, fiscal_year,
    status, verification_count
  ) values (
    v_user_id,
    p_payload->>'filename',
    p_payload->>'file_hash',
    p_payload->>'company_name',
    p_payload->>'org_nr',
    nullif(p_payload->>'fiscal_year', '')::int,
    'pending',
    v_verification_count
  )
  returning id into v_batch_id;

  -- ── Ingående balans (#IB) ──────────────────────────────────
  -- Bearbetas FÖRE de vanliga verifikationerna, så dess ver_nr blir lägre -
  -- den representerar räkenskapsårets första dag, inte en händelse under året.
  if p_payload->'opening_balances' is not null and jsonb_array_length(p_payload->'opening_balances') > 0 then
    v_ib_date := (nullif(p_payload->>'fiscal_year', '') || '-01-01')::date;

    -- Samma årslåsningskontroll som verifikationerna nedan - utan den skulle
    -- en öppningsbalans kunna importeras till ett redan låst räkenskapsår,
    -- helt förbi det skydd som gäller för alla andra verifikationer.
    if exists (
      select 1 from closed_years
      where user_id = v_user_id and year = extract(year from v_ib_date)::int
    ) then
      raise exception 'Räkenskapsår % är låst - kan inte importera ingående balans (#IB).',
        extract(year from v_ib_date)::int
        using errcode = '23514';
    end if;

    -- Samma explicita validering som verifikationsraderna nedan - fångar
    -- saknade fält innan de används, istället för att förlita sig på att
    -- GREATEST/constraints indirekt fångar dem (se tidigare granskning).
    for v_row in select * from jsonb_array_elements(p_payload->'opening_balances')
    loop
      if v_row->>'account_number' is null or btrim(v_row->>'account_number') = '' then
        raise exception 'Ingående balans innehåller en rad utan kontonummer.'
          using errcode = '22023';
      end if;

      if v_row->>'amount' is null then
        raise exception 'Ingående balans, konto %: belopp saknas.', v_row->>'account_number'
          using errcode = '22023';
      end if;

      if v_row->>'amount' !~ '^-?\d+(\.\d+)?$' then
        raise exception 'Ingående balans, konto %: ogiltigt beloppsformat (fick: %).',
          v_row->>'account_number', v_row->>'amount'
          using errcode = '22023';
      end if;
    end loop;

    -- Server-side avstämning av ingående balans. I senare räkenskapsår kan
    -- #IB ha en differens som exakt motsvaras av föregående års resultat i
    -- #RES -1. Samma kontroll görs redan i parsern, men databasen verifierar
    -- payloaden självständigt innan någon bokföringsrad skrivs.
    select coalesce(sum((row_data->>'amount')::numeric), 0)
      into v_ib_balance
      from jsonb_array_elements(p_payload->'opening_balances') as row_data;

    select coalesce(sum((row_data->>'amount')::numeric), 0)
      into v_prev_year_result_balance
      from jsonb_array_elements(
        coalesce(p_payload->'previous_year_result_balances', '[]'::jsonb)
      ) as row_data;

    -- Om #IB redan balanserar behövs ingen bryggrad, även om #RES -1 finns.
    -- Om #IB inte balanserar får differensen däremot accepteras endast när
    -- den exakt motsvaras av nettot i #RES -1. Då skapas senare en 2019-rad.
    v_ib_needs_result_bridge := false;

    if abs(v_ib_balance) > 0.005 then
      if jsonb_array_length(
        coalesce(p_payload->'previous_year_result_balances', '[]'::jsonb)
      ) > 0
      and abs(v_ib_balance + v_prev_year_result_balance) <= 0.005 then
        v_ib_needs_result_bridge := true;
      else
        if jsonb_array_length(
          coalesce(p_payload->'previous_year_result_balances', '[]'::jsonb)
        ) > 0 then
          raise exception
            'Ingående balans (#IB) stämmer inte mot föregående års resultat (#RES -1): differens % kr.',
            round(v_ib_balance + v_prev_year_result_balance, 2)
            using errcode = '22023';
        else
          raise exception
            'Ingående balans (#IB) balanserar inte (differens % kr).',
            round(v_ib_balance, 2)
            using errcode = '22023';
        end if;
      end if;
    end if;

    select coalesce(sum(greatest((row_data->>'amount')::numeric, 0)), 0)
      into v_ib_debit_sum
      from jsonb_array_elements(p_payload->'opening_balances') as row_data;

    if v_ib_needs_result_bridge then
      v_ib_debit_sum := v_ib_debit_sum + greatest(v_prev_year_result_balance, 0);
    end if;

    -- Serialisera IB-kontrollen per användare + räkenskapsår så att två
    -- samtidiga importer inte båda kan passera EXISTS-kontrollen innan
    -- någon av dem hunnit skriva sin ingående balans.
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || v_ib_date::text, 0)
    );

    -- Separat dubblettskydd för ingående balans. Filhash-skyddet ovan
    -- stoppar bara exakt samma parsade import. En ny export från samma
    -- ekonomisystem kan ha samma #IB men fler/andra verifikationer och
    -- därmed en annan hash.
    --
    -- Även äldre SoloLedger-importer känns igen uttryckligen via den
    -- legacy-markering som användes före source='sie_opening_balance'.
    if exists (
      select 1
      from transactions
      where user_id = v_user_id
        and date = v_ib_date
        and (
          source = 'sie_opening_balance'
          or (
            source = 'sie_import'
            and description = 'Öppningsbalans'
          )
        )
    ) then
      raise exception
        'Det finns redan en ingående balans för räkenskapsår %. Importen avbryts för att förhindra dubbel ingående balans.',
        extract(year from v_ib_date)::int
        using errcode = 'P2001';
    end if;

    select get_next_ver_nr(v_user_id) into v_ib_ver_nr;

    insert into transactions (
      user_id, date, description, amount, type, vat_rate,
      booked, source, import_batch_id, source_ver_series, source_ver_number
    ) values (
      v_user_id,
      v_ib_date,
      'Ingående balans',
      v_ib_debit_sum,
      null,
      null,
      true,
      'sie_opening_balance',
      v_batch_id,
      null,
      null
    )
    returning id into v_ib_tx_id;

    for v_row in select * from jsonb_array_elements(p_payload->'opening_balances')
    loop
      insert into journal_entries (
        transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
      ) values (
        v_ib_tx_id,
        v_ib_ver_nr,
        v_row->>'account_number',
        greatest((v_row->>'amount')::numeric, 0),
        greatest(-(v_row->>'amount')::numeric, 0),
        'Ingående balans',
        v_ib_date,
        v_user_id
      );
    end loop;

    -- Om #IB endast balanserar tillsammans med #RES -1 representeras det
    -- föregående årets ännu ej omförda nettoresultat på BAS-konto 2019.
    -- Beloppets tecken följer SIE-konventionen: positivt = debet,
    -- negativt = kredit.
    if v_ib_needs_result_bridge then
      insert into journal_entries (
        transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
      ) values (
        v_ib_tx_id,
        v_ib_ver_nr,
        '2019',
        greatest(v_prev_year_result_balance, 0),
        greatest(-v_prev_year_result_balance, 0),
        'Föregående års resultat',
        v_ib_date,
        v_user_id
      );
    end if;

    v_opening_balance_imported := true;
  end if;

  -- ── Bearbeta varje verifikation ───────────────────────────
  for v_ver in select * from jsonb_array_elements(p_payload->'verifications')
  loop
    -- ── Explicit validering: datum ──
    -- Utan denna kontroll skulle ett null/felformaterat datum ge NULL vid
    -- cast, vilket i sin tur gör att closed_years-kontrollen (year = NULL)
    -- tyst aldrig matchar - årslåsningen skulle kringgås istället för att
    -- stoppa importen. Formatet (YYYY-MM-DD) matchar exakt vad sieParser.ts
    -- alltid producerar; ett avvikande värde betyder en payload som inte
    -- gått igenom den normala parser-vägen.
    if v_ver->>'date' is null or v_ver->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Verifikation % %: ogiltigt eller saknat datum (fick: %).',
        v_ver->>'series', v_ver->>'ver_number', coalesce(v_ver->>'date', 'null')
        using errcode = '22023';
    end if;

    v_ver_date := (v_ver->>'date')::date;
    v_year := extract(year from v_ver_date)::int;

    -- ── Explicit validering: rader finns ──
    if v_ver->'rows' is null or jsonb_array_length(v_ver->'rows') = 0 then
      raise exception 'Verifikation % % innehåller inga transaktionsrader.',
        v_ver->>'series', v_ver->>'ver_number'
        using errcode = '22023';
    end if;

    -- ── Explicit validering: konto och belopp per rad ──
    -- Utan denna kontroll skulle en rad med null-belopp INTE ge ett fel -
    -- greatest((null)::numeric, 0) returnerar 0, inte NULL (Postgres
    -- GREATEST/LEAST ignorerar NULL-argument), vilket tyst skulle skriva
    -- en debet=0/kredit=0-rad på ett riktigt konto istället för att
    -- stoppas. Samma NULL skulle också tyst räknas som 0 i balanskontrollen
    -- nedan, så en trasig rad hade inte ens synts som en obalans.
    for v_row in select * from jsonb_array_elements(v_ver->'rows')
    loop
      if v_row->>'account_number' is null or btrim(v_row->>'account_number') = '' then
        raise exception 'Verifikation % % innehåller en rad utan kontonummer.',
          v_ver->>'series', v_ver->>'ver_number'
          using errcode = '22023';
      end if;

      if v_row->>'amount' is null then
        raise exception 'Verifikation % %, konto %: belopp saknas.',
          v_ver->>'series', v_ver->>'ver_number', v_row->>'account_number'
          using errcode = '22023';
      end if;

      if v_row->>'amount' !~ '^-?\d+(\.\d+)?$' then
        raise exception 'Verifikation % %, konto %: ogiltigt beloppsformat (fick: %).',
          v_ver->>'series', v_ver->>'ver_number', v_row->>'account_number', v_row->>'amount'
          using errcode = '22023';
      end if;
    end loop;

    -- Räkenskapsårslåsning kontrolleras i BULK, innan något skrivs för den
    -- här verifikationen (matchar importstrategins steg 3 - inte rad för
    -- rad mitt i skrivningen).
    if exists (select 1 from closed_years where user_id = v_user_id and year = v_year) then
      raise exception 'Räkenskapsår % är låst - kan inte importera verifikation % %.',
        v_year, v_ver->>'series', v_ver->>'ver_number'
        using errcode = '23514';
    end if;

    -- Server-side balanskontroll, oberoende av klientens egen (parsern har
    -- redan gjort samma kontroll, men vi litar aldrig enbart på klienten
    -- för något som skriver till bokföringen).
    select coalesce(sum((row_data->>'amount')::numeric), 0)
      into v_ver_balance
      from jsonb_array_elements(v_ver->'rows') as row_data;

    if abs(v_ver_balance) > 0.005 then
      raise exception 'Verifikation % % balanserar inte (differens % kr).',
        v_ver->>'series', v_ver->>'ver_number', round(v_ver_balance, 2)
        using errcode = '22023';
    end if;

    select coalesce(sum(greatest((row_data->>'amount')::numeric, 0)), 0)
      into v_ver_debit_sum
      from jsonb_array_elements(v_ver->'rows') as row_data;

    select get_next_ver_nr(v_user_id) into v_ver_nr;

    insert into transactions (
      user_id, date, description, amount, type, vat_rate,
      booked, source, import_batch_id, source_ver_series, source_ver_number
    ) values (
      v_user_id,
      v_ver_date,
      coalesce(v_ver->>'description', ''),
      v_ver_debit_sum,
      null,
      null,
      true,
      'sie_import',
      v_batch_id,
      v_ver->>'series',
      v_ver->>'ver_number'
    )
    returning id into v_tx_id;

    for v_row in select * from jsonb_array_elements(v_ver->'rows')
    loop
      insert into journal_entries (
        transaction_id, ver_nr, account_number, debit, credit, description, date, user_id
      ) values (
        v_tx_id,
        v_ver_nr,
        v_row->>'account_number',
        greatest((v_row->>'amount')::numeric, 0),
        greatest(-(v_row->>'amount')::numeric, 0),
        coalesce(v_row->>'description', v_ver->>'description', ''),
        coalesce((v_row->>'date')::date, v_ver_date),
        v_user_id
      );
    end loop;

    v_imported_count := v_imported_count + 1;
  end loop;

  update import_batches
    set status = 'completed',
        imported_count = v_imported_count,
        completed_at = now()
    where id = v_batch_id;

  return jsonb_build_object(
    'success', true,
    'import_batch_id', v_batch_id,
    'verification_count', v_verification_count,
    'imported_count', v_imported_count,
    'opening_balance_imported', v_opening_balance_imported
  );

  -- Inget EXCEPTION-block här medvetet: varje raise exception ovan
  -- propagerar obehandlad ut ur funktionen, vilket gör att Postgres
  -- rullar tillbaka HELA anropet - inklusive import_batches-raden som
  -- redan infogats. Klienten ser felet via supabase.rpc()'s error-fält
  -- (se sieImport.ts) och databasen innehåller inga spår av försöket.
end;
$function$

-- is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$

-- prevent_deleting_used_account()
CREATE OR REPLACE FUNCTION public.prevent_deleting_used_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.user_id = OLD.user_id
      AND t.type = OLD.id
      AND t.booked = true
  ) THEN
    RAISE EXCEPTION
      'Kontot "%" används i bokförda transaktioner och kan inte raderas.',
      OLD.id
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$function$

-- rls_auto_enable()
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$

-- undo_sie_import_atomic(p_import_batch_id uuid)
CREATE OR REPLACE FUNCTION public.undo_sie_import_atomic(p_import_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_batch public.import_batches%ROWTYPE;
  v_original public.transactions%ROWTYPE;

  v_original_ver_nr integer;
  v_next_ver_nr integer;
  v_correction_date date;
  v_corr_tx_id uuid;

  v_entry_count integer;
  v_distinct_ver_count integer;
  v_linked_tx_count integer;
  v_normal_import_count integer;
  v_opening_balance_count integer;
  v_correction_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_import_batch_id IS NULL THEN
    RAISE EXCEPTION 'Import-ID saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- Lås batchen så att två samtidiga ångringar inte kan starta.
  SELECT *
    INTO v_batch
  FROM public.import_batches
  WHERE id = p_import_batch_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SIE-importen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  IF v_batch.status = 'undone' THEN
    RAISE EXCEPTION 'SIE-importen är redan ångrad.'
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status <> 'completed' THEN
    RAISE EXCEPTION 'Endast en slutförd SIE-import kan ångras (status: %).', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- En tidigare/halv ångring ska aldrig kunna döljas bakom batchstatus.
  IF EXISTS (
    SELECT 1
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source = 'sie_import_undo'
  ) THEN
    RAISE EXCEPTION 'Importen har redan automatiska rättelser och kan inte ångras igen.'
      USING ERRCODE = '23514';
  END IF;

  -- Kontrollera att batchens vanliga importerade verifikationer fortfarande
  -- motsvarar imported_count. Legacy-IB kunde ligga som source='sie_import'
  -- med beskrivningen "Öppningsbalans", så den räknas inte som vanlig #VER.
  SELECT count(*)
    INTO v_normal_import_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source = 'sie_import'
    AND NOT (
      description = 'Öppningsbalans'
      AND source_ver_series IS NULL
      AND source_ver_number IS NULL
    );

  IF v_normal_import_count <> v_batch.imported_count THEN
    RAISE EXCEPTION
      'Importen kan inte ångras automatiskt eftersom dess importerade verifikationer inte längre är kompletta (% av % hittades).',
      v_normal_import_count, v_batch.imported_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
    INTO v_opening_balance_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND (
      source = 'sie_opening_balance'
      OR (
        source = 'sie_import'
        AND description = 'Öppningsbalans'
        AND source_ver_series IS NULL
        AND source_ver_number IS NULL
      )
    );

  IF v_opening_balance_count > 1 THEN
    RAISE EXCEPTION 'Importen innehåller fler än en ingående balans och kan inte ångras automatiskt.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)
    INTO v_linked_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance');

  IF v_linked_tx_count = 0 THEN
    RAISE EXCEPTION 'Importen saknar bokförda transaktioner och kan inte ångras automatiskt.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Lås alla importerade originaltransaktioner innan vi börjar kontrollera
  -- och skapa rättelser. Ordningen gör låsningen deterministisk.
  PERFORM 1
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance')
  ORDER BY id
  FOR UPDATE;

  -- Förkontrollera HELA batchen innan första rättelsen skapas.
  -- Därmed får användaren ett rent fel utan att vi ens hunnit börja skriva.
  FOR v_original IN
    SELECT *
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source IN ('sie_import', 'sie_opening_balance')
    ORDER BY date, id
  LOOP
    SELECT
      count(*),
      count(DISTINCT ver_nr),
      min(ver_nr)
    INTO
      v_entry_count,
      v_distinct_ver_count,
      v_original_ver_nr
    FROM public.journal_entries
    WHERE transaction_id = v_original.id
      AND user_id = v_user_id;

    IF v_entry_count = 0 OR v_original_ver_nr IS NULL THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom en importerad verifikation saknar journalposter.'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_distinct_ver_count <> 1 THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom en importerad transaktion har inkonsekventa verifikationsnummer.'
        USING ERRCODE = '23514';
    END IF;

    -- Vi använder samma koppling som vanliga KORRVER: corrects_ver_nr.
    -- Om någon redan manuellt har korrigerat ett importerat verifikat ska
    -- hela automatiska batch-ångringen stoppas.
    IF EXISTS (
      SELECT 1
      FROM public.transactions c
      WHERE c.user_id = v_user_id
        AND coalesce(c.is_correction, false) = true
        AND c.corrects_ver_nr = v_original_ver_nr
    ) THEN
      RAISE EXCEPTION
        'Importen kan inte ångras automatiskt eftersom VER-% redan har korrigerats.',
        v_original_ver_nr
        USING ERRCODE = '23514';
    END IF;

    v_correction_date := greatest(current_date, v_original.date);

    IF EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year = extract(year from v_correction_date)::int
    ) THEN
      RAISE EXCEPTION
        'Importen kan inte ångras eftersom korrigeringsåret % är låst (VER-%).',
        extract(year from v_correction_date)::int,
        v_original_ver_nr
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- ── Skapa rättelser ────────────────────────────────────────
  -- Först när hela batchen är validerad skapar vi en spegelverifikation
  -- per importerad transaktion.
  FOR v_original IN
    SELECT *
    FROM public.transactions
    WHERE user_id = v_user_id
      AND import_batch_id = p_import_batch_id
      AND source IN ('sie_import', 'sie_opening_balance')
    ORDER BY date, id
  LOOP
    SELECT min(ver_nr)
      INTO v_original_ver_nr
    FROM public.journal_entries
    WHERE transaction_id = v_original.id
      AND user_id = v_user_id;

    v_correction_date := greatest(current_date, v_original.date);

    SELECT public.get_next_ver_nr(v_user_id)
      INTO v_next_ver_nr;

    IF v_next_ver_nr IS NULL THEN
      RAISE EXCEPTION 'Kunde inte generera verifikationsnummer vid ångring av SIE-import.';
    END IF;

    INSERT INTO public.transactions (
      date,
      description,
      amount,
      type,
      vat_rate,
      booked,
      is_correction,
      corrects_ver_nr,
      user_id,
      source,
      import_batch_id
    ) VALUES (
      v_correction_date,
      '↩ Ångrad SIE-import: ' || v_batch.filename || ' – korrigering av VER-' || v_original_ver_nr,
      v_original.amount,
      v_original.type,
      v_original.vat_rate,
      true,
      true,
      v_original_ver_nr,
      v_user_id,
      'sie_import_undo',
      p_import_batch_id
    )
    RETURNING id INTO v_corr_tx_id;

    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    )
    SELECT
      v_corr_tx_id,
      v_next_ver_nr,
      e.account_number,
      e.credit,
      e.debit,
      'Ångrad SIE-import ' || v_batch.filename || ' – korrigering av VER-' || v_original_ver_nr || ': ' || coalesce(e.description, ''),
      v_correction_date,
      v_user_id
    FROM public.journal_entries e
    WHERE e.transaction_id = v_original.id
      AND e.user_id = v_user_id;

    v_correction_count := v_correction_count + 1;
  END LOOP;

  UPDATE public.import_batches
  SET status = 'undone',
      undone_at = now()
  WHERE id = p_import_batch_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'import_batch_id', p_import_batch_id,
    'filename', v_batch.filename,
    'status', 'undone',
    'correction_count', v_correction_count,
    'undone_at', now()
  );
END;
$function$

-- update_transaction_safe(p_tx_id uuid, p_updates jsonb)
CREATE OR REPLACE FUNCTION public.update_transaction_safe(p_tx_id uuid, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_tx public.transactions%ROWTYPE;
  v_new_date date;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen giltig eller inloggad användare hittades.'
      USING ERRCODE = '42501';
  END IF;

  IF p_tx_id IS NULL THEN
    RAISE EXCEPTION 'Transaktions-ID saknas.'
      USING ERRCODE = '22023';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'Ogiltig uppdateringsdata.'
      USING ERRCODE = '22023';
  END IF;

  -- Lås raden så att ägarskap/låsstatus och uppdatering bedöms atomiskt.
  SELECT *
  INTO v_tx
  FROM public.transactions
  WHERE id = p_tx_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaktionen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  -- Det år transaktionen ligger i idag måste vara öppet.
  IF EXISTS (
    SELECT 1
    FROM public.closed_years
    WHERE user_id = v_user_id
      AND year = EXTRACT(YEAR FROM v_tx.date)::integer
  ) THEN
    RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
      EXTRACT(YEAR FROM v_tx.date)::integer
      USING ERRCODE = '42501';
  END IF;

  -- Om datum skickas in: validera det och kontrollera att eventuellt nytt år är öppet.
  IF p_updates ? 'date' THEN
    BEGIN
      v_new_date := (p_updates->>'date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Ogiltigt datum.'
        USING ERRCODE = '22007';
    END;

    IF v_new_date IS NULL THEN
      RAISE EXCEPTION 'Datum får inte vara tomt.'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.closed_years
      WHERE user_id = v_user_id
        AND year = EXTRACT(YEAR FROM v_new_date)::integer
    ) THEN
      RAISE EXCEPTION 'Räkenskapsår % är låst för ändringar.',
        EXTRACT(YEAR FROM v_new_date)::integer
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bokförd verifikation: bokföringspåverkande fält får aldrig ändras direkt.
  -- Datum och beskrivning jämförs mot befintliga värden eftersom klienten får
  -- skicka med samma värden utan att detta ska räknas som en ändring.
  IF COALESCE(v_tx.booked, false)
     AND (
       (p_updates ? 'date' AND v_new_date IS DISTINCT FROM v_tx.date)
       OR (
         p_updates ? 'description'
         AND (p_updates->>'description') IS DISTINCT FROM v_tx.description
       )
       OR p_updates ? 'amount'
       OR p_updates ? 'type'
       OR p_updates ? 'vat_rate'
     )
  THEN
    RAISE EXCEPTION
      'Bokförda transaktioner får inte ändras i datum, beskrivning, belopp, kategori eller moms. Använd korrigeringsverifikation.'
      USING ERRCODE = '42501';
  END IF;

  -- Whitelist: okända/skadliga fält (t.ex. user_id, booked, ver_nr) ignoreras.
  UPDATE public.transactions
  SET
    date = CASE
      WHEN p_updates ? 'date' THEN v_new_date
      ELSE date
    END,
    description = CASE
      WHEN p_updates ? 'description' THEN p_updates->>'description'
      ELSE description
    END,
    amount = CASE
      WHEN p_updates ? 'amount' THEN (p_updates->>'amount')::numeric
      ELSE amount
    END,
    type = CASE
      WHEN p_updates ? 'type' THEN p_updates->>'type'
      ELSE type
    END,
    vat_rate = CASE
      WHEN p_updates ? 'vat_rate' THEN (p_updates->>'vat_rate')::numeric
      ELSE vat_rate
    END,
    file_url = CASE
      WHEN p_updates ? 'file_url' THEN p_updates->>'file_url'
      ELSE file_url
    END
  WHERE id = p_tx_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', p_tx_id
  );
END;
$function$

-- =====================================================================
-- 4. RLS POLICIES (PUBLIC + STORAGE)
-- =====================================================================

CREATE POLICY "Användare raderar bara egna konton" ON public.accounts
AS PERMISSIVE
FOR DELETE
TO public
USING ((auth.uid() = user_id));

CREATE POLICY "Användare ser bara sina egna konton" ON public.accounts
AS PERMISSIVE
FOR SELECT
TO public
USING ((auth.uid() = user_id));

CREATE POLICY "Användare skapar bara egna konton" ON public.accounts
AS PERMISSIVE
FOR INSERT
TO public
WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Användare uppdaterar bara egna konton" ON public.accounts
AS PERMISSIVE
FOR UPDATE
TO public
USING ((auth.uid() = user_id));

CREATE POLICY "Användare kan bara låsa sina egna år" ON public.closed_years
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Användare ser bara sina egna låsta år" ON public.closed_years
AS PERMISSIVE
FOR SELECT
TO authenticated
USING ((auth.uid() = user_id));

CREATE POLICY "favorites_self_access" ON public.favorites
AS PERMISSIVE
FOR ALL
TO public
USING ((user_id = auth.uid()))
WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "import_batches_self_access" ON public.import_batches
AS PERMISSIVE
FOR ALL
TO public
USING ((user_id = auth.uid()))
WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Användare ser bara sina egna journalposter" ON public.journal_entries
AS PERMISSIVE
FOR SELECT
TO public
USING ((auth.uid() = user_id));

CREATE POLICY "admin_read_all_profiles" ON public.profiles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (((auth.uid() = id) OR is_admin()));

CREATE POLICY "profiles_self_access" ON public.profiles
AS PERMISSIVE
FOR ALL
TO public
USING ((id = auth.uid()))
WITH CHECK ((id = auth.uid()));

CREATE POLICY "Användare ser bara sina egna transaktioner" ON public.transactions
AS PERMISSIVE
FOR SELECT
TO public
USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own ver_nr sequence" ON public.ver_nr_sequences
AS PERMISSIVE
FOR UPDATE
TO public
USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own ver_nr sequence" ON public.ver_nr_sequences
AS PERMISSIVE
FOR SELECT
TO public
USING ((auth.uid() = user_id));

CREATE POLICY "ver_nr_sequences_owner" ON public.ver_nr_sequences
AS PERMISSIVE
FOR ALL
TO public
USING ((user_id = auth.uid()))
WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Användare kan ladda upp sina egna bilagor" ON storage.objects
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Användare kan läsa sina egna bilagor" ON storage.objects
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Användare kan radera sina egna bilagor" ON storage.objects
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (((bucket_id = 'attachments'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY "Give users access to own folder 1mt4rzk_0" ON storage.objects
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (((bucket_id = 'attachments'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));

CREATE POLICY "Give users access to own folder 1mt4rzk_1" ON storage.objects
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (((bucket_id = 'attachments'::text) AND (( SELECT (auth.uid())::text AS uid) = (storage.foldername(name))[1])));

-- =====================================================================
-- 5. TABLE PRIVILEGES / GRANTS
-- =====================================================================

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.accounts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.accounts TO service_role;
GRANT INSERT, SELECT ON TABLE public.closed_years TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.closed_years TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.favorites TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.favorites TO service_role;
GRANT SELECT ON TABLE public.import_batches TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.import_batches TO service_role;
GRANT SELECT ON TABLE public.journal_entries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.journal_entries TO service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.transactions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.transactions TO service_role;
GRANT SELECT ON TABLE public.ver_nr_sequences TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ver_nr_sequences TO service_role;

-- Verified column-level UPDATE restriction for normal users:
GRANT UPDATE (company_name, org_nr) ON TABLE public.profiles TO authenticated;
-- No table grants for anon were present in the verified export.

-- =====================================================================
-- 6. PUBLIC INDEXES
-- =====================================================================

CREATE UNIQUE INDEX accounts_pkey ON public.accounts USING btree (id, user_id);
CREATE UNIQUE INDEX closed_years_pkey ON public.closed_years USING btree (id);
CREATE UNIQUE INDEX closed_years_user_id_year_key ON public.closed_years USING btree (user_id, year);
CREATE INDEX idx_closed_years_user_year ON public.closed_years USING btree (user_id, year);
CREATE UNIQUE INDEX favorites_pkey ON public.favorites USING btree (id);
CREATE UNIQUE INDEX import_batches_pkey ON public.import_batches USING btree (id);
CREATE UNIQUE INDEX import_batches_user_id_file_hash_key ON public.import_batches USING btree (user_id, file_hash);
CREATE INDEX idx_journal_entries_account_number ON public.journal_entries USING btree (account_number);
CREATE INDEX idx_journal_entries_transaction_id ON public.journal_entries USING btree (transaction_id);
CREATE INDEX idx_journal_entries_user_id ON public.journal_entries USING btree (user_id);
CREATE UNIQUE INDEX journal_entries_pkey ON public.journal_entries USING btree (id);
CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);
CREATE INDEX idx_transactions_user_date ON public.transactions USING btree (user_id, date);
CREATE UNIQUE INDEX transactions_one_correction_per_original ON public.transactions USING btree (user_id, corrects_ver_nr) WHERE ((is_correction = true) AND (corrects_ver_nr IS NOT NULL));
CREATE UNIQUE INDEX transactions_pkey ON public.transactions USING btree (id);
CREATE UNIQUE INDEX ver_nr_sequences_pkey ON public.ver_nr_sequences USING btree (user_id);
CREATE UNIQUE INDEX ver_nr_sequences_user_unique ON public.ver_nr_sequences USING btree (user_id);

-- =====================================================================
-- 7. PUBLIC TRIGGERS
-- =====================================================================

CREATE TRIGGER prevent_deleting_used_account BEFORE DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION prevent_deleting_used_account();

-- =====================================================================
-- 8. STORAGE BUCKET CONFIGURATION
-- =====================================================================

-- Verified live bucket state (2026-09-11):
-- id/name: attachments / attachments
-- public: false
-- file_size_limit: 10485760 bytes (10 MiB)
-- allowed_mime_types: ["image/jpeg","image/png","image/webp","application/pdf"]
--
-- Bucket creation/configuration is intentionally documented rather than executed here.
-- Storage RLS policies themselves are captured in section 4 from pg_policies.

-- =====================================================================
-- 9. KNOWN SNAPSHOT BOUNDARIES
-- =====================================================================
-- This 2026-09-11 snapshot now includes the live public tables/constraints,
-- public RLS state, public + Storage RLS policies, public table grants,
-- the verified profiles column-level UPDATE restriction, all 12 live public
-- functions/RPCs, public indexes, the live public non-internal trigger, and
-- the verified attachments bucket configuration.
--
-- It still does not prove or recreate:
--   * auth-schema trigger bindings (for example a trigger calling handle_new_user())
--   * event-trigger bindings, if any, for rls_auto_enable()
--   * per-function EXECUTE grants/revokes
--   * extensions and project-level Supabase configuration
--
-- Treat this as an audited production-state baseline, not as a script to run
-- against the existing production database. Test any future clean rebuild in
-- a disposable Supabase project before relying on it for disaster recovery.
