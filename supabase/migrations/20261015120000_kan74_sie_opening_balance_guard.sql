-- KAN-74: conservative single-year SIE import guard.
-- Source: deployed definition verified 2026-10-14, explicitly approved as the
-- local implementation base on 2026-10-15 while live access is unavailable.
-- A fresh pg_get_functiondef/schema/ACL comparison is required before hosted apply.
-- No data repair or report/export changes. Protected input table/ACL is in the prerequisite.
-- Lock order: receipt -> all VAT months -> import user -> opening day -> profile SHARE -> writes.
-- Requires 20261015115900; rejects the former free-payload API without fallback.

CREATE OR REPLACE FUNCTION public.import_sie_batch(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_receipt public.sie_import_inputs%ROWTYPE;
  v_company_org_nr text;
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

  -- KAN-74: one import-wide lock and both report date dimensions.
  v_first_import_date date;
  v_last_import_date date;
  v_import_year integer;

  -- KAN-6 review draft: synchronization/pre-scan state.
  v_vat_guard_dates date[] := ARRAY[]::date[];
  v_vat_guard_date date;
  v_matching_vat_periods integer := 0;
  v_blocking_vat_periods integer := 0;
begin
  if v_user_id is null then
    raise exception 'Ingen inloggad användare.' using errcode = '28000';
  end if;

  -- The only accepted external input is an opaque, server-issued receipt ID.
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NOT p_payload ? 'receipt_id'
    OR (p_payload - 'receipt_id') <> '{}'::jsonb
    OR coalesce(p_payload->>'receipt_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'Ett verifierat importkvitto krävs.' USING ERRCODE='P2075';
  END IF;
  SELECT * INTO v_receipt FROM public.sie_import_inputs
    WHERE id=(p_payload->>'receipt_id')::uuid AND user_id=v_user_id FOR UPDATE;
  IF NOT FOUND OR v_receipt.expires_at<=clock_timestamp() OR v_receipt.parser_version<>1 THEN
    RAISE EXCEPTION 'Importkvittot är ogiltigt, utgånget eller redan använt.' USING ERRCODE='P2075';
  END IF;
  -- Never combine free client accounting fields with the trusted payload.
  p_payload:=v_receipt.payload;
  PERFORM public.validate_sie_import_period(p_payload,v_receipt.period_start,v_receipt.period_end);

  if p_payload->'verifications' is null or jsonb_array_length(p_payload->'verifications') = 0 then
    raise exception 'Payload innehåller inga verifikationer.' using errcode = '22023';
  end if;

  -- A waiter must see the winner's committed history after the advisory lock.
  -- Repeatable-read snapshots would otherwise allow a stale pre-lock check.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Importen kunde inte kontrolleras säkert. Försök igen i en ny import.'
      using errcode = '25001';
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
    v_first_import_date := least(v_first_import_date, v_ver_date);
    v_last_import_date := greatest(v_last_import_date, v_ver_date);

    if v_ver->'rows' is not null and jsonb_typeof(v_ver->'rows') = 'array' then
      for v_row in select * from jsonb_array_elements(v_ver->'rows')
      loop
        -- Balance reads use transaction dates; year closing uses journal dates.
        -- An earlier non-VAT row must not bypass the opening-balance boundary.
        if v_row->>'date' is not null then
          if v_row->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then
            raise exception 'Verifikation % %, konto %: ogiltigt raddatum (fick: %).',
              v_ver->>'series', v_ver->>'ver_number',
              v_row->>'account_number', v_row->>'date' using errcode = '22023';
          end if;
          v_first_import_date := least(v_first_import_date, (v_row->>'date')::date);
          v_last_import_date := greatest(v_last_import_date, (v_row->>'date')::date);
        end if;

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
  -- 2. Per-user SIE import lock, including imports without #IB.
  -- 3. Existing opening-balance advisory lock when #IB exists.
  -- 4. Profile FOR SHARE: re-read company after waits; pin until transaction end.
  -- 5. Protected reads/writes and get_next_ver_nr().
  perform public.lock_vat_months(v_user_id, v_vat_guard_dates);

  perform pg_advisory_xact_lock(hashtextextended('sie-import:' || v_user_id::text, 0));

  if p_payload->'opening_balances' is not null and jsonb_array_length(p_payload->'opening_balances') > 0 then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || v_ib_date::text, 0)
    );
  end if;

  -- READ COMMITTED sees any org_nr change committed during the advisory waits.
  -- SHARE (not KEY SHARE) blocks non-key profile updates through receipt deletion
  -- and COMMIT. Take it only after the existing VAT/import/IB locks.
  -- Registry cleanup skips locked receipts; user deletion deletes receipts first.
  -- Do not wait on a profile writer while holding receipt/VAT/import locks.
  -- NOWAIT prevents a new cycle with profile-first/cascade operations.
  BEGIN
    SELECT nullif(regexp_replace(coalesce(org_nr,''),'[^0-9]','','g'),'')
      INTO v_company_org_nr FROM public.profiles WHERE id=v_user_id FOR SHARE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION 'Företagsprofilen ändras. Försök igen med originalfilen.' USING ERRCODE='P2075';
  END;
  IF NOT FOUND OR v_company_org_nr IS DISTINCT FROM v_receipt.company_org_nr THEN
    RAISE EXCEPTION 'Importkvittot hör inte till aktuellt företag.' USING ERRCODE='P2075';
  END IF;

  IF v_receipt.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Importkvittot har gått ut.' USING ERRCODE='P2075'; END IF;

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

  -- KAN-74 policy: exactly one SIE calendar/fiscal year per bookkeeping owner.
  -- Actual transaction AND journal dates must agree with optional #RAR 0 year.
  -- No filename, description, account number or inferred opening classifier.
  v_import_year := extract(year from v_first_import_date)::integer;
  if nullif(p_payload->>'fiscal_year', '') is not null
     and (p_payload->>'fiscal_year') !~ '^\d{4}$' then
    raise exception 'Ogiltigt räkenskapsår för SIE-import.' using errcode = '22023';
  end if;
  if extract(year from v_last_import_date)::integer <> v_import_year
     or (nullif(p_payload->>'fiscal_year', '') is not null
       and (p_payload->>'fiscal_year')::integer <> v_import_year)
     or exists (
       select 1 from public.import_batches b
       where b.user_id = v_user_id
         -- Status never erases history. Unknown years fail closed as well.
         and (b.fiscal_year is null or b.fiscal_year <> v_import_year)
     )
     or exists (
       select 1 from public.transactions t
       where t.user_id = v_user_id
         -- Undo mirrors are dated corrections, not another imported year.
         -- Original rows/batches remain and continue to reserve their year.
         and t.source is distinct from 'sie_import_undo'
         and (t.source in ('sie_import', 'sie_opening_balance')
           or t.import_batch_id is not null
           or t.source_ver_series is not null or t.source_ver_number is not null)
         and (extract(year from t.date)::integer <> v_import_year
           or exists (select 1 from public.journal_entries j
             where j.transaction_id = t.id and j.user_id = v_user_id
               and extract(year from j.date)::integer <> v_import_year))
     ) then
    raise exception 'Flerårig SIE-import stöds ännu inte. Importera endast ett räkenskapsår per företag. Även tidigare ångrade importer kan begränsa vilket år som kan importeras. Ingen bokföring har importerats.' using errcode = 'P2074';
  end if;

  -- Preserve the earlier full-IB boundary against pre-existing manual history.
  -- All cross-year SIE combinations are already rejected above, independent
  -- of opening labels. Existing same-year #IB duplicate validation stays below.
  if v_ib_date is not null and (
    exists (select 1 from public.transactions t
      where t.user_id = v_user_id and t.date < v_ib_date)
    or exists (select 1 from public.journal_entries j
      where j.user_id = v_user_id and j.date < v_ib_date)
  ) then
    raise exception 'Importen stoppades för att undvika dubbel ingående balans. Det finns bokföring från en annan period som först behöver stämmas av mot filens ingående balans. Ingen bokföring har importerats.'
      using errcode = 'P2074';
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
    v_import_year,
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

  -- Consume only on success, atomically with every accounting write.
  IF v_receipt.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Importkvittot har gått ut.' USING ERRCODE='P2075'; END IF;
  DELETE FROM public.sie_import_inputs WHERE id=v_receipt.id;

  return jsonb_build_object(
    'success', true,
    'import_batch_id', v_batch_id,
    'verification_count', v_verification_count,
    'imported_count', v_imported_count,
    'opening_balance_imported', v_opening_balance_imported
  );

  -- The protected body rolls back before this sanitized rethrow. Keep SQLSTATE
  -- for the client, never expose source rows/amounts or database DETAIL/HINT.
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'SIE-importen avvisades. Ingen bokföring har importerats.' USING ERRCODE=SQLSTATE;
end;
$function$;
