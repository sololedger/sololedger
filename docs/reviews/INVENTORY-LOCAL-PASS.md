# KAN-62/65/73/76 – gemensam LOCAL PASS

Avstämt 2026-10-21 efter återstart. Lokal verifiering komplett inom godkänt normalfall; redo för Staging-förberedelse. Ingen Staging-/Production-acceptans eller publicering påstås.

## Kandidat och återstart

- Gren `codex/KAN-62-65-73-76-inventory` i `audit-packages/KAN-62-rule-contract-local`.
- Bas/checkpoint `89afeefa90faa3ad0c3a6d7622a739c3fcfa7ebc` bevarad som förfader och via `codex/KAN-62-staging-preparation`.
- Inget avbrott mitt i migration/commit och ingen kvarvarande testsession. Slutlig read-only-kontroll efter återstart PASS. Tidigare stora sviter återanvändes från sparade resultat; endast små slutkontroller upprepades.
- Kandidatens origin är en lokal arbetskopia, inte GitHub. Root Desktop/staging är en separat dokumentationskedja och får inte pushas som produktrelease. Inga orelaterade produktcommits har tillförts efter checkpointen.
- Tidigare analys: `audit-packages/KAN-62-INVENTORY-DELIVERY-REVIEW-20261021.md` i root. Tidigare KAN-62-bevis/planer bevaras som daterad historik, inte som aktuell gemensam releaseplan.

## Implementerat och integrationsyta

- **KAN-62:** oförändrat verifierat regelkontrakt: mindre värde strikt under 29 600 kr exklusive fakturamoms 2026; ej avdragsgill moms i bokfört värde. Beständiga sammaårsgrupper, planerat paketbelopp, tre successiva köp, kortliv, avrundning, serverkontroller och äldre replay bevarade.
- **KAN-65:** spårbara tvåvägslänkar köp ↔ separat omklassningsverifikation, även mobil och sökning. Fullständig ägarbunden eventläsning; inga omskrivna historiska journaler eller historisk datamigrering.
- **KAN-73:** faktisk avdragsgill 2641 från komplett och balanserat fixed_asset-verifikat ingår exakt en gång i momsrapportens ruta 48 och därmed 49/dashboard. Ingen moms rekonstrueras från dagens profil. Felaktiga/ofullständiga verifikat stoppas. Avslut/deklarationsavstämning bevaras.
- **KAN-76/K1:** gemensamt serverunderlag för preview och bokning, komplett körningshistorik, kronologiska år, nollvärde, låsning/replay och spärr mot sena aktiveringar/omklassningar/bakdateringar. Årsavskrivning är hela kollektivunderlaget endast när det är högst halvt PBB; annars 30 procent. Tekniskt restvärde blir inte automatiskt årets belopp. Både belopp och underlagssignatur kontrolleras efter låsväntan.
- Journalvägar: köp D5410 eller D1220, eventuell D2641, K19xx/2018; omklassning D1220/K5410; årsavskrivning D7830/K1220 utan moms/betalning. Inga nya transaktionskällor. Resultat/NE R10 och balans B4/dashboard verifierade från verkliga lokala journalrader. Befintliga rapportmotorer återanvänds.
- KAN-75:s låsordning, klientroller/RLS och privata funktionsgränser bevaras. Generiska inventarieändringar/SIE-liknande inkommande journal kan inte kringgå fastställt årsunderlag. Ingen ny tabell eller ändrad raderingslivscykel; journalvakten gäller INSERT, inte DELETE.

## Verifiering och bevis

Bevisroten är kandidatens ignorerade `coverage/kan62-local-db/`; allt äldre material och misslyckade försök bevaras. Käll-/migrationshashar finns i körningarnas `inventory-inputs.json`, installationsmanifest i `docs/reviews/INVENTORY-LOCAL-MIGRATIONS.json`. Inga hemligheter kopieras till rapporten.

