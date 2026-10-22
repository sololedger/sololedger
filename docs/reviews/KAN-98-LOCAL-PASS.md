# KAN-98 — LOCAL PASS, 2026-10-22

Komplettering: releasegranskningen fann ett stopp i Säkert uttag för supplier_invoice.
Det är lokalt rättat och riktat verifierat i checkpointen som innehåller
[KAN-98-withdrawal-integration-fix.md](KAN-98-withdrawal-integration-fix.md).
Denna rapport beskriver ursprungliga bevis; ny exakt kandidat omfattar även rättningen.

Lokal implementation och verifiering är klara inom avgränsad omfattning. Jira är In Review,
tilldelad Pontus (återkontrollerat vid slutkontrollen). Rekommendation: redo för kontrollerad
Staging-acceptans efter separat godkännande, inte för Production.

## Kandidat och funktion

Produktkopia: audit-packages/KAN-62-rule-contract-local. Gren codex/KAN-98-supplier-year-end,
bas 3e7aa0c85aabdb624b687f48f0662278de217242. Root är endast dokumentations-/verktygskedja.
Checkpointen som innehåller denna rapport är den lokala implementationskandidaten.

Bokslutsskulder ger en liten separat svensk guide: registrering och bokning sker atomiskt,
sedan full betalning från samma fakturapost. Fakturaidentitet, datum, momsbeslut, underlag,
status och journalhändelser sparas. Ingen fristående utkastfunktion eller full leverantörsmodul.
KAN-99 kan återanvända lästjänsten och skuldlistan; hela årsavslutsguiden är inte byggd här.

Exempel svensk faktura 1 250 kr inklusive 25 procent fullt avdragsgill moms:

- 2026-12-31: D kostnad 1 000, D2641 250, K2440 1 250.
- Januari 2027: D2440 1 250, K1930 1 250; ingen ny kostnad eller moms.
- Utgående 2440 förs vidare i befintlig kumulativ balans. Betalningen ändrar inte låst 2026.
- Ångrad betalning respektive avbruten bokslutsskuld ger signerad motbokning på originaldatum;
  berörda år/momsperioder måste vara öppna. Ingen mutation av bokförd historik.

Ny migration: supabase/migrations/20261022120000_kan98_supplier_year_end.sql.
SHA256: 60ea50ce6deed41f80b90d846d7ad76f9f977365d06eeec4c3a64b8f3e79786c.
Två användarägda tabeller, explicita minsta grants/RLS, atomär RPC, lås och kvitton för
säkra återförsök/samtidighet. supplier_invoice klassificeras uttryckligen för moms och historik.
Ordinarie bokföringsmotor/resultat-/NE-/IB-formler återanvänds. Raderingsgränsen och
administrativa räknare omfattar båda tabellerna; privat gammal raderingsfunktion saknar API-exekvering.

## Befintliga testbevis — inga omkörningar vid slutkontrollen

Bevis sparade i ../testing/kan98-local-2026/evidence/ med SHA256-manifest:

| Kontroll | Resultat |
| --- | --- |
| Lokal DB/RPC | PASS 32 kontroller, db-test.log och db-result.json |
| Rapporter/moms/NE/dashboard | PASS 42 kombinationer |
| Faktisk läs-/skrivtjänst | PASS 1 001 fakturor, sidindelning och granskningskedja |
| Faktisk React/Playwright-panel | PASS 16 kontroller, desktop/mobil |
| Slutlig Home-integration | PASS desktop/mobil även vid globalt inläsningsfel |
| Säker regressionssvit | PASS, regression.log; publik smoke 2/2 |
| Typecheck, riktad ESLint, Next-produktionsbygge | PASS; build.log |
| Admin delete dry-run, DB invariants, lokal lifecycle-postcheck | PASS |

DB-provet omfattade exakta journaler, moms/ej avdrag/momsfritt, årslås och ingående balans,
replay och ändrat payload, dubbletter, verkliga samtidiga sessioner, bokning mot årslås i båda
ordningsföljderna, rättelse/återbetalning, ägarisolering/grants/anon och raderingskedja.
Befintliga ägares sex datadomäner var oförändrade enligt före-/efterfingeravtryck.
Endast identifierad syntetisk lokal DB sololedger_kan62_disposable_20261021,
127.0.0.1:5432/OID57199 användes för skrivningar. Tidigare fixtures bevarades.

Hel regression blev grön före sista avgränsade Home-återhämtningskompletteringen. Därefter
kördes berörda Home-prov, nya leverantörsprov, typer, riktad lint och slutbygge grönt igen.
Den sista riktade Home-körningen är observerat terminalbevis, inte en separat sparad logg.
Full repo-lint påstås inte grön. Bygget använde syntetisk servernyckel, verifierar inte Stripe-runtime.

## Granskning och begränsningar

Adversarial kontroll fann och rättade ofullständig journalinläsning för den nya momskällan
samt att globalt rapportfel kunde dölja ett osäkert återförsök. Riktade regressioner är gröna.
Inga kända blockerande fel återstår inom testad omfattning; hosted acceptans återstår.

Första versionen: svensk SEK, helt obetald, en senare helbetalning, styrkt full/ingen avdragsrätt,
0/6/12/25 procent moms och avgränsade kostnadskategorier. Företagsbankrollen måste vara 1930.
Kredit, delbetalning, utland, inventarier och osäkra momsfall stoppas. Unik aktiv fakturaidentitet
är konservativ även mellan år. Externa/manuellt bokförda dubbletter och underlagets fullständighet
måste användaren kontrollera; guiden påstår inte automatisk fullständighetskontroll.

Faktisk momsperiodstängning provades för avslutat 2025: -250, oföränderligt underlag,
säker replay och senare momsfri betalning PASS. Framtidsspärren stoppade korrekt stängning av
2026 i oktober. Faktisk momsavslutning 2026, deklaration/NE-inlämning och hosted årsavslut
är inte verifierade. Lokal faktisk årslåskedja och rapportpåverkan är däremot testade.

## Nästa säkra steg

Separat godkännande krävs för exakt kandidat till Staging: app, endast denna nya migration
och Edge delete-user-räknaren. Kontrollera aktuella live-förutsättningar och använd officiellt
CLI-flöde med samma migrationsidentitet; kör inte gamla migrationskedjor eller root som release.
Verifiera därefter dedikerad Staging-användare via riktiga Auth/RPC-anrop, guide/underlag,
journal, momsrapport, NE/B15, dashboard, IB, låst 2026 och betalning 2027 samt säkra återförsök.
Bevara tidigare Bokio-/inventarieunderlag och konton. Ingen reset.
Ingen Staging-/Production-migration, push eller deployment har utförts i KAN-98.
