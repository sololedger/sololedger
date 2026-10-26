# KAN-112 + KAN-113 – lokal Production-backup och återställningsprov

2026-10-26. **BACKUP VERIFIED. READY inför nytt separat Production-releasebeslut**
för exakt e992e4f97e1d74c91b24947d61f1774596340bc1 och dess tre migrationer.
Detta är verifierad DB-backup och ett avgränsat återställningsprov, inte en
certifiering av full Supabase-/katastrofåterställning. Ingen releaseåtgärd utförd.

## Återanvänd metod och faktiskt skapad fil

Tidigare metod läst i root/docs/reviews/INVENTORY-BACKUP-RESULT-20261021.md,
INVENTORY-RECOVERY-RESULT-20261021.md och BACKUP-RECOVERY-FREE-PLAN-20261021.md.
KAN-98:s backup-once/verify-backup och inventariernas restore-structure återanvändes,
anpassade till nytt mål, ledger61 och nuvarande schema. Inget backupsystem installerat.

- Fil: **C:/SoloLedger/Backups/KAN112113-20261026/production-20261026T182848Z.zip.dpapi**.
- pg_dump började18:28:34.487 UTC och paketet skapades18:28:48 UTC,
  **19:28:34–19:28:48 svensk tid**. Databasarkivet har en konsistent pg_dump-snapshot;
  rollexporten är en separat katalogläsning.
- PostgreSQL17.11 klient mot Production17.6. Explicit host
  db.wbaxmuvudpnkvuliicuy.supabase.co:5432/postgres, postgres-rollen,
  **verify-full TLS med tidigare verifierad offentlig Production-CA**, READ ONLY.
  Befintlig PGPASSFILE användes enbart som filreferens; innehållet lästes inte ut.
- Native **pg_dump custom-format**, --create, full databas utan schema-/data-/ägare-/ACL-filter.
  --create bevarar databasmetadata; det får inte blint användas vid återställning.
- Separat pg_dumpall --roles-only --no-role-passwords. Minnes-ZIP med database.dump,
  roles.sql och manifest.json krypteras med **Windows DPAPI CurrentUser före disk**.
- Krypterad fil **1 280 502 byte**; inre custom-dump **1 272 788 byte**;
  rollexport **5 840 byte**.
- Krypterad fils SHA256:
  `0365cc2b1621e4e9906b00455203bebbd462961a5e6cf6fd9685647480d04620`.
- Mapp och fil: endast aktuellt Windows-konto och SYSTEM har tillåtande ACL,
  mappens ärvda åtkomst avstängd. Separat process verifierade båda ACL:erna.
  C:/SoloLedger/Backups ligger utanför Git/Desktop/vanlig synkad arbetskopia;
  inga reparse-länkar i sökvägens SoloLedger-/Backups-/backupmappar.
- Ingen klartextdump/kunddatafil skrevs. Tidigare backupfiler bevarade;
  KAN97-kopians tidigare hash återkontrollerad. Granskade verktyg och sanerade kvitton
  finns även i backupmappens recovery-tools/, med samma begränsade åtkomst.

## Integritet och omfattning: PASS

pg_dump/pg_dumpall exit0 utan varningar. Hela arkivet avkodades av pg_restore
till nullström före/efter kryptering och i separat verifieringsprocess. DPAPI,
ZIP-manifest, komponentlängder/hashar och beständiga krypterade bytes matchade.
Detta verifierar mer än enbart en läsbar innehållsförteckning.

**1 220 TOC-poster.** Arkivets TABLE DATA-poster matchar alla läsbara vanliga
tabeller: public32, auth27, storage8, vault1, realtime2, supabase_migrations1.
Realtime.messages är en partitionerad föräldratabell utan partitioner; dess
struktur finns, men den har korrekt ingen egen TABLE DATA-post. Den första
kontrollen räknade föräldern som vanlig tabell; läsande typkontroll förklarade
skillnaden utan att ändra backupen eller utelämna data.

Samtliga103 publika funktionsförbilder finns. Schema, data, constraints/index,
triggers, policyer/RLS, ACL/ägare och sekvensvärden ingår där pg_dump stöder dem.
Auth-kontodata och sessionstabeller finns i den krypterade dumpen. Tabellinnehåll,
kundfilnamn, tokens och lösenordshashar har inte lagts i rapporter eller loggar.

## Faktisk isolerad återställning: PASS för angivet scope

Nytt mål **sololedger_kan112113_recovery_20261026**,127.0.0.1:5432, PostgreSQL17.11,
OID66958, unik databasmarkör i lokal-identity/guard. Identitet, namn, OID, version,
port och markör verifierades före skrivningar. Ingen befintlig databas återställdes,
raderades eller nollställdes. Inga gemensamma roller/lösenord/serverinställningar ändrades.

Ur just den nya krypterade backupen återställdes Auth/public/supabase_migrations-
struktur, de61 migrationsraderna och opersonliga tax_rule_parameters. Därefter
jämfördes levande Production och lokalt mål:

- Alla32 public-tabeller: kolumner/defaults, constraints/index/triggers, ägare,
  RLS och effektiva anon/authenticated/service_role-rättigheter matchar.
- Alla103 public-funktioner: full kropp, ägare, ACL, SECURITY DEFINER och config matchar.
  Även fyra Auth-funktioner och33 public-policyer matchar. Ledger61, inklusive
  version/namn/statements-avtryck, matchar exakt.0 foreign servers/subscriptions.
- Två syntetiska Auth-konton skapade profil via återställd trigger; authenticated
  såg eget konto och nekades andra ägarens profil. auth.uid fungerade.
  Transaktionen rullades tillbaka; Auth/profiler/journal/transaktioner har0 rest-rader.

