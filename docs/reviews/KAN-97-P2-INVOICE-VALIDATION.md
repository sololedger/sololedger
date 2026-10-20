# KAN-97 – två blockerande P2-fynd rättade lokalt

2026-10-20. Lokal implementation och verifiering PASS. Ingen commit, push, Jira-ändring, hostad databasändring eller deployment. Gren codex/KAN-97-withdrawal-space, HEAD fde735972b5dbb6891cbe232b1272cc3a189286a.

## Rättning och reproduktion

1. **Fullständig fakturajournal:** protokoll 3 kräver invoice_journal, med samtliga egna journalrader för varje datumrelevant fakturakopplad verifikation. Beviset hämtas utan journalens datumfilter, i samma atomiska snapshot och källsignatur. Validatorn kräver samma bokningsdatum på alla bevisrader, exakt journalmall och överensstämmelse mellan synliga bevisrader och ekonomirader (ID, datum, konto, verifikationsnummer och belopp i ören). Ekonomin använder fortsatt endast den ursprungliga datumavgränsade journalen. Framtida separata fakturahändelser tas inte med genom det nya bevisfältet.
2. **Överlappande betalningar:** betalning och ånger samma dag undantas inte längre generellt från överlappskontrollen. Ett sådant par får ligga vid en annan betalningskedjas gräns, där en legitim ordning samma dag är möjlig, men inte strikt inne i dess aktiva intervall. Historiska bokningsdatum och befintliga fordrings-/reverseringskontroller bevaras.

Test-first before.log visar tre reproducerade fel: femradsjournalen och två överlappande kedjor godkändes felaktigt (även reglering över årsskifte). Ett legitimt noll-dagarspar före senare betalning passerade redan då. Efter rättning passerar samtliga 69 tester: de tidigare 60 samt nio nya P2-fall.

Riktig lokal PostgreSQL reproducerar femradsfallet: tre ekonomirader, fem bevisrader, bank 125 000 öre och rekommenderat uttag null. De framtida extraraderna ändrar källsignaturen medan ekonomijournalen är oförändrad. En extra betalning med ånger samma dag inne i en befintlig aktiv betalning ger också null. Båda syntetiska fallen rullas tillbaka.

## Ändrade filer i P2-steget

| Fil | Syfte |
| --- | --- |
| src/lib/withdrawalAssessment.ts | Kräver protokoll 3 och fullständigt ägarbundet journalbevis; dubbletter/saknade referenser spärras. |
| src/lib/withdrawalInvoiceValidation.ts | Validerar fullständig journal, dess datum och koppling till ekonomirader; rättad överlappskontroll. |
| supabase/migrations/20261020130000_kan97_withdrawal_invoice_context.sql | Befintligt oinstallerat migrationsutkast kompletterat med bevisfält och protokoll 3. |
| tests/fixtures/withdrawalFixtures.ts | Nytt obligatoriskt kontrakt och signerat bevisfält. |
| tests/fixtures/withdrawalInvoiceFixtures.ts | Separat komplett journalbevis kan anges i reproduktionerna. |
| scripts/test-withdrawal-invoices.ts | Nio P2-regressioner; tidigare 60 kvar. |
| scripts/test-withdrawal-transport.mjs | Protokoll 1/2 och saknat nytt bevisfält ger fail-closed. |
| scripts/test-withdrawal-invoices-local-db.mjs | Två nya DB-reproduktioner, signaturkontroll och strikt lokal adapter för tidigare oinstallerat utkast. |
| scripts/verify-kan97-invoice-checks.mjs | Separat P2-bevisrot; bevarad fryst regression och byggkontroll. |
| PROJECT_STATE.md | Aktuell status, protokoll, verifiering och nästa säkra steg. |
| docs/reviews/KAN-97-P2-INVOICE-VALIDATION.md | Denna rapport. |

Övriga tidigare lokala ändringar finns kvar. Föregående implementationsrapport är historisk och oförändrad. Totalt mot HEAD: 20 avsedda leveransfiler; de tidigare 19 plus denna rapport. Detta är ett granskningsurval, inget godkänt commiturval.

## Verifiering

Bevisrot: coverage/kan97-p2-20261020/ (ignorerad, bevarad).

