# KAN-110 / KAN-111 – lokal säkerhetsrättning 2026-10-26

## Beslut och kandidat

Pontus har godkänt avgränsad lokal implementation och syntetisk verifiering.
Production är inte godkänd. Separat exakt Staging-migrationsbeslut inväntas enligt
AGENTS; ingen Staging-DDL eller app-publicering har utförts.

- Bas c3a431ef1b392d61b5f3a18c42b7109cd517ba38, arbetskopia
  audit-packages/KAN-100-app-release-20261024, codex/KAN-110-111-vat-year-safety.
- Origin är lokal KAN-62-kopia, inte GitHub. Root staging/c6ad5e1 är docs-kopia.
- Föregående reproduktion finns i root docs/reviews/KAN-110-KAN-111-TARGETED-REPRODUCTION-20261026.md.
- Färsk Staging-inspektion före ändring: fzxqiqenqjzhlyxxpvhg, skrivskyddad
  Session Pooler-transaktion, backend-PID2151204 före/efter. Relevanta definitioner,
  kolumner, RLS/grants/constraints och befintlig explicit första årsperiod lästa.
- Nya migrationer har exakta normaliserade förbildskontroller. Offentliga
  RPC-signaturer/ACL bevaras. Ny hjälpare har uttryckligen nekad API-åtkomst.

## KAN-110

20261026090000_kan110_vat_year_coverage.sql lägger en privat, användarbunden
assert_vat_year_coverage före den befintliga inventarie-/årslåskedjan. Den exklusiva
KAN-75-årsgränsen tas först, därefter låses profilraden under täckningskontrollen.
Befintliga moms-, kundfaktura-, bank-/balans- och inventariespärrar bevaras.

- Registrerad profil kräver sammanhängande exakt relevant täckning för
  månad/kvartal/år med stängda/deklarerade interna perioder.
- Saknad period, överlapp, periodkonflikt och olöst första delperiod stoppar låsning
  med begriplig orsak. Ingen period eller journal skapas av årslåskontrollen.
- Bokförd moms före momshanteringsstarten kräver utredning. Startdatumet bevisar
  inte att tidigare moms hanterats externt.
- Redan explicit fastställd första delperiod kan uppfylla täckningen. Befintlig
  initialize_first_vat_year_period och dess begränsade serverbehörighet ändras inte.
- Uttryckligen icke momsregistrerad firma behåller tidigare låsväg. Okänd
  registrering kräver genomgång av Profil, inte antagen momsfrihet.
- Historikflagga/importerad period inom intern hanteringsperiod blir inte
  automatiskt bevis på internt momsavslut. Utredningsstopp är avsiktligt.

## KAN-111

20261026091000_kan111_explicit_vat_period_generation.sql återanvänder exakt
befintlig period före låskontrollen för faktiskt skapande. En befintlig explicit
första delperiod kan följas av senare hela perioder i öppna år. Ingen olöst första
period hoppas över tyst. Saknad period i låst år kräver fortsatt utredning.

Momsrapport läser perioder utan generering vid öppning, årsbyte eller omläsning.
Nya perioder begärs med **Skapa saknade momsperioder**. Skapandefel visas separat
och döljer inte läsbar historik. Dubbelklick spärras under begäran. Databasens
profillås/unika periodnyckel och befintligt skydd mot inaktuella lässvar bevaras.
Deklaration, avräkning och skattekontoöverföring behåller sina befintliga regler:
dokumentation kan ske efter lås, nya journalhändelser kräver tillåtna öppna datum.

## Integrationsyta

Inga nya transaktionskällor, beloppsberäkningar, journalplaner eller datatabeller.
Momsavslutets kontering/rapportfält, NE/resultat/B10, dashboard/uttag,
betalningar/fordringar, skulder, periodisering, rättelser och SIE ändras inte.
Årslås får en extra kontroll; periodskapande skiljs från rapportläsning.
Inga befintliga perioder, lås eller deklarationsarkiv repareras. Raderingslivscykeln
påverkas inte. Ingen generell guide-/moms-/SIE-ombyggnad eller skattemotor ingår.

## Lokal verifiering

Återanvänd verifierad miljö: sololedger_kan62_disposable_20261021,
127.0.0.1:5432, PostgreSQL17, OID57199, rätt unik syntheticOnly-markör.
Ingen ny databas, reset, delad roll/lösenordsändring eller serverinställning.
Endast nya fixturer; tidigare syntetiska ägare/rader jämfördes före/efter och
bevarades. Kandidatfunktioner installerades endast här. Metadata/fingeravtryck
förhindrar blind omapplicering av ändrade kandidatfiler.

Verkliga DB/RPC-testgrupper PASS:

