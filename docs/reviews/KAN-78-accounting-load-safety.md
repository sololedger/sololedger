# KAN-78 – ekonomidata vid läsfel och årsbyte

Datum: 2026-10-19. Lokal kandidat på `codex/KAN-78-accounting-load-safety`.
Bas: GitHub-main `e7f1442921338bc3983a96ae75a4aaeca4bc8bcd`, verifierad med färsk `git ls-remote`.

## Grundorsak och reproduktion

`useAccountingData` hade separata state för historik, årssaldon, kumulativa saldon,
NE och momsöversikt. Historiken hade ett eget fullständighetsskydd, men supporting-data-fel
loggades utan att gamla saldon/NE togs bort. Dashboard och NE saknade en gemensam
laddnings-/felgräns. Årskontrollen i refresh skilde inte mellan två samtidiga hämtningar
för samma år eller mellan användare. Ett A→B→A-byte kunde åter göra ett gammalt svar giltigt.
Årslås hade en separat oskyddad asynkron laddning.

`node scripts/test-accounting-load-ui.mjs --reproduce-before` laddar hooken från
oförändrad main (`e7f1442`) och injicerar ett NE-läsfel. Reproduktion PASS:
årsetiketten är 2027 men NE-beloppet är fortfarande 2026-fixturens 126.
Den nya versionen visar inga belopp i samma situation.

Tidigare KAN-95-underlag och Jira KAN-95 har lästs. Dess flerårs-/SIE-resultatfrågor
är separata; KAN-78 ändrar inte årsöverföringar eller löser KAN-96.

## Ändrade produktfiler och funktioner

| Fil | Ändring |
| --- | --- |
| `src/hooks/useAccountingData.ts` | `useAccountingData`/`refreshDataInternal`: en gemensam publicering av historik, saldon, NE, momsöversikt och årslås. Identitets-/årskopplad snapshot, laddningssekvens, kontroll av verifierad användare före/efter läsning, maskering redan vid render och nytt `retryAccountingData`. Kontoplansladdningen har samma kontextskydd. Dubblerade initial-/refreshvägar har ersatts av samma väg. |
| `src/components/AccountingDataBoundary.tsx` | Ny gemensam vygräns: laddning, begripligt svenskt fel och Försök igen. Barnens ekonomiska innehåll renderas först när data är klara. |
| `src/app/page.tsx` | `Home`: dashboard, dess detaljvyer/historik och NE omfattas av gränsen. NE, fakturor och inventarier får användar-/årsbundna komponentnycklar; momsrapporten användarbunden nyckel eftersom den har eget årsval. Interna tomma beräkningsvärden får inte renderas som ekonomiskt resultat under laddning/fel. |
| `src/lib/dashboardVat.ts` | `getDashboardVatBreakdown` och `dashboardVatBreakdownFromReportResult`: tekniska läsfel/ogiltigt läst scope skickas vidare till felgränsen. Lyckat lästa men bokföringsmässigt blockerade underlag behåller sin befintliga granskningspresentation. |
| `src/components/CustomerInvoicesPanel.tsx` | `loadInvoices`: tömmer tidigare visningsdata, skilda laddnings-/felläge och återförsök; sekvenskontroll skyddar mot överlappande svar. |
| `src/components/FixedAssetsPanel.tsx` | `loadPanel`: sekvensskydd samt separat tekniskt fel med återförsök. Årets tidigare värden visas inte efter läsfel. |
| `src/components/Momsrapport.tsx` | `loadVatPeriods`/`handleYearChange`/`handlePeriodChange`: periodlista och valt period-ID töms direkt vid årsbyte; föråldrade periodladdningar ignoreras. Felläge får återförsök. Rapport-/avräkningsläsningar ogiltigförklaras direkt vid års-/periodbyte, även A→B→A. |

## Bokföringsmässig integrationskontroll

- Journaler, transaktionskällor, metadata, RPC-signaturer och alla bokföringsskrivningar är oförändrade.
- Momsaggregation, periodavslut och deklarationsregler är oförändrade. Endast tekniska läsfels presentation ändras. Befintliga granskningsfall ger fortfarande inget säkert uttag.
- NE/resultat/balans/årsöverföring och dashboardens formler är oförändrade. De får endast visas efter lyckad laddning av rätt kontext.
- Fakturors kundfordringar, betalningar och årsöverskridande behandling är oförändrade; endast laddning och visning skyddas.
- Rättelser, återföringar, SIE-import/export och periodlås ändras inte. SIE-export läser sitt eget underlag och använder inte de maskerade UI-saldona.
- Ett verifierat tomt transaktionsår är inte samma sak som noll kumulativ balans. Befintliga kumulativa saldon hämtas som tidigare.
- Företagskontexten i nuvarande app är användarens bokföring (`user.id`); ingen separat företagsväljare eller ny identitetsmodell införs.
- Inga DB-/RPC-definitioner ändras och ingen ny beständig datadomän skapas. Live DB-inspektion, migrations- och raderingstest behövs därför inte för denna UI-laddningsändring.
- Ett skrivande ekonomiskt E2E-flöde är inte tillämpligt: inga belopp eller bokföringsbeslut ändras. Riktiga beräkningar/vyer och befintliga domänregressioner provas med syntetiska lässvar.

## Testfiler

