# KAN-62 – isolerad lokal databastestning 2026-10-21

## Samlat resultat: FAIL / ofullständig verifiering

Installationen av samtliga **55/55 migrationer är PASS**. SQL-regressionen avbröts av ett felaktigt uppbyggt negativt testfall. Samtidighetssviten gav **7 PASS, 1 FAIL och 1 ej kört**; det felande fallet har ett felaktigt metadatafacit i testhjälparen. Inga testförväntningar, produktfunktioner eller migrationsfiler har rättats under körningen. Detta är inte godkännande för Staging/Production eller generell inventariehantering.

## Miljö och bevarande

- Endast ny databas `sololedger_kan62_disposable_20261021`, TCP **127.0.0.1:5432**, PostgreSQL **17.11**. Namnet saknades före skapandet.
- Katalog-OID **57199**, markör **KAN62 disposable synthetic only 24656ce5-f60d-479e-8664-040667dc021c**. Identiteten sparad och kontrollerad före skrivande steg. Första markören sattes endast efter kontroll av den just skapade tomma basens OID och tomma tidigare kommentar.
- Auth/Storage installerades från det tidigare granskade lokala schema-only-underlaget, SHA-256 `99a7052ba51cc3510e17b37b09b0a8e99f63d3499da23aec62d768573dee2721`. Ingen användardata kopierades och ingen ny anslutning till plattformskällans databas behövdes. Modellen är minimal och bevisar inte full Supabase/JWT/HTTP-paritet.
- Alla **55 migrationshashar** verifierade mot fryst manifest före start och före relevant installation/testanslutning. Historiska filer oförändrade. Varje fil installerad separat med sina egna transaktionsgränser; position 40 med CREATE INDEX CONCURRENTLY lyckades.
- Befintliga databasers namn/OID/ägare/ACL/kommentar samt gemensamma roller/medlemskap jämförda före/efter: oförändrade. Inga roll-/lösenords-/serverövergripande ändringskommandon kördes. Sessionsinställningar avsåg bara körningens egna anslutningar.
- Ingen Staging-/Production-anslutning, ingen reset/DROP DATABASE/städning, ingen ändring av Jessikas data. Inga andra befintliga databaser har använts för testdata.

## Installation och uppgradering

1. Ny databas och Auth/Storage: PASS.
2. Position 1–54 enligt manifestet: **54 PASS**, inklusive alla historiska preimage-kontroller och båda äldre KAN-62-migrationerna.
3. Äldre syntetisk fixture via verklig `authenticated`-roll och föregångar-RPC: **PASS**, journal D5410 10 000 + D2641 2 500 / K1930 12 500. En syntetisk användare, payload och kvitto committades före uppgradering.
4. Position 55, `20261020233000_kan62_rule_contract.sql`: **PASS**. Privat funktionskropp ersatt. Publik wrapper, ägare/ACL/inställningar, övriga funktioner, tabeller, RLS, constraints, triggers, index, schemarättigheter och kontrollerad rollkatalog matchar föregångaren. Före-/efterdefinitioner sparade.

Lokal installation skedde med bevakad psql enligt planen. Bevismanifestet är inte en Supabase-migrationsledger och innebär ingen hosted historikreparation. Exakt installerade filer och hashvärden finns i `coverage/kan62-local-db/installed-migrations.json`; full ordningslista finns sist i denna rapport.

## SQL-regression: FAIL i testfixturen

Filen `kan62_rule_contract_candidate.sql` kördes oförändrad. Den utökade sviten nådde felmeddelandekontrollen för äldre ofullständig grupplänk och avbröts där:

- Förväntat: SQLSTATE **23514**, felorsak **äldre paketkoppling**.
- Faktiskt: SQLSTATE **23514**, **Ange om utrustningen väntas användas högst tre år.**

Testet tar loss A först **efter** att tredje köpet redan lagts till och gruppen aktiverats. De kvarvarande B+C plus provköpet ger 30 000 kr i gränsprövningsbelopp. Testanropet saknar livslängdsbesked och stoppas därför korrekt före den spärr som provet skulle nå. Det bevisar inte att spärren för gammal grupplänk är fel.

Innan avbrottet genomfördes utan assertionsfel: köp 28 000+7 000 utan avdrag med faktisk 35 000-kronorsjournal, exakt replay utan extra rader, ändrad nyckelpayload/försök till momsavdrag mot none-profil nekade av rätt orsak, gränsfall 29 599,99/29 600/29 600,01, kortliv vid/över gränsen utan momsavdrag samt tre successiva paketköp med omklassificering och bevarade ursprungsjournaler/event. Dessa är partiella körbevis, inte en godkänd hel SQL-svit.

Hela testtransaktionen återställdes när psql stängdes vid felet. Läsande slutkontroll visar att inga användare från rollback-sviten består och att den committade äldre fixturens samtliga kontrollerade rader är exakt oförändrade.

