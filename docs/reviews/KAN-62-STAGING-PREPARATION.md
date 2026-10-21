# KAN-62 – Staging-förberedelse 2026-10-21

**LOCAL PASS kvarstår. Förberedd för avgränsad Staging-verifiering, ingen extern publicering godkänd eller utförd.** Det tidigare fullständiga lokala SQL-kvittot och dess historiska FAIL-bevis är bevarade. Den här rapporten ersätter deras gamla uppgifter om nästa steg, inte deras daterade resultat.

## Verifierad releasegrund

- GitHub `main`: `d4320f5d6524216948904e0e58cae3a30ddd76fa`, samma som KAN-62-kandidatens bas. Production-aliaset pekar på Vercel `dpl_4axRc8RXNvcLoyna8HVbrccA9VFy`, READY, main, exakt denna SHA.
- GitHub `staging`: `d57161756fec9999094b1e068db2a1e9cde22b2b`. KAN-62:s tre produktfiler i denna trädbild är identiska med main: gamla exklusivebelopp/fritt momsbelopp. Gamla KAN-62/65-commits finns i grenens historik men bevisar inte att deras klientkod finns i dagens trädbild.
- Staging saknar en redan Production-levererad produktcommit: `d4320f5` (KAN-105). Den måste bevaras i nästa integration så att auth-fokusfixen inte går förlorad. Ingen annan ny produktfunktion hämtas från äldre inventariegrenar.
- Ordinarie Staging-alias visar ännu `fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0`, KAN-80 Preview `dpl_9nEEL8RQkRqWumceFbB6FavB4FZF`; det bevisar varken GitHub-staging eller denna kandidat. Senaste integrations-Preview för d571617 är READY, men staging-grenens egen byggning är CANCELED.
- Vercels ignoreringsregel avbryter fortfarande byggen för `staging`. Återöppning kräver uttryckligt godkännande; ingen inställning ändrad.

## Databas och exakt migrationsurval

Färsk läsning med TLS, `default_transaction_read_only=on`, samma backend-session och enbart katalog/ledger:

| Miljö | Installerat | Senaste version | KAN-62 |
| --- | --- | --- | --- |
| Production wbaxmuvudpnkvuliicuy | 52 | 20261020130000 | Saknar de två äldre KAN-62-versionerna och nya kandidaten. |
| Staging fzxqiqenqjzhlyxxpvhg | 54 | 20261020130000 | Har 20261012123000 gross_vat_rate och 20261012153000 group_locking. |

**Tillför endast `20261020233000_kan62_rule_contract.sql` i Staging.** SHA-256: `b5f54425b4a356a416ca1b0f362daf264ded3a6286ec7e546d03688d5950cfd4`. Samtliga 55 lokala filhashar matchar fryst manifest; inga tidigare migrationsfiler ändrade. Den nya filen byter endast privat anskaffningsfunktion och bibehåller dess privata ACL. Inga tabell-/datamigreringar eller backfills.

Stagings privata funktionskropp matchar exakt den historiska group_locking-filen. Normaliserat för CRLF/LF är detta enda funktionella kroppsskillnaden mellan lästa Production/Staging-funktioner. Offentliga wrappern är identisk. Den äldre, separata skillnaden i get_next_ver_nr:s PUBLIC/anon-rättigheter kvarstår och ändras inte här.

Historiska KAN-17-statementpaketeringar och KAN-54-revoke ska inte repareras eller återspelas. Vid kommande godkända körning: använd officiellt CLI-flöde med exakt version, granska dry-run och stoppa om något annat än 20261020233000 föreslås. Aldrig include-all, baseline eller lokal nyinstallation mot hosted Staging. Production-migrationsurval är ett senare separat beslut.

## Klient/RPC och behörighetsgräns

- Klienten skickar `gross_amount`, `vat_rate`, `booking_contract_version=kan62-rule-contract-v1` samt exakt förväntat gränsbelopp, tidigare medlems-ID:n och omklassningsbelopp.
- Privat funktion räknar om fakturamoms/netto, kontrollerar avdrag, låser underlaget och jämför alla förväntade värden. Strikt mindre-värde-prövning sker exklusive fakturamoms; bokfört värde inkluderar ej avdragsgill moms. Förhandsvisning, kortliv och successiva grupper är testade tillsammans.
- Publik ingång behåller auth.uid, KAN-75-grind, payload-/idempotensvalidering och KAN-54-profilkontroll. Privat funktion får bara köras av postgres; authenticated/anon/service_role saknar direkt EXECUTE. Ägartabeller har authenticated SELECT genom auth.uid=user_id, inga direkta klientskrivningar. Inga nya anropsvägar.
- Gamla exakta idempotenspayloads returnerar sitt tidigare kvitto före nytt kontraktskrav. Nya bokningar från gammal klient stoppas efter uppgraderingen. De får inte skickas till gammal RPC från nya klienten: den äldre servern saknar det nya regelkontraktet.
- Säker ordning efter godkännande: håll inventarieacceptansen pausad, applicera endast nya migrationen, verifiera definition/ACL/ledger, publicera matchande klient, invänta READY och kontrollera rätt alias/SHA. Ladda om klienten innan syntetiska acceptansköp. Ingen generell användning under mellanläget.

