# KAN-112 – Staging-verifiering 2026-10-26

Den godkända kandidaten är publicerad i Staging. **Inte redo för slutlig acceptans**:
konkurrerande sparande ger timeout i stället för ett snabbt konfliktbesked och
en företagsnamnsändring ger onödiga varningar i moms/resultat/skattepunkter.
Ingen förlorad eller överskriven bekräftelse observerades. Produktkoden är oförändrad.

## Exakta versioner

- GitHub staging: `91233be3a7da0887d4821583b96f54e847c54844`.
- Vercel READY, Preview/staging: `dpl_B57GSjy4zNjp3xTfdu9rJ27AHo4P`.
- https://sololedger-git-staging-sololedger1.vercel.app
- https://sololedger-bd7xqhf0s-sololedger1.vercel.app
- Projekt `prj_chkSdedE06ppK2PlsqdtOhZfAKpT`, team `team_0Mrj7LMvSEfpbV8y5juQ5IiL`.
- Supabase Staging `fzxqiqenqjzhlyxxpvhg`.
- Enda installerade migration: `20261026092741_kan112_year_end_checklist.sql`.
- SHA256 `4ee37317959b7b68758f98776c347a646c62ca43e7ce5ac84c18c7e3fa4c64a5`.
- delete-user ACTIVE **version 9**, verify_jwt=true,
  id `d95e3f13-e71a-4724-9a3f-9fe9fff91890`.
- Edge bundle SHA256 `da770355ccbbeb53f9454a8f277f98ee6974d39a6f2777a8fafbf2e5f611963f`.
  Återhämtad publicerad källkod matchade godkänd kandidat.

Produktkopians origin är lokal KAN-62-kopia och ändrades inte. Push gjordes med
uttrycklig GitHub-URL och endast exakt SHA till refs/heads/staging. Root-kopians
äldre lokala staging användes inte. GitHub main är fortsatt
`6ad27f1e687056a0d7c7b4c07fe2aa58c871ef1e`. Inga Production-operationer utfördes.

Ordinarie Staging-alias behövde korrigeras från `dpl_HdWwAgc6RZqnd1dcNNeMRSqtcD5D`
(SHA 6ad27f1 ovan) till nya deploymenten. Övriga alias och miljövariablernas
metadata var oförändrade före/efter. Inga skyddsinställningar ändrades.

## Säker installation och kompatibilitet

Före ändring verifierades migrationshistorik, tabeller/funktioner, raderingsfunktionens
preimage, rättigheter och dataavtryck. Officiell CLI med isolerad migrationskatalog
visade exakt en ny migration, inga roller/seeds. Installation använde TLS mot
verifierad Staging Session Pooler. Psql kontrollerade klient-TLS och sessionens
kontinuitet; poolerns backendanslutning är separat. Version och katalog återlästes.

Anon saknar tabell-/RPC-åtkomst. Authenticated har egen SELECT via RLS och får
anropa de två ägarhärledda checklist-RPC:erna. Direkt skrivning nekas. Service-role
har avsiktlig SELECT för räkning, inga nya direkta skrivgrants. Hjälpfunktionen är
privat och delete-RPC service-only. Katalog och faktiska API-anrop kontrollerades.

Tidigare tabellstrukturer och publika funktioner är oförändrade, utom godkänd
raderingswrapper. Tidigare publika rader utanför nya KAN-112-kohorten har samma
antal och sorterade dataavtryck före/efter. Detta är riktad regressionsbevisning,
inte att varje bokföringsflöde har körts igen.

Verklig klienttrafik använde rätt Staging-ref och nya RPC:er. Befintliga app-serverns
deklarationsindex accepterade testkontots Staging-session och gav rätt ägare,
HTTP 200. Edge v9 utförde faktisk räkning/radering. App, DB och Edge fungerar
tillsammans i de testade flödena.

## Hosted resultat

| Kontroll | Resultat |
| --- | --- |
| Markera/avmarkera, autospara, omladdning med samma år | PASS |
| Ny inloggning och ny browserkontext | PASS |
| Två ägare/år, B nekas A:s data, anon/direkt skrivning nekas | PASS |
| Förlorat sparsvar, tydligt fel och ingen falsk Sparat | PASS |
| Återförsök med samma begäran ger exakt en revision | PASS |
| Snabba upprepade klick ger en begäran | PASS |
| Verklig bokning ändrar bankunderlag, svar kvar, omkontroll | PASS DB + UI |
| Ny obokförd kundfaktura ändrar bara customers/next_year | PASS DB + UI |
| Bank får ingen varning av denna faktura | PASS UI |
| Ändrat företagsnamn: bank oförändrad, för bred påverkan på andra punkter | AVVIKELSE |
| Historiskt låst 2024: manuella svar fortsatt redigerbara | PASS |
| Edge dry-run count 1, icke-admin nekas, faktisk radering | PASS |
| Auth/profil/checklista saknas efter radering | PASS |
| Dator 1440/mobil 390, fyra delar/elva punkter, inget sidöverflöde | PASS |
| Bokföring, Moms, NE och tillbaka till samma års guide | PASS |
| Två faktiska flikar sparar samma revision | AVVIKELSE |
| Tidigare data och befintliga funktioner bevarade | PASS |

