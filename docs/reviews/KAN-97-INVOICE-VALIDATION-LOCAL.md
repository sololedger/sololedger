# KAN-97: lokal fakturavalidering och uttagskort

2026-10-20. **Lokal implementation och verifiering klar. Ingen commit eller extern publicering.**

## Omfattning och underlag

Arbetskopia audit-packages/KAN-104-source, codex/KAN-97-withdrawal-space, HEAD fde735972b5dbb6891cbe232b1272cc3a189286a. Ledarbeslut godkänner endast lokal implementation, migrationsutkast och isolerad lokal DB-verifiering. Ursprungliga 15 untracked filer är bevarade byte-för-byte; inget staged.

Föregående läsande design verifierade Stagings pg_get_functiondef, constraints, index, RLS, grants och triggers. Det lokala get_withdrawal_context-preimage matchade samma MD5 4e20435092d5c1ef563f1a2f9800765e före ändring. Inga hostade DB-anrop eller andra externa ändringar gjordes under implementationen.

Tidigare beroendeanalys är historiskt underlag: momsvalidering ensam räcker inte och dess preliminära antagande om inget migrationsbehov är ersatt av denna godkända atomiska protokollutökning.

## Ändrade filer och syfte

| Fil | Ändring |
| --- | --- |
| src/lib/withdrawalInvoiceValidation.ts (ny) | Ren bevisvalidator: kopplingar, ägare, händelsetyp, år/datum, sparade belopp/momsbeslut, exakt journal och fordrings-/reverseringskedja. Ingen I/O eller ekonomiberäkning. |
| src/lib/withdrawalAssessment.ts | Protokoll 2, obligatoriska fakturaarrayer, ägar-/dubblettkontroll och godkännande endast av individuellt verifierade fakturaverifikationer. Övriga spärrar och matematik bevaras. |
| src/lib/withdrawalService.ts | Även sparning verifierar aktuellt underlagskontrakt; gamla/saknade fält får ingen skrivfallback. |
| src/components/WithdrawalSummary.tsx | Fast rubrik, separat status och uttryckligt beloppsskydd även för ett motsägelsefullt incomplete-resultat. |
| src/components/WithdrawalCard.tsx | Fast rubrik även vid laddning/läsfel, varningsfärg vid spärr och neutral färg vid uppskattning/laddning. Samma underlagspanel. |
| supabase/migrations/20261020130000_kan97_withdrawal_invoice_context.sql (ny) | Preimage-guardad ersättning av endast läs-RPC. Alla nya bevis ingår atomiskt i data och befintlig källsignatur. SECURITY INVOKER/search_path/ACL bevaras. |
| tests/fixtures/withdrawalFixtures.ts | Befintliga syntetiska snapshots använder protokoll 2 och signerar även fakturabevis. |
| tests/fixtures/withdrawalInvoiceFixtures.ts (ny) | Syntetiska fakturor/kopplingar och separata daterade journalhändelser. |
| scripts/test-withdrawal-invoices.ts (ny) | 60 rena regressionsfall och reproduktion av momsvalideringens begränsning. |
| scripts/test-withdrawal-invoices-local-db.mjs (ny) | Låst lokal målidentitet/testmarkör, riktig RPC-verifiering, rollback, signaturkonflikt, ACL/RLS och bevarande. Körs inte automatiskt i vanlig regression. |
| scripts/verify-kan97-invoice-checks.mjs (ny) | Fryst vanlig testkopia utan env/auth/Git-kopiering; syntetisk miljö och bevarade externa råloggar. Ingen worktree eller städning. |
| scripts/test-withdrawal-transport.mjs | Äldre protokoll och saknade fakturaarrayer nekas av verklig service. |
| scripts/test-safe-withdrawal-presentation.tsx | Renderat kort/summary i spärr/laddning/fel; fast rubrik och inget rekommenderat belopp eller grön framgångsyta. Endast syntetisk localhost-konfiguration. |
| scripts/test-withdrawal-browser.mjs | Statusselektorer följer separerad status; fast rubrik vid laddning och ingen grön spärryta. Samma beteende-/ägar-/läsfelstester. |
| scripts/test-withdrawal-conflicts.mjs | Statusselektorer anpassade; befintliga konflikt-, R4- och R6-assertioner behålls. |
| scripts/test-annual-tax.mjs | Statusselektorer anpassade. Den gamla UX-fasens fingeravtryck gäller fortsatt skyddade NE/bokföringsfiler; nu avsiktligt ändrad assessment/service skyddas av nya tester i stället. |
| package.json | Fakturaregressionen ingår i test:withdrawal och test:domain, därmed test:regression. Inga beroenden/lockfiländringar. |
| PROJECT_STATE.md | Aktuell lokal kandidat, testresultat, avgränsning och nästa säkra steg. |
| docs/reviews/KAN-97-INVOICE-VALIDATION-LOCAL.md (ny) | Denna leverans-/verifieringsrapport. |

