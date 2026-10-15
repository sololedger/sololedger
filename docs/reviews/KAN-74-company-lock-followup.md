# KAN-74 – riktad korrigering av företagslåsning och filgräns

2026-10-15. **P2 reproducerat före rättningen och verifierat åtgärdat lokalt. Kandidaten är redo för ny oberoende granskning.** Allt är ocommittat i befintlig codex/KAN-74-sie-opening-guard, HEAD 1d297c1. Tidigare KAN-74-arbete bevaras.

## Exakt rättning

import_sie_batch läste tidigare organisationsnumret innan import-/momslås kunde vänta. READ COMMITTED uppdaterar inte en redan läst PL/pgSQL-variabel. Ett nytt nummer kunde därför hinna sparas medan kvittot fortfarande godkändes mot det gamla numret.

Företagskontrollen görs nu efter alla befintliga advisory-lås och före första bokföringsskrivningen. Profilen läses med **FOR SHARE NOWAIT** och numret normaliseras och jämförs med kvittots bundna företagsidentitet. Saknad profil, avvikande nummer eller pågående profilskrivning ger P2075 och rollback utan bokföring eller kvittokonsumtion. Samma användarvillkor och befintliga behörigheter gäller.

Låsordning: kvittorad FOR UPDATE → alla momsmånader i befintlig ordning → användarens SIE-importlås → eventuell IB-dag → profil FOR SHARE NOWAIT → befintliga historikkontroller/skrivningar/verifikationssekvens → kvittoradering → transaktionsslut. SHARE-låset blockerar även ändringar av icke-nyckelfält som org_nr; KEY SHARE hade inte räckt. Låset hålls till COMMIT/ROLLBACK. NOWAIT undviker en ny väntkant mot profilskrivare/profil-först-radering medan importen håller kvitto-/momslås. Profiländring som startar senare får vänta tills importtransaktionen är klar.

Befintlig registrering använder SKIP LOCKED vid kvittostädning. Auktoritativ användarradering tar kvitton före profil. Inspekterad lokal schema har inga profil- eller momsperiodtriggers som introducerar dold omvänd låsning; övriga RPC-definitioner/ägare/grants är oförändrade. Ingen generell låsmodell eller ny importarkitektur införs.

Originalfilens gräns är nu **4 000 000 byte (decimal 4 MB)** via delad parserkonstant i server och klient. Serverns faktiska streamade body får vara högst **4 065 536 byte** inklusive multipart-data (64 KiB tillägg). Det lämnar 434 464 byte till Vercels dokumenterade 4,5 MB-bodygräns. Vanlig multipart-body för en maximal fil mäts i test och ryms inom servergränsen. Ovanligt stora multipart-metadata kan avvisas. Felmeddelandet är genomgående ”Filen får vara högst 4 MB.” Högst 50 000 journalrader kvarstår. Källa: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations).

## Ändrade filer i just denna korrigering

