> HISTORISK RAPPORT: efter denna rapport godkände ledarchatten en konservativ ettårspolicy.
> Aktuell kandidat och verifiering: [KAN-74 single-year guard](KAN-74-single-year-guard.md).
> Tidigare BLOCKED/STOP och acceptansfall nedan avser föregående kandidat.

# KAN-74 P1 – STOPP, kandidaten är fortfarande BLOCKED

2026-10-15. Befintlig arbetsgren codex/KAN-74-sie-opening-guard, ocommittad.
Ingen produktkorrigering har gjorts i denna uppföljning. Migrationsförslaget
20261015120000_kan74_sie_opening_balance_guard.sql får inte publiceras som en
färdig lösning på P1. Ny oberoende granskning för godkännande: **inte redo**.

## 1. Reproduktion i egen svit

Granskarens fall är tillagt i supabase/tests/kan74_sie_opening_guard.sql efter
de oförändrade 22 ursprungliga fallen. Det kräver P2074, oförändrat saldo 10 100
och använder svitens befintliga kontroll av tillstånd och skrivförsök.

2024 importeras med #IB 10 000 och insättning 100. En #VER daterad 2025-01-01,
utan #IB, bokar 1930 +10 100 / 2010 -10 100. Kandidaten accepterar fortfarande
importen: bank 20 200. Regressionen faller med Expected P2074, received <NULL>.
Alla testtransaktioner i denna reproduktion rullas tillbaka. Felet är inte lagat.

## 2. Rotorsak och faktisk representation

- src/lib/sieParser.ts, parseSieFile / parseVerBlock: #IB och #VER hålls isär.
  En #VER har serie, nummer, datum, text, rader och balansdifferens. Ingen
  verifierad uppgift anger om raderna är en affärsrörelse eller en hel startbalans.
- src/lib/sieImport.ts, importSieBatch: bara openingBalances blir opening_balances.
  Alla #VER går till samma verifications-lista med date, description, rows,
  series och ver_number. Hashen identifierar innehåll, inte balansens betydelse.
- public.import_sie_batch(jsonb): dessa poster lagras med source=sie_import,
  type=NULL och ursprungsserie/-nummer. Endast det separata #IB-spåret ger
  source=sie_opening_balance. Det befintliga skyddet stoppar äldre datum och
  uttryckliga IB-kombinationer, men accepterar en senare vanlig #VER som läggs
  ovanpå föregående saldo. Den sparade historiken summeras oförändrat.
- Den befintliga legacy-texten Öppningsbalans är inte ett tillförlitligt nytt
  bevis: vanlig #VER-text är fri. Den får inte ensam avgöra detta P1-skydd.

Den verkliga parsern och klientadaptern testades med fyra benämningar och två
motkonton (2010, 2018). Samtliga ger tom opening_balances och vanliga #VER-rader.
Ingen produktkod eller klassificering ändrades för att skapa detta resultat.

## 3. Varför en enkel strukturell regel inte räcker

Åtta lokala rollbackprover accepterades felaktigt av den nuvarande kandidaten:
Öppningsbalans, Ingående balans, Opening balances, Verifikation, vardera med
1930/2010 och 1930/2018. Banken blev 20 200 i varje prov. Samma 2018-post är
också strukturen för den vanliga egna insättning som ursprungliga tester tillåter.

Det obligatoriska befintliga fallet no_ib_years innehåller två vanliga #VER,
en per år, båda 1930 +100 / 2018 -100. Om det är två verkliga insättningar är
saldo 200 korrekt. Om samma rader i stället avser två års startsaldon skulle
100 vara korrekt. Samma normaliserade data, utan tillförlitlig ursprungsmarkör,
kan inte ge båda besluten. Benämning, datum, belopp eller kontoval kan ändras;
en matchning mot föregående saldo skulle också träffa verkliga betalningar och
kan kringgås genom uppdelning eller omklassificering av rader.

En snäv regel mot 2010/2019 kan avvisa det exakta granskarfallet oavsett text,
men lämnar den verifierade 2018-varianten öppen. Den kan dessutom stoppa legitima
omföringar mellan årets resultat och eget kapital. Jag har därför inte lagt in
den som en säker P1-lösning och inte ersatt en känd kringgång med falsk trygghet.

## 4. Utvärderade alternativ för ledarchattens beslut

