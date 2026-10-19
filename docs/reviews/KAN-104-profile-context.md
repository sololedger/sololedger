# KAN-104 – profilkontext, race och bokföringsskydd

2026-10-19. Lokal kandidat ovanpå KAN-78, ingen publicering. **Production fortsatt BLOCKED i väntan på ledargranskning och gemensam releaseacceptans.**

## Bas, avgränsning och tidigare bevis

GitHub main lästes direkt med `git ls-remote`: `e7f1442921338bc3983a96ae75a4aaeca4bc8bcd`.
Ren KAN-78-produktkandidat: `67d314a95f9f964aa2adabce81e3cf799366eb3f`, med `0db6fe8` och `67d314a` ovanpå main.
Separat lokal klon `audit-packages/KAN-104-source`, gren `codex/KAN-104-profile-context`, startad exakt från kandidaten.
Ingen kod från Desktop-staging/KAN-62/65 har integrerats. Inventariepanelen får endast samma identitetsspärr som andra profilkonsumenter; ingen inventarieregel ändras.

KAN-78-kopians fyra ocommittade dokumentationsändringar identifierades före arbete: PROJECT_STATE och tre granskningsrapporter. De tre rapporterna förs vidare här; aktuell state ersätter den äldre handofftexten. Originalkopian lämnas orörd. Desktop-AGENTS.md:s personalavgränsning, äldre staginggren och övriga lokala filer är separata.
KAN-78:s frysta samlingsbevis `../KAN-78-hosted-final-result.json` och ursprungliga journaler behålls. Den nya reproduktionens resultat kopieras till `../KAN-104-before-result.json`; KAN-78-hjälpmedlets senaste råresultat uppdaterades vid omkörningen, men det frysta samlingsbeviset ändrades inte.

## Grundorsak och ekonomisk konsekvens

`useAuth` använde enbart `isMounted`, inte beställande användare eller laddningssekvens. Profilen tömdes inte när sessionen bytte användare. Både timeoutens bakgrundsförsök och manuellt återförsök kunde skriva över nyare profilstate. Databasens `{error}` från profilläsningen ignorerades. Profilens SELECT saknade dessutom ägar-ID.

`ProfileSettings` återanvände lokala fält och synkroniserade företagsnamn/organisationsnummer bara när nya värden var truthy. Sparningen använde aktuell `user.id` men skickade hela profilformuläret, inklusive kvarvarande momsinställningar. Den kontrollerade inte verifierad session, generation eller att en rad verkligen uppdaterades.

Observerat i gammal hostad kandidat: B fick A:s Company A/quarter/full; ändring av endast B:s företagsnamn sparade quarter/full på B:s rad i stället för month/none. Köp 1 250 kr med `profile_default` gav sedan 250 kr ingående moms i stället för 0. Ingen RLS-överträdelse behövdes: B skrev fel fakta på sin egen rad. Felet reproducerades på nytt på 1280 och 390 före rättningen. B återställdes, original och nya syntetiska bevisverifikationer behölls.

Möjligt påverkade värden: company_name, org_nr, vat_number, vat_status, vat_period_type, vat_management_from, domestic_sales_vat_treatment, foreign_purchase_reporting och default_deduction_entitlement. Även prenumeration/roll/e-post kunde visas från gammal profil; detta bevisar inte serverbehörighet eller betalningspåverkan.
Momsprofilen används för formulärval, försäljningspolicy, avdragsrätt, momsperioder, utlandsinköp, fakturor och inventarier. Felaktigt sparad avdragsrätt kan ändra kostnad/journal/moms och därmed resultat, NE och dashboard. Direkt före/efter-bevis gäller profilskrivning och inköpsjournal; ingen Production-incident är bekräftad.

## Rättning – exakta produktfiler och funktioner

