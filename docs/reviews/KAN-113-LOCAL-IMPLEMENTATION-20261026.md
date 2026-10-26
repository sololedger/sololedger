# KAN-113 – lokal rättning av för tidigt årslås

2026-10-26. Lokalt implementationsscope godkänt av Pontus. Ingen fjärrmigration,
push, deployment eller Jira-mutation ingår. KAN-112:s accepterade produkt är bas.

## Ändring och gräns

`close_year_atomic` tar fortfarande den exklusiva användargränsen först. Därefter
valideras årtalet och jämförs med serverns faktiska år i Europe/Stockholm via
`clock_timestamp()`. Pågående/framtida år nekas med SQLSTATE 23514 och begripligt
besked om tidigaste låsdatum. Årtalet räknas efter eventuell låsväntan, inte från
transaktionsstarten. Ingen klientstyrd klocka/parameter eller sessions-tidszon
kan flytta gränsen. 2026 får låsas tidigast 2027-01-01 00:00 svensk tid.

Den befintliga momstäckningen, inventariegränsen och privata låskärnan följer
oförändrade efter den nya kontrollen. Samma signatur, ägare, ACL och tabellskydd.
Migrationsfilen stoppar vid avvikelse från granskad tidigare funktionsdefinition.
Ingen datamigration, ny tabell, upplåsning eller ändrad raderingslivscykel.

Klienten använder motsvarande Stockholmsregel. Den befintliga NE-knappen spärras
med beskedet ”År 2026 är inte avslutat. Du kan låsa året tidigast den 1 januari
2027 (svensk tid).” Handläggaren kontrollerar igen före bekräftelse/anrop.
Serverns meddelande visas också om klientens klocka ligger före servern.

Regeln gäller den befintliga kalenderårsmodellen. Inget stöd för brutna eller
förlängda år har byggts om. Ett gammalt felaktigt lås ändras inte av rättningen.
En klient med eftergående klocka kan behöva laddas om; servern avgör alltid om
ett verkligt RPC-anrop får låsa. Ingen offentlig testklocka har tillkommit.

## Exakta produkt- och testfiler

- `supabase/migrations/20261026162305_kan113_calendar_year_close_guard.sql`
- `src/lib/yearCloseDate.ts` – ren klientregel/besked.
- `src/app/page.tsx` – spärrbesked och kontroll före anrop.
- `scripts/test-year-close-date.ts` – bestående automatisk datumregression.
- `scripts/test-year-close-date-db.mjs` – explicit skyddad, endast lokal DB-test.
- `scripts/test-standard-booking-browser.mjs` – återanvänd faktisk Home/NE-harness
  för knapp, bekräftelse/anrop och läsbart serversvar på 1280/390 px.
- `scripts/check-db-regression-invariants.mjs` – följer de kända KAN-113 →
  KAN-110 → inventarie-delegaten och behåller kontrollerna av den ursprungliga
  kärnan. Verifierar dessutom nytt datumskydd och identisk efterföljande kod.
- `package.json` – datumregression ingår i befintlig säker regressionskedja;
  separat lokal DB-teststart. Inga beroenden eller lockfiler ändrade.
- `Architecture.md`, `PROJECT_STATE.md`, denna rapport och sanerade testkvitton.

## Bokföringsytor och verifiering

Kartläggningen i analysrapporten återanvänds. Inga nya transaktionskällor eller
journalposter införs. Moms-/NE-/dashboardberäkningar, fakturor, betalningar,
rättelser och SIE förändras inte; tidigare års låsning går genom samma skydd.
Tidigare skydd kan fortfarande neka ett avslutat år. Oavslutade år stoppas innan
de underliggande period-/bokföringskontrollerna gör några skrivningar.

Lokal testdatabas: `sololedger_kan62_disposable_20261021`, 127.0.0.1:5432,
PG17/OID57199 och matchande syntheticOnly-markör verifierades före skrivning.
Anslutningen använder etablerat localhost-namn/fast lokal adress och processlokal
PGPASSFILE. Inga credentials lästa, kopierade eller sparade i rapporter.
Alla tre relevanta ursprungliga funktioner matchade granskad live-version.

**Riktad DB-test: PASS, 14 kontrollgrupper.**

- Avslutat föregående år med riktiga syntetiska journaler, med/utan moms: tillåtet.
  Verifierade period-/kumulativa kontosaldon, 1930/3010 och 2650 efter momsavslut.
  Årslåset ändrar enbart låsstatus, inte journal, transaktioner eller momsperioder.
- Pågående/framtida år: nekat utan ändrade data/lås, även med syntetiskt redan
  färdig momsstatus. Direkta authenticated-RPC, samma regel i båda momsprofilerna.
- Saknad/öppen moms, redan låst år, efterbokning, negativ bank, ogiltiga år,
  anon/utan identitet och läsisolering: befintliga skydd bevarade.
- Stockholmsmidnatt ±1 ms: kandidatens riktiga funktionskropp prövad i en lokal
  pg_temp-kopia med fast tidsuttryck, med/utan moms och tre sessionstidszoner.
  Kopian återställdes. Levererad funktion har ingen möjlighet till testtid.
- Bokning först: årslås väntar och ser journalen. Årslås först: bokning väntar
  och nekas. Dubbla låsanrop ger en låsrad. Pågående/framtida anrop, även efter
  väntan, nekas utan dataändring. Exakt bokningsreplay fungerar efter lås.
