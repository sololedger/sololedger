# SoloLedger Project State

2026-10-26 – KAN-112 endast i Staging; hosted avvikelse återstår.

## Aktuellt uppdrag och arbetskopia

- KAN-112: Pontus godkände exakt 91233be, migration och delete-user för Staging.
- Kopia: audit-packages/KAN-100-app-release-20261024.
- Gren: codex/KAN-112-year-end-checklist. Origin är lokal KAN-62-kopia, inte GitHub.
- Produktbas: 6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e.
- Publicerad produkt: 91233be3a7da0887d4821583b96f54e847c54844.
- Senare checkpoint innehåller endast denna state och Staging-rapporten lokalt.
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

## Kvarstående avvikelse – inte redo för slutlig acceptans

- Samtidiga hosted sparbegäran: en lyckas, konkurrenten får timeout i stället
  för snabbt konfliktbesked. API-test 30 s; produktklient avbryter efter 25 s.
- Två faktiska browserflikar: en revision, ingen överskrivning/falsk sparad-status;
  Läs om återställer båda. UX-avvikelsen kvarstår ändå.
- SQLSTATE 40001 används för konflikt. Exakt timeoutorsak är inte fastställd.
  Ingen rättning eller ny migration har implementerats.
- Namnbyte ändrar documents/vat/statements/tax. Moms/skattevarning är onödigt bred.
  Svar bevaras och bank påverkas inte. Första profiltestet skrev samma namn och
  är ogiltigförklarat; nytt test verifierade faktisk ändring och dessa fyra värden.
- Äldre test:db-invariants-fel Unexpected close-year delegate transformation finns
  även på oförändrad bas och är separat. Ingen generell rättning ingår.
- KAN-113 årslås-Bug separat; inga tester av pågående/framtida årslås här.
- FAQ/KAN-102, NE-historik/KAN-109 och bokförings-/moms-/årslåslogik oförändrade.

## Dokumentation och nästa säkra steg

- Rapport: docs/reviews/KAN-112-STAGING-ACCEPTANCE-20261026.md.
- Lokalrapport: docs/reviews/KAN-112-LOCAL-IMPLEMENTATION-20261026.md.
- Bevis/testverktyg i root/audit-packages/KAN-112-staging-20261026/.
- Lokal open-staging-review.ps1 där öppnar syntetiskt A, Årsavslut 2025.
- Hemligheter endast i redan ignorerade lokala auth-/konfigurationsfiler.
- Pontus kan granska UI nu. Nästa beslut: avgränsad lokal rättning av hosted
  konfliktvägen och profilfältens varningsavgränsning, ny migration vid behov,
  omtest och ny exakt kandidat före push.
  Ändra inte installerad migrationsfil. Ingen ytterligare publicering utförd.
- Ingen Production-release godkänd. KAN-112 har inte satts Done/annan status.