| Fil | Funktion/ändring |
| --- | --- |
| `src/lib/profileContext.ts` (ny) | `beginProfileContext`, `isCurrentProfileContext`, `acceptProfileContext`, `requireProfileContext`: en ägarbunden generation. Varje ny laddning ogiltigförklarar tidigare läsningar/skrivningar, även samma användare och A→B→A. |
| `src/hooks/useAuth.ts` | `fetchProfileWithTimeout`: id och samtliga fält krävs, single-rad, DB-fel/missing/timeout blir fel; avbrytbar 8s-läsning. `loadProfile`/auth-event/`retryProfile`/cleanup/`handleLogout`: töm profil, ny generation, sena resultat/fel avvisas. `verifyProfile` verifierar renderad generation. `updateProfile` litar på omläsning av sparad profil, inte formulärets utkast. Auth-användaren är typad; password-recovery bevaras vid samma ägares sessionsevent. |
| `src/lib/profileWriteGuard.ts` (ny) | `verifyProfileWrite`: läs session och verifiera användaren med dess token, kontrollera generation igen. `verifiedProfileRpc`: bind Authorization-token till den faktiska RPC-begäran och kontrollera generation direkt före transport. |
| `src/components/ProfileSettings.tsx` | Nollställ även tomt namn/orgnr. `handleSave` kräver samma profilägare, verifierad kontext, pinnad token och exakt en returnerad uppdaterad ägarrad. Omläs efter sparning. |
| `src/app/page.tsx` | `HomeSession` nollställs med användarnyckel; inga gamla formulärutkast följer med kontobytet. Global profilgräns döljer appen under laddning/fel/fel ägare. `runStandardBooking`, `handleVatV2RuntimeBooking`, `handleFileUpload` kontrollerar fångad profilkontext före/efter asynkrona förberedelser. Profilformuläret har användar-/generationsnyckel. |
| `src/lib/accountingService.ts` | `bookStandardBookingAttempt`, `bookTransaction`, `bookPeriodizedTransaction`, `bookVatV2EuServiceReverseChargeTransaction`, `createCustomerInvoice`, `updateCustomerInvoiceUnbooked`, `bookFixedAssetAcquisition` använder gemensamt profil-/sessionskydd och pinnad RPC-identitet. Underlag, bokningsnyckel och ekonomiska formler ändras inte. |
| `src/components/CustomerInvoicesPanel.tsx` | `handleCreateInvoice`/`handleEditInvoice` verifierar den egna profilkontexten efter eventuell bilageuppladdning, före skrivning. |
| `src/components/FixedAssetsPanel.tsx` | `handleSubmit` verifierar den egna profilkontexten före befintlig anskaffningsfunktion. Pausat inventariearbete aktiveras inte. |

`Architecture.md` kompletteras med profil-/skrivgränsen och `PROJECT_STATE.md` med den aktuella checkpointen. KAN-78:s tre granskningsrapporter bevarar dess ärvda ocommittade acceptansuppföljning.

Inga nya transaktionskällor, inga skatte-/momsformler och ingen DB-/RPC-definition ändrad. Befintligt sparat standardbokningsförsök återspelas oförändrat, även under KAN-78:s ekonomiska läsfel; en verifierad profil krävs fortfarande.

## Server/databas – live, läsande granskning

Supabase Staging `fzxqiqenqjzhlyxxpvhg` inspekterades. `book_transaction_atomic(jsonb)` och `book_periodized_transaction_atomic(jsonb)` härleder ägare från `auth.uid()`, kontrollerar användarägda konton/lås och behåller atomär journal/idempotens. `resolve_purchase_input_vat_deduction(uuid,text)` läser samma ägares sparade profil med `FOR SHARE`; explicit full avdragsrätt kontrolleras separat, unknown ger inget automatiskt avdrag. Hjälparen är inte exekverbar av authenticated/anon. VAT V2-wrappern verifierar full avdragsrätt före ny bokning.

profiles RLS: egen rad kräver `id = auth.uid()` både USING/WITH CHECK; admin har separat läspolicy. Kolumnrättigheter och profilens enum-/momsperiod-/datum-/VAT-constraints granskades. Dessa skydd stoppar andra ägares rader men kan inte avgöra om B manuellt skickar A:s företagsfakta till sin egen profil. Tokenbindningen och UI-/generationsskyddet stänger den verifierade felvägen utan migration. Ingen schemaändring föreslås inom KAN-104. Samtidig redigering av samma profil i flera flikar skulle kräva separat versions-/konflikthantering om sådan policy önskas; det är inte en påvisad kvarvarande användarväxling i dessa tester.

