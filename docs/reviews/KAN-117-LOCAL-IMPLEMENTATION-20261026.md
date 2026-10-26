# KAN-117 – säker förhandsgranskning av saknade momsperioder

**Senare ledargranskning: BLOCKED för Staging för ac96638.**
En känd profilkonflikt i ett annat år kan missas vid nytt skapande. Se
`KAN-117-SECURITY-REVIEW-20261026.md` och aktuell PROJECT_STATE.
Nedan LOCAL PASS redovisar tidigare utförda tester, inte godkännande för Staging.
Ingen rättning eller publicering har gjorts efter fyndet.

2026-10-26. **LOCAL PASS.** Lokal implementation enligt Pontus beslut. Ingen fjärrmigration,
Staging-/Production-publicering, push eller Jira-mutation ingår.

## Kandidat och omfattning

- L: audit-packages/KAN-100-app-release-20261024, gren
  codex/KAN-117-vat-period-preview, parent 02af89d. Produktbas e992e4f.
- KAN-117 läst i Jira: To Do/otilldelad. KAN-112/113 Done lämnas orörda.
- Root/L AGENTS, STATE, Architecture och tidigare läsande analys lästa.
  Installerad Next16-guide om klientkomponenter läst före kodändring.
- Läsande Production-kontroll av periodgenerator, årstäckning, låsgräns,
  första delperiod, SIE-/momsavslutsvägar samt constraints/index/RLS/grants.
  Inga användarrådata eller credentials sparade. Ingen ny användardatagranskning
  behövdes: scenariot verifieras här med syntetiska motsvarigheter.

## Hur periodbehovet beräknas

Ny läsande get_vat_period_creation_plan(year) använder endast auth.uid(), sparad
momsstatus/periodtyp/vat_management_from, befintliga perioder och årslås.
Den skapar inget, fungerar i READ ONLY och gissar varken från registreringsdatum
eller första bokning. Periodplanen gäller **endast valt kalenderår** från det
senare av årets början och profilstarten, med månad/kvartal/år enligt profilen.
En första delperiod måste redan vara explicit fastställd i befintlig historik.

Som tidigare genereras endast perioder som har börjat; serverns Stockholmsdatum
styr gränsen. Hela den påbörjade periodens slutdatum visas, även om slutet ligger
efter idag. För innevarande år med ännu ej påbörjade månader visas ”Alla
påbörjade momsperioder … finns”, så framtida månader inte felaktigt intygas.

Planen klassas som complete, missing, blocked eller not_applicable. Exakta
datumpar och periodtyper jämförs; överlapp, motsägande interna intervall,
importerad historik, olöst första delperiod och saknad period i låst år stoppar
skapande. Okänd/ofullständig profil stoppar också. Icke momsregistrerad firma,
framtida år och år före profilstart får förklaring utan skapandeknapp.
Ingen period i tidigare år skapas som dold sidoeffekt.
Årsväljaren tar också med profilstartens år till innevarande år, även när ett
historiskt år ännu saknar både bokföringsrader och momsperioder.

## Förhandsgranskning och bekräftelse

- Komplett täckning: diskret status med datum, ingen skapandeknapp. En öppen
  period räknas som befintlig; komplett täckning betyder inte avslutad/deklarerad moms.
- Lucka: datumen visas och ”Granska saknade momsperioder” öppnar en native dialog.
  Dialogen visar samtliga datum som skulle skapas och har Avbryt/Escape samt
  separat ”Bekräfta och skapa”. Granskning och avbryt gör inga skrivningar.
- Planens jämförelseavtryck binder ägare, år, Stockholmsdag, momsprofil,
  befintliga periodrader inklusive status/avslut och årslås.
- create_missing_vat_periods tar exklusiv befintlig ägarlåsgräns och profillås,
  läser om planen i READ COMMITTED och jämför avtrycket före INSERT. Klienten
  får inte skicka egna datum. Ändrat underlag kräver ny granskning/bekräftelse.
- Exklusivt ägarlås samordnar med befintlig generator, årslås, import och andra
  stödda bokföringsskrivningar. Befintlig unik nyckel/överlappskontroll bevaras.
  Bara nya öppna sololedger-perioder infogas; befintliga rader skrivs inte om.
