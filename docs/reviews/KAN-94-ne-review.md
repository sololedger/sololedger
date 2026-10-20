# KAN-94 – Kontrollera NE-underlaget, lokal verifiering

2026-10-18. Avgränsad implementation godkänd av Pontus efter läsande kartläggning.
**Lokal implementation/verifiering PASS. Pontus godkände 2026-10-19 lokal produktcommit, isolerad Preview och riktad hosted verifiering. Publicering/testresultat dokumenteras separat efter genomförandet. Ingen Production-release eller migration godkänd.**

## Bas och arbetskopia

- Production-bas: fa4997d3329ebf002281b4ca5a3f92340ede88f8, GitHub main och READY Production dpl_99ZC8JDq8RT9BUmZecuba8cLnTbR återlästa under förstudien. Ren export 377/377 filer byteverifierad där.
- Ren lokal klon från exakt denna commit, gren codex/KAN-94-ne-review, i C:/Users/Familjedator/.codex/visualizations/2026/10/18/01a15026-51da-7811-888b-ecda498bc81e/kan94-source. KAN-93-kopians ocommittade dokumentation kopierades inte. Origin pekar på lokal KAN-93-kopia, inte GitHub.
- Hanterad worktree-funktion misslyckades eftersom Desktop-repot saknade commitreferensen. Lokal klon användes utan ändring/fetch/reset av Desktop eller tidigare kopior. Installerade beroenden återanvänds via lokal junction; ingen dependency-/lockfilsändring.
- AGENTS, aktuell Desktop-handoff och relevant arkiv/Jira lästa. Jira KAN-94 To Do / otilldelad vid start, inga Jira-mutationer. Next.js lokala use-client-guide läst före kodändring. KAN-62/65 hold, KAN-95 separat.

## Lösning och integrationsyta

- Ny öppningsbar, skrivskyddad sektion i befintlig NE under samma årsval och befintlig abonnemangsgräns. Fungerar i öppet/låst år. Ingen extra läsning när sektionen är stängd.
- Granskningsbehov, förklaring och nästa steg först. Därefter grupper per NE-ruta med befintligt belopp, använda konton inklusive nettosaldo 0, källmärkt namn/fallback, period, klassificering och förklaring. Rutor utan kontounderlag döljs som standard men kan visas; använda nollkonton döljs inte.
- Direktresultatrutors och skattejusteringars bidrag hämtas med befintliga calculateBusinessResult/allocateNeSales/calculateNeTaxAdjustments. Kontotäckning använder collectNeAccountCoverage med separat includeZeroBalances-alternativ. Ingen egen konto-/skatteregel eller parallell NE-motor. Prober med enhetsbelopp identifierar endast befintlig rutkoppling, aldrig ett visat eller bokfört belopp. Bidrag stäms av mot kanoniskt NE-belopp.
- getNEData/getCumulativeResultat kan uttryckligen lämna redan lästa saldokällor för granskningsvyn. Standardreturvärden, läs-RPC:er, NE-belopp och varningar är exakt oförändrade när granskningsalternativet inte används. Befintlig hook/resultatmotor/skatte-/B10-/årslåsfunktion ändras inte.
- 3010 läser befintliga journalradsbundna beslut och visar svensk beslutsgrund. R2-netto och olösta antal/absolutbelopp stäms av mot get_ne_sales_summary, inklusive rättelser och nollsaldo. Ingen aktuell momsprofil läses. Utan särskilt beslut visas befintlig preliminär koppling eller sparat bokningsunderlag enligt samma regler som rapporten; inget nytt beslut sparas.
- R11/R12/R17 och B10 beskrivs som beräknade. B8/B14 delar förklarande skatte-/momssaldon; inga självständigt nollklippta kontobelopp påstås summera till rutvärdet. B10 visar både kumulativa ägarkonton och kumulativa resultat-/899x-konton utan nya IB-/överföringsjournaler. R15/R16=0 förklaras som befintligt beräkningsvärde, inte kontroll av obokförda uppgifter.
- Bakomliggande poster läses vid öppning av konto: datum, verifikationsnummer, transaktions-/journalbeskrivning, debet/kredit och eventuellt sparat NE-beslut. Transaktionens datum avgränsar perioden precis som saldo-RPC; avvikande journalradsdatum visas separat. Tidigare år och IB inkluderas vid kumulativt underlag; original och rättelser döljs inte. Detta är en läsande detaljlista, ingen genväg till ändring/radering/import/låsning.
- Ny lästjänst använder endast befintliga SELECT-rättigheter och befintliga rapport-RPC:er. Ägare kontrolleras serververifierat före/efter, användarfilter på samtliga tabellfrågor och kontroll av journal-/beslutsägare och kopplingar. Befintlig exact-count-paginering/chunkning, ingen tyst 1000-radersgräns. Kontoposternas netto stäms av mot visat saldo; okänt/ogiltigt/ofullständigt underlag ger läsfel. NULL debet/kredit följer samma coalesce(0) som live-RPC:erna.
- Underlagskomponenter monteras separat per användare/år; sena svar ignoreras vid byte/stängning. Laddning/fel visar inga gamla rapportgrupper. En vyns saknade varningar ger uttryckligen inget fullständighetsgodkännande. Ingen reparationsutvidgning av äldre global dataladdning/KAN-78 ingår.
- Integration: enbart läsning av journal/transaktioner/NE-beslut. Inga förändringar av VAT/momsperioder, dashboard/säkert uttag, betalningar/kundfordringar, SIE-payload/import/export, rättelser eller årslås. Alla tidigare bokföringskällor följer de befintliga rapporterna; inga nya source-värden. Ingen ny beständig datadomän, RLS/grant/deletion-lifecycle-ändring. Ingen momsvisning/ensure_vat_periods anropas av granskningsvyn.
- Relevanta live-schema/RLS/SELECT-grants och de tre läs-RPC-definitionerna lästes i READ ONLY/TLS under förstudien. Ingen användarbokföring lästes då. Ingen ny RPC eller migration behövdes.

