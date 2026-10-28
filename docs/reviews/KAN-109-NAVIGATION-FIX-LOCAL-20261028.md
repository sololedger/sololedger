# KAN-109 – riktad lokal navigeringskorrigering

2026-10-28. Uttryckligt GO för lokal implementation och riktad verifiering, STOP före commit. Produktkopia L, gren `codex/KAN-109-ne-ux`, oförändrad HEAD `0c35b43067b7864f52f3216cefeebfb8e93cfd75`. Staging innehåller fortfarande denna äldre checkpoint, inte den ocommittade korrigeringen.

## Fel och minsta ändring

Läsande Staging-reproduktion bekräftade NE → Årsavslut → tillbaka till NE, följt av en ny motsatt återväg. Den återvägen följde med till Inventarier, Bokföring och vid browserhistorik även Hjälp & FAQ. Det var en avslutbar extra återresa, inte en oändlig loop. Berörda navigeringsfunktioner, knappvillkor och hjälphistorik var identiska med Production-basen f2dbd60; felet är äldre än KAN-109.

Endast två produktfiler ändras:

- `src/app/page.tsx`: separat återgång till NE återställer guidens läsposition och konsumerar besöket utan en ny Årsavslut-återväg. En stabil callback avslutar tillfälliga guidebesök vid huvudmenynavigation och vid Hjälpens befintliga hantering av bakåt/framåt. Hjälpens URL-/historik-/återvägsmodell ändras inte. Huvudmenyn skiljs från relaterade arbetslänkar: Inventarier → betalningskonton i Profil behåller en legitim Årsavslut-återväg.
- `src/components/YearEndGuide.tsx`: Tillbaka till NE-guiden anropar den separata återgången. Vanliga arbetslänkar använder fortsatt den befintliga besöks-/återställningsfunktionen.

`scripts/test-year-end-guide.mjs` utökas i befintlig regressionssvit; inga nya paket eller körkommandon. Riktiga Home, Layout, YearEndGuide, NEDeclarationGuide, NESectionNavigation, FAQ och hjälpnavigering används. Övriga ekonomiska paneler/transportgränser är syntetiska. Externa anrop nekas och navigationen verifieras utan sparade checklistesvar. Testet fick samma bildkomponentersättning som den befintliga hjälpsviten samt väntan på färdig appstart.

## Verifiering

- **Reproduktion före produktändring:** nytt regressionstest FAIL vid kravet att den motsatta Årsavslut-knappen ska saknas efter återgång till NE.
- **Återvägs-/årsavslutsprov PASS vid 1440/1024/768/390/320 px:** NE-retur utan motsatt knapp; återställd öppen guide/instruktion; huvudmenyn avslutar både NE- och Årsavslut-besök; legitim Inventarier-retur återställer kontrollpunkt; Inventarier → Profil behåller besöket; bakåt/framåt via riktiga hjälphistoriken rensar guidebesök men bevarar Hjälpens egen återväg. Befintliga årsavslutsprov för Profil, Fakturor, Bokslutsskulder, Inventarier, Moms, NE, årbyte, ägarbyte, läsfel, osäkert sparutfall, fokus och mobilscroll passerar också.
- **NE-UX PASS:** 70 före/efter-fall vid fem bredder, samma belopp/årslås, alla kontrollgrupper, arkiv/omförsök/ägarbyte och sena svar. Skyddade ekonomiska filer, hooks, DB-historik och KAN-107-komponenter jämförs bytevis mot fast f2dbd60-bas.
- **Befintliga NE-guide-, arkivklient-, Hjälp-browser- och uttags-browserprov PASS.** Hjälpens innehållstest, årslåsdatum och checklistans modell-/klientprov PASS.
- **Slutlig typecheck PASS**, exit 0.
- **Kompletterande slutprov PASS:** den slutliga testfilen kördes även separat vid 1440 px med en extra direkt Årsavslut → Bokföring → tillbaka-kontroll. Årsavslutets autentiseringsprov, annual-tax och withdrawal-domänprov passerade. Den extra Bokföring-raden lades till efter fem-breddskörningen; fem-breddsresultatet påstås inte omfatta just den raden.
- **Riktad lint:** YearEndGuide och testskript 0 fel/0 varningar. Page har 10 fel/1 varning jämfört med 9/1 i HEAD. Den ytterligare anmärkningen gäller `react-hooks/purity` på den oförändrade prenumerationsraden med `Date.now()`. Maskinell jämförelse verifierar identisk källrad i HEAD; inga anmärkningar pekar på den införda navigeringskoden. Lint är därför inte helt grön. Prenumerationslogik eller lintregler ändras inte för att dölja detta.

