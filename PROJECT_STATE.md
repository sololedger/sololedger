# SoloLedger Project State

Uppdaterad 2026-10-18. **KAN-80 slutgodkänd av Pontus, Jira Done och Production PASS.** Jira-status och GitHub-grenar återlästa skrivskyddat vid dokumentationsavslutet. Releasekontrollerna nedan hänvisar till sparad verifierad releaseevidens; inga nya hosted skrivtester körda.

## Aktuellt uppdrag och nästa steg

- KAN-80 är avslutad. KAN-89 och tidigare KAN-69/77/82 är också avslutade. Endast KAN-90 är nu valt av Pontus; se aktivt avsnitt nedan.
- Produktmål: ett enkelt, tillförlitligt årsflöde för Jessikas enskilda firma. Bokföring, auditbarhet och användarisolering går först.
- KAN-80:s tidigare dokumentationsavslut omfattade endast en godkänd lokal dokumentationscommit. KAN-90:s nya lokala arbete och Jira-status anges nedan.

## Aktivt KAN-90 – endast lokal kandidat

- Uppdrag 2026-10-18: fullständig kontotäckning i NE, enligt Jira KAN-90. Tidigare skrivskyddad analys återläst. KAN-62/65 fortsatt pausade; KAN-91–94 orörda.
- GitHub main verifierad skrivskyddat på fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0. Ny separat unmanaged lokal klon från exakt KAN-80-commit, gren codex/KAN-90-ne-account-coverage. Inga managed worktrees/cleanup eller ändringar i tidigare produktkopior.
- Kandidat: C:/Users/Familjedator/.codex/visualizations/2026/10/18/01a14f54-a2bd-7ec2-9fcc-5f98e1f31f60/kan90-source. Lokal KAN-90-checkpoint med enda förälder fc8eb6ab; exakt checkpoint-SHA hämtas med git log -1 i kandidatkopian. Ingen push är godkänd.
- Ren kontroll per resultat-/balanskonto med saldo, oberoende av differensen: befintlig koppling, uttryckligt undantag eller granskning. Kontonummer/saldo/orsak visas; inga nya NE-rutor gissas. Negativa balanssaldon kan kräva granskning även vid korrekt värdereglering.
- Riktat PASS: 21 syntetiska service/renderingsfall inklusive 1210/2890 med noll differens, resultatbortfall, rättelser, årsskifte, SIE-parser, KAN-77/88 och 8000 explicita BAS-kontotillstånd. Alla gamla servicefält och RPC-anrop identiska mot HEAD. Desktop/mobil 1440/390/320 PASS, bilder granskade. Typkontroll, fokuserad lint och diffkontroll PASS.
- Säkra regressionens samtliga delar PASS som delkommandon; standardkommandot stoppades av känd Turbopack/dependency-junction-begränsning. Ett avgränsat Webpack-omförsök gav public smoke 2/2 PASS. Slutgranskning: produktionsliknande Webpack-build inklusive TypeScript PASS och public smoke mot next start 2/2 PASS. Fokuserad lint PASS; full repo-lint upprepas inte. Ingen hosted acceptans påstås.
- Produktfiler: src/lib/neAccountCoverage.ts, src/lib/accountingService.ts, src/components/NEBilaga.tsx, scripts/test-ne-account-coverage.mjs, package.json. Dokumentation: PROJECT_STATE.md och docs/reviews/KAN-90-ne-account-coverage.md. Genererade test-/byggfiler och dependency-junction ignorerade; package-lock oförändrad. Desktop-kopian ändras endast i PROJECT_STATE.md; tidigare untracked-filer bevaras.
- Jira KAN-90: verifierad Bug/To Do/otilldelad vid start, nu In Review och tilldelad Pontus, med granskningskommentar. Inga andra ärenden ändrade.
- Pontus godkände lokal commit efter slutgranskning. Endast sju listade KAN-90-filer ingår. Ingen push, deployment, migration, Edge-publicering, aliasändring eller Supabase-skrivning. Nästa säkra steg: separat godkännande att publicera exakt checkpoint-SHA som isolerad Preview mot befintlig Staging med läsande acceptans; ingen GitHub-push eller aliasändring behövs. Se konkret plan i granskningsrapporten.

- Staging-kompatibilitet slutkontrollerad skrivskyddat: 50 migrationer, båda KAN-62-versionerna kvar. Tre NE-läsfunktioners kroppar matchar Production-basmigrationerna och grants/SECURITY INVOKER är oförändrade. Ingen DB-/Edge-ändring behövs. Inventariebokning fortsatt pausad; GitHub staging har KAN-62/65-historik och används inte som källbas.

