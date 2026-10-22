# KAN-98 – Säkert uttag, lokal korrigering 2026-10-22

**PASS för Staging-förberedelse efter denna lokala checkpoint.** Ersätter releaseblockeraren
för e4d71f6: giltiga supplier_invoice-händelser saknade verifierad källklassificering i uttagsvyn.
Ingen Staging-acceptans eller publicering påstås. Exakt ny SHA hämtas ur denna rapports commit.

## Ändring och säkerhetsgräns

Uttagets befintliga protokoll 3, RPC:er och servergenererade signaturer bevaras. Bara när
supplier_invoice finns i underlaget läser klienten dess ägarbundna fakturor, händelser och
fullständiga verifikationsjournal genom befintlig SELECT/RLS. Samma verifierade profilprincip
och explicit pinnad bearer-token används; varje paginerad/chunkad läsning kräver exakt count.
Äldre uttagsunderlag utan leverantörskälla får inga nya databasanrop.

Läsningen omges av två get_withdrawal_context-anrop. Signatur, revision och finansiella
signaturer måste vara identiska; ägare/datum/profilgeneration verifieras också. Varje relevant
leverantörshändelse skapar journal/transaktion atomiskt och påverkar därmed serversignaturen.
Fakturans ekonomiska fakta är oföränderliga för API-rollerna. Dagens status används inte för
att gissa historiskt betalningsläge. Framtida betalningar filtreras bort, men en verifikations
fullständiga journal läses utan datumfilter så felplacerade extrarader inte kan döljas.
Detta är kompletterande läsbevis, inte en ny serversignerad protokollversion.

Den rena verifieraren kräver ägare, faktura/originalkoppling, unika händelser/nycklar,
ursprungligt bokningsbeslut, belopp/moms/avdrag, giltiga datum, stödda konton, helbetalning,
verifikationsmetadata och exakta journalrader. Betalningsånger/annullering måste ha rätt
original och exakt spegeljournal. Dubbla aktiva betalningar, dubbel återföring, betalad
annullerad skuld, okänd källa och ofullständiga/motsägelsefulla bevis stoppar rekommendationen.
Endast efter godkänd kedja accepteras just de kopplade supplier_invoice-transaktionerna.
Källan läggs inte till som generellt betrodd manual-bokföring.

## Bokföringsintegration och belopp

- Ingen ändring i RPC-skrivväg, migration, årslås, korrigeringsregler, moms-, resultat-, NE-,
  balans-/IB-, SIE-, kundfaktura- eller inventariemotor. Edge-koden är oförändrad av rättningen.
- Faktura-/händelsebevisen skapar inga ekonomiska bidrag. Kostnad/moms/bank/2440 kommer fortsatt
  bara från befintlig datumavgränsad journal. Ingående och utgående skulder hanteras därför
  av samma redan verifierade saldo-/årsmodell.
- Obetald 2440-reserv går genom befintliga ”andra betalningar”. Användaren behöver fortfarande
  bekräfta den uppgiften. Reserven läggs inte dubbelt; ett belopp under känd skuld stoppas.
- Betalning tar bort 2440 men minskar banken lika mycket. Ingen ny kostnad/moms.
  Återföring/annullering använder signerade journalrader och återställer rätt reserv.
- Sparning använder oförändrad serversignatur/revisionskontroll; inga nya rådgivningsskrivningar.

## Utförd riktad verifiering

`npm run test:withdrawal` är grön, inklusive befintliga årsprocent-/UI-prov, 100 befintliga
domän-/adapterassertioner, 80 kundfaktura-/uttagsregressioner, transport, konflikt-/reload-UI,
migrationsskydd och desktop/mobil. Samma kommando omfattar nu de nya regressionerna:

- **52 nya domänfall:** 0/6/12/25 procent, full/ingen avdragsrätt, obetald/betald skuld,
  återföring/om betalning/annullering, historiskt datum, reserv en gång och tak mot manuell
  oracle med identisk journal. Saknad/felaktig koppling, metadata/moms/journalmanipulation,
  okänd källa och främmande ägare ger aldrig rekommenderat belopp.
