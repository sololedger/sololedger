# KAN-124 – lokal implementation och verifiering, 2026-10-31

Lokal kandidat, ingen commit eller publicering. Jira In Progress enligt uttryckligt GO. Alternativ A är implementerat; alternativ B och generellt kreditnoteflöde ingår inte.

## Kandidat och ändrade filer

Branch `codex/KAN-124-vat-correction-guard`, oförändrad HEAD `de30bf7a302087ea4b3c605426ec44fdd75d16f7`.

- `supabase/migrations/20261031204304_kan124_generic_vat_correction_guard.sql`
- `src/lib/accountingService.ts`
- `src/app/page.tsx`
- `scripts/test-kan124-local-db.mjs`
- `scripts/test-kan124-correction-ui.mjs`
- `package.json` – fokuserade testkommandon och UI-regression i domänsviten
- Denna rapport. Aktuellt handoff-tillägg i `PROJECT_STATE.md` är separat från produktkandidaten och får inte dra med dess tidigare lokala ändringar i en framtida commit.

Migration SHA-256: `b7bef556583827457303d6a129e0c618ef2de984378645b7e38d03f2d97d5e90`.

Migrationen lägger till en owner-only, läsande SECURITY INVOKER-hjälpare och ersätter den befintliga rättelse-RPC:n. Den ändrar inga tabeller, historiska data, globala kontoklassificeringar, befintliga RPC-grants, RLS eller årslåstriggers. Helperns EXECUTE återkallas från PUBLIC, anon, authenticated och service_role. Den anropas under rättelse-RPC:ns befintliga kontrollerade säkerhetskontext.

## Beteende

Den generiska rättelsen bedömer journalens faktiska nettobidrag per momskonto/ursprungsperiod. Rapportrelevanta 261*/262*/263*/264* omfattas; ett nollnetto i ruta49 är inte tillräckligt för att förklara posten momsfri. Ren 265x-aktivitet får ingen ny ursprungsperiodsspärr. Osäkert blandat moms-/avräkningsunderlag kräver separat kontroll.

Momsberörande vanligt underlag kräver entydiga SoloLedger-perioder för original och rättelse. Stängt/deklarerat ursprung nekas före nummerallokering och skrivningar. Saknade/överlappande/importerade perioder, motstridiga datum och momsberörande rättelse av rättelse ger granskningsavslag. Momsfria rättelser får ingen ny A2-spärr; övriga befintliga regler kvarstår.

Alla berörda ursprungs-/målmånader låses före transaktions-/journalrader, och periodrader låses före den slutliga statuskontrollen. Ett ändrat underlag ger retrybart avslag i stället för lås i omvänd ordning. Deklarationsbekräftelsens periodradslås samverkar utan ändring av deklarationsfunktionen. KAN-71:s SIE-gren och KAN-122:s nya bokföringsdatumsskydd behålls.

UI visar det svenska servermeddelandet utan dubbla felprefix för maskinidentifierade KAN124-avslag. Det hänvisar till momsrapporten/redovisningshjälp och förklarar att komplett rättelseflöde saknas. Ingen ny navigering, genväg, datumparameter eller påstådd deklarationsrättelsefunktion har införts.

## Exakt lokal miljö

- PostgreSQL 17.11, host `127.0.0.1` / localhost, port5432.
- Databas `sololedger_kan117_recovery_20261027`, OID69031.
- Markör `KAN117 recovery synthetic only 168702b9-8608-4e93-b30d-4fbc93490ff2`.
- Samma anslutning kontrollerar identitet/markör/port/roll/read committed och avsaknad av FDW/subscriptions före varje testkommando. Credentialfil används enbart av klienten och läses/visas/kopieras/hashas aldrig.
- Färskt avläst Production-kod för rättelse-RPC:n matchade lokal förutsättning: MD5 `27f2a921d0f64ab093eeb39f7ae432b7`. Endast läsande hosted metadata. Ingen Staging-/Production-skrivning eller hosted migration.
- Endast denna nya migration installerades lokalt, med dataavtryck före/efter. Ingen reset, borttagning av befintliga data eller ändring av serverklocka.

## Acceptans

