# KAN-97 – beroendeanalys: fakturor, inventarier och igenkännbart uttagskort

2026-10-20. Läsande analys slutförd. **Ingen fakturarättning eller ny kortpresentation är implementerad.** Rapporten är beslutsunderlag för nästa avgränsade implementation, inte ett genomfört test eller ett publiceringsgodkännande.

## Verifierat underlag

- Publicerad release `585c8942dac73f348be30ac92be692921d4d4a0c`, tree `d4c2a4e0114f45347e3163f6ff782bef57736285`. Utvecklingskopians checkpoint `430842c082a58572079bda5a2c7b86cff899720b` har samma tree. Ingen senare produktkod finns lokalt.
- Aktuella Staging-definitioner via `pg_get_functiondef`: `create_customer_invoice_atomic`, `insert_customer_invoice_transaction`, `record_customer_invoice_payment_atomic`, `book_customer_invoice_year_end_receivable_atomic`, `settle_customer_invoice_receivable_atomic`, `undo_customer_invoice_payment_atomic`, `transaction_source_classification`, `get_withdrawal_context`, vanlig bokning, periodisering, generisk rättelse och årslåsning. Inga DB-funktioner kördes för att skapa/ändra bokföring.
- Aggregat av dedikerat syntetiskt Staging-kontos befintliga fakturajournaler bekräftar bokningsformerna nedan. Testhistoriken innehåller även framtida datum; sådana exempel bevisar journalformen, inte att de ingår i dagens uttag. Ingen kunddata lästes och inga nya syntetiska skrivtester kördes.
- Jira läst 2026-10-20. Status är arbetsstatus, inte bevis på korrekt ekonomi eller ett releasegodkännande. Inga Jira-ändringar.

## Fakturaflödet och varför uttaget spärras

| Etablerad händelse | Bank och fordran | Resultat/moms |
| --- | --- | --- |
| Ny obetald faktura, inte bokslutsbokförd | Ingen journal eller bankökning | Ingen journalpåverkan ännu |
| Betalning samma år (`payment_same_year`) | Debet 1930 med brutto | Kredit 3010 och eventuell utgående moms |
| Obetald faktura vid bokslut (`year_end_receivable`) | Debet 1510, ingen bankökning | Försäljning och eventuell moms bokas i bokslutsåret |
| Senare betalning (`receivable_settlement`) | Debet 1930/kredit 1510 | Ingen ny försäljning eller moms |
| Ångrad betalning | Den ursprungliga journalen motbokas på kontrollerat datum | Resultat/moms återförs bara om ursprunglig betalning hade sådan påverkan |

Källan för nya fakturabokningar och betalningsreverseringar är `customer_invoice`. Historiska fakturalänkar kan peka på redan bokförda `manual`-verifikationer; länken ska inte skapa någon ytterligare ekonomisk effekt.

Rotorsak: [withdrawalAssessment.ts](../../src/lib/withdrawalAssessment.ts:81) godkänner bara manual, vat_v2, vat_closing, vat_settlement och tax_account_movement (samt null). `customer_invoice` ger därför omedelbart en issue. Bank/resultat räknas redan från journalerna och moms via den gemensamma momsrapporten.

Relevanta kodvägar:

- [accountingService.ts](../../src/lib/accountingService.ts:832): betalning, ångra, bokslutsfordran och reglering använder etablerade RPC:er.
- [vatReportService.ts](../../src/lib/vatReportService.ts:275): kompletta fakturajournaler skickas till rapportens fakturaväg.
- [vatReportAggregation.ts](../../src/lib/vatReportAggregation.ts:532): validerar fakturornas journalform, moms, försäljning och motkonto. Ogiltiga former blockeras.
- [withdrawalAssessment.ts](../../src/lib/withdrawalAssessment.ts:189): samma momsrapport återanvänds för respektive styrkt period; [årsresultatet](../../src/lib/withdrawalAssessment.ts:201) bygger på gemensam resultatmotor.
- Migrationerna KAN-46, KAN-63 och KAN-75 visar historiken; de live lästa definitionerna är källa för faktiskt Staging-beteende. Gamla migrationer ska inte ändras eller köras om för att öppna uttagsstödet.

## Minsta föreslagna implementation – A

1. Skriv reproducerande regressioner för giltiga fakturakedjor som idag spärras av källkontrollen. Dokumentera FAIL före och PASS efter rättningen.
2. Låt validerade etablerade `customer_invoice`-journaler omfattas av KAN-97. Återanvänd befintliga motorer; bygg ingen parallell faktura-, moms- eller skatteformel.
3. Likviditet kommer endast från 1930. Lägg aldrig fakturabelopp, betalningsstatus eller 1510 ovanpå bank/journalresultat. Reglering nästa år ger inga nya intäkter/moms. Tidigare års skattereserver får inte försvinna.
4. Behåll samtliga övriga issues och gränser: periodluckor, 2650-avstämning, oklar journal, äldre åtaganden, skattebeslut, konflikt/läsfel och ägarskydd. En utökad källlista ensam är inte färdig verifiering.
5. Nuvarande snapshot har redan nödvändiga journalrader; inget behov av ny modell eller migration har identifierats. Om tester visar saknat nödvändigt underlag: stoppa och ompröva, gissa inte.

## Övriga flöden