| Kontroll | Resultat och bevis |
| --- | --- |
| Test-first | before.log: 61 PASS/3 FAIL av första 64, avsedda reproduktioner. after-initial.log: 64 PASS. |
| Fakturaregression | invoice-regressions.log: 69/69 PASS. Samma fall ingår i bred regression. |
| Lokal PostgreSQL | local-db.log och local-invoice-results-1792493579098.json: 14/14 scenarier PASS; samtliga scenarier rollback. |
| Ägarisolering/konflikt | A/B-isolering även för journalbevis, anon nekas, ändrat bevis ändrar signatur, gammal signatur ger 40001. PASS. |
| DB-bevarande | Alla andra publika funktioner, getter-ACL, berörda RLS och beständiga radantal oförändrade. PASS. |
| TypeScript | typecheck.log: exit 0, utan inkrementell skrivning. |
| Riktad lint | lint-focused.log: exit 0, inga diagnoser. |
| Hela säkra regressionen | regression-1792493637301.log: exit 0; tidigare KAN-97-domän/UI/service/konflikt/årsprocent samt public smoke och bokning passerar. |
| DB-invarianter/admin dry-run | db-invariants-1792493810986.log och admin-dry-run-1792493811418.log: exit 0. |
| Optimerat bygge | build-1792493811608.log: exit 0, Next/webpack. |
| Fryst källkontroll | checks-1792493637234.json: sourceUnchanged=true under hela breda körningen. |

Full lint har inte körts om i detta steg. Föregående verifierade jämförelse redovisar 74 befintliga fel och 6 varningar; aktuell riktad lint passerar. Ingen bred lintstädning har gjorts.

Legitima flöden som fortsatt passerar: obetald faktura utan bankpåverkan, betalning samma år, bokslutsfordran och senare reglering, ånger och ny betalning (även samma dag), historisk manuell momsfri koppling, 0/6/12/25 % moms, avrundningsspärrar, momsperiod-/årsskiften samt blandade manuella bokningar/rättelser/periodiseringar. Ofullständigt bevis, främmande ägare och avvikande ekonomirader spärras.

## Lokal migration och bevarade gränser

Endast den markerade disponibla databasen sololedger_kan97_disposable_20261019 på 127.0.0.1:5432, OID 56112, användes. Dess tidigare oinstallerade protokoll-2-utkast kontrollerades med exakt definitionshash. En lokal adapter återställde den kända grunddefinitionen och körde det reviderade utkastets oförändrade preimage-kontroll i samma transaktion (local-draft-replacement.json). Detta är inte ett tillvägagångssätt för hostade miljöer. Ingen migrationsledgeruppdatering påstås.

Utkastet ersätter fortfarande endast get_withdrawal_context. STABLE, SECURITY INVOKER, search_path, auth.uid-filter, grants och RLS bevaras. Preimage-hash för publicerad grund är oförändrad. Jämfört med föregående utkast tillkommer endast journalbevis och protokollversion. Inga ekonomiska formler, fakturaskrivfunktioner, gamla migrationer eller nya tabeller ändras. Inventarie-, SIE- och okända källspärrar är kvar; ingen KAN-62/65/73/76-implementation.

Fryst vanlig testkopia C:/SoloLedger/LocalTest/kan97-invoices-1792493636516 bevaras med syntetisk miljö utan kopierad env/auth. Smoke använder dokumenterad webpack-devflagga enbart i testkopians launcher på grund av extern beroendejunction; produktkonfiguration och assertioner är oförändrade.

## Begränsningar och nästa beslut

Fullständigt journalbevis kan öka läsunderlagets storlek. Ingen prestandamätning på hostad datamängd har utförts. Protokoll 3 kräver en framtida samordnad app-/migrationsrelease och omladdning av äldre klienter; protokoll 1/2 eller saknade fält spärras. Händelser har datum, inte intradagsordning: gränsfall samma dag godtas när en legitim ordning finns, medan strikt inneslutna extrakedjor spärras. Tidigare konservativa historik- och momsavrundningsspärrar kvarstår. Ingen hostad verifiering eller ny visuell kontroll behövdes för dessa två logiska rättningar; tidigare manuell acceptans och hostade säkerhetsprov återstår.

Slutstatus: 12 modifierade tracked-filer och 23 untracked (15 ursprungliga + 8 nya), inget staged. De 15 ursprungliga filerna är oförändrade byte-för-byte mot coverage/kan97-invoices-20261020/preserved-before.json. Samma gren och HEAD, inga externa ändringar.

Nästa steg: ledargranskning av båda rättningarna, regressionsbevis och reviderat migrationsutkast. Separat beslut krävs för checkpoint och varje hostat steg. STOPP efter lokal verifiering.
