# KAN-109 – lokal implementation för granskning

2026-10-28. Produktägaren och projektledaren har godkänt slutprototypen och gett GO för lokal implementation. **Ingen commit, push, merge, publicering, migration eller Jira-ändring ingår.**

## Granska den verkliga vyn

Öppna [LOCAL-IMPLEMENTATION.html](LOCAL-IMPLEMENTATION.html). Den använder de ändrade produktkomponenterna, appens riktiga meny och befintliga beräknings-/kontrollmodeller. Endast transporter och identitet ersätts av syntetiska exempel i flikens minne. Inga uppgifter kan skickas till en databas; filens nätverksanslutningar är spärrade. Övriga appvyer är platshållare i denna avgränsade granskning. Årslåset är frånkopplat.

Välj exempel i testlisten. Inkomstår 2025 har två syntetiska historiska versioner. Växla syntetiskt låst år för att prova sparknappens presentation. Det är en testkontroll, inte appens riktiga årslåsfunktion. Egna uppgifter fungerar även för öppet år. Sparande i denna granskningsfil finns bara kvar tills filen laddas om.

Designreferens: `../kan109-final-ne-20261028/prototype.html` och `SLUTLIG-DESIGNGRANSKNING.md` där. Första analysen och de tidigare fullständiga prototyperna är bevarade.

## Före och efter

| Tidigare vy | Lokal implementation |
|---|---|
| Långa öppna instruktioner före rapporten | Resultat och balans först; guide, kontroll och dokumentation är stängda från början |
| Svårt att hitta rätt arbetsdel | Fyra genvägar öppnar, navigerar och flyttar tangentbordsfokus |
| Fem omfattande steg samtidigt | Ett lässteg i taget, tydlig plats/uppgift och oförändrade fördjupningar |
| Kontroller och kontolista svåra att överblicka | Granskningsbesked med nästa åtgärd, fyra grupper och fortsatt spårning till journalen |
| Sparande och läsning sammanblandade | Tre tydliga ingångar: Spara NE-underlag, Dokumentera egna uppgifter, Visa sparade versioner |
| Hänvisning till årslås i Årsavslut | Förbered i Årsavslut; faktisk låsknapp under NE-rutorna |

Kort granskningssignal visas före beloppen. Fullständiga befintliga rapportvarningar och varningar vid berörda rutor finns kvar. Guidens läsposition är ingen klarstatus. Ett sparat underlag är uttryckligen ingen inlämning till Skatteverket.

## Säkerhetsavgränsning och beroenden

NE-beräkningar, kontomappningar, granskningsregler, ekonomiska skrivvägar, årslåsvillkor, arkivets kommandon, exportmodell, användargränser och datamodell är oförändrade. Ingen migration behövs. Arkivet ligger kvar utanför årsrapportens laddningsspärr, inom befintlig inloggnings-/abonnemangsgräns.

Egna uppgifter kan dokumenteras utan låst år eller fungerande aktuell rapport. Arkivets redan befintliga skydd vid konflikt, osäkert utfall och omförsök används fortsatt. Samma sparbegäran bevaras efter okänt svar; ett bekräftat sparande görs inte om därför att efterföljande historikläsning misslyckas. Historiska källor och uppgivna inlämningskällor förblir separata. Inget nytt deklarationsstatusvärde eller automatiskt inskick införs.

Databas-/RPC-prov med skrivning behövs inte för denna presentationsändring. Den ekonomiska integrationen har i stället avgränsats genom bytejämförelse av skyddade filer, jämförelse mot tidigare rapportkomponent och befintliga domän-/UI-prov. Syntetiska ägar-/sena-svarsprov verifierar klientpresentationen; de ersätter inte ett framtida godkänt Staging-prov av faktisk inloggning och RLS.

## Medvetna anpassningar från prototypen