## Exakt filurval

Ändrade befintliga filer:
- src/app/page.tsx – skickar användaridentitet till NE.
- src/components/NEBilaga.tsx – placerar den öppningsbara sektionen; befintliga rapporter/varningar/låsknappar kvar.
- src/lib/accountingService.ts – valfritt kanoniskt saldounderlag utan ändrat standardbeteende.
- src/lib/neAccountCoverage.ts – valfri inkludering av använda nollkonton, standard oförändrad.
- package.json – test:ne-review och anslutning till domän-/regressionskedjan; inga nya beroenden.

Nya filer:
- src/components/NEUnderlagReview.tsx – skrivskyddad, mobilanpassad vy och avgränsade laddningstillstånd.
- src/lib/neReview.ts – presentation och avstämning mot befintliga beräkningar.
- src/lib/neReviewService.ts – befintliga läsningar och provenienskontroll.
- scripts/test-ne-review.mjs – syntetiska service-/modell-/React-browserregressioner.
- docs/reviews/KAN-94-ne-review.md – detta underlag.

PROJECT_STATE.md uppdaterad i produktkopian och gemensam Desktop-handoff. Inga övriga befintliga Desktop-ändringar ingår i produktkopian.

## Verifiering

- **15 fokuserade kontrollgrupper PASS** via npm run test:ne-review: exakt standard-NE/befintliga varningar/RPC-anrop jämförda med Git-basens tjänst för tre år; verklig lästjänst mot syntetisk transport; blandad historisk R1/R2 och signerad rättelse; använda nollkonton och båda rättelseleden; IB/kumulativa konton/B8-B14/B10/skattejusteringar; KAN-77/90/91/92/93-besked; saknade historiska beslut; fel ägare/ändrad session; främmande transaktion/journal/beslut; läsfel/avsaknat exact count/förändrat saldo; saknad/ogiltig snapshot/avvikande NE-summa; 1001 journalrader; bevarat standardbeteende; nästa års förlust; SQL-enlig NULL/ogiltigt värde; riktig NE-integration öppet/låst år med noll extra läsningar när stängd.
- **Riktig React/Playwright 1440/390/320 px PASS:** öppna sektion/ruta/poster, historiska beslut och debet/kredit synliga, inget horisontellt överflöde/browserfel/nätanrop. Årsbyte under laddning, sena detaljsvar, användarbyte, sena rapportsvar och läsfel visar inte gamla data. Fallet utan varningar säger uttryckligen att deklarationen inte är fullständigt kontrollerad. Nätverk blockerat; alla data syntetiska.
- Bilder i test-results/kan94/review-{1440,390,320}.png och detail-{1440,390,320}.png. Desktop/mobil detalj- och översiktsbilder visuellt granskade; rapporterna genereras i git-ignorerad lokal katalog.
- **Befintlig KAN-93-regression PASS:** 26 service/SIE/IB/basfall, R-rader och KAN-88/90/91/92 bevarade; normal NE-browser 1440/390/320 och öppet/låst år PASS. **KAN-88 separat regression PASS:** R1/R2-fördelning, rättelsetecken, totalsummor och avvisat ofullständigt underlag.
- **Typkontroll PASS**, fokuserad ESLint för nya TS/TSX-filer och kontotäckningshjälparen PASS, git diff --check PASS. Ingen full ny repo-lint eller bred säker regression/produktionsbuild kördes i detta avgränsade uppdrag. Ingen hosted Staging-/Production-testning eller dataskrivning.
- Testteknik: initial sandboxåtkomst till återanvända beroenden löstes med godkänd lokal exekvering; en tvetydig browserselektor avgränsades till rätt NE-ruta. Testets beslutstyp justerades till schemaets reviewed_legacy. Inga förväntade bokföringsbelopp ändrades för att få gröna tester.

## Begränsningar och nästa steg

- Granskningen läses vid öppning, inte en realtidsvy under samtidiga bokningar. Läsfel/avstämningsavvikelse kräver stängning/ny öppning; flera SELECT/RPC-anrop utgör ingen gemensam transaktionell snapshot.
- Namn är endast kuraterad BAS-hjälp med källmärkning. Ursprungliga SIE-kontonamn saknas i den beständiga journalen och rekonstrueras inte. Namn avgör aldrig klassificering.
- Kontoöppning läser periodens transaktions-ID:n och relevanta journalrader med fullständighetskontroll. Stora kumulativa historiker kan ta tid; inga nya serveroptimeringar i denna version. Fler än 1000 rader testade lokalt, ingen hosted prestandagaranti.
- R15/R16, fullständigt nollade externa resultatkonton och verklig flerårig årslåsanvändning är inte nyverifierade deklarations-/årsskiftesregler. KAN-95 separat. Personalrelaterade konton bevaras och får granskning; ingen löne-/personalhantering eller gissad skattebehandling.
- **Staging kan förberedas efter Pontus godkännande** med exakt lokal kandidat och kort riktad hosted läsverifiering på dedikerat syntetiskt testkonto, användarisolering och visuell slutacceptans. Ingen DB-migration planerad. Git/Jira/releaseförkontroll krävs före eventuell publicering; Jira flyttas inte till In Review genom detta uppdrag.
