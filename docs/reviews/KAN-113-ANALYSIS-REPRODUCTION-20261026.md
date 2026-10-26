# KAN-113 – analys och säker reproduktion

2026-10-26. **REPRODUCERAT. Ingen produktimplementation utförd.**

Pågående 2026 och framtida 2027 kan låsas med `close_year_atomic` av en
autentiserad syntetisk användare utan momsregistrering. En `closed_years`-rad
skapas och efterföljande vanlig bokning nekas som låst. Tom bokföring räcker;
felet kräver inga manipulerade momsperioder i detta reproduktionsfall.
Reproduktionen gjordes i Staging, inte i Production eller genom webbläsaren.

## Orientering och källor

- Root staging/3d0a032: befintliga M AGENTS/ARCHIVE/STATE och untracked material
  bevarade. Root är inte produktkälla och dess gamla state ersätter inte L:s.
- L = audit-packages/KAN-100-app-release-20261024. Ren vid start, gren
  codex/KAN-112-year-end-checklist, HEAD f352355. Jämförelse mot produkten
  1e4a32a visar endast fem dokumentationsfiler. Lokal origin är KAN-62-kopian.
- Handoffrapporten läst. Lokal, inte pushad; inte formellt HANDOFF READY.
- Jira KAN-113 återläst: Sololedger/KAN, Bug/Medium/To Do/otilldelad, inga
  kommentarer. Inga Jira-mutationer. KAN-112 oförändrad och inte Done.
- Live Staging: exakt poolerhost/port 5432 och postgres.fzxqiqenqjzhlyxxpvhg,
  TLS require, PG17-klient. 65 migrationsversioner i läsande katalogkvitto.
  Funktionsdefinitioner, ACL, tabeller/kolumner, constraints, index, RLS och
  triggers för closed_years/profiles/vat_periods lästa före testet.
- Production wbaxmuvudpnkvuliicuy: endast katalogläsning via Supabase MCP.
  De tre centrala definitionerna och ACL matchar Staging (nedan). Ingen
  Production-användardata läst och inga Production-skrivningar.

| Funktion | MD5 av pg_get_functiondef utan CR, samma i båda miljöer |
|---|---|
| close_year_atomic | 9a93f74704913fc47ed5fff93223e236 |
| close_year_unchecked_inventory | b9416dc08d6dabfe1a12446260524c6d |
| assert_vat_year_coverage | 4e4cd485f4b36e7ae0eebc4d86d6c9a9 |

## Exakt orsak och skydd

1. `src/app/page.tsx:266`: årsväljaren omfattar valt år ±1, kan navigera framåt.
   `handleLockYear` vid rad 770 visar en generell bekräftelse och anropar tjänsten.
   Ingen datumspärr. `NEBilaga.tsx:149` spärrar vid balansdifferens, negativ bank
   eller extern fakturaspärr; knappen vid rad 548 har ingen datumkontroll.
   Checklistan är inte en serverbehörighet att låsa.
2. `src/lib/accountingService.ts:1826` skickar endast `p_year` direkt via
   Supabase Data API till `close_year_atomic`. Ingen mellanliggande Next-API-route
   för detta flöde och ingen kalenderkontroll i tjänsten.
3. `close_year_atomic`: exklusiv användargräns → momstäckning → inventariegräns
   och avskrivningskontroll → privat `close_year_unchecked_inventory`.
   Ingen av de tre årslåsfunktionerna jämför årsslutet med dagens datum/tid.
4. `assert_vat_year_coverage` kräver identitet, år 1900–9999 och säker momsprofil.
   `not_registered` returnerar direkt. Registrerade behöver rätt sammanhängande,
   icke överlappande SoloLedger-perioder, stängda/deklarerade, och inga olösta
   första delperioder eller bokförd moms före momshanteringsstart.
5. Kärnan kontrollerar redan låst år, öppna momsperioder, osäkra/ohanterade
   obetalda kundfakturor, inventarieavskrivning, negativ bank och NE-balans.
   Årsslut är uttryckligen `make_date(p_year,12,31)`. Därefter INSERT closed_years.
6. closed_years har PK, FK till auth.users med cascade och UNIQUE(user_id,year).
   Ingen kalenderconstraint eller trigger. RLS tillåter endast egen SELECT;
   authenticated/anon saknar direkt skrivbehörighet. Public API-funktionen är
   SECURITY DEFINER med EXECUTE för authenticated/service_role, inte anon.
   Privata hjälpfunktioner har bara postgres-EXECUTE. Detta är en saknad
   verksamhetsregel i legitim RPC, inte en reproducerad isoleringslucka.
