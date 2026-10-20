# KAN-92 – granskningsskydd för BAS K1 kontra vanlig BAS

2026-10-18. Avgränsad lokal implementation godkänd av Pontus efter läsande analys. Ingen omklassificering, bokföringsändring, migration eller publicering.

## Bas och källor

- GitHub main återläst till `376fe512b8dd0e19e35730ff1ca705114013f7df` (KAN-91, Production PASS enligt godkänd handoff). Separat lokal klon av ren KAN-91-kopia, gren `codex/KAN-92-bas-review-guard`. Desktop-staging är äldre och används inte som produktbas. KAN-62/65 förblir på hold.
- [BAS aktuella kontoplaner](https://www.bas.se/kontoplaner/): vanlig BAS 2026 och BAS 2018 för K1 är olika planer. K1-målgruppen innebär inte att importer automatiskt använder K1-numrering.
- [BAS K1 2018](https://bas.se/wp-content/uploads/2017/06/Kontoplan_K1_2018.pdf), s. 4: 3100 momsfria intäkter/R2 och 3200 bil- och bostadsförmån m.m./R3.
- [BAS 2026](https://www.bas.se/wp-content/uploads/2026/04/BAS_kontoplan_2026_v2.pdf), s. 15: 3100/3105/3106/3108 avser utlandsförsäljning av varor; 3200/3211/3212/3231 avser VMB/omvänd moms. Dessa åtta exakta nummer omfattas. Inga godtyckliga 31xx/32xx-underkonton antas ha samma betydelse.
- [Skatteverket, deklarera enskild näringsverksamhet](https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet): normalt R1 för försäljning till utlandet, VMB och byggsektorns omvända moms; R2 för momsfri verksamhet. Faktisk verksamhet och underlag avgör. Alternativ konsekvent R1/R2-uppdelning kan förekomma. Ingen automatisk ersättningsruta här.

Analysens källor och PDF-tabeller granskades i samma chatt. Nuvarande resultatmotor använder breda regler 31xx -> R2 och 32xx -> R3 utan kontoplansunderlag. Syntetiska 3105/3231 gav R2/R3 utan varning. KAN-90 verifierar täckning, inte att en befintlig fast mappning har rätt saklig innebörd.

Läsande livekontroll under analysen: kolumner i profiles/accounts/import_batches/sie_import_inputs/ne_sales_classifications samt `pg_get_functiondef()` för get_ne_sales_summary och relevanta importfunktioner. Ingen kontoplansvariant finns i de kontrollerade tabellerna. KAN-88-summary hanterar endast 3010. Parsern ignorerar KPTYP/SRU; payloaden sparar inte KONTO-namn och importkvittot konsumeras. Detta är inget beständigt kontoplansbevis. Inga användarrader granskades eller ändrades; ingen ny livekontroll behövs för denna läsande UI-ändring.

## Implementation

- `neChartReview.ts`: ren lista av åtta verifierade konflikter med begriplig orsak. Den avgör ingen kontoplan och returnerar ingen ny NE-ruta. Namn, moms 0, dagens profil och eventuella SIE-taggar undanröjer inte osäkerheten.
- `neAccountCoverage.ts`: endast de listade kontona med kvarvarande årssaldo markeras `review`, med befintlig ruta uttryckligen preliminär. KAN-90:s övriga kontotäckning bevaras.
- `NEBilaga.tsx`: den befintliga granskningsvarningen visar varför fördelningen är preliminär, nummer, saldo och orsak. Beloppen står kvar. Ingen ny årslåsspärr.
- `SieImportModal.tsx`: samma kontroll vid faktisk filval/parsing/förhandsvisning. Endast konton med ändliga, icke-noll bokföringsrader granskas, oavsett tecken och även om original/rättelse tar ut varandra. Oanvända KONTO-rader, nollrader och tidigare års RES ger ingen ny varning. Varningen blockerar inte import. Den gröna texten ”inga fel eller varningar” visas inte tillsammans med detta besked (eller kodningsvarningar).
- Resultatmotor, getNEData, journaler, importparser/payload/server, RPC:er och KAN-88-underlag ändras inte. Samtliga tidigare rapportfält utom kontotäckning jämförs exakt mot Production-basen i regressionstestet.

## Separata bedömningsfall – ingen ändrad klassificering

| Konto | Verifierad begränsning / nuvarande hantering |
|---|---|
| 3004 | Vanlig BAS anger momsfri inrikes försäljning; motorn har bred 30xx -> R1. Rätt verksamhet/fördelning kan inte avgöras från numret ensamt. Separat bedömningsfall, ingen ny automatisk flytt eller KAN-92-varning. |
| 4700 | Officiella K1 2018-tabellen visar R6, medan koden och testet använder R5 och kommentaren hänvisar till en annan tidigare granskad SRU-koppling. Käll-/versionsskillnaden är inte löst genom antagande. R5 bevaras. |
| 7970 | K1 2018-tabellen visar R6; kodkommentaren anger att kontot saknades i en tidigare granskad aktuell koppling. Befintlig `unknown_ne_mapping`-varning bevaras; ingen automatisk R6. |
| 3980 | K1-tabellen anger R2, men Skatteverket anger R1/R2 beroende på vilken verksamhet bidraget avser. Befintlig R2 bevaras; kräver särskild sakbedömning. |

Dessa fall lämnas öppna för separat beslut. Den begränsade konfliktlistan bevisar inte att övriga BAS-konton är rätt klassificerade. Ingen verklig bokföring har undersökts för förekomst, inklusive Jessikas. Jessikas sparade 3010-beslut ska fortsätta styra historiken; ingen profilbaserad omtolkning har införts.

## Integrationsyta och verifiering

| Yta | Påverkan / riktad kontroll |
|---|---|
| Journal, transaktionskällor, metadata och RPC-skrivningar | Ingen ändring. Testtransporten tillåter endast de tre etablerade läs-RPC:erna och jämför argument/anrop mot basen. |
| Momsrapport, momsperioder, betalning/kundfordran | Ingen ändrad beräkning eller lifecycle. Inga nya boknings-/betalningsvägar eller sources. |
| NE, resultat, balans, årsslut | Endast granskningsstatus/text. Alla tidigare numeriska och övriga servicefält förblir exakt identiska. Inga nya årslåsspärrar. |
| Dashboard, skattereserv, säkert uttag | Ingen ändring; KAN-91:s befintliga justeringar och granskningsbesked bevaras. |
| Rättelser/ånger, SIE, årsskifte, låsta perioder | Negativa/positiva saldon, del-/helåterföring, konton som tar ut varandra och årsvis kontra kumulativt underlag testas. Importpayload/hash och originaldata jämförs före/efter. NE renderas både låst och olåst. |
| Databas, RLS, raderingslivscykel | Ingen migration, ny tabell, lagrat fält eller ändrad RPC. Ingen ny persistent datadomän. |

Detta är ett additivt läsande granskningsskydd utan ändrade belopp eller skrivvägar. Därför behövs ingen ny skrivande bokförings-E2E eller riktig transaktion inför acceptans. Vid senare godkänd Preview: välj ett befintligt syntetiskt underlag med 3105/3231, jämför journal/NE/moms/dashboard med basen, kontrollera varning + kontotäckning, kontrollera sparad 3010-fördelning och välj en syntetisk SIE-fil enbart fram till förhandsvisningen. Importera inte eller skapa data utan separat tillstånd.

- Riktat `node scripts/test-ne-chart-review.mjs`: PASS, 33 fall mot exakt bas 376fe512; åtta kontokonflikter, tecken/rättelser/år, bevarade KAN-88/90/91-fält och oförändrade läsanrop. Riktig SIE-parser/payload samt verklig förhandsvisning vid 1440/390/320 px, inga nätanrop eller skrivningar.
- Typkontroll och fokuserad ESLint för alla ändrade produkt-/testfiler: PASS.
- Bilder NE/SIE vid 320 px visuellt granskade; automatiskt även desktop/390 px utan horisontell överrinning eller browserfel. Testbilder finns ignorerade i `test-results/kan92/`.
- Säker regression: samtliga delsteg PASS. Ordinarie `npm run test:regression` passerade domänkedjan (inklusive KAN-77/88/90/91/92), historik och UI-round men avslutades med fel vid public smoke: Turbopack nekar kataloglänk till befintliga beroenden utanför projektroten. Ett enda avgränsat Webpack-omförsök gav public-auth smoke 2/2 PASS. Resterande category-visibility-ui och standard-booking-browser PASS separat för desktop/mobil. Det ordinarie kommandot rapporteras inte som exit 0. Endast syntetiska processlokala localhost-värden, inga env/authfiler kopierade/lästa och inga riktiga formulär skickade. Ingen full repo-lint, produktionsbuild, hosted acceptans eller skriv-E2E körd för denna additiva ändring.
- React-kontroll: rena härledda värden, inga nya hooks/effekter, inga extra dataanrop; stabila kontonummer som nycklar, escaped text, role=alert, befintliga klientgränser bevarade. Installerad Next.js-guide för use client och server/client-komponenter läst före kodändring.

Kvarvarande begränsning: varningen löser inte rätt NE-ruta och sparar inget granskningsbeslut. Befintliga preliminära siffror kan fortfarande vara fel för den faktiska användningen. SIE-förhandsvisningen är information, inte ny servervalidering. Ingen migration behövs för denna avgränsning; beständiga verifierade kontoplansbeslut skulle kräva separat design och godkännande.

Ingen commit, push, deployment, migration eller ändring av användarbokföring är gjord. Slutligt IRL-test och publiceringsbeslut tillhör Pontus.

## Ändrade filer och stoppunkt

Åtta ocommittade filer i kandidatkopian: `src/lib/neChartReview.ts` (ny), `src/lib/neAccountCoverage.ts`, `src/components/NEBilaga.tsx`, `src/components/SieImportModal.tsx`, `scripts/test-ne-chart-review.mjs` (ny), `package.json` (endast tillägg i test:domain), detta dokument (nytt) samt `PROJECT_STATE.md` (uppdaterad till aktuell handoff och KAN-92). Desktop-kopians PROJECT_STATE.md har samma statusuppdatering; dess äldre produktkod, befintliga AGENTS-ändring och sex ospårade filer bevaras.

Jira KAN-92: In Review, tilldelad Pontus, kommentar 11655. Pontus har därefter uttryckligen godkänt lokal commit av dessa åtta filer och exakt samma commit som isolerad Vercel Preview mot befintlig Supabase Staging. Ingen GitHub-push, gren-/aliasflytt, Production, migration eller Edge-publicering är godkänd. Commitens SHA hämtas med git log -1; dess enda förälder ska vara 376fe512b8dd0e19e35730ff1ca705114013f7df. Publiceringsresultat dokumenteras separat utan ny produktändring.
