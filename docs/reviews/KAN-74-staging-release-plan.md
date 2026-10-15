# KAN-74 – färsk livejämförelse och isolerad Staging-plan

2026-10-15. Oberoende kodgranskning PASS enligt ledarchattens besked. **Production-livejämförelse: PASS. Migrationsanslutning: PASS för både Production och Staging. Kandidaten är redo för ledarchattens beslut om isolerat Git-checkpoint och Staging-release.** Ingen publicering eller skrivande åtgärd är godkänd eller genomförd.

## 1. Läsande livekontroll

| Miljö | Resultat | Evidens |
| --- | --- | --- |
| Staging fzxqiqenqjzhlyxxpvhg | PASS | Ny Direct/IPv6/TLS 1.3-läsning 15 oktober kl. 16:41 CEST. Import-/raderingsbas, ägare/ACL, beroenden och 43 ledger-versioner verifierade; inga KAN-74-objekt applicerade. |
| Production wbaxmuvudpnkvuliicuy | PASS | Ny Direct/IPv6/TLS 1.3-läsning 15 oktober kl. 16:41 CEST. Import-/raderingsbas, ägare/ACL, beroenden och 41 ledger-versioner verifierade; inga KAN-74-objekt applicerade. |

**Migrationsanslutning: PASS**, verifierad utan databasändring. I båda miljöerna används dokumenterat Direct-DNS på port 5432, rätt projektref och separat befintlig PGPASSFILE, databas/roll postgres, IPv6 och TLS 1.3. Credentialinnehåll har inte lästs, visats eller kopierats.

| Kontroll i båda miljöerna | Före och efter RESET ALL |
| --- | --- |
| lock_timeout setting/reset_val | 5000 / 5000 ms |
| statement_timeout setting/reset_val | 120000 / 120000 ms |
| default_transaction_read_only setting/reset_val | on / on |
| Ny transaktion efter reset | READ COMMITTED, transaction_read_only=on |
| Session | Samma pg_backend_pid genom respektive psql-kontroll |
| Separat faktisk CLI-anslutning | Supabase CLI 2.120.0, PASS för båda projekten kl. 16:43 CEST |

Timeoutvalen skickas **process-/anslutningslokalt vid startup**, inte med ALTER ROLE/DATABASE/SYSTEM eller någon sparad inställning. psql-kontrollen går över transaktionsgräns med ROLLBACK, RESET ALL och en ny BEGIN som ärver read-only. CLI-kontrollen använder den etablerade läsande kontrollproben: en implicit skrivskyddad transaktion, katalogassertioner och sessionslokal RESET ALL i samma kontrollblock; den verifierar även source=client och samma backend före/efter reset. Inga bokföringsfunktioner anropas och ingen DDL, migration eller dataändring körs. CLI-versionen behålls; inget uppdateras.

PASS avser den faktiska anslutningens säkerhets-/timeout-/sessionsförutsättningar. CLI:s filtransaktionsbeteende för samma 2.120.0 återanvänds från tidigare verifierat förfarande; godkända lokala protokolltester har inte körts om. Faktisk hosted migration och dess skrivbehörighet har inte provats, och ingen db push/dry-run har körts. Inför ett separat godkänt skrivsteg ska den explicita read-only-begränsningen ändras endast för den godkända exekveringsanslutningen, medan startup-timeouterna och målverifieringen behålls.

Historik: förmiddagens Direct-försök saknade fungerande adressväg. Poolern kunde då läsas i en explicit READ ONLY-transaktion men hade lock_timeout 0/0 och var olämplig för migration. Den kontrollen bevaras i tidigare evidens och har inte upprepats. Nu används fungerande Direct i båda miljöerna. Inga nätverks-, brandväggs-, Supabase- eller databasinställningar har ändrats.


### De tre förslagen mot färsk Production och Staging

