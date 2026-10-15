> AKTUELL STATUS: BLOCKED efter P2-granskning. Ingen P2-produktfix; STOPP enligt uppdragets tillitsvillkor.
> Se [P2 period blocker](KAN-74-P2-period-blocker.md). Tidigare redo-status och gröna resultat nedan avser kandidaten före nya P2-testet.

# KAN-74 – konservativ flerårsspärr, kandidat för ny oberoende granskning

2026-10-15. Lokal, ocommittad kandidat på codex/KAN-74-sie-opening-guard,
HEAD/base 1d297c1fd387be2f3f6cd54a780b8c58c2901732. Ledarchatten har godkänt
att även legitima fleråriga SIE-importer tillfälligt blockeras. Denna rapport
ersätter säkerhetsstatus och acceptanskriterier i de två tidigare rapporterna.
**Redo för ny oberoende granskning lokalt. Inte godkänd för hosted migration.**

## Rotorsak och avgränsad korrigering

parseSieFile/parseVerBlock i src/lib/sieParser.ts skiljer #IB från #VER men
saknar ett tillförlitligt öppningsbalansfält på #VER. importSieBatch i
src/lib/sieImport.ts skickar sådan #VER som en vanlig verifikation till
public.import_sie_batch(jsonb). Den lagras som sie_import, utan en strukturell
skillnad mot exempelvis en ägarinsättning. Kumulativa saldon kan då dubbelräkna
en andra hel öppningsbalans. Textmatchning eller 2010/2018 är otillräckligt.

Migrationsförslaget supabase/migrations/20261015120000_kan74_sie_opening_balance_guard.sql
ersätter endast import_sie_batch. Den tidigare kandidatens extra textbaserade
årsgränser ersätts av en text- och kontooberoende ettårspolicy. Befintlig äldre
textigenkänning i den ursprungliga #IB-dubblettkontrollen lämnas oförändrad;
den avgör inte den nya flerårsspärren. Ingen ändring av parser, saldo, NE,
export, årslåsning, KAN-71-funktioner, tabeller, policies, triggers eller grants.

## Exakt spärrlogik

1. Ägare hämtas enbart från auth.uid(). Företagets bokföring är i nuvarande
   schema avgränsad per user_id; organisationsnummer och företagsnamn är inte
   separata behörighetsgränser. Payloadens user_id/filnamn/text kan inte välja ägare.
