> AKTUELL FAS: den godkända server-/kvittovägen är nu implementerad och lokalt verifierad.
> Se [implementationsrapporten](KAN-74-server-import-implementation.md) för aktuell status och återstående releasehinder.
> Tidigare designbeslut/STOPP och testresultat nedan är historiskt underlag.

# KAN-74 – minimal design för serververifierad SIE-import

2026-10-15. Designförslag, inte implementation eller publiceringsgodkännande.
Nuvarande kandidat förblir BLOCKED tills vald väg implementerats och verifierats.

## Rekommendation och högst två alternativ

| Alternativ | Fördel | Kostnad/risk |
|---|---|---|
| A. Next.js-serverparsning + kortlivat, låst databaskvitto | Samma parser och befintlig användaridentitet i hela bokförings-RPC:n; inga nya signeringshemligheter | En liten tillfällig datadomän med behörigheter, atomär konsumtion, städning och raderingslivscykel |
| B. Samma serverparsning + signerat parserresultat som verifieras i RPC | Ingen tillfällig tabell; auth.uid kan behållas | Ny hemlighet på server och i DB, säker nyckelhantering/rotation, entydig serialisering och korrekt signaturkontroll krävs; återspelning/utgång måste hanteras |

**Rekommendera A.** Vanliga databasbehörigheter och radlås ger en tydlig
tillitsgräns. B är realistiskt men kräver mer ny säkerhetsmekanik.
Den lokala schemaklonen har endast plpgsql installerat; anta inte att DB-stöd
för en viss signaturalgoritm redan finns i hosted miljö.

En enkel övergång till service-role för själva bokföringen är inte vald:
lokalt verifierade get_next_ver_nr och lock_vat_months kräver att ägaren
matchar auth.uid(). Vi ska varken simulera JWT-identitet i SQL eller ändra
dessa gemensamma säkerhetsfunktioner för att lösa SIE-perioden.

## Ett HTTP-anrop, samma underlag hela vägen

Webbläsarens valda originalfil -> POST /api/sie/import -> befintlig avkodare
och parser på servern -> skyddat parserkvitto -> import_sie_batch med
användarens verifierade JWT -> befintlig atomär bokföringslogik.

1. SieImportModal behåller File-objektet fram till import/reset. Lokal preview
   kan använda samma parser, men har ingen auktoritet över bokföringspayloaden.
   Klienten skickar originalbytes som multipart-fil och Authorization Bearer.
   Inga klientberäknade rader, periodfält, hash eller user_id accepteras som facit.
2. Ny Next.js-route med Node-runtime verifierar token med auth.getUser(token),
   som befintlig checkout-route redan gör. Ägare kommer enbart från verifierad
   user.id. Begränsa faktiskt mottagen body, inte bara Content-Length.
   Föreslagen initial gräns: 2 MiB fil, 10 000 VER, 50 000 TRANS; bekräftas med
   lokalt gränstest innan implementationen accepteras. Inga filinnehåll i loggar.
3. Servern kör decodeSieBuffer och parseSieFile på EXAKT dessa bytes och bygger
   hela payloaden med en gemensam ren adapter. Parserresultatet skapas en gång
   och används för både periodbeslut och bokföringsrader. Originalbytes behöver
   inte sparas i Storage eller DB; serverberäknad SHA-256 knyter kvittot till
   mottagen fil men ersätter inte parserkontroll eller dubblettskydd.
4. Efter godkänd parsning registrerar en separat service-role-klient ett
   kortlivat kvitto via en enda begränsad registrerings-RPC. En annan,
   begäransspecifik Supabase-klient med användarens JWT konsumerar kvittot
   genom befintlig import-RPC. Återanvänd inte användarsession i en global
   administrativ klient. Servern returnerar befintligt importresultat/fel.
   Kvittot behöver inte lämnas till webbläsaren.

## Parser och periodpolicy

Återanvänd sieParser.ts, inklusive tokenizer, avkodning och beloppstecken.
Lägg ett strikt importläge/strukturerade fel i SAMMA parser, inte en separat
regex- eller SQL-parser. Nuvarande parser varnar/hoppar över vissa trasiga IB/RAR,
formaterar datum utan kalenderkontroll och ignorerar UB; detta räcker inte på servern.

- #RAR: exakt en giltig index-0-period, verkliga datum, start <= slut och samma
  kalenderår. Saknad, trasig, duplicerad eller motsägelsefull RAR 0 avvisas.
  Exemplet 20240701–20251231 avvisas även om alla VER ligger 2024.
  Jämförelseår RAR -1/-2 är inte ytterligare importer; indexkopplingen bevaras.
