# KAN-117 – ledargranskning av migration och första delperioder

2026-10-26. **BLOCKED för Staging för produktkandidaten ac96638.**
En konkret profilkonflikt över årsgränsen kan kringgå den nya periodkontrollen.
Ingen lokal rättning eller publicering har gjorts. Föreslagen minsta rättning
behöver nytt ledarbeslut. De tidigare gröna testerna omfattade inte denna kombination.

## Granskat underlag och verifiering

- AGENTS, aktuell STATE, KAN-117 i Jira (To Do/otilldelad), tidigare analys,
  implementationsrapport, migration och klientflöde lästa. Ingen Jira-mutation.
- Produktkopia L ren på ac96638ad492a0bbee5fa5feeebbe07a30b71366 vid start.
  Gren codex/KAN-117-vat-period-preview; lokal origin är fortsatt KAN62-kopia.
- Migration 20261026210000_kan117_vat_period_preview.sql oförändrad, SHA256
  157469939451edc5ceed54d2cfadd843d94e4726cc12e90ca452a97c3002f93e.
- Befintliga lokalt installerade funktionskroppar jämförda med migrationen:
  alla tre exakt lika efter normalisering av radslut. pg_get_functiondef,
  ägare, SECURITY DEFINER, search_path och effektiva API-rättigheter lästa.
- Befintlig isolerad lokal DB verifierad med namn/adress/port/PG-version/OID/
  unik markör: sololedger_kan62_disposable_20261021,127.0.0.1:5432/PG17/OID57199.
- Tio riktade datum-/frekvensfall samt det befintliga delårsscenariot och den
  nya reproduktionen körda med nya syntetiska fixtures i en enda transaktion.
  Allt rullades tillbaka; samtliga tidigare public/Auth/Storage-dataavtryck
  jämfördes före/efter och var lika. Ingen ny installation/migration kördes.
- Tidigare verifierade samtidighets-/ägar-/roll-/replaytester återanvändes;
  ingen ny bred regression/build behövdes när endast dokumentation ändras.
- Sanerat kvitto: docs/testing/kan117-security-review-20261026.json.
  Körbart lokalt granskningsprov: coverage/kan117-security-review/review.mjs
  (ignorerad evidens, inga hosted-anslutningar).

## Blockerande fynd: känd konflikt i ett annat år kontrolleras inte

Syntetisk reproduktion med samma periodform som uppdragets befintliga scenario:

1. Profilen har årsvis moms från 2026-06-02. En intern öppen period
   2026-06-02–2026-12-31 finns. Plan2026 är complete och skapande nekas.
2. Ändra enbart den syntetiska profilens hanteringsstart till 2025-01-01.
3. Plan2026 blir blocked: den befintliga delperioden motsäger profilens nya
   förväntade helår. Denna konflikt upptäcks alltså av nuvarande kod.
4. Välj i stället 2025. Plan2025 blir missing med intervallet
   2025-01-01–2025-12-31. Förhandsgranskningen erbjuder bekräftelse.
5. create_missing_vat_periods accepterar samma plan och infogar perioden.
   Den befintliga 2026-raden är exakt oförändrad. Hela provet rullades tillbaka.

Orsak: kan117_vat_period_plan läser bara periodrader som överlappar valt år
(migrationens rader28–30 och motsägelsekontrollen senare i funktionen).
Även jämförelseavtrycket omfattar bara dessa periodrader. Bekräftelsefunktionen
läser om samma begränsade plan och upptäcker därför inte den redan kända
profilkonflikten i 2026 när 2025 skapas.

Detta är mer än ofrånkomligt felaktig inmatning: databasen innehåller redan
motstridigt underlag och systemet kan upptäcka konflikten i en annan årsvy.
Det uppfyller inte kravet att motsägelsefull profil ska stoppa nytt skapande.
Ny period kan påverka vilka momsrapporter/avslut som användaren uppfattar som
obligatoriska. Själva skapandet gör ingen kontering eller deklaration.

## Vad begränsningen om första delperioder faktiskt betyder

