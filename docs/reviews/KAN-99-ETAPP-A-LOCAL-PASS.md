# KAN-99 Etapp A – LOCAL PASS

2026-10-22. **Redo för separat Staging-granskning/publiceringsbeslut**, inte publicerad.
Endast godkänd Etapp A levererad. Etapp B/C och fullständig årsavslutsacceptans återstår.
Bas **53b9c828eed71d0be17043e4aaf7b95d99d0ad35**, gren **codex/KAN-99-year-end-guide**.
Exakt lokal kandidat anges av Git-checkpointen (git log -1); ingen root-historik ingår.
Jira **KAN-99 In Review / Pontus**, verifierad övergång efter gröna relevanta kontroller; inte Done.

## Implementerat och avgränsat

- Meny **Årsavslut**, åtta öppningsbara kontroller under fem begripliga rubriker.
  Varje kontroll visar varför, HUR/jämförelse, systemets gräns, felväg och när användaren utfört kontrollen.
- Korrekt företag/år, neutral saknad-namntext, förberedelsebesked för pågående/framtida kalenderår,
  och bara redan känd årslåsstatus. Stockholmstid, SSR-säkert kalenderbesked.
- Navigation till Bokföring, Profil, Fakturor, Bokslutsskulder, Inventarier, Moms och NE-Bilaga;
  återgångsknapp i oförändrad ägar-/års-/profilkontext. Ägar-/årsbyte stänger öppnade instruktioner
  och ogiltigförklarar återgångsinformation, även A→B→A. Ingen sparad progress.
- Laddningsfel döljer gammalt låsbesked; instruktionerna går fortfarande att läsa. Befintliga
  vyers datagränser och behörigheter bevaras. Saknad profil hanteras av befintlig Auth-gräns.
- Fem skilda tillstånd: bokföringsår låst, momsperiod stängd, moms deklarerad, moms avräknad/betald,
  inkomstdeklaration inskickad. Inga automatiska gröna klarstatusar, procent eller komplett-intyg.
- Ingen ny bokföring, DB/RPC/migration, bankavstämningsmotor/import, PDF, låsknapp eller ändrat årslås.
  Guiden importerar bara React; inga nätverks-/lagrings-/skrivfunktioner. Ingen extra ekonomisk motor.

**Befintlig begränsning korrekt anvisad:** Moms-vyn har egen periodväljare, inte guidens år.
Guiden säger därför att användaren väljer rätt period där. Moms kan enligt befintligt beteende
initiera perioder vid vyöppning; inga nya sådana anrop införs av guiden. Betalning/låsning görs
bara i befintliga vyer efter deras validering och bekräftelse. Inga låtsasfunktioner tillagda.

## Filer

Produkt: **src/components/YearEndGuide.tsx**, **src/components/Layout.tsx**, **src/app/page.tsx**.
Test: **scripts/test-year-end-guide.mjs**, **scripts/check-year-end-guide-lint.mjs**.
**package.json** lägger till test/lint-kommandon och kopplar guidetesterna till test:domain.
Ingen dependency- eller package-lock-ändring. Plan, denna rapport, state/archive och syntetiska bevis följer med.

## Verifiering och praktiska begränsningar

| Kontroll | Resultat |
| --- | --- |
| Verklig Home/Layout/guide, Chromium 1440 och 390 px | PASS, 8 kontrollgrupper, varje kontrolls instruktion och navigation |
| Ägare A→B→A, år 2026→2027→2026, historiskt år, profilnamn/saknad profil | PASS, inga tidigare företagsnamn/öppnade steg/returmarkörer i fel kontext |
| Laddning/fel med gammal låsflagga | PASS, tidigare låsbesked maskeras, läsbar guide |
| Guideöppning/expansion/navigation | PASS, inga skrivförsök, externanrop eller sparad progress i isolerat test |
| Typkontroll | PASS |
| Ny guide och båda nya testfiler, lint | PASS, 0 fel/varningar |
| Ändrade äldre Home/Layout, lint mot bas | PASS, inga nya fel; samma 10 + 1 tidigare fel, en tidigare varning |
| Helprojektets npm run lint | INTE GRÖN: 72 äldre fel/6 varningar, utanför scope; ej åtgärdade/dolda |
| Optimerat Next 16.2.6-bygge inklusive TypeScript/prerender | PASS, syntetiska processvariabler, ingen verklig Supabase/Stripe-nyckel |
| Säker regression: domän, historik, UI-round | PASS i ordinarie suite fram till lokal smoke-start |
| Ordinarie publika smoke-tester mot byggt lokalt exemplar | PASS 2/2, samma tests/e2e/public-auth.spec.ts |
| Säker regressions återstående kategori-/Home-bokningstester | PASS, inklusive KAN-98 replay efter laddningsfel |

Det ordinarie regression-startskriptet fick timeout när dev-servern skulle bli nåbar. Samma publika
smoke-tester kördes i stället med det verifierade bygget och server/test i samma lokala process,
utan någon produktkonfigurationsändring. Alla testdelar är gröna; den ursprungliga sammanhållna
kommandokörningen exit1 på infrastruktur kallas inte exit0. Inga domäntester kördes om för detta.
Typsnitt krävde läsande nätåtkomst vid bygge; serverrutternas modulinitialisering krävde syntetisk
servernyckel i processmiljön. Inga env-filer, skarpa nycklar eller tjänster kopierades.
Delar av de första körloggarna togs bort av Playwrights normala test-results-städning;
slutliga riktade bevis ligger därför separat i coverage och kopieras byteidentiskt till docs/testing.
Build/breda regressionsresultat stöds delvis av sessionens terminalutfall, inte av en komplett bevarad rålogg.

UI-prov använder **verklig Home/Layout/guide men syntetiska data/Auth och markörer för befintliga målpaneler**.
Det provar navigationen, inte en ny full ekonomisk integration eller riktig Supabase-inloggning.
Säkert uttag/bokning/moms/årslås ändrades inte. Ingen bokförings-E2E behövs för denna rent läsande etapp.
Visuell granskning av desktop/mobil visar fungerande gruppindelning och inga överbreddningar.
Etappens användartest med en verklig nybörjare kvarstår för Pontus, inga mänskliga acceptansresultat påstås.

## Pontus acceptans och nästa beslut

Efter separat Staging-publicering: välj rätt företag/2026, öppna Årsavslut på dator/mobil och följ
varje instruktion utan muntlig hjälp. Öppna respektive målvy och återgå; välj Moms-period uttryckligen.
Byt år och användare, kontrollera att instruktion/låsbesked/företagsnamn inte blandas ihop.
Kontrollera att förberedelser inte kan misstas för färdigt bokslut eller inskickad deklaration.
Ingen verklig bokning eller årslåsning krävs för denna Etapp A-acceptans.

Inget nytt produktfel/blockerande Etapp A-hinder identifierat. **Staging kräver nytt godkännande**
för exakt kandidat. Inga pushar, DB-skrivningar, migrationer eller deployer gjorda.
B/C-idéer är oförändrade: faktiska aggregatkontroller, attesteringsdesign, slutlig låsbekräftelse
och boksluts-/deklarationsutgång/flerårsacceptans. De är inte implementerade eller godkända här.
