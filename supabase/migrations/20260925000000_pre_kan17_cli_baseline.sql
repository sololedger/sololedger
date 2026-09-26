-- SoloLedger CLI migration cutover baseline.
--
-- Historical boundary:
--   Reconstructs the SoloLedger production schema state after the manually
--   applied legacy SQL through 20260920 and immediately before KAN-17A,
--   which is recorded remotely as migration 20260925050113.
--
-- Purpose:
--   This is an active Supabase CLI reconstruction/cutover baseline for fresh
--   local/staging environments and migration-history alignment. It is separate
--   from supabase/baseline/20260911_production_schema_baseline.sql, which
--   remains an audit/recovery snapshot.
--
-- Safety:
--   DO NOT execute this file against the existing production database.
--   Production already contains these schema effects. The production migration
--   ledger will later be aligned with this baseline by a metadata-only
--   `supabase migration repair --status applied 20260925000000` after explicit
--   approval. This file contains no product data, auth users, credentials,
--   Supabase migration-history rows, KAN-17 classifier objects, KAN-19 exact
--   2645 classifier changes, or VAT V2 persistence artifacts.
--
-- Construction notes:
--   Built from the verified 20260911 production audit snapshot plus the
--   archived manually-applied 20260916-20260920 SQL files. Backing index
--   statements that duplicate primary-key/unique constraints from the snapshot
--   are omitted so the baseline can replay on a fresh database.
--

-- =====================================================================
-- Source: supabase/baseline/20260911_production_schema_baseline.sql
-- =====================================================================
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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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
$function$;

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

CREATE INDEX idx_closed_years_user_year ON public.closed_years USING btree (user_id, year);
CREATE INDEX idx_journal_entries_account_number ON public.journal_entries USING btree (account_number);
CREATE INDEX idx_journal_entries_transaction_id ON public.journal_entries USING btree (transaction_id);
CREATE INDEX idx_journal_entries_user_id ON public.journal_entries USING btree (user_id);
CREATE INDEX idx_transactions_user_date ON public.transactions USING btree (user_id, date);
CREATE UNIQUE INDEX transactions_one_correction_per_original ON public.transactions USING btree (user_id, corrects_ver_nr) WHERE ((is_correction = true) AND (corrects_ver_nr IS NOT NULL));
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

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260916_add_vat_profile_settings.sql
-- =====================================================================
-- ============================================================
-- SoloLedger – VAT profile settings
-- 2026-09-16
--
-- Adds the minimum company-level VAT configuration required
-- for the guided VAT flow.
--
-- Existing users are intentionally migrated to:
--   vat_status = 'unknown'
--
-- This migration does NOT:
-- - change existing bookkeeping
-- - modify imported SIE history
-- - create VAT periods
-- - change VAT calculation
-- - change book_transaction_atomic
-- ============================================================


-- ------------------------------------------------------------
-- 1. Add VAT settings to profiles
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN vat_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN vat_period_type text,
  ADD COLUMN vat_management_from date;


-- ------------------------------------------------------------
-- 2. Restrict allowed VAT status values
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vat_status_check
  CHECK (
    vat_status IN (
      'registered',
      'not_registered',
      'unknown'
    )
  );


-- ------------------------------------------------------------
-- 3. Restrict allowed VAT period types
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vat_period_type_check
  CHECK (
    vat_period_type IS NULL
    OR vat_period_type IN (
      'month',
      'quarter',
      'year'
    )
  );


-- ------------------------------------------------------------
-- 4. Keep the three settings internally consistent
--
-- registered:
--   period type + management start date are required
--
-- not_registered / unknown:
--   period type + management start date must be NULL
-- ------------------------------------------------------------

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_vat_settings_consistency_check
  CHECK (
    (
      vat_status = 'registered'
      AND vat_period_type IS NOT NULL
      AND vat_management_from IS NOT NULL
    )
    OR
    (
      vat_status IN ('not_registered', 'unknown')
      AND vat_period_type IS NULL
      AND vat_management_from IS NULL
    )
  );


-- ------------------------------------------------------------
-- 5. Allow authenticated users to update only the VAT profile
--    fields in addition to the already permitted company fields.
--
-- Existing RLS still requires id = auth.uid().
-- ------------------------------------------------------------

GRANT UPDATE (
  vat_status,
  vat_period_type,
  vat_management_from
) ON TABLE public.profiles TO authenticated;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260916_add_vat_periods.sql
-- =====================================================================
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

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260916_guard_non_vat_registered_bookings.sql
-- =====================================================================
-- SoloLedger
-- 2026-09-16
-- Step 2A: server-side VAT guard for profiles marked not_registered.
--
-- Function bodies are based on live production pg_get_functiondef() output
-- retrieved immediately before this migration. Existing bookkeeping logic is
-- intentionally preserved; only the vat_status guard is added.
--
-- Same function signatures are retained, so existing EXECUTE grants remain.
-- SECURITY DEFINER and search_path remain as in the live definitions.

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
  v_vat_status text;
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

  -- Momsstatus-skydd för nya bokningar.
  -- 'unknown' eller saknad profilrad ändrar inte befintligt beteende.
  SELECT p.vat_status
    INTO v_vat_status
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF coalesce(v_vat_status, 'unknown') = 'not_registered'
     AND v_vat_rate <> 0 THEN
    RAISE EXCEPTION
      'Företaget är markerat som inte momsregistrerat. Momssatsen måste vara 0 procent för nya vanliga bokningar.'
      USING ERRCODE = '23514';
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
$function$;
;

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
  v_vat_status text;
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

  -- Momsstatus-skydd för nya bokningar.
  -- 'unknown' eller saknad profilrad ändrar inte befintligt beteende.
  SELECT p.vat_status
    INTO v_vat_status
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF coalesce(v_vat_status, 'unknown') = 'not_registered'
     AND v_vat_rate <> 0 THEN
    RAISE EXCEPTION
      'Företaget är markerat som inte momsregistrerat. Momssatsen måste vara 0 procent för periodiserade bokningar.'
      USING ERRCODE = '23514';
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
$function$;
;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260916_adjust_vat_period_closing_constraint.sql
-- =====================================================================
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

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260916_secure_year_closing.sql
-- =====================================================================
BEGIN;

-- ============================================================
-- Secure year closing
--
-- Year closing must go through one controlled server-side path.
--
-- Reasons:
-- 1. The previous client flow performed a direct INSERT into
--    closed_years.
-- 2. VAT closing is booked on vat_periods.period_end.
-- 3. A year must therefore not be locked while a SoloLedger-
--    managed VAT period whose closing belongs to that year is
--    still open.
--
-- The function is SECURITY DEFINER because authenticated users
-- will no longer receive direct INSERT permission on
-- public.closed_years.
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_year_atomic(
  p_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing_closed_at timestamptz;
  v_open_vat_period record;
BEGIN
  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Du måste vara inloggad för att låsa ett räkenskapsår.';
  END IF;

  -- ----------------------------------------------------------
  -- Basic year validation
  --
  -- SoloLedger currently works with normal calendar-year
  -- bookkeeping. Keep the validation deliberately broad here;
  -- the important invariant is that a real four-digit year is
  -- supplied.
  -- ----------------------------------------------------------
  IF p_year IS NULL OR p_year < 1900 OR p_year > 9999 THEN
    RAISE EXCEPTION 'Ogiltigt räkenskapsår.';
  END IF;

  -- ----------------------------------------------------------
  -- Idempotency / already closed
  --
  -- Lock an existing row if present so concurrent calls for the
  -- same existing year cannot race past this check.
  -- The UNIQUE(user_id, year) constraint remains the final
  -- protection for concurrent first-time inserts.
  -- ----------------------------------------------------------
  SELECT cy.closed_at
    INTO v_existing_closed_at
  FROM public.closed_years cy
  WHERE cy.user_id = v_user_id
    AND cy.year = p_year
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'År % är redan låst.', p_year;
  END IF;

  -- ----------------------------------------------------------
  -- VAT precondition
  --
  -- Only SoloLedger-managed VAT periods matter here.
  --
  -- Closing a VAT period creates its accounting closing entry
  -- on period_end. Therefore a year may not be locked while an
  -- OPEN SoloLedger VAT period has period_end inside that year.
  --
  -- imported_history is intentionally excluded: SoloLedger must
  -- never create normal VAT closing entries for imported history.
  -- ----------------------------------------------------------
  SELECT
    vp.id,
    vp.period_start,
    vp.period_end,
    vp.period_type
    INTO v_open_vat_period
  FROM public.vat_periods vp
  WHERE vp.user_id = v_user_id
    AND vp.source = 'sololedger'
    AND vp.status = 'open'
    AND vp.period_end >= make_date(p_year, 1, 1)
    AND vp.period_end < make_date(p_year + 1, 1, 1)
  ORDER BY vp.period_end
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'År % kan inte låsas eftersom momsperioden % – % fortfarande är öppen.',
      p_year,
      v_open_vat_period.period_start,
      v_open_vat_period.period_end;
  END IF;

  -- ----------------------------------------------------------
  -- Create the year lock.
  --
  -- closed_at uses the table default.
  -- UNIQUE(user_id, year) is also the final concurrency guard.
  -- ----------------------------------------------------------
  BEGIN
    INSERT INTO public.closed_years (
      user_id,
      year
    )
    VALUES (
      v_user_id,
      p_year
    )
    RETURNING closed_at
      INTO v_existing_closed_at;

  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'År % är redan låst.', p_year;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'year', p_year,
    'closed_at', v_existing_closed_at
  );