Dokumenterade lokala plattformsanpassningar, samma som tidigare metod:
--no-owner mappar till lokalt postgres; alla public-objekt ägdes redan av postgres.
37 grants/default privileges för saknade Supabase-hanterade roller utelämnades
lokalt. Auth-schema-USAGE för anon/authenticated/service_role verifierades färskt
i Production och återskapades enbart i mål-DB. Det första syntetiska försöket
nekades före denna bootstrap och rullades tillbaka; omtest PASS.
pgcrypto/uuid-ossp installerades endast som befintliga extensionpaket i nya DB:n.
Jämförelsen normaliserade CRLF/LF och objektsortering samt exakt tre ekvivalenta
AND-grupperingar i CHECK-utskrift mellan PostgreSQL17.6 och17.11. Ingen annan
tabell-/funktions-/behörighetsskillnad accepterades.

**Inte provat:** återläsning av riktiga kund-/Auth-rader, Auth-server/inloggning,
Storage-/Realtime-/Vault-tjänster eller komplett Supabase-plattform från noll.
Full arkivavkodning omfattade däremot även dessa exporterade datarader.

## Återställningsförfarande och begränsningar

1. Stoppa en eventuell incidentrelease och fastställ faktisk version/ledger/data.
   Ingen automatisk Production-restore eller databasrollback är godkänd.
2. På samma Windows-identitet: verifiera filhash, ACL och DPAPI-dekryptering med
   recovery-tools/verify-backup.ps1. Komponenterna hanteras i minne; skriv inte en
   dekrypterad kunddump till Git/temp/synkad mapp. Bevara originalbackupen.
3. För upprepat avgränsat prov: granska restore-structure.ps1, välj **nytt unikt**
   lokalt DB-namn/markör och verifiera loopback/port/postgres17/att namnet saknas.
   Skapa från template0; återanvänd endast befintliga roller. Återställ valda scheman
   utan --create/--clean. Använd dokumenterad lokal Auth-bootstrap och jämför
   funktioner, tabellkontrakt, RLS/grants samt syntetiskt ägarskydd före godkänt prov.
   Befintlig prov-DB och fixtures bevaras. Skriptet vägrar skriva över ett befintligt mål.
4. Vid verklig migrationsincident: välj efter granskning en riktad framåträttning
   eller selektiv återställning av godkända funktionsförbilder ur arkivet. Bevara
   nyare bokföring, checklistesvar och korrekt migrationshistorik; ingen tyst repair.
   Varje Production-åtgärd kräver nytt exakt godkännande.
5. Full DB/Auth-restore kräver ett skyddat kompatibelt mål, granskad roll-/ägar- och
   extensionmappning, datavalidering och Supabase-konfiguration. Återställ inte blint
   exporterade clusterroller mot en befintlig server. Använd inte arkivets postgres-
   databasnamn för att skapa/ersätta ett befintligt mål. Full restore kan förlora
   legitima ändringar efter backupen och är inte verifierad av detta prov.

DPAPI kräver samma Windows-profil och dess nycklar. Ingen portabel/offsite-kopia
skapades; dator-/profilförlust täcks inte. Pagefile/hibernering/full diskkryptering
är inte verifierad. Storage **metadata** ingår men **filbytes ingår inte** i denna
nya kopia. Tidigare separata filbackuper bevaras men deras aktualitet certifieras
inte här. Auth-plattformsinställningar, Edge-bundles/secrets, rollösenord, externa
krypteringsrot-/API-nycklar, Vercel/Stripe/DNS-konfiguration ingår inte i DB-dumpen.
Supabase-managed extensions/roller/tjänster måste tillhandahållas av målplattformen.
Databasexport och rollexport är inte en gemensam snapshot. Ingen PITR skapas.

## Ny Production-preflight och releasebedömning

2026-10-26 18:34:56 UTC/19:34:56 svensk tid: **PASS läsande preflight**.
Production ACTIVE_HEALTHY, ledger61/public32/funktioner103, katalog och RPC-
preconditions/rättigheter exakt som readiness. Inga migrationer applicerade.
GitHub main fortfarande6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e,
staging=e992e4f. Vercel Production dpl_HtjAS5DwW3BK1xetQr4gJEJ7gU6Q READY,
main/production/rätt team/projekt; alias/envmetadata oförändrade. delete-user
fortfarande ACTIVE v16/verify_jwt=true.0 pågående/framtida lås/berörda användare.
Produktkopian var ren på2b86dda före rapporten; ingen produktdiff mot kandidaten.

Backupen och exekverat återställningsprov ger en användbar, proportionerlig
återhämtningsväg för just de tre granskade migrationerna: förbilder för befintliga
RPC:er och all tidigare DB/Auth-data finns; migrationerna återbokför inte historik
och ändrar inte Storage-filer. **Tidigare backupblockering är undanröjd inom detta
release-scope.** Ovanstående katastrof-/Storage-/full-restore-luckor kvarstår.
Inför nästa releasebeslut ska backupens aktualitet och live preconditions återläsas;
nyare legitima data får aldrig skrivas över med en äldre snapshot.

Inga Production-/Staging-skrivningar, migrationer, Edge-publiceringar, pushar,
deployments, Jira-mutationer eller automatisk Production-restore. Ny lokal prov-DB
är bevarad med endast struktur/opersonlig data. Rootens orelaterade diff bevarad.
Sanerat kvitto: docs/testing/kan112113-backup-20261026/verification.json.
Detaljerade verktyg/bevis: root/audit-packages/KAN112113-backup-20261026/ och
backupmappens recovery-tools/. PROJECT_STATE anger nästa beslut; stanna här.

Metodstöd: [PostgreSQL17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