En första delperiod får **inte** skapas genom att användaren klickar förbi en
varning. När den saknas ger planen blocked, knappen saknas och servern nekar
bekräftelse även om API:t anropas direkt. Saknade datum kan visas som intervall
som behöver utredas; de är då inte ett godkänt skapandeförslag.

| Profil och valt startår | Saknad första period | Faktiskt beteende |
| --- | --- | --- |
| Helår från 2025-06-02 | 2025-06-02–2025-12-31 | Blockerad, ingen bekräftelse tillåts |
| Kvartal från 2025-06-02 | 2025-06-02–2025-06-30 | Blockerad; senare hela kvartal kan inte skapas i samma blockerade plan |
| Månad från 2025-06-02 | 2025-06-02–2025-06-30 | Blockerad; senare hela månader kan inte skapas i samma blockerade plan |
| Helår från 2025-01-01 | Helt kalenderår | Kan förhandsgranskas och skapas |
| Kvartal från 2025-04-01 | 2025-04-01–2025-06-30 och senare kvartal | Kan förhandsgranskas och skapas |
| Månad från 2025-06-01 | 2025-06-01–2025-06-30 och senare månader | Kan förhandsgranskas och skapas |
| Alla tre frekvenser från 2025-10-05 | Delår/delkvartal/delmånad | Blockerade om första delperioden saknas |

Om exakt första delperiod redan finns med rätt typ/källa och utan överlapp,
räknas den som befintlig. Den ändras inte. Funktionen verifierar inte dess
myndighetsunderlag på nytt och har ingen ny självserviceväg för fastställande.

Historiska år behandlas med samma kalenderregler och bara inom valt år.
Exempel: start 2024-06-02, valt2025, kan ge ett helt2025 även om första2024-perioden
saknas; 2024 certifieras eller repareras inte av den åtgärden. År före
profilstart och framtida år blir not_applicable. Saknad period i låst år
blockeras. Befintliga perioder i låst år kan läsas. För innevarande år tas bara
påbörjade perioder med; hela slutdatumet för den påbörjade perioden visas.

## Kan felaktig profil ändå ge fel, icke överlappande period?

**Ja.** Utöver blockeraren ovan kan en syntaktiskt giltig men sakligt felaktig
profil utan motstridiga periodrader ge en bekräftningsbar plan. Exempel, utan
befintlig historik som avslöjar felet:

- Felaktigt helårsstartdatum 2025-01-01 i stället för styrkt delårsstart ger helår2025.
- Felaktigt kvartalsstartdatum 2025-04-01 ger hela kalenderkvartal.
- Felaktigt månadsstartdatum 2025-06-01 ger hela månader, inklusive hela juni.
- Felaktigt vald frekvens på en kalendergräns ger perioder enligt denna frekvens.

Databasen kan inte själv kontrollera Skatteverkets uppgifter. En giltig feluppgift
kan därför bekräftas; datumen visas och användaren uppmanas kontrollera dem.
Denna kvarvarande inmatningsbegränsning kräver ingen registerintegration inom
KAN-117. Den ursäktar däremot inte att redan kända interna motsägelser förbises.
Registreringsdatumet används aldrig automatiskt i stället för vat_management_from.
Manuellt inmatat 10-05 stoppar den saknade första delperioden, men utgör inte
bevis på att tidigare hantering är korrekt.

## De tre funktionernas säkerhet