## Lokala kontroller

- Tidigare full SQL-regression PASS: 59 lyckade klientanrop, 114 negativa prov med exakt felorsak, faktiska journalrader/balanser, äldre replay, RLS under verkliga klientroller, stängda/deklarerade perioder. Samtidighet **9/9 PASS**, inklusive verklig moms- och årsstängning. Ingen produkt-/migrationsändring efter dessa prov.
- Återkontrollerat inför release: 55/55 hashkontroller, offline körvakt, DB-invarianter och riktad ESLint utan varningar PASS.
- **Fullständigt standardbygge Next 16.2.6/Turbopack PASS**, inklusive TypeScript, siddata och 8/8 statiska sidor. Därefter publik Playwright mot det faktiskt byggda programmet: **2/2 PASS**.
- Bygget använde syntetisk localhost-Supabase och syntetiska nycklar. Första försöket kompilerade men saknade servernyckel för webhook-modulens start; omkörningen passerade med syntetiskt värde. Inga riktiga credentials/miljöfiler användes. Ingen produkt-, Next-konfigurations- eller dependencyändring behövdes. Varning om flera lokala lockfiler kvarstår.
- Tidigare dev/PostCSS-krasch är ett bevarat miljöfynd; den återkom inte i standardbygget. Det är inget påstått generellt felavhjälpande för Next dev. Hosted build och Supabase Auth/JWT/HTTP kräver fortfarande nästa verifieringssteg.
- Lokal DB/data och samtliga tidigare bevis orörda i denna förberedelse. Ingen ny skrivande databassvit behövdes när produkt-/migrationsinnehållet var oförändrat.

## Releaseurval och kvarvarande acceptans

Produktcheckpoint: **ca42545295baeb0ea461c8e44310a3e8290a5a85**, ovanpå d4320f5. Tre produktfiler (`FixedAssetsPanel.tsx`, `fixedAssets.ts`, `accountingService.ts`), package-testkoppling, riktade tester/körvakter, en ny migration och daterade KAN-62-granskningsunderlag. Separat dokumentationscheckpoint uppdaterar AGENTS, PROJECT_STATE och denna plan. Exakta filnamn finns i git show; inga dependency-/lockfil-/env-/baselineändringar.

Lokal integration förbereds på `codex/KAN-62-staging-preparation` från verifierad github/staging, med kandidatens exakta commitkedja. Produktionskodens slutträd ska matcha kandidatgrenen, inklusive redan levererad KAN-105. Exakt publicerings-SHA och lokal merge anges i PROJECT_STATE/slutrapport. Ingen gammal KAN-62/65-gren eller Desktop-staging-kedja ska publiceras separat.

**KAN-73 och KAN-76 är fortfarande To Do / High, återlästa i Jira.** Den första gäller fixed_asset/2641 i momsrapport/dashboard; den andra senare anskaffning efter avskrivning. Inget av dem rättas av KAN-62. De blockerar generell inventarie-/Production-acceptans. Inga EU-varor, obetalda fakturor, allmän aktivering, returer eller fleråriga avskrivningar accepteras här.

Efter uttryckligt godkännande av publicering, exakt migration och syntetiska Staging-skrivprov: kontrollera representativt köp utan/fullt momsavdrag, gränser/kortliv, tre paketdelar och separat omklassning, ursprungsjournaler, replay/rättelsespärr, rapportmoms/NE/resultat/dashboard och betalningskonto. Dokumentera KAN-73:s rapportavvikelse som kvarvarande fel, aldrig som PASS. Endast syntetiska användare; Jessikas bokföring berörs inte.

Nästa beslut ska omfatta **exakt lokalt release-SHA → staging**, enbart migration **20261020233000**, återöppning av Vercels staging-byggspärr samt avgränsade syntetiska Staging-acceptansprov. Ingen Production-release ingår. Ingen push, hosted migration, deployment, Jira-mutation eller ändring av riktiga användardata är utförd.

Läsbevis och byggloggar: ignorerade `coverage/kan62-local-db/staging-prep-*`. Äldre testbevis/identitetsmanifest bevaras där; inga credentials i rapporten.
