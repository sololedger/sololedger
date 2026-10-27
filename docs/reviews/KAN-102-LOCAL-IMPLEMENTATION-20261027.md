# KAN-102 – lokal implementation och verifiering 2026-10-27

## Resultat och avgränsning

Första godkända implementationsetappen är byggd lokalt: modernt Hjälp & FAQ med
24 frågor i sex ämnen, lokal sökning, native utfällbara svar, stabila frågelänkar,
kontrollerad funktionsnavigation och frivilligt bild-/filmstöd. Även övriga
kartlagda texträttningar från handoffen är genomförda. Inga nya produktmedier eller
tomma medieplatshållare visas. KAN-107 är inte påbörjat.

Godkänt analys-/designunderlag är fortsatt oförändrat:
`KAN-102-HANDOFF-20261027.md` och `KAN-102-HELP-CENTER-PROPOSAL-20261027.html`.
Ingen ny bred sak-/databasrevision har gjorts. De sex officiella länkarna från
handoffen har öppnats igen; inget nytt datum, gränsbelopp eller skatteantagande har
lagts till. Källänkar och granskningsdatum finns i berörda artiklar.

## Git och bevarande vid implementationens avslut, före checkpoint

- Produktkopia: `audit-packages/KAN-100-app-release-20261024` under root.
- Ny gren `codex/KAN-102-help-center`, HEAD/bas
  `fff33fc4025a7ccee830e89608b97a04a3defdbf`. Ingen ny commit.
- Bevarad gren `codex/KAN-117-vat-period-preview` på exakt
  `0b1192c1dd7d5396a74bfa5a6307565477c061bf`.
- Ingen reset, merge, push, ny worktree eller rensning. Ocommittade handofffiler,
  tidigare rapporter, fixtures och ignorerade lokalfiler är bevarade.
- Inför grenbytet bevarades dokumentens bytes i processminne. STATE återställdes
  tillfälligt till sin dåvarande HEAD och dokumenten lades omedelbart tillbaka
  efter bytet; `core.autocrlf=false` användes bara för operationen för att undvika
  det befintliga CRLF/indexhindret. Ingen permanent Git-konfiguration ändrades.
- Eftersom den nya grenen startar före KAN-117:s tre dokumentationscommits syns
  den bevarade ARCHIVE-filen som ändrad och fem äldre rapport/kvittofiler som
  untracked. Det är bevarad KAN-117-dokumentation, inte ny KAN-102-produktkod.
  ARCHIVE har ingen diff mot 0b1192c. Alla äldre untracked rapporter finns kvar.
- Root står kvar på staging/3d0a032. Endast dess aktuella STATE-läsanvisning
  uppdateras; övriga befintliga dirty filer bevaras.
- Inget är staged. Ingen commit får göras utan separat Pontus-godkännande.

## Vad som ändrats

- Typat innehåll och sökning: `src/lib/helpContent.ts`. Unika stabila ID:n,
  alias, ämnen, svar, tillämpning, steg, varningar, funktionsmål och källor.
  Sökningen hanterar svenska tecken, sökord/synonymer, flera ord och ämnesfilter.
- `FAQ.tsx`: responsiv läsyta enligt skissen; mobil väljare, sök/rensa,
  träffantal/ingen träff, tangentbord, fokus, svenska språksemantiken och länkar.
- `helpNavigation.ts`, `useHelpNavigation.ts` och liten integration i `page.tsx`:
  hjälpens egen `help`-parameter, historik, återgång och ägarbundet läsläge i minne.
  Alla nio mål är befintliga flikar. Befintliga behörighets-/betalväggsskydd gäller.
- Frågelänkexempel: `/?help=ne-r14`; gammalt alias `r14` stöds. Okänt ID ger
  begripligt besked och sökning. Omladdning och tillbaka/fram är provade.
- Kopierade länkar byggs från appadress och kanoniskt ID. Övriga parametrar och
  fragment tas bort, så auth-koder/tokens/användaruppgifter inte följer med.
- Inloggning behåller väntande frågelänk. Password recovery visas först. Den
  enda useAuth-ändringen är en ren returadress för återställningen: origin och
  känt fråge-ID, annars samma origin som tidigare. Intern navigation bevarar
  övrig query/fragment tills Auth hanterar dem.