| Funktion/egenskap | Bedömning |
| --- | --- |
| kan117_vat_period_plan | Privat helper, postgres/SECURITY DEFINER, fast public,pg_temp. auth.uid-filter och explicit profilval. Endast läsning. Årsbegränsad konfliktkontroll är blockeraren ovan. |
| get_vat_period_creation_plan | authenticated EXECUTE; PUBLIC/anon/service_role nekas. Återanvänder samma helper och lagrar inget. Ingen alternativ osäker skapandeväg. |
| create_missing_vat_periods | authenticated EXECUTE; övriga API-roller nekas. Exklusiv befintlig ägarlåsgräns kräver READ COMMITTED; därefter profillås och ny planjämförelse före INSERT. Stoppar inaktuellt underlag inom den lästa planen, men ärver helperns saknade kontroll över år. |
| Ägare och identitet | Samtliga ägs av postgres och använder auth.uid(); inga klientvalda ägar-ID:n eller datum får styra INSERT. Klienten binder verifierad bearer och kontrollerar profilgeneration. |
| Överlapp/atomisk skrivning | Extra överlappskontroll före INSERT samt befintlig unik ägare/start/slut-nyckel. Inga UPDATE/DELETE. Fel rullar tillbaka hela anropet. Ingen bokföringsverifikation skapas. |
| Samtidighet | Tidigare lokala tester verifierade dubbelbekräftelse, profiländring, gammal generator och årslås. Etablerade skrivvägar använder samma låsgräns. Privilegierad SQL som kringgår dessa vägar omfattas inte av detta protokoll. |
| Idempotens | Ingen dubbel effekt: efter lyckat skapande är gammalt avtryck ogiltigt och replay avvisas, normalt40001. Det är inte ett sparat kvitto som återger samma lyckade svar. Klienten kastar gammal preview och läser om vid osäkert svar. |
| Profil och dygn | Status/frekvens/start/ägare/år/Stockholmsdag, årslås och valda årets periodmetadata ingår i avtrycket. Stale- och årsskiftesskydd fungerar inom detta underlag; annan årsdata saknas. |

Ingen ny behörighetslucka, dubbletteffekt eller ändring av momsberäkning/stängning/
deklaration har påvisats i denna riktade granskning. Gamla ensure_vat_periods
är oförändrad och kvar för kompatibilitet; den nya momsvyn använder den inte.

## Jessikas befintliga period

Med uppdragets tidigare verifierade profil och befintliga period ger den
syntetiska motsvarigheten complete och ingen skapandeknapp. Direkt försök
att skapa från complete nekas. Ingen av de tre funktionerna kan skriva om
den befintliga perioden. Ett felaktigt senare startdatum i samma år blockerades.

Risken är i stället att en ändrad profil och ett annat valt år tillåter en extra
felaktig period trots den kända delperioden. Ingen Production-data lästes eller
ändrades i denna granskning; slutsatsen bygger på tidigare läsande underlag och
ovanstående lokala syntetiska reproduktion.

## Minsta föreslagna lokala rättning – inte genomförd

1. Komplettera den gemensamma serverplanen med en kontroll av kända fastställda
   interna första delperioder mot aktuell momshanteringsstart, även när de ligger
   utanför valt år. Upptäckt motsägelse ska blockera nytt skapande och ge
   utredningsbesked. Ingen automatisk rättning av profil eller historik.
2. Ta med det relevanta underlaget över år i jämförelseavtrycket och använd samma
   kontroll under bekräftelsens befintliga lås. Skapandets datumscope förblir valt år.
3. Lägg ett riktat regressionsfall för exakt reproduktion ovan samt kontroller
   att korrekt befintlig delperiod, vanlig helårs-/kvartals-/månadsstart och ett
   normalt följande år fortfarande fungerar.

Ingen ny tabell, registerintegration, ändrad momsberäkning eller större ombyggnad
föreslås. Efter godkänd rättning behövs ny lokal verifiering och ny kandidat-SHA.
Denna rapport godkänner inte migration/publicering av ac96638.

Efter nytt lokalt PASS och separat Staging-beslut bör syntetisk acceptans omfatta:
korrekt befintligt delår utan knapp, de tre blockerade delperiodsfrekvenserna,
de tre tillåtna kalendergränserna, rätt/fel datum i annat år, stale preview efter
ändrad korsårshistorik, dubbelklick/samtidiga flikar, årslås och osäkert nätverkssvar.
Verifiera på dator/fysisk mobil att bara bekräftade periodrader tillkommer och
att journal, momsbelopp, NE/dashboard, betalnings-/fordringsläge och befintliga
avslut är oförändrade. Inga riktiga kunddata används som testfixtures.