Slutlig körning: `coverage/kan124-local-20261031/2026-10-31T21-02-11.056Z-d596cc73-c03b-4c0a-b8ce-1daab37ed008/result.json`.
**56 faktiska databaskontroller PASS, 27 av 28 acceptansområden PASS; A17 BLOCKED.** Den äldre KAN-71-matrisens 20 interna rättelsefall ingår dessutom i A20:s SQL-kontroller.

| Fall | Resultat | Verifierat |
|---|---|---|
| A01–A02 | PASS | Samma/senare öppna period; dagens rättelsedatum bibehålls. |
| A03–A04 | PASS | Stängt/deklarerat ursprung, samma/senare period, ingående och utgående 6/12/25 %. |
| A05 | PASS | Momsfria rättelser för olika ursprungsstatusar; ren avräkningspost får ingen ny momsbeloppsklassning. |
| A06 | PASS | Stängd/deklarerad målperiod, både2641 och annat rapportrelevant264*-konto. |
| A07–A09 | PASS | Ändrad profil/momssats, kostnad utan avdrag, verkligt nollbidrag och ruta49-noll med ändrade momsbelopp. |
| A10–A12 | PASS | Saknad/överlappande/importerad period, blandat osäkert underlag, datum inom samma eller olika perioder, historiskt NULL-datum. |
| A13 | PASS | Hela periodiseringspaketet nekas vid skyddad momsdel; momsfritt paket fungerar. |
| A14–A15 | PASS | Äldre låst år, senare öppet år och senaste låsta gränsen. |
| A16 | PASS | Verklig kundfordran betalas senare utan ny moms och med exakt betalningsreplay. Leverantörsskuld/betalning täcks även av KAN122-regressionen. |
| A17 | BLOCKED | Komplett generellt kreditnote-/återbetalningsflöde finns inte. Ingen sådan funktion har byggts eller felaktigt betecknats PASS. KAN-103 lämnas orört. |
| A18–A19 | PASS | Ingen ny klientstyrd undantagsflagga; direktskrivning nekas. Fakturabetalningsånger med/utan moms behåller egna spärrar och replay. |
| A20–A22 | PASS | SIE-härkomst och spärrar, momsberörande rättelsekedja, främmande UUID och helper-/anonbehörigheter. |
| A23–A25 | PASS | Faktiskt observerad väntan mellan backends vid avslut, deklaration, dubbla rättelser och ändrat underlag. Även annan användare kan fortsätta. |
| A26–A27 | PASS | Avslag och injicerat senare fel ger full rollback, oförbrukat nummer och oförändrade gamla journaler/rapporter/avslut/deklarationsmarkeringar. |
| A28 | PASS | Normal tillåten rättelse: journal, bank, momsrapport och verklig NE-beräkning stämmer. |

För Q2/Q4-dubbletten är rättelsen nu nekad. Q2 ruta48=500 och Q4=0 före/efter avslaget; tidigare deklaration påstås inte vara korrigerad. Det gamla sparade avslutet är oförändrat. Hjälparen och RPC-kroppen i databasen jämfördes exakt med migrationsfilens funktionskroppar.

Syntetiska specialfixturer: äldre årslås skapas direkt i separata konton. NULL-journalfallet kräver en historiskt inkonsekvent rad; enbart KAN122:s INSERT-trigger stängdes tillfälligt under tabellens DDL-lås, återaktiverades före RPC-provet och hela fixturen rullades tillbaka. Ett tillfälligt testtriggerfel injicerades för att verifiera sen rollback. Inga sådana undantag ingår i produktmigrationen. KAN-71:s gamla import-fixtur ersattes i testkörningen med källmärkta råjournaler; dess assertions behölls, med avsiktligt ändrad native manual_old-förväntan. Nuvarande riktiga receipt-baserade import/undo provades i KAN122-regressionen.

Ett nollbidragsfall testades i öppen period eftersom befintligt momsavslut avsiktligt nekar aktivitet där alla momskonton redan är noll. Den regeln ändrades eller kringgicks inte.

## Övrig verifiering och begränsningar

