# KAN-99 Etapp A – lokal navigationsrättelse och slutförd läsande Staging-smoke

2026-10-22. **LOCAL PASS – redo för separat godkännande av ny Staging-publicering.**
Den korrigerade koden är inte publicerad. Staging kör fortfarande SHA81 med det kända felet.
Produktkopia `audit-packages/KAN-99-local`, gren `codex/KAN-99-year-end-guide`,
förälder **81ea7e98b576cb599354f3f4e611ae28af1b0e36**. Exakt ny SHA fastställs vid lokal checkpoint.

## Grundorsak och minimal ändring

`yearEndReturnScope` bands till ägare, år och accepterad profilkontext. Det ogiltigförklarade
korrekt kontextbyten men förbrukades inte vid vanliga menyval eller återgång. Därför kunde
samma giltiga kontext visa knappen på senare sidor; F5 rensade React-tillståndet.

Enda produktkodändringen är i **src/app/page.tsx**:
ordinarie `setActiveTab` rensar nu återgångsinformation och väljer sidan. Guidefunktionen
är den enda vägen som skapar ett nytt återgångstillstånd och väljer sitt mål direkt.
Även återgångsknappen, menyval till samma sida och befintliga interna sidbyten förbrukar informationen.
Övriga sidmål och tidigare ägar-/års-/profilgränser bevaras. Ingen ny lagring/effect eller routingmodell.

Bokföringsintegration: enbart transient navigation, inga ändringar i journaler, transaktionskällor,
betalningar, rättelser, moms, NE, dashboardberäkningar, SIE eller årslås. DB-/bokförings-E2E
är därför inte motiverat för rättelsen; befintliga destinationsflöden återanvänds.

## Regression och lokala kontroller

- Befintligt **scripts/test-year-end-guide.mjs** utökat. Verklig Home/Layout/guide på 1440/390 px:
  Profil/NE → annat menyval, samma sida i menyn, återgång → senare menybesök,
  profilbyte och ägare A→B→A med aktiv returbiljett, befintliga årstester och inga skrivningar.
- Det nya testet reproducerade före rättelsen **förväntat 0 returknappar, faktiskt 1**.
  Efter rättelsen: **10 browsergrupper PASS**, samtliga sju mål/retur, kontext och mobil.
- Befintlig lokal menytesthjälpare hanterar nu `menuitem` i desktopens Mer-meny.
- Typkontroll och optimerat Next16.2.6-bygge **PASS**. Bygget är lokalt med syntetiska
  processvärden, ingen publicering. Befintlig varning om flera lockfiler, inga lockfiler ändrade.
- Riktad lint **PASS utan nya fel**: test/guide 0; Home/Layout samma tidigare 10+1 fel.
  Helrepots tidigare 72 fel/6 varningar repareras inte av denna avgränsning; full lint inte omkörd.
- Befintliga säkra **test-standard-booking-page.mjs** och **test-profile-context.mjs PASS**.
  Ingen bred domän-/DB-/regressionssuite omkörd. Föregående A-bevis behålls som historik.

## Återstående Staging-smoke på redan publicerad SHA81

Ordinarie Staging-adress <https://sololedger-git-staging-sololedger1.vercel.app>,
**dpl_DGYHJKc89A36zs465zKNdywTv2jc READY**, exakt **81ea7e98b576cb599354f3f4e611ae28af1b0e36**,
Preview/target null. Inget nytt bygge, aliasbyte, push eller deploy gjordes i denna korrigering.

| Kontroll | Resultat |
| --- | --- |
| Verklig syntetisk login, guide/företag/2026/förberedelser/åtta kontroller | PASS |
| Bokföring, Profil, Fakturor, Bokslutsskulder, Inventarier, NE och återgång | PASS |
| Moms-mål och återgång | PASS för navigation, full dataladdning undantagen |
| 2026→2027→2026, stängda instruktioner och rätt årstext | PASS |
| Mobil390/desktop1440, ingen mobil överbreddning | PASS |
| Ägarbyte med appens verkliga utloggning/omladdning | PASS, rätt nytt företag/årslås, ingen gammal returinformation |
| Browserfel / oväntade skrivförsök i körda flöden | 0 / 0 |
| API-mål | Endast Supabase Staging fzxqiqenqjzhlyxxpvhg |
| Alla 30 public-tabellers antal/fingeravtryck och 59 migrationsversioner före/efter | PASS, identiska |

Testets gamla knappväljare ersattes med val av rätt instruktion och dess synliga summary
innan målknappen används. Ingen produktändring behövdes för detta.
Första körningen passerade navigation/mobil/år men ägarprovet försökte logga in före den
befintliga utloggningsomladdningen var färdig. En enda riktad omkontroll av ägarbyte väntade
på navigation och passerade. Övriga passerade hosted-delar kördes inte om. Första körningens
exit1 bevaras; kombinerade delresultat kallas inte ett sammanhängande exit0.

`ensure_vat_periods` blockerades **före nätverket**. Ingen initiering, bokning, låsning,
profiländring eller manuell DB-skrivning genomfördes. Normal Auth-inloggning skapar sessioner;
integritetsjämförelsen gäller public-data, inte Auth-sessionmetadata. Inga testkonton skapades.
Den lokala rättelsen av menyreturen är ännu inte verifierad i hosted miljö och kräver nytt
publiceringsgodkännande/exakt ny SHA och fokuserad Staging-acceptans.

## Stående aliasrutin

Pontus nya begränsade behörighet finns i **AGENTS.md**, både root och produktkopian:
vid redan uttryckligen godkänd Staging-publicering får endast verifierat ordinarie Staging-alias
korrigeras till exakt godkänd READY-deployment efter kontroll av SHA/branch/Preview/projekt/team.
Alla andra alias ska vara oförändrade; faktisk koppling och klientmiljö verifieras före/efter och dokumenteras.
Ingen ny build, migration/DB-skrivning eller generell domän-/branch-/miljö-/projektändring ingår.
Osäker identitet/säkerhet innebär stopp. Övriga push-/deploy-/DB-/Jira-godkännanden kvarstår.
Vercels bakomliggande tilldelningsorsak är fortfarande obekräftad; regeln påstår inte att den är reparerad.

## Nästa steg

Begär nytt godkännande av exakt korrigerad kandidat före push/deploy. Efter publicering:
kontrollera vanligt alias/SHA/Staging-konfiguration och prova särskilt guide→Profil/NE→ordinarie
meny, återgång→senare meny samt kontextbyte på dator/mobil. Ingen bokning behövs.
KAN-99 verifierat **In Review/Pontus**, inte Done. B/C utanför scope.
Testbevis: **docs/testing/kan99-navigation-fix-20261022/**; lokala helpers i audit-packages, utan credentials i Git.
