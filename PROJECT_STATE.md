# SoloLedger Project State

2026-10-26 – KAN-112 två avvikelser rättade lokalt; PASS lokal / BLOCKED hosted.

## Aktuellt uppdrag och arbetskopia

- KAN-112: Pontus godkände lokal rättning av samtidighet och för bred namnvarning.
- Ny produktkandidat: bf845c21955552a4bfb26e67cd45c189064663fa, endast lokal.
- Kopia: audit-packages/KAN-100-app-release-20261024.
- Gren: codex/KAN-112-year-end-checklist. Origin är lokal KAN-62-kopia, inte GitHub.
- Produktbas: 6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e.
- Publicerad produkt: 91233be3a7da0887d4821583b96f54e847c54844.
- Senare checkpoint innehåller endast denna state och den nya lokalrapporten.
- Root och andra grenars tidigare ändringar/fixtures är bevarade.

## Installerat i Staging

- Supabase fzxqiqenqjzhlyxxpvhg, verifierad TLS/session och historik/preimage.
- Enda nya migration: 20261026092741_kan112_year_end_checklist.sql.
- SHA256: 4ee37317959b7b68758f98776c347a646c62ca43e7ce5ac84c18c7e3fa4c64a5.
- delete-user ACTIVE version 9; återläst källa matchar godkänd kandidat.
- Vercel dpl_B57GSjy4zNjp3xTfdu9rJ27AHo4P, READY, Preview/staging, exakt 91233be.
- https://sololedger-git-staging-sololedger1.vercel.app pekar nu på kandidaten.
- Alias korrigerades från äldre 6ad27f1-deployment; alla andra alias bevarade.
- Push med explicit GitHub-URL och endast SHA:refs/heads/staging.
- GitHub main oförändrad 6ad27f1; ingen Production-operation eller Jira-mutation.

## Verifierat hosted

- Markera/avmarkera, autospara, omladdning, ny inloggning/ny browserkontext.
- Två användare/år, egen SELECT/RLS, nekad anon/direkt tabellskrivning.
- Förlorad sparrespons: tydligt fel, ingen falsk Sparat, replay en revision.
- Snabba klick ger en begäran. Manuella svar kan ändras i historiskt låst 2024.
- Verklig syntetisk bokning ändrar bankunderlag, svar kvar, omkontroll fungerar.
- Obokförd kundfaktura påverkar bara customers/next_year; ingen bankvarning.
- Faktiskt profilnamnsbyte ger för bred påverkan, se avvikelse. Fakturanamn ej separat klart.
- Dator 1440/mobil 390, fyra delar/elva punkter, navigation/tillbaka, inget sidöverflöde.
- Edge v9: dry-run räknar checklistan, vanlig användare nekas, syntetiskt D raderat
  inklusive Auth/profil/checklista; inga rester. A/B/C behålls syntetiska.
- Verklig app-server accepterar Staging-session och läser deklarationsindex.
- Före/efter: äldre tabeller, data/funktioner bevarade utom godkänd delete-wrapper.
- Tidigare lokal regression/12 DB-grupper finns i lokalrapport; inte nykörda här.

## Ursprungliga Staging-avvikelser – ännu inte omtestade hosted

- Samtidiga hosted sparbegäran: en lyckas, konkurrenten får timeout i stället
  för snabbt konfliktbesked. API-test 30 s; produktklient avbryter efter 25 s.
- Två faktiska browserflikar: en revision, ingen överskrivning/falsk sparad-status;
  Läs om återställer båda. UX-avvikelsen kvarstår ändå.
- SQLSTATE 40001 triggar PostgREST-transaktionsretry vid avsiktlig konflikt.
  Grundorsak verifierad i kod/reproduktion och Supabases dokumentation.
- Namnbyte ändrar documents/vat/statements/tax. Moms/skattevarning är onödigt bred.
  Svar bevaras och bank påverkas inte. Första profiltestet skrev samma namn och
  är ogiltigförklarat; nytt test verifierade faktisk ändring och dessa fyra värden.
- Äldre test:db-invariants-fel Unexpected close-year delegate transformation finns
  även på oförändrad bas och är separat. Ingen generell rättning ingår.
- KAN-113 årslås-Bug separat; inga tester av pågående/framtida årslås här.
- FAQ/KAN-102, NE-historik/KAN-109 och bokförings-/moms-/årslåslogik oförändrade.

## Ny lokal rättning och verifiering

- Ny migration 20261026110015_kan112_conflict_and_profile_scope.sql, inte fjärrkörd.
- SHA256 4d65559fe06bca24ce57cdbb65c8c6c2380c857598f1672d6b6abbb3f0fcaef1.
- PT409 för två avsiktliga konflikter. Samma ägar-/radlås, revision, replay och ACL.
- Klienten visar begriplig Läs om checklistan-text; äldre 40001 förstås också.
- Ekonomiskt profildigest utesluter endast företagsnamn; övriga fält oförändrade.
- Migration översätter bara bekräftelser vars gamla digest är aktuellt. Kryss/datum
  och request-id bevaras; revision ökar. Redan stale/okända bekräftelser lämnas kvar.
- 19 lokala rollback-DB-grupper PASS, inklusive före/efter-reproduktion, profilfält,
  verklig bokning/moms/faktura, bevarad ACL, replay och tidigare svar.
- Klient/store, hela säkra test:regression och offentlig smoke 2/2 PASS.
- Typecheck och riktad lint PASS efter Next-generering av skadad cachevalidator.
- Ingen persistent lokal migration, fjärrskrivning, deployment, push eller Jira-mutation.

## Dokumentation och nästa säkra steg

- Rapport: docs/reviews/KAN-112-STAGING-ACCEPTANCE-20261026.md.
- Ny rapport: docs/reviews/KAN-112-LOCAL-FIXES-20261026.md, exakt 6 produktfiler.
- Lokalrapport: docs/reviews/KAN-112-LOCAL-IMPLEMENTATION-20261026.md.
- Bevis/testverktyg i root/audit-packages/KAN-112-staging-20261026/.
- Lokal open-staging-review.ps1 där öppnar syntetiskt A, Årsavslut 2025.
- Hemligheter endast i redan ignorerade lokala auth-/konfigurationsfiler.
- Lokala bevis: coverage/kan112-fixes/. Hosted API-test förberett men inte kört:
  root/audit-packages/KAN-112-staging-20261026/fix-acceptance.mjs.
- Nästa beslut: godkänn exakt bf845c2 + nya migrationen/SHA för Staging, kontrollera
  ledger/preimage, installera endast nya migrationen, publicera exakt kandidaten.
  Edge v9 oförändrad. Testa två verkliga separata sessioner OCH browserflikar,
  snabb 409/omläsning, namn/relevanta fakta, isolering, nätverksfel och mobil.
- Stanna lokalt tills nytt godkännande. Inga korrigerade hosted resultat påstås.
- Ingen Production-release godkänd. KAN-112 har inte satts Done/annan status.
