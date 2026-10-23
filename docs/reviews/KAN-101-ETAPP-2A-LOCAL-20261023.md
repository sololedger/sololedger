# KAN-101 Etapp 2A – lokal femstegsguide

2026-10-23. Pontus godkände lokal implementation enligt `KAN-101-ETAPP-2-PLAN-20261022.md`. Produktbas **f7469a0cc4fbcaffc1b77bddf01a8947cbc5ec68**, ny arbetsgren **codex/KAN-101-declaration-guide** i `audit-packages/KAN-99-local`. Exakt slutcheckpoint i Git/slutrapport. Ingen push, deployment eller Jira-mutation.

## Levererat

- Öppningsbar guide i NE: gör bokslutsunderlaget klart; hitta/kontrollera beloppen; ta fram kompletteringar; fyll i hos Skatteverket; granska/signera/behåll underlagen.
- Fem korta steg med varför, konkreta handlingar, underlagens plats och åtgärd vid saknade/motstridiga uppgifter. Skattefrågorna är separata fördjupningar, inte en textvägg i grundvyn.
- Förklaringar för R15/R16, tidigare outnyttjat underskott/R24, tidigare egenavgiftsavdrag/R40/R41 och årets avdrag/R43. Fackorden förklaras med vanligt språk; ingen procentsats väljs eller summa räknas.
- Övriga vanliga frågor hänvisas till rätt officiell rutguide och konkreta kvitton/beslut/kapital- och fondunderlag. Ingen optimering eller egen beräkning av specialfall.
- SIE-instruktionen visas för alla i steg2, även när befintlig särskild varning saknas. R11 jämförs med externt bokslut; R17 följs genom anpassningarna till skattereglerna. Ingen extra resultatbokning eller påstådd KAN-96-fix.
- Årsavslutets sista kontroll har ingång till NE-guiden. Guidens knapp tillbaka till Årsavslut återanvänder den befintliga återgången när besöket kom därifrån; vanlig NE-navigation återupplivar inte ett äldre besök.
- Företag och inkomstår visas. Guidens öppna detaljer återställs vid ägar-/års-/namnbyte och när rapporten försvinner/laddas om. Home:s befintliga laddnings-/profilgränser och kontextbundna återgång bevaras.
- Inga inmatningsfält, klarmarkeringar, framstegsmätare, lagring, export eller inlämningsfunktioner. Årslås, deklaration och betalning hålls isär. KAN-100 äger framtida historik.

## Kodgräns och integrationsbedömning

Ny `NEDeclarationGuide.tsx`, små tillägg i NEBilaga/YearEndGuide/page. Guidekomponenten tar bara företag, år och en navigationscallback; inga rapportbelopp, I/O, effekter eller sparad state. Befintlig rapport/konto/journal är fortsatt enda beloppskälla.

Ingen diff i lib, hooks, Supabase, RPC/migrationer eller lockfil. NE:s beräknings-, balans-, varningsfilter- och låsvillkorsblock jämförda med bas och identiska efter normalisering av Windows-radbrytningar. Ingen ändrad kontokoppling eller transaktionskälla. Moms, NE/resultat/B10, dashboard/uttag, fakturor/betalningar, rättelser/SIE och årslås använder samma regler. Ingen automatisk navigation till Moms, som annars kan initiera perioder. Bokförings-/DB-skrivande E2E behövs därför inte för denna läsande ändring.

`package.json` ändras enbart för att ta med nya guideprovet i den befintliga säkra regressionen; inga beroenden/installationsändringar. Arkitekturkartan uppdaterad. Ingen generell städning av huvudsidan eller lintskuld.

## Verifiering

