# KAN-117 – minimal rättning av profilkonflikt över år

2026-10-26. Lokal rättning enligt Pontus uttryckliga beslut efter granskningen
av ac96638. **Ingen Staging-/Production-publicering är godkänd eller utförd.**
**Slutlig teknisk bedömning: PASS för Staging för den rättade kandidaten.**
Publiceringsspärren kvarstår tills separat exakt godkännande har lämnats.

## Rotorsak och ändring

Den gamla planhjälparen läste och kontrollerade bara periodrader i valt år.
En felaktig profilstart2025-01-01 kunde därför motsäga en redan fastställd
intern delperiod2026 utan att det hindrade skapande av en ny period2025.
Bekräftelsen omkontrollerade samma begränsade underlag och ärvde bristen.

Ny följdmigration **20261026220000_kan117_cross_year_profile_guard.sql**
ersätter endast den privata kan117_vat_period_plan. Ursprunglig opublicerad
migration20261026210000 är oförändrad. Följdmigrationen kräver exakt normaliserad
förbild för helperns källtext; okänd definition stoppar applicering.

- Planen läser ägarens interna sololedger-perioder vars start ligger mitt i
  deras kalenderintervall, oavsett valt år. Dessa är relevant befintligt
  underlag för fastställda första delperioder; nya sådana perioder gissas inte.
- Start och periodtyp ska matcha den sparade momsprofilen. Slutet ska motsvara
  periodtypens kalendergräns. Motsägelse ger blocked och utredningsbesked före
  årets vanliga periodplanering. Ingen profil eller historik ändras automatiskt.
- Underlagets id/start/slut/typ/källa, sorterat stabilt, ingår i planens avtryck.
  Även ett nytillkommet, korrekt delperiodsunderlag i annat år kräver därför
  ny granskning och uttrycklig bekräftelse. Inga nya perioder i andra år skapas.
- Båda publika funktionerna använder den gemensamma helpern. Bekräftelsen
  använder befintligt exklusivt ägarlås/profillås och omkontroll i READ COMMITTED.
  API-definitioner, signaturer, ägare, grants/search_path och låsordning är bevarade.
  Ingen ändring i klientens produktkod eller bekräftelsedialog behövdes.

Ingen ny tabell, transaktionskälla, kontering, beräkningsregel eller raderingsdomän.
Momsrapport, stängning/deklaration, NE/dashboard, betalningar/fordringar,
SIE/rättelser/undo och övriga årslåsregler ändras inte. Integrationsytan från
KAN-117-LOCAL-IMPLEMENTATION-20261026.md gäller fortsatt; bara kontrollunderlaget
före periodskapande utökas. Befintliga bokförings-/momsrader får inte ändras.

## Obligatorisk regression: rött före, grönt efter

Nytt permanent scripts/test-vat-period-cross-year-db.mjs körs genom
test:vat-periods:db. Hela dess syntetiska fixturetransaktion rullas tillbaka.

| Kontroll | Gammal ac96638 | Rättad kandidat |
| --- | --- | --- |
| Befintligt delår2026-06-02–2026-12-31, korrekt profil | complete | complete |
| Profilstart ändrad till2025-01-01, valt2026 | blocked | blocked |
| Samma felaktiga profil, valt2025 | missing – fel | blocked |
| Direktanrop efter felaktig profiländring | Tillät tidigare2025-skapande | Nekas23514 för både2025/2026, även2024 |
| Korrekt profil återställs | Inte täckt av gamla obligatoriska testet | complete för2026, not_applicable för2025 |
| Ursprunglig periodrad | Tidigare reproduktion bevarade raden | Samtliga fält exakt oförändrade; fortsatt bara en period |

Nya regressionen kördes först mot den gamla installerade kandidaten och
fallerade på missing i stället för blocked för2025. Efter den lokala
följdmigrationen passerar samma test. Inga syntetiska restrader kvar efter rollback.

## Lokal verifiering

Exakt befintligt syntetiskt mål verifierat före skrivningar: PG17,
sololedger_kan62_disposable_20261021,127.0.0.1:5432/OID57199 och unik
syntheticOnly-markör. Befintliga testkohorter/fixtures bevarade; nya kohorter
identifieras separat. Ingen ny DB, reset, roll-/lösenordsändring eller hosted-skrivning.