- Klienten verifierar ägare/profilgeneration och binder samma verifierade bearer
  till begäran. Panelen återställs vid ändrat företag, år, profil eller periodlista.
  Dubbelklick spärras direkt. Efter fel/osäkert svar kastas förhandsgranskningen
  och status läses om; ingen automatisk omsändning av skapande sker.
- Saknad/äldre serverfunktion och felaktigt serverformat ger begripligt stopp,
  aldrig automatisk fallback till den äldre generatorn. Befintliga rapporter
  läses fortsatt separat även om periodplanen inte kan hämtas.

## Migration och integrationskontroll

Ny migration: **20261026210000_kan117_vat_period_preview.sql**.
Tre nya funktioner, inga tabeller/kolumner eller ändrade befintliga RPC:er.
kan117_vat_period_plan är privat. Läsning/bekräftelse har uttrycklig authenticated
EXECUTE; PUBLIC/anon/service_role nekas. Ägare postgres och fast search_path.
Ingen ny beständig domän: befintlig raderingslivscykel för vat_periods gäller,
delete_user_data_atomic/Edge-dry-run behöver inte ändras.

Kontrollerad integrationsyta:

| Yta | Konsekvens och verifiering |
| --- | --- |
| Journal/transaktion/källor | Ingen ny kontering eller källa. Skapande infogar endast periodmetadata. Tidigare radavtryck bevarade. |
| Momsrapport/perioder | Ny behovsstatus och bekräftelseväg. Aggregering, momsavslut/deklaration och rapportläsning oförändrade. |
| Årslås | Saknad period kan bli en öppen period; befintligt krav på avslut före årslås gäller fortsatt. Samtidigt lås stoppar nya rader. |
| NE/resultat/dashboard/uttag | Ingen ändrad beräkning eller klassificering; domänregression och tidigare data/funktionsavtryck verifieras. |
| Betalning/fordran/skatt/årsskifte | Inga händelser eller betalningar skapas. Kalendergräns testad med rollback-isolerad klockinjektion. |
| Rättelser/SIE/undo/lås | Befintliga RPC-definitioner/ACL bevarade; ny skapandefunktion använder befintlig gemensam låsgräns. |

Den äldre ensure_vat_periods finns kvar med sina befintliga skydd för kompatibilitet;
nya momsvyn anropar den inte. Äldre öppna appflikar får det nya flödet först efter
omladdning. Inga äldre migrationsfiler eller tidigare tillämpad historik har ändrats.

## Lokal verifiering

Isolerat mål: sololedger_kan62_disposable_20261021, 127.0.0.1:5432, PostgreSQL17,
OID57199 och tidigare godkänd unik syntheticOnly-markör. Namn/adress/port/OID/
markör/identitet verifieras före varje skrivning via befintlig guard. Ingen ny DB,
reset, delad roll/lösenordsändring eller fixture-rensning. Kandidatfunktionerna
installerade endast här, utan att förfalska Supabase-ledgern. Nya tydligt syntetiska
testkohorter och tidigare fixtures bevarade, även efter avbrutna testförsök.

- Databas: **PASS, 22 kontrollgrupper**. Helår/kvartal/månad, inre lucka,
  explicit första delperiod, nästa kalenderår, olöst delperiod, okänd/icke
  registrerad/ofullständig profil, historik/överlapp, gamla ägar-/års-/profilavtryck,
  verkliga API-avslag och samtidighet med profil, generator, dubbelbekräftelse
  och årslås. Årsskiftesinjektion rullades tillbaka och originalkroppen återkontrollerades.
- Alla tidigare public/Auth/Storage-raders sorterade avtryck och befintliga
  funktionsdefinitioner/ACL oförändrade före/efter. Befintliga stängda periodrader
  bevarade vid luckfyllning; inga journal-/transaktionsrader skapas av funktionen.
- Faktisk React-panel och klientservice med syntetisk RPC-transport: **PASS**
  på 1280px och 390px. Förhandsgranskning, avbryt/Escape/fokus, dubbelklick,
  inaktuellt underlag, ägar-/profilbyte, felaktigt svar/läsfel, osäkert nätverkssvar,
  hjälpinformation och ingen horisontell överströmning. Skärmbilder visuellt granskade.