| Kontroll | Resultat och bevis |
| --- | --- |
| Full SQL, inklusive tidigare KAN-62 | **PASS**, `runs/inventory-sql-r07/result.json`: alla tidigare rader/katalog bevarade. KAN-62 omfattar 59 lyckade anrop, 114 negativa kontroller, gränser/paket/år/moms/kortliv, riktiga klientroller och äldre replay efter uppgradering. |
| Kollektiv K1, två år | **PASS** i samma SQL: journalbelopp/balanser, årsföljd, stale preview, exakt/ändrad replay, osäkra öppningsvärden/äldre körningar, stängd/deklarerad period och rätt felorsaker. Full avdragsrätt: 100 000 → 30 000 avskrivning; nästa år (70 000 + 40 000) → 33 000, rest 77 000. Ingen avdragsrätt: 125 000 → 37 500; nästa år (87 500 + 50 000) → 41 250, rest 96 250. |
| Ny samtidighet | **10/10 PASS**, `runs/inventory-concurrency-r03/result.json`, separata sessioner, observerad låsväntan: köp/avskrivning i båda ordningar, lika/ändrad replay, årsstängning, momsavslut i båda ordningar, deklarerad momsperiod, journalgräns och oberoende ägare. |
| Befintlig KAN-62 samtidighet | **9/9 PASS**, `runs/inventory-kan62-concurrency-r01/`: paket, replay, moms-/årsstängning och ägarisolering. Efter journalvakten; sista migrationen validerar tidigare årsavskrivning och ändrar inte dessa köpfall. |
| Tvåårskedja journal → moms/NE/balans/dashboard | **PASS**, `inventory-two-year-reports-r02.log`, underlag från `runs/inventory-sql-r07/accounting-evidence.json`. Även faktisk sparad journal från samtidighetskohort testad (`inventory-reports-r02.log`). |
| Panel och historiklänkar | **PASS**, `inventory-panel-r01.log`, `inventory-trace-ui-r01.log`: riktig komponent med syntetisk transport, 28 000 restvärde, bekräftelse, noll, tydliga spärrar och fortsatt säkert direktavdrag; mobil/desktop-länkar. |
| Domänsvit | **PASS**, `inventory-domain-r02.log`, inklusive befintliga moms-/NE-/SIE-/inventarieprov och nya inventarieregressioner. |
| Säkra regressionens resterande delar | **7/7 PASS**, `inventory-safe-regression-r01/results.json`; samma testkällor, endast isolerade outputvägar där nödvändigt. Tillsammans med domän och publik smoke täcker detta säkra regressionssvitens delar. |
| Standardbygge | **PASS**, `inventory-build-r01.log`: Next 16.2.6 Turbopack, TypeScript och 8/8 statiska sidor; endast syntetisk localhost-konfiguration. Tidigare Turbopack-problem återkom inte. |
| Publik smoke mot byggd app | **2/2 PASS**, `inventory-smoke-build-r01/`. Ingen autentiserad hosted skrivtestning. |
| Typkontroll, scoped lint | **PASS**, `inventory-typecheck-r03.log`, `inventory-lint-r02.log`; nya testscripts slutkontrollerade igen efter återstart. TransactionTable har **13 befintliga ESLint-fel**, samma regelantal som 89afeef (`inventory-table-lint-baseline-r01.json`). Full repo-lint påstås inte grön. |
| Körvakter, DB-invarianter, admin-delete dry-run | **PASS**, även upprepade efter återstart utan SQL-skrivning. 55 historiska migrationshashar och tre nya hashvärden stämmer. |
| Slutlig bevarandekontroll | **PASS**, `inventory-final-readonly-r01.json`: 60 syntetiska användare, 69 registerposter, 152 transaktioner, 323 journalrader, 29 årskörningar, 0 obalanser, 0 andra sessioner. Ursprungliga 19 användares rader oförändrade. Delade roller/medlemskap och andra databasers katalogmetadata oförändrade. |

Tidigare FAIL-försök var dokumenterade syntax-/testfixtures-/testobserverproblem och är bevarade. KAN-75:s korrekt nekade årsstängning i samma transaktion ändrades inte för testets skull: positiva årsstängningar verifierades i separata verkliga sessioner. Senaste relevanta omkörningar är PASS; inga kvarvarande produktassertioner är FAIL.

