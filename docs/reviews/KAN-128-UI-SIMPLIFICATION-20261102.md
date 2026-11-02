# KAN-128 – lokal UI-förenkling och korrigerad PDF-verifiering

2026-11-02. **Lokal implementation och fokuserade tester PASS. Production är
fortsatt STOPPAD. Ny Staging-publicering och acceptans är inte genomförda.**

## Korrigering av tidigare acceptans

Pontus manuella Staging-prov hittade en ogiltig PDF vid VER-34 och en för stor,
teknisk historikvy i verifikationslistan. Föregående separata läsande kontroll
visade följande, utan reparation eller filändring:

- VER-34:s `attachments/<ägarmapp>/1791230932862-d0dcca5d-bf6c-4237-8607-74f75281aa3e.pdf`
  finns, är 47 byte och skapades 2026-10-05T20:08:53Z. Den matchar exakt KAN-46:s
  header-/kommentarbaserade syntetiska testfil, saknar fungerande PDF-struktur
  och är inte en av de 102 referenserna utan objekt. Ägarläsning tillåts och
  HTTP-hämtning fungerar; innehållet förklarar Chrome-felet.
- Alla 45 Stage-objekt gick att hämta med rätt storlek. De tidigare 39 objektens
  metadataavtryck var identiska med före KAN-128. Ingen filförlust påvisades.
- 16 äldre Playwright-filer var ogiltiga PDF-fixtures. Av KAN-128:s **6 nya**
  filer var 5 giltiga PDF:er; browserkompletteringen på 126 byte var också en
  ogiltig fixture. Den tidigare siffran 16 avsåg historikrader i dry-run, inte
  antalet nya acceptansfiler. Production-backupens separata filantal används
  inte som Staging-bevis och ingen Production-åtkomst behövdes.
- Tidigare samlat Stage-PASS bevisade inte PDF-visning för alla testfiler.
  Äldre skydds-/isolering-/ekonomiprov behålls som avgränsade bevis, men ingen
  slutlig releaseacceptans kan härledas från den rapporten.

## Exakt UI-ändring

- `Visa bilaga` och dess befintliga synlighetsvillkor är oförändrade.
- Den stora historikknappen och hela den utfällda historikrutan är borttagna
  ur dator-/mobilraderna. En liten `Historik`-länk visas endast när en faktisk
  `replacement` eller `addition` finns. En ensam äldre/initial referens ger
  ingen historiklänk.
- En diskret meny `⋯` innehåller `Hantera bilagor`, även när historiklänk saknas.
  Den öppnar en separat modal dialog i dokumentets body, utanför tabellen.
  Tillägg använder befintlig uppladdare och befintlig server-RPC. Samma dialog
  används i befintliga transaktions-, kundfaktura- och bokslutsskuldsvyer.
- Listans förändringsindikator hämtas per ägare i paginerade grupper om högst
  100 transaktioner, gemensamt för dator/mobil. Ingen historikfråga per rad.
  Bekräftade tillägg uppdaterar båda vyernas indikatorer. Ägarbyte och sena
  svar kan inte återanvända föregående ägares resultat.
- Historiken använder `Öppna bilaga` och anger uttryckligen registrerad referens
  och att filinnehållet inte är verifierat. En signerad URL ger ingen verifierad
  filstatus. Ursprunglig referens markeras utan att hävda att bytes existerar.
- Tekniska gamla anteckningar/tider/aktörer finns kvar under uttryckligt öppnade
  `Registreringsuppgifter` inne i dialogen. De visas inte i listan. Användarens
  beskrivning av ett tillägg visas i fullhistoriken. Ingen historikdata skrivs om.
- Låst år har fortsatt läsning men saknar tilläggskontroller. Native dialog ger
  fokusavgränsning, Escape/Stäng och fokus tillbaka till menyöppnaren.

Inga journal-, moms-, NE-, SIE-, rättelse- eller raderingsregler ändrades.
KAN-129:s `!isNeutralized` och KAN-127:s ordning/service-role-risk är kvar.
Ingen ny migration, Edge-ändring, ändring av Storage-policy/RLS eller grant.

## Vad som faktiskt testats

| Kontroll | Resultat och bevisgräns |
| --- | --- |
| Nya UI-/PDF-prov | **25 PASS**, faktisk React/Tailwind, 1280 och 390 px. Supabase är en isolerad syntetisk adapter och filservern kör endast på 127.0.0.1. Inga app-env/Auth-hemligheter laddas. |
| PDF-innehåll | Nya kompletta PDF:er med katalog, sida, font, xref och trailer. Oberoende Poppler `pdfinfo` accepterar dem och avvisar header-only-fixturen. |
| Browseruppladdning och visning | Fyra faktiska File-uppladdningar till den lokala minnesservern, SHA-256 och parsning. Både primärlänken Visa bilaga och historikens Öppna bilaga testade. Installerad **Chrome 155.0.8059.40**, ny headless med inbyggd PDF-läsare: `success`, färdig laddning, en siddimension och ingen feldialog. Skärmbilder av faktisk PDF-visning granskade. HTTP 200 eller hash ensam räknas aldrig som visning. |
| Negativ PDF | Ogiltig fil ger HTTP 200 men både parserfel och Chrome `failed`, noll sidor och faktisk feldialog. Negativ kontroll PASS betyder korrekt upptäckt fel, inte fungerande PDF. |
| Historik/åtkomst | Ursprung och ersättningsfil öppnas separat; originalhash oförändrad. Meny, relevansstyrd länk, live uppdatering mellan dator/mobil, separerad dialog, dolda tekniska detaljer och läsning i låst år PASS. |
| Isolering/fel | Ägarbyte, fördröjt gammalt svar, främmande fil, läsfel och exakt upload-retry PASS i syntetisk adapter. Det är inte nytt hosted RLS-bevis. |
| Befintliga lokala DB-prov | **44 PASS**, rätt PG17/localhost/databas-OID69031/unik markör verifierade. Befintlig KAN-128-migration används endast i återställd transaktion; alla fixtures/DDL rollback. Verkliga lokala RPC-prov omfattar byte, rättelse, original/historik, tre domäner, isolation, årslås/race och oförändrade journal-/moms-/NE-resultat. Storage där är metadata/RLS-fixture, inte HTTP-tjänst. Tidigare lokalt tillstånd identiskt efter provet. |
| Befintliga UI-regressioner | Verifikationsgruppering: dator/mobil och fyra lägen PASS. Presentation: dator/mobil PASS. Bokslutsskuldspanel: **16 PASS**. |
| Statiskt och skydd | Typecheck, riktad ESLint för komponent/hook, admin-dry-run-kontrakt, DB-invarianter samt 325 skyddade produktfilers integritetskontroll inklusive negativa prov PASS. Historiska migrationshashar oförändrade. |