Slutloggar finns under `coverage/kan109-navigation-final-*`, typecheck i `coverage/kan109-navigation-typecheck.log`, lintjämförelse i `coverage/kan109-navigation-lint.json`. Ett inledande NE-fokusprov misslyckades; det enda avgränsade omprovet, kört sekventiellt, passerade. Orsaken är inte fastställd. Inledande lokala processproblem löstes genom befintlig Playwright-installation och testisolering, utan installation eller miljöfilsändring.

Ingen ny bred full regression, Next-build, liveverifiering av korrigeringen, fysisk mobil eller riktig skärmläsare påstås. Ingen ekonomisk integrations-E2E behövs för denna avgränsade navigeringsändring: belopp, journal-/moms-/NE-modeller, RPC/API/RLS, bokning, arkivkommandon/export, låsning och rättelser ändras inte. Befintlig NE-ekvivalens och relevanta klientprov används för att skydda dessa gränser.

## Granskningsläge

Produkt-/provdiff omfattar exakt de tre filerna ovan. Därtill denna nya rapport och aktuella notiser i L:s och rootens PROJECT_STATE.md. Äldre dirty PROJECT_ARCHIVE.md, övriga STATE-ändringar, rapporter, prototyper, fixtures och ignorerat lokalt material bevaras. Ingen AGENTS- eller ARCHIVE-ändring i detta uppdrag. Aktiv KAN-109 arkiveras inte.

Ingen commit, push, merge, deployment, databasändring, migration, miljövariabeländring eller Jira-mutation. Syntetiska prov lagrar endast i process-/browserminne. Nästa steg: Pontus/projektledarens granskning av den lokala diffen inklusive lintbegränsningen, därefter separat beslut. Ingen ny publiceringskandidat är godkänd.

## Slutkontroll och godkänd lokal checkpoint

Pontus har därefter principiellt godkänt navigeringskorrigeringen och uttryckligen godkänt en lokal checkpoint om lintkontrollen inte visar en faktisk regression. Tidigare STOP före commit ovan är historiskt; STOP före push/publicering gäller fortfarande.

Kort, kontrollerad lintjämförelse med samma installerade ESLint och samma filväg:

| Källtext, endast i minnet | Fel/varningar | Date.now-diagnostik |
|---|---|---|
| Godkänd bas 0c35b43 | 9/1 | Nej |
| Lokal navigeringskorrigering | 10/1 | Ja |
| Lokal korrigering med enbart gamla Årsavslut-returgrenen återinsatt | 9/1 | Nej |
| Basen med enbart gamla Årsavslut-returgrenen borttagen | 10/1 | Ja |

Att ändra enbart Layout-callbacken eller återställa hjälphookens direkta setter gav inte denna skillnad. Det isolerade utfallet visar att diagnostiken beror på analysen av den tidigare kontrollflödesgrenen i `setActiveTab`, inte på ändrad prenumerationskod. Den interna orsaken i React Compilers analys är inte felsökt vidare. Samma befintliga `Date.now()`-anrop körs fortsatt under rendering, med identiskt prenumerationsvillkor och utan nya anrop till prenumerationsberäkningen. Anmärkningen är ett tidigare befintligt renhetsproblem som nu exponeras, inte en ny funktionsregression från navigeringsfixen. Prenumerationslogik och lintregler lämnas orörda.

Sanerad lokal evidens: `coverage/kan109-navigation-lint-cause.json` och `coverage/kan109-navigation-lint-trigger.json`. Inga försöksvarianter skrevs till produktfiler. Inga browserprov kördes om eftersom kod/prov inte ändrades efter den redovisade verifieringen. Läs `KAN-109-NAVIGATION-CHECKPOINT-20261028.md` för exakt commitomfattning och nästa säkra steg.