- Sökning/ämne/öppna svar bevaras vid funktionsbesök och samma ägares auth-refresh.
  Återgång återför fokus till rätt fråga. Kontobyte/utloggning rensar besöket.
  Hjälpen använder ingen beständig klientlagring.
- R14, momsbetalning/skattekonto, privata utlägg, periodisering, rättelser,
  SIE-ångring, intäkt/insättning, momskort och Säkert uttag är rättade/förtydligade.
- NE-guidens historiktext, Profilens tre framtidstexter och betalningskontots
  hjälptext i TransactionForm är rättade. Arbetsgångarna är bevarade.
- Tre små klassändringar i Layout låter logotyp/meny radbrytas på smala skärmar
  med förstorad text. Ingen menyfunktion ändras. Fokusramar ligger innanför
  utfällbara frågors kant så att de inte klipps bort.
- `docs/HELP-CONTENT.md` beskriver framtida redigering, ID:n och säkra mediefiler.
  Paketändringen lägger endast till testkommandon och inkluderar hjälpen i den
  säkra regressionen. Inga beroenden eller package-lock-ändringar.

## Ekonomisk integrationsyta och risk

Ingen journal, transaktionskälla, metadata, RPC, momsaggregation/periodlogik,
NE-/resultat-/balansberäkning, dashboardberäkning, fordran, betalningsbokning,
rättelse-/ångringsregel, SIE eller årslås ändras. Kontrollerad navigation öppnar
endast en befintlig vy och får inte bekräfta eller skriva något. SQL, API-rutter,
accountingService, resultEngine, calculations och useAccountingData har ingen diff.
Därför behövs inget ekonomiskt skrivande E2E-prov för denna UI-/textändring.
Den säkra regressionen verifierar befintliga ekonomiska ytor med sina syntetiska
fixturer. Inga riktiga användaruppgifter används som testdata.

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| `npm run test:help-content` | PASS – 24 artiklar, ID/alias, mål/källor/media, åäö/synonymer, kombinerad sökning, URL-renhet |
| `npm run test:help-center` | PASS – faktisk Home/useAuth/FAQ på 1440/390/320, samtliga nio funktionsmål |
| Frågelänk + inloggning | PASS – utloggad länk, riktig useAuth med syntetisk inloggning, omladdning, känt/okänt/alias-ID |
| Password recovery | PASS – ren redirectTo, installerad GoTrueClient läser syntetiskt recovery-fragment, fragment rensas av SDK, återställningsvy prioriteras och frågan öppnas efteråt |
| Navigation/läsläge/ägare | PASS – tillbaka/fram, sökning/ämne/öppna svar, korrekt fokus, samma ägares refresh, A→B-rensning |
| Mobil/tangentbord/reflow | PASS – native tangentbordsöppning, 320/390, 200 % text, sidans faktiska bredd och hjälpens egen scrollbredd |
| Frivillig media | PASS – ingen montering före öppning, syntetisk saknad bild, felbesked, filmkontroller/preload none/ingen autoplay, svensk track och textversion |
| Typecheck | PASS |
| Berörd lint | PASS utan nya anmärkningar; nya hjälpfiler rena. Befintliga anmärkningar i page/ProfileSettings kvarstår och jämförs mot fff33fc |
| Build | PASS med endast syntetiska Supabase-värden; inga miljöfiler ändrade |
| `npm run test:regression` | PASS, inklusive tre publika lokala Playwright-smokeprov och utökad NE-historikregression |
| Befintligt auth-focus-prov | PASS efter avgränsning av URL-hantering till faktiska hjälpbesök |

Den fulla regressionen passerade efter rättning av de fel proven hittade. Därefter
passerade en extra fokuserad hjälp-/breddkontroll med det sista sidhuvudsutseendet.
Slutlig extra årsavslutsnavigation efter den lilla layoutändringen PASS på
1440/1024/768/390/320 med faktisk Home/Layout och syntetisk transport.

Lokal evidens, ignorerad och inte avsedd för Git:
`coverage/kan102-help/result.json`, `lint.json`, `build.log`, `regression.log`,
`help-1440.png`, `help-390.png`, `help-320.png` och motsvarande `help-200-*`.
Skärmbilderna visar enbart syntetiska uppgifter och är visuellt granskade.