- #VER/#TRANS: behåll nuvarande tolkning, men kritisk syntax får aldrig tappas
  som en varning. Alla VER-datum och effektiva raddatum ska ligga inom aktiv
  RAR 0. Tomma/trasiga block, ogiltiga datum, icke-finita belopp eller oklara
  bokföringsrader avvisas. Stödet för okända/ignorerade bokföringstaggar utökas
  inte; strikt läge nekar sådant som annars skulle ge en ofullständig import.
- #IB: endast index 0 blir opening_balances. Jämförelseindex bokförs inte.
  Bevara nuvarande balans-/RES -1-kontroll och eventuell 2019-brygga.
- #UB: lägg till typad läsning av index/konto/belopp i samma parser, med
  syntax-/indexvalidering. UB är kontrollmetadata och skapar INGEN transaktion,
  överföring eller ny IB. Ingen ny UB = IB + rörelser-avstämning i denna åtgärd.
- Befintlig motor daterar IB till 1 januari. Förslag: med IB krävs RAR 0-start
  1 januari; annars avslag i stället för ändrad bokföringsdatering. Utan IB kan
  en kortare period inom ett kalenderår tillåtas om samtliga bokföringsdatum
  ryms. Detta kompatibilitetsbeslut behöver ledarchatten uttryckligen bekräfta.

## Skydda den befintliga RPC-vägen

Ny tabell public.sie_import_inputs, med RLS och inga direkta klientgrants:
id (slumpmässigt UUID), user_id, period_start/end, serverhärledd payload,
raw_sha256, parser_version, created_at och expires_at. Kort TTL, föreslaget
10 minuter. Inga användarändringsbara fält; ingen kvittorad räknas som importerad
historik eller reserverar ett SIE-år. Inga nya källvärden i bokföringen.

- Ny register_sie_import_input får EXECUTE enbart för service_role (inte PUBLIC,
  anon eller authenticated). Den får user_id enbart från serverns verifierade
  identitet, kontrollerar period/format, skapar UUID/utgångstid i DB och skriver
  endast kvittot. Ingen bokföring, sekvens eller import_batch skapas här.
- Behåll import_sie_batch(jsonb) men ändra dess externa kontrakt till ENDAST
  { receipt_id }. Gammal fri payload, saknat kvitto och extra ersättningsfält
  avvisas före bokföringsskrivning; ingen kompatibilitetsfallback. Kontrollera
  även eventuella overloads/alternativa import-entrypoints före migration.
- RPC hämtar och låser kvittot FOR UPDATE, kräver auth.uid() = user_id samt
  giltig TTL/parserversion. Ersätt därefter lokal payload helt med kvittots
  värden; aldrig merge med klientdata. Kontrollera full period samt alla datum
  igen mot det låsta underlaget innan bokföring. Kvittots metadata blir inte
  betrott genom sin form, utan genom att klientroller inte kan skapa/ändra det.
- Kvittolås först, därefter BEFINTLIG ordning moms-månader -> användarens
  importlås -> IB-dagslås -> skyddade historikläsningar/skrivningar. READ COMMITTED
  och ettårsspärren ligger kvar i samma transaktion; inga förhandsbeslut i HTTP
  ersätter samtidighetskontrollen i DB.
- Radera kvittot i slutet av samma lyckade transaktion. Fel rollbackar både
  konsumtion och bokföring. Två anrop på samma kvitto kan inte båda bokföra.
  Vid tappat svar kan filen skickas igen; befintlig filhash stoppar ny bokföring.
- Behåll exakt befintlig KAN-71-, dubblett-, IB-, moms-, balans- och årskontroll.
  Återanvänd nuvarande kanoniska hash för historisk dubblettkompatibilitet;
  byt inte ut den mot råfilshash eller en ny periodinkluderande hash. Servern
  beräknar den själv. Utgångna kvitton städas begränsat vid registrering,
  utan att låsa en pågående konsumtion (SKIP LOCKED), och vid användarradering.

## Exakta komponenter som behöver ändras vid godkänt genomförande

