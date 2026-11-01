# KAN-128 / A5 – lokal implementation och verifiering

2026-11-01. Endast lokal kandidat, ingen commit eller publicering. Pontus GO:
skapa A5/A4 efter dubblettkontroll och implementera/testa A5 med syntetiska data.

## Jira och avgränsning

- [KAN-128](https://sololedger.atlassian.net/browse/KAN-128): Task, High,
  **A5 – Skydda bokföringsbilagor och bevara spårbar historik**.
- [KAN-129](https://sololedger.atlassian.net/browse/KAN-129): Bug, Medium,
  **A4 – Originalbilagan döljs efter rättelse**.
- Sista dubblettkontroll utförd i KAN. KAN-128 relaterad till KAN-127/KAN-86
  och blockerar KAN-129; KAN-129 relaterad till KAN-10. Ingen faktisk dataförlust
  har påvisats. Inga statusbyten, tilldelningar eller andra ärenden ändrade.
- A4:s befintliga `!isNeutralized`-villkor är kvar på dator och mobil. DB-provet
  bevisar bevarat/läsbart original efter rättelse, inte att A4:s UI-bugg är löst.
- KAN-127:s Storage-/Stripe-/databasordning är oförändrad. A5 utökar bara
  historikdomänens räknare och den atomiska databasraderingen.

## Implementerat kontrakt

1. Två restriktiva policies nekar vanlig authenticated/anon DELETE och UPDATE
   i hela `attachments`. Befintliga INSERT/SELECT-policies behålls. Detta nekar
   också upsert/rename och städning av orefererade uppladdningar. Service role
   kan fortfarande kringgå Storage-RLS; den separata KAN-127-risken kvarstår.
2. `accounting_attachment_history` har explicita grants/RLS, ägar-/målindex och
   RESTRICT-FK till exakt en transaktion, kundfaktura eller bokslutsskuld.
   Vanliga API-roller och service role får inte skriva/radera historiken direkt.
   Authenticated läser egen historik; servern får läsa för kontoräknare.
3. Befintliga referenser observeras vid införandet, med okänd tidigare aktör och
   historik uttryckligen markerad. `original_path` betyder första **kända**
   bevarade koppling, inte en gissad första uppladdning. Inga gamla filer eller
   referensfält skrivs om och ingen saknad äldre version fabriceras.
4. Trigger på de tre referensdomänerna registrerar nya/bytta kopplingar atomiskt
   med användare, tidpunkt, gammal/ny/första kända referens och åtgärdsbeskrivning.
   Befintliga säkra RPC-signaturer behålls. Nollning/tom referens, ägarbyte och
   främmande/saknade/ogiltiga nya filer spärras. Källa med historik kan inte
   raderas genom en vanlig separat DELETE, även om posten är obokförd.
5. `add_accounting_attachment(text,uuid,text,text)` tillför ett underlag utan att
   ändra aktuellt referensfält eller bokföringsvärden. Kräver ägd källrad, egen
   befintlig Storage-fil, öppen årslåsgräns och beskrivning. Radlås och gemensam
   årslåsgrind serialiserar tillägg. Samma fil/beskrivning kan återförsökas utan
   dubblerad historik; ändrad beskrivning vid samma återförsök nekas.
6. Även en källa med bara bilagetillägg och tomt aktuellt referensfält skyddas
   vid datumflytt över en låst årsgräns. Bevarade underlag förblir läsbara.
7. Historik är append-only. Bara den befintliga skyddade kontoraderingskontexten
   får radera den. `delete_user_data_atomic` utökas med validering, rätt ordning,
   antal och restkontroll; den bevarade delegaten ändras inte. Alla SQL-steg
   rullas tillbaka om ett senare steg misslyckas.
8. En liten gemensam historikvy laddar på begäran, med fullständighetskontroll,
   signerad filöppning och tillägg. Ägar-/målbyte tömmer även pågående läsningars
   vy. Vyn används i transaktionshantering, vanlig dator-/mobilhistorik,
   kundfakturadetaljer och bokslutsskulder. I grupperad transaktionsvy kan man
   slå av grupperingen för radens historik. Rättade original omfattas senare av A4.

Årslås verkställs på servern oavsett UI. Ett sent årslås efter uppladdning kan
neka själva kopplingen och lämna en orefererad fil; inget osäkert städflöde införs.
Äldre saknade eller felaktiga filreferenser bevaras som observationer, inte repareras
automatiskt. Både faktisk filåtkomst och eventuella äldre brister måste inventeras
före en framtida installation. Ingen verklig fil har öppnats i detta uppdrag.

## Migration och installationsförutsättningar

Ny fil skapad med projektets etablerade Supabase CLI:
`20261101213818_kan128_attachment_history.sql`.
SHA-256: `4b50eb38fbe7eef380760486e4468707cc0e8dd93b615477ad679e9db8bab9a2`.

Migrationen stoppar före ändring om den verifierade befintliga raderingsfunktionen
har ändrats, bucket saknas/är offentlig eller Storage-RLS är avstängd. Äldre
migrationer är orörda. Inga nya transaktionskällor, journalfält, moms-, NE-, SIE-,
betalnings- eller resultatregler införs. Endast referens-/historikytan påverkas;
ekonomiska integrationer verifieras med riktiga lokala RPC:er och rapportmotorer.

Färsk READ-ONLY Production-inspektion: relevanta live-funktioner, constraints,
index, triggers, grants och policies lästa. Produktion fortsatt 70 migrationer.
`storage.objects` ägs av `supabase_storage_admin`; postgres saknar vanligt
ägarprivilegium. **Det är inte ett installationshinder i sig:** verifierat
`supautils.policy_grants` tillåter postgres att hantera Storage-policies och
`session_preload_libraries` laddar supautils i den inspekterade sessionen.
Inga ägar-, roll- eller systeminställningar ändrades. Den separata policybehörigheten
beskrivs i [Supabases officiella supautils-dokumentation](https://github.com/supabase/supautils#manage-policies).
Faktisk CLI-installation och motsvarande färska Staging-kontroll återstår.

## Lokala testresultat

- **44 databasprov PASS**, inklusive direkta Storage DELETE/UPDATE och upsert,
  även med en extra tillfällig permissiv UPDATE-policy. Ägda nya uppladdningar
  tillåts; främmande uppladdning/läsning och historik-/referensändring nekas.
- Tre referensdomäner, initial observation, bevarande vid byte, nullning, traversal,
  saknad fil, append-only, återförsök och privata hjälpfunktioner verifierade.
- Riktiga kundfaktura-, leverantörsboknings-, vanlig boknings-, bilagebytes- och
  rättelse-RPC:er körda med syntetiska uppgifter. Journal, verklig momsrapport,
  NE och bank-/kontobalanser identiska före/efter bilageändring.
- Årslås och läsning efter lås PASS. Två riktiga lokala anslutningar provar
  exklusiv årslåsgrind mot tillägg samt tilläggets delade grind mot lås/radering.
- Atomisk kontoradering räknar/raderar historik för tre domäner och lämnar annan
  ägare orörd. Injicerat sent profilraderingsfel återställer historik och kontext.
- **22 isolerade Playwright-prov PASS** för den faktiska nya komponenten på
  1280/390 px: bevarad filöppning, fel/återförsök utan ny uppladdning, låst läsning,
  ägar-/målbyte, sena svar och läsfel. Nätverk blockerat; mobilbild visuellt läst.
- Typecheck, admin-dry-run, DB-invarianter och integritetsskyddets negativa kontroller
  PASS. Inget nytt lintfynd: 27 befintliga diagnoser matchar HEAD (25 fel/2 varningar).
  Den nya komponenten är lint-ren. Ingen generell grön lint påstås.
- Samtliga delar i den befintliga säkra regressionen körda och gröna sammantaget:
  NE-UX, hjälpcenter, momsperioder, deklarationsklient, domänsvit, historikgrupper,
  presentation, UI-round, kategorier, bokningsbrowser och 3 publika smoke-prov.
  Den publika smoke-kontrollen använde localhost:32128 och syntetisk localhost-
  Supabase-konfiguration i processminnet; inga riktiga nycklar eller env-filer.
- Ingen sammanhängande `npm run test:regression` på slutkandidaten påstås: första
  försök stoppades av den äldre kandidatlistan och därefter ett NE-fokusprov.
  Ett avgränsat NE-omprov PASS. Domänsviten stoppades senare av saknad offline-
  adapter för den nya importen; adaptern rättad och de återstående faktura-/
  bokslutsdelarna omkörda PASS. Inga produktkrav/testassertioner försvagade.

Verifierad lokal DB: `sololedger_kan117_recovery_20261027`, localhost/127.0.0.1:5432,
PG17, OID69031 och befintlig unik KAN117-säkerhetsmarkör. Inga nya konton på
operativsystemet, databaser, roller eller beständiga strukturer skapade.
Alla kandidatinstallationer, temporära Storage-tabeller och syntetiska rader kördes
inom rollback. Före/efter-avtryck för tidigare offentliga data, Auth, funktioner/ACL
och schemaidentiteter är identiska. Inga befintliga fixtures raderades/resetades.

**Begränsning:** lokal miljö saknar Storage-tjänsten. En transaktionell metadata-
och RLS-fixture använder de lästa live-policyerna, men är inte ett prov av Storage
HTTP-API, filbytes, signerade riktiga nedladdningar eller Supabases sessions-/
ägarbypass vid faktisk installation. Lokal service_role har inte Production-rollens
alla egenskaper. Dessa skillnader är inte borttestade eller kringgångna.

## Berörda filer

Produkt:

- `supabase/migrations/20261101213818_kan128_attachment_history.sql` (ny)
- `src/components/AccountingAttachmentHistory.tsx` (ny)
- `src/components/TransactionForm.tsx`
- `src/components/TransactionTable.tsx`
- `src/components/CustomerInvoicesPanel.tsx`
- `src/components/SupplierYearEndPanel.tsx`
- `src/app/page.tsx`
- `src/lib/adminDeleteDryRun.ts`
- `supabase/functions/delete-user/index.ts` (bara TABLES-räknarlistan)

Tester/dokumentation:

- `package.json` (testkommandon; UI-provet ingår framöver i domän-/regressionssviten)
- `scripts/test-kan128-local-db.mjs` (ny, explicit lokal GO + identitetskontroll)
- `scripts/test-kan128-attachment-ui.mjs` (ny, offline)
- `tests/fixtures/kan128-live-contract.json` (ny; endast schema/policies/funktionshashar)
- `scripts/test-admin-delete-dry-run.ts`
- `scripts/test-supplier-year-end-panel.mjs` (ny import i offline-adaptern)
- `scripts/check-db-regression-invariants.mjs` (följer A5-delegaten, känner igen
  den tidigare införda KAN122-årslåswrappen; gamla grundinvarianter kontrolleras)
- `scripts/check-kan124-product-integrity.mjs` (exakt A5-kandidatlista; okända filer,
  ändrad kandidat och oförändrade gamla migrationsbytes kontrolleras fortfarande)
- denna rapport och `PROJECT_STATE.md`

Ingen ändring i `AGENTS.md`, `PROJECT_ARCHIVE.md`, historiska backupverktyg,
nycklar/KeePass, beroenden/låsfil eller ekonomiska beräkningsmoduler under A5.
Tidigare ocommittade dokument/verktyg bevaras. Index och HEAD är oförändrade.

Bevis: `coverage/kan128-local-20261101/`. Slutligt DB-kvitto i
`2026-11-01T22-01-05.203Z-64d576d2-0b52-4663-bc89-82ff2024ed02/summary.json`;
samtliga bredare kontrolloggar och metadataavtryck ligger i samma bevisrot.
UI-bilder: `test-results/kan128-1793570513939/`. Inga hemligheter i dessa bevis.

Kör `npm run test:kan128` för offline-UI-provet. DB-provet körs med
`npm run test:kan128:db` endast inom godkänd lokal omfattning och med processvariabeln
`SOLOLEDGER_KAN128_LOCAL_GO=implementation-and-verification`. Det stoppar om den
exakta befintliga databasidentiteten eller verifierade funktionsförutsättningar
inte matchar. Inga hemliga anslutningsvärden behöver läggas i projektet.

## Nästa säkra steg – invänta separat GO

1. Pontus granskar A5-kandidaten och dessa begränsningar. Inget automatiskt
   Jira-statusbyte, ingen commit eller publicering görs nu.
2. Före Staging: separat beslut om lokal checkpoint och exakt Staging-kandidat;
   färsk Staging-kontroll av funktionens förbild, befintliga filreferenser, privata
   bucket/policies/grants och den faktiska CLI-rollens policybehörighet. Kontrollera
   migrationsplanen så att endast A5-versionen tillkommer, utan historisk replay.
3. Efter uttryckligt GO för Staging-migration, app och den minimala Edge-räknar-
   ändringen: prova riktiga Storage DELETE/UPDATE/upsert/copy/move, filbytes/
   signerad läsning, tre ägda referensdomäner, annan användare, byte/historik,
   årslås, återförsök/race och syntetisk kontoradering. Samordna komponenterna;
   publicera inte klienten ensam innan dess nya tabell/RPC finns.
4. Pontus accepterar Staging. A4/KAN-129 genomförs sedan som ett separat uppdrag.
   Production kräver ett senare exakt release-GO och färsk backup/versioneringsplan.

**STOP efter lokal implementation och tester.**