## Production – KAN-80 PASS

- Godkänd produktcommit och GitHub main: **fc8eb6ab6fe4d31bf81c379d6b2ec1d3018667a0**. Enda förälder/Production-bas: **af0378ae0935518346360e3492c38175e2c270d2**. Exakt 20 kandidatfiler; 19 manifesthashar verifierade vid release. Ingen KAN-62/65 ingår.
- Vercel Production: **dpl_DC2b9PYiDYhBHh1ikPc9D3zXf2XB**, **READY**, production/main, samma produktcommit. https://sololedger.vercel.app. Faktiskt publicerat källpaket verifierat: 358 förväntade filer, alla innehålls-ID:n matchade kandidatens bytes; inga extra Supabase CLI-/env-/auth-/temporära filer.
- Supabase Production **wbaxmuvudpnkvuliicuy**: **48 migrationsversioner**. Enda nya version **20261017190000_kan80_standard_booking_idempotency.sql**. Tidigare 47 ledger-/SQL-rader oförändrade; inga historiska migrationer återkörda eller reparerade.
- Edge **delete-user v13 ACTIVE**, verify_jwt=true; återläst kod exakt enligt kandidaten. Idempotenskvitton omfattas av permanent användarradering och admininventering.
- Riktade lokala tester och Staging-acceptans PASS. Skrivskyddade Production-kontroller PASS: dashboard, inloggat vanligt/periodiserat formulär, faktiskt levererad klient, protokoll/RPC-skydd, paket och kort loggkontroll. Inga nya Production-bokningar/testidentiteter/raderingar.
- Befintlig bokföring och rapportdata oförändrade: radantal/fingeravtryck i 16 berörda tabeller identiska före/efter migration och efter browserkontroll.

## Verifierad idempotens och användarbegränsning

- Vanlig och periodiserad bokning sparar först en ägarbunden försöksnyckel och exakt anrop beständigt i webbläsaren. Osäkert svar behåller samma försök för återupptagning efter omladdning; bilagereferensen återanvänds. Web Locks och direkt submit-spärr skyddar parallella flikar/anrop.
- Privat kvittotabell standard_booking_idempotency med unik användare/nyckel och databaslås serialiserar samma försök. Bokföring och lyckat kvitto sparas atomärt. Exakt omförsök returnerar ursprungliga ID:n/VER före föränderliga valideringar; ändrat innehåll med samma nyckel nekas. Användare är isolerade.
- Bekräftat avslag förutsätter återställning av hela den inre bokningen; osäkra fel får inte frigöra försöket. Protokoll 1 krävs; äldre nyckellösa anrop nekas. Befintlig bokföringskärna och rapportklassificering bevarade.
- **Äldre öppna webbläsarflikar måste laddas om före nya vanliga/periodiserade bokningar.** Återöppna inte den gamla oskyddade anropsvägen.
- Beständig lagring och Web Locks krävs. Raderad/skadad webbläsarlagring eller byte av enhet/profil kan inte automatiskt återställa en förlorad försöksnyckel. Bilaga kan behöva väljas igen om uppladdningen inte slutförts före omladdning.

## Staging och pausade KAN-62/65

- GitHub staging är avsiktligt kvar på **5809094dd3ce808dba35986c65e772b842f0d0e1**. Den äldre grenens kod får inte publiceras till main eller ersätta accepterad KAN-80 utan nytt beslut.
- Ordinarie Staging-alias https://sololedger-git-staging-sololedger1.vercel.app pekar enligt verifierad release på ren KAN-80 Preview **dpl_9nEEL8RQkRqWumceFbB6FavB4FZF**, READY, produktcommit fc8eb6ab. Befintlig byggspärr för gamla staging-grenens automatiska Preview-publicering kvar; ta inte bort den utan samordnat beslut.
- Supabase Staging **fzxqiqenqjzhlyxxpvhg**: **50 migrationer**, inklusive KAN-89 och KAN-80 samt två extra KAN-62-versioner: **20261012123000_kan62_fixed_asset_gross_vat_rate.sql**, **20261012153000_kan62_fixed_asset_group_locking.sql**. Edge delete-user v5 ACTIVE. Ingen återställning/radering av dessa ändringar.
- **Inventariebokning i Staging är fortsatt pausad.** Dess KAN-62-RPC kräver gross_amount/vat_rate som Production/KAN-80-klienten saknar. Databasändringarna kan ligga kvar; detta är inte en godkänd generell inventarieacceptans.
- **KAN-62/65 pausade i väntan på svar från Skatteverket**, enligt Pontus. Jira återläst: båda In Review (pausen är produktägarens beslut). KAN-62 codex/KAN-62-fixed-asset-vat: **8bb6a76aa92d412309199316921b75cfba32cedf**; KAN-65 codex/KAN-65-fixed-asset-reclass-trace: **a2ef958d9caf3b6b46b1e542852b90f5ab21275b**. Lokala och GitHub-grenar, kod, SQL, tester, dokumentation och lokala konfigurationsfiler bevarade.
- Ingen automatisk synkronisering av staging/main, historikändring eller cleanup. Äldre deployments och andra arbetskopior behålls.