## Verifierade flöden

- Obetald aktuell faktura utan journal tillför inga bankmedel, intäkter eller moms. Saknad bokslutsfordran för passerat bokslut ger kontrollbehov.
- payment_same_year: exakt debet 1930 G, kredit 3010 N och vid moms en kreditrad på 2611/2621/2631 M. Momsfritt och 6/12/25 %.
- year_end_receivable: exakt debet 1510 G, kredit 3010 N och eventuell moms; rätt 31 december enligt befintlig max(fakturaår,tjänsteår). Ingen bankökning.
- receivable_settlement: exakt debet 1930/kredit 1510 G, verifierad föregående fordran för samma faktura. Inga nya intäkter/moms.
- Betalningsreversering: rätt reverses_booking_id, ägare/faktura/typ/datum, rättelsereferens och exakt omvänd originaljournal. Ny betalning är en egen bokning. Samma-dag-ånger/ombokning kan godkännas; överlappande eller bakdaterad kedja kräver kontroll.
- Historisk manual/historical_payment_same_year: endast verifierad enkel momsfri 1930/3010-journal, ingen ytterligare effekt av länken. Senare generisk rättelse ger kontroll.
- Varje ekonomi hämtas fortsatt enbart från journalerna i befintliga resultat-/momsmotorer. Ursprungliga positiva reserver försvinner inte för att en senare period/ett senare år har negativ reversering.

Okänd/äldre policy, fel/saknad koppling, fel ägare/år/datum/belopp/momskonto, extra/noll/splittrade rader, felaktig ånger eller flera aktiva betalningar ger inget rekommenderat uttag. Inventarie-/SIE-/okända källor förblir spärrade även tillsammans med godkänd faktura.

## Testresultat och bevis

Bevisrot: coverage/kan97-invoices-20261020/. Tidigare coverage och test-results är inte rensade eller ersatta.

| Kontroll | Resultat |
| --- | --- |
| Test-first fakturakontrakt/stöd | before.log: nya protokoll-2-fall FAIL mot tidigare kandidat; separat momsdiagnostik reproducerar otillräcklig momskontroll. after-initial.log: första nio fall PASS. |
| Betald-markering utan verifierbar kedja | history-gap-before.log: FAIL med rekommendation 0 i stället för null; korrigerad spärr i slutproven. |
| Fakturaregression | invoice-regressions-complete.log: 60/60 PASS. Slutlig säker regression inkluderar samma 60 fall. Ett tidigt blandat periodiseringsfalls testförväntan korrigerades från 36 000 till 33 000 öre skatt (negativt nytt år ger ingen negativ skattereserv); ingen formel ändrades. |
| UI test-first | ui-before.log var miljöstopp vid saknad syntetisk klientkonfiguration, inte produktreproduktion. ui-before-assertion.log visar faktiskt FAIL på saknad fast rubrik; ui-after.log och slutlig regression PASS. |
| Isolerad PostgreSQL 17 | Tolv faktura-/historik-/värderingsfall PASS med riktiga skriv-RPC:er/triggers. Alla scenarier BEGIN/ROLLBACK; även felande signaturprov rullas tillbaka. local-db-historical.log och local-invoice-results-*.json. |
| Användarisolering/signatur | B kan inte läsa A:s nya fakturabevis/journal. Anon nekas. Ändrat fakturabevis ändrar källsignatur; gamla signaturen ger 40001 i oförändrad save-RPC. Skattekontots finansiella ankarsignatur ändras inte av fakturabevis. |
| DB-bevarande | Alla andra publika funktionsdefinitioner, getter-ACL, fakturatabellernas RLS samt beständiga användar-/faktura-/boknings-/journal-/avstämningsradantal oförändrade. Endast läs-RPC installerad lokalt; ingen ny migrationsledgerrad påstås. |
| TypeScript/riktad lint | typecheck-final.log och lint-focused-final.log: exit 0. |
| Full lint | 74 befintliga fel + 6 varningar. lint-comparison.json jämför mot HEAD med samma installerade konfiguration: 80 befintliga diagnoser, 0 nya. Ingen bred städning. Slutlig riktad lint täcker alla nya/ändrade kod-/testfiler. |
| Full säker regression | Slutlig regression-1792492228753.log exit 0: domän, historik, UI, public smoke 2/2, kategoriskydd och fyra bokningsfall. R1–R4, årsprocent, konto-/årsbyte, läsfel och versionskonflikter ingår. |
| DB-invarianter/admin dry-run | Slutliga loggar exit 0. Statiska kontraktsprov är inte ett nytt bevis för hostad raderingskedja. |
| Optimerat bygge | Slutlig build-1792492353761.log exit 0, Next 16.2.6/webpack med endast syntetiska processvärden. |
| Skyddade filer | unchanged-boundaries.json: accountingService, resultEngine, vatReportAggregation/Service, useWithdrawal, NEBilaga, lockfil och äldre KAN-97-migration är oförändrade mot HEAD. |
| Visuell kontroll | Faktiskt kort/hook offline, 390/1280 PASS med all trafik aborterad. screenshots/blocked-390.png och blocked-1280.png visuellt granskade. Rubrik/status läsbara, inga positiva rekommendationer eller grön framgångsyta i spärrat läge. |