- KAN-122:s oförändrade lokala databasregression: **49/49 PASS**, inklusive kund-/leverantörsbetalningar, inventarier, moms, skatteflöden, SIE, lås, replay och isolering.
- Faktisk service och sidans rättelsehanterare i Chromium: **PASS**, begripligt intakt meddelande, inget falskt kvitto/refresh vid avslag, normal framgång kvarstår.
- TypeScript: **PASS**.
- Publik läsande auth-UI-smoke: **3/3 PASS** efter ett avgränsat omprov. Första provet saknade Supabase-klientkonfiguration. Omprovet använde enbart syntetisk lokal URL/nyckel och gjorde ingen verklig inloggning eller hosted bokföring. Det är inte ett DB-integrationstest.
- Lint: **inga nya fynd**. Befintlig page.tsx har samma10 fel/1 varning som HEAD. accountingService och nya testfiler har0 fynd. Ursprungliga fullständiga felmeddelanden innehåller flyttade radnummer; jämförelsen normaliserade kodramen men bevarade regel och feltext.
- Domänsviten inklusive ny KAN124-UI-regression: **PASS, exit0** (`domain-final.log`). Första tillfälliga köraren nådde sin fyraminutersgräns; omprovet fick slutföras utan denna för korta gräns. Originaltestens beteende ändrades inte.
- Övriga säkra regressionsdelar (hjälp, momsperiod-UI, deklarationsarkiv, historik, UI-runda, kategorier och standardbokningsbrowser): PASS.
- **Hela `test:regression` kan inte betecknas grön.** Dess första oförändrade NE-UX-byteguard använder den gamla Git-baslinjen `f2dbd607...`, som saknar den redan godkända KAN122-migrationen. Detta inträffar före A2-assertions. Ingen försvagning/ändring av det äldre testet gjordes.

## Dataintegritet och kvarvarande testdata

Installationen ändrade inga data. Slutligt avtryck för **alla33 publika tabellers redan befintliga data och Auth-identitetsmetadata** motsvarar före-implementationstillståndet efter undantag enbart för verifierade nya syntetiska ägare. Funktioner/grants och tabellkontrakt förblev oförändrade under testerna. Bevis: `coverage/kan124-local-20261031/final-data-integrity.json`.

Seriella testfixturer rullades tillbaka. Samtidighetsprov kräver gemensamt synliga, committade fixturer:25 nya KAN124-märkta lokala konton,76 transaktioner och187 journalrader finns kvar, inklusive kohorter från avbrutna testkörningar. Även KAN122-regressionens nya syntetiska kohort är specificerad i slutkvittot. Inget rensades brett eller i gamla konton. UUID-listor finns enbart i lokala testbevis.

## Jira-bilagor och publiceringsgräns

Exakt två godkända filer bifogades KAN-124 och lästes tillbaka för byte-/hashkontroll:

- Attachment10000, REPORT.md,13516 bytes, SHA256 `9eed7ce01d9eca81a175a8720ea37b9291c305cd430bdab11d77f115743b457c`.
- Attachment10001, SPECIFICATION.md,22999 bytes, SHA256 `88238f2e86062c57ce77dd3acc457ca1e4f92c6d78b24ec08cd5f30802797b6c`.

Inga hemligheter, autentiseringsuppgifter eller personuppgifter ingår i dessa underlag. Originalfilerna är oförändrade. Enda övriga Jira-mutation var övergång21 till In Progress när implementationen började. Ingen kommentar, ny ärendebeskrivning eller annan status ändrades; KAN34/103/123 lämnades orörda.

## Risker och nästa beslut

Spärren kan stoppa slutförandet av ett verkligt momsberörande bokföringsfel tills separat redovisningshjälp eller framtida kontrollerat rättelseflöde finns. Den reparerar inte tidigare felaktigt periodiserade rättelser. Två fortfarande öppna perioder kan fortfarande kräva annan skattehantering än generisk spegling. Äldre saknade/importerade perioder ger avsiktligt granskningsstopp. Ingen faktisk förekomst hos Jessika/andra Production-användare har inventerats.

Nästa steg: granska lokal diff och besluta om A17-avgränsningen samt hantering av den äldre blockerade testbaslinjen. Därefter krävs separat GO för commit och senare Staging. Ingen automatisk statusändring till In Review/Done, ingen alternativ B och ingen publicering.

## Tillägg 2026-11-01 – avgränsad testjustering och full lokal regression