1. **20261015115900_kan74_sie_verified_inputs.sql**: sie_import_inputs, validator och registrerings-RPC saknas, och inga motsvarande överlagringar/objekt finns i den inspekterade katalogen. Befintliga profiles.id och auth.users.id har UUID-underlag för FK; gen_random_uuid() och auth.uid() finns. Default grants är breda i hosted miljön, men förslaget återkallar dem explicit för kvittotabellen och de nya funktionerna och aktiverar RLS. Endast service_role får registrera; klienter får inte direkt tabellåtkomst; service_role får SELECT för adminräkning. Ingen kollision identifierad.
2. **20261015120000_kan74_sie_opening_balance_guard.sql**: nuvarande import_sie_batch(jsonb) i båda miljöerna matchar den verifierade ursprungsdefinition som kandidaten byggts från. Befintlig bokföringskropp, moms-/verifikationshjälpare, tabeller och skyddstriggers är inspekterade. Den avsedda ändringen är den granskade kvitto-/period-/flerårsspärren inklusive profil FOR SHARE NOWAIT och atomär konsumtion. Signaturen kvarstår; ingen fri JSON-fallback får finnas.
3. **20261015121000_kan74_sie_receipt_deletion.sql**: nuvarande delete_user_data_atomic(uuid) i båda miljöerna matchar verifierad ursprungsdefinition. När de tre kvittotilläggen (variabel, DELETE/räkning, returantal) tas bort ur förslaget matchar resten båda färska livekropparna. Övrig raderingsordning/livscykel förblir intakt.

import_sie_batch och delete_user_data_atomic ägs av **postgres**, är SECURITY DEFINER med search_path=public. Import-ACL: postgres/authenticated/service_role EXECUTE, ingen PUBLIC/anon. Raderings-ACL: endast postgres/service_role. Förslagen använder CREATE OR REPLACE utan att ändra befintliga RPC-ägare/ACL. undo_sie_import_atomic och dess KAN-71-kropp/ACL matchar det verifierade lokala utgångsläget och ändras inte.

Katalogberoenden för PL/pgSQL visar huvudsakligen språk/schema och räcker inte som fullständigt beroendebevis. Därför har även funktionskroppar, använda tabeller, journal-/raderings-/rättelsetriggers och nya FK-underlag granskats. Den aktiva CREATE TABLE-eventtriggern rls_auto_enable aktiverar RLS och tillför inga grants. Aktiv pgrst_ddl_watch skickar schema-reload vid relevanta DDL; faktisk PostgREST-synlighet ska ändå verifieras efter migration.

### Historik och befintliga avvikelser

- Staging har **43 ledger-versioner**, exakt samma versionsmängd som origin/staging. KAN-74:s tre versioner saknas. Vid framtida oförändrat utgångsläge blir antalet 46. Namn, statement counts och SQL-fingeravtryck är sparade; ingen historisk migration har körts om.
- origin/main innehåller **41 migrationsfiler**. Stagings två extra är 20261012123000_kan62_fixed_asset_gross_vat_rate och 20261012153000_kan62_fixed_asset_group_locking. Det är existerande Staging-historik, inga nya KAN-74-beroenden. Production har färskt verifierade **41 ledger-versioner**, exakt samma versionsmängd som origin/main. Vid en senare oförändrad Production-kedja plus KAN-74 blir det 44.
- Stagings inventariebokningsfunktion innehåller KAN-62:s brutto-/momssats-/grupplåsändringar. KAN-74 anropar eller ersätter inte denna funktion. KAN-65:s UI/historikändringar finns i Staging-Git, inte i produktionskandidaten.
- Staging har bredare befintlig EXECUTE på get_next_ver_nr(uuid), inklusive PUBLIC/anon, än färsk Production. Production har endast postgres/authenticated/service_role, samma som den godkända lokala testkopian. Kroppen är oförändrad och kontrollerar p_user_id mot auth.uid(). Fem befintliga tabeller har dessutom authenticated MAINTAIN (m); livscykeltabellen har explicit ägar-ACL där lokal kopia har implicit ägaråtkomst. **Dessa grants får inte kopieras från testkopian eller repareras som del av KAN-74.** De förändrar inte förslagens anrop som postgres-definer men kräver riktig hosted behörighetsacceptans.
- Profilsparning använder kolumn-UPDATE, inte generell tabell-UPDATE: authenticated får uppdatera org_nr och de övriga avsedda profilfälten. Detta är verifierat och gör P2-scenariot relevant även hosted. Företagskontrollen måste därför behålla det granskade låset.
- Public-kolumner, index, RLS-policies och vanliga triggers matchar den jämförda lokala kopian när KAN-74:s nya objekt undantas. Tre inventarie-CHECK skiljer bara i parentesgruppering, samma årsvillkor 1900–9999. Auth.users-id är en lokal teststub; den jämställs inte med riktig hosted Auth. Övriga observerade funktionshashskillnader kontrollerades: utöver KAN-62 och nämnd ACL förklaras de av formatering/radslut.

