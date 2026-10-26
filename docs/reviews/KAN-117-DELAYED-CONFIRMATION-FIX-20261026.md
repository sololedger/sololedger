# KAN-117 P1 – fördröjd bekräftelse, lokal säkerhetsrättning

2026-10-26. Pontus godkände riktad lokal utredning/rättning och syntetisk lokal
verifiering. Inga skrivande Staging-prov, ingen rensning, fjärrmigration,
deployment, push, Production-åtgärd eller Jira-mutation ingår.
Aktuell publicerad Staging eacdc5b är fortsatt **BLOCKED**.
**Slutlig lokal bedömning: PASS för nytt separat godkänt Staging-test.**

## Rotorsak och utlösande kedja

Tre oberoende belägg sammanfaller:

1. Färsk läsande Staging-kontroll visar **PostgREST14.18** och exakt samma
   installerade KAN-117-definitioner som vid fyndet. Gammalt planunderlag
   avvisades uttryckligen med SQLSTATE40001 i skapande-RPC:n.
2. [Supabases primära felsökningsartikel](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions)
   beskriver att PostgREST14 kör om transaktionen när en RPC använder40001
   som eget verksamhetsavslag. Det kan fortsätta efter klientens timeout.
3. Staging-browserprovet registrerade1 skapandebegäran. Installerad
   postgrest-js skickar inte om POST vid HTTP-/nätverksfel; panelens ref stoppar
   dubbelklick. Ingen Next-route, bakgrundskö eller service-worker ingår i
   denna väg: browser→Supabase/PostgREST→RPC.

Det gamla avtrycket innehöll profilens värden men ingen radversion. När
profilen återställdes från kvartal→helår→kvartal blev avtrycket identiskt igen.
En fortsatt serveromkörning kunde då acceptera samma gamla begäran och skapa
de fyra kvartalen. Varken ny knapptryckning eller browserns fortsatta existens
krävdes. Skapandet efter återställningen är belagt med befintliga tidsstämplar
och efterkontroller i KAN-117-STAGING-20261026.md.

Samma felkedja har reproducerats lokalt med riktiga SQL-funktioner och ett
**begränsat HTTP-test som modellerar den dokumenterade40001-omkörningen**.
Det är inte en lokalt installerad PostgREST-binär. Gammal kod:1 HTTP-anrop,
avslag40001, avbruten klient, återställd profil, därefter4 nya perioder (5→9).
Testet fallerade innan rättningen. Ingen ny Staging-reproduktion gjordes.
Originalhändelsens interna antal omkörningar/processidentitet kan inte
rekonstrueras ur sparade browserloggar; dessa detaljer påstås inte vara spårade.

## Minsta rättning och säkerhetsgräns

Ny migration **20261026230000_kan117_final_rejection_and_plan_revision.sql**:

- Kräver exakt normaliserad live-förbild för två funktioner innan ändring.
- create_missing_vat_periods använder23514 för gammalt avtryck/överlapp:
  ett slutligt verksamhetsavslag, utan PostgREST14:s40001-omkörning.
- kan117_vat_period_plan läser profilvärden och xmin i samma SQL-snapshot.
  Profilrevision samt relevanta periodraders xmin ingår i avtrycket. Även en
  committad ändring som återställs till identiska värden kräver ny granskning.
- Publika signaturer bevaras; planens svar får profile_revision. Ny klient
  kräver detta fält och stoppar säkert mot äldre server. Äldre get-wrapper bevarad.
- Befintligt exklusivt ägarlås, profillås, färsk READ COMMITTED-omkontroll,
  ägarisolering, grants och unikt/överlappsskydd bevarade. Ingen ny tabell/kolumn,
  ingen ändring av periodrader eller av momsberäkning, avslut och deklaration.

Klienten sparar före bekräftelsens POST en ägarbunden lokal statusmarkör för
exakt år, profilrevision, planavtryck och visade datum. Ingen automatisk
omsändning eller tidsbaserad frigivning. Avbryt före bekräftelse skriver inget.
Efter bekräftelse heter åtgärden **Stäng visning** och säger uttryckligen att
anropet kan fortsätta. Årbyte, remount och browserstängning antas inte avbryta det.

Vid återbesök/osäkert svar läses faktiskt DB-utfall för ursprungsåret, även om
ett annat år visas. Nytt skapande spärras tills de exakta datumen finns eller
en ny profilrevision bevisar att gamla planen är ogiltig. Enbart saknade rader
bevisar inte att ett anrop lämnat kön. Osäker status ligger kvar med
Kontrollera periodstatus/kontakta support. Definitivt23514-avslag frigör markören.
Sena svar kan inte rensa en nyare plans markör eller ändra annan ägares UI.