Detta tillägg ersätter den äldre slutsatsen ovan om blockerad NE-UX-baslinje. Tidigare rapporttext och testbevis är bevarade. Endast testinfrastruktur, syntetiska testfixturer och verifieringsdokumentation ändrades i detta steg. Ingen produktkod, package.json eller migrationsfil ändrades. Ingen Jira-åtgärd, hosted databasskrivning, installation, commit, push eller deployment utfördes.

### Exakta teständringar

| Fil | Ändring och syfte |
|---|---|
| `scripts/check-kan124-product-integrity.mjs` | Ny, separat produktintegritetskontroll mot godkänd Production-revision `de30bf7a302087ea4b3c605426ec44fdd75d16f7`. Endast exakt granskade innehållshashar för accountingService, page, package.json och KAN124-migrationen tillåts. Kontrollerar322 filer, inklusive otrackade nya produktfiler/migrationer. KAN122 kräver uttryckligen oförändrade bytes och godkänd SHA256. |
| `scripts/test-ne-ux.mjs` | Använder den nya integritetskontrollen. Den äldre visuella/beteendemässiga NE-referensen `f2dbd6074697fafa4c5833a4c2e7b53615c3d405` behålls. Bredare gamla undantag för tidigare arbetsområden behövs inte mot den senare godkända Production-baslinjen. NE-UX-assertions och skärmbredder är oförändrade. |
| `scripts/test-kan124-local-db.mjs` | Hämtar verkligt databasdatum samt aktuell hel månad/kvartal och år. Byter ut utgångna oktoberfixturer och expliciterar periodtyp. Historiska april-/Q2- och årsskiftesfall behålls som historiska fall. Samma56 kontroller körs, med A17 separat. |
| `scripts/test-kan122-local-db.mjs` | Endast det negativa provet för pågående år använder databasens verkliga innevarande år i stället för konstant2026. Historiska årslåsfall och samtliga49 assertions bevaras. |

Inga klockor ändrades. Tester kräver att de fasta historiska fallen ligger i det förflutna; de låtsas inte att servern har ett annat datum. Aktuell testdag var2026-11-01; månad2026-11-01–2026-11-30, kvartal2026-10-01–2026-12-31.

**Särskilda statusfixturer:** en pågående full momsperiod kan inte legitimt stängas före periodslut. Sex försvarsprov (samma stängda/deklarerade ursprungsperiod samt stängd/deklarerad målperiod för2641/2642) gör därför först ett riktigt avslutsanrop och kräver befintligt23514-avslag, ”Framtida momsperioder kan inte stängas.” Period, journal-/transaktionsantal och nummerläge måste förbli oförändrade. Därefter sätts en uttryckligen artificiell stängd/deklarerad status på just det nya syntetiska kontots period, under postgres i en transaktion som rullas tillbaka. Statusfixturen har inget normalt momsavslutsverifikat och bevisar inte att en pågående period får avslutas/deklareras. Rättelse-RPC:n anropas fortfarande som authenticated. Fullt avslutade historiska perioder använder normala avsluts-/deklarations-RPC:er. Produktspärrarna har inte försvagats. Tidigare dokumenterade historiska NULL-/årslåsfixturer kvarstår oförändrade.

### Fullständigt resultat för begärda verifieringsområden