- Den korta signalen räknar redan kända konton/rutor från rapporten. Den fullständiga granskningens exakta antal visas först när den lästs. Ingen extra läsning sker vid första sidöppning och inga obelagda nollbesked visas. Antalen kan därför skilja sig; signalen anger områden och kontrollpanelen granskningsbesked.
- Guide/kontroll-genvägar är avstängda medan årsrapporten inte är tillgänglig. Dokumentation och historik fungerar självständigt.
- Ny åtgärd kan inte ersätta ett pågående utkast eller en förhandsgranskning. Avsluta/avbryt först. Vanlig hopfällning bevarar utkastet i den monterade vyn. Byte av år, vy eller användare innebär inte att ett osparat utkast sparas.
- Okänt sparutfall håller dokumentationssektionen öppen. Hjälplänken öppnas i en ny flik så att ett utkast inte tappas vid hjälpläsning.
- Befintliga native-utfällningar i guiden finns kvar för återgång från Årsavslut. Inga granskningsbeslut eller svar börjar lagras.

## Exakt produkt- och provomfattning

Alla sökvägar nedan är relativa till produktkopian `audit-packages/KAN-100-app-release-20261024`.

Ändrade produktfiler:

1. `src/app/page.tsx` – koppling av genvägar/rapport och dokumentationssektion.
2. `src/app/globals.css` – avgränsad NE-layout, mobil och fokusutseende.
3. `src/components/NEBilaga.tsx` – ordning, rubrik och placering av bevarade varningar.
4. `src/components/NEDeclarationGuide.tsx` – stegvis presentation, genvägar och utfällning.
5. `src/components/NEUnderlagReview.tsx` – grupperad presentation av samma kontroller/spårningar.
6. `src/components/NEDeclarationArchive.tsx` – tre ingångar, utfällning, fokus och tydligare texter.
7. `src/components/YearEndGuide.tsx` – endast hänvisningstexter till de nya knapparna.
8. `src/lib/helpContent.ts` – endast hänvisningstexten i deklarationshistorikens FAQ.

Nya produktfiler:

9. `src/components/NESectionNavigation.tsx` – genvägar, öppning/fokus och granskningssignal.
10. `src/lib/nePresentation.ts` – kort presentation av redan befintliga rapportvarningar.

Ändrade prov-/körfiler:

11. `package.json` – nytt `test:ne-ux`, också i säker regression; inga beroendeändringar.
12. `scripts/test-ne-declaration-guide.mjs` – väljare/navigation för nya layouten; tidigare sak- och beloppsprov kvar.
13. `scripts/test-ne-review.mjs` – nya presentationsväljare; befintliga kontrollprov kvar.
14. `scripts/test-ne-account-coverage.mjs` – söker den nya rapportrubriken; samma varnings-/kontoprov.
15. `scripts/test-standard-booking-browser.mjs` – använder verklig ny navigeringskomponent, så att provets befintliga laddningsspärr/NE-barn inte ersätts med en tom platshållare.

Nya prov-/granskningsfiler:

16. `scripts/ne-ux-harness.mjs` – isolerad rendering av verkliga komponenter och offlinegranskning.
17. `scripts/test-ne-ux.mjs` – före/efter, navigation, mobil, sparutfall och isolering.
18. `tests/fixtures/neUxMocks.ts` – syntetisk bokföring till befintliga modeller.
19. `tests/fixtures/neUxReviewMock.mjs` – isolerad lästransport för browserprov.
20. `tests/fixtures/neUxArchiveMock.mjs` – minnesarkiv och syntetiska felutfall.

Dokumentation: denna rapport, `LOCAL-IMPLEMENTATION.html`, `STATE-FORE-IMPLEMENTATION.md`, verifieringsunderlag i `docs/testing/kan109-local-20261028/` och uppdaterade `PROJECT_STATE.md` i L och root. L:s `PROJECT_ARCHIVE.md` har en kort avslutsnotis för godkända designfaser; aktiv implementation ligger i STATE. Tidigare dirty STATE/ARCHIVE och historiska rapporter är separat bevarade; hela arbetskopians diff är därför större än KAN-109. Verifieringsmappen innehåller även de lokala bygg-/jämförelsehjälparna `implement.mjs`, `archive.mjs`, `lint-baseline.mjs`, resultatmanifest och skärmbilder; de två förstnämnda är arbetsunderlag och ska inte köras om över slutkoden.

## Verifiering