Ett redan giltigt accepterat anrop kan slutföras efter browserstängning.
Profillåset gör att senare profiländring väntar tills detta anrop är klart.
Det skiljs från en ny/omkörd inaktuell begäran som ska få slutligt avslag.
Browsermarkören är ett UX-skydd; serverns validering är säkerhetsgränsen.

## Integration och regression

Endast datumintervallens planering/bekräftelse och osäker återkoppling ändras.
Inga nya konteringar, transaktionskällor eller rapportregler. Journal, moms-
aggregation, NE/resultat/dashboard, betalning/fordran, rättelser/undo/SIE och
årsstängning får ingen ny skrivväg. Alla tidigare public/Auth/Storage-fixtures
har samma avtryck utanför respektive ny syntetisk lokal kohort.

- Före/efter samma obligatoriska felprov: **rött5→9**, sedan **grönt5→5**,
  0 omkörningar och23514. Gammalt avtryck nekas även efter profilåterställning.
- Ny uttrycklig bekräftelse av färsk plan skapar exakt4 perioder. Återförsök
  skapar0 extra. Även periodunderlag som ändras/återställs gör gammal plan ogiltig.
- Motsatt låsordning: accepterad giltig skrivning håller profillåset; senare
  profiländring väntar. Befintliga periodfält och journaler bevarade.
- Befintliga28 DB-kontrollgrupper och obligatorisk korsårsregression passerar:
  månads-/kvartals-/helårsdelperioder, historiska år, årsskifte, ägare/grants,
  profil-/årslås-/generator-/förstaperiodsrace och dubbla bekräftelser.
- Riktig panel/klient med syntetisk transport på1280/390px: fördröjt svar,
  Stäng visning, årbyte, omladdning med sparad osäker status, uteblivet svar,
  bekräftat utfall, ändrad profil, ägarbyte och dubbelklick. Ingen implicit POST.
  Otillgänglig/felaktig browserlagring stoppar före nytt skapande.
- TypeScript, berörda filers ESLint utan varningar, DB-invarianter, lokal build
  och full säker regression PASS, inklusive2 publika smokeprov. Extra målprov
  för browserlagring/ägarbyte passerade efter kompletteringen. Build/regression
  använder endast syntetiska processvärden mot localhost; inga envfiler ändrade.

Ändrade produktfiler: src/lib/vatPeriodCreation.ts och
src/components/VatPeriodCreationPanel.tsx samt den nya migrationen230000.
Testfiler: scripts/test-vat-period-delayed-db.mjs (ny), befintliga
test-vat-period-creation-db.mjs/test-vat-period-creation-browser.mjs,
tests/fixtures/vatPeriodCreationHarness.tsx/vatPeriodCreationTransport.ts och
package.json (P1-regressionen ingår i test:vat-periods:db). Ingen dependencyändring.
Dokumentation: Architecture.md, PROJECT_STATE.md, denna rapport, uppföljning
i Stage-rapporten och sanerat slutkvitto. Ingen AGENTS-ändring.

## Begränsningar och nästa säkra steg

Lokal statusmarkör kan inte lova avbrytning eller ersätta ett distribuerat
serverkvitto. Om ett osäkert anrop aldrig ger ett slutligt svar och inga rader
syns kan funktionen förbli spärrad och behöva manuell utredning. Det är avsiktligt.
Ny browser/enhet som saknar markören har fortfarande serverns plan-/dubblettskydd.
Även annan profilsparning kan byta xmin och kräva ny förhandsgranskning.

Stagings8 syntetiska konton/35 periodrader, inklusive4 oväntade, är återlästa
och bevarade; ledger68 och definitioner oförändrade. Ingen testinloggning eller
skrivning utfördes där i detta uppdrag. En matchande PostgREST-session observerades
i aktivitetsmetadata, men ingen backend terminerades eller tjänst startades om.
Supabase varnar att redan pågående omkörningar kan behöva hanteras separat;
en framtida Staging-plan måste verifiera eventuella kvarhängande gamla anrop.

Nästa ledarbeslut gäller exakt ny kandidat och separat Staging-migration/test.
Återupprepa särskilt gamla HTTP-fallet efter profilåterställning och browserstängning,
kontrollera slutligt svar och data efteråt, sedan dator/fysisk mobil. Ingen
Production-publicering eller Jira Done är godkänd. Äldre Stage-bevis bevaras.

Exakta filer, migrationshash och testkvitton: docs/testing/kan117-delayed-fix-20261026.json.
Aktuell lokal checkpoint enligt git log; ingen push. PROJECT_STATE är handoff-nav.
