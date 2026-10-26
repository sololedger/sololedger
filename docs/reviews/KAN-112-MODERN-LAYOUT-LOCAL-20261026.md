# KAN-112 – modern årsavslutsyta, lokal verifiering

2026-10-26. **PASS lokalt inför separat godkänd Staging-publicering.**
Produktcheckpoint `934ce9becf31ac7d86f486632275ef9f32295d86`.
Ingen push, deployment, migration, Supabase- eller Production-ändring.

## Utgångspunkt och godkänd omfattning

Pontus har manuellt accepterat den funktionella Staging-grunden 6673030, inklusive
flikbyten, beständiga bekräftelser och navigation. Denna nya uppgift gäller bara
den godkända visuella moderniseringen före Production.

Ren L-arbetskopia på `codex/KAN-112-year-end-checklist`, docs-HEAD 16e47ff, verifierad
före ändring. Rootens tidigare dirty arbete bevarat och används inte som produktkälla.
AGENTS, PROJECT_STATE och Nexts lokala use-client-guide lästa före implementation.
Inga nya miljöer, dependencies eller designplattformar införda.

## Visuell ändring

- Yttersektionen fyller samma gemensamma Layout-bredd som Fakturor. Den tidigare
  extra max-w-3xl-begränsningen och dubbla sidpaddingen är borttagna.
- Fyra kompakta huvudkort: fyra i rad på stor dator, två per rad på mellanbredd,
  staplade på mobil. Vald huvuddel markeras med diskret kant/bakgrund och aria-pressed,
  aldrig med en färdigbock. Befintliga antal bekräftelser/omkontroller visas.
- En arbetsyta under korten: kontrollpunkter vänster och vald instruktion höger
  från 1024 px; staplad under detta. Bara en instruktion finns renderad åt gången.
- Instruktionen har max-w-prose för behaglig läsbredd. Korta instruktioner har
  tillräcklig höjd för tillförlitlig returscroll även på stor skärm.
- Diskret framstegslinje märkt Dina egna bekräftelser. Grön bock används endast
  när befintligt sparat svar är bekräftat. Omkontrollvarning och datum återanvänds.
- Separat systemstatus med samma uppgifter och begränsningar som tidigare.
- Befintligt färgspråk, kort, knappar och typografi återanvänds lokalt. Ingen
  ändring i globala stilar, navigationens huvudkomponent eller Fakturor.
- Inledningen förklarar eget ansvar; kalender-/momsbesked och samtliga befintliga
  kontrollinstruktioner och stödbegränsningar bevaras. Årslås är fortsatt separat
  systemåtgärd utan manuell bekräftelseruta.

## Bevarade funktioner och integrationsgräns

Enda ändrade produktkällfil: `src/components/YearEndGuide.tsx`.
Samma `useYearEndChecklist`, `ChecklistNotice`, `ChecklistStatus` och
`ChecklistConfirmation` används. Store, checklisteklient, RPC, Auth och profiler
har ingen diff. Guiden håller samma store monterad när lokal huvuddel/punkt byts.
Varken väljande, öppnande eller fokusförflyttning skickar någon bekräftelse.

Befintliga onNavigate/initialControl/initialOpenControls-kontrakt bevaras:
den lokalt valda huvuddelens och punktens befintliga index skickas tillbaka till
samma förälder. Vid återkomst öppnas rätt år/punkt och instruktionsrubriken får
scroll/fokus. Ingen ny global navigation, route, browserlagring eller serverstate.

Sparstatus ligger utanför den växlande instruktionen. Vid fel eller pending är
dess enda befintliga notice-komponent sticky och kan inte döljas genom val av
annan punkt. Retry använder oförändrat samma väntande kommando; navigation kan
inte skriva över det. Befintliga spärrar på bekräftelser är kvar.

Journaler, transaktionskällor, moms, NE/resultat/balans, dashboard/uttagsutrymme,
betalningar/fordringar, rättelser, SIE och årslås saknar ändrad affärslogik här.
Ingen ny ekonomisk transaktionschecklista eller DB-verifiering behövs för denna
UI-avgränsning. Befintliga ekonomiska regressioner är fortsatt med i säker regression.

## Genomförda tester