- `scripts/test-accounting-load-ui.mjs`, `tests/fixtures/accountingLoadHarness.tsx`, `tests/fixtures/accountingLoadMocks.ts`: Chromium, riktig hook/felgräns/OverviewCards/NEBilaga, syntetiska uppskjutna svar. Alla nätanrop blockeras. Ny svit ingår i `test:domain` och därmed säker regression; separat `npm run test:accounting-load` finns.
- `scripts/test-accounting-panel-loads.mjs`: kör de faktiska laddningsfunktionerna för fakturor/inventarier/moms med syntetiska uppskjutna svar; fyra grupper för fel/återförsök/sena svar och momsrapportens A→B→A.
- `scripts/test-dashboard-vat.ts`: två nya regressioner för tekniska fel.
- `scripts/test-sie-vat-periods.ts`: saknat/misslyckat historikläsanrop ska nu kasta laddningsfel; lyckat lästa historiska granskningsfall behåller tidigare assertioner.
- `scripts/test-ne-account-coverage.mjs`: rättar befintligt fel i testets resolveDir för baseline-vyn, så dess relativa komponentimport kan hittas. Inga assertioner tas bort.
- `scripts/test-standard-booking-browser.mjs`: lyckad loader-fixture får det nya statusgränssnittet och använder riktig AccountingDataBoundary. Befintliga boknings-/återhämtningsassertioner behålls.
- `package.json`: kopplar in den nya sviten; inga beroenden eller lockfilsändringar.

## Verifiering

| Kontroll | Utfall |
| --- | --- |
| Reproduktion före fix, syntetiskt 2026→2027/NE-fel | PASS, gamla belopp påvisade |
| Ny laddningssvit, 16 rapporterade kontrollgrupper | PASS |
| Lyckat 2026 och lyckat byte till 2027 | PASS |
| Fel i årssaldo, kumulativt saldo, NE, historik, moms eller årslås + återförsök | PASS |
| Saknat NE-underlag, första kontohämtning misslyckas + återförsök | PASS |
| Snabbt A→B→A och svar i fel ordning | PASS |
| Överlappande refresh för samma år, inklusive föråldrat felsvar | PASS |
| Användar-/företagsbyte samma år och utloggning under laddning | PASS |
| Korrekt tomt år skiljs från läsfel; React StrictMode | PASS |
| Separata vyers riktiga loaders, 4 kontrollgrupper | PASS |
| Momsöversiktens riktade tester | PASS, 22 assertioner |
| TypeScript | PASS |
| Byggkontroll, `npm run build -- --webpack` | PASS, syntetiska miljövärden; ingen publicering |
| Säker regression | PASS, hela `npm run test:regression` på slutlig produktkod inklusive publik smoke 2/2 och bokningsåterhämtning desktop/mobil |
| Lint för nya filer och berörda test-/momsfiler | PASS |
| Full `npm run lint` | FAIL: 82 fel/7 varningar; samma main-bas har 86 fel/8 varningar. Ingen ökning per fil/regel/allvarlighetsgrad. Befintliga orelaterade fel lämnas utanför KAN-78. |
| `git diff --check` | PASS |

Första lokala försöken krävde explicit sökväg till redan installerad Chromium.
Build behövde nätåtkomst för befintliga Google Fonts och syntetisk service-key
för att skapa befintliga serverklienter vid sidgenerering. Inga hemligheter eller
lokala miljöfiler har lästs/kopierats/ändrats för detta. Publik smoke använder syntetisk
Supabase-adress och skickar inga inloggningar eller bokföringsskrivningar.

## Acceptans och begränsningar

Pontus ska i en separat godkänd testmiljö kontrollera: öppna 2026, byt till 2027,
blockera ett relevant läsanrop, kontrollera att dashboard och NE inte visar tidigare
belopp, återställ nätet och välj Försök igen. Prova också fakturor/inventarier och
momsrapportens eget årsval samt snabb växling fram och tillbaka. Använd syntetiskt konto.

Backend/hostad Staging/Production och verkligt inloggat företagsbyte är inte E2E-testade
inom detta uppdrag. De riktade racetesterna använder riktiga React-vyer med kontrollerade
syntetiska svar; faktura-/inventarievyerna har kontextnycklar, riktade callbacktester och befintlig offline-regression.
Vid laddningsfel blockeras hela dashboard-/NE-innehållet, inklusive dashboardens formulär,
tills ny laddning lyckas. Ingen generell flerårs-/deklarationsacceptans påstås.

Separat kodobservation vid granskning av kontobytesgränsen: `useAuth` hämtar även
företagsprofilen asynkront, utan motsvarande ägarmarkör för profilsvaren. Denna
profil-livscykel är inte samma loader som KAN-78:s ekonomiska snapshot. Dess beteende
vid kontobyte i en kvarvarande session är inte verifierat här; normala utloggningen
laddar om sidan. Ingen Production-incident påstås. Jira-sökning gav ingen relevant
dubblett; inget annat ärende har skapats/ändrats och ingen separat authfix har lagts
in. Fullständig företagsbytesacceptans måste även kontrollera detta innan den påstås.

Ingen Supabase-ändring, migration, Production-skrivtest, Vercel-deploy eller push.
Jira **KAN-78 In Review / Pontus Åkerhage**, uppdaterad och verifierad 2026-10-19. Lokal commit är uttryckligen beställd i uppdraget. Nästa steg är ledargranskning och
Pontus acceptans; publicering kräver ett nytt uttryckligt godkännande.

Identitetskontrollen återanvänder projektets `getUserId`, som anropar verifierande
[`getUser`](https://supabase.com/docs/reference/javascript/auth-getuser).