- **PASS:**28 databaskontrollgrupper plus obligatoriskt rollback-regressionsprov.
  Korrekt första delperiod och återställd profil för helår/kvartal/månad;
  konflikter i historiska år; nya/ändrade delperiodsgränser utanför valt år;
  avtrycksändring även vid nytillkommet korrekt underlag; ägarisolering.
- **PASS:** samtida profiländring, årslås, dubbla bekräftelser, gammal generator
  och faktisk initialize_first_vat_year_period. Bekräftelsen väntar på
  fastställande av delperiod i annat år, avvisar gammal plan och lyckas först
  efter ny granskning. Årsskifte testat med rollback-isolerad Stockholmsklocka.
- **PASS:** tidigare public/Auth/Storage-dataavtryck lika före/efter;
  befintliga bokföringsfunktioner samt båda publika KAN-117-API:erna oförändrade.
  Helperns ägare, ACL, SECURITY DEFINER och search_path exakt bevarade.
- **PASS:** faktisk panel/klient på1280px och390px med syntetisk transport.
  Ny korsårsblockering med tom datumlista ger begripligt besked och ingen
  skapandeknapp/dialog. Avbryt, dubbelklick och osäkert nätverkssvar fortsatt gröna.
- **PASS:** TypeScript, ändrade testfilers ESLint utan varningar, DB-invarianter
  och lokal Next-production-build med syntetiska processvärden mot localhost.
- **PASS:** full säker regression inklusive KAN-117-browserprov, domän-/historik-/
  UI-regression samt båda publika smokeproven. Nytt blockeringsfall i browsern
  kördes också separat efter komplettering av den syntetiska transporten.

Build/regression kördes med uttryckliga syntetiska processvärden mot localhost,
utan ändring av envfiler eller användning av riktiga konton. Befintliga varningar
om flera lockfiler, Node-modultyp och färginställningar kvarstår; inga nya lintvarningar.

Detaljer: coverage/kan117-cross-year-{red,db,build,regression}.log och
coverage/kan117-local/ respektive kan117-cross-year-local/ (ignorerade lokala bevis).
Sanerat slutkvitto: docs/testing/kan117-cross-year-fix-20261026.json.
Ingen Production-data eller credentials har lästs ut eller använts som fixtures.

Ändrade filer: följdmigrationen, scripts/test-vat-period-creation-db.mjs,
scripts/test-vat-period-cross-year-db.mjs (ny), scripts/test-vat-period-creation-browser.mjs,
tests/fixtures/vatPeriodCreationTransport.ts, package.json (endast DB-testkommandot),
Architecture.md, PROJECT_STATE.md, PROJECT_ARCHIVE.md, denna rapport, uppföljningsnotiser
i KAN-117-LOCAL-IMPLEMENTATION-20261026.md och KAN-117-SECURITY-REVIEW-20261026.md
samt det nya sanerade slutkvittot. Ingen produkt-UI eller package-lock ändrad.

## Kvarvarande gränser och nästa beslut

En sakligt felaktig men syntaktiskt giltig profil utan motstridigt fastställt
underlag kan fortfarande ge en felaktig hel kalenderperiod. Skatteverkets
register hämtas inte automatiskt; användaren måste granska datumen.
Ingen generell tidsversionerad momsprofil eller ny tolkning av importerad historik
byggs här. Ett legitimt profil-/frekvensbyte som inte stämmer med en befintlig
intern första delperiod kräver separat granskning; systemet gissar inte.
En saknad första delperiod skapas fortfarande inte som självservice.

Äldre ac96638 och granskningsbeslut4bf1acd bevaras som historik. Ny kandidat-SHA
är denna rättnings checkpoint enligt Git. Ingen tidigare BLOCKED-kandidat får
publiceras ensam. Lokalt test-PASS är inte ett godkännande att publicera.

Efter separat ledarbeslut behöver Staging få exakt godkänd kandidat och **båda**
nya KAN-117-migrationerna i ordning20261026210000 →20261026220000 via officiell CLI,
med förbilds-/grants-/versionskontroll. Därefter syntetisk UI→RPC→DB-acceptans:
obligatoriska2026/2025-fallet, korrekta kvartals-/månadsdelperioder och följande år,
ändrat korsårsunderlag under öppen preview, samtida fastställande/dubbelbekräftelse,
årslås och dator/fysisk mobil. Jämför journal, momsrapport, NE/dashboard,
betalnings-/fordringslägen och befintliga avslut före/efter: endast avsedda
bekräftade periodrader får tillkomma. Ingen Production-skrivtestning ingår.