UI-evidens: `test-results/kan128-ui-v2-1793609318426/RESULT.json` och skärmbilder
`list-*`, `locked-*`, `original-*`, `replacement-*`, `uploaded-*`,
`original-after-correction-state-*` och `invalid-rejected-*`.
DB-evidens: `coverage/kan128-local-20261101/2026-11-02T08-37-24.438Z-76e0b8bb-2e37-418b-a950-bad08cbdad02/summary.json`.
Övrig panel-evidens: `test-results/kan98-1793608683593/`.

De första lokala testförsöken behövde justerad testinfrastruktur: tillgång till
installerad Chrome, tillåtna interna `chrome://`-resurser för PDF-läsaren samt
val av rätt syntetisk tabellrad. Slutkörningen av de 25 proven är obrutet grön.
Ingen produktbehörighet eller filvalidering luckrades upp för att få PASS.

Typecheck upptäckte först äldre ignorerade Edge-kopior i `coverage/` som felaktigt
ingick i appens TypeScript-glob. Endast den genererade evidensmappen undantas nu;
produktkoden kontrolleras fortsatt. Ingen evidensfil raderades. Integritetsvaktens
snäva hashlista uppdaterades uttryckligen för de granskade lokala UI-/testconfig-
bytesen; okända filer, efterföljande drift och historiska migrationer stoppas kvar.

## Filer och Git

Ändrade för detta steg:

- `src/components/AccountingAttachmentHistory.tsx`
- `src/components/TransactionTable.tsx`
- `src/app/page.tsx` – endast befintlig uppladdningscallback till listans dialog
- `package.json` – aktivt testkommando till v2, inga beroenden/lockfiländringar
- `tsconfig.json` – undanta genererad coverage-evidens
- `scripts/check-kan124-product-integrity.mjs` – explicita nya UI-/config-hashar
- `PROJECT_STATE.md` och rättelsen överst i tidigare Staging-rapport

Nya filer:

- `src/hooks/useAttachmentHistoryChanges.ts`
- `scripts/test-kan128-attachment-ui-v2.mjs`
- `tests/fixtures/kan128-pdf.mjs`
- denna rapport; nya ignorerade testkvitton/skärmbilder

Historiskt `scripts/test-kan128-attachment-ui.mjs` bevaras oförändrat; det tidigare
22-provs UI-kontraktet är inte längre det aktiva testkommandot. Äldre syntetiska
filer/arkiv ändras inte. Tidigare dirty `PROJECT_ARCHIVE.md` och övriga lokala
arbeten bevaras. Gren `codex/KAN-128-attachment-history`, HEAD fortsatt
`c6979955dc9a4392762b2e80de45519f32f39367`, index tomt, lokala ändringar ocommitterade.
Ingen commit/push/deployment, hosted DB-skrivning, återställning, backupåtgärd
eller Jira-mutation. Jira KAN-128 läst To Do/High/ej tilldelad.

## Kvarstående begränsning och nästa GO

Ingen sammanhängande ny hosted resa mellan app, Supabase Storage, RPC och filvisare
har testats i detta steg. Lokala PDF-läsningen och lokala DB-proven är separata
bevis. Mobil innebär layout 390 px i desktop-Chrome, inte fysisk Android/iOS.
Appen utför ingen ny fullständig PDF-validering; den undviker osanna verifierings-
påståenden. Äldre ogiltiga fixtures kvarstår orörda. KAN-129/KAN-127 är inte lösta.
Ingen ny full regressionssvit, full appbuild eller allmän helt grön lint påstås.

Nästa säkra beslut är GO för granskad lokal checkpoint och separat publicering av
den exakta nya appkandidaten endast till Staging. Ingen ny DB-/Edge-installation
planeras. Verifiera rätt Stage/ledger73/skydd och kandidat först. Skapa ny isolerad
syntetisk kohort och unika filer från den giltiga PDF-fixturen; prova faktisk upload,
tillägg/byte, originalåtkomst, rättelse, årslås, isolering och PDF-visning i Chrome
på dator/mobilbredd. Behåll separat negativ PDF-kontroll; reparera inte gamla filer
och utför ingen vanlig kontoradering. Pontus gör därefter manuell acceptans.

**STOP. Production-release är fortsatt stoppad och kräver ett nytt separat beslut.**
