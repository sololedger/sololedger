> AKTUELL FAS: den godkända server-/kvittovägen är nu implementerad och lokalt verifierad.
> Se [implementationsrapporten](KAN-74-server-import-implementation.md) för aktuell status och återstående releasehinder.
> Tidigare designbeslut/STOPP och testresultat nedan är historiskt underlag.

# KAN-74 P2 – reproducerat; STOPP vid saknat betrott periodunderlag

2026-10-15. Kandidaten är fortsatt **BLOCKED**, inte redo för godkännande.
Implementeringsdelen stoppas enligt uppdragets uttryckliga villkor: servern
kan inte verifiera hela den deklarerade perioden med nuvarande importunderlag.
Ingen P2-produktkorrigering eller ändring av migrationsförslaget har gjorts.

## Reproduktion först, i ordinarie testsvit

scripts/test-sie-import.mjs:78 använder verklig parseSieFile och importSieBatch
med enbart nätverks-/inloggningsanrop ersatta i testet. Två syntetiska filer
har samma #VER A 1 20241001 och balanserade rader 1930 +100 / 2018 -100.
Enda skillnaden är #RAR 0 20240701 20241231 respektive 20240701 20251231.
Parsern bevarar skilda start/slutdatum, men RPC-payload och kanonisk hash blir
exakt identiska. Det nya kravet på skilda serverunderlag faller avsiktligt RED.

supabase/tests/kan74_sie_opening_guard.sql:197 lägger motsvarande P2-avslag
sist efter de övriga fallen. Verklig autentiserad import accepterar fortfarande
payloaden (Expected P2074, received NULL). Samma fel har även verifierats genom
att återspela EXAKT den payload som verklig parser och klient producerade.
Allt kördes i dedikerad loopback-DB och rullades tillbaka. Att nu neka just
denna identiska payload skulle också neka motsvarande legitima enårsfil.
Detta är ett reproducerande blockertest, inte en komplett framtida periodmodell.

## Verifierad rotorsak / tillitsgräns

- src/components/SieImportModal.tsx:65–68: filen läses/avkodas/parsas i webbläsaren.
  Originalfilen laddas inte upp till en server som källa för importbeslutet.
- src/lib/sieParser.ts:459: #RAR läses som index/start/end. Vid 583–584 blir
  parseResult.year endast de fyra första siffrorna i startåret för #RAR 0.
- src/lib/sieImport.ts:64–92: payloaden innehåller fiscal_year, IB/RES och
  verifikationer/rader; inga periodgränser, originalbytes, serverlagrad filreferens
  eller serverutfärdat kvitto som binder period till bokföringsunderlaget.
- Samma fil:150: hashen räknas också i klienten; hela fiscalYears ingår inte.
  Den är inget oberoende äkthetsbevis och används serverledes som dubblettnyckel.
- import_sie_batch i migrationsförslaget kontrollerar verkligt skrivna
  verifikations-/journalår, angivet startår och historik. Varken dessa datum
  eller tidigare batchers fiscal_year kan avslöja en oanvänd del av den
  inkommande filens deklarerade period.

Det saknas alltså serverunderlag för att skilja de två tillåtelsefallen åt.
Ett nytt valfritt start/end-fält kan utelämnas; obligatoriska men fristående
klientfält kan ändras till 2024-12-31 och ändå passa alla bokföringsrader.
Även om klienten skickar originaltext separat måste servern binda kontrollen
till det faktiskt importerade underlaget och stänga möjligheten att gå runt
den via dagens direktanrop med egen JSON. Sådan bindning finns inte idag.
Ingen skenkontroll baserad enbart på klientmetadata har införts.

## Två extra granskningsfall införda och gröna

- historical_journal_year: befintlig syntetisk SIE-batch/transaktion ligger
  2024, journalrad 2025. Ny 2024-import stoppas med P2074 före skrivförsök.
- mixed_year_history: redan befintliga syntetiska SIE-batcher/transaktioner
  och balanserade journaler i både 2024 och 2025. Nya importer för 2024,
  2025 och 2026 stoppas alla före skrivförsök.

Historiken konstrueras endast inom rollback-fixturen. Inga riktiga eller
tidigare bestående bokföringsrader ändras. Ordinarie testkörarens räknare
har uppdaterats till 16 policyfall och kräver även det nya P2-resultatet.

## Tester och avgränsning