| Kontroll | Resultat |
|---|---|
| Hela `npm run test:regression` | **PASS, exit0**, en sammanhängande full körning, inget delkommando hoppades över. |
| NE-UX | **PASS**,322 skyddade filer;14 före/efter-jämförelser vid vardera1440/1024/768/390/320px. Även ägarisolering, arkiv/replay, sena svar och bevarad tidigare lokala NE-preview. |
| Övrig full regression | **PASS:** hjälp, momsperiod-UI, deklarationsarkiv, hela domänsviten, historikgrupper/presentation/bilagor, UI-runda, kategorier och verklig Home/TransactionForm-browser. Bokslutsguidens samtliga fem bredder ingår. |
| KAN124 lokal DB | **56/56 PASS**.27/28 acceptansområden körbara; A17 är separat produktlucka och räknas inte PASS. Även KAN71:s interna tidigare assertions ingår. |
| KAN122 lokal DB | **49/49 PASS**, inklusive datumgränser, årslås, periodisering, fakturor, leverantörsbetalning, inventarier, moms/skatteflöden, SIE, samtidighet, replay och isolering. |
| KAN124 UI/service | **PASS** i fulla domänsviten: verklig service och sidans rättelsehanterare, intakt svenskt avslag i Chromium, inget falskt kvitto/refresh, normal framgång. |
| Lokal klient-smoke | **3/3 PASS**, localhost `http://127.0.0.1:31024`. Endast utloggade vyer; ingen verklig inloggning, återställningsbegäran eller registrering. Syntetisk processlokal klientkonfiguration pekade på localhost och inte hosted Supabase. |
| `npm run typecheck` | **PASS, exit0**. |
| ESLint: fyra ändrade testfiler + befintligt KAN124-UI-test | **PASS, exit0**, inga fynd. |
| ESLint: accountingService/page jämfört med HEAD | Service0 fynd. Page har **oförändrade10 fel/1 varning**; ingen ny regel-/feltext eller allvarlighetsgrad. Detta är inte ett påstående att sidans fulla lint är grönt. Produktkoden ändrades inte för att rätta äldre lintskuld. |
| Syntaxkontroll och `git diff --check` | **PASS**. |
| Negativa baslinjekontroller | **PASS**: ändring i orelaterad resultatmotor/NE-komponent, KAN122, tillåten servicefil med fel innehåll, KAN124-migration och package.json avvisas. Även okänd otrackad migration och saknad kandidat stoppas. Prov sker i minnet utan verklig produktmutation; vanliga CRLF-skillnader i källkod tolereras, KAN122:s migration kräver exakt bytehash. |

Ingen begärd testsuite misslyckades efter testjusteringen. Extra läsande slutkontrollskript behövde korrigeras: första räknaren antog felaktigt att alla99 försökta fixturägare måste finnas kvar;75 var redan helt tillbakarullade. KAN122 märker sina konton i e-post/företagsnamn, inte i Auth-metadata som KAN124. Slutkontrollen verifierar därför respektive faktisk märkning. Den första lintjämförelsen tog också med flyttade radnummer i ESLints inbäddade kodram; slutjämförelsen bevarar regel, allvarlighet och full felbeskrivning före kodramen. Dessa var kontrollskriptsantaganden; dataavtryck och båda databassviternas egna integritetskontroller hade redan passerat. Ingen produktregel ändrades. Node-modul-/färgvarningar och Nexts varning om flera lokala lockfiler dokumenteras i originalloggen; inga sådana inställningar ändrades.

### A17 och befintliga flöden

A17 är **SEPARAT PRODUKTLUCKA, INTE PASS**. Ett komplett generellt affärsmässigt kreditnote-/återbetalningsflöde finns inte och byggdes inte. Den kända avgränsningen är accepterad av projektledaren och hindrar inte rekommendationen om en lokal checkpoint för alternativ A. Inget nytt Jira-ärende eller ändring av KAN34/103/123 gjordes.

| Befintligt stött flöde | Relevant verifiering i denna körning |
|---|---|
| Kundfordran från äldre bokslut betalas senare | KAN124 A16 och KAN122 verkliga lokala DB-anrop, journal/moms/äldre historia och idempotent betalning. |
| Fakturabetalning ångras | KAN124 A19 verklig DB, med/utan moms och öppen/deklarerad ursprungsperiod, atomiskt avslag och replay. |
| Leverantörsskuld och senare betalning | KAN122 verklig DB; full regression av leverantörsservice, rapporter, panel och uttagsberäkning. |
| Leverantörsbetalningsånger/ombetalning/makulering | Befintliga modellregressioner i `test-withdrawal-suppliers.ts`, signerad journalekonomi och ogiltiga kedjor, ingår i fulla regressionskommandot. Ingen ny separat leverantörs-DB-svit kördes i detta steg. |
| Momsavräkning och skattekontorörelser/återbetalning | KAN122 verklig DB för befintligt avslut/deklaration/avräkning/överföring. Skatteåterbetalningens riktning, belopp, kontextbyten och åtgärdsval täcks av befintlig `test-tax-account-movement-ui.ts` och momsavräknings-/domäntester i full regression. Det är inte ett nytt generellt kundkreditnoteflöde eller ett nytt DB-prov för samtliga återbetalningsriktningar. |
| Vanlig rättelse och periodiseringspaket | KAN124 verklig DB; momsfritt fortsätter fungera, momsberörande skyddas, aktuell öppen rättelse ger korrekt bank/moms/NE. |