## Migrationer och kompatibilitet

Isolerad lokal PostgreSQL 17.11: `sololedger_kan62_disposable_20261021`, `127.0.0.1:5432`, OID 57199. Unik markör verifieras före skrivande steg. 55 tidigare migrationer plus följande tre framåtmigrationer är installerade endast där. Ursprungliga filer ändras inte. En syntaxfelsversion av den ännu ej installerade tredje migrationen rullades helt tillbaka; korrigerad version installerades och testades. Manifestet anger slutliga hashvärden.

Exakt förväntat **Staging-tillägg**, i ordning (måste återjämföras med live ledger före godkänd körning):

1. `20261020233000_kan62_rule_contract.sql` – tidigare verifierad checkpoint, inte publicerad.
2. `20261021120000_inventory_k1_depreciation_contract.sql` – gemensamt K1-kontrakt, lås och årsgräns.
3. `20261021123000_inventory_journal_boundary.sql` – inkommande inventariejournal kan inte kringgå årsgränsen.
4. `20261021130000_inventory_prior_year_validation.sql` – validera tidigare körning/årslängd och underlag.

Staging hade 54 migrationer vid senaste livegranskning; Production 52. Återspela inte baseline/historiska migrationer och använd inte include-all/repair för att jämna ut detta. Production kräver separat exakt historik-/releasebedömning.

Matchande klient och nya RPC-kontrakt måste publiceras tillsammans under kontrollerad acceptans: migration först med inventarieanvändningen pausad, kontrollera ledger/definitioner/grants, sedan klient. Äldre integer-års-RPC är **replay-only**; ny bokning kräver checked JSON-kontraktet. Äldre klienter kan stoppas och får inte beskrivas som fullt kompatibla. Ingen automatisk backfill av okända historiska år.

## Godkända normalfall och spärrar

Normala svenska betalda inköp med full eller ingen momsavdragsrätt, säkra direktavdrag/korttidsinventarier, aktivering och kollektiv K1-avskrivning för uttryckligen bekräftade normala kalenderår. Bekräftelsen omfattar att årets inköp är klara; senare aktivering som ändrar underlaget stoppas. Verifierade regelår är 2025/2026, andra år stoppas tills regelparametrar finns.

Aktiverade tillgångars kreditering, avyttring/utrangering, automatisk rättelse av årsavskrivning, osäkra ingående/importerade värden eller äldre körning utan verifierad årslängd samt förkortade/förlängda/okända år stoppas. Ingen utvidgning till EU-varor, obetalda fakturor, partiell momsavdragsrätt, andra tillgångsslag eller avskrivningsmetoder. Registeravslut av direktkostnadsförd utrustning är inte kreditnota eller bokföringsrättelse.

K1-källor som verifierades under implementationen: BFNAR 2006:1, konsoliderad K1-vägledning 2025, punkter 6.37–6.40 ([BFN](https://www.bfn.se/wp-content/uploads/vl06-1-k1enskilda-kons2025.pdf)); [Skatteverket – värdeminskning](https://www.skatteverket.se/foretag/drivaforetag/foretagsformer/enskildnaringsverksamhet/avdragforvardeminskning.4.361dc8c15312eff6fd32110.html).

## Nästa steg

Granska exakt lokal kandidat och förbered gemensam Staging-acceptans. Hosted Supabase JWT/HTTP, faktiskt Vercel-bygge/alias och autentiserad användaracceptans återstår där; lokala PostgreSQL-klientroller ersätter inte detta. Tidigare Staging-byggspärr/äldre alias måste hanteras i uttryckligen godkänd publicering. Rekommenderad acceptans: köp/paket med båda avdragsrätter → journal/moms/dashboard → aktivering → årsavskrivning → nästa år → NE R10/B4 och årsstängning; kontrollera spärrarna separat.

Endast lokala kod-/test-/dokumentationsändringar, lokala syntetiska databasprov och lokala commits ingår. Ingen push, hosted migration/dataändring, deployment, Jira-mutation eller ändring av Jessikas bokföring har utförts.