- Vanliga inköp, försäljningar, periodiseringar och generiska rättelser använder redan stödd manual-källa. Live kolumndefault är manual. De ska regressionsskyddas, inte tilldelas nya uttagsregler.
- VAT V2, momsavslut, avräkning och skattekontohändelser har redan stöd. R1–R4 ska fortsätta passera.
- SIE-källor och osäker historiktäckning ingår inte i nästa implementation. Okända källor får inte få tyst fallback.
- Andra företagskonton, oklar skatteklassificering och långfristiga låns betalningsplan kan fortsatt ge kontrollbehov trots korrekt journal. Befintliga gränser ska förklaras, inte avskaffas.

## Inventarier – B: vänta

| Jira | Lästa status | Konsekvens |
| --- | --- | --- |
| [KAN-62](https://sololedger.atlassian.net/browse/KAN-62) | In Review | Belopp inkl. moms, momssats, avdragsrätt och anskaffningsvärde inte slutligt accepterade |
| [KAN-65](https://sololedger.atlassian.net/browse/KAN-65) | In Review | Omklassificeringens presentation/spårbarhet inte färdigställd |
| [KAN-73](https://sololedger.atlassian.net/browse/KAN-73) | To Do | P1-kodrisk: fixed_asset-2641 kan saknas i momsrapport/Dashboard; löses inte av KAN-62 |
| [KAN-76](https://sololedger.atlassian.net/browse/KAN-76) | To Do | P1-kodrisk: anskaffning efter årsavskrivningskörning kan missa avskrivning |

KAN-36 (inventariegrund) och KAN-54 (avdragsrätt) är Done, men det bevisar inte att hela inventariekedjan är säker. Befintliga fixed_asset-, reclassification- och depreciation-källor ska därför fortsatt ge spärr i KAN-97. Testkontot kan förbli spärrat efter fakturastödet eftersom det också har inventariehistorik; använd fokuserade syntetiska fakturafall för acceptans.

Vi inväntar enligt Pontus Skatteverkets svar på frågor skickade **12 oktober** om K1, sammanhängande/successiva inköp, omklassificering, årsskiften, momsavdragsrätt och avskrivningar. Inkommet svar har inte verifierats i denna analys. Inga egna materiella inventarieregler ska byggas i KAN-97 i väntan på svar.

Övriga Jira-beroenden: KAN-46/63/66/88 är Done för fakturalivscykel, profil-/momsregler, aggregering och NE. [KAN-70](https://sololedger.atlassian.net/browse/KAN-70) To Do gäller kompletterande service-/dashboardtester; befintliga rena aggregeringstester omfattar redan 6/12/25 %. [KAN-81](https://sololedger.atlassian.net/browse/KAN-81) To Do gäller felaktig feltext vid blockerad fakturajournal. [KAN-60](https://sololedger.atlassian.net/browse/KAN-60) To Do gäller historikfiltret för manuellt länkade fakturor, inte en ny ekonomisk effekt. Inget av dessa är ett automatiskt uppdrag att implementera andra Jira-ärenden.

## UI: minsta tydliga ändring

Den stora gröna rutan är själva uttagskortet, inte en ersättande orelaterad informationsruta. [OverviewCards.tsx](../../src/components/OverviewCards.tsx:149) placerar det på egen rad under fyra översiktskort. [WithdrawalSummary.tsx](../../src/components/WithdrawalSummary.tsx:7) byter hela rubriken efter status och döljer beloppet vid incomplete. [WithdrawalCard.tsx](../../src/components/WithdrawalCard.tsx:109) använder grön färg i alla lägen.

Föreslaget nästa UI-arbete: alltid synligt kortnamn **Säkert uttag**; separat status (exempelvis Kan inte beräknas – kontroll krävs), ingen rekommenderad summa vid osäkerhet, neutral/gul presentation och tydlig konkret förklaring. Kända delbelopp är underlag, inte uttagsråd. Återanvänd panelen för detaljer. Ändra inte beräkning, årsreglage, NE-värden eller säkerhetslogik som del av presentationen.

## Verifieringsplan – C

- Fakturor obetalda/betalda, bokslutsfordran, senare reglering, ångrad betalning och ny betalning. Historisk manuell koppling ska inte räknas två gånger.
- Momsfritt och 6/12/25 %, öresavrundning, månad/kvartal/år, flera år, betalning/rättelse över period-/årsskifte och låsta år.
- Samma journal ska ge korrekt bank, fordran, resultat/NE, momsreserv och årsvis skatt exakt en gång. Bevara beslut och gemensam årsprocent.
- Blandade manuella inköp, periodisering/rättelse och fakturor; negativ bank. Felaktig/ofullständig fakturajournal och inventariekällor förblir spärrade.
- R1–R4, konto-/årsbyte, laddning, två klienter, versionskonflikt, UI-status och ingen lässkrivning. Relevanta tester, TypeScript, riktad lint, optimerat bygge och full säker regression efter implementation.
- Efter separat godkännande: hostad syntetisk Auth/RLS/RPC, ägarisolering, privata servernyckelns projektsammanhörighet, samtidighet, rollback, Edge/Auth/Storage-raderingskedja med annan användare bevarad. Befintliga data får inte rensas. Pontus manuell acceptans före Production.

## Slutsats och tillstånd

Fakturastödet och UI kan sannolikt färdigställas lokalt inom KAN-97 utan inventarieberoende och utan ny DB-modell. Det är ännu **inte implementerat eller testat som utökning**. Nästa implementation kräver separat startbesked; denna handoff ger inget godkännande till migration, skrivtester, push, deploy eller Production.