Inledningsvis saknade sandlådans profil Chromium och Edge kunde inte starta där.
Användarprofilens redan installerade Chromium återanvändes utanför sandlådan.
Ingen browserinstallation eller dependencyändring behövdes.
Build behövde syntetiska processvariabler eftersom produktkopian saknar env-filer.
Varning om flera lockfiler/workspace-root är befintlig; inga lockfiler raderades.

## Återstående manuell acceptans och publiceringsspärr

- Fysisk mobil med verkligt skärmtangentbord och faktisk skärmläsare är inte provade.
  Webbläsarens mobilemulering/tangentbords-/semantikprov ersätter inte dessa.
- Ingen verklig reset-mejlutskickning, hosted Auth-session eller redirect-allowlist
  har ändrats eller verifierats. Prova den faktiska mejllänken i en senare
  uttryckligt godkänd acceptansmiljö; den lokala app-/SDK-kedjan är syntetiskt provad.
- Ingen färdig instruktionfilm eller produktbild har skapats. Först när granskade
  mediefiler finns, koppla dem till artiklar och granska innehåll/textning separat.
- Pontus ska visuellt acceptera innehåll och mobil/datorlayout före publicering.
- Ingen commit, push, deployment, migration, Staging-/Production-ändring eller
  Jira-mutation har gjorts. Jira KAN-102 lästes Task/To Do/otilldelad.
  Ingen In Review-/Done-övergång görs i detta uppdrag.
- Nästa steg: manuell lokal acceptans och separat beslut om eventuell commit.
  Inget publiceringsgodkännande är underförstått. KAN-107 ska fortsatt vänta.

Konkreta manuella prov i en senare godkänd acceptansmiljö:

1. På fysisk mobil: öppna Hjälp & FAQ, sök på årslås med skärmtangentbordet,
   byt ämne, rensa och läs ett långt svar. Kontrollera tryckytor och sidscroll.
2. Med faktisk skärmläsare: hitta sökfältets etikett, lyssna på träffantalet,
   öppna/stäng en fråga, gå till en funktion och tillbaka. Kontrollera att fokus
   hamnar på rätt fråga och att innehållet läses på svenska.
3. Öppna `?help=ne-r14` utloggad, välj Glömt lösenord och följ ett verkligt
   återställningsmejl. Återställningsskärmen ska komma först; därefter samma
   fråga. Verifiera även att den godkända miljön tillåter den rena returadressen.
   Detta mejlprov har inte utförts eller godkänts att skickas i denna session.

## Godkänd lokal checkpoint 2026-10-27

Pontus har granskat rapporten och godkänt första etappen samt en avgränsad lokal
checkpoint med meddelandet `feat(KAN-102): modernize help center and guidance`.
Ingen produktkod ändras i checkpointsteget. Tidigare verifieringsresultat gäller;
hjälpens innehållstest, typecheck och diffkontroll passerade igen före commit.
Manuell acceptans och publicering kräver fortsatt separat beslut.
Ingen push, merge, deploy, DB- eller Jira-åtgärd.

Exakt avsett innehåll, 20 filer från produktkopians rot:

- `docs/HELP-CONTENT.md`
- `docs/reviews/KAN-102-LOCAL-IMPLEMENTATION-20261027.md`
- `docs/testing/kan102-local-verification-20261027.json`
- `package.json`
- `scripts/check-help-center-lint.mjs`
- `scripts/test-help-center-browser.mjs`
- `scripts/test-help-center.ts`
- `scripts/test-ne-declaration-guide.mjs`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/components/FAQ.tsx`
- `src/components/Layout.tsx`
- `src/components/NEDeclarationGuide.tsx`
- `src/components/ProfileSettings.tsx`
- `src/components/TransactionForm.tsx`
- `src/hooks/useAuth.ts`
- `src/hooks/useHelpNavigation.ts`
- `src/lib/helpContent.ts`
- `src/lib/helpNavigation.ts`
- `tests/e2e/public-auth.spec.ts`

Utanför commiten: PROJECT_STATE.md, PROJECT_ARCHIVE.md, KAN-102-handoff/skiss,
samtliga KAN-117-rapporter/kvitton och rootkopians tidigare ändringar. STATE hålls
aktuell lokalt efter checkpointen. Testkvittots HEAD/commits avser den bevarade
verifieringsögonblicksbilden före checkpointen, inte det nya commitresultatet.
Retention: KAN-102 är aktivt, KAN-117-historik bevaras; ingen arkivering/rensning.