Skärmbilder inspekterade; inga pageerror i avslutade browserfall. Egna avstämningar
och systemstatus skiljs åt; momsens egna tidsfrister framgår.

Fyra nya verifierat syntetiska konton skapades med uppdragsmarkör. A/B behålls
för granskning, C är isolerad syntetisk admin, D raderades efter dry-run och
identitetskontroll. Befintliga konton/fixtures bevarades. Inga lösenord finns här/Git.

## Kvarstående samtidighetsavvikelse

Två parallella save_year_end_checklist med samma förväntade revision och olika
begäran-id: en lyckas, den andra får API-klient-timeout efter 30 s. Produktklienten
avbryter efter 25 s och visar att sparandet inte kunde bekräftas. Det avsedda
specialbeskedet om ändring i annat fönster visas inte. Detta verifierades i ett
tillståndsavstämt API-test och sedan två verkliga flikar. Bara en revision tillkom.
Ingen falsk sparad-status/överskrivning observerades; Läs om återställer båda.

Migrationen använder SQLSTATE 40001 för gammal revision/ändrat underlag. Exakt
orsak till hosted timeout är **inte fastställd**. Rekommenderat nästa steg är en
avgränsad lokal rättning av konfliktens väg genom hosted API och riktat omtest.
Ändra inte redan installerad migrationsfil. Eventuell DB-rättning blir ny migration
och ny exakt kandidat för godkännande. Ingen sådan rättning har utförts här.

Testskript korrigerades för årval efter omladdning och öppning efter ny fliks
profilinläsning. Ett direkt faktura-UPDATE nekades korrekt; befintligt flöde använder
RPC. Ett separat fakturanamnbyte via RPC nekades eftersom fakturaunderlag saknades.
Inga rättigheter/produktregler ändrades för testets skull. Irrelevans verifierades
för bank vid obokförd faktura; profilnamnstestets avvikelse beskrivs nedan. Fakturans namnbyte
är inte separat färdigverifierat.

## För bred profilvarning

En faktisk ändring av företagsnamn ändrar kontrollvärden för documents, vat,
statements och tax. Bank och övriga sex punkter påverkas inte. Svaren bevaras.
Företagsuppgiften får påverka dokumentkontrollen, men namnbyte behöver inte i sig
varna om moms- eller skatteunderlag. Kandidaten använder samma profildigest för
dessa fyra punkter. Avgränsa relevanta profilfält i en separat ny migration och
verifiera att verkligt ändrade momsuppgifter fortfarande varnar där de ska.
Ingen sådan produktändring utförd här.

Första profiltestet skrev samma namn och gav otillräckligt bevis. Den gamla
PASS-posten för att profilmetadata inte påverkar något är uttryckligen
ogiltigförklarad av profile-warning-deviation.json. Sluttestet verifierade en
verklig sparad namnändring och ovanstående fyra kontrollvärden. Rapportens tidigare
påstående är korrigerat; detta räknas inte som godkänt irrelevanstest.

## Redan känt äldre SQL-testfel

Lokala test:db-invariants har tidigare dokumenterat
`Unexpected close-year delegate transformation`, även på oförändrad 6ad27f1-bas.
Det maskerades/rättades inte och är separat från hosted samtidighetsavvikelsen.
Tidigare lokal regression/12 rollback-DB-grupper finns i lokalrapporten, inte
nykörda här. Pågående/framtida årslås har inte reproducerats eller rättats.

## Manuell granskning och nästa beslut

Öppna Staging-adressen med ditt Staging-konto. Helt isolerad granskning kan startas
med root-kopians `audit-packages/KAN-112-staging-20261026/open-staging-review.ps1`.
Den öppnar synlig browser med syntetiskt A, Årsavslut 2025, utan att visa lösenord.
Den använder befintlig åtkomst till skyddad Preview utan konfigurationsändring.

1. Öppna Bank och bokföring. Markera/avmarkera och invänta Sparat.
2. Ladda om, välj åter 2025 och öppna Årsavslut. Svaret ska finnas kvar.
3. Prova Kontrollera igen och Jag har kontrollerat igen på bevarade underlagspunkter.
4. Öppna Moms/NE/Bokföring och Tillbaka till årsavslutet 2025.
5. Växla år; samma bekräftelser ska inte följa med. Prova smal skärm.

Gränssnittet kan granskas nu. Slutlig acceptans rekommenderas efter rättning och
omtest. Ingen Production-release eller Jira-statusändring. KAN-112 är inte Done.
Nästa releasebeslut ligger hos Pontus.

## Bevis och dokumentcheckpoint

Root/audit-packages/KAN-112-staging-20261026 innehåller ops.mjs, hosted.mjs,
browser.mjs, final.mjs och JSON-bevis för manifest/preflight, migration/CLI,
rättigheter, katalog/data före/efter, deployment/alias, Edge, backend,
concurrency-diagnostic, browser-results, browser-extra-partial,
browser-extra-results, server-compatibility och final-verification.
Tidiga browser-failure-filer bevaras som avbrottshistorik; avslutade resultat är
separat namngivna. Verktygen läser hemligheter endast från ignorerade lokala filer.

Denna rapport och PROJECT_STATE sparas i separat **lokalt dokumentcheckpoint**.
Ingen senare dokumentcommit pushas. Publicerad produkt förblir exakt 91233be.
Root-kopians tidigare ändringar och övriga grenar bevaras.
