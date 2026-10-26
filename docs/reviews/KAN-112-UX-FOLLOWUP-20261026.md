# KAN-112 – årsavslutsguidens UX-uppföljning

2026-10-26. **PASS lokalt inför ett nytt godkänt Staging-test.**
Produktcommit `667303026ecf41b75e31c3f69e292a1c1aabbfd0`.
Ingen push, publicering, migration, Production-ändring eller Jira-mutation.

## Verifierad utgångspunkt

- Ren produktarbetskopia L, gren `codex/KAN-112-year-end-checklist`, HEAD `ef77084`.
- L:s origin är en lokal KAN-62-kopia, inte GitHub. Root var redan dirty och
  användes inte som produktkälla; orelaterat arbete bevarades.
- Jira KAN-112 läst: Sololedger/KAN, Task, To Do, otilldelad. Inte ändrad till Done.
- Vercel återläst: `dpl_ACc218U3uJ8U5Jp393GhfKY3UfYw`, READY, Preview,
  staging/`bf845c21955552a4bfb26e67cd45c189064663fa`, rätt projekt/team.
  Ordinarie Staging-alias pekade på denna deployment. Ingen aliaskorrigering.
- Verklig browsertrafik verifierad mot enbart Supabase Staging
  `fzxqiqenqjzhlyxxpvhg`, med tidigare markerat syntetiskt konto A.
  Befintliga kohortmarkörer verifierades före tester; inga riktiga konton användes.

## Grundorsak och reproduktion

Supabase Auth återkontrollerar sessionen när dokumentet blir synligt och kan
skicka `SIGNED_IN` igen för samma användare. `useAuth` skapar då omedelbart en
ny profilgeneration, som inte är godkänd förrän profilläsningen lyckats.
Årsavslutets tidigare React-nyckel innehöll generationen och monterade om
checklistan för tidigt. Dess ytterligare fokusläsning kunde också konkurrera
med samma kontroll. `requireProfileContext` nekade läsningen korrekt, men
checklistan översatte nekandet till ett bestående generellt läsfel.

På publicerad Staging återkom exakt den rapporterade röda texten vid **5 av 5**
visibility-återkomster. Profilanropen svarade HTTP200; efter första lyckade
checklistläsningen skickades inga nya checklist-RPC:er under dessa fem försök.
Detta var alltså ett lokalt livscykelfel före API-anropet, inte raderade svar.
Headless-flikarnas `bringToFront` gav inga visibility-händelser. Därför skickades
browserns visibility-händelse till den verkliga installerade Supabase-lyssnaren.
Detta är dokumenterad händelsereproduktion, inte ett påstående om manuellt OS-flikbyte.

Det permanenta regressionstestet kör verkliga `useAuth`, profilskydd,
checklistklient, store och guide samt installerade Auth-SDK:ns visibility recovery.
Syntetisk nätverkstransport ger styrbara fördröjningar. Samma test reproducerar
felet med tidigare komponent och generationsnyckel på både 1440 och 390 px.

## De fem förbättringarna

1. **Läsning efter verifierad inloggning.** Guidens tillstånd lever vidare för
   samma ägare/år. Pågående äldre svar ogiltigförklaras. Checklistan väntar på
   rätt godkända profilgeneration och gör en omläsning därefter. Den separata
   fokusläsningen är borttagen. Verkliga läsfel visas fortfarande, och ett osäkert
   sparförsök behåller samma begäran-id för uttryckligt återförsök. Ingen automatisk
   överskrivning eller falsk Sparat-status införs.
2. **Tillbaka till rätt plats.** Befintlig lokal navigation minns ursprungsår,
   öppna huvuddelar/kontroller och den kontrollpunkt vars länk användes. Returknappen
   och menyn Årsavslut återställer året och öppningarna samt scrollar/fokuserar
   punktens rubrik. Samma ägares profilförnyelse raderar inte besöket. Ingen
   browserlagring eller global navigationslösning tillkommer.
3. **Generell momsinstruktion.** Leverantörsexempel och räkneexempel borttagna.
   Texten gäller momsuppgifter, underlag, perioder och avvikelser. Varning om
   osäker behandling samt skillnaden mellan stängning, deklaration och betalning
   kvarstår. Samtliga elva punkter genomlästa; deras konkreta stödbegränsningar och
   viktiga säkerhetsbesked behålls. Ingen ny skatteregel eller beräkning införs.
4. **Begriplig status.** Grön bock vid Bekräftat av dig. Ändrat underlag ger
   varningssymbol och texten Kontrollera igen – underlaget har ändrats. Kryss och
   tidigare datum bevaras tills användaren själv ändrar/bekräftar på nytt.
   Symbolerna kompletterar text; statusen kräver inte färgseende.
5. **Systemstatus även stängd.** Kort sammanfattning visar öppet/låst år,
   registrerade momsperioder och antal deklarationsversioner. Utfälld sektion visar
   befintliga perioddatum/statusar. Deklarerad moms märks användarregistrerad,
   inte Skatteverksverifierad. Antalet versioner säger inte att NE lämnats in;
   något separat NE-inlämningsbesked finns inte i detta RPC-svar och uppfinns inte.

## Integration, säkerhet och avgränsning

Endast checklistans livscykel, lokal navigation, instruktioner och presentation
ändras. Befintligt läs-/spar-RPC, revisions-/underlagskontroll, idempotens,
serveridentitet och RLS är kvar. `profileContextReady` är ett klientbesked;
befintliga kontroller vid varje RPC har inte lättats.

