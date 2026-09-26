-- ─────────────────────────────────────────────────────────────
-- SIE-import: schema
-- ─────────────────────────────────────────────────────────────
-- Inför de fyra byggstenar som beslutades i arkitekturgenomgången:
--   - import_batches (ny tabell)
--   - transactions.source
--   - transactions.import_batch_id
--   - transactions.source_ver_series / source_ver_number
--
-- Ingen separat verifikationstabell (medvetet uppskjutet, se
-- arkitekturanalysen). transactions förblir bärare av verifikationen
-- för importerade rader, med source='sie_import' och type/vat_rate = null.
--
-- Båda nya FK:erna (import_batches.user_id, transactions.import_batch_id)
-- använder ON DELETE CASCADE, i linje med samtliga befintliga FK:er i
-- schemat (transactions_user_id_fkey, journal_entries_user_id_fkey,
-- journal_entries_transaction_id_fkey är alla CASCADE). Utan det skulle
-- delete-user misslyckas med ett FK-fel så fort en användare har minst
-- en import_batches-rad. Som bieffekt innebär det också att en borttagen
-- import_batches-rad kaskaderar bort sina transactions-rader, som i sin
-- tur (via den redan befintliga journal_entries_transaction_id_fkey)
-- kaskaderar bort tillhörande journal_entries - vilket är önskat beteende
-- för en framtida "ångra hel import"-funktion.

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  file_hash text not null,
  company_name text,
  org_nr text,
  fiscal_year int,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed')),
  verification_count int not null default 0,
  imported_count int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Dubblettskydd: samma användare kan inte importera samma (kanoniska)
  -- filinnehåll två gånger. Hashen beräknas klientsidan på det PARSADE
  -- innehållet, inte på råa filbytes (se sieImport.ts) - annars skulle
  -- #GEN-tidsstämpeln i varje export göra hashen unik varje gång.
  unique (user_id, file_hash)
);

alter table import_batches enable row level security;

create policy "import_batches_self_access"
  on import_batches for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table transactions
  add column source text not null default 'manual'
    check (source in ('manual', 'sie_import')),
  add column import_batch_id uuid null references import_batches(id) on delete cascade,
  add column source_ver_series text null,
  add column source_ver_number text null;

-- Importerade verifikationer har varken en enskild kategori (type) eller
-- en enskild momssats (vat_rate) - se arkitekturanalysen, punkt 1 och 4.
-- Kräver att ingen befintlig kod antar NOT NULL på dessa fält.
alter table transactions
  alter column type drop not null,
  alter column vat_rate drop not null;

-- ─────────────────────────────────────────────────────────────
-- SIE-import: atomär importfunktion
-- ─────────────────────────────────────────────────────────────
-- Hela importen sker i EN funktion, vilket i Postgres innebär EN
-- transaktion. Ett ohanterat undantag var som helst i funktionskroppen
-- rullar automatiskt tillbaka ALLT som redan gjorts i detta anrop -
-- inklusive den nyss infogade import_batches-raden. Det är detta som
-- ger "kan avbrytas utan halvimport" utan att vi behöver skriva någon
-- explicit ROLLBACK-logik.
--
-- SECURITY INVOKER (default, inget nyckelord behövs) - funktionen kör
-- med anroparens rättigheter, så befintliga RLS-policyer på
-- transactions/journal_entries gäller precis som vid vanlig bokföring.
--
-- Förväntad payload-form, se sieImport.ts för hur den byggs:
-- {
--   "filename": "...",
--   "file_hash": "...",
--   "company_name": "...",
--   "org_nr": "...",
--   "fiscal_year": 2021,
--   "verifications": [
--     {
--       "series": "A", "ver_number": "1", "date": "2021-01-05",
--       "description": "Kaffebröd",
--       "rows": [
--         { "account_number": "1930", "amount": -150.00, "date": "2021-01-05", "description": null },
--         { "account_number": "6071", "amount": 150.00,  "date": "2021-01-05", "description": null }
--       ]
--     }
--   ]
-- }

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
    'imported_count', v_imported_count
  );

  -- Inget EXCEPTION-block här medvetet: varje raise exception ovan
  -- propagerar obehandlad ut ur funktionen, vilket gör att Postgres
  -- rullar tillbaka HELA anropet - inklusive import_batches-raden som
  -- redan infogats. Klienten ser felet via supabase.rpc()'s error-fält
  -- (se sieImport.ts) och databasen innehåller inga spår av försöket.
end;
$$;