2. Alla #VER-datum och effektiva journalraddatum valideras och måste ligga
   inom samma kalenderår. Angivet fiscal_year (från parserns #RAR 0 startår)
   måste överensstämma; #IB kräver detta fält. Utan #IB och #RAR härleds året
   från datumen och lagras på den NYA batchen. Befintliga batcher ändras inte.
   Filer över en kalenderårsgräns avvisas konservativt även som första import.
3. Låsordning: samtliga befintliga momsperiodslås, sedan ett transaktionslås
   per bokföringsägare för ALLA importer, sedan befintligt IB-dagslås.
   Endast READ COMMITTED tillåts så att en väntande import läser vinnarens
   committade historik efter låset. Befintliga moms-/hashkontroller bevaras.
4. Före första insert kontrolleras ALLA ägarens import_batches oavsett status.
   Annat eller okänt fiscal_year blockerar. Även completed, undone, pending
   och failed historik behandlas konservativt, utan att anta att status nollar saldo.
5. Dessutom kontrolleras faktiska transaktions- och journalår för tidigare SIE:
   source sie_import/sie_opening_balance, batchkoppling eller strukturella
   source_ver_series/source_ver_number. Avvikande år blockerar även om
   batchmetadata saknas eller är motsägelsefull. Båda tabellerna ägarfiltreras.
6. sie_import_undo är en daterad rättelsespegel, inte ett nytt importår.
   Den undantas från årshärledningen, medan original och batch fortfarande
   reserverar ursprungsåret. Ångring frigör alltså aldrig ett annat importår.
7. Tidigare skydd mot ny full #IB efter äldre manuell/journalförd historik
   kvarstår. Befintlig IB-dubblett, filhash, balansvalidering, låsta år och
   stängda/deklarerade momsperioder gäller som tidigare.

Flerårskonflikt ger P2074: ”Flerårig SIE-import stöds ännu inte. Importera
endast ett räkenskapsår per företag. Även tidigare ångrade importer kan begränsa
vilket år som kan importeras. Ingen bokföring har importerats.” Klientadaptern
bevarar servermeddelandet och har samma text som reserv. Befintlig
SieImportModal visar felet. Annat tidigare säkerhetsfel kan ha företräde.

## Tillåtna och blockerade fall

| Fall | Resultat |
|---|---|
| Säker första import, med eller utan IB | Tillåts |
| Ytterligare rörelsefil inom samma år | Tillåts enligt befintliga regler |
| Samma filhash / andra #IB samma år | Befintligt 23505 / P2001, ingen ny bokföring |
| Annat importår, med IB eller enbart rörelser | P2074, före första skrivförsök |
| Annat år med öppningsbalans som #VER, valfri text eller konto | P2074 |
| Nya året först, därefter gamla året | P2074 |
| Två olika år samtidigt | Endast vinnaren kan committa; förloraren stoppas |
| Vinnaren rullar tillbaka före nästa import | Nästa år kan bli den första importen |
| Ångrad import och nytt år | Blockeras; originalåret finns kvar |
| Ångrad import utan IB och ny fil samma år | Tillåts om övriga regler medger det |
| Historik redan över flera år eller okänt batchår | Fortsatta importer blockeras konservativt |
| Motstridiga år i payload, även icke-momsrader | Blockeras |
| Andra användare importerar andra år | Tillåts utan att ändra första användarens historik |
| Vanlig manuell bokföring/fakturor/moms | Deras skrivvägar är oförändrade |

Avsiktligt blockerade legitima fall: senare års rena rörelsefiler utan någon
öppningsbalans, byte av importår efter full ångring, filer med datum över ett
årsskifte samt i vissa fall fortsättning på ofullständig/okänd batchhistorik.
Även ett angivet brutet/förlängt räkenskapsår över kalenderår nekas här;
ingen ny modell för sådana år införs. Detta är den accepterade begränsningen.

## Verifiering

- Egen tidigare P1-reproduktion kvar som RED-bevis i lokal evidens: 2024
  IB 10 000 + 100, följt av 2025 #VER 10 100 gav tidigare bank 20 200.
  Nu blockeras andra importen före skrivförsök och banken stannar på 10 100.
- Den nya policysviten visades RED mot föregående kandidat före lokal applicering.
- test:kan74:db PASS: 22 uppdaterade grundfall + P1 + 14 policy-/behörighetsfall
  + åtta text/kontovarianter = 45 rollback-scenarier. Tre äldre förväntningar
  ändras avsiktligt: future_no_ib, no_ib_years och den första importen i
  existing_old_row får nu avslag. P2074 kontrolleras med tillståndsjämförelse
  och icke-transaktionella skrivvittnen på batch, transaktion, journal och
  verifikationssekvens; även försök till skrivning skulle fälla testet.
- Tolv verkliga tvåsessionsfall PASS, med observerad advisory-lock-väntan:
  båda ordningarna, med/utan IB, samma år tillåtet, P2001, momsens låsordning,
  P1 via 2018 och återställd vinnare. Två starkare isoleringsnivåer avvisas
  med 25001 utan batch, journal/transaktion eller verifikationssekvens.
- KAN-71:s tre SQL-sviter PASS; KAN-72 manuell bokföring och KAN-63
  kundfakturamoms PASS. Alla ursprungliga säkerhetsassertioner är bevarade.
  KAN-71 row_year_cross kan inte längre skapas via import. Testköraren
  konstruerar därför dess syntetiska historiska momsrad efter en giltig
  import inom samma rollback. Endast testets upplägg ändras i minnet,
  samt de äldre sviternas lokala DB-namnsspärr. Historiska produktdata ändras inte.
- Parser/klienttransport testas med åtta alternativa text/kontokombinationer;
  inga falska strukturella öppningsmarkörer antas. Klientens verkliga feladapter PASS.
- test:regression PASS (domänsvit inklusive KAN-71 rapporter, NE, dashboard,
  moms, export samt publik lokal Playwright 2/2). test:db-invariants PASS.
- Production-build, typecheck och fokuserad ESLint PASS. Bygget använder
  processlokala dummy-värden; ingen autentiserad hosted testning utförs.
- Alla övriga public-funktionsdefinitioner, ägare och ACL är identiska mot
  originalsnapshoten; importfunktionen behåller ägare, signature, SECURITY DEFINER,
  search_path och ACL. Ursprunglig exekverbar import-SQL bevaras, utöver att
  nya batcher lagrar det servervaliderade/härledda året.
- Ny lokal återapplicering bevarar antal/innehåll för befintliga syntetiska
  transaktioner, journaler, batcher, sekvenser, momsperioder och stängda år.
  Testköraren verifieras neka Production, Staging och vanlig lokal DB före anslutning.
- Alla 13 ursprungliga worktrees, HEAD och dirty states jämförda och bevarade;
  dokumentationscommit 11d8306, KAN-62/65 och package-lock är orörda.

Körning: sätt SOLOLEDGER_LOCAL_TEST_DATABASE_URL till en dedikerad loopback-DB
med namn sololedger_kan74_*, använd lokal PGPASSFILE utan att läsa dess innehåll,
applicera förslaget endast där och kör npm run test:kan74:db. Köraren applicerar
inga migrationer. Sekventiella tester rollbackar; samtidighetsfallen lämnar
tydligt syntetiska fixtures i den dedikerade DB:n. Ingen riktig användardata används.

## Kvarstående risker och releasevillkor

Ingen känd kringgång av olika ÅR genom den kontrollerade import-RPC:n kvarstår
i testade fall. Begränsningen är ingen fullständig SIE-dubblettmodell:
överlappande vanliga verifikationer eller en #VER-öppning inom SAMMA år kan
fortfarande accepteras när filhashen skiljer sig. Manuell bokföring kan också
skapa användarvalda belopp; dessa skrivvägar ingår inte i spärren. Fullständigt
förlorad/manipulerad historisk SIE-proveniens kan inte rekonstrueras säkert;
ingen datarättning eller textgissning görs. Historiska felaktiga saldon ändras inte.

Inte körda: hosted write-E2E, Staging-/Production-applicering, användarens
webbläsaracceptans av importfelet och full-repository lint (känd separat skuld).
Nästa oberoende granskning ska särskilt kontrollera årshärledning, historik/undo,
behörigheter och tvåsessionsbevis. Inget påstående om oberoende godkännande ännu.

Innan EVENTUELL hosted migration krävs färsk pg_get_functiondef och jämförelse
av relevant liveschema/ACL. Ägarens undantag gäller endast lokal utveckling
mot den verifierade definitionen från 14 oktober; tidigare liveanslutning
misslyckades före SQL. Ingen hosted migration eller publicering är godkänd.
Ingen datamigration/backfill behövs; förslaget ändrar endast framtida importbeslut.
Ledarchattens fastställda kontext (enda riktiga Production-kontot utan SIE)
gäller fortsatt; ingen ytterligare Production-inventering gjord eller behövd.

Ingen Jira-ändring, commit, push, hosted skrivning eller deploy utförd.
KAN-74 är inte Done. Nästa steg är ledarchattens beslut om oberoende granskning.

Lokal evidens: C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/single-year/.
Tidigare reproduktionsbevis ligger kvar i ../p1-followup/; inga tidigare bevis har raderats.