| Kontroll | Resultat |
| --- | --- |
| Verklig Home/Layout/guide med blockerat nätverk och syntetisk data | PASS |
| 1440, 1024, 768, 390 och 320 px | PASS, visuellt inspekterade |
| Guide fyller samma yttre innehållsbredd som Fakturor/Layout | PASS, browsermätning |
| Exakt fyra huvudkort, ingen grön färdigbock för vald huvuddel | PASS |
| Alla elva kontrollpunkters instruktioner/länkar, endast en synlig instruktion | PASS |
| Navigation mellan samtliga huvuddelar/punkter ger noll bekräftelseskrivningar | PASS |
| Autospara, avmarkera, underlagsvarning och kontrollera igen | PASS |
| Sparfel kvar i viewport efter byte av huvuddel/punkt, korrekt retry av bankförsök | PASS |
| Fördröjt sparande kvar under navigation, ingen extra skrivning/falsk bekräftelse | PASS |
| Tangentbord: Tab/Enter för kort och punkt, fokus på rubrik, Space för checkbox | PASS |
| Sex returdestinationer inkl NE/Moms, ändrat destinationsår, rätt år/punkt/fokus/scroll | PASS |
| Årsbyte, ägarbyte/företagsuppgift och återkomst till tidigare sparade svar | PASS |
| Långt sammanhängande företagsnamn och 200 % rottextstorlek vid alla fem bredder | PASS |
| Ingen horisontell dokumentscroll, externa anrop eller pageerror | PASS |
| Befintlig verklig Auth/klient/store-regression med visibility recovery/StrictMode | PASS |
| Fem profil-/fokuscykler, 35 min simulerad inaktivitet och osäker replay | PASS |
| `npm run test:regression` i sin helhet | PASS, exit 0 |
| Publik Playwright-smoke som del av regressionen | PASS 2/2 |
| `npm run test:e2e:safety` | PASS |
| `npm run typecheck`, även efter dev-körningen | PASS |
| `npm run lint:year-end-guide` | PASS, inga nya fel; ändrad produktfil 0 fel |
| `git diff --check` | PASS |

Två lokala detaljer rättades under verifieringen: kort instruktion behövde en
minimihöjd för att rubriken skulle kunna scrollas till rätt plats, och tangentbords-
testet behövde invänta det avsiktliga fokuset på kontrollpunktsrubriken innan nästa
Enter. Slutlig full regression passerar utan produktavvikelse.

200 % testas genom dubblerad rottextstorlek, inte manuellt browserzoom. Fysiska
OS-flikbyten har Pontus redan accepterat för grunden; nya körningen använder
befintliga automatiserade visibility-/Auth-tester. Ingen ny hosted eller verklig
DB-skrivtest, full projektlint eller optimerad build körd för denna UI-ändring.
Ingen ekonomisk funktion eller skatteregel behöver bedömas på nytt.

## Bilder och exakt fillista

Alla bilder är syntetiska, inga credentials eller verkliga person-/företagsuppgifter.
Före-/efteröversikterna visar samma år, företag och 0 bekräftelser. Separata
arbetsbilder visar vald Bank, egen bock och omkontrollvarning.

Produktcommit innehåller exakt:

1. `src/components/YearEndGuide.tsx`
2. `scripts/test-year-end-guide.mjs`
3. `docs/testing/kan112-modern-layout/README.md`
4. `docs/testing/kan112-modern-layout/before-1440.png`
5. `docs/testing/kan112-modern-layout/before-390.png`
6. `docs/testing/kan112-modern-layout/after-overview-1440.png`
7. `docs/testing/kan112-modern-layout/after-overview-390.png`
8. `docs/testing/kan112-modern-layout/after-1440.png`
9. `docs/testing/kan112-modern-layout/after-390.png`
10. `docs/testing/kan112-modern-layout/instruction-1440.png`
11. `docs/testing/kan112-modern-layout/instruction-390.png`
12. `docs/testing/kan112-modern-layout/visual-results.json`

Separat lokal docs-checkpoint innehåller denna rapport och L/PROJECT_STATE.md.
Root/PROJECT_STATE får bara uppdaterad navigeringsnotis i sin tidigare dirty diff.
Övriga bredders skärmbilder och textförstoringsbilder: `coverage/kan112-modern/`.
Full logg: samma katalogs `regression.log`. Auth-bevis: `coverage/kan112-auth/`.

## Jira och nästa steg

Ny dubblettkontroll i KAN på modernisering/enhetlig/visuell/designsystem/redesign
hittade inget motsvarande appövergripande ärende. KAN-44 gäller begränsad
Bokföring-polish och utesluter bred redesign. Efter uttryckligt ledargodkännande
skapades och återlästes **KAN-114 – SoloLedger – enhetlig visuell modernisering
av hela applikationen**, Task/Medium/To Do/otilldelad. Endast planering; ingen
implementation av KAN-114 startad. KAN-112 inte ändrad till Done; KAN-113 separat.

Retention genomgången: KAN-112 är aktiv, tidigare lokala/hosted rapporter behålls
som evidens och STATE komprimeras till nya fokus. Ingen arkivering av aktivt arbete.
Testbrowserar och lokal smoke-server avslutade. Inga tester kvar i bakgrunden.

**Nästa steg:** Pontus granskar bilderna och beslutar om exakt produktcheckpoint
934ce9b ska publiceras till Staging. Ingen push eller publicering ingår nu.