| Alternativ | Skydd och tillåtna fall | Legitima fall som blockeras / ändrat krav |
|---|---|---|
| Ett SIE-verifikationsår per konto | Liten atomär regel under befintligt användarlås. En första ettårig import och ytterligare filer inom samma år kan tillåtas. Alla fleråriga kombinationer och flerårigt innehåll i samma fil avvisas oberoende av text/konton. Manuella flöden behöver inte ändras. | Även vanliga senare SIE-importer utan IB stoppas. Ursprungliga future_no_ib, no_ib_years och samtidighetsfallet safe_later_no_IB måste få nya förväntningar. Kräver uttryckligt ändrade acceptanskriterier; inte implementerat. |
| Bara balanskontobaserade riskposter | Snävare konservativ spärr mot senare år med enbart balanskonton. Stoppar öppningsliknande poster även utan 2010. | Stoppar också verkliga egna insättningar, uttag, banköverföringar, lånebetalningar och kund-/leverantörsbetalningar utan resultatkonton. Kan kringgås om en saldopost blandas med resultatrader. Inte tillräckligt ensam. |
| Bara 2010/2019 | Minsta kodändring, kan stoppa det exakta P1-fallet och ombenämningar. | 2018-varianten passerar; legitima kapitalomföringar kan stoppas. Inte rekommenderad som säker lösning. |
| Verifierat öppnings-/rörelseunderlag | Kan ge en tydlig gemensam importmodell och avstämning. | Kräver separat beslut om importkontrakt, ursprung/tillit och avstämning. En fritt skickad klientflagga är inte tillräckligt serverbevis. Större än den avgränsade spärren. |

Det finns alltså ett litet, konservativt alternativ (ett SIE-år), men det strider
mot nuvarande krav att de 22 fallen och säkra senare no-IB-importer ska fortsätta
fungera. Jag ändrar inte dessa krav genom att på egen hand göra testerna gröna.
Produktändringen är stoppad enligt uppdragets stoppregel. Ingen bred ombyggnad.

## 5. Kontroller och ärlig status

- Ny P1-regression: **RÖD**, oförväntad acceptans; kandidaten är BLOCKED.
- Ursprungliga 22 scenarier: PASS, kontrollerade separat med den bevarade exakt
  tidigare sviten mot samma kandidat. Samtliga åtta observerade tvåsessionstester
  passerar; READ COMMITTED/snapshotkontroller bevarade. Det gör inte P1 grönt.
- Åtta alternativa namn-/konto-prover: verifierad osäker acceptans, inte åtta
  godkända säkerhetsfall. Alla nya reproduktions-/strukturprover rollback.
- Verklig parser-/klienttrace inklusive åtta varianter: PASS. Nya förväntade
  P1-bevis ingår i egna testfiler, ingen fristående chattbeskrivning som enda bevis.
- KAN-71:s tre SQL-sviter: PASS. Endast tillåtet lokalt databasnamn anpassades i
  minnet. Användarisolering i ursprunglig svit PASS. Alla lokala publika
  funktionskroppar, ägare och ACL jämförda oförändrade sedan föregående kandidat;
  anonym importåtkomst är fortsatt nekad.
- Riktad lint och diffkontroll PASS. npm run build (Next 16.2.6 Turbopack) PASS, inklusive TypeScript och statisk sidgenerering. Första försöket saknade servernyckel vid sidinsamling; ett avgränsat omförsök med en processlokal platshållare passerade. Inga verkliga nycklar eller miljöfiler användes.
- Full ny domän-/webbläsarsvit eller hosted skrivtester är inte körda här;
  ingen produktkod har ändrats. Tidigare gröna kontroller ersätter inte det röda P1.

## 6. Bevarande och nästa steg

Denna uppföljning ändrar bara tester, denna rapport, statusmarkering i den äldre
rapporten och PROJECT_STATE.md. Migrationsförslag, parser, klientproduktkod,
saldoberäkning, NE, export, historik och package.json är byte-för-byte bevarade
från uppföljningens start. Inga commits, pushar, Jira-ändringar, hosted
migrationer, deployer eller historiska datarättningar. Övriga worktrees bevarade.

Ny live-definition och schema-/ACL-jämförelse krävs fortfarande före eventuell
hosted migration. Tidigare godkännande av lokal bas gäller; ingen ny Production-
inventering behövs. Avvakta ledarchattens beslut om vilket alternativ/krav som
ska ändras innan fortsatt produktimplementation eller ny godkännandegranskning.

Bevis utanför Git:
C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/p1-followup/
p1-red.log, structural-probes.log/sql, original-tests.log, baseline-checks.json,
kan71_*.log och before/ (bevarad kandidat före uppföljningen). Bara syntetiska
testvärden, schema/kod och status; inga credentials eller verkliga användarrader.
