# KAN-122 – lokal implementation och verifiering 2026-10-31

Lokal kandidat klar för projektledarens granskning. Ingen generell stabilitetsförklaring. Jira In Progress. Ingen commit, push, deployment eller Staging-/Production-skrivning. A2 och avancerat SIE-arbete KAN-83/KAN-34 ingår inte.

## Förändring

- `supabase/migrations/20261031133758_kan122_closed_year_boundary.sql`: tre privata funktioner, två triggers och en avgränsad utökning av `close_year_atomic`. SHA256 `ccea0bda6cad36470d81a1dfcf8613933eaf2c123525240ec5970863b0cf01de`.
- `scripts/kan122-local-db.mjs`: fast lokal anslutning med databas-/OID-/markörkontroll och avskalad processmiljö; inga appmiljöer eller hosted fallback.
- `scripts/test-kan122-local-db.mjs`: faktisk PostgreSQL-verifiering, återställbara fall och separata samtidighetssessioner. Kräver uttrycklig lokal test-GO i processmiljön.
- `scripts/test-kan122-year-lock-message.mjs`: faktisk sidhandlers återgivning av serverfelet, utan nätverk eller bokningar.
- `package.json`: testkommandon `test:kan122`, `test:kan122:db`; meddelandetestet ingår i `test:domain` och därigenom ordinarie säkra regression. Databastestet körs separat mot det fasta godkända målet.
- Denna rapport och en tillagd aktuell notis i `PROJECT_STATE.md`. Ingen applikationskod, historisk migration eller låsfil har ändrats.

## Gemensamt databasskydd

Senaste låsta årsslut per användare skyddar alla datum till och med den 31 december detta år, även tidigare öppna år. En journalinsättning kontrollerar både journalens och modertransaktionens datum. Ändring av journalens ekonomiska fält kontrollerar även det gamla läget; byte av journalägare nekas. Datumflytt på en transaktion med journaler kontrollerar gamla/nya datum och journalernas datum, även om transaktionens `booked`-flagga är felaktigt falsk. Osäkra NULL-datum avvisas vid nya ekonomiska skrivningar; gamla rader skrivs inte om. Metadata utan ekonomisk förändring påverkas inte av de nya triggers som daterar historiken.

Befintligt delat/exklusivt `lock_accounting_year_boundary` återanvänds. Senaste lås läses efter eventuell väntan. Journalen tar ett delat radlås på föräldern för att också samordna samtidiga datumflyttar. Inventariernas befintliga trigger körs efter den nya journalspärren. Befintliga standardkvitton återläses före skrivningen och påverkas inte av det nya journalvillkoret.

Inga tabellgrants, RLS, policies, constraints eller index ändras. Hjälparna nekas uttryckligen PUBLIC/anon/authenticated/service_role. Ingen ny data-domän eller raderingsordning införs; den godkända servervägen för total kontoradering är oförändrad och inga DELETE-triggers tillkommer. Privilegierad administrativ SQL/radering är fortsatt en separat befogenhet.

## Kronologiskt årslås och startår

Servern kräver att första tidigare relevanta öppna året avslutas först. Relevans härleds från tidigaste journal-/modertransaktionsdatum, ej makulerad kundfakturas fakturadatum, uttrycklig momshanteringsstart för registrerad firma, befintliga momsperioder och redan valda årslås. Kontoregistreringsdatum används inte. Utkast utan journal är inte i sig ett bokfört startår.

Tomma mellanår mellan denna kända start och önskat låsår ska avslutas uttryckligen i ordning. Ingen automatisk låsning, upplåsning eller ombokning. Utan något sådant underlag uppfinns inget äldre startår. Startår 2025 kräver alltså inte 2024. Ett kalenderår före första kända verksamhetsunderlaget krävs inte; ett äldre befintligt årslås eller momsstart räknas som uttryckligt historiskt underlag. Något separat verksamhetsstartfält finns inte i nuvarande profil: SoloLedger kan inte härleda okänd verksamhetshistorik utanför registrerat underlag.

Exempel: ”Du behöver låsa 2024 först. Bokföringsåret 2024 är fortfarande öppet och behöver avslutas innan du kan låsa 2025.” Befintlig sidhandler visar detta servermeddelande. Ingen ny UI-navigering behövdes. Befintliga kontroller för avslutat kalenderår (svensk servertid), KAN-96-resultatunderlag, moms, kundfakturor och inventarieavskrivning kvarstår.

## Integrationsyta, kartlagd före implementation

Samtliga 14 befintliga funktioner som faktiskt skriver journal når den gemensamma triggern:

- `book_transaction_atomic`, `book_periodized_transaction_atomic`, `create_correction_transaction_atomic`.
- `insert_customer_invoice_transaction` (används av betalning, bokslutsfordran och senare avräkning), `undo_customer_invoice_payment_atomic`, `manage_supplier_year_end_invoice`.
- `book_fixed_asset_acquisition_atomic_unchecked_kan54`, `book_fixed_asset_depreciation_unchecked_inventory` genom befintliga kontrollerade omslag.
- `book_vat_v2_eu_service_reverse_charge_atomic_unchecked_kan55` genom befintligt omslag, `close_vat_period_atomic`, `record_vat_settlement_atomic`, `record_tax_account_movement_atomic`.
- `import_sie_batch`, `undo_sie_import_atomic`: endast befintliga skrivvägars skydd verifierat.

Transaktionskällor, rapporturval, momsberäkning, NE-/resultatmotor, dashboard, uttagsberäkning och faktura-/skuldklassificering ändras inte. Deras journalunderlag skyddas. Därför tillåts betalning/rättelse i senare öppet år efter det nya bokföringsdatumet, oavsett originalets ålder. Momsperiods-, inventarie-, identitets-, kvitto- och isoleringskontroller ligger kvar. Justering av en gammal periodiserings vändningsben kan fortfarande avslås atomiskt om det nya benet faktiskt får ett skyddat datum.

## Exakt lokal testmiljö och avgränsningar

- PostgreSQL **17.11**, host **localhost**, fast serveradress **127.0.0.1**, port **5432**.
- Databas **sololedger_kan117_recovery_20261027**, OID **69031**.
- Databaskommentar/unik markör **KAN117 recovery synthetic only 168702b9-8608-4e93-b30d-4fbc93490ff2**.
- Verifierad identitet i samma session före skrivbatcher; `session_user=postgres`, riktiga tester som rollen authenticated med syntetisk JWT-identitet. Inga foreign servers/subscriptions. Ingen serverklocka ändrad.
- Miljön var tom på användare/journaler före denna uppgift. Den är separat från Production `wbaxmuvudpnkvuliicuy` och Staging `fzxqiqenqjzhlyxxpvhg`; inga appmiljöfiler används.
- Granskad KAN-96-migration installerad en gång som lokal förutsättning. Därefter matchade **107 funktioner** färskt avlästa Production-definitioner. Tre KAN-117-funktioner för momsperiodernas skapandeplan saknas fortfarande lokalt och har inte installerats. De behövs inte för dessa tester; befintlig `ensure_vat_periods` användes. Detta är inte ett fullständigt hosted Supabase-/momsplans- eller klient-E2E-test.
- KAN-122-filen installerad endast här genom den lokala PostgreSQL-klienten. Ingen reset, DROP, migration mot andra databaser, gemensam rolländring eller rensning. Lokala Supabase-migrationshistoriken används inte som releasekvitto; framtida hosted installation ska bevara versionsidentiteten via ordinarie CLI.
- I två leverantörsfall användes en **minimal metadatafixtur** `storage.objects`, skapad och helt återställd inom testtransaktionen. Den lokala databasen saknar Storage. Verklig filuppladdning/Storage-RLS verifieras inte av detta. Efteråt saknas åter Storage-schema.
- Direkta syntetiska låsrader används för det avsiktligt inkonsekventa A1-läget och för ett senare låst 2026 med öppet 2025. Det senare kan inte skapas genom dagens kalenderårsspärr före 2027. Normala kronologiska lås och samtidighet använder däremot verklig `close_year_atomic` i egna transaktioner. Delat lås uppgraderas inte till exklusivt inom en bokningstransaktion.
- Nya syntetiska kohorter har egna UUID:n och `example.invalid`-adresser. Återställbara fall rullas tillbaka; förutsättningar till årslås och samtidighetsfall behålls. Efter samtliga körningar: **80 märkta syntetiska användare/profiler, 76 transaktioner, 150 journalrader och 21 lås**, noll obalanserade/föräldralösa journaler. Inga befintliga fixturer rensades.

## Resultat

**49/49 databaskontroller PASS**, inklusive sju verkliga samtidighetsfall med observerade blockerande PostgreSQL-processer. Senaste fulla beviskörning: `coverage/kan122-local-20261031/2026-10-31T13-53-37.423Z-e262eda1-ec20-429b-858c-f2f87907a659/`.