- Befintlig spärr mot delad→exklusiv låsuppgradering bevarad.
- All annan publik funktionskod/ACL och befintliga table grants/RLS/constraints
  oförändrade. Efter testet raderades bara verifierade nya syntetiska konton via
  den auktoritativa raderings-RPC:n. Ursprunglig lokalfunktion återställdes.
  Alla publika tabelldigester, auth-antal och verifierat publikt schema återställda;
  inga testkonton kvar. Inga befintliga fixtures rensades/resetades.

**Klientens rena datumtest: PASS.** Fyra maskintidszoner, föregående/pågående/
framtida år, ogiltiga år, Stockholmsgränsen före/efter midnatt.

**Vanligt UI-flöde: PASS lokalt på 1280/390 px.** Faktiska Home + NE, fast
testklocka före/efter Stockholmsmidnatt med Honolulu som webbläsartidszon.
Pågående/framtida knapp spärrad, begripligt datum, noll låsanrop; föregående år
ger bekräftelse/anrop och uppdaterad låsflagga. Simulerat serversvar vid felaktigt
tidig klientklocka visas läsbart. Inga konsolfel. RPC-gränsen i detta webbläsartest
är syntetisk/offline; den verkliga databasen verifieras separat ovan. En samman-
hängande publicerad klient → live RPC-kontroll återstår till godkänd Staging.

Typecheck PASS. Fokuserad lintjämförelse PASS: inga nya fel, sidan har samma nio
äldre ESLint-fel som ded55d7. Nya regel-/DB-testfiler utan lintfel. Oförändrade
äldre lintfel rättas inte inom KAN-113. DB-invariantkontroll PASS.
Säkra regressionens samtliga delsteg PASS efter ett begränsat miljöomtest.
Det ursprungliga `npm run test:regression` nådde smoke och stannade med
`supabaseUrl is required` eftersom produktkopian saknar lokal Supabase-konfiguration.
Domän-/rapport-/checklist-/historik-/UI-delstegen före smoke var gröna. Den
publika smoken kördes om en gång med processlokal loopback-URL och en uttryckligen
syntetisk nyckel: 2/2 PASS. Inga miljöfiler eller riktiga Supabase-projekt användes.
De två återstående regressionsstegen (category visibility och standard booking
browser inklusive KAN-113) kördes separat: PASS. Hela ursprungskommandot har alltså
inte ett grönt slutexit; alla dess delsteg har verifierats gröna. Diffkontroll PASS.
Ingen Jira In Review/Done görs utifrån detta.

### Lokala verktygsavbrott

Första körningen behövde avslutande semikolon efter `pg_get_functiondef` i
testets temporära kopia/återställning. Nya syntetiska konton avstämdes och
raderades; ursprunglig funktion återställdes från granskad definition, residual=0.
En senare samtidighetsfixtur försökte anropa en privat hjälpfunktion och nekades
korrekt. Testet använder nu publik årslås-RPC för låsväntan. Efterföljande
fullständiga lokalkörningar PASS med verifierad återställning.
Första UI-körningen behövde fixera testklockan (1 ms före midnatt) och identifiera
knappen inklusive låsikonen. Produktregeln ändrades inte för att få tester gröna.
Allt berörde enbart lokal testmiljö; inga fjärrskrivningar gjordes i detta uppdrag.

## Production – enbart aggregerad läsning

Supabase Production `wbaxmuvudpnkvuliicuy`, READ ONLY, Stockholm 2026-10-26:
**0 låsrader för pågående år, 0 för framtida år, 0 berörda användare.**
Inga identiteter eller andra person-/bokföringsuppgifter hämtades. Ingen åtgärd
eller upplåsning gjordes. Kontrollens resultat är en ögonblicksbild; felet finns
fortfarande i driftsatt kod tills en separat godkänd release är klar.

## Nästa steg – endast förslag till Staging

1. Godkänn exakt kandidatcommit och endast migration
   `20261026162305_kan113_calendar_year_close_guard.sql` för Staging. Kontrollera
   aktuell deployed definition/ACL/preimage och migrationsledger. Officiell CLI-
   applicering ska bevara filens versionsidentitet. Ingen automatisk push nu.
2. Publicera godkänd appkandidat till Staging efter separat beslut. Bekräfta rätt
   SHA, Preview/staging/projekt/team/alias och Supabase Staging-ref.
3. I dedikerad syntetisk cohort: verkligt UI-lås av avslutat år med journal/moms/
   NE/dashboard-kontroll, och UI + direkt RPC-nekande för pågående/framtida år
   med/utan moms. Kontrollera noll oönskade dataändringar och efterbokningsspärr.
   Kör relevanta samtidighetsfall och återställ godkänt syntetiskt testtillstånd.
4. Pontus manuell acceptans. Production kräver nytt exakt releasebeslut; KAN-112:s
   separata migrations-/Edge-behov kvarstår. Ingen Jira Done i detta uppdrag.

Rättningen är lokal. Jira KAN-113 återläst To Do/otilldelad; ingen ändring.
Rootens orelaterade dirty filer och tidigare KAN-112-gren/checkpoints bevarade.

Versionshanterat testkvitto: `docs/testing/kan113-local-20261026/`.
Detaljerade lokala körloggar/initialkatalog/återställning finns bevarade i
`coverage/kan113-local/` (ignorerat). Ingen Production-byggkontroll gjordes;
typecheck, riktade browser-/DB-tester och säker regressionskedja användes lokalt.