| Kontroll | Resultat |
|---|---|
| Typecheck | PASS, `npm run typecheck`, exit 0 |
| Next-build | PASS, exit 0, med processlokal syntetisk Supabase-konfiguration och falska nycklar. Inga miljöfiler ändrade. |
| Riktad lint | PASS, exit 0, ändrade NE-/hjälpkomponenter och nya prov/granskningsfiler |
| Bred källkodslint | FAIL: 50 fel och 3 varningar sedan tidigare. Samma anmärkningar som HEAD över147 befintliga källfiler; inga nya. Befintliga9 fel/1 varning i page.tsx ingår. Ingen orelaterad refaktorering. |
| Verklig NE-UI, fem bredder | PASS: 1440/1024/768/390/320 px. 70 före/efter-fall (sju syntetiska scenarier × öppet/låst × fem bredder), både standard och alla NE-rutor; samma belopp och årslåsknappar. |
| Navigation/guide/kontroll | PASS: stängd standard, fyra genvägar, fokus/tangentbord, fem steg, alla32 grupper, konton/verifikationer, rättelser och ingående balans. Noll nya läsanrop innan någon arbetsdel öppnas. |
| Dokumentation/arkiv | PASS: öppet/låst år, rapportfel med oberoende historik/egna uppgifter, bevarat hopfällt utkast, äldre version, senaste underlag och separat historisk inlämningskälla, konflikt, okänt utfall → avvisat auth-omförsök → samma begäran, bekräftat sparande följt av läsfel. |
| Export | PASS för vald versions HTML-innehåll/filnamn och innehållet som lämnas till utskriftsfunktionen. Hämtning och print-funktion fångas i provet; faktisk nedladdning till disk eller en PDF från operativsystemets dialog är inte verifierad. |
| Isolering/sena svar | PASS i syntetiska klientprov. Tidigare ägares lässvar visas inte efter ägarbyte. Noll externa nätanrop, browserundantag och sidöverflöden i NE-provet. |
| Skyddade filer/KAN-107 | PASS: 264 skyddade filer jämförda oförändrade; inkluderar ekonomiska modeller, server-/arkivfunktioner, hooks och DB-historik. KAN-107:s uttagskomponenter/modeller är oförändrade; dess FAQ-innehåll bevarat. Gemensamma sida/stilar/FAQ har bara avgränsad NE-diff. |
| Befintliga NE guide-/kontrollprov | PASS separat. Sakuppgifter, gamla regressioner och alla kontroller finns kvar; väljare anpassade till nya layouten. |
| Säker regression | Alla delsteg PASS, med nedan redovisad uppdelning. Fullkommandot fick inte ett sammanhängande exit 0 eftersom den publika appservern inte svarade i tid vid första starten. |
| Publik Next-browserkontroll | PASS, 3/3, separat avgränsat omprov på localhost3110 med syntetisk konfiguration; oförändrade auth-prov. |
| Avslutande kategori-/bokningsprov | PASS, exit 0. Verklig Home/NE: laddningsfel döljer gamla belopp, ägarbyte, osäkert bokningsutfall och exakt årslåsgräns i olika tidszoner. |
| Färdig granskningsfil från disk | PASS: öppnas som lokal fil, egna uppgifter och syntetiskt sparande på öppet år fungerar, inga HTTP-anrop eller browserfel. |

Testunderlag, resultatmanifest och skärmbilder ligger i `docs/testing/kan109-local-20261028/`; körloggar under `logs/`. Den nya sviten körs med `npm run test:ne-ux` och ingår i `npm run test:regression`.

Regressionens senaste fullkörning, `logs/coverage-kan109-regression-complete-result.log`, passerade nya NE-provet, hjälpcenter, momsperioder, arkivklient, hela domänsviten inklusive NE/uttags-/årsavslutsprov, historik och generell UI. Den stoppade före auth-assertionerna med `Timed out waiting for http://127.0.0.1:3109`. Ett avgränsat omprov med rätt lokal process-/nätåtkomst startade appen och passerade samtliga tre publika prov (`public-smoke-retry.log`). Kategoriprovet passerade (`category-final.log`). Bokningsprovets gamla komponentplatshållare dolde NE-grenen efter den nya omslutande navigationen; provstartaren använder nu den verkliga navigationen och samma sakassertioner passerar (`standard-booking-verified.log`). Inga nya produktändringar behövdes. Delstegen är därmed verifierade, men en enda full körning med exit 0 på slutliga provfiler ska inte påstås. Den exakta orsaken till första serverstartens timeout är inte fastställd.