END;
$$;

-- ============================================================
-- Direct client mutation is no longer allowed.
-- Reading remains unchanged so isYearClosed() can continue to
-- query closed_years directly.
-- ============================================================

REVOKE INSERT ON TABLE public.closed_years FROM authenticated;

-- Remove the now-obsolete direct INSERT RLS policy.
DROP POLICY IF EXISTS "Användare kan bara låsa sina egna år"
  ON public.closed_years;

-- Explicit function permissions.
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_year_atomic(integer) FROM anon;

GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.close_year_atomic(integer)
  TO service_role;

COMMENT ON FUNCTION public.close_year_atomic(integer) IS
  'Atomically locks a bookkeeping year for the authenticated user. Blocks locking when an open SoloLedger-managed VAT period has its period_end in the year.';

COMMIT;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260916_add_vat_closing_transaction_source.sql
-- =====================================================================
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

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260916_add_ensure_vat_periods.sql
-- =====================================================================
BEGIN;

-- ============================================================
-- ensure_vat_periods
--
-- Creates the SoloLedger-managed VAT periods that belong to the
-- authenticated user's current VAT profile configuration.
--
-- Important:
-- - This function creates PERIOD STATE only.
-- - It does not create accounting transactions.
-- - It never modifies existing VAT periods.
-- - It never manages imported_history.
-- - It never guesses across overlapping/conflicting periods.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_vat_periods(
  p_through_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;

  v_vat_status text;
  v_period_type text;
  v_management_from date;

  v_effective_through date;

  v_period_start date;
  v_period_end date;

  v_created_count integer := 0;
  v_existing_count integer := 0;

  v_existing_period record;
BEGIN
  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Du måste vara inloggad för att skapa momsperioder.';
  END IF;

  -- ----------------------------------------------------------
  -- Read and lock the VAT profile configuration.
  --
  -- Locking the profile row gives VAT-period management a stable
  -- configuration during this operation.
  -- ----------------------------------------------------------
  SELECT
    p.vat_status,
    p.vat_period_type,
    p.vat_management_from
  INTO
    v_vat_status,
    v_period_type,
    v_management_from
  FROM public.profiles p
  WHERE p.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Ingen profil hittades för användaren.';
  END IF;

  -- ----------------------------------------------------------
  -- VAT configuration must be complete.
  -- ----------------------------------------------------------
  IF v_vat_status <> 'registered' THEN
    RAISE EXCEPTION
      'Momsperioder kan bara skapas för ett momsregistrerat företag.';
  END IF;

  IF v_period_type IS NULL
     OR v_period_type NOT IN ('month', 'quarter', 'year') THEN
    RAISE EXCEPTION
      'Företagets momsperiod är inte korrekt inställd.';
  END IF;

  IF v_management_from IS NULL THEN
    RAISE EXCEPTION
      'Startdatum för SoloLedgers momshantering saknas.';
  END IF;

  IF p_through_date IS NULL THEN
    RAISE EXCEPTION
      'Slutdatum för generering av momsperioder saknas.';
  END IF;

  -- ----------------------------------------------------------
  -- Do not generate periods into the future.
  --
  -- A caller may ask SoloLedger to ensure periods through an
  -- earlier date, but not use this RPC to manufacture arbitrary
  -- future VAT periods.
  -- ----------------------------------------------------------
  v_effective_through := LEAST(p_through_date, current_date);

  -- Nothing belongs to SoloLedger yet.
  IF v_effective_through < v_management_from THEN
    RETURN jsonb_build_object(
      'success', true,
      'created_count', 0,
      'existing_count', 0,
      'period_type', v_period_type,
      'management_from', v_management_from,
      'through_date', v_effective_through
    );
  END IF;

  -- ----------------------------------------------------------
  -- Determine the first FULL VAT period whose start is on or
  -- after vat_management_from.
  --
  -- If management starts in the middle of a calendar VAT period,
  -- that partial period is intentionally skipped.
  -- ----------------------------------------------------------
  IF v_period_type = 'month' THEN

    v_period_start := date_trunc('month', v_management_from)::date;

    IF v_period_start < v_management_from THEN
      v_period_start :=
        (v_period_start + INTERVAL '1 month')::date;
    END IF;

  ELSIF v_period_type = 'quarter' THEN

    v_period_start := date_trunc('quarter', v_management_from)::date;

    IF v_period_start < v_management_from THEN
      v_period_start :=
        (v_period_start + INTERVAL '3 months')::date;
    END IF;

  ELSE
    -- year
    v_period_start := date_trunc('year', v_management_from)::date;

    IF v_period_start < v_management_from THEN
      v_period_start :=
        (v_period_start + INTERVAL '1 year')::date;
    END IF;

  END IF;

  -- The first full period may itself start after the requested
  -- through-date.
  IF v_period_start > v_effective_through THEN
    RETURN jsonb_build_object(
      'success', true,
      'created_count', 0,
      'existing_count', 0,
      'period_type', v_period_type,
      'management_from', v_management_from,
      'through_date', v_effective_through
    );
  END IF;

  -- ----------------------------------------------------------
  -- Generate all complete calendar definitions up to and
  -- including the VAT period containing v_effective_through.
  -- ----------------------------------------------------------
  WHILE v_period_start <= v_effective_through LOOP

    IF v_period_type = 'month' THEN
      v_period_end :=
        (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

    ELSIF v_period_type = 'quarter' THEN
      v_period_end :=
        (v_period_start + INTERVAL '3 months' - INTERVAL '1 day')::date;

    ELSE
      v_period_end :=
        (v_period_start + INTERVAL '1 year' - INTERVAL '1 day')::date;
    END IF;

    -- --------------------------------------------------------
    -- Never create a new VAT period whose closing transaction
    -- would belong to an already locked bookkeeping year.
    --
    -- VAT closing is booked on period_end.
    -- --------------------------------------------------------
    IF EXISTS (
      SELECT 1
      FROM public.closed_years cy
      WHERE cy.user_id = v_user_id
        AND cy.year = EXTRACT(YEAR FROM v_period_end)::integer
    ) THEN
      RAISE EXCEPTION
        'Momsperioden % – % kan inte skapas eftersom räkenskapsår % är låst.',
        v_period_start,
        v_period_end,
        EXTRACT(YEAR FROM v_period_end)::integer;
    END IF;

    -- --------------------------------------------------------
    -- Exact existing period:
    -- leave it completely untouched.
    --
    -- This applies regardless of source/status. We must never
    -- reset historical or already-closed state.
    -- --------------------------------------------------------
    SELECT
      vp.id,
      vp.period_start,
      vp.period_end,
      vp.period_type,
      vp.status,
      vp.source
    INTO v_existing_period
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.period_start = v_period_start
      AND vp.period_end = v_period_end
    LIMIT 1;

    IF FOUND THEN

      -- An exact date range with a different period type means
      -- the stored state conflicts with the current profile.
      IF v_existing_period.period_type <> v_period_type THEN
        RAISE EXCEPTION
          'Befintlig momsperiod % – % har en annan periodtyp än företagets nuvarande momsinställning.',
          v_period_start,
          v_period_end;
      END IF;

      v_existing_count := v_existing_count + 1;

    ELSE

      -- ------------------------------------------------------
      -- No exact match exists.
      --
      -- Any overlap is ambiguous and must block generation.
      -- This prevents e.g. monthly periods from being placed
      -- inside an already-existing quarterly period after a
      -- profile setting has changed.
      -- ------------------------------------------------------
      SELECT
        vp.id,
        vp.period_start,
        vp.period_end,
        vp.period_type,
        vp.status,
        vp.source
      INTO v_existing_period
      FROM public.vat_periods vp
      WHERE vp.user_id = v_user_id
        AND vp.period_start <= v_period_end
        AND vp.period_end >= v_period_start
      ORDER BY vp.period_start
      LIMIT 1;

      IF FOUND THEN
        RAISE EXCEPTION
          'Befintlig momsperiod % – % överlappar perioden % – %. Kontrollera momsinställningarna innan nya perioder skapas.',
          v_existing_period.period_start,
          v_existing_period.period_end,
          v_period_start,
          v_period_end;
      END IF;

      -- ------------------------------------------------------
      -- Create a new SoloLedger-managed OPEN period.
      -- ------------------------------------------------------
      INSERT INTO public.vat_periods (
        user_id,
        period_start,
        period_end,
        period_type,
        status,
        source
      )
      VALUES (
        v_user_id,
        v_period_start,
        v_period_end,
        v_period_type,
        'open',
        'sololedger'
      );

      v_created_count := v_created_count + 1;

    END IF;

    -- --------------------------------------------------------
    -- Advance to next calendar VAT period.
    -- --------------------------------------------------------
    IF v_period_type = 'month' THEN
      v_period_start :=
        (v_period_start + INTERVAL '1 month')::date;

    ELSIF v_period_type = 'quarter' THEN
      v_period_start :=
        (v_period_start + INTERVAL '3 months')::date;

    ELSE
      v_period_start :=
        (v_period_start + INTERVAL '1 year')::date;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'created_count', v_created_count,
    'existing_count', v_existing_count,
    'period_type', v_period_type,
    'management_from', v_management_from,
    'through_date', v_effective_through
  );
END;
$$;


-- ============================================================
-- Permissions
-- ============================================================

REVOKE ALL
ON FUNCTION public.ensure_vat_periods(date)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.ensure_vat_periods(date)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.ensure_vat_periods(date)
TO authenticated;

GRANT EXECUTE
ON FUNCTION public.ensure_vat_periods(date)
TO service_role;


COMMENT ON FUNCTION public.ensure_vat_periods(date) IS
  'Ensures SoloLedger-managed VAT periods for the authenticated user from vat_management_from through the requested date. Creates only full calendar VAT periods, never modifies existing periods, blocks overlaps and periods whose period_end belongs to a locked bookkeeping year.';

COMMIT;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260917_add_vat_concurrency_helpers.sql
-- =====================================================================
-- 3B.5a-1
-- Shared VAT concurrency primitives.
--
-- IMPORTANT LOCK ORDER:
--   1. Acquire ALL required VAT month advisory locks, chronologically.
--   2. Acquire any other advisory locks (for example SIE/IB).
--   3. Acquire vat_periods row locks (FOR UPDATE), if needed.
--   4. Read protected bookkeeping state/data.
--   5. Write.
--
-- VAT concurrency scope is intentionally:
--   261x, 262x, 263x, exact 2641, 265x.
--
-- This is NOT the same thing as the VAT closing balance scope.
-- Closing balance scope remains:
--   261x, 262x, 263x, exact 2641.


CREATE OR REPLACE FUNCTION public.vat_concurrency_account(
  p_account_number text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT
       p_account_number LIKE '261%'
    OR p_account_number LIKE '262%'
    OR p_account_number LIKE '263%'
    OR p_account_number = '2641'
    OR p_account_number LIKE '265%';
$function$;


CREATE OR REPLACE FUNCTION public.vat_month_lock_key(
  p_user_id uuid,
  p_date date
)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT hashtextextended(
    'sololedger:vat:'
    || p_user_id::text
    || ':'
    || to_char(p_date, 'YYYY-MM'),
    0
  );
$function$;


CREATE OR REPLACE FUNCTION public.lock_vat_months(
  p_user_id uuid,
  p_dates date[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_month date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inte autentiserad.'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION
      'Otillåtet: p_user_id matchar inte inloggad användare.'
      USING ERRCODE = '42501';
  END IF;

  IF p_dates IS NULL
     OR cardinality(p_dates) = 0 THEN
    RETURN;
  END IF;

  /*
   * GLOBAL VAT LOCK ORDER:
   * Distinct calendar months are always acquired chronologically.
   *
   * Never acquire vat_periods FOR UPDATE or another advisory-lock
   * domain before these VAT month locks in a transaction that needs both.
   */
  FOR v_month IN
    SELECT DISTINCT date_trunc('month', d)::date
    FROM unnest(p_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(
      public.vat_month_lock_key(p_user_id, v_month)
    );
  END LOOP;
END;
$function$;


-- These helpers are internal database primitives.
-- Application clients must not call them directly.
REVOKE ALL ON FUNCTION public.vat_concurrency_account(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vat_month_lock_key(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lock_vat_months(uuid, date[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.vat_concurrency_account(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.vat_month_lock_key(uuid, date) FROM authenticated;
REVOKE ALL ON FUNCTION public.lock_vat_months(uuid, date[]) FROM authenticated;

REVOKE ALL ON FUNCTION public.vat_concurrency_account(text) FROM anon;
REVOKE ALL ON FUNCTION public.vat_month_lock_key(uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.lock_vat_months(uuid, date[]) FROM anon;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260917_add_vat_guard_to_book_transaction.sql
-- =====================================================================
-- 3B.5a-2
-- Add VAT month concurrency locking and SoloLedger VAT-period state guard
-- to book_transaction_atomic().
--
-- Source: exact live definition retrieved with pg_get_functiondef on 2026-09-17.
-- Scope of this migration: ONLY book_transaction_atomic().
--
-- Existing bookkeeping calculations and journal-entry writes are preserved.
-- VAT-relevant writes acquire the shared calendar-month advisory lock before
-- checking SoloLedger VAT-period state and before get_next_ver_nr()/INSERTs.

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
  v_vat_status text;
  v_file_url text;

  v_debit_account text;
  v_credit_account text;
  v_is_income boolean;

  v_vat_amount numeric;
  v_net_amount numeric;
  v_output_vat_account text;

  v_ver_nr integer;
  v_tx_id uuid;

  -- 3B.5a: VAT concurrency guard state
  v_needs_vat_lock boolean := false;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
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

  -- Momsstatus-skydd för nya bokningar.
  -- 'unknown' eller saknad profilrad ändrar inte befintligt beteende.
  SELECT p.vat_status
    INTO v_vat_status
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF coalesce(v_vat_status, 'unknown') = 'not_registered'
     AND v_vat_rate <> 0 THEN
    RAISE EXCEPTION
      'Företaget är markerat som inte momsregistrerat. Momssatsen måste vara 0 procent för nya vanliga bokningar.'
      USING ERRCODE = '23514';
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

  -- 3B.5a: VAT concurrency guard.
  -- Determine lock need from the journal accounts this booking will
  -- actually write, not merely from vat_rate.
  v_needs_vat_lock :=
       public.vat_concurrency_account(v_debit_account)
    OR public.vat_concurrency_account(v_credit_account)
    OR (
         v_vat_amount > 0
         AND public.vat_concurrency_account(
           CASE
             WHEN v_is_income THEN v_output_vat_account
             ELSE '2641'
           END
         )
       );

  IF v_needs_vat_lock THEN
    -- Global lock order:
    -- VAT month advisory locks must be acquired before vat_periods row
    -- locks and before bookkeeping data protected by this lock is written.
    PERFORM public.lock_vat_months(
      v_user_id,
      ARRAY[v_date]::date[]
    );

    -- State is checked only after the shared VAT month lock is held.
    -- More than one matching SoloLedger period is treated as invalid
    -- state rather than choosing an arbitrary period.
    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar bokföringsdatum %. Bokningen stoppades för manuell kontroll.',
        v_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för bokföringsdatum % är redan stängd eller deklarerad. Bokningen kan inte genomföras.',
        v_date
        USING ERRCODE = '23514';
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
$function$;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260917_add_vat_guard_to_periodized_transaction.sql
-- =====================================================================
-- 3B.5a-3
-- Add VAT month concurrency locking and SoloLedger VAT-period state guard
-- to book_periodized_transaction_atomic().
--
-- Source: exact live definition retrieved with pg_get_functiondef on 2026-09-17.
-- Scope of this migration: ONLY book_periodized_transaction_atomic().
--
-- Existing periodization calculations and journal-entry writes are preserved.
-- VAT-relevant writes at year-end acquire the shared calendar-month advisory
-- lock before checking SoloLedger VAT-period state and before either
-- get_next_ver_nr()/INSERT sequence begins.

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
  v_vat_status text;
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

  -- 3B.5a: VAT concurrency guard state
  v_needs_vat_lock boolean := false;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
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

  -- Momsstatus-skydd för nya bokningar.
  -- 'unknown' eller saknad profilrad ändrar inte befintligt beteende.
  SELECT p.vat_status
    INTO v_vat_status
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF coalesce(v_vat_status, 'unknown') = 'not_registered'
     AND v_vat_rate <> 0 THEN
    RAISE EXCEPTION
      'Företaget är markerat som inte momsregistrerat. Momssatsen måste vara 0 procent för periodiserade bokningar.'
      USING ERRCODE = '23514';
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

  -- 3B.5a: VAT concurrency guard.
  --
  -- The first half of a periodization writes on v_year_end:
  --   v_credit_account, 1790, and optionally 2641.
  -- The reversal writes on v_future_date:
  --   1790 and v_debit_account.
  --
  -- v_debit_account has already been restricted above to account classes
  -- 4-8, so the reversal cannot write any account in the VAT concurrency
  -- scope (261x/262x/263x/2641/265x).
  --
  -- Determine lock need from the accounts actually written at v_year_end,
  -- not merely from vat_rate.
  v_needs_vat_lock :=
       public.vat_concurrency_account(v_credit_account)
    OR (
         v_vat_amount > 0
         AND public.vat_concurrency_account('2641')
       );

  IF v_needs_vat_lock THEN
    -- Global lock order:
    -- VAT month advisory locks must be acquired before vat_periods row
    -- locks and before bookkeeping data protected by this lock is written.
    PERFORM public.lock_vat_months(
      v_user_id,
      ARRAY[v_year_end]::date[]
    );

    -- State is checked only after the shared VAT month lock is held.
    -- More than one matching SoloLedger period is treated as invalid
    -- state rather than choosing an arbitrary period.
    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_year_end BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar periodiseringens bokföringsdatum %. Bokningen stoppades för manuell kontroll.',
        v_year_end
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för periodiseringens bokföringsdatum % är redan stängd eller deklarerad. Bokningen kan inte genomföras.',
        v_year_end
        USING ERRCODE = '23514';
    END IF;
  END IF;

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
$function$;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260917_add_vat_guard_to_correction_transaction.sql
-- =====================================================================
-- 3B.5a
-- Add VAT month concurrency locking and SoloLedger VAT-period state guard
-- to create_correction_transaction_atomic().
--
-- Built from the exact live pg_get_functiondef retrieved on 2026-09-17,
-- then revised after adversarial concurrency review.
--
-- Lock order:
--   all VAT month advisory locks -> transaction row locks -> protected reads/writes.
--
-- Existing correction writes are retained. A read-only pre-scan discovers every
-- VAT-relevant correction month before any row lock is taken; authoritative data
-- is then revalidated after row locking. Closed/declared SoloLedger VAT periods
-- block only corrections that actually write VAT-concurrency accounts.

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

  -- 3B.5a: read-only pre-scan + VAT concurrency state
  v_pre_original public.transactions%ROWTYPE;
  v_pre_reversal public.transactions%ROWTYPE;
  v_pre_reversal_found boolean := false;
  v_pre_original_vat_relevant boolean := false;
  v_pre_reversal_vat_relevant boolean := false;
  v_original_vat_relevant boolean := false;
  v_reversal_vat_relevant boolean := false;
  v_guard_date date;
  v_locked_vat_dates date[] := ARRAY[]::date[];
  v_actual_vat_dates date[] := ARRAY[]::date[];
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_original_tx_id IS NULL THEN
    RAISE EXCEPTION 'Originaltransaktion saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ── READ-ONLY PRE-SCAN ───────────────────────────────────────
  -- We must know every VAT-relevant correction month before taking any
  -- transaction row lock. Global order:
  -- VAT advisory locks -> other advisory locks -> row locks -> writes.
  SELECT *
    INTO v_pre_original
  FROM public.transactions
  WHERE id = p_original_tx_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunde inte hämta originaltransaktionen.'
      USING ERRCODE = 'P0002';
  END IF;

  v_correction_date := greatest(current_date, v_pre_original.date);

  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_pre_original_vat_relevant;

  IF v_pre_original_vat_relevant THEN
    v_locked_vat_dates := array_append(v_locked_vat_dates, v_correction_date);
  END IF;

  IF v_pre_original.periodization_group_id IS NOT NULL
     AND coalesce(v_pre_original.is_periodized_reversal, false) = false THEN

    SELECT *
      INTO v_pre_reversal
    FROM public.transactions
    WHERE periodization_group_id = v_pre_original.periodization_group_id
      AND is_periodized_reversal = true
      AND user_id = v_user_id
    LIMIT 1;

    v_pre_reversal_found := FOUND;

    IF v_pre_reversal_found THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_pre_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_pre_reversal_vat_relevant;

      IF v_pre_reversal_vat_relevant THEN
        v_locked_vat_dates := array_append(v_locked_vat_dates, v_pre_reversal.date);
      END IF;
    END IF;
  END IF;

  -- Acquire all VAT month locks in one call. lock_vat_months() deduplicates
  -- calendar months and acquires them in chronological order.
  IF coalesce(array_length(v_locked_vat_dates, 1), 0) > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, v_locked_vat_dates);
  END IF;

  -- ── AUTHORITATIVE ROW LOCKS + REVALIDATION ───────────────────
  -- Only after VAT advisory locks are held may we take transaction row locks.
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

  -- Fields that determine correction date / linked reversal must still match
  -- the pre-scan. If not, fail closed rather than acquiring a new VAT lock
  -- after a row lock.
  IF v_original.date IS DISTINCT FROM v_pre_original.date
     OR v_original.periodization_group_id IS DISTINCT FROM v_pre_original.periodization_group_id
     OR coalesce(v_original.is_periodized_reversal, false)
        IS DISTINCT FROM coalesce(v_pre_original.is_periodized_reversal, false) THEN
    RAISE EXCEPTION
      'Originaltransaktionen ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  v_correction_date := greatest(current_date, v_original.date);

  -- Server-side year lock for the actual correction date.
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

  -- Original journal must still be complete and unambiguous.
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

  -- Friendly post-lock duplicate guard. The unique partial index
  -- transactions_one_correction_per_original remains the final DB invariant.
  -- This check runs only after the original transaction row is locked, so two
  -- concurrent corrections of the same original serialize before this read.
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.user_id = v_user_id
      AND coalesce(t.is_correction, false) = true
      AND t.corrects_ver_nr = v_original_ver_nr
  ) THEN
    RAISE EXCEPTION
      'VER-% har redan korrigerats och kan inte korrigeras igen.',
      v_original_ver_nr
      USING ERRCODE = '23514';
  END IF;

  -- Recompute VAT relevance after the authoritative row lock.
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_original_vat_relevant;

  IF v_original_vat_relevant THEN
    v_actual_vat_dates := array_append(v_actual_vat_dates, v_correction_date);
  END IF;

  -- If original is the first half of a periodization, lock and correct the
  -- linked reversal in the same DB transaction, preserving existing behavior.
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

    IF v_reversal_found IS DISTINCT FROM v_pre_reversal_found
       OR (
         v_reversal_found
         AND (
           v_reversal.id IS DISTINCT FROM v_pre_reversal.id
           OR v_reversal.date IS DISTINCT FROM v_pre_reversal.date
         )
       ) THEN
      RAISE EXCEPTION
        'Periodiseringens vändningsverifikation ändrades under korrigeringen. Försök igen.'
        USING ERRCODE = '40001';
    END IF;

    IF v_reversal_found THEN
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

      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_reversal_vat_relevant;

      IF v_reversal_vat_relevant THEN
        v_actual_vat_dates := array_append(v_actual_vat_dates, v_reversal.date);
      END IF;
    END IF;
  END IF;

  -- The authoritative scan must not require any VAT month that was absent
  -- from the pre-scan. If it does, fail closed instead of violating lock order.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_actual_vat_dates) AS x(d)
      WHERE d IS NOT NULL
      EXCEPT
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_locked_vat_dates) AS x(d)
      WHERE d IS NOT NULL
    ) missing
  ) THEN
    RAISE EXCEPTION
      'Momsrelevant bokföringsdata ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ── VAT PERIOD STATE GUARD ───────────────────────────────────
  -- Only dates whose correction will actually write a VAT concurrency
  -- account are checked. imported_history does not block this guard.
  FOR v_guard_date IN
    SELECT DISTINCT d
    FROM unnest(v_actual_vat_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY d
  LOOP
    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_guard_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar korrigeringsdatum %. Korrigeringen stoppades för manuell kontroll.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för korrigeringsdatum % är redan stängd eller deklarerad. Korrigeringen kan inte genomföras.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

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
$function$;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260917_add_vat_guard_to_undo_sie_import.sql
-- =====================================================================
-- KAN-5 migration candidate — reviewed and rollback-tested; do not run permanently without explicit approval.
-- 3B.5a: VAT concurrency/state guard for undo_sie_import_atomic().
-- Built from the exact live pg_get_functiondef retrieved on 2026-09-17.
--
-- Intended global lock order:
--   all VAT month advisory locks -> other advisory locks -> row locks -> protected reads/writes.
--
-- This draft moves the existing import_batches/transactions row locks behind a
-- read-only pre-scan that discovers every VAT-relevant undo month. It then
-- revalidates authoritative batch/transaction state after row locking.
--
-- Hold for adversarial review before live execution.

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

  -- 3B.5a: read-only pre-scan + VAT concurrency state
  v_pre_batch public.import_batches%ROWTYPE;
  v_pre_linked_tx_count integer := 0;
  v_pre_transaction_fingerprint jsonb := '[]'::jsonb;
  v_actual_transaction_fingerprint jsonb := '[]'::jsonb;
  v_locked_vat_dates date[] := ARRAY[]::date[];
  v_actual_vat_dates date[] := ARRAY[]::date[];
  v_guard_date date;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_import_batch_id IS NULL THEN
    RAISE EXCEPTION 'Import-ID saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ── READ-ONLY PRE-SCAN ───────────────────────────────────────
  -- Discover every VAT-relevant undo month before taking any row lock.
  -- Global order:
  -- VAT advisory locks -> other advisory locks -> row locks -> protected writes.
  SELECT *
    INTO v_pre_batch
  FROM public.import_batches
  WHERE id = p_import_batch_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SIE-importen hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)
    INTO v_pre_linked_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance');

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', t.id,
               'date', t.date,
               'source', t.source,
               'import_batch_id', t.import_batch_id
             )
             ORDER BY t.id
           ),
           '[]'::jsonb
         )
    INTO v_pre_transaction_fingerprint
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance');

  SELECT coalesce(array_agg(DISTINCT greatest(current_date, t.date)), ARRAY[]::date[])
    INTO v_locked_vat_dates
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries e
      WHERE e.transaction_id = t.id
        AND e.user_id = v_user_id
        AND public.vat_concurrency_account(e.account_number)
    );

  IF coalesce(array_length(v_locked_vat_dates, 1), 0) > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, v_locked_vat_dates);
  END IF;

  -- ── AUTHORITATIVE ROW LOCKS ──────────────────────────────────
  -- Batch row lock comes only after every required VAT month lock.
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

  -- Fail closed if batch identity/state used during pre-scan changed.
  IF v_batch.status IS DISTINCT FROM v_pre_batch.status
     OR v_batch.imported_count IS DISTINCT FROM v_pre_batch.imported_count
     OR v_batch.file_hash IS DISTINCT FROM v_pre_batch.file_hash THEN
    RAISE EXCEPTION
      'SIE-importens status eller innehåll ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  IF v_batch.status = 'undone' THEN
    RAISE EXCEPTION 'SIE-importen är redan ångrad.'
      USING ERRCODE = '23514';
  END IF;

  IF v_batch.status <> 'completed' THEN
    RAISE EXCEPTION 'Endast en slutförd SIE-import kan ångras (status: %).', v_batch.status
      USING ERRCODE = '23514';
  END IF;

  -- A previous/partial undo must never be hidden behind batch status.
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

  -- Lock every imported original deterministically, after the batch row lock.
  PERFORM 1
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance')
  ORDER BY id
  FOR UPDATE;

  -- Revalidate the authoritative transaction set after row locking.
  SELECT count(*)
    INTO v_linked_tx_count
  FROM public.transactions
  WHERE user_id = v_user_id
    AND import_batch_id = p_import_batch_id
    AND source IN ('sie_import', 'sie_opening_balance');

  IF v_linked_tx_count IS DISTINCT FROM v_pre_linked_tx_count THEN
    RAISE EXCEPTION
      'SIE-importens transaktioner ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', t.id,
               'date', t.date,
               'source', t.source,
               'import_batch_id', t.import_batch_id
             )
             ORDER BY t.id
           ),
           '[]'::jsonb
         )
    INTO v_actual_transaction_fingerprint
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance');

  IF v_actual_transaction_fingerprint IS DISTINCT FROM v_pre_transaction_fingerprint THEN
    RAISE EXCEPTION
      'SIE-importens transaktionsuppsättning ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- Stabilize original journal rows after transaction row locks and before protected VAT reads/writes.
  PERFORM 1
  FROM public.journal_entries e
  JOIN public.transactions t ON t.id = e.transaction_id
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND e.user_id = v_user_id
  ORDER BY e.transaction_id, e.id
  FOR UPDATE OF e;

  -- Recompute every VAT-relevant undo date from authoritative data.
  SELECT coalesce(array_agg(DISTINCT greatest(current_date, t.date)), ARRAY[]::date[])
    INTO v_actual_vat_dates
  FROM public.transactions t
  WHERE t.user_id = v_user_id
    AND t.import_batch_id = p_import_batch_id
    AND t.source IN ('sie_import', 'sie_opening_balance')
    AND EXISTS (
      SELECT 1
      FROM public.journal_entries e
      WHERE e.transaction_id = t.id
        AND e.user_id = v_user_id
        AND public.vat_concurrency_account(e.account_number)
    );

  -- Never acquire a new VAT lock after row locks. If authoritative data would
  -- require a month absent from pre-scan, fail closed and let the caller retry.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_actual_vat_dates) AS x(d)
      WHERE d IS NOT NULL
      EXCEPT
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_locked_vat_dates) AS x(d)
      WHERE d IS NOT NULL
    ) missing
  ) THEN
    RAISE EXCEPTION
      'Momsrelevant importdata ändrades under ångringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ── VAT PERIOD STATE GUARD ───────────────────────────────────
  FOR v_guard_date IN
    SELECT DISTINCT d
    FROM unnest(v_actual_vat_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY d
  LOOP
    SELECT
      count(*)::integer,
      count(*) FILTER (WHERE vp.status IN ('closed', 'declared'))::integer
    INTO v_matching_vat_periods, v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_guard_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar ångringens bokföringsdatum %. Ångringen stoppades för manuell kontroll.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för ångringens bokföringsdatum % är redan stängd eller deklarerad. SIE-importen kan inte ångras.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- ── EXISTING FULL-BATCH VALIDATION ───────────────────────────
  -- Keep the existing all-or-nothing checks before the first correction write.
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

  IF v_linked_tx_count = 0 THEN
    RAISE EXCEPTION 'Importen saknar bokförda transaktioner och kan inte ångras automatiskt.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Validate the entire authoritative batch before the first correction write.
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
$function$;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260918_add_vat_guard_to_import_sie_batch.sql
-- =====================================================================
-- REVIEW DRAFT ONLY - DO NOT RUN AGAINST LIVE SUPABASE WITHOUT EXPLICIT APPROVAL.
--
-- KAN-6 / 3B.5 Import SIE VAT guard.
--
-- Source: exact live definition of public.import_sie_batch(p_payload jsonb)
-- retrieved with pg_get_functiondef() on 2026-09-18.
--
-- Goal:
--   Add a read-only VAT payload pre-scan before any database writes, acquire
--   all VAT month advisory locks, then acquire the existing opening-balance
--   advisory lock when #IB is present, then check SoloLedger-managed VAT period
--   state before the existing import writes begin.
--
-- Important:
--   This is a review draft. It intentionally makes no live change until reviewed.

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

  -- KAN-6 review draft: synchronization/pre-scan state.
  v_vat_guard_dates date[] := ARRAY[]::date[];
  v_vat_guard_date date;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
begin
  if v_user_id is null then
    raise exception 'Ingen inloggad användare.' using errcode = '28000';
  end if;

  if p_payload->'verifications' is null or jsonb_array_length(p_payload->'verifications') = 0 then
    raise exception 'Payload innehåller inga verifikationer.' using errcode = '22023';
  end if;

  v_verification_count := jsonb_array_length(p_payload->'verifications');

  -- KAN-6: read-only VAT pre-scan before any DB writes.
  --
  -- The scan mirrors the journal_entries.date write paths:
  --   * opening balance rows: v_ib_date = fiscal_year-01-01
  --   * normal rows: coalesce((v_row->>'date')::date, v_ver_date)
  --
  -- This intentionally is not a full duplicate of the import validator below.
  -- It only validates/casts dates that must be known before lock acquisition.
  if p_payload->'opening_balances' is not null and jsonb_array_length(p_payload->'opening_balances') > 0 then
    if nullif(p_payload->>'fiscal_year', '') is null
       or nullif(p_payload->>'fiscal_year', '') !~ '^\d{4}$' then
      raise exception 'Ogiltigt eller saknat räkenskapsår för ingående balans (#IB).'
        using errcode = '22023';
    end if;

    v_ib_date := (nullif(p_payload->>'fiscal_year', '') || '-01-01')::date;

    select coalesce(array_agg(v_ib_date), ARRAY[]::date[])
      into v_vat_guard_dates
      from jsonb_array_elements(p_payload->'opening_balances') as row_data
      where public.vat_concurrency_account(row_data->>'account_number') is true;
  end if;

  for v_ver in select * from jsonb_array_elements(p_payload->'verifications')
  loop
    if v_ver->>'date' is null or v_ver->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Verifikation % %: ogiltigt eller saknat datum (fick: %).',
        v_ver->>'series', v_ver->>'ver_number', coalesce(v_ver->>'date', 'null')
        using errcode = '22023';
    end if;

    v_ver_date := (v_ver->>'date')::date;

    if v_ver->'rows' is not null and jsonb_typeof(v_ver->'rows') = 'array' then
      for v_row in select * from jsonb_array_elements(v_ver->'rows')
      loop
        if public.vat_concurrency_account(v_row->>'account_number') is true then
          if v_row->>'date' is null then
            v_vat_guard_dates := array_append(v_vat_guard_dates, v_ver_date);
          elsif v_row->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then
            raise exception 'Verifikation % %, konto %: ogiltigt raddatum (fick: %).',
              v_ver->>'series', v_ver->>'ver_number',
              v_row->>'account_number', v_row->>'date'
              using errcode = '22023';
          else
            v_vat_guard_dates := array_append(v_vat_guard_dates, (v_row->>'date')::date);
          end if;
        end if;
      end loop;
    end if;
  end loop;

  -- Global lock order:
  -- 1. All VAT month advisory locks, chronologically inside lock_vat_months().
  -- 2. Existing opening-balance advisory lock when #IB exists.
  -- 3. Protected reads/writes and get_next_ver_nr().
  perform public.lock_vat_months(v_user_id, v_vat_guard_dates);

  if p_payload->'opening_balances' is not null and jsonb_array_length(p_payload->'opening_balances') > 0 then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || v_ib_date::text, 0)
    );
  end if;

  -- KAN-6: VAT period state guard after locks and before first DB write.
  -- Authoritative state comes only from SoloLedger-managed vat_periods.
  for v_vat_guard_date in
    select distinct d
    from unnest(v_vat_guard_dates) as x(d)
    where d is not null
    order by d
  loop
    select
      count(*)::integer,
      count(*) filter (
        where vp.status in ('closed', 'declared')
      )::integer
    into
      v_matching_vat_periods,
      v_blocking_vat_periods
    from public.vat_periods vp
    where vp.user_id = v_user_id
      and vp.source = 'sololedger'
      and v_vat_guard_date between vp.period_start and vp.period_end;

    if v_matching_vat_periods > 1 then
      raise exception
        'Flera överlappande SoloLedger-momsperioder matchar importdatum %. Importen stoppades för manuell kontroll.',
        v_vat_guard_date
        using errcode = '23514';
    end if;

    if v_blocking_vat_periods > 0 then
      raise exception
        'Momsperioden för importdatum % är redan stängd eller deklarerad. Importen kan inte genomföras.',
        v_vat_guard_date
        using errcode = '23514';
    end if;
  end loop;

  -- ── Dubblettkontroll ──────────────────────────────────────
  if exists (
    select 1 from import_batches
    where user_id = v_user_id and file_hash = p_payload->>'file_hash'
  ) then
    raise exception 'Den här filen har redan importerats tidigare (hash: %).',
      left(p_payload->>'file_hash', 12)
      using errcode = '23505';
  end if;

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
$function$;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260918_add_close_vat_period_atomic.sql
-- =====================================================================
-- REVIEW DRAFT ONLY - DO NOT RUN AGAINST LIVE SUPABASE WITHOUT EXPLICIT APPROVAL.
--
-- KAN-7 / 3B.5 close_vat_period_atomic foundation.
--
-- Source of truth verified against live Supabase on 2026-09-18:
--   * journal_entries.debit/credit are numeric(15,2)
--   * transactions.amount is numeric(15,2)
--   * vat_periods.closing_amount is numeric
--   * transactions.source already allows 'vat_closing'
--   * vat_periods.closing_transaction_id references transactions(id)
--     ON DELETE RESTRICT
--
-- Scope:
--   Create the atomic VAT period close RPC only. No table, constraint, index,
--   trigger, report, NE, result-engine, or application-code changes.