7. `close_vat_period_atomic` har däremot `period_end > current_date` →
   "Framtida momsperioder kan inte stängas." Det ger ett indirekt stopp för
   normalt genererade helårsmomsperioder 2026/2027, men inget generellt årsstopp.
   Den använder DB-sessionens datum, inte en uttrycklig Stockholm-gräns.
8. `lock_accounting_year_boundary` kräver read committed, serialiserar per ägare
   och nekar delad→exklusiv låsuppgradering i samma transaktion. Detta fungerade
   under försöken och får inte kringgås eller försvagas av en rättning.

## Reproduktion och avgränsningar

Datum: Stockholm 2026-10-26, DB-tid i result.json. `scripts/reproduce-kan113.mjs`
använder fast Staging-anslutning, processlokal PGPASSFILE utan att läsa innehåll,
nya slumpade UUID och example.invalid. RPC körs som authenticated med respektive
syntetiskt auth.uid(), inte som privilegierad funktionsanropare.

| Fall | Faktiskt resultat |
|---|---|
| Ej momsregistrerad, tomt avslutat år 2025 | Tillåtet, en låsrad |
| Ej momsregistrerad, tomt pågående år 2026 | **Tillåtet, en låsrad – defekt** |
| Ej momsregistrerad, tomt framtida år 2027 | **Tillåtet, en låsrad – defekt** |
| Momsregistrerad 2025/2026/2027, saknad årsperiod | Nekat: perioden saknas |
| Momsregistrerad 2025/2026/2027, öppen årsperiod | Nekat: perioden öppen |
| Vanligt momsavslut 2025 | Tillåtet, nollavslut utan journalpost |
| Vanligt momsavslut 2026/2027 | Nekat: framtida momsperiod |
| Momsregistrerad, syntetiskt redan stängd årsperiod 2025/2026/2027 | Alla tillåtna |
| Upprepat årslås, samtliga sex fall | Nekat: redan låst |
| Ny bokning i låst år, samtliga sex fall | Nekat: låst år, confirmed_rejection |

**Viktig begränsning:** stängd momsstatus för 2026/2027 seedades privilegierat
som en uttryckligen konstgjord fixture. Det bevisar saknat oberoende serverstopp,
inte att den statusen kan nås genom normalt momsavslut idag. Den självständiga
verkliga reproduktionen är de ej momsregistrerade företagen.

Vanlig bokning provades med 100 kr före lås i separata SAVEPOINT-delprov och
återställdes innan låsanropet, så slutliga låsfall är **tomma år**, inte en
verifierad bokslutsberäkning med kvarvarande journal. Detta undviker att blanda
bokning och årslås i samma transaktion, vilket det befintliga skyddet avsiktligt
nekar. Ingen ny RLS-/samtidighets-/inventarie-/faktura-E2E görs eller påstås här.

42 riktade assertions PASS. Samma backend-PID före/efter; SAVEPOINT återställd,
sedan full ROLLBACK. Före/efter-digester för samtliga 33 publika tabeller identiska,
auth-antal identiskt, 0 kvarvarande auth/profiles från slutkörningen.

### Testverktygets två första försök

Försök 1 hade felaktig escaping av psql-metakommandon. BEGIN konsumerades av
ett syntaxfel och felstopp aktiverades inte. Sex nya syntetiska auth-konton,
autogenererade profiler, kategorier och betalroller hann sparas. Ingen lyckad
årslås-/boknings-RPC utfördes. Deras exakta ID:n lästes ur det sparade testunderlaget;
avstämning visade endast de förväntade kategorierna/rollerna, ingen bokföring eller
annan user_id-ägd data. Endast dessa sex konton raderades under stående syntetisk
Staging-behörighet. Auth/profiles/accounts-residual = 0, se cleanup-attempt1.log.
Ingen bred radering/reset/migration gjordes. Ingen före-digest finns för försök 1;
slutkörningens 33-tabellsbevis gäller inte retroaktivt för det försöket.

Försök 2 återställdes korrekt men bokning följt av årslås i samma transaktion
nekades av befintlig låsuppgraderingsspärr (25001). Verktyget anpassades med
SAVEPOINT-delprov, utan ändring av databasskyddet. Psql-felstopp sätts nu direkt
med `-v ON_ERROR_STOP=1` före SQL. Alla råa försöksloggar finns kvar lokalt.

## Räkenskapsår är inte alltid ett kalenderår

Profilen/årslåset saknar ett eget auktoritativt start-/slutdatum per räkenskapsår;
rapporter och lås använder kalenderintervall och heltalsår. SIE-servern tar emot
period.start/end från strict parser, men detta ändrar inte årslåsets slutdatum.