## Arbetskopior, dokumentationskedja och evidens

- Denna gemensamma docs-/handoffkopia: **C:/Users/Familjedator/Desktop/Sololedger Multi User App/sololedger_multi_user**, lokal gren **staging**, förälder till avslutscommiten **4b216f819254ba322f34517e4cb866d04c330d36**. Exakt dokumentations-SHA hämtas med git log -1 här. Produktkoden här är äldre; använd inte denna dokumentationskedja som releasekälla.
- Ren produktkopia: **C:/Users/Familjedator/.codex/visualizations/2026/10/17/01a14b46-6bdd-7b70-9ad7-c3899ea9c943/kan80-source**, gren codex/KAN-80-booking-idempotency, HEAD fc8eb6ab. Kandidatens committade precommit-handoff är historisk; denna gemensamma status anger slutligt releaseläge. Kandidaten ändras inte.
- **19 befintliga arbetskopior kontrollerade**: 16 registrerade i Desktop-repot, två separata KAN-89-kopior och KAN-80-kopian. HEAD, full Git-status, index och ignorerade sökvägar inventerade utan att läsa credentialinnehåll. Inga arbetskopior/commits/filer flyttade, återställda eller raderade.
- Endast de två dokumentationsfilerna ingår i avslutscommiten. Sex redan befintliga untracked-filer under audit-packages/ och scripts/create-kan63-staging-user.mjs lämnas utanför. Övriga kopiors tidigare avvikelser bevaras; full inventering och aktuella SHA finns i arkivet/extern evidens.
- Evidensrot: **C:/Users/Familjedator/.codex/visualizations/2026/10/17/01a14b46-6bdd-7b70-9ad7-c3899ea9c943/**. Production: kan80-production-release/REPORT.md; Staging: kan80-hosted-acceptance/CLEAN_REPUBLICATION_REPORT.md; lokal verifiering: kan80-source/docs/reviews/KAN-80-local-verification.md; avslutsinventering: kan80-closeout/inventory-before.json och inventory-after.json.
- Retention utförd: avslutade KAN-80-mellansteg och releasehistorik sammanfattade i PROJECT_ARCHIVE.md. Äldre KAN-89-evidens kvar där. Viktig aktiv Staging-/pausinformation ovan behålls.

## Kvarstående avgränsningar

- Redan tillämpad KAN-84-version **20261015180458** saknas i produktrepots migrationskedja. Använd målmiljöns faktiska ledger och separat underlag vid framtida migration; ingen baseline-replay, include-all eller ogrundad repair.
- Lokal KAN-80 build, typkontroll och full säker regression inklusive publik Playwright 2/2 PASS. Riktad hosted acceptans PASS; ingen full hosted regressions-PASS påstås. Befintlig lintskuld 86 fel/7 varningar kvar, inga nya produktdiagnoser. Äldre KAN-89-testbegränsningar finns i arkivet.
- KAN-73/76, KAN-75 (årslåsningsserialisering), KAN-78 (gamla siffror efter laddningsfel) är andra riskärenden; inget arbete på dem startas här. Tidigare Jira/Production-statusavvikelser för KAN-84/86 ändras inte automatiskt.
- Automatisk worktree-cleanup är inte verifierat avstängd. Bevara alla kopior och ignorerade miljö-/auth-/pgpassfiler. Ignorerat miljömaterial är inte Git-backup. Läs/visa/kopiera/hasha inte credentialinnehåll.
- Nästa säkra steg för KAN-90 anges i det aktiva avsnittet ovan. Ingen publicering, databasskrivning eller städning utan separat godkännande.