- **13 nya transportkontroller:** faktisk tjänst/läsmodul/profil-token-guard med syntetisk
  Auth/PostgREST. Ändrad signatur/revision, läsfel/count, profilbyte, främmande faktura,
  historisk cutoff och sparningens oförändrade serversignatur verifierade.
- Typecheck, riktad ESLint över samtliga ändrade kod-/testfiler och slutligt Next-bygge PASS.
  Bygget använde syntetiska processlokala nycklar och localhost, inte Stripe-runtime.
- Extra READ ONLY-prov mot befintlig lokal syntetisk PG17-databas: verifierad
  sololedger_kan62_disposable_20261021/127.0.0.1:5432/OID57199/unik markör, autentiserad
  tidigare testägare. Riktig get_withdrawal_context, faktura, händelser och full journal för
  bokslut 2025/betalning 2026 accepterades. Ingen migration eller dataskrivning.
  Detta prov och fristående typecheck är dokumenterade terminalobservationer i verifieringsfilen.

Testlogg, bygglogg, lintlogg och verifieringssammanställning finns i
`../testing/kan98-local-2026/evidence/withdrawal-fix-*` och omfattas av SHA256SUMS.txt.
Första samlade provet stannade vid en äldre testmocks saknade export för den nya dynamiska
läsmodulen. FAIL-loggen bevaras. Tre äldre sviter utan leverantörsdata fick en explicit
”oanvänd leverantörsläsare”-mock som kastar vid oväntat anrop. Nya transportprovet kör den
verkliga läsmodulen och profil-/tokenguarden. Slutlig riktad svit är grön.
Sandboxens webbläsarsökväg rättades processlokalt till redan installerad Playwright; ingen install.

Den omfattande totala domän-/säkerhetsregressionen, 32 skrivande DB-kontroller och 42 tidigare
KAN-98-rapportkombinationer kördes inte om: boknings-/rapportmotor och migration är oförändrade.
Befintliga hashverifierade bevis i KAN-98-LOCAL-PASS.md återanvänds. Full repo-lint påstås inte grön.

## Release och nästa steg

Korrigeringen kräver **ingen ny/ändrad migration och ingen extra Edge-ändring**. KAN-98:s
ursprungliga 20261022120000_kan98_supplier_year_end.sql är byteoförändrad (SHA256
60ea50ce6deed41f80b90d846d7ad76f9f977365d06eeec4c3a64b8f3e79786c).
Den och ursprunglig delete-user-räknare behöver fortfarande separat Staging-godkännande.
Root-grenen är fortsatt ingen releasebas; produktkopians origin är en lokal kopia.

Efter exakt godkännande: verifierad CLI-plan → endast KAN-98 Staging-migration → delete-user
med bibehållet JWT-skydd → endast godkänd SHA till GitHub staging → exakt Preview/alias.
Publiceringsvägen/liveförutsättningarna granskades tidigare samma dag, utan nya externa ändringar.
Ny publicering ska återkontrollera aktuell målstatus och stanna vid drift.

Hosted acceptans ska verifiera riktiga Auth/RPC/läsningar, journal/moms/NE/B15/dashboard/IB,
årslås/helbetalning/återföring och Säkert uttag för obetald respektive betald/rättad skuld,
reserv exakt en gång samt trasiga bevis/ägarkontroller. Bevara tidigare kohorter.
Momsavslut 2026 är fortsatt framtidsspärrat; använd avslutat 2025 för faktiskt avslutsprov.
Ingen full KAN-99-guide eller deklarationsinlämning tillkommer.

Ingen push, migrationsexekvering, Edge-/Vercel-deploy, Staging-/Production-ändring eller
Jira-mutation. Jira är fortsatt In Review/Pontus enligt senast utförd läsning; inga nya statusanspråk.