Ingen upptäckt definition i Production eller Staging kräver ändring av de granskade KAN-74-filerna. Båda miljöernas berörda kolumner, constraints, index, RLS-policies och vanliga triggers överensstämmer; berörda index är valid/ready/live. Skillnader i rå funktionshash för importen är endast radslut, inte annan bokföringskod.

Tre äldre delade ledger-versioner har olika lagrad SQL-representation mellan miljöerna: **20260925050113, 20260925070346 och 20261008170000**. Aktuella SQL-fingeravtryck och statement counts matchar respektive miljös verifierade 14-oktoberevidens exakt. Det är ingen ny KAN-74-avvikelse och ingen ledger-reparation eller historisk omkörning ska göras. Alla gemensamma nyare versioner, inklusive KAN-71, matchar. Stagings schema/funktionsinventering/ledger är oförändrade sedan förmiddagens kontroll.

## 2. Isolerad releaseväg

Färsk git ls-remote bekräftar **main 1d297c1fd387be2f3f6cd54a780b8c58c2901732** och **staging a47a57d07fd76520034f02fc4ced4f67dc35caa2**. Lokala main/staging är äldre respektive docs-avvikande och får inte användas som release-HEAD. KAN-74-worktreen ligger redan på origin/main-basen; alla kandidatändringar är fortfarande ocommittade och inget är staged.

Rekommenderad etablerad tvåspårsväg, efter separat godkännande:

1. Frys den PASS-granskade KAN-74-diffen och manifestet i befintlig codex/KAN-74-sie-opening-guard. Skapa först efter commitgodkännande ett exakt KAN-74-checkpoint **C** ovanpå 1d297c1. C omfattar endast KAN-74:s app, serverroute, migrationsförslag, delete-user Edge, riktade tester och relevant dokumentation. Inga filer från andra worktrees. Ingen commit skapas i detta uppdrag.
2. Förbered därefter en separat Staging-integrationsworktree/-gren från då verifierad origin/staging och cherry-picka **endast C:s KAN-74-delta** till kandidat **S**. Befintliga produktfiler som KAN-74 ändrar överlappar inte Stagings nuvarande avvikande produktfiler; PROJECT_STATE kräver saklig dokumentationssammanfogning. Kör relevanta checks även på S. Gör inte reset av canonical staging, någon äldre releaseworktree eller andras ändringar.
3. Efter exakt Staging-godkännande publiceras bara S till staging som normal fast-forward. S behåller befintliga KAN-62/65 i Staging men tillför endast KAN-74. **Detta isolerar releaseurvalet; det gör inte den delade Staging-miljön fri från tidigare ändringar.**
4. En eventuell Production-release utgår senare från **C**, eller ett explicit godkänt rent KAN-74-commitset ovanpå verifierad origin/main. **S/origin/staging får aldrig mergeas till main.** Verifiera att KAN-62/65-commits och deras två migrationsfiler saknas i Production-kandidaten; jämför den godkända KAN-74-deltan mellan C och S. Bygg och verifiera även den rena kandidaten inför Production, och kräv godkännande för dess exakta SHA. Ingen Production-publicering ingår i denna planexekvering.

Därmed är C och S olika fullständiga programversioner. Staging-acceptans av KAN-74-deltan är inte ett godkännande av KAN-62/65 eller av S för Production. Om ledaren kräver att även hela det testade programmet är exakt C behöver en särskilt konfigurerad isolerad Preview beslutas separat; det förutsätts inte här.