### Miljö, integritet och kvarvarande fixturer

Enbart befintlig isolerad PostgreSQL17 på127.0.0.1:5432, databas `sololedger_kan117_recovery_20261027`, OID69031. Markör: `KAN117 recovery synthetic only 168702b9-8608-4e93-b30d-4fbc93490ff2`. Identitet och frånvaro av FDW/subscriptions kontrolleras i samma anslutning före varje databaskommando. Ingen migration installerades eller återställdes i detta steg. Databassviterna kördes sekventiellt.

Båda sviterna verifierade oförändrade tidigare data, funktioner/grants och tabellkontrakt. En extra gemensam slutjämförelse mot tillståndet före den första sviten bekräftade **alla33 publika tabellers tidigare data och tidigare Auth-identitetsmetadata oförändrade**, med undantag endast för denna körnings verifierade nya syntetiska ägare.24 nya märkta konton,39 transaktioner och87 journalrader finns kvar från samtidighetsprov; övriga seriella fixturer rullades tillbaka. Tidigare fixturer/evidens bevarades. Ingen rensning.

Körkvitton:

- Full kedja: `coverage/kan124-regression-20261101/full-regression.log`.
- KAN124: `coverage/kan124-local-20261031/2026-11-01T09-45-03.113Z-8b3c2530-03e1-42e5-a73b-e39b3724f4db/result.json` samt `calendar.json`.
- KAN122: `coverage/kan122-local-20261031/2026-11-01T09-46-17.868Z-0a93f44f-f3f4-4776-8207-fc57a6715daa/result.json`.
- Gemensam integritet: `coverage/kan124-regression-20261101/data-integrity.json`.
- Typecheck/lint/negativa baslinjeprov och slutmanifest finns i samma lokala coverage-katalog. Dessa ignorerade körbevis ingår inte i commitkandidaten.

### Uppdaterad exakt kandidat och rekommendation

**Rekommendation: GO för separat godkännande av en lokal checkpoint-commit**, med följande10 filer och inget annat. Ingen commit är utförd. Ingen Staging-/Production-publicering är godkänd av detta testresultat.

Rot: `C:\Users\Familjedator\Desktop\Sololedger Multi User App\sololedger_multi_user\audit-packages\KAN-100-app-release-20261024`.

1. `supabase/migrations/20261031204304_kan124_generic_vat_correction_guard.sql`
2. `src/lib/accountingService.ts`
3. `src/app/page.tsx`
4. `package.json`
5. `scripts/test-kan124-local-db.mjs`
6. `scripts/test-kan124-correction-ui.mjs`
7. `scripts/check-kan124-product-integrity.mjs`
8. `scripts/test-ne-ux.mjs`
9. `scripts/test-kan122-local-db.mjs`
10. `docs/reviews/KAN-124-LOCAL-VERIFICATION-20261031.md`

KAN124-migrationen är byteoförändrad: SHA256 `b7bef556583827457303d6a129e0c618ef2de984378645b7e38d03f2d97d5e90`.
KAN122-migrationen finns kvar och är byteoförändrad: SHA256 `ccea0bda6cad36470d81a1dfcf8613933eaf2c123525240ec5970863b0cf01de`.
Alla fyra tidigare godkända produkt-/packagefiler motsvarar exakt före-steget-hasharna. Samtliga övriga skyddade produktfiler/migrationer matchar godkänd Production-baslinje.

Gren `codex/KAN-124-vat-correction-guard`, HEAD `de30bf7a302087ea4b3c605426ec44fdd75d16f7`, tomt index. Alla302 tidigare otrackade filer finns kvar;303 nu, inklusive den nya integritetskontrollen. PROJECT_STATE.md och PROJECT_ARCHIVE.md är byteoförändrade från början av detta steg, inklusive tidigare lokala ändringar, och **ingår inte i kandidaten**. Detta tillägg har lagts till efter byteoförändrad tidigare verifieringsrapport. Inga användardata utanför nya syntetiska lokala kohorter ändrades. STOP och invänta projektledarens beslut om lokal commit.