Fem rena parserprov: kalenderår PASS; 2025-07-01–2026-06-30 (brutet) och
2025-07-01–2026-12-31 (förlängt första år) nekas som flerårig import;
2025-07-01–2025-12-31 och 2025-01-01–2025-06-30 accepteras utan IB.
Kort period i import är alltså inte bevis för att årslåset använder dess slutdatum.
Inget brutet år har skrivtestats som om det vore en stödd räkenskapsårsmodell.
Det befintliga SIE route/parser/client-testet kördes också: PASS.

Enskild firma ska enligt huvudregeln ha kalenderår, men första året kan förlängas
till högst 18 månader; specialfall får inte gissas bort. Källor kontrollerade:
[Skatteverket – deklarera enskild näringsverksamhet](https://www.skatteverket.se/foretag/inkomstdeklaration/deklareraenskildnaringsverksamhet),
[BFL 3 kap., inklusive undantag i 2 §](https://www4.skatteverket.se/rattsligvagledning/edition/2026.3/27111.html).
Ingen ny skatteregel eller generell periodmodell implementeras i KAN-113-analysen.

## Production-risk och rekommendation

**Hög konsekvens, begränsad men verklig åtkomlighet:** en bekräftad användaråtgärd
kan permanent blockera fortsatt bokföring i innevarande/framtida år. Kräver ingen
angripare och ingen dataradering. Bekräftelserutan minskar risken men förhindrar
inte felet. Normal registrerad moms ger indirekt skydd, ej momsregistrerad gör det
inte. Samma centrala funktionsdefinitioner finns redan i Production; felet är inte
infört av KAN-112. Inga verkliga felaktiga årslås/användarskador har efterforskats.

Rekommendation: **rätta KAN-113 före nästa Production-release av KAN-112** på
grund av konsekvensen. Det är ett separat ledarbeslut, inte ett underkännande av
KAN-112:s accepterade layout/checklista. Ändra inte KAN-112 eller Jira Done här.

## Minsta säkra rättning och testplan – endast förslag

- Ny liten migration som inför datumstopp i den publika atomiska årslåsgränsen,
  med samma signatur, ACL och befintlig låsordning. Kontrollera giltig identitet/
  årtal, och neka till och med 31 december i Europe/Stockholm. Tillåt tidigast
  1 januari året efter. Använd serverns tid med uttrycklig Stockholm-tidszon,
  aldrig klientklocka, och behåll alla befintliga spärrar. Ingen ny tabell behövs.
- Liten klientspärr och begripligt besked om när vald årsperiod kan låsas; samma
  regel även i handleLockYear. Tjänstens/RPC:ns skydd får inte bero på knappen.
- Regeln gäller dagens kalenderbaserade årslås. Hävda inte att den löser
  förlängt/brutet/förkortat räkenskapsår; om separat period måste avgöras och inte
  är säkert representerad ska SoloLedger stoppa och förklara. Ingen automatisk
  tolkning av #RAR till nya årsgränser eller bred periodmodell i denna rättning.
- Ingen datamigration, automatisk upplåsning eller ändring av äldre lås.

Efter godkänt implementationsscope: automatiska negativa RPC-fall för aktuellt/
framtida år utan moms samt med kontrollerad färdig momsstatus; positivt avslutat
år med representativ bokföring och stängd moms. Testa tomma år också.
Gränser 31/12 23:59:59 och 1/1 00:00:00 Stockholm, inklusive UTC-skillnaden,
utan att exponera en klockparameter som kan kringgås i Production.
Behåll invalid/null-år, oinloggad/anon, annan ägare, redan låst, saknad/öppen/
överlappande moms, osäker profil, inventarier, kundfordran och balansspärrar.
Verifiera årslås mot samtidig bokning samt rollback och spärrad efterbokning.
Anpassa äldre framtidsårsfixturer till verkligt avslutade år; försvaga inte tester.

Inför Staging och Production: följ en representativ avslutad transaktion genom
journal, moms, NE/balans, dashboard, faktura/betalstatus och relevant rättelse/
årslås. Direkt RPC och UI ska neka för tidig låsning utan några dataskrivningar.
Kontrollera samtidighet och att befintliga låsta år förblir oförändrade.
Publicering/migration kräver separata exakta godkännanden.

## Leveransstatus

Endast analys, reproduktionsverktyg och dokumentation. Ingen produktkod ändrad,
ingen ny migration, push, deployment, Edge-publicering eller Jira-mutation.
Full regression/typecheck/build/UI-E2E ej körda: ingen rättning implementerad.
Nästa steg: Pontus beslutar om det avgränsade rättningsförslaget före implementation.
Bevis: docs/testing/kan113-analysis-20261026/{result.json,staging-catalog.jsonl,
fiscal-period-parser.json,reproduction.sql,reproduction.log,attempt1*,attempt2.log,
cleanup-attempt1.*}. Inga credentials i rapport eller bevis.