Staging-migrationsrunnern ska innehålla **Stagings redan applicerade 43 originalfiler + endast tre KAN-74-filer**. Använd integrationens kedja eller en isolerad temporär CLI-runner enligt Architecture.md. De två KAN-62-versionerna är där enbart för att matcha redan existerande ledger, och får inte appliceras igen. Den framtida Production-runnern använder dess då verifierade main/ledger-kedja plus KAN-74, utan KAN-62/65. Inga --include-all, historiska baselines eller ledger-reparationer.

## 3. Föreslagen Staging-ordning – inga steg utförda

1. Live-/anslutningsvillkoren är nu PASS. Använd den verifierade Direct-vägen med samma processlokala timeoutval och CLI 2.120.0. Inför en separat godkänd applicering kontrolleras exakt mål, då aktuell ledger/diff och inställningar i den faktiska exekveringssessionen på nytt; stoppa vid drift. Inga databas-/rollstandarder behöver ändras.
2. Begär exakta godkännanden nedan. Förbered C/S, fastställ diff/manifest, byggd Preview-konfiguration och testschema. Verifiera NEXT_PUBLIC_SUPABASE_URL/anon och serverns SUPABASE_SERVICE_ROLE_KEY för **Staging**, utan att exponera hemligheter. Både route och klient läser samma URL/anon-konfiguration; tjänstenyckeln finns bara på servern. Kontrollera inga andra väntande migrationsfiler.
3. Boka ett kort operativt Staging-servicefönster: pausa SIE-import, adminradering och relevanta bokföringsskrivningar; låt pågående anrop avslutas. Ingen ny underhållsfunktion antas finnas. Garanterad oavbruten import är inte möjlig med nuvarande strikta API-byte: gammal klient skickar fri JSON, ny route kräver ny registreringsfunktion och kvitto-RPC. Enbart val av ordning kan inte göra två fristående system atomära.
4. Med officiell verifierad Supabase CLI 2.120.0, isolerad runner och explicit mål: framtida db push --dry-run --skip-vault får lista **endast** de tre godkända KAN-74-versionerna. Om remote ändrats eller fler versioner visas: STOPP. Ingen dry-run har körts mot hosted nu.
5. Applicera hela filer i ordning **115900 → 120000 → 121000**, med CLI:s normala filtransaktioner. Verifiera exakt ledger/version och motsvarande objekt/ägare/ACL/RLS/FK efter varje steg; kontrollera att utomstående definitioner och historik inte ändrats. Ingen fri-payload-fallback under övergången. Återuppta inte import mellan stegen.
6. Publicera den granskade **delete-user Edge-funktionen till Staging** efter att kvittotabell och raderings-RPC finns, innan adminradering öppnas. Annars missar gammal Edge-räkning/residualkontroll den nya domänen. Kontrollera schema-cache och nya RPC-signaturers synlighet.
7. Publicera serverroute **och klient i samma Next/Vercel Preview-artefakt S**, genom godkänd Staging-push/deploy. Ingen separat klient-först eller route-först-release. Kontrollera branch/SHA och Staging-target. Försäkra att testarna laddar om gamla öppna flikar; gamla direkta JSON-anrop ska fortsatt avvisas. Fönstret öppnas först när end-to-end-import och felhantering kontrollerats.
8. Kör godkända dedikerade Staging-tester nedan. Dokumentera exakt S, C:s KAN-74-delta, ledger 46 om utgångsläget är oförändrat, Edge-version och resultat. Återöppna efter PASS. Om deployment eller kontroll fallerar: håll import/adminradering pausad och STOPPA; återställ inte gammal oskyddad RPC och gör inte automatisk datarättning/rollback.

## 4. Kort Staging-acceptans

Endast dedikerad Staging-testanvändare och syntetiska filer, efter separat godkännande för testskrivningar. Staging-preflight måste neka Production-ref. Befintliga test:kan74:db är **lokala** och får inte riktas om mot hosted. Saldon/antal nedan jämförs för just testanvändaren, inga riktiga användardata används.