- TypeScript, riktad ESLint och befintligt period-/rapportladdningstest: **PASS**.
- Next production-build: **PASS** med syntetiska processvärden mot localhost.
  Första försöket kompilerade men saknade Supabase-konfiguration. Inga envfiler
  lästes ut/ändrades. Befintlig varning om flera lockfiler kvarstår.
- Slutlig säker regression: **PASS**, inklusive nya KAN-117-browserprovet,
  domän-/historik-/UI-regression och båda publika login-smokeproven.
  Första körningens login-smoke stoppade av samma saknade lokala konfiguration;
  en avgränsad omkörning med syntetiska processvärden mot localhost blev grön.
  Den slutliga kompletteringen av historiska år verifierades dessutom med
  faktisk laddningscallback, TypeScript och ESLint. DB-invarianter PASS.

Detaljer ligger i ignorerade coverage/kan117-local, coverage/kan117-browser och
coverage/kan117-*.log. Sanerade slutkvitton och syntetiska bilder finns i
docs/testing/kan117-local/. Inga riktiga konton användes som testfixtures.

## Ändrade filer

- src/components/Momsrapport.tsx
- src/components/VatPeriodCreationPanel.tsx (ny)
- src/lib/vatPeriodCreation.ts (ny)
- supabase/migrations/20261026210000_kan117_vat_period_preview.sql (ny)
- scripts/test-accounting-panel-loads.mjs
- scripts/test-vat-period-creation-db.mjs (ny)
- scripts/test-vat-period-creation-browser.mjs (ny)
- tests/fixtures/vatPeriodCreationHarness.tsx (ny)
- tests/fixtures/vatPeriodCreationTransport.ts (ny)
- package.json (testkommandon; ingen dependency-/lockfilsändring)
- Architecture.md, PROJECT_STATE.md
- docs/reviews/KAN-117-LOCAL-IMPLEMENTATION-20261026.md (denna)
- docs/reviews/VAT-PERIOD-BUTTON-READONLY-20261026.md (föregående analys checkpointas)
- docs/testing/kan117-local/{verification.json,1280-complete.png,1280-preview.png,390-complete.png,390-preview.png}

## Kvarvarande gränser och föreslaget Staging-test

Ingen koppling till Skatteverkets register finns; profilens faktauppgifter måste
fortsatt vara korrekta. Osäker första delperiod kräver granskad separat hantering,
inte ett nytt självserviceflöde i KAN-117. KAN-102 kan senare återanvända den korta
hjälptexten; FAQ är inte ombyggd. Exklusivt ägarlås kan ge kort väntan mot annan
bokföring. Lokala browser-/DB-prov är separata; full hosted UI→RPC→DB återstår.

Efter separat godkännande: verifiera exakt Staging-kandidat/fzxqiqenqjzhlyxxpvhg,
applicera endast denna migration via officiell CLI med bevarad version och publicera
exakt godkänd app. Ingen automatisk publicering av andra lokala dokumentationskedjor.
Med dedikerade syntetiska konton verifieras (1) komplett delårshelår utan knapp,
(2) verklig lucka med exakt förhandsvisade datum, avbryt och bekräfta,
(3) inaktuell profil/annan flik och dubbla samtidiga försök, (4) låst år/olöst
delperiod/icke registrerad profil samt (5) dator/fysisk mobil. Kontrollera journal,
momsrapport, NE/dashboard och eventuella betalnings-/fordringslägen före/efter:
enbart avsedda periodrader får tillkomma; bokföring, belopp och avslut ska bevaras.
Pontus accepterar Staging före separat Production-beslut.

Stanna efter lokal verifiering/checkpoint. Ingen Jira-statusändring eller Done;
lokal commit är inte publicerad och innebär inte formell pushad HANDOFF READY.
Checkpointmeddelande: `fix(KAN-117): preview and confirm missing VAT periods`.
Exakt checkpoint-SHA läses ur Git; parent och produktbas anges ovan.
