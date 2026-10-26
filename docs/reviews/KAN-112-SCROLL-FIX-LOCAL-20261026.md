# KAN-112 – stabil scroll vid kontrollpunktsbyte

2026-10-26. **PASS lokalt inför separat Staging-beslut.**
Endast lokal rättning. Ingen push eller publicering godkänd.

Lokal produktcommit: `a02e3e30403e56969a55fbc4156213e04a829164` på
`codex/KAN-112-year-end-checklist`, förälder `88e42920e85e1d9aaea30725ff325280ad136e3d`.
Endast guide/test i produktcommit; rapport och STATE checkpointas separat lokalt.

## Orsak och minsta rättning

`chooseControl` anropade `focusInstruction` efter varje val. Funktionen gjorde
ovillkorligen `scrollIntoView({block:'start'})` före rubrikfokus. Det flyttade hela
sidan även när datorns arbetsyta redan var synlig. Nytillagt regressionstest
reproducerade hoppet på den tidigare produkten: scrollY 267 → 900 i 1440 px.
`chooseGroup` hade en liknande ovillkorlig scroll till kontrollpunktslistan.

Gemensam liten fokushjälpare används för vanliga punkt-/huvuddelsbyten:

- Dator (från 1024 px, samma brytpunkt som arbetsytan): fokus med preventScroll,
  ingen explicit scroll. Val, instruktion och tillgängligt rubrikfokus byts som tidigare.
- Staplad layout: samma fokus, endast scroll när målområdets rubrik/status ligger
  utanför viewport. `block:'nearest'` gör minsta nödvändiga förflyttning.
- Separat retureffekt från länkade funktioner är oförändrad: återställt år,
  huvuddel/kontrollpunkt, rubrikfokus och avsiktlig returscroll.
- Fel/pending prioriterar fortfarande gemensam sparstatus. Sticky-visningen,
  retry-kommandot, bekräftelserna och sparreglerna är oförändrade.

Produktkod ändrad endast i `src/components/YearEndGuide.tsx`. Befintliga testet
`scripts/test-year-end-guide.mjs` kompletterat med scrollposition och scrollanrop.
Versionshanterade acceptansbilder uppdateras nu bara med uttrycklig
`KAN112_UPDATE_VISUALS=1`; vanliga tester sparar bilder i ignorerad coverage.
Testhjälparen väntar även på punktvalets schemalagda rubrik-/statusfokus innan
den utför nästa tangentbordsåtgärd.

## Lokal verifiering och testgränser

Verklig Home/Layout/guide/checklist-store med syntetiska Auth-/dataporter.
Alla externa anrop blockerade; ekonomipaneler ersatta med navigationssentineler,
NE-guiden verklig. Ingen verklig användardata eller fjärrskrivning.

| Kontroll | Resultat |
| --- | --- |
| 1440/1024: huvuddel utan scroll, växla Moms/Resultat i båda riktningar vid olika scrollpositioner | PASS |
| Dator: exakt bibehållen scrollY, inga programmatiska scrollanrop, Space med rubrikfokus | PASS |
| 768/390/320: synlig rubrik ger ingen scroll; offscreen rubrik ger en nearest-scroll vid Enter | PASS |
| Alla elva kontrollpunkter, varierande instruktionslängd och en instruktion åt gången | PASS |
| Tab/Enter/Space, 200 % text, långt företagsnamn, ingen horisontell scroll/pageerror | PASS |
| Retur från Profil/Fakturor/Skulder/Inventarier/Moms/NE, ändrat destinationsår, rätt år/punkt/fokus/scroll | PASS |
| Navigation skickar inga bekräftelseskrivningar, markera/avmarkera, års-/ägarbyte och sparade svar | PASS |
| Omkontrollvarning, sparfel, retry samt fördröjt sparande efter huvuddel-/punktbyte | PASS |
| Fem profil-/visibilitycykler per bredd | PASS |
| Typecheck, riktad lint, git diff --check | PASS |
| Säkra regressionens samtliga delar, slutförda i delade körningar | PASS |
| Publik lokal inloggningssmoke efter avgränsat miljöomtest | PASS 2/2 |

Guide och testfil har 0 lintfel. Befintliga lintfel i Layout/page är oförändrade
mot tillåten baslinje; inga nya fel. Första sandboxkörningen saknade åtkomst till
installerad browsercache; samma test kördes därefter med befintlig browser utan
installation eller produktändring för miljön.
Första breda körningen stannade i det befintliga dubbel-Space-testet: nästa
tangenttryckning kunde ske före tidigare punktvals requestAnimationFrame-fokus.
Testhjälparens explicita fokusväntan ovan rättade synkroniseringen; riktat omtest
av alla fem bredder PASS. Ingen ändring av produktens sparhantering behövdes.
Den upprepade `npm run test:regression` passerade alla delar fram till publik
smoke men slutade med exit 1 eftersom ingen lokal Supabase-URL var satt.
Ett avgränsat omtest av `test:e2e:smoke` med processlokal syntetisk `.invalid`-URL
och syntetisk publik nyckel passerade 2/2, exit 0. Inga miljöfiler ändrades.
De därefter återstående `test-category-visibility-ui.mjs` och
`test-standard-booking-browser.mjs` kördes separat och passerade, exit 0.
Alla regressionens testdelar är därmed gröna; inget helt sammanhängande
`test:regression`-kommando med exit 0 påstås. Typecheck även efter dev-smoken PASS.

Ekonomisk integrations-E2E/DB-verifiering är inte relevant för enbart fokus/scroll:
inga ändringar i journaler, moms, NE-beräkningar, bokföring, RPC, Auth, RLS eller
datamodell. Inga DB-/Edge-/Production-/Jira-åtgärder. Hosted test/build har inte
körts för den lokala rättningen; Staging ligger kvar på godkänd 934ce9b.

Bevis: `coverage/kan112-modern/result.json`, bilder, `scroll-regression.log`,
`scroll-regression-retest.log` och `scroll-smoke-retest.log`. Återstående lokala
browserdelars PASS/exit 0 finns i körningsutdata. Testbrowserar och smoke-server
avslutade efter testerna.
Rootens orelaterade ändringar bevarade. Retention genomgången: KAN-112 aktiv,
tidigare lokala/hosted rapporter behövs som jämförelse och behålls.

Nästa steg: invänta separat ledarbeslut om
Staging-publicering. KAN-112 inte Done; KAN-113 separat.