| Fall | Test och förväntat resultat |
| --- | --- |
| Giltigt år | Ny testanvändare med matchande org_nr. RAR 0 för ett kalenderår, IB bank 10 000/motkonto −10 000 och VER insättning 100. Import via dialog/API lyckas, bank 10 100, balanserad journal, korrekt importhistorik, kvittot konsumerat. Kontrollera moms/NE/dashboard utan ändrad beräkningsmodell. |
| Flerår avvisas | På samma användare: andra året med IB, utan IB och med ”Öppningsbalans”/2018-verifikation. Alla avvisas; bank/journal/batchantal oförändrade. Separat fil med RAR 0 20240701–20251231 avvisas före kvittoregistrering. |
| Vanlig bokföring | Bokför en vanlig tillåten manuell testhändelse. Kontrollera journal, verifikationsnummer, bank och rapportpåverkan; inga SIE-kvitton krävs. Befintlig fakturaväg snabbkontrolleras om releasechecklistan omfattar den. |
| KAN-71 | Med separat syntetisk VAT-batch/period: försök import och ångring som berör en stängd/deklarerad SoloLedger-momsperiod. Båda blockeras enligt befintliga regler, inga nya journalrader. Generell rättelse av SIE-original får inte kringgå skyddet. |
| Dubbletter | Återspela exakt importerad fil: begripligt dubblettfel och inga nya rader. Samma år/annan giltig fil utan IB följer befintliga regler; ny IB inom samma år avvisas. Gammalt direkt RPC-JSON samt återanvänt kvitto avvisas. |
| Importdialog | Saknad/tvetydig RAR, fel period, profil som ändrats och fil >4 MB ger säkra svenska fel utan rådata. Exakt 4 MB med normal multipart ska nå routen; totalgräns 4 065 536 byte och 50 000 rader bevaras. Osäkert nätverkssvar ska hänvisa till importhistoriken, inte utlova rollback. |

Kompletterande obligatorisk domänkontroll före återöppnad adminradering: ett kvarvarande syntetiskt testkvitto räknas av både admin dry-run och Edge; full testanvändarradering lämnar inga kvitton eller bokföringsresidualer. Godkänd städning sker via ordinarie livscykel, ingen direkt historikradering.

## 5. Separata beslut/godkännanden

- De tidigare Direct-/livejämförelseblockerarna är lösta skrivskyddat. Kandidaten är redo för beslut; ingen ny produktändring eller omgranskning behövs utifrån de kontrollerade liveförutsättningarna. Ingen ändring av nätverk, rollstandarder eller Supabase-konfiguration har gjorts.
- Godkännande av exakt lokalt KAN-74-commitset C; separat godkännande för push. Ingen commit eller branchändring har gjorts här.
- Godkännande för de **tre exakta migrationsfilerna mot fzxqiqenqjzhlyxxpvhg**, servicefönster och samordnad Staging-publicering inklusive delete-user Edge och Preview S. Inget Production-mål i detta godkännande.
- Godkännande för dedikerade Staging-testskrivningar/radering och Pontus acceptans.
- Senare Production-migration och release från exakt rent C/commitset kräver egna godkännanden. KAN-62/65 hålls fortsatt utanför.

## Bevarande och evidens

Samtliga 14 registrerade worktrees finns kvar. De 13 ursprungliga HEAD/status inklusive KAN-62/65 och docs-commit 11d8306 är jämförda och bevarade; KAN-74:s produkt-/SQL-/testfiler är byteoförändrade under detta uppdrag. Endast denna plan och PROJECT_STATE uppdateras, även i den återupptagna Direct-kontrollen. Jira KAN-74 lästes To Do/High/unassigned; ingen status eller annan Jira-data ändrades.

Evidens: C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/live-plan/. staging.json, staging-supplement.json, staging-drift-functions.json, comparison.json, schema-differences.json, mål-/TLS-/felstatus och kandidatmanifest. Endast kod-/schema-/migrationsmetadata, inga credentials eller bokföringsinventeringar. Äldre lokal evidens är fortsatt historik. Den nya färska Production-/Staging-evidensen finns separat i C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/home-live/: production.json, staging.json, respektive cli/status/supplement, comparison.json och detailed-comparison.json. Förmiddagens misslyckade Direct-försök och poolerkontroll bevaras som historik; de gäller inte som aktuella blockerare.

Ingen hosted migration, data-/konfigurationsskrivning, deploy, Git-push, commit, branchändring eller Jira-mutation. Inga produkttester omkörda: detta uppdrag ändrar inte implementationen. Avvakta ledarchattens beslut.
