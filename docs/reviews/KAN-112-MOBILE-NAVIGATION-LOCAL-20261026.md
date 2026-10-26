# KAN-112 – sista mobiljusteringen av navigationen

2026-10-26. **PASS lokalt inför separat Staging-beslut.**
Produktcommit `1e4a32a44fde6173633c2deef92940cc682ced84`, gren
`codex/KAN-112-year-end-checklist`, förälder `50aa868e062f0b425722296fc32d53e1f6cc3727`.
Ingen push, publicering, migration, DB-/Production-/Jira-ändring.

## Grundorsak

Föregående mobilregel använde `block:'nearest'` och scrollade bara om rubriken låg
utanför viewport. Den garanterade därmed en synlig rubrik, inte att instruktionens
början och inledning nåddes. På 390 × 844 reproducerade det nya testet en listrubrik
vid y=580 i stället för avsedd y=16. Den tidigare verifieringen av synlighet fångade
inte detta användningsproblem.

Korta listor utan vald instruktion kan också få för lite innehåll nedanför för
full toppjustering. Arbetsytan får därför minst en dynamisk skärmhöjd i staplad
layout, med innehållet samlat i början. Datorns höjd/layout lämnas oförändrad.
Den befintliga mobilmenyn ligger i dokumentflödet; ingen ny hårdkodad menyhöjd behövs.

## Minsta lokala rättning

- Mobil/staplat: huvudkort → listans början, kontrollpunkt → instruktionens början.
  `block:'start'`, mjuk scroll och befintliga scrollmarginaler (16/24 px vid normal text).
- Fokus flyttas med `preventScroll` så det inte startar en separat fokusscroll.
  Om rubriken redan ligger vid rätt toppmarginal (tolerans 2 px) startas ingen scroll.
- Fokusbegäran behandlas i effekt efter att valet renderats, följt av en animation
  frame. Nytt val/avmontering tar bort väntande äldre begäran. Snabba val skapar
  en sista scroll till rätt renderat innehåll.
- `prefers-reduced-motion` ger omedelbar scroll i stället för animation.
- Befintliga knappen ”Till kontrollpunkterna” använder samma väg och mjuka scroll.
- Dator från 1024 px behåller `preventScroll` utan automatisk scroll vid vanliga val.
- Separat återgång från länkade funktioner och dess returscroll är oförändrad.
  Gemensam sticky fel-/pendingstatus och dess fokusprioritet bevaras.

Produktkod ändrad endast i `src/components/YearEndGuide.tsx`. Befintliga
`scripts/test-year-end-guide.mjs` har utökats, ingen ny testplattform eller dependency.
Checklist-store, klient, Auth, bekräftelser, varningar och ekonomisk logik oförändrade.

## Verifiering

`npm run test:year-end-guide` **PASS, exit 0**. Det omfattar befintlig checklist-store,
klient, verklig Auth-SDK med syntetiska sessioner samt verklig Home/Layout/guide.
Externa anrop är blockerade, ekonomipaneler navigationssentineler; NE-guiden är verklig.

| Kontroll | Resultat |
| --- | --- |
| 320 × 568 och 390 × 844, korrekt viewport-meta, mobile/touch-emulering | PASS |
| Alla fyra huvudkort når respektive listas topp, även kort lista utan instruktion | PASS |
| Instruktionsrubrik vid toppmarginal och inledning synlig, inte övertäckt | PASS |
| Verkliga mellanpositioner och native scroll-/focusin-händelser, en smooth-scroll per val | PASS |
| Redan rätt position ger ingen scroll; snabba punktval ger en sista scroll | PASS |
| Till kontrollpunkterna, Enter/Space/Tab och reduced-motion | PASS |
| Dator 1440/1024: exakt stabil scroll vid punkt-/huvuddelsbyte, olika instruktionslängd | PASS |
| Ytterligare staplad bredd 768 × 1000 | PASS |
| Alla elva punkter/en instruktion, noll bekräftelseskrivningar från navigation | PASS |
| Sparade svar/avmarkering, omkontroll, fel/retry/pending över huvuddel-/punktbyte | PASS |
| Retur via sex destinationer inkl NE/Moms med rätt år/huvuddel/punkt/fokus/scroll | PASS |
| Års-/ägarbyte, fem visibilitycykler, 35 min simulerad inaktivitet, replay/StrictMode | PASS |
| 200 % rottext, långt företagsnamn, ingen horisontell scroll/pageerror | PASS |
| Typecheck, riktad lint och git diff --check | PASS |

Guide och testfil har 0 lintfel/varningar. Befintliga fel i orörda Layout/page har
inte ökat. Skärmbilder för 320/390 inspekterade: rubrik och inledning är direkt synliga.

Full bred ekonomisk regression, optimerad build, hosted test och fysisk mobil/Safari
har inte körts i detta lokala UI-uppdrag. Relevant regression ovan är grön.
Ekonomisk integrations-E2E/DB-kontroll är inte tillämplig: inga dataflöden, RPC:er,
rapporter, moms/NE-beräkningar eller sparregler har ändrats. Ingen fjärrdata läst/skriven.

## Bevis och nästa steg

`coverage/kan112-modern/mobile-navigation-regression.log`, `result.json`,
`mobile-start-320.png` och `mobile-start-390.png` samt övriga bredd-/textbilder.
Browserar avslutade. Rootens orelaterade ändringar och alla fixtures bevarade.
Retention genomgången: KAN-112 är aktiv; tidigare rapporter kvar som jämförelse.
Rapport och STATE checkpointas separat lokalt. Inga credentials i Git/docs.

Senast publicerad Staging a02e3e3, deployment dpl_GRTbB87v2xSZQBFf7vHnb7USNkV6.
Denna ändring är bara lokal. Jira KAN-112 läst To Do/otilldelad, ingen mutation/Done.
KAN-113/KAN-114 orörda. Nästa steg: separat ledarbeslut om Staging-publicering,
sedan manuell kontroll på riktig mobil. Stanna här efter lokal verifiering.
