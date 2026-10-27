# KAN-107 – lokal implementation och användarhjälp

2026-10-27. Lokal kandidat efter Pontus GO för godkänd `prototype-dashboard-guide-v2.html`. **Ingen commit, push, deployment, databas- eller Jira-ändring. Stanna före Staging.**

Komplettering efter separat verifieringsuppdrag: de tre publika auth-proven **PASS 3/3** och hela sammanhängande `npm run test:regression` **PASS, exit 0**, med oförändrad produktkod/testdefinition. Läs [KAN-107-LOCAL-VERIFICATION-20261027.md](KAN-107-LOCAL-VERIFICATION-20261027.md) för miljödiagnos, loggar och kvarstående osäkerhet om den gamla verktygskraschens exakta utlösare. Äldre FAIL-resultat nedan är historisk evidens, inte aktuell slutstatus. Inget publicerat eller committat.

## Bas och scope

- Produktkälla L: `audit-packages/KAN-100-app-release-20261024`.
- Arbetsgren `codex/KAN-107-withdrawal-guidance`, skapad från `e4f35502724c83c6e8493fadb61dc8a09035e3d1`. HEAD oförändrad; produktarbetet är ocommittat.
- Root är fortsatt äldre dokument-/verktygskopia på staging/3d0a032. Den är inte produktpushkälla.
- KAN-107 återläst Task/Medium/To Do/otilldelad, utan Jira-mutation. KAN-102:s publicerade produktbas och tidigare KAN-117-material är bevarade.
- Ingen ekonomisk klassificering, beräkningsregel, RPC, migration, RLS, grant, bokföringsskrivning eller miljöfil ändrad. Ingen ny datadomän eller raderingslivscykel.

## Levererad funktion

- Säkert uttag ligger kvar i samma femkortslayout. Kortets yta är klickbar, med separat tillgänglig knapp för tangentbord. Uppskattningar visas neutralt med begränsning, inte som ett grönt klartecken.
- Panelen har fast rubrik/stängning och återgång, separat innehållsscroll, låst bakgrund och återfört fokus. Datorbredd högst 740 px; mobilbredd med små yttermarginaler.
- Belopp, status, begränsning och nästa rekommenderade kontroll syns först. Blockering/laddning/läsfel visar inget gammalt uttagsbelopp. Känd nolla skiljs från okänt belopp.
- Kontrollöversikten skiljer nödvändiga kontroller, återanvändbara sparade uppgifter och frivilliga kompletteringar. En okänd bokföringskonflikt hänvisas till granskning, aldrig till en godkännanderuta. Årsvarningar och alla ursprungliga problem finns kvar i detaljerna.
- Enskilda kontroller och år kan öppnas, uppdateras och återöppnas direkt. Inget linjärt ”nästa steg” krävs. Utkast finns endast i komponentens minne, per kontroll/år. Paus och hjälp sparar ingenting. Ägare/datum avgränsas fortsatt av befintliga sessionsnycklar.
- Varje kontroll har kort direkt hjälp: innebörd, vad som ska anges, var uppgiften finns och ett relevant syntetiskt exempel. Sju fördjupningar är också sökbara i ordinarie Hjälp & FAQ, med samma innehållsmodell som KAN-102.
- Kontextlänkar visar rätt FAQ-artikel inne i panelen. Återgång återställer samma kontroll/år och utkast. En vanlig frågelänk i ny flik öppnar ordinarie FAQ. Ingen ägare, kontrolluppgift eller summa skickas i URL eller historik.
- Beräkning, samtliga problem, avräkningar, överföringar och aktuella daterade kontrolluppgifter finns i utfällbara detaljer. Ingen historisk version skrivs om eller raderas. Som tidigare visar klientens läsväg aktuell revision, inte hela versionskedjan.

## Bevarad sparväg och kända/okända värden

`useWithdrawal` och `withdrawalService` är oförändrade. Verifierad profil/ägare, `get_withdrawal_context`, `save_withdrawal_assessment`, tidigare revision och bokföringssignatur används fortsatt. Bara vald fact ersätts; andra kontroller/år följer med oförändrade. Sparad kontroll stänger panelen som tidigare och underlaget återläses. Ingen lokal klarmarkering ersätter modellens bedömning.

Formulärutkast binds till den signatur **och revision** de öppnades mot. Om en ny revision läses in med samma bokföringssignatur får ett gammalt utkast inte tyst skrivas över den nya uppgiften. Användaren måste uttryckligen börja om med just den aktuella kontrollen. Detta bevarar versionskonfliktens avsikt när utkast nu kan finnas kvar mellan kontroller.

Nya beloppsfält börjar tomma. Befintliga styrkta nollor återges som 0. En särskild knapp kan användas endast när användaren själv uttryckligen har kontrollerat att just fältets belopp är 0. Tomt, osäkert underlag, paus och kryssruta ersätter aldrig ett belopp.