Officiell SDK-dokumentation granskad: [auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) och [getUser](https://supabase.com/docs/reference/javascript/auth-getuser). Nexts lokala `use-client.md` lästes före kodändring. Supabase changelog.md gick inte att läsa via webbverktyget (formatfel); ingen SDK-version eller API-signatur ändrades, `setHeader` verifierades också mot installerad SDK och faktisk Staging-trafik.

## Integrationsyta före implementation

| Yta | Bedömning/verifiering |
| --- | --- |
| Journal, metadata, källa, RPC | Samma payload/source/idempotens; nya identitetsspärrar före skrivning. Verklig balanserad B-journal verifierad. |
| Momsrapport/period/stängning/dashboardmoms | Rätt profil styr fortfarande befintliga regler. B behåller month/none; 2641-delta 0. Befintliga moms-/rapporttester samt KAN-78 panelgränser körda. Ingen period stängd/deklarerad av denna uppgift. |
| NE, resultat, balans, år | Verkliga årsbalanser och NE-RPC-underlag före/efter: 5420 +1 250, 1930 −1 250, 2641 oförändrat. Befintlig NE-/resultat-/årsväxlingsregression körd. Ingen ny bokslutsregel. |
| Dashboard/säkert uttag/nyckeltal | Använder samma verifierade data/beräkningsmotor; domän- och KAN-78-browserprov passerar. Ingen ny ekonomisk formel. |
| Fakturor/betalningar/fordringar/årsskifte | Profilberoende registrering/utkast skyddas; befintliga faktura-/årsskiftesprov körda. Inga verkliga betalningar eller kundfakturor skapade. |
| Rättelser/återspelning/periodisering/SIE/låsta perioder | Ekonomisk logik oförändrad; befintliga domän-/browserprov och återupptagning körda. Ingen radering/omskrivning av bevisjournaler. |
| Inventarier | Endast kontextspärr. Inga KAN-62/65-commits eller migrationer; ingen ny anskaffning/avskrivning i Staging. |

## Permanenta tester och resultat

`npm run test:profile-context` använder riktig useAuth, ProfileSettings, skrivskydd och standardbokningstjänst i Chromium med kontrollerad transport, utan DB-skrivningar. Ingår i `test:domain` och därmed säker regression.

| Obligatoriskt fall | Resultat |
| --- | --- |
| 1 A→B med fördröjt A-svar | PASS, permanent samt riktig Staging 1280/390 |
| 2 A→B→A, fel svarsordning | PASS permanent |
| 3 Samtidiga hämtningar för samma ägare | PASS permanent, även sent fel efter nyare framgång |
| 4 Utloggning under hämtning | PASS permanent; avmontering avvisar också sena läsningar/skrivningar |
| 5 Misslyckad profilhämtning | PASS permanent; inga generiska momsinställningar/skrivningar. Även fel ägare/ofullständig rad avvisas |
| 6 B namnsparning utan A-moms | PASS permanent samt riktig Staging 1280/390 |
| 7 B:s korrekta moms vid bokning | PASS permanent och verklig journal; 1 250 kostnad, 1 250 bankkredit, ingen 2641 |
| 8 Overifierad profilkontext | PASS permanent; identitetsfel, gammal callback/generation och förberedd gammal RPC stoppas. Tyst tokenbyte kan inte byta pinnad begärandeägare |
| 9 Normal inloggning/profiländring/bokföring | PASS permanent samt riktig Staging |
| 10 Samspel KAN-78 | PASS befintliga laddnings-/paneltester och fyra browserfall: desktop/mobil, med/utan ekonomiskt läsfel, bibehållen ägare/nyckel/kvitto och inga gamla belopp |

Ytterligare permanenta filer: `tests/fixtures/profileContextHarness.tsx`, `profileContextMocks.ts`, `scripts/test-profile-context.mjs`, `scripts/test-profile-context-staging.mjs`, `scripts/profile-context-staging-support.mjs`. Tre befintliga standardbokningstester fick kompletta auth-/profilfixtures för den nya spärren; befintliga ekonomiska assertioner bevarades. `package.json` lägger till testkommandona; inga dependencies/lockfiler ändras.

Riktig Staging körs separat och uttryckligen med lokal app-URL, allowlistad backend, befintliga syntetiska identiteter och ignorerad lokalkonfiguration. Permanent kommando: `npm run test:profile-context:staging`. Kräver `SOLOLEDGER_E2E_ENV_FILE`, `SOLOLEDGER_PROFILE_TEST_IDENTITIES` och `SOLOLEDGER_PROFILE_TEST_BASE_URL` (localhost). Inga konton skapas automatiskt, inga utskick tillåts. Namn återställs, bevisbokningar behålls.

Verifierade nya permanenta journalbevis: desktop `d62c3878-17eb-4dfb-bf91-528cad680a79`, mobil `96594d70-df5c-484a-af32-fc5947c52931`. Tidigare verifieringskörning skapade ytterligare två egna B-bevis, också bevarade. Slutlig läsande efterkontroll: A har 4 och B 9 transaktioner; de två ursprungliga KAN-78-journalerna har kvar 0 respektive 250 kr ingående moms och balanserar. Staging-migrationsledgern är oförändrad: 52, senast 20261019120000. Testprofilerna är efterkontrollerat Company A/quarter/full och Company B/month/none. Inga tidigare verifikationer ändras.

Lokala råbevis: `../KAN-104-before-result.json`, `../KAN-104-local-staging-result.json`, `test-results/KAN-104-staging-result.json` och skärmbilder 1280/390, samt syskonloggar `KAN-104-domain-final.log`, `KAN-104-booking-browser-final.log`, `KAN-104-build-final.log`, `KAN-104-smoke.log` och `KAN-104-regression.log`. Inga hemligheter inkluderas i Git eller Jira.

TypeScript PASS. Optimerad webpack-build PASS; första byggförsöket saknade webhookens serverkonfiguration, slutkörningen använde befintlig Staging-konfiguration enbart i processen. Riktad lint för useAuth och alla nya filer PASS. Full lint har historiska fel: bas 82 fel/7 varningar, kandidat 75/6, inga nya regel-/filantal. De äldre felen maskeras inte eller bredrättas här. Publik Playwright-smoke 2/2 PASS. Hela `npm run test:regression` PASS (exit 0): domän, historik/grupper/presentation, UI-rundor, publik smoke 2/2, kategoriskydd och standardbokningens fyra browserfall.

Tidiga testhinder: sandboxens browser-/localhoståtkomst, två felaktiga testselektorer, ett ofullständigt syntetiskt kvitto/profil och gamla mock-fixtures för nya profilspärren. Dessa rättades i testmiljö/fixtures; inga produktassertioner togs bort. Den riktiga permanenta Staging-körningen och slutliga fokusproven passerar.

## Kvarstående gränser och release

Det ursprungliga racet är eliminerat i verifierad lokal kod; detta är inte en deployad rättning. Hosted Preview är fortfarande den gamla felaktiga kandidaten. Full hostad efterkontroll av den nya distribuerade klienten kräver separat publiceringsgodkännande. Befintliga eventuellt felaktiga Production-profiler eller journaler har inte eftersökts eller ändrats; ingen sådan incident är fastställd. Gamla öppna klienter får inte automatiskt nya skydd före omladdning efter en framtida release.

Gemensam release ska bygga på verifierad main e7f1442 + exakt KAN-78 0db6fe8/67d314a + denna KAN-104-checkpoint. Använd inte den pausade staginggrenens inventariekedja som bas. KAN-78 kvarstår In Review. Ingen push, deploy, Production-skrivning eller migration har gjorts här. Pontus granskar och godkänner först; en senare gemensam Preview ska verifiera profilrace, B-namnsparning/B-köp, journal/moms/NE/dashboard och KAN-78-återupptagning innan en exakt Production-release godkänns.