### Verifieringsmiljöns tidigare stopp

Tre nya vanliga testkopior är bevarade under C:/SoloLedger/LocalTest/kan97-invoices-1792491753578, -1792491883789 och -1792492228067. Inga Git-worktrees skapade eller borttagna. Originalfilerna jämfördes med frysta SHA256-manifest efter körning; ändrades inte under slutkontrollerna. Ingen env/authfil kopierades. Git-historik lästes genom GIT_DIR med optional locks av; inga Git-skrivningar.

Första körningen saknade läsbar Git-historik för befintliga NE-regressioner; första bygget saknade ett syntetiskt servernyckelvärde vid webhook-konstruktion. Nästa regression passerade domän/UI men Turbopack nekade testkopians externa node_modules-junction. Dessa loggar är FAIL/BLOCKED och kvar. Ett avgränsat infrastruktur-omprov använde dokumenterad --webpack-flagga endast i den sista testkopians smoke-launcher; appkonfiguration, produktfiler och testassertioner ändrades inte. Slutlig full regression och bygge passerade; adaptern och hashmanifestet redovisas i checks-*.json.

## Kvarvarande begränsningar och nästa beslut

- Ingen automatisk öppning av äldre momspliktiga fakturor utan tillräckligt sparat momsbeslut. Ingen historik repareras eller bokas om.
- Befintlig momsavrundningskontroll behålls. Syntetiskt brutto 0,07/netto 0,06/moms 0,01 vid 25 % har exakt journal men blockeras av befintlig momsrapport. Inga toleranser eller nya formler införda.
- Betald-markering utan kausal bokning i värderingsunderlaget ger kontroll; det kan också bli en konservativ spärr vid historiskt datum före en senare betalning. Dagens betalstatus används aldrig för att lägga till pengar eller ta bort journalhändelser.
- Ny klient kräver protokoll 2. Staging/Production är oförändrade och saknar denna migration. En framtida release behöver samordnad migration/app och omladdning av äldre klienter, efter separat godkännande.
- Inga KAN-62/65/73/76-flöden eller SIE-stöd tillkom. Inga nya tabeller eller raderingsdomäner. Inga fakturaskrivfunktioner, ekonomiska formler, RLS/grants eller övriga bokföringsflöden ändrades.
- Hostad Auth/RLS/RPC/samtidighet/rollback och full Edge/Auth/Storage-raderingskedja samt privata servernyckelns projektsammanhörighet är fortfarande inte verifierade. Pontus manuella acceptans återstår. Full lint-skuld och tidigare R6-hjälpbegränsning kvarstår.

Nästa säkra steg: ledargranskning av lokal diff, denna rapport och migrationsutkast. Separata beslut krävs för commit, hostad installation, publicering och syntetiska Staging-prov. Ingen commit, push, Jira-ändring, hostad migration/deploy eller Production-åtgärd utförd. **STOPP efter lokal verifiering.**

## Slutligt Git-läge

Samma gren och HEAD som ovan. **12 modifierade tracked-filer, 22 untracked (15 tidigare + 7 nya), inget staged.** Inga genererade env/auth/lockfiler har ändrats eller inkluderats. De 19 avsedda ändrade/nya leveransfilerna står i tabellen ovan. Följande 15 tidigare untracked filer är kvar och oförändrade enligt SHA256-manifestet preserved-before.json:

```text
docs/reviews/KAN-97-DB-VERIFICATION.md
docs/reviews/KAN-97-HANDOFF.md
docs/reviews/KAN-97-P1-VERIFICATION.md
docs/reviews/KAN-97-UX-VERIFICATION.md
docs/reviews/KAN-97-critical-review.md
docs/reviews/KAN-97-local-verification.md
scripts/diagnose-kan97-smoke.mjs
scripts/test-kan97-db-browser.mjs
scripts/test-kan97-db-concurrency.mjs
scripts/test-kan97-db-edges.mjs
scripts/test-kan97-db-functional.mjs
scripts/test-kan97-db-lifecycle.mjs
scripts/verify-kan97-lint.mjs
scripts/verify-kan97-local-db.mjs
tests/fixtures/withdrawal-local-db.sql
```