Riktad slutlig lint för de anpassade provstartarna och diskgranskningsprovet passerade också. `check-review-file.mjs` och `review-file-result.json` dokumenterar kontrollen av den färdiga HTML-filen.

Tidigare misslyckade körningar ligger kvar som evidens: det första bygget saknade åtkomst till Google-typsnitten; nästa kompilering saknade en syntetisk servernyckel. Slutbygget passerade med komplett falsk konfiguration och fungerande typsnittshämtning. Äldre browserprov behövde nya väljare för den godkända layouten. Den nya provstartaren behövde säker browserkontext för `crypto.randomUUID`, synkronisering med genvägarnas fokus och fångad export i stället för testmiljöns avbrutna filhämtning. Produktsäkerhetskontroller eller sakassertioner har inte försvagats.

Fysisk mobil, riktig skärmläsare, autentiserat Staging-/liveflöde och faktiskt utskriven PDF ingår inte i den lokala verifieringen. Ingen skrivande Production-test har körts. Ingen verklig inlämning görs av SoloLedger.

## UX-risker och manuell acceptans

Kontrollantalet i den korta signalen och i den fullständiga granskningen kan skilja sig eftersom de beskriver olika nivåer. Ett besked om noll granskningsvarningar är aldrig ett skattegodkännande. Fullständiga rapportvarningar gör fortfarande en varningstung rapport längre; de har bevarats av säkerhetsskäl.

Hopfällning bevarar utkast och ett okänt sparutfall kan inte fällas undan. Det införs däremot ingen ny global spärr mot byte av vy/år eller stängning av webbläsaren. Utkast och omförsöksinformation sparas inte automatiskt mellan sådana byten, precis som i den befintliga lösningen. En eventuell beständig utkast-/återhämtningsfunktion kräver separat avgränsning och godkännande.

Prova särskilt de fyra genvägarna, alla fem guidesteg, konto → verifikation, öppet/låst års knappförklaringar, egna uppgifter samt läsning/export av en äldre version. Prova med tangentbord och smalt fönster. Fysisk mobil, riktig skärmläsare och faktiskt sparad PDF i operativsystemets dialog behöver mänsklig acceptans.

Hela denna presentation ryms i KAN-109. Ingen ny Jira-åtgärd behövs för att slutföra den godkända UX-omfattningen. Befintlig generell lintskuld är separat; nya kontrollregler, sparade godkännanden och ändrad ekonomisk logik ligger utanför uppdraget. KAN-118 för Jessikas Säkert uttag berörs inte.

## Historiskt Git-läge inför granskningsgodkännande

Lokal arbetsgren `codex/KAN-109-ne-ux`, HEAD `f2dbd6074697fafa4c5833a4c2e7b53615c3d405`. KAN-107:s grund är bevarad. Ingen commit har skapats och inga filer har stageats. Ingen publicering eller Jira-/databasskrivning har gjorts.

**Nästa steg är produktägarens och projektledarens granskning av denna lokala implementation.** Ingen commit eller vidare publicering görs innan nytt uttryckligt besked.

## Godkänd lokal checkpoint, 2026-10-28

Produktägaren har därefter granskat den verkliga implementationen och projektledaren denna rapport. Nytt uttryckligt GO omfattar lokal checkpoint och läsande Staging-förkontroll. Läs `../KAN-109-LOCAL-CHECKPOINT-20261028.md` för den exakta commitavgränsningen. Äldre vänteläge ovan är historiskt; push, merge, deployment, DB- och Jira-ändringar är fortfarande inte godkända.

Vid checkpointkontrollen ändrades endast det nya provskriptets referensläsning: före/efter och skyddade filer jämförs mot den fasta godkända Production-basen `f2dbd6074697fafa4c5833a4c2e7b53615c3d405`, även efter commit. `git cat-file blob` används för att undvika Windows sökvägsgräns med långa historiska migrationsnamn. Samma fullständiga riktade NE-UI-prov har körts igen med PASS. Ingen produktkod ändrades efter produktägarens granskning. Ingen ny felsökning av den dokumenterade regressionsserverns timeout har gjorts.

Den genererade lokala HTML-filen, loggar och skärmbilder ingår inte i checkpointen. Granskningsfilen kan återskapas från de committade komponenterna och fixturerna med `node scripts/ne-ux-harness.mjs --preview`.
