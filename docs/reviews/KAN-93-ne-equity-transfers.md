# KAN-93 – B10 och redan bokförda resultatöverföringar

2026-10-18. Lokal kandidat på `codex/KAN-93-ne-b10-result-transfer`, från
Production `7d2256f12c2ca7286bc21418b08d840560a830e8`. Inte publicerad.
Pontus godkände avgränsad implementation i samma chatt efter läsande förstudie.

## Verifierat befintligt årsskifte och IB

- `getBalanceSheetBalances` och `getCumulativeResultat` läser saldon till och
  med valt års sista dag utan nedre datumgräns. Balanskonton och kapitalets
  resultatdel förs därför vidare automatiskt. `getAccountBalances` och NE:s
  R-rader använder det valda året. Ingen extra manuell IB-bokning behövs.
- `useAccountingData` laddar dessa rapporter vid årsval. FAQ beskriver samma
  carry-forward-modell. Ingen automatisk 8999/2019- eller årlig IB-verifikation
  hittades i dessa vägar. Den lästa live-definitionen av `close_year_atomic`
  gör kontroller och skriver endast årslåset, ingen resultatöverföring.
- SIE bevarar importerade bokslutsverifikationer från andra system.
  `import_sie_batch` skapar en särskild IB-verifikation och en 2019-brygga
  bara när en IB-differens exakt motsvaras av föregående års `#RES -1`.
  Redan balanserad IB får ingen extra brygga. Inga sådana regler ändras här.
- KAN-74:s befintliga gräns till ett importerat SIE-år per företag består.
  Fortsättning i nästa år är inte en ny flerårig SIE-import. SQL-testerna
  använder ett riktigt importerat år och därefter syntetiska manuella poster.
- Manuella externa bokslutsverifikationer påverkar saldona på samma sätt som
  importerade verifikationer. B10 räknas från journalens konton och tecken,
  inte från beskrivning eller ett antaget transaktionsursprung.

## Rotorsak och avgränsad ändring

Tidigare: `B10 = kapital på 2010/2019 + kumulativt verksamhetsresultat
+ insättningar - uttag`. Resultatmotorn undantar 8990–8999 från resultatet.
En överföring 8999 debet / 2019 kredit ökade därför kapitalet en gång till
utan motsvarande minskning av den kumulativa resultatdelen.

Nu används endast för B10:

`resultat efter överföringar = kumulativt verksamhetsresultat
- kumulativt saldo på 8990–8999 (debet minus kredit)`.

Detta följer journalens balansidentitet; ingen vinstmatchning, klippning,
automatisk bokning eller avräkning av hela 2019-saldot görs. 2010/2019 och
alla befintliga ägarkonton behåller sina tecken och verkliga kapitalbelopp.
8990/8999-kedjor nettas tillsammans, även vid delöverföring, förlust och rättelse.
Ingen extra överföring skapas när SIE redan innehåller bokslut.

`neEquity.ts` isolerar B10-justeringen. `getCumulativeResultat` behåller sina
befintliga resultatfält och tillför den särskilda B10-resultatdelen.
NE:s R1–R17, skattejusteringar och resultatmotor ändras inte. UI förklarar
beräkningen och visar granskningsbesked vid kvarvarande kumulativt 899x-netto.
2010/2019-raden kallas kapital, eftersom saldot inte alltid är årets faktiska IB.
Granskningsbeskedet sparar inget granskningsbeslut och är ingen ny årslåsspärr.

## Lokal migration och live-underlag

Production-definitioner lästes via `pg_get_functiondef` i READ ONLY/TLS-session.
Även berörda constraints, index, RLS-policyer och funktions-ACL granskades.
Inga användarrader behövde läsas. Underlaget finns utanför Git i
`../kan93-live-definitions.json` relativt kandidatkopian.

`20261018190000_kan93_ne_equity_transfers.sql` utgår från exakt läst live-definition
av `close_year_atomic`. Enda beteendeändringen är att dess B10-resultat inkluderar
899x-nettot. Övriga spärrar, funktionens behörigheter och årslåsens data bevaras.
Migrationen stoppar om den befintliga funktionsdefinitionen inte matchar den
granskade. Ingen ny tabell, datarättning, RLS- eller grantändring.

Migrationen är körd endast i en ny, tom lokal schema-kopia av den etablerade
lokala testdatabasen. Inga källdata kopierades. Alla syntetiska fall rullades
tillbaka och den tillfälliga databasen togs bort. Ingen Staging/Production-DDL.

## Integrationsyta och verifiering

- Journaler, transaktionskällor, metadata, importpayload/hash och skriv-RPC:er:
  oförändrade, förutom årslåsets avgränsade rapportkontroll. Inget nytt ursprung.
- B10 och balanskontroll: korrigerade; övriga B-rutor, R1–R17, KAN-88-beslut,
  KAN-90-kontotäckning och KAN-91/92-varningar jämförda mot Production-basen.