Skattekontot behöver faktiskt saldo, rätt tecken/datum samt separat bekräftelse om registrerade händelser. En skatteuppgift kräver fortsatt skattekontoavstämning. Redan debiterat, beslutat som ännu inte ingår och slutligt återstående netto är separata fält. Preliminäruppgifterna bevaras även vid slutbesked; saknade värden får inte ärvas som antagna nollor. Negativt slutligt netto och slutbesked för pågående år tillåts inte av befintlig modell.

## Verifiering av underlag och hjälp

- Lästa oförändrade produktmoduler: uttagsmodell/bedömning, service/hook, dashboard/årsprocent, kund-/leverantörsvalidering, KAN-102:s FAQ/navigering samt relevanta migrationskontrakt.
- Production `wbaxmuvudpnkvuliicuy`: läsande `pg_get_functiondef()` för `get_withdrawal_context(date)` och `save_withdrawal_assessment(date,uuid,text,jsonb)`. Bekräftar protocol 3, ägarbunden läsning, revisions-/signaturkontroll och fältkontrakt. Inga kunddata lästa och inga funktioner körda för att skriva data. Inga nya påståenden om omtestad live-RLS eller full databasintegritet.
- [Skatteverket: skattekonto och kontohistorik](https://www.skatteverket.se/foretag/skatterochavdrag/skattekontobetalaochfatillbaka/) – saldo/historik och att inbetalningar inte är öronmärkta.
- [Skatteverket: preliminärskatt](https://www.skatteverket.se/foretag/skatterochavdrag/skattekontobetalaochfatillbaka/preliminarskattforforetagochforeningar) – beslut, betalningstillfällen och var beslutet finns.
- [Skatteverket: besked om slutlig skatt](https://www4.skatteverket.se/rattsligvagledning/edition/2026.6/326463.html) – beskedets beräkningsbilaga och personliga skatteunderlag; officiellt sökresultat återverifierat, direkt automatisk hämtning av just den sidan gav Request Rejected. Ingen slutsats om kundens fältvärden dras från detta.
- Hjälpens myndighetsfakta och modellens fältbetydelser hålls åtskilda. SoloLedger gör ingen automatisk fördelning mellan privata inkomster, firmans skatt eller olika år. Vid oklarhet ska användaren pausa och stämma av underlaget; ingen rad pekas ut som universellt kopieringsvärde.

## Integrationskontroll

| Yta | Bedömning |
|---|---|
| Journal, transaktionskällor, RPC-bokning | Oförändrade, inga nya källvärden eller bokningsvägar. |
| Moms, perioder, avräkning, deklaration | Samma bedömning/underlag. Registrering/rättelse sker i befintliga flöden. |
| NE/resultat, balans och årsslut | Ingen ändring i motor/rapporter/lås. |
| Dashboard, årsprocent och uttag | Endast presentation och explicita kontrollutkast; belopp kommer från samma modell. Årsprocentens sparning i skattekortet oförändrad. |
| Fakturor, betalningar, skulder | Samma verifierade klassificering och reserver; ingen dubbelräkningsregel ändrad. |
| Rättelser, SIE, återföring, lås, årsskifte | Oförändrade underlags-/blockeringsregler. |
| Isolering och historik | Befintliga ägar-/datumsgränser och DB-konfliktkontroll kvar; inga nya lagringsplatser. |

Ingen bokförings-E2E med DB-skrivningar kördes: journal-/moms-/NE-/betalnings-/låslogik och DB-kontrakt är oförändrade och skrivtester är inte godkända här. I stället provas riktiga service/hook/UI med syntetisk transport, exakta fact-belopp, konflikter och befintliga domän-/rapportregressioner. Om scope senare kräver ändrad ekonomisk logik eller DB-funktion ska arbetet stoppas för separat beslut.

## Ändrade filer för KAN-107

| Grupp | Filer |
|---|---|
| Produktkomponenter | `src/components/WithdrawalCard.tsx`, nya `WithdrawalPanel.tsx`, `WithdrawalSummary.tsx` |
| Presentation och innehåll | nya `src/lib/withdrawalPresentation.ts`, nya `withdrawalHelp.ts`, `helpContent.ts` |
| Regression | nya `scripts/test-withdrawal-guidance.mjs`, nya `test-withdrawal-presentation.ts`; uppdaterade `test-annual-tax.mjs`, `test-auth-focus.mjs`, `test-help-center.ts`, `test-withdrawal-browser.mjs`, `test-withdrawal-conflicts.mjs`; `tests/fixtures/withdrawalMocks.ts` |
| Testkoppling | `package.json`: två nya prov i befintlig domän/säker regression, inga beroenden eller lockfil ändrade |
| Dokumentation | `docs/HELP-CONTENT.md`, denna rapport och aktuell projektstatus; tidigare rapporter/prototyper bevarade |
| Lokal granskning | `docs/reviews/kan107-20261027/LOCAL-PRODUCT-REVIEW.html`, dess lokala bygg-/provskript och bilder/kvitto. Syntetiskt transportlager, inga liveanslutningar |

Befintliga dirty `PROJECT_ARCHIVE.md`, gamla rapporter/fixturer, rootens övriga ändringar och alla tidigare KAN-102/KAN-117-/KAN-107-filer ingår inte som ny produktkod och har inte rensats eller återställts.

## Testresultat

Riktade prov har passerat: uttagsdomän/adapter, revisions-/transportkonflikter, årsfördelning och femkortslayout, faktisk modal/hook på dator/mobil, fokus-/scroll-/felvägar, kontobyte och bevarade utkast vid samma användares auth-förnyelse. Nya prov omfattar 21 kr, okänt kontra 0, separata preliminärbelopp, slutligt netto med bevarade preliminäruppgifter, kontextuell FAQ/återgång, osparade utkast, blockerat skattekontoberoende och gammal revision med oförändrad bokföringssignatur.

Riktad lint: 0 fel/0 varningar. Typecheck PASS. Lokalt produktbygge PASS med syntetisk konfiguration; första miljöförsöken saknade typsnittsåtkomst respektive lokal Supabase-konfiguration. Inga envfiler skapades/ändrades. Detta är ingen verifiering av driftkonfiguration eller publicerbar deployment.

Slutlig sammanhängande säker regression: **INTE grön**. Hela delen fram till publika auth-smoke (FAQ, momsperioder, deklarationsarkiv, domän/UI, historik och UI-round) PASS. De tre publika auth-proven misslyckas innan inloggningssidan visas: felunderlaget visar Turbopack-krasch i `globals.css`/PostCSS, där hjälpprocessen avslutas före anslutning. Inga auth- eller byggkonfigurationsfiler ändrades. Första miljöförsöket fastnade i lokal serverstart; efter avgränsad diagnos/omkörning lämnas detta som ett separat verifieringshinder före Staging. Logg: `coverage/kan107-regression-accepted-20261027.log`, felunderlag i `test-results/public-auth-*`.

Ett tidigare prov hittade en faktisk UI-miss där kortets utökade klickyta täckte återförsöksknappen vid läsfel. Rättad och riktat omtestad; ingen assertion försvagad. Efter sista presentationsjusteringen har typecheck och nya presentationsprovet körts igen. Nästa åtgärd prioriterar saknat skattekonto, därefter bank och årsuppgifter utan att beräkna om belopp eller klarmarkera kontroller.

Slutlig kod: nya formulärprovet PASS i 1440/768/390/320, granskningsfilen ombyggd och PASS i 1440/390/320, riktad lint PASS utan varningar och slutligt produktbygge PASS (`coverage/kan107-build-final-source-20261027.log`). Regressionens två prov efter auth-smoke kördes separat: kategori-UI samt faktisk Home/TransactionForm PASS på dator/mobil. Ingen ytterligare omkörning av det orelaterade Turbopack-felet. Playwright använder den redan installerade webbläsaren genom processlokal sökväg; ingen installation eller konfigurationsfil ändrades.

Kvitton/loggar finns lokalt under `coverage/kan107-*`. Ingen känslig kunddata eller riktiga nycklar ingår. Lokal granskningsfil med riktiga komponenter: 1440/390/320 PASS, inklusive klick på hela kortet, hjälp/återgång och inga nätverksanrop/fel/överbredd. Riktade formulärprov: 1440/768/390/320.

## Kvarstående och nästa steg

- Fysisk mobil och verklig skärmläsare återstår; emulering är inte samma sak.
- Full versionshistorik har ingen ny läsväg i denna kandidat. Äldre versioner bevaras av samma befintliga datamodell.
- Personliga skatter kan fortfarande kräva avstämningshjälp. Innehållet förklarar gränsen men ersätter inte kundens styrkta underlag.
- Utkast finns i minnet under aktuell ägare/datum; de är inte beständiga efter omladdning/utloggning.
- Inga Staging-/Production-skrivtester, migrationer, publiceringar eller miljöändringar har gjorts.
- Publika auth-smoke behöver verifieras i fungerande lokal körmiljö före Staging; hela säkra regressionen kan inte redovisas som grön.

Pontus granskar den lokala produktkopian och hjälpen. Testa särskilt att ändra en tidigare kontroll direkt, pausa utan saldo, läsa FAQ och återvända till samma utkast samt skilja debiterad skatt från bankinbetalning. Godkänn därefter exakt scope/filer för eventuell lokal commit och separat Staging-publicering. **Ingen Staging-åtgärd utförs utan nytt godkännande.**