CREATE OR REPLACE FUNCTION public.close_vat_period_atomic(p_vat_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();

  -- Read-only lock-domain discovery before any advisory lock.
  v_pre_user_id uuid;
  v_pre_period_start date;
  v_pre_period_end date;
  v_lock_dates date[] := ARRAY[]::date[];

  -- Authoritative row state after VAT advisory locks.
  v_period public.vat_periods%ROWTYPE;

  -- Protected activity/balance state.
  v_has_265_activity boolean := false;
  v_closing_scope_row_count integer := 0;
  v_nonzero_balance_count integer := 0;
  v_closing_amount numeric := 0;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;

  -- Closing write state.
  v_ver_nr integer;
  v_tx_id uuid;
  v_inserted_vat_rows integer := 0;
  v_inserted_total_rows integer := 0;
  v_written_debit numeric := 0;
  v_written_credit numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_vat_period_id IS NULL THEN
    RAISE EXCEPTION 'Momsperiod saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ------------------------------------------------------------
  -- Read-only lock-domain discovery.
  --
  -- We must know the calendar months to lock before taking any
  -- vat_periods row lock. The row is revalidated after locks.
  -- ------------------------------------------------------------
  SELECT
    vp.user_id,
    vp.period_start,
    vp.period_end
  INTO
    v_pre_user_id,
    v_pre_period_start,
    v_pre_period_end
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden hittades inte eller tillhör inte dig.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(month_start::date ORDER BY month_start), ARRAY[]::date[])
    INTO v_lock_dates
  FROM generate_series(
    date_trunc('month', v_pre_period_start)::date,
    date_trunc('month', v_pre_period_end)::date,
    interval '1 month'
  ) AS month_start;

  -- Global lock order:
  -- 1. All VAT month advisory locks, chronologically inside lock_vat_months().
  -- 2. Any other advisory locks.
  -- 3. Row locks.
  -- 4. Protected reads/writes and get_next_ver_nr().
  PERFORM public.lock_vat_months(v_user_id, v_lock_dates);

  -- ------------------------------------------------------------
  -- Authoritative row lock + lock-domain revalidation.
  -- ------------------------------------------------------------
  SELECT *
    INTO v_period
  FROM public.vat_periods vp
  WHERE vp.id = p_vat_period_id
    AND vp.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Momsperioden ändrades under stängningen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  IF v_period.user_id IS DISTINCT FROM v_pre_user_id
     OR v_period.period_start IS DISTINCT FROM v_pre_period_start
     OR v_period.period_end IS DISTINCT FROM v_pre_period_end THEN
    RAISE EXCEPTION 'Momsperiodens datum ändrades under stängningen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ------------------------------------------------------------
  -- State and scope guards.
  -- ------------------------------------------------------------
  IF v_period.source = 'imported_history' THEN
    RAISE EXCEPTION 'Importerad historik kan inte stängas som en normal SoloLedger-momsperiod.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.source <> 'sololedger' THEN
    RAISE EXCEPTION 'Endast SoloLedger-hanterade momsperioder kan stängas.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'declared' THEN
    RAISE EXCEPTION 'Momsperioden är redan deklarerad och kan inte stängas igen.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'closed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_closed', true,
      'vat_period_id', v_period.id,
      'status', v_period.status,
      'closing_amount', v_period.closing_amount,
      'closing_transaction_id', v_period.closing_transaction_id
    );
  END IF;

  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'Momsperioden har en okänd status: %.', v_period.status
      USING ERRCODE = '23514';
  END IF;

  IF v_period.period_end > current_date THEN
    RAISE EXCEPTION 'Framtida momsperioder kan inte stängas.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.closed_years cy
    WHERE cy.user_id = v_user_id
      AND cy.year = extract(year from v_period.period_end)::integer
  ) THEN
    RAISE EXCEPTION 'Momsperioden kan inte stängas eftersom räkenskapsår % är låst.',
      extract(year from v_period.period_end)::integer
      USING ERRCODE = '23514';
  END IF;

  -- ------------------------------------------------------------
  -- Protected activity/balance reads.
  --
  -- Period membership is based on journal_entries.date.
  -- 265x blocks normal auto-close/manual review, but never enters
  -- closing_amount.
  -- ------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND je.account_number LIKE '265%'
  )
  INTO v_has_265_activity;

  IF v_has_265_activity THEN
    RAISE EXCEPTION 'Momsperioden innehåller aktivitet på 265x och behöver manuell kontroll före stängning.'
      USING ERRCODE = '23514';
  END IF;

  WITH per_account AS (
    SELECT
      je.account_number,
      sum(coalesce(je.debit, 0) - coalesce(je.credit, 0))::numeric AS balance,
      count(*)::integer AS row_count
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND (
        je.account_number LIKE '261%'
        OR je.account_number LIKE '262%'
        OR je.account_number LIKE '263%'
        OR je.account_number = '2641'
      )
    GROUP BY je.account_number
  )
  SELECT
    coalesce(sum(row_count), 0)::integer,
    coalesce(count(*) FILTER (WHERE balance <> 0), 0)::integer,
    coalesce(-sum(balance), 0)::numeric,
    coalesce(sum(CASE WHEN balance < 0 THEN -balance ELSE 0 END), 0)::numeric
      + greatest(-coalesce(-sum(balance), 0)::numeric, 0),
    coalesce(sum(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)::numeric
      + greatest(coalesce(-sum(balance), 0)::numeric, 0)
  INTO
    v_closing_scope_row_count,
    v_nonzero_balance_count,
    v_closing_amount,
    v_total_debit,
    v_total_credit
  FROM per_account;

  -- No closing-scope activity: close the state only. No transaction and no
  -- ver_nr consumption.
  IF v_closing_scope_row_count = 0 THEN
    UPDATE public.vat_periods
    SET status = 'closed',
        closing_amount = 0,
        closing_transaction_id = NULL,
        updated_at = now()
    WHERE id = v_period.id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_closed', false,
      'vat_period_id', v_period.id,
      'status', 'closed',
      'closing_amount', 0,
      'closing_transaction_id', NULL,
      'transaction_created', false
    );
  END IF;

  -- Activity exists, but all relevant account balances are already zero.
  -- This is not a normal closing candidate: creating fabricated 0/0 rows
  -- would hide the real history instead of documenting a closing.
  IF v_nonzero_balance_count = 0 THEN
    RAISE EXCEPTION 'Momsperioden har momsaktivitet men alla relevanta momskonton är redan noll. Kontrollera perioden manuellt.'
      USING ERRCODE = '23514';
  END IF;

  -- Internal accounting assertion before any ver_nr/write.
  IF v_total_debit IS DISTINCT FROM v_total_credit THEN
    RAISE EXCEPTION 'Momsavslutet balanserar inte (debet %, kredit %).',
      v_total_debit, v_total_credit
      USING ERRCODE = '23514';
  END IF;

  -- ------------------------------------------------------------
  -- Real VAT closing transaction.
  --
  -- transactions.amount follows the existing verification-summary
  -- pattern used by SIE import: total debit in the verification.
  -- ------------------------------------------------------------
  SELECT public.get_next_ver_nr(v_user_id)
    INTO v_ver_nr;

  IF v_ver_nr IS NULL THEN
    RAISE EXCEPTION 'Kunde inte generera verifikationsnummer för momsavslutet.';
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
    v_period.period_end,
    'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
    v_total_debit,
    NULL,
    NULL,
    true,
    'vat_closing'
  )
  RETURNING id INTO v_tx_id;

  WITH per_account AS (
    SELECT
      je.account_number,
      sum(coalesce(je.debit, 0) - coalesce(je.credit, 0))::numeric AS balance
    FROM public.journal_entries je
    WHERE je.user_id = v_user_id
      AND je.date BETWEEN v_period.period_start AND v_period.period_end
      AND (
        je.account_number LIKE '261%'
        OR je.account_number LIKE '262%'
        OR je.account_number LIKE '263%'
        OR je.account_number = '2641'
      )
    GROUP BY je.account_number
  )
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
    v_tx_id,
    v_ver_nr,
    account_number,
    CASE WHEN balance < 0 THEN -balance ELSE 0 END,
    CASE WHEN balance > 0 THEN balance ELSE 0 END,
    'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
    v_period.period_end,
    v_user_id
  FROM per_account
  WHERE balance <> 0
  ORDER BY account_number;

  GET DIAGNOSTICS v_inserted_vat_rows = ROW_COUNT;

  IF v_inserted_vat_rows <> v_nonzero_balance_count THEN
    RAISE EXCEPTION 'Momsavslutet kunde inte skapa förväntade momsrader.'
      USING ERRCODE = '23514';
  END IF;

  IF v_closing_amount > 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    ) VALUES (
      v_tx_id,
      v_ver_nr,
      '2650',
      0,
      v_closing_amount,
      'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
      v_period.period_end,
      v_user_id
    );
  ELSIF v_closing_amount < 0 THEN
    INSERT INTO public.journal_entries (
      transaction_id,
      ver_nr,
      account_number,
      debit,
      credit,
      description,
      date,
      user_id
    ) VALUES (
      v_tx_id,
      v_ver_nr,
      '2650',
      -v_closing_amount,
      0,
      'Momsavslut ' || v_period.period_start::text || ' - ' || v_period.period_end::text,
      v_period.period_end,
      v_user_id
    );
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(coalesce(je.debit, 0)), 0)::numeric,
    coalesce(sum(coalesce(je.credit, 0)), 0)::numeric
  INTO
    v_inserted_total_rows,
    v_written_debit,
    v_written_credit
  FROM public.journal_entries je
  WHERE je.transaction_id = v_tx_id
    AND je.user_id = v_user_id;

  IF v_inserted_total_rows = 0 THEN
    RAISE EXCEPTION 'Momsavslutet skapade inga journalrader.'
      USING ERRCODE = '23514';
  END IF;

  IF v_written_debit IS DISTINCT FROM v_written_credit THEN
    RAISE EXCEPTION 'Momsavslutets journalrader balanserar inte (debet %, kredit %).',
      v_written_debit, v_written_credit
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.vat_periods
  SET status = 'closed',
      closing_amount = v_closing_amount,
      closing_transaction_id = v_tx_id,
      updated_at = now()
  WHERE id = v_period.id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'already_closed', false,
    'vat_period_id', v_period.id,
    'status', 'closed',
    'closing_amount', v_closing_amount,
    'closing_transaction_id', v_tx_id,
    'transaction_created', true,
    'ver_nr', v_ver_nr
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.close_vat_period_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_vat_period_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_vat_period_atomic(uuid) TO service_role;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260919_guard_vat_closing_system_transactions.sql
-- =====================================================================
-- REVIEW DRAFT ONLY - DO NOT RUN AGAINST LIVE SUPABASE WITHOUT EXPLICIT APPROVAL.
--
-- KAN-7B / 7B.1 DB integrity guard for VAT closing system transactions.
--
-- Source of truth verified against live Supabase on 2026-09-19 with
-- pg_get_functiondef() and live grants for:
--   * public.create_correction_transaction_atomic(uuid)
--   * public.update_transaction_safe(uuid, jsonb)
--
-- Scope:
--   Only block direct correction/update attempts against transactions whose
--   source is 'vat_closing'. No app code, table shape, RLS policy, trigger,
--   SIE import/undo, delete-user, VAT report, NE, result, or export changes.

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

  -- 3B.5a: read-only pre-scan + VAT concurrency state
  v_pre_original public.transactions%ROWTYPE;
  v_pre_reversal public.transactions%ROWTYPE;
  v_pre_reversal_found boolean := false;
  v_pre_original_vat_relevant boolean := false;
  v_pre_reversal_vat_relevant boolean := false;
  v_original_vat_relevant boolean := false;
  v_reversal_vat_relevant boolean := false;
  v_guard_date date;
  v_locked_vat_dates date[] := ARRAY[]::date[];
  v_actual_vat_dates date[] := ARRAY[]::date[];
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_original_tx_id IS NULL THEN
    RAISE EXCEPTION 'Originaltransaktion saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- ── READ-ONLY PRE-SCAN ───────────────────────────────────────
  -- We must know every VAT-relevant correction month before taking any
  -- transaction row lock. Global order:
  -- VAT advisory locks -> other advisory locks -> row locks -> writes.
  SELECT *
    INTO v_pre_original
  FROM public.transactions
  WHERE id = p_original_tx_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kunde inte hämta originaltransaktionen.'
      USING ERRCODE = 'P0002';
  END IF;

  -- Fast fail before VAT advisory locks. The post-lock guard below remains
  -- authoritative for concurrency, but this keeps impossible system
  -- verification corrections out of the lock path.
  IF v_pre_original.source = 'vat_closing' THEN
    RAISE EXCEPTION 'Momsavslut är systemverifikationer och kan inte korrigeras.'
      USING ERRCODE = '23514';
  END IF;

  v_correction_date := greatest(current_date, v_pre_original.date);

  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_pre_original_vat_relevant;

  IF v_pre_original_vat_relevant THEN
    v_locked_vat_dates := array_append(v_locked_vat_dates, v_correction_date);
  END IF;

  IF v_pre_original.periodization_group_id IS NOT NULL
     AND coalesce(v_pre_original.is_periodized_reversal, false) = false THEN

    SELECT *
      INTO v_pre_reversal
    FROM public.transactions
    WHERE periodization_group_id = v_pre_original.periodization_group_id
      AND is_periodized_reversal = true
      AND user_id = v_user_id
    LIMIT 1;

    v_pre_reversal_found := FOUND;

    IF v_pre_reversal_found THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_pre_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_pre_reversal_vat_relevant;

      IF v_pre_reversal_vat_relevant THEN
        v_locked_vat_dates := array_append(v_locked_vat_dates, v_pre_reversal.date);
      END IF;
    END IF;
  END IF;

  -- Acquire all VAT month locks in one call. lock_vat_months() deduplicates
  -- calendar months and acquires them in chronological order.
  IF coalesce(array_length(v_locked_vat_dates, 1), 0) > 0 THEN
    PERFORM public.lock_vat_months(v_user_id, v_locked_vat_dates);
  END IF;

  -- ── AUTHORITATIVE ROW LOCKS + REVALIDATION ───────────────────
  -- Only after VAT advisory locks are held may we take transaction row locks.
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

  -- Authoritative guard after the row lock. This is the real integrity check
  -- if source was changed by a privileged concurrent path after the pre-scan.
  IF v_original.source = 'vat_closing' THEN
    RAISE EXCEPTION 'Momsavslut är systemverifikationer och kan inte korrigeras.'
      USING ERRCODE = '23514';
  END IF;

  -- Fields that determine correction date / linked reversal must still match
  -- the pre-scan. If not, fail closed rather than acquiring a new VAT lock
  -- after a row lock.
  IF v_original.date IS DISTINCT FROM v_pre_original.date
     OR v_original.periodization_group_id IS DISTINCT FROM v_pre_original.periodization_group_id
     OR coalesce(v_original.is_periodized_reversal, false)
        IS DISTINCT FROM coalesce(v_pre_original.is_periodized_reversal, false) THEN
    RAISE EXCEPTION
      'Originaltransaktionen ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  v_correction_date := greatest(current_date, v_original.date);

  -- Server-side year lock for the actual correction date.
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

  -- Original journal must still be complete and unambiguous.
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

  -- Friendly post-lock duplicate guard. The unique partial index
  -- transactions_one_correction_per_original remains the final DB invariant.
  -- This check runs only after the original transaction row is locked, so two
  -- concurrent corrections of the same original serialize before this read.
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.user_id = v_user_id
      AND coalesce(t.is_correction, false) = true
      AND t.corrects_ver_nr = v_original_ver_nr
  ) THEN
    RAISE EXCEPTION
      'VER-% har redan korrigerats och kan inte korrigeras igen.',
      v_original_ver_nr
      USING ERRCODE = '23514';
  END IF;

  -- Recompute VAT relevance after the authoritative row lock.
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries e
    WHERE e.transaction_id = p_original_tx_id
      AND e.user_id = v_user_id
      AND public.vat_concurrency_account(e.account_number)
  )
  INTO v_original_vat_relevant;

  IF v_original_vat_relevant THEN
    v_actual_vat_dates := array_append(v_actual_vat_dates, v_correction_date);
  END IF;

  -- If original is the first half of a periodization, lock and correct the
  -- linked reversal in the same DB transaction, preserving existing behavior.
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

    IF v_reversal_found IS DISTINCT FROM v_pre_reversal_found
       OR (
         v_reversal_found
         AND (
           v_reversal.id IS DISTINCT FROM v_pre_reversal.id
           OR v_reversal.date IS DISTINCT FROM v_pre_reversal.date
         )
       ) THEN
      RAISE EXCEPTION
        'Periodiseringens vändningsverifikation ändrades under korrigeringen. Försök igen.'
        USING ERRCODE = '40001';
    END IF;

    IF v_reversal_found THEN
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

      SELECT EXISTS (
        SELECT 1
        FROM public.journal_entries e
        WHERE e.transaction_id = v_reversal.id
          AND e.user_id = v_user_id
          AND public.vat_concurrency_account(e.account_number)
      )
      INTO v_reversal_vat_relevant;

      IF v_reversal_vat_relevant THEN
        v_actual_vat_dates := array_append(v_actual_vat_dates, v_reversal.date);
      END IF;
    END IF;
  END IF;

  -- The authoritative scan must not require any VAT month that was absent
  -- from the pre-scan. If it does, fail closed instead of violating lock order.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_actual_vat_dates) AS x(d)
      WHERE d IS NOT NULL
      EXCEPT
      SELECT DISTINCT date_trunc('month', d)::date AS month_start
      FROM unnest(v_locked_vat_dates) AS x(d)
      WHERE d IS NOT NULL
    ) missing
  ) THEN
    RAISE EXCEPTION
      'Momsrelevant bokföringsdata ändrades under korrigeringen. Försök igen.'
      USING ERRCODE = '40001';
  END IF;

  -- ── VAT PERIOD STATE GUARD ───────────────────────────────────
  -- Only dates whose correction will actually write a VAT concurrency
  -- account are checked. imported_history does not block this guard.
  FOR v_guard_date IN
    SELECT DISTINCT d
    FROM unnest(v_actual_vat_dates) AS x(d)
    WHERE d IS NOT NULL
    ORDER BY d
  LOOP
    SELECT
      count(*)::integer,
      count(*) FILTER (
        WHERE vp.status IN ('closed', 'declared')
      )::integer
    INTO
      v_matching_vat_periods,
      v_blocking_vat_periods
    FROM public.vat_periods vp
    WHERE vp.user_id = v_user_id
      AND vp.source = 'sololedger'
      AND v_guard_date BETWEEN vp.period_start AND vp.period_end;

    IF v_matching_vat_periods > 1 THEN
      RAISE EXCEPTION
        'Flera överlappande SoloLedger-momsperioder matchar korrigeringsdatum %. Korrigeringen stoppades för manuell kontroll.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;

    IF v_blocking_vat_periods > 0 THEN
      RAISE EXCEPTION
        'Momsperioden för korrigeringsdatum % är redan stängd eller deklarerad. Korrigeringen kan inte genomföras.',
        v_guard_date
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

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
$function$;