- KAN-110 fungerar ensam före KAN-111-migrationen.
- Saknade perioder, olöst första delperiod för alla tre intervall och inre
  månadslucka nekas. Överlapp och osäker historik nekas.
- Komplett helår/fyra kvartal/tolv månader: öppet blockerar, avslutat låser.
- Befintlig explicit första delårsperiod återanvänds och kan avslutas/låsas.
- Icke registrerad firma med faktisk bokföring utan moms går att låsa.
- Inkomplett registrerad profil stoppas redan av befintlig constraint; okänd
  registrering får begripligt stopp. Tidigare bokförd moms kräver utredning.
- Låsta perioder återanvänds oförändrade och senare perioder skapas separat.
- Deklarationsbekräftelse efter lås skapar inga journalrader.
- Avräkning/företagsöverföring i nästa år ger rätt journal; replay ger inga
  dubbletter. Historisk journal är oförändrad. Låsta datum avvisas.
- Tvåägarsisolering och privat hjälparbehörighet PASS.
- Samtidighet: årslås väntar på generering och ser ny öppen period; bokning
  väntar på lås och avvisas; parallella skapanden ger exakt en ny period.

Befintliga test-accounting-panel-loads har fått ett automatiserat återfallsprov:
konfigurerad profil får inga genereringsanrop vid läsning; uttryckligt försök
kan misslyckas utan att tillgänglig historik döljs. Årsbytes-/raceprov PASS.
Detta ingår i befintlig test:domain/test:regression. Ny test:vat-year:db har explicit
lokal identitets- och godkännandekontroll och ingår inte i vanlig regression.

Typkontroll och fokuserad lint PASS. Full säker regression PASS, inklusive
publik lokal Playwright-smoke 2/2. Ingen ny generell SIE-/skattesvit eller full
repo-lint kördes. Befintliga modul-/flerlockfilsvarningar kvarstår.

Testverktygsproblem löstes utan försvagade kontroller: lokal Auth har bara id;
en ogiltig registrerad profil nekades redan av constraint; 1 juli är inte en hel
årsperiod; sessionsreferens rättades före samtidighetsproven. Passerade grupper
återanvändes. Första regressionsstarten saknade sandbox-browsercache; den redan
etablerade cachen användes därefter utan ny installation.

## Staging-resultat och återstående gräns

Ändrad lokal Momsrapport kördes med Chromium mot verklig Staging, enbart läsande,
på bevarade reproduktionskonton C/G. Stängd och deklarerad period i låst 2025
visades med rapport och rätt nästa åtgärd. 0 ensure-anrop; journal/perioder/lås
identiska före/efter. Ingen befintlig Staging-fixtur ändrades.

Officiell CLI db push --dry-run PASS: versionshistoriken matchar. Endast de två
filerna nedan skulle tillämpas; inga seeds/roller/äldre migrationer planeras.

| Migration | SHA-256 |
| --- | --- |
| 20261026090000_kan110_vat_year_coverage.sql | 2853175638ed9917ab434b4b6dfd27982dbd4f66bd62f74c884890d19c65177f |
| 20261026091000_kan111_explicit_vat_period_generation.sql | 002a56445932dd3294a2ed7ba8957235bb1aa4c2c4eb97d9e1dc130fba4b04b2 |

Före full syntetisk Staging-acceptans behövs exakt godkännande att installera
dessa filer i fzxqiqenqjzhlyxxpvhg. AGENTS kräver separat beslut före Staging-
migration/publicering; det stående syntetiska testmandatet undantar migrationer.
Lokal klient mot Staging räcker för testerna men är inte en publicerad release.

Efter godkännande: official CLI apply med samma versionsnummer, verifiera
live-definitioner/ACL/migrationsrader och nya syntetiska förstaårskonton för
saknad/delvis/full täckning, icke registrerad firma, UI-momsavslut→lås→återbesök→
deklarationsbekräftelse/skattekonto nästa år samt riktad isolering/samtidighet.
Gamla reproduktionskonton och låst historik bevaras. Ingen Production-åtgärd.
Kandidaten är ännu inte komplett Staging-verifierad eller publicerad för acceptans.

## Evidens

- coverage/kan110111-local/: identitet, testgrupper, journaler, installerade
  fingeravtryck, slutresultat och regression.log. Ignorerad lokal råevidens.
- Root audit-packages/KAN-110-111-repro-20261026/result.json och
  KAN111-fixed-*-locked-year-read-only.png/.txt: bevarade Staging-läsprov.
- Privata inloggningar och pgpass är separata ignorerade resurser. Inga lösenord,
  sessionstoken eller service-nycklar finns i rapport/migrationer.