| Komponent | Avgränsad ändring |
|---|---|
| src/app/api/sie/import/route.ts (ny) | Verifierad session, begränsad originalfil, serverparsning, registrera/konsumera kvitto |
| src/lib/sieParser.ts | Strikt importvalidering av period/kritiska poster och typad UB, samma parser |
| src/lib/sieImportPayload.ts (ny) | Flytta befintlig ren payload-/kanonisk-hashlogik ur klientens beroendegraf |
| src/lib/sieImport.ts | Skicka File till route och behåll befintlig felöversättning/resultattyp |
| src/components/SieImportModal.tsx | Behåll vald File; skicka bytes vid bekräftad import |
| KAN-74-migrationsförslaget | Kvittotabell, register-RPC/ACL/RLS, obligatorisk konsumtionsgrind och periodkontroll i befintlig import-RPC |
| delete_user_data_atomic + src/lib/adminDeleteDryRun.ts + supabase/functions/delete-user/index.ts | Radera/räkna kvarvarande kvitton vid datareset/radering; FK till auth.users med ON DELETE CASCADE som extra skydd, inte enda städning |
| Befintliga KAN-74/parser/route-/raderingsregressioner | Flytta P2-test till verklig filväg, bevisa hela behörighets- och atomaritetskedjan |

Ingen ny parserplattform, Storage-bucket, signeringshemlighet eller ändring av
lock_vat_months/get_next_ver_nr/undo_sie_import_atomic behövs. Kvittoradering
ska ske före övrig användardata i raderings-RPC:n och ingå i residualkontroll.
Ingen annan bokföringslogik i den RPC:n ändras. Detta livscykelarbete är
nödvändigt enligt AGENTS.md för en ny användarägd datadomän.

## Viktigaste verifieringen och releasevillkor

1. P2-filen avslås före kvittoregistrering/bokföring; giltig enårsfil ger exakt
   samma journal/source/belopp och dubblettnyckel som tidigare.
2. Saknad/duplicerad RAR 0, ogiltigt datum, kalenderårsgräns, VER/TRANS utanför
   perioden, trasig IB/UB och dolda kritiska poster får inte tyst accepteras.
   UTF-8/CP437/CP850 och RES -1-bryggan verifieras med befintliga fixtures.
3. Direkt gammalt RPC-anrop, falskt/annans/utgånget kvitto, egen payload,
   ändrad period/rad/hash och klientförsök att registrera/uppdatera kvitto nekas.
   Utgången session nekas även mellan registrering och konsumtion.
4. Två olika år samtidigt, samma kvitto samtidigt, samma fil med två kvitton,
   omvänd årsföljd och rollback/omförsök: aldrig dubbel bokföring. Period/historik
   kontrolleras under befintliga DB-lås, inklusive de två extra historikfallen.
5. Samtliga KAN-71-, manuella/faktura-/momsregressioner; ångring, stängda perioder,
   företagsisolering, grants/RLS och rättelser oförändrade. Kvitton städas utan
   kvarvarande persondata vid reset/auth-radering; ingen FK blockerar raderingen.
6. P2:s tidigare identiska klientpayload-test ersätts av test av serverns faktiska
   filväg; enbart ändrade klientfält får aldrig räcka för ett grönt test.

Bedömning: **medelstor implementation med hög säkerhetsgranskningsrisk** vid
fil -> betrott underlag -> RPC. Låg avsedd påverkan på bokföringsmatematiken,
men inte en liten metadatafix. Tillkommande livscykel-/ACL-arbete är den
tydliga kostnaden för att behålla befintliga identitetskontroller oförändrade.
Inga saldo-, NE-, export- eller historikändringar/migrationer/backfill behövs.

Beslut kvar: välj A, godkänn att saknad/tvetydig RAR 0 nu stoppar ALL ny
import (tidigare utan-IB-fallback tas bort), samt bekräfta förslaget för korta
perioder med IB och resurs-/TTL-gränser. Hosted migration måste fortsatt föregås
av färsk pg_get_functiondef/schema/ACL-jämförelse och separat godkännande.
Publiceringsordning ska vara fail closed: migrerad RPC nekar gamla klienter;
ingen period med fri JSON-fallback eller oskyddad registreringsfunktion.

## Underlag och ändringsgräns

Lokal kod, befintliga KAN-74-/P2-bevis, Next.js medföljande route-dokumentation
och skrivskyddad lokal RPC-/trigger-/ACL-inspektion användes. Ingen hosted
inventering, produktimplementation, DB-skrivning, ny testdata, testkörning,
commit, push, deploy eller Jira-ändring. Endast designrapport och projektstatus
uppdateras; alla befintliga produkt-/teständringar och övriga worktrees bevaras.
Lokalt underlag: kan74/design/local-import-metadata.json i befintlig evidenskatalog.
Avvakta ledarchattens beslut innan implementation.