REVOKE ALL ON FUNCTION public.create_correction_transaction_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_correction_transaction_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_correction_transaction_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_correction_transaction_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_correction_transaction_atomic(uuid) TO service_role;

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

  -- VAT closing transactions are system verifications. Block every update,
  -- including otherwise allowed attachment/file_url metadata updates.
  IF v_tx.source = 'vat_closing' THEN
    RAISE EXCEPTION 'Momsavslut är systemverifikationer och kan inte ändras.'
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
$function$;

REVOKE ALL ON FUNCTION public.update_transaction_safe(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_transaction_safe(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_transaction_safe(uuid, jsonb) TO service_role;

-- =====================================================================
-- Source: supabase/migration_archive/pre_20260925000000_legacy_date_only/20260920_add_declare_vat_period_atomic.sql
-- =====================================================================
-- REVIEW DRAFT ONLY - DO NOT RUN AGAINST LIVE SUPABASE WITHOUT EXPLICIT APPROVAL.
--
-- KAN-8 / 3B.6 declared VAT period.
--
-- Source of truth verified against live Supabase during KAN-8 reconnaissance
-- on 2026-09-20:
--   * vat_periods.status allows 'open', 'closed', and 'declared'
--   * vat_periods.source allows 'sololedger' and 'imported_history'
--   * status consistency requires declared rows to have closing_amount IS NOT NULL
--     and declared_at IS NOT NULL
--   * closing_transaction_id may be NULL for closed/declared no-activity periods
--   * authenticated has SELECT only on vat_periods; controlled mutation must be RPC
--
-- Scope:
--   Create the atomic VAT declaration RPC only. No table, constraint, index,
--   trigger, accounting, payment, report, 1630/1930, or application-code changes.

CREATE OR REPLACE FUNCTION public.declare_vat_period_atomic(p_vat_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_period public.vat_periods%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Ingen inloggad användare.'
      USING ERRCODE = '28000';
  END IF;

  IF p_vat_period_id IS NULL THEN
    RAISE EXCEPTION 'Momsperiod saknas.'
      USING ERRCODE = '22023';
  END IF;

  -- Declaration is a state/audit operation only. It does not read journal
  -- balances or write accounting rows, so the vat_periods row lock is the
  -- concurrency boundary for closed -> declared and declare -> declare races.
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
    RAISE EXCEPTION 'Endast SoloLedger-hanterade momsperioder kan markeras som deklarerade.'
      USING ERRCODE = '23514';
  END IF;

  IF v_period.status = 'declared' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_declared', true,
      'vat_period_id', v_period.id,
      'status', v_period.status,
      'source', v_period.source,
      'declared_at', v_period.declared_at,
      'closing_amount', v_period.closing_amount,
      'closing_transaction_id', v_period.closing_transaction_id,
      'updated_at', v_period.updated_at
    );
  END IF;

  IF v_period.status <> 'closed' THEN
    RAISE EXCEPTION 'Endast stängda momsperioder kan markeras som deklarerade (nuvarande status: %).',
      v_period.status
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.vat_periods
  SET status = 'declared',
      declared_at = now(),
      updated_at = now()
  WHERE id = v_period.id
    AND user_id = v_user_id
  RETURNING *
    INTO v_period;

  RETURN jsonb_build_object(
    'success', true,
    'already_declared', false,
    'vat_period_id', v_period.id,
    'status', v_period.status,
    'source', v_period.source,
    'declared_at', v_period.declared_at,
    'closing_amount', v_period.closing_amount,
    'closing_transaction_id', v_period.closing_transaction_id,
    'updated_at', v_period.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.declare_vat_period_atomic(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.declare_vat_period_atomic(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_vat_period_atomic(uuid) TO service_role;