Journaler, transaktionskällor, bokningsvägar, momsberäkning/periodstängning,
NE/resultat/balans, dashboard/uttagsutrymme, fakturor/betalningar,
rättelser/återföringar, SIE och årslås saknar produktändring här. Därför behövs
ingen ny ekonomisk transaktions-/årsavslutschecklista eller DB-migration.
Deras befintliga relevanta regressioner ingår i säker regression.
KAN-113 och det äldre SQL-testfelet ligger kvar utanför uppdraget.

## Genomförd verifiering

| Kontroll | Resultat |
| --- | --- |
| Verklig publicerad Staging, fem återkomster före rättning | Felet reproducerat 5/5 |
| Tidigare komponent/generationsnyckel i permanent regression | Reproducerat, 1440/390 |
| Aktuell verklig Auth/klient/store/guide i React StrictMode | PASS, 1440/390 |
| Fem upprepade visibility-återkomster, ingen för tidig/dubbel fokusläsning | PASS |
| 35 min simulerad inaktivitet följd av tokenförnyelse | PASS |
| Osäkert pågående sparande, sent svar, samma idempotenta återförsök | PASS |
| Verkligt läsfel, tydlig varning, omläsning och återhämtning | PASS |
| Nytt underlag, bibehållet kryss/datum, omkontroll, avmarkering | PASS |
| Ägare/år, kontobyte, utloggning, misslyckad profilkontroll | PASS |
| Home/Layout, sex destinationer, ändrat destinationsår och profilgeneration | PASS, 1440/390 |
| Lokal Next-app med verklig Auth och Staging-RPC, konto A | PASS, 1440/390 |
| Faktiskt autosparande/avmarkering/omladdning/returscroll/API-läsfel | PASS |
| Staging B kan inte läsa A:s checklistrader | PASS |
| Syntetiska A:s ursprungliga bekräftelseflaggor och ekonomiska underlagsvärden | Återställda/oförändrade efter test |
| Skärmbilder dator/mobil, bock och varning, inget horisontellt överflöde | Inspekterat/PASS |
| TypeScript efter verklig lokal dev-körning | PASS |
| Riktad ESLint samt guide-jämförelse med tidigare fel | PASS, inga nya fel |
| E2E-säkerhetskontroll | PASS |

`npm run test:regression` passerade deklarationsklient, hela domänkedjan,
årsavslutets nya tester, historik och UI-round men stannade vid lokal smoke-serverns
starttidsgräns. Ett avgränsat omtest utanför nätverksspärren med uttryckligen
syntetisk localhost-Supabase gav **publik Playwright-smoke 2/2 PASS**. De två
återstående regressionstegen kördes därefter och passerade: kategori-UI och
standardbokningens browserregression. Samtliga delar är alltså verifierade,
men första hela kommandot hade exit 1 på grund av serverstarten.

Lokal acceptans hade först en testskriptsmiss: efter full omladdning valde appen
som tidigare kalenderåret 2026. Testet rättades att åter välja 2025 och passerade.
Inga ekonomiska poster skapades. Bara verifierade syntetiska checklistrader ändrades.
35 minuter var simulerade; verklig manuell fönsterväxling återstår för Pontus.
Ingen ny full DB-, Edge-delete- eller låsregression och ingen Production-build
kördes; dessa vägar ändras inte av kandidaten.

## Exakt fillista

Produktcommit `667303026ecf41b75e31c3f69e292a1c1aabbfd0`:

- `src/app/page.tsx`
- `src/components/YearEndGuide.tsx`
- `src/components/YearEndChecklistControls.tsx`
- `src/hooks/useAuth.ts`
- `src/lib/profileContext.ts`
- `src/lib/yearEndChecklist.ts`
- `scripts/test-year-end-auth.mjs` (ny, ingår i säker regression)
- `scripts/test-year-end-guide.mjs`
- `scripts/check-year-end-guide-lint.mjs` (tillåter färre gamla fel, inga nya)
- `package.json`

Separat lokal dokumentationscheckpoint: denna rapport och L/`PROJECT_STATE.md`.
Root/`PROJECT_STATE.md` får bara en uppdaterad navigeringsnotis, ocommittad med
tidigare orelaterad diff. Inga miljöfiler, credentials, audit-packages eller
genererade filer ingår i produktcommit. `package-lock.json` oförändrad.

Bevis: L/coverage/kan112-auth, kan112-browser, kan112-ux-regression.log,
kan112-ux-smoke-retry.log och kan99-evidence/lint-comparison.json.
Root/audit-packages/KAN-112-ux-20261026 innehåller händelsereproduktion,
lokal syntetisk hosted acceptans och bilder. De lokala testservrarna är avslutade.

## Nästa beslut

Ingen större arkitekturrisk eller migrationsbehov upptäckt. Inga öppna sakfrågor
hindrar nytt Staging-test. Pontus behöver godkänna exakt produktcommit för ny
Staging-publicering och sedan manuellt prova verkliga flik-/fönsterbyten och
retur från Moms/NE. Publicerad Staging ligger kvar på bf845c2 tills dess.
Production är inte godkänd. Jira förblir oförändrad. Retention genomgången:
detta är aktiv KAN-112, tidigare acceptansrapporter behålls som jämförelseunderlag.
