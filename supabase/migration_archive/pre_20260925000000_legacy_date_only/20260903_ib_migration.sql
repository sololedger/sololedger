-- ─────────────────────────────────────────────────────────────
-- #IB-stöd: minimal migration ovanpå redan installerad SIE-import
-- ─────────────────────────────────────────────────────────────
-- Förutsätter att sie_import_schema.sql (import_batches, transactions.source
-- m.fl., den ursprungliga import_sie_batch()) redan är installerad.
--
-- Innehåller ENDAST det som är nytt/ändrat:
--   1. Bredda transactions.source-constrainten med 'sie_opening_balance'
--   2. Ersätt import_sie_batch() med #IB-medveten version, INKLUSIVE
--      closed_years-kontrollen för #IB-blocket (tillagd efter första
--      #IB-implementationen - om ni redan körde en tidigare version av
--      den här filen utan den kontrollen, kör den här för att uppdatera).
--
-- Inget CREATE TABLE, ingen policy, inga kolumn-ADD-satser - allt det
-- finns redan hos er.

-- ── 1. Source-constraint ────────────────────────────────────
-- Ingående balans (#IB) importeras som en egen transactions-rad med ett
-- tredje source-värde, skild från vanliga importerade verifikationer - ger
-- framtida UI-kod (t.ex. TransactionTable.tsx) en krok att särbehandla den,
-- utan att någon beräkningsfunktion i accountingService.ts behöver veta att
-- den existerar (de bryr sig bara om journal_entries, inte source).
alter table transactions
  drop constraint transactions_source_check,
  add constraint transactions_source_check
    check (source in ('manual', 'sie_import', 'sie_opening_balance'));

-- ── 2. import_sie_batch() ───────────────────────────────────
-- CREATE OR REPLACE är alltid säkert att köra om - ersätter hela
-- funktionskroppen med den #IB-medvetna versionen (inkl. closed_years-
-- kontrollen för #IB) i ett steg.

create or replace function import_sie_batch(p_payload jsonb)
returns jsonb
language plpgsql
as $$
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

    -- Server-side balanskontroll, oberoende av klientens (parsern har redan
    -- gjort samma kontroll) - en giltig ingående balans MÅSTE balansera.
    select coalesce(sum((row_data->>'amount')::numeric), 0)
      into v_ib_balance
      from jsonb_array_elements(p_payload->'opening_balances') as row_data;

    if abs(v_ib_balance) > 0.005 then
      raise exception 'Ingående balans (#IB) balanserar inte (differens % kr).', round(v_ib_balance, 2)
        using errcode = '22023';
    end if;

    select coalesce(sum(greatest((row_data->>'amount')::numeric, 0)), 0)
      into v_ib_debit_sum
      from jsonb_array_elements(p_payload->'opening_balances') as row_data;

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
$$;