## Samtidighetsprov

Alla körda fall använde skilda verkliga psql-sessioner, faktisk klientroll och en separat observatör. PASS-fallen har sparat blockerande/väntande PID och bekräftad advisory-låsväntan.

| Fall | Utfall |
| --- | --- |
| Två paketköp utan avdrag, gammalt underlag stoppas, omladdning ger tre delar | PASS |
| Samma paketfall med fullt momsavdrag | PASS |
| Samtidig identisk replay: samma bokning, inga extra rader | PASS |
| Samma nyckel med olika payload: korrekt konflikt utan extra rader | PASS |
| Årsstängning först: köp väntar och nekas efter commit | PASS |
| Köp först: årsavslut väntar och lyckas med bokat underlag | PASS |
| Momsstängning först: köp väntar och nekas efter commit | PASS |
| Köp först: momsstängning väntar, därefter journal-/metadataassertion | FAIL – fel metadatafacit i hjälparen |
| Annan ägare kan köpa medan A:s köp är öppet | EJ KÖRT – sviten stoppade efter föregående fel |

I båda godkända paketfallen kontrollerades faktiska köp-/omklassificeringsjournaler, tre beständiga gruppmedlemmar, oförändrade tidigare journalrader och rätt antal transaktioner/event/idempotensposter. Omklassificeringen skapade ingen ny moms.

Det åttonde fallet bokade och stängde momsperioden, men testet kräver `vat_rate=0` på transaktionen med källa `vat_closing`. Den befintliga momsavslutsfunktionen skriver uttryckligen **NULL**, vilket också bekräftas i den sparade raden. KAN-62-migrationen ändrar inte denna funktion. Testhjälparen använder `vat_rate=rate`, vilket gör NULL mot 0 till ett assertionsfel.

Skrivskyddad kontroll av det felande fallet visar:

- Köp 2026-03-01: D5410 **1 000**, D2641 **250**, K1930 **1 250**, transaktionsmomssats **25**.
- Momsavslut 2026-03-31: D2650 **250**, K2641 **250**, belopp **250**, källa **vat_closing**, transaktionsmomssats **NULL**.
- Perioden är **closed**, closing_amount **−250**. Journaler, datum, ägare, verifikationsnummer och belopp stämmer. Fallet får ändå inte efterhandsmärkas PASS eftersom den förberedda automatiska assertionen föll.

## Ej färdigverifierat

- Full SQL-svit, särskilt resterande fullavdragsfall, kortliv i senare grupp, planer och andra år.
- Äldre payload-replay **efter** uppgradering/profiländring; äldre fixture skapades korrekt men replay-provet ligger efter SQL-avbrottet.
- RLS och nekade privata direktanrop under samtliga klientroller; katalogen är oförändrad och positiva bokningar kördes som authenticated, men detta ersätter inte de ännu okörda negativa roll-/RLS-proven.
- Deklarerad momsperiod, överlappande perioder och rättelsernas fulla negativa matris.
- Sista samtidighetsfallet för två olika ägare.

Inget kvarstående prov markeras PASS utifrån statiska kontroller eller ett annat lyckat prov.

## Bevarat slutläge och blockerare

Databasen är kvar med **9 syntetiska användare/profiler**, **11 inventarier**, **16 transaktioner**, **37 journalrader**, **15 inventarieevent**, **11 idempotensposter**, **2 grupper**, **2 momsperioder** och **2 stängda år**. **0 avskrivningskörningar** och **0 obalanserade verifikationer**. Inga testsessioner återstod vid slutkontrollen. Åtta nya användare från samtidighetssviten skapades; de två för sista okörda fallet skapades inte.

Blockerarna är två testfel, inte här bevisade bokföringsfel:

1. Bygg om den negativa legacy-fixturen så att rätt kontroll nås med giltigt övrigt underlag, exempelvis före tredje köpet. Behåll exakt förväntad felorsak; acceptera inte valfri 23514.
2. Anpassa momsavslutsprovets förväntade metadata till den befintliga NULL-semantiken och använd en medveten NULL-säker jämförelse. Ändra inte produktfunktionen eller normalisera alla NULL till noll för att få grönt.

**Nästa steg för ledarbeslut:** avgränsad rättning/granskning av testunderlaget och ett nytt planerat körningsvarv som bevarar denna databas och dess tidigare bevis. Skapandeskriptet får inte köras om; befintlig databas och evidensfiler stoppar med avsikt återkörning. Nytt samtidighetsvarv behöver en egen körningsidentitet/artefaktplats och nya syntetiska fixtures; ingen reset/radering.

Produktkod, migrationer och förberedda testskript är oförändrade under körningen. Lokala installations-/läsverktyg och körbevis finns endast i ignorerad coverage-katalog. Rapport och PROJECT_STATE.md har uppdaterats. Ingen commit, push, Jira-mutation eller deployment utförd. KAN-73/KAN-76 och tidigare releasebegränsningar kvarstår.