- 47 rollback-scenarier PASS: tidigare 45 plus de två nya historikfallen.
  Befintlig P1-reproduktion, dubbletter, användarisolering, behörigheter,
  år/momsregler och avslag före skrivförsök ligger kvar.
- Nya P2-testet RED både i verklig klienttransport och autentiserad RPC.
  npm run test:regression avslutas därför RED i domänsvitens sista test.
  Tidigare domäntester passerar; publik Playwright startar inte efter felet.
  Ingen helgrön regressionssvit eller redo-status påstås.
- KAN-71 tre SQL-sviter, KAN-72 manuell bokföring och KAN-63 fakturamoms PASS.
  Samma redan dokumenterade KAN-71-fixturanpassning i minnet: row_year_cross
  byggs som syntetisk historik inom rollback; säkerhetsassertioner är oförändrade.
- Två verkliga samtidighetsfall med observerad advisory-lock-väntan PASS:
  samma år kan fortsätta, annat år blockeras. Båda sessionerna rullar tillbaka,
  eller den avvisade sessionen avslutas med rollback. En befintlig tydligt
  syntetisk KAN-74-fixture återanvänds; inga användare skapas eller raderas.
- De tidigare tolv commit-baserade racerna kördes INTE om, eftersom de lämnar
  bestående syntetiska fixtures. RPC:n har inte ändrats i denna uppföljning.
- Production-build, separat typecheck, riktad ESLint och test:db-invariants PASS.
  Build använder processlokala dummy-värden, utan deploy eller hosted skrivning.
- Fingeravtryck/antal för lokala transaktioner, journaler, batcher, sekvenser,
  momsperioder, stängda år samt Auth-antal jämfördes före/efter: oförändrat.
  Inga credentialinnehåll har lästs/kopierats/hashats.
- Parser, klientens produktkod och hela migrationsförslaget är byte-identiska
  med före uppföljningen; lokal RPC-definition oförändrad. Inga migrationssteg.
- Inte körda: hosted write-E2E, browseracceptans, hosted livejämförelse,
  full-repo lint. Ingen hosted åtgärd är godkänd.

## Alternativ som kräver ledarchattens beslut

1. **Utöka den betrodda importgränsen (rekommenderat om policykravet består).**
   Låt servern läsa och parsa den mottagna SIE-källan och härleda både full
   period och hela bokföringspayloaden från samma underlag, eller använd ett
   serverutfärdat kvitto bundet till en oföränderlig mottagen fil och dess
   parserresultat. Obligatorisk serverkontroll före atomär skrivning; ingen
   oskyddad alternativ RPC-väg som kan utelämna/förfalska periodfält.
   Detta kräver separat beslutad omfattning för filhantering/parsning,
   klient/server-kontrakt, behörigheter och policy för saknad/ogiltig #RAR.
   En klientberäknad hash eller ett osignerat periodfält räcker inte.
2. **Tillfälligt stoppa all SIE-import** tills betrott underlag finns.
   Det är möjligt att stänga säkert på servern, men det bryter kravet att
   vanliga enårsimporter ska fungera och kräver därför ett nytt uttryckligt beslut.
3. **Ändra policy till faktiskt importerade datum**, med dokumenterad risk att
   deklarerade perioder inte kan garanteras. Det återtar P2-kravet och är ingen
   teknisk korrigering; inte rekommenderat utan medvetet nytt acceptansbeslut.

Ingen av dessa utvidgningar/ändringar har implementerats. Att bara lägga till
periodfält och ändå kalla kontrollen säker är inte ett godtagbart alternativ.

## Arbetsläge

Ändrat i denna uppföljning: tre testfiler (klient, lokal körning och SQL), denna
rapport, statusmarkering på föregående rapport samt PROJECT_STATE.md.
Äldre ocommittat produktarbete, samtliga andra worktrees och dokumentationscommit
11d8306 bevaras. Inga Jira-ändringar, commits, pushar, hosted migrationer, deployer,
datarättningar eller ändringar av saldo, NE/export/historik. KAN-74 är inte Done.

Evidens: C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/p2-period/.
verification.json, identical-payloads.json, client-p2-red.log, db-p2-red.log,
exact-parser-payload-red.log, regression.log samt före-snapshots finns kvar.
Färsk live pg_get_functiondef/schema/ACL-jämförelse är fortfarande obligatorisk
före eventuell separat godkänd hosted migration. Avvakta ledarchattens beslut.