- Momsrapport/-perioder, dashboard, säkert uttag och skatteberäkning: inga
  ändrade beräkningsvägar. Resultatmotorn är oförändrad och riktade befintliga
  dashboard-/skatteregressioner ingår i KAN-91-testet.
- Fakturor, betalningar och kundfordringar: ingen ändring. Årslåsets befintliga
  faktura-, moms- och inventariespärrar kvar exakt i migrationsjämförelsen.
- Rättelser/undo: faktisk lokal spegelvändning via båda RPC:erna verifierad.
  Senare rättelser påverkar från sin bokföringsdag; tidigare års vy ändras inte.

PASS, senaste relevanta körningar:

- `node scripts/test-ne-equity.mjs`: 26 syntetiska service-/SIE-/IB-fall mot
  pre-fix-bas, faktiska NE-vyn i 1440/390/320 px, korrekta aktiva/spärrade
  årslåsknappar och låst vy. Inga nätanrop/browserfel/horisontell överrullning.
  320 px-resultatet visuellt granskat. Den nya regressionen ingår i `test:domain`.
- `npm run test:kan93:db` med explicit lokal miljö: 22 riktiga import-/NE-/årslåsfall
  före/efter samt faktisk IB-brygga, rättelse och importångring. SQL och service
  överens. Även ACL, övriga funktioner och migrationsskydd verifierade.
- KAN-88 sales-classification, KAN-90 account-coverage (21 servicefall + 8000
  kontotillstånd + tre skärmbredder), KAN-91 (18 fall + 15994 opåverkade
  konton/tecken), KAN-92 (33 rapportfall + riktig SIE-preview): PASS.
- Befintliga result-engine (81), ne-balance (15), SIE-import/server/parser,
  typkontroll och fokuserad lint: PASS.

Ingen full regression/build, hosted E2E, Staging-/Production-acceptans eller
verkligt årslås har körts. Detta följer uppdragets avgränsning; Jira har inte
flyttats till In Review. Syntetiska testuppstarts-/förväntansfel rättades lokalt;
inga redovisningsskydd försvagades för att få tester gröna.

## Separat observation: fullständigt nollade resultatkonton

Om ett externt bokslut även nollar intäkts-/kostnadskontona blir de importerade
årssaldona noll. Befintlig motor ger då R11/R17 = 0 även när årets affärshändelser
innan nollningen gav vinst. Exemplet med försäljning 1000 och full nollning via
8990/8999/2019 ger korrekt B10 = 1000 både före och efter KAN-93, men R11/R17 = 0.
Detta är ett separat resultatrekonstruktionsproblem och löses inte här.

En helt nollad bokslutskedja kan dessutom ge nollsaldo på alla 899x-konton.
Saldo-RPC:erna visar då inte att teknisk bokslutsaktivitet har funnits; det nya
granskningsbeskedet baseras på synligt 899x-netto och kan inte identifiera alla
sådana historiska kedjor. Inget resultat återskapas eller gissas. En framtida
lösning behöver separat godkänd journalanalys och egen testad avgränsning.

## Återstår före Staging

1. Pontus granskar kandidat, varningsavgränsning och lokal migrationsfil.
2. Separat godkännande för eventuell commit/push, Staging-migration och Preview.
3. Läs Stagings aktuella årslåsdefinition och migrationsledger; utred eventuell
   skillnad som migrationsskyddet stoppar. KAN-62/65 får inte skrivas över.
   Den redan dokumenterade saknade KAN-84-migrationsfilen kräver också korrekt
   versionshantering; ingen include-all, baseline-replay eller ogrundad repair.
4. Efter uttryckligt godkänd Staging-publicering: syntetisk vinst med överföring
   och förlust/rättelse, kontrollera journal, B9/B10/balans och faktiskt årslås;
   bekräfta oförändrade R-/moms-/dashboardvärden samt betalnings-/fordringsläge
   där tillämpligt. Kontrollera nästa år utan ny IB. Samma korta checklista
   krävs inför Production; inga Production-skrivtester på riktiga användare.

Produkt och DB behöver publiceras samordnat: utan migrationen kan den nya
NE-vyn visa korrekt B10 medan den gamla serverkontrollen fortfarande nekar lås.

## Godkänd återställning inför Staging, 2026-10-18

De två KAN-62-originalen 20261012123000/20261012153000 och KAN-84-originalet
20261015180458 återställdes byte-oförändrade efter separat godkännande.
Alla 22 SQL-satser är tidigare jämförda med Stagings ledger; originalhashar
återverifierade. Förnyad officiell dry-run visar endast KAN-93, utan seeds
eller roller. Alla 50 tidigare Staging-versioner finns lokalt och årslåsets
definition matchar migrationsskyddet. Inga historiska filer ska köras igen.
KAN-62-filerna är Staging-historik; en framtida Production-release behöver
ett separat godkänt migrationsurval som inte tillämpar dem i Production.

Godkänd lokal commit omfattar de tio KAN-93-filerna och exakt dessa tre
historiska original. Separat release- och testbevis hålls utanför Git i
../kan93-staging/. Ingen Production-release är godkänd.