## Bevisplatser

- `coverage/kan62-local-db/approved-inputs.json`: alla migrationshashar och plattformsunderlag.
- `database-identity.json`, `maintenance-identity.json`, `fresh-unmarked-identity.json`: identitet och färsk bas.
- `base-installed.json`, `installed-migrations.json`, `migration-*.log`, `candidate-installed.json`: exakt installation.
- `legacy-fixture.json`, `candidate-preimage.json`, `candidate-postimage.json`: äldre bokning och före-/efterkatalog.
- `rollback-execution.log`: exakt SQL-avbrott.
- `concurrency-results.json`, `concurrency-execution.log`: 7 PASS/1 FAIL/1 ej kört.
- `final-read-only-evidence.json`: kvarvarande data, balanser, NULL-metadata, oförändrad äldre fixture/säkerhetskatalog och övriga databaser/roller.

## Exakt installerad ordning

1. `20260925000000_pre_kan17_cli_baseline.sql`
2. `20260925050113_20260925_add_vat_account_classification.sql`
3. `20260925070346_20260925_delegate_vat_concurrency_account.sql`
4. `20260925124023_delegate_vat_close_account_classification.sql`
5. `20260926132107_add_2645_vat_account_classification.sql`
6. `20260926174535_add_vat_v2_reverse_charge_booking.sql`
7. `20260927070224_add_vat_profile_runtime_fields.sql`
8. `20260927151231_add_payment_account_roles.sql`
9. `20260927174627_harden_payment_account_roles_acl.sql`
10. `20260928193000_add_vat_declaration_submission_date.sql`
11. `20260929101500_add_vat_lifecycle_source_taxonomy.sql`
12. `20260929143000_add_vat_settlement_foundation.sql`
13. `20260929183000_add_tax_account_movement.sql`
14. `20260930120000_audit1_p0_vat_lifecycle_semantics.sql`
15. `20260930163000_kan30_delete_user_data_vat_lifecycle.sql`
16. `20260930190000_kan31_idempotency_replay.sql`
17. `20261001060000_kan31_vat_v2_idempotency_acl_fix.sql`
18. `20261001120000_kan33_account_balance_rpcs.sql`
19. `20261004152057_kan38_vat_v2_payment_role_enforcement.sql`
20. `20261005105538_kan42_close_year_ne_guard.sql`
21. `20261005193000_kan46_customer_invoice_lifecycle.sql`
22. `20261005203000_ensure_attachments_storage_bucket.sql`
23. `20261005210000_fix_customer_invoice_year_end_scope.sql`
24. `20261005213000_allow_customer_invoice_controlled_reversal.sql`
25. `20261006120000_kan14_vat_v2_no_deduction.sql`
26. `20261006143000_add_profile_vat_number.sql`
27. `20261007110000_kan51_historical_customer_invoice_linkage.sql`
28. `20261007130000_kan22_vat_v2_business_facts.sql`
29. `20261007160000_kan36_fixed_assets.sql`
30. `20261008110000_kan36_redirect_manual_equipment_purchases.sql`
31. `20261008170000_kan54_fixed_asset_vat_deduction_guard.sql`
32. `20261008173000_kan54_revoke_internal_delegate_service_role.sql`
33. `20261008175927_kan55_purchase_input_vat_deduction.sql`
34. `20261009203900_kan56_kan57_db_regression_repair.sql`
35. `20261009220552_kan56_customer_invoice_booking_delete_context.sql`
36. `20261012123000_kan62_fixed_asset_gross_vat_rate.sql`
37. `20261012153000_kan62_fixed_asset_group_locking.sql`
38. `20261013103000_kan63_customer_invoice_vat_guard.sql`
39. `20261014100000_kan72_standard_booking_integrity.sql`
40. `20261014123000_kan72_journal_user_ver_index.sql`
41. `20261014162850_kan71_sie_undo_vat_period_guard.sql`
42. `20261014171038_kan71_sie_correction_period_guard.sql`
43. `20261014174218_kan71_legacy_sie_correction_history_guard.sql`
44. `20261015115900_kan74_sie_verified_inputs.sql`
45. `20261015120000_kan74_sie_opening_balance_guard.sql`
46. `20261015121000_kan74_sie_receipt_deletion.sql`
47. `20261015180458_kan84_explicit_first_vat_year_period.sql`
48. `20261017122027_kan88_ne_sales_classification.sql`
49. `20261017164431_kan89_category_visibility.sql`
50. `20261017190000_kan80_standard_booking_idempotency.sql`
51. `20261018190000_kan93_ne_equity_transfers.sql`
52. `20261019120000_kan75_year_close_concurrency.sql`
53. `20261019200000_kan97_withdrawal_assessments.sql`
54. `20261020130000_kan97_withdrawal_invoice_context.sql`
55. `20261020233000_kan62_rule_contract.sql`