- Nytt `test-ne-declaration-guide.mjs`: **18 fall PASS** (normal/avvikelse/import-zero ×låst/öppet ×1440/390/320). Faktisk NE-komponent jämförd med accepterad Production-f7469a0: identiska renderade R-/B-belopp och låsvillkor. SIE-undantag även utan equityReviewRequired, dokumentvägar och tydliga icke-bedömda uppgifter. Officiella länkar, tangentbord, inga formulär, överrullning, nätanrop, skrivningar eller JS-fel. Ägar-/års-/namnbyte, tom rapport och injicerat läsfel PASS.
- `test-year-end-guide.mjs`: **14 browsergrupper PASS**,1440/390. Verklig Home/Layout/Årsavslut och nya guidekomponenten; befintliga ekonomipaneler är syntetiska sentinels. Ny ingång från deklarationssteget, korrekt företag/år, kontextbunden retur med öppna bokslutskontroller samt vanlig NE-retur utan gammal biljett PASS. Ägare/år/profil/laddning/fel och A→B→A bevaras.
- **npm run test:regression PASS** i syntetisk localhost-konfiguration. Domän-, NE-, journal-, historik-, moms-/faktura-/inventarie-/profil-/boknings- och övriga befintliga säkra prov passerade. Publik lokal Playwright-smoke **2/2 PASS**. Inga hosted dataanrop eller DB-skrivtester; simulerade boknings-/Storagegränser använder syntetiska data.
- **Typkontroll PASS. Fokuserad ESLint PASS** för tre guide-/NE-komponenter och två berörda testskript. `page.tsx` har **10 fel/1 varning**, exakt samma regler/meddelanden/rader som accepterad bas; programmatisk före/efter-jämförelse PASS. Ingen full repo-lint-PASS påstås.
- **Slutligt optimerat bygge PASS** med komplett syntetisk localhost-konfiguration. Första körningen kompilerade och typkontrollerade men saknade syntetisk servernyckel vid API-sidinsamling; ingen produktändring behövdes. Befintlig varning om flera lockfiler kvarstår.
- React-granskning: inga nya dataanrop/effekter, typade callback/children, naturliga details/summary och tangentbordsfokus, säkra externa länkar, ägar-/årsnycklar. Ingen kringgång av befintliga läs-/säkerhetsgränser.
- Dator-/mobilbilder visuellt granskade; utvalda syntetiska bilder/kvitton i `docs/testing/kan101-guide-local-20261023/`. Råloggar i ignorerad `coverage/kan101-guide/`, navigationsbevis i `coverage/kan99-evidence/browser/`. Första browserstarten behövde befintlig browsercacheväg; ingen installation. Ett ad hoc källjämförelseprov behövde radbrytningsnormalisering, därefter PASS; inget ekonomiskt uttryck ändrades.

Språket har granskats mot vad/varför/var/hur/saknas-fallet och förenklats. Ingen ny ovan användare har genomfört mänsklig acceptans i denna lokala verifiering; den kvarstår för Pontus. Automatiska text-/layoutprov ersätter inte detta.

## Myndighetskällor och årsgränser

Återlästa2026-10-23: [NE-justeringar](https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet/fyllainebilagan/skattemassigajusteringar.4.361dc8c15312eff6fd2c7d1.html), [NE i e-tjänsten](https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet/lamnainnebilaganietjansten.4.361dc8c15312eff6fd10b4b.html), [egenavgifter](https://www.skatteverket.se/egenavgifter) och [underskott](https://www.skatteverket.se/foretag/drivaforetag/foretagsformer/enskildnaringsverksamhet/underskott.4.361dc8c15312eff6fd32a54.html). Befintligt källregister/förklaringar finns också i planen.

De understöder vägledningen om kompletteringsrutor, tidigare beslut, e-tjänstens avsnitt/hjälpfunktioner och kvittens. Inga procentsatser, datumgränser, skattebelopp, avrundningsalgoritmer eller automatiska R47/R48→privatdeklarationsvärden införs. R43 hänvisas till myndighetens rätt-årshjälp; F-skatteinbetalning används aldrig som avgiftsavstämning.

**Inte verifierat:** den faktiska inloggade deklarationstjänsten för2027, dess slutliga meny-/blankettutformning och alla individuella årsregler. Guiden är årsneutral med synligt inkomstår, hänvisar till aktuell myndighetsinstruktion vid avvikande meny och kräver årets hjälp för rutor/avrundning. Senare år antas inte ärva2026-procentsatser eller datum. Normal årsrelation visas, ingen deadline. Ingen personlig skattebedömning eller full deklarationsacceptans påstås.

## Nästa beslut och manuella prov efter separat Staging-godkännande

Ingen publicering godkänd i detta steg. Pontus kan godkänna exakt lokal checkpoint till Staging efter rapporten.

1. Från Årsavslut, öppna sista kontrollen och NE-guiden. Läs de fem stegen och återgå via guidens knapp; tidigare öppna bokslutskontroller ska finnas kvar.
2. Normalfall och bank/balansavvikelse: rapportbelopp, journal och spärrar ska vara samma som Etapp1. Ingen bokning/låsning behövs.
3. Följ R15/R16-, underskotts- och egenavgiftskorten som ovan användare: går det att förstå dokument, plats och nästa handling utan muntlig hjälp? Saknat dokument får inte tolkas som0. Förväxla inte bankens F-skattebetalning med R40/R41.
4. Läs importkortet utan särskild varning: jämförelsen med extern resultatrapport krävs ändå. Använd syntetiska befintliga underlag; ändra inte KAN-96:s låsta testhistorik.
5. Dator/mobil, byt år och företag, prova vanlig menyväg till NE och tillbaka. Ingen felaktig gammal företags-/årskontext. Kontrollera hur källänkarna förklarar att myndighetstjänsten öppnas separat.

KAN-101 inte Done; KAN-96/100 och övriga tidigare SIE-/skattebegränsningar är kvar. Ingen Jira-, Supabase-, migration-, push- eller deployåtgärd i implementationen. Endast lokala produkt-/docscheckpoints; orelaterad root-AGENTS-diff, auditpaket och verktyg bevarade.