| Kontroll | Verifierat utfall |
| --- | --- |
| A1, insättning 500 kr under öppet 2024 med låst 2025 | Atomiskt avslag. B9 **1 000 → 1 000**, B10 **1 000 → 1 000**, R11 **0 → 0**, balansdifferens **0**. Inga extra transaktioner, journaler, kvitton eller förbrukade verifikationsnummer. Faktisk NE-motor körd. |
| Journal-/transaktionsdatum på var sin sida av gränsen | Båda kombinationerna avvisas; datumflytt in i och ut ur skyddad historik stoppas. Öppna datumflyttar och tillåtna metadatauppdateringar fungerar. |
| Kronologi och startår | 2024 före 2025, nystart 2025 utan krav på 2024, faktura-/momsstart, tomma mellanår 2023→2024→2025 och tom firma PASS. Servern stoppar fortsatt innevarande år. |
| Vanlig bokning, periodisering, rättelse och omförsök | Skyddade ben avslås atomiskt. Senare öppna ben tillåts. Exakt replay efter lås återger samma kvitto; ändrat underlag och samtidiga dubbelförsök skapar inte fler journaler. |
| Kundfordran 1 250 kr 2025, betalning 2026 | 2025 års rapport oförändrad. 2026 D1930 **1 250**, K1510 **1 250**; ingen ny intäkt/moms. Befintlig betalningsåterföring använder dagens öppna år och lämnar låsta saldon oförändrade. |
| Bokslutsskuld 1 250 kr 2025, betalning 2026 | 2025: bank **5 000**, skuld **1 250**, eget kapital **3 750**, oförändrat efter betalning. 2026 D2440 **1 250**, K1930 **1 250**, ingen ny kostnad/moms. |
| Inventarier, moms och skattekonto | Anskaffning/avskrivning, EU-tjänst, momsavslut och överföring når spärren; öppna normala flöden samt deklaration/avräkning fungerar. Ingen försvagad moms-/inventariekontroll. |
| Samtidighet | Lås först stoppar äldre bokning efter väntan. Äldre bokning först gör att lås kräver det nya äldre året. Bokning i 2025 först ger låst bank **1 500**. Båda rollback-ordningarna, kvittokonkurrens och datumflytt mot journalinsättning PASS. Annan användare kan bokföra under pågående lås. |
| RLS, grants och befintliga SIE-vägar | Privata hjälpare/API-DML fortsatt nekade, annan användares lås osynligt, import stoppas av gränsen och befintlig återföring i öppet år bevarar historiken. |

Alla redan befintliga publika rader/Auth-rader bevarades vid varje full körning; funktions-/tabellkontrakt oförändrade av testerna. Installationens dataavtryck före/efter är identiska. Syntetiska nya testkohorter undantas uttryckligen när tidigare rader jämförs.

Övrigt: **15 lokala domän-/meddelandesviter PASS**, befintligt syntetiskt annual-tax-browsertest PASS, TypeScript `--noEmit --incremental false` PASS, ESLint för de tre nya testfilerna PASS. Databastestet vägrar starta utan GO. Första browserförsöket hittade inte Chromium i verktygets miljö; ett avgränsat omförsök med redan installerad browser sökväg PASS. Ingen ny installation. Fulla samlingsregressionen kördes inte, eftersom den även skriver äldre granskningsförhandsvisningar; ingen In Review-status påstås.

## Risker, Jessika och nästa GO

Jessikas bokföring är helt opåverkad nu: kandidaten finns bara lokalt. Efter en framtida godkänd installation ska vanlig bokföring och betalning av gamla fordringar/skulder i senare öppna år fortsätta fungera enligt testfallen. Bakdateringar eller rättelser med nya datum inom skyddad historik stoppas avsiktligt. Hennes faktiska behov av sådana historiska åtgärder har inte undersökts i denna uppgift.

Befintliga luckor i årslås eller felaktigt angiven momsstart kan kräva separat granskning; lösningen reparerar inte gamla saldon eller lås. Om avslut av ett äldre år skulle kräva nya journaler under ett redan senare låst år ska det hanteras genom separat beslut, inte kringgås med en flagga. Nya skydd innebär extra indexerade låsuppslag och radlås; samtidighet är funktionellt verifierad, ingen storskalig lastmätning gjord. Direkt privilegierad administrations-SQL och extern okänd verksamhetshistorik är inte en vanlig användarväg.

Gren **codex/KAN-122-year-lock-boundary**, oförändrad HEAD **c1846a7b560a876c0be1373a5949f64f7f9d8434**, inget staged. Tidigare smutsiga dokument och övriga otrackade filer bevarade. Före vår statusnotis var endast `package.json` ändrad bland auditens **1 023** inventerade befintliga produktfiler; root-checkoutens tidigare smutsiga filer var oförändrade.

**STOP för projektledarens granskning.** Separat GO krävs för eventuell lokal commit och därefter exakt Staging-migration/publicering. Före Staging: granska startårsregeln och migrationen, läs färska Staging-definitioner/grants, verifiera preimage och exakt kandidat/version, samt kör motsvarande syntetiska hosted acceptansfall inklusive verklig bilaga och UI-meddelande. Production och deployment är inte godkända. Ingen generell stabilitetsförklaring, A2 prioriteras fortsatt separat.