- [20261015120000_kan74_sie_opening_balance_guard.sql](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/supabase/migrations/20261015120000_kan74_sie_opening_balance_guard.sql): flyttad företagskontroll, lås och dokumenterad låsordning. Endast import_sie_batch ändras i DB-förslaget.
- [sieParser.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/lib/sieParser.ts): delad 4 MB-konstant.
- [sieImportServer.ts](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/lib/sieImportServer.ts): 4 MB-fel och dokumenterad total bodygräns; används av befintlig /api/sie/import-route.
- [SieImportModal.tsx](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/src/components/SieImportModal.tsx): samma delade gräns och 4 MB-fel.
- [test-sie-opening-guard.mjs](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/scripts/test-sie-opening-guard.mjs): tre nya tvåsessionsfall i ordinarie svit.
- [test-sie-import.mjs](C:/Users/Familjedator/.codex/worktrees/kan74-sie-opening-guard/sololedger_multi_user/scripts/test-sie-import.mjs): fil-/requestgränser och klientens storleksfel.
- Dokumentation: denna rapport, befintlig server-import-implementation och PROJECT_STATE. Övriga befintliga kandidatfiler bevaras.

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| P2 RED före SQL-rättning | Importen lyckades felaktigt efter observerad advisory-låsväntan och ändrat org_nr; nytt test föll på förväntat avslag. |
| Ändrat org_nr under låsväntan | PASS: autentiserad profiländring hinner COMMIT; väntande autentiserad import får P2075. Noll transaktioner, journalrader, batcher eller sekvenser; kvittot kvar. |
| Profiländring efter företagskontroll | PASS: autentiserad profiländring observeras vänta på importtransaktionen även sedan importfunktionen returnerat och raderat kvittot; fortsätter efter COMMIT. |
| Profilskrivare har redan låset | PASS: autentiserad import avslutas med P2075 innan profilskrivaren släpper låset. Ingen ny låsväntcykel, ingen bokföring, kvittot kvar. |
| KAN-74 DB | PASS: 66 rollbackfall, 15 befintliga + 3 nya tvåsessionsfall, två isoleringsavslag, P1/P2, kvittoägare/företag/TTL/återspelning/behörigheter och radering. |
| Befintliga SQL-regressioner | PASS: KAN-71 ×3, KAN-72 manuell bokföring och KAN-63 fakturamoms; oförändrade säkerhetsassertioner och faktiska rapportassertioner. |
| Serverunderlag genom verklig lokal RPC | PASS: normal, IB, RES-brygga, UB och exakt 50 000 journalrader; saldo och kvittokonsumtion kontrollerade. |
| Parser/server/route/klient | PASS: exakt 4 MB tillåts, +1 byte avvisas med rätt fel; verklig multipart mäts, exakt bodytak når validering, +1 avvisas även med saknad/falsk Content-Length. 50 000 tillåts/50 002 avvisas. Befintliga period-, hash-, kodnings-, Auth- och feltester passerar. |
| npm test | PASS: hela domänsviten inklusive KAN-71, NE/saldo/export, admin dry-run och statiska DB-invarianter. |
| Build / separat typkontroll / riktad lint | PASS; build med processlokala platshållare, inga miljöfiler ändrade. |
| Bevarande | PASS: ursprungliga lokala bokförings-/Auth-fingeravtryck oförändrade, nya testanvändare borttagna via ordinarie raderings-RPC, noll kvitton kvar. Samtliga 13 ursprungliga worktrees/HEAD/status och dokumentationscommit 11d8306 bevarade. |

Evidens: C:/Users/Familjedator/.codex/visualizations/2026/10/15/01a13dfa-6f68-7063-b1dc-9ca3f87c2006/kan74/company-lock/ (red.log, final-db.log, source-tests.log, build.log, typecheck.log, final-lint.log, regression.log, audit.json och funktionssnapshots). Självbärande slutlig DB-svit: C:/Users/Familjedator/AppData/Local/Temp/sololedger-kan74-receipts-2ecAjX/. Inga autentiseringshemligheter ingår.

## Begränsningar och nästa steg

Pågående profilskrivning kan tillfälligt neka en annars giltig import; försök igen med originalfilen efter att profilen sparats. Detta är avsiktligt för att undvika ny låsväntcykel. Ingen garanti ges för godtycklig manuell SQL som bryter befintlig låsordning.

Hosted gräns verifieras här med bytebudget och lokala gränstester, inte med uppladdning till Vercel. Ingen hosted Auth/PostgREST-/Edge-/webbläsaracceptans körd. Nätverk/Auth ersätts vid gränsen i källkodstester, medan DB-sessionerna och RPC:erna är verkliga lokala PostgreSQL-anrop. Full lint och publik Playwright har inte körts om för denna riktade korrigering; riktad lint är grön, tidigare dokumenterad generell lintskuld kvarstår.

Färsk live pg_get_functiondef-/schema-/ACL-jämförelse krävs fortfarande före hosted migration. De tidigare införda konservativa importbegränsningarna kvarstår; inga saldon, NE, export, historiska data, behörighetsmodeller eller KAN-71-regler ändras.

Ingen hosted migration/skrivning, deploy, commit, push eller Jira-ändring. Avvakta ledarchattens beslut och ny oberoende granskning.
